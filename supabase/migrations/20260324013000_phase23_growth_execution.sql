alter table public.referral_events
  add column if not exists referred_client_reference text,
  add column if not exists appointment_reference text,
  add column if not exists signed_up_at timestamptz,
  add column if not exists booked_at timestamptz,
  add column if not exists credited_at timestamptz,
  add column if not exists credited_transaction_reference text;

create index if not exists referral_events_referred_client_idx
  on public.referral_events (referred_client_reference, status, created_at desc);

create index if not exists referral_events_appointment_idx
  on public.referral_events (appointment_reference)
  where appointment_reference is not null;

alter table public.billing_subscriptions
  add column if not exists client_id uuid references public.clients(id) on delete cascade,
  add column if not exists provider_customer_id text,
  add column if not exists provider_price_id text;

drop index if exists public.billing_subscriptions_barber_uidx;
drop index if exists public.billing_subscriptions_shop_uidx;

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_subject_type_check,
  drop constraint if exists billing_subscriptions_subject_reference_check;

alter table public.billing_subscriptions
  add constraint billing_subscriptions_subject_type_check
    check (subject_type in ('barber', 'shop', 'client')),
  add constraint billing_subscriptions_subject_reference_check
    check (
      (subject_type = 'barber' and barber_id is not null and shop_id is null and client_id is null)
      or (subject_type = 'shop' and shop_id is not null and barber_id is null and client_id is null)
      or (subject_type = 'client' and client_id is not null and barber_id is null and shop_id is null)
    );

create unique index if not exists billing_subscriptions_barber_uidx
  on public.billing_subscriptions (barber_id)
  where barber_id is not null;

create unique index if not exists billing_subscriptions_shop_uidx
  on public.billing_subscriptions (shop_id)
  where shop_id is not null;

create unique index if not exists billing_subscriptions_client_uidx
  on public.billing_subscriptions (client_id)
  where client_id is not null;

create index if not exists billing_subscriptions_customer_idx
  on public.billing_subscriptions (provider_customer_id)
  where provider_customer_id is not null;

drop policy if exists "billing subscriptions barber self select" on public.billing_subscriptions;
drop policy if exists "billing subscriptions owner manager select" on public.billing_subscriptions;
drop policy if exists "billing subscriptions client self select" on public.billing_subscriptions;

create policy "billing subscriptions barber self select" on public.billing_subscriptions
  for select using (
    subject_type = 'barber'
    and exists (
      select 1
      from public.barbers b
      where b.id = billing_subscriptions.barber_id
        and b.profile_id = auth.uid()
    )
  );

create policy "billing subscriptions client self select" on public.billing_subscriptions
  for select using (
    subject_type = 'client'
    and exists (
      select 1
      from public.clients c
      join public.profiles p on p.id = c.profile_id
      where c.id = billing_subscriptions.client_id
        and p.id = auth.uid()
    )
  );

create policy "billing subscriptions owner manager select" on public.billing_subscriptions
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
      join public.staff_locations manager_scope on manager_scope.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'manager'
        and (
          (billing_subscriptions.subject_type = 'shop' and manager_scope.location_id = billing_subscriptions.shop_id)
          or (
            billing_subscriptions.subject_type = 'barber'
            and exists (
              select 1
              from public.barbers b
              join public.staff_locations barber_scope on barber_scope.profile_id = b.profile_id
              where b.id = billing_subscriptions.barber_id
                and barber_scope.location_id = manager_scope.location_id
            )
          )
          or (
            billing_subscriptions.subject_type = 'client'
            and exists (
              select 1
              from public.appointments a
              where a.client_id = billing_subscriptions.client_id
                and a.location_id = manager_scope.location_id
            )
          )
        )
    )
  );

create table if not exists public.loyalty_reward_rules (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null unique,
  title text not null,
  trigger_event text not null,
  active boolean not null default true,
  threshold_count integer not null default 1,
  every_nth_count integer,
  min_days_since_last_completion integer,
  requires_active_membership boolean not null default false,
  points_delta integer not null default 0,
  referral_credit_delta integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_reward_rules_trigger_check check (trigger_event in ('appointment_completed')),
  constraint loyalty_reward_rules_threshold_check check (threshold_count >= 1),
  constraint loyalty_reward_rules_every_nth_check check (every_nth_count is null or every_nth_count >= 1),
  constraint loyalty_reward_rules_days_check check (min_days_since_last_completion is null or min_days_since_last_completion >= 0)
);

