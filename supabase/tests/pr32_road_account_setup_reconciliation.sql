-- Executable certification for the PR32 account-setup truth migration.
-- Run only against an isolated local/preview database after all migrations.
-- Every mutation is enclosed by this transaction and rolled back.

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $catalog_contract$
declare
  catalog_count integer;
  owner_set_zero text[];
begin
  select count(distinct achievement_key)
  into catalog_count
  from public.road_set_rules rule
  cross join lateral unnest(rule.required_achievement_keys) achievement_key;

  if catalog_count <> 71 then
    raise exception 'Expected 71 unique Road achievements, found %.', catalog_count;
  end if;

  select required_achievement_keys
  into owner_set_zero
  from public.road_set_rules
  where role = 'shop_owner_user'
    and set_index = 0;

  if owner_set_zero is distinct from array[
    'owner.account_created',
    'owner.contact_verified',
    'owner.shop_identity_completed',
    'owner.shop_hours_set'
  ]::text[] then
    raise exception 'Owner SET 0 does not match the canonical setup contract.';
  end if;
end;
$catalog_contract$;

do $function_contract$
declare
  missing_function text;
begin
  select signature
  into missing_function
  from unnest(array[
    'private.pr32_lock_road_identity(uuid,text)',
    'private.pr32_contact_truth(uuid)',
    'private.pr32_valid_owner_hours(jsonb)',
    'private.pr32_payout_truth(uuid,text)',
    'private.pr32_road_setup_checks(uuid,text)',
    'private.pr32_replay_road_events_locked(uuid,text)',
    'private.pr32_lock_road_event_evidence()',
    'public.pr32_get_road_setup_checks(uuid,text)',
    'public.pr32_claim_matching_clientbridge_history(uuid)',
    'public.pr32_reconcile_road_setup(uuid,text)',
    'public.pr32_record_road_event(uuid,text,uuid)'
  ]::text[]) signature
  where to_regprocedure(signature) is null
  limit 1;

  if missing_function is not null then
    raise exception 'Missing Road account-setup function: %.', missing_function;
  end if;
end;
$function_contract$;

do $production_definition_hashes$
declare
  definition record;
begin
  for definition in
    select *
    from (values
      ('private.pr32_contact_truth(uuid)', 'df0d93b0d64d2caaeb2f664813a66ae1'),
      ('private.pr32_lock_road_event_evidence()', 'c0844e3eccd2ac8e0235b818af5e0094'),
      ('private.pr32_lock_road_identity(uuid,text)', '0d10f0bca052c59402b8232c2fb2ac09'),
      ('private.pr32_payout_truth(uuid,text)', '74a30af4a580d047242f470eed2dfa06'),
      ('private.pr32_replay_road_events_locked(uuid,text)', '98fbfc21b3f29ab27e498b8a773a3d9f'),
      ('private.pr32_road_setup_checks(uuid,text)', '00cad0ff2e0d90c5812dd7436e113906'),
      ('private.pr32_valid_owner_hours(jsonb)', '7911202ac0120931ff5881506a01a4c8'),
      ('public.pr32_claim_matching_clientbridge_history(uuid)', 'c95989ad35872b860a23392e40642745'),
      ('public.pr32_get_road_setup_checks(uuid,text)', '98baa6bbf778233cb4c23c304f01b226'),
      ('public.pr32_reconcile_road_setup(uuid,text)', '92ed9b51b59e23f1c52c7a7d2e72a555'),
      ('public.pr32_record_road_event(uuid,text,uuid)', 'b127cd9e9c1831233948a4c8ccc8b53f')
    ) expected(signature, definition_md5)
  loop
    if md5(pg_get_functiondef(to_regprocedure(definition.signature)))
       <> definition.definition_md5 then
      raise exception 'Road function definition drifted: %.', definition.signature;
    end if;
  end loop;
end;
$production_definition_hashes$;

do $setup_key_contract$
declare
  setup_definition text;
  emitted_keys text[];
begin
  setup_definition := pg_get_functiondef(
    'private.pr32_road_setup_checks(uuid,text)'::regprocedure
  );

  select array_agg(match[1] order by ordinal)
  into emitted_keys
  from regexp_matches(
    setup_definition,
    'achievement_key := ''([^'']+)''',
    'g'
  ) with ordinality as parsed(match, ordinal);

  if emitted_keys is distinct from array[
    'client.account_created',
    'client.contact_verified',
    'client.username_claimed',
    'client.guest_visits_claimed',
    'client.profile_completed',
    'client.payment_method_saved',
    'barber.account_created',
    'barber.username_claimed',
    'barber.contact_verified',
    'barber.license_verified',
    'barber.payout_connected',
    'barber.menu_built',
    'barber.availability_published',
    'barber.profile_published',
    'owner.account_created',
    'owner.contact_verified',
    'owner.shop_identity_completed',
    'owner.shop_hours_set',
    'owner.business_verified',
    'owner.stripe_connected',
    'owner.policies_published',
    'owner.shop_profile_published'
  ]::text[] then
    raise exception 'Road setup function does not emit the canonical 22 keys: %.', emitted_keys;
  end if;
end;
$setup_key_contract$;

do $contact_contract$
declare
  definition text := pg_get_functiondef(
    'private.pr32_contact_truth(uuid)'::regprocedure
  );
