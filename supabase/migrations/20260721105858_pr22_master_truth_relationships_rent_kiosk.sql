-- PR22 — Updated BVRB3R Master Truth
-- Account identity is limited to client_user, barber_user, and
-- shop_owner_user. Commission and booth rent are bilateral business
-- relationships, never account roles. Commission is calculated from service
-- money after the platform fee; tips stay with the barber. Booth rent is a
-- separate capped obligation and never an implicit appointment split.

create schema if not exists private;

-- Supersede the earlier zero-commission draft without deleting its historical
-- rows. Commission is a supported bilateral relationship, never an account
-- role or an implicit default.
alter table public.barbers
  drop constraint if exists barbers_no_new_commission_ck,
  drop constraint if exists barbers_compensation_model_check,
  drop constraint if exists barbers_default_money_relationship_ck;
alter table public.barbers
  add column if not exists default_money_relationship text not null default 'freelance',
  alter column compensation_model set default 'freelance';
alter table public.barbers
  add constraint barbers_compensation_model_check
    check (compensation_model in ('freelance', 'booth_rent', 'commission')),
  add constraint barbers_default_money_relationship_ck
    check (default_money_relationship in ('freelance', 'booth_rent', 'commission'));
update public.barbers
set default_money_relationship = 'freelance'
where default_money_relationship is distinct from 'freelance';

alter table public.staff_locations
  drop constraint if exists staff_locations_no_active_commission_ck;
alter table public.shop_team_invites
  drop constraint if exists shop_team_invites_no_open_commission_ck;
alter table public.compensation_snapshots
  drop constraint if exists compensation_snapshots_no_new_commission_ck;
alter table public.payment_routing_records
  drop constraint if exists payment_routing_records_no_new_commission_ck;

-- Repair the pre-existing Mission 2 trigger's PL/pgSQL name collision. The
-- unqualified variable and disputes column otherwise make every real routing
-- insert fail before the new ledger trigger can run.
do $repair_payment_routing_release_invariants$
declare
  function_definition text;
begin
  select pg_get_functiondef('private.enforce_payment_routing_release_invariants()'::regprocedure)
  into function_definition;

  if function_definition like '%appointment_reference text;%' then
    function_definition := replace(function_definition,
      'appointment_reference text;', 'appointment_reference_value text;');
    function_definition := replace(function_definition,
      'into appointment_status, appointment_reference', 'into appointment_status, appointment_reference_value');
    function_definition := replace(function_definition,
      'if appointment_reference is not null then', 'if appointment_reference_value is not null then');
    function_definition := replace(function_definition,
      'in (appointment_reference, new.appointment_id::text)', 'in (appointment_reference_value, new.appointment_id::text)');
    execute function_definition;
  end if;
end;
$repair_payment_routing_release_invariants$;

create table if not exists public.shop_barber_relationships (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  staff_location_id uuid references public.staff_locations(id) on delete set null,
  relationship_type text not null,
  status text not null default 'invited',
  invited_by_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_owner_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_owner_at timestamptz,
  approved_by_barber_profile_id uuid references public.profiles(id) on delete set null,
  approved_by_barber_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  invitation_message text,
  terms_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_barber_relationships_type_ck
    check (relationship_type in ('booth_rent', 'commission')),
  constraint shop_barber_relationships_status_ck
    check (status in ('invited', 'active', 'declined', 'ended', 'suspended')),
  constraint shop_barber_relationships_owner_acceptance_ck check (
    (approved_by_owner_at is null and approved_by_owner_profile_id is null)
    or (approved_by_owner_at is not null and approved_by_owner_profile_id is not null)
  ),
  constraint shop_barber_relationships_barber_acceptance_ck check (
    (approved_by_barber_at is null and approved_by_barber_profile_id is null)
    or (approved_by_barber_at is not null and approved_by_barber_profile_id is not null)
  ),
  constraint shop_barber_relationships_active_acceptance_ck check (
    status <> 'active'
    or (
      approved_by_owner_at is not null
      and approved_by_barber_at is not null
      and started_at is not null
      and ended_at is null
    )
  ),
  constraint shop_barber_relationships_end_ck check (
    ended_at is null or started_at is null or ended_at >= started_at
  )
);

create unique index if not exists shop_barber_relationships_one_current_idx
  on public.shop_barber_relationships (shop_id, location_id, barber_id)
  where status in ('invited', 'active', 'suspended') and ended_at is null;
create index if not exists shop_barber_relationships_shop_status_idx
  on public.shop_barber_relationships (shop_id, status, updated_at desc);
create index if not exists shop_barber_relationships_location_status_idx
  on public.shop_barber_relationships (location_id, status, updated_at desc);
create index if not exists shop_barber_relationships_barber_status_idx
  on public.shop_barber_relationships (barber_id, status, updated_at desc);
create index if not exists shop_barber_relationships_staff_location_idx
  on public.shop_barber_relationships (staff_location_id) where staff_location_id is not null;
create index if not exists shop_barber_relationships_inviter_idx
  on public.shop_barber_relationships (invited_by_profile_id) where invited_by_profile_id is not null;
create index if not exists shop_barber_relationships_owner_approver_idx
  on public.shop_barber_relationships (approved_by_owner_profile_id) where approved_by_owner_profile_id is not null;
create index if not exists shop_barber_relationships_barber_approver_idx
  on public.shop_barber_relationships (approved_by_barber_profile_id) where approved_by_barber_profile_id is not null;

