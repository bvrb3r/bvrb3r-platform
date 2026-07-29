begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a0000000-0000-4000-8000-000000000026',
    'authenticated',
    'authenticated',
    'pr26-barber@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'a0000000-0000-4000-8000-000000000027',
    'authenticated',
    'authenticated',
    'pr26-outsider@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, role, full_name, email)
values
  (
    'a0000000-0000-4000-8000-000000000026',
    'barber',
    'PR26 Barber',
    'pr26-barber@example.invalid'
  ),
  (
    'a0000000-0000-4000-8000-000000000027',
    'client',
    'PR26 Outsider',
    'pr26-outsider@example.invalid'
  )
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, name, neighborhood, city, state, owner_profile_id, app_approval_status
) values (
  'pr26-cert-shop',
  'PR26 Certification Shop',
  'Test',
  'Test',
  'NY',
  'a0000000-0000-4000-8000-000000000026',
  'approved'
);

insert into public.locations (
  id, name, neighborhood, city, state, reference_code
) values (
  'b0000000-0000-4000-8000-000000000026',
  'PR26 Certification Location',
  'Test',
  'Test',
  'NY',
  'pr26-cert-shop'
);

insert into public.barbers (
  id,
  profile_id,
  compensation_model,
  default_money_relationship,
  app_approval_status,
  shop_approval_status,
  status
) values (
  'c0000000-0000-4000-8000-000000000026',
  'a0000000-0000-4000-8000-000000000026',
  'autobooth_rent',
  'autobooth_rent',
  'approved',
  'approved',
  'active'
);

insert into public.staff_locations (
  id,
  profile_id,
  location_id,
  shop_id,
  routing_model,
  booth_rent_amount,
  booth_rent_frequency,
  autobooth_percent,
  relationship_status,
  approved_by_owner_at,
  approved_by_barber_at
) values (
  'd0000000-0000-4000-8000-000000000026',
  'a0000000-0000-4000-8000-000000000026',
  'b0000000-0000-4000-8000-000000000026',
  'pr26-cert-shop',
  'autobooth_rent',
  150,
  'weekly',
  0.20,
  'active',
  now(),
  now()
);

insert into public.shop_barber_relationships (
  id,
  shop_id,
  location_id,
  barber_id,
  staff_location_id,
  relationship_type,
  status,
  approved_by_owner_profile_id,
  approved_by_owner_at,
  approved_by_barber_profile_id,
  approved_by_barber_at,
  started_at,
  terms_snapshot
) values (
  'e0000000-0000-4000-8000-000000000026',
  'pr26-cert-shop',
  'b0000000-0000-4000-8000-000000000026',
  'c0000000-0000-4000-8000-000000000026',
  'd0000000-0000-4000-8000-000000000026',
  'autobooth_rent',
  'active',
  'a0000000-0000-4000-8000-000000000026',
  now(),
  'a0000000-0000-4000-8000-000000000026',
  now(),
  now() - interval '30 days',
  '{"certification":"pr26"}'::jsonb
);

insert into public.rent_agreements (
  id,
  relationship_id,
  shop_id,
  location_id,
  barber_id,
  version,
  model,
  status,
  rent_amount_cents,
  billing_frequency,
  autobooth_basis_points,
  grace_hours,
  late_fee_cents,
  cash_settlement_method,
  terms_snapshot,
  terms_hash,
  effective_at,
  owner_accepted_by,
  owner_accepted_at,
  barber_accepted_by,
  barber_accepted_at,
  created_by
) values (
  'f0000000-0000-4000-8000-000000000026',
  'e0000000-0000-4000-8000-000000000026',
  'pr26-cert-shop',
  'b0000000-0000-4000-8000-000000000026',
  'c0000000-0000-4000-8000-000000000026',
  1,
  'autobooth_rent',
  'active',
  15000,
  'weekly',
  2000,
  24,
  0,
  'manual_transfer_with_evidence',
  '{"certification":"pr26"}'::jsonb,
  repeat('a', 64),
  now() - interval '30 days',
  'a0000000-0000-4000-8000-000000000026',
  now() - interval '30 days',
  'a0000000-0000-4000-8000-000000000026',
  now() - interval '30 days',
  'a0000000-0000-4000-8000-000000000026'
);

