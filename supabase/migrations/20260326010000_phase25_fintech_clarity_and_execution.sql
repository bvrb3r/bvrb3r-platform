alter table public.points_transactions
  drop constraint if exists points_transactions_event_type_check;

alter table public.points_transactions
  add constraint points_transactions_event_type_check
  check (event_type in ('referral', 'booking', 'retention', 'campaign', 'cashout'));

create table if not exists public.billing_invoice_history (
  id text primary key,
  subscription_id text not null,
  client_id text null,
  provider_invoice_id text not null unique,
  provider_subscription_id text null,
  status text not null check (status in ('draft', 'open', 'paid', 'failed', 'void', 'uncollectible', 'past_due')),
  amount_due_cents integer not null default 0 check (amount_due_cents >= 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  currency text not null default 'usd',
  hosted_invoice_url text null,
  invoice_pdf_url text null,
  invoice_created_at timestamptz not null,
  invoice_due_at timestamptz null,
  paid_at timestamptz null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists billing_invoice_history_client_created_idx
  on public.billing_invoice_history (client_id, invoice_created_at desc)
  where client_id is not null;

create index if not exists billing_invoice_history_status_created_idx
  on public.billing_invoice_history (status, invoice_created_at desc);

create index if not exists billing_invoice_history_subscription_idx
  on public.billing_invoice_history (subscription_id, invoice_created_at desc);

alter table public.billing_invoice_history enable row level security;

drop policy if exists "billing invoice history client self read" on public.billing_invoice_history;
create policy "billing invoice history client self read"
  on public.billing_invoice_history
  for select
  using (
    client_id is not null
    and auth.uid()::text = client_id
  );
