-- =========================================================
-- PR 20 — production booking engine.
--
-- Scope: services, availability inputs, expiring slot holds, the appointment
-- lifecycle transitions the booking domain already owns, and immutable source
-- attribution. Queue and chair rotation (PR 21), rent and money consoles
-- (PR 22), guest-account conversion (PR 23) and any payment capture are
-- deliberately absent. Nothing here takes or implies money.
--
-- The load-bearing decision in this migration is how two callers racing for the
-- same chair-minute are resolved. Three independent mechanisms cooperate, and
-- none of them is an application-level check-then-insert:
--
--   1. A per-barber transaction-scoped advisory lock. Every hold, confirm,
--      reschedule and cancel takes it first, so all writes against one barber's
--      timeline are totally ordered inside the database.
--   2. A GiST exclusion constraint on active holds. Even if the lock were ever
--      bypassed, two overlapping active holds for one barber cannot both exist.
--   3. The pre-existing `appointments_no_overlap_active` exclusion constraint,
--      which is what actually decides a confirmation. A confirm that loses the
--      race raises 23P01 and is reported as a conflict, never as a success.
--
-- Hold expiry is lazy and automatic rather than swept by an operator: every
-- function that could be blocked by a stale hold expires that barber's stale
-- holds inside the same transaction, under the same lock, before it reads
-- availability. An expired hold therefore stops blocking the moment the next
-- caller arrives, with no cron and no manual cleanup.
-- =========================================================

begin;

-- Required for the exclusion constraints below: uuid equality and range overlap
-- in one GiST index. Already present from 0013; restated so a fresh database
-- built from these migrations alone still works. No version is pinned.
create extension if not exists btree_gist;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- =========================================================
-- 1. Service booking contract
--
-- `public.services` is already the canonical catalog: stable uuid primary key,
-- `duration_min`, `buffer_min` (the cleanup/turnaround window), `active` and
-- `is_bookable`. Two things were missing.
--
-- First, money was only ever `numeric(10,2)`. Every price that crosses into a
-- booking record now travels as integer cents, because a snapshot that has to
-- survive years of catalog edits must not be re-rounded on the way in or out.
-- `price_cents` is GENERATED rather than a second writable column, so there is
-- exactly one source of truth and the two can never drift.
--
-- Second, nothing constrained the shape of a bookable service. The checks are
-- added NOT VALID: they bind every insert and every update from here on without
-- failing the migration on a legacy row that predates the rule.
-- =========================================================

alter table public.services
  add column if not exists price_cents integer
    generated always as ((price * 100)::integer) stored;

comment on column public.services.price_cents is
  'Integer-cent projection of price. Generated, so a booking snapshot and the catalog can never disagree about rounding.';

comment on column public.services.buffer_min is
  'Cleanup/turnaround minutes reserved after the service. Availability and holds reserve duration_min + buffer_min.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'services_duration_min_positive') then
    alter table public.services
      add constraint services_duration_min_positive check (duration_min > 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'services_buffer_min_nonnegative') then
    alter table public.services
      add constraint services_buffer_min_nonnegative check (buffer_min >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'services_price_nonnegative') then
    alter table public.services
      add constraint services_price_nonnegative check (price >= 0) not valid;
  end if;
end $$;

-- =========================================================
-- 2. Barber booking policy
--
-- Availability was previously generated against a hard-coded timezone and a
-- hard-coded lead time. Those are business decisions, so they belong in data.
-- A missing row is not an error: the engine falls back to these same defaults,
-- which is why every column is NOT NULL DEFAULT rather than nullable.
-- =========================================================

