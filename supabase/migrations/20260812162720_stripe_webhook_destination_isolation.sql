alter table public.stripe_webhook_events
  add column if not exists destination text;

update public.stripe_webhook_events
set destination = case
  when event_type like 'identity.%' then 'identity'
  when stripe_account_id is not null then 'connect'
  else 'platform'
end
where destination is null;

alter table public.stripe_webhook_events
  alter column destination set default 'platform',
  alter column destination set not null;

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_destination_ck,
  drop constraint if exists stripe_webhook_events_stripe_event_id_key;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_destination_ck
  check (destination in ('platform', 'connect', 'identity'));

create unique index if not exists stripe_webhook_events_destination_event_uidx
  on public.stripe_webhook_events (destination, stripe_event_id);

create index if not exists stripe_webhook_events_destination_status_idx
  on public.stripe_webhook_events (destination, processing_status, received_at desc);

create index if not exists stripe_webhook_events_connected_account_idx
  on public.stripe_webhook_events (connected_account_id)
  where connected_account_id is not null;

grant select, insert, update on table public.stripe_webhook_events
  to service_role;

alter table public.connected_accounts
  add column if not exists provider_payout_block_reason text,
  add column if not exists provider_payout_blocked_at timestamptz,
  add column if not exists provider_payout_block_destination_id text,
  add column if not exists provider_payout_block_currency text,
  add column if not exists provider_payout_block_cleared_at timestamptz;

grant select, insert, update on table public.connected_accounts
  to service_role;

create or replace function private.protect_connected_account_provider_payout_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  request_claims text := nullif(current_setting('request.jwt.claims', true), '');
  request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  if request_claims is not null then
    request_role := coalesce(request_claims::jsonb ->> 'role', request_role);
  end if;

  if new.provider_payout_block_reason is not null
    and new.payout_readiness_status <> 'blocked' then
    raise exception 'an active provider payout block requires blocked payout readiness'
      using errcode = '23514';
  end if;

  if current_user::text in ('anon', 'authenticated')
    or request_role in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.provider_account_id is not null
        or new.onboarding_status <> 'not_started'
        or new.payout_readiness_status <> 'not_ready'
        or new.legal_readiness_status <> 'pending'
        or new.tax_readiness_status <> 'pending'
        or new.requirements_currently_due <> '[]'::jsonb
        or new.requirements_eventually_due <> '[]'::jsonb
        or new.requirements_past_due <> '[]'::jsonb
        or new.disabled_reason is not null
        or new.charges_enabled
        or new.payouts_enabled
        or new.last_checked_at is not null
        or new.onboarding_started_at is not null
        or new.onboarding_completed_at is not null
        or new.processor_last_synced_at is not null
        or new.processor_last_event_id is not null
        or new.processor_last_event_type is not null
        or new.provider_payout_block_reason is not null
        or new.provider_payout_blocked_at is not null
        or new.provider_payout_block_destination_id is not null
        or new.provider_payout_block_currency is not null
        or new.provider_payout_block_cleared_at is not null then
        raise exception 'connected-account provider and readiness fields are server-managed'
          using errcode = '42501';
      end if;
    elsif new.provider_account_id is distinct from old.provider_account_id
      or new.onboarding_status is distinct from old.onboarding_status
      or new.payout_readiness_status is distinct from old.payout_readiness_status
      or new.legal_readiness_status is distinct from old.legal_readiness_status
      or new.tax_readiness_status is distinct from old.tax_readiness_status
      or new.requirements_currently_due is distinct from old.requirements_currently_due
      or new.requirements_eventually_due is distinct from old.requirements_eventually_due
      or new.requirements_past_due is distinct from old.requirements_past_due
      or new.disabled_reason is distinct from old.disabled_reason
      or new.charges_enabled is distinct from old.charges_enabled
      or new.payouts_enabled is distinct from old.payouts_enabled
      or new.last_checked_at is distinct from old.last_checked_at
      or new.onboarding_started_at is distinct from old.onboarding_started_at
      or new.onboarding_completed_at is distinct from old.onboarding_completed_at
      or new.processor_last_synced_at is distinct from old.processor_last_synced_at
      or new.processor_last_event_id is distinct from old.processor_last_event_id
      or new.processor_last_event_type is distinct from old.processor_last_event_type
      or new.provider_payout_block_reason is distinct from old.provider_payout_block_reason
      or new.provider_payout_blocked_at is distinct from old.provider_payout_blocked_at
      or new.provider_payout_block_destination_id is distinct from old.provider_payout_block_destination_id
      or new.provider_payout_block_currency is distinct from old.provider_payout_block_currency
      or new.provider_payout_block_cleared_at is distinct from old.provider_payout_block_cleared_at then
      raise exception 'connected-account provider and readiness fields are server-managed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_connected_account_provider_payout_fields()
  from public, anon, authenticated;
grant execute on function private.protect_connected_account_provider_payout_fields()
  to service_role;

