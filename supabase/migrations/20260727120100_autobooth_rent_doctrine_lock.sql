-- BVRB3R locked financial doctrine — storage boundary.
--
-- Full Booth Rent ('booth_rent') and AutoBooth Rent ('autobooth_rent') are the
-- only supported shop-barber financial models. 'freelance' means the barber has
-- no shop relationship, so no rent exists.
--
-- AutoBooth Rent applies an owner-approved portion of eligible transaction
-- proceeds toward a barber's OUTSTANDING booth rent. Because the applied amount
-- can never exceed outstanding rent, it settles a debt the barber already owes.
-- It is not labor compensation and not revenue sharing.
--
-- This migration re-establishes the zero-commission lock that PR22 superseded,
-- and adds the AutoBooth columns the application layer now reads and writes.
--
-- HISTORY IS NOT REWRITTEN. Already-applied migrations keep their original text,
-- the retired `public.commission_ledger` table keeps its rows for audit, and
-- retired columns are left in place unused. Nothing is dropped or deleted.
--
-- Retired revenue-share rows normalize to 'freelance', never to a rent model:
-- promoting a retired split into booth rent would invent a debt the barber never
-- agreed to. The shop collects nothing until owner and barber establish a real
-- Full Booth Rent or AutoBooth Rent agreement.

-- ---------------------------------------------------------------------------
-- 1. Additive AutoBooth columns.
-- ---------------------------------------------------------------------------

alter table public.barbers
  add column if not exists autobooth_percent numeric(5,4);

alter table public.staff_locations
  add column if not exists autobooth_percent numeric(5,4),
  add column if not exists autobooth_cap_amount numeric(10,2),
  add column if not exists autobooth_cap_frequency text;

alter table public.shop_team_invites
  add column if not exists autobooth_percent numeric(5,4),
  add column if not exists autobooth_cap_amount numeric(10,2),
  add column if not exists autobooth_cap_frequency text;

alter table public.compensation_snapshots
  add column if not exists autobooth_percent numeric(5,4),
  add column if not exists autobooth_rent_applied_amount numeric(10,2) not null default 0;

alter table public.compensation_rules
  add column if not exists autobooth_percent numeric(5,4);

alter table public.appointments
  add column if not exists autobooth_percent_snapshot numeric(5,4);

alter table public.payment_routing_records
  add column if not exists autobooth_percent_snapshot numeric(5,4);

-- ---------------------------------------------------------------------------
-- 2. Normalize retired revenue-share rows to freelance BEFORE tightening
--    constraints, so the tightened checks can be added as valid.
-- ---------------------------------------------------------------------------

update public.barbers
set compensation_model = 'freelance',
    default_money_relationship = 'freelance'
where compensation_model = 'commission'
   or default_money_relationship = 'commission';

update public.barbers
set barber_subtype = 'freelance'
where barber_subtype::text = 'commission';

update public.staff_locations
set routing_model = 'freelance'
where routing_model = 'commission';

update public.shop_team_invites
set routing_model = 'freelance'
where routing_model = 'commission';

-- 0003 created compensation_snapshots with an inline check that predates
-- 'freelance'; it must be dropped before normalization or the update below
-- violates it. Section 3 re-adds the same name with the doctrine values.
alter table public.compensation_snapshots
  drop constraint if exists compensation_snapshots_compensation_model_check;

update public.compensation_snapshots
set compensation_model = 'freelance'
where compensation_model = 'commission';

update public.appointments
set relationship_type_snapshot = 'freelance'
where relationship_type_snapshot = 'commission';

-- Retired routing rows keep their recorded money so history reconciles; only
-- the model label is normalized. Percent snapshots are cleared because no
-- supported model has a barber/shop percent split.
update public.payment_routing_records
set routing_model = 'freelance',
    barber_percent_snapshot = null,
    shop_percent_snapshot = null
where routing_model = 'commission';

-- End retired revenue-share relationships rather than converting them. An
-- inactive relationship charges nothing, which is the fail-safe outcome.
update public.compensation_rules
set is_active = false,
    ends_at = coalesce(ends_at, now())
where model = 'commission'
  and is_active;

update public.shop_barber_relationships
set is_active = false,
    ended_at = coalesce(ended_at, now())
where relationship_type = 'commission'
  and is_active;

