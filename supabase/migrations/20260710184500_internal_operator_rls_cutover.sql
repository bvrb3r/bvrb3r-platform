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
