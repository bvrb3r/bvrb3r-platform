alter table if exists public.billing_subscriptions
  add column if not exists client_id uuid references public.clients(id) on delete cascade,
  add column if not exists provider_customer_id text,
  add column if not exists provider_price_id text;

drop index if exists billing_subscriptions_client_uidx;
create unique index if not exists billing_subscriptions_client_uidx
  on public.billing_subscriptions (client_id)
  where client_id is not null;

create index if not exists billing_subscriptions_provider_customer_idx
  on public.billing_subscriptions (provider, provider_customer_id)
  where provider_customer_id is not null;

alter table if exists public.billing_subscriptions
  drop constraint if exists billing_subscriptions_subject_type_check,
  drop constraint if exists billing_subscriptions_subject_reference_check;

alter table if exists public.billing_subscriptions
  add constraint billing_subscriptions_subject_type_check check (subject_type in ('barber', 'shop', 'client')),
  add constraint billing_subscriptions_subject_reference_check check (
    (subject_type = 'barber' and barber_id is not null and shop_id is null and client_id is null)
    or (subject_type = 'shop' and shop_id is not null and barber_id is null and client_id is null)
    or (subject_type = 'client' and client_id is not null and barber_id is null and shop_id is null)
  );

drop policy if exists "billing subscriptions barber self select" on public.billing_subscriptions;
drop policy if exists "billing subscriptions client self select" on public.billing_subscriptions;
drop policy if exists "billing subscriptions owner manager select" on public.billing_subscriptions;

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
        )
    )
  );

alter table if exists public.referral_events
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

create unique index if not exists referral_events_credited_transaction_uidx
  on public.referral_events (credited_transaction_reference)
  where credited_transaction_reference is not null;

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
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_reward_rules_trigger_event_check check (trigger_event in ('completed_booking')),
  constraint loyalty_reward_rules_threshold_check check (threshold_count > 0),
  constraint loyalty_reward_rules_every_nth_check check (every_nth_count is null or every_nth_count > 0)
);

alter table if exists public.loyalty_reward_rules
  drop constraint if exists loyalty_reward_rules_trigger_check,
  drop constraint if exists loyalty_reward_rules_trigger_event_check;

alter table if exists public.loyalty_reward_rules
  add constraint loyalty_reward_rules_trigger_event_check
    check (trigger_event in ('completed_booking', 'appointment_completed'));

update public.loyalty_reward_rules
set trigger_event = 'completed_booking',
    updated_at = now()
where trigger_event = 'appointment_completed';

delete from public.loyalty_reward_rules
where rule_code in ('first_completed_visit_bonus', 'repeat_visit_streak_bonus');

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
  metadata
)
values
  (
    'repeat_third_visit_bonus',
    'Repeat third visit bonus',
    'completed_booking',
    true,
    3,
    3,
    null,
    false,
    40,
    '{"reason":"every third completed visit unlocks a loyalty bonus"}'::jsonb
  ),
  (
    'comeback_bonus',
    'Comeback booking bonus',
    'completed_booking',
    true,
    1,
    null,
    35,
    false,
    30,
    '{"reason":"returning after a long gap earns a reactivation reward"}'::jsonb
  ),
  (
    'member_completion_bonus',
    'Membership completion bonus',
    'completed_booking',
    true,
    1,
    null,
    null,
    true,
    15,
    '{"reason":"active membership boosts earned value on completed visits"}'::jsonb
  )
on conflict (rule_code) do update
set
  title = excluded.title,
  trigger_event = excluded.trigger_event,
  active = excluded.active,
  threshold_count = excluded.threshold_count,
  every_nth_count = excluded.every_nth_count,
  min_days_since_last_completion = excluded.min_days_since_last_completion,
  requires_active_membership = excluded.requires_active_membership,
  points_delta = excluded.points_delta,
  metadata = excluded.metadata,
  updated_at = now();

create table if not exists public.marketplace_conversion_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_scope text not null,
  location_id uuid references public.locations(id) on delete cascade,
  discovery_impressions integer not null default 0,
  profile_views integer not null default 0,
  booking_clicks integer not null default 0,
  bookings_created integer not null default 0,
  bookings_completed integer not null default 0,
  follows_created integer not null default 0,
  haircut_now_impressions integer not null default 0,
  share_count integer not null default 0,
  referral_shares integer not null default 0,
  referral_invites integer not null default 0,
  referral_sign_ups integer not null default 0,
  referral_bookings integer not null default 0,
  referral_completed integer not null default 0,
  referral_credited integer not null default 0,
  discovery_to_booking_rate numeric(5,2) not null default 0,
  profile_to_booking_rate numeric(5,2) not null default 0,
  click_to_booking_rate numeric(5,2) not null default 0,
  top_sources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint marketplace_conversion_snapshots_scope_uidx unique (snapshot_scope, location_id),
  constraint marketplace_conversion_snapshots_scope_check check (
    (snapshot_scope = 'network' and location_id is null)
    or (snapshot_scope = 'location' and location_id is not null)
  )
);

alter table if exists public.marketplace_conversion_snapshots
  add column if not exists snapshot_scope text,
  add column if not exists booking_clicks integer not null default 0,
  add column if not exists share_count integer not null default 0,
  add column if not exists top_sources jsonb not null default '[]'::jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marketplace_conversion_snapshots'
      and column_name = 'scope_kind'
  ) then
    execute '
      update public.marketplace_conversion_snapshots
      set snapshot_scope = coalesce(snapshot_scope, scope_kind)
      where snapshot_scope is null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marketplace_conversion_snapshots'
      and column_name = 'booking_cta_clicks'
  ) then
    execute '
      update public.marketplace_conversion_snapshots
      set booking_clicks = coalesce(booking_clicks, booking_cta_clicks)
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marketplace_conversion_snapshots'
      and column_name = 'profile_shares'
  ) then
    execute '
      update public.marketplace_conversion_snapshots
      set share_count = coalesce(share_count, coalesce(profile_shares, 0) + coalesce(referral_shares, 0))
    ';
  else
    execute '
      update public.marketplace_conversion_snapshots
      set share_count = coalesce(share_count, coalesce(referral_shares, 0))
    ';
  end if;
end $$;

update public.marketplace_conversion_snapshots
set snapshot_scope = case
  when location_id is null then 'network'
  else 'location'
end
where snapshot_scope is null;

create index if not exists marketplace_conversion_snapshots_updated_idx
  on public.marketplace_conversion_snapshots (snapshot_scope, updated_at desc);

create unique index if not exists marketplace_conversion_snapshots_network_uidx
  on public.marketplace_conversion_snapshots (snapshot_scope)
  where location_id is null;

create unique index if not exists marketplace_conversion_snapshots_location_uidx
  on public.marketplace_conversion_snapshots (snapshot_scope, location_id)
  where location_id is not null;

alter table public.loyalty_reward_rules enable row level security;
alter table public.marketplace_conversion_snapshots enable row level security;

drop policy if exists "loyalty reward rules owner select" on public.loyalty_reward_rules;
drop policy if exists "marketplace conversion snapshots owner manager select" on public.marketplace_conversion_snapshots;

create policy "loyalty reward rules owner select" on public.loyalty_reward_rules
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
  );

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
