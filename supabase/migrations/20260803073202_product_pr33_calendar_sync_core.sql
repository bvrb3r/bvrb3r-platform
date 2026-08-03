-- Staging ledger version: 20260803073202.
-- ============================================================================
-- Product PR33 — calendar sync core.
--
-- Provider credentials remain service-only and encrypted by the application.
-- Square is appointment-read-only, Google writes only to the BVRB3R-owned
-- secondary calendar, and all personal-calendar reads are busy windows only.
-- No table in this contract contains an external amount, price, payment, tip,
-- payout, card, note, event-title, or invitee field.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.calendar_oauth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  state_hash text not null unique,
  return_path text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint calendar_oauth_states_provider_ck check (provider in ('square', 'google')),
  constraint calendar_oauth_states_hash_ck check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint calendar_oauth_states_return_path_ck check (return_path like '/dashboard/barber/calendar/%'),
  constraint calendar_oauth_states_expiry_ck check (expires_at > created_at)
);

create index if not exists calendar_oauth_states_profile_provider_idx
  on public.calendar_oauth_states (profile_id, provider, expires_at desc);
create index if not exists calendar_oauth_states_barber_idx
  on public.calendar_oauth_states (barber_id);
create index if not exists calendar_oauth_states_expiry_idx
  on public.calendar_oauth_states (expires_at)
  where consumed_at is null;

create table if not exists public.square_connections (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  square_merchant_id text not null,
  square_team_member_id text,
  account_label text not null default 'Square Appointments',
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  token_expires_at timestamptz not null,
  granted_scopes text[] not null default array['APPOINTMENTS_READ']::text[],
  status text not null default 'active',
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  next_poll_at timestamptz not null default now(),
  sync_lease_token uuid,
  sync_lease_until timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint square_connections_barber_unique unique (barber_id),
  constraint square_connections_scope_ck check (
    granted_scopes = array['APPOINTMENTS_READ']::text[]
  ),
  constraint square_connections_status_ck check (status in ('active', 'degraded', 'disconnected')),
  constraint square_connections_sync_lease_ck check (
    (sync_lease_token is null) = (sync_lease_until is null)
  ),
  constraint square_connections_token_expiry_ck check (token_expires_at > created_at)
);

create index if not exists square_connections_poll_idx
  on public.square_connections (next_poll_at)
  where status in ('active', 'degraded');
create index if not exists square_connections_location_idx
  on public.square_connections (location_id)
  where location_id is not null;

comment on table public.square_connections is
  'Service-only Square Appointments READ connection. OAuth tokens are application-encrypted; imported Square money is never read or stored.';

create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  account_label text not null default 'Google account',
  bvrb3r_calendar_id_ciphertext text not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_expires_at timestamptz not null,
  granted_scopes text[] not null,
  write_enabled boolean not null default true,
  freebusy_enabled boolean not null default true,
  status text not null default 'active',
  last_push_at timestamptz,
  last_busy_sync_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  next_poll_at timestamptz not null default now(),
  sync_lease_token uuid,
  sync_lease_until timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_connections_barber_unique unique (barber_id),
  constraint google_calendar_connections_scopes_ck check (
    granted_scopes = array[
      'https://www.googleapis.com/auth/calendar.app.created',
      'https://www.googleapis.com/auth/calendar.freebusy'
    ]::text[]
  ),
  constraint google_calendar_connections_status_ck check (status in ('active', 'degraded', 'disconnected')),
  constraint google_calendar_connections_sync_lease_ck check (
    (sync_lease_token is null) = (sync_lease_until is null)
  ),
  constraint google_calendar_connections_token_expiry_ck check (token_expires_at > created_at)
);

create index if not exists google_calendar_connections_poll_idx
  on public.google_calendar_connections (next_poll_at)
  where status in ('active', 'degraded');

comment on table public.google_calendar_connections is
  'Service-only Google Calendar connection. Writes are limited to the encrypted BVRB3R-created calendar id; reads use free/busy only.';

create table if not exists public.apple_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  token_hash text not null unique,
  token_ciphertext text not null,
  status text not null default 'active',
  generated_at timestamptz not null default now(),
  last_served_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint apple_calendar_feeds_barber_unique unique (barber_id),
  constraint apple_calendar_feeds_hash_ck check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint apple_calendar_feeds_status_ck check (status in ('active', 'revoked'))
);

comment on table public.apple_calendar_feeds is
  'Private webcal capability. Regeneration replaces the hash and ciphertext atomically so the old feed URL immediately stops working.';

