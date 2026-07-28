-- PR #25 Role Normalization Migration / Plan
-- Status: plan only. This file may be inspected or used for an aggregate dry-run,
-- but no role mutation is enabled by this package.
-- Scope: public.profiles.role account identity normalization only.
-- Safety: no deletes, no RLS changes, no money movement, no guessed relationships.

-- Canonical public account roles:
--   client_user
--   barber_user
--   shop_owner_user
--
-- Automatic mappings are eligible only when relationship evidence exists:
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
-- Relationship truth remains outside profiles.role. This plan never creates or
-- guesses shop/barber relationships.

-- 1. Aggregate dry-run. This is the only active statement in this file.
with profile_role_inputs as (
  select
    p.id as profile_id,
    nullif(btrim(coalesce(p.role::text, '')), '') as old_role,
    exists (
      select 1 from public.clients c where c.profile_id = p.id
    ) as has_client_record,
    exists (
      select 1 from public.barbers b where b.profile_id = p.id
    ) as has_barber_record,
    exists (
      select 1 from public.shops s where s.owner_profile_id = p.id
    ) as has_owned_shop_record
  from public.profiles p
),
normalization_candidates as (
  select
    profile_id,
    old_role,
    case
      when old_role = 'client' and has_client_record then 'client_user'
      when old_role in ('booth_rent_barber', 'commission_barber') and has_barber_record then 'barber_user'
      when old_role = 'owner' and has_owned_shop_record then 'shop_owner_user'
      else null
    end as new_role,
    case
      when old_role in ('client_user', 'barber_user', 'shop_owner_user') then 'no_change'
      when old_role = 'client' and has_client_record then 'eligible'
      when old_role in ('booth_rent_barber', 'commission_barber') and has_barber_record then 'eligible'
      when old_role = 'owner' and has_owned_shop_record then 'eligible'
      when old_role in ('front_desk', 'manager', 'platform_admin') then 'manual_review'
      when old_role in ('client', 'booth_rent_barber', 'commission_barber', 'owner') then 'blocked_missing_linkage'
      when old_role is null then 'blocked_missing_role'
      else 'blocked_unsupported_role'
    end as plan_status
  from profile_role_inputs
)
select
  plan_status,
  old_role,
  new_role,
  count(*) as profile_count
from normalization_candidates
group by plan_status, old_role, new_role
order by plan_status, old_role, new_role;

-- 2. Private backup guidance. Keep commented until the later founder-approved
-- execution package. The existing private table is denied to public, anon, and
-- authenticated roles.
--
-- begin;
-- insert into private.role_normalization_profile_backups (
--   migration_key,
--   profile_id,
--   old_role,
--   new_role,
--   backup_reason
-- )
-- select
--   'pr29_approved_eligible_only_role_normalization',
--   p.id,
--   p.role::text,
--   case
--     when p.role::text = 'client' then 'client_user'
--     when p.role::text in ('booth_rent_barber', 'commission_barber') then 'barber_user'
--     when p.role::text = 'owner' then 'shop_owner_user'
--   end,
--   'approved eligible-only role normalization backup before profiles.role update'
-- from public.profiles p
-- where (p.role::text = 'client' and exists (
--          select 1 from public.clients c where c.profile_id = p.id
--       ))
--    or (p.role::text in ('booth_rent_barber', 'commission_barber') and exists (
--          select 1 from public.barbers b where b.profile_id = p.id
--       ))
--    or (p.role::text = 'owner' and exists (
--          select 1 from public.shops s where s.owner_profile_id = p.id
--       ))
-- on conflict (migration_key, profile_id) do nothing;
-- commit;

-- 3. Approved update body. Intentionally commented. PR #25 does not execute it.
--
-- begin;
-- update public.profiles p
-- set role = backup.new_role::public.app_role,
--     updated_at = now()
-- from private.role_normalization_profile_backups backup
-- where backup.migration_key = 'pr29_approved_eligible_only_role_normalization'
--   and backup.profile_id = p.id
--   and p.role::text = backup.old_role
--   and backup.old_role in ('client', 'booth_rent_barber', 'commission_barber', 'owner')
--   and backup.new_role in ('client_user', 'barber_user', 'shop_owner_user');
-- commit;

-- 4. Rollback plan. Requires the private backup rows from step 2 and remains
-- commented until a founder-approved rollback.
--
-- begin;
-- update public.profiles p
-- set role = backup.old_role::public.app_role,
--     updated_at = now()
-- from private.role_normalization_profile_backups backup
-- where backup.migration_key = 'pr29_approved_eligible_only_role_normalization'
--   and backup.profile_id = p.id
--   and p.role::text = backup.new_role;
-- commit;

-- 5. Audit plan.
-- The later execution package must persist aggregate counts, exact commit and
-- deployment evidence, founder approval, and rollback availability. It must not
-- expose profile identifiers, contact content, or private relationship content.
