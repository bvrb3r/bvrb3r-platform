-- BVRB3R V1 BLOCKER-1E
-- Quarantine non-Auth legacy seed profiles without deleting historical rows.

create table if not exists public.legacy_profile_quarantine (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  original_role text not null,
  canonical_role public.app_role not null,
  original_primary_onboarding_role text null,
  original_onboarding_state text null,
  reason text not null,
  state text not null default 'quarantined',
  metadata jsonb not null default '{}'::jsonb,
  quarantined_at timestamptz not null default now(),
  released_at timestamptz null,
  release_reason text null,
  constraint legacy_profile_quarantine_canonical_role_check
    check (canonical_role::text in ('client_user', 'barber_user', 'shop_owner_user')),
  constraint legacy_profile_quarantine_state_check
    check (state in ('quarantined', 'released'))
);

comment on table public.legacy_profile_quarantine is
  'Protected registry for preserved non-Auth legacy seed profiles removed from public role and discovery truth.';

alter table public.legacy_profile_quarantine enable row level security;
revoke all on table public.legacy_profile_quarantine from public, anon, authenticated;
grant all on table public.legacy_profile_quarantine to service_role;

insert into public.legacy_profile_quarantine (
  profile_id,
  original_role,
  canonical_role,
  original_primary_onboarding_role,
  original_onboarding_state,
  reason,
  metadata
)
select
  p.id,
  p.role::text,
  case
    when exists (select 1 from public.barbers b where b.profile_id = p.id)
      then 'barber_user'::public.app_role
    when exists (select 1 from public.shops s where s.owner_profile_id = p.id)
      then 'shop_owner_user'::public.app_role
    else 'client_user'::public.app_role
  end,
  p.primary_onboarding_role::text,
  p.onboarding_state::text,
  'Quarantined non-Auth legacy seed profile during V1 canonical public-role normalization',
  jsonb_build_object(
    'auth_linked_at_quarantine', false,
    'had_client_record', exists (select 1 from public.clients c where c.profile_id = p.id),
    'had_barber_record', exists (select 1 from public.barbers b where b.profile_id = p.id),
    'had_owned_shop_record', exists (select 1 from public.shops s where s.owner_profile_id = p.id),
    'had_staff_location_record', exists (select 1 from public.staff_locations sl where sl.profile_id = p.id),
    'had_public_username', nullif(trim(p.public_username), '') is not null
  )
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null
  and p.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
on conflict (profile_id) do nothing;

create or replace function private.enforce_quarantined_profile_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  quarantine_role public.app_role;
begin
  select q.canonical_role
  into quarantine_role
  from public.legacy_profile_quarantine q
  where q.profile_id = new.id
    and q.state = 'quarantined';

  if found then
    new.role := quarantine_role;
    new.primary_onboarding_role := null;
    new.onboarding_state := 'awaiting_contact_verification'::public.identity_onboarding_state;
    new.public_username := null;
    new.public_bio := null;
    new.public_city := null;
    new.public_state := null;
    new.profile_photo_path := null;
    new.profile_photo_url := null;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_quarantined_profile_state() from public, anon, authenticated;

drop trigger if exists profiles_legacy_quarantine_guard on public.profiles;
create trigger profiles_legacy_quarantine_guard
before insert or update on public.profiles
for each row
execute function private.enforce_quarantined_profile_state();

create or replace function private.enforce_quarantined_barber_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.legacy_profile_quarantine q
    where q.profile_id = new.profile_id
      and q.state = 'quarantined'
  ) then
    new.is_bookable := false;
    new.is_discoverable := false;
    new.status := 'restricted';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_quarantined_barber_state() from public, anon, authenticated;

drop trigger if exists barbers_legacy_quarantine_guard on public.barbers;
create trigger barbers_legacy_quarantine_guard
before insert or update on public.barbers
for each row
execute function private.enforce_quarantined_barber_state();

update public.profiles p
set
  role = q.canonical_role,
  primary_onboarding_role = null,
  onboarding_state = 'awaiting_contact_verification'::public.identity_onboarding_state,
  public_username = null,
  public_bio = null,
  public_city = null,
  public_state = null,
  profile_photo_path = null,
  profile_photo_url = null,
  updated_at = now()
from public.legacy_profile_quarantine q
where q.profile_id = p.id
  and q.state = 'quarantined';

update public.barbers b
set
  is_bookable = false,
  is_discoverable = false,
  status = 'restricted'
where exists (
  select 1
  from public.legacy_profile_quarantine q
  where q.profile_id = b.profile_id
    and q.state = 'quarantined'
);

create or replace view public.v1_legacy_profile_quarantine_evidence
with (security_invoker = true)
as
select
  count(*) filter (where q.state = 'quarantined') as quarantined_profile_count,
  count(*) filter (
    where q.state = 'quarantined'
      and u.id is not null
  ) as auth_linked_quarantined_profile_count,
  count(*) filter (
    where q.state = 'quarantined'
      and p.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
  ) as quarantined_noncanonical_public_role_count,
  count(*) filter (
    where q.state = 'quarantined'
      and (
        nullif(trim(p.public_username), '') is not null
        or nullif(trim(p.public_bio), '') is not null
        or nullif(trim(p.public_city), '') is not null
        or nullif(trim(p.public_state), '') is not null
        or nullif(trim(p.profile_photo_path), '') is not null
        or nullif(trim(p.profile_photo_url), '') is not null
      )
  ) as quarantined_public_surface_count,
  count(*) filter (
    where q.state = 'quarantined'
      and (b.is_bookable = true or b.is_discoverable = true or b.status = 'active')
  ) as quarantined_exposed_barber_count,
  (
    select count(*)
    from public.profiles candidate
    where candidate.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
  ) as remaining_noncanonical_profile_count,
  (
    select count(*)
    from pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass
      and t.tgname = 'profiles_legacy_quarantine_guard'
      and not t.tgisinternal
  ) as profile_quarantine_guard_trigger_count,
  (
    select count(*)
    from pg_trigger t
    where t.tgrelid = 'public.barbers'::regclass
      and t.tgname = 'barbers_legacy_quarantine_guard'
      and not t.tgisinternal
  ) as barber_quarantine_guard_trigger_count
from public.legacy_profile_quarantine q
join public.profiles p on p.id = q.profile_id
left join auth.users u on u.id = q.profile_id
left join public.barbers b on b.profile_id = q.profile_id;

comment on view public.v1_legacy_profile_quarantine_evidence is
  'V1 evidence that preserved orphan legacy profiles are non-Auth, canonical, non-public, and non-bookable.';

revoke all on table public.v1_legacy_profile_quarantine_evidence from public, anon, authenticated;
grant select on table public.v1_legacy_profile_quarantine_evidence to service_role;
