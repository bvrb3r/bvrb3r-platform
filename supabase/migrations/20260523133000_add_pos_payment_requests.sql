create table if not exists public.pos_payment_requests (
  id uuid primary key default gen_random_uuid(),
  pos_sale_id uuid not null references public.pos_sales(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  amount_cents integer not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  message_thread_id uuid references public.message_threads(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pos_payment_requests
  drop constraint if exists pos_payment_requests_status_ck,
  drop constraint if exists pos_payment_requests_amount_cents_ck;

alter table public.pos_payment_requests
  add constraint pos_payment_requests_status_ck
    check (status in ('pending', 'approved', 'declined', 'expired', 'paid', 'failed')),
  add constraint pos_payment_requests_amount_cents_ck
    check (amount_cents > 0);

create index if not exists pos_payment_requests_pos_sale_idx
  on public.pos_payment_requests (pos_sale_id, updated_at desc);

create index if not exists pos_payment_requests_client_status_idx
  on public.pos_payment_requests (client_id, status, requested_at desc);

create index if not exists pos_payment_requests_barber_status_idx
  on public.pos_payment_requests (barber_id, status, requested_at desc);
