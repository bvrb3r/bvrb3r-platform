-- Product PR26 — rent operations, line disputes, reconciled exports, and
-- read-only Architect monitor evidence.
--
-- PR22 remains the sole contribution ledger. This migration adds commands and
-- evidence around that ledger; it does not create a second rent calculator.

begin;

create schema if not exists rent_private;
revoke all on schema rent_private from public, anon, authenticated, service_role;
grant usage on schema rent_private to authenticated;

-- --------------------------------------------------------------------------
-- 1. Durable operational state.
-- --------------------------------------------------------------------------

create table if not exists public.rent_autopay_preferences (
  agreement_id uuid primary key references public.rent_agreements(id) on delete restrict,
  shop_id text not null references public.shops(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  enabled boolean not null default false,
  payment_method_reference text,
  version integer not null default 1 check (version > 0),
  enabled_at timestamptz,
  disabled_at timestamptz,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint rent_autopay_preferences_method_ck check (
    (enabled and length(btrim(coalesce(payment_method_reference, ''))) >= 3)
    or (not enabled)
  )
);

create index if not exists rent_autopay_preferences_shop_idx
  on public.rent_autopay_preferences (shop_id, updated_at desc);
create index if not exists rent_autopay_preferences_barber_idx
  on public.rent_autopay_preferences (barber_id, updated_at desc);

create table if not exists public.rent_payment_requests (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.rent_obligations(id) on delete restrict,
  agreement_id uuid not null references public.rent_agreements(id) on delete restrict,
  shop_id text not null references public.shops(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  payment_rail text not null check (payment_rail in ('card', 'barber_balance', 'cash')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'settled', 'failed', 'canceled', 'expired')),
  requested_cents integer not null check (requested_cents > 0),
  applied_cents integer not null check (applied_cents >= 0 and applied_cents <= requested_cents),
  provider_reference text,
  evidence_reference text,
  idempotency_key text not null unique,
  settled_contribution_id uuid references public.rent_contributions(id) on delete restrict,
  requested_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  settled_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rent_payment_requests_settlement_ck check (
    status <> 'settled'
    or (
      settled_at is not null
      and settled_contribution_id is not null
      and (
        payment_rail <> 'cash'
        or length(btrim(coalesce(evidence_reference, ''))) >= 3
      )
    )
  )
);

create index if not exists rent_payment_requests_obligation_idx
  on public.rent_payment_requests (obligation_id, created_at desc);
create index if not exists rent_payment_requests_shop_idx
  on public.rent_payment_requests (shop_id, created_at desc);
create index if not exists rent_payment_requests_barber_idx
  on public.rent_payment_requests (barber_id, created_at desc);
create index if not exists rent_payment_requests_settled_contribution_idx
  on public.rent_payment_requests (settled_contribution_id)
  where settled_contribution_id is not null;

create table if not exists public.rent_line_disputes (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null unique references public.rent_contributions(id) on delete restrict,
  obligation_id uuid not null references public.rent_obligations(id) on delete restrict,
  agreement_id uuid not null references public.rent_agreements(id) on delete restrict,
  shop_id text not null references public.shops(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  status text not null default 'open'
    check (status in ('open', 'under_review', 'released', 'reversed')),
  held_cents integer not null check (held_cents > 0),
  reapplied_cents integer not null default 0 check (reapplied_cents >= 0),
  returned_cents integer not null default 0 check (returned_cents >= 0),
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 3 and 500),
  submitted_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  resolved_by_profile_id uuid references public.profiles(id) on delete set null,
  resolution_reason text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rent_line_disputes_resolution_ck check (
    (status in ('open', 'under_review') and resolved_at is null)
    or (
      status in ('released', 'reversed')
      and resolved_at is not null
      and length(btrim(coalesce(resolution_reason, ''))) >= 3
      and reapplied_cents + returned_cents = held_cents
    )
  )
);

create index if not exists rent_line_disputes_obligation_idx
  on public.rent_line_disputes (obligation_id, status, created_at desc);
create index if not exists rent_line_disputes_shop_idx
  on public.rent_line_disputes (shop_id, status, created_at desc);
create index if not exists rent_line_disputes_barber_idx
  on public.rent_line_disputes (barber_id, status, created_at desc);
create index if not exists rent_line_disputes_resolver_idx
  on public.rent_line_disputes (resolved_by_profile_id)
  where resolved_by_profile_id is not null;

create table if not exists public.rent_lifecycle_requests (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.shop_barber_relationships(id) on delete restrict,
  obligation_id uuid references public.rent_obligations(id) on delete restrict,
  shop_id text not null references public.shops(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  request_type text not null check (request_type in ('change_terms', 'pause', 'leave', 'end')),
  status text not null default 'applied' check (status in ('pending', 'applied', 'rejected', 'canceled')),
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  proposed_terms jsonb not null default '{}'::jsonb,
  requested_effective_at timestamptz not null,
  remaining_cents_snapshot integer not null check (remaining_cents_snapshot >= 0),
  pending_cents_snapshot integer not null check (pending_cents_snapshot >= 0),
  held_cents_snapshot integer not null check (held_cents_snapshot >= 0),
  requested_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  previous_state jsonb not null default '{}'::jsonb,
  next_state jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists rent_lifecycle_requests_relationship_idx
  on public.rent_lifecycle_requests (relationship_id, created_at desc);
create index if not exists rent_lifecycle_requests_shop_idx
  on public.rent_lifecycle_requests (shop_id, created_at desc);
create index if not exists rent_lifecycle_requests_barber_idx
  on public.rent_lifecycle_requests (barber_id, created_at desc);
create index if not exists rent_lifecycle_requests_obligation_idx
  on public.rent_lifecycle_requests (obligation_id)
  where obligation_id is not null;

alter table public.rent_autopay_preferences enable row level security;
alter table public.rent_payment_requests enable row level security;
alter table public.rent_line_disputes enable row level security;
alter table public.rent_lifecycle_requests enable row level security;

revoke all on table public.rent_autopay_preferences from public, anon, authenticated;
revoke all on table public.rent_payment_requests from public, anon, authenticated;
revoke all on table public.rent_line_disputes from public, anon, authenticated;
revoke all on table public.rent_lifecycle_requests from public, anon, authenticated;

grant select on table public.rent_autopay_preferences to authenticated;
grant select on table public.rent_payment_requests to authenticated;
grant select on table public.rent_line_disputes to authenticated;
grant select on table public.rent_lifecycle_requests to authenticated;

grant all on table public.rent_autopay_preferences to service_role;
grant all on table public.rent_payment_requests to service_role;
grant all on table public.rent_line_disputes to service_role;
grant all on table public.rent_lifecycle_requests to service_role;

drop policy if exists rent_autopay_named_barber_select on public.rent_autopay_preferences;
create policy rent_autopay_named_barber_select
  on public.rent_autopay_preferences
  for select to authenticated
  using (private.pr22_is_barber(barber_id));

drop policy if exists rent_payment_requests_participant_select on public.rent_payment_requests;
create policy rent_payment_requests_participant_select
  on public.rent_payment_requests
  for select to authenticated
  using (
    private.pr22_is_barber(barber_id)
    or private.pr22_is_shop_owner(shop_id)
  );

drop policy if exists rent_line_disputes_participant_select on public.rent_line_disputes;
create policy rent_line_disputes_participant_select
  on public.rent_line_disputes
  for select to authenticated
  using (
    private.pr22_is_barber(barber_id)
    or private.pr22_is_shop_owner(shop_id)
  );

drop policy if exists rent_lifecycle_participant_select on public.rent_lifecycle_requests;
create policy rent_lifecycle_participant_select
  on public.rent_lifecycle_requests
  for select to authenticated
  using (
    private.pr22_is_barber(barber_id)
    or private.pr22_is_shop_owner(shop_id)
  );

-- PR26 lifecycle transitions use the existing immutable rent audit table.
alter table public.rent_actions_audit
  drop constraint if exists rent_actions_audit_action_type_check;
alter table public.rent_actions_audit
  add constraint rent_actions_audit_action_type_check check (action_type in (
    'agreement_created', 'agreement_accepted', 'agreement_activated', 'agreement_ended',
    'obligation_created',
    'rent_reminder_sent', 'payment_retry_requested', 'grace_applied', 'late_fee_applied',
    'obligation_waived', 'kiosk_paused', 'contribution_created', 'cash_settled',
    'contribution_reversed', 'release_certified',
    'autopay_enabled', 'autopay_disabled', 'rent_payment_requested',
    'rent_payment_settled', 'rent_line_disputed', 'rent_dispute_released',
    'rent_dispute_reversed', 'relationship_paused', 'relationship_left',
    'relationship_ended', 'agreement_change_requested'
  ));

-- --------------------------------------------------------------------------
-- 2. Agreement versioning: never change a rent period already in progress.
-- --------------------------------------------------------------------------

create or replace function rent_private.pr26_create_rent_agreement_version(
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_period_end date;
begin
  select max(o.period_end) into active_period_end
  from public.rent_obligations o
  where o.relationship_id = p_relationship_id
    and o.status not in ('waived', 'canceled')
    and current_date between o.period_start and o.period_end;

  if active_period_end is not null
     and p_effective_at < (active_period_end + 1)::timestamptz then
    raise exception using
      errcode = '23514',
      message = 'A rent change cannot take effect during a rent period already in progress.';
  end if;

  return private.pr22_create_rent_agreement(
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
end;
$$;

revoke all on function rent_private.pr26_create_rent_agreement_version(
  uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function rent_private.pr26_create_rent_agreement_version(
  uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz
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

revoke all on function public.pr26_create_rent_agreement_version(
  uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz
) from public, anon, service_role;
grant execute on function public.pr26_create_rent_agreement_version(
  uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz
) to authenticated;

-- --------------------------------------------------------------------------
-- 3. AutoPay and truthful payment requests.
-- --------------------------------------------------------------------------

create or replace function rent_private.pr26_set_rent_autopay(
  p_agreement_id uuid,
  p_enabled boolean,
  p_payment_method_reference text default null
)
returns public.rent_autopay_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  agreement_row public.rent_agreements%rowtype;
  prior_row public.rent_autopay_preferences%rowtype;
  updated_row public.rent_autopay_preferences%rowtype;
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into agreement_row
  from public.rent_agreements
  where id = p_agreement_id;

  if agreement_row.id is null
     or agreement_row.status not in ('accepted', 'active')
     or not private.pr22_is_barber(agreement_row.barber_id) then
    raise exception using errcode = '42501', message = 'Only the named barber can change AutoPay.';
  end if;

  if p_enabled and length(btrim(coalesce(p_payment_method_reference, ''))) < 3 then
    raise exception using errcode = '23514', message = 'AutoPay requires a saved payment method.';
  end if;

  select * into prior_row
  from public.rent_autopay_preferences
  where agreement_id = agreement_row.id
  for update;

  insert into public.rent_autopay_preferences (
    agreement_id,
    shop_id,
    barber_id,
    enabled,
    payment_method_reference,
    version,
    enabled_at,
    disabled_at,
    updated_by_profile_id,
    updated_at
  ) values (
    agreement_row.id,
    agreement_row.shop_id,
    agreement_row.barber_id,
    p_enabled,
    case when p_enabled then btrim(p_payment_method_reference) else prior_row.payment_method_reference end,
    coalesce(prior_row.version, 0) + 1,
    case when p_enabled then now() else prior_row.enabled_at end,
    case when p_enabled then null else now() end,
    actor_id,
    now()
  )
  on conflict (agreement_id) do update
  set enabled = excluded.enabled,
      payment_method_reference = excluded.payment_method_reference,
      version = excluded.version,
      enabled_at = excluded.enabled_at,
      disabled_at = excluded.disabled_at,
      updated_by_profile_id = excluded.updated_by_profile_id,
      updated_at = excluded.updated_at
  returning * into updated_row;

  insert into public.rent_actions_audit (
    agreement_id,
    shop_id,
    barber_id,
    actor_profile_id,
    actor_role,
    action_type,
    before_state,
    after_state
  ) values (
    agreement_row.id,
    agreement_row.shop_id,
    agreement_row.barber_id,
    actor_id,
    'barber',
    case when p_enabled then 'autopay_enabled' else 'autopay_disabled' end,
    coalesce(to_jsonb(prior_row), '{}'::jsonb),
    to_jsonb(updated_row) - 'payment_method_reference'
  );

  return updated_row;
end;
$$;

create or replace function rent_private.pr26_request_rent_payment(
  p_obligation_id uuid,
  p_payment_rail text,
  p_amount_cents integer,
  p_idempotency_key text
)
returns public.rent_payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  obligation_row public.rent_obligations%rowtype;
  existing_row public.rent_payment_requests%rowtype;
  inserted_row public.rent_payment_requests%rowtype;
  actor_id uuid := (select auth.uid());
  outstanding_cents integer;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_payment_rail not in ('card', 'barber_balance', 'cash')
     or coalesce(p_amount_cents, 0) <= 0
     or length(btrim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception using errcode = '23514', message = 'This rent payment request is invalid.';
  end if;

  select * into existing_row
  from public.rent_payment_requests
  where idempotency_key = p_idempotency_key;
  if existing_row.id is not null then
    return existing_row;
  end if;

  select * into obligation_row
  from public.rent_obligations
  where id = p_obligation_id
  for update;

  if obligation_row.id is null
     or obligation_row.status in ('funded', 'waived', 'canceled')
     or not private.pr22_is_barber(obligation_row.barber_id) then
    raise exception using errcode = '42501', message = 'Only the named barber can pay this rent obligation.';
  end if;

  outstanding_cents := greatest(
    obligation_row.base_rent_cents
      + obligation_row.late_fee_cents
      - obligation_row.amount_settled_cents,
    0
  );
  if outstanding_cents = 0 then
    raise exception using errcode = '23514', message = 'This rent obligation is already settled.';
  end if;

  insert into public.rent_payment_requests (
    obligation_id,
    agreement_id,
    shop_id,
    barber_id,
    payment_rail,
    requested_cents,
    applied_cents,
    idempotency_key,
    requested_by_profile_id
  ) values (
    obligation_row.id,
    obligation_row.agreement_id,
    obligation_row.shop_id,
    obligation_row.barber_id,
    p_payment_rail,
    p_amount_cents,
    least(p_amount_cents, outstanding_cents),
    btrim(p_idempotency_key),
    actor_id
  )
  returning * into inserted_row;

  insert into public.rent_actions_audit (
    agreement_id,
    obligation_id,
    shop_id,
    barber_id,
    actor_profile_id,
    actor_role,
    action_type,
    after_state,
    idempotency_key
  ) values (
    inserted_row.agreement_id,
    inserted_row.obligation_id,
    inserted_row.shop_id,
    inserted_row.barber_id,
    actor_id,
    'barber',
    'rent_payment_requested',
    to_jsonb(inserted_row),
    'audit:' || inserted_row.idempotency_key
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return inserted_row;
end;
$$;

create or replace function private.pr26_settle_rent_payment(
  p_request_id uuid,
  p_provider_reference text,
  p_evidence_reference text,
  p_idempotency_key text
)
returns public.rent_payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.rent_payment_requests%rowtype;
  updated_request public.rent_payment_requests%rowtype;
  obligation_row public.rent_obligations%rowtype;
  contribution_row public.rent_contributions%rowtype;
  remaining_cents integer;
  applied_value integer;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception using errcode = '23514', message = 'A stable settlement idempotency key is required.';
  end if;

  select * into request_row
  from public.rent_payment_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception using errcode = 'P0002', message = 'Rent payment request not found.';
  end if;
  if request_row.status = 'settled' then
    return request_row;
  end if;
  if request_row.status not in ('pending', 'processing') then
    raise exception using errcode = '23514', message = 'This rent payment request cannot settle.';
  end if;
  if request_row.payment_rail = 'cash'
     and length(btrim(coalesce(p_evidence_reference, ''))) < 3 then
    raise exception using errcode = '23514', message = 'Cash remains pending until a transfer reference is recorded.';
  end if;

  select * into obligation_row
  from public.rent_obligations
  where id = request_row.obligation_id
  for update;

  remaining_cents := greatest(
    obligation_row.base_rent_cents
      + obligation_row.late_fee_cents
      - obligation_row.amount_settled_cents,
    0
  );
  applied_value := least(request_row.applied_cents, remaining_cents);

  insert into public.rent_contributions (
    obligation_id,
    agreement_id,
    shop_id,
    barber_id,
    contribution_kind,
    status,
    provider_event_id,
    evidence_reference,
    idempotency_key,
    requested_cents,
    applied_cents,
    settled_at
  ) values (
    request_row.obligation_id,
    request_row.agreement_id,
    request_row.shop_id,
    request_row.barber_id,
    case when request_row.payment_rail = 'barber_balance' then 'autopay' else 'manual_payment' end,
    'settled',
    nullif(btrim(coalesce(p_provider_reference, '')), ''),
    nullif(btrim(coalesce(p_evidence_reference, '')), ''),
    btrim(p_idempotency_key),
    request_row.requested_cents,
    applied_value,
    now()
  )
  returning * into contribution_row;

  if applied_value > 0 then
    update public.rent_obligations
    set amount_settled_cents = amount_settled_cents + applied_value,
        status = case
          when amount_settled_cents + applied_value = base_rent_cents + late_fee_cents
            then 'funded'
          else 'partially_funded'
        end,
        funded_at = case
          when amount_settled_cents + applied_value = base_rent_cents + late_fee_cents
            then now()
          else null
        end,
        updated_at = now()
    where id = obligation_row.id;
  end if;

  update public.rent_payment_requests
  set status = 'settled',
      applied_cents = applied_value,
      provider_reference = nullif(btrim(coalesce(p_provider_reference, '')), ''),
      evidence_reference = nullif(btrim(coalesce(p_evidence_reference, '')), ''),
      settled_contribution_id = contribution_row.id,
      settled_at = now(),
      updated_at = now()
  where id = request_row.id
  returning * into updated_request;

  insert into public.rent_actions_audit (
    agreement_id,
    obligation_id,
    contribution_id,
    shop_id,
    barber_id,
    actor_role,
    action_type,
    before_state,
    after_state,
    idempotency_key
  ) values (
    updated_request.agreement_id,
    updated_request.obligation_id,
    contribution_row.id,
    updated_request.shop_id,
    updated_request.barber_id,
    'system',
    'rent_payment_settled',
    to_jsonb(request_row),
    to_jsonb(updated_request),
    'audit:' || btrim(p_idempotency_key)
  );

  return updated_request;
end;
$$;

-- --------------------------------------------------------------------------
-- 4. Line-only dispute holds and symmetric resolution.
-- --------------------------------------------------------------------------

create or replace function rent_private.pr26_dispute_rent_line(
  p_contribution_id uuid,
  p_reason text,
  p_evidence_reference text
)
returns public.rent_line_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  contribution_row public.rent_contributions%rowtype;
  obligation_row public.rent_obligations%rowtype;
  dispute_row public.rent_line_disputes%rowtype;
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3
     or length(btrim(coalesce(p_evidence_reference, ''))) < 3 then
    raise exception using errcode = '23514', message = 'A rent dispute requires a reason and evidence reference.';
  end if;

  select * into contribution_row
  from public.rent_contributions
  where id = p_contribution_id
  for update;

  if contribution_row.id is null
     or contribution_row.status <> 'settled'
     or contribution_row.contribution_kind = 'refund_reversal'
     or contribution_row.applied_cents <= 0
     or not private.pr22_is_barber(contribution_row.barber_id) then
    raise exception using errcode = '42501', message = 'Only the named barber can dispute this settled rent line.';
  end if;
  if exists (
    select 1
    from public.rent_line_disputes d
    where d.contribution_id = contribution_row.id
  ) then
    raise exception using errcode = '23514', message = 'This rent line already has a dispute record.';
  end if;

  select * into obligation_row
  from public.rent_obligations
  where id = contribution_row.obligation_id
  for update;

  update public.rent_obligations
  set amount_settled_cents = greatest(amount_settled_cents - contribution_row.applied_cents, 0),
      status = case
        when greatest(amount_settled_cents - contribution_row.applied_cents, 0) = 0
          then case when due_at < now() then 'overdue' else 'due' end
        else 'partially_funded'
      end,
      funded_at = null,
      updated_at = now()
  where id = obligation_row.id;

  insert into public.rent_line_disputes (
    contribution_id,
    obligation_id,
    agreement_id,
    shop_id,
    barber_id,
    held_cents,
    reason,
    evidence_reference,
    submitted_by_profile_id
  ) values (
    contribution_row.id,
    contribution_row.obligation_id,
    contribution_row.agreement_id,
    contribution_row.shop_id,
    contribution_row.barber_id,
    contribution_row.applied_cents,
    btrim(p_reason),
    btrim(p_evidence_reference),
    actor_id
  )
  returning * into dispute_row;

  insert into public.rent_actions_audit (
    agreement_id,
    obligation_id,
    contribution_id,
    shop_id,
    barber_id,
    actor_profile_id,
    actor_role,
    action_type,
    before_state,
    after_state
  ) values (
    contribution_row.agreement_id,
    contribution_row.obligation_id,
    contribution_row.id,
    contribution_row.shop_id,
    contribution_row.barber_id,
    actor_id,
    'barber',
    'rent_line_disputed',
    to_jsonb(obligation_row),
    jsonb_build_object(
      'dispute', to_jsonb(dispute_row),
      'obligationSettledCents', greatest(
        obligation_row.amount_settled_cents - contribution_row.applied_cents,
        0
      )
    )
  );

  return dispute_row;
end;
$$;

create or replace function private.pr26_resolve_rent_line_dispute(
  p_dispute_id uuid,
  p_resolution text,
  p_reason text,
  p_idempotency_key text
)
returns public.rent_line_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispute_row public.rent_line_disputes%rowtype;
  updated_row public.rent_line_disputes%rowtype;
  obligation_row public.rent_obligations%rowtype;
  contribution_row public.rent_contributions%rowtype;
  reversal_row public.rent_contributions%rowtype;
  remaining_cents integer;
  reapplied_value integer;
  returned_value integer;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;
  if p_resolution not in ('released', 'reversed')
     or length(btrim(coalesce(p_reason, ''))) < 3
     or length(btrim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception using errcode = '23514', message = 'This rent dispute resolution is invalid.';
  end if;

  select * into dispute_row
  from public.rent_line_disputes
  where id = p_dispute_id
  for update;

  if dispute_row.id is null then
    raise exception using errcode = 'P0002', message = 'Rent dispute not found.';
  end if;
  if dispute_row.status in ('released', 'reversed') then
    return dispute_row;
  end if;

  select * into obligation_row
  from public.rent_obligations
  where id = dispute_row.obligation_id
  for update;
  select * into contribution_row
  from public.rent_contributions
  where id = dispute_row.contribution_id
  for update;

  remaining_cents := greatest(
    obligation_row.base_rent_cents
      + obligation_row.late_fee_cents
      - obligation_row.amount_settled_cents,
    0
  );

  if p_resolution = 'released' then
    reapplied_value := least(dispute_row.held_cents, remaining_cents);
    returned_value := dispute_row.held_cents - reapplied_value;

    if reapplied_value > 0 then
      update public.rent_obligations
      set amount_settled_cents = amount_settled_cents + reapplied_value,
          status = case
            when amount_settled_cents + reapplied_value = base_rent_cents + late_fee_cents
              then 'funded'
            else 'partially_funded'
          end,
          funded_at = case
            when amount_settled_cents + reapplied_value = base_rent_cents + late_fee_cents
              then now()
            else null
          end,
          updated_at = now()
      where id = obligation_row.id;
    end if;
  else
    reapplied_value := 0;
    returned_value := dispute_row.held_cents;

    insert into public.rent_contributions (
      obligation_id,
      agreement_id,
      shop_id,
      barber_id,
      contribution_kind,
      status,
      provider_event_id,
      idempotency_key,
      requested_cents,
      applied_cents,
      reversal_of_contribution_id,
      settled_at
    ) values (
      contribution_row.obligation_id,
      contribution_row.agreement_id,
      contribution_row.shop_id,
      contribution_row.barber_id,
      'refund_reversal',
      'settled',
      'rent-dispute:' || dispute_row.id::text,
      btrim(p_idempotency_key),
      dispute_row.held_cents,
      dispute_row.held_cents,
      contribution_row.id,
      now()
    )
    returning * into reversal_row;
  end if;

  update public.rent_line_disputes
  set status = p_resolution,
      reapplied_cents = reapplied_value,
      returned_cents = returned_value,
      resolved_by_profile_id = auth.uid(),
      resolution_reason = btrim(p_reason),
      resolved_at = now(),
      updated_at = now()
  where id = dispute_row.id
  returning * into updated_row;

  insert into public.rent_actions_audit (
    agreement_id,
    obligation_id,
    contribution_id,
    shop_id,
    barber_id,
    actor_profile_id,
    actor_role,
    action_type,
    before_state,
    after_state,
    idempotency_key
  ) values (
    updated_row.agreement_id,
    updated_row.obligation_id,
    coalesce(reversal_row.id, updated_row.contribution_id),
    updated_row.shop_id,
    updated_row.barber_id,
    auth.uid(),
    'system',
    case when p_resolution = 'released' then 'rent_dispute_released' else 'rent_dispute_reversed' end,
    to_jsonb(dispute_row),
    to_jsonb(updated_row),
    'audit:' || btrim(p_idempotency_key)
  );

  return updated_row;
end;
$$;

-- --------------------------------------------------------------------------
-- 5. Settle-first relationship lifecycle.
-- --------------------------------------------------------------------------

create or replace function private.pr26_settle_first_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('active', 'suspended')
     and new.status = 'ended'
     and (
       exists (
         select 1
         from public.rent_obligations o
         where o.relationship_id = new.id
           and o.status not in ('funded', 'waived', 'canceled')
           and o.amount_settled_cents < o.base_rent_cents + o.late_fee_cents
       )
       or exists (
         select 1
         from public.rent_payment_requests p
         where p.obligation_id in (
           select o.id
           from public.rent_obligations o
           where o.relationship_id = new.id
         )
           and p.status in ('pending', 'processing')
       )
       or exists (
         select 1
         from public.rent_line_disputes d
         where d.obligation_id in (
           select o.id
           from public.rent_obligations o
           where o.relationship_id = new.id
         )
           and d.status in ('open', 'under_review')
       )
       or exists (
         select 1
         from public.booth_rent_charges c
         where c.relationship_id = new.id
           and c.status not in ('paid', 'waived', 'canceled')
           and c.amount_paid_cents < c.amount_cents
       )
     )
  then
    raise exception using
      errcode = '23514',
      message = 'Rent must settle to $0.00 before ending this relationship.';
  end if;
  return new;
end;
$$;

revoke all on function private.pr26_settle_first_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists pr25_settle_first_guard on public.shop_barber_relationships;
drop trigger if exists pr26_settle_first_guard on public.shop_barber_relationships;
create trigger pr26_settle_first_guard
  before update of status, ended_at on public.shop_barber_relationships
  for each row execute function private.pr26_settle_first_guard();

create or replace function private.pr26_chair_settle_first_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active
     and not new.active
     and old.assigned_barber_id is not null
     and exists (
       select 1
       from public.shop_barber_relationships r
       where r.shop_id = old.shop_id
         and r.location_id = old.location_id
         and r.barber_id = old.assigned_barber_id
         and r.status in ('active', 'suspended')
         and r.ended_at is null
         and (
           exists (
             select 1
             from public.rent_obligations o
             where o.relationship_id = r.id
               and o.status not in ('funded', 'waived', 'canceled')
               and o.amount_settled_cents < o.base_rent_cents + o.late_fee_cents
           )
           or exists (
             select 1
             from public.rent_payment_requests p
             join public.rent_obligations o on o.id = p.obligation_id
             where o.relationship_id = r.id
               and p.status in ('pending', 'processing')
           )
           or exists (
             select 1
             from public.rent_line_disputes d
             join public.rent_obligations o on o.id = d.obligation_id
             where o.relationship_id = r.id
               and d.status in ('open', 'under_review')
           )
           or exists (
             select 1
             from public.booth_rent_charges c
             where c.relationship_id = r.id
               and c.status not in ('paid', 'waived', 'canceled')
               and c.amount_paid_cents < c.amount_cents
           )
         )
     )
  then
    raise exception using
      errcode = '23514',
      message = 'Rent must settle to $0.00 before retiring this assigned chair.';
  end if;

  if old.active and not new.active then
    new.retired_at := coalesce(new.retired_at, now());
  elsif not old.active and new.active then
    new.retired_at := null;
    new.retired_by_profile_id := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.pr26_chair_settle_first_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists pr25_chair_retirement_guard on public.shop_chairs;
drop trigger if exists pr26_chair_settle_first_guard on public.shop_chairs;
create trigger pr26_chair_settle_first_guard
  before update of active on public.shop_chairs
  for each row execute function private.pr26_chair_settle_first_guard();

create or replace function rent_private.pr26_apply_relationship_lifecycle(
  p_relationship_id uuid,
  p_request_type text,
  p_reason text,
  p_effective_at timestamptz,
  p_idempotency_key text,
  p_proposed_terms jsonb default '{}'::jsonb
)
returns public.rent_lifecycle_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  relationship_row public.shop_barber_relationships%rowtype;
  membership_row public.staff_locations%rowtype;
  latest_obligation public.rent_obligations%rowtype;
  existing_row public.rent_lifecycle_requests%rowtype;
  inserted_row public.rent_lifecycle_requests%rowtype;
  actor_id uuid := (select auth.uid());
  actor_role_value text;
  remaining_value integer := 0;
  pending_value integer := 0;
  held_value integer := 0;
  legacy_remaining_value integer := 0;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_request_type not in ('change_terms', 'pause', 'leave', 'end')
     or length(btrim(coalesce(p_reason, ''))) < 3
     or length(btrim(coalesce(p_idempotency_key, ''))) < 8
     or p_effective_at is null
     or (
       p_request_type = 'change_terms'
       and (
         p_effective_at <= now()
         or jsonb_typeof(coalesce(p_proposed_terms, '{}'::jsonb)) <> 'object'
         or coalesce(p_proposed_terms, '{}'::jsonb) = '{}'::jsonb
       )
     )
     or (
       p_request_type <> 'change_terms'
       and (
         p_effective_at < now() - interval '1 minute'
         or p_effective_at > now() + interval '5 minutes'
       )
     ) then
    raise exception using errcode = '23514', message = 'This relationship lifecycle request is invalid.';
  end if;

  select * into existing_row
  from public.rent_lifecycle_requests
  where idempotency_key = p_idempotency_key;
  if existing_row.id is not null then
    return existing_row;
  end if;

  select * into relationship_row
  from public.shop_barber_relationships
  where id = p_relationship_id
    and status in ('active', 'suspended')
    and ended_at is null
  for update;

  if relationship_row.id is null then
    raise exception using errcode = 'P0002', message = 'Active shop relationship not found.';
  end if;
  if private.pr22_is_barber(relationship_row.barber_id) then
    actor_role_value := 'barber';
  elsif private.pr22_is_shop_owner(relationship_row.shop_id) then
    actor_role_value := 'shop_owner';
  else
    raise exception using errcode = '42501', message = 'Only the named barber or owner may change this relationship.';
  end if;

  perform 1
  from public.rent_obligations
  where relationship_id = relationship_row.id
  for update;

  select coalesce(sum(greatest(
    o.base_rent_cents + o.late_fee_cents - o.amount_settled_cents,
    0
  )), 0)::integer
  into remaining_value
  from public.rent_obligations o
  where o.relationship_id = relationship_row.id
    and o.status not in ('funded', 'waived', 'canceled');

  select coalesce(sum(p.applied_cents), 0)::integer
  into pending_value
  from public.rent_payment_requests p
  join public.rent_obligations o on o.id = p.obligation_id
  where o.relationship_id = relationship_row.id
    and p.status in ('pending', 'processing');

  select coalesce(sum(d.held_cents), 0)::integer
  into held_value
  from public.rent_line_disputes d
  join public.rent_obligations o on o.id = d.obligation_id
  where o.relationship_id = relationship_row.id
    and d.status in ('open', 'under_review');

  select coalesce(sum(greatest(c.amount_cents - c.amount_paid_cents, 0)), 0)::integer
  into legacy_remaining_value
  from public.booth_rent_charges c
  where c.relationship_id = relationship_row.id
    and c.status not in ('paid', 'waived', 'canceled');

  remaining_value := remaining_value + legacy_remaining_value;

  select * into latest_obligation
  from public.rent_obligations
  where relationship_id = relationship_row.id
    and status not in ('waived', 'canceled')
  order by period_end desc, created_at desc
  limit 1;

  if p_request_type <> 'change_terms'
     and (remaining_value > 0 or pending_value > 0 or held_value > 0) then
    raise exception using
      errcode = '23514',
      message = 'Rent must settle to $0.00 before this relationship can pause, leave, or end.';
  end if;

  select * into membership_row
  from public.staff_locations
  where id = relationship_row.staff_location_id
  for update;

  if p_request_type = 'change_terms' then
    null;
  elsif p_request_type = 'pause' then
    update public.shop_barber_relationships
    set status = 'suspended',
        updated_at = now()
    where id = relationship_row.id;

    if membership_row.id is not null then
      update public.staff_locations
      set relationship_status = 'paused',
          paused_at = now(),
          paused_by_profile_id = actor_id,
          pause_reason = btrim(p_reason),
          updated_at = now()
      where id = membership_row.id;
    end if;
  else
    update public.shop_barber_relationships
    set status = 'ended',
        ended_at = p_effective_at,
        updated_at = now()
    where id = relationship_row.id;

    if membership_row.id is not null then
      update public.staff_locations
      set relationship_status = 'ended',
          ended_at = p_effective_at,
          paused_at = null,
          paused_by_profile_id = null,
          pause_reason = null,
          updated_at = now()
      where id = membership_row.id;
    end if;
  end if;

  insert into public.rent_lifecycle_requests (
    relationship_id,
    obligation_id,
    shop_id,
    barber_id,
    request_type,
    status,
    reason,
    proposed_terms,
    requested_effective_at,
    remaining_cents_snapshot,
    pending_cents_snapshot,
    held_cents_snapshot,
    requested_by_profile_id,
    previous_state,
    next_state,
    idempotency_key
  ) values (
    relationship_row.id,
    latest_obligation.id,
    relationship_row.shop_id,
    relationship_row.barber_id,
    p_request_type,
    case when p_request_type = 'change_terms' then 'pending' else 'applied' end,
    btrim(p_reason),
    coalesce(p_proposed_terms, '{}'::jsonb),
    p_effective_at,
    remaining_value,
    pending_value,
    held_value,
    actor_id,
    to_jsonb(relationship_row),
    jsonb_build_object(
      'status', case
        when p_request_type = 'change_terms' then relationship_row.status
        when p_request_type = 'pause' then 'suspended'
        else 'ended'
      end,
      'effectiveAt', p_effective_at
    ),
    btrim(p_idempotency_key)
  )
  returning * into inserted_row;

  insert into public.rent_actions_audit (
    agreement_id,
    obligation_id,
    shop_id,
    barber_id,
    actor_profile_id,
    actor_role,
    action_type,
    reason,
    before_state,
    after_state,
    idempotency_key
  ) values (
    latest_obligation.agreement_id,
    latest_obligation.id,
    relationship_row.shop_id,
    relationship_row.barber_id,
    actor_id,
    actor_role_value,
    case
      when p_request_type = 'change_terms' then 'agreement_change_requested'
      when p_request_type = 'pause' then 'relationship_paused'
      when p_request_type = 'leave' then 'relationship_left'
      else 'relationship_ended'
    end,
    btrim(p_reason),
    to_jsonb(relationship_row),
    inserted_row.next_state,
    'audit:' || btrim(p_idempotency_key)
  );

  return inserted_row;
end;
$$;

-- --------------------------------------------------------------------------
-- 6. Public authenticated wrappers and narrow execution grants.
-- --------------------------------------------------------------------------

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

revoke all on function rent_private.pr26_set_rent_autopay(uuid, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function rent_private.pr26_request_rent_payment(uuid, text, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function private.pr26_settle_rent_payment(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function rent_private.pr26_dispute_rent_line(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.pr26_resolve_rent_line_dispute(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function rent_private.pr26_apply_relationship_lifecycle(uuid, text, text, timestamptz, text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function rent_private.pr26_set_rent_autopay(uuid, boolean, text)
  to authenticated;
grant execute on function rent_private.pr26_request_rent_payment(uuid, text, integer, text)
  to authenticated;
grant execute on function private.pr26_settle_rent_payment(uuid, text, text, text)
  to service_role;
grant execute on function rent_private.pr26_dispute_rent_line(uuid, text, text)
  to authenticated;
grant execute on function private.pr26_resolve_rent_line_dispute(uuid, text, text, text)
  to service_role;
grant execute on function rent_private.pr26_apply_relationship_lifecycle(uuid, text, text, timestamptz, text, jsonb)
  to authenticated;

revoke all on function public.pr26_set_rent_autopay(uuid, boolean, text)
  from public, anon, service_role;
revoke all on function public.pr26_request_rent_payment(uuid, text, integer, text)
  from public, anon, service_role;
revoke all on function public.pr26_dispute_rent_line(uuid, text, text)
  from public, anon, service_role;
revoke all on function public.pr26_apply_relationship_lifecycle(uuid, text, text, timestamptz, text, jsonb)
  from public, anon, service_role;

grant execute on function public.pr26_set_rent_autopay(uuid, boolean, text)
  to authenticated;
grant execute on function public.pr26_request_rent_payment(uuid, text, integer, text)
  to authenticated;
grant execute on function public.pr26_dispute_rent_line(uuid, text, text)
  to authenticated;
grant execute on function public.pr26_apply_relationship_lifecycle(uuid, text, text, timestamptz, text, jsonb)
  to authenticated;

-- Service-only functions are intentionally not exposed through public wrappers.
revoke all on function private.pr26_settle_rent_payment(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function private.pr26_resolve_rent_line_dispute(uuid, text, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
