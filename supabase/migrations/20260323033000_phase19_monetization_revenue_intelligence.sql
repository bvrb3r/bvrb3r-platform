create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  barber_id uuid references public.barbers(id) on delete cascade,
  shop_id uuid references public.locations(id) on delete cascade,
  provider text not null default 'manual',
  provider_subscription_id text,
  plan_code text not null,
  plan_name text not null,
  plan_interval text not null default 'monthly',
  unit_amount_cents integer not null default 0,
  currency text not null default 'usd',
  subscription_status text not null default 'draft',
  billing_state text not null default 'not_started',
  entitlement_status text not null default 'limited',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at timestamptz,
  last_invoiced_at timestamptz,
  last_paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_subject_type_check check (subject_type in ('barber', 'shop')),
  constraint billing_subscriptions_provider_check check (provider in ('manual', 'stripe_billing')),
  constraint billing_subscriptions_plan_interval_check check (plan_interval in ('monthly', 'annual', 'custom')),
  constraint billing_subscriptions_subscription_status_check check (subscription_status in ('draft', 'trialing', 'active', 'past_due', 'paused', 'cancelled')),
  constraint billing_subscriptions_billing_state_check check (billing_state in ('not_started', 'pending', 'current', 'past_due', 'cancelled')),
  constraint billing_subscriptions_entitlement_status_check check (entitlement_status in ('locked', 'limited', 'enabled')),
  constraint billing_subscriptions_amount_check check (unit_amount_cents >= 0),
  constraint billing_subscriptions_currency_check check (currency = lower(currency)),
  constraint billing_subscriptions_subject_reference_check check (
    (subject_type = 'barber' and barber_id is not null and shop_id is null)
    or (subject_type = 'shop' and shop_id is not null and barber_id is null)
  )
);

create unique index if not exists billing_subscriptions_barber_uidx
  on public.billing_subscriptions (barber_id)
  where barber_id is not null;

create unique index if not exists billing_subscriptions_shop_uidx
  on public.billing_subscriptions (shop_id)
  where shop_id is not null;

create unique index if not exists billing_subscriptions_provider_account_uidx
  on public.billing_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists billing_subscriptions_status_idx
  on public.billing_subscriptions (subject_type, subscription_status, billing_state, updated_at desc);

create table if not exists public.location_monetization_snapshots (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  gross_revenue numeric(12,2) not null default 0,
  completed_services integer not null default 0,
  appointment_count integer not null default 0,
  platform_fee_revenue numeric(12,2) not null default 0,
  processor_fee_visibility numeric(12,2) not null default 0,
  subscription_revenue numeric(12,2) not null default 0,
  promotion_discount_impact numeric(12,2) not null default 0,
  promotion_attributed_revenue numeric(12,2) not null default 0,
  repeat_client_revenue numeric(12,2) not null default 0,
  retained_revenue_share numeric(5,2) not null default 0,
  revenue_at_risk numeric(12,2) not null default 0,
  referral_conversion_count integer not null default 0,
  referral_conversion_revenue numeric(12,2) not null default 0,
  loyalty_participants integer not null default 0,
  loyalty_redemptions integer not null default 0,
  loyalty_revenue numeric(12,2) not null default 0,
  rebooking_influenced_revenue numeric(12,2) not null default 0,
  top_offers jsonb not null default '[]'::jsonb,
  barber_contribution jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint location_monetization_snapshots_location_uidx unique (location_id),
  constraint location_monetization_snapshots_non_negative_check check (
    gross_revenue >= 0
    and completed_services >= 0
    and appointment_count >= 0
    and platform_fee_revenue >= 0
    and processor_fee_visibility >= 0
    and subscription_revenue >= 0
    and promotion_discount_impact >= 0
    and promotion_attributed_revenue >= 0
    and repeat_client_revenue >= 0
    and retained_revenue_share >= 0
    and retained_revenue_share <= 100
    and revenue_at_risk >= 0
    and referral_conversion_count >= 0
    and referral_conversion_revenue >= 0
    and loyalty_participants >= 0
    and loyalty_redemptions >= 0
    and loyalty_revenue >= 0
    and rebooking_influenced_revenue >= 0
  )
);

