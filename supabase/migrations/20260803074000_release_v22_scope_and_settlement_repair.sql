begin;

create or replace function private.release_can_read_profile(
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select (select auth.uid()) = target_profile_id
    or private.is_internal_operator()
    or exists (
      select 1
      from public.staff_locations membership
      where membership.profile_id = target_profile_id
        and membership.ended_at is null
        and membership.relationship_status in ('active', 'paused')
        and private.has_shop_operator_access(
          membership.shop_id,
          membership.location_id
        )
    )
$function$;

revoke all on function private.release_can_read_profile(uuid)
  from public, anon, authenticated, service_role;

grant execute on function private.release_can_read_profile(uuid)
  to authenticated, service_role;

drop policy if exists "profiles self or owner" on public.profiles;
drop policy if exists "release security profiles self or owner"
  on public.profiles;
drop policy if exists "release performance select" on public.profiles;
drop policy if exists "release profiles scoped select" on public.profiles;

create policy "release profiles scoped select"
on public.profiles
for select
to authenticated
using (private.release_can_read_profile(id));

create or replace function private.release_can_read_booth_rent_ledger(
  ledger_barber_id uuid,
  ledger_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select private.is_internal_operator()
    or exists (
      select 1
      from public.barbers barber
      where barber.id = ledger_barber_id
        and barber.profile_id = (select auth.uid())
    )
    or private.has_shop_operator_access(
      ledger_shop_id::text,
      ledger_shop_id
    )
    or exists (
      select 1
      from public.barbers barber
      join public.staff_locations membership
        on membership.profile_id = barber.profile_id
      where barber.id = ledger_barber_id
        and membership.ended_at is null
        and membership.relationship_status in ('active', 'paused')
        and private.has_shop_operator_access(
          membership.shop_id,
          membership.location_id
        )
    )
$function$;

revoke all on function
  private.release_can_read_booth_rent_ledger(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  private.release_can_read_booth_rent_ledger(uuid, uuid)
  to authenticated, service_role;

drop policy if exists "booth rent owner or barber"
  on public.booth_rent_ledgers;
drop policy if exists "booth rent scoped owner or barber"
  on public.booth_rent_ledgers;

create policy "booth rent scoped owner or barber"
on public.booth_rent_ledgers
for select
to authenticated
using (
  private.release_can_read_booth_rent_ledger(barber_id, shop_id)
);

create or replace function
  private.release_staff_location_settle_first_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  relationship_id_value uuid;
begin
  if (
       old.relationship_status = 'active'
       and new.relationship_status in ('paused', 'ended')
     )
     or (
       old.relationship_status = 'paused'
       and new.relationship_status = 'ended'
     )
     or (
       old.ended_at is null
       and new.ended_at is not null
     ) then
    select relationship.id
      into relationship_id_value
    from public.shop_barber_relationships relationship
    where relationship.staff_location_id = new.id
      and relationship.status in ('active', 'suspended')
      and relationship.ended_at is null
    order by
      relationship.started_at desc nulls last,
      relationship.created_at desc
    limit 1;

    if relationship_id_value is not null
       and private.release_relationship_has_unsettled_rent(
         relationship_id_value
       ) then
      raise exception using
        errcode = '23514',
        message =
          'Rent must settle to $0.00 before pausing or ending this staff relationship.';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function
  private.release_staff_location_settle_first_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists release_staff_location_settle_first_guard
  on public.staff_locations;

create trigger release_staff_location_settle_first_guard
before update of relationship_status, ended_at
on public.staff_locations
for each row
execute function
  private.release_staff_location_settle_first_guard();

create or replace function
  private.release_relationship_settle_first_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (
       old.status = 'active'
       and new.status in ('suspended', 'ended')
     )
     or (
       old.status = 'suspended'
       and new.status = 'ended'
     )
     or (
       old.ended_at is null
       and new.ended_at is not null
     ) then
    if private.release_relationship_has_unsettled_rent(new.id) then
      raise exception using
        errcode = '23514',
        message =
          'Rent must settle to $0.00 before pausing or ending this shop relationship.';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function
  private.release_relationship_settle_first_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists release_relationship_settle_first_guard
  on public.shop_barber_relationships;

create trigger release_relationship_settle_first_guard
before update of status, ended_at
on public.shop_barber_relationships
for each row
execute function
  private.release_relationship_settle_first_guard();

notify pgrst, 'reload schema';

commit;