begin
  if position('auth_user.email_confirmed_at is not null' in definition) = 0
     or position('auth_user.phone_confirmed_at is not null' in definition) = 0
     or position('profile.phone_verified_at is not null' in definition) = 0
     or position('nullif(btrim(auth_user.email), '''') is not null' in definition) = 0 then
    raise exception 'Contact truth no longer requires confirmed email and confirmed phone evidence.';
  end if;
end;
$contact_contract$;

do $owner_hours_positive$
begin
  if not private.pr32_valid_owner_hours(
    '{"version":1,"source":"owner_settings","weekly":[{"weekday":1,"startTime":"09:00","endTime":"17:00"}]}'::jsonb
  ) then
    raise exception 'The canonical owner-hours writer shape was rejected.';
  end if;
end;
$owner_hours_positive$;

do $owner_hours_negatives$
begin
  if private.pr32_valid_owner_hours(
    '{"version":1,"source":"owner_settings","weekly":[]}'::jsonb
  ) then
    raise exception 'Empty owner hours unexpectedly passed.';
  end if;
  if private.pr32_valid_owner_hours(
    '{"version":1,"source":"owner_settings","weekly":[{"weekday":1,"startTime":"17:00","endTime":"09:00"}]}'::jsonb
  ) then
    raise exception 'Backwards owner hours unexpectedly passed.';
  end if;
  if private.pr32_valid_owner_hours(
    '{"version":1,"source":"owner_settings","weekly":[{"weekday":1,"startTime":"09:00","endTime":"17:00"},{"weekday":1,"startTime":"10:00","endTime":"18:00"}]}'::jsonb
  ) then
    raise exception 'Duplicate owner weekdays unexpectedly passed.';
  end if;
  if private.pr32_valid_owner_hours(
    '{"version":1,"source":"owner_settings","weekly":[{"weekday":1,"startTime":"09:00","endTime":"17:00"}],"owner_confirmation_required":true}'::jsonb
  ) then
    raise exception 'Placeholder/extra owner-hours keys unexpectedly passed.';
  end if;
end;
$owner_hours_negatives$;

do $client_truth_contract$
declare
  definition text := pg_get_functiondef(
    'private.pr32_road_setup_checks(uuid,text)'::regprocedure
  );
begin
  if position('invitation.expires_at > pg_catalog.now()' in definition) = 0
     or position('onboarding.completed_steps @> ''["client_profile","client_preferences"]''::jsonb' in definition) = 0
     or position('finish_client_onboarding_profile_and_preferences' in definition) = 0
     or position('add_client_profile_photo' in definition) = 0
     or position('repair_client_profile_projection' in definition) = 0
     or position('method.provider in (''stripe'', ''square'')' in definition) = 0
     or position('method.exp_month >= extract(month from current_date)::integer' in definition) = 0 then
    raise exception 'Client setup truth drifted from current guest/onboarding/payment records.';
  end if;
end;
$client_truth_contract$;

do $no_self_attestation_shortcuts$
declare
  definition text := pg_get_functiondef(
    'private.pr32_road_setup_checks(uuid,text)'::regprocedure
  );
begin
  if definition ilike '%setup_evidence%'
     or definition ilike '%shop_setup_gates%' then
    raise exception 'Road setup truth trusts a self-attested setup shortcut.';
  end if;
end;
$no_self_attestation_shortcuts$;

do $payout_contract$
declare
  definition text := pg_get_functiondef(
    'private.pr32_payout_truth(uuid,text)'::regprocedure
  );
begin
  if position('binding.binding_status = ''active''' in definition) = 0
     or position('account.provider_environment = ''live''' in definition) = 0
     or position('account.charges_enabled' in definition) = 0
     or position('account.payouts_enabled' in definition) = 0
     or position('account.requirements_currently_due = ''[]''::jsonb' in definition) = 0
     or position('account.requirements_past_due = ''[]''::jsonb' in definition) = 0
     or position('verification.can_receive_payouts' in definition) = 0
     or position('verification.overall_status' in definition) > 0
     or position('verification.public_verified' in definition) > 0 then
    raise exception 'Stored live payout component truth drifted.';
  end if;
end;
$payout_contract$;

do $license_contract$
declare
  definition text := pg_get_functiondef(
    'private.pr32_road_setup_checks(uuid,text)'::regprocedure
  );
begin
  if (select count(*) from regexp_matches(definition, 'license\.category = ''license_verification''', 'g')) <> 3
     or (select count(*) from regexp_matches(definition, 'license\.expiration_date >= current_date', 'g')) <> 2
     or position('join public.barber_verifications license' in definition) = 0
     or position('''pending'', ''in_progress'', ''submitted'', ''under_review''' in definition) = 0 then
    raise exception 'License completion/pending truth is not tied to current underlying evidence.';
  end if;
end;
$license_contract$;

do $business_contract$
declare
  definition text := pg_get_functiondef(
    'private.pr32_road_setup_checks(uuid,text)'::regprocedure
  );
begin
  if (select count(*) from regexp_matches(
       definition,
       'business\.category in \(''business_verification'', ''ownership_verification''\)',
       'g'
     )) <> 3
     or position('join public.shop_verifications business' in definition) = 0
     or position('business.shop_reference = shop_row.id' in definition) = 0 then
    raise exception 'Business completion/pending truth is not tied to owned-shop evidence.';
  end if;
end;
$business_contract$;

do $barber_marketplace_contract$
declare
  definition text := pg_get_functiondef(
    'private.pr32_road_setup_checks(uuid,text)'::regprocedure
  );
begin
  if position('barber_row.app_approval_status::text = ''approved''' in definition) = 0
     or position('barber_row.is_bookable' in definition) = 0
     or position('barber_row.is_discoverable' in definition) = 0
     or position('visibility.accepts_instant_bookings' in definition) = 0
     or position('barber_status.accepting_bookings' in definition) = 0
     or position('service.duration_min >= 15' in definition) = 0
     or position('barber_availability_complete' in definition) = 0
     or position('activation.status = ''live''' in definition) = 0 then
    raise exception 'Barber publication no longer requires canonical marketplace eligibility.';
  end if;
end;
$barber_marketplace_contract$;

do $owner_publication_contract$
declare
  definition text := pg_get_functiondef(
    'private.pr32_road_setup_checks(uuid,text)'::regprocedure
  );
