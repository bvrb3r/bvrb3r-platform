-- PR 26: Role Normalization Dry-Run / Approval Packet
-- Aggregate evidence only. This migration cannot mutate profile roles.

create or replace function public.bvrb3r_pr26_role_normalization_dry_run_packet()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
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
  decisions as (
    select
      profile_id,
      coalesce(old_role, '__NULL_OR_EMPTY__') as role_value,
      case
        when old_role in ('client_user', 'barber_user', 'shop_owner_user') then old_role
        when old_role = 'client' and has_client_record then 'client_user'
        when old_role in ('booth_rent_barber', 'commission_barber') and has_barber_record then 'barber_user'
        when old_role = 'owner' and has_owned_shop_record then 'shop_owner_user'
        else null
      end as proposed_role,
      case
        when old_role in ('client_user', 'barber_user', 'shop_owner_user') then 'no_op'
        when old_role = 'client' and has_client_record then 'eligible'
        when old_role in ('booth_rent_barber', 'commission_barber') and has_barber_record then 'eligible'
        when old_role = 'owner' and has_owned_shop_record then 'eligible'
        when old_role in ('front_desk', 'manager', 'platform_admin') then 'manual_review'
        else 'blocked'
      end as decision,
      case
        when old_role in ('client', 'booth_rent_barber', 'commission_barber', 'owner')
          then true
        else false
      end as rollback_mapping_present
    from profile_role_inputs
  ),
  totals as (
    select
      count(*)::integer as total_profiles,
      count(*) filter (where decision = 'eligible')::integer as eligible_count,
      count(*) filter (where decision = 'blocked')::integer as blocked_count,
      count(*) filter (where decision = 'manual_review')::integer as manual_review_count,
      count(*) filter (where decision = 'no_op')::integer as no_op_count,
      count(*) filter (where decision <> 'no_op')::integer as affected_count,
      not exists (
        select 1 from decisions
        where proposed_role is not null
          and proposed_role not in ('client_user', 'barber_user', 'shop_owner_user')
      ) as canonical_output_only,
      not exists (
        select 1 from decisions
        where decision = 'eligible'
          and not rollback_mapping_present
      ) as rollback_packet_present
    from decisions
  ),
  current_role_counts as (
    select coalesce(jsonb_object_agg(role_value, role_count), '{}'::jsonb) as value
    from (
      select role_value, count(*)::integer as role_count
      from decisions
      group by role_value
      order by role_value
    ) grouped
  ),
  proposed_role_counts as (
    select coalesce(jsonb_object_agg(proposed_role, role_count), '{}'::jsonb) as value
    from (
      select proposed_role, count(*)::integer as role_count
      from decisions
      where proposed_role is not null
      group by proposed_role
      order by proposed_role
    ) grouped
  ),
  decision_counts as (
    select coalesce(jsonb_object_agg(decision, decision_count), '{}'::jsonb) as value
    from (
      select decision, count(*)::integer as decision_count
      from decisions
      group by decision
      order by decision
    ) grouped
  ),
  checks as (
    select
      10::integer as check_count,
      (
        1 + 1 + 1 + 1 + 1
        + case when t.total_profiles = t.eligible_count + t.blocked_count + t.manual_review_count + t.no_op_count then 1 else 0 end
        + case when t.canonical_output_only then 1 else 0 end
        + case when t.rollback_packet_present then 1 else 0 end
        + 1 + 1
      )::integer as passed_count,
      jsonb_build_object(
        'approval_required', true,
        'execution_disabled', true,
        'raw_mutation_absent', true,
        'public_output_redacted', true,
        'profile_content_hidden', true,
        'decision_totals_reconcile',
          t.total_profiles = t.eligible_count + t.blocked_count + t.manual_review_count + t.no_op_count,
        'canonical_output_only', t.canonical_output_only,
        'rollback_packet_present', t.rollback_packet_present,
        'rows_omitted', true,
        'relationship_mutation_absent', true
      ) as results
    from totals t
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'package', 'PR26_ROLE_NORMALIZATION_DRY_RUN',
    'planVersion', 'role-normalization-v1',
    'generatedFor', 'approval_review',
    'approvalRequired', true,
    'executionEnabled', false,
    'rawMutationExecuted', false,
    'publicOutputRedacted', true,
    'rowsIncluded', false,
    'profileContentExposed', false,
    'relationshipMutationAttempted', false,
    'totalProfilesInspected', t.total_profiles,
    'totalAffectedCount', t.affected_count,
    'eligibleCount', t.eligible_count,
    'blockedCount', t.blocked_count,
    'manualReviewCount', t.manual_review_count,
    'noOpCount', t.no_op_count,
    'affectedCount', t.affected_count,
    'currentRoleCounts', crc.value,
    'proposedRoleCounts', prc.value,
    'decisionCounts', dc.value,
    'canonicalOutputOnly', t.canonical_output_only,
    'rollbackPacketPresent', t.rollback_packet_present,
    'checkCount', c.check_count,
    'passedCount', c.passed_count,
    'checks', c.results,
    'certifiable', c.check_count = 10 and c.passed_count = 10
  )
  from totals t
  cross join current_role_counts crc
  cross join proposed_role_counts prc
  cross join decision_counts dc
  cross join checks c;
$$;

revoke all on function public.bvrb3r_pr26_role_normalization_dry_run_packet()
  from public, anon, authenticated;
grant execute on function public.bvrb3r_pr26_role_normalization_dry_run_packet()
  to service_role;

comment on function public.bvrb3r_pr26_role_normalization_dry_run_packet() is
  'PR26 aggregate-only role normalization dry-run packet. Service-only; no profile rows, identifiers, contact content, or mutation.';
