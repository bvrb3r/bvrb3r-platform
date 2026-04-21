alter table public.services
  add column if not exists is_bookable boolean not null default true,
  add column if not exists display_order integer not null default 0,
  add column if not exists currency text not null default 'usd',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists services_booking_engine_idx
  on public.services (location_id, active, is_bookable, display_order, name);