begin
  if position('private.pr32_valid_owner_hours(shop_row.public_hours)' in definition) = 0
     or position('private.pr32_valid_owner_hours(location_row.hours)' in definition) = 0
     or position('shop_row.public_hours = location_row.hours' in definition) = 0
     or position('length(btrim(coalesce(shop_row.policies, ''''))) >= 20' in definition) = 0
     or position('location_row.geo_point is not null' in definition) = 0 then
    raise exception 'Owner setup truth no longer requires hours, policies, and verified location.';
  end if;
end;
$owner_publication_contract$;

do $claim_contract$
declare
  definition text := pg_get_functiondef(
    'public.pr32_claim_matching_clientbridge_history(uuid)'::regprocedure
  );
begin
  if position('private.pr19_actor_is_trusted_writer()' in definition) = 0
     or position('confirmed email and confirmed phone are required before claiming history' in definition) = 0
     or position('invitation.expires_at <= pg_catalog.now()' in definition) = 0
     or position('invitation.expires_at > pg_catalog.now()' in definition) = 0
     or position('''status'', ''already_resolved''' in definition) = 0
     or position('matching guest history has conflicting live queue entries' in definition) = 0
     or position('update public.appointments appointment' in definition) = 0
     or position('update public.waitlist_entries queue_entry' in definition) = 0
     or position('update public.chairsync_appointments chairsync' in definition) = 0
     or position('update public.clientbridge_consent_events consent' in definition) = 0 then
    raise exception 'ClientBridge verified-contact claim contract drifted.';
  end if;
end;
$claim_contract$;

do $replay_contract$
declare
  replay_definition text := pg_get_functiondef(
    'private.pr32_replay_road_events_locked(uuid,text)'::regprocedure
  );
  reconcile_definition text := pg_get_functiondef(
    'public.pr32_reconcile_road_setup(uuid,text)'::regprocedure
  );
begin
  if position('setup_check.status <> ''complete''' in replay_definition) = 0
     or position('set_rule.set_index > first_incomplete_setup_set' in replay_definition) = 0
     or position('set_rule.set_index = first_incomplete_setup_set' in replay_definition) = 0
     or position('event.source <> ''ui''' in replay_definition) = 0
     or position('road:setup-truth:v1:' in reconcile_definition) = 0
     or position('road setup event idempotency collision' in reconcile_definition) = 0 then
    raise exception 'Sequential locked Road replay/reconcile contract drifted.';
  end if;
end;
$replay_contract$;

do $privilege_contract$
declare
  signature text;
begin
  foreach signature in array array[
    'public.pr32_get_road_setup_checks(uuid,text)',
    'public.pr32_claim_matching_clientbridge_history(uuid)',
    'public.pr32_reconcile_road_setup(uuid,text)',
    'public.pr32_record_road_event(uuid,text,uuid)'
  ]::text[]
  loop
    if has_function_privilege('anon', signature, 'execute')
       or has_function_privilege('authenticated', signature, 'execute')
       or not has_function_privilege('service_role', signature, 'execute') then
      raise exception 'Road RPC privilege drift: %.', signature;
    end if;
  end loop;

  foreach signature in array array[
    'private.pr32_lock_road_identity(uuid,text)',
    'private.pr32_contact_truth(uuid)',
    'private.pr32_valid_owner_hours(jsonb)',
    'private.pr32_payout_truth(uuid,text)',
    'private.pr32_road_setup_checks(uuid,text)',
    'private.pr32_replay_road_events_locked(uuid,text)',
    'private.pr32_lock_road_event_evidence()'
  ]::text[]
  loop
    if has_function_privilege('service_role', signature, 'execute') then
      raise exception 'Private Road helper is directly executable by service_role: %.', signature;
    end if;
  end loop;
end;
$privilege_contract$;

do $trigger_contract$
begin
  if not exists (
    select 1
    from pg_trigger trigger
    where trigger.tgrelid = 'public.platform_events'::regclass
      and trigger.tgname = 'pr32_lock_road_event_evidence'
      and not trigger.tgisinternal
      and trigger.tgenabled <> 'D'
  ) then
    raise exception 'Road platform-event evidence trigger is missing or disabled.';
  end if;
end;
$trigger_contract$;

-- Executable ClientBridge claim fixture: both contact factors, email + phone
-- matching, expiry, merge ownership, Road completion, and retry idempotence.
insert into auth.users (
  id,
  aud,
  role,
  email,
  phone,
  email_confirmed_at,
  phone_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_anonymous
) values (
  '32999999-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'road-claim-certification@example.com',
  '+18135550199',
  now(),
  null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"role":"client_user","full_name":"Road Claim Certification"}'::jsonb,
  now(),
  now(),
  false
);

insert into public.profiles (
  id,
  role,
  full_name,
  email,
  phone,
  phone_verified_at
) values (
  '32999999-0000-4000-8000-000000000001',
  'client_user',
  'Road Claim Certification',
  'road-claim-certification@example.com',
  '+18135550199',
  null
)
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    phone_verified_at = excluded.phone_verified_at;

insert into public.clients (id, profile_id, reference_code)
values
  (
    '32999999-0000-4000-8000-000000000011',
    '32999999-0000-4000-8000-000000000001',
    'road-claim-target'
  ),
  (
    '32999999-0000-4000-8000-000000000012',
    null,
    'road-claim-guest'
  );

insert into public.payment_methods (
  client_id,
  provider,
  provider_payment_method_id,
  brand,
  last4,
  exp_month,
  exp_year,
  is_default
) values (
  '32999999-0000-4000-8000-000000000011',
  'mock',
  'pm_road_expired_mock',
  'mock',
  '0000',
  1,
  extract(year from current_date)::integer - 1,
  false
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_anonymous
) values (
  '32999999-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'road-claim-barber@example.com',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"role":"barber_user","full_name":"Road Claim Barber"}'::jsonb,
  now(),
  now(),
  false
);

insert into public.profiles (id, role, full_name, email)
values (
  '32999999-0000-4000-8000-000000000002',
  'barber_user',
  'Road Claim Barber',
  'road-claim-barber@example.com'
)
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.barbers (id, profile_id, compensation_model, reference_code)
values (
  '32999999-0000-4000-8000-000000000013',
  '32999999-0000-4000-8000-000000000002',
  'freelance',
  'road-claim-barber'
);

