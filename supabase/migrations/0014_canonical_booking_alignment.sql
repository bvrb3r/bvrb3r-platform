alter table public.locations
  add column if not exists reference_code text;

alter table public.services
  add column if not exists reference_code text;

alter table public.barbers
  add column if not exists reference_code text;

alter table public.clients
  add column if not exists reference_code text;

alter table public.appointments
  add column if not exists reference_code text,
  add column if not exists add_on_references text[] not null default '{}',
  add column if not exists lifecycle_revision integer not null default 1,
  add column if not exists last_actor_role text,
  add column if not exists last_event_type text,
  add column if not exists checkout_reference text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.waitlist_entries
  add column if not exists status text not null default 'waiting'
    check (status in ('waiting', 'notified', 'booked', 'cancelled'));

alter table public.walk_in_queue
  add column if not exists reference_code text,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists position integer not null default 0,
  add column if not exists wait_minutes integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.appointment_services
  drop constraint if exists appointment_services_appointment_reference_fkey;

alter table public.appointment_services
  add column if not exists appointment_id uuid references public.appointments(id) on delete cascade;

create unique index if not exists locations_reference_code_idx on public.locations (reference_code) where reference_code is not null;
create unique index if not exists services_reference_code_idx on public.services (reference_code) where reference_code is not null;
create unique index if not exists barbers_reference_code_idx on public.barbers (reference_code) where reference_code is not null;
create unique index if not exists clients_reference_code_idx on public.clients (reference_code) where reference_code is not null;
create unique index if not exists appointments_reference_code_idx on public.appointments (reference_code) where reference_code is not null;
create unique index if not exists walk_in_queue_reference_code_idx on public.walk_in_queue (reference_code) where reference_code is not null;
create unique index if not exists appointment_services_appointment_id_idx on public.appointment_services (appointment_id) where appointment_id is not null;

create index if not exists appointments_barber_starts_at_idx on public.appointments (barber_id, starts_at);
create index if not exists appointments_client_starts_at_idx on public.appointments (client_id, starts_at);
create index if not exists appointments_location_status_starts_at_idx on public.appointments (location_id, status, starts_at);
create index if not exists appointment_status_history_appointment_changed_at_idx on public.appointment_status_history (appointment_id, changed_at desc);
create index if not exists waitlist_entries_location_status_idx on public.waitlist_entries (location_id, status);
create index if not exists walk_in_queue_location_position_idx on public.walk_in_queue (location_id, position);
create index if not exists payments_appointment_id_idx on public.payments (appointment_id);
create index if not exists reviews_appointment_barber_idx on public.reviews (appointment_id, barber_id);

alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.walk_in_queue enable row level security;

drop policy if exists "appointments scoped by profile" on public.appointments;
drop policy if exists "appointments client self select" on public.appointments;
drop policy if exists "appointments barber self select" on public.appointments;
drop policy if exists "appointments shop staff select" on public.appointments;
drop policy if exists "payments client self select" on public.payments;
drop policy if exists "payments barber self select" on public.payments;
drop policy if exists "payments shop staff select" on public.payments;
drop policy if exists "reviews participant select" on public.reviews;
drop policy if exists "reviews shop staff select" on public.reviews;
drop policy if exists "walk in queue shop staff select" on public.walk_in_queue;

create policy "appointments client self select" on public.appointments
  for select using (
    exists (
      select 1
      from public.clients c
      where c.id = appointments.client_id
        and c.profile_id = auth.uid()
    )
  );

create policy "appointments barber self select" on public.appointments
  for select using (
    exists (
      select 1
      from public.barbers b
      where b.id = appointments.barber_id
        and b.profile_id = auth.uid()
    )
  );

create policy "appointments shop staff select" on public.appointments
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "payments client self select" on public.payments
  for select using (
    appointment_id is not null
    and exists (
      select 1
      from public.appointments a
      join public.clients c on c.id = a.client_id
      where a.id = payments.appointment_id
        and c.profile_id = auth.uid()
    )
  );

create policy "payments barber self select" on public.payments
  for select using (
    appointment_id is not null
    and exists (
      select 1
      from public.appointments a
      join public.barbers b on b.id = a.barber_id
      where a.id = payments.appointment_id
        and b.profile_id = auth.uid()
    )
  );

create policy "payments shop staff select" on public.payments
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "reviews participant select" on public.reviews
  for select using (
    exists (
      select 1
      from public.clients c
      where c.id = reviews.client_id
        and c.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.barbers b
      where b.id = reviews.barber_id
        and b.profile_id = auth.uid()
    )
  );

create policy "reviews shop staff select" on public.reviews
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "walk in queue shop staff select" on public.walk_in_queue
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'manager', 'front_desk')
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    execute 'alter publication supabase_realtime add table public.appointments';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'walk_in_queue'
  ) then
    execute 'alter publication supabase_realtime add table public.walk_in_queue';
  end if;
end $$;
