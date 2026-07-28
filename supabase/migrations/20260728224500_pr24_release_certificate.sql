-- PR24 — deployment-bound production role evidence certification.
--
-- Stores only exact build identifiers and aggregate role evidence. No profile
-- identifiers, names, contact details, or relationship terms are persisted.

create table if not exists public.pr24_release_certificates (
  id uuid primary key default gen_random_uuid(),
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  deployment_id text not null check (length(btrim(deployment_id)) >= 3),
  evidence_snapshot jsonb not null,
  issued_by_role text not null default current_user,
  issued_at timestamptz not null default now(),
  unique (commit_sha, deployment_id),
  constraint pr24_release_certificates_nine_green_ck check (
    coalesce((evidence_snapshot ->> 'checkCount')::integer, 0) = 9
    and coalesce((evidence_snapshot ->> 'passedCount')::integer, 0) = 9
    and coalesce((evidence_snapshot ->> 'certifiable')::boolean, false)
    and evidence_snapshot ->> 'mission' =
      'PR24_PRODUCTION_ROLE_EVIDENCE_CONNECTOR'
    and coalesce((evidence_snapshot ->> 'contentExposed')::boolean, true) = false
    and coalesce(
      (evidence_snapshot ->> 'normalizationExecutable')::boolean,
      true
    ) = false
    and coalesce((evidence_snapshot ->> 'mutationAttempted')::boolean, true) =
      false
  )
);

alter table public.pr24_release_certificates enable row level security;
revoke all on table public.pr24_release_certificates
  from public, anon, authenticated;
grant all on table public.pr24_release_certificates to service_role;

create or replace function public.pr24_issue_release_certificate(
  p_commit_sha text,
  p_deployment_id text
)
returns public.pr24_release_certificates
language plpgsql
security definer
set search_path = ''
as $function$
declare
  snapshot jsonb;
  inserted_row public.pr24_release_certificates%rowtype;
  caller_role text := coalesce(auth.role(), current_user);
begin
  if caller_role <> 'service_role'
     and current_user <> 'postgres'
     and not private.is_internal_operator() then
    raise exception using
      errcode = '42501',
      message = 'Architect access required.';
  end if;

  if p_commit_sha is null
     or lower(p_commit_sha) !~ '^[0-9a-f]{40}$'
     or length(btrim(coalesce(p_deployment_id, ''))) < 3 then
    raise exception using
      errcode = '22023',
      message = 'Exact commit and deployment identifiers are required.';
  end if;

  snapshot := public.bvrb3r_pr24_role_evidence_snapshot();
  if not coalesce((snapshot ->> 'certifiable')::boolean, false)
     or coalesce((snapshot ->> 'checkCount')::integer, 0) <> 9
     or coalesce((snapshot ->> 'passedCount')::integer, 0) <> 9
     or coalesce((snapshot ->> 'contentExposed')::boolean, true)
     or coalesce((snapshot ->> 'normalizationExecutable')::boolean, true)
     or coalesce((snapshot ->> 'mutationAttempted')::boolean, true) then
    raise exception using
      errcode = '23514',
      message = 'All nine PR24 connector checks must pass without mutation.';
  end if;

  insert into public.pr24_release_certificates (
    commit_sha,
    deployment_id,
    evidence_snapshot,
    issued_by_role
  ) values (
    lower(p_commit_sha),
    btrim(p_deployment_id),
    snapshot,
    caller_role
  )
  on conflict (commit_sha, deployment_id)
  do update set
    evidence_snapshot = excluded.evidence_snapshot,
    issued_by_role = excluded.issued_by_role,
    issued_at = now()
  returning * into inserted_row;

  return inserted_row;
end;
$function$;

revoke all on function public.pr24_issue_release_certificate(text, text)
  from public, anon, authenticated;
grant execute on function public.pr24_issue_release_certificate(text, text)
  to service_role;

comment on table public.pr24_release_certificates is
  'Deployment-bound PR24 aggregate role evidence certificate; no profile content.';
