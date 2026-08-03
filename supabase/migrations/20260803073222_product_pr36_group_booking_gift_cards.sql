-- Staging ledger version: 20260803073222.
begin;

-- =========================================================
-- Product PR36: group booking
-- =========================================================

create table if not exists public.group_bookings (
  id uuid primary key default gen_random_uuid(),
  control_token_hash text not null unique,
  organizer_profile_id uuid references public.profiles(id) on delete set null,
  organizer_session_key text,
  organizer_name text not null,
  organizer_email text not null,
  organizer_phone text not null,
  location_id uuid not null references public.locations(id) on delete restrict,
  payment_mode text not null check (payment_mode in ('organizer', 'split')),
  member_count integer not null check (member_count between 2 and 6),
  total_service_cents integer not null check (total_service_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  status text not null default 'holding'
    check (status in ('holding', 'confirmed', 'partially_cancelled', 'cancelled', 'expired', 'needs_review')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  holds_expire_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_bookings_owner_present check (
    organizer_profile_id is not null or nullif(btrim(organizer_session_key), '') is not null
  ),
  constraint group_bookings_window_order check (ends_at > starts_at)
);

create index if not exists group_bookings_owner_profile_idx
  on public.group_bookings (organizer_profile_id, created_at desc)
  where organizer_profile_id is not null;
create index if not exists group_bookings_status_expiry_idx
  on public.group_bookings (status, holds_expire_at);

create table if not exists public.group_booking_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_bookings(id) on delete cascade,
  member_key text not null,
  full_name text not null,
  email text not null,
  phone text not null,
  is_minor boolean not null default false,
  is_organizer boolean not null default false,
  hold_id uuid not null unique references public.booking_slot_holds(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,
  appointment_id uuid unique references public.appointments(id) on delete set null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  status text not null default 'held'
    check (status in ('held', 'confirmed', 'cancelled', 'expired', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, member_key)
);

create index if not exists group_booking_members_group_status_idx
  on public.group_booking_members (group_id, status);
create index if not exists group_booking_members_appointment_idx
  on public.group_booking_members (appointment_id)
  where appointment_id is not null;

-- These rows are server-owned payment responsibility, not proof that money
-- moved. Stripe checkout at the chair may later fulfill one intent. A minor is
-- always assigned to the organizer; no browser can propose the amount.
create table if not exists public.group_booking_payment_intents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_bookings(id) on delete cascade,
  member_id uuid not null unique references public.group_booking_members(id) on delete cascade,
  payer_kind text not null check (payer_kind in ('organizer', 'member')),
  payer_email text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  status text not null default 'planned'
    check (status in ('planned', 'link_queued', 'ready_at_checkout', 'paid', 'cancelled', 'needs_review')),
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_booking_payment_intents_group_idx
  on public.group_booking_payment_intents (group_id, status);

-- Kiosk group requests intentionally do not invent a wait estimate or claim a
-- live chair. A device session may record the request; the queue/floor confirms
-- actual capacity before a position is shown.
create table if not exists public.kiosk_group_requests (
  id uuid primary key default gen_random_uuid(),
  shop_reference text not null,
  requester_name text not null,
  requester_phone text not null,
  requester_email text,
  group_size integer not null check (group_size between 2 and 6),
  seating_mode text not null check (seating_mode in ('together', 'fastest')),
  operational_sms_consent boolean not null default false,
  idempotency_key text not null,
  status text not null check (status in ('waiting_for_group_capacity', 'waiting_for_individual_capacity', 'seated', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_reference, idempotency_key)
);

create index if not exists kiosk_group_requests_shop_status_idx
  on public.kiosk_group_requests (shop_reference, status, created_at);

alter table public.group_bookings enable row level security;
alter table public.group_booking_members enable row level security;
alter table public.group_booking_payment_intents enable row level security;
alter table public.kiosk_group_requests enable row level security;
alter table public.group_bookings force row level security;
alter table public.group_booking_members force row level security;
alter table public.group_booking_payment_intents force row level security;
alter table public.kiosk_group_requests force row level security;

revoke all on public.group_bookings, public.group_booking_members,
  public.group_booking_payment_intents, public.kiosk_group_requests from public, anon, authenticated;
grant select, insert, update, delete on public.group_bookings, public.group_booking_members,
  public.group_booking_payment_intents, public.kiosk_group_requests to service_role;

create or replace function public.pr36_confirm_group_booking(
  p_group_id uuid,
  p_control_token_hash text,
  p_members jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_group public.group_bookings%rowtype;
  v_member public.group_booking_members%rowtype;
  v_barber_id uuid;
  v_client_id uuid;
  v_hold_hash text;
  v_result jsonb;
  v_appointments jsonb := '[]'::jsonb;
  v_failed_reason text := 'group_confirmation_failed';
begin
  if p_group_id is null or p_control_token_hash is null or jsonb_typeof(p_members) <> 'array' then
    return jsonb_build_object('outcome', 'validation', 'reason', 'missing_required_input');
  end if;

  select * into v_group
    from public.group_bookings
   where id = p_group_id
     and control_token_hash = p_control_token_hash
   for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found', 'reason', 'group_not_found');
  end if;

  if v_group.status = 'confirmed' then
    return jsonb_build_object(
      'outcome', 'confirmed',
      'groupId', v_group.id,
      'alreadyConfirmed', true,
      'appointments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'memberId', m.id,
          'appointmentId', m.appointment_id,
          'status', m.status
        ) order by m.created_at)
        from public.group_booking_members m
        where m.group_id = v_group.id
      ), '[]'::jsonb)
    );
  end if;

  if v_group.status <> 'holding' or v_group.holds_expire_at <= now() then
    update public.group_bookings
       set status = case when status = 'holding' then 'expired' else status end,
           updated_at = now()
     where id = v_group.id;
    return jsonb_build_object('outcome', 'expired', 'reason', 'group_holds_expired');
  end if;

  if jsonb_array_length(p_members) <> v_group.member_count then
    return jsonb_build_object('outcome', 'validation', 'reason', 'member_count_mismatch');
  end if;

  -- Pre-validate every client and hold before any confirmation is attempted.
  for v_member in
    select * from public.group_booking_members where group_id = v_group.id order by created_at for update
  loop
    select (item ->> 'clientId')::uuid into v_client_id
      from jsonb_array_elements(p_members) item
     where item ->> 'memberId' = v_member.id::text
     limit 1;

    if v_client_id is null or not exists (select 1 from public.clients where id = v_client_id) then
      return jsonb_build_object('outcome', 'validation', 'reason', 'client_not_found', 'memberId', v_member.id);
    end if;

    if not exists (
      select 1
        from public.booking_slot_holds h
       where h.id = v_member.hold_id
         and h.status = 'active'
         and h.expires_at > now()
         and (
           (v_group.organizer_profile_id is not null and h.owner_profile_id = v_group.organizer_profile_id)
           or (v_group.organizer_session_key is not null and h.owner_session_key = v_group.organizer_session_key)
         )
    ) then
      return jsonb_build_object('outcome', 'expired', 'reason', 'member_hold_unavailable', 'memberId', v_member.id);
    end if;
  end loop;

  -- PR20 serializes one barber timeline at a time. A group may span several
  -- barbers, so acquire every advisory lock up front in UUID order. Without a
  -- global order, two overlapping groups could lock A then B / B then A and
  -- deadlock while confirming their second member.
  for v_barber_id in
    select distinct hold.barber_id
    from public.group_booking_members member
    join public.booking_slot_holds hold on hold.id = member.hold_id
    where member.group_id = v_group.id
    order by hold.barber_id
  loop
    perform private.pr20_lock_barber_timeline(v_barber_id);
  end loop;

  -- PL/pgSQL exception blocks are subtransactions. If an unexpected race makes
  -- any member fail, every appointment created inside this block rolls back.
  begin
    for v_member in
      select * from public.group_booking_members where group_id = v_group.id order by created_at for update
    loop
      select (item ->> 'clientId')::uuid into v_client_id
        from jsonb_array_elements(p_members) item
       where item ->> 'memberId' = v_member.id::text
       limit 1;
      select token_hash into v_hold_hash from public.booking_slot_holds where id = v_member.hold_id;

      v_result := public.pr20_confirm_booking(
        v_hold_hash,
        v_group.organizer_profile_id,
        v_group.organizer_session_key,
        v_client_id,
        v_group.organizer_profile_id,
        'client_user',
        'Group booking ' || v_group.id::text || ' · member ' || v_member.id::text,
        'pr36:' || v_group.id::text || ':' || v_member.id::text,
        pg_catalog.md5(v_group.id::text || ':' || v_member.id::text),
        v_group.id::text || ':' || v_member.id::text
      );

      if v_result ->> 'outcome' <> 'confirmed' then
        v_failed_reason := coalesce(v_result ->> 'reason', v_result ->> 'outcome', 'group_confirmation_failed');
        raise exception 'pr36_group_confirmation_failed';
      end if;

      update public.group_booking_members
         set client_id = v_client_id,
             appointment_id = (v_result ->> 'appointmentId')::uuid,
             status = 'confirmed',
             updated_at = now()
       where id = v_member.id;

      v_appointments := v_appointments || jsonb_build_array(jsonb_build_object(
        'memberId', v_member.id,
        'appointmentId', v_result ->> 'appointmentId',
        'startsAt', v_result ->> 'startsAt',
        'status', 'confirmed'
      ));
    end loop;

    update public.group_bookings
       set status = 'confirmed', confirmed_at = now(), updated_at = now()
     where id = v_group.id;
  exception when others then
    return jsonb_build_object('outcome', 'conflict', 'reason', v_failed_reason);
  end;

  return jsonb_build_object(
    'outcome', 'confirmed',
    'groupId', v_group.id,
    'alreadyConfirmed', false,
    'appointments', v_appointments
  );
end;
$$;

revoke all on function public.pr36_confirm_group_booking(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.pr36_confirm_group_booking(uuid, text, jsonb) to service_role;

create or replace function private.pr36_sync_cancelled_group_member()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_active integer;
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    update public.group_booking_members
       set status = 'cancelled', updated_at = now()
     where appointment_id = new.id
     returning group_id into v_group_id;

    if v_group_id is not null then
      select count(*) into v_active
        from public.group_booking_members
       where group_id = v_group_id and status <> 'cancelled';
      update public.group_bookings
         set status = case when v_active = 0 then 'cancelled' else 'partially_cancelled' end,
             updated_at = now()
       where id = v_group_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pr36_group_member_cancellation_sync on public.appointments;
create trigger pr36_group_member_cancellation_sync
after update of status on public.appointments
for each row execute function private.pr36_sync_cancelled_group_member();

-- =========================================================
-- Product PR36: Stripe-funded, service-only gift cards
-- =========================================================

alter table public.gift_cards
  add column if not exists code_hash text,
  add column if not exists code_last4 text,
  add column if not exists purchase_id uuid,
  add column if not exists initial_balance_cents integer,
  add column if not exists balance_cents integer,
  add column if not exists currency text not null default 'usd',
  add column if not exists scope_type text,
  add column if not exists scope_barber_id uuid references public.barbers(id) on delete restrict,
  add column if not exists scope_shop_id uuid references public.locations(id) on delete restrict,
  add column if not exists claimed_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists claim_token_hash text,
  add column if not exists purchased_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Refuse to guess about invalid historical money. The legacy table stored a
-- numeric balance and a plaintext code; valid rows can be converged exactly.
do $gift_card_preflight$
begin
  if exists (
    select 1
    from public.gift_cards card
    where card.balance < 0
       or round(card.balance * 100) > 2147483647
       or length(card.code) < 4
       or card.status not in ('active', 'spent')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Legacy gift cards require explicit balance/code reconciliation before PR36.';
  end if;
end
$gift_card_preflight$;

update public.gift_cards
   set code_hash = case
         when code_hash ~ '^[0-9a-f]{64}$' then code_hash
         else private.pr22_sha256(code)
       end,
       code_last4 = coalesce(code_last4, right(code, 4)),
       initial_balance_cents = coalesce(initial_balance_cents, round(balance * 100)::integer),
       balance_cents = coalesce(balance_cents, round(balance * 100)::integer),
       currency = lower(coalesce(nullif(currency, ''), 'usd')),
       scope_type = coalesce(scope_type, 'platform'),
       claim_token_hash = coalesce(claim_token_hash, private.pr22_sha256(code)),
       purchased_at = coalesce(purchased_at, now());

-- The legacy `code` column remains NOT NULL for compatibility, but it must no
-- longer retain a redeemable secret. Legacy raw codes continue to work through
-- claim_token_hash while the stored column becomes a one-way surrogate.
update public.gift_cards
set code = 'hash:' || code_hash
where code <> 'hash:' || code_hash;

alter table public.gift_cards
  alter column code_hash set not null,
  alter column code_last4 set not null,
  alter column initial_balance_cents set not null,
  alter column balance_cents set not null,
  alter column scope_type set not null,
  alter column purchased_at set not null;

alter table public.gift_cards
  drop constraint if exists gift_cards_code_hash_ck,
  drop constraint if exists gift_cards_code_last4_ck,
  drop constraint if exists gift_cards_balance_cents_ck,
  drop constraint if exists gift_cards_balance_projection_ck,
  drop constraint if exists gift_cards_currency_ck,
  drop constraint if exists gift_cards_status_ck,
  drop constraint if exists gift_cards_scope_shape_ck,
  drop constraint if exists gift_cards_claim_hash_ck;

alter table public.gift_cards
  add constraint gift_cards_code_hash_ck check (code_hash ~ '^[0-9a-f]{64}$'),
  add constraint gift_cards_code_last4_ck check (length(code_last4) = 4),
  add constraint gift_cards_balance_cents_ck check (
    initial_balance_cents >= 0
    and balance_cents between 0 and initial_balance_cents
  ),
  add constraint gift_cards_balance_projection_ck check (
    balance = balance_cents::numeric / 100
  ),
  add constraint gift_cards_currency_ck check (currency = 'usd'),
  add constraint gift_cards_status_ck check (status in ('active', 'spent')),
  add constraint gift_cards_scope_shape_ck check (
    (scope_type = 'platform' and scope_barber_id is null and scope_shop_id is null)
    or (scope_type = 'barber' and scope_barber_id is not null and scope_shop_id is null)
    or (scope_type = 'shop' and scope_shop_id is not null and scope_barber_id is null)
  ),
  add constraint gift_cards_claim_hash_ck check (
    claim_token_hash is null or claim_token_hash ~ '^[0-9a-f]{64}$'
  );

create unique index if not exists gift_cards_code_hash_uidx on public.gift_cards (code_hash);
create unique index if not exists gift_cards_claim_token_hash_uidx
  on public.gift_cards (claim_token_hash) where claim_token_hash is not null;
create index if not exists gift_cards_claimed_balance_idx
  on public.gift_cards (claimed_by_profile_id, status, purchased_at)
  where claimed_by_profile_id is not null;
create index if not exists gift_cards_scope_barber_idx
  on public.gift_cards (scope_barber_id)
  where scope_barber_id is not null;
create index if not exists gift_cards_scope_shop_idx
  on public.gift_cards (scope_shop_id)
  where scope_shop_id is not null;

create table if not exists public.gift_card_purchase_attempts (
  id uuid primary key default gen_random_uuid(),
  buyer_actor_key text not null,
  buyer_profile_id uuid references public.profiles(id) on delete set null,
  purchase_token_hash text not null unique,
  claim_token_hash text not null unique,
  idempotency_key text not null,
  amount_cents integer not null check (amount_cents between 1000 and 50000),
  currency text not null default 'usd' check (currency = 'usd'),
  scope_type text not null check (scope_type in ('platform', 'barber', 'shop')),
  scope_barber_id uuid references public.barbers(id) on delete restrict,
  scope_shop_id uuid references public.locations(id) on delete restrict,
  scope_label text not null,
  sender_name text not null,
  recipient_name text not null,
  recipient_email text,
  recipient_phone text,
  delivery_channel text not null check (delivery_channel in ('email', 'sms')),
  message text not null default '',
  stripe_payment_intent_id text unique,
  stripe_verified_at timestamptz,
  gift_card_id uuid unique references public.gift_cards(id) on delete set null,
  status text not null default 'creating'
    check (status in ('creating', 'requires_payment', 'paid', 'activated', 'failed', 'refunded', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_actor_key, idempotency_key),
  constraint gift_card_purchase_token_hash_ck check (purchase_token_hash ~ '^[0-9a-f]{64}$'),
  constraint gift_card_purchase_claim_hash_ck check (claim_token_hash ~ '^[0-9a-f]{64}$'),
  constraint gift_card_purchase_idempotency_ck check (length(idempotency_key) between 8 and 200),
  constraint gift_card_purchase_scope_shape check (
    (scope_type = 'platform' and scope_barber_id is null and scope_shop_id is null)
    or (scope_type = 'barber' and scope_barber_id is not null and scope_shop_id is null)
    or (scope_type = 'shop' and scope_shop_id is not null and scope_barber_id is null)
  ),
  constraint gift_card_purchase_delivery_shape check (
    (delivery_channel = 'email' and recipient_email is not null)
    or (delivery_channel = 'sms' and recipient_phone is not null)
  )
);

create index if not exists gift_card_purchase_attempts_buyer_profile_idx
  on public.gift_card_purchase_attempts (buyer_profile_id, created_at desc)
  where buyer_profile_id is not null;
create index if not exists gift_card_purchase_attempts_scope_barber_idx
  on public.gift_card_purchase_attempts (scope_barber_id)
  where scope_barber_id is not null;
create index if not exists gift_card_purchase_attempts_scope_shop_idx
  on public.gift_card_purchase_attempts (scope_shop_id)
  where scope_shop_id is not null;

create unique index if not exists gift_cards_purchase_id_uidx
  on public.gift_cards (purchase_id)
  where purchase_id is not null;

do $gift_card_purchase_fk$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conname = 'gift_cards_purchase_id_fkey'
      and constraint_row.conrelid = 'public.gift_cards'::regclass
  ) then
    alter table public.gift_cards
      add constraint gift_cards_purchase_id_fkey
      foreign key (purchase_id)
      references public.gift_card_purchase_attempts(id)
      on delete restrict;
  end if;
end
$gift_card_purchase_fk$;

create table if not exists public.gift_card_deliveries (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.gift_card_purchase_attempts(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  destination_masked text not null,
  provider text,
  provider_message_id text,
  status text not null default 'queued'
    check (status in ('queued', 'delivered', 'placeholder', 'failed', 'retrying')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_id, channel)
);

create table if not exists public.gift_card_ledger (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  entry_type text not null check (entry_type in ('load', 'claim', 'service_redemption', 'refund', 'adjustment')),
  amount_cents integer not null,
  balance_after_cents integer not null check (balance_after_cents >= 0),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint gift_card_ledger_amount_direction_ck check (
    (entry_type = 'load' and amount_cents > 0)
    or (entry_type = 'claim' and amount_cents = 0)
    or (entry_type = 'service_redemption' and amount_cents < 0)
    or (entry_type = 'refund' and amount_cents > 0)
    or (entry_type = 'adjustment' and amount_cents <> 0)
  ),
  constraint gift_card_ledger_idempotency_ck check (
    idempotency_key is null or length(idempotency_key) between 8 and 200
  )
);

create index if not exists gift_card_ledger_card_created_idx
  on public.gift_card_ledger (gift_card_id, created_at desc);
create index if not exists gift_card_ledger_profile_created_idx
  on public.gift_card_ledger (profile_id, created_at desc)
  where profile_id is not null;
create index if not exists gift_card_ledger_appointment_idx
  on public.gift_card_ledger (appointment_id, created_at desc)
  where appointment_id is not null;
create unique index if not exists gift_card_ledger_idempotency_uidx
  on public.gift_card_ledger (gift_card_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.gift_card_applications (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  service_only boolean not null default true check (service_only),
  tip_applied_cents integer not null default 0 check (tip_applied_cents = 0),
  created_at timestamptz not null default now(),
  unique (gift_card_id, appointment_id)
);

create index if not exists gift_card_applications_appointment_idx
  on public.gift_card_applications (appointment_id, created_at);
create index if not exists gift_card_applications_profile_idx
  on public.gift_card_applications (profile_id, created_at desc);

create table if not exists public.gift_card_payout_obligations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.gift_card_applications(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending_completion'
    check (status in ('pending_completion', 'ready_for_payout', 'paid', 'reversed', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gift_card_payout_obligations_appointment_idx
  on public.gift_card_payout_obligations (appointment_id, status);
create index if not exists gift_card_payout_obligations_barber_idx
  on public.gift_card_payout_obligations (barber_id, status, created_at);

-- A reversal is a new immutable fact. It never deletes or rewrites the
-- original service application and therefore preserves exact money history.
create table if not exists public.gift_card_application_reversals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique
    references public.gift_card_applications(id) on delete restrict,
  gift_card_id uuid not null references public.gift_cards(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null check (reason in ('appointment_cancelled', 'appointment_refunded', 'manual_correction')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  balance_after_cents integer not null check (balance_after_cents >= 0),
  created_at timestamptz not null default now(),
  unique (gift_card_id, idempotency_key)
);

create index if not exists gift_card_application_reversals_appointment_idx
  on public.gift_card_application_reversals (appointment_id, created_at desc);
create index if not exists gift_card_application_reversals_profile_idx
  on public.gift_card_application_reversals (profile_id, created_at desc);

create table if not exists public.gift_card_payout_obligation_events (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null
    references public.gift_card_payout_obligations(id) on delete restrict,
  previous_status text,
  next_status text not null check (
    next_status in ('pending_completion', 'ready_for_payout', 'paid', 'reversed', 'needs_review')
  ),
  reason text not null check (length(btrim(reason)) between 3 and 160),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gift_card_payout_events_obligation_idx
  on public.gift_card_payout_obligation_events (obligation_id, created_at desc);

create table if not exists public.gift_card_redemption_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  idempotency_key text not null
    check (length(idempotency_key) between 8 and 200),
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (profile_id, idempotency_key)
);

create index if not exists gift_card_redemption_requests_appointment_idx
  on public.gift_card_redemption_requests (appointment_id, created_at desc);

alter table public.gift_card_purchase_attempts enable row level security;
alter table public.gift_card_deliveries enable row level security;
alter table public.gift_card_ledger enable row level security;
alter table public.gift_card_applications enable row level security;
alter table public.gift_card_payout_obligations enable row level security;
alter table public.gift_card_application_reversals enable row level security;
alter table public.gift_card_payout_obligation_events enable row level security;
alter table public.gift_card_redemption_requests enable row level security;
alter table public.gift_cards force row level security;
alter table public.gift_card_purchase_attempts force row level security;
alter table public.gift_card_deliveries force row level security;
alter table public.gift_card_ledger force row level security;
alter table public.gift_card_applications force row level security;
alter table public.gift_card_payout_obligations force row level security;
alter table public.gift_card_application_reversals force row level security;
alter table public.gift_card_payout_obligation_events force row level security;
alter table public.gift_card_redemption_requests force row level security;

drop policy if exists "gift cards admin select batch 34" on public.gift_cards;

revoke all on public.gift_cards, public.gift_card_purchase_attempts, public.gift_card_deliveries,
  public.gift_card_ledger, public.gift_card_applications,
  public.gift_card_payout_obligations, public.gift_card_application_reversals,
  public.gift_card_payout_obligation_events,
  public.gift_card_redemption_requests from public, anon, authenticated;
grant select, insert, update on public.gift_card_purchase_attempts,
  public.gift_card_deliveries, public.gift_card_payout_obligations to service_role;
grant select, insert on public.gift_card_applications,
  public.gift_card_redemption_requests to service_role;
grant select, insert on public.gift_card_ledger, public.gift_card_application_reversals,
  public.gift_card_payout_obligation_events to service_role;
grant select, insert, update on public.gift_cards to service_role;

create or replace function private.pr36_reject_gift_history_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'PR36 gift-card money history is append-only';
end;
$$;

revoke all on function private.pr36_reject_gift_history_change()
  from public, anon, authenticated, service_role;

drop trigger if exists gift_cards_no_delete on public.gift_cards;
create trigger gift_cards_no_delete
before delete on public.gift_cards
for each row execute function private.pr36_reject_gift_history_change();

drop trigger if exists gift_card_ledger_immutable on public.gift_card_ledger;
create trigger gift_card_ledger_immutable
before update or delete on public.gift_card_ledger
for each row execute function private.pr36_reject_gift_history_change();

drop trigger if exists gift_card_applications_immutable on public.gift_card_applications;
create trigger gift_card_applications_immutable
before update or delete on public.gift_card_applications
for each row execute function private.pr36_reject_gift_history_change();

drop trigger if exists gift_card_reversals_immutable on public.gift_card_application_reversals;
create trigger gift_card_reversals_immutable
before update or delete on public.gift_card_application_reversals
for each row execute function private.pr36_reject_gift_history_change();

drop trigger if exists gift_card_payout_events_immutable on public.gift_card_payout_obligation_events;
create trigger gift_card_payout_events_immutable
before update or delete on public.gift_card_payout_obligation_events
for each row execute function private.pr36_reject_gift_history_change();

drop trigger if exists gift_card_redemption_requests_immutable on public.gift_card_redemption_requests;
create trigger gift_card_redemption_requests_immutable
before update or delete on public.gift_card_redemption_requests
for each row execute function private.pr36_reject_gift_history_change();

create or replace function private.pr36_guard_gift_payout_obligation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.application_id is distinct from new.application_id
     or old.appointment_id is distinct from new.appointment_id
     or old.barber_id is distinct from new.barber_id
     or old.amount_cents is distinct from new.amount_cents
     or old.created_at is distinct from new.created_at then
    raise exception 'PR36 gift-card payout source evidence is immutable';
  end if;

  if old.status is distinct from new.status and not (
    (old.status = 'pending_completion' and new.status in ('ready_for_payout', 'reversed', 'needs_review'))
    or (old.status = 'ready_for_payout' and new.status in ('paid', 'reversed', 'needs_review'))
    or (old.status = 'paid' and new.status = 'needs_review')
    or (old.status = 'needs_review' and new.status in ('ready_for_payout', 'paid', 'reversed'))
  ) then
    raise exception 'Invalid PR36 gift-card payout transition';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.pr36_record_gift_payout_obligation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.gift_card_payout_obligation_events (
      obligation_id, previous_status, next_status, reason, metadata
    ) values (
      new.id,
      null,
      new.status,
      'obligation_created',
      jsonb_build_object('amountCents', new.amount_cents, 'barberId', new.barber_id)
    );
  elsif old.status is distinct from new.status then
    insert into public.gift_card_payout_obligation_events (
      obligation_id, previous_status, next_status, reason, metadata
    ) values (
      new.id,
      old.status,
      new.status,
      'status_transition',
      jsonb_build_object('amountCents', new.amount_cents, 'barberId', new.barber_id)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.pr36_guard_gift_payout_obligation()
  from public, anon, authenticated, service_role;
revoke all on function private.pr36_record_gift_payout_obligation_event()
  from public, anon, authenticated, service_role;

drop trigger if exists gift_card_payout_obligation_guard on public.gift_card_payout_obligations;
create trigger gift_card_payout_obligation_guard
before update or delete on public.gift_card_payout_obligations
for each row execute function private.pr36_guard_gift_payout_obligation();

drop trigger if exists gift_card_payout_obligation_event on public.gift_card_payout_obligations;
create trigger gift_card_payout_obligation_event
after insert or update on public.gift_card_payout_obligations
for each row execute function private.pr36_record_gift_payout_obligation_event();

create or replace function private.pr36_reverse_gift_card_application(
  p_application_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.gift_card_applications%rowtype;
  v_existing public.gift_card_application_reversals%rowtype;
  v_card public.gift_cards%rowtype;
  v_obligation public.gift_card_payout_obligations%rowtype;
  v_balance_after integer;
  v_next_obligation_status text;
begin
  if p_reason is null
     or p_reason not in ('appointment_cancelled', 'appointment_refunded', 'manual_correction') then
    raise exception 'Invalid PR36 gift-card reversal reason';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'Invalid PR36 gift-card reversal idempotency key';
  end if;

  select * into v_application
  from public.gift_card_applications application
  where application.id = p_application_id;
  if not found then
    raise exception 'PR36 gift-card application was not found';
  end if;

  -- Redemption locks the appointment before any gift card. Reversal follows
  -- the same order so checkout and cancellation cannot deadlock each other.
  perform appointment.id
  from public.appointments appointment
  where appointment.id = v_application.appointment_id
  for update;

  select * into v_existing
  from public.gift_card_application_reversals reversal
  where reversal.application_id = v_application.id;
  if found then
    return jsonb_build_object(
      'outcome', 'reversed',
      'applicationId', v_application.id,
      'reversalId', v_existing.id,
      'alreadyReversed', true,
      'balanceAfterCents', v_existing.balance_after_cents
    );
  end if;

  select * into v_card
  from public.gift_cards card
  where card.id = v_application.gift_card_id
  for update;
  if not found then
    raise exception 'PR36 gift-card balance authority was not found';
  end if;

  select * into v_obligation
  from public.gift_card_payout_obligations obligation
  where obligation.application_id = v_application.id
  for update;
  if not found then
    raise exception 'PR36 gift-card payout obligation was not found';
  end if;

  v_balance_after := v_card.balance_cents + v_application.amount_cents;
  if v_balance_after > v_card.initial_balance_cents then
    raise exception 'PR36 gift-card reversal would exceed the loaded balance';
  end if;

  insert into public.gift_card_application_reversals (
    application_id, gift_card_id, appointment_id, profile_id,
    amount_cents, reason, idempotency_key, balance_after_cents
  ) values (
    v_application.id,
    v_application.gift_card_id,
    v_application.appointment_id,
    v_application.profile_id,
    v_application.amount_cents,
    p_reason,
    p_idempotency_key,
    v_balance_after
  ) returning * into v_existing;

  update public.gift_cards
  set balance_cents = v_balance_after,
      balance = v_balance_after::numeric / 100,
      status = 'active',
      updated_at = now()
  where id = v_card.id;

  insert into public.gift_card_ledger (
    gift_card_id, profile_id, appointment_id, entry_type,
    amount_cents, balance_after_cents, idempotency_key, metadata
  ) values (
    v_card.id,
    v_application.profile_id,
    v_application.appointment_id,
    'refund',
    v_application.amount_cents,
    v_balance_after,
    'reversal:' || v_application.id::text,
    jsonb_build_object(
      'applicationId', v_application.id,
      'reason', p_reason,
      'requestIdempotencyKey', p_idempotency_key,
      'payoutStatusBefore', v_obligation.status
    )
  );

  v_next_obligation_status := case
    when v_obligation.status = 'paid' then 'needs_review'
    else 'reversed'
  end;
  update public.gift_card_payout_obligations
  set status = v_next_obligation_status,
      updated_at = now()
  where id = v_obligation.id;

  return jsonb_build_object(
    'outcome', 'reversed',
    'applicationId', v_application.id,
    'reversalId', v_existing.id,
    'alreadyReversed', false,
    'balanceAfterCents', v_balance_after,
    'payoutStatus', v_next_obligation_status,
    'paidPayoutNeedsReview', v_obligation.status = 'paid'
  );
end;
$$;

revoke all on function private.pr36_reverse_gift_card_application(uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.pr36_reverse_gift_card_application(
  p_application_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.pr36_reverse_gift_card_application(
    p_application_id,
    p_reason,
    p_idempotency_key
  );
$$;

revoke all on function public.pr36_reverse_gift_card_application(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.pr36_reverse_gift_card_application(uuid, text, text)
  to service_role;

create or replace function private.pr36_sync_gift_card_appointment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application record;
  v_reason text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status::text = 'completed' then
    update public.gift_card_payout_obligations obligation
    set status = 'ready_for_payout',
        updated_at = now()
    where obligation.appointment_id = new.id
      and obligation.status = 'pending_completion';
    return new;
  end if;

  if new.status::text not in ('cancelled', 'refunded') then
    return new;
  end if;

  v_reason := case
    when new.status::text = 'refunded' then 'appointment_refunded'
    else 'appointment_cancelled'
  end;

  for v_application in
    select application.id, application.gift_card_id
    from public.gift_card_applications application
    where application.appointment_id = new.id
      and not exists (
        select 1
        from public.gift_card_application_reversals reversal
        where reversal.application_id = application.id
      )
    order by application.gift_card_id, application.id
  loop
    perform private.pr36_reverse_gift_card_application(
      v_application.id,
      v_reason,
      'appointment:' || new.id::text || ':' || new.status::text || ':' || v_application.id::text
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.pr36_sync_gift_card_appointment_lifecycle()
  from public, anon, authenticated, service_role;

drop trigger if exists pr36_gift_card_appointment_lifecycle on public.appointments;
create trigger pr36_gift_card_appointment_lifecycle
after update of status on public.appointments
for each row execute function private.pr36_sync_gift_card_appointment_lifecycle();

create or replace function public.pr36_activate_gift_card_purchase(
  p_purchase_id uuid,
  p_purchase_token_hash text,
  p_claim_token_hash text,
  p_code_hash text,
  p_code_last4 text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_purchase public.gift_card_purchase_attempts%rowtype;
  v_card public.gift_cards%rowtype;
begin
  if p_purchase_token_hash is null
     or p_purchase_token_hash !~ '^[0-9a-f]{64}$'
     or p_claim_token_hash is null
     or p_claim_token_hash !~ '^[0-9a-f]{64}$'
     or p_code_hash is null
     or p_code_hash !~ '^[0-9a-f]{64}$'
     or p_code_last4 is null
     or length(p_code_last4) <> 4 then
    return jsonb_build_object('outcome', 'validation', 'reason', 'invalid_gift_card_hash_evidence');
  end if;

  select * into v_purchase
    from public.gift_card_purchase_attempts
   where id = p_purchase_id
     and purchase_token_hash = p_purchase_token_hash
     and claim_token_hash = p_claim_token_hash
   for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found', 'reason', 'purchase_not_found');
  end if;

  if v_purchase.gift_card_id is not null then
    return jsonb_build_object('outcome', 'activated', 'giftCardId', v_purchase.gift_card_id, 'alreadyActivated', true);
  end if;

  if v_purchase.status <> 'paid' or v_purchase.stripe_verified_at is null then
    return jsonb_build_object('outcome', 'conflict', 'reason', 'stripe_payment_not_verified');
  end if;

  insert into public.gift_cards (
    code, code_hash, code_last4, balance, status,
    purchase_id, initial_balance_cents, balance_cents, currency,
    scope_type, scope_barber_id, scope_shop_id, claim_token_hash, purchased_at, updated_at
  ) values (
    'hash:' || p_code_hash,
    p_code_hash,
    p_code_last4,
    v_purchase.amount_cents::numeric / 100,
    'active',
    v_purchase.id,
    v_purchase.amount_cents,
    v_purchase.amount_cents,
    v_purchase.currency,
    v_purchase.scope_type,
    v_purchase.scope_barber_id,
    v_purchase.scope_shop_id,
    p_claim_token_hash,
    now(),
    now()
  ) returning * into v_card;

  insert into public.gift_card_ledger (
    gift_card_id, entry_type, amount_cents, balance_after_cents, idempotency_key, metadata
  ) values (
    v_card.id, 'load', v_purchase.amount_cents, v_purchase.amount_cents,
    'purchase:' || v_purchase.id::text,
    jsonb_build_object('stripePaymentIntentId', v_purchase.stripe_payment_intent_id, 'scope', v_purchase.scope_type)
  );

  update public.gift_card_purchase_attempts
     set gift_card_id = v_card.id, status = 'activated', updated_at = now()
   where id = v_purchase.id;

  return jsonb_build_object('outcome', 'activated', 'giftCardId', v_card.id, 'alreadyActivated', false);
end;
$$;

create or replace function public.pr36_claim_gift_card(
  p_claim_token_hash text,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_card public.gift_cards%rowtype;
begin
  if p_claim_token_hash is null
     or p_claim_token_hash !~ '^[0-9a-f]{64}$'
     or p_profile_id is null then
    return jsonb_build_object('outcome', 'validation', 'reason', 'invalid_gift_card_claim');
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = p_profile_id) then
    return jsonb_build_object('outcome', 'not_found', 'reason', 'profile_not_found');
  end if;

  select * into v_card
    from public.gift_cards
   where claim_token_hash = p_claim_token_hash
   for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found', 'reason', 'gift_card_not_found');
  end if;

  if v_card.claimed_by_profile_id is not null and v_card.claimed_by_profile_id <> p_profile_id then
    return jsonb_build_object('outcome', 'conflict', 'reason', 'gift_card_already_claimed');
  end if;

  if v_card.claimed_by_profile_id is null then
    update public.gift_cards
       set claimed_by_profile_id = p_profile_id, claimed_at = now(), updated_at = now()
     where id = v_card.id;
    insert into public.gift_card_ledger (
      gift_card_id, profile_id, entry_type, amount_cents, balance_after_cents, idempotency_key
    ) values (
      v_card.id, p_profile_id, 'claim', 0, v_card.balance_cents, 'claim:' || p_profile_id::text
    );
  end if;

  return jsonb_build_object(
    'outcome', 'claimed',
    'giftCardId', v_card.id,
    'balanceCents', v_card.balance_cents,
    'currency', v_card.currency,
    'neverExpires', true
  );
end;
$$;

create or replace function public.pr36_apply_gift_balance(
  p_profile_id uuid,
  p_appointment_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_existing_appointment_id uuid;
  v_appointment public.appointments%rowtype;
  v_card public.gift_cards%rowtype;
  v_client_id uuid;
  v_service_cents integer;
  v_tip_cents integer;
  v_service_due_cents integer;
  v_already_applied integer;
  v_apply integer;
  v_total integer := 0;
  v_balance_after integer;
  v_application_id uuid;
  v_result jsonb;
begin
  if p_profile_id is null
     or p_appointment_id is null
     or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    return jsonb_build_object('outcome', 'validation', 'reason', 'missing_required_input');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_idempotency_key, 36));
  select request.appointment_id, request.result
  into v_existing_appointment_id, v_existing
    from public.gift_card_redemption_requests
    as request
   where request.profile_id = p_profile_id
     and request.idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if v_existing_appointment_id <> p_appointment_id then
      return jsonb_build_object('outcome', 'idempotency_conflict', 'reason', 'key_reused_for_another_appointment');
    end if;
    return v_existing;
  end if;

  select id into v_client_id from public.clients where profile_id = p_profile_id limit 1;
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found or v_client_id is null or v_appointment.client_id <> v_client_id then
    return jsonb_build_object('outcome', 'not_found', 'reason', 'appointment_not_found');
  end if;

  if v_appointment.status in ('cancelled', 'refunded', 'no_show') then
    return jsonb_build_object('outcome', 'conflict', 'reason', 'appointment_not_payable');
  end if;

  v_service_cents := greatest(0, round(coalesce(v_appointment.service_total, v_appointment.total_amount, 0) * 100)::integer);
  v_tip_cents := greatest(0, round(coalesce(v_appointment.tip_amount, 0) * 100)::integer);
  v_service_due_cents := greatest(0, round(coalesce(v_appointment.balance_due, 0) * 100)::integer - v_tip_cents);
  select coalesce(sum(application.amount_cents), 0) into v_already_applied
  from public.gift_card_applications application
  where application.appointment_id = p_appointment_id
    and not exists (
      select 1
      from public.gift_card_application_reversals reversal
      where reversal.application_id = application.id
    );

  for v_card in
    select *
      from public.gift_cards
     where claimed_by_profile_id = p_profile_id
       and status = 'active'
       and balance_cents > 0
       and (
         scope_type = 'platform'
         or (scope_type = 'barber' and scope_barber_id = v_appointment.barber_id)
         or (scope_type = 'shop' and scope_shop_id = coalesce(v_appointment.shop_id, v_appointment.location_id))
       )
     order by purchased_at, id
     for update
  loop
    v_apply := least(
      v_card.balance_cents,
      greatest(0, v_service_cents - v_already_applied - v_total),
      greatest(0, v_service_due_cents - v_total)
    );
    if v_apply <= 0 then
      exit;
    end if;

    v_balance_after := v_card.balance_cents - v_apply;
    update public.gift_cards
       set balance_cents = v_balance_after,
           balance = v_balance_after::numeric / 100,
           status = case when v_balance_after = 0 then 'spent' else 'active' end,
           updated_at = now()
     where id = v_card.id;

    insert into public.gift_card_applications (
      gift_card_id, appointment_id, profile_id, amount_cents, service_only, tip_applied_cents
    ) values (
      v_card.id, p_appointment_id, p_profile_id, v_apply, true, 0
    ) returning id into v_application_id;

    insert into public.gift_card_ledger (
      gift_card_id, profile_id, appointment_id, entry_type,
      amount_cents, balance_after_cents, idempotency_key,
      metadata
    ) values (
      v_card.id, p_profile_id, p_appointment_id, 'service_redemption',
      -v_apply, v_balance_after, p_idempotency_key,
      jsonb_build_object('serviceOnly', true, 'tipAppliedCents', 0)
    );

    insert into public.gift_card_payout_obligations (
      application_id, appointment_id, barber_id, amount_cents, status
    ) values (
      v_application_id, p_appointment_id, v_appointment.barber_id, v_apply,
      case when v_appointment.status = 'completed' then 'ready_for_payout' else 'pending_completion' end
    );

    v_total := v_total + v_apply;
  end loop;

  if v_total <= 0 then
    return jsonb_build_object('outcome', 'not_applied', 'reason', 'no_eligible_service_balance');
  end if;

  -- Service totals and the tip are untouched. Gift value changes only the
  -- outstanding balance, with the tip as a hard lower bound.
  update public.appointments
     set balance_due = greatest(
           coalesce(balance_due, 0) - (v_total::numeric / 100),
           coalesce(tip_amount, 0)
         ),
         updated_at = now()
   where id = p_appointment_id;

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'appointmentId', p_appointment_id,
    'appliedCents', v_total,
    'tipAppliedCents', 0,
    'serviceOnly', true,
    'barberPayoutObligationCents', v_total
  );
  insert into public.gift_card_redemption_requests (profile_id, appointment_id, idempotency_key, result)
  values (p_profile_id, p_appointment_id, p_idempotency_key, v_result);
  return v_result;
end;
$$;

revoke all on function public.pr36_activate_gift_card_purchase(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.pr36_claim_gift_card(text, uuid) from public, anon, authenticated;
revoke all on function public.pr36_apply_gift_balance(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.pr36_activate_gift_card_purchase(uuid, text, text, text, text) to service_role;
grant execute on function public.pr36_claim_gift_card(text, uuid) to service_role;
grant execute on function public.pr36_apply_gift_balance(uuid, uuid, text) to service_role;

-- Account deletion erases operational PR36 identity while preserving booking
-- facts and immutable money ledgers/payout obligations required for audit.
create or replace function private.pr36_anonymize_deleted_account_group_gift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_ids uuid[] := '{}'::uuid[];
  v_member_ids uuid[] := '{}'::uuid[];
  v_purchase_ids uuid[] := '{}'::uuid[];
begin
  if new.status <> 'deleted' or old.status is not distinct from new.status then
    return new;
  end if;

  select coalesce(array_agg(candidate.group_id order by candidate.group_id), '{}'::uuid[])
  into v_group_ids
  from (
    select booking.id as group_id
    from public.group_bookings booking
    where booking.organizer_profile_id = new.profile_id
    union
    select member.group_id
    from public.group_booking_members member
    join public.clients client on client.id = member.client_id
    where client.profile_id = new.profile_id
  ) candidate;

  -- Group confirmation locks the group before its members. Follow the same
  -- order, and sort every set, so deletion cannot deadlock live confirmation.
  perform booking.id
  from public.group_bookings booking
  where booking.id = any(v_group_ids)
  order by booking.id
  for update;

  select coalesce(array_agg(member.id order by member.id), '{}'::uuid[])
  into v_member_ids
  from public.group_booking_members member
  join public.group_bookings booking on booking.id = member.group_id
  left join public.clients client on client.id = member.client_id
  where (booking.organizer_profile_id = new.profile_id and member.is_organizer)
     or client.profile_id = new.profile_id;

  perform member.id
  from public.group_booking_members member
  where member.id = any(v_member_ids)
  order by member.id
  for update;

  update public.group_booking_payment_intents intent
  set payer_email = 'deleted+' || replace(intent.id::text, '-', '') || '@privacy.invalid',
      updated_at = timezone('utc', now())
  from public.group_booking_members member,
       public.group_bookings booking
  where member.id = intent.member_id
    and booking.id = intent.group_id
    and (
      (intent.payer_kind = 'organizer' and booking.organizer_profile_id = new.profile_id)
      or (intent.payer_kind = 'member' and member.id = any(v_member_ids))
    );

  update public.group_booking_members member
  set client_id = null,
      full_name = '[deleted]',
      email = 'deleted+' || replace(member.id::text, '-', '') || '@privacy.invalid',
      phone = '0000000000',
      updated_at = timezone('utc', now())
  where member.id = any(v_member_ids);

  update public.group_bookings booking
  set control_token_hash = private.pr22_sha256(
        'deleted-group-control:' || booking.id::text || ':' || gen_random_uuid()::text
      ),
      organizer_profile_id = null,
      organizer_session_key = 'deleted:' || booking.id::text,
      organizer_name = '[deleted]',
      organizer_email = 'deleted+' || replace(booking.id::text, '-', '') || '@privacy.invalid',
      organizer_phone = '0000000000',
      updated_at = timezone('utc', now())
  where booking.organizer_profile_id = new.profile_id;

  select coalesce(array_agg(purchase.id order by purchase.id), '{}'::uuid[])
  into v_purchase_ids
  from public.gift_card_purchase_attempts purchase
  where purchase.buyer_profile_id = new.profile_id
     or exists (
       select 1
       from public.gift_cards card
       where (card.id = purchase.gift_card_id or card.purchase_id = purchase.id)
         and card.claimed_by_profile_id = new.profile_id
     );

  -- Activation locks purchase then card. Preserve that order here.
  perform purchase.id
  from public.gift_card_purchase_attempts purchase
  where purchase.id = any(v_purchase_ids)
  order by purchase.id
  for update;

  perform card.id
  from public.gift_cards card
  where card.claimed_by_profile_id = new.profile_id
  -- Redemption locks multiple cards by purchase time, then id. Match that
  -- ordering so deletion and redemption cannot deadlock on the same cards.
  order by card.purchased_at, card.id
  for update;

  update public.gift_card_deliveries delivery
  set destination_masked = '[deleted]',
      last_error = null,
      updated_at = timezone('utc', now())
  where delivery.purchase_id = any(v_purchase_ids);

  update public.gift_card_purchase_attempts purchase
  set buyer_profile_id = null,
      buyer_actor_key = 'deleted:' || purchase.id::text,
      purchase_token_hash = private.pr22_sha256(
        'deleted-purchase-token:' || purchase.id::text || ':' || gen_random_uuid()::text
      ),
      claim_token_hash = private.pr22_sha256(
        'deleted-claim-token:' || purchase.id::text || ':' || gen_random_uuid()::text
      ),
      idempotency_key = 'deleted:' || purchase.id::text,
      sender_name = '[deleted]',
      recipient_name = '[deleted]',
      recipient_email = case
        when purchase.delivery_channel = 'email'
          then 'deleted+' || replace(purchase.id::text, '-', '') || '@privacy.invalid'
        else null
      end,
      recipient_phone = case
        when purchase.delivery_channel = 'sms' then '0000000000'
        else null
      end,
      message = '',
      status = case
        when purchase.status in ('creating', 'requires_payment', 'paid') then 'needs_review'
        else purchase.status
      end,
      updated_at = timezone('utc', now())
  where purchase.id = any(v_purchase_ids);

  update public.gift_cards card
  set claimed_by_profile_id = null,
      claim_token_hash = null,
      updated_at = timezone('utc', now())
  where card.claimed_by_profile_id = new.profile_id;

  return new;
end;
$$;

revoke all on function private.pr36_anonymize_deleted_account_group_gift()
  from public, anon, authenticated, service_role;

drop trigger if exists pr36_anonymize_deleted_account_group_gift
  on public.account_privacy_lifecycles;
create trigger pr36_anonymize_deleted_account_group_gift
after update of status on public.account_privacy_lifecycles
for each row
when (new.status = 'deleted' and old.status is distinct from new.status)
execute function private.pr36_anonymize_deleted_account_group_gift();

comment on table public.group_booking_payment_intents is
  'Server-owned payer responsibility for a group member. Planned is not paid; amounts come only from booking hold snapshots.';
comment on table public.kiosk_group_requests is
  'Honest group intake. A request is not a live queue position or wait estimate until floor capacity confirms it.';
comment on table public.gift_card_applications is
  'Gift tender applied to service only. tip_applied_cents is constrained to exactly zero.';
comment on table public.gift_card_payout_obligations is
  'Every gift redemption creates an equal barber payout obligation so the barber receives the full service value.';

commit;
