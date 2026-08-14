begin;

set local client_min_messages = warning;

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  banned_until,
  raw_app_meta_data,
  raw_user_meta_data,
  is_anonymous,
  created_at,
  updated_at
)
select
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  '',
  'infinity'::timestamptz,
  '{"provider":"email","providers":["email"],"branch_fixture":"pr40_atomic_cert"}'::jsonb,
  pg_catalog.jsonb_build_object('full_name', fixture.full_name),
  false,
  pg_catalog.now(),
  pg_catalog.now()
from (
  values
    ('44000000-0000-4000-8000-000000000001'::uuid, 'pr40-owner@example.invalid', 'PR40 Owner'),
    ('44000000-0000-4000-8000-000000000002'::uuid, 'pr40-barber@example.invalid', 'PR40 Barber'),
    ('44000000-0000-4000-8000-000000000003'::uuid, 'pr40-other@example.invalid', 'PR40 Other')
) fixture(id, email, full_name);

update public.profiles
set role = case id
  when '44000000-0000-4000-8000-000000000001'::uuid then 'shop_owner_user'::public.app_role
  when '44000000-0000-4000-8000-000000000002'::uuid then 'barber_user'::public.app_role
  else 'client_user'::public.app_role
end
where id in (
  '44000000-0000-4000-8000-000000000001'::uuid,
  '44000000-0000-4000-8000-000000000002'::uuid,
  '44000000-0000-4000-8000-000000000003'::uuid
);

insert into public.shops (
  id,
  name,
  neighborhood,
  city,
  state,
  owner_profile_id,
  app_approval_status
)
values (
  'pr40-cert-shop',
  'PR40 Certification Shop',
  'Synthetic',
  'Tampa',
  'FL',
  '44000000-0000-4000-8000-000000000001'::uuid,
  'pending'::public.approval_status
);

insert into public.locations (
  id,
  reference_code,
  name,
  neighborhood,
  city,
  state,
  address,
  postal_code,
  hours,
  location_visibility,
  location_verified,
  location_active
)
values
  (
    '44000000-0000-4000-8000-000000000010'::uuid,
    'pr40-cert-shop',
    'PR40 Certification Shop',
    'Synthetic',
    'Tampa',
    'FL',
    '100 Certification Way',
    '33602',
    '{}'::jsonb,
    'hidden',
    false,
    true
  ),
  (
    '44000000-0000-4000-8000-000000000021'::uuid,
    'independent-pr40-cert-barber',
    'PR40 Independent Chair',
    'Synthetic',
    'Tampa',
    'FL',
    '200 Certification Way',
    '33602',
    '{}'::jsonb,
    'hidden',
    false,
    false
  );

insert into public.barbers (
  id,
  profile_id,
  compensation_model,
  reference_code,
  booking_slug,
  app_approval_status,
  status
)
values (
  '44000000-0000-4000-8000-000000000020'::uuid,
  '44000000-0000-4000-8000-000000000002'::uuid,
  'freelance',
  'pr40-cert-barber',
  'pr40-cert-barber',
  'approved'::public.approval_status,
  'active'
);

do $privileges$
declare
  function_oid oid;
begin
  foreach function_oid in array array[
    'public.pr40_update_owner_hours(uuid,text,uuid,jsonb)'::regprocedure::oid,
    'public.pr40_replace_barber_availability(uuid,uuid,uuid,text,jsonb)'::regprocedure::oid,
    'public.pr39_save_verified_shop_location(uuid,uuid,text,text,text,text,text,double precision,double precision,text,text,text)'::regprocedure::oid
  ] loop
    if pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE') then
      raise exception 'PR40 function privilege certification failed for %', function_oid::regprocedure;
    end if;
  end loop;
end;
$privileges$;

-- Force the location half of the Owner write to fail after the shop half has
-- already executed. Catching the statement error must leave both rows at their
-- original values because one RPC call is one database transaction.
alter table public.locations
  add constraint pr40_cert_reject_owner_hours
  check (
    hours <> '{"version":1,"source":"owner_settings","weekly":[{"weekday":1,"startTime":"09:00","endTime":"17:00"}]}'::jsonb
  ) not valid;

