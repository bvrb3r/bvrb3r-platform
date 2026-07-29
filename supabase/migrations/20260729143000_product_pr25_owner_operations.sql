-- Product PR25 — shop-owner operations with barber-money privacy.
-- Owners run the floor. They do not gain access to a barber's earnings, tips,
-- external-provider money, private client notes, or another shop's records.

begin;

-- --------------------------------------------------------------------------
-- 1. Remove legacy management reads that violate the PR25 privacy contract.
-- --------------------------------------------------------------------------

drop policy if exists "payments shop staff select" on public.payments;
drop policy if exists "tips shop staff select" on public.tips;
drop policy if exists "tips shop staff insert" on public.tips;
drop policy if exists "payment routing management select" on public.payment_routing_records;
drop policy if exists "owner analytics owner or manager read" on public.owner_daily_analytics;
drop policy if exists "barber revenue snapshots owner manager select" on public.barber_revenue_snapshots;

comment on table public.payments is
  'Payment rows are visible to the paying client and receiving barber only. Shop owners use booth-rent ledgers and safe operational counts.';
comment on table public.tips is
  'Tips belong to the barber and are not visible to shop owners, managers, or front-desk operators.';

-- --------------------------------------------------------------------------
-- 2. Shop-scoped floor controls, chairs, and aggregate ClientBridge truth.
-- --------------------------------------------------------------------------

create table if not exists public.shop_floor_controls (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  intake_open boolean not null default true,
  floor_note text,
  rotation_override_barber_id uuid references public.barbers(id) on delete set null,
  rotation_override_reason text,
  rotation_override_expires_at timestamptz,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_floor_controls_scope_uidx unique (shop_id, location_id),
  constraint shop_floor_controls_note_ck check (
    floor_note is null or length(trim(floor_note)) between 3 and 500
  ),
  constraint shop_floor_controls_override_ck check (
    (rotation_override_barber_id is null
      and rotation_override_reason is null
      and rotation_override_expires_at is null)
    or
    (rotation_override_barber_id is not null
      and length(trim(rotation_override_reason)) between 3 and 500
      and rotation_override_expires_at is not null)
  )
);

create index if not exists shop_floor_controls_location_idx
  on public.shop_floor_controls (location_id);
create index if not exists shop_floor_controls_override_barber_idx
  on public.shop_floor_controls (rotation_override_barber_id)
  where rotation_override_barber_id is not null;
create index if not exists shop_floor_controls_updated_by_idx
  on public.shop_floor_controls (updated_by_profile_id)
  where updated_by_profile_id is not null;

create table if not exists public.shop_chairs (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  assigned_barber_id uuid references public.barbers(id) on delete set null,
  retired_at timestamptz,
  retired_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_chairs_label_ck check (length(trim(label)) between 1 and 80),
  constraint shop_chairs_sort_ck check (sort_order between 0 and 999),
  constraint shop_chairs_retired_ck check (
    (active and retired_at is null)
    or
    (not active and retired_at is not null)
  )
);

create unique index if not exists shop_chairs_active_label_uidx
  on public.shop_chairs (shop_id, location_id, lower(label))
  where active;
create index if not exists shop_chairs_scope_idx
  on public.shop_chairs (shop_id, location_id, active, sort_order);
create unique index if not exists shop_chairs_active_barber_uidx
  on public.shop_chairs (shop_id, location_id, assigned_barber_id)
  where active and assigned_barber_id is not null;
create index if not exists shop_chairs_assigned_barber_idx
  on public.shop_chairs (assigned_barber_id)
  where assigned_barber_id is not null;
create index if not exists shop_chairs_location_idx
  on public.shop_chairs (location_id);
create index if not exists shop_chairs_retired_by_idx
  on public.shop_chairs (retired_by_profile_id)
  where retired_by_profile_id is not null;