create index if not exists location_monetization_snapshots_updated_idx
  on public.location_monetization_snapshots (updated_at desc);

create table if not exists public.barber_revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  gross_revenue numeric(12,2) not null default 0,
  week_revenue numeric(12,2) not null default 0,
  month_revenue numeric(12,2) not null default 0,
  repeat_client_revenue numeric(12,2) not null default 0,
  repeat_client_share numeric(5,2) not null default 0,
  outstanding_balance numeric(12,2) not null default 0,
  average_tip numeric(12,2) not null default 0,
  top_clients jsonb not null default '[]'::jsonb,
  service_mix jsonb not null default '[]'::jsonb,
  trends jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint barber_revenue_snapshots_barber_uidx unique (barber_id),
  constraint barber_revenue_snapshots_non_negative_check check (
    gross_revenue >= 0
    and week_revenue >= 0
    and month_revenue >= 0
    and repeat_client_revenue >= 0
    and repeat_client_share >= 0
    and repeat_client_share <= 100
    and outstanding_balance >= 0
    and average_tip >= 0
  )
);

create index if not exists barber_revenue_snapshots_updated_idx
  on public.barber_revenue_snapshots (updated_at desc);

create table if not exists public.promotion_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  shop_id uuid not null references public.locations(id) on delete cascade,
  redemptions integer not null default 0,
  discount_impact numeric(12,2) not null default 0,
  attributed_revenue numeric(12,2) not null default 0,
  net_revenue_after_discount numeric(12,2) not null default 0,
  average_discount numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint promotion_performance_snapshots_promotion_uidx unique (promotion_id),
  constraint promotion_performance_snapshots_non_negative_check check (
    redemptions >= 0
    and discount_impact >= 0
    and attributed_revenue >= 0
    and net_revenue_after_discount >= 0
    and average_discount >= 0
  )
);

create index if not exists promotion_performance_snapshots_shop_idx
  on public.promotion_performance_snapshots (shop_id, updated_at desc);

alter table public.billing_subscriptions enable row level security;
alter table public.location_monetization_snapshots enable row level security;
alter table public.barber_revenue_snapshots enable row level security;
alter table public.promotion_performance_snapshots enable row level security;

drop policy if exists "billing subscriptions barber self select" on public.billing_subscriptions;
drop policy if exists "billing subscriptions owner manager select" on public.billing_subscriptions;
drop policy if exists "location monetization owner manager select" on public.location_monetization_snapshots;
drop policy if exists "barber revenue snapshots barber self select" on public.barber_revenue_snapshots;
drop policy if exists "barber revenue snapshots owner manager select" on public.barber_revenue_snapshots;
drop policy if exists "promotion performance owner manager select" on public.promotion_performance_snapshots;

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

create policy "location monetization owner manager select" on public.location_monetization_snapshots
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
        and sl.location_id = location_monetization_snapshots.location_id
    )
  );

create policy "barber revenue snapshots barber self select" on public.barber_revenue_snapshots
  for select using (
    exists (
      select 1
      from public.barbers b
      where b.id = barber_revenue_snapshots.barber_id
        and b.profile_id = auth.uid()
    )
  );

create policy "barber revenue snapshots owner manager select" on public.barber_revenue_snapshots
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
        and exists (
          select 1
          from public.barbers b
          join public.staff_locations barber_scope on barber_scope.profile_id = b.profile_id
          where b.id = barber_revenue_snapshots.barber_id
            and barber_scope.location_id = manager_scope.location_id
        )
    )
  );

create policy "promotion performance owner manager select" on public.promotion_performance_snapshots
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
        and sl.location_id = promotion_performance_snapshots.shop_id
    )
  );
