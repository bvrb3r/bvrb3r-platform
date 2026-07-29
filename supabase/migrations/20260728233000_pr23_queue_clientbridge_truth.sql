-- ============================================================================
-- Product PR23 — canonical queue truth, ChairSync, ClientBridge and delivery
-- evidence.
--
-- The queue record is the only source of position and wait-time truth. Client,
-- kiosk, barber, owner and TV surfaces read the server-authored columns below;
-- none is allowed to derive a separate answer.
--
-- External appointment truth is intentionally operational only. No external
-- amount is stored by this contract and an external payment owner can never be
-- interpreted as BVRB3R revenue, Stripe volume or AutoBooth proceeds.
-- ============================================================================

begin;

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- --------------------------------------------------------------------------
-- Appointment source and payment ownership
-- --------------------------------------------------------------------------

alter table public.appointments
  add column if not exists source_provider text not null default 'bvrb3r',
  add column if not exists payment_owner text not null default 'unpaid_manual',
  add column if not exists external_financial_data_private boolean not null default false;

update public.appointments
set source_provider = case
      when lower(coalesce(booking_source, source, '')) like '%booksy%' then 'booksy'
      when lower(coalesce(booking_source, source, '')) like '%square%' then 'square'
      when lower(coalesce(booking_source, source, '')) like '%thecut%' then 'thecut'
      else 'bvrb3r'
    end,
    payment_owner = case
      when lower(coalesce(booking_source, source, '')) like '%booksy%' then 'external:booksy'
      when lower(coalesce(booking_source, source, '')) like '%square%' then 'external:square'
      when lower(coalesce(booking_source, source, '')) like '%thecut%' then 'external:thecut'
      when lower(coalesce(booking_source, source, '')) in ('walk_in', 'walk_in_queue', 'kiosk') then 'bvrb3r_cash'
      else 'bvrb3r_card'
    end,
    external_financial_data_private =
      lower(coalesce(booking_source, source, '')) like any (array['%booksy%', '%square%', '%thecut%'])
where source_provider = 'bvrb3r'
  and payment_owner = 'unpaid_manual';

alter table public.appointments
  drop constraint if exists appointments_source_provider_ck,
  drop constraint if exists appointments_payment_owner_ck,
  drop constraint if exists appointments_external_financial_privacy_ck;

alter table public.appointments
  add constraint appointments_source_provider_ck
    check (source_provider in ('bvrb3r', 'booksy', 'square', 'thecut')),
  add constraint appointments_payment_owner_ck
    check (
      payment_owner in ('bvrb3r_card', 'bvrb3r_cash', 'unpaid_manual')
      or payment_owner ~ '^external:(booksy|square|thecut)$'
    ),
  add constraint appointments_external_financial_privacy_ck
    check (
      (source_provider = 'bvrb3r' and payment_owner !~ '^external:')
      or
      (
        source_provider in ('booksy', 'square', 'thecut')
        and payment_owner = 'external:' || source_provider
        and external_financial_data_private
      )
    ) not valid;

create index if not exists appointments_source_provider_starts_idx
  on public.appointments (source_provider, starts_at);
create index if not exists appointments_payment_owner_idx
  on public.appointments (payment_owner, starts_at);

comment on column public.appointments.payment_owner is
  'Money-ownership disclosure, not payment status. External owners never enter BVRB3R revenue, Stripe, fee or AutoBooth calculations.';

-- --------------------------------------------------------------------------
-- Read-only ChairSync imports
-- --------------------------------------------------------------------------

