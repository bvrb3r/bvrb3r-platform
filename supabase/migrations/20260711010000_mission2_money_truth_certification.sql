-- BVRB3R V1 MISSION 2
-- Money truth certification, release invariants, and explicit failed-payout disposition.
-- This migration does not call Stripe and does not create a charge, refund, transfer, reversal, or payout.

create table if not exists public.payout_execution_dispositions (
  execution_id uuid primary key references public.payout_executions(id) on delete restrict,
  disposition text not null,
  requires_money_action boolean not null default false,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  actor_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_execution_dispositions_disposition_ck check (
    disposition in (
      'closed_test_record',
      'retry_prohibited',
      'manual_review',
      'reversal_required',
      'processor_resolved'
    )
  )
);

comment on table public.payout_execution_dispositions is
  'Explicit, auditable disposition for failed payout executions. A disposition never moves money.';

alter table public.payout_execution_dispositions enable row level security;
revoke all on table public.payout_execution_dispositions from public, anon, authenticated;
grant all on table public.payout_execution_dispositions to service_role;

create index if not exists payout_execution_dispositions_disposition_idx
  on public.payout_execution_dispositions (disposition, updated_at desc);

create or replace function private.enforce_payment_routing_release_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments%rowtype;
  appointment_status text;
  appointment_reference text;
  pos_sale_status text;
  refund_total numeric := 0;
  has_active_dispute boolean := false;
  payment_captured boolean := false;
  payment_fully_refunded boolean := false;
  barber_account_ready boolean := false;
  shop_account_ready boolean := false;
  target_total numeric := 0;
  effective_gross numeric := 0;
  has_executed_transfer boolean := false;