insert into public.verification_profiles (
  id,
  user_id,
  role,
  overall_status,
  license_status,
  public_verified
) values (
  '32999999-0000-4000-8000-000000000051',
  '32999999-0000-4000-8000-000000000002',
  'barber',
  'unverified',
  'approved',
  false
);

insert into public.barber_verifications (
  id,
  barber_reference,
  category,
  legal_name,
  expiration_date,
  verification_status,
  verification_reviewed_at,
  user_id,
  verification_profile_id,
  last_reviewed_at
) values (
  'road-certification-license',
  '32999999-0000-4000-8000-000000000013',
  'license_verification',
  'Road Claim Barber',
  current_date + 365,
  'approved',
  now(),
  '32999999-0000-4000-8000-000000000002',
  '32999999-0000-4000-8000-000000000051',
  now()
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_anonymous
) values (
  '32999999-0000-4000-8000-000000000003',
  'authenticated',
  'authenticated',
  'road-claim-owner@example.com',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"role":"shop_owner_user","full_name":"Road Claim Owner"}'::jsonb,
  now(),
  now(),
  false
);

insert into public.profiles (id, role, full_name, email)
values (
  '32999999-0000-4000-8000-000000000003',
  'shop_owner_user',
  'Road Claim Owner',
  'road-claim-owner@example.com'
)
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id,
  name,
  neighborhood,
  city,
  state,
  owner_profile_id
) values (
  'road-certification-owner-shop',
  'Road Certification Owner Shop',
  'Certification',
  'Tampa',
  'FL',
  '32999999-0000-4000-8000-000000000003'
);

insert into public.verification_profiles (
  id,
  user_id,
  role,
  overall_status,
  business_status,
  public_verified,
  can_create_shop_listing
) values (
  '32999999-0000-4000-8000-000000000052',
  '32999999-0000-4000-8000-000000000003',
  'shop_owner',
  'unverified',
  'approved',
  false,
  false
);

insert into public.shop_verifications (
  id,
  shop_reference,
  category,
  business_name,
  verification_status,
  verification_reviewed_at,
  user_id,
  verification_profile_id,
  last_reviewed_at
) values (
  'road-certification-business',
  'road-certification-owner-shop',
  'business_verification',
  'Road Certification Owner Shop',
  'approved',
  now(),
  '32999999-0000-4000-8000-000000000003',
  '32999999-0000-4000-8000-000000000052',
  now()
);

do $component_scoped_verification_is_complete$
begin
  if (
    select setup_check.status
    from public.pr32_get_road_setup_checks(
      '32999999-0000-4000-8000-000000000002',
      'barber_user'
    ) setup_check
    where setup_check.achievement_key = 'barber.license_verified'
  ) <> 'complete' then
    raise exception 'Approved current license was blocked by unrelated verification components.';
  end if;

  if (
    select setup_check.status
    from public.pr32_get_road_setup_checks(
      '32999999-0000-4000-8000-000000000003',
      'shop_owner_user'
    ) setup_check
    where setup_check.achievement_key = 'owner.business_verified'
  ) <> 'complete' then
    raise exception 'Approved owned-shop business evidence was blocked by unrelated components.';
  end if;
end;
$component_scoped_verification_is_complete$;

update public.barber_verifications
set expiration_date = current_date - 1
where id = 'road-certification-license';

do $expired_license_is_not_current_truth$
begin
  if (
    select setup_check.status
    from public.pr32_get_road_setup_checks(
      '32999999-0000-4000-8000-000000000002',
      'barber_user'
    ) setup_check
    where setup_check.achievement_key = 'barber.license_verified'
  ) <> 'action_required' then
    raise exception 'Expired license evidence unexpectedly completed setup truth.';
  end if;
end;
$expired_license_is_not_current_truth$;

update public.barber_verifications
set expiration_date = current_date + 365,
    verification_status = 'pending',
    verification_submitted_at = now()
where id = 'road-certification-license';

update public.verification_profiles
set license_status = 'unverified'
where id = '32999999-0000-4000-8000-000000000051';

update public.shop_verifications
set verification_status = 'pending',
    verification_submitted_at = now()
where id = 'road-certification-business';

update public.verification_profiles
set business_status = 'unverified'
where id = '32999999-0000-4000-8000-000000000052';

do $matching_underlying_submissions_are_pending_review$
begin
  if (
    select setup_check.status
    from public.pr32_get_road_setup_checks(
      '32999999-0000-4000-8000-000000000002',
      'barber_user'
    ) setup_check
    where setup_check.achievement_key = 'barber.license_verified'
  ) <> 'pending_review' then
    raise exception 'Matching pending license row was not surfaced as pending review.';
  end if;

  if (
    select setup_check.status
    from public.pr32_get_road_setup_checks(
      '32999999-0000-4000-8000-000000000003',
      'shop_owner_user'
    ) setup_check
    where setup_check.achievement_key = 'owner.business_verified'
  ) <> 'pending_review' then
    raise exception 'Matching pending business row was not surfaced as pending review.';
  end if;
end;
$matching_underlying_submissions_are_pending_review$;

update public.barber_verifications
set verification_status = 'approved',
    verification_reviewed_at = now(),
    last_reviewed_at = now()
where id = 'road-certification-license';

update public.verification_profiles
set license_status = 'approved'
where id = '32999999-0000-4000-8000-000000000051';

update public.shop_verifications
set verification_status = 'approved',
    verification_reviewed_at = now(),
    last_reviewed_at = now()
where id = 'road-certification-business';

update public.verification_profiles
set business_status = 'approved'
where id = '32999999-0000-4000-8000-000000000052';

insert into public.locations (id, name, neighborhood, city, state, reference_code)
values (
  '32999999-0000-4000-8000-000000000014',
  'Road Claim Location',
  'Certification',
  'Tampa',
  'FL',
  'independent-32999999-0000-4000-8000-000000000013'
);

