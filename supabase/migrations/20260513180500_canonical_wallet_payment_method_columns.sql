create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'square', 'manual', 'mock')),
  provider_customer_id text,
  provider_payment_method_id text not null,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  nickname text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_methods
  add column if not exists provider_customer_id text,
  add column if not exists provider_payment_method_id text,
  add column if not exists brand text,
  add column if not exists last4 text,
  add column if not exists exp_month integer,
  add column if not exists exp_year integer,
  add column if not exists nickname text,
  add column if not exists is_default boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists payment_methods_provider_payment_method_unique_idx
  on public.payment_methods (provider, provider_payment_method_id);

create index if not exists payment_methods_client_default_idx
  on public.payment_methods (client_id, is_default, created_at desc);

create unique index if not exists payment_methods_client_single_default_idx
  on public.payment_methods (client_id)
  where is_default;

alter table public.client_preferences
  add column if not exists provider_customer_ref text,
  add column if not exists default_payment_method_ref text,
  add column if not exists default_payment_method_id uuid references public.payment_methods(id) on delete set null,
  add column if not exists client_id uuid references public.clients(id) on delete cascade;

create index if not exists client_preferences_payment_defaults_idx
  on public.client_preferences (provider_customer_ref, default_payment_method_ref);

create index if not exists client_preferences_default_payment_method_id_idx
  on public.client_preferences (default_payment_method_id)
  where default_payment_method_id is not null;

create index if not exists client_preferences_client_id_idx
  on public.client_preferences (client_id)
  where client_id is not null;

alter table public.payment_methods enable row level security;

drop policy if exists "payment methods client self select" on public.payment_methods;
drop policy if exists "payment methods client self insert" on public.payment_methods;
drop policy if exists "payment methods client self update" on public.payment_methods;

create policy "payment methods client self select" on public.payment_methods
  for select using (
    exists (
      select 1
      from public.clients c
      where c.id = payment_methods.client_id
        and c.profile_id = auth.uid()
    )
  );

create policy "payment methods client self insert" on public.payment_methods
  for insert with check (
    exists (
      select 1
      from public.clients c
      where c.id = payment_methods.client_id
        and c.profile_id = auth.uid()
    )
  );

create policy "payment methods client self update" on public.payment_methods
  for update using (
    exists (
      select 1
      from public.clients c
      where c.id = payment_methods.client_id
        and c.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.clients c
      where c.id = payment_methods.client_id
        and c.profile_id = auth.uid()
    )
  );