create table if not exists public.compensation_rules (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.shop_barber_relationships(id) on delete restrict,
  shop_id text not null references public.shops(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  version integer not null,
  model text not null,
  barber_percent numeric(5,2),
  shop_percent numeric(5,2),
  booth_rent_amount_cents integer,
  booth_rent_frequency text,
  max_shop_charge_cents integer,
  variable_commission_enabled boolean not null default false,
  variable_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compensation_rules_version_ck check (version > 0),
  constraint compensation_rules_model_ck check (model in ('booth_rent', 'commission')),
  constraint compensation_rules_frequency_ck check (
    booth_rent_frequency is null or booth_rent_frequency in ('daily', 'weekly', 'monthly')
  ),
  constraint compensation_rules_dates_ck check (ends_at is null or ends_at > starts_at),
  constraint compensation_rules_model_values_ck check (
    (
      model = 'commission'
      and barber_percent between 0 and 100
      and shop_percent between 0 and 100
      and barber_percent + shop_percent = 100
      and booth_rent_amount_cents is null
      and booth_rent_frequency is null
      and max_shop_charge_cents is null
    )
    or
    (
      model = 'booth_rent'
      and barber_percent is null
      and shop_percent is null
      and booth_rent_amount_cents > 0
      and booth_rent_frequency is not null
      and max_shop_charge_cents >= booth_rent_amount_cents
      and not variable_commission_enabled
    )
  ),
  unique (relationship_id, version)
);

create unique index if not exists compensation_rules_one_active_idx
  on public.compensation_rules (relationship_id)
  where is_active and ends_at is null;
create index if not exists compensation_rules_shop_active_idx
  on public.compensation_rules (shop_id, is_active, starts_at desc);
create index if not exists compensation_rules_location_active_idx
  on public.compensation_rules (location_id, is_active, starts_at desc);
create index if not exists compensation_rules_barber_active_idx
  on public.compensation_rules (barber_id, is_active, starts_at desc);
create index if not exists compensation_rules_creator_idx
  on public.compensation_rules (created_by_profile_id) where created_by_profile_id is not null;

create table if not exists public.booth_rent_charges (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  relationship_id uuid not null references public.shop_barber_relationships(id) on delete restrict,
  compensation_rule_id uuid not null references public.compensation_rules(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  due_at timestamptz not null,
  amount_cents integer not null,
  max_charge_cents integer not null,
  amount_paid_cents integer not null default 0,
  status text not null default 'upcoming',
  payment_id uuid references public.payments(id) on delete set null,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  idempotency_key text not null unique,
  failure_reason text,
  waiver_reason text,
  charged_at timestamptz,
  paid_at timestamptz,
  waived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booth_rent_charges_period_ck check (period_end >= period_start),
  constraint booth_rent_charges_amount_ck check (
    amount_cents > 0
    and max_charge_cents >= amount_cents
    and amount_paid_cents between 0 and max_charge_cents
  ),
  constraint booth_rent_charges_status_ck check (
    status in ('upcoming', 'pending', 'due', 'late', 'paid', 'failed', 'waived', 'partially_paid', 'canceled', 'disputed')
  ),
  constraint booth_rent_charges_paid_ck check (
    status <> 'paid' or (amount_paid_cents = amount_cents and paid_at is not null)
  ),
  constraint booth_rent_charges_waived_ck check (
    status <> 'waived' or (length(trim(waiver_reason)) >= 3 and waived_at is not null)
  ),
  unique (compensation_rule_id, period_start, period_end)
);

create index if not exists booth_rent_charges_shop_status_idx
  on public.booth_rent_charges (shop_id, status, due_at);
create index if not exists booth_rent_charges_location_status_idx
  on public.booth_rent_charges (location_id, status, due_at);
create index if not exists booth_rent_charges_barber_status_idx
  on public.booth_rent_charges (barber_id, status, due_at);
create index if not exists booth_rent_charges_relationship_idx
  on public.booth_rent_charges (relationship_id, period_start desc);
create index if not exists booth_rent_charges_payment_idx
  on public.booth_rent_charges (payment_id) where payment_id is not null;

alter table public.appointments
  add column if not exists shop_barber_relationship_id uuid references public.shop_barber_relationships(id) on delete set null,
  add column if not exists compensation_rule_id uuid references public.compensation_rules(id) on delete set null,
  add column if not exists relationship_type_snapshot text,
  add column if not exists barber_percent_snapshot numeric(5,2),
  add column if not exists shop_percent_snapshot numeric(5,2),
  add column if not exists booth_rent_amount_cents_snapshot integer;

alter table public.appointments
  drop constraint if exists appointments_relationship_type_snapshot_ck;
alter table public.appointments
  add constraint appointments_relationship_type_snapshot_ck
  check (relationship_type_snapshot is null or relationship_type_snapshot in ('freelance', 'booth_rent', 'commission')) not valid;

create index if not exists appointments_shop_barber_relationship_idx
  on public.appointments (shop_barber_relationship_id) where shop_barber_relationship_id is not null;
create index if not exists appointments_compensation_rule_idx
  on public.appointments (compensation_rule_id) where compensation_rule_id is not null;

alter table public.payment_routing_records
  add column if not exists shop_barber_relationship_id uuid references public.shop_barber_relationships(id) on delete set null,
  add column if not exists compensation_rule_id uuid references public.compensation_rules(id) on delete set null,
  add column if not exists service_amount numeric(10,2) not null default 0,
  add column if not exists tip_amount numeric(10,2) not null default 0,
  add column if not exists barber_percent_snapshot numeric(5,2),
  add column if not exists shop_percent_snapshot numeric(5,2);

alter table public.payment_routing_records
  drop constraint if exists payment_routing_service_amount_ck,
  drop constraint if exists payment_routing_tip_amount_ck,
  drop constraint if exists payment_routing_commission_snapshot_ck;

alter table public.payment_routing_records
  add constraint payment_routing_service_amount_ck check (service_amount >= 0),
  add constraint payment_routing_tip_amount_ck check (tip_amount >= 0),
  add constraint payment_routing_commission_snapshot_ck check (
    routing_model <> 'commission'
    or (
      shop_barber_relationship_id is not null
      and compensation_rule_id is not null
      and barber_percent_snapshot between 0 and 100
      and shop_percent_snapshot between 0 and 100
      and barber_percent_snapshot + shop_percent_snapshot = 100
    )
  ) not valid;

create index if not exists payment_routing_relationship_idx
  on public.payment_routing_records (shop_barber_relationship_id) where shop_barber_relationship_id is not null;
create index if not exists payment_routing_compensation_rule_idx
  on public.payment_routing_records (compensation_rule_id) where compensation_rule_id is not null;

create table if not exists public.commission_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  relationship_id uuid not null references public.shop_barber_relationships(id) on delete restrict,
  compensation_rule_id uuid not null references public.compensation_rules(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  payment_id uuid not null references public.payments(id) on delete restrict,
  payment_routing_record_id uuid not null references public.payment_routing_records(id) on delete restrict,
  gross_service_amount numeric(10,2) not null,
  platform_fee_amount numeric(10,2) not null,
  barber_percent numeric(5,2) not null,
  shop_percent numeric(5,2) not null,
  shop_commission_amount numeric(10,2) not null,
  barber_service_amount numeric(10,2) not null,
  tip_amount numeric(10,2) not null default 0,
  status text not null default 'pending',
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  reversed_at timestamptz,
  constraint commission_ledger_amounts_ck check (
    gross_service_amount >= 0
    and platform_fee_amount >= 0
    and shop_commission_amount >= 0
    and barber_service_amount >= 0
    and tip_amount >= 0
  ),
  constraint commission_ledger_percent_ck check (
    barber_percent between 0 and 100
    and shop_percent between 0 and 100
    and barber_percent + shop_percent = 100
  ),
  constraint commission_ledger_status_ck check (
    status in ('pending', 'calculated', 'settled', 'reversed', 'disputed')
  ),
  unique (payment_routing_record_id)
);

create index if not exists commission_ledger_shop_status_idx
  on public.commission_ledger (shop_id, status, created_at desc);
create index if not exists commission_ledger_location_status_idx
  on public.commission_ledger (location_id, status, created_at desc);
create index if not exists commission_ledger_barber_status_idx
  on public.commission_ledger (barber_id, status, created_at desc);
create index if not exists commission_ledger_relationship_idx
  on public.commission_ledger (relationship_id, created_at desc);
create index if not exists commission_ledger_rule_idx
  on public.commission_ledger (compensation_rule_id, created_at desc);
create index if not exists commission_ledger_appointment_idx
  on public.commission_ledger (appointment_id) where appointment_id is not null;
create index if not exists commission_ledger_payment_idx
  on public.commission_ledger (payment_id);

alter table public.kiosk_settings
  add column if not exists pairing_code_hash text,
  add column if not exists pairing_code_expires_at timestamptz,
  add column if not exists paired_at timestamptz,
  add column if not exists rotation_policy text not null default 'balanced',
  add column if not exists balance_guardrail_minutes integer not null default 20,
  add column if not exists payment_collection_policy text not null default 'barber_checkout',
  add column if not exists session_timeout_seconds integer not null default 75,
  add column if not exists emergency_disabled_at timestamptz,
  add column if not exists emergency_disabled_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_health_check_at timestamptz,
  add column if not exists health_status text not null default 'unpaired';

alter table public.kiosk_settings
  drop constraint if exists kiosk_settings_rotation_policy_ck,
  drop constraint if exists kiosk_settings_balance_guardrail_ck,
  drop constraint if exists kiosk_settings_payment_collection_policy_ck,
  drop constraint if exists kiosk_settings_payment_collection_policy_check,
  drop constraint if exists kiosk_settings_timeout_ck,
  drop constraint if exists kiosk_settings_pairing_hash_ck,
  drop constraint if exists kiosk_settings_health_status_ck;

update public.kiosk_settings
set payment_collection_policy = case payment_collection_policy
  when 'prepay_at_kiosk' then 'prepay'
  else 'barber_checkout'
end
where payment_collection_policy not in ('barber_checkout', 'prepay');

alter table public.kiosk_settings
  alter column payment_collection_policy set default 'barber_checkout';

-- A prior PR22 draft may already have the 12-gate activation trigger. Keep
-- that safety gate, but translate it to the updated policy names and accept
-- only aliases that resolve to the same canonical shop/location.
do $kiosk_activation_compatibility$
begin
  if to_regprocedure('private.enforce_shop_kiosk_activation_gate()') is not null
     and to_regclass('public.shop_setup_states') is not null then
    execute $function_definition$
      create or replace function private.enforce_shop_kiosk_activation_gate()
      returns trigger
      language plpgsql
      set search_path = ''
      as $function_body$
      begin
        if new.scope = 'shop' and new.enabled then
          if new.emergency_disabled_at is not null then
            raise exception using errcode = '23514', message = 'An emergency-disabled kiosk cannot accept new bookings.';
          end if;
          if not exists (
            select 1
            from public.locations l
            join public.shops s on s.id = l.reference_code
            join public.shop_setup_states setup on setup.location_id = l.id
            where lower(new.target_reference) in (
              lower(s.id),
              lower(l.id::text),
              lower(coalesce(s.public_username, s.id))
            )
              and setup.operational = true
          ) then
            raise exception using errcode = '23514', message = 'Kiosk activation requires all 12 shop setup gates or approved exceptions.';
          end if;
        end if;
        new.require_payment_before_booking := new.payment_collection_policy = 'prepay';
        return new;
      end;
      $function_body$;
    $function_definition$;
  end if;
end;
$kiosk_activation_compatibility$;

alter table public.kiosk_settings
  drop constraint if exists kiosk_settings_rotation_policy_ck,
  drop constraint if exists kiosk_settings_balance_guardrail_ck,
  drop constraint if exists kiosk_settings_payment_collection_policy_ck,
  drop constraint if exists kiosk_settings_timeout_ck,
  drop constraint if exists kiosk_settings_pairing_hash_ck,
  drop constraint if exists kiosk_settings_health_status_ck;

alter table public.kiosk_settings
  add constraint kiosk_settings_rotation_policy_ck
    check (rotation_policy in ('strict', 'balanced', 'fastest_available')),
  add constraint kiosk_settings_balance_guardrail_ck
    check (balance_guardrail_minutes between 0 and 180),
  add constraint kiosk_settings_payment_collection_policy_ck
    check (payment_collection_policy in ('barber_checkout', 'prepay')),
  add constraint kiosk_settings_timeout_ck
    check (session_timeout_seconds between 60 and 90),
  add constraint kiosk_settings_pairing_hash_ck
    check (pairing_code_hash is null or pairing_code_hash ~ '^[0-9a-f]{64}$'),
  add constraint kiosk_settings_health_status_ck
    check (health_status in ('unpaired', 'healthy', 'degraded', 'offline', 'disabled'));

create index if not exists kiosk_settings_emergency_disabled_by_idx
  on public.kiosk_settings (emergency_disabled_by) where emergency_disabled_by is not null;

create table if not exists public.kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  kiosk_setting_id uuid not null references public.kiosk_settings(id) on delete cascade,
  shop_id text references public.shops(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  barber_id uuid references public.barbers(id) on delete cascade,
  session_token_hash text not null unique,
  mode text not null,
  status text not null default 'active',
  device_label text,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint kiosk_sessions_token_hash_ck check (session_token_hash ~ '^[0-9a-f]{64}$'),
  constraint kiosk_sessions_mode_ck check (mode in ('shop_owner', 'barber')),
  constraint kiosk_sessions_status_ck check (status in ('active', 'completed', 'expired', 'revoked')),
  constraint kiosk_sessions_scope_ck check (
    (mode = 'shop_owner' and shop_id is not null and location_id is not null)
    or (mode = 'barber' and barber_id is not null)
  ),
  constraint kiosk_sessions_expiry_ck check (expires_at > started_at)
);

create index if not exists kiosk_sessions_setting_status_idx
  on public.kiosk_sessions (kiosk_setting_id, status, expires_at);
create index if not exists kiosk_sessions_shop_status_idx
  on public.kiosk_sessions (shop_id, status, expires_at) where shop_id is not null;
create index if not exists kiosk_sessions_location_status_idx
  on public.kiosk_sessions (location_id, status, expires_at) where location_id is not null;
create index if not exists kiosk_sessions_barber_status_idx
  on public.kiosk_sessions (barber_id, status, expires_at) where barber_id is not null;

create table if not exists public.shop_walkin_rotation (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  relationship_id uuid not null references public.shop_barber_relationships(id) on delete restrict,
  position integer not null,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  last_assigned_at timestamptz,
  paused_at timestamptz,
  left_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint shop_walkin_rotation_position_ck check (position > 0),
  constraint shop_walkin_rotation_status_ck check (status in ('active', 'paused', 'left', 'offline')),
  unique (shop_id, location_id, barber_id)
);

create unique index if not exists shop_walkin_rotation_active_position_idx
  on public.shop_walkin_rotation (shop_id, location_id, position)
  where status = 'active';
create index if not exists shop_walkin_rotation_next_idx
  on public.shop_walkin_rotation (shop_id, location_id, status, position, last_assigned_at);
create index if not exists shop_walkin_rotation_barber_idx
  on public.shop_walkin_rotation (barber_id, status, updated_at desc);
create index if not exists shop_walkin_rotation_location_idx
  on public.shop_walkin_rotation (location_id);
create index if not exists shop_walkin_rotation_relationship_idx
  on public.shop_walkin_rotation (relationship_id);

create table if not exists public.kiosk_rotation_assignments (
  id uuid primary key default gen_random_uuid(),
  kiosk_session_id uuid not null references public.kiosk_sessions(id) on delete restrict,
  shop_id text not null references public.shops(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  rotation_entry_id uuid references public.shop_walkin_rotation(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  waitlist_entry_id uuid references public.waitlist_entries(id) on delete set null,
  routing_type text not null,
  status text not null default 'reserved',
  estimated_wait_minutes integer not null default 0,
  idempotency_key text not null unique,
  reserved_at timestamptz not null default now(),
  confirmed_at timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint kiosk_rotation_assignments_type_ck check (
    routing_type in ('next_available_rotation', 'picked_barber', 'direct_barber')
  ),
  constraint kiosk_rotation_assignments_status_ck check (
    status in ('reserved', 'confirmed', 'canceled', 'expired')
  ),
  constraint kiosk_rotation_assignments_wait_ck check (estimated_wait_minutes >= 0)
);

create index if not exists kiosk_rotation_assignments_session_idx
  on public.kiosk_rotation_assignments (kiosk_session_id, status, reserved_at desc);
create index if not exists kiosk_rotation_assignments_shop_idx
  on public.kiosk_rotation_assignments (shop_id, status, reserved_at desc);
create index if not exists kiosk_rotation_assignments_location_idx
  on public.kiosk_rotation_assignments (location_id, status, reserved_at desc);
create index if not exists kiosk_rotation_assignments_barber_idx
  on public.kiosk_rotation_assignments (barber_id, status, reserved_at desc);
create index if not exists kiosk_rotation_assignments_rotation_idx
  on public.kiosk_rotation_assignments (rotation_entry_id) where rotation_entry_id is not null;
create index if not exists kiosk_rotation_assignments_appointment_idx
  on public.kiosk_rotation_assignments (appointment_id) where appointment_id is not null;
create index if not exists kiosk_rotation_assignments_waitlist_idx
  on public.kiosk_rotation_assignments (waitlist_entry_id) where waitlist_entry_id is not null;

alter table public.waitlist_entries
  add column if not exists public_token_hash text,
  add column if not exists public_queue_state text not null default 'waiting',
  add column if not exists estimated_wait_minutes integer,
  add column if not exists ready_grace_expires_at timestamptz,
  add column if not exists reassigned_barber_id uuid references public.barbers(id) on delete set null,
  add column if not exists reassigned_price numeric(10,2),
  add column if not exists activation_offered boolean not null default false;

alter table public.waitlist_entries
  drop constraint if exists waitlist_entries_public_token_hash_ck,
  drop constraint if exists waitlist_entries_public_queue_state_ck,
  drop constraint if exists waitlist_entries_estimated_wait_ck,
  drop constraint if exists waitlist_entries_reassigned_price_ck;

alter table public.waitlist_entries
  add constraint waitlist_entries_public_token_hash_ck
    check (public_token_hash is null or public_token_hash ~ '^[0-9a-f]{64}$'),
  add constraint waitlist_entries_public_queue_state_ck
    check (public_queue_state in ('waiting', 'almost_ready', 'ready', 'delayed', 'reassigned', 'missed', 'canceled', 'done')),
  add constraint waitlist_entries_estimated_wait_ck
    check (estimated_wait_minutes is null or estimated_wait_minutes >= 0),
  add constraint waitlist_entries_reassigned_price_ck
    check (reassigned_price is null or reassigned_price >= 0);

create unique index if not exists waitlist_entries_public_token_hash_idx
  on public.waitlist_entries (public_token_hash) where public_token_hash is not null;
create index if not exists waitlist_entries_public_queue_state_idx
  on public.waitlist_entries (public_queue_state, updated_at desc);
create index if not exists waitlist_entries_reassigned_barber_idx
  on public.waitlist_entries (reassigned_barber_id) where reassigned_barber_id is not null;

alter table public.shop_barber_relationships enable row level security;
alter table public.compensation_rules enable row level security;
alter table public.booth_rent_charges enable row level security;
alter table public.commission_ledger enable row level security;
alter table public.kiosk_sessions enable row level security;
alter table public.shop_walkin_rotation enable row level security;
alter table public.kiosk_rotation_assignments enable row level security;

revoke all on table public.shop_barber_relationships from public, anon, authenticated;
revoke all on table public.compensation_rules from public, anon, authenticated;
revoke all on table public.booth_rent_charges from public, anon, authenticated;
revoke all on table public.commission_ledger from public, anon, authenticated;
revoke all on table public.kiosk_sessions from public, anon, authenticated;
revoke all on table public.shop_walkin_rotation from public, anon, authenticated;
revoke all on table public.kiosk_rotation_assignments from public, anon, authenticated;

grant select, insert, update on table public.shop_barber_relationships to service_role;
grant select, insert, update on table public.compensation_rules to service_role;
grant select, insert, update on table public.booth_rent_charges to service_role;
grant select, insert, update on table public.commission_ledger to service_role;
grant select, insert, update on table public.kiosk_sessions to service_role;
grant select, insert, update on table public.shop_walkin_rotation to service_role;
grant select, insert, update on table public.kiosk_rotation_assignments to service_role;
grant select, insert, update on table public.kiosk_settings to service_role;
grant select, insert, update on table public.waitlist_entries to service_role;

create or replace function private.enforce_master_truth_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  barber_profile_id uuid;
begin
  if not exists (
    select 1 from public.locations l
    where l.id = new.location_id and l.reference_code = new.shop_id
  ) then
    raise exception using errcode = '23514', message = 'Relationship location must belong to the selected shop.';
  end if;

  select b.profile_id into barber_profile_id from public.barbers b where b.id = new.barber_id;

  if new.approved_by_barber_profile_id is not null
     and new.approved_by_barber_profile_id is distinct from barber_profile_id then
    raise exception using errcode = '23514', message = 'Barber acceptance must come from the relationship barber.';
  end if;

  if new.approved_by_owner_profile_id is not null and not exists (
    select 1 from public.shop_operator_access soa
    where soa.profile_id = new.approved_by_owner_profile_id
      and soa.shop_id = new.shop_id
      and soa.access_level = 'owner'
      and soa.status = 'active'
      and soa.revoked_at is null
  ) then
    raise exception using errcode = '23514', message = 'Owner acceptance requires active owner authority for this shop.';
  end if;

  if new.staff_location_id is not null and not exists (
    select 1 from public.staff_locations sl
    join public.barbers b on b.profile_id = sl.profile_id
    where sl.id = new.staff_location_id
      and sl.location_id = new.location_id
      and b.id = new.barber_id
  ) then
    raise exception using errcode = '23514', message = 'Relationship membership must match the barber and location.';
  end if;

  if tg_op = 'UPDATE' and old.status in ('active', 'ended') and (
    new.shop_id is distinct from old.shop_id
    or new.location_id is distinct from old.location_id
    or new.barber_id is distinct from old.barber_id
    or new.relationship_type is distinct from old.relationship_type
    or new.approved_by_owner_at is distinct from old.approved_by_owner_at
    or new.approved_by_barber_at is distinct from old.approved_by_barber_at
    or new.started_at is distinct from old.started_at
    or new.terms_snapshot is distinct from old.terms_snapshot
  ) then
    raise exception using errcode = '23514', message = 'Accepted relationship terms are immutable; end the relationship and create a new one.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_master_truth_relationship() from public, anon, authenticated;

drop trigger if exists master_truth_relationship_guard on public.shop_barber_relationships;
create trigger master_truth_relationship_guard
before insert or update on public.shop_barber_relationships
for each row execute function private.enforce_master_truth_relationship();

create or replace function private.enforce_master_truth_compensation_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  relationship_row public.shop_barber_relationships%rowtype;
  expected_version integer;
begin
  select * into relationship_row
  from public.shop_barber_relationships where id = new.relationship_id;

  if relationship_row.id is null
     or new.shop_id is distinct from relationship_row.shop_id
     or new.location_id is distinct from relationship_row.location_id
     or new.barber_id is distinct from relationship_row.barber_id
     or new.model is distinct from relationship_row.relationship_type then
    raise exception using errcode = '23514', message = 'Compensation rule must match its shop-barber relationship.';
  end if;

  if new.is_active and relationship_row.status <> 'active' then
    raise exception using errcode = '23514', message = 'Compensation cannot activate before bilateral relationship acceptance.';
  end if;

  if tg_op = 'INSERT' then
    select coalesce(max(r.version), 0) + 1 into expected_version
    from public.compensation_rules r where r.relationship_id = new.relationship_id;
    if new.version <> expected_version then
      raise exception using errcode = '23514', message = 'Compensation rule versions must be sequential.';
    end if;
  elsif old.is_active or old.ends_at is not null then
    if new.relationship_id is distinct from old.relationship_id
       or new.shop_id is distinct from old.shop_id
       or new.location_id is distinct from old.location_id
       or new.barber_id is distinct from old.barber_id
       or new.version is distinct from old.version
       or new.model is distinct from old.model
       or new.barber_percent is distinct from old.barber_percent
       or new.shop_percent is distinct from old.shop_percent
       or new.booth_rent_amount_cents is distinct from old.booth_rent_amount_cents
       or new.booth_rent_frequency is distinct from old.booth_rent_frequency
       or new.max_shop_charge_cents is distinct from old.max_shop_charge_cents
       or new.variable_commission_enabled is distinct from old.variable_commission_enabled
       or new.variable_rules is distinct from old.variable_rules
       or new.starts_at is distinct from old.starts_at then
      raise exception using errcode = '23514', message = 'Active compensation facts are immutable; create the next version.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_master_truth_compensation_rule() from public, anon, authenticated;

drop trigger if exists master_truth_compensation_rule_guard on public.compensation_rules;
create trigger master_truth_compensation_rule_guard
before insert or update on public.compensation_rules
for each row execute function private.enforce_master_truth_compensation_rule();

-- The server accepts the second side of an agreement through this single
-- transaction. A membership must never become active without its bilateral
-- relationship and immutable version-1 compensation rule.
create or replace function public.activate_shop_barber_relationship_internal(
  p_invite_id uuid,
  p_actor_profile_id uuid,
  p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_row public.shop_team_invites%rowtype;
  barber_row public.barbers%rowtype;
  location_row public.locations%rowtype;
  relationship_type_value text;
  membership_id_value uuid;
  relationship_id_value uuid;
  compensation_rule_id_value uuid;
  owner_profile_id_value uuid;
  shop_id_value text;
  owner_accepted_at_value timestamptz;
  barber_accepted_at_value timestamptz;
  accepted_at_value timestamptz := now();
  barber_percent_value numeric(5,2);
  shop_percent_value numeric(5,2);
  booth_rent_cents_value integer;
begin
  if p_actor_role not in ('owner', 'barber') then
    raise exception using errcode = '22023', message = 'Agreement acceptance actor must be owner or barber.';
  end if;

  select i.* into invite_row
  from public.shop_team_invites i
  where i.id = p_invite_id
  for update;

  if invite_row.id is null or invite_row.status not in ('invited', 'requested') then
    raise exception using errcode = '23514', message = 'Only a pending shop-barber agreement can be activated.';
  end if;

  select b.* into barber_row
  from public.barbers b
  where b.id = invite_row.barber_id
  for update;

  select l.* into location_row
  from public.locations l
  where l.id = invite_row.shop_id
  for update;

  if barber_row.id is null
     or barber_row.profile_id is distinct from invite_row.barber_profile_id
     or location_row.id is null
     or location_row.reference_code is null
     or not exists (select 1 from public.shops s where s.id = location_row.reference_code) then
    raise exception using errcode = '23514', message = 'Agreement barber and shop location must resolve before activation.';
  end if;
  shop_id_value := location_row.reference_code;

  relationship_type_value := invite_row.routing_model;
  if relationship_type_value not in ('commission', 'booth_rent') then
    raise exception using errcode = '23514', message = 'A shop relationship must explicitly choose commission or booth rent.';
  end if;

  if invite_row.status = 'invited' then
    if p_actor_role <> 'barber' or p_actor_profile_id is distinct from barber_row.profile_id then
      raise exception using errcode = '42501', message = 'Only the invited barber can accept this agreement.';
    end if;
    owner_profile_id_value := invite_row.invited_by_profile_id;
    owner_accepted_at_value := coalesce(invite_row.approved_by_owner_at, invite_row.created_at);
    barber_accepted_at_value := accepted_at_value;
  else
    if p_actor_role <> 'owner' or not exists (
      select 1 from public.shop_operator_access soa
      where soa.profile_id = p_actor_profile_id
        and soa.shop_id = shop_id_value
        and soa.access_level = 'owner'
        and soa.status = 'active'
        and soa.revoked_at is null
    ) then
      raise exception using errcode = '42501', message = 'Only an active shop owner can accept this request.';
    end if;
    if invite_row.requested_by_profile_id is distinct from barber_row.profile_id then
      raise exception using errcode = '23514', message = 'The join request must be accepted by its requesting barber before owner review.';
    end if;
    owner_profile_id_value := p_actor_profile_id;
    owner_accepted_at_value := accepted_at_value;
    barber_accepted_at_value := coalesce(invite_row.approved_by_barber_at, invite_row.created_at);
  end if;

  if not exists (
    select 1 from public.shop_operator_access soa
    where soa.profile_id = owner_profile_id_value
      and soa.shop_id = shop_id_value
      and soa.access_level = 'owner'
      and soa.status = 'active'
      and soa.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'The agreement requires active owner authority.';
  end if;

  if relationship_type_value = 'commission' then
    barber_percent_value := round(invite_row.barber_percent * 100, 2);
    shop_percent_value := round(invite_row.shop_percent * 100, 2);
    if barber_percent_value is null
       or shop_percent_value is null
       or barber_percent_value + shop_percent_value <> 100 then
      raise exception using errcode = '23514', message = 'Commission agreement percentages must total 100 percent.';
    end if;
  else
    booth_rent_cents_value := round(invite_row.booth_rent_amount * 100)::integer;
    if booth_rent_cents_value is null
       or booth_rent_cents_value <= 0
       or invite_row.booth_rent_frequency not in ('daily', 'weekly', 'monthly') then
      raise exception using errcode = '23514', message = 'Booth rent requires a positive fixed amount and billing frequency.';
    end if;
  end if;

  -- Freelance is the no-shop state. Close only that compatibility membership;
  -- an existing real-shop membership blocks the new agreement.
  update public.staff_locations sl
  set relationship_status = 'ended',
      ended_at = accepted_at_value,
      ended_by_profile_id = barber_row.profile_id,
      ended_by_role = 'barber',
      ended_reason = 'Freelance membership ended when a bilateral shop agreement activated.',
      updated_at = accepted_at_value
  where sl.profile_id = barber_row.profile_id
    and coalesce(sl.relationship_status, 'active') = 'active'
    and sl.ended_at is null
    and (
      sl.shop_id is null
      or lower(sl.shop_id) like 'independent-barber-%'
      or exists (
        select 1 from public.locations independent_location
        where independent_location.id = sl.location_id
          and lower(coalesce(independent_location.reference_code, '')) like 'independent-barber-%'
      )
    );

  if exists (
    select 1 from public.staff_locations sl
    where sl.profile_id = barber_row.profile_id
      and coalesce(sl.relationship_status, 'active') = 'active'
      and sl.ended_at is null
  ) or exists (
    select 1 from public.shop_barber_relationships r
    where r.barber_id = barber_row.id
      and r.status = 'active'
      and r.ended_at is null
  ) then
    raise exception using errcode = '23505', message = 'The barber already has an active shop relationship.';
  end if;

  insert into public.staff_locations (
    profile_id, location_id, shop_id, relationship_status,
    requested_by_profile_id, invited_by_profile_id,
    approved_by_owner_at, approved_by_barber_at,
    routing_model, commission_rate,
    booth_rent_amount, booth_rent_frequency,
    barber_percent, shop_percent,
    commission_cap_amount, commission_cap_frequency,
    ended_at, ended_by_profile_id, ended_by_role, ended_reason,
    public_team_visible, public_team_order, featured_on_shop_profile,
    updated_at, fintech_updated_at
  ) values (
    barber_row.profile_id, location_row.id, shop_id_value, 'active',
    invite_row.requested_by_profile_id, invite_row.invited_by_profile_id,
    owner_accepted_at_value, barber_accepted_at_value,
    relationship_type_value,
    case when relationship_type_value = 'commission' then invite_row.barber_percent else null end,
    case when relationship_type_value = 'booth_rent' then invite_row.booth_rent_amount else null end,
    case when relationship_type_value = 'booth_rent' then invite_row.booth_rent_frequency else null end,
    case when relationship_type_value = 'commission' then invite_row.barber_percent else null end,
    case when relationship_type_value = 'commission' then invite_row.shop_percent else null end,
    null, null, null, null, null, null,
    invite_row.public_team_visible, invite_row.public_team_order, invite_row.featured_on_shop_profile,
    accepted_at_value, accepted_at_value
  )
  on conflict (profile_id, location_id) do update
  set shop_id = excluded.shop_id,
      relationship_status = excluded.relationship_status,
      requested_by_profile_id = excluded.requested_by_profile_id,
      invited_by_profile_id = excluded.invited_by_profile_id,
      approved_by_owner_at = excluded.approved_by_owner_at,
      approved_by_barber_at = excluded.approved_by_barber_at,
      routing_model = excluded.routing_model,
      commission_rate = excluded.commission_rate,
      booth_rent_amount = excluded.booth_rent_amount,
      booth_rent_frequency = excluded.booth_rent_frequency,
      barber_percent = excluded.barber_percent,
      shop_percent = excluded.shop_percent,
      commission_cap_amount = null,
      commission_cap_frequency = null,
      ended_at = null,
      ended_by_profile_id = null,
      ended_by_role = null,
      ended_reason = null,
      public_team_visible = excluded.public_team_visible,
      public_team_order = excluded.public_team_order,
      featured_on_shop_profile = excluded.featured_on_shop_profile,
      updated_at = excluded.updated_at,
      fintech_updated_at = excluded.fintech_updated_at
  returning id into membership_id_value;

  insert into public.shop_barber_relationships (
    shop_id, location_id, barber_id, staff_location_id,
    relationship_type, status, invited_by_profile_id,
    approved_by_owner_profile_id, approved_by_owner_at,
    approved_by_barber_profile_id, approved_by_barber_at,
    started_at, invitation_message, terms_snapshot, created_at, updated_at
  ) values (
    shop_id_value, location_row.id, barber_row.id, membership_id_value,
    relationship_type_value, 'active', invite_row.invited_by_profile_id,
    owner_profile_id_value, owner_accepted_at_value,
    barber_row.profile_id, barber_accepted_at_value,
    accepted_at_value, invite_row.message,
    jsonb_build_object(
      'invite_id', invite_row.id,
      'model', relationship_type_value,
      'barber_percent', barber_percent_value,
      'shop_percent', shop_percent_value,
      'booth_rent_amount_cents', booth_rent_cents_value,
      'booth_rent_frequency', invite_row.booth_rent_frequency
    ),
    accepted_at_value, accepted_at_value
  )
  returning id into relationship_id_value;

  insert into public.compensation_rules (
    relationship_id, shop_id, location_id, barber_id, version, model,
    barber_percent, shop_percent,
    booth_rent_amount_cents, booth_rent_frequency, max_shop_charge_cents,
    is_active, starts_at, created_by_profile_id, created_at, updated_at
  ) values (
    relationship_id_value, shop_id_value, location_row.id, barber_row.id, 1,
    relationship_type_value, barber_percent_value, shop_percent_value,
    booth_rent_cents_value,
    case when relationship_type_value = 'booth_rent' then invite_row.booth_rent_frequency else null end,
    booth_rent_cents_value,
    true, accepted_at_value, owner_profile_id_value, accepted_at_value, accepted_at_value
  )
  returning id into compensation_rule_id_value;

  update public.shop_team_invites i
  set status = 'active',
      responded_at = accepted_at_value,
      approved_by_owner_at = owner_accepted_at_value,
      approved_by_barber_at = barber_accepted_at_value,
      rejected_at = null,
      declined_at = null,
      updated_at = accepted_at_value
  where i.id = invite_row.id;

  return jsonb_build_object(
    'invite_id', invite_row.id,
    'staff_location_id', membership_id_value,
    'relationship_id', relationship_id_value,
    'compensation_rule_id', compensation_rule_id_value,
    'relationship_type', relationship_type_value
  );
end;
$$;

revoke all on function public.activate_shop_barber_relationship_internal(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.activate_shop_barber_relationship_internal(uuid, uuid, text)
  to service_role;

create or replace function public.end_shop_barber_relationship_internal(
  p_staff_location_id uuid,
  p_actor_profile_id uuid,
  p_actor_role text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_row public.staff_locations%rowtype;
  relationship_row public.shop_barber_relationships%rowtype;
  ended_at_value timestamptz;
  reason_value text;
begin
  if p_actor_role not in ('owner', 'barber') then
    raise exception using errcode = '22023', message = 'Relationship ending actor must be owner or barber.';
  end if;

  select sl.* into membership_row
  from public.staff_locations sl
  where sl.id = p_staff_location_id
  for update;

  if membership_row.id is null
     or coalesce(membership_row.relationship_status, 'active') <> 'active'
     or membership_row.ended_at is not null then
    raise exception using errcode = '23514', message = 'Only an active shop relationship can be ended.';
  end if;

  select r.* into relationship_row
  from public.shop_barber_relationships r
  where r.staff_location_id = membership_row.id
    and r.status = 'active'
    and r.ended_at is null
  order by r.started_at desc, r.created_at desc
  limit 1
  for update;

  if relationship_row.id is null then
    raise exception using errcode = '23514', message = 'Canonical shop relationship is missing for this active membership.';
  end if;
  ended_at_value := greatest(clock_timestamp(), relationship_row.started_at + interval '1 microsecond');

  if p_actor_role = 'barber' and p_actor_profile_id is distinct from membership_row.profile_id then
    raise exception using errcode = '42501', message = 'Only the relationship barber can leave this shop.';
  end if;
  if p_actor_role = 'owner' and not exists (
    select 1 from public.shop_operator_access soa
    where soa.profile_id = p_actor_profile_id
      and soa.shop_id = relationship_row.shop_id
      and soa.access_level = 'owner'
      and soa.status = 'active'
      and soa.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'Only an active shop owner can end this relationship.';
  end if;

  reason_value := coalesce(nullif(trim(p_reason), ''),
    case when p_actor_role = 'barber' then 'Barber left the shop.' else 'Owner released the barber.' end);

  update public.compensation_rules c
  set is_active = false,
      ends_at = ended_at_value,
      updated_at = ended_at_value
  where c.relationship_id = relationship_row.id
    and c.is_active
    and c.ends_at is null;

  update public.shop_barber_relationships r
  set status = 'ended',
      ended_at = ended_at_value,
      updated_at = ended_at_value
  where r.id = relationship_row.id;

  update public.staff_locations sl
  set relationship_status = 'ended',
      ended_at = ended_at_value,
      ended_by_profile_id = p_actor_profile_id,
      ended_by_role = p_actor_role,
      ended_reason = reason_value,
      updated_at = ended_at_value
  where sl.id = membership_row.id;

  update public.shop_team_invites i
  set status = 'ended',
      ended_at = ended_at_value,
      ended_by_profile_id = p_actor_profile_id,
      ended_by_role = p_actor_role,
      ended_reason = reason_value,
      updated_at = ended_at_value
  where i.shop_id = relationship_row.location_id
    and i.barber_profile_id = membership_row.profile_id
    and i.status = 'active';

  return jsonb_build_object(
    'staff_location_id', membership_row.id,
    'relationship_id', relationship_row.id,
    'ended_at', ended_at_value,
    'effective_routing_model', 'freelance'
  );
end;
$$;

revoke all on function public.end_shop_barber_relationship_internal(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.end_shop_barber_relationship_internal(uuid, uuid, text, text)
  to service_role;

create or replace function private.snapshot_appointment_compensation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  relationship_row public.shop_barber_relationships%rowtype;
  rule_row public.compensation_rules%rowtype;
begin
  -- Once captured, appointment money facts never follow a later agreement.
  if tg_op = 'UPDATE' then
    if new.shop_barber_relationship_id is distinct from old.shop_barber_relationship_id
       or new.compensation_rule_id is distinct from old.compensation_rule_id
       or new.relationship_type_snapshot is distinct from old.relationship_type_snapshot
       or new.barber_percent_snapshot is distinct from old.barber_percent_snapshot
       or new.shop_percent_snapshot is distinct from old.shop_percent_snapshot
       or new.booth_rent_amount_cents_snapshot is distinct from old.booth_rent_amount_cents_snapshot then
      raise exception using errcode = '23514', message = 'Appointment compensation snapshots are immutable.';
    end if;
    -- Historical rows predate this contract. Routine updates must not pretend
    -- the agreement active today was the agreement used in the past.
    return new;
  end if;

  select r.* into relationship_row
  from public.shop_barber_relationships r
  where r.location_id = new.location_id
    and r.barber_id = new.barber_id
    and r.status = 'active'
    and r.ended_at is null
  order by r.started_at desc nulls last, r.created_at desc
  limit 1;

  if relationship_row.id is null then
    new.shop_barber_relationship_id := null;
    new.compensation_rule_id := null;
    new.relationship_type_snapshot := 'freelance';
    new.barber_percent_snapshot := null;
    new.shop_percent_snapshot := null;
    new.booth_rent_amount_cents_snapshot := null;
    return new;
  end if;

  select c.* into rule_row
  from public.compensation_rules c
  where c.relationship_id = relationship_row.id
    and c.is_active
    and c.starts_at <= coalesce(new.starts_at, now())
    and (c.ends_at is null or c.ends_at > coalesce(new.starts_at, now()))
  order by c.version desc
  limit 1;

  if rule_row.id is null then
    raise exception using errcode = '23514', message = 'Shop appointment requires an active compensation rule snapshot.';
  end if;

  new.shop_barber_relationship_id := relationship_row.id;
  new.compensation_rule_id := rule_row.id;
  new.relationship_type_snapshot := relationship_row.relationship_type;
  new.barber_percent_snapshot := rule_row.barber_percent;
  new.shop_percent_snapshot := rule_row.shop_percent;
  new.booth_rent_amount_cents_snapshot := rule_row.booth_rent_amount_cents;
  return new;
end;
$$;

revoke all on function private.snapshot_appointment_compensation() from public, anon, authenticated;

drop trigger if exists appointment_compensation_snapshot_guard on public.appointments;
create trigger appointment_compensation_snapshot_guard
before insert or update on public.appointments
for each row execute function private.snapshot_appointment_compensation();

create or replace function private.enforce_booth_rent_charge_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  relationship_row public.shop_barber_relationships%rowtype;
  rule_row public.compensation_rules%rowtype;
  period_paid integer;
begin
  select * into relationship_row from public.shop_barber_relationships where id = new.relationship_id;
  select * into rule_row from public.compensation_rules where id = new.compensation_rule_id;

  if relationship_row.id is null
     or rule_row.id is null
     or relationship_row.relationship_type <> 'booth_rent'
     or rule_row.model <> 'booth_rent'
     or rule_row.relationship_id is distinct from relationship_row.id
     or new.shop_id is distinct from rule_row.shop_id
     or new.location_id is distinct from rule_row.location_id
     or new.barber_id is distinct from rule_row.barber_id
     or new.amount_cents is distinct from rule_row.booth_rent_amount_cents
     or new.max_charge_cents is distinct from rule_row.max_shop_charge_cents then
    raise exception using errcode = '23514', message = 'Booth rent charge must match the active fixed-rent rule.';
  end if;

  select coalesce(sum(c.amount_paid_cents), 0) into period_paid
  from public.booth_rent_charges c
  where c.compensation_rule_id = new.compensation_rule_id
    and c.period_start = new.period_start
    and c.period_end = new.period_end
    and c.id is distinct from new.id;

  if period_paid + new.amount_paid_cents > new.max_charge_cents then
    raise exception using errcode = '23514', message = 'Booth rent paid for the period cannot exceed the approved maximum shop charge.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_booth_rent_charge_cap() from public, anon, authenticated;

drop trigger if exists booth_rent_charge_cap_guard on public.booth_rent_charges;
create trigger booth_rent_charge_cap_guard
before insert or update on public.booth_rent_charges
for each row execute function private.enforce_booth_rent_charge_cap();

create or replace function private.sync_commission_ledger_from_routing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments%rowtype;
  relationship_row public.shop_barber_relationships%rowtype;
  rule_row public.compensation_rules%rowtype;
  expected_shop numeric;
  expected_barber_service numeric;
  ledger_status text;
begin
  if new.routing_model <> 'commission' then return new; end if;
  if new.shop_barber_relationship_id is null or new.compensation_rule_id is null then return new; end if;

  select * into payment_row from public.payments where id = new.payment_id;
  select * into relationship_row from public.shop_barber_relationships where id = new.shop_barber_relationship_id;
  select * into rule_row from public.compensation_rules where id = new.compensation_rule_id;

  if payment_row.id is null
     or relationship_row.status <> 'active'
     or relationship_row.relationship_type <> 'commission'
     or rule_row.model <> 'commission'
     or rule_row.relationship_id is distinct from relationship_row.id
     or new.barber_percent_snapshot is distinct from rule_row.barber_percent
     or new.shop_percent_snapshot is distinct from rule_row.shop_percent then
    raise exception using errcode = '23514', message = 'Commission routing requires an active bilateral relationship and matching rule snapshot.';
  end if;

  expected_shop := round(greatest(new.service_amount - new.platform_fee_amount, 0) * rule_row.shop_percent / 100, 2);
  expected_barber_service := round(greatest(new.service_amount - new.platform_fee_amount, 0) * rule_row.barber_percent / 100, 2);

  if new.shop_split_amount is distinct from expected_shop
     or new.barber_payout_amount is distinct from round(expected_barber_service + new.tip_amount, 2) then
    raise exception using errcode = '23514', message = 'Commission must split post-platform-fee service money and keep tips with the barber.';
  end if;

  ledger_status := case
    when new.money_routing_status = 'refunded' then 'reversed'
    when new.money_routing_status = 'paid_out' then 'settled'
    when new.money_routing_status = 'blocked' then 'disputed'
    when new.money_routing_status = 'ready_for_payout' then 'calculated'
    else 'pending'
  end;

  insert into public.commission_ledger (
    shop_id, location_id, barber_id, relationship_id, compensation_rule_id,
    appointment_id, payment_id, payment_routing_record_id,
    gross_service_amount, platform_fee_amount, barber_percent, shop_percent,
    shop_commission_amount, barber_service_amount, tip_amount, status,
    idempotency_key, settled_at, reversed_at
  ) values (
    relationship_row.shop_id, relationship_row.location_id, relationship_row.barber_id,
    relationship_row.id, rule_row.id, new.appointment_id, new.payment_id, new.id,
    new.service_amount, new.platform_fee_amount, rule_row.barber_percent, rule_row.shop_percent,
    expected_shop, expected_barber_service, new.tip_amount, ledger_status,
    'commission:routing:' || new.id::text,
    case when ledger_status = 'settled' then now() else null end,
    case when ledger_status = 'reversed' then now() else null end
  )
  on conflict (payment_routing_record_id) do update
  set status = excluded.status,
      settled_at = coalesce(public.commission_ledger.settled_at, excluded.settled_at),
      reversed_at = coalesce(public.commission_ledger.reversed_at, excluded.reversed_at),
      updated_at = now();

  return new;
end;
$$;

revoke all on function private.sync_commission_ledger_from_routing() from public, anon, authenticated;

drop trigger if exists commission_ledger_routing_sync on public.payment_routing_records;
create trigger commission_ledger_routing_sync
after insert or update on public.payment_routing_records
for each row execute function private.sync_commission_ledger_from_routing();

create or replace function private.enforce_kiosk_session_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  setting_row public.kiosk_settings%rowtype;
begin
  select * into setting_row from public.kiosk_settings where id = new.kiosk_setting_id;
  if setting_row.id is null or not setting_row.enabled or setting_row.emergency_disabled_at is not null then
    raise exception using errcode = '23514', message = 'Kiosk session requires an enabled, healthy kiosk setting.';
  end if;

  if new.mode = 'shop_owner' and (
    setting_row.scope <> 'shop'
    or not exists (
      select 1
      from public.locations l
      join public.shops s on s.id = l.reference_code
      where l.id = new.location_id
        and s.id = new.shop_id
        and lower(setting_row.target_reference) in (
          lower(s.id),
          lower(l.id::text),
          lower(coalesce(s.public_username, s.id))
        )
    )
  ) then
    raise exception using errcode = '23514', message = 'Shop Owner Kiosk session scope is invalid.';
  end if;

  if new.mode = 'barber' and (
    setting_row.scope <> 'barber'
    or not exists (
      select 1 from public.barbers b
      where b.id = new.barber_id
        and lower(setting_row.target_reference) in (
          lower(b.id::text),
          lower(coalesce(b.reference_code, b.id::text))
        )
    )
  ) then
    raise exception using errcode = '23514', message = 'Barber Kiosk session scope is invalid.';
  end if;

  if new.expires_at > new.started_at + make_interval(secs => setting_row.session_timeout_seconds) then
    raise exception using errcode = '23514', message = 'Kiosk session expiry exceeds the configured inactivity timeout.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_kiosk_session_scope() from public, anon, authenticated;

drop trigger if exists kiosk_session_scope_guard on public.kiosk_sessions;
create trigger kiosk_session_scope_guard
before insert or update on public.kiosk_sessions
for each row execute function private.enforce_kiosk_session_scope();

create or replace function private.enforce_rotation_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.shop_barber_relationships r
    where r.shop_id = new.shop_id
      and r.location_id = new.location_id
      and r.barber_id = new.barber_id
      and r.status = 'active'
      and r.ended_at is null
  ) then
    raise exception using errcode = '23514', message = 'Kiosk cannot assign a barber without an active shop relationship.';
  end if;

  if new.routing_type = 'next_available_rotation' and (
    new.rotation_entry_id is null
    or not exists (
      select 1 from public.shop_walkin_rotation r
      where r.id = new.rotation_entry_id
        and r.shop_id = new.shop_id
        and r.location_id = new.location_id
        and r.barber_id = new.barber_id
        and r.status = 'active'
    )
  ) then
    raise exception using errcode = '23514', message = 'Next Available requires a server-confirmed active rotation entry.';
  end if;

  if new.routing_type <> 'next_available_rotation' and new.rotation_entry_id is not null then
    raise exception using errcode = '23514', message = 'Direct barber selection must not advance rotation.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_rotation_assignment() from public, anon, authenticated;

drop trigger if exists kiosk_rotation_assignment_guard on public.kiosk_rotation_assignments;
create trigger kiosk_rotation_assignment_guard
before insert or update on public.kiosk_rotation_assignments
for each row execute function private.enforce_rotation_assignment();

create or replace function private.advance_confirmed_walkin_rotation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_position integer;
  final_position integer;
begin
  if new.routing_type <> 'next_available_rotation'
     or new.status <> 'confirmed'
     or (tg_op = 'UPDATE' and old.status = 'confirmed') then
    return new;
  end if;

  perform 1
  from public.shop_walkin_rotation r
  where r.shop_id = new.shop_id and r.location_id = new.location_id and r.status = 'active'
  for update;

  select r.position into selected_position
  from public.shop_walkin_rotation r
  where r.id = new.rotation_entry_id;

  select max(r.position) into final_position
  from public.shop_walkin_rotation r
  where r.shop_id = new.shop_id and r.location_id = new.location_id and r.status = 'active';

  if selected_position is null or final_position is null then
    raise exception using errcode = '23514', message = 'Confirmed Next Available assignment lost its rotation entry.';
  end if;

  -- Move through a temporary out-of-band position so the partial unique index
  -- remains valid while the queue is compacted.
  update public.shop_walkin_rotation
  set position = final_position + 1000000
  where id = new.rotation_entry_id;

  update public.shop_walkin_rotation
  set position = position - 1,
      updated_at = now()
  where shop_id = new.shop_id
    and location_id = new.location_id
    and status = 'active'
    and id <> new.rotation_entry_id
    and position > selected_position;

  update public.shop_walkin_rotation
  set position = final_position,
      last_assigned_at = coalesce(new.confirmed_at, now()),
      updated_at = now()
  where id = new.rotation_entry_id;

  return new;
end;
$$;

revoke all on function private.advance_confirmed_walkin_rotation() from public, anon, authenticated;

drop trigger if exists kiosk_confirmed_rotation_advance on public.kiosk_rotation_assignments;
create trigger kiosk_confirmed_rotation_advance
after insert or update on public.kiosk_rotation_assignments
for each row execute function private.advance_confirmed_walkin_rotation();

-- Preserve existing active memberships as accepted historical relationships.
insert into public.shop_barber_relationships (
  shop_id, location_id, barber_id, staff_location_id, relationship_type, status,
  approved_by_owner_profile_id, approved_by_owner_at,
  approved_by_barber_profile_id, approved_by_barber_at,
  started_at, terms_snapshot, created_at, updated_at
)
select
  s.id,
  sl.location_id,
  b.id,
  sl.id,
  sl.routing_model,
  'active',
  s.owner_profile_id,
  coalesce(sl.created_at, now()),
  b.profile_id,
  coalesce(sl.created_at, now()),
  coalesce(sl.created_at, now()),
  jsonb_build_object('source', 'staff_locations', 'staff_location_id', sl.id),
  coalesce(sl.created_at, now()),
  coalesce(sl.updated_at, now())
from public.staff_locations sl
join public.barbers b on b.profile_id = sl.profile_id
join public.locations l on l.id = sl.location_id
join public.shops s on s.id = coalesce(sl.shop_id, l.reference_code)
where sl.routing_model in ('commission', 'booth_rent')
  and coalesce(sl.relationship_status, 'active') = 'active'
  and sl.ended_at is null
  and s.owner_profile_id is not null
on conflict do nothing;

insert into public.compensation_rules (
  relationship_id, shop_id, location_id, barber_id, version, model,
  barber_percent, shop_percent, booth_rent_amount_cents, booth_rent_frequency,
  max_shop_charge_cents, is_active, starts_at, created_by_profile_id, created_at, updated_at
)
select
  r.id,
  r.shop_id,
  r.location_id,
  r.barber_id,
  1,
  r.relationship_type,
  case when r.relationship_type = 'commission' then round(sl.commission_rate * 100, 2) else null end,
  case when r.relationship_type = 'commission' then round(100 - sl.commission_rate * 100, 2) else null end,
  case when r.relationship_type = 'booth_rent' then round(sl.booth_rent_amount * 100)::integer else null end,
  case when r.relationship_type = 'booth_rent' then sl.booth_rent_frequency else null end,
  case when r.relationship_type = 'booth_rent' then round(sl.booth_rent_amount * 100)::integer else null end,
  true,
  r.started_at,
  r.approved_by_owner_profile_id,
  r.created_at,
  r.updated_at
from public.shop_barber_relationships r
join public.staff_locations sl on sl.id = r.staff_location_id
where (
  r.relationship_type = 'commission'
  and sl.commission_rate between 0 and 1
)
or (
  r.relationship_type = 'booth_rent'
  and sl.booth_rent_amount > 0
  and sl.booth_rent_frequency in ('weekly', 'monthly')
)
on conflict (relationship_id, version) do nothing;

create or replace function public.bvrb3r_pr22_master_truth_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with checks as (
  select * from (values
    ('three_account_roles', not exists (
      select 1 from public.profiles p
      where p.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
        and not exists (
          select 1 from public.internal_operator_access ioa
          where ioa.profile_id = p.id and ioa.status = 'active'
        )
    )),
    ('active_relationships_bilateral', not exists (
      select 1 from public.shop_barber_relationships r
      where r.status = 'active'
        and (r.approved_by_owner_at is null or r.approved_by_barber_at is null or r.started_at is null)
    )),
    ('active_rules_match_relationships', not exists (
      select 1 from public.compensation_rules c
      join public.shop_barber_relationships r on r.id = c.relationship_id
      where c.is_active and (r.status <> 'active' or c.model <> r.relationship_type)
    )),
    ('commission_percent_is_100', not exists (
      select 1 from public.compensation_rules c
      where c.model = 'commission' and c.barber_percent + c.shop_percent <> 100
    )),
    ('commission_tips_separate', not exists (
      select 1 from public.commission_ledger l
      where abs(l.shop_commission_amount - round(greatest(l.gross_service_amount - l.platform_fee_amount, 0) * l.shop_percent / 100, 2)) > 0.01
         or abs(l.barber_service_amount - round(greatest(l.gross_service_amount - l.platform_fee_amount, 0) * l.barber_percent / 100, 2)) > 0.01
    )),
    ('booth_rent_separate', not exists (
      select 1 from public.payment_routing_records p
      where p.routing_model = 'booth_rent' and p.shop_split_amount <> 0
    )),
    ('booth_rent_caps_hold', not exists (
      select 1 from public.booth_rent_charges c
      group by c.compensation_rule_id, c.period_start, c.period_end, c.max_charge_cents
      having sum(c.amount_paid_cents) > c.max_charge_cents
    )),
    ('money_tables_rls', (
      select count(*) = 4 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('shop_barber_relationships', 'compensation_rules', 'booth_rent_charges', 'commission_ledger')
        and c.relrowsecurity
    )),
    ('kiosk_is_session_not_role', not exists (
      select 1 from public.profiles p where p.role::text = 'kiosk'
    )),
    ('kiosk_tokens_hashed', not exists (
      select 1 from public.kiosk_sessions s where s.session_token_hash !~ '^[0-9a-f]{64}$'
    )),
    ('direct_choice_preserves_rotation', not exists (
      select 1 from public.kiosk_rotation_assignments a
      where a.routing_type <> 'next_available_rotation' and a.rotation_entry_id is not null
    )),
    ('queue_tokens_scoped', not exists (
      select 1 from public.waitlist_entries w
      where w.public_token_hash is not null and w.public_token_hash !~ '^[0-9a-f]{64}$'
    ))
  ) v(check_name, passed)
), summary as (
  select count(*) check_count,
         count(*) filter (where passed) passed_count,
         jsonb_object_agg(check_name, passed order by check_name) check_map
  from checks
)
select jsonb_build_object(
  'schemaVersion', 1,
  'mission', 'PR22_MASTER_TRUTH',
  'generatedAt', now(),
  'status', case when check_count = 12 and passed_count = 12 then 'pass' else 'fail' end,
  'certifiable', check_count = 12 and passed_count = 12,
  'checkCount', check_count,
  'passedCount', passed_count,
  'checks', check_map
)
from summary;
$$;

revoke all on function public.bvrb3r_pr22_master_truth_snapshot() from public, anon, authenticated;
grant execute on function public.bvrb3r_pr22_master_truth_snapshot() to service_role;

comment on table public.shop_barber_relationships is
  'Bilateral commission or booth-rent business relationship. Account identity remains barber_user.';
comment on table public.compensation_rules is
  'Versioned money agreement. Commission splits post-fee service money; booth rent is a separate fixed charge.';
comment on table public.booth_rent_charges is
  'Separate capped booth-rent billing truth; never an implicit appointment split.';
comment on table public.commission_ledger is
  'Commission ledger with service, platform fee, barber/shop shares, and tips separated.';
comment on table public.kiosk_sessions is
  'Short-lived hashed session for a controlled kiosk operating mode. Kiosk is not a user role.';
comment on column public.waitlist_entries.public_token_hash is
  'SHA-256 hash of the one-entry public queue token. Raw queue tokens are never stored.';

notify pgrst, 'reload schema';
