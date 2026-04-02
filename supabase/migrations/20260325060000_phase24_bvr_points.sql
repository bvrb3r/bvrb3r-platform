create table if not exists public.user_points_balances (
  user_id text primary key,
  role text not null check (role in ('client', 'barber', 'owner')),
  total_points integer not null default 0,
  pending_points integer not null default 0,
  unlocked_points integer not null default 0,
  lifetime_earned integer not null default 0,
  lifetime_redeemed integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.points_transactions (
  id text primary key,
  user_id text not null,
  role text not null check (role in ('client', 'barber', 'owner')),
  point_class text not null check (point_class in ('promo', 'earned')),
  event_type text not null check (event_type in ('referral', 'booking', 'retention', 'campaign')),
  source_type text not null check (
    source_type in (
      'referral_event',
      'appointment',
      'booking_redemption',
      'subscription_credit',
      'campaign_credit',
      'cashout_request',
      'refund',
      'manual'
    )
  ),
  source_id text not null,
  referral_id text null,
  points_delta integer not null,
  in_app_value numeric(12, 2) not null default 0,
  cash_value numeric(12, 2) not null default 0,
  status text not null check (status in ('pending', 'unlocked', 'redeemed', 'expired', 'reversed', 'cashed_out')),
  created_at timestamptz not null default timezone('utc', now()),
  unlocked_at timestamptz null,
  expires_at timestamptz null,
  reversed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.points_program_rules (
  id text primary key,
  role text not null check (role in ('client', 'barber', 'owner')),
  event_type text not null check (event_type in ('referral', 'booking', 'retention', 'campaign')),
  max_points_per_event integer not null check (max_points_per_event >= 0),
  max_points_per_user_window integer not null check (max_points_per_user_window >= 0),
  window_days integer not null default 30 check (window_days > 0),
  expiration_days integer null check (expiration_days is null or expiration_days > 0),
  cashout_allowed boolean not null default false,
  delay_unlock_hours integer not null default 48 check (delay_unlock_hours >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reward_campaigns (
  id text primary key,
  name text not null,
  role_target text not null check (role_target in ('client', 'barber', 'owner', 'all')),
  event_target text not null check (event_target in ('referral', 'booking', 'retention', 'campaign', 'all')),
  multiplier numeric(8, 2) not null default 1 check (multiplier > 0),
  point_class text not null check (point_class in ('promo', 'earned')),
  budget_cap integer not null default 0 check (budget_cap >= 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reward_eligibility_snapshots (
  id text primary key,
  user_id text not null,
  role text not null check (role in ('client', 'barber', 'owner')),
  event_type text not null check (event_type in ('referral', 'booking', 'retention', 'campaign')),
  eligibility_status text not null check (eligibility_status in ('eligible', 'blocked', 'pending_review')),
  validation_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cashout_requests (
  id text primary key,
  user_id text not null,
  role text not null check (role in ('client', 'barber', 'owner')),
  points_requested integer not null check (points_requested > 0),
  cash_value numeric(12, 2) not null default 0,
  status text not null check (status in ('requested', 'under_review', 'approved', 'paid', 'rejected', 'reversed')),
  created_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists points_program_rules_role_event_unique_idx
  on public.points_program_rules (role, event_type);

create index if not exists points_transactions_user_status_created_idx
  on public.points_transactions (user_id, status, created_at desc);

create index if not exists points_transactions_source_idx
  on public.points_transactions (source_type, source_id);

create index if not exists points_transactions_referral_idx
  on public.points_transactions (referral_id)
  where referral_id is not null;

create index if not exists points_transactions_event_user_idx
  on public.points_transactions (event_type, user_id, created_at desc);

create index if not exists reward_campaigns_active_window_idx
  on public.reward_campaigns (is_active, start_at, end_at);

create index if not exists reward_eligibility_snapshots_user_created_idx
  on public.reward_eligibility_snapshots (user_id, created_at desc);

create index if not exists cashout_requests_user_status_idx
  on public.cashout_requests (user_id, status, created_at desc);

alter table public.user_points_balances enable row level security;
alter table public.points_transactions enable row level security;
alter table public.reward_eligibility_snapshots enable row level security;
alter table public.cashout_requests enable row level security;
alter table public.reward_campaigns enable row level security;
alter table public.points_program_rules enable row level security;

drop policy if exists "points balances self read" on public.user_points_balances;
create policy "points balances self read"
  on public.user_points_balances
  for select
  using (auth.uid()::text = user_id);

drop policy if exists "points transactions self read" on public.points_transactions;
create policy "points transactions self read"
  on public.points_transactions
  for select
  using (auth.uid()::text = user_id);

drop policy if exists "reward eligibility self read" on public.reward_eligibility_snapshots;
create policy "reward eligibility self read"
  on public.reward_eligibility_snapshots
  for select
  using (auth.uid()::text = user_id);

drop policy if exists "cashout requests self read" on public.cashout_requests;
create policy "cashout requests self read"
  on public.cashout_requests
  for select
  using (auth.uid()::text = user_id);

drop policy if exists "reward campaigns authenticated read" on public.reward_campaigns;
create policy "reward campaigns authenticated read"
  on public.reward_campaigns
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "points program rules authenticated read" on public.points_program_rules;
create policy "points program rules authenticated read"
  on public.points_program_rules
  for select
  using (auth.role() = 'authenticated');

insert into public.points_program_rules (
  id,
  role,
  event_type,
  max_points_per_event,
  max_points_per_user_window,
  window_days,
  expiration_days,
  cashout_allowed,
  delay_unlock_hours,
  created_at
)
values
  ('points-rule-client-referral', 'client', 'referral', 10, 40, 30, 180, false, 48, timezone('utc', now())),
  ('points-rule-barber-referral', 'barber', 'referral', 15, 60, 30, 180, true, 48, timezone('utc', now())),
  ('points-rule-owner-referral', 'owner', 'referral', 20, 80, 30, 180, true, 48, timezone('utc', now())),
  ('points-rule-client-booking', 'client', 'booking', 8, 32, 30, 120, false, 48, timezone('utc', now())),
  ('points-rule-client-retention', 'client', 'retention', 12, 24, 30, 120, false, 48, timezone('utc', now()))
on conflict (id) do update set
  role = excluded.role,
  event_type = excluded.event_type,
  max_points_per_event = excluded.max_points_per_event,
  max_points_per_user_window = excluded.max_points_per_user_window,
  window_days = excluded.window_days,
  expiration_days = excluded.expiration_days,
  cashout_allowed = excluded.cashout_allowed,
  delay_unlock_hours = excluded.delay_unlock_hours;

insert into public.reward_campaigns (
  id,
  name,
  role_target,
  event_target,
  multiplier,
  point_class,
  budget_cap,
  start_at,
  end_at,
  is_active,
  created_at
)
values
  (
    'campaign-referral-boost',
    'Referral boost week',
    'client',
    'referral',
    1.5,
    'promo',
    300,
    '2026-03-20T00:00:00Z',
    '2026-03-31T23:59:59Z',
    true,
    timezone('utc', now())
  ),
  (
    'campaign-slow-day',
    'Slow day fill incentive',
    'owner',
    'campaign',
    1,
    'promo',
    500,
    '2026-03-25T00:00:00Z',
    '2026-03-29T23:59:59Z',
    true,
    timezone('utc', now())
  ),
  (
    'campaign-retention-streak',
    'Retention streak bonus',
    'client',
    'retention',
    1.25,
    'earned',
    250,
    '2026-03-21T00:00:00Z',
    '2026-04-05T23:59:59Z',
    true,
    timezone('utc', now())
  )
on conflict (id) do update set
  name = excluded.name,
  role_target = excluded.role_target,
  event_target = excluded.event_target,
  multiplier = excluded.multiplier,
  point_class = excluded.point_class,
  budget_cap = excluded.budget_cap,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  is_active = excluded.is_active;