insert into public.rent_obligations (
  id,
  agreement_id,
  relationship_id,
  shop_id,
  location_id,
  barber_id,
  period_start,
  period_end,
  due_at,
  base_rent_cents,
  amount_settled_cents,
  status
) values
  (
    '10000000-0000-4000-8000-000000000026',
    'f0000000-0000-4000-8000-000000000026',
    'e0000000-0000-4000-8000-000000000026',
    'pr26-cert-shop',
    'b0000000-0000-4000-8000-000000000026',
    'c0000000-0000-4000-8000-000000000026',
    current_date - 14,
    current_date - 8,
    now() - interval '8 days',
    10000,
    0,
    'overdue'
  ),
  (
    '20000000-0000-4000-8000-000000000026',
    'f0000000-0000-4000-8000-000000000026',
    'e0000000-0000-4000-8000-000000000026',
    'pr26-cert-shop',
    'b0000000-0000-4000-8000-000000000026',
    'c0000000-0000-4000-8000-000000000026',
    current_date - 7,
    current_date - 1,
    now() - interval '1 day',
    5000,
    0,
    'overdue'
  );

insert into public.shop_chairs (
  id, shop_id, location_id, label, assigned_barber_id
) values (
  '30000000-0000-4000-8000-000000000026',
  'pr26-cert-shop',
  'b0000000-0000-4000-8000-000000000026',
  'PR26 Chair',
  'c0000000-0000-4000-8000-000000000026'
);

select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000026',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000026","role":"authenticated"}',
  true
);

set local role authenticated;

do $cert$
declare
  first_request public.rent_payment_requests%rowtype;
  replay_request public.rent_payment_requests%rowtype;
begin
  select * into first_request
  from public.pr26_request_rent_payment(
    '20000000-0000-4000-8000-000000000026',
    'cash',
    5000,
    'pr26-cert-payment-latest'
  );

  if first_request.status <> 'pending'
     or first_request.applied_cents <> 5000
     or first_request.evidence_reference is not null then
    raise exception 'Cash request was not truthfully pending.';
  end if;

  select * into replay_request
  from public.pr26_request_rent_payment(
    '20000000-0000-4000-8000-000000000026',
    'cash',
    5000,
    'pr26-cert-payment-latest'
  );

  if replay_request.id <> first_request.id then
    raise exception 'Payment request idempotency failed.';
  end if;
end
$cert$;

reset role;

do $cert$
declare
  request_id uuid;