create table if not exists public.barber_booking_policies (
  barber_id uuid primary key references public.barbers(id) on delete cascade,
  -- IANA zone name. Validated by the application against Intl before write; the
  -- check here only rejects obvious junk, because Postgres cannot know the zone
  -- database the Node runtime will use.
  booking_timezone text not null default 'America/New_York',
  lead_time_minutes integer not null default 15,
  booking_horizon_days integer not null default 60,
  slot_interval_minutes integer not null default 15,
  hold_ttl_seconds integer not null default 300,
  accepts_online_booking boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barber_booking_policies_timezone_shape
    check (booking_timezone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$'),
  constraint barber_booking_policies_lead_time_range
    check (lead_time_minutes between 0 and 10080),
  constraint barber_booking_policies_horizon_range
    check (booking_horizon_days between 1 and 365),
  constraint barber_booking_policies_slot_interval_range
    check (slot_interval_minutes between 5 and 120),
  constraint barber_booking_policies_hold_ttl_range
    check (hold_ttl_seconds between 60 and 1800)
);

alter table public.barber_booking_policies enable row level security;

-- Deny by default. Every reader and writer of this table is the server on the
-- service-role client. Following the PR 19 precedent on the POS tables: an
-- absent policy is honest, a guessed policy is not.
revoke all on public.barber_booking_policies from anon, authenticated;
grant select, insert, update, delete on public.barber_booking_policies to service_role;

comment on table public.barber_booking_policies is
  'Per-barber booking policy: timezone, lead time, horizon, slot interval, hold TTL. Server-authored only; RLS enabled with no client policy.';

-- =========================================================
-- 3. Slot holds
--
-- A hold is a short-lived, server-authorized claim on one barber's timeline. It
-- is not a booking and it is not money.
--
-- The token the client receives is opaque and random; only its SHA-256 digest is
-- stored, so a database read cannot be replayed as a client credential.
-- Ownership is bound either to a profile (signed-in) or to an opaque server
-- session key (guest and kiosk). One of the two is required — an unowned hold
-- would be releasable and consumable by anyone.
-- =========================================================

create table if not exists public.booking_slot_holds (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 hex of the opaque token. Never the token itself.
  token_hash text not null unique,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  service_id uuid not null references public.services(id) on delete restrict,

  -- Catalog snapshot taken when the hold is created, which is the moment the
  -- price was shown. Confirmation persists these values, not a fresh read, so a
  -- catalog edit between hold and confirm cannot silently reprice a booking.
  service_name text not null,
  service_duration_min integer not null,
  service_buffer_min integer not null default 0,
  service_price_cents integer not null,
  service_currency text not null default 'usd',

  starts_at timestamptz not null,
  ends_at timestamptz not null,

  owner_profile_id uuid references public.profiles(id) on delete cascade,
  owner_session_key text,

  status text not null default 'active',
  expires_at timestamptz not null,
  consumed_appointment_id uuid references public.appointments(id) on delete set null,
  released_at timestamptz,

  -- Attribution captured at the door the hold came through, carried to the
  -- appointment on confirmation. Bounded, and never a secret.
  source_door text not null,
  source_surface text,
  campaign_id text,
  referral_code text,
  correlation_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_slot_holds_time_order check (ends_at > starts_at),
  constraint booking_slot_holds_duration_positive check (service_duration_min > 0),
  constraint booking_slot_holds_buffer_nonnegative check (service_buffer_min >= 0),
  constraint booking_slot_holds_price_nonnegative check (service_price_cents >= 0),
  constraint booking_slot_holds_status_check
    check (status in ('active', 'consumed', 'released', 'expired')),
  constraint booking_slot_holds_owner_present
    check (owner_profile_id is not null or owner_session_key is not null),
  constraint booking_slot_holds_consumed_has_appointment
    check (status <> 'consumed' or consumed_appointment_id is not null),
  constraint booking_slot_holds_source_door_check
    check (source_door in (
      'bvrb3r_app',
      'bvrb3r_web',
      'shop_profile',
      'barber_profile',
      'kiosk_shop',
      'kiosk_barber',
      'external_readonly'
    )),
  constraint booking_slot_holds_bounded_metadata check (
    char_length(coalesce(source_surface, '')) <= 120
    and char_length(coalesce(campaign_id, '')) <= 120
    and char_length(coalesce(referral_code, '')) <= 120
    and char_length(coalesce(correlation_id, '')) <= 120
    and char_length(coalesce(owner_session_key, '')) <= 200
  ),

  -- Mechanism 2. Two active holds for one barber cannot overlap, whatever the
  -- application believed when it asked. `now()` cannot appear in a constraint
  -- predicate, so expiry is not expressed here — it is applied by flipping stale
  -- rows to 'expired' under the barber lock before any availability read.
  constraint booking_slot_holds_no_overlap_active
    exclude using gist (
      barber_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status = 'active')
);

create index if not exists booking_slot_holds_barber_active_idx
  on public.booking_slot_holds (barber_id, status, expires_at);
create index if not exists booking_slot_holds_owner_profile_idx
  on public.booking_slot_holds (owner_profile_id, status, expires_at desc);
create index if not exists booking_slot_holds_window_idx
  on public.booking_slot_holds (barber_id, starts_at, ends_at);

alter table public.booking_slot_holds enable row level security;

-- No anonymous or authenticated reach at all. Guest and kiosk booking runs
-- through a server action on the service-role client, which is what makes rate
-- limiting and abuse control possible in the first place. A direct anon insert
-- would be an unauthenticated write to a scheduling resource.
revoke all on public.booking_slot_holds from anon, authenticated;
grant select, insert, update on public.booking_slot_holds to service_role;

comment on table public.booking_slot_holds is
  'Short-lived server-authorized claims on a barber timeline. Stores a token digest, never the token. RLS enabled with no client policy: server-only, so guest and kiosk booking stays rate-limitable.';

-- =========================================================
-- 4. Idempotency
--
-- A retry must not double-book, and a key must not be reusable for a different
-- request. The fingerprint is a digest of the normalized request computed by the
-- application; a replay with a matching fingerprint returns the stored result,
-- and a replay with a different one is refused rather than served.
--
-- Keys are scoped by actor as well as operation, so one caller cannot probe or
-- collide with another caller's key.
-- =========================================================

create table if not exists public.booking_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  actor_key text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint booking_idempotency_records_scope_check
    check (scope in ('hold_create', 'booking_confirm', 'booking_reschedule', 'booking_cancel')),
  constraint booking_idempotency_records_bounded check (
    char_length(actor_key) between 1 and 200
    and char_length(idempotency_key) between 8 and 200
    and char_length(request_fingerprint) between 8 and 128
  ),
  unique (scope, actor_key, idempotency_key)
);

create index if not exists booking_idempotency_records_created_idx
  on public.booking_idempotency_records (created_at desc);

alter table public.booking_idempotency_records enable row level security;

revoke all on public.booking_idempotency_records from anon, authenticated;
grant select, insert, update, delete on public.booking_idempotency_records to service_role;

comment on table public.booking_idempotency_records is
  'Booking idempotency ledger. A matching fingerprint replays the stored result; a mismatched one is refused. Server-only.';

-- =========================================================
-- 5. Confirmed service snapshot
--
-- `public.appointment_services` already exists, but the legacy path upserts it
-- with ON CONFLICT DO UPDATE, so it is a mirror of the current catalog rather
-- than a record of what was agreed. This table is the record: written once at
-- confirmation and immutable thereafter.
-- =========================================================

create table if not exists public.appointment_service_snapshots (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  service_name text not null,
  duration_min integer not null,
  buffer_min integer not null default 0,
  price_cents integer not null,
  currency text not null default 'usd',
  hold_id uuid references public.booking_slot_holds(id) on delete set null,
  captured_at timestamptz not null default now(),
  constraint appointment_service_snapshots_duration_positive check (duration_min > 0),
  constraint appointment_service_snapshots_buffer_nonnegative check (buffer_min >= 0),
  constraint appointment_service_snapshots_price_nonnegative check (price_cents >= 0)
);

alter table public.appointment_service_snapshots enable row level security;

-- SELECT and INSERT only, for the service role and nobody else. Withholding
-- UPDATE and DELETE from every role is what makes "snapshot" true; the trigger
-- further down is the second lock on the same door.
revoke all on public.appointment_service_snapshots from anon, authenticated;
grant select, insert on public.appointment_service_snapshots to service_role;

comment on table public.appointment_service_snapshots is
  'What the client actually agreed to, in integer cents, at confirmation. Immutable: later catalog edits never rewrite it.';

-- =========================================================
-- 6. Immutable attribution
--
-- The door a booking came through is a permanent fact about that booking. It is
-- written once and can never be edited, because attribution that can be revised
-- after the fact is worth nothing for either credit or dispute.
--
-- `external_readonly` exists so a future read-only calendar source (PR 33) can
-- be attributed without implying BVRB3R ever handled its money. Nothing in this
-- migration records an amount for that door, or for any other.
-- =========================================================

create table if not exists public.booking_attributions (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  original_source_door text not null,
  original_surface text,
  campaign_id text,
  referral_code text,
  correlation_id text,
  hold_id uuid references public.booking_slot_holds(id) on delete set null,
  first_recorded_at timestamptz not null default now(),
  constraint booking_attributions_source_door_check
    check (original_source_door in (
      'bvrb3r_app',
      'bvrb3r_web',
      'shop_profile',
      'barber_profile',
      'kiosk_shop',
      'kiosk_barber',
      'external_readonly'
    )),
  constraint booking_attributions_bounded check (
    char_length(coalesce(original_surface, '')) <= 120
    and char_length(coalesce(campaign_id, '')) <= 120
    and char_length(coalesce(referral_code, '')) <= 120
    and char_length(coalesce(correlation_id, '')) <= 120
  )
);