create table if not exists public.calendar_source_preferences (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  provider text not null,
  provider_calendar_id_hash text not null,
  provider_calendar_id_ciphertext text,
  display_name text not null,
  display_color text,
  blocks_availability boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_source_preferences_provider_ck check (provider in ('apple', 'google')),
  constraint calendar_source_preferences_hash_ck check (provider_calendar_id_hash ~ '^[0-9a-f]{64}$'),
  constraint calendar_source_preferences_display_name_ck check (length(trim(display_name)) between 1 and 120),
  constraint calendar_source_preferences_color_ck check (
    display_color is null or display_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  unique (barber_id, provider, provider_calendar_id_hash)
);

create index if not exists calendar_source_preferences_enabled_idx
  on public.calendar_source_preferences (barber_id, provider)
  where blocks_availability;

create table if not exists public.calendar_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  provider text not null,
  provider_calendar_id_hash text not null,
  external_event_id_hash text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  privacy_label text not null default 'busy',
  source_last_seen_at timestamptz not null,
  cache_stamped_at timestamptz not null default now(),
  stale_after timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_busy_blocks_provider_ck check (provider in ('apple', 'google')),
  constraint calendar_busy_blocks_calendar_hash_ck check (provider_calendar_id_hash ~ '^[0-9a-f]{64}$'),
  constraint calendar_busy_blocks_event_hash_ck check (external_event_id_hash ~ '^[0-9a-f]{64}$'),
  constraint calendar_busy_blocks_time_ck check (ends_at > starts_at),
  constraint calendar_busy_blocks_privacy_ck check (privacy_label = 'busy'),
  unique (barber_id, provider, provider_calendar_id_hash, external_event_id_hash)
);

create index if not exists calendar_busy_blocks_barber_range_idx
  on public.calendar_busy_blocks (barber_id, starts_at, ends_at);
create index if not exists calendar_busy_blocks_stale_idx
  on public.calendar_busy_blocks (stale_after);

comment on table public.calendar_busy_blocks is
  'Privacy-minimized external availability. Titles, notes, invitees and raw event ids are structurally absent.';

create table if not exists public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  external_event_id text not null,
  loop_tag text not null,
  last_source_updated_at timestamptz,
  last_pushed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_links_provider_ck check (provider = 'google'),
  constraint calendar_event_links_loop_tag_ck check (loop_tag like 'bvrb3r:%'),
  unique (provider, connection_id, appointment_id),
  unique (provider, connection_id, external_event_id)
);

create index if not exists calendar_event_links_appointment_idx
  on public.calendar_event_links (appointment_id);

create table if not exists public.calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  connection_id uuid not null,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  direction text not null,
  reason text not null,
  state text not null default 'pending',
  attempt_count integer not null default 0,
  due_at timestamptz not null default now(),
  locked_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  finished_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_sync_jobs_provider_ck check (provider in ('square', 'google')),
  constraint calendar_sync_jobs_direction_ck check (direction in ('import', 'export', 'freebusy')),
  constraint calendar_sync_jobs_state_ck check (state in ('pending', 'running', 'succeeded', 'failed', 'canceled')),
  constraint calendar_sync_jobs_attempt_count_ck check (attempt_count between 0 and 20),
  constraint calendar_sync_jobs_lease_ck check (
    (
      state = 'running'
      and locked_at is not null
      and lease_token is not null
      and lease_expires_at is not null
    )
    or
    (
      state <> 'running'
      and lease_token is null
      and lease_expires_at is null
    )
  )
);

drop index if exists public.calendar_sync_jobs_live_dedupe_idx;
create unique index calendar_sync_jobs_live_dedupe_idx
  on public.calendar_sync_jobs (provider, connection_id, appointment_id, direction)
  nulls not distinct
  where state = 'pending';
create index if not exists calendar_sync_jobs_due_idx
  on public.calendar_sync_jobs (due_at, created_at)
  where state = 'pending';
create index if not exists calendar_sync_jobs_barber_idx
  on public.calendar_sync_jobs (barber_id, created_at desc);
create index if not exists calendar_sync_jobs_appointment_idx
  on public.calendar_sync_jobs (appointment_id)
  where appointment_id is not null;
create index if not exists calendar_sync_jobs_expired_lease_idx
  on public.calendar_sync_jobs (lease_expires_at, locked_at)
  where state = 'running';

