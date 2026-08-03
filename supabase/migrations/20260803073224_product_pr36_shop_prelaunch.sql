-- Staging ledger version: 20260803073224.
-- Product PR36: real Coming Soon shops and owner-controlled launch scheduling.
-- The waitlist stores join order; its first booking window is exactly 24 hours.
-- No shop-linked payment may be authorized or captured before opening.

create schema if not exists private;

create table if not exists public.shop_prelaunches (
  shop_id text primary key references public.shops(id) on delete cascade,
  opening_at timestamptz not null,
  chair_capacity smallint not null default 6 check (chair_capacity between 1 and 24),
  head_start_hours smallint not null default 24 check (head_start_hours = 24),
  status text not null default 'prelaunch'
    check (status in ('prelaunch', 'launch_scheduled', 'paused', 'canceled')),
  page_visits bigint not null default 0 check (page_visits >= 0),
  version integer not null default 1 check (version > 0),
  go_live_approved_at timestamptz,
  go_live_approved_by uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint shop_prelaunches_schedule_evidence_ck check (
    status <> 'launch_scheduled'
    or (go_live_approved_at is not null and go_live_approved_by is not null)
  )
);

create index if not exists shop_prelaunches_opening_idx
  on public.shop_prelaunches (status, opening_at);

create index if not exists shop_prelaunches_go_live_actor_idx
  on public.shop_prelaunches (go_live_approved_by)
  where go_live_approved_by is not null;

create index if not exists shop_prelaunches_created_by_idx
  on public.shop_prelaunches (created_by);

create table if not exists public.shop_prelaunch_waitlist (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shop_prelaunches(shop_id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete restrict,
  email text,
  phone text,
  position integer not null check (position > 0),
  status text not null default 'active'
    check (status in ('active', 'notified', 'converted', 'withdrawn')),
  opening_notification_consent boolean not null,
  joined_at timestamptz not null default timezone('utc', now()),
  notified_at timestamptz,
  converted_at timestamptz,
  withdrawn_at timestamptz,
  contact_anonymized_at timestamptz,
  constraint shop_prelaunch_waitlist_contact_ck check (
    status = 'withdrawn'
    or profile_id is not null
    or email is not null
    or phone is not null
  ),
  constraint shop_prelaunch_waitlist_email_ck check (
    email is null
    or (length(email) between 3 and 320 and email = lower(btrim(email)) and position('@' in email) > 1)
  ),
  constraint shop_prelaunch_waitlist_phone_ck check (
    phone is null or length(phone) between 10 and 16
  ),
  constraint shop_prelaunch_waitlist_consent_ck check (
    (
      status = 'withdrawn'
      and opening_notification_consent = false
      and profile_id is null
      and email is null
      and phone is null
      and withdrawn_at is not null
      and contact_anonymized_at is not null
    )
    or (
      status <> 'withdrawn'
      and opening_notification_consent = true
      and withdrawn_at is null
      and contact_anonymized_at is null
    )
  ),
  constraint shop_prelaunch_waitlist_position_uidx unique (shop_id, position)
);

create unique index if not exists shop_prelaunch_waitlist_profile_uidx
  on public.shop_prelaunch_waitlist (shop_id, profile_id)
  where profile_id is not null;

create unique index if not exists shop_prelaunch_waitlist_email_uidx
  on public.shop_prelaunch_waitlist (shop_id, email)
  where email is not null;

create unique index if not exists shop_prelaunch_waitlist_phone_uidx
  on public.shop_prelaunch_waitlist (shop_id, phone)
  where phone is not null;

create index if not exists shop_prelaunch_waitlist_status_position_idx
  on public.shop_prelaunch_waitlist (shop_id, status, position);

create index if not exists shop_prelaunch_waitlist_profile_read_idx
  on public.shop_prelaunch_waitlist (profile_id, shop_id)
  where profile_id is not null;

create table if not exists public.shop_prelaunch_events (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shop_prelaunches(shop_id) on delete cascade,
  event_type text not null check (
    event_type in (
      'configured', 'waitlist_joined', 'waitlist_withdrawn',
      'launch_scheduled'
    )
  ),
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 16 and 128),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint shop_prelaunch_events_idempotency_uidx unique (shop_id, event_type, idempotency_key)
);

create index if not exists shop_prelaunch_events_shop_created_idx
  on public.shop_prelaunch_events (shop_id, created_at desc);

create index if not exists shop_prelaunch_events_actor_idx
  on public.shop_prelaunch_events (actor_profile_id)
  where actor_profile_id is not null;

comment on table public.shop_prelaunches is
  'Shop-owned prelaunch schedule. A launch approval schedules a 24-hour waitlist booking window before public opening.';
comment on table public.shop_prelaunch_waitlist is
  'Private opening waitlist with permanent, honest join positions. It contains no payment fields.';
comment on table public.shop_prelaunch_events is
  'Append-only audit evidence for configuration, waitlist joins/withdrawals, and launch scheduling.';

