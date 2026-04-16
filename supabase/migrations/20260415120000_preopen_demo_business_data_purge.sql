-- Pre-open clean start: remove known seeded/demo business rows while preserving
-- real auth users, production config, enums, RLS, and founder-controlled accounts.
do $$
declare
  demo_barbers text[] := array['barber-wave', 'barber-fade', 'barber-blaze', 'barber-luxe'];
  demo_clients text[] := array['client-jordan', 'client-nova', 'client-rome', 'client-ava', 'client-malik', 'client-sage', 'client-cam', 'client-zoe', 'client-omar', 'client-lyric', 'client-noah', 'client-kai'];
  demo_locations text[] := array['loc-ybor', 'loc-hyde'];
  demo_shops text[] := array['shop-bvrb3r'];
  demo_auth_emails text[] := array[
    'architect@bvrb3r.demo',
    'owner@bvrb3r.demo',
    'client@bvrb3r.demo',
    'blaze@bvrb3r.demo',
    'wave@bvrb3r.demo',
    'fade@bvrb3r.demo',
    'lux@bvrb3r.demo',
    'frontdesk@bvrb3r.demo',
    'manager@bvrb3r.demo'
  ];
  demo_barber_names text[] := array['Wave Carter', 'Blaze King'];
  demo_appointments text[] := array['appt-1', 'appt-2', 'appt-3', 'appt-4', 'appt-5', 'appt-6', 'appt-7', 'appt-8'];
  demo_services text[] := array[
    'srv-signature',
    'srv-premium',
    'srv-kids',
    'srv-razor',
    'srv-beard',
    'srv-enhancement',
    'srv-blackmask',
    'srv-color',
    'srv-design',
    'srv-membership',
    'srv-blaze-executive-detail',
    'srv-blaze-mobile-rush',
    'srv-luxe-camera-ready',
    'srv-luxe-color-refresh'
  ];
