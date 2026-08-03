begin;

-- Product PR26 — isolate authenticated implementations in a dedicated,
-- non-exposed schema. Public RPCs remain security-invoker functions, so the
-- exposed API contains no authenticated SECURITY DEFINER gateway.

create schema if not exists rent_private;
revoke all on schema rent_private from public, anon, authenticated, service_role;
grant usage on schema rent_private to authenticated;

do $move$
begin
  if to_regprocedure(
    'private.pr26_create_rent_agreement_version(uuid,text,integer,text,integer,integer,integer,text,jsonb,timestamptz)'
  ) is not null then
    alter function private.pr26_create_rent_agreement_version(
      uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz
    ) set schema rent_private;
  end if;
  if to_regprocedure(
    'private.pr26_set_rent_autopay(uuid,boolean,text)'
  ) is not null then
    alter function private.pr26_set_rent_autopay(uuid, boolean, text)
      set schema rent_private;
  end if;
  if to_regprocedure(
    'private.pr26_request_rent_payment(uuid,text,integer,text)'
  ) is not null then
    alter function private.pr26_request_rent_payment(uuid, text, integer, text)
      set schema rent_private;
  end if;
  if to_regprocedure(
    'private.pr26_dispute_rent_line(uuid,text,text)'
  ) is not null then
    alter function private.pr26_dispute_rent_line(uuid, text, text)
      set schema rent_private;
  end if;
  if to_regprocedure(
    'private.pr26_apply_relationship_lifecycle(uuid,text,text,timestamptz,text,jsonb)'
  ) is not null then
    alter function private.pr26_apply_relationship_lifecycle(
      uuid, text, text, timestamptz, text, jsonb
    ) set schema rent_private;
  end if;
end
$move$;

revoke all on function rent_private.pr26_create_rent_agreement_version(
  uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function rent_private.pr26_set_rent_autopay(uuid, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function rent_private.pr26_request_rent_payment(
  uuid, text, integer, text
) from public, anon, authenticated, service_role;
revoke all on function rent_private.pr26_dispute_rent_line(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function rent_private.pr26_apply_relationship_lifecycle(
  uuid, text, text, timestamptz, text, jsonb
) from public, anon, authenticated, service_role;

grant execute on function rent_private.pr26_create_rent_agreement_version(
  uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz
) to authenticated;
grant execute on function rent_private.pr26_set_rent_autopay(
  uuid, boolean, text
) to authenticated;
grant execute on function rent_private.pr26_request_rent_payment(
  uuid, text, integer, text
) to authenticated;
grant execute on function rent_private.pr26_dispute_rent_line(
  uuid, text, text
) to authenticated;
grant execute on function rent_private.pr26_apply_relationship_lifecycle(
  uuid, text, text, timestamptz, text, jsonb
) to authenticated;

create or replace function public.pr26_create_rent_agreement_version(
  p_relationship_id uuid,
  p_model text,
  p_rent_amount_cents integer,
  p_billing_frequency text,
  p_autobooth_basis_points integer,
  p_grace_hours integer,
  p_late_fee_cents integer,
  p_cash_settlement_method text,
  p_terms_snapshot jsonb,
  p_effective_at timestamptz
)
returns public.rent_agreements
language sql
security invoker
set search_path = ''
as $$
  select rent_private.pr26_create_rent_agreement_version(
    p_relationship_id,
    p_model,
    p_rent_amount_cents,
    p_billing_frequency,
    p_autobooth_basis_points,
    p_grace_hours,
    p_late_fee_cents,
    p_cash_settlement_method,
    p_terms_snapshot,
    p_effective_at
  );
$$;

create or replace function public.pr26_set_rent_autopay(
  p_agreement_id uuid,
  p_enabled boolean,
  p_payment_method_reference text default null
)
returns public.rent_autopay_preferences
language sql
security invoker
set search_path = ''
as $$
  select rent_private.pr26_set_rent_autopay(
    p_agreement_id,
    p_enabled,
    p_payment_method_reference
  );
$$;

create or replace function public.pr26_request_rent_payment(
  p_obligation_id uuid,
  p_payment_rail text,
  p_amount_cents integer,
  p_idempotency_key text
)
returns public.rent_payment_requests
language sql
security invoker
set search_path = ''
as $$
  select rent_private.pr26_request_rent_payment(
    p_obligation_id,
    p_payment_rail,
    p_amount_cents,
    p_idempotency_key
  );
$$;

create or replace function public.pr26_dispute_rent_line(
  p_contribution_id uuid,
  p_reason text,
  p_evidence_reference text
)
returns public.rent_line_disputes
language sql
security invoker
set search_path = ''
as $$
  select rent_private.pr26_dispute_rent_line(
    p_contribution_id,
    p_reason,
    p_evidence_reference
  );
$$;

create or replace function public.pr26_apply_relationship_lifecycle(
  p_relationship_id uuid,
  p_request_type text,
  p_reason text,
  p_effective_at timestamptz,
  p_idempotency_key text,
  p_proposed_terms jsonb default '{}'::jsonb
)
returns public.rent_lifecycle_requests
language sql
security invoker
set search_path = ''
as $$
  select rent_private.pr26_apply_relationship_lifecycle(
    p_relationship_id,
    p_request_type,
    p_reason,
    p_effective_at,
    p_idempotency_key,
    p_proposed_terms
  );
$$;

revoke all on function public.pr26_create_rent_agreement_version(
  uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz
) from public, anon, service_role;
revoke all on function public.pr26_set_rent_autopay(uuid, boolean, text)
  from public, anon, service_role;
revoke all on function public.pr26_request_rent_payment(
  uuid, text, integer, text
) from public, anon, service_role;
revoke all on function public.pr26_dispute_rent_line(uuid, text, text)
  from public, anon, service_role;
revoke all on function public.pr26_apply_relationship_lifecycle(
  uuid, text, text, timestamptz, text, jsonb
) from public, anon, service_role;

grant execute on function public.pr26_create_rent_agreement_version(
  uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz
) to authenticated;
grant execute on function public.pr26_set_rent_autopay(uuid, boolean, text)
  to authenticated;
grant execute on function public.pr26_request_rent_payment(
  uuid, text, integer, text
) to authenticated;
grant execute on function public.pr26_dispute_rent_line(uuid, text, text)
  to authenticated;
grant execute on function public.pr26_apply_relationship_lifecycle(
  uuid, text, text, timestamptz, text, jsonb
) to authenticated;

commit;