create table if not exists public.chairsync_appointments (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_appointment_id text not null,
  location_id uuid not null references public.locations(id) on delete cascade,
  barber_id uuid references public.barbers(id) on delete set null,
  linked_client_id uuid references public.clients(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  service_name text not null,
  client_display_name text not null,
  client_phone text,
  client_email text,
  confirmation_code_hash text,
  qr_payload_hash text,
  status text not null default 'booked',
  payment_owner text not null,
  provider_data_restricted boolean not null default false,
  checked_in_at timestamptz,
  checked_in_waitlist_entry_id uuid references public.waitlist_entries(id) on delete set null,
  imported_at timestamptz not null default now(),
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint chairsync_provider_ck check (provider in ('booksy', 'square', 'thecut')),
  constraint chairsync_time_ck check (ends_at > starts_at),
  constraint chairsync_status_ck check (status in ('booked', 'confirmed', 'checked_in', 'completed', 'canceled', 'no_show')),
  constraint chairsync_payment_owner_ck check (payment_owner = 'external:' || provider),
  constraint chairsync_confirmation_hash_ck check (
    confirmation_code_hash is null or confirmation_code_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint chairsync_qr_hash_ck check (
    qr_payload_hash is null or qr_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  unique (provider, provider_appointment_id)
);

create index if not exists chairsync_location_starts_idx
  on public.chairsync_appointments (location_id, starts_at);
create index if not exists chairsync_barber_starts_idx
  on public.chairsync_appointments (barber_id, starts_at)
  where barber_id is not null;
create index if not exists chairsync_phone_idx
  on public.chairsync_appointments (client_phone, starts_at)
  where client_phone is not null and not provider_data_restricted;
create index if not exists chairsync_email_idx
  on public.chairsync_appointments (lower(client_email), starts_at)
  where client_email is not null and not provider_data_restricted;
create index if not exists chairsync_confirmation_idx
  on public.chairsync_appointments (confirmation_code_hash)
  where confirmation_code_hash is not null;
create index if not exists chairsync_qr_idx
  on public.chairsync_appointments (qr_payload_hash)
  where qr_payload_hash is not null;

comment on table public.chairsync_appointments is
  'Read-only operational appointment truth imported from Booksy, Square or theCut. No external amount columns exist by design.';

-- --------------------------------------------------------------------------
-- Canonical queue record
-- --------------------------------------------------------------------------

alter table public.waitlist_entries
  add column if not exists idempotency_key text,
  add column if not exists idempotency_payload_hash text,
  add column if not exists entry_type text not null default 'walkin',
  add column if not exists source_provider text not null default 'bvrb3r',
  add column if not exists payment_owner text not null default 'bvrb3r_cash',
  add column if not exists assignment_locked boolean not null default false,
  add column if not exists canonical_position integer,
  add column if not exists wait_reason text,
  add column if not exists wait_version bigint not null default 1,
  add column if not exists last_synced_at timestamptz not null default now(),
  add column if not exists last_mutated_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_mutation_reason text,
  add column if not exists chairsync_appointment_id uuid references public.chairsync_appointments(id) on delete set null,
  add column if not exists operational_sms_consent boolean not null default false,
  add column if not exists rejoin_of_entry_id uuid references public.waitlist_entries(id) on delete set null;

update public.waitlist_entries
set entry_type = case when chairsync_appointment_id is null and converted_appointment_id is null then 'walkin' else 'booked' end,
    source_provider = case
      when queue_source = 'kiosk' then 'bvrb3r'
      else coalesce(nullif(source_provider, ''), 'bvrb3r')
    end,
    payment_owner = case
      when queue_source in ('walk_in', 'kiosk') then 'bvrb3r_cash'
      else coalesce(nullif(payment_owner, ''), 'unpaid_manual')
    end,
    assignment_locked = (
      case when chairsync_appointment_id is null and converted_appointment_id is null then 'walkin' else 'booked' end = 'booked'
      or
      case
        when queue_source in ('walk_in', 'kiosk') then 'bvrb3r_cash'
        else coalesce(nullif(payment_owner, ''), 'unpaid_manual')
      end <> 'bvrb3r_cash'
    ),
    last_synced_at = coalesce(last_synced_at, updated_at, created_at, now())
where true;

alter table public.waitlist_entries
  drop constraint if exists waitlist_entries_public_queue_state_ck,
  drop constraint if exists waitlist_entries_entry_type_ck,
  drop constraint if exists waitlist_entries_source_provider_ck,
  drop constraint if exists waitlist_entries_payment_owner_ck,
  drop constraint if exists waitlist_entries_position_ck,
  drop constraint if exists waitlist_entries_idempotency_key_ck,
  drop constraint if exists waitlist_entries_idempotency_payload_hash_ck,
  drop constraint if exists waitlist_entries_rejoin_ck;

alter table public.waitlist_entries
  add constraint waitlist_entries_public_queue_state_ck
    check (public_queue_state in (
      'waiting', 'almost_ready', 'ready', 'grace', 'behind', 'delayed',
      'reassigned', 'missed', 'rejoin', 'canceled', 'done'
    )),
  add constraint waitlist_entries_entry_type_ck
    check (entry_type in ('booked', 'walkin')),
  add constraint waitlist_entries_source_provider_ck
    check (source_provider in ('bvrb3r', 'booksy', 'square', 'thecut')),
  add constraint waitlist_entries_payment_owner_ck
    check (
      payment_owner in ('bvrb3r_card', 'bvrb3r_cash', 'unpaid_manual')
      or payment_owner ~ '^external:(booksy|square|thecut)$'
    ),
  add constraint waitlist_entries_position_ck
    check (canonical_position is null or canonical_position > 0),
  add constraint waitlist_entries_idempotency_key_ck
    check (idempotency_key is null or length(idempotency_key) between 8 and 200),
  add constraint waitlist_entries_idempotency_payload_hash_ck
    check (
      (idempotency_key is null and idempotency_payload_hash is null)
      or
      (
        idempotency_key is not null
        and idempotency_payload_hash ~ '^[0-9a-f]{64}$'
      )
    ),
  add constraint waitlist_entries_rejoin_ck
    check (rejoin_of_entry_id is null or rejoin_of_entry_id <> id);

create unique index if not exists waitlist_entries_idempotency_uidx
  on public.waitlist_entries (location_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists waitlist_entries_one_live_client_uidx
  on public.waitlist_entries (location_id, client_id)
  where status in ('active', 'called', 'assigned');
create index if not exists waitlist_entries_canonical_floor_idx
  on public.waitlist_entries (location_id, canonical_position)
  where status in ('active', 'called', 'assigned');
create index if not exists waitlist_entries_chairsync_idx
  on public.waitlist_entries (chairsync_appointment_id)
  where chairsync_appointment_id is not null;

-- Audit is append-only and intentionally contains identifiers/state, never
-- contact details, external amounts or a raw capability token.
create table if not exists public.queue_mutation_audit (
  id uuid primary key default gen_random_uuid(),
  waitlist_entry_id uuid not null references public.waitlist_entries(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  previous_status text,
  new_status text,
  previous_public_state text,
  new_public_state text,
  previous_barber_id uuid references public.barbers(id) on delete set null,
  new_barber_id uuid references public.barbers(id) on delete set null,
  reason text not null,
  previous_version bigint,
  new_version bigint,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists queue_mutation_audit_entry_idx
  on public.queue_mutation_audit (waitlist_entry_id, occurred_at desc);
create index if not exists queue_mutation_audit_actor_idx
  on public.queue_mutation_audit (actor_profile_id, occurred_at desc)
  where actor_profile_id is not null;

create or replace function private.pr23_guard_queue_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.assignment_locked :=
    new.entry_type = 'booked'
    or new.payment_owner <> 'bvrb3r_cash';

  if tg_op = 'UPDATE'
     and old.barber_id is not null
     and new.barber_id is distinct from old.barber_id then
    if old.assignment_locked
       or old.entry_type <> 'walkin'
       or old.payment_owner <> 'bvrb3r_cash' then
      raise exception using
        errcode = '23514',
        message = 'Booked or non-cash queue entries are locked to their barber.';
    end if;
    if length(trim(coalesce(new.last_mutation_reason, ''))) < 3 then
      raise exception using
        errcode = '23514',
        message = 'Cash walk-in reassignment requires an audit reason.';
    end if;
    new.public_queue_state := 'reassigned';
    new.reassigned_barber_id := new.barber_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.pr23_guard_queue_assignment() from public;

drop trigger if exists pr23_guard_queue_assignment on public.waitlist_entries;
create trigger pr23_guard_queue_assignment
  before insert or update on public.waitlist_entries
  for each row execute function private.pr23_guard_queue_assignment();

create or replace function private.pr23_refresh_queue_truth(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_chairs integer;
begin
  if p_location_id is null then
    return;
  end if;

  -- Serialize every floor recomputation for one location.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_location_id::text || ':pr23-queue', 0)
  );

  select greatest(count(*)::integer, 1)
  into active_chairs
  from public.barber_status bs
  join public.locations l on l.id = p_location_id
  where bs.current_shop_id = l.id
    and coalesce(bs.is_online, false)
    and coalesce(bs.accepts_walk_ins, false)
    and bs.live_status in ('available', 'busy');

  with ordered as (
    select
      w.id,
      row_number() over (order by w.created_at, w.id)::integer as position,
      coalesce(
        sum(coalesce(s.duration_min, 30) + coalesce(s.buffer_min, 0))
          over (
            order by w.created_at, w.id
            rows between unbounded preceding and 1 preceding
          ),
        0
      )::integer as minutes_ahead
    from public.waitlist_entries w
    left join public.services s on s.id = w.service_id
    where w.location_id = p_location_id
      and w.status in ('active', 'called', 'assigned')
  ),
  truth as (
    select
      id,
      position,
      ceil(minutes_ahead::numeric / active_chairs)::integer as wait_minutes,
      pg_catalog.format(
        '%s ahead · service-duration schedule across %s active chair%s',
        greatest(position - 1, 0),
        active_chairs,
        case when active_chairs = 1 then '' else 's' end
      ) as reason
    from ordered
  )
  update public.waitlist_entries w
  set canonical_position = truth.position,
      estimated_wait_minutes = truth.wait_minutes,
      wait_reason = truth.reason,
      public_queue_state = case
        when w.public_queue_state in ('waiting', 'almost_ready')
          then case when truth.position <= 2 then 'almost_ready' else 'waiting' end
        else w.public_queue_state
      end,
      wait_version = w.wait_version + case
        when w.canonical_position is distinct from truth.position
          or w.estimated_wait_minutes is distinct from truth.wait_minutes
          or w.wait_reason is distinct from truth.reason
        then 1 else 0 end,
      last_synced_at = now(),
      updated_at = now()
  from truth
  where w.id = truth.id;

  update public.waitlist_entries
  set canonical_position = null,
      estimated_wait_minutes = null,
      last_synced_at = now(),
      updated_at = now()
  where location_id = p_location_id
    and status not in ('active', 'called', 'assigned')
    and (canonical_position is not null or estimated_wait_minutes is not null);
end;
$$;

revoke all on function private.pr23_refresh_queue_truth(uuid) from public;
grant execute on function private.pr23_refresh_queue_truth(uuid) to service_role;

create or replace function private.pr23_audit_queue_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mutation_reason text;
begin
  -- Internal refresh writes only canonical projections. They do not represent
  -- a human/business mutation and must not create recursive audit noise.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  mutation_reason := coalesce(
    nullif(trim(new.last_mutation_reason), ''),
    case when tg_op = 'INSERT' then 'Queue entry created' else 'Queue state updated' end
  );

  insert into public.queue_mutation_audit (
    waitlist_entry_id,
    actor_profile_id,
    action,
    previous_status,
    new_status,
    previous_public_state,
    new_public_state,
    previous_barber_id,
    new_barber_id,
    reason,
    previous_version,
    new_version
  )
  values (
    new.id,
    coalesce(new.last_mutated_by, new.created_by),
    case
      when tg_op = 'INSERT' then 'join'
      when old.barber_id is distinct from new.barber_id then 'assignment'
      when old.status is distinct from new.status then 'status'
      when old.public_queue_state is distinct from new.public_queue_state then 'public_state'
      else 'update'
    end,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    case when tg_op = 'INSERT' then null else old.public_queue_state end,
    new.public_queue_state,
    case when tg_op = 'INSERT' then null else old.barber_id end,
    new.barber_id,
    mutation_reason,
    case when tg_op = 'INSERT' then null else old.wait_version end,
    new.wait_version
  );

  perform private.pr23_refresh_queue_truth(new.location_id);
  if tg_op = 'UPDATE' and old.location_id is distinct from new.location_id then
    perform private.pr23_refresh_queue_truth(old.location_id);
  end if;
  return new;
end;
$$;

revoke all on function private.pr23_audit_queue_mutation() from public;

drop trigger if exists pr23_audit_queue_mutation on public.waitlist_entries;
create trigger pr23_audit_queue_mutation
  after insert or update on public.waitlist_entries
  for each row execute function private.pr23_audit_queue_mutation();

-- Backfill projections once after the trigger exists.
do $$
declare
  location_row record;
begin
  for location_row in
    select distinct location_id
    from public.waitlist_entries
    where status in ('active', 'called', 'assigned')
  loop
    perform private.pr23_refresh_queue_truth(location_row.location_id);
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- ClientBridge consent, invitation and activation lifecycle
-- --------------------------------------------------------------------------

create table if not exists public.clientbridge_consent_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  waitlist_entry_id uuid references public.waitlist_entries(id) on delete set null,
  chairsync_appointment_id uuid references public.chairsync_appointments(id) on delete set null,
  consent_kind text not null,
  granted boolean not null,
  channel text,
  evidence jsonb not null default '{}'::jsonb,
  source_provider text not null default 'bvrb3r',
  occurred_at timestamptz not null default now(),
  constraint clientbridge_consent_kind_ck check (
    consent_kind in ('operational_sms', 'clientbridge_invite', 'marketing_sms', 'marketing_email')
  ),
  constraint clientbridge_consent_channel_ck check (
    channel is null or channel in ('sms', 'email', 'push', 'in_app')
  ),
  constraint clientbridge_consent_provider_ck check (
    source_provider in ('bvrb3r', 'booksy', 'square', 'thecut')
  )
);

create index if not exists clientbridge_consent_client_idx
  on public.clientbridge_consent_events (client_id, consent_kind, occurred_at desc)
  where client_id is not null;
create index if not exists clientbridge_consent_queue_idx
  on public.clientbridge_consent_events (waitlist_entry_id, occurred_at desc)
  where waitlist_entry_id is not null;

create table if not exists public.clientbridge_invitations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  waitlist_entry_id uuid references public.waitlist_entries(id) on delete set null,
  chairsync_appointment_id uuid references public.chairsync_appointments(id) on delete set null,
  source_provider text not null,
  contact_channel text not null,
  contact_value text not null,
  token_hash text,
  status text not null default 'pending',
  suppression_reason text,
  consent_event_id uuid references public.clientbridge_consent_events(id) on delete set null,
  expires_at timestamptz,
  opened_at timestamptz,
  declined_at timestamptz,
  claimed_at timestamptz,
  claimed_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clientbridge_invitation_provider_ck check (
    source_provider in ('bvrb3r', 'booksy', 'square', 'thecut')
  ),
  constraint clientbridge_invitation_channel_ck check (
    contact_channel in ('sms', 'email')
  ),
  constraint clientbridge_invitation_status_ck check (
    status in ('pending', 'queued', 'sent', 'opened', 'claimed', 'declined', 'expired', 'suppressed', 'failed')
  ),
  constraint clientbridge_invitation_token_ck check (
    token_hash is null or token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint clientbridge_invitation_expiry_ck check (
    (status = 'suppressed' and token_hash is null)
    or
    (status <> 'suppressed' and token_hash is not null and expires_at is not null)
  )
);

create index if not exists clientbridge_invitation_client_idx
  on public.clientbridge_invitations (client_id, created_at desc)
  where client_id is not null;
create index if not exists clientbridge_invitation_contact_idx
  on public.clientbridge_invitations (lower(contact_value), created_at desc);
create unique index if not exists clientbridge_invitation_token_uidx
  on public.clientbridge_invitations (token_hash)
  where token_hash is not null;

create table if not exists public.client_activation_verifications (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.clientbridge_invitations(id) on delete cascade,
  channel text not null,
  code_hash text not null,
  status text not null default 'sent',
  attempt_count integer not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint client_activation_channel_ck check (channel in ('sms', 'email')),
  constraint client_activation_status_ck check (status in ('sent', 'verified', 'failed', 'expired', 'locked')),
  constraint client_activation_code_hash_ck check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint client_activation_attempt_ck check (attempt_count between 0 and 5)
);

create index if not exists client_activation_invitation_idx
  on public.client_activation_verifications (invitation_id, created_at desc);

create or replace function public.pr23_issue_clientbridge_invitation(
  p_client_id uuid,
  p_waitlist_entry_id uuid,
  p_chairsync_appointment_id uuid,
  p_source_provider text,
  p_contact_channel text,
  p_contact_value text,
  p_consent_event_id uuid
)
returns table (
  invitation_id uuid,
  invitation_status text,
  activation_token text,
  expires_at timestamptz,
  suppression_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_value text;
  provider_restricted boolean := false;
  prior_decline boolean := false;
  recent_invites integer := 0;
  result_id uuid;
  result_status text;
  result_expiry timestamptz;
  result_reason text;
begin
  if not private.pr19_actor_is_trusted_writer() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;
  if p_source_provider not in ('bvrb3r', 'booksy', 'square', 'thecut') then
    raise exception using errcode = '22023', message = 'Unsupported ClientBridge source.';
  end if;
  if p_contact_channel not in ('sms', 'email') or length(trim(coalesce(p_contact_value, ''))) < 5 then
    raise exception using errcode = '22023', message = 'A verified invitation contact is required.';
  end if;
  if not exists (
    select 1 from public.clientbridge_consent_events c
    where c.id = p_consent_event_id
      and c.consent_kind = 'clientbridge_invite'
      and c.granted
  ) then
    raise exception using errcode = '23514', message = 'ClientBridge invitation consent is required.';
  end if;

  if p_chairsync_appointment_id is not null then
    select c.provider_data_restricted
    into provider_restricted
    from public.chairsync_appointments c
    where c.id = p_chairsync_appointment_id;
  end if;

  select exists (
    select 1
    from public.clientbridge_invitations i
    where lower(i.contact_value) = lower(p_contact_value)
      and i.status = 'declined'
  ) into prior_decline;

  select count(*)
  into recent_invites
  from public.clientbridge_invitations i
  where lower(i.contact_value) = lower(p_contact_value)
    and i.created_at >= now() - interval '60 days'
    and i.status not in ('suppressed', 'failed');

  if provider_restricted or prior_decline or recent_invites >= 2 then
    result_status := 'suppressed';
    result_reason := case
      when provider_restricted then 'provider_restriction'
      when prior_decline then 'prior_decline'
      else 'frequency_limit'
    end;
    insert into public.clientbridge_invitations (
      client_id, waitlist_entry_id, chairsync_appointment_id, source_provider,
      contact_channel, contact_value, status, suppression_reason, consent_event_id
    ) values (
      p_client_id, p_waitlist_entry_id, p_chairsync_appointment_id, p_source_provider,
      p_contact_channel, p_contact_value, result_status, result_reason, p_consent_event_id
    ) returning id into result_id;
    return query select result_id, result_status, null::text, null::timestamptz, result_reason;
    return;
  end if;

  token_value := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  result_status := 'queued';
  result_expiry := now() + interval '72 hours';

  insert into public.clientbridge_invitations (
    client_id, waitlist_entry_id, chairsync_appointment_id, source_provider,
    contact_channel, contact_value, token_hash, status, consent_event_id, expires_at
  ) values (
    p_client_id, p_waitlist_entry_id, p_chairsync_appointment_id, p_source_provider,
    p_contact_channel, p_contact_value,
    private.pr22_sha256(token_value),
    result_status, p_consent_event_id, result_expiry
  ) returning id into result_id;

  return query select result_id, result_status, token_value, result_expiry, null::text;
end;
$$;

revoke all on function public.pr23_issue_clientbridge_invitation(
  uuid, uuid, uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.pr23_issue_clientbridge_invitation(
  uuid, uuid, uuid, text, text, text, uuid
) to service_role;

create or replace function public.pr23_claim_clientbridge_invitation(
  p_token text,
  p_target_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.clientbridge_invitations%rowtype;
  target_client_id uuid;
  previous_client_id uuid;
  moved_appointments integer := 0;
  moved_queue_entries integer := 0;
begin
  if not private.pr19_actor_is_trusted_writer() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;
  if length(coalesce(p_token, '')) between 32 and 128 is not true then
    raise exception using errcode = '22023', message = 'Activation token is invalid.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_target_profile_id and p.role::text in ('client', 'client_user')
  ) then
    raise exception using errcode = '23514', message = 'A verified client account is required.';
  end if;

  select *
  into invitation_row
  from public.clientbridge_invitations i
  where i.token_hash = private.pr22_sha256(p_token)
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Activation link not found.';
  end if;
  if invitation_row.status = 'claimed' then
    raise exception using errcode = '23505', message = 'Activation link already used.';
  end if;
  if invitation_row.status in ('declined', 'suppressed', 'failed') then
    raise exception using errcode = '23514', message = 'Activation link is not claimable.';
  end if;
  if invitation_row.expires_at <= now() then
    update public.clientbridge_invitations
    set status = 'expired', updated_at = now()
    where id = invitation_row.id;
    raise exception using errcode = '22023', message = 'Activation link expired.';
  end if;

  select c.id into target_client_id
  from public.clients c
  where c.profile_id = p_target_profile_id
  limit 1;

  if target_client_id is null then
    insert into public.clients (
      id, reference_code, profile_id, loyalty_points, retention_tag
    ) values (
      gen_random_uuid(),
      'client-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      p_target_profile_id,
      0,
      'new'
    ) returning id into target_client_id;
  end if;

  previous_client_id := invitation_row.client_id;
  if previous_client_id is not null and previous_client_id <> target_client_id then
    update public.appointments
    set client_id = target_client_id
    where client_id = previous_client_id;
    get diagnostics moved_appointments = row_count;

    update public.waitlist_entries
    set client_id = target_client_id,
        last_mutated_by = p_target_profile_id,
        last_mutation_reason = 'ClientBridge account claim merged guest visit history'
    where client_id = previous_client_id;
    get diagnostics moved_queue_entries = row_count;

    update public.chairsync_appointments
    set linked_client_id = target_client_id,
        updated_at = now()
    where linked_client_id = previous_client_id
       or id = invitation_row.chairsync_appointment_id;

    update public.clientbridge_consent_events
    set client_id = target_client_id
    where client_id = previous_client_id;
  end if;

  update public.clientbridge_invitations
  set status = 'claimed',
      claimed_at = now(),
      claimed_profile_id = p_target_profile_id,
      client_id = target_client_id,
      updated_at = now()
  where id = invitation_row.id;

  return jsonb_build_object(
    'status', 'claimed',
    'clientId', target_client_id,
    'appointmentsMerged', moved_appointments,
    'queueEntriesMerged', moved_queue_entries
  );
end;
$$;

revoke all on function public.pr23_claim_clientbridge_invitation(text, uuid)
  from public, anon, authenticated;
grant execute on function public.pr23_claim_clientbridge_invitation(text, uuid)
  to service_role;

-- --------------------------------------------------------------------------
-- Notification preferences and delivery evidence
-- --------------------------------------------------------------------------

alter table public.notification_preferences
  add column if not exists queue_alerts_enabled boolean not null default true,
  add column if not exists rebook_alerts_enabled boolean not null default true,
  add column if not exists marketing_barber_enabled boolean not null default false,
  add column if not exists marketing_platform_enabled boolean not null default false,
  add column if not exists quiet_hours_timezone text not null default 'America/New_York';

create table if not exists public.notification_delivery_ledger (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete set null,
  waitlist_entry_id uuid references public.waitlist_entries(id) on delete set null,
  clientbridge_invitation_id uuid references public.clientbridge_invitations(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  audience_email text,
  channel text not null,
  notification_kind text not null,
  operational boolean not null default false,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  scheduled_for timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  corrected_at timestamptz,
  failure_code text,
  provider_reference text,
  consent_event_id uuid references public.clientbridge_consent_events(id) on delete set null,
  escalation_kind text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_delivery_channel_ck check (channel in ('in_app', 'sms', 'email', 'push', 'tv', 'front_desk')),
  constraint notification_delivery_status_ck check (
    status in ('queued', 'scheduled', 'sending', 'delivered', 'failed', 'retrying', 'suppressed', 'corrected', 'escalated')
  ),
  constraint notification_delivery_attempt_ck check (attempt_count between 0 and 10),
  constraint notification_delivery_terminal_ck check (
    (status = 'delivered' and delivered_at is not null)
    or (status = 'failed' and failed_at is not null)
    or (status = 'corrected' and corrected_at is not null)
    or status not in ('delivered', 'failed', 'corrected')
  )
);

create index if not exists notification_delivery_profile_idx
  on public.notification_delivery_ledger (profile_id, created_at desc)
  where profile_id is not null;
create index if not exists notification_delivery_queue_idx
  on public.notification_delivery_ledger (waitlist_entry_id, created_at desc)
  where waitlist_entry_id is not null;
create index if not exists notification_delivery_status_idx
  on public.notification_delivery_ledger (status, scheduled_for, created_at)
  where status in ('queued', 'scheduled', 'retrying', 'failed');

create table if not exists public.notification_consent_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  channel text not null,
  enabled boolean not null,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint notification_consent_channel_ck check (channel in ('in_app', 'sms', 'email', 'push')),
  constraint notification_consent_category_ck check (
    category in ('reminders', 'messages', 'rebooking', 'queue', 'social', 'marketing_barber', 'marketing_platform')
  )
);

create index if not exists notification_consent_profile_idx
  on public.notification_consent_events (profile_id, category, channel, occurred_at desc);

-- Quiet hours are enforced at write time for non-operational notifications.
-- Operational chair-ready/cancellation notices remain deliverable for the
-- active visit, exactly as consented.
create or replace function private.pr23_enforce_notification_quiet_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preference_row record;
  local_now timestamp;
  local_date date;
  quiet_start timestamp;
  quiet_end timestamp;
begin
  new.updated_at := now();
  if new.operational or new.profile_id is null or new.status not in ('queued', 'scheduled', 'retrying') then
    return new;
  end if;

  select
    p.quiet_hours_start,
    p.quiet_hours_end,
    p.quiet_hours_timezone
  into preference_row
  from public.notification_preferences p
  where p.profile_id = new.profile_id
  order by p.updated_at desc
  limit 1;

  if preference_row.quiet_hours_start is null or preference_row.quiet_hours_end is null then
    return new;
  end if;

  local_now := now() at time zone preference_row.quiet_hours_timezone;
  local_date := local_now::date;
  quiet_start := local_date + preference_row.quiet_hours_start::time;
  quiet_end := local_date + preference_row.quiet_hours_end::time;
  if preference_row.quiet_hours_end::time <= preference_row.quiet_hours_start::time then
    if local_now::time < preference_row.quiet_hours_end::time then
      quiet_start := (local_date - 1) + preference_row.quiet_hours_start::time;
    else
      quiet_end := (local_date + 1) + preference_row.quiet_hours_end::time;
    end if;
  end if;

  if local_now >= quiet_start and local_now < quiet_end then
    new.status := 'scheduled';
    new.scheduled_for := quiet_end at time zone preference_row.quiet_hours_timezone;
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('quietHoursApplied', true);
  end if;
  return new;
end;
$$;

revoke all on function private.pr23_enforce_notification_quiet_hours() from public;

drop trigger if exists pr23_enforce_notification_quiet_hours
  on public.notification_delivery_ledger;
create trigger pr23_enforce_notification_quiet_hours
  before insert or update on public.notification_delivery_ledger
  for each row execute function private.pr23_enforce_notification_quiet_hours();

-- --------------------------------------------------------------------------
-- Public queue status: capability-token read of one canonical record
-- --------------------------------------------------------------------------

create or replace function public.pr23_get_public_queue_status(p_token text)
returns table (
  queue_id uuid,
  queue_reference text,
  queue_state text,
  "position" integer,
  estimated_wait_minutes integer,
  wait_reason text,
  wait_version bigint,
  ready_grace_expires_at timestamptz,
  shop_name text,
  source_provider text,
  payment_owner text,
  assignment_locked boolean,
  reassigned_barber_label text,
  activation_offered boolean,
  last_synced_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.id,
    'BVR-' || upper(substr(replace(w.id::text, '-', ''), 1, 4)),
    w.public_queue_state,
    w.canonical_position,
    w.estimated_wait_minutes,
    w.wait_reason,
    w.wait_version,
    w.ready_grace_expires_at,
    l.name,
    w.source_provider,
    w.payment_owner,
    w.assignment_locked,
    case
      when w.public_queue_state = 'reassigned'
        then coalesce(nullif(p.public_username, ''), 'Your new barber')
      else null
    end,
    w.activation_offered,
    w.last_synced_at,
    w.updated_at
  from public.waitlist_entries w
  join public.locations l on l.id = w.location_id
  left join public.barbers b on b.id = coalesce(w.reassigned_barber_id, w.barber_id)
  left join public.profiles p on p.id = b.profile_id
  where length(p_token) between 32 and 128
    and w.public_token_hash = private.pr22_sha256(p_token)
  limit 1;
$$;

revoke all on function public.pr23_get_public_queue_status(text)
  from public, anon, authenticated;
grant execute on function public.pr23_get_public_queue_status(text)
  to service_role;

create or replace function public.pr23_rejoin_public_queue(
  p_token text,
  p_idempotency_key text
)
returns table (
  waitlist_entry_id uuid,
  public_token text,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_row public.waitlist_entries%rowtype;
  existing_row public.waitlist_entries%rowtype;
  token_value text;
  payload_hash text;
  inserted_id uuid;
begin
  if not private.pr19_actor_is_trusted_writer() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;

  token_value := private.pr22_sha256(p_idempotency_key);

  select *
  into original_row
  from public.waitlist_entries w
  where length(p_token) between 32 and 128
    and w.public_token_hash = private.pr22_sha256(p_token)
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Queue status not found.';
  end if;
  if original_row.public_queue_state not in ('missed', 'canceled') then
    raise exception using errcode = '23514', message = 'Only a missed or canceled visit can rejoin.';
  end if;

  select *
  into existing_row
  from public.waitlist_entries w
  where w.location_id = original_row.location_id
    and w.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    return query select existing_row.id, token_value, true;
    return;
  end if;

  payload_hash := private.pr22_sha256(
    original_row.location_id::text || ':' || original_row.client_id::text || ':rejoin:' || original_row.id::text
  );

  insert into public.waitlist_entries (
    location_id, shop_id, client_id, service_id, barber_id, barber_preference,
    requested_date, preferred_date, preferred_start_time, preferred_end_time, flexibility_minutes,
    queue_source, idempotency_key, idempotency_payload_hash, entry_type,
    source_provider, payment_owner, assignment_locked, public_token_hash,
    public_queue_state, operational_sms_consent, rejoin_of_entry_id, notes,
    status_reason, status, created_by, last_mutated_by, last_mutation_reason,
    created_at, updated_at
  ) values (
    original_row.location_id, original_row.shop_id, original_row.client_id,
    original_row.service_id, null, original_row.barber_preference,
    current_date, current_date, null, null, original_row.flexibility_minutes,
    original_row.queue_source, p_idempotency_key, payload_hash, 'walkin',
    original_row.source_provider, original_row.payment_owner,
    original_row.payment_owner <> 'bvrb3r_cash',
    private.pr22_sha256(token_value),
    'rejoin', original_row.operational_sms_consent, original_row.id,
    original_row.notes, 'Client rejoined after a missed or canceled visit',
    'active', original_row.created_by, null,
    'Client rejoined from the private queue-status link', now(), now()
  )
  returning id into inserted_id;

  return query select inserted_id, token_value, false;
end;
$$;

revoke all on function public.pr23_rejoin_public_queue(text, text)
  from public, anon, authenticated;
grant execute on function public.pr23_rejoin_public_queue(text, text)
  to service_role;

-- --------------------------------------------------------------------------
-- RLS: direct readers get only their relationship; writes stay server-side.
-- --------------------------------------------------------------------------

alter table public.chairsync_appointments enable row level security;
alter table public.queue_mutation_audit enable row level security;
alter table public.clientbridge_consent_events enable row level security;
alter table public.clientbridge_invitations enable row level security;
alter table public.client_activation_verifications enable row level security;
alter table public.notification_delivery_ledger enable row level security;
alter table public.notification_consent_events enable row level security;
alter table public.waitlist_entries replica identity full;

revoke all on public.chairsync_appointments from public, anon, authenticated;
revoke all on public.queue_mutation_audit from public, anon, authenticated;
revoke all on public.clientbridge_consent_events from public, anon, authenticated;
revoke all on public.clientbridge_invitations from public, anon, authenticated;
revoke all on public.client_activation_verifications from public, anon, authenticated;
revoke all on public.notification_delivery_ledger from public, anon, authenticated;
revoke all on public.notification_consent_events from public, anon, authenticated;

grant select, insert, update on public.chairsync_appointments to service_role;
grant select, insert on public.queue_mutation_audit to service_role;
grant select, insert, update on public.clientbridge_consent_events to service_role;
grant select, insert, update on public.clientbridge_invitations to service_role;
grant select, insert, update on public.client_activation_verifications to service_role;
grant select, insert, update on public.notification_delivery_ledger to service_role;
grant select, insert on public.notification_consent_events to service_role;

revoke insert, update, delete on public.waitlist_entries from authenticated;
grant select on public.waitlist_entries to authenticated;

drop policy if exists "waitlist entries shop staff select" on public.waitlist_entries;
drop policy if exists "waitlist entries barber assigned select" on public.waitlist_entries;
drop policy if exists "waitlist entries shop staff insert" on public.waitlist_entries;
drop policy if exists "waitlist entries shop staff update" on public.waitlist_entries;
drop policy if exists "pr23 waitlist client read" on public.waitlist_entries;
drop policy if exists "pr23 waitlist barber read" on public.waitlist_entries;
drop policy if exists "pr23 waitlist shop floor read" on public.waitlist_entries;
drop policy if exists "pr23 waitlist architect read" on public.waitlist_entries;

create policy "pr23 waitlist client read"
  on public.waitlist_entries
  for select to authenticated
  using (private.is_booking_client(client_id));

create policy "pr23 waitlist barber read"
  on public.waitlist_entries
  for select to authenticated
  using (
    (barber_id is not null and private.is_booking_barber(barber_id))
    or
    (barber_preference is not null and private.is_booking_barber(barber_preference))
  );

create policy "pr23 waitlist shop floor read"
  on public.waitlist_entries
  for select to authenticated
  using (private.is_booking_shop_operator(location_id));

create policy "pr23 waitlist architect read"
  on public.waitlist_entries
  for select to authenticated
  using (private.is_booking_platform_admin());

drop policy if exists "pr23 chairsync client read" on public.chairsync_appointments;
drop policy if exists "pr23 chairsync barber read" on public.chairsync_appointments;
drop policy if exists "pr23 chairsync shop read" on public.chairsync_appointments;
drop policy if exists "pr23 chairsync architect read" on public.chairsync_appointments;

create policy "pr23 chairsync client read"
  on public.chairsync_appointments
  for select to authenticated
  using (linked_client_id is not null and private.is_booking_client(linked_client_id));

create policy "pr23 chairsync barber read"
  on public.chairsync_appointments
  for select to authenticated
  using (barber_id is not null and private.is_booking_barber(barber_id));

create policy "pr23 chairsync shop read"
  on public.chairsync_appointments
  for select to authenticated
  using (private.is_booking_shop_operator(location_id));

create policy "pr23 chairsync architect read"
  on public.chairsync_appointments
  for select to authenticated
  using (private.is_booking_platform_admin());

drop policy if exists "pr23 queue audit scoped read" on public.queue_mutation_audit;
create policy "pr23 queue audit scoped read"
  on public.queue_mutation_audit
  for select to authenticated
  using (
    exists (
      select 1
      from public.waitlist_entries w
      where w.id = queue_mutation_audit.waitlist_entry_id
        and (
          private.is_booking_client(w.client_id)
          or (w.barber_id is not null and private.is_booking_barber(w.barber_id))
          or private.is_booking_shop_operator(w.location_id)
          or private.is_booking_platform_admin()
        )
    )
  );
grant select on public.queue_mutation_audit to authenticated;

drop policy if exists "pr23 delivery self read" on public.notification_delivery_ledger;
drop policy if exists "pr23 delivery shop escalation read" on public.notification_delivery_ledger;

create policy "pr23 delivery self read"
  on public.notification_delivery_ledger
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "pr23 delivery shop escalation read"
  on public.notification_delivery_ledger
  for select to authenticated
  using (
    waitlist_entry_id is not null
    and exists (
      select 1
      from public.waitlist_entries w
      where w.id = notification_delivery_ledger.waitlist_entry_id
        and private.is_booking_shop_operator(w.location_id)
    )
  );
grant select on public.notification_delivery_ledger to authenticated;

drop policy if exists "pr23 notification consent self read" on public.notification_consent_events;
create policy "pr23 notification consent self read"
  on public.notification_consent_events
  for select to authenticated
  using (profile_id = (select auth.uid()));
grant select on public.notification_consent_events to authenticated;

-- The queue and delivery ledgers are both Realtime sources. RLS remains the
-- authorization boundary for authenticated subscribers.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_delivery_ledger'
  ) then
    execute 'alter publication supabase_realtime add table public.notification_delivery_ledger';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
