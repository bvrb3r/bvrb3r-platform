-- Disposable semantic proof for PR24. Aggregate evidence only; no role write.
begin;

do $proof$
declare
  before_snapshot jsonb;
  after_snapshot jsonb;
begin
  before_snapshot := public.bvrb3r_pr24_role_evidence_snapshot();
  after_snapshot := public.bvrb3r_pr24_role_evidence_snapshot();

  if before_snapshot->>'mission'
       <> 'PR24_PRODUCTION_ROLE_EVIDENCE_CONNECTOR'
     or before_snapshot->>'status' <> 'pass'
     or before_snapshot->>'certifiable' <> 'true'
     or (before_snapshot->>'checkCount')::integer <> 9
     or (before_snapshot->>'passedCount')::integer <> 9 then
    raise exception
      'PR24 connector certification failed: %',
      before_snapshot;
  end if;

  if before_snapshot->>'contentExposed' <> 'false'
     or before_snapshot->>'normalizationExecutable' <> 'false'
     or before_snapshot->>'mutationAttempted' <> 'false' then
    raise exception
      'PR24 connector crossed its read-only boundary: %',
      before_snapshot;
  end if;

  if before_snapshot->'roleCounts' is distinct from after_snapshot->'roleCounts'
     or before_snapshot->>'profileTotal'
       is distinct from after_snapshot->>'profileTotal'
     or before_snapshot->'normalizationDecisionCounts'
       is distinct from after_snapshot->'normalizationDecisionCounts'
     or before_snapshot->'linkageGaps'
       is distinct from after_snapshot->'linkageGaps' then
    raise exception
      'PR24 aggregate evidence changed during repeated read: before %, after %',
      before_snapshot,
      after_snapshot;
  end if;
end;
$proof$;

rollback;