insert into public.staff_locations (
  id,
  profile_id,
  location_id,
  shop_id,
  routing_model,
  relationship_status,
  approved_by_owner_at,
  ended_at
) values (
  '32999999-0000-4000-8000-000000000016',
  '32999999-0000-4000-8000-000000000002',
  '32999999-0000-4000-8000-000000000014',
  null,
  'freelance',
  'active',
  null,
  null
);

insert into public.availability_rules (
  barber_id,
  location_id,
  weekday,
  start_time,
  end_time
) values (
  '32999999-0000-4000-8000-000000000013',
  '32999999-0000-4000-8000-000000000014',
  1,
  '09:00',
  '17:00'
);

do $legacy_active_independent_availability_is_reachable$
begin
  if (
    select setup_check.status
    from public.pr32_get_road_setup_checks(
      '32999999-0000-4000-8000-000000000002',
      'barber_user'
    ) setup_check
    where setup_check.achievement_key = 'barber.availability_published'
  ) <> 'complete' then
    raise exception 'Strict legacy active freelance availability was not reachable.';
  end if;
end;
$legacy_active_independent_availability_is_reachable$;

insert into public.barber_setup_activations (
  barber_id,
  status,
  activated_at,
  activated_by_profile_id
) values (
  '32999999-0000-4000-8000-000000000013',
  'live',
  now(),
  '32999999-0000-4000-8000-000000000002'
);

do $activation_alone_does_not_publish_profile$
begin
  if (
    select setup_check.status
    from public.pr32_get_road_setup_checks(
      '32999999-0000-4000-8000-000000000002',
      'barber_user'
    ) setup_check
    where setup_check.achievement_key = 'barber.profile_published'
  ) <> 'action_required' then
    raise exception 'Legacy activation alone bypassed canonical marketplace eligibility.';
  end if;
end;
$activation_alone_does_not_publish_profile$;

insert into public.services (
  id,
  location_id,
  category,
  name,
  duration_min,
  price,
  service_owner_type,
  barber_reference
) values (
  '32999999-0000-4000-8000-000000000015',
  '32999999-0000-4000-8000-000000000014',
  'Haircut',
  'Road Claim Cut',
  30,
  35,
  'barber',
  '32999999-0000-4000-8000-000000000013'
);

insert into public.appointments (
  id,
  location_id,
  barber_id,
  client_id,
  service_id,
  status,
  source,
  starts_at,
  ends_at,
  confirmation_code,
  booking_source
) values (
  '32999999-0000-4000-8000-000000000031',
  '32999999-0000-4000-8000-000000000014',
  '32999999-0000-4000-8000-000000000013',
  '32999999-0000-4000-8000-000000000012',
  '32999999-0000-4000-8000-000000000015',
  'booked',
  'booking',
  now() + interval '2 days',
  now() + interval '2 days 30 minutes',
  'ROADCLAIM01',
  'app'
);

insert into public.waitlist_entries (
  id,
  location_id,
  client_id,
  service_id,
  status,
  queue_source
) values (
  '32999999-0000-4000-8000-000000000032',
  '32999999-0000-4000-8000-000000000014',
  '32999999-0000-4000-8000-000000000012',
  '32999999-0000-4000-8000-000000000015',
  'cancelled',
  'manual'
);

insert into public.chairsync_appointments (
  id,
  provider,
  provider_appointment_id,
  location_id,
  barber_id,
  linked_client_id,
  starts_at,
  ends_at,
  service_name,
  client_display_name,
  status,
  payment_owner
) values (
  '32999999-0000-4000-8000-000000000033',
  'booksy',
  'road-claim-external-appointment',
  '32999999-0000-4000-8000-000000000014',
  '32999999-0000-4000-8000-000000000013',
  '32999999-0000-4000-8000-000000000012',
  now() + interval '3 days',
  now() + interval '3 days 30 minutes',
  'Road Claim Cut',
  'Road Claim Guest',
  'booked',
  'external:booksy'
);

insert into public.clientbridge_consent_events (
  id,
  client_id,
  waitlist_entry_id,
  chairsync_appointment_id,
  consent_kind,
  granted,
  channel,
  source_provider
) values (
  '32999999-0000-4000-8000-000000000034',
  '32999999-0000-4000-8000-000000000012',
  '32999999-0000-4000-8000-000000000032',
  '32999999-0000-4000-8000-000000000033',
  'clientbridge_invite',
  true,
  'sms',
  'booksy'
);

insert into public.clientbridge_invitations (
  id,
  client_id,
  waitlist_entry_id,
  chairsync_appointment_id,
  source_provider,
  contact_channel,
  contact_value,
  token_hash,
  status,
  consent_event_id,
  expires_at
) values
  (
    '32999999-0000-4000-8000-000000000021',
    '32999999-0000-4000-8000-000000000012',
    '32999999-0000-4000-8000-000000000032',
    '32999999-0000-4000-8000-000000000033',
    'booksy',
    'email',
    'road-claim-certification@example.com',
    repeat('1', 64),
    'pending',
    '32999999-0000-4000-8000-000000000034',
    now() + interval '1 day'
  ),
  (
    '32999999-0000-4000-8000-000000000022',
    '32999999-0000-4000-8000-000000000012',
    null,
    null,
    'booksy',
    'sms',
    '(813) 555-0199',
    repeat('2', 64),
    'opened',
    null,
    now() + interval '1 day'
  ),
  (
    '32999999-0000-4000-8000-000000000023',
    '32999999-0000-4000-8000-000000000012',
    null,
    null,
    'booksy',
    'email',
    'road-claim-certification@example.com',
    repeat('3', 64),
    'pending',
    null,
    now() - interval '1 minute'
  );

do $unverified_contact_rejected$
begin
  begin
    perform public.pr32_claim_matching_clientbridge_history(
      '32999999-0000-4000-8000-000000000001'
    );
    raise exception 'An account without a confirmed phone unexpectedly claimed history.';
  exception
    when sqlstate '23514' then null;
  end;
