-- Staging ledger version: 20260803073210.
-- Product PR34: Stripe Billing, itemized owed balances, and server-owned lock truth.
-- Introduced after Product PR33 so numeric release merges remain forward-only.
-- Standard is exactly $0 and never creates a Stripe subscription.
-- Subscription billing stays separate from earnings, tips, payouts, and booth rent.

create schema if not exists private;

create table if not exists public.billing_balance_lines (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  account_role text not null check (account_role in ('client_user', 'barber_user', 'shop_owner_user')),
  source_type text not null check (source_type in ('subscription', 'refund_correction', 'dispute_reversal', 'no_show_fee')),
  source_reference text not null check (length(btrim(source_reference)) between 3 and 160),
  description text not null check (length(btrim(description)) between 3 and 500),
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_reference text,
  settlement_reference text,
  amount_cents integer not null check (amount_cents > 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0 and amount_paid_cents <= amount_cents),
  currency text not null default 'usd' check (currency = 'usd'),
  status text not null default 'open' check (status in ('open', 'disputed', 'paid', 'waived', 'void')),
  collection_paused boolean not null default false,
  dispute_reason text,
  due_at timestamptz,
  disputed_at timestamptz,
  resolved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_balance_lines_source_uidx unique (profile_id, source_type, source_reference),
  constraint billing_balance_lines_state_check check (
    (status = 'open' and collection_paused = false and disputed_at is null)
    or (status = 'disputed' and collection_paused = true and disputed_at is not null and dispute_reason is not null)
    or (status in ('paid', 'waived', 'void'))
  ),
  constraint billing_balance_lines_paid_check check (
    status <> 'paid'
    or (amount_paid_cents = amount_cents and paid_at is not null and settlement_reference is not null)
  )
);

create index if not exists billing_balance_lines_profile_status_idx
  on public.billing_balance_lines (profile_id, status, created_at desc);

create index if not exists billing_balance_lines_open_due_idx
  on public.billing_balance_lines (due_at, created_at)
  where status in ('open', 'disputed') and amount_paid_cents < amount_cents;

create index if not exists billing_balance_lines_settlement_reference_idx
  on public.billing_balance_lines (settlement_reference, id)
  where settlement_reference is not null;

create table if not exists public.billing_balance_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  account_role text not null check (account_role in ('client_user', 'barber_user', 'shop_owner_user')),
  line_id uuid references public.billing_balance_lines(id) on delete restrict,
  event_type text not null check (event_type in (
    'line_opened',
    'line_adjusted',
    'dispute_opened',
    'dispute_resolved',
    'balance_payment_created',
    'balance_payment_succeeded',
    'plan_change_requested',
    'subscription_checkout_created',
    'upgrade_submitted',
    'downgrade_scheduled',
    'cancel_scheduled',
    'subscription_restored'
  )),
  label text not null check (length(btrim(label)) between 3 and 300),
  provider text check (provider is null or provider = 'stripe'),
  provider_reference text,
  idempotency_key text check (idempotency_key is null or length(idempotency_key) between 8 and 180),
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint billing_balance_events_profile_type_idempotency_uidx
    unique (profile_id, event_type, idempotency_key)
);

create index if not exists billing_balance_events_profile_created_idx
  on public.billing_balance_events (profile_id, created_at desc);

create index if not exists billing_balance_events_line_created_idx
  on public.billing_balance_events (line_id, created_at desc)
  where line_id is not null;

create table if not exists public.billing_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  account_role text not null check (account_role in ('client_user', 'barber_user', 'shop_owner_user')),
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_payment_intent_id text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  line_ids uuid[] not null check (cardinality(line_ids) > 0),
  line_snapshot_hash text not null check (line_snapshot_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('initializing', 'requires_payment', 'processing', 'succeeded', 'failed', 'canceled')),
  idempotency_key text not null check (length(idempotency_key) between 16 and 128),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  confirmed_at timestamptz,
  constraint billing_payment_attempts_profile_idempotency_uidx unique (profile_id, idempotency_key),
  constraint billing_payment_attempts_provider_intent_uidx unique (provider, provider_payment_intent_id),
  constraint billing_payment_attempts_succeeded_check check (
    status <> 'succeeded'
    or (provider_payment_intent_id is not null and confirmed_at is not null)
  )
);

create index if not exists billing_payment_attempts_profile_created_idx
  on public.billing_payment_attempts (profile_id, created_at desc);

create unique index if not exists billing_payment_attempts_one_active_uidx
  on public.billing_payment_attempts (profile_id)
  where status in ('initializing', 'requires_payment', 'processing');

