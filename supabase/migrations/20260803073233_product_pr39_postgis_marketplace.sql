-- Staging ledger version: 20260803073233.
-- Introduced after Product PR36 so numeric release merges remain forward-only.
begin;

-- Product PR39: Mapbox renders; Supabase/PostGIS owns eligibility, distance,
-- privacy, and ordering. The existing locations table is the canonical shop
-- location table, so this migration extends it instead of creating a second
-- competing location authority.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- `CREATE EXTENSION IF NOT EXISTS ... SCHEMA` does not move an extension that
-- was installed previously in another schema. Fail before any table mutation
-- instead of leaving this migration half-dependent on missing
-- `extensions.st_*` functions.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension extension
    join pg_catalog.pg_namespace namespace
      on namespace.oid = extension.extnamespace
    where extension.extname = 'postgis'
      and namespace.nspname = 'extensions'
  ) then
    raise exception using
      errcode = '55000',
      message = 'PR39 requires PostGIS to be installed in the extensions schema.';
  end if;
end;
$$;

alter table public.locations
  add column if not exists geo_point extensions.geography(point, 4326),
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocoding_provider text,
  add column if not exists geocoding_provider_reference text,
  add column if not exists geocoding_precision text,
  add column if not exists location_visibility text not null default 'hidden',
  add column if not exists location_verified boolean not null default false,
  add column if not exists location_active boolean not null default true,
  add column if not exists geocoded_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.locations
  drop constraint if exists locations_location_visibility_ck;
alter table public.locations
  drop constraint if exists locations_hidden_coordinate_ck;
alter table public.locations
  drop constraint if exists locations_coordinate_pair_ck;
alter table public.locations
  drop constraint if exists locations_geo_point_consistency_ck;
alter table public.locations
  add constraint locations_location_visibility_ck
    check (location_visibility in ('exact', 'approximate', 'hidden')),
  add constraint locations_hidden_coordinate_ck
    check (
      location_visibility <> 'hidden'
      or (geo_point is null and latitude is null and longitude is null)
    ),
  add constraint locations_coordinate_pair_ck
    check ((latitude is null) = (longitude is null)),
  add constraint locations_geo_point_consistency_ck
    check ((geo_point is null) = (latitude is null and longitude is null)),
  add constraint locations_geocoding_provider_ck
    check (geocoding_provider is null or geocoding_provider in ('mapbox', 'manual'));

comment on column public.locations.geo_point is
  'PR39 PostGIS authority. Exact points are allowed only for approved commercial locations; approximate points must already be privacy-coarsened before storage.';
comment on column public.locations.location_visibility is
  'Public privacy tier. Hidden rows may not retain a coordinate in this public table.';
comment on column public.locations.geocoding_provider_reference is
  'Permanent geocoder reference captured only after an owner confirms a save; temporary search suggestions are never stored.';

-- Existing commercial locations with coordinates are migrated conservatively:
-- the point is indexed, but remains hidden and therefore is not public until an
-- owner/verification workflow explicitly confirms it. Hidden rows cannot keep a
-- public coordinate, so no legacy coordinate is silently exposed.
update public.locations
set geo_point = null,
    latitude = null,
    longitude = null,
    location_visibility = 'hidden',
    location_verified = false
where location_visibility = 'hidden';

create index if not exists locations_geo_point_gix
  on public.locations using gist (geo_point)
  where geo_point is not null and location_active = true;

create index if not exists locations_public_geo_lookup_idx
  on public.locations (location_verified, location_active, location_visibility)
  where geo_point is not null;