create index if not exists loyalty_reward_rules_active_idx
  on public.loyalty_reward_rules (trigger_event, active, updated_at desc);

insert into public.loyalty_reward_rules (
  rule_code,
  title,
  trigger_event,
  active,
  threshold_count,
  every_nth_count,
  min_days_since_last_completion,
  requires_active_membership,
  points_delta,
  referral_credit_delta,
  metadata
)
values
  (
    'first_completed_visit_bonus',
    'First completed visit bonus',
    'appointment_completed',
    true,
    1,
    null,
    null,
    false,
    20,
    0,
    '{"kind":"behavior","description":"First completed visit"}'::jsonb
  ),
  (
    'repeat_visit_streak_bonus',
    'Repeat visit streak bonus',
    'appointment_completed',
    true,
    3,
    3,
    null,
    false,
    15,
    0,
    '{"kind":"behavior","description":"Every third completed visit"}'::jsonb
  ),
  (
    'comeback_bonus',
    'Comeback bonus',
    'appointment_completed',
    true,
    1,
    null,
    35,
    false,
    30,
    0,
    '{"kind":"time","description":"Return after 35 days"}'::jsonb
  ),
  (
    'member_completion_bonus',
    'Member completion bonus',
    'appointment_completed',
    true,
    1,
    null,
    null,
    true,
    10,
    0,
    '{"kind":"membership","description":"Bonus for active members"}'::jsonb
  )
on conflict (rule_code) do update
set
  title = excluded.title,
  active = excluded.active,
  threshold_count = excluded.threshold_count,
  every_nth_count = excluded.every_nth_count,
  min_days_since_last_completion = excluded.min_days_since_last_completion,
  requires_active_membership = excluded.requires_active_membership,
  points_delta = excluded.points_delta,
  referral_credit_delta = excluded.referral_credit_delta,
  metadata = excluded.metadata,
  updated_at = now();

create table if not exists public.marketplace_conversion_snapshots (
  id uuid primary key default gen_random_uuid(),
  scope_reference text not null unique,
  scope_kind text not null,
  location_id uuid references public.locations(id) on delete cascade,
  discovery_impressions integer not null default 0,
  profile_views integer not null default 0,
  booking_cta_clicks integer not null default 0,
  bookings_created integer not null default 0,
  bookings_completed integer not null default 0,
  follows_created integer not null default 0,
  haircut_now_impressions integer not null default 0,
  profile_shares integer not null default 0,
  referral_shares integer not null default 0,
  referral_invites integer not null default 0,
  referral_sign_ups integer not null default 0,
  referral_bookings integer not null default 0,
  referral_completed integer not null default 0,
  referral_credited integer not null default 0,
  discovery_to_booking_rate numeric(6,2) not null default 0,
  profile_to_booking_rate numeric(6,2) not null default 0,
  click_to_booking_rate numeric(6,2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint marketplace_conversion_snapshots_scope_check check (
    (scope_kind = 'network' and location_id is null and scope_reference = 'network')
    or (scope_kind = 'location' and location_id is not null)
  ),
  constraint marketplace_conversion_snapshots_non_negative_check check (
    discovery_impressions >= 0
    and profile_views >= 0
    and booking_cta_clicks >= 0
    and bookings_created >= 0
    and bookings_completed >= 0
    and follows_created >= 0
    and haircut_now_impressions >= 0
    and profile_shares >= 0
    and referral_shares >= 0
    and referral_invites >= 0
    and referral_sign_ups >= 0
    and referral_bookings >= 0
    and referral_completed >= 0
    and referral_credited >= 0
    and discovery_to_booking_rate >= 0
    and profile_to_booking_rate >= 0
    and click_to_booking_rate >= 0
  )
);

create index if not exists marketplace_conversion_snapshots_scope_idx
  on public.marketplace_conversion_snapshots (scope_kind, updated_at desc);

create index if not exists marketplace_conversion_snapshots_location_idx
  on public.marketplace_conversion_snapshots (location_id, updated_at desc)
  where location_id is not null;

alter table public.marketplace_conversion_snapshots enable row level security;
drop policy if exists "marketplace conversion snapshots owner manager select" on public.marketplace_conversion_snapshots;

create policy "marketplace conversion snapshots owner manager select" on public.marketplace_conversion_snapshots
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
        and sl.location_id = marketplace_conversion_snapshots.location_id
    )
  );
