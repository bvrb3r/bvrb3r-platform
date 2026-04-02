create extension if not exists pgcrypto;

create table if not exists public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  appointment_reference text not null,
  location_reference text not null,
  barber_reference text not null,
  barber_user_reference text not null,
  client_reference text not null,
  actor_role text not null,
  event_type text not null check (event_type in ('booking', 'check_in', 'service_start', 'service_complete', 'checkout')),
  title text not null,
  detail text,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workflow_events_appointment_reference_idx on public.workflow_events (appointment_reference, created_at desc);
create index if not exists workflow_events_location_reference_idx on public.workflow_events (location_reference, created_at desc);

create table if not exists public.compensation_snapshots (
  id uuid primary key default gen_random_uuid(),
  appointment_reference text not null unique,
  location_reference text not null,
  barber_reference text not null,
  barber_user_reference text not null,
  client_reference text not null,
  compensation_model text not null check (compensation_model in ('commission', 'booth_rent')),
  business_date date not null,
  gross_service_amount numeric(10,2) not null default 0,
  deposit_amount numeric(10,2) not null default 0,
  collected_amount numeric(10,2) not null default 0,
  tip_amount numeric(10,2) not null default 0,
  commission_rate numeric(5,4),
  commission_amount numeric(10,2) not null default 0,
  booth_rent_amount numeric(10,2),
  booth_rent_period_label text,
  rent_coverage_amount numeric(10,2),
  checkout_reference text,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists compensation_snapshots_barber_reference_idx on public.compensation_snapshots (barber_reference, business_date desc);
create index if not exists compensation_snapshots_location_reference_idx on public.compensation_snapshots (location_reference, business_date desc);

create table if not exists public.owner_daily_analytics (
  id uuid primary key default gen_random_uuid(),
  location_reference text not null,
  business_date date not null,
  booked_count integer not null default 0,
  completed_services_count integer not null default 0,
  paid_appointments_count integer not null default 0,
  revenue_total numeric(10,2) not null default 0,
  tip_total numeric(10,2) not null default 0,
  outstanding_balance numeric(10,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique(location_reference, business_date)
);

create index if not exists owner_daily_analytics_location_reference_idx on public.owner_daily_analytics (location_reference, business_date desc);

alter table public.workflow_events enable row level security;
alter table public.compensation_snapshots enable row level security;
alter table public.owner_daily_analytics enable row level security;

create policy "workflow events internal read" on public.workflow_events
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
    or barber_user_reference = auth.uid()::text
  );

create policy "workflow events internal insert" on public.workflow_events
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk', 'commission_barber', 'booth_rent_barber', 'client')
    )
  );

create policy "compensation snapshots internal or barber read" on public.compensation_snapshots
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
    or barber_user_reference = auth.uid()::text
  );

create policy "compensation snapshots internal insert" on public.compensation_snapshots
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "compensation snapshots internal update" on public.compensation_snapshots
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "owner analytics owner or manager read" on public.owner_daily_analytics
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager')
    )
  );

create policy "owner analytics internal insert" on public.owner_daily_analytics
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "owner analytics internal update" on public.owner_daily_analytics
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  );