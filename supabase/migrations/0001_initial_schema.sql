create type public.app_role as enum ('owner', 'manager', 'front_desk', 'commission_barber', 'booth_rent_barber', 'client');
create type public.appointment_status as enum ('booked', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show');
create type public.walk_in_status as enum ('waiting', 'assigned', 'in_service', 'completed');
create type public.rent_status as enum ('paid', 'due', 'overdue');

create table if not exists public.profiles (
  id uuid primary key,
  role public.app_role not null,
  full_name text not null,
  email text unique not null,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhood text not null,
  city text not null,
  state text not null,
  phone text,
  hours jsonb not null default '{}'::jsonb,
  tax_rate numeric(5,4) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_locations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(profile_id, location_id)
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade,
  category text not null,
  name text not null,
  description text,
  duration_min integer not null,
  buffer_min integer not null default 0,
  price numeric(10,2) not null,
  deposit_amount numeric(10,2) not null default 0,
  full_prepay_required boolean not null default false,
  active boolean not null default true
);

create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  compensation_model text not null check (compensation_model in ('commission', 'booth_rent')),
  commission_rate numeric(5,4),
  booth_rent_amount numeric(10,2),
  booth_rent_frequency text check (booth_rent_frequency in ('weekly', 'monthly')),
  bio text,
  booking_slug text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  favorite_barber_id uuid references public.barbers(id) on delete set null,
  loyalty_points integer not null default 0,
  retention_tag text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

create table if not exists public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  status public.appointment_status not null default 'booked',
  source text not null default 'booking',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  chair_label text,
  deposit_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  balance_due numeric(10,2) not null default 0,
  tip_amount numeric(10,2) not null default 0,
  client_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  status public.appointment_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  preferred_window text,
  requested_date date not null,
  barber_preference uuid references public.barbers(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.walk_in_queue (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  client_name text not null,
  requested_service text not null,
  requested_at timestamptz not null,
  status public.walk_in_status not null default 'waiting',
  assigned_barber_id uuid references public.barbers(id) on delete set null
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  amount numeric(10,2) not null,
  type text not null,
  provider text,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  amount numeric(10,2) not null,
  retained boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_amount numeric(10,2) not null,
  payout_amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.booth_rent_ledgers (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  period_label text not null,
  due_date date not null,
  amount numeric(10,2) not null,
  status public.rent_status not null default 'due',
  paid_date date
);

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  label text not null,
  commission_rate numeric(5,4) not null,
  retail_commission_rate numeric(5,4),
  created_at timestamptz not null default now()
);

create table if not exists public.bonuses (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  label text not null,
  amount numeric(10,2) not null,
  awarded_at date not null
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  points integer not null default 0,
  tier text,
  updated_at timestamptz not null default now()
);

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  description text,
  active boolean not null default true
);

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  balance numeric(10,2) not null default 0,
  status text not null default 'active'
);

create table if not exists public.retail_products (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  sku text,
  price numeric(10,2) not null,
  stock integer not null default 0
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.retail_products(id) on delete cascade,
  delta integer not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  channel text not null,
  title text not null,
  body text not null,
  status text not null default 'scheduled',
  scheduled_for timestamptz
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target text not null,
  severity text not null default 'info',
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  title text not null,
  assignee_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open',
  priority text not null default 'medium'
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid references public.profiles(id) on delete set null,
  asset_type text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.appointments enable row level security;
alter table public.booth_rent_ledgers enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles self or owner" on public.profiles
  for select using (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create policy "locations readable by authenticated" on public.locations
  for select using (auth.role() = 'authenticated');

create policy "appointments scoped by profile" on public.appointments
  for select using (
    exists (
      select 1
      from public.barbers b
      where b.id = barber_id and b.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.clients c
      where c.id = client_id and c.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'manager', 'front_desk')
    )
  );

create policy "booth rent owner or barber" on public.booth_rent_ledgers
  for select using (
    exists (select 1 from public.barbers b where b.id = barber_id and b.profile_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "audit logs owner only" on public.audit_logs
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );