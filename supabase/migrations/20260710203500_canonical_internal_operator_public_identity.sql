-- BVRB3R V1 BLOCKER-1D
-- Keep protected internal operator authority separate from public account identity.
-- Active full operators use client_user as their least-privilege public profile role.

create or replace function private.enforce_internal_operator_public_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.internal_operator_access ioa
    where ioa.profile_id = new.id
      and ioa.status = 'active'
      and ioa.access_level in ('architect_prime', 'operator')
  ) then
    new.role := 'client_user'::public.app_role;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_internal_operator_public_role() from public, anon, authenticated;

drop trigger if exists profiles_internal_operator_public_role_guard on public.profiles;
create trigger profiles_internal_operator_public_role_guard
before insert or update of role on public.profiles
for each row
execute function private.enforce_internal_operator_public_role();

-- Backfill only approved protected operators. No email matching or role inference.
update public.profiles p
set
  role = 'client_user'::public.app_role,
  updated_at = now()
where exists (
  select 1
  from public.internal_operator_access ioa
  where ioa.profile_id = p.id
    and ioa.status = 'active'
    and ioa.access_level in ('architect_prime', 'operator')
);

-- Every canonical client_user identity needs a single client row. This is
-- idempotent and uses the existing one-profile/one-client unique guard.
insert into public.clients (profile_id, retention_tag)
select p.id, 'new'
from public.profiles p
join public.internal_operator_access ioa on ioa.profile_id = p.id
where p.role::text = 'client_user'
  and ioa.status = 'active'
  and ioa.access_level in ('architect_prime', 'operator')
  and not exists (
    select 1
    from public.clients c
    where c.profile_id = p.id
  )
on conflict do nothing;

-- Operator suspension/revocation belongs in internal_operator_access. Prevent
-- the general account-status overlay from creating contradictory operator state.
create or replace function private.prevent_internal_operator_account_status_control()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_type = 'user'
    and new.control_key = 'account_status'
    and exists (
      select 1
      from public.internal_operator_access ioa
      where ioa.profile_id::text = new.target_id
        and ioa.status = 'active'
        and ioa.access_level in ('architect_prime', 'operator')
    )
  then
    raise exception using
      errcode = '42501',
      message = 'Protected internal operator status must be managed through internal_operator_access.';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_internal_operator_account_status_control() from public, anon, authenticated;

drop trigger if exists platform_admin_controls_internal_operator_guard on public.platform_admin_controls;
create trigger platform_admin_controls_internal_operator_guard
before insert or update on public.platform_admin_controls
for each row
execute function private.prevent_internal_operator_account_status_control();

create or replace view public.v1_internal_operator_identity_evidence
with (security_invoker = true)
as
select
  count(*) filter (
    where ioa.status = 'active'
      and ioa.access_level in ('architect_prime', 'operator')
  ) as active_full_operator_count,
  count(*) filter (
    where ioa.status = 'active'
      and ioa.access_level in ('architect_prime', 'operator')
      and p.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
  ) as active_operator_noncanonical_public_role_count,
  count(*) filter (
    where ioa.status = 'active'
      and ioa.access_level in ('architect_prime', 'operator')
      and c.id is null
  ) as active_operator_missing_client_record_count,
  (
    select count(*)
    from pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass
      and t.tgname = 'profiles_internal_operator_public_role_guard'
      and not t.tgisinternal
  ) as public_role_guard_trigger_count,
  (
    select count(*)
    from pg_trigger t
    where t.tgrelid = 'public.platform_admin_controls'::regclass
      and t.tgname = 'platform_admin_controls_internal_operator_guard'
      and not t.tgisinternal
  ) as operator_control_guard_trigger_count,
  (
    select count(*)
    from public.platform_admin_controls pac
    join public.internal_operator_access protected
      on protected.profile_id::text = pac.target_id
    where pac.target_type = 'user'
      and pac.control_key = 'account_status'
      and protected.status = 'active'
      and protected.access_level in ('architect_prime', 'operator')
  ) as contradictory_operator_account_control_count
from public.internal_operator_access ioa
join public.profiles p on p.id = ioa.profile_id
left join public.clients c on c.profile_id = p.id;

comment on view public.v1_internal_operator_identity_evidence is
  'V1 evidence that protected internal operators retain canonical public identity and cannot receive contradictory account-status controls.';

revoke all on table public.v1_internal_operator_identity_evidence from public, anon, authenticated;
grant select on table public.v1_internal_operator_identity_evidence to service_role;
