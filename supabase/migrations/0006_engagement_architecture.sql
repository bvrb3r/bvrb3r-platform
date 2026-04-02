alter table if exists public.loyalty_accounts
  add column if not exists client_reference text,
  add column if not exists client_email text,
  add column if not exists available_points integer not null default 0,
  add column if not exists lifetime_points integer not null default 0,
  add column if not exists referral_credits integer not null default 0,
  add column if not exists vip_status text;

update public.loyalty_accounts
set available_points = points,
    lifetime_points = greatest(lifetime_points, points)
where available_points = 0 and lifetime_points = 0;

alter table if exists public.notifications
  add column if not exists audience_role public.app_role,
  add column if not exists audience_email text,
  add column if not exists client_reference text,
  add column if not exists client_email text,
  add column if not exists barber_reference text,
  add column if not exists barber_email text,
  add column if not exists location_reference text,
  add column if not exists notification_type text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz;

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  loyalty_account_id uuid references public.loyalty_accounts(id) on delete cascade,
  client_reference text not null,
  client_email text not null,
  reason text not null,
  points_delta integer not null,
  label text not null,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  client_reference text not null,
  client_email text not null,
  code text not null unique,
  reward_points integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid references public.referral_codes(id) on delete cascade,
  referrer_client_reference text not null,
  referrer_client_email text not null,
  referred_client_email text not null,
  status text not null default 'invited',
  reward_points integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.barber_follows (
  id uuid primary key default gen_random_uuid(),
  client_reference text not null,
  client_email text not null,
  barber_reference text not null,
  barber_email text not null,
  notify_on_availability boolean not null default true,
  notify_on_portfolio boolean not null default true,
  created_at timestamptz not null default now(),
  unique (client_reference, barber_reference)
);