-- ---------------------------------------------------------------------------
-- 3. Tighten the model/routing constraints onto the locked doctrine.
--    Constraint names reuse the earlier zero-commission lock for continuity.
-- ---------------------------------------------------------------------------

alter table public.barbers
  drop constraint if exists barbers_compensation_model_check,
  drop constraint if exists barbers_default_money_relationship_ck;
alter table public.barbers
  add constraint barbers_compensation_model_check
    check (compensation_model in ('freelance', 'booth_rent', 'autobooth_rent')),
  add constraint barbers_default_money_relationship_ck
    check (default_money_relationship in ('freelance', 'booth_rent', 'autobooth_rent'));

alter table public.staff_locations
  drop constraint if exists staff_locations_routing_model_ck,
  drop constraint if exists staff_locations_no_active_commission_ck,
  drop constraint if exists staff_locations_autobooth_cap_frequency_ck,
  drop constraint if exists staff_locations_autobooth_percent_ck;
alter table public.staff_locations
  add constraint staff_locations_routing_model_ck
    check (routing_model is null or routing_model in ('freelance', 'booth_rent', 'autobooth_rent')),
  add constraint staff_locations_autobooth_cap_frequency_ck
    check (autobooth_cap_frequency is null or autobooth_cap_frequency in ('weekly', 'monthly')),
  add constraint staff_locations_autobooth_percent_ck
    check (autobooth_percent is null or (autobooth_percent > 0 and autobooth_percent <= 1));

alter table public.shop_team_invites
  drop constraint if exists shop_team_invites_routing_model_ck,
  drop constraint if exists shop_team_invites_no_open_commission_ck,
  drop constraint if exists shop_team_invites_autobooth_cap_frequency_ck,
  drop constraint if exists shop_team_invites_autobooth_percent_ck;
alter table public.shop_team_invites
  add constraint shop_team_invites_routing_model_ck
    check (routing_model is null or routing_model in ('freelance', 'booth_rent', 'autobooth_rent')),
  add constraint shop_team_invites_autobooth_cap_frequency_ck
    check (autobooth_cap_frequency is null or autobooth_cap_frequency in ('weekly', 'monthly')),
  add constraint shop_team_invites_autobooth_percent_ck
    check (autobooth_percent is null or (autobooth_percent > 0 and autobooth_percent <= 1));

alter table public.compensation_snapshots
  drop constraint if exists compensation_snapshots_compensation_model_check,
  drop constraint if exists compensation_snapshots_no_new_commission_ck,
  drop constraint if exists compensation_snapshots_autobooth_applied_ck;
alter table public.compensation_snapshots
  add constraint compensation_snapshots_compensation_model_check
    check (compensation_model in ('freelance', 'booth_rent', 'autobooth_rent')),
  -- AutoBooth applications are rent payments, so they are never negative.
  add constraint compensation_snapshots_autobooth_applied_ck
    check (autobooth_rent_applied_amount >= 0);

alter table public.appointments
  drop constraint if exists appointments_relationship_type_snapshot_ck;
alter table public.appointments
  add constraint appointments_relationship_type_snapshot_ck
    check (
      relationship_type_snapshot is null
      or relationship_type_snapshot in ('freelance', 'booth_rent', 'autobooth_rent')
    ) not valid;

-- PR22 named this check shop_barber_relationships_type_ck; both names are
-- dropped so the stale ('booth_rent', 'commission') check cannot survive and
-- reject 'autobooth_rent' inserts.
alter table public.shop_barber_relationships
  drop constraint if exists shop_barber_relationships_type_ck,
  drop constraint if exists shop_barber_relationships_relationship_type_ck;
-- NOT VALID because section 2 deliberately retains ended pre-doctrine rows
-- with their recorded relationship_type for audit; new writes are still
-- enforced.
alter table public.shop_barber_relationships
  add constraint shop_barber_relationships_relationship_type_ck
    check (relationship_type in ('booth_rent', 'autobooth_rent')) not valid;

-- ---------------------------------------------------------------------------
-- 4. Compensation rules: both supported models are rent agreements.
--    AutoBooth additionally carries the owner-approved portion, and the
--    owner-approved max charge still bounds what the shop may ever collect.
-- ---------------------------------------------------------------------------

alter table public.compensation_rules
  drop constraint if exists compensation_rules_model_ck,
  drop constraint if exists compensation_rules_model_values_ck;
