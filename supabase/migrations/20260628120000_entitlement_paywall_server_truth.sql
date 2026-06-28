-- Roadmap PR #49 protected-risk migration candidate.
-- Adds server-owned account entitlement truth for Free / Pro / Elite.
-- This migration is additive only and must not be applied to production without founder approval.

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
  tier text not null default 'free',
  billing_interval text not null default 'none',
  entitlement_status text not null default 'free',
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
  updated_at timestamptz not null default now(),
  constraint account_entitlements_account_role_check
    check (account_role in ('client_user', 'barber_user', 'shop_owner_user')),
  constraint account_entitlements_tier_check
    check (tier in ('free', 'pro', 'elite')),
  constraint account_entitlements_billing_interval_check
    check (billing_interval in ('none', 'monthly', 'yearly')),
  constraint account_entitlements_status_check
    check (entitlement_status in (
      'free',
      'trialing',
      'active',
      'past_due',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'canceled',
      'paused',
      'needs_review'
    )),
  constraint account_entitlements_source_check
    check (source_of_truth in ('server_default', 'stripe_webhook', 'manual_review')),
  constraint account_entitlements_tier_interval_check
    check (
      (tier = 'free' and billing_interval = 'none')
      or (tier in ('pro', 'elite') and billing_interval in ('monthly', 'yearly'))
    ),
  constraint account_entitlements_free_status_check
    check (
      (tier = 'free' and entitlement_status = 'free')
      or tier in ('pro', 'elite')
    )
);

create unique index if not exists account_entitlements_profile_role_uidx
  on public.account_entitlements (profile_id, account_role);

create unique index if not exists account_entitlements_stripe_subscription_uidx
  on public.account_entitlements (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists account_entitlements_status_idx
  on public.account_entitlements (account_role, tier, entitlement_status, updated_at desc);

comment on table public.account_entitlements is
  'Server-owned canonical entitlement truth for Free / Pro / Elite. UI state, URL params, and localStorage do not grant access.';

comment on column public.account_entitlements.account_role is
  'Canonical public account role only: client_user, barber_user, shop_owner_user.';

comment on column public.account_entitlements.tier is
  'Canonical entitlement tier only: free, pro, elite. standard is intentionally unsupported.';

comment on column public.account_entitlements.billing_interval is
  'Canonical billing interval only: none for free, monthly or yearly for paid tiers. weekly is intentionally unsupported here.';

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