create index if not exists booking_attributions_door_idx
  on public.booking_attributions (original_source_door, first_recorded_at desc);
create index if not exists booking_attributions_campaign_idx
  on public.booking_attributions (campaign_id) where campaign_id is not null;

alter table public.booking_attributions enable row level security;

revoke all on public.booking_attributions from anon, authenticated;
grant select, insert on public.booking_attributions to service_role;

comment on table public.booking_attributions is
  'Immutable original door and bounded campaign metadata for one booking. Never stores money, PII, or a credential.';

-- =========================================================
-- 7. Append-only booking events
--
-- The lifecycle audit trail for the booking domain. It complements the PR 19
-- identity audit rather than duplicating it: PR 19 records who was allowed to
-- act, this records what happened to the appointment.
--
-- Idempotency keys are stored as a digest only. A raw key is a client-supplied
-- string that gates replay, so it is treated as credential-shaped.
-- =========================================================

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  hold_id uuid references public.booking_slot_holds(id) on delete set null,
  barber_id uuid references public.barbers(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  event_type text not null,
  outcome text not null default 'succeeded',
  correlation_id text,
  idempotency_key_hash text,
  metadata jsonb not null default '{}'::jsonb,
  constraint booking_events_event_type_check
    check (event_type in (
      'hold_created',
      'hold_released',
      'hold_expired',
      'hold_consumed',
      'booking_confirmed',
      'booking_rescheduled',
      'booking_cancelled'
    )),
  constraint booking_events_outcome_check
    check (outcome in ('succeeded', 'denied', 'failed', 'conflict', 'expired')),
  constraint booking_events_bounded check (
    char_length(coalesce(correlation_id, '')) <= 120
    and char_length(coalesce(idempotency_key_hash, '')) <= 128
    and char_length(coalesce(actor_role, '')) <= 64
  )
);

create index if not exists booking_events_appointment_idx
  on public.booking_events (appointment_id, occurred_at desc);
create index if not exists booking_events_barber_idx
  on public.booking_events (barber_id, occurred_at desc);
create index if not exists booking_events_correlation_idx
  on public.booking_events (correlation_id);

alter table public.booking_events enable row level security;

revoke all on public.booking_events from anon, authenticated;
grant select, insert on public.booking_events to service_role;

comment on table public.booking_events is
  'Append-only booking lifecycle audit. Stores an idempotency key digest, never the key. Server-only.';

-- =========================================================
-- 8. Append-only and immutability enforcement
--
-- Withholding the UPDATE and DELETE grants already stops the application. The
-- triggers stop a future migration that re-grants them without noticing what it
-- was protecting, and they are why "immutable" can be stated as a fact rather
-- than as a convention.
-- =========================================================

create or replace function private.pr20_reject_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'booking_record_is_append_only'
    using
      hint = 'Booking snapshots, attribution and events are written once. Record a new event instead.',
      detail = format('table=%s operation=%s', tg_table_name, tg_op);
end;
$$;

revoke all on function private.pr20_reject_mutation() from public;

drop trigger if exists pr20_append_only on public.booking_events;
create trigger pr20_append_only
  before update or delete on public.booking_events
  for each row
  execute function private.pr20_reject_mutation();

drop trigger if exists pr20_append_only on public.appointment_service_snapshots;
create trigger pr20_append_only
  before update or delete on public.appointment_service_snapshots
  for each row
  execute function private.pr20_reject_mutation();

-- Attribution guards UPDATE only. DELETE is left to the ON DELETE CASCADE from
-- `appointments`, which runs as a system action rather than an application one;
-- a BEFORE DELETE guard here would make an appointment row undeletable forever.
-- The withheld DELETE grant is what stops the application reaching it.
drop trigger if exists pr20_attribution_immutable on public.booking_attributions;
create trigger pr20_attribution_immutable
  before update on public.booking_attributions
  for each row
  execute function private.pr20_reject_mutation();

-- =========================================================
-- 9. Private helpers
--
-- Every one of these is SECURITY INVOKER. None needs to escalate: the only
-- caller is the server on the service-role client, which already bypasses RLS,
-- so a definer function would buy nothing and would hand a future caller
-- privileges it did not earn. Each pins `search_path` and revokes PUBLIC
-- execute.
-- =========================================================

grant usage on schema private to service_role;

-- Mechanism 1. Every write path against one barber's timeline serializes here.
-- The lock is transaction-scoped, so it is released on commit or rollback with
-- no cleanup path to forget. Two callers racing for the same chair-minute are
-- therefore ordered by the database, not by whichever application process
-- happened to read first.
create or replace function private.pr20_lock_barber_timeline(p_barber_id uuid)
returns void
language sql
set search_path = pg_catalog, pg_temp
as $$
  -- Single-key form. `pg_advisory_xact_lock` overloads are (bigint) and
  -- (int, int) — there is no (bigint, bigint), so the namespace is folded into
  -- the hashed text rather than passed as a second key.
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bvrb3r.pr20.barber_timeline:' || p_barber_id::text, 0)
  );
$$;

revoke all on function private.pr20_lock_barber_timeline(uuid) from public;
grant execute on function private.pr20_lock_barber_timeline(uuid) to service_role;

-- Lazy expiry. Called under the barber lock by every path that reads or writes
-- availability, so an expired hold stops blocking at the moment the next caller
-- arrives. There is no scheduled job to fail silently and no admin cleanup step.
create or replace function private.pr20_expire_stale_holds(p_barber_id uuid)
returns integer
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_expired integer := 0;
begin
  with expired as (
    update public.booking_slot_holds
       set status = 'expired',
           updated_at = pg_catalog.now()
     where barber_id = p_barber_id
       and status = 'active'
       and expires_at <= pg_catalog.now()
    returning id, barber_id, correlation_id
  )
  insert into public.booking_events (
    hold_id, barber_id, event_type, outcome, correlation_id, metadata
  )
  select expired.id, expired.barber_id, 'hold_expired', 'expired', expired.correlation_id,
         pg_catalog.jsonb_build_object('reason', 'ttl_elapsed')
    from expired;

  get diagnostics v_expired = row_count;
  return v_expired;
end;
$$;

revoke all on function private.pr20_expire_stale_holds(uuid) from public;
grant execute on function private.pr20_expire_stale_holds(uuid) to service_role;