do $owner_rollback$
begin
  begin
    perform public.pr40_update_owner_hours(
      '44000000-0000-4000-8000-000000000001'::uuid,
      'pr40-cert-shop',
      '44000000-0000-4000-8000-000000000010'::uuid,
      '{"version":1,"source":"owner_settings","weekly":[{"weekday":1,"startTime":"09:00","endTime":"17:00"}]}'::jsonb
    );
    raise exception 'Owner rollback fixture did not fail';
  exception
    when check_violation then null;
  end;

  if (select public_hours from public.shops where id = 'pr40-cert-shop') is not null
     or (select hours from public.locations where id = '44000000-0000-4000-8000-000000000010'::uuid) <> '{}'::jsonb then
    raise exception 'Owner atomic rollback left a partial hours write';
  end if;
end;
$owner_rollback$;

alter table public.locations drop constraint pr40_cert_reject_owner_hours;

select public.pr40_update_owner_hours(
  '44000000-0000-4000-8000-000000000001'::uuid,
  'pr40-cert-shop',
  '44000000-0000-4000-8000-000000000010'::uuid,
  '{"version":1,"source":"owner_settings","weekly":[{"weekday":1,"startTime":"09:00","endTime":"17:00"}]}'::jsonb
);

do $owner_success$
declare
  shop_hours jsonb;
  location_hours jsonb;
begin
  select public_hours into shop_hours from public.shops where id = 'pr40-cert-shop';
  select hours into location_hours from public.locations where id = '44000000-0000-4000-8000-000000000010'::uuid;
  if shop_hours is distinct from location_hours
     or not private.pr32_valid_owner_hours(shop_hours) then
    raise exception 'Owner hours were not mirrored using the canonical contract';
  end if;

  begin
    perform public.pr40_update_owner_hours(
      '44000000-0000-4000-8000-000000000003'::uuid,
      'pr40-cert-shop',
      '44000000-0000-4000-8000-000000000010'::uuid,
      shop_hours
    );
    raise exception 'Wrong-owner Owner hours call did not fail';
  exception
    when insufficient_privilege then null;
  end;
end;
$owner_success$;

-- Pending owner-controlled shops may save verified geo. Public marketplace
-- discovery remains independently gated to approved shops.
select *
from public.pr39_save_verified_shop_location(
  '44000000-0000-4000-8000-000000000010'::uuid,
  '44000000-0000-4000-8000-000000000001'::uuid,
  '100 Certification Way, Tampa, FL 33602',
  null,
  'Tampa',
  'FL',
  '33602',
  -82.4572,
  27.9506,
  'mapbox-certification-reference',
  'rooftop',
  'exact'
);

do $geo_success$
begin
  if not exists (
    select 1
    from public.locations location
    join public.shops shop on shop.id = location.reference_code
    where location.id = '44000000-0000-4000-8000-000000000010'::uuid
      and location.location_verified
      and location.location_visibility = 'exact'
      and shop.app_approval_status::text = 'pending'
  ) then
    raise exception 'Pending-shop geocode compatibility did not persist canonical geo';
  end if;
end;
$geo_success$;

insert into public.availability_rules (
  barber_id,
  location_id,
  weekday,
  start_time,
  end_time
)
values (
  '44000000-0000-4000-8000-000000000020'::uuid,
  '44000000-0000-4000-8000-000000000021'::uuid,
  0,
  '10:00'::time,
  '14:00'::time
);

-- Force the replacement INSERT to fail after DELETE. The existing Sunday rule
-- must remain, proving a failed replacement cannot destroy valid availability.
alter table public.availability_rules
  add constraint pr40_cert_reject_saturday
  check (weekday <> 6) not valid;

do $barber_rollback$
begin
  begin
    perform public.pr40_replace_barber_availability(
      '44000000-0000-4000-8000-000000000002'::uuid,
      '44000000-0000-4000-8000-000000000020'::uuid,
      '44000000-0000-4000-8000-000000000021'::uuid,
      'freelance',
      '[{"weekday":6,"startTime":"09:00","endTime":"13:00"}]'::jsonb
    );
    raise exception 'Barber rollback fixture did not fail';
  exception
    when check_violation then null;
  end;

  if not exists (
    select 1 from public.availability_rules
    where barber_id = '44000000-0000-4000-8000-000000000020'::uuid
      and location_id = '44000000-0000-4000-8000-000000000021'::uuid
      and weekday = 0
      and start_time = '10:00'::time
      and end_time = '14:00'::time
  ) then
    raise exception 'Barber atomic rollback destroyed the previous schedule';
  end if;
