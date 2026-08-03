-- Staging ledger version: 20260803073827.
-- Forward-only staging convergence after the combined PR31-PR39 advisor run.
begin;

revoke all on function public.pr39_nearby_marketplace(
  double precision, double precision, double precision, double precision,
  double precision, double precision, double precision, integer
) from public, anon, authenticated;
grant execute on function public.pr39_nearby_marketplace(
  double precision, double precision, double precision, double precision,
  double precision, double precision, double precision, integer
) to service_role;

revoke all on function public.pr34_dispute_balance_line(uuid, text)
  from public, anon, authenticated;
drop function public.pr34_dispute_balance_line(uuid, text);

create function public.pr34_dispute_balance_line(
  p_line_id uuid,
  p_reason text,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line public.billing_balance_lines%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_profile_id is null then
    raise exception 'Profile identity required';
  end if;
  if length(v_reason) < 10 or length(v_reason) > 1000 then
    raise exception 'Dispute reason must be between 10 and 1000 characters';
  end if;

  update public.billing_balance_lines
  set
    status = 'disputed',
    collection_paused = true,
    dispute_reason = v_reason,
    disputed_at = timezone('utc', now())
  where id = p_line_id
    and profile_id = p_profile_id
    and status = 'open'
    and amount_paid_cents < amount_cents
    and not exists (
      select 1
      from public.billing_payment_attempts as attempt
      where attempt.profile_id = p_profile_id
        and attempt.status in ('initializing', 'requires_payment', 'processing')
        and p_line_id = any(attempt.line_ids)
    )
  returning * into v_line;

  if v_line.id is null then
    raise exception 'Open balance line not found';
  end if;

  return jsonb_build_object(
    'lineId', v_line.id,
    'status', 'disputed',
    'collectionPaused', true
  );
end;
$$;

revoke all on function public.pr34_dispute_balance_line(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.pr34_dispute_balance_line(uuid, text, uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