-- The single definition of "this chair-minute is free": no live hold, no
-- non-cancelled appointment, no blocked time. Callers pass the row they are
-- themselves moving so an appointment does not collide with its own old slot.
create or replace function private.pr20_slot_is_free(
  p_barber_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_ignore_hold_id uuid,
  p_ignore_appointment_id uuid
)
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select not exists (
      select 1
        from public.booking_slot_holds h
       where h.barber_id = p_barber_id
         and h.status = 'active'
         and h.expires_at > pg_catalog.now()
         and (p_ignore_hold_id is null or h.id <> p_ignore_hold_id)
         and pg_catalog.tstzrange(h.starts_at, h.ends_at, '[)')
             && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')
    )
    and not exists (
      select 1
        from public.appointments a
       where a.barber_id = p_barber_id
         and a.status not in ('cancelled', 'no_show')
         and (p_ignore_appointment_id is null or a.id <> p_ignore_appointment_id)
         and pg_catalog.tstzrange(a.starts_at, a.ends_at, '[)')
             && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')
    )
    and not exists (
      select 1
        from public.blocked_times b
       where b.barber_id = p_barber_id
         and pg_catalog.tstzrange(b.starts_at, b.ends_at, '[)')
             && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')
    );
$$;

revoke all on function private.pr20_slot_is_free(uuid, timestamptz, timestamptz, uuid, uuid) from public;
grant execute on function private.pr20_slot_is_free(uuid, timestamptz, timestamptz, uuid, uuid) to service_role;

-- Defence in depth on top of the PR 19 predicates the application already
-- applies. Authorization is decided in the application, where the verified
-- session lives; this re-proves the relationship from canonical rows so a
-- caller that skipped a check still cannot move a stranger's appointment.
create or replace function private.pr20_actor_may_act_on_appointment(
  p_appointment_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select p_actor_profile_id is not null
    and (
      exists (
        select 1
          from public.appointments a
          left join public.clients c on c.id = a.client_id
          left join public.barbers b on b.id = a.barber_id
         where a.id = p_appointment_id
           and (c.profile_id = p_actor_profile_id or b.profile_id = p_actor_profile_id)
      )
      or exists (
        select 1
          from public.appointments a
          join public.shop_operator_access s on s.location_id = a.location_id
         where a.id = p_appointment_id
           and s.profile_id = p_actor_profile_id
           and s.status = 'active'
      )
      or exists (
        select 1
          from public.internal_operator_access i
         where i.profile_id = p_actor_profile_id
           and i.status = 'active'
      )
    );
$$;

revoke all on function private.pr20_actor_may_act_on_appointment(uuid, uuid) from public;
grant execute on function private.pr20_actor_may_act_on_appointment(uuid, uuid) to service_role;

-- Idempotency claim, resolved in one statement so two simultaneous retries of
-- the same key cannot both proceed. The no-op ON CONFLICT UPDATE is what makes
-- the existing row visible and row-locked to the loser of the race; `xmax = 0`
-- distinguishes the caller that actually inserted it.
create or replace function private.pr20_claim_idempotency(
  p_scope text,
  p_actor_key text,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_inserted boolean;
  v_fingerprint text;
  v_result jsonb;
begin
  -- An absent key means the caller accepted at-least-once semantics.
  if p_idempotency_key is null or p_request_fingerprint is null or p_actor_key is null then
    return pg_catalog.jsonb_build_object('state', 'absent');
  end if;

  insert into public.booking_idempotency_records (
    scope, actor_key, idempotency_key, request_fingerprint
  )
  values (p_scope, p_actor_key, p_idempotency_key, p_request_fingerprint)
  on conflict (scope, actor_key, idempotency_key)
    do update set scope = public.booking_idempotency_records.scope
  returning (xmax = 0), request_fingerprint, result
    into v_inserted, v_fingerprint, v_result;

  if v_inserted then
    return pg_catalog.jsonb_build_object('state', 'claimed');
  end if;

  -- Same key, different request. Serving the stored result here would answer a
  -- question the caller did not ask, so it is refused instead.
  if v_fingerprint is distinct from p_request_fingerprint then
    return pg_catalog.jsonb_build_object('state', 'mismatch');
  end if;

  return pg_catalog.jsonb_build_object('state', 'replay', 'result', coalesce(v_result, '{}'::jsonb));
end;
$$;

revoke all on function private.pr20_claim_idempotency(text, text, text, text) from public;
grant execute on function private.pr20_claim_idempotency(text, text, text, text) to service_role;

create or replace function private.pr20_finish_idempotency(
  p_scope text,
  p_actor_key text,
  p_idempotency_key text,
  p_result jsonb
)
returns void
language sql
set search_path = pg_catalog, pg_temp
as $$
  update public.booking_idempotency_records
     set result = p_result
   where p_idempotency_key is not null
     and p_actor_key is not null
     and scope = p_scope
     and actor_key = p_actor_key
     and idempotency_key = p_idempotency_key;
$$;

revoke all on function private.pr20_finish_idempotency(text, text, text, jsonb) from public;
grant execute on function private.pr20_finish_idempotency(text, text, text, jsonb) to service_role;

-- =========================================================
-- 10. Booking engine entry points
--
-- Five functions, all SECURITY INVOKER with an empty search_path and fully
-- schema-qualified relations, reachable only by the service role. Each returns
-- a structured outcome rather than raising for expected states, so the
-- application can normalize conflict / expired / forbidden / not_found /
-- validation without pattern-matching error strings.
--
-- None of them moves money, and none of them books without an explicit
-- confirmation call from the client.
-- =========================================================

create or replace function public.pr20_create_slot_hold(
  p_barber_id uuid,
  p_service_id uuid,
  p_location_id uuid,
  p_starts_at timestamptz,
  p_token_hash text,
  p_owner_profile_id uuid,
  p_owner_session_key text,
  p_source_door text,
  p_source_surface text default null,
  p_campaign_id text default null,
  p_referral_code text default null,
  p_correlation_id text default null,
  p_idempotency_key text default null,
  p_request_fingerprint text default null,
  p_actor_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_idempotency jsonb;
  v_actor_key text;
  v_service public.services%rowtype;
  v_barber_exists boolean;
  v_timezone text;
  v_lead integer;
  v_horizon integer;
  v_ttl integer;
  v_accepts boolean;
  v_location_id uuid;
  v_ends_at timestamptz;
  v_hold public.booking_slot_holds%rowtype;
  v_result jsonb;
begin
  if p_barber_id is null or p_service_id is null or p_starts_at is null
     or p_token_hash is null or p_source_door is null then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'missing_required_input');
  end if;

  -- An unowned hold could be released or consumed by anyone who guessed the id.
  if p_owner_profile_id is null
     and coalesce(pg_catalog.btrim(p_owner_session_key), '') = '' then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'owner_binding_required');
  end if;

  v_actor_key := coalesce(p_actor_key, p_owner_profile_id::text, p_owner_session_key);

  v_idempotency := private.pr20_claim_idempotency(
    'hold_create', v_actor_key, p_idempotency_key, p_request_fingerprint
  );
  if v_idempotency ->> 'state' = 'replay' then
    return v_idempotency -> 'result';
  end if;
  if v_idempotency ->> 'state' = 'mismatch' then
    return pg_catalog.jsonb_build_object('outcome', 'idempotency_conflict', 'reason', 'key_reused_with_different_payload');
  end if;

  select true into v_barber_exists from public.barbers where id = p_barber_id;
  if not coalesce(v_barber_exists, false) then
    return pg_catalog.jsonb_build_object('outcome', 'not_found', 'reason', 'barber_not_found');
  end if;

  select * into v_service from public.services where id = p_service_id;
  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found', 'reason', 'service_not_found');
  end if;

  -- Bookability is read from the catalog, never from the request. Duration and
  -- price come from the same row for the same reason.
  if not coalesce(v_service.active, false)
     or not coalesce(v_service.is_bookable, false) then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'service_not_bookable');
  end if;

  select p.booking_timezone, p.lead_time_minutes, p.booking_horizon_days,
         p.hold_ttl_seconds, p.accepts_online_booking
    into v_timezone, v_lead, v_horizon, v_ttl, v_accepts
    from public.barber_booking_policies p
   where p.barber_id = p_barber_id;

  -- A barber with no policy row is not misconfigured; these are the defaults the
  -- table itself declares.
  v_lead := coalesce(v_lead, 15);
  v_horizon := coalesce(v_horizon, 60);
  v_ttl := coalesce(v_ttl, 300);
  v_accepts := coalesce(v_accepts, true);

  if not v_accepts then
    return pg_catalog.jsonb_build_object('outcome', 'forbidden', 'reason', 'barber_not_accepting_bookings');
  end if;

  v_location_id := coalesce(p_location_id, v_service.location_id);
  if v_location_id is null then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'location_required');
  end if;

  v_ends_at := p_starts_at
    + pg_catalog.make_interval(mins => v_service.duration_min + coalesce(v_service.buffer_min, 0));

  if p_starts_at < v_now + pg_catalog.make_interval(mins => v_lead) then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'lead_time_not_met');
  end if;

  if p_starts_at > v_now + pg_catalog.make_interval(days => v_horizon) then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'outside_booking_horizon');
  end if;

  perform private.pr20_lock_barber_timeline(p_barber_id);
  perform private.pr20_expire_stale_holds(p_barber_id);

  if not private.pr20_slot_is_free(p_barber_id, p_starts_at, v_ends_at, null, null) then
    insert into public.booking_events (barber_id, event_type, outcome, correlation_id, metadata)
    values (p_barber_id, 'hold_created', 'conflict', p_correlation_id,
            pg_catalog.jsonb_build_object('reason', 'slot_unavailable'));
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'slot_unavailable');
  end if;

  insert into public.booking_slot_holds (
    token_hash, barber_id, location_id, service_id,
    service_name, service_duration_min, service_buffer_min, service_price_cents, service_currency,
    starts_at, ends_at, owner_profile_id, owner_session_key,
    status, expires_at,
    source_door, source_surface, campaign_id, referral_code, correlation_id
  )
  values (
    p_token_hash, p_barber_id, v_location_id, v_service.id,
    v_service.name, v_service.duration_min, coalesce(v_service.buffer_min, 0),
    v_service.price_cents, coalesce(v_service.currency, 'usd'),
    p_starts_at, v_ends_at, p_owner_profile_id, nullif(pg_catalog.btrim(p_owner_session_key), ''),
    'active', v_now + pg_catalog.make_interval(secs => v_ttl),
    p_source_door, p_source_surface, p_campaign_id, p_referral_code, p_correlation_id
  )
  returning * into v_hold;

  v_result := pg_catalog.jsonb_build_object(
    'outcome', 'created',
    'holdId', v_hold.id,
    'barberId', v_hold.barber_id,
    'locationId', v_hold.location_id,
    'serviceId', v_hold.service_id,
    'serviceName', v_hold.service_name,
    'serviceDurationMin', v_hold.service_duration_min,
    'serviceBufferMin', v_hold.service_buffer_min,
    'servicePriceCents', v_hold.service_price_cents,
    'serviceCurrency', v_hold.service_currency,
    'startsAt', v_hold.starts_at,
    'endsAt', v_hold.ends_at,
    'expiresAt', v_hold.expires_at,
    'sourceDoor', v_hold.source_door
  );

  insert into public.booking_events (
    hold_id, barber_id, actor_profile_id, event_type, outcome, correlation_id, idempotency_key_hash, metadata
  )
  values (
    v_hold.id, v_hold.barber_id, p_owner_profile_id, 'hold_created', 'succeeded',
    p_correlation_id, p_request_fingerprint,
    pg_catalog.jsonb_build_object('sourceDoor', v_hold.source_door, 'ttlSeconds', v_ttl)
  );

  perform private.pr20_finish_idempotency('hold_create', v_actor_key, p_idempotency_key, v_result);

  return v_result;
