create table if not exists public.kiosk_settings (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('barber', 'shop')),
  target_reference text not null,
  enabled boolean not null default true,
  pin_hash text not null,
  require_payment_before_booking boolean not null default false,
  same_day_only boolean not null default true,
  allow_future_booking boolean not null default false,
  allow_next_available boolean not null default true,
  allow_choose_barber boolean not null default true,
  device_label text null,
  failed_attempt_count integer not null default 0,
  locked_until timestamptz null,
  last_verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kiosk_settings_target_reference_check check (length(trim(target_reference)) > 0)
);

create unique index if not exists kiosk_settings_scope_target_unique_idx
  on public.kiosk_settings (scope, target_reference);

create index if not exists kiosk_settings_owner_scope_idx
  on public.kiosk_settings (owner_profile_id, scope, enabled);

alter table public.kiosk_settings enable row level security;

drop policy if exists kiosk_settings_owner_select on public.kiosk_settings;
create policy kiosk_settings_owner_select
  on public.kiosk_settings
  for select
  using (owner_profile_id = auth.uid());

drop policy if exists kiosk_settings_owner_insert on public.kiosk_settings;
create policy kiosk_settings_owner_insert
  on public.kiosk_settings
  for insert
  with check (owner_profile_id = auth.uid());

drop policy if exists kiosk_settings_owner_update on public.kiosk_settings;
create policy kiosk_settings_owner_update
  on public.kiosk_settings
  for update
  using (owner_profile_id = auth.uid())
  with check (owner_profile_id = auth.uid());

comment on table public.kiosk_settings is
  'Secure kiosk mode settings for barber and shop-owner accounts. Kiosk PINs are stored as hashes only.';

comment on column public.kiosk_settings.pin_hash is
  'PBKDF2 or stronger one-way hash of the 4-digit kiosk PIN. Never store kiosk PINs as plain text.';

notify pgrst, 'reload schema';