drop trigger if exists protect_connected_account_provider_payout_fields
  on public.connected_accounts;

create trigger protect_connected_account_provider_payout_fields
before insert or update on public.connected_accounts
for each row execute function private.protect_connected_account_provider_payout_fields();

drop function if exists public.protect_connected_account_provider_payout_fields();

create or replace function public.apply_connected_account_payout_block(
  p_connected_account_id uuid,
  p_event_at timestamptz,
  p_reason text,
  p_destination_id text,
  p_currency text
)
returns setof public.connected_accounts
language sql
security definer
set search_path = ''
as $$
  update public.connected_accounts
  set provider_payout_block_reason = p_reason,
      provider_payout_blocked_at = p_event_at,
      provider_payout_block_destination_id = p_destination_id,
      provider_payout_block_currency = p_currency,
      payout_readiness_status = 'blocked',
      updated_at = now()
  where id = p_connected_account_id
    and coalesce(provider_payout_blocked_at, '-infinity'::timestamptz) < p_event_at
    and coalesce(provider_payout_block_cleared_at, '-infinity'::timestamptz) < p_event_at
  returning *;
$$;

revoke all on function public.apply_connected_account_payout_block(uuid, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_connected_account_payout_block(uuid, timestamptz, text, text, text)
  to service_role;

create or replace function public.clear_connected_account_payout_block(
  p_connected_account_id uuid,
  p_expected_blocked_at timestamptz,
  p_expected_destination_id text,
  p_clear_event_at timestamptz
)
returns setof public.connected_accounts
language sql
security definer
set search_path = ''
as $$
  update public.connected_accounts
  set provider_payout_block_reason = null,
      provider_payout_blocked_at = null,
      provider_payout_block_destination_id = null,
      provider_payout_block_currency = null,
      provider_payout_block_cleared_at = p_clear_event_at,
      updated_at = now()
  where id = p_connected_account_id
    and provider_payout_blocked_at = p_expected_blocked_at
    and provider_payout_block_destination_id is not distinct from p_expected_destination_id
    and p_clear_event_at >= provider_payout_blocked_at
  returning *;
$$;

revoke all on function public.clear_connected_account_payout_block(uuid, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.clear_connected_account_payout_block(uuid, timestamptz, text, timestamptz)
  to service_role;

create table if not exists public.connected_account_payouts (
  id uuid primary key default gen_random_uuid(),
  connected_account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider_account_id text not null,
  provider_payout_id text not null,
  payout_status text not null check (payout_status in ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  arrival_at timestamptz,
  automatic boolean not null default false,
  payout_method text,
  destination_type text,
  destination_external_account_id text,
  balance_transaction_id text,
  failure_balance_transaction_id text,
  failure_code text,
  failure_message_safe text,
  livemode boolean not null default false,
  provider_created_at timestamptz,
  last_event_id text not null,
  last_event_type text not null,
  last_event_created_at timestamptz not null,
  paid_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connected_account_id, provider_payout_id)
);

create index if not exists connected_account_payouts_account_status_idx
  on public.connected_account_payouts (connected_account_id, payout_status, updated_at desc);

create index if not exists connected_account_payouts_provider_account_idx
  on public.connected_account_payouts (provider_account_id, updated_at desc);

create or replace function private.preserve_connected_account_payout_event_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.last_event_created_at < old.last_event_created_at then
    return old;
  end if;

  if new.last_event_created_at = old.last_event_created_at
    and (case old.payout_status
      when 'failed' then 5
      when 'canceled' then 4
      when 'paid' then 3
      when 'in_transit' then 2
      else 1
    end) > (case new.payout_status
      when 'failed' then 5
      when 'canceled' then 4
      when 'paid' then 3
      when 'in_transit' then 2
      else 1
    end) then
    return old;
  end if;

  new.paid_at := coalesce(new.paid_at, old.paid_at);
  new.failed_at := coalesce(new.failed_at, old.failed_at);
  new.canceled_at := coalesce(new.canceled_at, old.canceled_at);

  return new;
end;
$$;

revoke all on function private.preserve_connected_account_payout_event_order()
  from public, anon, authenticated;
grant execute on function private.preserve_connected_account_payout_event_order()
  to service_role;

drop trigger if exists preserve_connected_account_payout_event_order
  on public.connected_account_payouts;

create trigger preserve_connected_account_payout_event_order
before update on public.connected_account_payouts
for each row execute function private.preserve_connected_account_payout_event_order();

drop function if exists public.preserve_connected_account_payout_event_order();

alter table public.connected_account_payouts enable row level security;

revoke all on table public.connected_account_payouts from anon, authenticated;
revoke all on table public.connected_account_payouts from service_role;
grant select, insert, update on table public.connected_account_payouts to service_role;

drop policy if exists "connected account payouts service role only"
  on public.connected_account_payouts;

create policy "connected account payouts service role only"
  on public.connected_account_payouts
  for all
  to service_role
  using (true)
  with check (true);
