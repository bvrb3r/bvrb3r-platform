create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  promotion_type text not null default 'code',
  discount_type text not null default 'percent',
  discount_value numeric(10,2) not null,
  applies_to_scope text not null default 'booking',
  service_id uuid references public.services(id) on delete set null,
  barber_id uuid references public.barbers(id) on delete set null,
  min_subtotal numeric(10,2),
  max_discount_amount numeric(10,2),
  usage_limit integer,
  usage_count integer not null default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_promotion_type_check check (promotion_type in ('code', 'automatic', 'featured')),
  constraint promotions_discount_type_check check (discount_type in ('percent', 'fixed_amount')),
  constraint promotions_scope_check check (applies_to_scope in ('booking', 'service', 'shop')),
  constraint promotions_discount_value_check check (discount_value >= 0),
  constraint promotions_min_subtotal_check check (min_subtotal is null or min_subtotal >= 0),
  constraint promotions_max_discount_check check (max_discount_amount is null or max_discount_amount >= 0),
  constraint promotions_usage_limit_check check (usage_limit is null or usage_limit >= 1),
  constraint promotions_date_window_check check (ends_at >= starts_at)
);

create unique index if not exists promotions_code_uidx
  on public.promotions ((lower(code)))
  where code is not null;

create index if not exists promotions_shop_active_window_idx
  on public.promotions (shop_id, is_active, starts_at desc, ends_at desc);

create index if not exists promotions_service_active_window_idx
  on public.promotions (service_id, is_active, starts_at desc, ends_at desc)
  where service_id is not null;

create index if not exists promotions_barber_active_window_idx
  on public.promotions (barber_id, is_active, starts_at desc, ends_at desc)
  where barber_id is not null;

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  discount_amount numeric(10,2) not null,
  redemption_status text not null default 'reserved',
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_redemptions_discount_amount_check check (discount_amount >= 0),
  constraint promotion_redemptions_status_check check (redemption_status in ('reserved', 'applied', 'completed', 'voided'))
);

create index if not exists promotion_redemptions_client_created_idx
  on public.promotion_redemptions (client_id, created_at desc);

create index if not exists promotion_redemptions_appointment_idx
  on public.promotion_redemptions (appointment_id)
  where appointment_id is not null;

create index if not exists promotion_redemptions_promotion_status_idx
  on public.promotion_redemptions (promotion_id, redemption_status, created_at desc);

create unique index if not exists promotion_redemptions_appointment_uidx
  on public.promotion_redemptions (appointment_id)
  where appointment_id is not null;

alter table public.promotions enable row level security;
alter table public.promotion_redemptions enable row level security;

drop policy if exists "promotions public active select" on public.promotions;
drop policy if exists "promotions shop manager select" on public.promotions;
drop policy if exists "promotions shop manager insert" on public.promotions;
drop policy if exists "promotions shop manager update" on public.promotions;
drop policy if exists "promotion redemptions client select" on public.promotion_redemptions;
drop policy if exists "promotion redemptions shop manager select" on public.promotion_redemptions;

create policy "promotions public active select" on public.promotions
  for select using (
    is_active = true
    and starts_at <= now()
    and ends_at >= now()
  );

create policy "promotions shop manager select" on public.promotions
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations sl on sl.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'manager'
        and sl.location_id = promotions.shop_id
    )
  );

create policy "promotions shop manager insert" on public.promotions
  for insert with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations sl on sl.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'manager'
        and sl.location_id = promotions.shop_id
    )
  );

create policy "promotions shop manager update" on public.promotions
  for update using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations sl on sl.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'manager'
        and sl.location_id = promotions.shop_id
    )
  ) with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations sl on sl.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'manager'
        and sl.location_id = promotions.shop_id
    )
  );

create policy "promotion redemptions client select" on public.promotion_redemptions
  for select using (
    exists (
      select 1
      from public.clients c
      where c.id = promotion_redemptions.client_id
        and c.profile_id = auth.uid()
    )
  );

create policy "promotion redemptions shop manager select" on public.promotion_redemptions
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.appointments a
      join public.staff_locations sl on sl.location_id = coalesce(a.shop_id, a.location_id)
      join public.profiles p on p.id = sl.profile_id
      where a.id = promotion_redemptions.appointment_id
        and p.id = auth.uid()
        and p.role = 'manager'
    )
  );
