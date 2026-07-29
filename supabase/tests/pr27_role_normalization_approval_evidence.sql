-- PR27 approval evidence semantics.
begin;

do $$
declare
  v_idempotency_key constant uuid := '27000000-0000-4000-8000-000000000027';
  v_actor_user_id constant uuid := '27000000-0000-4000-8000-000000000001';
  v_commit_sha constant text := '5736864697adc35ac8c6b617d26fa6d3b0fb987c';
  v_before_fingerprint text;
  v_after_fingerprint text;
  v_first jsonb;
  v_replay jsonb;
  v_status jsonb;
begin
  select md5(coalesce(string_agg(
    p.id::text || ':' || coalesce(p.role::text, '__NULL__'),
    ',' order by p.id
  ), ''))
  into v_before_fingerprint
  from public.profiles p;

  select public.bvrb3r_pr27_record_role_normalization_approval_evidence(
    v_idempotency_key,
    'approved',
    v_actor_user_id,
    'platform_operator',
    v_commit_sha,
    'Founder-approved production role-normalization evidence test.'
  )
  into v_first;

  if coalesce((v_first ->> 'evidenceRecorded')::boolean, false) is not true
     or coalesce((v_first ->> 'idempotentReplay')::boolean, true) is not false
     or coalesce((v_first ->> 'executionEnabled')::boolean, true) is not false
     or coalesce((v_first ->> 'roleMutationExecuted')::boolean, true) is not false
     or coalesce((v_first ->> 'actorContentExposed')::boolean, true) is not false
  then
    raise exception 'PR27 first approval evidence write crossed its safety boundary.';
  end if;

  select public.bvrb3r_pr27_record_role_normalization_approval_evidence(
    v_idempotency_key,
    'approved',
    v_actor_user_id,
    'platform_operator',
    v_commit_sha,
    'Founder-approved production role-normalization evidence test.'
  )
  into v_replay;

  if coalesce((v_replay ->> 'idempotentReplay')::boolean, false) is not true then
    raise exception 'PR27 approval evidence replay was not idempotent.';
  end if;

  begin
    perform public.bvrb3r_pr27_record_role_normalization_approval_evidence(
      v_idempotency_key,
      'rejected',
      v_actor_user_id,
      'platform_operator',
      v_commit_sha,
      'Conflicting approval evidence must be rejected by the ledger.'
    );
    raise exception 'PR27 conflicting idempotency content unexpectedly succeeded.';
  exception
    when others then
      if sqlerrm not like '%idempotency key was reused with different content%' then
        raise;
      end if;
  end;

  select public.bvrb3r_pr27_role_normalization_approval_status()
  into v_status;

  if coalesce((v_status ->> 'approvalEvidencePresent')::boolean, false) is not true
     or coalesce((v_status ->> 'approvedCount')::integer, 0) < 1
     or coalesce((v_status ->> 'executionEnabled')::boolean, true) is not false
     or coalesce((v_status ->> 'roleMutationExecuted')::boolean, true) is not false
     or coalesce((v_status ->> 'actorContentExposed')::boolean, true) is not false
  then
    raise exception 'PR27 aggregate approval status did not certify the append-only evidence.';
  end if;

  begin
    update private.role_normalization_approval_evidence
    set reason = 'Attempted evidence mutation must fail.'
    where idempotency_key = v_idempotency_key;
    raise exception 'PR27 approval evidence update unexpectedly succeeded.';
  exception
    when others then
      if sqlerrm not like '%append-only%' then
        raise;
      end if;
  end;

  begin
    delete from private.role_normalization_approval_evidence
    where idempotency_key = v_idempotency_key;
    raise exception 'PR27 approval evidence delete unexpectedly succeeded.';
  exception
    when others then
      if sqlerrm not like '%append-only%' then
        raise;
      end if;
  end;

  select md5(coalesce(string_agg(
    p.id::text || ':' || coalesce(p.role::text, '__NULL__'),
    ',' order by p.id
  ), ''))
  into v_after_fingerprint
  from public.profiles p;

  if v_before_fingerprint is distinct from v_after_fingerprint then
    raise exception 'PR27 approval evidence changed profile roles.';
  end if;
end
$$;

rollback;
