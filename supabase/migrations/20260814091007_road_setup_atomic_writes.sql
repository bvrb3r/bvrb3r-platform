begin;

create or replace function public.pr40_update_owner_hours(
  p_actor_profile_id uuid,
  p_shop_id text,
  p_location_id uuid,
  p_hours jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_shop_count integer := 0;
  updated_location_count integer := 0;
begin
  if not private.pr19_actor_is_trusted_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_actor_profile_id is null
     or nullif(pg_catalog.btrim(p_shop_id), '') is null
     or p_location_id is null then
    raise exception 'canonical owner, shop, and location are required' using errcode = '22023';
  end if;

  if not private.pr32_valid_owner_hours(p_hours) then
    raise exception 'owner hours must use the canonical weekly schedule contract' using errcode = '22023';
  end if;

  perform 1
  from public.shops shop
  where shop.id = p_shop_id
    and shop.owner_profile_id = p_actor_profile_id
  for update;

  if not found then
    raise exception 'owned shop not found' using errcode = '42501';
  end if;

  perform 1
  from public.locations location
  where location.id = p_location_id
    and (
      location.reference_code = p_shop_id
      or location.id::text = p_shop_id
    )
  for update;

  if not found then
    raise exception 'canonical owned shop location not found' using errcode = '42501';
  end if;

  update public.shops
  set public_hours = p_hours,
      updated_at = pg_catalog.now()
  where id = p_shop_id
    and owner_profile_id = p_actor_profile_id;
  get diagnostics updated_shop_count = row_count;

  update public.locations
  set hours = p_hours,
      updated_at = pg_catalog.now()
  where id = p_location_id
    and (
      reference_code = p_shop_id
      or id::text = p_shop_id
    );
  get diagnostics updated_location_count = row_count;

  if updated_shop_count <> 1 or updated_location_count <> 1 then
    raise exception 'owner hours mirror write was incomplete' using errcode = '40001';
  end if;

  return pg_catalog.jsonb_build_object(
    'shopId', p_shop_id,
    'locationId', p_location_id,
    'updated', true
  );
end;
$$;

alter function public.pr40_update_owner_hours(uuid,text,uuid,jsonb) owner to postgres;
revoke all on function public.pr40_update_owner_hours(uuid,text,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.pr40_update_owner_hours(uuid,text,uuid,jsonb)
  to service_role;

comment on function public.pr40_update_owner_hours(uuid,text,uuid,jsonb) is
  'Service-only atomic writer for canonical Owner Road shop/location hours truth.';

create or replace function public.pr40_replace_barber_availability(
  p_actor_profile_id uuid,
  p_barber_id uuid,
  p_location_id uuid,
  p_location_mode text,
  p_working_hours jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  barber_row public.barbers%rowtype;
  location_row public.locations%rowtype;
  membership_id uuid;
  schedule_count integer := 0;
  inserted_count integer := 0;
  now_at timestamptz := pg_catalog.now();
begin
  if not private.pr19_actor_is_trusted_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_actor_profile_id is null or p_barber_id is null or p_location_id is null then
    raise exception 'canonical barber and location are required' using errcode = '22023';
  end if;

  if p_location_mode not in ('freelance', 'shop') then
    raise exception 'location mode must be freelance or shop' using errcode = '22023';
  end if;

  if p_working_hours is null
     or pg_catalog.jsonb_typeof(p_working_hours) <> 'array'
     or pg_catalog.jsonb_array_length(p_working_hours) < 1
     or pg_catalog.jsonb_array_length(p_working_hours) > 7 then
    raise exception 'working hours must contain one to seven weekdays' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_working_hours) item
    where pg_catalog.jsonb_typeof(item) <> 'object'
       or not (item ?& array['weekday', 'startTime', 'endTime'])
       or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(item)) <> 3
       or coalesce(item ->> 'weekday', '') !~ '^[0-6]$'
       or coalesce(item ->> 'startTime', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(item ->> 'endTime', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then
    raise exception 'working hours contain an invalid row' using errcode = '22023';
  end if;

  select pg_catalog.count(*), pg_catalog.count(distinct item ->> 'weekday')
  into schedule_count, inserted_count
  from pg_catalog.jsonb_array_elements(p_working_hours) item;

  if schedule_count <> inserted_count then
    raise exception 'each weekday can appear only once' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_working_hours) item
    where (item ->> 'endTime')::time <= (item ->> 'startTime')::time
  ) then
    raise exception 'closing time must be later than opening time' using errcode = '22023';
  end if;

  select barber.*
  into barber_row
  from public.barbers barber
  where barber.id = p_barber_id
    and barber.profile_id = p_actor_profile_id
  for update;

  if barber_row.id is null then
    raise exception 'owned barber not found' using errcode = '42501';
  end if;

  select location.*
  into location_row
  from public.locations location
  where location.id = p_location_id
  for update;

  if location_row.id is null then
    raise exception 'location not found' using errcode = '22023';
  end if;

  if p_location_mode = 'freelance' then
    if location_row.reference_code not in (
      'independent-' || barber_row.id::text,
      'independent-' || p_actor_profile_id::text,
      'independent-' || coalesce(barber_row.reference_code, ''),
      'independent-' || coalesce(barber_row.booking_slug, '')
    ) then
      raise exception 'freelance location does not belong to this barber' using errcode = '42501';
    end if;

    update public.locations
    set location_active = true,
        updated_at = now_at
    where id = p_location_id;

    insert into public.staff_locations (
      profile_id,
      location_id,
      shop_id,
      routing_model,
      relationship_status,
      requested_by_profile_id,
      invited_by_profile_id,
      approved_by_owner_at,
      approved_by_barber_at,
      rejected_at,
      declined_at,
      paused_at,
      paused_by_profile_id,
      pause_reason,
      ended_at,
      ended_by_profile_id,
      ended_by_role,
      ended_reason,
      autobooth_percent,
      booth_rent_amount,
      booth_rent_frequency,
      updated_at,
      fintech_updated_at
    ) values (
      p_actor_profile_id,
      p_location_id,
      null,
      'freelance',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      barber_row.autobooth_percent,
      barber_row.booth_rent_amount,
      barber_row.booth_rent_frequency,
      now_at,
      now_at
    )
    on conflict (profile_id, location_id) do update
    set shop_id = null,
        routing_model = 'freelance',
        relationship_status = null,
        requested_by_profile_id = null,
        invited_by_profile_id = null,
        approved_by_owner_at = null,
        approved_by_barber_at = null,
        rejected_at = null,
        declined_at = null,
        paused_at = null,
        paused_by_profile_id = null,
        pause_reason = null,
        ended_at = null,
        ended_by_profile_id = null,
        ended_by_role = null,
        ended_reason = null,
        autobooth_percent = excluded.autobooth_percent,
        booth_rent_amount = excluded.booth_rent_amount,
        booth_rent_frequency = excluded.booth_rent_frequency,
        updated_at = excluded.updated_at,
        fintech_updated_at = excluded.fintech_updated_at
    returning id into membership_id;

    update public.shop_barber_relationships
    set staff_location_id = null,
        updated_at = now_at
    where staff_location_id = membership_id
      and (ended_at is not null or status in ('declined', 'ended'));
  else
    select membership.id
    into membership_id
    from public.staff_locations membership
    where membership.profile_id = p_actor_profile_id
      and membership.location_id = p_location_id
      and membership.relationship_status = 'active'
      and membership.ended_at is null
      and membership.approved_by_owner_at is not null
      and membership.approved_by_barber_at is not null
      and exists (
        select 1
        from public.shop_barber_relationships relationship
        where relationship.staff_location_id = membership.id
          and relationship.barber_id = p_barber_id
          and relationship.location_id = p_location_id
          and relationship.shop_id = membership.shop_id
          and relationship.status = 'active'
          and relationship.ended_at is null
          and relationship.approved_by_owner_at is not null
          and relationship.approved_by_barber_at is not null
      )
    for update;

    if membership_id is null then
      raise exception 'an active mutually approved shop membership is required' using errcode = '42501';
    end if;

    if not location_row.location_active then
      raise exception 'the approved shop location is not active' using errcode = '22023';
    end if;
  end if;

  delete from public.availability_rules
  where barber_id = p_barber_id
    and location_id = p_location_id;

  insert into public.availability_rules (
    barber_id,
    location_id,
    weekday,
    start_time,
    end_time
  )
  select
    p_barber_id,
    p_location_id,
    (item ->> 'weekday')::integer,
    (item ->> 'startTime')::time,
    (item ->> 'endTime')::time
  from pg_catalog.jsonb_array_elements(p_working_hours) item;
  get diagnostics inserted_count = row_count;

  if inserted_count <> schedule_count then
    raise exception 'availability replacement was incomplete' using errcode = '40001';
  end if;

  return pg_catalog.jsonb_build_object(
    'barberId', p_barber_id,
    'locationId', p_location_id,
    'locationMode', p_location_mode,
    'rulesWritten', inserted_count
  );
end;
$$;

alter function public.pr40_replace_barber_availability(uuid,uuid,uuid,text,jsonb) owner to postgres;
revoke all on function public.pr40_replace_barber_availability(uuid,uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.pr40_replace_barber_availability(uuid,uuid,uuid,text,jsonb)
  to service_role;

comment on function public.pr40_replace_barber_availability(uuid,uuid,uuid,text,jsonb) is
  'Service-only atomic writer for canonical Barber Road membership and availability truth.';

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
  saved_at timestamptz := pg_catalog.now();
  owns_location boolean;
  owned_shop_id text;
  saved_longitude double precision;
  saved_latitude double precision;
begin
  if not private.pr19_actor_is_trusted_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;
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
  if nullif(pg_catalog.btrim(p_formatted_address), '') is null
     or nullif(pg_catalog.btrim(p_city), '') is null
     or nullif(pg_catalog.btrim(p_region), '') is null
     or nullif(pg_catalog.btrim(p_postal_code), '') is null then
    raise exception using errcode = '22023', message = 'A complete normalized address is required.';
  end if;
  if nullif(pg_catalog.btrim(p_provider_reference), '') is null then
    raise exception using errcode = '22023', message = 'Permanent geocoding proof is required.';
  end if;

  saved_longitude := case
    when p_visibility = 'approximate' then pg_catalog.round(p_longitude::numeric, 3)::double precision
    else p_longitude
  end;
  saved_latitude := case
    when p_visibility = 'approximate' then pg_catalog.round(p_latitude::numeric, 3)::double precision
    else p_latitude
  end;

  select shop.id
  into owned_shop_id
  from public.locations location
  join public.shops shop
    on shop.id = location.reference_code
    or (location.reference_code is null and shop.id = location.id::text)
  where location.id = p_location_id
    and shop.owner_profile_id = p_owner_profile_id
    and shop.app_approval_status::text in ('pending', 'under_review', 'approved')
  limit 1;

  owns_location := owned_shop_id is not null;

  if not owns_location then
    raise exception using errcode = '42501', message = 'Only the pending, under-review, or approved shop owner can verify this location.';
  end if;

  update public.locations
  set reference_code = coalesce(reference_code, owned_shop_id),
      address = nullif(pg_catalog.btrim(p_formatted_address), ''),
      address_line_2 = nullif(pg_catalog.btrim(p_address_line_2), ''),
      city = pg_catalog.btrim(p_city),
      state = pg_catalog.btrim(p_region),
      postal_code = nullif(pg_catalog.btrim(p_postal_code), ''),
      longitude = saved_longitude,
      latitude = saved_latitude,
      geo_point = extensions.st_setsrid(
        extensions.st_makepoint(saved_longitude, saved_latitude),
        4326
      )::extensions.geography,
      geocoding_provider = 'mapbox',
      geocoding_provider_reference = pg_catalog.btrim(p_provider_reference),
      geocoding_precision = nullif(pg_catalog.btrim(p_precision), ''),
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

alter function public.pr39_save_verified_shop_location(
  uuid,uuid,text,text,text,text,text,double precision,double precision,text,text,text
) owner to postgres;
revoke all on function public.pr39_save_verified_shop_location(
  uuid,uuid,text,text,text,text,text,double precision,double precision,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.pr39_save_verified_shop_location(
  uuid,uuid,text,text,text,text,text,double precision,double precision,text,text,text
) to service_role;

do $$
declare
  function_count integer;
  bad_function_count integer;
begin
  select pg_catalog.count(*)
  into function_count
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      'pr40_update_owner_hours',
      'pr40_replace_barber_availability',
      'pr39_save_verified_shop_location'
    );

  if function_count <> 3 then
    raise exception 'PR40 function contract is incomplete: %', function_count;
  end if;

  select pg_catalog.count(*)
  into bad_function_count
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      'pr40_update_owner_hours',
      'pr40_replace_barber_availability',
      'pr39_save_verified_shop_location'
    )
    and (
      pg_catalog.pg_get_userbyid(procedure.proowner) <> 'postgres'
      or not procedure.prosecdef
      or not (
        coalesce(procedure.proconfig, array[]::text[])
        @> array['search_path=""']
      )
      or pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      or not pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
      or exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
        ) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
    );

  if bad_function_count <> 0 then
    raise exception 'PR40 function privilege posture is unsafe: %', bad_function_count;
  end if;
end;
$$;

select pg_catalog.pg_notify('pgrst', 'reload schema');

commit;