revoke all on table public.shop_prelaunches from public, anon, authenticated;
revoke all on table public.shop_prelaunch_waitlist from public, anon, authenticated;
revoke all on table public.shop_prelaunch_events from public, anon, authenticated;
grant select, insert, update on table public.shop_prelaunches to service_role;
grant select, insert, update on table public.shop_prelaunch_waitlist to service_role;
grant select, insert on table public.shop_prelaunch_events to service_role;
grant select on table public.shop_prelaunches to authenticated;
grant select on table public.shop_prelaunch_waitlist to authenticated;
grant select on table public.shop_prelaunch_events to authenticated;

alter table public.shop_prelaunches enable row level security;
alter table public.shop_prelaunches force row level security;
alter table public.shop_prelaunch_waitlist enable row level security;
alter table public.shop_prelaunch_waitlist force row level security;
alter table public.shop_prelaunch_events enable row level security;
alter table public.shop_prelaunch_events force row level security;

drop policy if exists "pr36 owner prelaunch read" on public.shop_prelaunches;
create policy "pr36 owner prelaunch read"
  on public.shop_prelaunches for select to authenticated
  using (
    exists (
      select 1
      from public.shops shop
      where shop.id = shop_prelaunches.shop_id
        and shop.owner_profile_id = (select auth.uid())
    )
  );

drop policy if exists "pr36 waitlist self read" on public.shop_prelaunch_waitlist;
create policy "pr36 waitlist self read"
  on public.shop_prelaunch_waitlist for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists "pr36 owner prelaunch events read" on public.shop_prelaunch_events;
create policy "pr36 owner prelaunch events read"
  on public.shop_prelaunch_events for select to authenticated
  using (
    exists (
      select 1
      from public.shops shop
      where shop.id = shop_prelaunch_events.shop_id
        and shop.owner_profile_id = (select auth.uid())
    )
  );

create or replace function private.pr36_reject_prelaunch_history_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'PR36 prelaunch history is append-only';
end;
$$;

create or replace function private.pr36_guard_waitlist_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.shop_id is distinct from new.shop_id
     or old.position is distinct from new.position
     or old.joined_at is distinct from new.joined_at then
    raise exception 'PR36 waitlist shop and position are immutable';
  end if;

  if old.status = 'withdrawn' then
    raise exception 'PR36 withdrawn waitlist history is immutable';
  end if;

  if new.status = 'withdrawn' then
    if new.opening_notification_consent is distinct from false
       or new.profile_id is not null
       or new.email is not null
       or new.phone is not null
       or new.withdrawn_at is null
       or new.contact_anonymized_at is null then
      raise exception 'PR36 waitlist withdrawal must revoke consent and anonymize contact data';
    end if;
    return new;
  end if;

  if old.profile_id is distinct from new.profile_id
     or old.email is distinct from new.email
     or old.phone is distinct from new.phone
     or old.opening_notification_consent is distinct from new.opening_notification_consent
     or old.withdrawn_at is distinct from new.withdrawn_at
     or old.contact_anonymized_at is distinct from new.contact_anonymized_at then
    raise exception 'PR36 active waitlist identity and consent are immutable';
  end if;

  if not (
    old.status = new.status
    or (old.status = 'active' and new.status in ('notified', 'converted'))
    or (old.status = 'notified' and new.status = 'converted')
  ) then
    raise exception 'Invalid PR36 waitlist status transition';
  end if;
  return new;
end;
$$;

revoke all on function private.pr36_reject_prelaunch_history_change() from public;
revoke all on function private.pr36_guard_waitlist_position() from public;

drop trigger if exists shop_prelaunch_events_immutable on public.shop_prelaunch_events;
create trigger shop_prelaunch_events_immutable
before update or delete on public.shop_prelaunch_events
for each row execute function private.pr36_reject_prelaunch_history_change();

drop trigger if exists shop_prelaunch_waitlist_no_delete on public.shop_prelaunch_waitlist;
create trigger shop_prelaunch_waitlist_no_delete
before delete on public.shop_prelaunch_waitlist
for each row execute function private.pr36_reject_prelaunch_history_change();

drop trigger if exists shop_prelaunch_waitlist_position_guard on public.shop_prelaunch_waitlist;
create trigger shop_prelaunch_waitlist_position_guard
before update on public.shop_prelaunch_waitlist
for each row execute function private.pr36_guard_waitlist_position();

create or replace function private.pr36_withdraw_deleted_account_waitlists()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
begin
  if new.status <> 'deleted' or old.status is not distinct from new.status then
    return new;
  end if;

  -- Preserve the permanent position and audit fact only. Sorting by shop and
  -- position gives every deletion worker the same lock order.
  for v_entry in
    select entry.id, entry.shop_id, entry.position
    from public.shop_prelaunch_waitlist entry
    where entry.profile_id = new.profile_id
      and entry.status <> 'withdrawn'
    order by entry.shop_id, entry.position, entry.id
    for update
  loop
    update public.shop_prelaunch_waitlist
    set profile_id = null,
        email = null,
        phone = null,
        status = 'withdrawn',
        opening_notification_consent = false,
        withdrawn_at = timezone('utc', now()),
        contact_anonymized_at = timezone('utc', now())
    where id = v_entry.id;

    insert into public.shop_prelaunch_events (
      shop_id, event_type, actor_profile_id, idempotency_key, metadata
    ) values (
      v_entry.shop_id,
      'waitlist_withdrawn',
      null,
      'account-deletion:' || new.profile_id::text || ':' || v_entry.id::text,
      jsonb_build_object(
        'position', v_entry.position,
        'entryId', v_entry.id,
        'contactAnonymized', true,
        'source', 'account_deletion'
      )
    ) on conflict (shop_id, event_type, idempotency_key) do nothing;
  end loop;

  return new;
