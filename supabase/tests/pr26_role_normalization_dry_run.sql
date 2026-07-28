-- PR26 aggregate dry-run semantics.
begin;

do $$
declare
  packet jsonb;
begin
  select public.bvrb3r_pr26_role_normalization_dry_run_packet()
  into packet;

  if coalesce((packet ->> 'certifiable')::boolean, false) is not true then
    raise exception 'PR26 packet must be certifiable.';
  end if;

  if coalesce((packet ->> 'executionEnabled')::boolean, true) is not false
     or coalesce((packet ->> 'rawMutationExecuted')::boolean, true) is not false
     or coalesce((packet ->> 'rowsIncluded')::boolean, true) is not false
     or coalesce((packet ->> 'profileContentExposed')::boolean, true) is not false
  then
    raise exception 'PR26 packet crossed its read-only/redaction boundary.';
  end if;

  if packet -> 'currentRoleCounts' ? current_user then
    raise exception 'PR26 current role counts resolved the SQL session role instead of profile role evidence.';
  end if;

  if coalesce((packet ->> 'checkCount')::integer, 0) <> 10
     or coalesce((packet ->> 'passedCount')::integer, 0) <> 10
  then
    raise exception 'PR26 packet checks did not reconcile.';
  end if;
end
$$;

rollback;