create or replace function public.pr39_save_verified_shop_location(
  p_location_id uuid,
  p_owner_profile_id uuid,
  p_formatted_address text,
  p_address_line_2 text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_longitude double precision,
  p_latitude double precision,
  p_provider_reference text,
  p_precision text,
  p_visibility text default 'exact'
)
returns table (
  location_id uuid,
  location_visibility text,
  location_verified boolean,
  geocoded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_at timestamptz := now();
  owns_location boolean;
  saved_longitude double precision;
  saved_latitude double precision;
begin
  -- This function is service-role-only. The application authenticates the
  -- owner before performing permanent geocoding, while the database repeats
  -- the durable ownership and approval check below. Never accept a caller-
  -- asserted "provider reference" from a browser RPC.
  if p_owner_profile_id is null then
    raise exception using errcode = '42501', message = 'A verified owner identity is required.';
  end if;
  if p_visibility not in ('exact', 'approximate') then
    raise exception using errcode = '22023', message = 'A public shop pin must be exact or approximate.';
  end if;
  if p_latitude is null
     or p_longitude is null
     or p_latitude < -90
     or p_latitude > 90
     or p_longitude < -180
     or p_longitude > 180 then
    raise exception using errcode = '22023', message = 'Invalid map coordinate.';
  end if;
  if nullif(trim(p_formatted_address), '') is null
     or nullif(trim(p_city), '') is null
     or nullif(trim(p_region), '') is null
     or nullif(trim(p_postal_code), '') is null then
    raise exception using errcode = '22023', message = 'A complete normalized address is required.';
  end if;
  if nullif(trim(p_provider_reference), '') is null then
    raise exception using errcode = '22023', message = 'Permanent geocoding proof is required.';
  end if;

  -- Approximate public pins must never retain the exact geocoder point in the
  -- public location authority. Three decimal places is roughly a city-block
  -- scale while exact commercial pins retain the provider result unchanged.
  saved_longitude := case
    when p_visibility = 'approximate' then round(p_longitude::numeric, 3)::double precision
    else p_longitude
  end;
  saved_latitude := case
    when p_visibility = 'approximate' then round(p_latitude::numeric, 3)::double precision
    else p_latitude
  end;

  select exists (
    select 1
    from public.locations location
    join public.shops shop on shop.id = location.reference_code
    where location.id = p_location_id
      and shop.owner_profile_id = p_owner_profile_id
      and shop.app_approval_status::text = 'approved'
  ) into owns_location;

  if not owns_location then
    raise exception using errcode = '42501', message = 'Only the approved shop owner can publish this location.';
  end if;

  update public.locations
  set address = nullif(trim(p_formatted_address), ''),
      address_line_2 = nullif(trim(p_address_line_2), ''),
      city = trim(p_city),
      state = trim(p_region),
      postal_code = nullif(trim(p_postal_code), ''),
      longitude = saved_longitude,
      latitude = saved_latitude,
      geo_point = extensions.st_setsrid(
        extensions.st_makepoint(saved_longitude, saved_latitude),
        4326
      )::extensions.geography,
      geocoding_provider = 'mapbox',
      geocoding_provider_reference = trim(p_provider_reference),
      geocoding_precision = nullif(trim(p_precision), ''),
      location_visibility = p_visibility,
      location_verified = true,
      location_active = true,
      geocoded_at = saved_at,
      updated_at = saved_at
  where id = p_location_id;

  return query
  select location.id, location.location_visibility, location.location_verified, location.geocoded_at
  from public.locations location
  where location.id = p_location_id;
end;
$$;

revoke all on function public.pr39_save_verified_shop_location(
  uuid, uuid, text, text, text, text, text, double precision,
  double precision, text, text, text
) from public, anon, authenticated;
grant execute on function public.pr39_save_verified_shop_location(
  uuid, uuid, text, text, text, text, text, double precision,
  double precision, text, text, text
) to service_role;

-- RLS controls which rows an owner may edit, but it cannot protect a subset of
-- columns when the legacy owner-bootstrap policy grants UPDATE on a location.
-- Reject any browser/session attempt to forge verified coordinates, provider
-- proof, visibility, or marketplace activation. The trusted save RPC executes
-- as its database owner and the server-side admin client carries service_role.
create or replace function public.pr39_guard_location_geo_authority()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_role text := coalesce(auth.role()::text, '');
  trusted_writer boolean := request_role = 'service_role'
    or current_user in ('postgres', 'service_role', 'supabase_admin');
begin
  if trusted_writer then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.geo_point is not null
       or new.latitude is not null
       or new.longitude is not null
       or new.geocoding_provider is not null
       or new.geocoding_provider_reference is not null
       or new.geocoding_precision is not null
       or new.location_visibility <> 'hidden'
       or new.location_verified
       or new.geocoded_at is not null then
      raise exception using
        errcode = '42501',
        message = 'Verified shop coordinates must be written by the trusted geocoding service.';
    end if;
    return new;
  end if;

  if new.geo_point is distinct from old.geo_point
     or new.latitude is distinct from old.latitude
     or new.longitude is distinct from old.longitude
     or new.geocoding_provider is distinct from old.geocoding_provider
     or new.geocoding_provider_reference is distinct from old.geocoding_provider_reference
     or new.geocoding_precision is distinct from old.geocoding_precision
     or new.location_visibility is distinct from old.location_visibility
     or new.location_verified is distinct from old.location_verified
     or new.location_active is distinct from old.location_active
     or new.geocoded_at is distinct from old.geocoded_at
     or (
       old.location_verified
       and (
         new.address is distinct from old.address
         or new.address_line_2 is distinct from old.address_line_2
         or new.city is distinct from old.city
         or new.state is distinct from old.state
         or new.postal_code is distinct from old.postal_code
       )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Verified shop coordinates must be written by the trusted geocoding service.';
  end if;

  return new;
end;
$$;

revoke all on function public.pr39_guard_location_geo_authority() from public, anon, authenticated;

drop trigger if exists pr39_guard_location_geo_authority on public.locations;
create trigger pr39_guard_location_geo_authority
before insert or update on public.locations
for each row execute function public.pr39_guard_location_geo_authority();

comment on function public.pr39_guard_location_geo_authority() is
  'Prevents direct authenticated updates from forging or desynchronizing PR39 verified geo authority columns.';

-- Public discovery receives only safe map coordinates. A barber inherits the
-- verified shop point; home/private coordinates are never part of this query.
-- BVRB3R-owned readiness and ranking decide the result order before Mapbox sees
-- any pins.
create or replace function public.pr39_nearby_marketplace(
  p_longitude double precision,
  p_latitude double precision,
  p_radius_miles double precision default 25,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null,
  p_limit integer default 80
)
returns table (
  listing_type text,
  listing_reference text,
  location_id uuid,
  display_name text,
  public_username text,
  formatted_address text,
  city text,
  region text,
  latitude double precision,
  longitude double precision,
  distance_miles numeric,
  available_now boolean,
  sponsored boolean,
  bvrb3r_rank numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select
      case
        when p_longitude between -180 and 180
          and p_latitude between -90 and 90
        then extensions.st_setsrid(
          extensions.st_makepoint(p_longitude, p_latitude),
          4326
        )::extensions.geography
        else null
      end as origin,
      least(greatest(coalesce(p_radius_miles, 25), 0.25), 50) * 1609.344 as radius_meters,
      least(greatest(coalesce(p_limit, 80), 1), 100) as row_limit,
      (
        p_longitude between -180 and 180
        and p_latitude between -90 and 90
        and coalesce(p_radius_miles, 25) between 0.25 and 50
        and coalesce(p_limit, 80) between 1 and 100
        and (
          (p_west is null and p_south is null and p_east is null and p_north is null)
          or (
            p_west between -180 and 180
            and p_east between -180 and 180
            and p_south between -90 and 90
            and p_north between -90 and 90
            and p_west < p_east
            and p_south < p_north
          )
        )
      ) as input_valid
  ),
  eligible_locations as (
    select
      location.*,
      shop.name as shop_name,
      shop.public_username as shop_username,
      extensions.st_distance(location.geo_point, input.origin) / 1609.344 as miles
    from public.locations location
    join public.shops shop on shop.id = location.reference_code
    cross join input
    where input.input_valid
      and location.location_active = true
      and location.location_verified = true
      and location.location_visibility in ('exact', 'approximate')
      and location.geo_point is not null
      and shop.app_approval_status::text = 'approved'
      and extensions.st_dwithin(location.geo_point, input.origin, input.radius_meters)
      and (
        p_west is null or p_south is null or p_east is null or p_north is null
        or (
          extensions.st_x(location.geo_point::extensions.geometry) between p_west and p_east
          and extensions.st_y(location.geo_point::extensions.geometry) between p_south and p_north
        )
      )
  ),
  barber_rows as (
    select
      'barber'::text as listing_type,
      profile.barber_reference as listing_reference,
      location.id as location_id,
      profile.display_name,
      profile.username as public_username,
      case when location.location_visibility = 'exact' then location.address else null end as formatted_address,
      location.city,
      location.state as region,
      extensions.st_y(location.geo_point::extensions.geometry) as latitude,
      extensions.st_x(location.geo_point::extensions.geometry) as longitude,
      round(location.miles::numeric, 2) as distance_miles,
      coalesce(status.status = 'available' and status.accepting_bookings, false) as available_now,
      featured.id is not null as sponsored,
      round((
        coalesce(ranking.ranking_score, 0)
        + case when status.status = 'available' and status.accepting_bookings then 18 else 0 end
        + case when featured.id is not null then 8 else 0 end
        - least(location.miles, 50) * 1.5
      )::numeric, 2) as bvrb3r_rank
    from eligible_locations location
    join public.barber_profiles profile on profile.shop_reference = location.reference_code
    join public.barbers barber on barber.reference_code = profile.barber_reference
    join public.barber_setup_activations activation
      on activation.barber_id = barber.id and activation.status = 'live'
    left join public.barber_status status on status.barber_reference = profile.barber_reference
    left join public.barber_rankings ranking on ranking.barber_reference = profile.barber_reference
    left join lateral (
      select placement.id
      from public.featured_profiles placement
      where placement.barber_reference = profile.barber_reference
        and (placement.starts_at is null or placement.starts_at <= now())
        and (placement.ends_at is null or placement.ends_at > now())
      order by placement.starts_at desc nulls last
      limit 1
    ) featured on true
    where profile.visibility_state::text in ('public', 'featured')
      and barber.app_approval_status::text = 'approved'
  ),
  shop_rows as (
    select
      'shop'::text,
      location.reference_code,
      location.id,
      location.shop_name,
      location.shop_username,
      case when location.location_visibility = 'exact' then location.address else null end,
      location.city,
      location.state,
      extensions.st_y(location.geo_point::extensions.geometry),
      extensions.st_x(location.geo_point::extensions.geometry),
      round(location.miles::numeric, 2),
      exists (
        select 1 from public.barber_status status
        join public.barber_profiles profile on profile.barber_reference = status.barber_reference
        where profile.shop_reference = location.reference_code
          and status.status = 'available'
          and status.accepting_bookings = true
      ),
      false,
      round((25 - least(location.miles, 50))::numeric, 2)
    from eligible_locations location
  ),
  combined as (
    select * from barber_rows
    union all
    select * from shop_rows
  )
  select combined.*
  from combined, input
  order by
    combined.available_now desc,
    combined.bvrb3r_rank desc,
    combined.distance_miles asc,
    combined.listing_reference asc
  limit (select row_limit from input);
$$;

revoke all on function public.pr39_nearby_marketplace(
  double precision, double precision, double precision, double precision,
  double precision, double precision, double precision, integer
) from public;
grant execute on function public.pr39_nearby_marketplace(
  double precision, double precision, double precision, double precision,
  double precision, double precision, double precision, integer
) to anon, authenticated, service_role;

comment on function public.pr39_nearby_marketplace(
  double precision, double precision, double precision, double precision,
  double precision, double precision, double precision, integer
) is 'PR39 public-safe PostGIS discovery. Supabase filters and ranks; Mapbox only renders the returned pins.';

notify pgrst, 'reload schema';
commit;