end;
$$;

revoke all on function private.pr36_withdraw_deleted_account_waitlists()
  from public, anon, authenticated, service_role;

drop trigger if exists pr36_withdraw_deleted_account_waitlists
  on public.account_privacy_lifecycles;
create trigger pr36_withdraw_deleted_account_waitlists
after update of status on public.account_privacy_lifecycles
for each row
when (new.status = 'deleted' and old.status is distinct from new.status)
execute function private.pr36_withdraw_deleted_account_waitlists();

create or replace function private.pr36_shop_launch_readiness(p_shop_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop public.shops%rowtype;
  v_location public.locations%rowtype;
  v_config public.shop_prelaunches%rowtype;
  v_identity boolean := false;
  v_stripe boolean := false;
  v_policies boolean := false;
  v_hours boolean := false;
  v_team boolean := false;
  v_kiosk boolean := false;
  v_founding_chairs integer := 0;
begin
  select * into v_shop from public.shops where id = p_shop_id;
  select * into v_config from public.shop_prelaunches where shop_id = p_shop_id;
  select *
  into v_location
  from public.locations location
  where location.reference_code = p_shop_id
     or location.id::text = p_shop_id
  order by case when location.reference_code = p_shop_id then 0 else 1 end
  limit 1;

  if v_shop.id is null or v_config.shop_id is null then
    return jsonb_build_object('allGreen', false, 'reason', 'missing_shop_or_prelaunch');
  end if;

  v_identity := v_shop.app_approval_status::text = 'approved'
    and length(btrim(coalesce(v_shop.name, ''))) >= 2
    and length(btrim(coalesce(v_shop.public_username, v_shop.shop_username, ''))) >= 2
    and length(btrim(coalesce(v_shop.address, ''))) >= 3
    and length(btrim(coalesce(v_shop.city, ''))) >= 2
    and length(btrim(coalesce(v_shop.state, ''))) >= 2;

  v_policies := length(btrim(coalesce(v_shop.policies, ''))) >= 20;
  v_hours := (
    v_shop.public_hours is not null
    and jsonb_typeof(v_shop.public_hours) = 'object'
    and v_shop.public_hours <> '{}'::jsonb
  ) or (
    v_location.id is not null
    and v_location.hours is not null
    and jsonb_typeof(v_location.hours) = 'object'
    and v_location.hours <> '{}'::jsonb
  );

  if v_location.id is not null then
    select exists (
      select 1
      from public.connected_accounts account
      where account.subject_type = 'shop'
        and account.shop_id = v_location.id
        and account.provider = 'stripe_connect'
        and account.provider_account_id is not null
        and account.onboarding_status = 'verified'
        and account.payout_readiness_status = 'ready'
        and account.charges_enabled
        and account.payouts_enabled
    ) into v_stripe;

    select count(distinct team.profile_id)::integer
    into v_founding_chairs
    from (
      select invite.barber_profile_id as profile_id
      from public.shop_team_invites invite
      where invite.shop_id = v_location.id
        and invite.status = 'active'
        and invite.public_team_visible
      union
      select membership.profile_id
      from public.staff_locations membership
      where membership.location_id = v_location.id
        and membership.relationship_status = 'active'
        and membership.ended_at is null
        and membership.public_team_visible
    ) team;

    select exists (
      select 1
      from public.kiosk_settings kiosk
      where kiosk.scope = 'shop'
        and kiosk.target_reference in (p_shop_id, v_location.id::text, coalesce(v_location.reference_code, ''))
        and kiosk.enabled
        and length(btrim(coalesce(kiosk.device_label, ''))) >= 2
        and kiosk.last_verified_at is not null
    ) into v_kiosk;
  end if;

  v_team := v_founding_chairs >= v_config.chair_capacity;
  return jsonb_build_object(
    'allGreen', v_identity and v_stripe and v_policies and v_hours and v_team and v_kiosk,
    'identity', v_identity,
    'stripe', v_stripe,
    'policies', v_policies,
    'hours', v_hours,
    'team', v_team,
    'kiosk', v_kiosk,
    'foundingChairCount', v_founding_chairs,
    'chairCapacity', v_config.chair_capacity
  );
end;
$$;

revoke all on function private.pr36_shop_launch_readiness(text) from public;

create or replace function public.pr36_configure_shop_prelaunch(
  p_shop_id text,
  p_actor_profile_id uuid,
  p_opening_at timestamptz,
  p_chair_capacity integer,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.shop_prelaunches%rowtype;
begin
  if nullif(btrim(coalesce(p_shop_id, '')), '') is null or p_actor_profile_id is null then
    raise exception 'Shop and owner identity are required';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 16 and 128 then
    raise exception 'Invalid PR36 idempotency key';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'PR36 expected launch version is required';
  end if;
  if p_opening_at is null
     or p_opening_at <= timezone('utc', now()) + interval '24 hours'
     or p_opening_at > timezone('utc', now()) + interval '2 years' then
    raise exception 'Opening time must be in the allowed future window';
  end if;
  if p_chair_capacity is null or p_chair_capacity not between 1 and 24 then
    raise exception 'Founding chair capacity is invalid';
  end if;
  if not exists (
    select 1 from public.shops shop
    where shop.id = p_shop_id and shop.owner_profile_id = p_actor_profile_id
  ) then
    raise exception 'Shop ownership could not be verified';
  end if;

  -- The row does not exist on first configuration, so a row lock alone cannot
  -- serialize two competing creators. One shop-scoped advisory lock closes
  -- that gap and is held only for this transaction.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bvrb3r.pr36.prelaunch:' || p_shop_id, 36)
  );

  select * into v_config
  from public.shop_prelaunches
  where shop_id = p_shop_id
  for update;

  if exists (
    select 1 from public.shop_prelaunch_events event
    where event.shop_id = p_shop_id
      and event.event_type = 'configured'
      and event.idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object(
      'shopId', v_config.shop_id,
      'version', v_config.version,
      'openingAt', v_config.opening_at,
      'alreadyApplied', true
    );
  end if;

  if v_config.shop_id is null then
    if p_expected_version <> 0 then
      raise exception 'PR36 launch version conflict';
    end if;
    insert into public.shop_prelaunches (
      shop_id, opening_at, chair_capacity, status, version, created_by
    ) values (
      p_shop_id, p_opening_at, p_chair_capacity, 'prelaunch', 1, p_actor_profile_id
    ) returning * into v_config;
  else
    if v_config.status = 'launch_scheduled' then
      raise exception 'PR36 launch is already scheduled';
    end if;
    if v_config.version <> p_expected_version then
      raise exception 'PR36 launch version conflict';
    end if;
    update public.shop_prelaunches
    set opening_at = p_opening_at,
        chair_capacity = p_chair_capacity,
        status = 'prelaunch',
        go_live_approved_at = null,
        go_live_approved_by = null,
        version = version + 1,
        updated_at = timezone('utc', now())
    where shop_id = p_shop_id
    returning * into v_config;
  end if;

  insert into public.shop_prelaunch_events (
    shop_id, event_type, actor_profile_id, idempotency_key, metadata
  ) values (
    p_shop_id,
    'configured',
    p_actor_profile_id,
    p_idempotency_key,
    jsonb_build_object(
      'openingAt', v_config.opening_at,
      'bookingHeadStartAt', v_config.opening_at - interval '24 hours',
      'chairCapacity', v_config.chair_capacity,
      'version', v_config.version
    )
  );

  return jsonb_build_object(
    'shopId', v_config.shop_id,
    'version', v_config.version,
    'openingAt', v_config.opening_at,
    'bookingHeadStartAt', v_config.opening_at - interval '24 hours',
    'alreadyApplied', false
  );
end;
$$;

revoke all on function public.pr36_configure_shop_prelaunch(text, uuid, timestamptz, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.pr36_configure_shop_prelaunch(text, uuid, timestamptz, integer, integer, text)
  to service_role;

create or replace function public.pr36_join_prelaunch_waitlist(
  p_shop_id text,
  p_profile_id uuid,
  p_email text,
  p_phone text,
  p_consent boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.shop_prelaunches%rowtype;
  v_existing public.shop_prelaunch_waitlist%rowtype;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_event_metadata jsonb;
  v_position integer;
  v_count integer;
begin
  if p_consent is distinct from true then
    raise exception 'Opening notification consent is required';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 16 and 128 then
    raise exception 'Invalid PR36 idempotency key';
  end if;
  if p_profile_id is null and v_email is null and v_phone is null then
    raise exception 'An email, phone, or profile is required';
  end if;
  if v_email is not null and (length(v_email) > 320 or position('@' in v_email) <= 1) then
    raise exception 'Invalid opening waitlist email';
  end if;
  if v_phone is not null and length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 10 and 15 then
    raise exception 'Invalid opening waitlist phone';
  end if;
  if p_profile_id is not null and not exists (
    select 1 from public.profiles profile where profile.id = p_profile_id
  ) then
    raise exception 'Opening waitlist profile was not found';
  end if;

  select * into v_config
  from public.shop_prelaunches
  where shop_id = p_shop_id
  for update;
  if v_config.shop_id is null
     or v_config.status not in ('prelaunch', 'launch_scheduled')
     or v_config.opening_at <= timezone('utc', now()) then
    raise exception 'This opening waitlist is no longer accepting entries';
  end if;

  -- An old join request must remain a no-op even if consent was withdrawn
  -- later. A renewed consent therefore requires a fresh idempotency key.
  select event.metadata
  into v_event_metadata
  from public.shop_prelaunch_events event
  where event.shop_id = p_shop_id
    and event.event_type = 'waitlist_joined'
    and event.idempotency_key = p_idempotency_key
  order by event.created_at
  limit 1;
  if found then
    select * into v_existing
    from public.shop_prelaunch_waitlist entry
    where entry.shop_id = p_shop_id
      and entry.id::text = (v_event_metadata ->> 'entryId');
    if v_existing.id is null then
      raise exception 'PR36 waitlist idempotency evidence is inconsistent';
    end if;
    select count(*)::integer into v_count
    from public.shop_prelaunch_waitlist entry
    where entry.shop_id = p_shop_id and entry.status in ('active', 'notified');
    return jsonb_build_object(
      'position', v_existing.position,
      'waitlistCount', v_count,
      'bookingOpensAt', v_config.opening_at - interval '24 hours',
      'alreadyJoined', true,
      'consentActive', v_existing.status <> 'withdrawn',
      'withdrawn', v_existing.status = 'withdrawn'
    );
  end if;

  select * into v_existing
  from public.shop_prelaunch_waitlist entry
  where entry.shop_id = p_shop_id
    and (
      (p_profile_id is not null and entry.profile_id = p_profile_id)
      or (v_email is not null and entry.email = v_email)
      or (v_phone is not null and entry.phone = v_phone)
    )
  order by entry.position
  limit 1;

  if v_existing.id is not null then
    insert into public.shop_prelaunch_events (
      shop_id, event_type, actor_profile_id, idempotency_key, metadata
    ) values (
      p_shop_id,
      'waitlist_joined',
      null,
      p_idempotency_key,
      jsonb_build_object(
        'position', v_existing.position,
        'entryId', v_existing.id
      )
    );

    select count(*)::integer into v_count
    from public.shop_prelaunch_waitlist entry
    where entry.shop_id = p_shop_id and entry.status in ('active', 'notified');
    return jsonb_build_object(
      'position', v_existing.position,
      'waitlistCount', v_count,
      'bookingOpensAt', v_config.opening_at - interval '24 hours',
      'alreadyJoined', true,
      'consentActive', true,
      'withdrawn', false
    );
  end if;

  select coalesce(max(entry.position), 0) + 1
  into v_position
  from public.shop_prelaunch_waitlist entry
  where entry.shop_id = p_shop_id;

  insert into public.shop_prelaunch_waitlist (
    shop_id, profile_id, email, phone, position, opening_notification_consent
  ) values (
    p_shop_id, p_profile_id, v_email, v_phone, v_position, true
  ) returning * into v_existing;

  insert into public.shop_prelaunch_events (
    shop_id, event_type, actor_profile_id, idempotency_key, metadata
  ) values (
    p_shop_id,
    'waitlist_joined',
    null,
    p_idempotency_key,
    jsonb_build_object(
      'position', v_position,
      'entryId', v_existing.id
    )
  );

  select count(*)::integer into v_count
  from public.shop_prelaunch_waitlist entry
  where entry.shop_id = p_shop_id and entry.status in ('active', 'notified');
  return jsonb_build_object(
    'position', v_position,
    'waitlistCount', v_count,
    'bookingOpensAt', v_config.opening_at - interval '24 hours',
    'alreadyJoined', false,
    'consentActive', true,
    'withdrawn', false
  );
end;
$$;

revoke all on function public.pr36_join_prelaunch_waitlist(text, uuid, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.pr36_join_prelaunch_waitlist(text, uuid, text, text, boolean, text)
  to service_role;

create or replace function public.pr36_withdraw_prelaunch_waitlist(
  p_shop_id text,
  p_profile_id uuid,
  p_email text,
  p_phone text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.shop_prelaunches%rowtype;
  v_existing public.shop_prelaunch_waitlist%rowtype;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_event_metadata jsonb;
  v_count integer;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 16 and 128 then
    raise exception 'Invalid PR36 idempotency key';
  end if;
  if p_profile_id is null and v_email is null and v_phone is null then
    raise exception 'An email, phone, or profile is required';
  end if;
  if v_email is not null and (length(v_email) > 320 or position('@' in v_email) <= 1) then
    raise exception 'Invalid opening waitlist email';
  end if;
  if v_phone is not null and length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 10 and 15 then
    raise exception 'Invalid opening waitlist phone';
  end if;

  -- Use the same shop-row-first lock order as join so withdrawal cannot race a
  -- join/re-consent and cannot deadlock it.
  select * into v_config
  from public.shop_prelaunches
  where shop_id = p_shop_id
  for update;
  if v_config.shop_id is null then
    return jsonb_build_object('outcome', 'not_found', 'reason', 'prelaunch_not_found');
  end if;

  select event.metadata
  into v_event_metadata
  from public.shop_prelaunch_events event
  where event.shop_id = p_shop_id
    and event.event_type = 'waitlist_withdrawn'
    and event.idempotency_key = p_idempotency_key;
  if found then
    select * into v_existing
    from public.shop_prelaunch_waitlist entry
    where entry.shop_id = p_shop_id
      and entry.id::text = (v_event_metadata ->> 'entryId');
    if v_existing.id is null or v_existing.status <> 'withdrawn' then
      raise exception 'PR36 waitlist withdrawal evidence is inconsistent';
    end if;
    select count(*)::integer into v_count
    from public.shop_prelaunch_waitlist entry
    where entry.shop_id = p_shop_id and entry.status in ('active', 'notified');
    return jsonb_build_object(
      'outcome', 'withdrawn',
      'position', v_existing.position,
      'waitlistCount', v_count,
      'alreadyWithdrawn', true,
      'contactAnonymized', true
    );
  end if;

  select * into v_existing
  from public.shop_prelaunch_waitlist entry
  where entry.shop_id = p_shop_id
    and (
      (p_profile_id is not null and entry.profile_id = p_profile_id)
      or (v_email is not null and entry.email = v_email)
      or (v_phone is not null and entry.phone = v_phone)
    )
  order by entry.position
  limit 1
  for update;

  if v_existing.id is null then
    return jsonb_build_object('outcome', 'not_found', 'reason', 'waitlist_entry_not_found');
  end if;

  if v_existing.status <> 'withdrawn' then
    update public.shop_prelaunch_waitlist
    set profile_id = null,
        email = null,
        phone = null,
        status = 'withdrawn',
        opening_notification_consent = false,
        withdrawn_at = timezone('utc', now()),
        contact_anonymized_at = timezone('utc', now())
    where id = v_existing.id
    returning * into v_existing;
  end if;

  select count(*)::integer into v_count
  from public.shop_prelaunch_waitlist entry
  where entry.shop_id = p_shop_id and entry.status in ('active', 'notified');

  insert into public.shop_prelaunch_events (
    shop_id, event_type, actor_profile_id, idempotency_key, metadata
  ) values (
    p_shop_id,
    'waitlist_withdrawn',
    null,
    p_idempotency_key,
    jsonb_build_object(
      'position', v_existing.position,
      'entryId', v_existing.id,
      'contactAnonymized', true
    )
  );

  return jsonb_build_object(
    'outcome', 'withdrawn',
    'position', v_existing.position,
    'waitlistCount', v_count,
    'alreadyWithdrawn', false,
    'contactAnonymized', true
  );
end;
$$;

revoke all on function public.pr36_withdraw_prelaunch_waitlist(text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.pr36_withdraw_prelaunch_waitlist(text, uuid, text, text, text)
  to service_role;

create or replace function public.pr36_record_prelaunch_visit(p_shop_id text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visits bigint;
begin
  update public.shop_prelaunches
  set page_visits = page_visits + 1,
      updated_at = timezone('utc', now())
  where shop_id = p_shop_id
    and status in ('prelaunch', 'launch_scheduled')
  returning page_visits into v_visits;
  return v_visits;
end;
$$;

revoke all on function public.pr36_record_prelaunch_visit(text) from public, anon, authenticated;
grant execute on function public.pr36_record_prelaunch_visit(text) to service_role;

create or replace function public.pr36_go_live_shop(
  p_shop_id text,
  p_actor_profile_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.shop_prelaunches%rowtype;
  v_readiness jsonb;
begin
  if nullif(btrim(coalesce(p_shop_id, '')), '') is null or p_actor_profile_id is null then
    raise exception 'Shop and owner identity are required';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 16 and 128 then
    raise exception 'Invalid PR36 idempotency key';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'PR36 expected launch version is required';
  end if;
  if not exists (
    select 1 from public.shops shop
    where shop.id = p_shop_id and shop.owner_profile_id = p_actor_profile_id
  ) then
    raise exception 'Shop ownership could not be verified';
  end if;

  select * into v_config
  from public.shop_prelaunches
  where shop_id = p_shop_id
  for update;
  if v_config.shop_id is null then
    raise exception 'PR36 prelaunch is not configured';
  end if;
  if exists (
    select 1 from public.shop_prelaunch_events event
    where event.shop_id = p_shop_id
      and event.event_type = 'launch_scheduled'
      and event.idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object(
      'scheduled', true,
      'version', v_config.version,
      'openingAt', v_config.opening_at,
      'bookingHeadStartAt', v_config.opening_at - interval '24 hours',
      'alreadyApplied', true
    );
  end if;
  if v_config.status = 'launch_scheduled' then
    raise exception 'PR36 launch is already scheduled';
  end if;
  if v_config.version <> p_expected_version then
    raise exception 'PR36 launch version conflict';
  end if;
  if timezone('utc', now()) > v_config.opening_at - interval '24 hours' then
    raise exception 'PR36 24-hour head-start boundary has passed';
  end if;

  v_readiness := private.pr36_shop_launch_readiness(p_shop_id);
  if not coalesce((v_readiness ->> 'allGreen')::boolean, false) then
    raise exception 'All six PR36 launch checks must be green';
  end if;

  update public.shop_prelaunches
  set status = 'launch_scheduled',
      go_live_approved_at = timezone('utc', now()),
      go_live_approved_by = p_actor_profile_id,
      version = version + 1,
      updated_at = timezone('utc', now())
  where shop_id = p_shop_id
  returning * into v_config;

  insert into public.shop_prelaunch_events (
    shop_id, event_type, actor_profile_id, idempotency_key, metadata
  ) values (
    p_shop_id,
    'launch_scheduled',
    p_actor_profile_id,
    p_idempotency_key,
    jsonb_build_object(
      'openingAt', v_config.opening_at,
      'bookingHeadStartAt', v_config.opening_at - interval '24 hours',
      'headStartHours', 24,
      'readiness', v_readiness,
      'version', v_config.version
    )
  );

  return jsonb_build_object(
    'scheduled', true,
    'version', v_config.version,
    'openingAt', v_config.opening_at,
    'bookingHeadStartAt', v_config.opening_at - interval '24 hours',
    'alreadyApplied', false
  );
end;
$$;

revoke all on function public.pr36_go_live_shop(text, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.pr36_go_live_shop(text, uuid, integer, text)
  to service_role;

create or replace function public.pr36_shop_booking_access(
  p_shop_id text,
  p_profile_id uuid
)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_config public.shop_prelaunches%rowtype;
begin
  select * into v_config from public.shop_prelaunches where shop_id = p_shop_id;
  if v_config.shop_id is null then
    return 'public';
  end if;
  if v_config.status = 'launch_scheduled'
     and v_config.go_live_approved_at is not null
     and timezone('utc', now()) >= v_config.opening_at then
    return 'public';
  end if;
  if v_config.status = 'launch_scheduled'
     and v_config.go_live_approved_at is not null
     and timezone('utc', now()) >= v_config.opening_at - interval '24 hours'
     and p_profile_id is not null
     and exists (
       select 1 from public.shop_prelaunch_waitlist entry
       where entry.shop_id = p_shop_id
         and (
           entry.profile_id = p_profile_id
           or entry.email = (
             select lower(profile.email)
             from public.profiles profile
             where profile.id = p_profile_id
           )
         )
         and entry.status in ('active', 'notified')
     ) then
    return 'waitlist_only';
  end if;
  return 'closed';
end;
$$;

revoke all on function public.pr36_shop_booking_access(text, uuid) from public, anon, authenticated;
grant execute on function public.pr36_shop_booking_access(text, uuid) to service_role;

create or replace function private.pr36_prelaunch_hold_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id text;
  v_access text;
begin
  if new.status <> 'active' or new.location_id is null then
    return new;
  end if;
  select launch.shop_id
  into v_shop_id
  from public.shop_prelaunches launch
  join public.locations location
    on location.reference_code = launch.shop_id or location.id::text = launch.shop_id
  where location.id = new.location_id
  limit 1;
  if v_shop_id is null then
    return new;
  end if;
  v_access := public.pr36_shop_booking_access(v_shop_id, new.owner_profile_id);
  if v_access = 'closed' or (v_access = 'waitlist_only' and new.owner_profile_id is null) then
    raise exception 'This PR36 shop is not open for this booking hold yet';
  end if;
  return new;
end;
$$;

create or replace function private.pr36_prelaunch_appointment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id text;
  v_profile_id uuid;
  v_location_id uuid := coalesce(new.shop_id, new.location_id);
  v_access text;
begin
  if v_location_id is null then
    return new;
  end if;
  select launch.shop_id
  into v_shop_id
  from public.shop_prelaunches launch
  join public.locations location
    on location.reference_code = launch.shop_id or location.id::text = launch.shop_id
  where location.id = v_location_id
  limit 1;
  if v_shop_id is null then
    return new;
  end if;
  select client.profile_id into v_profile_id
  from public.clients client
  where client.id = new.client_id;
  v_profile_id := coalesce(v_profile_id, new.created_by);
  v_access := public.pr36_shop_booking_access(v_shop_id, v_profile_id);
  if v_access = 'closed' or (v_access = 'waitlist_only' and v_profile_id is null) then
    raise exception 'This PR36 shop is not open for this appointment yet';
  end if;
  return new;
end;
$$;

revoke all on function private.pr36_prelaunch_hold_guard() from public;
revoke all on function private.pr36_prelaunch_appointment_guard() from public;

drop trigger if exists pr36_prelaunch_hold_guard on public.booking_slot_holds;
create trigger pr36_prelaunch_hold_guard
before insert on public.booking_slot_holds
for each row execute function private.pr36_prelaunch_hold_guard();

drop trigger if exists pr36_prelaunch_appointment_guard on public.appointments;
create trigger pr36_prelaunch_appointment_guard
before insert on public.appointments
for each row execute function private.pr36_prelaunch_appointment_guard();

create or replace function public.pr36_shop_payment_allowed(
  p_shop_id text,
  p_location_id uuid default null
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select not exists (
    select 1
    from public.shop_prelaunches launch
    left join public.locations location
      on location.reference_code = launch.shop_id or location.id::text = launch.shop_id
    where (launch.shop_id = p_shop_id or (p_location_id is not null and location.id = p_location_id))
      and (
        launch.status <> 'launch_scheduled'
        or launch.go_live_approved_at is null
        or timezone('utc', now()) < launch.opening_at
      )
  );
$$;

revoke all on function public.pr36_shop_payment_allowed(text, uuid) from public, anon, authenticated;
grant execute on function public.pr36_shop_payment_allowed(text, uuid) to service_role;

create or replace function private.pr36_prelaunch_gift_purchase_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scope_type <> 'shop'
     or new.scope_shop_id is null
     or new.status in ('failed', 'refunded') then
    return new;
  end if;

  -- Harmless metadata maintenance on an already-existing attempt remains
  -- possible. Creating or advancing shop-scoped money does not.
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.scope_type is not distinct from new.scope_type
     and old.scope_shop_id is not distinct from new.scope_shop_id then
    return new;
  end if;

  if not public.pr36_shop_payment_allowed(null, new.scope_shop_id) then
    raise exception 'No shop-scoped gift-card payment may start before the PR36 shop opening';
  end if;
  return new;
end;
$$;

create or replace function private.pr36_prelaunch_gift_redemption_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
begin
  select coalesce(appointment.shop_id, appointment.location_id)
  into v_location_id
  from public.appointments appointment
  where appointment.id = new.appointment_id;

  if v_location_id is not null
     and not public.pr36_shop_payment_allowed(null, v_location_id) then
    raise exception 'No gift-card value may be applied before the PR36 shop opening';
  end if;
  return new;
end;
$$;

revoke all on function private.pr36_prelaunch_gift_purchase_guard() from public;
revoke all on function private.pr36_prelaunch_gift_redemption_guard() from public;

drop trigger if exists pr36_prelaunch_gift_purchase_guard
  on public.gift_card_purchase_attempts;
create trigger pr36_prelaunch_gift_purchase_guard
before insert or update on public.gift_card_purchase_attempts
for each row execute function private.pr36_prelaunch_gift_purchase_guard();

drop trigger if exists pr36_prelaunch_gift_redemption_guard
  on public.gift_card_applications;
create trigger pr36_prelaunch_gift_redemption_guard
before insert on public.gift_card_applications
for each row execute function private.pr36_prelaunch_gift_redemption_guard();

create or replace function private.pr36_preopening_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocked boolean := false;
  v_attempts_payment boolean := false;
  v_new_positive boolean := false;
  v_old_positive boolean := false;
begin
  -- Refund states are corrective and must remain writable. Canonical
  -- payment_status takes precedence over stale legacy status text.
  v_new_positive := lower(coalesce(new.payment_status, '')) in ('authorized', 'captured')
    or (
      lower(coalesce(new.payment_status, '')) not in ('failed', 'refunded', 'partially_refunded', 'voided')
      and lower(coalesce(new.status, '')) in ('authorized', 'captured', 'paid', 'succeeded', 'completed')
    );

  if tg_op = 'INSERT' then
    v_attempts_payment := v_new_positive;
  else
    v_old_positive := lower(coalesce(old.payment_status, '')) in ('authorized', 'captured')
      or (
        lower(coalesce(old.payment_status, '')) not in ('failed', 'refunded', 'partially_refunded', 'voided')
        and lower(coalesce(old.status, '')) in ('authorized', 'captured', 'paid', 'succeeded', 'completed')
      );
    v_attempts_payment := v_new_positive and (
      not v_old_positive
      or old.payment_status is distinct from new.payment_status
      or old.status is distinct from new.status
      or old.amount is distinct from new.amount
      or old.shop_id is distinct from new.shop_id
      or old.appointment_id is distinct from new.appointment_id
      or old.pos_sale_id is distinct from new.pos_sale_id
      or old.location_reference is distinct from new.location_reference
    );
  end if;

  if not v_attempts_payment then
    return new;
  end if;

  select exists (
    select 1
    from public.shop_prelaunches launch
    left join public.locations location
      on location.reference_code = launch.shop_id or location.id::text = launch.shop_id
    where (
      (new.shop_id is not null and location.id = new.shop_id)
      or (
        new.appointment_id is not null
        and exists (
          select 1 from public.appointments appointment
          where appointment.id = new.appointment_id
            and coalesce(appointment.shop_id, appointment.location_id) = location.id
        )
      )
      or (
        new.pos_sale_id is not null
        and exists (
          select 1 from public.pos_sales sale
          where sale.id = new.pos_sale_id and sale.shop_id = location.id
        )
      )
      or (
        new.location_reference is not null
        and new.location_reference in (launch.shop_id, coalesce(location.reference_code, ''), coalesce(location.id::text, ''))
      )
    )
      and (
        launch.status <> 'launch_scheduled'
        or launch.go_live_approved_at is null
        or timezone('utc', now()) < launch.opening_at
      )
  ) into v_blocked;

  if v_blocked then
    raise exception 'No payment may be authorized or captured before the PR36 shop opening';
  end if;
  return new;
end;
$$;

revoke all on function private.pr36_preopening_payment_guard() from public;

drop trigger if exists pr36_preopening_payment_guard on public.payments;
create trigger pr36_preopening_payment_guard
before insert or update on public.payments
for each row execute function private.pr36_preopening_payment_guard();

notify pgrst, 'reload schema';
