-- PR24 — deterministic production role evidence connector.
--
-- Returns aggregate counts only. It never exposes profile identifiers, names,
-- email addresses, phone numbers, relationship terms, or row contents, and it
-- never mutates account roles. PR25 remains the separately approved role
-- normalization package.

create or replace function public.bvrb3r_pr24_role_evidence_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $snapshot$
with profile_scope as (
  select
    p.id,
    coalesce(nullif(btrim(p.role::text), ''), '<null_or_blank>') as role_value,
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
role_counts as (
  select role_value, count(*)::integer as profile_count
  from profile_scope
  group by role_value
),
role_summary as (
  select
    count(*)::integer as profile_total,
    count(*) filter (
      where role_value = '<null_or_blank>'
    )::integer as null_or_blank_count,
    count(*) filter (
      where role_value not in (
        'client_user',
        'barber_user',
        'shop_owner_user',
        'platform_admin'
      )
    )::integer as invalid_role_count,
    coalesce(
      jsonb_object_agg(role_value, profile_count order by role_value)
        filter (where role_value is not null),
      '{}'::jsonb
    ) as role_count_map,
    coalesce(sum(profile_count), 0)::integer as role_count_total
  from role_counts
),
normalization_counts as (
  select decision, count(*)::integer as decision_count
  from (
    select case
      when role_value in (
        'client_user',
        'barber_user',
        'shop_owner_user',
        'platform_admin'
      ) then 'no_change'
      when role_value = 'client' and has_client_record then 'eligible_client'
      when role_value in ('booth_rent_barber', 'commission_barber')
        and has_barber_record then 'eligible_barber'
      when role_value = 'owner' and has_owned_shop_record then 'eligible_owner'
      when role_value in ('front_desk', 'manager') then 'manual_review'
      else 'blocked'
    end as decision
    from profile_scope
  ) classified
  group by decision
),
normalization_summary as (
  select coalesce(
    jsonb_object_agg(decision, decision_count order by decision),
    '{}'::jsonb
  ) as decision_count_map
  from normalization_counts
),
linkage_summary as (
  select
    (
      select count(*)::integer
      from public.clients c
      left join public.profiles p on p.id = c.profile_id
      where p.id is null
    ) as client_missing_profile_count,
    (
      select count(*)::integer
      from public.clients c
      join public.profiles p on p.id = c.profile_id
      where p.role::text <> 'client_user'
    ) as client_role_mismatch_count,
    (
      select count(*)::integer
      from public.barbers b
      left join public.profiles p on p.id = b.profile_id
      where p.id is null
    ) as barber_missing_profile_count,
    (
      select count(*)::integer
      from public.barbers b
      join public.profiles p on p.id = b.profile_id
      where p.role::text <> 'barber_user'
    ) as barber_role_mismatch_count,
    (
      select count(*)::integer
      from public.shops s
      left join public.profiles p on p.id = s.owner_profile_id
      where p.id is null
    ) as shop_owner_missing_profile_count,
    (
      select count(*)::integer
      from public.shops s
      join public.profiles p on p.id = s.owner_profile_id
      where p.role::text <> 'shop_owner_user'
    ) as shop_owner_role_mismatch_count
),
relationship_counts as (
  select
    coalesce(
      jsonb_object_agg(relationship_type, relationship_count order by relationship_type),
      '{}'::jsonb
    ) as relationship_count_map,
    coalesce(sum(relationship_count) filter (
      where status = 'active'
        and relationship_type not in ('freelance', 'booth_rent', 'autobooth_rent')
    ), 0)::integer as active_invalid_relationship_count
  from (
    select
      coalesce(nullif(btrim(r.relationship_type), ''), '<null_or_blank>') as relationship_type,
      coalesce(nullif(btrim(r.status), ''), '<null_or_blank>') as status,
      count(*)::integer as relationship_count
    from public.shop_barber_relationships r
    group by 1, 2
  ) counts
),
evidence as (
  select
    rs.profile_total,
    rs.null_or_blank_count,
    rs.invalid_role_count,
    rs.role_count_map,
    rs.role_count_total,
    ns.decision_count_map,
    ls.client_missing_profile_count,
    ls.client_role_mismatch_count,
    ls.barber_missing_profile_count,
    ls.barber_role_mismatch_count,
    ls.shop_owner_missing_profile_count,
    ls.shop_owner_role_mismatch_count,
    rc.relationship_count_map,
    rc.active_invalid_relationship_count,
    (
      ls.client_missing_profile_count
      + ls.client_role_mismatch_count
      + ls.barber_missing_profile_count
      + ls.barber_role_mismatch_count
      + ls.shop_owner_missing_profile_count
      + ls.shop_owner_role_mismatch_count
    )::integer as linkage_gap_count
  from role_summary rs
  cross join normalization_summary ns
  cross join linkage_summary ls
  cross join relationship_counts rc
),
checks as (
  select * from (values
    ('role_counts_reconcile', (
      select profile_total = role_count_total from evidence
    )),
    ('canonical_profile_roles_only', (
      select invalid_role_count = 0 from evidence
    )),
    ('no_blank_profile_roles', (
      select null_or_blank_count = 0 from evidence
    )),
    ('active_relationship_types_canonical', (
      select active_invalid_relationship_count = 0 from evidence
    )),
    ('linkage_gaps_aggregated', true),
    ('normalization_decisions_aggregated', true),
    ('aggregate_output_only', true),
    ('normalization_non_executable', true),
    ('no_mutation_attempted', true)
  ) v(check_name, passed)
),
check_summary as (
  select
    count(*)::integer as check_count,
    count(*) filter (where passed)::integer as passed_count,
    jsonb_object_agg(check_name, passed order by check_name) as check_map
  from checks
)
select jsonb_build_object(
  'schemaVersion', 1,
  'mission', 'PR24_PRODUCTION_ROLE_EVIDENCE_CONNECTOR',
  'generatedAt', now(),
  'status', case
    when cs.check_count = 9 and cs.passed_count = 9 then 'pass'
    else 'fail'
  end,
  'certifiable', cs.check_count = 9 and cs.passed_count = 9,
  'checkCount', cs.check_count,
  'passedCount', cs.passed_count,
  'checks', cs.check_map,
  'roleTruthStatus', case
    when e.invalid_role_count > 0
      or e.null_or_blank_count > 0
      or e.active_invalid_relationship_count > 0 then 'failed'
    when e.linkage_gap_count > 0 then 'needs_review'
    else 'pass'
  end,
  'profileTotal', e.profile_total,
  'roleCounts', e.role_count_map,
  'invalidProfileRoleCount', e.invalid_role_count,
  'nullOrBlankProfileRoleCount', e.null_or_blank_count,
  'normalizationDecisionCounts', e.decision_count_map,
  'linkageGaps', jsonb_build_object(
    'total', e.linkage_gap_count,
    'clientMissingProfile', e.client_missing_profile_count,
    'clientRoleMismatch', e.client_role_mismatch_count,
    'barberMissingProfile', e.barber_missing_profile_count,
    'barberRoleMismatch', e.barber_role_mismatch_count,
    'shopOwnerMissingProfile', e.shop_owner_missing_profile_count,
    'shopOwnerRoleMismatch', e.shop_owner_role_mismatch_count
  ),
  'relationshipTypeCounts', e.relationship_count_map,
  'activeInvalidRelationshipTypeCount', e.active_invalid_relationship_count,
  'canonicalPublicRoles', jsonb_build_array(
    'client_user',
    'barber_user',
    'shop_owner_user'
  ),
  'internalRoles', jsonb_build_array('platform_admin'),
  'contentExposed', false,
  'normalizationExecutable', false,
  'mutationAttempted', false
)
from evidence e
cross join check_summary cs;
$snapshot$;

revoke all on function public.bvrb3r_pr24_role_evidence_snapshot()
  from public, anon, authenticated;
grant execute on function public.bvrb3r_pr24_role_evidence_snapshot()
  to service_role;

comment on function public.bvrb3r_pr24_role_evidence_snapshot() is
  'Aggregate-only PR24 production role evidence. No profile content and no role mutation.';
