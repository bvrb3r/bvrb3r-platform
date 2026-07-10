-- BVRB3R V1 BLOCKER-1F
-- Establish explicit shop-scoped operator authority outside public profile roles.

create table if not exists public.shop_operator_access (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  shop_id text not null references public.shops(id) on delete cascade,
  location_id uuid null references public.locations(id) on delete cascade,
  access_level text not null,
  status text not null default 'active',
  source text not null default 'manual',
  granted_by_profile_id uuid null references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz null,
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_operator_access_level_check
    check (access_level in ('owner', 'manager', 'front_desk')),
  constraint shop_operator_access_status_check
    check (status in ('active', 'suspended', 'revoked')),
  constraint shop_operator_access_scope_unique
    unique nulls not distinct (profile_id, shop_id, location_id, access_level)
);

comment on table public.shop_operator_access is
  'Protected shop-scoped owner, manager, and front-desk authority. Public profile roles remain client_user, barber_user, or shop_owner_user.';

alter table public.shop_operator_access enable row level security;
revoke all on table public.shop_operator_access from public, anon, authenticated;
grant all on table public.shop_operator_access to service_role;

create index if not exists shop_operator_access_profile_status_idx
  on public.shop_operator_access (profile_id, status);
create index if not exists shop_operator_access_shop_status_idx
  on public.shop_operator_access (shop_id, status);
create index if not exists shop_operator_access_location_status_idx
  on public.shop_operator_access (location_id, status)
  where location_id is not null;

create unique index if not exists shop_operator_access_active_primary_owner_idx
  on public.shop_operator_access (shop_id)
  where access_level = 'owner'
    and status = 'active'
    and location_id is null;

