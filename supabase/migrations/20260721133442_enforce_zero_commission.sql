-- The One True Production App Build Doctrine permits only Full Booth Rent
-- and AutoBooth Rent. Preserve legacy commission rows for audit, but reject
-- every new attempt to create or convert active business truth to commission.

create or replace function private.reject_new_commission_value()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  column_name text := tg_argv[0];
  new_value text := to_jsonb(new) ->> column_name;
  old_value text := case when tg_op = 'UPDATE' then to_jsonb(old) ->> column_name else null end;
begin
  if new_value = 'commission' and (tg_op = 'INSERT' or old_value is distinct from new_value) then
    raise exception using
      errcode = '23514',
      message = 'Commission is permanently disabled. Use Full Booth Rent or AutoBooth Rent.';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_new_commission_value() from public, anon, authenticated;
grant execute on function private.reject_new_commission_value() to service_role;

drop trigger if exists barbers_reject_new_commission on public.barbers;
create trigger barbers_reject_new_commission
before insert or update on public.barbers
for each row execute function private.reject_new_commission_value('compensation_model');

drop trigger if exists staff_locations_reject_new_commission on public.staff_locations;
create trigger staff_locations_reject_new_commission
before insert or update on public.staff_locations
for each row execute function private.reject_new_commission_value('routing_model');

drop trigger if exists shop_team_invites_reject_new_commission on public.shop_team_invites;
create trigger shop_team_invites_reject_new_commission
before insert or update on public.shop_team_invites
for each row execute function private.reject_new_commission_value('routing_model');

drop trigger if exists shop_relationships_reject_new_commission on public.shop_barber_relationships;
create trigger shop_relationships_reject_new_commission
before insert or update on public.shop_barber_relationships
for each row execute function private.reject_new_commission_value('relationship_type');

drop trigger if exists compensation_rules_reject_new_commission on public.compensation_rules;
create trigger compensation_rules_reject_new_commission
before insert or update on public.compensation_rules
for each row execute function private.reject_new_commission_value('model');

drop trigger if exists compensation_snapshots_reject_new_commission on public.compensation_snapshots;
create trigger compensation_snapshots_reject_new_commission
before insert or update on public.compensation_snapshots
for each row execute function private.reject_new_commission_value('compensation_model');

drop trigger if exists payment_routing_reject_new_commission on public.payment_routing_records;
create trigger payment_routing_reject_new_commission
before insert or update on public.payment_routing_records
for each row execute function private.reject_new_commission_value('routing_model');

create or replace function private.reject_new_commission_ledger_entry()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  raise exception using
    errcode = '23514',
    message = 'Commission ledger writes are permanently disabled.';
end;
$$;

revoke all on function private.reject_new_commission_ledger_entry() from public, anon, authenticated;

drop trigger if exists commission_ledger_reject_new_entries on public.commission_ledger;
create trigger commission_ledger_reject_new_entries
before insert on public.commission_ledger
for each row execute function private.reject_new_commission_ledger_entry();
