create extension if not exists btree_gist;

create table if not exists public.user_roles (
  user_email text primary key,
  role public.app_role not null,
  location_references text[] not null default '{}',
  barber_reference text,
  client_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shops (
  id text primary key,
  name text not null,
  brand_line text not null default '',
  neighborhood text not null,
  city text not null,
  state text not null,
  phone text,
  address text,
  kind text not null default 'shop' check (kind in ('shop', 'mobile')),
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_profiles (
  client_reference text primary key,
  profile_email text not null unique,
  full_name text not null,
  phone text not null,
  favorite_barber_reference text,
  favorite_shop_reference text references public.shops(id) on delete set null,
  loyalty_points integer not null default 0,
  retention_tag text not null default 'new',
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.barber_shop_memberships (
  id uuid primary key default gen_random_uuid(),
  barber_reference text not null,
  shop_reference text not null references public.shops(id) on delete cascade,
  membership_type text not null default 'primary' check (membership_type in ('primary', 'secondary', 'mobile')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barber_reference, shop_reference)
);

create table if not exists public.barber_working_hours (
  id uuid primary key default gen_random_uuid(),
  barber_reference text not null,
  shop_reference text not null references public.shops(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barber_reference, shop_reference, weekday, start_time, end_time)
);

create table if not exists public.barber_status (
  barber_reference text primary key,
  shop_reference text references public.shops(id) on delete set null,
  status text not null default 'available' check (status in ('available', 'busy', 'offline')),
  next_available_at timestamptz,
  accepting_bookings boolean not null default true,
  availability_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_reference text not null references public.live_appointments(appointment_reference) on delete cascade,
  service_reference text not null,
  service_name text not null,
  category text not null,
  description text,
  duration_min integer not null,
  buffer_min integer not null default 0,
  price numeric(10,2) not null,
  deposit_amount numeric(10,2) not null default 0,
  full_prepay_required boolean not null default false,
  add_on_references text[] not null default '{}',
  snapshot_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_reference)
);

create table if not exists public.event_log (
  id uuid primary key default gen_random_uuid(),
  appointment_reference text,
  location_reference text,
  barber_reference text,
  client_reference text,
  actor_role text not null,
  event_type text not null,
  title text not null,
  detail text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.payments
  add column if not exists appointment_reference text,
  add column if not exists client_reference text,
  add column if not exists barber_reference text,
  add column if not exists location_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.notifications
  add column if not exists appointment_reference text,
  add column if not exists client_reference text,
  add column if not exists barber_reference text,
  add column if not exists location_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists shops_city_neighborhood_idx on public.shops (city, neighborhood);
create index if not exists user_roles_role_idx on public.user_roles (role);
create index if not exists client_profiles_favorite_barber_idx on public.client_profiles (favorite_barber_reference);
create index if not exists barber_shop_memberships_shop_idx on public.barber_shop_memberships (shop_reference, active);
create index if not exists barber_working_hours_barber_idx on public.barber_working_hours (barber_reference, weekday);
create index if not exists barber_status_shop_idx on public.barber_status (shop_reference, status, next_available_at);
create index if not exists appointment_services_service_idx on public.appointment_services (service_reference);
create index if not exists event_log_appointment_idx on public.event_log (appointment_reference, created_at desc);
create unique index if not exists event_log_dedupe_idx on public.event_log (appointment_reference, event_type, created_at);
create index if not exists payments_appointment_reference_idx on public.payments (appointment_reference, status);
create index if not exists notifications_appointment_reference_idx on public.notifications (appointment_reference, scheduled_for);

alter table public.user_roles enable row level security;
alter table public.client_profiles enable row level security;
alter table public.appointment_services enable row level security;
alter table public.event_log enable row level security;
alter table public.barber_status enable row level security;

create policy "user roles self or internal read" on public.user_roles
  for select using (
    user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "client profiles self or internal read" on public.client_profiles
  for select using (
    profile_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "appointment services internal or participant read" on public.appointment_services
  for select using (
    exists (
      select 1 from public.live_appointments la
      where la.appointment_reference = appointment_reference
      and (
        la.client_email = coalesce(auth.jwt() ->> 'email', '')
        or la.barber_email = coalesce(auth.jwt() ->> 'email', '')
      )
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "event log internal or participant read" on public.event_log
  for select using (
    exists (
      select 1 from public.live_appointments la
      where la.appointment_reference = event_log.appointment_reference
      and (
        la.client_email = coalesce(auth.jwt() ->> 'email', '')
        or la.barber_email = coalesce(auth.jwt() ->> 'email', '')
      )
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "barber status read for authenticated" on public.barber_status
  for select using (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_appointments_no_overlap'
  ) then
    alter table public.live_appointments
      add constraint live_appointments_no_overlap
      exclude using gist (
        barber_reference with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status <> 'cancelled' and status <> 'no_show');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_no_overlap'
  ) then
    alter table public.appointments
      add constraint appointments_no_overlap
      exclude using gist (
        barber_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status <> 'cancelled' and status <> 'no_show');
  end if;
end $$;

insert into public.appointment_services (
  appointment_reference,
  service_reference,
  service_name,
  category,
  description,
  duration_min,
  buffer_min,
  price,
  deposit_amount,
  full_prepay_required,
  add_on_references,
  snapshot_payload,
  created_at,
  updated_at
)
select
  la.appointment_reference,
  la.service_reference,
  coalesce(ms.name, la.service_reference),
  coalesce(ms.category, 'Service'),
  ms.description,
  coalesce(ms.duration_min, 0),
  coalesce(ms.buffer_min, 0),
  coalesce(ms.price, 0),
  coalesce(ms.deposit_amount, 0),
  coalesce(ms.full_prepay_required, false),
  la.add_on_references,
  jsonb_build_object(
    'serviceReference', la.service_reference,
    'capturedAt', la.created_at,
    'addOnReferences', la.add_on_references
  ),
  la.created_at,
  la.updated_at
from public.live_appointments la
left join public.marketplace_services ms on ms.service_reference = la.service_reference
on conflict (appointment_reference) do update
set service_reference = excluded.service_reference,
    service_name = excluded.service_name,
    category = excluded.category,
    description = excluded.description,
    duration_min = excluded.duration_min,
    buffer_min = excluded.buffer_min,
    price = excluded.price,
    deposit_amount = excluded.deposit_amount,
    full_prepay_required = excluded.full_prepay_required,
    add_on_references = excluded.add_on_references,
    snapshot_payload = excluded.snapshot_payload,
    updated_at = excluded.updated_at;

insert into public.event_log (
  appointment_reference,
  location_reference,
  barber_reference,
  client_reference,
  actor_role,
  event_type,
  title,
  detail,
  payload,
  created_at
)
select
  appointment_reference,
  location_reference,
  barber_reference,
  client_reference,
  actor_role,
  event_type,
  title,
  detail,
  event_payload,
  created_at
from public.workflow_events
on conflict do nothing;
