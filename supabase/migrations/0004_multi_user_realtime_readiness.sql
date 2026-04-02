create extension if not exists pgcrypto;

alter table public.workflow_events
  add column if not exists barber_email text not null default '',
  add column if not exists client_email text not null default '';

alter table public.compensation_snapshots
  add column if not exists barber_email text not null default '',
  add column if not exists client_email text not null default '';

create table if not exists public.live_clients (
  client_reference text primary key,
  full_name text not null,
  phone text not null,
  email text not null,
  favorite_barber_reference text,
  loyalty_points integer not null default 0,
  retention_tag text not null default 'new',
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_appointments (
  appointment_reference text primary key,
  location_reference text not null,
  barber_reference text not null,
  barber_user_reference text not null,
  barber_email text not null,
  client_reference text not null references public.live_clients(client_reference) on delete restrict,
  client_email text not null,
  service_reference text not null,
  status public.appointment_status not null default 'booked',
  source text not null default 'booking',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  chair_label text,
  add_on_references text[] not null default '{}',
  deposit_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  balance_due numeric(10,2) not null default 0,
  tip_amount numeric(10,2) not null default 0,
  client_note text,
  lifecycle_revision integer not null default 1,
  last_actor_role text,
  last_event_type text,
  checkout_reference text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.live_walk_in_queue (
  queue_reference text primary key,
  location_reference text not null,
  client_name text not null,
  requested_service text not null,
  requested_at timestamptz not null,
  status public.walk_in_status not null default 'waiting',
  assigned_barber_reference text,
  wait_minutes integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists live_clients_email_idx on public.live_clients (email);
create index if not exists live_clients_phone_idx on public.live_clients (phone);
create index if not exists live_appointments_location_status_idx on public.live_appointments (location_reference, status, starts_at);
create index if not exists live_appointments_barber_idx on public.live_appointments (barber_reference, starts_at);
create index if not exists live_walk_in_queue_location_idx on public.live_walk_in_queue (location_reference, requested_at);

alter table public.live_clients enable row level security;
alter table public.live_appointments enable row level security;
alter table public.live_walk_in_queue enable row level security;

alter table public.workflow_events enable row level security;
alter table public.compensation_snapshots enable row level security;
alter table public.owner_daily_analytics enable row level security;

drop policy if exists "workflow events internal read" on public.workflow_events;
drop policy if exists "workflow events internal insert" on public.workflow_events;
drop policy if exists "compensation snapshots internal or barber read" on public.compensation_snapshots;
drop policy if exists "compensation snapshots internal insert" on public.compensation_snapshots;
drop policy if exists "compensation snapshots internal update" on public.compensation_snapshots;

drop policy if exists "live clients read" on public.live_clients;
drop policy if exists "live clients mutate" on public.live_clients;
drop policy if exists "live appointments read" on public.live_appointments;
drop policy if exists "live appointments insert" on public.live_appointments;
drop policy if exists "live appointments update" on public.live_appointments;
drop policy if exists "live walk in queue read" on public.live_walk_in_queue;
drop policy if exists "live walk in queue mutate" on public.live_walk_in_queue;

create policy "workflow events internal read" on public.workflow_events
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
    or client_email = coalesce(auth.jwt() ->> 'email', '')
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
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
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

create policy "live clients read" on public.live_clients
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
    or email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "live clients mutate" on public.live_clients
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
    or email = coalesce(auth.jwt() ->> 'email', '')
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
    or email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "live appointments read" on public.live_appointments
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
    or client_email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "live appointments insert" on public.live_appointments
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk', 'client')
    )
    or client_email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "live appointments update" on public.live_appointments
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
    or client_email = coalesce(auth.jwt() ->> 'email', '')
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
    or client_email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "live walk in queue read" on public.live_walk_in_queue
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "live walk in queue mutate" on public.live_walk_in_queue
  for all using (
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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_clients'
  ) then
    execute 'alter publication supabase_realtime add table public.live_clients';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_appointments'
  ) then
    execute 'alter publication supabase_realtime add table public.live_appointments';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_walk_in_queue'
  ) then
    execute 'alter publication supabase_realtime add table public.live_walk_in_queue';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workflow_events'
  ) then
    execute 'alter publication supabase_realtime add table public.workflow_events';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'compensation_snapshots'
  ) then
    execute 'alter publication supabase_realtime add table public.compensation_snapshots';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'owner_daily_analytics'
  ) then
    execute 'alter publication supabase_realtime add table public.owner_daily_analytics';
  end if;
end $$;