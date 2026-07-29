-- PR 27: Production Role Normalization Approval Evidence
-- Append-only approval/rejection evidence. This migration cannot mutate profile roles.

create schema if not exists private;

create table if not exists private.role_normalization_approval_evidence (
  idempotency_key uuid primary key,
  plan_version text not null
    check (plan_version = 'role-normalization-v1'),
  decision text not null
    check (decision in ('approved', 'rejected')),
  actor_user_id uuid not null,
  actor_role text not null
    check (char_length(btrim(actor_role)) between 1 and 100),
  production_commit_sha text not null
    check (production_commit_sha ~ '^[0-9a-f]{40}$'),
  reason text not null
    check (char_length(btrim(reason)) between 8 and 1000),
  approval_packet jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint role_normalization_approval_packet_guard check (
    approval_packet ->> 'planVersion' = plan_version
    and approval_packet @> '{
      "approvalRequired": true,
      "executionEnabled": false,
      "rawMutationExecuted": false,
      "rowsIncluded": false,
      "profileContentExposed": false,
      "relationshipMutationAttempted": false,
      "canonicalOutputOnly": true,
      "rollbackPacketPresent": true,
      "certifiable": true
    }'::jsonb
  )
);

comment on table private.role_normalization_approval_evidence is
  'PR27 append-only production role-normalization approval evidence. Private actor and reason content never enters public output.';

revoke all on schema private from public, anon, authenticated;
revoke all on table private.role_normalization_approval_evidence
  from public, anon, authenticated, service_role;

create or replace function private.bvrb3r_pr27_reject_role_normalization_approval_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  raise exception 'PR27 role-normalization approval evidence is append-only.';
end;
$$;

revoke all on function private.bvrb3r_pr27_reject_role_normalization_approval_evidence_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists bvrb3r_pr27_role_normalization_approval_evidence_no_update_delete
  on private.role_normalization_approval_evidence;
create trigger bvrb3r_pr27_role_normalization_approval_evidence_no_update_delete
before update or delete on private.role_normalization_approval_evidence
for each row
execute function private.bvrb3r_pr27_reject_role_normalization_approval_evidence_mutation();

drop trigger if exists bvrb3r_pr27_role_normalization_approval_evidence_no_truncate
  on private.role_normalization_approval_evidence;
create trigger bvrb3r_pr27_role_normalization_approval_evidence_no_truncate
before truncate on private.role_normalization_approval_evidence
for each statement
execute function private.bvrb3r_pr27_reject_role_normalization_approval_evidence_mutation();