begin
  if to_regclass('public.verification_reviews') is not null and to_regclass('public.verification_profiles') is not null then
    execute 'delete from public.verification_reviews vr using public.verification_profiles vp, auth.users au where vr.verification_profile_id = vp.id and vp.user_id = au.id and (lower(au.email) = any($1) or lower(au.email) like ''%@bvrb3r.demo'')'
      using demo_auth_emails;
  end if;

  if to_regclass('public.verification_provider_links') is not null then
    execute 'delete from public.verification_provider_links vpl using auth.users au where vpl.user_id = au.id and (lower(au.email) = any($1) or lower(au.email) like ''%@bvrb3r.demo'')'
      using demo_auth_emails;
  end if;

  if to_regclass('public.verification_documents') is not null then
    execute 'delete from public.verification_documents vd using auth.users au where vd.user_id = au.id and (lower(au.email) = any($1) or lower(au.email) like ''%@bvrb3r.demo'')'
      using demo_auth_emails;
    execute 'delete from public.verification_documents where owner_reference = any($1) or owner_reference = any($2)'
      using demo_barbers, demo_shops;
  end if;

  if to_regclass('public.barber_verifications') is not null then
    execute 'delete from public.barber_verifications bv using auth.users au where bv.user_id = au.id and (lower(au.email) = any($1) or lower(au.email) like ''%@bvrb3r.demo'')'
      using demo_auth_emails;
    execute 'delete from public.barber_verifications where barber_reference = any($1) or legal_name = any($2)'
      using demo_barbers, demo_barber_names;
  end if;

  if to_regclass('public.shop_verifications') is not null then
    execute 'delete from public.shop_verifications sv using auth.users au where sv.user_id = au.id and (lower(au.email) = any($1) or lower(au.email) like ''%@bvrb3r.demo'')'
      using demo_auth_emails;
    execute 'delete from public.shop_verifications where shop_reference = any($1)'
      using demo_shops;
  end if;

  if to_regclass('public.verification_profiles') is not null then
    execute 'delete from public.verification_profiles vp using auth.users au where vp.user_id = au.id and (lower(au.email) = any($1) or lower(au.email) like ''%@bvrb3r.demo'')'
      using demo_auth_emails;
  end if;

  if to_regclass('public.marketplace_booking_attributions') is not null then
    execute 'delete from public.marketplace_booking_attributions where appointment_reference = any($1) or barber_reference = any($2) or client_reference = any($3) or location_reference = any($4)'
      using demo_appointments, demo_barbers, demo_clients, demo_locations;
  end if;

  if to_regclass('public.marketplace_conversion_events') is not null then
    execute 'delete from public.marketplace_conversion_events where barber_reference = any($1) or client_reference = any($2) or appointment_reference = any($3) or location_reference = any($4)'
      using demo_barbers, demo_clients, demo_appointments, demo_locations;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'marketplace_conversion_events' and column_name = 'client_email'
    ) then
      execute 'delete from public.marketplace_conversion_events where lower(client_email) like ''%@bvrb3r.demo'' or lower(client_email) like ''%@example.com''';
    end if;
  end if;

  if to_regclass('public.marketplace_waitlist_requests') is not null then
    execute 'delete from public.marketplace_waitlist_requests where barber_reference = any($1) or client_reference = any($2) or service_reference = any($3) or location_reference = any($4)'
      using demo_barbers, demo_clients, demo_services, demo_locations;
  end if;

  if to_regclass('public.marketplace_service_popularity') is not null then
    execute 'delete from public.marketplace_service_popularity where service_reference = any($1)' using demo_services;
  end if;

  if to_regclass('public.marketplace_services') is not null then
    execute 'delete from public.marketplace_services where service_reference = any($1) or barber_reference = any($2) or shop_reference = any($3)' using demo_services, demo_barbers, demo_shops;
  end if;

  if to_regclass('public.barber_rankings') is not null then
    execute 'delete from public.barber_rankings where barber_reference = any($1)' using demo_barbers;
  end if;

  if to_regclass('public.marketplace_visibility') is not null then
    execute 'delete from public.marketplace_visibility where barber_reference = any($1) or barber_email like ''%@bvrb3r.demo''' using demo_barbers;
  end if;

  if to_regclass('public.barber_portfolios') is not null then
    execute 'delete from public.barber_portfolios where barber_reference = any($1) or barber_email like ''%@bvrb3r.demo''' using demo_barbers;
  end if;

  if to_regclass('public.featured_profiles') is not null then
    execute 'delete from public.featured_profiles where barber_reference = any($1)' using demo_barbers;
  end if;

  if to_regclass('public.search_history') is not null then
    execute 'delete from public.search_history where client_reference = any($1)' using demo_clients;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'search_history' and column_name = 'client_email'
    ) then
      execute 'delete from public.search_history where lower(client_email) like ''%@bvrb3r.demo'' or lower(client_email) like ''%@example.com''';
    end if;
  end if;

  if to_regclass('public.client_preferences') is not null then
    execute 'delete from public.client_preferences where client_reference = any($1) or favorite_shop_reference = any($2) or preferred_location_reference = any($3)'
      using demo_clients, demo_shops, demo_locations;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'client_preferences' and column_name = 'client_email'
    ) then
      execute 'delete from public.client_preferences where lower(client_email) like ''%@bvrb3r.demo'' or lower(client_email) like ''%@example.com''';
    end if;
  end if;

  if to_regclass('public.trending_styles') is not null then
    delete from public.trending_styles;
  end if;

  if to_regclass('public.location_search_index') is not null then
    execute 'delete from public.location_search_index where location_reference = any($1) or shop_reference = any($2) or barber_reference = any($3)'
      using demo_locations, demo_shops, demo_barbers;
  end if;

  if to_regclass('public.appointment_services') is not null then
    execute 'delete from public.appointment_services where appointment_reference = any($1) or service_reference = any($2)' using demo_appointments, demo_services;
  end if;

  if to_regclass('public.live_appointments') is not null then
    execute 'delete from public.live_appointments where appointment_reference = any($1) or location_reference = any($2) or barber_reference = any($3) or client_reference = any($4)'
      using demo_appointments, demo_locations, demo_barbers, demo_clients;
  end if;

  if to_regclass('public.live_walk_in_queue') is not null then
    execute 'delete from public.live_walk_in_queue where queue_reference = any($1) or location_reference = any($2) or assigned_barber_reference = any($3)'
      using array['walk-1', 'walk-2', 'walk-3'], demo_locations, demo_barbers;
  end if;

  if to_regclass('public.live_clients') is not null then
    execute 'delete from public.live_clients where client_reference = any($1)' using demo_clients;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'live_clients' and column_name = 'client_email'
    ) then
      execute 'delete from public.live_clients where lower(client_email) like ''%@bvrb3r.demo'' or lower(client_email) like ''%@example.com''';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'live_clients' and column_name = 'email'
    ) then
      execute 'delete from public.live_clients where lower(email) like ''%@bvrb3r.demo'' or lower(email) like ''%@example.com''';
    end if;
  end if;

  if to_regclass('public.workflow_events') is not null then
    execute 'delete from public.workflow_events where appointment_reference = any($1) or location_reference = any($2) or barber_reference = any($3) or client_reference = any($4)'
      using demo_appointments, demo_locations, demo_barbers, demo_clients;
  end if;

  if to_regclass('public.compensation_snapshots') is not null then
    execute 'delete from public.compensation_snapshots where appointment_reference = any($1) or location_reference = any($2) or barber_reference = any($3) or client_reference = any($4)'
      using demo_appointments, demo_locations, demo_barbers, demo_clients;
  end if;

  if to_regclass('public.owner_daily_analytics') is not null then
    execute 'delete from public.owner_daily_analytics where location_reference = any($1)' using demo_locations;
  end if;

  if to_regclass('public.walk_in_queue') is not null then
    execute 'delete from public.walk_in_queue where reference_code = any($1) or location_id in (select id from public.locations where reference_code = any($2)) or assigned_barber_id in (select id from public.barbers where reference_code = any($3))'
      using array['walk-1', 'walk-2', 'walk-3'], demo_locations, demo_barbers;
  end if;

  if to_regclass('public.waitlist_entries') is not null then
    execute 'delete from public.waitlist_entries where location_id in (select id from public.locations where reference_code = any($1)) or barber_preference in (select id from public.barbers where reference_code = any($2)) or client_id in (select id from public.clients where reference_code = any($3)) or service_id in (select id from public.services where reference_code = any($4))'
      using demo_locations, demo_barbers, demo_clients, demo_services;
  end if;

  if to_regclass('public.reviews') is not null then
    delete from public.reviews
    where appointment_id in (select id from public.appointments where reference_code = any(demo_appointments))
       or barber_id in (select id from public.barbers where reference_code = any(demo_barbers))
       or client_id in (select id from public.clients where reference_code = any(demo_clients))
       or location_id in (select id from public.locations where reference_code = any(demo_locations));
  end if;

  if to_regclass('public.appointments') is not null then
    execute '
      delete from public.appointments
      where reference_code = any($1)
         or service_id in (select id from public.services where reference_code = any($2))
         or barber_id in (select id from public.barbers where reference_code = any($3))
         or client_id in (select id from public.clients where reference_code = any($4))
         or location_id in (select id from public.locations where reference_code = any($5))
    '
      using demo_appointments, demo_services, demo_barbers, demo_clients, demo_locations;
  end if;

  if to_regclass('public.services') is not null then
    execute 'delete from public.services where reference_code = any($1)' using demo_services;
  end if;

  if to_regclass('public.barber_shop_memberships') is not null then
    execute 'delete from public.barber_shop_memberships where barber_reference = any($1) or shop_reference = any($2)' using demo_barbers, demo_shops;
  end if;

  if to_regclass('public.barber_working_hours') is not null then
    execute 'delete from public.barber_working_hours where barber_reference = any($1) or shop_reference = any($2)' using demo_barbers, demo_shops;
  end if;

  if to_regclass('public.barber_status') is not null then
    execute 'delete from public.barber_status where barber_reference = any($1) or shop_reference = any($2)' using demo_barbers, demo_shops;
  end if;

  if to_regclass('public.barber_profiles') is not null then
    execute 'delete from public.barber_profiles where barber_reference = any($1) or barber_email like ''%@bvrb3r.demo'' or display_name = any($2)' using demo_barbers, demo_barber_names;
  end if;

  if to_regclass('public.client_profiles') is not null then
    execute 'delete from public.client_profiles where client_reference = any($1) or profile_email like ''%@bvrb3r.demo'' or profile_email like ''%@example.com''' using demo_clients;
  end if;

  if to_regclass('public.user_roles') is not null then
    execute 'delete from public.user_roles where user_email like ''%@bvrb3r.demo'' or barber_reference = any($1) or client_reference = any($2) or location_references && $3'
      using demo_barbers, demo_clients, demo_locations;
  end if;

  if to_regclass('public.barbers') is not null then
    execute 'delete from public.barbers where reference_code = any($1)' using demo_barbers;
  end if;

  if to_regclass('public.clients') is not null then
    execute 'delete from public.clients where reference_code = any($1)' using demo_clients;
  end if;

  if to_regclass('public.locations') is not null then
    execute 'delete from public.locations where reference_code = any($1)' using demo_locations;
  end if;

  if to_regclass('public.shops') is not null then
    execute 'delete from public.shops where id = any($1)' using demo_shops;
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'delete from public.profiles where lower(email) = any($1) or lower(email) like ''%@bvrb3r.demo'' or (full_name = any($2) and lower(coalesce(email, '''')) like ''%@bvrb3r.demo'')'
      using demo_auth_emails, demo_barber_names;
  end if;

  if to_regclass('auth.identities') is not null then
    execute 'delete from auth.identities where user_id in (select id from auth.users where lower(email) = any($1) or lower(email) like ''%@bvrb3r.demo'')'
      using demo_auth_emails;
  end if;

  if to_regclass('auth.users') is not null then
    execute 'delete from auth.users where lower(email) = any($1) or lower(email) like ''%@bvrb3r.demo'''
      using demo_auth_emails;
  end if;
end $$;
