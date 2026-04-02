alter table public.payment_routing_records
  add column if not exists processor_charge_id text,
  add column if not exists processor_balance_transaction_id text,
  add column if not exists reconciliation_status text not null default 'open',
  add column if not exists last_reconciled_at timestamptz;

alter table public.payment_routing_records
  drop constraint if exists payment_routing_reconciliation_status_ck;

alter table public.payment_routing_records
  add constraint payment_routing_reconciliation_status_ck
  check (reconciliation_status in ('open', 'settled', 'partially_reversed', 'reversed', 'manual_review'));

create index if not exists payment_routing_records_reconciliation_idx
  on public.payment_routing_records (reconciliation_status, updated_at desc);

create unique index if not exists payment_routing_records_processor_charge_uidx
  on public.payment_routing_records (processor_charge_id)
  where processor_charge_id is not null;

create table if not exists public.payout_executions (
  id uuid primary key default gen_random_uuid(),
  routing_record_id uuid not null references public.payment_routing_records(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  membership_id uuid references public.staff_locations(id) on delete set null,
  target_subject_type text not null check (target_subject_type in ('barber', 'shop')),
  execution_type text not null check (execution_type in ('transfer', 'reversal')),
  target_connected_account_id uuid references public.connected_accounts(id) on delete set null,
  target_provider_account_id text,
  amount numeric(10,2) not null default 0,
  currency text not null default 'usd',
  execution_status text not null default 'pending',
  blocked_reason text,
  failure_reason text,
  processor_transfer_id text,
  processor_reversal_id text,
  idempotency_key text not null,
  source_execution_id uuid references public.payout_executions(id) on delete set null,
  source_refund_id uuid references public.refunds(id) on delete set null,
  reconciliation_status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  initiated_by uuid references public.profiles(id) on delete set null,
  attempt_count integer not null default 0,
  last_attempted_at timestamptz,
  executed_at timestamptz,
  failed_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_executions_amount_ck check (amount >= 0),
  constraint payout_executions_currency_ck check (currency ~ '^[a-z]{3}$'),
  constraint payout_executions_status_ck check (execution_status in ('pending', 'blocked', 'executed', 'failed', 'reversed')),
  constraint payout_executions_reconciliation_ck check (reconciliation_status in ('open', 'settled', 'partially_reversed', 'reversed', 'manual_review')),
  constraint payout_executions_attempt_count_ck check (attempt_count >= 0)
);

create unique index if not exists payout_executions_idempotency_uidx
  on public.payout_executions (idempotency_key);

create unique index if not exists payout_executions_transfer_subject_uidx
  on public.payout_executions (routing_record_id, target_subject_type)
  where execution_type = 'transfer';

create unique index if not exists payout_executions_processor_transfer_uidx
  on public.payout_executions (processor_transfer_id)
  where processor_transfer_id is not null;

create unique index if not exists payout_executions_processor_reversal_uidx
  on public.payout_executions (processor_reversal_id)
  where processor_reversal_id is not null;

create index if not exists payout_executions_payment_idx
  on public.payout_executions (payment_id, created_at desc);

create index if not exists payout_executions_status_idx
  on public.payout_executions (execution_status, reconciliation_status, created_at desc);

create index if not exists payout_executions_connected_account_idx
  on public.payout_executions (target_connected_account_id, execution_status, updated_at desc);

alter table public.payout_executions enable row level security;

drop policy if exists "payout executions barber self select" on public.payout_executions;
drop policy if exists "payout executions management select" on public.payout_executions;

create policy "payout executions barber self select" on public.payout_executions
  for select using (
    exists (
      select 1
      from public.payments p
      join public.barbers b on b.id = p.barber_id
      where p.id = payout_executions.payment_id
        and b.profile_id = auth.uid()
    )
  );

create policy "payout executions management select" on public.payout_executions
  for select using (
    exists (
      select 1
      from public.payments p
      join public.staff_locations viewer_sl on viewer_sl.location_id = p.shop_id
      join public.profiles viewer_profile on viewer_profile.id = viewer_sl.profile_id
      where p.id = payout_executions.payment_id
        and viewer_profile.id = auth.uid()
        and viewer_profile.role in ('owner', 'manager')
    )
  );