create table if not exists public.owner_clientbridge_daily_aggregates (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  source_provider text not null,
  channel text not null,
  offered_count integer not null default 0,
  consented_count integer not null default 0,
  invitation_count integer not null default 0,
  claimed_count integer not null default 0,
  opted_out_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint owner_clientbridge_counts_ck check (
    offered_count >= 0
    and consented_count >= 0
    and invitation_count >= 0
    and claimed_count >= 0
    and opted_out_count >= 0
    and consented_count <= offered_count
    and invitation_count <= consented_count
    and claimed_count <= invitation_count
    and opted_out_count <= offered_count
  ),
  constraint owner_clientbridge_scope_uidx
    unique (shop_id, location_id, business_date, source_provider, channel)
);

create index if not exists owner_clientbridge_scope_date_idx
  on public.owner_clientbridge_daily_aggregates
  (shop_id, location_id, business_date desc);
create index if not exists owner_clientbridge_location_idx
  on public.owner_clientbridge_daily_aggregates (location_id);

alter table public.shop_floor_controls enable row level security;
alter table public.shop_chairs enable row level security;
alter table public.owner_clientbridge_daily_aggregates enable row level security;

revoke all on public.shop_floor_controls from public, anon, authenticated;
revoke all on public.shop_chairs from public, anon, authenticated;
revoke all on public.owner_clientbridge_daily_aggregates from public, anon, authenticated;

grant select, insert, update on public.shop_floor_controls to service_role;
grant select, insert, update on public.shop_chairs to service_role;
grant select, insert, update on public.owner_clientbridge_daily_aggregates to service_role;
grant select on public.shop_floor_controls to authenticated;
grant select on public.shop_chairs to authenticated;
grant select on public.owner_clientbridge_daily_aggregates to authenticated;

create policy "pr25 owner floor controls read"
  on public.shop_floor_controls for select to authenticated
  using (
    (select private.has_shop_operator_access(
      shop_id,
      location_id,
      array['owner', 'manager', 'front_desk']::text[]
    ))
  );

create policy "pr25 owner chairs read"
  on public.shop_chairs for select to authenticated
  using (
    (select private.has_shop_operator_access(
      shop_id,
      location_id,
      array['owner', 'manager', 'front_desk']::text[]
    ))
  );

create policy "pr25 owner clientbridge aggregate read"
  on public.owner_clientbridge_daily_aggregates for select to authenticated
  using (
    (select private.has_shop_operator_access(
      shop_id,
      location_id,
      array['owner', 'manager']::text[]
    ))
  );

-- --------------------------------------------------------------------------
-- 3. Kiosk policy surface and immediate emergency disable.
-- --------------------------------------------------------------------------

alter table public.kiosk_settings
  add column if not exists privacy_mode boolean not null default true,
  add column if not exists auto_reset_enabled boolean not null default true,
  add column if not exists external_checkin_enabled boolean not null default false,
  add column if not exists guest_checkin_allowed boolean not null default true,
  add column if not exists clientbridge_prompt_enabled boolean not null default true,
  add column if not exists clientbridge_prompt_frequency text not null default 'once_per_visit',
  add column if not exists qr_entry_enabled boolean not null default true,
  add column if not exists nfc_entry_enabled boolean not null default false,
  add column if not exists notification_failure_escalation boolean not null default true;

alter table public.kiosk_settings
  drop constraint if exists kiosk_settings_clientbridge_frequency_ck;
alter table public.kiosk_settings
  add constraint kiosk_settings_clientbridge_frequency_ck
    check (clientbridge_prompt_frequency in ('once_per_visit', 'once_per_30_days', 'never'));

alter table public.audit_logs
  add column if not exists shop_id text references public.shops(id) on delete set null,
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists previous_state jsonb,
  add column if not exists next_state jsonb,
  add column if not exists reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists audit_logs_shop_created_idx
  on public.audit_logs (shop_id, created_at desc)
  where shop_id is not null;