end;
$unverified_contact_rejected$;

update auth.users
set phone_confirmed_at = now(),
    updated_at = now()
where id = '32999999-0000-4000-8000-000000000001';

do $matching_history_claimed$
declare
  claim_result jsonb;
begin
  claim_result := public.pr32_claim_matching_clientbridge_history(
    '32999999-0000-4000-8000-000000000001'
  );

  if claim_result ->> 'status' <> 'claimed'
     or (claim_result ->> 'invitationsClaimed')::integer <> 2
     or (claim_result ->> 'sourceClientsMerged')::integer <> 1
     or (claim_result ->> 'appointmentsMerged')::integer <> 1
     or (claim_result ->> 'queueEntriesMerged')::integer <> 1
     or (claim_result ->> 'chairSyncAppointmentsMerged')::integer <> 1
     or (claim_result ->> 'consentEventsMerged')::integer <> 1 then
    raise exception 'Verified-contact claim returned unexpected counts: %.', claim_result;
  end if;

  if (
    select count(*)
    from public.clientbridge_invitations invitation
    where invitation.id in (
      '32999999-0000-4000-8000-000000000021',
      '32999999-0000-4000-8000-000000000022'
    )
      and invitation.status = 'claimed'
      and invitation.claimed_profile_id = '32999999-0000-4000-8000-000000000001'
      and invitation.client_id = '32999999-0000-4000-8000-000000000011'
  ) <> 2 then
    raise exception 'All unexpired matching invitations were not claimed to the canonical client.';
  end if;

  if not exists (
    select 1
    from public.clientbridge_invitations invitation
    where invitation.id = '32999999-0000-4000-8000-000000000023'
      and invitation.status = 'expired'
      and invitation.claimed_profile_id is null
      and invitation.client_id = '32999999-0000-4000-8000-000000000012'
  ) then
    raise exception 'Expired invitation was resurrected or not expired.';
  end if;

  if not exists (
    select 1 from public.appointments appointment
    where appointment.id = '32999999-0000-4000-8000-000000000031'
      and appointment.client_id = '32999999-0000-4000-8000-000000000011'
  ) or not exists (
    select 1 from public.waitlist_entries queue_entry
    where queue_entry.id = '32999999-0000-4000-8000-000000000032'
      and queue_entry.client_id = '32999999-0000-4000-8000-000000000011'
  ) or not exists (
    select 1 from public.chairsync_appointments chairsync
    where chairsync.id = '32999999-0000-4000-8000-000000000033'
      and chairsync.linked_client_id = '32999999-0000-4000-8000-000000000011'
  ) or not exists (
    select 1 from public.clientbridge_consent_events consent
    where consent.id = '32999999-0000-4000-8000-000000000034'
      and consent.client_id = '32999999-0000-4000-8000-000000000011'
  ) then
    raise exception 'ClientBridge claim did not merge all canonical history ownership.';
  end if;
end;
$matching_history_claimed$;

do $claim_retry_is_idempotent$
declare
  retry_result jsonb;
begin
  retry_result := public.pr32_claim_matching_clientbridge_history(
    '32999999-0000-4000-8000-000000000001'
  );

  if retry_result ->> 'status' <> 'already_resolved'
     or (retry_result ->> 'invitationsClaimed')::integer <> 0
     or (retry_result ->> 'sourceClientsMerged')::integer <> 0 then
    raise exception 'Claim retry was not idempotent: %.', retry_result;
  end if;
end;
$claim_retry_is_idempotent$;

insert into public.clients (id, profile_id, reference_code)
values (
  '32999999-0000-4000-8000-000000000017',
  null,
  'road-claim-conflict-guest'
);

insert into public.waitlist_entries (
  id,
  location_id,
  client_id,
  service_id,
  status,
  queue_source
) values
  (
    '32999999-0000-4000-8000-000000000035',
    '32999999-0000-4000-8000-000000000014',
    '32999999-0000-4000-8000-000000000011',
    '32999999-0000-4000-8000-000000000015',
    'active',
    'manual'
  ),
  (
    '32999999-0000-4000-8000-000000000036',
    '32999999-0000-4000-8000-000000000014',
    '32999999-0000-4000-8000-000000000017',
    '32999999-0000-4000-8000-000000000015',
    'active',
    'manual'
  );

insert into public.clientbridge_invitations (
  id,
  client_id,
  source_provider,
  contact_channel,
  contact_value,
  token_hash,
  status,
  expires_at
) values (
  '32999999-0000-4000-8000-000000000024',
  '32999999-0000-4000-8000-000000000017',
  'booksy',
  'email',
  'road-claim-certification@example.com',
  repeat('4', 64),
  'pending',
  now() + interval '1 day'
);

do $conflicting_live_queue_rolls_back_claim$
begin
  begin
    perform public.pr32_claim_matching_clientbridge_history(
      '32999999-0000-4000-8000-000000000001'
    );
    raise exception 'A conflicting live queue merge unexpectedly succeeded.';
  exception
    when sqlstate '23505' then null;
  end;

  if not exists (
    select 1
    from public.clientbridge_invitations invitation
    where invitation.id = '32999999-0000-4000-8000-000000000024'
      and invitation.status = 'pending'
      and invitation.claimed_profile_id is null
      and invitation.client_id = '32999999-0000-4000-8000-000000000017'
  ) or (
    select count(*)
    from public.waitlist_entries queue_entry
    where queue_entry.id in (
      '32999999-0000-4000-8000-000000000035',
      '32999999-0000-4000-8000-000000000036'
    )
      and queue_entry.status = 'active'
  ) <> 2 then
    raise exception 'Conflicting claim did not roll back every ownership mutation.';
  end if;
end;
$conflicting_live_queue_rolls_back_claim$;

delete from public.clientbridge_invitations
where id = '32999999-0000-4000-8000-000000000024';

