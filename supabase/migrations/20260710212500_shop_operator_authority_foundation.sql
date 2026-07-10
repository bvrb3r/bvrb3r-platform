-- BVRB3R V1 BLOCKER-1F
-- Separate shop-scoped operating authority from public account identity and
-- preserve Barber-to-Shop commercial relationships as a different truth.

create table if not exists public.shop_operator_access (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  authority_level text not null,
  status text not null default 'active',
  location_id uuid null references public.locations(id) on delete cascade,
  granted_by_profile_id uuid null references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  ended_at timestamptz null,
  reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_operator_access_authority_level_check
    check (authority_level in ('owner', 'manager', 'front_desk')),
  constraint shop_operator_access_status_check
    check (status in ('active', 'suspended', 'revoked', 'ended')),
  constraint shop_operator_access_ended_state_check
    check ((status = 'ended' and ended_at is not null) or status <> 'ended')
);

comment on table public.shop_operator_access is
  'Protected shop-scoped operating authority. Public profiles remain client_user, barber_user, or shop_owner_user.';

create unique index if not exists shop_operator_access_scope_unique_idx
  on public.shop_operator_access (
    shop_id,
    profile_id,
    authority_level,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists shop_operator_access_profile_status_idx
  on public.shop_operator_access (profile_id, status, authority_level);

create index if not exists shop_operator_access_shop_status_idx
  on public.shop_operator_access (shop_id, status, authority_level);

alter table public.shop_operator_access enable row level security;
revoke all on table public.shop_operator_access from public, anon, authenticated;
grant all on table public.shop_operator_access to service_role;

create or replace function private.has_shop_operator_access(
  target_shop_id text,
  required_levels text[] default array['owner', 'manager', 'front_desk']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and target_shop_id is not null
    and exists (
      select 1
      from public.shop_operator_access soa
      where soa.profile_id = auth.uid()
        and soa.shop_id = target_shop_id
        and soa.status = 'active'
        and soa.authority_level = any(required_levels)
    );
$$;

revoke all on function private.has_shop_operator_access(text, text[]) from public, anon, authenticated;
grant execute on function private.has_shop_operator_access(text, text[]) to authenticated;

create or replace function private.has_location_operator_access(
  target_location_id uuid,
  required_levels text[] default array['owner', 'manager', 'front_desk']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and target_location_id is not null
    and exists (
      select 1
      from public.shop_operator_access soa
      left join public.locations loc on loc.id = target_location_id
      where soa.profile_id = auth.uid()
        and soa.status = 'active'
        and soa.authority_level = any(required_levels)
        and (
          soa.location_id = target_location_id
          or (soa.location_id is null and soa.shop_id = loc.reference_code)
        )
    );
$$;

revoke all on function private.has_location_operator_access(uuid, text[]) from public, anon, authenticated;
grant execute on function private.has_location_operator_access(uuid, text[]) to authenticated;

create or replace function private.has_any_shop_operator_access(
  required_levels text[] default array['owner', 'manager', 'front_desk']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.shop_operator_access soa
      where soa.profile_id = auth.uid()
        and soa.status = 'active'
        and soa.authority_level = any(required_levels)
    );
$$;

revoke all on function private.has_any_shop_operator_access(text[]) from public, anon, authenticated;
grant execute on function private.has_any_shop_operator_access(text[]) to authenticated;

create or replace function private.has_active_barber_shop_relationship(
  target_profile_id uuid,
  target_shop_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_profile_id is not null
    and target_shop_id is not null
    and exists (
      select 1
      from public.barbers b
      join public.barber_shop_memberships bsm
        on bsm.barber_reference = b.reference_code
       and bsm.shop_reference = target_shop_id
      where b.profile_id = target_profile_id
        and bsm.active = true
    );
$$;

revoke all on function private.has_active_barber_shop_relationship(uuid, text) from public, anon, authenticated;
grant execute on function private.has_active_barber_shop_relationship(uuid, text) to authenticated;

-- Backfill only live Auth-linked shop owners. No public role inference is used
-- to grant authority.
insert into public.shop_operator_access (
  shop_id,
  profile_id,
  authority_level,
  status,
  reason
)
select
  s.id,
  s.owner_profile_id,
  'owner',
  'active',
  'Backfilled from shops.owner_profile_id during V1 shop-authority normalization'
from public.shops s
join auth.users u on u.id = s.owner_profile_id
where s.owner_profile_id is not null
  and not exists (
    select 1
    from public.shop_operator_access soa
    where soa.shop_id = s.id
      and soa.profile_id = s.owner_profile_id
      and soa.authority_level = 'owner'
      and soa.location_id is null
  );

update public.shop_operator_access soa
set
  status = 'active',
  ended_at = null,
  updated_at = now()
from public.shops s
where soa.shop_id = s.id
  and soa.profile_id = s.owner_profile_id
  and soa.authority_level = 'owner'
  and soa.location_id is null
  and s.owner_profile_id is not null;

-- Canonicalize the existing mutually approved staff relationship into the
-- dedicated Barber-to-Shop membership truth. This does not grant operator
-- authority to the Barber.
update public.barber_shop_memberships bsm
set
  membership_type = case
    when sl.routing_model in ('booth_rent', 'commission', 'freelance') then sl.routing_model
    else 'freelance'
  end,
  active = true,
  updated_at = now()
from public.staff_locations sl
join public.barbers b on b.profile_id = sl.profile_id
join public.shops s on s.id = sl.shop_id
where bsm.barber_reference = b.reference_code
  and bsm.shop_reference = sl.shop_id
  and sl.relationship_status = 'active'
  and sl.ended_at is null
  and sl.approved_by_owner_at is not null
  and sl.approved_by_barber_at is not null;

insert into public.barber_shop_memberships (
  barber_reference,
  shop_reference,
  membership_type,
  active
)
select
  b.reference_code,
  sl.shop_id,
  case
    when sl.routing_model in ('booth_rent', 'commission', 'freelance') then sl.routing_model
    else 'freelance'
  end,
  true
from public.staff_locations sl
join public.barbers b on b.profile_id = sl.profile_id
join public.shops s on s.id = sl.shop_id
where sl.relationship_status = 'active'
  and sl.ended_at is null
  and sl.approved_by_owner_at is not null
  and sl.approved_by_barber_at is not null
  and b.reference_code is not null
  and not exists (
    select 1
    from public.barber_shop_memberships existing
    where existing.barber_reference = b.reference_code
      and existing.shop_reference = sl.shop_id
  );

create or replace function private.sync_shop_owner_operator_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.owner_profile_id is distinct from new.owner_profile_id
    and old.owner_profile_id is not null
  then
    update public.shop_operator_access
    set
      status = 'ended',
      ended_at = now(),
      updated_at = now(),
      reason = coalesce(reason, 'Ended because shops.owner_profile_id changed')
    where shop_id = old.id
      and profile_id = old.owner_profile_id
      and authority_level = 'owner'
      and location_id is null
      and status = 'active';
  end if;

  if new.owner_profile_id is not null
    and exists (select 1 from auth.users u where u.id = new.owner_profile_id)
  then
    update public.shop_operator_access
    set
      status = 'active',
      ended_at = null,
      updated_at = now()
    where shop_id = new.id
      and profile_id = new.owner_profile_id
      and authority_level = 'owner'
      and location_id is null;

    if not found then
      insert into public.shop_operator_access (
        shop_id,
        profile_id,
        authority_level,
        status,
        reason
      ) values (
        new.id,
        new.owner_profile_id,
        'owner',
        'active',
        'Provisioned from shops.owner_profile_id'
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_shop_owner_operator_access() from public, anon, authenticated;

drop trigger if exists shops_owner_operator_access_sync on public.shops;
create trigger shops_owner_operator_access_sync
after insert or update of owner_profile_id on public.shops
for each row
execute function private.sync_shop_owner_operator_access();

create or replace function private.sync_barber_shop_membership_from_staff_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_barber_reference text;
  relationship_is_active boolean;
begin
  select b.reference_code
  into target_barber_reference
  from public.barbers b
  where b.profile_id = new.profile_id
  order by b.created_at asc
  limit 1;

  if target_barber_reference is null or new.shop_id is null then
    return new;
  end if;

  relationship_is_active := new.relationship_status = 'active'
    and new.ended_at is null
    and new.approved_by_owner_at is not null
    and new.approved_by_barber_at is not null
    and exists (select 1 from public.shops s where s.id = new.shop_id);

  if relationship_is_active then
    update public.barber_shop_memberships
    set
      membership_type = case
        when new.routing_model in ('booth_rent', 'commission', 'freelance') then new.routing_model
        else 'freelance'
      end,
      active = true,
      updated_at = now()
    where barber_reference = target_barber_reference
      and shop_reference = new.shop_id;

    if not found then
      insert into public.barber_shop_memberships (
        barber_reference,
        shop_reference,
        membership_type,
        active
      ) values (
        target_barber_reference,
        new.shop_id,
        case
          when new.routing_model in ('booth_rent', 'commission', 'freelance') then new.routing_model
          else 'freelance'
        end,
        true
      );
    end if;
  elsif not exists (
    select 1
    from public.staff_locations other
    where other.id <> new.id
      and other.profile_id = new.profile_id
      and other.shop_id = new.shop_id
      and other.relationship_status = 'active'
      and other.ended_at is null
      and other.approved_by_owner_at is not null
      and other.approved_by_barber_at is not null
  ) then
    update public.barber_shop_memberships
    set
      active = false,
      updated_at = now()
    where barber_reference = target_barber_reference
      and shop_reference = new.shop_id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_barber_shop_membership_from_staff_location() from public, anon, authenticated;

drop trigger if exists staff_locations_barber_shop_membership_sync on public.staff_locations;
create trigger staff_locations_barber_shop_membership_sync
after insert or update of relationship_status, ended_at, approved_by_owner_at, approved_by_barber_at, routing_model, shop_id
on public.staff_locations
for each row
execute function private.sync_barber_shop_membership_from_staff_location();

create or replace view public.v1_shop_authority_evidence
with (security_invoker = true)
as
select
  (select count(*) from public.shop_operator_access where status = 'active') as active_shop_operator_count,
  (
    select count(*)
    from public.shops s
    join auth.users u on u.id = s.owner_profile_id
    left join public.shop_operator_access soa
      on soa.shop_id = s.id
     and soa.profile_id = s.owner_profile_id
     and soa.authority_level = 'owner'
     and soa.status = 'active'
     and soa.location_id is null
    where s.owner_profile_id is not null
      and soa.id is null
  ) as auth_linked_shop_owner_missing_operator_access_count,
  (
    select count(*)
    from public.shop_operator_access soa
    join public.profiles p on p.id = soa.profile_id
    where soa.status = 'active'
      and p.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
  ) as active_operator_noncanonical_public_role_count,
  (
    select count(*)
    from public.staff_locations sl
    join public.barbers b on b.profile_id = sl.profile_id
    join public.shops s on s.id = sl.shop_id
    left join public.barber_shop_memberships bsm
      on bsm.barber_reference = b.reference_code
     and bsm.shop_reference = sl.shop_id
     and bsm.active = true
    where sl.relationship_status = 'active'
      and sl.ended_at is null
      and sl.approved_by_owner_at is not null
      and sl.approved_by_barber_at is not null
      and bsm.id is null
  ) as active_staff_relationship_missing_barber_membership_count,
  (
    select count(*)
    from public.shop_operator_access soa
    join public.barbers b on b.profile_id = soa.profile_id
    join public.barber_shop_memberships bsm
      on bsm.barber_reference = b.reference_code
     and bsm.shop_reference = soa.shop_id
     and bsm.active = true
    where soa.status = 'active'
      and soa.authority_level in ('manager', 'front_desk')
  ) as barber_relationships_with_elevated_operator_access_count,
  (
    select count(*)
    from pg_trigger t
    where t.tgrelid = 'public.shops'::regclass
      and t.tgname = 'shops_owner_operator_access_sync'
      and not t.tgisinternal
  ) as shop_owner_sync_trigger_count,
  (
    select count(*)
    from pg_trigger t
    where t.tgrelid = 'public.staff_locations'::regclass
      and t.tgname = 'staff_locations_barber_shop_membership_sync'
      and not t.tgisinternal
  ) as barber_membership_sync_trigger_count,
  (
    select count(*)
    from pg_policies pol
    where pol.schemaname = 'public'
      and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~
        '''(owner|manager|front_desk|platform_admin|commission_barber|booth_rent_barber|client)'''
  ) as remaining_legacy_role_policy_literal_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and p.proname not in (
        'bvrb3r_v1_identity_readiness_snapshot',
        'enforce_quarantined_profile_state'
      )
      and pg_get_functiondef(p.oid) ~
        '''(owner|manager|front_desk|platform_admin|commission_barber|booth_rent_barber|client)'''
  ) as remaining_legacy_role_function_literal_count;

comment on view public.v1_shop_authority_evidence is
  'V1 evidence that shop authority and Barber commercial relationships are separate, scoped, and canonical.';

revoke all on table public.v1_shop_authority_evidence from public, anon, authenticated;
grant select on table public.v1_shop_authority_evidence to service_role;