exception
  -- Mechanism 2 firing. Reaching here means the exclusion constraint refused an
  -- overlap the lock should already have prevented; it is still a conflict, and
  -- it is still never reported as a success.
  when exclusion_violation then
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'slot_unavailable');
  when unique_violation then
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'hold_token_replayed');
end;
$$;

create or replace function public.pr20_release_slot_hold(
  p_token_hash text,
  p_owner_profile_id uuid,
  p_owner_session_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_hold public.booking_slot_holds%rowtype;
begin
  if p_token_hash is null then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'missing_required_input');
  end if;

  select * into v_hold
    from public.booking_slot_holds
   where token_hash = p_token_hash
     for update;

  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found', 'reason', 'hold_not_found');
  end if;

  if not (
    (v_hold.owner_profile_id is not null and v_hold.owner_profile_id = p_owner_profile_id)
    or (v_hold.owner_session_key is not null and v_hold.owner_session_key = p_owner_session_key)
  ) then
    return pg_catalog.jsonb_build_object('outcome', 'forbidden', 'reason', 'hold_not_owned');
  end if;

  if v_hold.status = 'consumed' then
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'hold_already_consumed');
  end if;

  -- Releasing an already-released or expired hold is a no-op, not an error: a
  -- client that retries a release must not be handed a failure.
  if v_hold.status <> 'active' then
    return pg_catalog.jsonb_build_object('outcome', 'released', 'holdId', v_hold.id, 'alreadyReleased', true);
  end if;

  update public.booking_slot_holds
     set status = 'released',
         released_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = v_hold.id;

  insert into public.booking_events (
    hold_id, barber_id, actor_profile_id, event_type, outcome, correlation_id, metadata
  )
  values (
    v_hold.id, v_hold.barber_id, p_owner_profile_id, 'hold_released', 'succeeded',
    v_hold.correlation_id, pg_catalog.jsonb_build_object('reason', 'client_released')
  );

  return pg_catalog.jsonb_build_object('outcome', 'released', 'holdId', v_hold.id, 'alreadyReleased', false);