comment on table public.billing_balance_lines is
  'Itemized owed-balance truth. Any remaining amount blocks risk actions; rows are never deleted.';
comment on table public.billing_balance_events is
  'Append-only billing and balance history. Subscription billing is Stripe-only and separate from operating money.';
comment on table public.billing_payment_attempts is
  'Server-only Stripe PaymentIntent reservations for atomic pay-in-full settlement.';

revoke all on table public.billing_balance_lines from public, anon, authenticated;
revoke all on table public.billing_balance_events from public, anon, authenticated;
revoke all on table public.billing_payment_attempts from public, anon, authenticated;
grant select, insert, update on table public.billing_balance_lines to service_role;
grant select, insert on table public.billing_balance_events to service_role;
grant select, insert, update on table public.billing_payment_attempts to service_role;

alter table public.billing_balance_lines enable row level security;
alter table public.billing_balance_lines force row level security;
alter table public.billing_balance_events enable row level security;
alter table public.billing_balance_events force row level security;
alter table public.billing_payment_attempts enable row level security;
alter table public.billing_payment_attempts force row level security;

create or replace function private.pr34_reject_immutable_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'PR34 billing history is append-only';
end;
$$;

create or replace function private.pr34_touch_balance_line()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function private.pr34_guard_balance_line_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.profile_id is distinct from new.profile_id
     or old.account_role is distinct from new.account_role
     or old.source_type is distinct from new.source_type
     or old.source_reference is distinct from new.source_reference
     or old.description is distinct from new.description
     or old.provider is distinct from new.provider
     or old.provider_reference is distinct from new.provider_reference
     or old.amount_cents is distinct from new.amount_cents
     or old.currency is distinct from new.currency
     or old.created_at is distinct from new.created_at then
    raise exception 'PR34 balance source evidence is immutable';
  end if;

  if old.status in ('paid', 'waived', 'void') and (
    old.status is distinct from new.status
    or old.amount_paid_cents is distinct from new.amount_paid_cents
    or old.collection_paused is distinct from new.collection_paused
    or old.dispute_reason is distinct from new.dispute_reason
    or old.disputed_at is distinct from new.disputed_at
    or old.resolved_at is distinct from new.resolved_at
    or old.paid_at is distinct from new.paid_at
    or old.settlement_reference is distinct from new.settlement_reference
  ) then
    raise exception 'Resolved PR34 balance lines are immutable';
  end if;

  return new;
end;
$$;

create or replace function private.pr34_guard_payment_attempt_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.profile_id is distinct from new.profile_id
     or old.account_role is distinct from new.account_role
     or old.provider is distinct from new.provider
     or old.amount_cents is distinct from new.amount_cents
     or old.currency is distinct from new.currency
     or old.line_ids is distinct from new.line_ids
     or old.line_snapshot_hash is distinct from new.line_snapshot_hash
     or old.idempotency_key is distinct from new.idempotency_key
     or old.created_at is distinct from new.created_at then
    raise exception 'PR34 payment reservation evidence is immutable';
  end if;

  if old.provider_payment_intent_id is not null
     and old.provider_payment_intent_id is distinct from new.provider_payment_intent_id then
    raise exception 'PR34 Stripe payment evidence is immutable after binding';
  end if;

  if old.status in ('succeeded', 'failed', 'canceled') and (
    old.status is distinct from new.status
    or old.provider_payment_intent_id is distinct from new.provider_payment_intent_id
    or old.confirmed_at is distinct from new.confirmed_at
    or old.updated_at is distinct from new.updated_at
  ) then
    raise exception 'Terminal PR34 payment attempts are immutable';
  end if;

  if old.status = 'initializing' and new.status not in ('initializing', 'requires_payment', 'processing', 'failed', 'canceled') then
    raise exception 'Invalid PR34 payment-attempt transition';
  elsif old.status = 'requires_payment' and new.status not in ('requires_payment', 'processing', 'succeeded', 'failed', 'canceled') then
    raise exception 'Invalid PR34 payment-attempt transition';
  elsif old.status = 'processing' and new.status not in ('processing', 'succeeded', 'failed', 'canceled') then
    raise exception 'Invalid PR34 payment-attempt transition';
  end if;

  if new.status in ('requires_payment', 'processing', 'succeeded')
     and new.provider_payment_intent_id is null then
    raise exception 'Active PR34 payment attempts require Stripe evidence';
  end if;
  if new.status = 'succeeded' and new.confirmed_at is null then
    raise exception 'Successful PR34 payment attempts require confirmation evidence';
  elsif new.status <> 'succeeded' and new.confirmed_at is not null then
    raise exception 'Only successful PR34 payment attempts may be confirmed';
  end if;

  return new;
