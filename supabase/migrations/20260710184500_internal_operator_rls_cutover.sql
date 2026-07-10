-- BVRB3R V1 BLOCKER-1C
-- Cut Architect/admin RLS authority over from public profile identity and
-- founder-email matching to the protected internal_operator_access model.

create or replace function private.is_booking_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_internal_operator();
$$;

revoke all on function private.is_booking_platform_admin() from public, anon, authenticated;
grant execute on function private.is_booking_platform_admin() to authenticated;

create or replace function private.rls_batch_4_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_internal_operator();
$$;

revoke all on function private.rls_batch_4_is_platform_admin() from public, anon, authenticated;
grant execute on function private.rls_batch_4_is_platform_admin() to authenticated;

create or replace function private.rls_batch_5_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_internal_operator();
$$;

revoke all on function private.rls_batch_5_is_platform_admin() from public, anon, authenticated;
grant execute on function private.rls_batch_5_is_platform_admin() to authenticated;

-- Preserve self-service behavior while replacing direct platform_admin profile
-- checks with the protected internal operator helper.
alter policy "notification preferences self manage"
on public.notification_preferences
using (
  profile_id = auth.uid()
  or user_email = coalesce(auth.jwt() ->> 'email', '')
  or private.is_internal_operator()
)
with check (
  profile_id = auth.uid()
  or user_email = coalesce(auth.jwt() ->> 'email', '')
  or private.is_internal_operator()
);

alter policy "Platform admins can read platform events"
on public.platform_events
using (private.is_internal_operator());

alter policy "privacy preferences self manage"
on public.privacy_preferences
using (profile_id = auth.uid() or private.is_internal_operator())
with check (profile_id = auth.uid() or private.is_internal_operator());

alter policy "user activity events self read"
on public.user_activity_events
using (actor_profile_id = auth.uid() or private.is_internal_operator());

alter policy "user app preferences self manage"
on public.user_app_preferences
using (profile_id = auth.uid() or private.is_internal_operator())
with check (profile_id = auth.uid() or private.is_internal_operator());

alter policy "user engagement edges self read"
on public.user_engagement_edges
using (
  actor_profile_id = auth.uid()
  or (
    edge_type = 'follow'
    and visibility = 'public'
    and status = 'active'
    and deleted_at is null
  )
  or private.is_internal_operator()
);

alter policy "user safety edges self read"
on public.user_safety_edges
using (actor_profile_id = auth.uid() or private.is_internal_operator());

-- Verification/compliance policies previously called a public, email-matching
-- SECURITY DEFINER function. Point them directly at protected operator truth.
alter policy "compliance_acceptances_select_platform_admin"
on public.compliance_acceptances
using (private.is_internal_operator());

alter policy "user_onboarding_states_select_platform_admin"
on public.user_onboarding_states
using (private.is_internal_operator());

alter policy "verification_documents_select_platform_admin"
on public.verification_documents
using (private.is_internal_operator());

alter policy "verification_profiles_select_platform_admin"
on public.verification_profiles
using (private.is_internal_operator());

alter policy "verification_provider_links_select_platform_admin"
on public.verification_provider_links
using (private.is_internal_operator());

alter policy "verification_reviews_select_platform_admin"
on public.verification_reviews
using (private.is_internal_operator());

-- No policy depends on this public helper after the cutover. Remove the
-- founder-email and legacy-role authorization surface entirely.
drop function if exists public.is_platform_admin_request();