delete from public.waitlist_entries
where id in (
  '32999999-0000-4000-8000-000000000035',
  '32999999-0000-4000-8000-000000000036'
);

delete from public.clients
where id = '32999999-0000-4000-8000-000000000017';

do $claimed_history_completes_setup_truth$
begin
  if (
    select setup_check.status
    from public.pr32_get_road_setup_checks(
      '32999999-0000-4000-8000-000000000001',
      'client_user'
    ) setup_check
    where setup_check.achievement_key = 'client.guest_visits_claimed'
  ) <> 'complete' then
    raise exception 'Claimed/no-pending ClientBridge history did not complete Road setup truth.';
  end if;
end;
$claimed_history_completes_setup_truth$;

do $expired_mock_payment_does_not_complete_setup$
begin
  if (
    select setup_check.status
    from public.pr32_get_road_setup_checks(
      '32999999-0000-4000-8000-000000000001',
      'client_user'
    ) setup_check
    where setup_check.achievement_key = 'client.payment_method_saved'
  ) <> 'action_required' then
    raise exception 'Expired mock payment method unexpectedly completed setup truth.';
  end if;
end;
$expired_mock_payment_does_not_complete_setup$;

do $missing_onboarding_routes_to_client_onboarding$
declare
  profile_reason text;
begin
  select setup_check.reason
  into profile_reason
  from public.pr32_get_road_setup_checks(
    '32999999-0000-4000-8000-000000000001',
    'client_user'
  ) setup_check
  where setup_check.achievement_key = 'client.profile_completed';

  if profile_reason <> 'finish_client_onboarding_profile_and_preferences' then
    raise exception 'Missing Client onboarding returned the wrong reason: %.', profile_reason;
  end if;
end;
$missing_onboarding_routes_to_client_onboarding$;

do $reconcile_is_idempotent_before_set_completion$
declare
  first_result jsonb;
  second_result jsonb;
begin
  first_result := public.pr32_reconcile_road_setup(
    '32999999-0000-4000-8000-000000000001',
    'client_user'
  );
  second_result := public.pr32_reconcile_road_setup(
    '32999999-0000-4000-8000-000000000001',
    'client_user'
  );

  if jsonb_array_length(first_result -> 'checks') <> 6
     or (first_result ->> 'recordedCount')::integer <> 3
     or (first_result ->> 'badgesEarned')::integer <> 0
     or (second_result ->> 'recordedCount')::integer <> 0
     or (second_result ->> 'badgesEarned')::integer <> 0 then
    raise exception 'Setup reconciliation was not deterministic/idempotent: first %, second %.',
      first_result,
      second_result;
  end if;

  if exists (
    select 1 from public.badges badge
    where badge.user_id = '32999999-0000-4000-8000-000000000001'
  ) then
    raise exception 'Incomplete Client SET 0 unexpectedly earned a badge.';
  end if;
end;
$reconcile_is_idempotent_before_set_completion$;

insert into public.platform_events (
  id,
  event_type,
  entity_type,
  entity_id,
  actor_id,
  actor_role,
  source,
  related_ids,
  payload,
  occurred_at
) values
  (
    '32999999-0000-4000-8000-000000000041',
    'client.first_booking_created',
    'road_certification',
    '32999999-0000-4000-8000-000000000001',
    '32999999-0000-4000-8000-000000000001',
    'client_user',
    'system',
    '{"road_user_id":"32999999-0000-4000-8000-000000000001","road_role":"client_user"}'::jsonb,
    '{}'::jsonb,
    now()
  ),
  (
    '32999999-0000-4000-8000-000000000042',
    'client.first_cut_completed',
    'road_certification',
    '32999999-0000-4000-8000-000000000001',
    '32999999-0000-4000-8000-000000000001',
    'client_user',
    'system',
    '{"road_user_id":"32999999-0000-4000-8000-000000000001","road_role":"client_user"}'::jsonb,
    '{}'::jsonb,
    now()
  ),
  (
    '32999999-0000-4000-8000-000000000043',
    'client.first_review_published',
    'road_certification',
    '32999999-0000-4000-8000-000000000001',
    '32999999-0000-4000-8000-000000000001',
    'client_user',
    'system',
    '{"road_user_id":"32999999-0000-4000-8000-000000000001","road_role":"client_user"}'::jsonb,
    '{}'::jsonb,
    now()
  ),
  (
    '32999999-0000-4000-8000-000000000044',
    'client.first_barber_favorited',
    'road_certification',
    '32999999-0000-4000-8000-000000000001',
    '32999999-0000-4000-8000-000000000001',
    'client_user',
    'system',
    '{"road_user_id":"32999999-0000-4000-8000-000000000001","road_role":"client_user"}'::jsonb,
    '{}'::jsonb,
    now()
  );

do $out_of_order_event_is_deferred$
declare
  record_result jsonb;
begin
  record_result := public.pr32_record_road_event(
    '32999999-0000-4000-8000-000000000001',
    'client_user',
    '32999999-0000-4000-8000-000000000041'
  );

  if record_result ->> 'status' <> 'deferred'
     or exists (
       select 1 from public.road_progress progress
       where progress.user_id = '32999999-0000-4000-8000-000000000001'
         and progress.achievement_key = 'client.first_booking_created'
     ) then
    raise exception 'Later-set evidence bypassed incomplete Client SET 0: %.', record_result;
  end if;
end;
$out_of_order_event_is_deferred$;

update public.profiles
set public_username = 'roadclaimcert',
    updated_at = now()
where id = '32999999-0000-4000-8000-000000000001';

insert into public.public_usernames (username, owner_type, owner_id)
values (
  'roadclaimcert',
  'client',
  '32999999-0000-4000-8000-000000000001'
);

do $set_zero_repair_replays_but_does_not_badge_incomplete_set_one$
declare
  reconcile_result jsonb;