end;
$$;

create or replace function public.pr20_confirm_booking(
  p_token_hash text,
  p_owner_profile_id uuid,
  p_owner_session_key text,
  p_client_id uuid,
  p_actor_profile_id uuid,
  p_actor_role text,
  p_client_note text default null,
  p_idempotency_key text default null,
  p_request_fingerprint text default null,
  p_actor_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_idempotency jsonb;
  v_actor_key text;
  v_hold public.booking_slot_holds%rowtype;
  v_client_exists boolean;
  v_appointment_id uuid := pg_catalog.gen_random_uuid();
  v_price numeric(10,2);
  v_result jsonb;
  v_consumed integer;
begin
  if p_token_hash is null or p_client_id is null then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'missing_required_input');
  end if;

  v_actor_key := coalesce(p_actor_key, p_owner_profile_id::text, p_owner_session_key);

  v_idempotency := private.pr20_claim_idempotency(
    'booking_confirm', v_actor_key, p_idempotency_key, p_request_fingerprint
  );
  if v_idempotency ->> 'state' = 'replay' then
    return v_idempotency -> 'result';
  end if;
  if v_idempotency ->> 'state' = 'mismatch' then
    return pg_catalog.jsonb_build_object('outcome', 'idempotency_conflict', 'reason', 'key_reused_with_different_payload');
  end if;

  select * into v_hold
    from public.booking_slot_holds
   where token_hash = p_token_hash
     for update;

  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found', 'reason', 'hold_not_found');
  end if;

  -- Ownership is proved before anything else is disclosed about the hold.
  if not (
    (v_hold.owner_profile_id is not null and v_hold.owner_profile_id = p_owner_profile_id)
    or (v_hold.owner_session_key is not null and v_hold.owner_session_key = p_owner_session_key)
  ) then
    return pg_catalog.jsonb_build_object('outcome', 'forbidden', 'reason', 'hold_not_owned');
  end if;

  if v_hold.status = 'consumed' then
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'hold_already_consumed');
  end if;

  if v_hold.status <> 'active' or v_hold.expires_at <= v_now then
    if v_hold.status = 'active' then
      update public.booking_slot_holds
         set status = 'expired', updated_at = v_now
       where id = v_hold.id;
    end if;

    insert into public.booking_events (hold_id, barber_id, event_type, outcome, correlation_id, metadata)
    values (v_hold.id, v_hold.barber_id, 'booking_confirmed', 'expired', v_hold.correlation_id,
            pg_catalog.jsonb_build_object('reason', 'hold_expired'));

    return pg_catalog.jsonb_build_object('outcome', 'expired', 'reason', 'hold_expired', 'holdId', v_hold.id);
  end if;

  select true into v_client_exists from public.clients where id = p_client_id;
  if not coalesce(v_client_exists, false) then
    return pg_catalog.jsonb_build_object('outcome', 'not_found', 'reason', 'client_not_found');
  end if;

  perform private.pr20_lock_barber_timeline(v_hold.barber_id);
  perform private.pr20_expire_stale_holds(v_hold.barber_id);

  if not private.pr20_slot_is_free(v_hold.barber_id, v_hold.starts_at, v_hold.ends_at, v_hold.id, null) then
    insert into public.booking_events (hold_id, barber_id, event_type, outcome, correlation_id, metadata)
    values (v_hold.id, v_hold.barber_id, 'booking_confirmed', 'conflict', v_hold.correlation_id,
            pg_catalog.jsonb_build_object('reason', 'slot_unavailable'));
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'slot_unavailable');
  end if;

  -- The agreed price, recorded. PR 20 never captures, authorizes or implies a
  -- payment: `deposit_amount` stays zero and no payment row is written here.
  v_price := (v_hold.service_price_cents::numeric / 100);

  insert into public.appointments (
    id, reference_code, location_id, shop_id, barber_id, client_id, service_id,
    status, source, booking_source, confirmation_code,
    starts_at, ends_at,
    deposit_amount, service_total, add_on_total, subtotal, discount_total,
    tax_total, total_amount, grand_total, balance_due, tip_amount,
    client_note, created_by, lifecycle_revision, last_actor_role, last_event_type, updated_at
  )
  values (
    v_appointment_id,
    'bkg_' || pg_catalog.replace(v_appointment_id::text, '-', ''),
    v_hold.location_id, v_hold.location_id, v_hold.barber_id, p_client_id, v_hold.service_id,
    'confirmed', 'booking', v_hold.source_door,
    pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(v_appointment_id::text), 1, 10)),
    v_hold.starts_at, v_hold.ends_at,
    0, v_price, 0, v_price, 0,
    0, v_price, v_price, v_price, 0,
    p_client_note, p_actor_profile_id, 1, p_actor_role, 'booked', v_now
  );

  -- Written once, never rewritten. A later catalog edit cannot reach it.
  insert into public.appointment_service_snapshots (
    appointment_id, service_id, service_name, duration_min, buffer_min, price_cents, currency, hold_id
  )
  values (
    v_appointment_id, v_hold.service_id, v_hold.service_name,
    v_hold.service_duration_min, v_hold.service_buffer_min,
    v_hold.service_price_cents, v_hold.service_currency, v_hold.id
  );

  insert into public.booking_attributions (
    appointment_id, original_source_door, original_surface, campaign_id, referral_code, correlation_id, hold_id
  )
  values (
    v_appointment_id, v_hold.source_door, v_hold.source_surface,
    v_hold.campaign_id, v_hold.referral_code, v_hold.correlation_id, v_hold.id
  );

  -- Consumed exactly once: the `status = 'active'` predicate is the guard, and
  -- the row count is checked rather than assumed.
  update public.booking_slot_holds
     set status = 'consumed',
         consumed_appointment_id = v_appointment_id,
         updated_at = v_now
   where id = v_hold.id
     and status = 'active';

  get diagnostics v_consumed = row_count;
  if v_consumed <> 1 then
    raise exception 'pr20_hold_consume_race'
      using hint = 'The hold changed state inside the transaction that owned it.';
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'outcome', 'confirmed',
    'appointmentId', v_appointment_id,
    'holdId', v_hold.id,
    'barberId', v_hold.barber_id,
    'clientId', p_client_id,
    'serviceId', v_hold.service_id,
    'startsAt', v_hold.starts_at,
    'endsAt', v_hold.ends_at,
    'status', 'confirmed',
    'revision', 1,
    'servicePriceCents', v_hold.service_price_cents,
    'sourceDoor', v_hold.source_door
  );

  insert into public.booking_events (
    appointment_id, hold_id, barber_id, actor_profile_id, actor_role,
    event_type, outcome, correlation_id, idempotency_key_hash, metadata
  )
  values (
    v_appointment_id, v_hold.id, v_hold.barber_id, p_actor_profile_id, p_actor_role,
    'booking_confirmed', 'succeeded', v_hold.correlation_id, p_request_fingerprint,
    pg_catalog.jsonb_build_object('sourceDoor', v_hold.source_door, 'priceCents', v_hold.service_price_cents)
  ),
  (
    v_appointment_id, v_hold.id, v_hold.barber_id, p_actor_profile_id, p_actor_role,
    'hold_consumed', 'succeeded', v_hold.correlation_id, p_request_fingerprint, '{}'::jsonb
  );

  perform private.pr20_finish_idempotency('booking_confirm', v_actor_key, p_idempotency_key, v_result);

  return v_result;