create or replace function private.enforce_shop_operator_access_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.location_id is not null
    and not exists (
      select 1
      from public.locations l
      where l.id = new.location_id
        and l.reference_code = new.shop_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Shop operator location must belong to the selected shop.';
  end if;

  if new.status = 'active' then
    new.revoked_at := null;
  elsif new.status = 'revoked' and new.revoked_at is null then
    new.revoked_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_shop_operator_access_integrity() from public, anon, authenticated;

drop trigger if exists shop_operator_access_integrity_guard on public.shop_operator_access;
create trigger shop_operator_access_integrity_guard
before insert or update on public.shop_operator_access
for each row
execute function private.enforce_shop_operator_access_integrity();

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
    update public.shop_operator_access soa
    set
      status = 'revoked',
      revoked_at = now(),
      reason = 'Shop owner_profile_id changed.',
      updated_at = now()
    where soa.profile_id = old.owner_profile_id
      and soa.shop_id = old.id
      and soa.location_id is null
      and soa.access_level = 'owner'
      and soa.source = 'shops.owner_profile_id'
      and soa.status = 'active';
  end if;

  if new.owner_profile_id is not null then
    insert into public.shop_operator_access (
      profile_id,
      shop_id,
      location_id,
      access_level,
      status,
      source,
      granted_by_profile_id,
      reason,
      metadata
    )
    values (
      new.owner_profile_id,
      new.id,
      null,
      'owner',
      'active',
      'shops.owner_profile_id',
      new.owner_profile_id,
      null,
      jsonb_build_object('synchronized_from', 'shops.owner_profile_id')
    )
    on conflict on constraint shop_operator_access_scope_unique
    do update set
      status = 'active',
      source = 'shops.owner_profile_id',
      granted_by_profile_id = excluded.granted_by_profile_id,
      granted_at = now(),
      revoked_at = null,
      reason = null,
      metadata = public.shop_operator_access.metadata || excluded.metadata,
      updated_at = now();
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

insert into public.shop_operator_access (
  profile_id,
  shop_id,
  location_id,
  access_level,
  status,
  source,
  granted_by_profile_id,
  reason,
  metadata
)
select
  s.owner_profile_id,
  s.id,
  null,
  'owner',
  'active',
  'shops.owner_profile_id',
  s.owner_profile_id,
  null,
  jsonb_build_object('backfilled_at', now(), 'backfilled_from', 'shops.owner_profile_id')
from public.shops s
where s.owner_profile_id is not null
on conflict on constraint shop_operator_access_scope_unique
do update set
  status = 'active',
  source = 'shops.owner_profile_id',
  granted_by_profile_id = excluded.granted_by_profile_id,
  granted_at = now(),
  revoked_at = null,
  reason = null,
  metadata = public.shop_operator_access.metadata || excluded.metadata,
  updated_at = now();

create or replace function private.has_shop_operator_access(
  p_shop_reference text default null,
  p_location_id uuid default null,
  p_allowed_levels text[] default array['owner', 'manager', 'front_desk']::text[]
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
        and soa.access_level = any(
          coalesce(
            p_allowed_levels,
            array['owner', 'manager', 'front_desk']::text[]
          )
        )
        and (
          (
            nullif(btrim(coalesce(p_shop_reference, '')), '') is not null
            and soa.shop_id = p_shop_reference
          )
          or (
            p_location_id is not null
            and (
              soa.location_id = p_location_id
              or (
                soa.location_id is null
                and exists (
                  select 1
                  from public.locations l
                  where l.id = p_location_id
                    and l.reference_code = soa.shop_id
                )
              )
            )
          )
          or (
            nullif(btrim(coalesce(p_shop_reference, '')), '') is not null
            and exists (
              select 1
              from public.locations l
              where (
                  l.id::text = p_shop_reference
                  or l.reference_code = p_shop_reference
                )
                and (
                  soa.location_id = l.id
                  or (
                    soa.location_id is null
                    and soa.shop_id = l.reference_code
                  )
                )
            )
          )
        )
    );
$$;

revoke all on function private.has_shop_operator_access(text, uuid, text[]) from public, anon, authenticated;
grant execute on function private.has_shop_operator_access(text, uuid, text[]) to authenticated, service_role;

create or replace function private.is_booking_shop_operator(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_shop_operator_access(null, p_location_id);
$$;

revoke all on function private.is_booking_shop_operator(uuid) from public, anon, authenticated;
grant execute on function private.is_booking_shop_operator(uuid) to authenticated;

create or replace function private.rls_batch_4_is_shop_operator_reference(p_location_reference text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_shop_operator_access(p_location_reference, null);
$$;

revoke all on function private.rls_batch_4_is_shop_operator_reference(text) from public, anon, authenticated;
grant execute on function private.rls_batch_4_is_shop_operator_reference(text) to authenticated;

create or replace function private.rls_batch_5_is_shop_owner_actor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'shop_owner_user'
      and p.primary_onboarding_role::text = 'shop_owner'
  );
$$;

revoke all on function private.rls_batch_5_is_shop_owner_actor() from public, anon, authenticated;
grant execute on function private.rls_batch_5_is_shop_owner_actor() to authenticated;

create or replace function private.rls_batch_5_is_shop_owner_reference(
  p_shop_reference text,
  p_location_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_shop_operator_access(
    p_shop_reference,
    p_location_id,
    array['owner']::text[]
  );
$$;

revoke all on function private.rls_batch_5_is_shop_owner_reference(text, uuid) from public, anon, authenticated;
grant execute on function private.rls_batch_5_is_shop_owner_reference(text, uuid) to authenticated;

create or replace function private.rls_batch_5_is_shop_operator_reference(
  p_shop_reference text,
  p_location_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_shop_operator_access(
    p_shop_reference,
    p_location_id,
    array['owner', 'manager', 'front_desk']::text[]
  );
$$;

revoke all on function private.rls_batch_5_is_shop_operator_reference(text, uuid) from public, anon, authenticated;
grant execute on function private.rls_batch_5_is_shop_operator_reference(text, uuid) to authenticated;

create or replace function private.rls_batch_5_can_read_barber_by_shop(
  p_barber_id uuid,
  p_barber_reference text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.rls_batch_5_is_barber_owner(p_barber_id, p_barber_reference)
    or private.rls_batch_5_is_platform_admin()
    or exists (
      select 1
      from public.barbers b
      join public.staff_locations barber_sl
        on barber_sl.profile_id = b.profile_id
      where (
          (p_barber_id is not null and b.id = p_barber_id)
          or (
            nullif(btrim(coalesce(p_barber_reference, '')), '') is not null
            and p_barber_reference in (
              b.reference_code,
              b.id::text,
              b.profile_id::text,
              b.booking_slug
            )
          )
        )
        and coalesce(barber_sl.relationship_status, 'active') = 'active'
        and barber_sl.ended_at is null
        and private.has_shop_operator_access(
          barber_sl.shop_id,
          barber_sl.location_id
        )
    );
$$;

revoke all on function private.rls_batch_5_can_read_barber_by_shop(uuid, text) from public, anon, authenticated;
grant execute on function private.rls_batch_5_can_read_barber_by_shop(uuid, text) to authenticated;

create or replace function private.rls_disabled_cleanup_can_read_location_reference(
  p_location_reference text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.rls_disabled_cleanup_is_platform_admin()
    or private.has_shop_operator_access(p_location_reference, null)
    or exists (
      select 1
      from public.locations l
      where (
          l.id::text = p_location_reference
          or l.reference_code = p_location_reference
        )
        and private.has_shop_operator_access(l.reference_code, l.id)
    );
$$;

revoke all on function private.rls_disabled_cleanup_can_read_location_reference(text) from public, anon, authenticated;
grant execute on function private.rls_disabled_cleanup_can_read_location_reference(text) to authenticated;

alter policy "location memberships self or owner"
on public.location_memberships
using (
  profile_id = auth.uid()
  or private.has_shop_operator_access(null, location_id)
  or private.is_internal_operator()
);

create or replace view public.v1_shop_operator_authority_evidence
with (security_invoker = true)
as
select
  (
    select count(*)
    from public.shop_operator_access soa
    where soa.status = 'active'
  ) as active_shop_operator_access_count,
  (
    select count(*)
    from public.shop_operator_access soa
    where soa.status = 'active'
      and soa.access_level = 'owner'
  ) as active_shop_owner_access_count,
  (
    select count(*)
    from public.shops s
    where s.owner_profile_id is not null
      and not exists (
        select 1
        from public.shop_operator_access soa
        where soa.profile_id = s.owner_profile_id
          and soa.shop_id = s.id
          and soa.location_id is null
          and soa.access_level = 'owner'
          and soa.status = 'active'
      )
  ) as shop_owner_missing_access_count,
  (
    select count(*)
    from public.shop_operator_access soa
    join public.profiles p on p.id = soa.profile_id
    where soa.status = 'active'
      and p.role::text not in (
        'client_user',
        'barber_user',
        'shop_owner_user'
      )
  ) as active_operator_noncanonical_public_role_count,
  (
    select count(*)
    from public.shop_operator_access soa
    left join auth.users u on u.id = soa.profile_id
    where soa.status = 'active'
      and u.id is null
  ) as active_operator_without_auth_identity_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'has_shop_operator_access',
        'is_booking_shop_operator',
        'rls_batch_4_is_shop_operator_reference',
        'rls_batch_5_is_shop_owner_reference',
        'rls_batch_5_is_shop_operator_reference',
        'rls_batch_5_can_read_barber_by_shop',
        'rls_disabled_cleanup_can_read_location_reference'
      )
      and p.prosecdef
      and p.proconfig = array['search_path=""']::text[]
  ) as hardened_shop_authority_helper_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'is_booking_shop_operator',
        'rls_batch_4_is_shop_operator_reference',
        'rls_batch_5_is_shop_owner_reference',
        'rls_batch_5_is_shop_operator_reference',
        'rls_batch_5_can_read_barber_by_shop',
        'rls_disabled_cleanup_can_read_location_reference'
      )
      and lower(pg_get_functiondef(p.oid)) ~
        'p[.]role.*(owner|manager|front_desk)'
  ) as shop_helper_legacy_profile_role_reference_count,
  (
    select count(*)
    from pg_policies pol
    where pol.schemaname = 'public'
      and lower(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~
        '(p[.]role|profile[.]role|viewer_profile[.]role|manager_profile[.]role|owner_profile[.]role).*(owner|manager|front_desk)'
  ) as direct_legacy_shop_role_policy_reference_count;

comment on view public.v1_shop_operator_authority_evidence is
  'V1 evidence that shop owner, manager, and front-desk authority is protected, shop-scoped, and independent from public profile roles.';

revoke all on table public.v1_shop_operator_authority_evidence from public, anon, authenticated;
grant select on table public.v1_shop_operator_authority_evidence to service_role;