end;
$barber_rollback$;

alter table public.availability_rules drop constraint pr40_cert_reject_saturday;

select public.pr40_replace_barber_availability(
  '44000000-0000-4000-8000-000000000002'::uuid,
  '44000000-0000-4000-8000-000000000020'::uuid,
  '44000000-0000-4000-8000-000000000021'::uuid,
  'freelance',
  '[{"weekday":1,"startTime":"09:00","endTime":"17:00"},{"weekday":2,"startTime":"10:00","endTime":"18:00"}]'::jsonb
);

do $barber_success$
begin
  if (select count(*) from public.availability_rules
      where barber_id = '44000000-0000-4000-8000-000000000020'::uuid
        and location_id = '44000000-0000-4000-8000-000000000021'::uuid) <> 2
     or not exists (
       select 1
       from public.staff_locations membership
       join public.locations location on location.id = membership.location_id
       where membership.profile_id = '44000000-0000-4000-8000-000000000002'::uuid
         and membership.location_id = '44000000-0000-4000-8000-000000000021'::uuid
         and membership.routing_model = 'freelance'
         and membership.shop_id is null
         and membership.relationship_status is null
         and membership.paused_at is null
         and membership.ended_at is null
         and location.location_active
     ) then
    raise exception 'Freelance availability replacement did not create canonical Road truth';
  end if;

  begin
    perform public.pr40_replace_barber_availability(
      '44000000-0000-4000-8000-000000000003'::uuid,
      '44000000-0000-4000-8000-000000000020'::uuid,
      '44000000-0000-4000-8000-000000000021'::uuid,
      'freelance',
      '[{"weekday":1,"startTime":"09:00","endTime":"17:00"}]'::jsonb
    );
    raise exception 'Wrong-barber availability call did not fail';
  exception
    when insufficient_privilege then null;
  end;
end;
$barber_success$;

-- Exercise the mutually approved shop branch against the same canonical shop
-- location used by Owner setup.
insert into public.staff_locations (
  id,
  profile_id,
  location_id,
  shop_id,
  routing_model,
  relationship_status,
  approved_by_owner_at,
  approved_by_barber_at
)
values (
  '44000000-0000-4000-8000-000000000030'::uuid,
  '44000000-0000-4000-8000-000000000002'::uuid,
  '44000000-0000-4000-8000-000000000010'::uuid,
  'pr40-cert-shop',
  'booth_rent',
  'active',
  pg_catalog.now(),
  pg_catalog.now()
);

insert into public.shop_barber_relationships (
  id,
  shop_id,
  location_id,
  barber_id,
  staff_location_id,
  relationship_type,
  status,
  invited_by_profile_id,
  approved_by_owner_profile_id,
  approved_by_owner_at,
  approved_by_barber_profile_id,
  approved_by_barber_at,
  started_at
)
values (
  '44000000-0000-4000-8000-000000000031'::uuid,
  'pr40-cert-shop',
  '44000000-0000-4000-8000-000000000010'::uuid,
  '44000000-0000-4000-8000-000000000020'::uuid,
  '44000000-0000-4000-8000-000000000030'::uuid,
  'booth_rent',
  'active',
  '44000000-0000-4000-8000-000000000001'::uuid,
  '44000000-0000-4000-8000-000000000001'::uuid,
  pg_catalog.now(),
  '44000000-0000-4000-8000-000000000002'::uuid,
  pg_catalog.now(),
  pg_catalog.now()
);

select public.pr40_replace_barber_availability(
  '44000000-0000-4000-8000-000000000002'::uuid,
  '44000000-0000-4000-8000-000000000020'::uuid,
  '44000000-0000-4000-8000-000000000010'::uuid,
  'shop',
  '[{"weekday":3,"startTime":"11:00","endTime":"19:00"}]'::jsonb
);

do $shop_success$
begin
  if not exists (
    select 1
    from public.availability_rules rule
    where rule.barber_id = '44000000-0000-4000-8000-000000000020'::uuid
      and rule.location_id = '44000000-0000-4000-8000-000000000010'::uuid
      and rule.weekday = 3
      and rule.start_time = '11:00'::time
      and rule.end_time = '19:00'::time
  ) then
    raise exception 'Approved-shop availability replacement did not persist';
  end if;
end;
$shop_success$;

rollback;