begin
  reconcile_result := public.pr32_reconcile_road_setup(
    '32999999-0000-4000-8000-000000000001',
    'client_user'
  );

  if (reconcile_result ->> 'badgesEarned')::integer <> 1
     or not exists (
       select 1 from public.badges badge
       where badge.user_id = '32999999-0000-4000-8000-000000000001'
         and badge.role = 'client_user'
         and badge.set_index = 0
     )
     or exists (
       select 1 from public.badges badge
       where badge.user_id = '32999999-0000-4000-8000-000000000001'
         and badge.role = 'client_user'
         and badge.set_index = 1
     )
     or (
       select count(*) from public.road_progress progress
       where progress.user_id = '32999999-0000-4000-8000-000000000001'
         and progress.achievement_key in (
           'client.first_booking_created',
           'client.first_cut_completed',
           'client.first_review_published',
           'client.first_barber_favorited'
         )
     ) <> 4 then
    raise exception 'Repair did not retain later evidence while locking incomplete SET 1: %.',
      reconcile_result;
  end if;
end;
$set_zero_repair_replays_but_does_not_badge_incomplete_set_one$;

insert into public.user_onboarding_states (
  user_id,
  role,
  status,
  current_step,
  completed_steps,
  completed_at
) values (
  '32999999-0000-4000-8000-000000000001',
  'client',
  'completed',
  'complete',
  '["client_profile","client_preferences"]'::jsonb,
  now()
);

do $completed_onboarding_without_photo_routes_to_profile_photo$
declare
  profile_reason text;
begin
  select setup_check.reason
  into profile_reason
  from public.pr32_get_road_setup_checks(
    '32999999-0000-4000-8000-000000000001',
    'client_user'
  ) setup_check
  where setup_check.achievement_key = 'client.profile_completed';

  if profile_reason <> 'add_client_profile_photo' then
    raise exception 'Photo-only Client setup gap returned the wrong reason: %.', profile_reason;
  end if;
end;
$completed_onboarding_without_photo_routes_to_profile_photo$;

update public.profiles
set profile_photo_path = 'road-certification/client.jpg',
    updated_at = now()
where id = '32999999-0000-4000-8000-000000000001';

insert into public.payment_methods (
  client_id,
  provider,
  provider_customer_id,
  provider_payment_method_id,
  brand,
  last4,
  exp_month,
  exp_year,
  is_default
) values (
  '32999999-0000-4000-8000-000000000011',
  'stripe',
  'cus_road_certification',
  'pm_road_certification',
  'visa',
  '4242',
  12,
  extract(year from current_date)::integer + 1,
  true
);

do $setup_repair_awards_set_one_after_all_current_truth$
declare
  reconcile_result jsonb;
begin
  reconcile_result := public.pr32_reconcile_road_setup(
    '32999999-0000-4000-8000-000000000001',
    'client_user'
  );

  if (reconcile_result ->> 'recordedCount')::integer <> 2
     or (reconcile_result ->> 'badgesEarned')::integer <> 1
     or not exists (
       select 1 from public.badges badge
       where badge.user_id = '32999999-0000-4000-8000-000000000001'
         and badge.role = 'client_user'
         and badge.set_index = 1
     ) then
    raise exception 'Current setup repair did not deterministically replay SET 1: %.',
      reconcile_result;
  end if;
end;
$setup_repair_awards_set_one_after_all_current_truth$;

update public.profiles
set profile_photo_path = null,
    updated_at = now()
where id = '32999999-0000-4000-8000-000000000001';

do $historical_badge_survives_current_truth_regression$
declare
  reconcile_result jsonb;
begin
  reconcile_result := public.pr32_reconcile_road_setup(
    '32999999-0000-4000-8000-000000000001',
    'client_user'
  );

  if (reconcile_result ->> 'badgesEarned')::integer <> 0
     or not exists (
       select 1 from public.badges badge
       where badge.user_id = '32999999-0000-4000-8000-000000000001'
         and badge.role = 'client_user'
         and badge.set_index = 1
     )
     or (
       select setup_check.status
       from public.pr32_get_road_setup_checks(
         '32999999-0000-4000-8000-000000000001',
         'client_user'
       ) setup_check
       where setup_check.achievement_key = 'client.profile_completed'
     ) <> 'action_required' then
    raise exception 'Historical badge/current setup regression semantics drifted: %.',
      reconcile_result;
  end if;
end;
$historical_badge_survives_current_truth_regression$;

do $event_evidence_immutability$
declare
  event_id uuid;
begin
  insert into public.platform_events (
    event_type,
    entity_type,
    entity_id,
    source,
    related_ids,
    payload,
    idempotency_key
  ) values (
    'client.account_created',
    'road_setup_truth',
    'road-certification-user',
    'system',
    '{"road_user_id":"road-certification-user","road_role":"client_user"}'::jsonb,
    '{"truth_version":1}'::jsonb,
    'road:setup-truth:v1:road-certification-user:client_user:client.account_created'
  ) returning id into event_id;

  begin
    update public.platform_events
    set payload = payload || '{"tampered":true}'::jsonb
    where id = event_id;
    raise exception 'Road setup evidence update unexpectedly succeeded.';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    delete from public.platform_events where id = event_id;
    raise exception 'Road setup evidence delete unexpectedly succeeded.';
  exception
    when sqlstate '55000' then null;
  end;
end;
$event_evidence_immutability$;

do $progress_badge_lock_contract$
begin
  if not exists (
    select 1 from pg_trigger trigger
    where trigger.tgrelid = 'public.road_progress'::regclass
      and trigger.tgname = 'pr32_lock_road_progress'
      and not trigger.tgisinternal
      and trigger.tgenabled <> 'D'
  ) or not exists (
    select 1 from pg_trigger trigger
    where trigger.tgrelid = 'public.badges'::regclass
      and trigger.tgname = 'pr32_lock_badge'
      and not trigger.tgisinternal
      and trigger.tgenabled <> 'D'
  ) then
    raise exception 'Road progress/badge immutability triggers are missing or disabled.';
  end if;
end;
$progress_badge_lock_contract$;

rollback;
