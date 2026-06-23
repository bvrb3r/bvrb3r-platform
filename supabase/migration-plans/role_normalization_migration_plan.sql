-- PR #25 Role Normalization Migration Plan
-- Status: migration-ready plan only. Do not run against production until founder approval.
-- Scope: profiles.role account identity normalization only.
-- Safety: no deletes, no RLS changes, no payment/Stripe/refund/payout changes, no guessed relationships.

-- Canonical public account roles:
--   client_user
--   barber_user
--   shop_owner_user
--
-- Explicit automatic mappings, only when linkage evidence supports the mapping:
--   client -> client_user when public.clients.profile_id = profiles.id exists.
--   booth_rent_barber -> barber_user when public.barbers.profile_id = profiles.id exists.
--   commission_barber -> barber_user when public.barbers.profile_id = profiles.id exists.
--   owner -> shop_owner_user when public.shops.owner_profile_id = profiles.id exists.
--
-- Manual review / blocked:
--   front_desk
--   manager
--   platform_admin
--   any unsupported or null/empty role
--
-- Relationship note:
--   booth_rent_barber and commission_barber are account-role drift only.
--   booth_rent / commission relationship truth must stay in barber/shop relationship metadata.
--   This plan does not create guessed shop_barber_relationship rows.

-- 1. Dry-run affected row preview. This is safe to run before approval.
with normalization_candidates as (
  select
    p.id as profile_id,
    p.role::text as old_role,
    case
      when p.role::text = 'client' and c.profile_id is not null then 'client_user'
      when p.role::text in ('booth_rent_barber', 'commission_barber') and b.profile_id is not null then 'barber_user'
      when p.role::text = 'owner' and s.owner_profile_id is not null then 'shop_owner_user'
      else null
    end as new_role,
    case
      when p.role::text = 'client' and c.profile_id is not null then 'eligible'
      when p.role::text in ('booth_rent_barber', 'commission_barber') and b.profile_id is not null then 'eligible'
      when p.role::text = 'owner' and s.owner_profile_id is not null then 'eligible'
      when p.role::text in ('front_desk', 'manager', 'platform_admin') then 'manual_review'
      when p.role::text in ('client', 'booth_rent_barber', 'commission_barber', 'owner') then 'blocked_missing_linkage'
      when p.role is null or trim(p.role::text) = '' then 'blocked_missing_role'
      else 'blocked_unsupported_role'
    end as plan_status,
    (c.profile_id is not null) as has_client_record,
    (b.profile_id is not null) as has_barber_record,
    (s.owner_profile_id is not null) as has_owned_shop_record
  from public.profiles p
  left join public.clients c on c.profile_id = p.id
  left join public.barbers b on b.profile_id = p.id
  left join public.shops s on s.owner_profile_id = p.id
  where p.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
)
select
  plan_status,
  old_role,
  new_role,
  count(*) as profile_count
from normalization_candidates
group by plan_status, old_role, new_role
order by plan_status, old_role, new_role;

-- 2. Backup snapshot guidance. Run immediately before any approved UPDATE.
-- create table if not exists public.role_normalization_profile_backup_20260623 as
-- select
--   p.id as profile_id,
--   p.role::text as old_role,
--   p.primary_onboarding_role::text as old_primary_onboarding_role,
--   now() as backed_up_at,
--   'pr25_role_normalization_migration' as backup_reason
-- from public.profiles p
-- where p.role::text in ('client', 'booth_rent_barber', 'commission_barber', 'owner', 'front_desk', 'manager', 'platform_admin')
--    or p.role is null
--    or trim(p.role::text) = '';

-- 3. Approved migration body. Keep this commented until founder approval.
-- begin;
--
-- update public.profiles p
-- set role = 'client_user'::public.app_role
-- from public.clients c
-- where p.role::text = 'client'
--   and c.profile_id = p.id;
--
-- update public.profiles p
-- set role = 'barber_user'::public.app_role
-- from public.barbers b
-- where p.role::text in ('booth_rent_barber', 'commission_barber')
--   and b.profile_id = p.id;
--
-- update public.profiles p
-- set role = 'shop_owner_user'::public.app_role
-- from public.shops s
-- where p.role::text = 'owner'
--   and s.owner_profile_id = p.id;
--
-- -- Verification must show blocked/manual-review roles remain visible and no unsupported role was converted.
-- select p.role::text as role_value, count(*) as profile_count
-- from public.profiles p
-- group by p.role::text
-- order by role_value;
--
-- commit;

-- 4. Rollback plan. Requires the backup table from step 2.
-- begin;
--
-- update public.profiles p
-- set role = b.old_role::public.app_role
-- from public.role_normalization_profile_backup_20260623 b
-- where p.id = b.profile_id
--   and b.backup_reason = 'pr25_role_normalization_migration';
--
-- commit;

-- 5. Audit/logging plan.
-- If public.platform_events or public.platform_admin_audit_logs is available, insert one summary
-- event after approval and execution with aggregate counts only. Do not include private content.