begin
  select p.*
    into payment_row
  from public.payments p
  where p.id = new.payment_id;

  if not found then
    raise exception using errcode = '23514', message = 'Routing release requires a valid payment.';
  end if;

  if new.appointment_id is not null then
    select a.status::text, coalesce(a.reference_code, a.id::text)
      into appointment_status, appointment_reference
    from public.appointments a
    where a.id = new.appointment_id;
  end if;

  if new.pos_sale_id is not null then
    select ps.status::text
      into pos_sale_status
    from public.pos_sales ps
    where ps.id = new.pos_sale_id;
  end if;

  select coalesce(sum(rf.amount), 0)
    into refund_total
  from public.refunds rf
  where rf.payment_id = new.payment_id;

  payment_captured :=
    payment_row.payment_status in ('captured', 'partially_refunded')
    or lower(coalesce(payment_row.status, '')) in ('captured', 'succeeded', 'paid', 'completed', 'partially_refunded');

  payment_fully_refunded :=
    payment_row.payment_status = 'refunded'
    or lower(coalesce(payment_row.status, '')) in ('refunded', 'reversed')
    or refund_total >= payment_row.amount
    or new.refunded_amount >= new.provider_gross_amount;

  if appointment_reference is not null then
    select exists (
      select 1
      from public.disputes d
      where d.dispute_status in ('open', 'under_review', 'escalated')
        and d.appointment_reference in (appointment_reference, new.appointment_id::text)
    ) into has_active_dispute;
  end if;

  if payment_row.barber_id is not null then
    select exists (
      select 1
      from public.connected_accounts ca
      where ca.subject_type = 'barber'
        and ca.barber_id = payment_row.barber_id
        and ca.provider = 'stripe_connect'
        and ca.provider_account_id is not null
        and ca.payout_readiness_status = 'ready'
        and ca.charges_enabled
        and ca.payouts_enabled
        and ca.disabled_reason is null
        and jsonb_array_length(coalesce(ca.requirements_currently_due, '[]'::jsonb)) = 0
        and jsonb_array_length(coalesce(ca.requirements_past_due, '[]'::jsonb)) = 0
    ) into barber_account_ready;
  end if;

  if payment_row.shop_id is not null then
    select exists (
      select 1
      from public.connected_accounts ca
      where ca.subject_type = 'shop'
        and ca.shop_id = payment_row.shop_id
        and ca.provider = 'stripe_connect'
        and ca.provider_account_id is not null
        and ca.payout_readiness_status = 'ready'
        and ca.charges_enabled
        and ca.payouts_enabled
        and ca.disabled_reason is null
        and jsonb_array_length(coalesce(ca.requirements_currently_due, '[]'::jsonb)) = 0
        and jsonb_array_length(coalesce(ca.requirements_past_due, '[]'::jsonb)) = 0
    ) into shop_account_ready;
  end if;

  target_total := round((new.platform_fee_amount + new.barber_payout_amount + new.shop_split_amount)::numeric, 2);
  effective_gross := round(greatest(new.provider_gross_amount - new.refunded_amount, 0)::numeric, 2);

  if new.money_routing_status in ('pending', 'ready_for_payout', 'paid_out')
     and abs(target_total - effective_gross) > 0.01 then
    raise exception using errcode = '23514', message = 'Routing split does not reconcile to effective gross amount.';
  end if;

  if new.money_routing_status in ('ready_for_payout', 'paid_out') then
    if not payment_captured then
      raise exception using errcode = '23514', message = 'Uncaptured payment cannot become payout eligible.';
    end if;
    if payment_fully_refunded then
      raise exception using errcode = '23514', message = 'Fully refunded payment cannot become payout eligible.';
    end if;
    if new.appointment_id is not null and appointment_status <> 'completed' then
      raise exception using errcode = '23514', message = 'Appointment-backed payout requires completed service.';
    end if;
    if new.pos_sale_id is not null and pos_sale_status <> 'paid' then
      raise exception using errcode = '23514', message = 'POS-backed payout requires a paid sale.';
    end if;
    if has_active_dispute then
      raise exception using errcode = '23514', message = 'Active dispute blocks payout eligibility.';
    end if;
  end if;

  if new.payout_readiness_status = 'ready' then
    if not payment_captured or payment_fully_refunded or has_active_dispute then
      raise exception using errcode = '23514', message = 'Payout readiness requires captured, non-refunded, undisputed money.';
    end if;
    if new.appointment_id is not null and appointment_status <> 'completed' then
      raise exception using errcode = '23514', message = 'Payout readiness requires completed service.';
    end if;
    if new.payout_recipient_type = 'barber' and not barber_account_ready then
      raise exception using errcode = '23514', message = 'Barber payout readiness requires an eligible Stripe connected account.';
    end if;
    if new.payout_recipient_type = 'shop' and not shop_account_ready then
      raise exception using errcode = '23514', message = 'Shop payout readiness requires an eligible Stripe connected account.';
    end if;
    if new.payout_recipient_type = 'split' and (not barber_account_ready or not shop_account_ready) then
      raise exception using errcode = '23514', message = 'Split payout readiness requires eligible Barber and Shop connected accounts.';
    end if;
  end if;

  if payment_fully_refunded and new.payout_readiness_status = 'ready' then
    raise exception using errcode = '23514', message = 'Refunded routing cannot remain payout ready.';
  end if;

  if new.money_routing_status = 'refunded' then
    if new.payout_readiness_status <> 'blocked' then
      raise exception using errcode = '23514', message = 'Refunded routing must be payout blocked.';
    end if;
    if new.released_at is not null then
      raise exception using errcode = '23514', message = 'Refunded routing cannot retain a release timestamp.';
    end if;
  end if;

  if new.money_routing_status = 'paid_out' then
    select exists (
      select 1
      from public.payout_executions pe
      where pe.routing_record_id = new.id
        and pe.execution_type = 'transfer'
        and pe.execution_status = 'executed'
        and pe.processor_transfer_id is not null
    ) into has_executed_transfer;

    if new.payout_readiness_status <> 'ready' or not has_executed_transfer then
      raise exception using errcode = '23514', message = 'Paid-out routing requires payout readiness and an executed processor transfer.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_payment_routing_release_invariants() from public, anon, authenticated;

