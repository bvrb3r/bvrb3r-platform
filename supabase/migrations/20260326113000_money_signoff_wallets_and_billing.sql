create table if not exists public.wallet_balances (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('barber', 'shop')),
  barber_id uuid references public.barbers(id) on delete cascade,
  shop_id uuid references public.locations(id) on delete cascade,
  currency text not null default 'usd',
  pending_balance numeric(12,2) not null default 0,
  available_balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint wallet_balances_currency_ck check (currency = lower(currency)),
  constraint wallet_balances_subject_reference_ck check (
    (subject_type = 'barber' and barber_id is not null and shop_id is null)
    or (subject_type = 'shop' and shop_id is not null and barber_id is null)
  )
);

create unique index if not exists wallet_balances_barber_uidx
  on public.wallet_balances (barber_id)
  where barber_id is not null;

create unique index if not exists wallet_balances_shop_uidx
  on public.wallet_balances (shop_id)
  where shop_id is not null;

create table if not exists public.wallet_transactions (
  id text primary key,
  subject_type text not null check (subject_type in ('barber', 'shop')),
  barber_id uuid references public.barbers(id) on delete cascade,
  shop_id uuid references public.locations(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  routing_record_id uuid references public.payment_routing_records(id) on delete set null,
  payout_execution_id uuid references public.payout_executions(id) on delete set null,
  refund_id uuid references public.refunds(id) on delete set null,
  booth_rent_ledger_id uuid references public.booth_rent_ledgers(id) on delete set null,
  transaction_type text not null check (
    transaction_type in (
      'payment_pending_credit',
      'payment_completion_release',
      'payment_adjustment',
      'payout_debit',
      'booth_rent_debit',
      'booth_rent_credit'
    )
  ),
  pending_delta numeric(12,2) not null default 0,
  available_delta numeric(12,2) not null default 0,
  currency text not null default 'usd',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint wallet_transactions_currency_ck check (currency = lower(currency)),
  constraint wallet_transactions_subject_reference_ck check (
    (subject_type = 'barber' and barber_id is not null and shop_id is null)
    or (subject_type = 'shop' and shop_id is not null and barber_id is null)
  )
);

create index if not exists wallet_transactions_barber_idx
  on public.wallet_transactions (barber_id, updated_at desc)
  where barber_id is not null;

create index if not exists wallet_transactions_shop_idx
  on public.wallet_transactions (shop_id, updated_at desc)
  where shop_id is not null;

create index if not exists wallet_transactions_payment_idx
  on public.wallet_transactions (payment_id, updated_at desc)
  where payment_id is not null;

alter table public.wallet_balances enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "wallet balances barber self select" on public.wallet_balances;
drop policy if exists "wallet balances management select" on public.wallet_balances;
drop policy if exists "wallet transactions barber self select" on public.wallet_transactions;
drop policy if exists "wallet transactions management select" on public.wallet_transactions;

create policy "wallet balances barber self select" on public.wallet_balances
  for select using (
    subject_type = 'barber'
    and exists (
      select 1
      from public.barbers b
      where b.id = wallet_balances.barber_id
        and b.profile_id = auth.uid()
    )
  );

create policy "wallet balances management select" on public.wallet_balances
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations manager_scope on manager_scope.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'manager'
        and (
          (wallet_balances.subject_type = 'shop' and manager_scope.location_id = wallet_balances.shop_id)
          or (
            wallet_balances.subject_type = 'barber'
            and exists (
              select 1
              from public.barbers b
              join public.staff_locations barber_scope on barber_scope.profile_id = b.profile_id
              where b.id = wallet_balances.barber_id
                and barber_scope.location_id = manager_scope.location_id
            )
          )
        )
    )
  );

create policy "wallet transactions barber self select" on public.wallet_transactions
  for select using (
    subject_type = 'barber'
    and exists (
      select 1
      from public.barbers b
      where b.id = wallet_transactions.barber_id
        and b.profile_id = auth.uid()
    )
  );

create policy "wallet transactions management select" on public.wallet_transactions
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations manager_scope on manager_scope.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'manager'
        and (
          (wallet_transactions.subject_type = 'shop' and manager_scope.location_id = wallet_transactions.shop_id)
          or (
            wallet_transactions.subject_type = 'barber'
            and exists (
              select 1
              from public.barbers b
              join public.staff_locations barber_scope on barber_scope.profile_id = b.profile_id
              where b.id = wallet_transactions.barber_id
                and barber_scope.location_id = manager_scope.location_id
            )
          )
        )
    )
  );

alter table public.payout_executions
  add column if not exists payout_reference text,
  add column if not exists payout_speed text not null default 'standard',
  add column if not exists instant_payout_fee_amount numeric(10,2) not null default 0,
  add column if not exists net_transfer_amount numeric(10,2) not null default 0,
  add column if not exists processor_payout_id text;

alter table public.payout_executions
  drop constraint if exists payout_executions_payout_speed_ck;

alter table public.payout_executions
  add constraint payout_executions_payout_speed_ck
  check (payout_speed in ('standard', 'instant'));

create index if not exists payout_executions_payout_reference_idx
  on public.payout_executions (payout_reference, updated_at desc)
  where payout_reference is not null;

create index if not exists payout_executions_processor_payout_idx
  on public.payout_executions (processor_payout_id, updated_at desc)
  where processor_payout_id is not null;

alter table public.booth_rent_ledgers
  add column if not exists shop_id uuid references public.locations(id) on delete cascade,
  add column if not exists paid_payment_id uuid references public.payments(id) on delete set null,
  add column if not exists wallet_debit_transaction_id text,
  add column if not exists wallet_credit_transaction_id text,
  add column if not exists last_attempted_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists booth_rent_ledgers_period_uidx
  on public.booth_rent_ledgers (barber_id, shop_id, period_label)
  where shop_id is not null;

create index if not exists booth_rent_ledgers_status_due_idx
  on public.booth_rent_ledgers (status, due_date desc, updated_at desc);

alter table public.billing_subscriptions
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_failed_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_retry_requested_at timestamptz;

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_plan_interval_check;

alter table public.billing_subscriptions
  add constraint billing_subscriptions_plan_interval_check
  check (plan_interval in ('weekly', 'monthly', 'annual', 'custom'));

update public.billing_subscriptions
set
  plan_code = case
    when subject_type = 'barber' then 'barber_core_weekly'
    when subject_type = 'shop' then 'shop_core_weekly'
    else plan_code
  end,
  plan_name = case
    when subject_type = 'barber' then 'Barber Core Weekly'
    when subject_type = 'shop' then 'Shop Core Weekly'
    else plan_name
  end,
  plan_interval = case
    when subject_type in ('barber', 'shop') then 'weekly'
    else plan_interval
  end,
  unit_amount_cents = case
    when subject_type = 'barber' then 1000
    when subject_type = 'shop' then 2000
    else unit_amount_cents
  end,
  updated_at = timezone('utc', now())
where subject_type in ('barber', 'shop');