begin
  select id into request_id
  from public.rent_payment_requests
  where idempotency_key = 'pr26-cert-payment-latest';

  begin
    perform private.pr26_settle_rent_payment(
      request_id,
      null,
      null,
      'pr26-cert-no-evidence'
    );
    raise exception 'Cash settlement accepted without evidence.';
  exception
    when check_violation then
      if position('Cash remains pending' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  perform private.pr26_settle_rent_payment(
    request_id,
    'provider-pr26',
    'transfer-pr26-001',
    'pr26-cert-settlement'
  );

  if (
    select amount_settled_cents
    from public.rent_obligations
    where id = '20000000-0000-4000-8000-000000000026'
  ) <> 5000 then
    raise exception 'Cash settlement did not fund the exact obligation.';
  end if;
end
$cert$;

set local role authenticated;

do $cert$
declare
  contribution_id uuid;
  dispute_row public.rent_line_disputes%rowtype;
begin
  select settled_contribution_id into contribution_id
  from public.rent_payment_requests
  where idempotency_key = 'pr26-cert-payment-latest';

  select * into dispute_row
  from public.pr26_dispute_rent_line(
    contribution_id,
    'Transfer reference needs review',
    'evidence-pr26-001'
  );

  if dispute_row.held_cents <> 5000
     or (
       select amount_settled_cents
       from public.rent_obligations
       where id = '20000000-0000-4000-8000-000000000026'
     ) <> 0
     or (
       select amount_settled_cents
       from public.rent_obligations
       where id = '10000000-0000-4000-8000-000000000026'
     ) <> 0 then
    raise exception 'Line-only dispute hold changed the wrong ledger amount.';
  end if;

  begin
    perform public.pr26_apply_relationship_lifecycle(
      'e0000000-0000-4000-8000-000000000026',
      'pause',
      'Certification settle-first check',
      now() + interval '1 minute',
      'pr26-cert-blocked-pause',
      '{}'::jsonb
    );
    raise exception 'Pause bypassed unsettled rent.';
  exception
    when check_violation then
      if position('settle to $0.00' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$cert$;

reset role;

do $cert$
begin
  begin
    update public.shop_chairs
    set active = false
    where id = '30000000-0000-4000-8000-000000000026';
    raise exception 'Chair retirement bypassed unsettled rent.';
  exception
    when check_violation then
      if position('settle to $0.00' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$cert$;

do $cert$
declare
  dispute_id uuid;
begin
  select id into dispute_id
  from public.rent_line_disputes
  where evidence_reference = 'evidence-pr26-001';

  perform private.pr26_resolve_rent_line_dispute(
    dispute_id,
    'released',
    'Evidence confirmed',
    'pr26-cert-dispute-release'
  );

  update public.rent_obligations
  set amount_settled_cents = 10000,
      status = 'funded',
      funded_at = now(),
      updated_at = now()
  where id = '10000000-0000-4000-8000-000000000026';
end
$cert$;

set local role authenticated;

do $cert$
declare
  lifecycle_row public.rent_lifecycle_requests%rowtype;
begin
  select * into lifecycle_row
  from public.pr26_apply_relationship_lifecycle(
    'e0000000-0000-4000-8000-000000000026',
    'pause',
    'Certification settled pause',
    now() + interval '1 minute',
    'pr26-cert-applied-pause',
    '{}'::jsonb
  );

  if lifecycle_row.status <> 'applied'
     or lifecycle_row.remaining_cents_snapshot <> 0
     or lifecycle_row.pending_cents_snapshot <> 0
     or lifecycle_row.held_cents_snapshot <> 0 then
    raise exception 'Settled relationship did not produce an applied lifecycle record.';
  end if;
end
$cert$;

reset role;

do $cert$
begin
  if (
    select status
    from public.shop_barber_relationships
    where id = 'e0000000-0000-4000-8000-000000000026'
  ) <> 'suspended' then
    raise exception 'Settled relationship did not pause.';
  end if;
end
$cert$;

update public.shop_chairs
set active = false
where id = '30000000-0000-4000-8000-000000000026';

do $cert$
begin
  if (
    select active
    from public.shop_chairs
    where id = '30000000-0000-4000-8000-000000000026'
  ) then
    raise exception 'Settled chair did not retire.';
  end if;
end
$cert$;

select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000027',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000027","role":"authenticated"}',
  true
);
set local role authenticated;

do $cert$
begin
  if (select count(*) from public.rent_payment_requests) <> 0
     or (select count(*) from public.rent_line_disputes) <> 0
     or (select count(*) from public.rent_lifecycle_requests) <> 0 then
    raise exception 'Cross-user RLS exposed PR26 rent rows.';
  end if;

  begin
    insert into public.rent_payment_requests (
      obligation_id,
      agreement_id,
      shop_id,
      barber_id,
      payment_rail,
      requested_cents,
      applied_cents,
      idempotency_key,
      requested_by_profile_id
    ) values (
      '20000000-0000-4000-8000-000000000026',
      'f0000000-0000-4000-8000-000000000026',
      'pr26-cert-shop',
      'c0000000-0000-4000-8000-000000000026',
      'card',
      1,
      1,
      'pr26-illegal-direct-write',
      'a0000000-0000-4000-8000-000000000027'
    );
    raise exception 'Authenticated direct write was allowed.';
  exception
    when insufficient_privilege then null;
  end;
end
$cert$;

reset role;

rollback;

select jsonb_build_object(
  'cash_pending_until_evidence', 'Pass',
  'payment_idempotency', 'Pass',
  'line_only_dispute', 'Pass',
  'all_week_settle_first', 'Pass',
  'chair_settle_first', 'Pass',
  'settled_lifecycle', 'Pass',
  'cross_user_rls', 'Pass',
  'direct_write_revocation', 'Pass',
  'synthetic_rows_persisted', false
) as pr26_live_certification;