end;
$$;

create or replace function private.pr34_record_balance_line_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_label text;
begin
  if old.status is not distinct from new.status
     and old.amount_paid_cents is not distinct from new.amount_paid_cents
     and old.collection_paused is not distinct from new.collection_paused then
    return new;
  end if;

  if new.status = 'disputed' and old.status <> 'disputed' then
    v_event_type := 'dispute_opened';
    v_label := 'Collection paused while this line is reviewed';
  elsif new.status = 'paid' then
    v_event_type := 'balance_payment_succeeded';
    v_label := case
      when old.status = 'disputed' then 'Disputed balance line settled by verified Stripe payment'
      else 'Balance line paid through Stripe'
    end;
  elsif old.status = 'disputed' and new.status <> 'disputed' then
    v_event_type := 'dispute_resolved';
    v_label := 'Balance-line dispute resolved';
  else
    v_event_type := 'line_adjusted';
    v_label := 'Balance line state adjusted';
  end if;

  insert into public.billing_balance_events (
    profile_id,
    account_role,
    line_id,
    event_type,
    label,
    provider,
    provider_reference,
    actor_profile_id,
    metadata
  ) values (
    new.profile_id,
    new.account_role,
    new.id,
    v_event_type,
    v_label,
    new.provider,
    coalesce(new.settlement_reference, new.provider_reference),
    auth.uid(),
    jsonb_build_object(
      'previousStatus', old.status,
      'status', new.status,
      'previousAmountPaidCents', old.amount_paid_cents,
      'amountPaidCents', new.amount_paid_cents,
      'collectionPaused', new.collection_paused
    )
  );
  return new;
end;
$$;

create or replace function private.pr34_record_opened_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.billing_balance_events (
    profile_id,
    account_role,
    line_id,
    event_type,
    label,
    provider,
    provider_reference,
    idempotency_key,
    metadata
  ) values (
    new.profile_id,
    new.account_role,
    new.id,
    'line_opened',
    new.description,
    new.provider,
    new.provider_reference,
    null,
    jsonb_build_object(
      'sourceType', new.source_type,
      'sourceReference', new.source_reference,
      'amountCents', new.amount_cents,
      'currency', new.currency
    )
  );
  return new;
end;
$$;

revoke all on function private.pr34_reject_immutable_change() from public;
revoke all on function private.pr34_touch_balance_line() from public;
revoke all on function private.pr34_guard_balance_line_update() from public;
revoke all on function private.pr34_guard_payment_attempt_update() from public;
revoke all on function private.pr34_record_balance_line_change() from public;
revoke all on function private.pr34_record_opened_line() from public;

drop trigger if exists billing_balance_lines_guard on public.billing_balance_lines;
create trigger billing_balance_lines_guard
before update on public.billing_balance_lines
for each row execute function private.pr34_guard_balance_line_update();

drop trigger if exists billing_balance_lines_touch on public.billing_balance_lines;
create trigger billing_balance_lines_touch
before update on public.billing_balance_lines
for each row execute function private.pr34_touch_balance_line();

drop trigger if exists billing_balance_lines_no_delete on public.billing_balance_lines;
create trigger billing_balance_lines_no_delete
before delete on public.billing_balance_lines
for each row execute function private.pr34_reject_immutable_change();

drop trigger if exists billing_balance_lines_opened_event on public.billing_balance_lines;
create trigger billing_balance_lines_opened_event
after insert on public.billing_balance_lines
for each row execute function private.pr34_record_opened_line();

drop trigger if exists billing_balance_lines_change_event on public.billing_balance_lines;
create trigger billing_balance_lines_change_event
after update on public.billing_balance_lines
for each row execute function private.pr34_record_balance_line_change();

drop trigger if exists billing_balance_events_immutable on public.billing_balance_events;
create trigger billing_balance_events_immutable
before update or delete on public.billing_balance_events
for each row execute function private.pr34_reject_immutable_change();

drop trigger if exists billing_payment_attempts_no_delete on public.billing_payment_attempts;
create trigger billing_payment_attempts_no_delete
before delete on public.billing_payment_attempts
for each row execute function private.pr34_reject_immutable_change();

drop trigger if exists billing_payment_attempts_guard on public.billing_payment_attempts;
create trigger billing_payment_attempts_guard
before update on public.billing_payment_attempts
for each row execute function private.pr34_guard_payment_attempt_update();

