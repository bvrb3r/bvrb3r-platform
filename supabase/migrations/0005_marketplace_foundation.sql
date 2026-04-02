do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_owner_type') then
    create type public.service_owner_type as enum ('barber', 'shop');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'marketplace_visibility_state') then
    create type public.marketplace_visibility_state as enum ('public', 'featured', 'hidden');
  end if;
end $$;

alter table if exists public.services
  add column if not exists service_owner_type public.service_owner_type not null default 'shop',
  add column if not exists barber_reference text,
  add column if not exists shop_reference text,
  add column if not exists style_tag_ids text[] not null default '{}',
  add column if not exists booking_count integer not null default 0,
  add column if not exists revenue_generated numeric(10,2) not null default 0,
  add column if not exists average_rating numeric(4,2) not null default 0,
  add column if not exists repeat_rate numeric(5,2) not null default 0,
  add column if not exists popularity_rank integer not null default 0;

create index if not exists services_owner_scope_idx on public.services (service_owner_type, shop_reference, barber_reference);
create index if not exists services_popularity_rank_idx on public.services (popularity_rank, booking_count desc);

create table if not exists public.marketplace_service_popularity (
  service_reference text primary key,
  booking_count integer not null default 0,
  revenue_generated numeric(10,2) not null default 0,
  average_rating numeric(4,2) not null default 0,
  repeat_rate numeric(5,2) not null default 0,
  popularity_rank integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.barber_profiles (
  id uuid primary key default gen_random_uuid(),
  barber_reference text not null unique,
  barber_email text not null,
  username text not null unique,
  display_name text not null,
  bio text not null default '',
  years_experience integer not null default 0,
  shop_reference text,
  profile_photo_path text,
  specialties text[] not null default '{}',
  badges text[] not null default '{}',
  service_area_label text,
  next_available_at timestamptz,
  visibility_state public.marketplace_visibility_state not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.barber_portfolios (
  id uuid primary key default gen_random_uuid(),
  barber_reference text not null,
  barber_email text not null,
  storage_path text not null,
  caption text not null default '',
  style_tag_ids text[] not null default '{}',
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.style_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.style_images (
  id uuid primary key default gen_random_uuid(),
  style_tag_slug text not null,
  storage_path text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.style_barbers (
  id uuid primary key default gen_random_uuid(),
  style_tag_slug text not null,
  barber_reference text not null,
  created_at timestamptz not null default now(),
  unique (style_tag_slug, barber_reference)
);

create table if not exists public.barber_rankings (
  barber_reference text primary key,
  distance_score numeric(8,2) not null default 0,
  average_rating_score numeric(8,2) not null default 0,
  review_volume_score numeric(8,2) not null default 0,
  retention_score numeric(8,2) not null default 0,
  availability_score numeric(8,2) not null default 0,
  portfolio_engagement_score numeric(8,2) not null default 0,
  ranking_score numeric(8,2) not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_visibility (
  barber_reference text primary key,
  barber_email text not null,
  visibility_state public.marketplace_visibility_state not null default 'public',
  accepts_instant_bookings boolean not null default true,
  featured_rank integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.featured_profiles (
  id uuid primary key default gen_random_uuid(),
  barber_reference text not null,
  label text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  client_reference text not null,
  client_email text not null,
  query text not null,
  filters jsonb not null default '{}'::jsonb,
  searched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.client_preferences (
  client_reference text primary key,
  client_email text not null,
  favorite_shop_reference text,
  preferred_location_reference text,
  preferred_style_tag_ids text[] not null default '{}',
  prefers_instant_booking boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.trending_styles (
  id uuid primary key default gen_random_uuid(),
  style_tag_slug text not null,
  region_label text not null,
  booking_count integer not null default 0,
  rank integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.location_search_index (
  id uuid primary key default gen_random_uuid(),
  location_reference text not null,
  shop_reference text,
  barber_reference text,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  distance_miles numeric(8,2) not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists barber_profiles_visibility_idx on public.barber_profiles (visibility_state, next_available_at);
create index if not exists barber_portfolios_barber_idx on public.barber_portfolios (barber_reference, featured desc);
create index if not exists style_tags_slug_idx on public.style_tags (slug);
create index if not exists style_barbers_style_idx on public.style_barbers (style_tag_slug, barber_reference);
create index if not exists featured_profiles_barber_idx on public.featured_profiles (barber_reference);
create index if not exists search_history_client_idx on public.search_history (client_reference, searched_at desc);
create index if not exists client_preferences_shop_idx on public.client_preferences (favorite_shop_reference, preferred_location_reference);
create index if not exists trending_styles_rank_idx on public.trending_styles (region_label, rank);
create index if not exists location_search_index_lookup_idx on public.location_search_index (location_reference, barber_reference, shop_reference);

alter table public.marketplace_service_popularity enable row level security;
alter table public.barber_profiles enable row level security;
alter table public.barber_portfolios enable row level security;
alter table public.style_tags enable row level security;
alter table public.style_images enable row level security;
alter table public.style_barbers enable row level security;
alter table public.barber_rankings enable row level security;
alter table public.marketplace_visibility enable row level security;
alter table public.featured_profiles enable row level security;
alter table public.search_history enable row level security;
alter table public.client_preferences enable row level security;
alter table public.trending_styles enable row level security;
alter table public.location_search_index enable row level security;

drop policy if exists "marketplace service popularity public read" on public.marketplace_service_popularity;
drop policy if exists "barber profiles public read" on public.barber_profiles;
drop policy if exists "barber profiles owner or self mutate" on public.barber_profiles;
drop policy if exists "barber portfolios public read" on public.barber_portfolios;
drop policy if exists "barber portfolios owner or self mutate" on public.barber_portfolios;
drop policy if exists "style tags public read" on public.style_tags;
drop policy if exists "style images public read" on public.style_images;
drop policy if exists "style barbers public read" on public.style_barbers;
drop policy if exists "barber rankings public read" on public.barber_rankings;
drop policy if exists "marketplace visibility public read" on public.marketplace_visibility;
drop policy if exists "marketplace visibility owner or self mutate" on public.marketplace_visibility;
drop policy if exists "featured profiles public read" on public.featured_profiles;
drop policy if exists "featured profiles owner mutate" on public.featured_profiles;
drop policy if exists "search history self mutate" on public.search_history;
drop policy if exists "client preferences self mutate" on public.client_preferences;
drop policy if exists "trending styles public read" on public.trending_styles;
drop policy if exists "location search index public read" on public.location_search_index;

create policy "marketplace service popularity public read" on public.marketplace_service_popularity
  for select using (true);

create policy "barber profiles public read" on public.barber_profiles
  for select using (visibility_state in ('public', 'featured'));

create policy "barber profiles owner or self mutate" on public.barber_profiles
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "barber portfolios public read" on public.barber_portfolios
  for select using (true);

create policy "barber portfolios owner or self mutate" on public.barber_portfolios
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "style tags public read" on public.style_tags
  for select using (true);

create policy "style images public read" on public.style_images
  for select using (true);

create policy "style barbers public read" on public.style_barbers
  for select using (true);

create policy "barber rankings public read" on public.barber_rankings
  for select using (true);

create policy "marketplace visibility public read" on public.marketplace_visibility
  for select using (visibility_state in ('public', 'featured'));

create policy "marketplace visibility owner or self mutate" on public.marketplace_visibility
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "featured profiles public read" on public.featured_profiles
  for select using (true);

create policy "featured profiles owner mutate" on public.featured_profiles
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "search history self mutate" on public.search_history
  for all using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
  ) with check (
    client_email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "client preferences self mutate" on public.client_preferences
  for all using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
  ) with check (
    client_email = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "trending styles public read" on public.trending_styles
  for select using (true);

create policy "location search index public read" on public.location_search_index
  for select using (true);

comment on table public.marketplace_service_popularity is 'Service popularity engine foundation for marketplace ranking and most-booked service signals.';
comment on table public.barber_profiles is 'Public barber profile layer powering shareable /barber/{username} marketplace pages.';
comment on table public.search_history is 'Discovery search history for client-side recommendations and future ranking feedback.';

comment on column public.services.service_owner_type is 'shop for owner-controlled commission catalog services, barber for booth-rent self-owned services.';
comment on column public.services.booking_count is 'Scaffolded popularity signal kept for marketplace compatibility.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'barber_profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.barber_profiles';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_visibility'
  ) then
    execute 'alter publication supabase_realtime add table public.marketplace_visibility';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_service_popularity'
  ) then
    execute 'alter publication supabase_realtime add table public.marketplace_service_popularity';
  end if;
end $$;