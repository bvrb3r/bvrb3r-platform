-- BVRB3R V1 BLOCKER-1A
-- Separate protected internal operator authority from public account identity.
-- This migration intentionally does not remove legacy app_role enum values yet.
-- Existing RLS policies must be migrated before the enum can be narrowed safely.

create table if not exists public.internal_operator_access (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  access_level text not null,
  status text not null default 'active',
  granted_at timestamptz not null default now(),
  granted_by_profile_id uuid null references public.profiles(id) on delete set null,
  reason text null,
  updated_at timestamptz not null default now(),
  constraint internal_operator_access_level_check
    check (access_level in ('architect_prime', 'operator', 'viewer')),
  constraint internal_operator_access_status_check
    check (status in ('active', 'suspended', 'revoked'))
);

comment on table public.internal_operator_access is
  'Protected internal BVRB3R operator authority. Never use as a public account role.';

alter table public.internal_operator_access enable row level security;

-- Fail closed: no direct authenticated table policies are created.
-- Reads and writes occur through reviewed server/service-role paths or protected helpers.
revoke all on table public.internal_operator_access from anon, authenticated;

create or replace function private.is_internal_operator(
  required_levels text[] default array['architect_prime', 'operator']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.internal_operator_access ioa
    where ioa.profile_id = auth.uid()
      and ioa.status = 'active'
      and ioa.access_level = any(required_levels)
  );
$$;

revoke all on function private.is_internal_operator(text[]) from public;
grant execute on function private.is_internal_operator(text[]) to authenticated;

-- Backfill only live authenticated profiles already carrying the legacy
-- platform_admin identity. This preserves current authority without relying
-- on runtime email matching. The public profile role is intentionally left
-- unchanged until all dependent policies are migrated.
insert into public.internal_operator_access (
  profile_id,
  access_level,
  status,
  reason
)
select
  p.id,
  'architect_prime',
  'active',
  'Backfilled from authenticated legacy platform_admin profile during V1 role normalization'
from public.profiles p
join auth.users u on u.id = p.id
where p.role::text = 'platform_admin'
on conflict (profile_id) do update
set
  access_level = excluded.access_level,
  status = excluded.status,
  reason = excluded.reason,
  updated_at = now();

-- Canonicalize the live legacy client identity and provision its role record
-- idempotently. Orphaned seed profiles are not mutated in this increment.
update public.profiles p
set
  role = 'client_user'::app_role,
  updated_at = now()
where p.role::text = 'client'
  and exists (select 1 from auth.users u where u.id = p.id);

insert into public.clients (profile_id, retention_tag)
select p.id, 'new'
from public.profiles p
join auth.users u on u.id = p.id
where p.role::text = 'client_user'
  and not exists (
    select 1 from public.clients c where c.profile_id = p.id
  )
on conflict do nothing;

-- Evidence view used by Mission Control and release certification.
create or replace view public.v1_identity_role_evidence
with (security_invoker = true)
as
select
  count(*) filter (
    where p.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
  ) as noncanonical_profile_count,
  count(*) filter (
    where u.id is not null
      and p.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
  ) as noncanonical_authenticated_profile_count,
  count(*) filter (
    where u.id is not null
      and p.role::text = 'client_user'
      and c.id is null
  ) as authenticated_clients_missing_client_record_count,
  count(*) filter (
    where ioa.status = 'active'
  ) as active_internal_operator_count
from public.profiles p
left join auth.users u on u.id = p.id
left join public.clients c on c.profile_id = p.id
left join public.internal_operator_access ioa on ioa.profile_id = p.id;

revoke all on public.v1_identity_role_evidence from anon, authenticated;