create or replace function public.bvrb3r_pr27_record_role_normalization_approval_evidence(
  p_idempotency_key uuid,
  p_decision text,
  p_actor_user_id uuid,
  p_actor_role text,
  p_production_commit_sha text,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_plan_version constant text := 'role-normalization-v1';
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_actor_role text := btrim(coalesce(p_actor_role, ''));
  v_production_commit_sha text := lower(btrim(coalesce(p_production_commit_sha, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_packet jsonb;
  v_evidence private.role_normalization_approval_evidence%rowtype;
  v_row_count integer := 0;
begin
  if p_idempotency_key is null then
    raise exception 'PR27 approval evidence requires an idempotency key.';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'PR27 approval evidence decision must be approved or rejected.';
  end if;

  if p_actor_user_id is null then
    raise exception 'PR27 approval evidence requires an authenticated actor.';
  end if;

  if char_length(v_actor_role) not between 1 and 100 then
    raise exception 'PR27 approval evidence actor role is invalid.';
  end if;

  if v_production_commit_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'PR27 approval evidence requires an exact production commit SHA.';
  end if;

  if char_length(v_reason) not between 8 and 1000 then
    raise exception 'PR27 approval evidence reason must contain 8 to 1000 characters.';
  end if;

  select public.bvrb3r_pr26_role_normalization_dry_run_packet()
  into v_packet;

  if coalesce((v_packet ->> 'certifiable')::boolean, false) is not true
     or coalesce((v_packet ->> 'approvalRequired')::boolean, false) is not true
     or coalesce((v_packet ->> 'executionEnabled')::boolean, true) is not false
     or coalesce((v_packet ->> 'rawMutationExecuted')::boolean, true) is not false
     or coalesce((v_packet ->> 'rowsIncluded')::boolean, true) is not false
     or coalesce((v_packet ->> 'profileContentExposed')::boolean, true) is not false
     or coalesce((v_packet ->> 'relationshipMutationAttempted')::boolean, true) is not false
     or coalesce((v_packet ->> 'canonicalOutputOnly')::boolean, false) is not true
     or coalesce((v_packet ->> 'rollbackPacketPresent')::boolean, false) is not true
     or v_packet ->> 'planVersion' is distinct from v_plan_version
  then
    raise exception 'PR27 approval evidence rejected a non-certifiable PR26 packet.';
  end if;

  insert into private.role_normalization_approval_evidence (
    idempotency_key,
    plan_version,
    decision,
    actor_user_id,
    actor_role,
    production_commit_sha,
    reason,
    approval_packet
  )
  values (
    p_idempotency_key,
    v_plan_version,
    v_decision,
    p_actor_user_id,
    v_actor_role,
    v_production_commit_sha,
    v_reason,
    v_packet
  )
  on conflict (idempotency_key) do nothing;

  get diagnostics v_row_count = row_count;

  select *
  into strict v_evidence
  from private.role_normalization_approval_evidence
  where idempotency_key = p_idempotency_key;

  if v_evidence.plan_version is distinct from v_plan_version
     or v_evidence.decision is distinct from v_decision
     or v_evidence.actor_user_id is distinct from p_actor_user_id
     or v_evidence.actor_role is distinct from v_actor_role
     or v_evidence.production_commit_sha is distinct from v_production_commit_sha
     or v_evidence.reason is distinct from v_reason
     or v_evidence.approval_packet is distinct from v_packet
  then
    raise exception 'PR27 approval evidence idempotency key was reused with different content.';
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'package', 'PR27_PRODUCTION_ROLE_NORMALIZATION_APPROVAL_EVIDENCE',
    'planVersion', v_evidence.plan_version,
    'evidenceRecorded', true,
    'idempotentReplay', v_row_count = 0,
    'decision', v_evidence.decision,
    'productionCommitSha', v_evidence.production_commit_sha,
    'recordedAt', v_evidence.recorded_at,
    'approvalRequired', true,
    'executionEnabled', false,
    'roleMutationExecuted', false,
    'actorContentExposed', false,
    'approvalPacket', v_evidence.approval_packet
  );
end;
$$;

create or replace function public.bvrb3r_pr27_role_normalization_approval_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with packet as (
    select public.bvrb3r_pr26_role_normalization_dry_run_packet() as value
  ),
  counts as (
    select
      count(*)::integer as evidence_count,
      count(*) filter (where decision = 'approved')::integer as approved_count,
      count(*) filter (where decision = 'rejected')::integer as rejected_count
    from private.role_normalization_approval_evidence
    where plan_version = 'role-normalization-v1'
  ),
  latest as (
    select
      decision,
      production_commit_sha,
      recorded_at
    from private.role_normalization_approval_evidence
    where plan_version = 'role-normalization-v1'
    order by recorded_at desc, idempotency_key desc
    limit 1
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'package', 'PR27_PRODUCTION_ROLE_NORMALIZATION_APPROVAL_EVIDENCE',
    'planVersion', 'role-normalization-v1',
    'approvalState', coalesce(latest.decision, 'pending'),
    'approvalEvidencePresent', counts.evidence_count > 0,
    'evidenceCount', counts.evidence_count,
    'approvedCount', counts.approved_count,
    'rejectedCount', counts.rejected_count,
    'latestDecision', latest.decision,
    'latestProductionCommitSha', latest.production_commit_sha,
    'latestRecordedAt', latest.recorded_at,
    'approvalRequired', true,
    'executionEnabled', false,
    'roleMutationExecuted', false,
    'actorContentExposed', false,
    'approvalPacket', packet.value
  )
  from counts
  cross join packet
  left join latest on true;
$$;

revoke all on function public.bvrb3r_pr27_record_role_normalization_approval_evidence(
  uuid, text, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.bvrb3r_pr27_record_role_normalization_approval_evidence(
  uuid, text, uuid, text, text, text
) to service_role;

revoke all on function public.bvrb3r_pr27_role_normalization_approval_status()
  from public, anon, authenticated;
grant execute on function public.bvrb3r_pr27_role_normalization_approval_status()
  to service_role;

comment on function public.bvrb3r_pr27_record_role_normalization_approval_evidence(
  uuid, text, uuid, text, text, text
) is 'PR27 service-only idempotent recorder for immutable role-normalization approval evidence. Does not enable or execute role mutation.';

comment on function public.bvrb3r_pr27_role_normalization_approval_status() is
  'PR27 service-only redacted aggregate approval status. Private actor and reason content is never returned.';
