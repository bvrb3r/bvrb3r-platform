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
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_method_id)
);

alter table public.payments
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists shop_id uuid references public.locations(id) on delete set null,
  add column if not exists barber_id uuid references public.barbers(id) on delete set null,
  add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null,
  add column if not exists provider_payment_intent_id text,
  add column if not exists currency text not null default 'usd',
  add column if not exists payment_status text,
  add column if not exists payment_type text,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.payments p
set
  client_id = coalesce(p.client_id, a.client_id),
  shop_id = coalesce(p.shop_id, a.shop_id, a.location_id),
  barber_id = coalesce(p.barber_id, a.barber_id)
from public.appointments a
where p.appointment_id = a.id
  and (
    p.client_id is null
    or p.shop_id is null
    or p.barber_id is null
  );

update public.payments p
set shop_id = coalesce(
  p.shop_id,
  (
    select l.id
    from public.locations l
    where l.reference_code = p.location_reference
    limit 1
  )
)
where p.shop_id is null
  and p.location_reference is not null;

update public.payments
set currency = lower(coalesce(nullif(currency, ''), 'usd'));

update public.payments
set payment_status = case
  when coalesce(status, '') in ('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'voided') then status
  when status = 'paid' then 'captured'
  when status = 'succeeded' then 'captured'
  when status = 'void' then 'voided'
  else 'pending'
end
where payment_status is null;

update public.payments
set payment_type = case
  when coalesce(type, '') = 'tip' then 'tip'
  when coalesce(type, '') = 'add_on' then 'add_on'
  when coalesce(type, '') = 'booth_rent' then 'booth_rent'
  when coalesce(type, '') = 'subscription' then 'subscription'
  else 'booking'
end
where payment_type is null;

update public.payments
set paid_at = coalesce(paid_at, case when payment_status = 'captured' then created_at else null end);

alter table public.payments
  alter column payment_status set not null,
  alter column payment_type set not null;

alter table public.payments
  drop constraint if exists payments_amount_nonnegative_ck,
  drop constraint if exists payments_currency_ck,
  drop constraint if exists payments_payment_status_ck,
  drop constraint if exists payments_payment_type_ck;

alter table public.payments
  add constraint payments_amount_nonnegative_ck check (amount >= 0),
  add constraint payments_currency_ck check (currency ~ '^[a-z]{3}$'),
  add constraint payments_payment_status_ck check (payment_status in ('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'voided')),
  add constraint payments_payment_type_ck check (payment_type in ('booking', 'tip', 'add_on', 'booth_rent', 'subscription'));

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  amount numeric(10,2) not null,
  reason text,
  provider_refund_id text,
  refunded_by uuid references public.profiles(id) on delete set null,
  refunded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.refunds
  drop constraint if exists refunds_amount_nonnegative_ck;

alter table public.refunds
  add constraint refunds_amount_nonnegative_ck check (amount >= 0);

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);

alter table public.tips
  drop constraint if exists tips_amount_nonnegative_ck;

alter table public.tips
  add constraint tips_amount_nonnegative_ck check (amount >= 0);

insert into public.payment_methods (
  client_id,
  provider,
  provider_customer_id,
  provider_payment_method_id,
  brand,
  last4,
  exp_month,
  exp_year,
  is_default,
  created_at,
  updated_at
)
select
  c.id,
  spm.provider,
  bc.provider_customer_id,
  spm.provider_payment_method_id,
  spm.brand,
  spm.last4,
  spm.exp_month,
  spm.exp_year,
  spm.is_default,
  spm.created_at,
  spm.created_at
from public.saved_payment_methods spm
join public.billing_customers bc on bc.id = spm.billing_customer_id
join public.clients c on c.profile_id = spm.profile_id
on conflict (provider, provider_payment_method_id) do nothing;

with ranked_defaults as (
  select
    id,
    client_id,
    row_number() over (
      partition by client_id
      order by case when is_default then 0 else 1 end, created_at asc, id asc
    ) as rn
  from public.payment_methods
)
update public.payment_methods pm
set
  is_default = ranked_defaults.rn = 1,
  updated_at = now()
from ranked_defaults
where pm.id = ranked_defaults.id;

create index if not exists payment_methods_client_default_idx on public.payment_methods (client_id, is_default, created_at desc);
create unique index if not exists payment_methods_client_single_default_idx on public.payment_methods (client_id) where is_default;
create index if not exists payments_client_created_at_idx on public.payments (client_id, created_at desc);
create index if not exists payments_shop_created_at_idx on public.payments (shop_id, created_at desc);
create index if not exists payments_status_created_at_idx on public.payments (payment_status, created_at desc);
create index if not exists refunds_payment_refunded_at_idx on public.refunds (payment_id, refunded_at desc);
create unique index if not exists tips_appointment_unique_idx on public.tips (appointment_id);
create index if not exists tips_barber_created_at_idx on public.tips (barber_id, created_at desc);

alter table public.payment_methods enable row level security;
alter table public.refunds enable row level security;
alter table public.tips enable row level security;

drop policy if exists "payment methods client self select" on public.payment_methods;
drop policy if exists "payment methods client self insert" on public.payment_methods;
drop policy if exists "payment methods client self update" on public.payment_methods;
drop policy if exists "refunds client self select" on public.refunds;
drop policy if exists "refunds shop staff select" on public.refunds;
drop policy if exists "refunds shop staff insert" on public.refunds;
drop policy if exists "tips client self select" on public.tips;
drop policy if exists "tips barber self select" on public.tips;
drop policy if exists "tips shop staff select" on public.tips;
drop policy if exists "tips client self insert" on public.tips;
drop policy if exists "tips shop staff insert" on public.tips;

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

create policy "refunds client self select" on public.refunds
  for select using (
    exists (
      select 1
      from public.payments p
      join public.appointments a on a.id = p.appointment_id
      join public.clients c on c.id = a.client_id
      where p.id = refunds.payment_id
        and c.profile_id = auth.uid()
    )
  );

create policy "refunds shop staff select" on public.refunds
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "refunds shop staff insert" on public.refunds
  for insert with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "tips client self select" on public.tips
  for select using (
    exists (
      select 1
      from public.clients c
      where c.id = tips.client_id
        and c.profile_id = auth.uid()
    )
  );

create policy "tips barber self select" on public.tips
  for select using (
    exists (
      select 1
      from public.barbers b
      where b.id = tips.barber_id
        and b.profile_id = auth.uid()
    )
  );

create policy "tips shop staff select" on public.tips
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "tips client self insert" on public.tips
  for insert with check (
    exists (
      select 1
      from public.clients c
      where c.id = tips.client_id
        and c.profile_id = auth.uid()
    )
  );

create policy "tips shop staff insert" on public.tips
  for insert with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'manager', 'front_desk')
    )
  );