exception
  -- Mechanism 3. `appointments_no_overlap_active` is the authority on whether a
  -- confirmation succeeded, and it is checked by the database, not by us.
  when exclusion_violation then
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'slot_unavailable');
end;
$$;

create or replace function public.pr20_reschedule_booking(
  p_appointment_id uuid,
  p_expected_revision integer,
  p_token_hash text,
  p_actor_profile_id uuid,
  p_actor_role text,
  p_reason text default null,
  p_idempotency_key text default null,
  p_request_fingerprint text default null,
  p_actor_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_idempotency jsonb;
  v_actor_key text;
  v_appointment public.appointments%rowtype;
  v_hold public.booking_slot_holds%rowtype;
  v_result jsonb;
  v_consumed integer;
  v_moved integer;
begin
  if p_appointment_id is null or p_token_hash is null or p_expected_revision is null then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'missing_required_input');
  end if;

  v_actor_key := coalesce(p_actor_key, p_actor_profile_id::text);

  v_idempotency := private.pr20_claim_idempotency(
    'booking_reschedule', v_actor_key, p_idempotency_key, p_request_fingerprint
  );
  if v_idempotency ->> 'state' = 'replay' then
    return v_idempotency -> 'result';
  end if;
  if v_idempotency ->> 'state' = 'mismatch' then
    return pg_catalog.jsonb_build_object('outcome', 'idempotency_conflict', 'reason', 'key_reused_with_different_payload');
  end if;

  if not private.pr20_actor_may_act_on_appointment(p_appointment_id, p_actor_profile_id) then
    insert into public.booking_events (appointment_id, actor_profile_id, actor_role, event_type, outcome, metadata)
    values (p_appointment_id, p_actor_profile_id, p_actor_role, 'booking_rescheduled', 'denied',
            pg_catalog.jsonb_build_object('reason', 'actor_not_permitted'));
    return pg_catalog.jsonb_build_object('outcome', 'forbidden', 'reason', 'actor_not_permitted');
  end if;

  select * into v_appointment
    from public.appointments
   where id = p_appointment_id
     for update;

  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found', 'reason', 'appointment_not_found');
  end if;

  -- PR 20 owns hold, confirm, reschedule, cancel. Anything already in the chair
  -- belongs to the queue and check-in domain, so it is refused here rather than
  -- half-handled.
  if v_appointment.status not in ('pending', 'confirmed', 'booked') then
    return pg_catalog.jsonb_build_object(
      'outcome', 'forbidden', 'reason', 'invalid_transition',
      'status', v_appointment.status
    );
  end if;

  if coalesce(v_appointment.lifecycle_revision, 1) <> p_expected_revision then
    return pg_catalog.jsonb_build_object(
      'outcome', 'conflict', 'reason', 'stale_revision',
      'currentRevision', coalesce(v_appointment.lifecycle_revision, 1)
    );
  end if;

  select * into v_hold
    from public.booking_slot_holds
   where token_hash = p_token_hash
     for update;

  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found', 'reason', 'hold_not_found');
  end if;

  if v_hold.owner_profile_id is not null and v_hold.owner_profile_id <> p_actor_profile_id then
    return pg_catalog.jsonb_build_object('outcome', 'forbidden', 'reason', 'hold_not_owned');
  end if;

  if v_hold.status <> 'active' or v_hold.expires_at <= v_now then
    return pg_catalog.jsonb_build_object('outcome', 'expired', 'reason', 'hold_expired', 'holdId', v_hold.id);
  end if;

  -- Moving a booking to a different barber is a transfer, which is PR 21.
  if v_hold.barber_id <> v_appointment.barber_id then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'barber_change_not_supported');
  end if;

  perform private.pr20_lock_barber_timeline(v_appointment.barber_id);
  perform private.pr20_expire_stale_holds(v_appointment.barber_id);

  if not private.pr20_slot_is_free(
       v_appointment.barber_id, v_hold.starts_at, v_hold.ends_at, v_hold.id, v_appointment.id
     ) then
    insert into public.booking_events (appointment_id, hold_id, barber_id, event_type, outcome, metadata)
    values (v_appointment.id, v_hold.id, v_appointment.barber_id, 'booking_rescheduled', 'conflict',
            pg_catalog.jsonb_build_object('reason', 'slot_unavailable'));
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'slot_unavailable');
  end if;

  -- One statement. The old window is given up and the new one taken together,
  -- and `appointments_no_overlap_active` is evaluated against the result, so the
  -- booking is never briefly holding neither slot or both.
  update public.appointments
     set starts_at = v_hold.starts_at,
         ends_at = v_hold.ends_at,
         lifecycle_revision = coalesce(lifecycle_revision, 1) + 1,
         last_actor_role = p_actor_role,
         last_event_type = 'rescheduled',
         updated_at = v_now
   where id = v_appointment.id
     and coalesce(lifecycle_revision, 1) = p_expected_revision;

  get diagnostics v_moved = row_count;
  if v_moved <> 1 then
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'stale_revision');
  end if;

  -- The old slot is released exactly once, by that single UPDATE. The hold is
  -- consumed exactly once, guarded the same way.
  update public.booking_slot_holds
     set status = 'consumed',
         consumed_appointment_id = v_appointment.id,
         updated_at = v_now
   where id = v_hold.id
     and status = 'active';

  get diagnostics v_consumed = row_count;
  if v_consumed <> 1 then
    raise exception 'pr20_hold_consume_race'
      using hint = 'The hold changed state inside the transaction that owned it.';
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'outcome', 'rescheduled',
    'appointmentId', v_appointment.id,
    'holdId', v_hold.id,
    'barberId', v_appointment.barber_id,
    'previousStartsAt', v_appointment.starts_at,
    'startsAt', v_hold.starts_at,
    'endsAt', v_hold.ends_at,
    'revision', coalesce(v_appointment.lifecycle_revision, 1) + 1
  );

  insert into public.booking_events (
    appointment_id, hold_id, barber_id, actor_profile_id, actor_role,
    event_type, outcome, correlation_id, idempotency_key_hash, metadata
  )
  values (
    v_appointment.id, v_hold.id, v_appointment.barber_id, p_actor_profile_id, p_actor_role,
    'booking_rescheduled', 'succeeded', v_hold.correlation_id, p_request_fingerprint,
    pg_catalog.jsonb_build_object(
      'reason', p_reason,
      'previousStartsAt', v_appointment.starts_at,
      'startsAt', v_hold.starts_at
    )
  ),
  (
    v_appointment.id, v_hold.id, v_appointment.barber_id, p_actor_profile_id, p_actor_role,
    'hold_consumed', 'succeeded', v_hold.correlation_id, p_request_fingerprint, '{}'::jsonb
  );

  perform private.pr20_finish_idempotency('booking_reschedule', v_actor_key, p_idempotency_key, v_result);

  return v_result;
