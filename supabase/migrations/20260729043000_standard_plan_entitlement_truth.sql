-- Canonical BVRB3R plan doctrine: Standard / Pro / Elite.
-- Standard is a real $0 tier for every account role and is never a Stripe charge.
-- This migration is safe whether the earlier entitlement candidate was applied or omitted.

do $$
begin
  if to_regprocedure('private.rls_batch_5_is_platform_admin()') is null then
    raise exception 'private.rls_batch_5_is_platform_admin() is required before creating account entitlement policies';
  end if;
end $$;

create table if not exists public.account_entitlements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  account_role text not null,
  tier text not null default 'standard',
  billing_interval text not null default 'none',
  entitlement_status text not null default 'standard',
  source_of_truth text not null default 'server_default',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  trial_end timestamptz,
  last_stripe_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_entitlements
  drop constraint if exists account_entitlements_account_role_check,
  drop constraint if exists account_entitlements_tier_check,
  drop constraint if exists account_entitlements_billing_interval_check,
  drop constraint if exists account_entitlements_status_check,
  drop constraint if exists account_entitlements_source_check,
  drop constraint if exists account_entitlements_tier_interval_check,
  drop constraint if exists account_entitlements_free_status_check,
  drop constraint if exists account_entitlements_standard_status_check,
  drop constraint if exists account_entitlements_standard_zero_check;

alter table public.account_entitlements
  alter column tier set default 'standard',
  alter column billing_interval set default 'none',
  alter column entitlement_status set default 'standard';

update public.account_entitlements
set tier = 'standard',
    billing_interval = 'none',
    stripe_subscription_id = null,
    stripe_price_id = null,
    current_period_start = null,
    current_period_end = null,
    cancel_at = null,
    trial_end = null,
    updated_at = now()
where tier = 'free';

update public.account_entitlements
set entitlement_status = case
      when tier = 'standard' then 'standard'
      else 'needs_review'
    end,
    updated_at = now()
where entitlement_status = 'free';

alter table public.account_entitlements
  add constraint account_entitlements_account_role_check
    check (account_role in ('client_user', 'barber_user', 'shop_owner_user')) not valid,
  add constraint account_entitlements_tier_check
    check (tier in ('standard', 'pro', 'elite')) not valid,
  add constraint account_entitlements_billing_interval_check
    check (billing_interval in ('none', 'monthly', 'yearly')) not valid,
  add constraint account_entitlements_status_check
    check (entitlement_status in (
      'standard',
      'trialing',
      'active',
      'past_due',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'canceled',
      'paused',
      'needs_review'
    )) not valid,
  add constraint account_entitlements_source_check
    check (source_of_truth in ('server_default', 'stripe_webhook', 'manual_review')) not valid,
  add constraint account_entitlements_tier_interval_check
    check (
      (tier = 'standard' and billing_interval = 'none')
      or (tier in ('pro', 'elite') and billing_interval in ('monthly', 'yearly'))
    ) not valid,
  add constraint account_entitlements_standard_status_check
    check (
      (tier = 'standard' and entitlement_status = 'standard')
      or (
        tier in ('pro', 'elite')
        and entitlement_status <> 'standard'
      )
    ) not valid,
  add constraint account_entitlements_standard_zero_check
    check (
      tier <> 'standard'
      or (
        billing_interval = 'none'
        and stripe_subscription_id is null
        and stripe_price_id is null
      )
    ) not valid;

alter table public.account_entitlements
  validate constraint account_entitlements_account_role_check,
  validate constraint account_entitlements_tier_check,
  validate constraint account_entitlements_billing_interval_check,
  validate constraint account_entitlements_status_check,
  validate constraint account_entitlements_source_check,
  validate constraint account_entitlements_tier_interval_check,
  validate constraint account_entitlements_standard_status_check,
  validate constraint account_entitlements_standard_zero_check;

create unique index if not exists account_entitlements_profile_role_uidx
  on public.account_entitlements (profile_id, account_role);

create unique index if not exists account_entitlements_stripe_subscription_uidx
  on public.account_entitlements (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists account_entitlements_status_idx
  on public.account_entitlements (account_role, tier, entitlement_status, updated_at desc);

comment on table public.account_entitlements is
  'Server-owned canonical entitlement truth for Standard / Pro / Elite. Standard is $0 and is never billed.';

comment on column public.account_entitlements.tier is
  'Canonical plan tier only: standard, pro, elite. Legacy free values normalize to standard.';

comment on column public.account_entitlements.billing_interval is
  'Canonical billing interval: none for Standard; monthly or yearly for paid tiers.';

comment on column public.account_entitlements.last_stripe_event_id is
  'Stripe webhook event id last used to verify this row. Webhook idempotency remains anchored by public.stripe_webhook_events.';

revoke all on table public.account_entitlements from public;
revoke all on table public.account_entitlements from anon;
grant select on table public.account_entitlements to authenticated;
grant select, insert, update, delete on table public.account_entitlements to service_role;

alter table public.account_entitlements enable row level security;

drop policy if exists "account entitlements self select" on public.account_entitlements;
create policy "account entitlements self select"
on public.account_entitlements
for select
to authenticated
using ((select auth.uid()) = profile_id);

drop policy if exists "account entitlements platform admin select" on public.account_entitlements;
create policy "account entitlements platform admin select"
on public.account_entitlements
for select
to authenticated
using (private.rls_batch_5_is_platform_admin());

-- No authenticated insert/update/delete policies are created. Entitlement mutation is server-only.