create or replace function public.pr34_dispute_balance_line(
  p_line_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_line public.billing_balance_lines%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;
  if length(v_reason) < 10 or length(v_reason) > 1000 then
    raise exception 'Dispute reason must be between 10 and 1000 characters';
  end if;

  update public.billing_balance_lines
  set
    status = 'disputed',
    collection_paused = true,
    dispute_reason = v_reason,
    disputed_at = timezone('utc', now())
  where id = p_line_id
    and profile_id = v_actor
    and status = 'open'
    and amount_paid_cents < amount_cents
    and not exists (
      select 1
      from public.billing_payment_attempts as attempt
      where attempt.profile_id = v_actor
        and attempt.status in ('initializing', 'requires_payment', 'processing')
        and p_line_id = any(attempt.line_ids)
    )
  returning * into v_line;

  if v_line.id is null then
    raise exception 'Open balance line not found';
  end if;

  return jsonb_build_object(
    'lineId', v_line.id,
    'status', 'disputed',
    'collectionPaused', true
  );
end;
$$;

revoke all on function public.pr34_dispute_balance_line(uuid, text) from public, anon;
grant execute on function public.pr34_dispute_balance_line(uuid, text) to authenticated;

create or replace function public.pr34_finalize_balance_payment(
  p_attempt_id uuid,
  p_payment_intent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.billing_payment_attempts%rowtype;
  v_line_count integer;
  v_payable_count integer;
  v_remaining_cents bigint;
begin
  select *
  into v_attempt
  from public.billing_payment_attempts
  where id = p_attempt_id
  for update;

  if v_attempt.id is null then
    raise exception 'Balance payment attempt not found';
  end if;
  if v_attempt.status = 'succeeded' then
    if v_attempt.provider_payment_intent_id is distinct from p_payment_intent_id then
      raise exception 'Stripe payment evidence mismatch';
    end if;
    return jsonb_build_object('cleared', true, 'attemptId', v_attempt.id, 'alreadyFinalized', true);
  end if;
  if v_attempt.status not in ('requires_payment', 'processing') then
    raise exception 'Balance payment attempt is not eligible for finalization';
  end if;
  if v_attempt.provider <> 'stripe'
     or v_attempt.provider_payment_intent_id is null
     or v_attempt.provider_payment_intent_id <> p_payment_intent_id then
    raise exception 'Stripe payment evidence mismatch';
  end if;

  select
    count(*),
    count(*) filter (
      where profile_id = v_attempt.profile_id
        and status = 'open'
        and collection_paused = false
        and amount_paid_cents < amount_cents
    ),
    coalesce(sum(amount_cents - amount_paid_cents), 0)
  into v_line_count, v_payable_count, v_remaining_cents
  from public.billing_balance_lines
  where id = any(v_attempt.line_ids);

  if v_line_count <> cardinality(v_attempt.line_ids)
     or v_payable_count <> v_line_count
     or v_remaining_cents <> v_attempt.amount_cents then
    raise exception 'Balance changed after payment reservation';
  end if;

  update public.billing_balance_lines
  set
    amount_paid_cents = amount_cents,
    status = 'paid',
    collection_paused = false,
    settlement_reference = p_payment_intent_id,
    paid_at = timezone('utc', now()),
    resolved_at = timezone('utc', now())
  where id = any(v_attempt.line_ids)
    and profile_id = v_attempt.profile_id;

  update public.billing_payment_attempts
  set
    status = 'succeeded',
    confirmed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_attempt.id;

  insert into public.billing_balance_events (
    profile_id,
    account_role,
    event_type,
    label,
    provider,
    provider_reference,
    idempotency_key,
    actor_profile_id,
    metadata
  ) values (
    v_attempt.profile_id,
    v_attempt.account_role,
    'balance_payment_succeeded',
    'Balance paid in full and account lock cleared',
    'stripe',
    p_payment_intent_id,
    'balance-finalize:' || v_attempt.id::text,
    v_attempt.profile_id,
    jsonb_build_object(
      'attemptId', v_attempt.id,
      'amountCents', v_attempt.amount_cents,
      'currency', v_attempt.currency,
      'lineCount', cardinality(v_attempt.line_ids)
    )
  );

  return jsonb_build_object(
    'cleared', true,
    'attemptId', v_attempt.id,
    'amountCents', v_attempt.amount_cents
  );
end;
$$;

revoke all on function public.pr34_finalize_balance_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.pr34_finalize_balance_payment(uuid, text) to service_role;