drop trigger if exists payment_routing_release_invariants on public.payment_routing_records;
create trigger payment_routing_release_invariants
before insert or update on public.payment_routing_records
for each row
execute function private.enforce_payment_routing_release_invariants();

create or replace function public.bvrb3r_v1_money_readiness_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with refund_totals as (
  select rf.payment_id, coalesce(sum(rf.amount), 0)::numeric as refund_total
  from public.refunds rf
  group by rf.payment_id
),
routing_context as (
  select
    r.id as routing_id,
    r.payment_id,
    r.appointment_id,
    r.pos_sale_id,
    r.routing_model,
    r.payout_recipient_type,
    r.provider_gross_amount,
    r.refunded_amount,
    r.platform_fee_amount,
    r.barber_payout_amount,
    r.shop_split_amount,
    r.payout_readiness_status,
    r.money_routing_status,
    r.reconciliation_status,
    r.processor_charge_id,
    r.released_at,
    r.reversed_at,
    p.amount as payment_amount,
    p.payment_status,
    p.payment_type,
    lower(coalesce(p.status, '')) as legacy_payment_status,
    p.barber_id,
    p.shop_id,
    a.status::text as appointment_status,
    coalesce(a.reference_code, a.id::text) as appointment_reference,
    ps.status::text as pos_sale_status,
    coalesce(rt.refund_total, 0) as refund_total,
    (
      p.payment_status in ('captured', 'partially_refunded')
      or lower(coalesce(p.status, '')) in ('captured', 'succeeded', 'paid', 'completed', 'partially_refunded')
    ) as payment_captured,
    (
      p.payment_status = 'refunded'
      or lower(coalesce(p.status, '')) in ('refunded', 'reversed')
      or coalesce(rt.refund_total, 0) >= p.amount
      or r.refunded_amount >= r.provider_gross_amount
    ) as payment_fully_refunded,
    exists (
      select 1
      from public.disputes d
      where d.dispute_status in ('open', 'under_review', 'escalated')
        and coalesce(a.reference_code, a.id::text) is not null
        and d.appointment_reference in (coalesce(a.reference_code, a.id::text), a.id::text)
    ) as active_dispute,
    exists (
      select 1
      from public.connected_accounts ca
      where ca.subject_type = 'barber'
        and ca.barber_id = p.barber_id
        and ca.provider = 'stripe_connect'
        and ca.provider_account_id is not null
        and ca.payout_readiness_status = 'ready'
        and ca.charges_enabled
        and ca.payouts_enabled
        and ca.disabled_reason is null
        and jsonb_array_length(coalesce(ca.requirements_currently_due, '[]'::jsonb)) = 0
        and jsonb_array_length(coalesce(ca.requirements_past_due, '[]'::jsonb)) = 0
    ) as barber_account_ready,
    exists (
      select 1
      from public.connected_accounts ca
      where ca.subject_type = 'shop'
        and ca.shop_id = p.shop_id
        and ca.provider = 'stripe_connect'
        and ca.provider_account_id is not null
        and ca.payout_readiness_status = 'ready'
        and ca.charges_enabled
        and ca.payouts_enabled
        and ca.disabled_reason is null
        and jsonb_array_length(coalesce(ca.requirements_currently_due, '[]'::jsonb)) = 0
        and jsonb_array_length(coalesce(ca.requirements_past_due, '[]'::jsonb)) = 0
    ) as shop_account_ready
  from public.payment_routing_records r
  join public.payments p on p.id = r.payment_id
  left join public.appointments a on a.id = r.appointment_id
  left join public.pos_sales ps on ps.id = r.pos_sale_id
  left join refund_totals rt on rt.payment_id = r.payment_id
),
metrics as (
  select
    (select count(*) from public.payments p
      left join public.payment_routing_records r on r.payment_id = p.id
      where r.id is null
        and p.payment_type in ('booking', 'tip', 'add_on', 'pos_sale')
        and (p.appointment_id is not null or p.pos_sale_id is not null)
        and (
          p.payment_status in ('captured', 'partially_refunded')
          or lower(coalesce(p.status, '')) in ('captured', 'succeeded', 'paid', 'completed', 'partially_refunded')
        )
    ) as successful_payment_missing_routing_count,
    count(*) filter (
      where payment_fully_refunded and payout_readiness_status = 'ready'
    ) as refunded_route_still_payout_ready_count,
    count(*) filter (
      where payment_fully_refunded and money_routing_status in ('ready_for_payout', 'paid_out')
    ) as refunded_route_still_releasable_count,
    count(*) filter (
      where appointment_status in ('cancelled', 'canceled')
        and payment_captured
        and not payment_fully_refunded
        and (payout_readiness_status = 'ready' or money_routing_status in ('ready_for_payout', 'paid_out'))
    ) as cancelled_captured_route_still_releasable_count,
    count(*) filter (
      where active_dispute
        and (payout_readiness_status = 'ready' or money_routing_status in ('ready_for_payout', 'paid_out'))
    ) as disputed_route_still_releasable_count,
    count(*) filter (
      where appointment_id is not null
        and appointment_status <> 'completed'
        and money_routing_status in ('ready_for_payout', 'paid_out')
    ) as incomplete_service_route_still_releasable_count,
    count(*) filter (
      where money_routing_status in ('pending', 'ready_for_payout', 'paid_out')
        and abs(
          round(greatest(provider_gross_amount - refunded_amount, 0)::numeric, 2)
          - round((platform_fee_amount + barber_payout_amount + shop_split_amount)::numeric, 2)
        ) > 0.01
    ) as routing_math_mismatch_count,
    count(*) filter (
      where payout_readiness_status = 'ready'
        and (
          (payout_recipient_type = 'barber' and not barber_account_ready)
          or (payout_recipient_type = 'shop' and not shop_account_ready)
          or (payout_recipient_type = 'split' and (not barber_account_ready or not shop_account_ready))
        )
    ) as ready_route_missing_recipient_account_count,
    count(*) filter (
      where payout_readiness_status = 'ready' and processor_charge_id is null
    ) as ready_route_missing_settlement_reference_count,
    (select count(*)
      from public.payout_executions pe
      left join public.payout_execution_dispositions pd on pd.execution_id = pe.id
      where pe.execution_status = 'failed' and pd.execution_id is null
    ) as failed_payout_without_disposition_count,
    (select count(*)
      from public.payout_executions pe
      join routing_context rc on rc.routing_id = pe.routing_record_id
      where pe.execution_status = 'executed'
        and (
          not rc.payment_captured
          or rc.payment_fully_refunded
          or rc.active_dispute
          or (rc.appointment_id is not null and rc.appointment_status <> 'completed')
        )
    ) as executed_payout_on_ineligible_route_count,
    (select count(*)
      from routing_context rc
      where rc.money_routing_status = 'paid_out'
        and not exists (
          select 1 from public.payout_executions pe
          where pe.routing_record_id = rc.routing_id
            and pe.execution_type = 'transfer'
            and pe.execution_status = 'executed'
            and pe.processor_transfer_id is not null
        )
    ) as paid_out_without_executed_transfer_count,
    (select count(*) from public.stripe_webhook_events swe where swe.processing_status = 'failed')
      as webhook_processing_failure_count,
    (select count(*) from (
      select appointment_id from public.payment_routing_records where appointment_id is not null group by appointment_id having count(*) > 1
      union all
      select pos_sale_id from public.payment_routing_records where pos_sale_id is not null group by pos_sale_id having count(*) > 1
    ) duplicate_groups) as duplicate_routing_business_object_count,
    case when exists (
      select 1
      from public.stripe_webhook_events swe
      where swe.livemode
        and swe.processing_status = 'processed'
        and swe.received_at >= now() - interval '30 days'
    ) then 0 else 1 end as recent_live_webhook_proof_missing_count,
    (select count(*) from public.stripe_webhook_events swe
      where swe.processing_status = 'processing'
        and swe.received_at < now() - interval '15 minutes'
    ) as stale_webhook_processing_count,
    (select count(*) from public.payout_execution_dispositions pd
      where pd.disposition in ('manual_review', 'reversal_required')
        and pd.requires_money_action
    ) as unresolved_manual_money_action_count,
    count(*) as routing_record_count,
    count(*) filter (where money_routing_status = 'ready_for_payout') as ready_for_payout_route_count,
    count(*) filter (where money_routing_status = 'paid_out') as paid_out_route_count,
    count(*) filter (where money_routing_status in ('blocked', 'manual_review')) as held_route_count,
    coalesce(sum(barber_payout_amount) filter (where money_routing_status = 'ready_for_payout'), 0) as barber_ready_amount,
    coalesce(sum(shop_split_amount) filter (where money_routing_status = 'ready_for_payout'), 0) as shop_ready_amount
  from routing_context
),
totals as (
  select
    (
      successful_payment_missing_routing_count
      + refunded_route_still_payout_ready_count
      + refunded_route_still_releasable_count
      + cancelled_captured_route_still_releasable_count
      + disputed_route_still_releasable_count
      + incomplete_service_route_still_releasable_count
      + routing_math_mismatch_count
      + ready_route_missing_recipient_account_count
      + failed_payout_without_disposition_count
      + executed_payout_on_ineligible_route_count
      + paid_out_without_executed_transfer_count
      + webhook_processing_failure_count
      + duplicate_routing_business_object_count
    ) as critical_total,
    (
      recent_live_webhook_proof_missing_count
      + stale_webhook_processing_count
      + ready_route_missing_settlement_reference_count
      + unresolved_manual_money_action_count
    ) as review_total,
    m.*
  from metrics m
)
select jsonb_build_object(
  'schema_version', 2,
  'generated_at', now(),
  'status', case
    when critical_total > 0 then 'fail'
    when review_total > 0 then 'needs_review'
    else 'pass'
  end,
  'critical', jsonb_build_object(
    'successful_payment_missing_routing_count', successful_payment_missing_routing_count,
    'refunded_route_still_payout_ready_count', refunded_route_still_payout_ready_count,
    'refunded_route_still_releasable_count', refunded_route_still_releasable_count,
    'cancelled_captured_route_still_releasable_count', cancelled_captured_route_still_releasable_count,
    'disputed_route_still_releasable_count', disputed_route_still_releasable_count,
    'incomplete_service_route_still_releasable_count', incomplete_service_route_still_releasable_count,
    'routing_math_mismatch_count', routing_math_mismatch_count,
    'ready_route_missing_recipient_account_count', ready_route_missing_recipient_account_count,
    'failed_payout_without_disposition_count', failed_payout_without_disposition_count,
    'executed_payout_on_ineligible_route_count', executed_payout_on_ineligible_route_count,
    'paid_out_without_executed_transfer_count', paid_out_without_executed_transfer_count,
    'webhook_processing_failure_count', webhook_processing_failure_count,
    'duplicate_routing_business_object_count', duplicate_routing_business_object_count
  ),
  'review', jsonb_build_object(
    'recent_live_webhook_proof_missing_count', recent_live_webhook_proof_missing_count,
    'stale_webhook_processing_count', stale_webhook_processing_count,
    'ready_route_missing_settlement_reference_count', ready_route_missing_settlement_reference_count,
    'unresolved_manual_money_action_count', unresolved_manual_money_action_count
  ),
  'operational', jsonb_build_object(
    'payment_count', (select count(*) from public.payments),
    'routing_record_count', routing_record_count,
    'refund_count', (select count(*) from public.refunds),
    'payout_execution_count', (select count(*) from public.payout_executions),
    'connected_account_count', (select count(*) from public.connected_accounts),
    'stripe_webhook_event_count', (select count(*) from public.stripe_webhook_events),
    'ready_for_payout_route_count', ready_for_payout_route_count,
    'paid_out_route_count', paid_out_route_count,
    'held_route_count', held_route_count,
    'barber_ready_amount', barber_ready_amount,
    'shop_ready_amount', shop_ready_amount
  ),
  'processor', jsonb_build_object(
    'latest_live_processed_webhook_at', (
      select max(swe.received_at) from public.stripe_webhook_events swe
      where swe.livemode and swe.processing_status = 'processed'
    ),
    'latest_processed_webhook_at', (
      select max(swe.received_at) from public.stripe_webhook_events swe
      where swe.processing_status = 'processed'
    ),
    'ready_connected_account_count', (
      select count(*) from public.connected_accounts ca
      where ca.payout_readiness_status = 'ready'
        and ca.provider_account_id is not null
        and ca.charges_enabled
        and ca.payouts_enabled
    )
  )
)
from totals;
$$;

