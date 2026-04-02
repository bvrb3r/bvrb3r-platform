alter table public.verification_documents
  add column if not exists file_name text,
  add column if not exists content_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists upload_status text not null default 'uploaded',
  add column if not exists uploaded_by_role public.app_role,
  add column if not exists secure_reference text;

create table if not exists public.notification_deliveries (
  id text primary key,
  notification_reference text not null,
  channel text not null,
  provider text not null,
  status text not null,
  destination text not null,
  title text not null,
  sent_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.boost_campaigns (
  id text primary key,
  scope_type text not null,
  scope_reference text not null,
  status text not null,
  placement_label text not null,
  placement_scope text not null,
  city_slug text,
  category_slug text,
  trust_eligible boolean not null default false,
  trust_reason text not null default '',
  spend_cents integer not null default 0,
  daily_budget_cents integer not null default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by_role public.app_role not null,
  created_by_reference text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.featured_placements (
  id text primary key,
  scope_type text not null,
  scope_reference text not null,
  label text not null,
  placement_scope text not null,
  city_slug text,
  category_slug text,
  status text not null,
  trust_eligible boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  priority integer not null default 1,
  created_by_role public.app_role not null,
  created_by_reference text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.city_rollouts (
  id text primary key,
  city_slug text not null unique,
  city_label text not null,
  state_code text not null,
  neighborhood_label text,
  activation_state text not null,
  density_score numeric(8,2) not null default 0,
  launch_visible boolean not null default false,
  featured_barber_ids text[] not null default '{}',
  featured_shop_ids text[] not null default '{}',
  market_notes text not null default '',
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_monetization_events (
  id text primary key,
  event_type text not null,
  barber_reference text,
  shop_reference text,
  campaign_reference text,
  placement_reference text,
  city_slug text,
  source_kind text not null,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_deliveries_notification_idx on public.notification_deliveries (notification_reference, created_at desc);
create index if not exists boost_campaigns_scope_idx on public.boost_campaigns (scope_reference, status, starts_at desc);
create index if not exists featured_placements_scope_idx on public.featured_placements (scope_reference, status, priority);
create index if not exists city_rollouts_state_idx on public.city_rollouts (activation_state, density_score desc);
create index if not exists marketplace_monetization_events_barber_idx on public.marketplace_monetization_events (barber_reference, event_type, created_at desc);
create index if not exists marketplace_monetization_events_city_idx on public.marketplace_monetization_events (city_slug, event_type, created_at desc);

alter table public.notification_deliveries enable row level security;
alter table public.boost_campaigns enable row level security;
alter table public.featured_placements enable row level security;
alter table public.city_rollouts enable row level security;
alter table public.marketplace_monetization_events enable row level security;

drop policy if exists "notification deliveries scoped read" on public.notification_deliveries;
drop policy if exists "boost campaigns public read" on public.boost_campaigns;
drop policy if exists "boost campaigns owner or eligible self mutate" on public.boost_campaigns;
drop policy if exists "featured placements public read" on public.featured_placements;
drop policy if exists "featured placements owner mutate" on public.featured_placements;
drop policy if exists "city rollouts owner read" on public.city_rollouts;
drop policy if exists "city rollouts owner mutate" on public.city_rollouts;
drop policy if exists "marketplace monetization owner read" on public.marketplace_monetization_events;

create policy "notification deliveries scoped read" on public.notification_deliveries
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or destination = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "boost campaigns public read" on public.boost_campaigns
  for select using (status in ('active', 'paused', 'ended'));

create policy "boost campaigns owner or eligible self mutate" on public.boost_campaigns
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or exists (
      select 1 from public.barber_profiles bp
      where bp.barber_reference = boost_campaigns.scope_reference
        and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or exists (
      select 1 from public.barber_profiles bp
      where bp.barber_reference = boost_campaigns.scope_reference
        and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "featured placements public read" on public.featured_placements
  for select using (status in ('active', 'scheduled', 'expired'));

create policy "featured placements owner mutate" on public.featured_placements
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

create policy "city rollouts owner read" on public.city_rollouts
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "city rollouts owner mutate" on public.city_rollouts
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

create policy "marketplace monetization owner read" on public.marketplace_monetization_events
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

comment on table public.notification_deliveries is 'Delivery ledger for in-app, sms, email, and push-ready notification attempts.';
comment on table public.boost_campaigns is 'Trust-aware boosted discovery campaigns for barber and shop marketplace visibility.';
comment on table public.featured_placements is 'Premium featured placement inventory for barbers and shops.';
comment on table public.city_rollouts is 'City-by-city marketplace rollout management, density scoring, and launch visibility controls.';
comment on table public.marketplace_monetization_events is 'Monetization analytics ledger for boosts, featured placement, and city rollout performance.';
comment on column public.verification_documents.secure_reference is 'Opaque private reference used by the app to talk about a verification upload without exposing the real storage path publicly.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notification_deliveries'
  ) then
    execute 'alter publication supabase_realtime add table public.notification_deliveries';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'boost_campaigns'
  ) then
    execute 'alter publication supabase_realtime add table public.boost_campaigns';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'featured_placements'
  ) then
    execute 'alter publication supabase_realtime add table public.featured_placements';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'city_rollouts'
  ) then
    execute 'alter publication supabase_realtime add table public.city_rollouts';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_monetization_events'
  ) then
    execute 'alter publication supabase_realtime add table public.marketplace_monetization_events';
  end if;
end $$;