create index if not exists audit_logs_location_created_idx
  on public.audit_logs (location_id, created_at desc)
  where location_id is not null;

drop policy if exists "audit logs owner only" on public.audit_logs;
drop policy if exists "pr25 shop audit read" on public.audit_logs;
create policy "pr25 shop audit read"
  on public.audit_logs for select to authenticated
  using (
    shop_id is not null
    and (select private.has_shop_operator_access(
      shop_id,
      location_id,
      array['owner', 'manager']::text[]
    ))
  );

create or replace function private.pr25_kiosk_emergency_disable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_shop_id text;
  resolved_location_id uuid;
begin
  if new.scope <> 'shop' then
    return new;
  end if;

  if new.emergency_disabled_at is distinct from old.emergency_disabled_at
     or new.enabled is distinct from old.enabled then
    select s.id, l.id
    into resolved_shop_id, resolved_location_id
    from public.shops s
    join public.locations l on l.reference_code = s.id
    where lower(new.target_reference) in (
      lower(s.id),
      lower(l.id::text),
      lower(coalesce(s.public_username, s.id))
    )
    limit 1;

    if new.emergency_disabled_at is not null or not new.enabled then
      new.health_status := 'disabled';
      update public.kiosk_sessions
      set status = 'revoked',
          revoked_at = coalesce(new.emergency_disabled_at, now()),
          completed_at = coalesce(completed_at, coalesce(new.emergency_disabled_at, now()))
      where kiosk_setting_id = new.id
        and status = 'active';
    end if;

    insert into public.audit_logs (
      actor_profile_id,
      action,
      target,
      severity,
      shop_id,
      location_id,
      target_type,
      target_id,
      previous_state,
      next_state,
      reason
    )
    values (
      coalesce(new.emergency_disabled_by, new.owner_profile_id),
      case
        when new.emergency_disabled_at is not null or not new.enabled
          then 'kiosk_emergency_disabled'
        else 'kiosk_reenabled'
      end,
      new.target_reference,
      case
        when new.emergency_disabled_at is not null or not new.enabled
          then 'warning'
        else 'info'
      end,
      resolved_shop_id,
      resolved_location_id,
      'kiosk_settings',
      new.id::text,
      jsonb_build_object(
        'enabled', old.enabled,
        'healthStatus', old.health_status,
        'emergencyDisabledAt', old.emergency_disabled_at
      ),
      jsonb_build_object(
        'enabled', new.enabled,
        'healthStatus', new.health_status,
        'emergencyDisabledAt', new.emergency_disabled_at
      ),
      case
        when new.emergency_disabled_at is not null or not new.enabled
          then 'Owner emergency-disabled kiosk intake.'
        else 'Owner restored kiosk intake.'
      end
    );
  end if;
  return new;
end;
$$;

revoke all on function private.pr25_kiosk_emergency_disable()
  from public, anon, authenticated, service_role;

drop trigger if exists pr25_kiosk_emergency_disable on public.kiosk_settings;
create trigger pr25_kiosk_emergency_disable
  before update of enabled, emergency_disabled_at on public.kiosk_settings
  for each row execute function private.pr25_kiosk_emergency_disable();

-- --------------------------------------------------------------------------
-- 4. Settle-first relationship and chair retirement enforcement.
-- --------------------------------------------------------------------------

create or replace function private.pr25_settle_first_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('active', 'suspended')
     and new.status = 'ended'
     and exists (
       select 1
       from public.booth_rent_charges c
       where c.relationship_id = new.id
         and c.status not in ('paid', 'waived', 'canceled')
         and c.amount_paid_cents < c.amount_cents
     )
  then
    raise exception using
      errcode = '23514',
      message = 'Open booth rent must be settled, waived, or resolved before ending this relationship.';
  end if;
  return new;
end;
$$;

revoke all on function private.pr25_settle_first_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists pr25_settle_first_guard on public.shop_barber_relationships;
create trigger pr25_settle_first_guard
  before update of status, ended_at on public.shop_barber_relationships
  for each row execute function private.pr25_settle_first_guard();