-- Both checks are NOT VALID because section 2 deliberately retains ended
-- pre-doctrine rules with their recorded model for audit; new writes are
-- still enforced.
alter table public.compensation_rules
  add constraint compensation_rules_model_ck
    check (model in ('booth_rent', 'autobooth_rent')) not valid,
  add constraint compensation_rules_model_values_ck
    check (
      booth_rent_amount_cents > 0
      and booth_rent_frequency is not null
      and max_shop_charge_cents >= booth_rent_amount_cents
      -- No supported model shares service revenue with the shop.
      and barber_percent is null
      and shop_percent is null
      and not variable_commission_enabled
      and (
        (model = 'booth_rent' and autobooth_percent is null)
        or
        (model = 'autobooth_rent' and autobooth_percent > 0 and autobooth_percent <= 1)
      )
    ) not valid;

-- ---------------------------------------------------------------------------
-- 5. Payment routing: no supported model carries a percent split, and the
--    AutoBooth shop-side amount is a rent application bounded by the
--    distributable service money.
-- ---------------------------------------------------------------------------

alter table public.payment_routing_records
  drop constraint if exists payment_routing_commission_snapshot_ck,
  drop constraint if exists payment_routing_records_no_new_commission_ck,
  drop constraint if exists payment_routing_records_routing_model_check,
  drop constraint if exists payment_routing_autobooth_snapshot_ck;
alter table public.payment_routing_records
  add constraint payment_routing_records_routing_model_check
    check (routing_model in ('freelance', 'booth_rent', 'autobooth_rent')) not valid,
  add constraint payment_routing_records_no_new_commission_ck
    check (barber_percent_snapshot is null and shop_percent_snapshot is null) not valid,
  add constraint payment_routing_autobooth_snapshot_ck
    check (
      routing_model <> 'autobooth_rent'
      or (
        shop_barber_relationship_id is not null
        and compensation_rule_id is not null
        and autobooth_percent_snapshot > 0
        and autobooth_percent_snapshot <= 1
      )
    ) not valid;

-- ---------------------------------------------------------------------------
-- 6. Retire the revenue-share ledger for new writes without deleting history.
--    Existing rows stay readable for audit; no new row can be inserted.
-- ---------------------------------------------------------------------------

comment on table public.commission_ledger is
  'RETIRED. Historical revenue-share ledger retained for audit only. BVRB3R supports Full Booth Rent and AutoBooth Rent exclusively; AutoBooth applications are recorded against public.booth_rent_charges. No new rows may be inserted.';

-- Remove the retired write path. PR22 installed a trigger that auto-inserted a
-- revenue-share ledger row whenever a routing record used the retired model.
-- Section 3 makes that model unwritable, so the trigger is already unreachable;
-- dropping it removes the dead executable path rather than leaving it in place.
drop trigger if exists commission_ledger_routing_sync on public.payment_routing_records;

create or replace function private.sync_commission_ledger_from_routing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- RETIRED. Kept as an inert no-op so any lingering reference resolves. The
  -- revenue-share model it served can no longer be written.
  return new;
end;
$$;

revoke all on function private.sync_commission_ledger_from_routing() from public, anon, authenticated;

-- Fail closed against any other writer, including service_role.
revoke insert, update on table public.commission_ledger from service_role;

create or replace function private.reject_commission_ledger_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '23514',
    message = 'commission_ledger is retired. BVRB3R supports Full Booth Rent and AutoBooth Rent only; record AutoBooth applications against public.booth_rent_charges.';
end;
$$;

revoke all on function private.reject_commission_ledger_writes() from public, anon, authenticated;

drop trigger if exists reject_commission_ledger_writes on public.commission_ledger;
create trigger reject_commission_ledger_writes
  before insert or update on public.commission_ledger
  for each row execute function private.reject_commission_ledger_writes();

-- NOTE ON THE OUTSTANDING-RENT CAP
-- `booth_rent_charges` already bounds amount_paid_cents at max_charge_cents via
-- booth_rent_charges_amount_ck, and PR22's booth_rent_caps_hold assertion checks
-- the per-period sum. No tighter DB bound is added here on purpose: PR22
-- deliberately allows max_charge_cents > amount_cents as headroom, and narrowing
-- it would break that design. The rule that an AutoBooth application never
-- exceeds OUTSTANDING rent is enforced in lib/fintech/booth-rent-doctrine.ts and
-- proven in tests/unit/autobooth-rent-doctrine.spec.ts.
