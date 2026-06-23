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
  v_expected_total_profiles_inspected constant integer := 27;
  v_expected_eligible_count constant integer := 16;
  v_expected_blocked_count constant integer := 2;
  v_expected_manual_review_count constant integer := 5;
  v_expected_no_op_count constant integer := 4;
  v_expected_affected_count constant integer := 23;
  v_total_profiles_inspected integer;
  v_eligible_count integer;
  v_blocked_count integer;
  v_manual_review_count integer;
  v_no_op_count integer;
  v_affected_count integer;
  v_backup_count integer;
  v_updated_count integer;
  v_has_updated_at boolean;
begin
  if to_regtype('public.app_role') is null then
    raise exception 'PR29 role normalization aborted: public.app_role type is missing.';
  end if;

  if exists (
    select required_role
    from unnest(array[
      'client_user',
      'barber_user',
      'shop_owner_user',
      'client',
      'booth_rent_barber',
      'commission_barber',
      'owner',
      'front_desk',
      'manager',
      'platform_admin'
    ]) as required_roles(required_role)
    except
    select enumlabel
    from pg_enum
    where enumtypid = 'public.app_role'::regtype
  ) then
    raise exception 'PR29 role normalization aborted: public.app_role is missing required role labels.';
  end if;

  with profile_role_inputs as (
    select
      p.id as profile_id,
      nullif(btrim(coalesce(p.role::text, '')), '') as old_role,
      exists (
        select 1
        from public.clients c
        where c.profile_id = p.id
      ) as has_client_record,
      exists (
        select 1
        from public.barbers b
        where b.profile_id = p.id
      ) as has_barber_record,
      exists (
        select 1
        from public.shops s
        where s.owner_profile_id = p.id
      ) as has_owned_shop_record
    from public.profiles p
  ),
  eligible_profiles as (
    select
      profile_id,
      old_role,
      case
        when old_role = 'client' and has_client_record then 'client_user'
        when old_role = 'booth_rent_barber' and has_barber_record then 'barber_user'
        when old_role = 'commission_barber' and has_barber_record then 'barber_user'
        when old_role = 'owner' and has_owned_shop_record then 'shop_owner_user'
      end as new_role
    from profile_role_inputs
    where (old_role = 'client' and has_client_record)
       or (old_role = 'booth_rent_barber' and has_barber_record)
       or (old_role = 'commission_barber' and has_barber_record)
       or (old_role = 'owner' and has_owned_shop_record)
  ),
  manual_review_profiles as (
    select profile_id, old_role
    from profile_role_inputs
    where old_role in ('front_desk', 'manager', 'platform_admin')
  ),
  no_op_profiles as (
    select profile_id, old_role
    from profile_role_inputs
    where old_role in ('client_user', 'barber_user', 'shop_owner_user')
  ),
  blocked_profiles as (
    select profile_id, old_role
    from profile_role_inputs
    where profile_id not in (select profile_id from eligible_profiles)
      and profile_id not in (select profile_id from manual_review_profiles)
      and profile_id not in (select profile_id from no_op_profiles)
  ),
  approval_packet_counts as (
    select
      (select count(*) from profile_role_inputs) as total_profiles_inspected,
      (select count(*) from eligible_profiles) as eligible_count,
      (select count(*) from blocked_profiles) as blocked_count,
      (select count(*) from manual_review_profiles) as manual_review_count,
      (select count(*) from no_op_profiles) as no_op_count,
      (
        (select count(*) from eligible_profiles)
        + (select count(*) from blocked_profiles)
        + (select count(*) from manual_review_profiles)
      ) as affected_count
  )
  select
    total_profiles_inspected,
    eligible_count,
    blocked_count,
    manual_review_count,
    no_op_count,
    affected_count
  into
    v_total_profiles_inspected,
    v_eligible_count,
    v_blocked_count,
    v_manual_review_count,
    v_no_op_count,
    v_affected_count
  from approval_packet_counts;

  if v_total_profiles_inspected <> v_expected_total_profiles_inspected then
    raise exception 'PR29 role normalization aborted: expected % total profiles inspected, found %.',
      v_expected_total_profiles_inspected,
      v_total_profiles_inspected;
  end if;

  if v_eligible_count <> v_expected_eligible_count then
    raise exception 'PR29 role normalization aborted: expected % eligible rows, found %.',
      v_expected_eligible_count,
      v_eligible_count;
  end if;

  if v_blocked_count <> v_expected_blocked_count then
    raise exception 'PR29 role normalization aborted: expected % blocked rows, found %.',
      v_expected_blocked_count,
      v_blocked_count;
  end if;

  if v_manual_review_count <> v_expected_manual_review_count then
    raise exception 'PR29 role normalization aborted: expected % manual-review rows, found %.',
      v_expected_manual_review_count,
      v_manual_review_count;
  end if;

  if v_no_op_count <> v_expected_no_op_count then
    raise exception 'PR29 role normalization aborted: expected % no-op rows, found %.',
      v_expected_no_op_count,
      v_no_op_count;
  end if;

  if v_affected_count <> v_expected_affected_count then
    raise exception 'PR29 role normalization aborted: expected % affected rows, found %.',
      v_expected_affected_count,
      v_affected_count;
  end if;

  if exists (
    with profile_role_inputs as (
      select
        p.id as profile_id,
        nullif(btrim(coalesce(p.role::text, '')), '') as old_role,
        exists (select 1 from public.clients c where c.profile_id = p.id) as has_client_record,
        exists (select 1 from public.barbers b where b.profile_id = p.id) as has_barber_record,
        exists (select 1 from public.shops s where s.owner_profile_id = p.id) as has_owned_shop_record
      from public.profiles p
    ),
    eligible_profiles as (
      select
        profile_id,
        old_role,
        case
          when old_role = 'client' and has_client_record then 'client_user'
          when old_role = 'booth_rent_barber' and has_barber_record then 'barber_user'
          when old_role = 'commission_barber' and has_barber_record then 'barber_user'
          when old_role = 'owner' and has_owned_shop_record then 'shop_owner_user'
        end as new_role
      from profile_role_inputs
      where (old_role = 'client' and has_client_record)
         or (old_role = 'booth_rent_barber' and has_barber_record)
         or (old_role = 'commission_barber' and has_barber_record)
         or (old_role = 'owner' and has_owned_shop_record)
    )
    select 1
    from eligible_profiles
    where old_role in ('front_desk', 'manager', 'platform_admin')
       or coalesce(new_role, '') not in ('client_user', 'barber_user', 'shop_owner_user')
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
  with profile_role_inputs as (
    select
      p.id as profile_id,
      nullif(btrim(coalesce(p.role::text, '')), '') as old_role,
      exists (select 1 from public.clients c where c.profile_id = p.id) as has_client_record,
      exists (select 1 from public.barbers b where b.profile_id = p.id) as has_barber_record,
      exists (select 1 from public.shops s where s.owner_profile_id = p.id) as has_owned_shop_record
    from public.profiles p
  ),
  eligible_profiles as (
    select
      profile_id,
      old_role,
      case
        when old_role = 'client' and has_client_record then 'client_user'
        when old_role = 'booth_rent_barber' and has_barber_record then 'barber_user'
        when old_role = 'commission_barber' and has_barber_record then 'barber_user'
        when old_role = 'owner' and has_owned_shop_record then 'shop_owner_user'
      end as new_role
    from profile_role_inputs
    where (old_role = 'client' and has_client_record)
       or (old_role = 'booth_rent_barber' and has_barber_record)
       or (old_role = 'commission_barber' and has_barber_record)
       or (old_role = 'owner' and has_owned_shop_record)
  )
  select
    v_migration_key,
    profile_id,
    old_role,
    new_role,
    'approved eligible-only role normalization backup before profiles.role update'
  from eligible_profiles
  where new_role in ('client_user', 'barber_user', 'shop_owner_user')
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
      and nullif(btrim(coalesce(p.role::text, '')), '') = backup.old_role
      and backup.old_role in ('client', 'booth_rent_barber', 'commission_barber', 'owner')
      and backup.new_role in ('client_user', 'barber_user', 'shop_owner_user')
      and backup.new_role <> 'shop_owner';
  else
    update public.profiles p
    set role = backup.new_role::public.app_role
    from private.role_normalization_profile_backups backup
    where backup.migration_key = v_migration_key
      and backup.profile_id = p.id
      and nullif(btrim(coalesce(p.role::text, '')), '') = backup.old_role
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
--   and nullif(btrim(coalesce(p.role::text, '')), '') = backup.new_role;
-- commit;
