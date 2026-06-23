-- PR #29 Approved Eligible-Only Role Normalization Migration Candidate
-- Protected-risk candidate only. Do not apply without explicit founder approval.
-- Scope: profiles.role account identity normalization for eligible rows only.
-- Excluded from update scope: blocked rows, manual-review rows, no-op canonical rows,
-- platform_admin, front_desk, manager, unsupported roles, and missing-linkage rows.
-- No production role mutation should happen outside manual founder-approved Supabase
-- migration execution.

begin;

create schema if not exists private;

create table if not exists private.role_normalization_profile_backups (
  migration_key text not null,
  profile_id uuid not null,
  old_role text not null,
  new_role text not null,
  backed_up_at timestamptz not null default now(),
  backup_reason text not null,
  primary key (migration_key, profile_id)
);

revoke all on schema private from public, anon, authenticated;
revoke all on table private.role_normalization_profile_backups from public, anon, authenticated;

do $$
declare
  v_migration_key constant text := 'pr29_approved_eligible_only_role_normalization';
  v_expected_eligible_count constant integer := 16;
  v_eligible_count integer;
  v_backup_count integer;
  v_updated_count integer;
  v_has_updated_at boolean;
begin
  with eligible_profiles as (
    select
      p.id as profile_id,
      p.role::text as old_role,
      case
        when p.role::text = 'client' and c.profile_id is not null then 'client_user'
        when p.role::text = 'booth_rent_barber' and b.profile_id is not null then 'barber_user'
        when p.role::text = 'commission_barber' and b.profile_id is not null then 'barber_user'
        when p.role::text = 'owner' and s.owner_profile_id is not null then 'shop_owner_user'
        else null
      end as new_role
    from public.profiles p
    left join public.clients c
      on c.profile_id = p.id
    left join public.barbers b
      on b.profile_id = p.id
    left join public.shops s
      on s.owner_profile_id = p.id
    where p.role::text in ('client', 'booth_rent_barber', 'commission_barber', 'owner')
  )
  select count(*)
  into v_eligible_count
  from eligible_profiles
  where new_role in ('client_user', 'barber_user', 'shop_owner_user');

  if v_eligible_count <> v_expected_eligible_count then
    raise exception 'PR29 role normalization aborted: expected % eligible rows, found %.',
      v_expected_eligible_count,
      v_eligible_count;
  end if;

  if exists (
    with eligible_profiles as (
      select
        p.id as profile_id,
        p.role::text as old_role,
        case
          when p.role::text = 'client' and c.profile_id is not null then 'client_user'
          when p.role::text = 'booth_rent_barber' and b.profile_id is not null then 'barber_user'
          when p.role::text = 'commission_barber' and b.profile_id is not null then 'barber_user'
          when p.role::text = 'owner' and s.owner_profile_id is not null then 'shop_owner_user'
          else null
        end as new_role
      from public.profiles p
      left join public.clients c
        on c.profile_id = p.id
      left join public.barbers b
        on b.profile_id = p.id
      left join public.shops s
        on s.owner_profile_id = p.id
      where p.role::text in ('client', 'booth_rent_barber', 'commission_barber', 'owner')
    )
    select 1
    from eligible_profiles
    where old_role in ('front_desk', 'manager', 'platform_admin')
       or new_role not in ('client_user', 'barber_user', 'shop_owner_user')
       or new_role = 'shop_owner'
  ) then
    raise exception 'PR29 role normalization aborted: manual-review or non-canonical proposed role entered eligible set.';
  end if;

  insert into private.role_normalization_profile_backups (
    migration_key,
    profile_id,
    old_role,
    new_role,
    backup_reason
  )
  select
    v_migration_key,
    eligible_profiles.profile_id,
    eligible_profiles.old_role,
    eligible_profiles.new_role,
    'approved eligible-only role normalization backup before profiles.role update'
  from (
    select
      p.id as profile_id,
      p.role::text as old_role,
      case
        when p.role::text = 'client' and c.profile_id is not null then 'client_user'
        when p.role::text = 'booth_rent_barber' and b.profile_id is not null then 'barber_user'
        when p.role::text = 'commission_barber' and b.profile_id is not null then 'barber_user'
        when p.role::text = 'owner' and s.owner_profile_id is not null then 'shop_owner_user'
        else null
      end as new_role
    from public.profiles p
    left join public.clients c
      on c.profile_id = p.id
    left join public.barbers b
      on b.profile_id = p.id
    left join public.shops s
      on s.owner_profile_id = p.id
    where p.role::text in ('client', 'booth_rent_barber', 'commission_barber', 'owner')
  ) eligible_profiles
  where eligible_profiles.new_role in ('client_user', 'barber_user', 'shop_owner_user')
  on conflict (migration_key, profile_id) do nothing;

  select count(*)
  into v_backup_count
  from private.role_normalization_profile_backups
  where migration_key = v_migration_key;

  if v_backup_count <> v_expected_eligible_count then
    raise exception 'PR29 role normalization aborted: expected % backup rows, found %.',
      v_expected_eligible_count,
      v_backup_count;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'updated_at'
  )
  into v_has_updated_at;

  if v_has_updated_at then
    update public.profiles p
    set
      role = backup.new_role::public.app_role,
      updated_at = now()
    from private.role_normalization_profile_backups backup
    where backup.migration_key = v_migration_key
      and backup.profile_id = p.id
      and p.role::text = backup.old_role
      and backup.old_role in ('client', 'booth_rent_barber', 'commission_barber', 'owner')
      and backup.new_role in ('client_user', 'barber_user', 'shop_owner_user')
      and backup.new_role <> 'shop_owner';
  else
    update public.profiles p
    set role = backup.new_role::public.app_role
    from private.role_normalization_profile_backups backup
    where backup.migration_key = v_migration_key
      and backup.profile_id = p.id
      and p.role::text = backup.old_role
      and backup.old_role in ('client', 'booth_rent_barber', 'commission_barber', 'owner')
      and backup.new_role in ('client_user', 'barber_user', 'shop_owner_user')
      and backup.new_role <> 'shop_owner';
  end if;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_expected_eligible_count then
    raise exception 'PR29 role normalization aborted: expected % updated rows, updated %.',
      v_expected_eligible_count,
      v_updated_count;
  end if;
end $$;

commit;

-- Rollback instructions for founder-approved manual rollback only:
-- begin;
-- update public.profiles p
-- set role = backup.old_role::public.app_role
-- from private.role_normalization_profile_backups backup
-- where backup.migration_key = 'pr29_approved_eligible_only_role_normalization'
--   and backup.profile_id = p.id
--   and p.role::text = backup.new_role;
-- commit;