create table if not exists public.engagement_events (
  id uuid primary key default gen_random_uuid(),
  actor_role public.app_role not null,
  actor_reference text not null,
  actor_email text,
  target_type text not null,
  target_reference text not null,
  target_email text,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rebooking_cycles (
  id uuid primary key default gen_random_uuid(),
  client_reference text not null,
  client_email text not null,
  barber_reference text,
  service_reference text,
  average_cycle_days integer not null default 14,
  confidence text not null default 'low',
  last_completed_at timestamptz,
  next_suggested_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.rebooking_recommendations (
  id uuid primary key default gen_random_uuid(),
  client_reference text not null,
  client_email text not null,
  barber_reference text,
  service_reference text,
  message text not null,
  remind_at timestamptz,
  status text not null default 'suggested',
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  user_email text not null,
  client_reference text,
  barber_reference text,
  in_app_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  email_enabled boolean not null default true,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (role, user_email)
);

create table if not exists public.reputation_scores (
  barber_reference text primary key,
  barber_email text,
  review_score numeric(8,2) not null default 0,
  punctuality_score numeric(8,2) not null default 0,
  completion_score numeric(8,2) not null default 0,
  retention_score numeric(8,2) not null default 0,
  overall_score numeric(8,2) not null default 0,
  reputation_tier text not null default 'standard',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  barber_reference text not null,
  barber_email text,
  dimension text not null,
  rank_position integer not null default 0,
  score numeric(8,2) not null default 0,
  label text not null,
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.growth_recommendations (
  id uuid primary key default gen_random_uuid(),
  barber_reference text not null,
  barber_email text not null,
  title text not null,
  description text not null,
  focus_area text not null,
  priority text not null default 'medium',
  status text not null default 'open',
  action_label text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loyalty_accounts_client_email_idx on public.loyalty_accounts (client_email, client_reference);
create index if not exists loyalty_transactions_client_idx on public.loyalty_transactions (client_reference, created_at desc);
create index if not exists referral_codes_client_idx on public.referral_codes (client_reference, code);
create index if not exists referral_events_referrer_idx on public.referral_events (referrer_client_reference, status, created_at desc);
create index if not exists barber_follows_lookup_idx on public.barber_follows (client_reference, barber_reference, created_at desc);
create index if not exists engagement_events_actor_idx on public.engagement_events (actor_reference, actor_role, created_at desc);
create index if not exists engagement_events_target_idx on public.engagement_events (target_reference, target_type, created_at desc);
create index if not exists rebooking_cycles_client_idx on public.rebooking_cycles (client_reference, barber_reference);
create index if not exists rebooking_recommendations_client_idx on public.rebooking_recommendations (client_reference, status, remind_at desc);
create index if not exists notification_preferences_user_idx on public.notification_preferences (user_email, role);
create index if not exists reputation_scores_tier_idx on public.reputation_scores (reputation_tier, overall_score desc);
create index if not exists ranking_snapshots_dimension_idx on public.ranking_snapshots (dimension, rank_position, observed_at desc);
create index if not exists growth_recommendations_barber_idx on public.growth_recommendations (barber_reference, status, priority);
create index if not exists notifications_audience_email_idx on public.notifications (audience_email, audience_role, scheduled_for desc);

alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_events enable row level security;
alter table public.barber_follows enable row level security;
alter table public.engagement_events enable row level security;
alter table public.rebooking_cycles enable row level security;
alter table public.rebooking_recommendations enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.reputation_scores enable row level security;
alter table public.ranking_snapshots enable row level security;
alter table public.growth_recommendations enable row level security;

drop policy if exists "loyalty accounts self or owner" on public.loyalty_accounts;
drop policy if exists "loyalty transactions self or owner" on public.loyalty_transactions;
drop policy if exists "referral codes self or owner" on public.referral_codes;
drop policy if exists "referral events self or owner" on public.referral_events;
drop policy if exists "barber follows scoped read" on public.barber_follows;
drop policy if exists "barber follows client mutate" on public.barber_follows;
drop policy if exists "engagement events scoped read" on public.engagement_events;
drop policy if exists "engagement events actor mutate" on public.engagement_events;
drop policy if exists "rebooking cycles self or owner" on public.rebooking_cycles;
drop policy if exists "rebooking recommendations self or owner" on public.rebooking_recommendations;
drop policy if exists "notification preferences self or owner" on public.notification_preferences;
drop policy if exists "notifications self or owner" on public.notifications;
drop policy if exists "reputation scores public read" on public.reputation_scores;
drop policy if exists "reputation scores owner mutate" on public.reputation_scores;
drop policy if exists "ranking snapshots public read" on public.ranking_snapshots;
drop policy if exists "ranking snapshots owner mutate" on public.ranking_snapshots;
drop policy if exists "growth recommendations self or owner" on public.growth_recommendations;

create policy "loyalty accounts self or owner" on public.loyalty_accounts
  for all using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "loyalty transactions self or owner" on public.loyalty_transactions
  for all using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "referral codes self or owner" on public.referral_codes
  for all using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "referral events self or owner" on public.referral_events
  for all using (
    referrer_client_email = coalesce(auth.jwt() ->> 'email', '')
    or referred_client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    referrer_client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "barber follows scoped read" on public.barber_follows
  for select using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "barber follows client mutate" on public.barber_follows
  for all using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "engagement events scoped read" on public.engagement_events
  for select using (
    actor_email = coalesce(auth.jwt() ->> 'email', '')
    or target_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "engagement events actor mutate" on public.engagement_events
  for all using (
    actor_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    actor_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "rebooking cycles self or owner" on public.rebooking_cycles
  for all using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "rebooking recommendations self or owner" on public.rebooking_recommendations
  for all using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "notification preferences self or owner" on public.notification_preferences
  for all using (
    user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "notifications self or owner" on public.notifications
  for all using (
    audience_email = coalesce(auth.jwt() ->> 'email', '')
    or client_email = coalesce(auth.jwt() ->> 'email', '')
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    audience_email = coalesce(auth.jwt() ->> 'email', '')
    or client_email = coalesce(auth.jwt() ->> 'email', '')
    or barber_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "reputation scores public read" on public.reputation_scores
  for select using (true);

create policy "reputation scores owner mutate" on public.reputation_scores
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "ranking snapshots public read" on public.ranking_snapshots
  for select using (true);

create policy "ranking snapshots owner mutate" on public.ranking_snapshots
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "growth recommendations self or owner" on public.growth_recommendations
  for all using (
    barber_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  ) with check (
    barber_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

comment on table public.loyalty_transactions is 'BVRB3R Points ledger for completed bookings, reviews, referrals, and future redemptions.';
comment on table public.barber_follows is 'Client follow graph powering future profile notifications, availability alerts, and marketplace growth loops.';
comment on table public.reputation_scores is 'Scaffolded barber reputation layer for ranking, trust, and future marketplace profile proof.';
comment on table public.ranking_snapshots is 'Snapshot history for marketplace ranking signals like most booked, highest rated, and fastest growing.';
comment on table public.growth_recommendations is 'Future barber coaching prompts driven by portfolio, availability, punctuality, and rebooking performance.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'barber_follows'
  ) then
    execute 'alter publication supabase_realtime add table public.barber_follows';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'engagement_events'
  ) then
    execute 'alter publication supabase_realtime add table public.engagement_events';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reputation_scores'
  ) then
    execute 'alter publication supabase_realtime add table public.reputation_scores';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ranking_snapshots'
  ) then
    execute 'alter publication supabase_realtime add table public.ranking_snapshots';
  end if;
end $$;