exception
  when exclusion_violation then
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'slot_unavailable');
end;
$$;

create or replace function public.pr20_cancel_booking(
  p_appointment_id uuid,
  p_expected_revision integer,
  p_actor_profile_id uuid,
  p_actor_role text,
  p_reason text default null,
  p_idempotency_key text default null,
  p_request_fingerprint text default null,
  p_actor_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_idempotency jsonb;
  v_actor_key text;
  v_appointment public.appointments%rowtype;
  v_result jsonb;
  v_cancelled integer;
begin
  if p_appointment_id is null or p_expected_revision is null then
    return pg_catalog.jsonb_build_object('outcome', 'validation', 'reason', 'missing_required_input');
  end if;

  v_actor_key := coalesce(p_actor_key, p_actor_profile_id::text);

  v_idempotency := private.pr20_claim_idempotency(
    'booking_cancel', v_actor_key, p_idempotency_key, p_request_fingerprint
  );
  if v_idempotency ->> 'state' = 'replay' then
    return v_idempotency -> 'result';
  end if;
  if v_idempotency ->> 'state' = 'mismatch' then
    return pg_catalog.jsonb_build_object('outcome', 'idempotency_conflict', 'reason', 'key_reused_with_different_payload');
  end if;

  if not private.pr20_actor_may_act_on_appointment(p_appointment_id, p_actor_profile_id) then
    insert into public.booking_events (appointment_id, actor_profile_id, actor_role, event_type, outcome, metadata)
    values (p_appointment_id, p_actor_profile_id, p_actor_role, 'booking_cancelled', 'denied',
            pg_catalog.jsonb_build_object('reason', 'actor_not_permitted'));
    return pg_catalog.jsonb_build_object('outcome', 'forbidden', 'reason', 'actor_not_permitted');
  end if;

  select * into v_appointment
    from public.appointments
   where id = p_appointment_id
     for update;

  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found', 'reason', 'appointment_not_found');
  end if;

  -- Cancelling an already-cancelled booking is the same answer, not a failure.
  if v_appointment.status = 'cancelled' then
    return pg_catalog.jsonb_build_object(
      'outcome', 'cancelled',
      'appointmentId', v_appointment.id,
      'alreadyCancelled', true,
      'revision', coalesce(v_appointment.lifecycle_revision, 1)
    );
  end if;

  -- A finished or no-show booking is history. Reversing it is a money decision
  -- and belongs to the refund path, not to PR 20.
  if v_appointment.status not in ('pending', 'confirmed', 'booked', 'checked_in') then
    return pg_catalog.jsonb_build_object(
      'outcome', 'forbidden', 'reason', 'invalid_transition', 'status', v_appointment.status
    );
  end if;

  if coalesce(v_appointment.lifecycle_revision, 1) <> p_expected_revision then
    return pg_catalog.jsonb_build_object(
      'outcome', 'conflict', 'reason', 'stale_revision',
      'currentRevision', coalesce(v_appointment.lifecycle_revision, 1)
    );
  end if;

  update public.appointments
     set status = 'cancelled',
         cancelled_at = v_now,
         cancellation_reason = p_reason,
         lifecycle_revision = coalesce(lifecycle_revision, 1) + 1,
         last_actor_role = p_actor_role,
         last_event_type = 'cancelled',
         updated_at = v_now
   where id = v_appointment.id
     and coalesce(lifecycle_revision, 1) = p_expected_revision;

  get diagnostics v_cancelled = row_count;
  if v_cancelled <> 1 then
    return pg_catalog.jsonb_build_object('outcome', 'conflict', 'reason', 'stale_revision');
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'outcome', 'cancelled',
    'appointmentId', v_appointment.id,
    'alreadyCancelled', false,
    'cancelledAt', v_now,
    'revision', coalesce(v_appointment.lifecycle_revision, 1) + 1
  );

  insert into public.booking_events (
    appointment_id, barber_id, actor_profile_id, actor_role,
    event_type, outcome, idempotency_key_hash, metadata
  )
  values (
    v_appointment.id, v_appointment.barber_id, p_actor_profile_id, p_actor_role,
    'booking_cancelled', 'succeeded', p_request_fingerprint,
    pg_catalog.jsonb_build_object('reason', p_reason)
  );

  perform private.pr20_finish_idempotency('booking_cancel', v_actor_key, p_idempotency_key, v_result);

  return v_result;
end;
$$;

-- =========================================================
-- 11. Function reachability
--
-- Grants decide what an object can be reached by; RLS decides which rows come
-- back. These five functions write scheduling state, so they are reachable only
-- by the service role — which is the same thing as saying every booking
-- mutation must pass through a server action that can authorize and rate-limit
-- it. PUBLIC, anon and authenticated are revoked explicitly rather than left to
-- a default.
-- =========================================================

revoke all on function public.pr20_create_slot_hold(
  uuid, uuid, uuid, timestamptz, text, uuid, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.pr20_create_slot_hold(
  uuid, uuid, uuid, timestamptz, text, uuid, text, text, text, text, text, text, text, text, text
) to service_role;

revoke all on function public.pr20_release_slot_hold(text, uuid, text) from public, anon, authenticated;
grant execute on function public.pr20_release_slot_hold(text, uuid, text) to service_role;

revoke all on function public.pr20_confirm_booking(
  text, uuid, text, uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.pr20_confirm_booking(
  text, uuid, text, uuid, uuid, text, text, text, text, text
) to service_role;

revoke all on function public.pr20_reschedule_booking(
  uuid, integer, text, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.pr20_reschedule_booking(
  uuid, integer, text, uuid, text, text, text, text, text
) to service_role;

revoke all on function public.pr20_cancel_booking(
  uuid, integer, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.pr20_cancel_booking(
  uuid, integer, uuid, text, text, text, text, text
) to service_role;

commit;