create or replace function private.pr25_chair_retirement_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active and not new.active and old.assigned_barber_id is not null
     and exists (
       select 1
       from public.shop_barber_relationships r
       join public.booth_rent_charges c on c.relationship_id = r.id
       where r.shop_id = old.shop_id
         and r.location_id = old.location_id
         and r.barber_id = old.assigned_barber_id
         and r.status in ('active', 'suspended')
         and r.ended_at is null
         and c.status not in ('paid', 'waived', 'canceled')
         and c.amount_paid_cents < c.amount_cents
     )
  then
    raise exception using
      errcode = '23514',
      message = 'Open booth rent must be settled before retiring this assigned chair.';
  end if;
  if old.active and not new.active then
    new.retired_at := coalesce(new.retired_at, now());
  elsif not old.active and new.active then
    new.retired_at := null;
    new.retired_by_profile_id := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.pr25_chair_retirement_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists pr25_chair_retirement_guard on public.shop_chairs;
create trigger pr25_chair_retirement_guard
  before update of active on public.shop_chairs
  for each row execute function private.pr25_chair_retirement_guard();

-- --------------------------------------------------------------------------
-- 5. Queue reassignment audit semantics and two-barber notification.
-- --------------------------------------------------------------------------

create or replace function private.pr25_queue_reassignment_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.barber_id is not null
     and new.barber_id is not null
     and old.barber_id is distinct from new.barber_id then
    update public.queue_mutation_audit
    set action = 'reassignment'
    where id = (
      select a.id
      from public.queue_mutation_audit a
      where a.waitlist_entry_id = new.id
        and a.previous_barber_id = old.barber_id
        and a.new_barber_id = new.barber_id
      order by a.occurred_at desc
      limit 1
    );

    insert into public.notifications (
      profile_id,
      channel,
      title,
      body,
      status,
      scheduled_for
    )
    select
      b.profile_id,
      'in_app',
      'Cash walk-in reassigned',
      case
        when b.id = old.barber_id
          then 'A cash walk-in was reassigned from your chair. Reason: ' || trim(new.last_mutation_reason)
        else 'A cash walk-in was reassigned to your chair. Reason: ' || trim(new.last_mutation_reason)
      end,
      'scheduled',
      now()
    from public.barbers b
    where b.id in (old.barber_id, new.barber_id)
      and b.profile_id is not null;
  end if;
  return new;
end;
$$;

revoke all on function private.pr25_queue_reassignment_notice()
  from public, anon, authenticated, service_role;

drop trigger if exists pr25_queue_reassignment_notice on public.waitlist_entries;
create trigger pr25_queue_reassignment_notice
  after update of barber_id on public.waitlist_entries
  for each row execute function private.pr25_queue_reassignment_notice();

-- Safe direct-query projection. It intentionally excludes client contact,
-- notes, payment amounts, tips, and external-provider financial fields.
create or replace view public.owner_floor_queue
with (security_invoker = true, security_barrier = true)
as
select
  w.id,
  l.reference_code as shop_id,
  w.location_id,
  w.service_id,
  w.barber_id,
  w.barber_preference,
  w.entry_type,
  w.source_provider,
  w.payment_owner,
  w.assignment_locked,
  w.canonical_position,
  w.estimated_wait_minutes,
  w.public_queue_state,
  w.status,
  w.created_at,
  w.called_at,
  w.assigned_at,
  w.updated_at
from public.waitlist_entries w
join public.locations l on l.id = w.location_id;

revoke all on public.owner_floor_queue from public, anon, authenticated;
grant select on public.owner_floor_queue to authenticated, service_role;

comment on view public.owner_floor_queue is
  'PR25 owner-safe floor projection. No payment amount, tip, private note, contact value, or external financial field is exposed.';

notify pgrst, 'reload schema';

commit;
