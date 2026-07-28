-- Disposable semantic proof for PR23. Every fixture is rolled back.
begin;

insert into public.profiles (id, role, full_name, email) values
  ('a1000000-0000-4000-8000-000000000001', 'shop_owner_user', 'PR23 Owner', 'pr23-owner@example.test'),
  ('a2000000-0000-4000-8000-000000000002', 'barber_user', 'PR23 Booth Barber', 'pr23-booth@example.test'),
  ('a3000000-0000-4000-8000-000000000003', 'barber_user', 'PR23 AutoBooth Barber', 'pr23-auto@example.test');

insert into public.shops (
  id, name, neighborhood, city, state, owner_profile_id, public_username, app_approval_status
) values (
  'pr23-doctrine-shop', 'PR23 Doctrine Shop', 'Ybor', 'Tampa', 'FL',
  'a1000000-0000-4000-8000-000000000001', 'pr23-doctrine-shop', 'approved'
);

insert into public.locations (
  id, name, neighborhood, city, state, reference_code
) values (
  'a4000000-0000-4000-8000-000000000004',
  'PR23 Doctrine Location', 'Ybor', 'Tampa', 'FL', 'pr23-doctrine-shop'
);

insert into public.shop_operator_access (
  profile_id, shop_id, location_id, access_level, status, source
) values (
  'a1000000-0000-4000-8000-000000000001',
  'pr23-doctrine-shop',
  'a4000000-0000-4000-8000-000000000004',
  'owner', 'active', 'manual'
) on conflict do nothing;

insert into public.barbers (
  id, profile_id, compensation_model, commission_rate,
  default_money_relationship, reference_code
) values
  (
    'a5000000-0000-4000-8000-000000000005',
    'a2000000-0000-4000-8000-000000000002',
    'booth_rent', null, 'booth_rent', 'pr23-booth-barber'
  ),
  (
    'a6000000-0000-4000-8000-000000000006',
    'a3000000-0000-4000-8000-000000000003',
    'autobooth_rent', null, 'autobooth_rent', 'pr23-auto-barber'
  );

insert into public.shop_team_invites (
  id, shop_id, barber_id, barber_profile_id, invited_by_profile_id,
  status, approved_by_owner_at, routing_model,
  booth_rent_amount, booth_rent_frequency, autobooth_percent, message
) values
  (
    'a7000000-0000-4000-8000-000000000007',
    'a4000000-0000-4000-8000-000000000004',
    'a5000000-0000-4000-8000-000000000005',
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'invited', now(), 'booth_rent', 325.00, 'weekly', null,
    'PR23 Full Booth Rent proof.'
  ),
  (
    'a8000000-0000-4000-8000-000000000008',
    'a4000000-0000-4000-8000-000000000004',
    'a6000000-0000-4000-8000-000000000006',
    'a3000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000001',
    'invited', now(), 'autobooth_rent', 400.00, 'monthly', 0.2500,
    'PR23 AutoBooth Rent proof.'
  );

do $proof$
declare
  booth_activation jsonb;
  auto_activation jsonb;
  snapshot jsonb;
begin
  booth_activation := public.activate_shop_barber_relationship_internal(
    'a7000000-0000-4000-8000-000000000007',
    'a2000000-0000-4000-8000-000000000002',
    'barber'
  );

  if booth_activation->>'relationship_type' <> 'booth_rent'
     or not exists (
       select 1
       from public.compensation_rules c
       where c.id = (booth_activation->>'compensation_rule_id')::uuid
         and c.model = 'booth_rent'
         and c.booth_rent_amount_cents = 32500
         and c.booth_rent_frequency = 'weekly'
         and c.max_shop_charge_cents = 32500
         and c.autobooth_percent is null
         and c.barber_percent is null
         and c.shop_percent is null
         and c.is_active
     ) then
    raise exception 'Full Booth Rent activation proof failed';
  end if;

  auto_activation := public.activate_shop_barber_relationship_internal(
    'a8000000-0000-4000-8000-000000000008',
    'a3000000-0000-4000-8000-000000000003',
    'barber'
  );

  if auto_activation->>'relationship_type' <> 'autobooth_rent'
     or not exists (
       select 1
       from public.compensation_rules c
       where c.id = (auto_activation->>'compensation_rule_id')::uuid
         and c.model = 'autobooth_rent'
         and c.booth_rent_amount_cents = 40000
         and c.booth_rent_frequency = 'monthly'
         and c.max_shop_charge_cents = 40000
         and c.autobooth_percent = 0.2500
         and c.barber_percent is null
         and c.shop_percent is null
         and c.is_active
     )
     or not exists (
       select 1
       from public.staff_locations sl
       where sl.id = (auto_activation->>'staff_location_id')::uuid
         and sl.routing_model = 'autobooth_rent'
         and sl.autobooth_percent = 0.2500
         and sl.commission_rate is null
         and sl.barber_percent is null
         and sl.shop_percent is null
     ) then
    raise exception 'AutoBooth Rent activation proof failed';
  end if;

  snapshot := public.bvrb3r_pr23_retired_model_snapshot();
  if snapshot->>'status' <> 'pass'
     or snapshot->>'certifiable' <> 'true'
     or (snapshot->>'passedCount')::integer <> 8 then
    raise exception 'PR23 release truth snapshot failed: %', snapshot;
  end if;
end;
$proof$;

rollback;
