create table if not exists public.stripe_terminal_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts(id) on delete cascade,
  device_id_hash text not null,
  platform text not null check (platform in ('ios', 'android')),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  tap_to_pay_eligible boolean not null default false,
  app_version text,
  last_seen_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, device_id_hash)
);

alter table public.stripe_terminal_devices enable row level security;
comment on table public.stripe_terminal_devices is 'Private Barber device authorization for Stripe Terminal and Tap to Pay. Raw hardware identifiers and provider secrets are never stored.';

create index if not exists stripe_terminal_devices_barber_status_idx
  on public.stripe_terminal_devices (barber_id, status);

create table if not exists public.stripe_terminal_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  pos_sale_id uuid not null references public.pos_sales(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete set null,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  connected_account_id uuid not null references public.connected_accounts(id) on delete restrict,
  terminal_device_id uuid references public.stripe_terminal_devices(id) on delete set null,
  provider_payment_intent_id text not null unique,
  status text not null default 'created' check (status in ('created', 'collecting', 'processing', 'succeeded', 'failed', 'canceled')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  idempotency_key text not null unique,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  succeeded_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz
);

alter table public.stripe_terminal_payment_attempts enable row level security;
comment on table public.stripe_terminal_payment_attempts is 'Service-role-only Stripe Terminal attempt ledger. A successful SDK response is not final business truth until the signed webhook is processed.';

create index if not exists stripe_terminal_attempts_sale_status_idx
  on public.stripe_terminal_payment_attempts (pos_sale_id, status);
create index if not exists stripe_terminal_attempts_barber_created_idx
  on public.stripe_terminal_payment_attempts (barber_id, created_at desc);

revoke all on public.stripe_terminal_devices from anon, authenticated;
revoke all on public.stripe_terminal_payment_attempts from anon, authenticated;

grant all on public.stripe_terminal_devices to service_role;
grant all on public.stripe_terminal_payment_attempts to service_role;