-- Disposable-shadow semantic certification for the updated PR22 doctrine.
-- The transaction always rolls back; any violated invariant aborts the test.
begin;

insert into public.profiles (id, role, full_name, email) values
  ('11111111-1111-4111-8111-111111111111', 'shop_owner_user', 'Doctrine Owner', 'doctrine-owner@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'barber_user', 'Doctrine Commission Barber', 'doctrine-commission@example.test'),
  ('23232323-2323-4232-8232-232323232323', 'barber_user', 'Doctrine Rent Barber', 'doctrine-rent@example.test'),
  ('24242424-2424-4242-8242-242424242424', 'barber_user', 'Doctrine Agreement Barber', 'doctrine-agreement@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'client_user', 'Doctrine Client', 'doctrine-client@example.test');

insert into public.shops (id, name, neighborhood, city, state, owner_profile_id, public_username)
values ('doctrine-test-shop', 'Doctrine Test Shop', 'Ybor', 'Tampa', 'FL',
  '11111111-1111-4111-8111-111111111111', 'doctrine-shop');

insert into public.locations (id, name, neighborhood, city, state, reference_code)
values ('44444444-4444-4444-8444-444444444444', 'Doctrine Test Location', 'Ybor', 'Tampa', 'FL', 'doctrine-test-shop');

insert into public.shop_operator_access (profile_id, shop_id, location_id, access_level, status, source)
values ('11111111-1111-4111-8111-111111111111', 'doctrine-test-shop',
  '44444444-4444-4444-8444-444444444444', 'owner', 'active', 'manual')
on conflict do nothing;

insert into public.barbers (id, profile_id, compensation_model, commission_rate, default_money_relationship, reference_code) values
  ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222',
    'commission', 0.60, 'freelance', 'doctrine-commission-barber'),
  ('56565656-5656-4565-8565-565656565656', '23232323-2323-4232-8232-232323232323',
    'booth_rent', null, 'freelance', 'doctrine-rent-barber'),
  ('57575757-5757-4575-8575-575757575757', '24242424-2424-4242-8242-242424242424',
    'freelance', null, 'freelance', 'doctrine-agreement-barber');

insert into public.shop_team_invites (
  id, shop_id, barber_id, barber_profile_id, invited_by_profile_id,
  status, approved_by_owner_at, routing_model, barber_percent, shop_percent, message
) values (
  '58585858-5858-4585-8585-585858585858', '44444444-4444-4444-8444-444444444444',
  '57575757-5757-4575-8575-575757575757', '24242424-2424-4242-8242-242424242424',
  '11111111-1111-4111-8111-111111111111', 'invited', now(), 'commission', 0.65, 0.35,
  'Atomic agreement semantic fixture.'
);

do $atomic_agreement_lifecycle$
declare
  activation jsonb;
  ending jsonb;
begin
  activation := public.activate_shop_barber_relationship_internal(
    '58585858-5858-4585-8585-585858585858',
    '24242424-2424-4242-8242-242424242424',
    'barber'
  );
  if activation->>'relationship_type' <> 'commission'
     or not exists (
       select 1 from public.compensation_rules c
       where c.id = (activation->>'compensation_rule_id')::uuid
         and c.version = 1 and c.is_active and c.barber_percent = 65 and c.shop_percent = 35
     ) then
    raise exception 'atomic bilateral agreement activation failed';
  end if;

  ending := public.end_shop_barber_relationship_internal(
    (activation->>'staff_location_id')::uuid,
    '24242424-2424-4242-8242-242424242424',
    'barber',
    'Semantic lifecycle complete.'
  );
  if ending->>'effective_routing_model' <> 'freelance'
     or exists (
       select 1 from public.compensation_rules c
       where c.relationship_id = (activation->>'relationship_id')::uuid and c.is_active
     ) then
    raise exception 'atomic bilateral agreement ending failed';
  end if;
end;
$atomic_agreement_lifecycle$;

insert into public.clients (id, profile_id, reference_code)
values ('66666666-6666-4666-8666-666666666666', '33333333-3333-4333-8333-333333333333', 'doctrine-client');

insert into public.services (id, location_id, category, name, duration_min, price, reference_code)
values ('77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444444',
  'Cut', 'Doctrine Cut', 45, 100, 'doctrine-cut');

insert into public.shop_barber_relationships (
  id, shop_id, location_id, barber_id, relationship_type, status,
  approved_by_owner_profile_id, approved_by_owner_at,
  approved_by_barber_profile_id, approved_by_barber_at, started_at, terms_snapshot
) values
  ('88888888-8888-4888-8888-888888888888', 'doctrine-test-shop',
    '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', 'commission', 'active',
    '11111111-1111-4111-8111-111111111111', now(), '22222222-2222-4222-8222-222222222222', now(), now(),
    '{"test":"commission"}'),
  ('89898989-8989-4898-8898-898989898989', 'doctrine-test-shop',
    '44444444-4444-4444-8444-444444444444', '56565656-5656-4565-8565-565656565656', 'booth_rent', 'active',
    '11111111-1111-4111-8111-111111111111', now(), '23232323-2323-4232-8232-232323232323', now(), now(),
    '{"test":"rent"}');

insert into public.compensation_rules (
  id, relationship_id, shop_id, location_id, barber_id, version, model,
  barber_percent, shop_percent, is_active, starts_at, created_by_profile_id
) values (
  '99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888', 'doctrine-test-shop',
  '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555',
  1, 'commission', 60, 40, true, now(), '11111111-1111-4111-8111-111111111111'
);

insert into public.compensation_rules (
  id, relationship_id, shop_id, location_id, barber_id, version, model,
  booth_rent_amount_cents, booth_rent_frequency, max_shop_charge_cents,
  is_active, starts_at, created_by_profile_id
) values (
  '90909090-9090-4909-8909-909090909090', '89898989-8989-4898-8898-898989898989', 'doctrine-test-shop',
  '44444444-4444-4444-8444-444444444444', '56565656-5656-4565-8565-565656565656',
  1, 'booth_rent', 32500, 'weekly', 32500, true, now(), '11111111-1111-4111-8111-111111111111'
);

insert into public.appointments (
  id, location_id, shop_id, barber_id, client_id, service_id, status, source, booking_source,
  starts_at, ends_at, confirmation_code, total_amount, service_total, subtotal, grand_total, balance_due
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444',
  '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777',
  'completed', 'booking', 'booking', now() + interval '1 hour', now() + interval '1 hour 45 minutes',
  'DOCTRINE1', 110, 100, 100, 110, 0
);

do $appointment_snapshot$
declare
  appointment_row public.appointments%rowtype;
begin
  select * into appointment_row from public.appointments where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if appointment_row.relationship_type_snapshot <> 'commission'
     or appointment_row.shop_barber_relationship_id <> '88888888-8888-4888-8888-888888888888'
     or appointment_row.compensation_rule_id <> '99999999-9999-4999-8999-999999999999'
     or appointment_row.barber_percent_snapshot <> 60
     or appointment_row.shop_percent_snapshot <> 40 then
    raise exception 'appointment compensation snapshot failed';
  end if;

  begin
    update public.appointments set shop_percent_snapshot = 41 where id = appointment_row.id;
    raise exception 'appointment snapshot mutation was allowed';
  exception when check_violation then
    null;
  end;
end;
$appointment_snapshot$;

insert into public.payments (
  id, appointment_id, client_id, shop_id, barber_id, amount, type, provider, status,
  provider_payment_intent_id, currency, payment_status, payment_type, paid_at
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555', 110, 'booking', 'stripe', 'captured',
  'pi_doctrine_commission', 'usd', 'captured', 'booking', now()
);

insert into public.payment_routing_records (
  id, payment_id, appointment_id, shop_barber_relationship_id, compensation_rule_id,
  routing_model, payout_recipient_type, provider_gross_amount, provider_net_amount,
  service_amount, tip_amount, platform_fee_amount, barber_percent_snapshot, shop_percent_snapshot,
  barber_payout_amount, shop_split_amount, payout_readiness_status, money_routing_status
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999', 'commission', 'split', 110, 110,
  100, 10, 5, 60, 40, 67, 38, 'not_ready', 'ready_for_payout'
);

do $commission_math$
declare
  ledger_row public.commission_ledger%rowtype;
begin
  select * into ledger_row from public.commission_ledger
  where payment_routing_record_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  if ledger_row.shop_commission_amount <> 38
     or ledger_row.barber_service_amount <> 57
     or ledger_row.tip_amount <> 10 then
    raise exception 'commission ledger service/tip split failed';
  end if;
end;
$commission_math$;

insert into public.booth_rent_charges (
  id, shop_id, location_id, barber_id, relationship_id, compensation_rule_id,
  period_start, period_end, due_at, amount_cents, max_charge_cents, amount_paid_cents,
  status, idempotency_key, charged_at, paid_at
) values (
  'dededede-dede-4ded-8ded-dededededede', 'doctrine-test-shop', '44444444-4444-4444-8444-444444444444',
  '56565656-5656-4565-8565-565656565656', '89898989-8989-4898-8898-898989898989',
  '90909090-9090-4909-8909-909090909090', current_date, current_date + 6, now(),
  32500, 32500, 32500, 'paid', 'doctrine-rent-period', now(), now()
);

do $optional_setup_gate$
begin
  if to_regclass('public.shop_setup_states') is not null then
    execute $setup_insert$
      insert into public.shop_setup_states (
        location_id, shop_identity_ready, location_ready, business_hours_ready,
        services_ready, team_ready, payments_ready, payout_ready, tax_ready,
        booking_policies_ready, kiosk_device_paired, kiosk_pin_ready,
        notifications_ready, updated_by_profile_id
      ) values (
        '44444444-4444-4444-8444-444444444444', true, true, true,
        true, true, true, true, true, true, true, true, true,
        '11111111-1111-4111-8111-111111111111'
      )
      on conflict (location_id) do update set
        shop_identity_ready = true,
        location_ready = true,
        business_hours_ready = true,
        services_ready = true,
        team_ready = true,
        payments_ready = true,
        payout_ready = true,
        tax_ready = true,
        booking_policies_ready = true,
        kiosk_device_paired = true,
        kiosk_pin_ready = true,
        notifications_ready = true
    $setup_insert$;
  end if;
end;
$optional_setup_gate$;

insert into public.kiosk_settings (
  id, owner_profile_id, scope, target_reference, pin_hash, health_status, payment_collection_policy
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111',
  'shop', 'doctrine-shop', 'pbkdf2:test', 'healthy', 'barber_checkout'
);

insert into public.kiosk_sessions (
  id, kiosk_setting_id, shop_id, location_id, session_token_hash, mode, status,
  started_at, last_activity_at, expires_at
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'doctrine-test-shop', '44444444-4444-4444-8444-444444444444', repeat('a', 64),
  'shop_owner', 'active', now(), now(), now() + interval '75 seconds'
);

insert into public.shop_walkin_rotation (
  id, shop_id, location_id, barber_id, relationship_id, position, status
) values (
  'f1111111-1111-4111-8111-111111111111', 'doctrine-test-shop', '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555', '88888888-8888-4888-8888-888888888888', 1, 'active'
);

insert into public.kiosk_rotation_assignments (
  id, kiosk_session_id, shop_id, location_id, barber_id, routing_type, status, idempotency_key, confirmed_at
) values (
  'f2222222-2222-4222-8222-222222222222', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'doctrine-test-shop', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555',
  'picked_barber', 'confirmed', 'doctrine-direct', now()
);

do $direct_rotation$
begin
  if (select last_assigned_at is not null from public.shop_walkin_rotation
      where id = 'f1111111-1111-4111-8111-111111111111') then
    raise exception 'direct booking changed rotation';
  end if;
end;
$direct_rotation$;

insert into public.kiosk_rotation_assignments (
  id, kiosk_session_id, shop_id, location_id, barber_id, rotation_entry_id,
  routing_type, status, idempotency_key, confirmed_at
) values (
  'f3333333-3333-4333-8333-333333333333', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'doctrine-test-shop', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555',
  'f1111111-1111-4111-8111-111111111111', 'next_available_rotation', 'confirmed', 'doctrine-next', now()
);

do $final_certification$
begin
  if not (select last_assigned_at is not null from public.shop_walkin_rotation
          where id = 'f1111111-1111-4111-8111-111111111111') then
    raise exception 'confirmed next-available did not advance rotation';
  end if;
  if (public.bvrb3r_pr22_master_truth_snapshot()->>'status') <> 'pass' then
    raise exception 'master truth snapshot failed with semantic fixtures';
  end if;
end;
$final_certification$;

rollback;
