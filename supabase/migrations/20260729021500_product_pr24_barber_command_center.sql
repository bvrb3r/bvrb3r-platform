-- ============================================================================
-- Product PR24 — barber command-center source and money isolation.
--
-- The barber calendar may read operational time from ChairSync, but imported
-- Booksy, Square and theCut appointments never enter BVRB3R payment, tip,
-- routing, checkout or revenue ledgers. Historical rows remain immutable; the
-- guards below reject new or retargeted financial writes.
-- ============================================================================

begin;

alter table public.appointments
  validate constraint appointments_external_financial_privacy_ck;

create index if not exists chairsync_barber_range_status_idx
  on public.chairsync_appointments (barber_id, starts_at, ends_at, status)
  where barber_id is not null;

create index if not exists waitlist_entries_barber_command_idx
  on public.waitlist_entries (barber_id, status, canonical_position, created_at)
  where barber_id is not null
    and status in ('active', 'called', 'assigned');

create index if not exists waitlist_entries_preference_command_idx
  on public.waitlist_entries (barber_preference, status, canonical_position, created_at)
  where barber_preference is not null
    and status in ('active', 'called', 'assigned');

create or replace function private.product_pr24_guard_external_appointment_financial_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_source text;
  appointment_payment_owner text;
  external_financial_private boolean;
begin
  if new.appointment_id is null then
    return new;
  end if;

  select
    a.source_provider,
    a.payment_owner,
    a.external_financial_data_private
  into
    appointment_source,
    appointment_payment_owner,
    external_financial_private
  from public.appointments a
  where a.id = new.appointment_id;

  if appointment_source is null then
    return new;
  end if;

  if appointment_source <> 'bvrb3r'
     or appointment_payment_owner like 'external:%'
     or coalesce(external_financial_private, false) then
    raise exception using
      errcode = '23514',
      message = 'External appointments cannot enter BVRB3R financial ledgers.';
  end if;

  return new;
end;
$$;

revoke all on function private.product_pr24_guard_external_appointment_financial_write()
  from public, anon, authenticated;

drop trigger if exists product_pr24_guard_external_payment
  on public.payments;
create trigger product_pr24_guard_external_payment
  before insert or update
  on public.payments
  for each row
  execute function private.product_pr24_guard_external_appointment_financial_write();

drop trigger if exists product_pr24_guard_external_tip
  on public.tips;
create trigger product_pr24_guard_external_tip
  before insert or update
  on public.tips
  for each row
  execute function private.product_pr24_guard_external_appointment_financial_write();

drop trigger if exists product_pr24_guard_external_routing
  on public.payment_routing_records;
create trigger product_pr24_guard_external_routing
  before insert or update
  on public.payment_routing_records
  for each row
  execute function private.product_pr24_guard_external_appointment_financial_write();

comment on function private.product_pr24_guard_external_appointment_financial_write() is
  'Product PR24 invariant: source-provider appointments remain operational/read-only and cannot create BVRB3R money truth.';

create or replace function private.product_pr24_guard_external_source_retarget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.source_provider <> 'bvrb3r'
    or new.payment_owner like 'external:%'
    or coalesce(new.external_financial_data_private, false)
  ) and (
    exists (
      select 1
      from public.payments p
      where p.appointment_id = new.id
    )
    or exists (
      select 1
      from public.tips t
      where t.appointment_id = new.id
    )
    or exists (
      select 1
      from public.payment_routing_records r
      where r.appointment_id = new.id
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Appointments with BVRB3R financial records cannot be retargeted to an external source.';
  end if;

  return new;
end;
$$;

revoke all on function private.product_pr24_guard_external_source_retarget()
  from public, anon, authenticated;

drop trigger if exists product_pr24_guard_external_source_retarget
  on public.appointments;
create trigger product_pr24_guard_external_source_retarget
  before update of source_provider, payment_owner, external_financial_data_private
  on public.appointments
  for each row
  execute function private.product_pr24_guard_external_source_retarget();

comment on function private.product_pr24_guard_external_source_retarget() is
  'Product PR24 invariant: a native appointment with financial truth cannot be reclassified as external.';

commit;