revoke all on function public.bvrb3r_v1_money_readiness_snapshot() from public, anon, authenticated;
grant execute on function public.bvrb3r_v1_money_readiness_snapshot() to service_role;

create or replace function public.bvrb3r_v1_money_reconciliation_plan()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with refund_totals as (
  select payment_id, coalesce(sum(amount), 0)::numeric as refund_total
  from public.refunds
  group by payment_id
),
plan_rows as (
  select
    r.id as routing_record_id,
    r.payment_id,
    case
      when p.payment_status = 'refunded'
        or lower(coalesce(p.status, '')) in ('refunded', 'reversed')
        or coalesce(rt.refund_total, 0) >= p.amount
        or r.refunded_amount >= r.provider_gross_amount
        then 'block_or_reverse_refunded_route'
      when a.status::text in ('cancelled', 'canceled')
        and (p.payment_status in ('captured', 'partially_refunded') or lower(coalesce(p.status, '')) in ('captured', 'succeeded', 'paid', 'completed'))
        then 'hold_captured_cancelled_payment_for_refund_review'
      when exists (
        select 1 from public.disputes d
        where d.dispute_status in ('open', 'under_review', 'escalated')
          and d.appointment_reference in (coalesce(a.reference_code, a.id::text), a.id::text)
      ) then 'hold_route_for_active_dispute'
      when a.status::text = 'completed'
        and (p.payment_status in ('captured', 'partially_refunded') or lower(coalesce(p.status, '')) in ('captured', 'succeeded', 'paid', 'completed'))
        and r.money_routing_status = 'pending'
        then 'promote_completed_money_eligibility_after_full_validation'
      else null
    end as proposed_action
  from public.payment_routing_records r
  join public.payments p on p.id = r.payment_id
  left join public.appointments a on a.id = r.appointment_id
  left join refund_totals rt on rt.payment_id = r.payment_id
),
failed_execution_rows as (
  select pe.routing_record_id, pe.payment_id, 'classify_failed_payout_execution'::text as proposed_action
  from public.payout_executions pe
  left join public.payout_execution_dispositions pd on pd.execution_id = pe.id
  where pe.execution_status = 'failed' and pd.execution_id is null
),
combined as (
  select routing_record_id, payment_id, proposed_action from plan_rows where proposed_action is not null
  union all
  select routing_record_id, payment_id, proposed_action from failed_execution_rows
)
select jsonb_build_object(
  'schema_version', 1,
  'generated_at', now(),
  'mutation_performed', false,
  'action_count', count(*),
  'actions', coalesce(
    jsonb_agg(jsonb_build_object(
      'routing_record_id', routing_record_id,
      'payment_id', payment_id,
      'proposed_action', proposed_action
    ) order by proposed_action, routing_record_id),
    '[]'::jsonb
  )
)
from combined;
$$;

revoke all on function public.bvrb3r_v1_money_reconciliation_plan() from public, anon, authenticated;
grant execute on function public.bvrb3r_v1_money_reconciliation_plan() to service_role;

comment on function public.bvrb3r_v1_money_readiness_snapshot() is
  'Aggregate-only Mission 2 money certification. Returns no customer PII and performs no mutation.';
comment on function public.bvrb3r_v1_money_reconciliation_plan() is
  'Read-only Mission 2 reconciliation plan. It never calls Stripe and never moves money.';
