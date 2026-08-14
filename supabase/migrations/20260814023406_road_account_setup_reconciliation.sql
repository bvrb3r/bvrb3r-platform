-- Road account-setup truth and repair/backfill contract.
-- The application invokes reconciliation before each Road/Home summary read.
-- Setup producer routes do not yet invoke reconciliation after their writes.
-- Server-authored canonical records remain the only completion authority.

begin;

update public.road_set_rules
set required_achievement_keys = array[
  'owner.account_created',
  'owner.contact_verified',
  'owner.shop_identity_completed',
  'owner.shop_hours_set'
]::text[]
where role = 'shop_owner_user'
  and set_index = 0;

CREATE OR REPLACE FUNCTION private.pr32_lock_road_identity(p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_role not in ('client_user', 'barber_user', 'shop_owner_user') then
    raise exception 'unsupported road role' using errcode = '22023';
  end if;

  perform 1
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.id = p_user_id
    and profile.role::text = p_role
    and auth_user.deleted_at is null
    and not coalesce(auth_user.is_anonymous, false)
  for update of profile;

  if not found then
    raise exception 'road identity does not match a live auth-backed canonical profile role'
      using errcode = '23514';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.pr32_contact_truth(p_user_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when nullif(btrim(auth_user.email), '') is not null
      and auth_user.email_confirmed_at is not null
      and (
        (
          nullif(btrim(auth_user.phone), '') is not null
          and auth_user.phone_confirmed_at is not null
        )
        or
        (
          nullif(btrim(profile.phone), '') is not null
          and profile.phone_verified_at is not null
        )
      )
    then greatest(
      auth_user.email_confirmed_at,
      auth_user.phone_confirmed_at,
      profile.phone_verified_at
    )
    else null
  end
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.id = p_user_id
    and auth_user.deleted_at is null
    and not coalesce(auth_user.is_anonymous, false);
$function$;

CREATE OR REPLACE FUNCTION private.pr32_valid_owner_hours(p_hours jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  schedule_entry jsonb;
  weekday_value text;
  seen_weekdays text[] := array[]::text[];
begin
  if p_hours is null
     or pg_catalog.jsonb_typeof(p_hours) <> 'object'
     or p_hours @> '{"version":1,"source":"owner_settings"}'::jsonb is not true
     or (
       select count(*)
       from pg_catalog.jsonb_object_keys(p_hours)
     ) <> 3
     or pg_catalog.jsonb_typeof(p_hours -> 'weekly') <> 'array'
     or pg_catalog.jsonb_array_length(p_hours -> 'weekly') not between 1 and 7 then
    return false;
  end if;

  for schedule_entry in
    select entry.value
    from pg_catalog.jsonb_array_elements(p_hours -> 'weekly') entry(value)
  loop
    if pg_catalog.jsonb_typeof(schedule_entry) <> 'object'
       or (
         select count(*)
         from pg_catalog.jsonb_object_keys(schedule_entry)
       ) <> 3
       or (schedule_entry ->> 'weekday') !~ '^[0-6]$'
       or (schedule_entry ->> 'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (schedule_entry ->> 'endTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (schedule_entry ->> 'endTime') <= (schedule_entry ->> 'startTime') then
      return false;
    end if;

    weekday_value := schedule_entry ->> 'weekday';
    if weekday_value = any(seen_weekdays) then
      return false;
    end if;
    seen_weekdays := pg_catalog.array_append(seen_weekdays, weekday_value);
  end loop;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.pr32_payout_truth(p_user_id uuid, p_role text)
 RETURNS TABLE(complete boolean, pending boolean, observed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with subject_accounts as (
    select account.*
    from public.connected_accounts account
    join public.barbers barber
      on p_role = 'barber_user'
     and barber.profile_id = p_user_id
     and account.subject_type = 'barber'
     and account.barber_id = barber.id

    union all

    select account.*
    from public.connected_accounts account
    join public.shops shop
      on p_role = 'shop_owner_user'
     and shop.owner_profile_id = p_user_id
    join public.locations location
      on location.reference_code = shop.id
    where account.subject_type = 'shop'
      and account.shop_id = location.id
  ),
  verified_payout as (
    select 1
    from public.verification_profiles verification
    where verification.user_id = p_user_id
      and verification.role::text = case p_role
        when 'barber_user' then 'barber'
        when 'shop_owner_user' then 'shop_owner'
        else '__unsupported__'
      end
      and verification.payout_status::text in ('approved', 'verified')
      and verification.can_receive_payouts
  ),
  ready as (
    select greatest(account.updated_at, binding.attached_at) as observed_at
    from subject_accounts account
    join public.connected_account_provider_bindings binding
      on binding.connected_account_id = account.id
     and binding.provider = account.provider
     and binding.provider_account_id = account.provider_account_id
     and binding.provider_environment = account.provider_environment
     and binding.binding_generation = account.provider_account_generation
     and binding.binding_status = 'active'
    where account.provider = 'stripe_connect'
      and nullif(btrim(account.provider_account_id), '') is not null
      and account.provider_environment = 'live'
      and account.onboarding_status = 'verified'
      and account.payout_readiness_status = 'ready'
      and account.legal_readiness_status = 'accepted'
      and account.tax_readiness_status = 'verified'
      and account.charges_enabled
      and account.payouts_enabled
      and account.provider_payout_block_reason is null
      and account.disabled_reason is null
      and account.requirements_currently_due = '[]'::jsonb
      and account.requirements_past_due = '[]'::jsonb
      and exists (select 1 from verified_payout)
  )
  select
    exists (select 1 from ready),
    not exists (select 1 from ready)
      and exists (
        select 1
        from subject_accounts account
        where account.onboarding_status in ('invited', 'pending', 'submitted', 'restricted')
      ),
    (select max(ready.observed_at) from ready);
$function$;

CREATE OR REPLACE FUNCTION private.pr32_road_setup_checks(p_user_id uuid, p_role text)
 RETURNS TABLE(achievement_key text, status text, reason text, observed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  profile_row public.profiles%rowtype;
  auth_created_at timestamptz;
  auth_email text;
  auth_phone text;
  auth_email_confirmed_at timestamptz;
  auth_phone_confirmed_at timestamptz;
  verified_email text;
  verified_phone text;
  contact_time timestamptz;
  client_row public.clients%rowtype;
  barber_row public.barbers%rowtype;
  barber_profile_row public.barber_profiles%rowtype;
  shop_row public.shops%rowtype;
  location_row public.locations%rowtype;
  check_complete boolean := false;
  check_pending boolean := false;
  evidence_time timestamptz;
  supporting_count integer := 0;
  normalized_phone text;
  barber_availability_complete boolean := false;
begin
  if p_role not in ('client_user', 'barber_user', 'shop_owner_user') then
    raise exception 'unsupported road role' using errcode = '22023';
  end if;

  select profile.*
  into profile_row
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.id = p_user_id
    and profile.role::text = p_role
    and auth_user.deleted_at is null
    and not coalesce(auth_user.is_anonymous, false);

  if not found then
    raise exception 'road identity does not match a live auth-backed canonical profile role'
      using errcode = '23514';
  end if;

  select
    auth_user.created_at,
    auth_user.email,
    auth_user.phone,
    auth_user.email_confirmed_at,
    auth_user.phone_confirmed_at
  into
    auth_created_at,
    auth_email,
    auth_phone,
    auth_email_confirmed_at,
    auth_phone_confirmed_at
  from auth.users auth_user
  where auth_user.id = p_user_id;

  contact_time := private.pr32_contact_truth(p_user_id);
  verified_email := case
    when nullif(btrim(auth_email), '') is not null
      and auth_email_confirmed_at is not null
    then lower(btrim(auth_email))
    else null
  end;
  verified_phone := case
    when nullif(btrim(auth_phone), '') is not null
      and auth_phone_confirmed_at is not null
    then auth_phone
    when nullif(btrim(profile_row.phone), '') is not null
      and profile_row.phone_verified_at is not null
    then profile_row.phone
    else null
  end;
  normalized_phone := nullif(
    pg_catalog.regexp_replace(
      coalesce(verified_phone, ''),
      '[^0-9]',
      '',
      'g'
    ),
    ''
  );

  if p_role = 'client_user' then
    select client.*
    into client_row
    from public.clients client
    where client.profile_id = p_user_id
    order by client.created_at, client.id
    limit 1;

    achievement_key := 'client.account_created';
    status := case when client_row.id is not null then 'complete' else 'action_required' end;
    reason := case when client_row.id is not null
      then 'auth_backed_client_account_linked'
      else 'finish_client_account_setup'
    end;
    observed_at := case when client_row.id is not null
      then greatest(auth_created_at, profile_row.created_at, client_row.created_at)
      else null
    end;
    return next;

    achievement_key := 'client.contact_verified';
    status := case when contact_time is not null then 'complete' else 'action_required' end;
    reason := case when contact_time is not null
      then 'verified_email_and_phone_found'
      else 'verify_email_and_phone'
    end;
    observed_at := contact_time;
    return next;

    select username.updated_at
    into evidence_time
    from public.public_usernames username
    where username.owner_type = 'client'
      and username.owner_id = p_user_id::text
      and nullif(btrim(profile_row.public_username), '') is not null
      and username.username = lower(btrim(profile_row.public_username));
    achievement_key := 'client.username_claimed';
    status := case when evidence_time is not null then 'complete' else 'action_required' end;
    reason := case when evidence_time is not null
      then 'registry_matches_client_username'
      else 'claim_public_username'
    end;
    observed_at := evidence_time;
    return next;

    select max(invitation.claimed_at)
    into evidence_time
    from public.clientbridge_invitations invitation
    where invitation.claimed_profile_id = p_user_id
      and invitation.status = 'claimed';

    select exists (
      select 1
      from public.clientbridge_invitations invitation
      where invitation.claimed_profile_id is null
        and invitation.status in ('pending', 'queued', 'sent', 'opened')
        and invitation.expires_at > pg_catalog.now()
        and (
          (
            invitation.contact_channel = 'email'
            and verified_email is not null
            and lower(btrim(invitation.contact_value)) = verified_email
          )
          or (
            invitation.contact_channel = 'sms'
            and normalized_phone is not null
            and nullif(
              pg_catalog.regexp_replace(invitation.contact_value, '[^0-9]', '', 'g'),
              ''
            ) = normalized_phone
          )
        )
    ) into check_pending;
    check_complete := not check_pending;
    reason := case
      when check_pending then 'claim_available_guest_visit_history'
      when evidence_time is not null then 'guest_visit_history_claimed'
      else 'no_claimable_guest_history'
    end;
    evidence_time := case when check_complete
      then coalesce(evidence_time, greatest(auth_created_at, profile_row.created_at))
      else null
    end;
    achievement_key := 'client.guest_visits_claimed';
    status := case when check_complete then 'complete' else 'action_required' end;
    observed_at := evidence_time;
    return next;

    select greatest(onboarding.updated_at, onboarding.completed_at)
    into evidence_time
    from public.user_onboarding_states onboarding
    where onboarding.user_id = p_user_id
      and onboarding.role::text = 'client'
      and onboarding.status = 'completed'
      and onboarding.completed_at is not null
      and pg_catalog.jsonb_typeof(onboarding.completed_steps) = 'array'
      and pg_catalog.jsonb_array_length(onboarding.completed_steps) = 2
      and onboarding.completed_steps @> '["client_profile","client_preferences"]'::jsonb
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(onboarding.completed_steps) step(value)
        where step.value not in ('client_profile', 'client_preferences')
      )
    order by onboarding.updated_at desc, onboarding.id
    limit 1;
    check_complete := evidence_time is not null
      and client_row.id is not null
      and nullif(btrim(profile_row.full_name), '') is not null
      and (
        nullif(btrim(profile_row.profile_photo_path), '') is not null
        or nullif(btrim(profile_row.profile_photo_url), '') is not null
      );
    achievement_key := 'client.profile_completed';
    status := case when check_complete then 'complete' else 'action_required' end;
    reason := case when check_complete
      then 'validated_client_onboarding_and_photo_complete'
      when evidence_time is null
        then 'finish_client_onboarding_profile_and_preferences'
      when nullif(btrim(profile_row.profile_photo_path), '') is null
        and nullif(btrim(profile_row.profile_photo_url), '') is null
        then 'add_client_profile_photo'
      else 'repair_client_profile_projection'
    end;
    observed_at := case when check_complete
      then greatest(profile_row.created_at, evidence_time)
      else null
    end;
    return next;

    -- The canonical wallet stores a provider method reference, brand, and
    -- expiration but no provider-fetched status timestamp. This achievement is
    -- deliberately labeled as current stored state, not a live Stripe probe.
    select max(method.updated_at)
    into evidence_time
    from public.payment_methods method
    where method.client_id = client_row.id
      and method.provider in ('stripe', 'square')
      and nullif(btrim(method.provider_payment_method_id), '') is not null
      and method.exp_month between 1 and 12
      and method.exp_year is not null
      and (
        method.exp_year > extract(year from current_date)::integer
        or (
          method.exp_year = extract(year from current_date)::integer
          and method.exp_month >= extract(month from current_date)::integer
        )
      );
    achievement_key := 'client.payment_method_saved';
    status := case when evidence_time is not null then 'complete' else 'action_required' end;
    reason := case when evidence_time is not null
      then 'stored_unexpired_provider_payment_method_found'
      else 'save_unexpired_stripe_or_square_payment_method'
    end;
    observed_at := evidence_time;
    return next;
    return;
  end if;

  if p_role = 'barber_user' then
    select barber.*
    into barber_row
    from public.barbers barber
    where barber.profile_id = p_user_id
    order by barber.created_at, barber.id
    limit 1;

    if barber_row.id is not null then
      select barber_profile.*
      into barber_profile_row
      from public.barber_profiles barber_profile
      where barber_profile.barber_reference in (
        barber_row.id::text,
        p_user_id::text,
        coalesce(barber_row.reference_code, ''),
        coalesce(barber_row.booking_slug, '')
      )
      order by
        case when barber_profile.barber_reference = barber_row.reference_code then 0 else 1 end,
        barber_profile.created_at,
        barber_profile.id
      limit 1;
    end if;

    achievement_key := 'barber.account_created';
    status := case when barber_row.id is not null then 'complete' else 'action_required' end;
    reason := case when barber_row.id is not null
      then 'auth_backed_barber_account_linked'
      else 'finish_barber_account_setup'
    end;
    observed_at := case when barber_row.id is not null
      then greatest(auth_created_at, profile_row.created_at, barber_row.created_at)
      else null
    end;
    return next;

    select username.updated_at
    into evidence_time
    from public.public_usernames username
    where username.owner_type = 'barber'
      and username.owner_id = barber_profile_row.barber_reference
      and nullif(btrim(barber_profile_row.username), '') is not null
      and username.username = lower(btrim(barber_profile_row.username));
    achievement_key := 'barber.username_claimed';
    status := case when evidence_time is not null then 'complete' else 'action_required' end;
    reason := case when evidence_time is not null
      then 'registry_matches_barber_username'
      else 'claim_public_username'
    end;
    observed_at := evidence_time;
    return next;

    achievement_key := 'barber.contact_verified';
    status := case when contact_time is not null then 'complete' else 'action_required' end;
    reason := case when contact_time is not null
      then 'verified_email_and_phone_found'
      else 'verify_email_and_phone'
    end;
    observed_at := contact_time;
    return next;

    select
      exists (
        select 1
        from public.verification_profiles verification
        where verification.user_id = p_user_id
          and verification.role::text = 'barber'
          and verification.license_status::text in ('approved', 'verified')
          and exists (
            select 1
            from public.barber_verifications license
            where license.user_id = p_user_id
              and license.verification_profile_id = verification.id
              and license.category = 'license_verification'
              and license.barber_reference in (
                barber_row.id::text,
                p_user_id::text,
                coalesce(barber_row.reference_code, ''),
                coalesce(barber_row.booking_slug, '')
              )
              and license.verification_status::text in ('approved', 'verified')
              and license.expiration_date >= current_date
              and coalesce(license.verification_reviewed_at, license.last_reviewed_at) is not null
          )
      ),
      exists (
        select 1
        from public.verification_profiles verification
        join public.barber_verifications license
          on license.verification_profile_id = verification.id
         and license.user_id = p_user_id
        where verification.user_id = p_user_id
          and verification.role::text = 'barber'
          and license.category = 'license_verification'
          and license.barber_reference in (
            barber_row.id::text,
            p_user_id::text,
            coalesce(barber_row.reference_code, ''),
            coalesce(barber_row.booking_slug, '')
          )
          and license.verification_status::text in (
            'pending', 'in_progress', 'submitted', 'under_review'
          )
      ),
      (
        select max(greatest(
          coalesce(verification.last_reviewed_at, verification.updated_at),
          coalesce(license.verification_reviewed_at, license.last_reviewed_at)
        ))
        from public.verification_profiles verification
        join public.barber_verifications license
          on license.verification_profile_id = verification.id
         and license.user_id = p_user_id
        where verification.user_id = p_user_id
          and verification.role::text = 'barber'
          and verification.license_status::text in ('approved', 'verified')
          and license.category = 'license_verification'
          and license.barber_reference in (
            barber_row.id::text,
            p_user_id::text,
            coalesce(barber_row.reference_code, ''),
            coalesce(barber_row.booking_slug, '')
          )
          and license.verification_status::text in ('approved', 'verified')
          and license.expiration_date >= current_date
          and coalesce(license.verification_reviewed_at, license.last_reviewed_at) is not null
      )
    into check_complete, check_pending, evidence_time;
    achievement_key := 'barber.license_verified';
    status := case
      when check_complete then 'complete'
      when check_pending then 'pending_review'
      else 'action_required'
    end;
    reason := case
      when check_complete then 'current_license_verification_approved'
      when check_pending then 'license_verification_in_review'
      else 'submit_license_verification'
    end;
    observed_at := case when check_complete then evidence_time else null end;
    return next;

    select payout.complete, payout.pending, payout.observed_at
    into check_complete, check_pending, evidence_time
    from private.pr32_payout_truth(p_user_id, p_role) payout;
    achievement_key := 'barber.payout_connected';
    status := case
      when check_complete then 'complete'
      when check_pending then 'pending_review'
      else 'action_required'
    end;
    reason := case
      when check_complete then 'stored_live_stripe_payout_destination_ready'
      when check_pending then 'payout_onboarding_in_progress'
      else 'connect_live_stripe_payouts'
    end;
    observed_at := case when check_complete then evidence_time else null end;
    return next;

    select count(*)::integer, max(service.updated_at)
    into supporting_count, evidence_time
    from public.services service
    where service.service_owner_type::text = 'barber'
      and service.barber_reference in (
        barber_row.id::text,
        p_user_id::text,
        coalesce(barber_row.reference_code, ''),
        coalesce(barber_row.booking_slug, '')
      )
      and service.active
      and service.is_bookable
      and service.duration_min > 0
      and service.price > 0;
    check_complete := supporting_count >= 3;
    achievement_key := 'barber.menu_built';
    status := case when check_complete then 'complete' else 'action_required' end;
    reason := case when check_complete
      then 'three_active_bookable_priced_services_found'
      else 'publish_three_bookable_priced_services'
    end;
    observed_at := case when check_complete then evidence_time else null end;
    return next;

    select max(availability_evidence.observed_at)
    into evidence_time
    from (
      -- A freelancer has an application-owned independent location and no
      -- bilateral shop relationship. The activation writer creates exactly
      -- this membership/location pair before publishing availability rules.
      select greatest(rule.created_at, membership.updated_at, location.updated_at) as observed_at
      from public.availability_rules rule
      join public.staff_locations membership
        on membership.profile_id = p_user_id
       and membership.location_id = rule.location_id
       and membership.routing_model = 'freelance'
       and (
         membership.relationship_status is null
         or membership.relationship_status = 'active'
       )
       and membership.ended_at is null
       and membership.shop_id is null
       and membership.approved_by_owner_at is null
       join public.locations location
        on location.id = rule.location_id
       and location.location_active
      where rule.barber_id = barber_row.id
        and rule.start_time < rule.end_time
        and location.reference_code in (
          'independent-' || barber_row.id::text,
          'independent-' || p_user_id::text,
          'independent-' || coalesce(barber_row.reference_code, ''),
          'independent-' || coalesce(barber_row.booking_slug, '')
        )
        and not exists (
          select 1
          from public.shop_barber_relationships relationship
          where relationship.staff_location_id = membership.id
             or (
               relationship.barber_id = barber_row.id
               and relationship.location_id = location.id
               and relationship.status in ('invited', 'active', 'suspended')
               and relationship.ended_at is null
             )
        )

      union all

      -- A shop-hosted schedule is valid only after both parties approve the
      -- active relationship and the referenced location is operational.
      select greatest(rule.created_at, membership.updated_at, location.updated_at)
      from public.availability_rules rule
      join public.staff_locations membership
        on membership.profile_id = p_user_id
       and membership.location_id = rule.location_id
       and membership.relationship_status = 'active'
       and membership.ended_at is null
       and membership.approved_by_owner_at is not null
       and membership.approved_by_barber_at is not null
      join public.locations location
        on location.id = rule.location_id
       and location.location_active
      where rule.barber_id = barber_row.id
        and rule.start_time < rule.end_time
        and exists (
          select 1
          from public.shop_barber_relationships relationship
          where relationship.staff_location_id = membership.id
            and relationship.barber_id = barber_row.id
            and relationship.location_id = location.id
            and relationship.shop_id = membership.shop_id
            and relationship.status = 'active'
            and relationship.ended_at is null
            and relationship.approved_by_owner_at is not null
            and relationship.approved_by_barber_at is not null
        )
    ) availability_evidence;
    achievement_key := 'barber.availability_published';
    status := case when evidence_time is not null then 'complete' else 'action_required' end;
    reason := case when evidence_time is not null
      then 'operational_freelance_or_mutually_approved_shop_availability_found'
      else 'publish_availability_for_freelance_or_approved_shop_location'
    end;
    observed_at := evidence_time;
    barber_availability_complete := evidence_time is not null;
    return next;

    select count(*)::integer
    into supporting_count
    from public.barber_portfolios portfolio
    where portfolio.barber_reference = barber_profile_row.barber_reference
      and (
        nullif(btrim(portfolio.storage_path), '') is not null
        or nullif(btrim(portfolio.image_url), '') is not null
      );
    check_complete := barber_row.id is not null
      and barber_profile_row.id is not null
      and barber_row.app_approval_status::text = 'approved'
      and barber_row.shop_approval_status::text in ('not_required', 'approved')
      and barber_row.status = 'active'
      and barber_row.is_bookable
      and barber_row.is_discoverable
      and profile_row.onboarding_state::text = 'active'
      and barber_profile_row.visibility_state::text in ('public', 'featured')
      and exists (
        select 1
        from public.marketplace_visibility visibility
        where visibility.barber_reference in (
          barber_row.id::text,
          p_user_id::text,
          coalesce(barber_row.reference_code, ''),
          coalesce(barber_row.booking_slug, '')
        )
          and visibility.visibility_state::text in ('public', 'featured')
          and visibility.accepts_instant_bookings
      )
      and exists (
        select 1
        from public.barber_status barber_status
        where barber_status.barber_reference in (
          barber_row.id::text,
          p_user_id::text,
          coalesce(barber_row.reference_code, ''),
          coalesce(barber_row.booking_slug, '')
        )
          and (
            barber_status.barber_id is null
            or barber_status.barber_id = barber_row.id
          )
          and barber_status.accepting_bookings
          and barber_status.status in ('available', 'active', 'live', 'busy')
      )
      and (
        nullif(btrim(barber_profile_row.profile_photo_path), '') is not null
        or nullif(btrim(barber_profile_row.profile_photo_url), '') is not null
      )
      and supporting_count >= 3
      and exists (
        select 1
        from public.services service
        where service.service_owner_type::text = 'barber'
          and service.barber_reference in (
            barber_row.id::text,
            p_user_id::text,
            coalesce(barber_row.reference_code, ''),
            coalesce(barber_row.booking_slug, '')
          )
          and service.active
          and service.is_bookable
          and nullif(btrim(service.name), '') is not null
          and nullif(btrim(service.category), '') is not null
          and service.duration_min >= 15
          and service.price > 0
      )
      and barber_availability_complete
      and exists (
        select 1
        from public.barber_setup_activations activation
        where activation.barber_id = barber_row.id
          and activation.status = 'live'
      );
    if check_complete then
      select greatest(
        barber_profile_row.updated_at,
        (
          select max(portfolio.updated_at)
          from public.barber_portfolios portfolio
          where portfolio.barber_reference = barber_profile_row.barber_reference
        ),
        (
          select max(activation.activated_at)
          from public.barber_setup_activations activation
          where activation.barber_id = barber_row.id
            and activation.status = 'live'
        )
      ) into evidence_time;
    else
      evidence_time := null;
    end if;
    achievement_key := 'barber.profile_published';
    status := case when check_complete then 'complete' else 'action_required' end;
    reason := case when check_complete
      then 'marketplace_eligible_profile_with_photo_and_three_portfolio_posts'
      else 'complete_marketplace_eligibility_photo_and_three_portfolio_posts'
    end;
    observed_at := evidence_time;
    return next;
    return;
  end if;

  select shop.*
  into shop_row
  from public.shops shop
  where shop.owner_profile_id = p_user_id
  order by
    case when shop.app_approval_status::text = 'approved' then 0 else 1 end,
    shop.created_at,
    shop.id
  limit 1;

  if shop_row.id is not null then
    select location.*
    into location_row
    from public.locations location
    where location.reference_code = shop_row.id
       or location.id::text = shop_row.id
    order by
      case when location.reference_code = shop_row.id then 0 else 1 end,
      case when location.location_active then 0 else 1 end,
      location.created_at,
      location.id
    limit 1;
  end if;

  achievement_key := 'owner.account_created';
  status := case when shop_row.id is not null then 'complete' else 'action_required' end;
  reason := case when shop_row.id is not null
    then 'auth_backed_owner_account_linked'
    else 'finish_shop_owner_account_setup'
  end;
  observed_at := case when shop_row.id is not null
    then greatest(auth_created_at, profile_row.created_at, shop_row.created_at)
    else null
  end;
  return next;

  achievement_key := 'owner.contact_verified';
  status := case when contact_time is not null then 'complete' else 'action_required' end;
  reason := case when contact_time is not null
    then 'verified_email_and_phone_found'
    else 'verify_email_and_phone'
  end;
  observed_at := contact_time;
  return next;

  check_complete := shop_row.id is not null
    and length(btrim(coalesce(shop_row.name, ''))) >= 2
    and length(btrim(coalesce(shop_row.address, location_row.address, ''))) >= 3
    and length(btrim(coalesce(shop_row.public_bio, shop_row.brand_line, ''))) >= 3
    and (
      nullif(btrim(shop_row.profile_photo_path), '') is not null
      or nullif(btrim(shop_row.profile_photo_url), '') is not null
    )
    and nullif(btrim(shop_row.public_username), '') is not null
    and exists (
      select 1
      from public.public_usernames username
      where username.owner_type = 'shop'
        and username.owner_id = shop_row.id
        and username.username = lower(btrim(shop_row.public_username))
    );
  achievement_key := 'owner.shop_identity_completed';
  status := case when check_complete then 'complete' else 'action_required' end;
  reason := case when check_complete
    then 'registry_backed_shop_identity_complete'
    else 'complete_shop_name_logo_address_description_and_username'
  end;
  observed_at := case when check_complete
    then greatest(shop_row.updated_at, location_row.updated_at)
    else null
  end;
  return next;

  check_complete := shop_row.id is not null
    and location_row.id is not null
    and private.pr32_valid_owner_hours(shop_row.public_hours)
    and private.pr32_valid_owner_hours(location_row.hours)
    and shop_row.public_hours = location_row.hours
    and shop_row.public_hours::text !~* '(contact_shop|owner_confirmation_required)';
  achievement_key := 'owner.shop_hours_set';
  status := case when check_complete then 'complete' else 'action_required' end;
  reason := case when check_complete
    then 'matching_versioned_shop_and_location_hours_found'
    else 'publish_matching_versioned_shop_and_location_hours'
  end;
  observed_at := case when check_complete
    then greatest(shop_row.updated_at, location_row.updated_at)
    else null
  end;
  return next;

  select
    exists (
      select 1
      from public.verification_profiles verification
      where verification.user_id = p_user_id
        and verification.role::text = 'shop_owner'
        and verification.business_status::text in ('approved', 'verified')
        and exists (
          select 1
          from public.shop_verifications business
          where business.user_id = p_user_id
            and business.verification_profile_id = verification.id
            and business.shop_reference = shop_row.id
            and business.category in ('business_verification', 'ownership_verification')
            and business.verification_status::text in ('approved', 'verified')
            and coalesce(business.verification_reviewed_at, business.last_reviewed_at) is not null
        )
    ),
    exists (
      select 1
      from public.verification_profiles verification
      join public.shop_verifications business
        on business.verification_profile_id = verification.id
       and business.user_id = p_user_id
       and business.shop_reference = shop_row.id
      where verification.user_id = p_user_id
        and verification.role::text = 'shop_owner'
        and business.category in ('business_verification', 'ownership_verification')
        and business.verification_status::text in (
          'pending', 'in_progress', 'submitted', 'under_review'
        )
    ),
    (
      select max(greatest(
        coalesce(verification.last_reviewed_at, verification.updated_at),
        coalesce(business.verification_reviewed_at, business.last_reviewed_at)
      ))
      from public.verification_profiles verification
      join public.shop_verifications business
        on business.verification_profile_id = verification.id
       and business.user_id = p_user_id
       and business.shop_reference = shop_row.id
      where verification.user_id = p_user_id
        and verification.role::text = 'shop_owner'
        and verification.business_status::text in ('approved', 'verified')
        and business.category in ('business_verification', 'ownership_verification')
        and business.verification_status::text in ('approved', 'verified')
        and coalesce(business.verification_reviewed_at, business.last_reviewed_at) is not null
    )
  into check_complete, check_pending, evidence_time;
  achievement_key := 'owner.business_verified';
  status := case
    when check_complete then 'complete'
    when check_pending then 'pending_review'
    else 'action_required'
  end;
  reason := case
    when check_complete then 'current_business_verification_approved'
    when check_pending then 'business_verification_in_review'
    else 'submit_business_verification'
  end;
  observed_at := case when check_complete then evidence_time else null end;
  return next;

  select payout.complete, payout.pending, payout.observed_at
  into check_complete, check_pending, evidence_time
  from private.pr32_payout_truth(p_user_id, p_role) payout;
  achievement_key := 'owner.stripe_connected';
  status := case
    when check_complete then 'complete'
    when check_pending then 'pending_review'
    else 'action_required'
  end;
  reason := case
    when check_complete then 'stored_live_shop_stripe_destination_ready'
    when check_pending then 'shop_stripe_onboarding_in_progress'
    else 'connect_live_shop_stripe_account'
  end;
  observed_at := case when check_complete then evidence_time else null end;
  return next;

  check_complete := length(btrim(coalesce(shop_row.policies, ''))) >= 20;
  achievement_key := 'owner.policies_published';
  status := case when check_complete then 'complete' else 'action_required' end;
  reason := case when check_complete
    then 'client_facing_shop_policies_published'
    else 'publish_client_facing_shop_policies'
  end;
  observed_at := case when check_complete then shop_row.updated_at else null end;
  return next;

  check_complete := shop_row.id is not null
    and shop_row.app_approval_status::text = 'approved'
    and nullif(btrim(shop_row.public_username), '') is not null
    and exists (
      select 1
      from public.public_usernames username
      where username.owner_type = 'shop'
        and username.owner_id = shop_row.id
        and username.username = lower(btrim(shop_row.public_username))
    )
    and location_row.id is not null
    and location_row.location_active
    and location_row.location_verified
    and location_row.location_visibility in ('exact', 'approximate')
    and location_row.geo_point is not null;
  check_pending := shop_row.id is not null
    and shop_row.app_approval_status::text in ('pending', 'under_review')
    and length(btrim(coalesce(shop_row.name, ''))) >= 2
    and length(btrim(coalesce(shop_row.address, location_row.address, ''))) >= 3
    and length(btrim(coalesce(shop_row.public_bio, shop_row.brand_line, ''))) >= 3
    and (
      nullif(btrim(shop_row.profile_photo_path), '') is not null
      or nullif(btrim(shop_row.profile_photo_url), '') is not null
    )
    and nullif(btrim(shop_row.public_username), '') is not null
    and exists (
      select 1
      from public.public_usernames username
      where username.owner_type = 'shop'
        and username.owner_id = shop_row.id
        and username.username = lower(btrim(shop_row.public_username))
    )
    and private.pr32_valid_owner_hours(shop_row.public_hours)
    and private.pr32_valid_owner_hours(location_row.hours)
    and shop_row.public_hours = location_row.hours
    and length(btrim(coalesce(shop_row.policies, ''))) >= 20
    and location_row.id is not null
    and location_row.location_active
    and location_row.location_visibility in ('exact', 'approximate')
    and location_row.geo_point is not null;
  achievement_key := 'owner.shop_profile_published';
  status := case
    when check_complete then 'complete'
    when check_pending then 'pending_review'
    else 'action_required'
  end;
  reason := case
    when check_complete then 'shop_is_eligible_for_marketplace_search'
    when check_pending then 'shop_publication_waiting_for_approval'
    else 'complete_verified_search_location_and_username'
  end;
  observed_at := case when check_complete
    then greatest(shop_row.updated_at, location_row.updated_at)
    else null
  end;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION private.pr32_replay_road_events_locked(p_user_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  set_rule public.road_set_rules%rowtype;
  required_key text;
  evidence_event_id uuid;
  evidence_time timestamptz;
  completion_time timestamptz;
  achievement_count integer;
  affected_count integer;
  recorded_count integer := 0;
  badges_earned integer := 0;
  first_incomplete_setup_set smallint;
begin
  -- Compute current setup truth once while the caller's profile lock is held.
  -- Historical evidence stays immutable, but no badge at or above a currently
  -- incomplete setup set may be newly earned until that source truth is repaired.
  select min(rule.set_index)
  into first_incomplete_setup_set
  from private.pr32_road_setup_checks(p_user_id, p_role) setup_check
  join public.road_set_rules rule
    on rule.role = p_role
   and setup_check.achievement_key = any(rule.required_achievement_keys)
  where setup_check.status <> 'complete';

  for set_rule in
    select rule.*
    from public.road_set_rules rule
    where rule.role = p_role
    order by rule.set_index
  loop
    if first_incomplete_setup_set is not null
       and set_rule.set_index > first_incomplete_setup_set then
      exit;
    end if;

    if set_rule.set_index > 0 and not exists (
      select 1
      from public.badges badge
      where badge.user_id = p_user_id
        and badge.role = p_role
        and badge.set_index = set_rule.set_index - 1
    ) then
      exit;
    end if;

    foreach required_key in array set_rule.required_achievement_keys
    loop
      evidence_event_id := null;
      evidence_time := null;

      select event.id, coalesce(event.occurred_at, event.created_at)
      into evidence_event_id, evidence_time
      from public.platform_events event
      where event.event_type = required_key
        and event.source <> 'ui'
        and coalesce(
          nullif(event.related_ids ->> 'road_user_id', ''),
          nullif(event.actor_id, ''),
          ''
        ) = p_user_id::text
        and (
          event.related_ids ->> 'road_role' is null
          or event.related_ids ->> 'road_role' = p_role
        )
      order by
        coalesce(event.occurred_at, event.created_at),
        event.created_at,
        event.id
      limit 1
      for share;

      if evidence_event_id is not null then
        insert into public.road_progress (
          user_id,
          role,
          set_index,
          achievement_key,
          source_event_id,
          completed_at
        ) values (
          p_user_id,
          p_role,
          set_rule.set_index,
          required_key,
          evidence_event_id,
          evidence_time
        )
        on conflict (user_id, role, achievement_key) do nothing;
        get diagnostics affected_count = row_count;
        recorded_count := recorded_count + affected_count;
      end if;
    end loop;

    select count(distinct progress.achievement_key)::integer,
           max(progress.completed_at)
    into achievement_count, completion_time
    from public.road_progress progress
    where progress.user_id = p_user_id
      and progress.role = p_role
      and progress.set_index = set_rule.set_index
      and progress.achievement_key = any(set_rule.required_achievement_keys);

    if achievement_count <> cardinality(set_rule.required_achievement_keys) then
      exit;
    end if;

    -- Events for the incomplete setup set remain stored/progressed so a later
    -- repair can replay deterministically, but its badge (and every later set)
    -- stays locked by current source truth.
    if first_incomplete_setup_set is not null
       and set_rule.set_index = first_incomplete_setup_set then
      exit;
    end if;

    insert into public.badges (user_id, role, set_index, badge_key, earned_at)
    values (
      p_user_id,
      p_role,
      set_rule.set_index,
      set_rule.badge_key,
      completion_time
    )
    on conflict (user_id, role, set_index) do nothing;
    get diagnostics affected_count = row_count;
    badges_earned := badges_earned + affected_count;

    if affected_count = 1 and set_rule.set_index = 1 then
      update public.referrals
      set counted_at = completion_time
      where referred_user_id = p_user_id
        and counted_at is null;
    end if;
  end loop;

  return jsonb_build_object(
    'recordedCount', recorded_count,
    'badgesEarned', badges_earned
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.pr32_lock_road_event_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.idempotency_key like 'road:setup-truth:v1:%'
     or exists (
       select 1
       from public.road_progress progress
       where progress.source_event_id = old.id
     ) then
    raise exception 'road platform event evidence is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr32_get_road_setup_checks(p_user_id uuid, p_role text)
 RETURNS TABLE(achievement_key text, status text, reason text, observed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    setup_check.achievement_key,
    setup_check.status,
    setup_check.reason,
    setup_check.observed_at
  from private.pr32_road_setup_checks(p_user_id, p_role) setup_check;
$function$;

CREATE OR REPLACE FUNCTION public.pr32_claim_matching_clientbridge_history(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_client_id uuid;
  auth_email text;
  auth_email_confirmed_at timestamptz;
  auth_phone text;
  auth_phone_confirmed_at timestamptz;
  profile_phone text;
  profile_phone_verified_at timestamptz;
  verified_email text;
  verified_phone text;
  normalized_phone text;
  invitation_row public.clientbridge_invitations%rowtype;
  matched_invitation_ids uuid[] := array[]::uuid[];
  previous_client_ids uuid[] := array[]::uuid[];
  linked_waitlist_ids uuid[] := array[]::uuid[];
  linked_chairsync_ids uuid[] := array[]::uuid[];
  linked_consent_ids uuid[] := array[]::uuid[];
  invitations_claimed integer := 0;
  source_clients_merged integer := 0;
  appointments_merged integer := 0;
  queue_entries_merged integer := 0;
  chairsync_appointments_merged integer := 0;
  consent_events_merged integer := 0;
begin
  if not private.pr19_actor_is_trusted_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  -- Claiming is rare and identity-moving. A single transaction advisory lock
  -- prevents cross-account deadlocks when two matching invitations happen to
  -- reference overlapping legacy clients.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pr32_claim_matching_clientbridge_history', 0)
  );
  perform private.pr32_lock_road_identity(p_user_id, 'client_user');

  select client.id
  into target_client_id
  from public.clients client
  where client.profile_id = p_user_id
  for update;

  if target_client_id is null then
    raise exception 'canonical client account is required' using errcode = '23514';
  end if;

  select
    auth_user.email,
    auth_user.email_confirmed_at,
    auth_user.phone,
    auth_user.phone_confirmed_at,
    profile.phone,
    profile.phone_verified_at
  into
    auth_email,
    auth_email_confirmed_at,
    auth_phone,
    auth_phone_confirmed_at,
    profile_phone,
    profile_phone_verified_at
  from auth.users auth_user
  join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = p_user_id
  for share of auth_user;

  verified_email := case
    when nullif(btrim(auth_email), '') is not null
      and auth_email_confirmed_at is not null
    then lower(btrim(auth_email))
    else null
  end;
  verified_phone := case
    when nullif(btrim(auth_phone), '') is not null
      and auth_phone_confirmed_at is not null
    then auth_phone
    when nullif(btrim(profile_phone), '') is not null
      and profile_phone_verified_at is not null
    then profile_phone
    else null
  end;
  normalized_phone := nullif(
    pg_catalog.regexp_replace(coalesce(verified_phone, ''), '[^0-9]', '', 'g'),
    ''
  );

  if verified_email is null or normalized_phone is null then
    raise exception 'confirmed email and confirmed phone are required before claiming history'
      using errcode = '23514';
  end if;

  update public.clientbridge_invitations invitation
  set status = 'expired',
      updated_at = pg_catalog.now()
  where invitation.status in ('pending', 'queued', 'sent', 'opened')
    and invitation.claimed_profile_id is null
    and invitation.expires_at <= pg_catalog.now()
    and (
      (
        invitation.contact_channel = 'email'
        and lower(btrim(invitation.contact_value)) = verified_email
      )
      or
      (
        invitation.contact_channel = 'sms'
        and nullif(
          pg_catalog.regexp_replace(invitation.contact_value, '[^0-9]', '', 'g'),
          ''
        ) = normalized_phone
      )
    );

  -- FOR UPDATE rechecks the status predicate after any concurrent token claim.
  -- The deterministic order plus the transaction advisory lock makes retries
  -- safe and gives a second call an empty match set.
  for invitation_row in
    select invitation.*
    from public.clientbridge_invitations invitation
    where invitation.status in ('pending', 'queued', 'sent', 'opened')
      and invitation.claimed_profile_id is null
      and invitation.expires_at > pg_catalog.now()
      and (
        (
          invitation.contact_channel = 'email'
          and lower(btrim(invitation.contact_value)) = verified_email
        )
        or
        (
          invitation.contact_channel = 'sms'
          and nullif(
            pg_catalog.regexp_replace(invitation.contact_value, '[^0-9]', '', 'g'),
            ''
          ) = normalized_phone
        )
      )
    order by invitation.id
    for update
  loop
    matched_invitation_ids := pg_catalog.array_append(
      matched_invitation_ids,
      invitation_row.id
    );
    if invitation_row.client_id is not null
       and invitation_row.client_id <> target_client_id then
      previous_client_ids := pg_catalog.array_append(
        previous_client_ids,
        invitation_row.client_id
      );
    end if;
    if invitation_row.waitlist_entry_id is not null then
      linked_waitlist_ids := pg_catalog.array_append(
        linked_waitlist_ids,
        invitation_row.waitlist_entry_id
      );
    end if;
    if invitation_row.chairsync_appointment_id is not null then
      linked_chairsync_ids := pg_catalog.array_append(
        linked_chairsync_ids,
        invitation_row.chairsync_appointment_id
      );
    end if;
    if invitation_row.consent_event_id is not null then
      linked_consent_ids := pg_catalog.array_append(
        linked_consent_ids,
        invitation_row.consent_event_id
      );
    end if;
  end loop;

  if pg_catalog.cardinality(matched_invitation_ids) = 0 then
    return pg_catalog.jsonb_build_object(
      'status', 'already_resolved',
      'targetClientId', target_client_id,
      'invitationsClaimed', 0,
      'sourceClientsMerged', 0,
      'appointmentsMerged', 0,
      'queueEntriesMerged', 0,
      'chairSyncAppointmentsMerged', 0,
      'consentEventsMerged', 0
    );
  end if;

  -- Lock legacy client and queue rows in UUID order before ownership changes.
  perform 1
  from public.clients client
  where client.id = any(previous_client_ids)
  order by client.id
  for update;

  if exists (
    select 1
    from public.clients client
    where client.id = any(previous_client_ids)
      and client.profile_id is not null
      and client.profile_id <> p_user_id
  ) then
    raise exception 'matching history is already owned by another client account'
      using errcode = '23514';
  end if;

  perform 1
  from public.waitlist_entries queue_entry
  where queue_entry.client_id = target_client_id
     or queue_entry.client_id = any(previous_client_ids)
     or queue_entry.id = any(linked_waitlist_ids)
  order by queue_entry.id
  for update;

  -- The canonical queue permits only one live entry per client/location. Never
  -- silently cancel or collapse queue truth during an identity merge.
  if exists (
    select 1
    from public.waitlist_entries queue_entry
    where (
        queue_entry.client_id = target_client_id
        or queue_entry.client_id = any(previous_client_ids)
        or queue_entry.id = any(linked_waitlist_ids)
      )
      and queue_entry.status in ('active', 'called', 'assigned')
    group by queue_entry.location_id
    having count(*) > 1
  ) then
    raise exception 'matching guest history has conflicting live queue entries'
      using errcode = '23505';
  end if;

  update public.appointments appointment
  set client_id = target_client_id
  where appointment.client_id = any(previous_client_ids);
  get diagnostics appointments_merged = row_count;

  update public.waitlist_entries queue_entry
  set client_id = target_client_id,
      last_mutated_by = p_user_id,
      last_mutation_reason = 'ClientBridge verified-contact history merge',
      updated_at = pg_catalog.now()
  where queue_entry.client_id = any(previous_client_ids)
     or queue_entry.id = any(linked_waitlist_ids);
  get diagnostics queue_entries_merged = row_count;

  update public.chairsync_appointments chairsync
  set linked_client_id = target_client_id,
      updated_at = pg_catalog.now()
  where chairsync.linked_client_id = any(previous_client_ids)
     or chairsync.id = any(linked_chairsync_ids);
  get diagnostics chairsync_appointments_merged = row_count;

  update public.clientbridge_consent_events consent
  set client_id = target_client_id
  where consent.client_id = any(previous_client_ids)
     or consent.id = any(linked_consent_ids);
  get diagnostics consent_events_merged = row_count;

  update public.clientbridge_invitations invitation
  set status = 'claimed',
      claimed_at = pg_catalog.now(),
      claimed_profile_id = p_user_id,
      client_id = target_client_id,
      updated_at = pg_catalog.now()
  where invitation.id = any(matched_invitation_ids)
    and invitation.status in ('pending', 'queued', 'sent', 'opened');
  get diagnostics invitations_claimed = row_count;

  select count(distinct previous_client_id)::integer
  into source_clients_merged
  from pg_catalog.unnest(previous_client_ids) previous_client(previous_client_id);

  return pg_catalog.jsonb_build_object(
    'status', 'claimed',
    'targetClientId', target_client_id,
    'invitationsClaimed', invitations_claimed,
    'sourceClientsMerged', source_clients_merged,
    'appointmentsMerged', appointments_merged,
    'queueEntriesMerged', queue_entries_merged,
    'chairSyncAppointmentsMerged', chairsync_appointments_merged,
    'consentEventsMerged', consent_events_merged
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr32_reconcile_road_setup(p_user_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  setup_check record;
  evidence_event public.platform_events%rowtype;
  setup_checks jsonb := '[]'::jsonb;
  replay_result jsonb;
  event_idempotency_key text;
begin
  perform private.pr32_lock_road_identity(p_user_id, p_role);

  for setup_check in
    select road_check.*
    from private.pr32_road_setup_checks(p_user_id, p_role) road_check
  loop
    setup_checks := setup_checks || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'achievementKey', setup_check.achievement_key,
        'status', setup_check.status,
        'reason', setup_check.reason,
        'observedAt', setup_check.observed_at
      )
    );

    if setup_check.status = 'complete' then
      if setup_check.observed_at is null then
        raise exception 'complete road setup truth must have an observed timestamp'
          using errcode = '23514';
      end if;

      event_idempotency_key := pg_catalog.concat(
        'road:setup-truth:v1:',
        p_user_id::text,
        ':',
        p_role,
        ':',
        setup_check.achievement_key
      );

      evidence_event := null;
      insert into public.platform_events (
        event_type,
        entity_type,
        entity_id,
        actor_id,
        actor_role,
        source,
        related_ids,
        payload,
        idempotency_key,
        occurred_at
      ) values (
        setup_check.achievement_key,
        'road_setup_truth',
        p_user_id::text,
        p_user_id::text,
        p_role,
        'system',
        pg_catalog.jsonb_build_object(
          'road_user_id', p_user_id::text,
          'road_role', p_role
        ),
        pg_catalog.jsonb_build_object(
          'truth_version', 1,
          'reason', setup_check.reason,
          'observed_at', setup_check.observed_at
        ),
        event_idempotency_key,
        setup_check.observed_at
      )
      on conflict (idempotency_key) do nothing
      returning * into evidence_event;

      if evidence_event.id is null then
        select event.*
        into evidence_event
        from public.platform_events event
        where event.idempotency_key = event_idempotency_key
        for share;

        if evidence_event.id is null
           or evidence_event.event_type <> setup_check.achievement_key
           or evidence_event.entity_type <> 'road_setup_truth'
           or evidence_event.entity_id <> p_user_id::text
           or evidence_event.actor_id is distinct from p_user_id::text
           or evidence_event.actor_role is distinct from p_role
           or evidence_event.source <> 'system'
           or evidence_event.related_ids ->> 'road_user_id' is distinct from p_user_id::text
           or evidence_event.related_ids ->> 'road_role' is distinct from p_role then
          raise exception 'road setup event idempotency collision'
            using errcode = '23505';
        end if;
      end if;
    end if;
  end loop;

  replay_result := private.pr32_replay_road_events_locked(p_user_id, p_role);

  return pg_catalog.jsonb_build_object(
    'checks', setup_checks,
    'recordedCount', coalesce((replay_result ->> 'recordedCount')::integer, 0),
    'badgesEarned', coalesce((replay_result ->> 'badgesEarned')::integer, 0)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr32_record_road_event(p_user_id uuid, p_role text, p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  event_row public.platform_events%rowtype;
  set_rule public.road_set_rules%rowtype;
  replay_result jsonb;
  progress_existed boolean;
  progress_exists boolean;
begin
  perform private.pr32_lock_road_identity(p_user_id, p_role);

  select event.*
  into event_row
  from public.platform_events event
  where event.id = p_event_id
  for share;

  if event_row.id is null then
    raise exception 'platform event evidence was not found' using errcode = 'P0002';
  end if;
  if event_row.source = 'ui' then
    raise exception 'client-asserted road completion is prohibited'
      using errcode = '42501';
  end if;
  if coalesce(
       nullif(event_row.related_ids ->> 'road_user_id', ''),
       nullif(event_row.actor_id, ''),
       ''
     ) <> p_user_id::text then
    raise exception 'platform event evidence is not bound to this road account'
      using errcode = '23514';
  end if;
  if event_row.related_ids ->> 'road_role' is not null
     and event_row.related_ids ->> 'road_role' <> p_role then
    raise exception 'platform event evidence is bound to a different road role'
      using errcode = '23514';
  end if;

  select rule.*
  into set_rule
  from public.road_set_rules rule
  where rule.role = p_role
    and event_row.event_type = any(rule.required_achievement_keys);

  if set_rule.role is null then
    return pg_catalog.jsonb_build_object(
      'status', 'ignored',
      'reason', 'event_not_bound'
    );
  end if;

  select exists (
    select 1
    from public.road_progress progress
    where progress.user_id = p_user_id
      and progress.role = p_role
      and progress.achievement_key = event_row.event_type
  ) into progress_existed;

  replay_result := private.pr32_replay_road_events_locked(p_user_id, p_role);

  select exists (
    select 1
    from public.road_progress progress
    where progress.user_id = p_user_id
      and progress.role = p_role
      and progress.achievement_key = event_row.event_type
  ) into progress_exists;

  return pg_catalog.jsonb_build_object(
    'status', case
      when progress_exists and not progress_existed then 'recorded'
      when progress_exists then 'duplicate'
      else 'deferred'
    end,
    'reason', case when progress_exists then null else 'previous_or_current_setup_incomplete' end,
    'setIndex', set_rule.set_index,
    'achievementKey', event_row.event_type,
    'badgeEarned', coalesce((replay_result ->> 'badgesEarned')::integer, 0) > 0
  );
end;
$function$;

drop trigger if exists pr32_lock_road_event_evidence on public.platform_events;
create trigger pr32_lock_road_event_evidence
before update or delete on public.platform_events
for each row execute function private.pr32_lock_road_event_evidence();

revoke all on function private.pr32_lock_road_identity(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.pr32_contact_truth(uuid) from public, anon, authenticated, service_role;
revoke all on function private.pr32_valid_owner_hours(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.pr32_payout_truth(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.pr32_road_setup_checks(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.pr32_replay_road_events_locked(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.pr32_lock_road_event_evidence() from public, anon, authenticated, service_role;

revoke all on function public.pr32_get_road_setup_checks(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.pr32_get_road_setup_checks(uuid,text) to service_role;

revoke all on function public.pr32_claim_matching_clientbridge_history(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pr32_claim_matching_clientbridge_history(uuid) to service_role;

revoke all on function public.pr32_reconcile_road_setup(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.pr32_reconcile_road_setup(uuid,text) to service_role;

revoke all on function public.pr32_record_road_event(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.pr32_record_road_event(uuid,text,uuid) to service_role;

comment on function public.pr32_get_road_setup_checks(uuid, text)
is 'Service-only current account-setup truth for Road UI. Does not mutate Road progress.';

comment on function public.pr32_claim_matching_clientbridge_history(uuid)
is 'Service-only verified-contact claim of every unexpired matching ClientBridge invitation; merges canonical visit, queue, ChairSync, and consent ownership transactionally without a browser token.';

comment on function public.pr32_reconcile_road_setup(uuid, text)
is 'Service-only, profile-locked Road account-setup repair/backfill invoked before current Road/Home summary reads.';

comment on function public.pr32_record_road_event(uuid, text, uuid)
is 'Service-only, profile-locked deterministic replay of durable server-authored Road event evidence.';

do $road_account_setup_contract$
declare
  catalog_count integer;
  setup_count integer;
  owner_set_zero text[];
begin
  select count(distinct achievement_key)
  into catalog_count
  from public.road_set_rules rule
  cross join lateral unnest(rule.required_achievement_keys) achievement_key;

  if catalog_count <> 71 then
    raise exception 'Road catalog must contain exactly 71 unique achievements; found %.', catalog_count;
  end if;

  select count(*)
  into setup_count
  from unnest(array[
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
  ]::text[]) setup_key
  where exists (
    select 1
    from public.road_set_rules rule
    where setup_key = any(rule.required_achievement_keys)
  );

  if setup_count <> 22 then
    raise exception 'Road setup catalog must expose all 22 canonical setup achievements; found %.', setup_count;
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
    raise exception 'Owner SET 0 does not match the canonical four-step setup contract.';
  end if;
end;
$road_account_setup_contract$;

notify pgrst, 'reload schema';

commit;
