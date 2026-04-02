do $$
begin
  create table if not exists public.marketplace_services (
    service_reference text primary key,
    category text not null,
    name text not null,
    description text not null default '',
    duration_min integer not null default 30,
    buffer_min integer not null default 0,
    price numeric(10,2) not null default 0,
    deposit_amount numeric(10,2) not null default 0,
    full_prepay_required boolean not null default false,
    owner_type public.service_owner_type not null default 'shop',
    barber_reference text,
    shop_reference text,
    style_tag_ids text[] not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
end $$;

create index if not exists marketplace_services_owner_idx on public.marketplace_services (owner_type, shop_reference, barber_reference);
create index if not exists marketplace_services_name_idx on public.marketplace_services (name);

create table if not exists public.marketplace_conversion_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  barber_reference text,
  username text,
  client_reference text,
  client_email text,
  appointment_reference text,
  location_reference text,
  source_kind text not null,
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (dedupe_key)
);

create table if not exists public.marketplace_booking_attributions (
  appointment_reference text primary key,
  barber_reference text not null,
  username text,
  client_reference text,
  client_email text,
  location_reference text,
  source_kind text not null,
  matched_from text,
  discovery_query text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_waitlist_requests (
  request_reference text primary key,
  barber_reference text,
  client_reference text,
  client_email text,
  service_reference text not null,
  location_reference text not null,
  source_query text,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

alter table public.barber_rankings
  add column if not exists follow_count integer not null default 0,
  add column if not exists reputation_score numeric(8,2) not null default 0,
  add column if not exists service_popularity_score numeric(8,2) not null default 0,
  add column if not exists rebooking_score numeric(8,2) not null default 0,
  add column if not exists conversion_score numeric(8,2) not null default 0,
  add column if not exists visibility_score numeric(8,2) not null default 0,
  add column if not exists label text;

create index if not exists barber_rankings_marketplace_idx on public.barber_rankings (ranking_score desc, availability_score desc, follow_count desc);
create index if not exists marketplace_conversion_events_barber_idx on public.marketplace_conversion_events (barber_reference, event_type, created_at desc);
create index if not exists marketplace_conversion_events_source_idx on public.marketplace_conversion_events (source_kind, event_type, created_at desc);
create index if not exists marketplace_booking_attributions_source_idx on public.marketplace_booking_attributions (source_kind, location_reference, created_at desc);
create index if not exists marketplace_waitlist_requests_lookup_idx on public.marketplace_waitlist_requests (location_reference, barber_reference, created_at desc);

alter table public.loyalty_accounts add column if not exists client_reference text;
create unique index if not exists loyalty_accounts_client_reference_uidx on public.loyalty_accounts (client_reference);

alter table public.loyalty_transactions add column if not exists dedupe_key text;
create unique index if not exists loyalty_transactions_dedupe_uidx on public.loyalty_transactions (dedupe_key) where dedupe_key is not null;

alter table public.engagement_events add column if not exists dedupe_key text;
create unique index if not exists engagement_events_dedupe_uidx on public.engagement_events (dedupe_key) where dedupe_key is not null;

alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_uidx on public.notifications (dedupe_key) where dedupe_key is not null;

alter table public.marketplace_services enable row level security;
alter table public.marketplace_conversion_events enable row level security;
alter table public.marketplace_booking_attributions enable row level security;
alter table public.marketplace_waitlist_requests enable row level security;

drop policy if exists "marketplace services public read" on public.marketplace_services;
drop policy if exists "marketplace services owner or self mutate" on public.marketplace_services;
drop policy if exists "marketplace conversion events owner read" on public.marketplace_conversion_events;
drop policy if exists "marketplace conversion events self scoped read" on public.marketplace_conversion_events;
drop policy if exists "marketplace booking attributions owner read" on public.marketplace_booking_attributions;
drop policy if exists "marketplace booking attributions self scoped read" on public.marketplace_booking_attributions;
drop policy if exists "marketplace waitlist self or owner" on public.marketplace_waitlist_requests;

create policy "marketplace services public read" on public.marketplace_services
  for select using (true);

create policy "marketplace services owner or self mutate" on public.marketplace_services
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or exists (
      select 1 from public.barber_profiles bp
      where bp.barber_reference = marketplace_services.barber_reference
        and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or exists (
      select 1 from public.barber_profiles bp
      where bp.barber_reference = marketplace_services.barber_reference
        and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "marketplace conversion events owner read" on public.marketplace_conversion_events
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "marketplace conversion events self scoped read" on public.marketplace_conversion_events
  for select using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.barber_profiles bp
      where bp.barber_reference = marketplace_conversion_events.barber_reference
        and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "marketplace booking attributions owner read" on public.marketplace_booking_attributions
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "marketplace booking attributions self scoped read" on public.marketplace_booking_attributions
  for select using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.barber_profiles bp
      where bp.barber_reference = marketplace_booking_attributions.barber_reference
        and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "marketplace waitlist self or owner" on public.marketplace_waitlist_requests
  for all using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  ) with check (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

comment on table public.marketplace_services is 'Marketplace-safe service catalog used by discovery, public profiles, and strict service ownership controls.';
comment on table public.marketplace_conversion_events is 'Marketplace conversion analytics ledger for impressions, profile views, booking intent, bookings, follows, and haircut-now usage.';
comment on table public.marketplace_booking_attributions is 'Booking attribution source of truth connecting marketplace discovery and public profile traffic to appointment creation.';
comment on table public.marketplace_waitlist_requests is 'Persisted marketplace waitlist requests used by booking, discovery, and instant-match flows.';
comment on column public.marketplace_conversion_events.dedupe_key is 'Idempotency key for conversion analytics writes from booking and marketplace flows.';
comment on column public.marketplace_services.owner_type is 'shop for owner-controlled commission services, barber for booth-rent self-owned services.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_services'
  ) then
    execute 'alter publication supabase_realtime add table public.marketplace_services';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_conversion_events'
  ) then
    execute 'alter publication supabase_realtime add table public.marketplace_conversion_events';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_booking_attributions'
  ) then
    execute 'alter publication supabase_realtime add table public.marketplace_booking_attributions';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_waitlist_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.marketplace_waitlist_requests';
  end if;
end $$;
