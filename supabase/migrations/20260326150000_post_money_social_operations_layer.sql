alter table public.profiles
  add column if not exists profile_photo_path text,
  add column if not exists profile_photo_url text;

alter table public.barber_profiles
  add column if not exists profile_photo_url text;

alter table public.barber_portfolios
  add column if not exists image_url text;

alter table public.shops
  add column if not exists profile_photo_path text,
  add column if not exists profile_photo_url text;

create table if not exists public.shop_media_assets (
  id uuid primary key default gen_random_uuid(),
  shop_reference text not null references public.shops(id) on delete cascade,
  storage_path text not null,
  image_url text not null,
  caption text not null default '',
  featured boolean not null default false,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists shop_media_assets_shop_idx
  on public.shop_media_assets (shop_reference, featured desc, created_at desc);

alter table public.shop_media_assets enable row level security;

drop policy if exists "shop media public read" on public.shop_media_assets;
drop policy if exists "shop media management mutate" on public.shop_media_assets;

create policy "shop media public read" on public.shop_media_assets
  for select using (true);

create policy "shop media management mutate" on public.shop_media_assets
  for all using (
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
        and p.role in ('manager', 'front_desk')
        and sl.location_id::text = shop_reference
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
        and p.role in ('manager', 'front_desk')
        and sl.location_id::text = shop_reference
    )
  );

alter table public.message_threads
  add column if not exists location_id uuid references public.locations(id) on delete set null;

alter table public.message_threads
  drop constraint if exists message_threads_thread_type_check;

alter table public.message_threads
  add constraint message_threads_thread_type_check
  check (thread_type in ('client_barber', 'client_shop', 'barber_shop', 'support', 'shop_team'));

create index if not exists message_threads_location_updated_idx
  on public.message_threads (location_id, updated_at desc)
  where location_id is not null;

update public.barber_portfolios
set image_url = coalesce(image_url, storage_path)
where image_url is null;

update public.barber_profiles
set profile_photo_url = coalesce(profile_photo_url, profile_photo_path)
where profile_photo_url is null
  and profile_photo_path is not null;

update public.shops
set profile_photo_url = coalesce(profile_photo_url, profile_photo_path)
where profile_photo_url is null
  and profile_photo_path is not null;

update public.profiles
set profile_photo_url = coalesce(profile_photo_url, profile_photo_path)
where profile_photo_url is null
  and profile_photo_path is not null;