create table if not exists public.calendar_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  connection_id uuid not null,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  direction text not null,
  status text not null,
  trigger_source text not null,
  imported_count integer not null default 0,
  exported_count integer not null default 0,
  busy_block_count integer not null default 0,
  conflict_count integer not null default 0,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint calendar_sync_runs_provider_ck check (provider in ('square', 'google', 'apple')),
  constraint calendar_sync_runs_direction_ck check (direction in ('import', 'export', 'freebusy', 'feed')),
  constraint calendar_sync_runs_status_ck check (status in ('running', 'succeeded', 'failed')),
  constraint calendar_sync_runs_trigger_ck check (trigger_source in ('manual', 'schedule', 'webhook', 'appointment', 'device')),
  constraint calendar_sync_runs_counts_ck check (
    imported_count >= 0 and exported_count >= 0 and busy_block_count >= 0 and conflict_count >= 0
  )
);

create index if not exists calendar_sync_runs_connection_idx
  on public.calendar_sync_runs (provider, connection_id, started_at desc);
create index if not exists calendar_sync_runs_barber_idx
  on public.calendar_sync_runs (barber_id, started_at desc);

create or replace function public.product_pr33_replace_calendar_busy_blocks(
  p_barber_id uuid,
  p_provider text,
  p_calendar_id_hash text,
  p_blocks jsonb,
  p_cache_stamped_at timestamptz,
  p_stale_after timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  invalid_count integer;
  inserted_count integer;
begin
  if p_provider not in ('apple', 'google')
     or p_calendar_id_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_blocks) is distinct from 'array'
     or p_stale_after <= p_cache_stamped_at then
    raise exception using
      errcode = '22023',
      message = 'Calendar busy-block replacement payload is invalid.';
  end if;

  select count(*)::integer
  into invalid_count
  from jsonb_to_recordset(p_blocks) as block(
    external_event_id_hash text,
    starts_at timestamptz,
    ends_at timestamptz
  )
  where block.external_event_id_hash is null
     or block.external_event_id_hash !~ '^[0-9a-f]{64}$'
     or block.starts_at is null
     or block.ends_at is null
     or block.ends_at <= block.starts_at;

  if invalid_count > 0 then
    raise exception using
      errcode = '22023',
      message = 'Calendar busy-block replacement contains an invalid window.';
  end if;

  -- Serialize provider refreshes with PR20 hold creation/rescheduling so a
  -- newly imported busy window cannot race a booking decision for this Barber.
  perform private.pr20_lock_barber_timeline(p_barber_id);

  delete from public.calendar_busy_blocks
  where barber_id = p_barber_id
    and provider = p_provider
    and provider_calendar_id_hash = p_calendar_id_hash;

  insert into public.calendar_busy_blocks (
    barber_id,
    provider,
    provider_calendar_id_hash,
    external_event_id_hash,
    starts_at,
    ends_at,
    privacy_label,
    source_last_seen_at,
    cache_stamped_at,
    stale_after,
    updated_at
  )
  select
    p_barber_id,
    p_provider,
    p_calendar_id_hash,
    block.external_event_id_hash,
    block.starts_at,
    block.ends_at,
    'busy',
    p_cache_stamped_at,
    p_cache_stamped_at,
    p_stale_after,
    p_cache_stamped_at
  from jsonb_to_recordset(p_blocks) as block(
    external_event_id_hash text,
    starts_at timestamptz,
    ends_at timestamptz
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.product_pr33_replace_calendar_busy_blocks(
  uuid, text, text, jsonb, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.product_pr33_replace_calendar_busy_blocks(
  uuid, text, text, jsonb, timestamptz, timestamptz
) to service_role;

-- Extend the one canonical slot predicate at the database boundary. UI reads
-- are useful evidence, but a direct or stale client must still be unable to
-- create/move a hold over Square or personal-calendar busy truth.
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
    )
    and not exists (
      select 1
        from public.chairsync_appointments c
       where c.barber_id = p_barber_id
         and c.provider = 'square'
         and c.status in ('booked', 'confirmed', 'checked_in')
         and pg_catalog.tstzrange(c.starts_at, c.ends_at, '[)')
             && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')
    )
    and not exists (
      select 1
        from public.calendar_busy_blocks busy
       where busy.barber_id = p_barber_id
         and pg_catalog.tstzrange(busy.starts_at, busy.ends_at, '[)')
             && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')
    );
$$;

revoke all on function private.pr20_slot_is_free(
  uuid, timestamptz, timestamptz, uuid, uuid
) from public, anon, authenticated;
grant execute on function private.pr20_slot_is_free(
  uuid, timestamptz, timestamptz, uuid, uuid
) to service_role;

create or replace function private.product_pr33_lock_square_timeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider = 'square' or (tg_op = 'UPDATE' and old.provider = 'square') then
    if tg_op = 'UPDATE' and old.barber_id is distinct from new.barber_id then
      -- Keep the same lexical order for every two-Barber move to avoid a
      -- reversed advisory-lock deadlock.
      if old.barber_id::text < new.barber_id::text then
        perform private.pr20_lock_barber_timeline(old.barber_id);
        perform private.pr20_lock_barber_timeline(new.barber_id);
      else
        perform private.pr20_lock_barber_timeline(new.barber_id);
        perform private.pr20_lock_barber_timeline(old.barber_id);
      end if;
    else
      perform private.pr20_lock_barber_timeline(new.barber_id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.product_pr33_lock_square_timeline()
  from public, anon, authenticated, service_role;

drop trigger if exists product_pr33_lock_square_timeline
  on public.chairsync_appointments;
create trigger product_pr33_lock_square_timeline
  before insert or update of provider, barber_id, starts_at, ends_at, status
  on public.chairsync_appointments
  for each row
  execute function private.product_pr33_lock_square_timeline();

create or replace view public.imported_appointments
with (security_invoker = true)
as
select
  c.id,
  c.provider as source,
  c.provider_appointment_id as external_id,
  c.location_id,
  c.barber_id,
  c.linked_client_id,
  c.client_display_name,
  c.service_name,
  c.starts_at,
  c.ends_at,
  greatest(1, ceil(extract(epoch from (c.ends_at - c.starts_at)) / 60.0))::integer as duration_minutes,
  c.status,
  true as read_only,
  c.imported_at,
  c.source_updated_at,
  c.updated_at
from public.chairsync_appointments c
where c.provider = 'square';

comment on view public.imported_appointments is
  'Canonical PR33 Square import read model over ChairSync truth. It intentionally exposes no external amount fields.';

create or replace function private.product_pr33_enqueue_google_calendar_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.source_provider = 'bvrb3r'
     and (
       old.barber_id is distinct from new.barber_id
       or new.source_provider <> 'bvrb3r'
     ) then
    insert into public.calendar_sync_jobs (
      provider,
      connection_id,
      barber_id,
      appointment_id,
      direction,
      reason,
      state,
      due_at,
      updated_at
    )
    select
      'google',
      old_connection.id,
      old.barber_id,
      old.id,
      'export',
      'appointment_removed_from_calendar',
      'pending',
      now(),
      now()
    from public.google_calendar_connections old_connection
    where old_connection.barber_id = old.barber_id
      and old_connection.status in ('active', 'degraded')
      and old_connection.write_enabled
    on conflict (provider, connection_id, appointment_id, direction)
      where state = 'pending'
    do update
      set due_at = least(public.calendar_sync_jobs.due_at, excluded.due_at),
          reason = excluded.reason,
          updated_at = now();
  end if;

  if new.source_provider <> 'bvrb3r' then
    return new;
  end if;

  insert into public.calendar_sync_jobs (
    provider,
    connection_id,
    barber_id,
    appointment_id,
    direction,
    reason,
    state,
    due_at,
    updated_at
  )
  select
    'google',
    connection.id,
    new.barber_id,
    new.id,
    'export',
    case when tg_op = 'INSERT' then 'appointment_created' else 'appointment_changed' end,
    'pending',
    now(),
    now()
  from public.google_calendar_connections connection
  where connection.barber_id = new.barber_id
    and connection.status in ('active', 'degraded')
    and connection.write_enabled
  on conflict (provider, connection_id, appointment_id, direction)
    where state = 'pending'
  do update
    set due_at = least(public.calendar_sync_jobs.due_at, excluded.due_at),
        reason = excluded.reason,
        updated_at = now();

  perform pg_catalog.pg_notify('calendar_sync_jobs', new.id::text);
  return new;
end;
$$;

revoke all on function private.product_pr33_enqueue_google_calendar_write()
  from public, anon, authenticated, service_role;

create or replace function public.product_pr33_enqueue_google_export_backfill(
  p_connection_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_count integer;
begin
  if not exists (
    select 1
    from public.google_calendar_connections connection
    where connection.id = p_connection_id
      and connection.status in ('active', 'degraded')
      and connection.write_enabled
  ) then
    raise exception using
      errcode = '22023',
      message = 'Google Calendar connection is unavailable for export.';
  end if;

  insert into public.calendar_sync_jobs (
    provider,
    connection_id,
    barber_id,
    appointment_id,
    direction,
    reason,
    state,
    due_at,
    updated_at
  )
  select
    'google',
    connection.id,
    appointment.barber_id,
    appointment.id,
    'export',
    'manual_backfill',
    'pending',
    now() + pg_catalog.make_interval(
      mins => (((row_number() over (
        order by appointment.starts_at, appointment.id
      )) - 1) / 10)::integer
    ),
    now()
  from public.google_calendar_connections connection
  join public.appointments appointment
    on appointment.barber_id = connection.barber_id
   and appointment.source_provider = 'bvrb3r'
   and appointment.starts_at >= now() - interval '30 days'
   and appointment.starts_at < now() + interval '365 days'
  where connection.id = p_connection_id
  on conflict (provider, connection_id, appointment_id, direction)
    where state = 'pending'
  do update
    set due_at = least(public.calendar_sync_jobs.due_at, excluded.due_at),
        reason = excluded.reason,
        updated_at = now();

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

revoke all on function public.product_pr33_enqueue_google_export_backfill(uuid)
  from public, anon, authenticated;
grant execute on function public.product_pr33_enqueue_google_export_backfill(uuid)
  to service_role;

drop trigger if exists product_pr33_enqueue_google_calendar_write
  on public.appointments;
create trigger product_pr33_enqueue_google_calendar_write
  after insert or update of starts_at, ends_at, status, barber_id, client_id, service_id, source_provider
  on public.appointments
  for each row
  execute function private.product_pr33_enqueue_google_calendar_write();

create or replace function private.product_pr33_guard_square_queue_checkout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_provider = 'square' then
    if new.converted_appointment_id is not null then
      raise exception using
        errcode = '23514',
        message = 'Square appointments cannot enter BVRB3R checkout or settlement.';
    end if;

    if new.status = 'called' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
      raise exception using
        errcode = '23514',
        message = 'Square appointments cannot be called into the BVRB3R settle flow.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.product_pr33_guard_square_queue_checkout()
  from public, anon, authenticated, service_role;

drop trigger if exists product_pr33_guard_square_queue_checkout
  on public.waitlist_entries;
create trigger product_pr33_guard_square_queue_checkout
  before insert or update of source_provider, status, converted_appointment_id
  on public.waitlist_entries
  for each row
  execute function private.product_pr33_guard_square_queue_checkout();

alter table public.calendar_oauth_states enable row level security;
alter table public.calendar_oauth_states force row level security;
alter table public.square_connections enable row level security;
alter table public.square_connections force row level security;
alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_connections force row level security;
alter table public.apple_calendar_feeds enable row level security;
alter table public.apple_calendar_feeds force row level security;
alter table public.calendar_source_preferences enable row level security;
alter table public.calendar_source_preferences force row level security;
alter table public.calendar_busy_blocks enable row level security;
alter table public.calendar_busy_blocks force row level security;
alter table public.calendar_event_links enable row level security;
alter table public.calendar_event_links force row level security;
alter table public.calendar_sync_jobs enable row level security;
alter table public.calendar_sync_jobs force row level security;
alter table public.calendar_sync_runs enable row level security;
alter table public.calendar_sync_runs force row level security;

revoke all on public.calendar_oauth_states from public, anon, authenticated;
revoke all on public.square_connections from public, anon, authenticated;
revoke all on public.google_calendar_connections from public, anon, authenticated;
revoke all on public.apple_calendar_feeds from public, anon, authenticated;
revoke all on public.calendar_source_preferences from public, anon, authenticated;
revoke all on public.calendar_busy_blocks from public, anon, authenticated;
revoke all on public.calendar_event_links from public, anon, authenticated;
revoke all on public.calendar_sync_jobs from public, anon, authenticated;
revoke all on public.calendar_sync_runs from public, anon, authenticated;
revoke all on public.imported_appointments from public, anon, authenticated;

grant select, insert, update, delete on public.calendar_oauth_states to service_role;
grant select, insert, update, delete on public.square_connections to service_role;
grant select, insert, update, delete on public.google_calendar_connections to service_role;
grant select, insert, update, delete on public.apple_calendar_feeds to service_role;
grant select, insert, update, delete on public.calendar_source_preferences to service_role;
grant select, insert, update, delete on public.calendar_busy_blocks to service_role;
grant select, insert, update, delete on public.calendar_event_links to service_role;
grant select, insert, update, delete on public.calendar_sync_jobs to service_role;
grant select, insert, update, delete on public.calendar_sync_runs to service_role;
grant select on public.imported_appointments to service_role;

commit;