-- The live identity readiness function must enforce the same three-role public
-- identity contract. Internal operator authority is measured separately and
-- must never make platform_admin look canonical in profiles.role.
create or replace function public.bvrb3r_v1_identity_readiness_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'auth'
as $$
with metrics as (
  select
    (select count(*) from public.profiles) as total_profiles,
    (
      select count(*)
      from public.profiles p
      left join auth.users u on u.id = p.id
      where u.id is null
    ) as profiles_without_auth_user,
    (
      select count(*)
      from public.profiles p
      where p.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
    ) as profiles_with_noncanonical_account_role,
    (
      select count(*)
      from public.barbers b
      left join public.profiles p on p.id = b.profile_id
      left join auth.users u on u.id = b.profile_id
      where b.app_approval_status::text = 'approved'
        and (p.id is null or u.id is null)
    ) as approved_barbers_without_live_identity,
    (
      select count(*)
      from public.barbers b
      where (b.is_bookable = true or b.is_discoverable = true)
        and (
          b.app_approval_status::text <> 'approved'
          or b.status <> 'active'
        )
    ) as exposed_barbers_not_approved_active,
    (
      select count(*)
      from public.barbers b
      left join public.profiles p on p.id = b.profile_id
      left join public.barber_profiles bp on bp.barber_reference = b.reference_code
      where b.is_discoverable = true
        and b.app_approval_status::text = 'approved'
        and b.status = 'active'
        and coalesce(
          nullif(trim(bp.username), ''),
          nullif(trim(b.booking_slug), ''),
          nullif(trim(p.public_username), '')
        ) is null
    ) as discoverable_barbers_without_public_username,
    (
      select count(*)
      from public.shops s
      left join public.profiles p on p.id = s.owner_profile_id
      left join auth.users u on u.id = s.owner_profile_id
      where s.app_approval_status::text = 'approved'
        and (
          s.owner_profile_id is null
          or p.id is null
          or u.id is null
        )
    ) as approved_shops_without_live_owner,
    (
      select count(*)
      from public.services svc
      left join public.barbers b on b.reference_code = svc.barber_reference
      left join auth.users u on u.id = b.profile_id
      where svc.service_owner_type::text = 'barber'
        and svc.active = true
        and svc.is_bookable = true
        and (
          b.id is null
          or u.id is null
          or b.app_approval_status::text <> 'approved'
          or b.status <> 'active'
          or b.is_bookable = false
        )
    ) as bookable_services_without_ready_barber,
    (
      select count(*)
      from public.shops s
      where s.app_approval_status::text = 'approved'
        and (
          s.public_username is null
          or trim(s.public_username) = ''
          or s.public_hours is null
          or s.policies is null
          or trim(s.policies) = ''
        )
    ) as approved_shops_with_incomplete_public_profile
)
select jsonb_build_object(
  'schema_version', 1,
  'generated_at', now(),
  'status', case
    when profiles_with_noncanonical_account_role > 0
      or approved_barbers_without_live_identity > 0
      or exposed_barbers_not_approved_active > 0
      or discoverable_barbers_without_public_username > 0
      or approved_shops_without_live_owner > 0
      or bookable_services_without_ready_barber > 0
      then 'fail'
    when profiles_without_auth_user > 0
      or approved_shops_with_incomplete_public_profile > 0
      then 'needs_review'
    else 'pass'
  end,
  'critical', jsonb_build_object(
    'profiles_with_noncanonical_account_role', profiles_with_noncanonical_account_role,
    'approved_barbers_without_live_identity', approved_barbers_without_live_identity,
    'exposed_barbers_not_approved_active', exposed_barbers_not_approved_active,
    'discoverable_barbers_without_public_username', discoverable_barbers_without_public_username,
    'approved_shops_without_live_owner', approved_shops_without_live_owner,
    'bookable_services_without_ready_barber', bookable_services_without_ready_barber
  ),
  'operational', jsonb_build_object(
    'total_profiles', total_profiles,
    'profiles_without_auth_user', profiles_without_auth_user,
    'approved_shops_with_incomplete_public_profile', approved_shops_with_incomplete_public_profile
  )
)
from metrics;
$$;

create or replace view public.v1_internal_operator_rls_evidence
with (security_invoker = true)
as
select
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%''platform_admin''%'
  ) as direct_platform_admin_policy_literal_reference_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) like '%''platform_admin''%'
  ) as legacy_platform_admin_function_literal_reference_count,
  to_regprocedure('public.is_platform_admin_request()') is not null as public_email_admin_helper_exists,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'is_booking_platform_admin',
        'rls_batch_4_is_platform_admin',
        'rls_batch_5_is_platform_admin'
      )
      and pg_get_functiondef(p.oid) like '%private.is_internal_operator()%'
  ) as protected_admin_wrapper_count,
  (
    select count(*)
    from public.internal_operator_access ioa
    where ioa.status = 'active'
      and ioa.access_level in ('architect_prime', 'operator')
  ) as active_full_operator_count;

comment on view public.v1_internal_operator_rls_evidence is
  'Fail-closed V1 evidence that database Architect authority uses protected internal operator truth.';

revoke all on table public.v1_internal_operator_rls_evidence from public, anon, authenticated;
grant select on table public.v1_internal_operator_rls_evidence to service_role;
