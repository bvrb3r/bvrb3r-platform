insert into public.locations (id, name, neighborhood, city, state, phone, hours, tax_rate)
values
  ('11111111-1111-1111-1111-111111111111', 'Centro Ybor Flagship', 'Ybor City', 'Tampa', 'FL', '(813) 555-0101', '{"mon":"9-8","tue":"9-8","wed":"9-8","thu":"9-8","fri":"9-8","sat":"9-8","sun":"11-5"}', 0.075),
  ('22222222-2222-2222-2222-222222222222', 'Hyde Park Studio', 'Hyde Park', 'Tampa', 'FL', '(813) 555-0121', '{"mon":"10-7","tue":"10-7","wed":"10-7","thu":"10-7","fri":"10-7","sat":"10-7","sun":"11-4"}', 0.075)
on conflict (id) do nothing;

insert into public.services (id, location_id, category, name, description, duration_min, buffer_min, price, deposit_amount, full_prepay_required)
values
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Haircuts', 'Signature Precision Cut', 'Tailored fade, shear finish, hot towel detail.', 60, 10, 55, 15, false),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Shaves', 'Executive Razor Shave', 'Steam prep, hot towel, razor finish.', 45, 10, 42, 10, false),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Color', 'Grey Blend Camouflage', 'Natural blend for beard or hairline.', 35, 10, 48, 48, true)
on conflict (id) do nothing;

insert into public.live_clients (client_reference, full_name, phone, email, favorite_barber_reference, loyalty_points, retention_tag, notes)
values
  ('client-jordan', 'Jordan Ellis', '(813) 555-0190', 'client@bvrb3r.demo', 'barber-wave', 220, 'vip', '["Prefers low taper","Likes text reminders"]'::jsonb),
  ('client-nova', 'Nova Bennett', '(813) 555-0191', 'nova@example.com', 'barber-blaze', 44, 'repeat', '["Books every other Friday"]'::jsonb),
  ('client-rome', 'Rome Jackson', '(813) 555-0192', 'rome@example.com', 'barber-wave', 12, 'new', '["Requested beard oil recommendation"]'::jsonb),
  ('client-ava', 'Ava Rivera', '(813) 555-0193', 'ava@example.com', 'barber-luxe', 75, 'repeat', '["Usually books color camouflage"]'::jsonb),
  ('client-malik', 'Malik Grant', '(813) 555-0194', 'malik@example.com', 'barber-fade', 34, 'repeat', '["Prefers Saturdays"]'::jsonb),
  ('client-sage', 'Sage Franklin', '(813) 555-0195', 'sage@example.com', 'barber-fade', 18, 'new', '["Requested design consultation"]'::jsonb),
  ('client-cam', 'Cam Holloway', '(813) 555-0196', 'cam@example.com', 'barber-wave', 0, 'lapsed', '["Last visit 74 days ago"]'::jsonb),
  ('client-zoe', 'Zoe Harris', '(813) 555-0197', 'zoe@example.com', 'barber-luxe', 120, 'vip', '["Wants receipt by email"]'::jsonb),
  ('client-omar', 'Omar Pierce', '(813) 555-0198', 'omar@example.com', 'barber-blaze', 64, 'repeat', '["Books for event prep"]'::jsonb),
  ('client-lyric', 'Lyric Mason', '(813) 555-0199', 'lyric@example.com', 'barber-wave', 55, 'repeat', '["No-show warning on file"]'::jsonb),
  ('client-noah', 'Noah Quinn', '(813) 555-0200', 'noah@example.com', 'barber-blaze', 16, 'new', '["First responder discount approved"]'::jsonb),
  ('client-kai', 'Kai Summers', '(813) 555-0201', 'kai@example.com', 'barber-fade', 26, 'repeat', '["Sensitive skin for razor services"]'::jsonb)
on conflict (client_reference) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    favorite_barber_reference = excluded.favorite_barber_reference,
    loyalty_points = excluded.loyalty_points,
    retention_tag = excluded.retention_tag,
    notes = excluded.notes,
    updated_at = now();

insert into public.live_appointments (
  appointment_reference,
  location_reference,
  barber_reference,
  barber_user_reference,
  barber_email,
  client_reference,
  client_email,
  service_reference,
  status,
  source,
  starts_at,
  ends_at,
  chair_label,
  add_on_references,
  deposit_amount,
  total_amount,
  balance_due,
  tip_amount,
  client_note,
  lifecycle_revision,
  last_actor_role,
  last_event_type,
  checkout_reference,
  updated_at
)
values
  ('appt-1', 'loc-ybor', 'barber-wave', 'user-wave', 'wave@bvrb3r.demo', 'client-jordan', 'client@bvrb3r.demo', 'srv-signature', 'booked', 'booking', '2026-03-08T10:00:00-05:00', '2026-03-08T11:10:00-05:00', 'Chair 2', '{srv-beard}', 15, 73, 58, 0, 'Wedding prep cut.', 1, 'client', 'booking', null, '2026-03-08T10:00:00-05:00'),
  ('appt-2', 'loc-ybor', 'barber-wave', 'user-wave', 'wave@bvrb3r.demo', 'client-rome', 'rome@example.com', 'srv-premium', 'checked_in', 'front_desk', '2026-03-08T11:30:00-05:00', '2026-03-08T12:55:00-05:00', 'Chair 2', '{srv-blackmask}', 20, 90, 70, 0, 'Discuss membership.', 2, 'front_desk', 'check_in', null, '2026-03-08T11:30:00-05:00'),
  ('appt-3', 'loc-ybor', 'barber-blaze', 'user-blaze', 'blaze@bvrb3r.demo', 'client-nova', 'nova@example.com', 'srv-razor', 'in_service', 'booking', '2026-03-08T12:00:00-05:00', '2026-03-08T12:55:00-05:00', 'Chair 6', '{srv-blackmask}', 10, 54, 44, 0, 'Client on lunch break.', 3, 'barber', 'service_start', null, '2026-03-08T12:00:00-05:00'),
  ('appt-4', 'loc-ybor', 'barber-blaze', 'user-blaze', 'blaze@bvrb3r.demo', 'client-omar', 'omar@example.com', 'srv-signature', 'completed', 'booking', '2026-03-08T08:30:00-05:00', '2026-03-08T09:40:00-05:00', 'Chair 6', '{srv-enhancement}', 15, 70, 0, 15, 'Requested rebook in 2 weeks.', 4, 'front_desk', 'checkout', 'checkout-appt-4', '2026-03-08T09:45:00-05:00'),
  ('appt-5', 'loc-hyde', 'barber-fade', 'user-fade', 'fade@bvrb3r.demo', 'client-malik', 'malik@example.com', 'srv-design', 'booked', 'booking', '2026-03-08T13:00:00-05:00', '2026-03-08T14:00:00-05:00', 'Chair 3', '{srv-enhancement}', 15, 67, 52, 0, 'Game day look.', 1, 'client', 'booking', null, '2026-03-08T13:00:00-05:00'),
  ('appt-6', 'loc-hyde', 'barber-luxe', 'user-luxe', 'lux@bvrb3r.demo', 'client-ava', 'ava@example.com', 'srv-color', 'booked', 'booking', '2026-03-08T15:00:00-05:00', '2026-03-08T15:45:00-05:00', 'Chair 1', '{}', 48, 48, 0, 0, 'Fully prepaid service.', 1, 'client', 'booking', null, '2026-03-08T15:00:00-05:00'),
  ('appt-7', 'loc-hyde', 'barber-luxe', 'user-luxe', 'lux@bvrb3r.demo', 'client-zoe', 'zoe@example.com', 'srv-membership', 'completed', 'booking', '2026-03-07T16:00:00-05:00', '2026-03-07T16:55:00-05:00', 'Chair 1', '{srv-beard}', 0, 83, 0, 18, 'Send review request.', 4, 'front_desk', 'checkout', 'checkout-appt-7', '2026-03-07T17:00:00-05:00'),
  ('appt-8', 'loc-ybor', 'barber-wave', 'user-wave', 'wave@bvrb3r.demo', 'client-lyric', 'lyric@example.com', 'srv-kids', 'no_show', 'booking', '2026-03-07T18:00:00-05:00', '2026-03-07T18:45:00-05:00', 'Chair 2', '{}', 10, 32, 22, 0, 'Deposit retained under policy.', 1, 'front_desk', 'booking', null, '2026-03-07T18:00:00-05:00')
on conflict (appointment_reference) do update
set status = excluded.status,
    source = excluded.source,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    chair_label = excluded.chair_label,
    add_on_references = excluded.add_on_references,
    deposit_amount = excluded.deposit_amount,
    total_amount = excluded.total_amount,
    balance_due = excluded.balance_due,
    tip_amount = excluded.tip_amount,
    client_note = excluded.client_note,
    lifecycle_revision = excluded.lifecycle_revision,
    last_actor_role = excluded.last_actor_role,
    last_event_type = excluded.last_event_type,
    checkout_reference = excluded.checkout_reference,
    updated_at = excluded.updated_at,
    barber_email = excluded.barber_email,
    client_email = excluded.client_email;

insert into public.live_walk_in_queue (
  queue_reference,
  location_reference,
  client_name,
  requested_service,
  requested_at,
  status,
  assigned_barber_reference,
  wait_minutes
)
values
  ('walk-1', 'loc-ybor', 'Tre Benton', 'Signature Precision Cut', '2026-03-08T10:35:00-05:00', 'waiting', null, 18),
  ('walk-2', 'loc-ybor', 'Imani Cross', 'Executive Razor Shave', '2026-03-08T10:20:00-05:00', 'assigned', 'barber-blaze', 9),
  ('walk-3', 'loc-hyde', 'Jules Price', 'Future Star Kids Cut', '2026-03-08T11:10:00-05:00', 'waiting', null, 12)
on conflict (queue_reference) do update
set status = excluded.status,
    assigned_barber_reference = excluded.assigned_barber_reference,
    wait_minutes = excluded.wait_minutes,
    updated_at = now();

insert into public.workflow_events (
  appointment_reference,
  location_reference,
  barber_reference,
  barber_user_reference,
  barber_email,
  client_reference,
  client_email,
  actor_role,
  event_type,
  title,
  detail,
  event_payload,
  created_at
)
values
  ('appt-1', 'loc-ybor', 'barber-wave', 'user-wave', 'wave@bvrb3r.demo', 'client-jordan', 'client@bvrb3r.demo', 'client', 'booking', 'Client booked appointment', 'appt-1 is booked and awaiting check-in', '{"appointmentStatus":"booked","source":"booking","balanceDue":58,"totalAmount":73,"tipAmount":0,"hasCheckout":false}'::jsonb, '2026-03-08T10:00:00-05:00'),
  ('appt-2', 'loc-ybor', 'barber-wave', 'user-wave', 'wave@bvrb3r.demo', 'client-rome', 'rome@example.com', 'front_desk', 'check_in', 'Front desk checked in client', 'appt-2 moved to checked-in status', '{"appointmentStatus":"checked_in","source":"front_desk","balanceDue":70,"totalAmount":90,"tipAmount":0,"hasCheckout":false}'::jsonb, '2026-03-08T11:30:00-05:00'),
  ('appt-3', 'loc-ybor', 'barber-blaze', 'user-blaze', 'blaze@bvrb3r.demo', 'client-nova', 'nova@example.com', 'barber', 'service_start', 'Barber started service', 'appt-3 is now in service', '{"appointmentStatus":"in_service","source":"booking","balanceDue":44,"totalAmount":54,"tipAmount":0,"hasCheckout":false}'::jsonb, '2026-03-08T12:00:00-05:00'),
  ('appt-4', 'loc-ybor', 'barber-blaze', 'user-blaze', 'blaze@bvrb3r.demo', 'client-omar', 'omar@example.com', 'front_desk', 'checkout', 'Checkout captured payment and tip', 'appt-4 collected 55 plus 15 tip', '{"appointmentStatus":"completed","source":"booking","balanceDue":0,"totalAmount":70,"tipAmount":15,"hasCheckout":true}'::jsonb, '2026-03-08T09:45:00-05:00'),
  ('appt-7', 'loc-hyde', 'barber-luxe', 'user-luxe', 'lux@bvrb3r.demo', 'client-zoe', 'zoe@example.com', 'front_desk', 'checkout', 'Checkout captured payment and tip', 'appt-7 collected 83 plus 18 tip', '{"appointmentStatus":"completed","source":"booking","balanceDue":0,"totalAmount":83,"tipAmount":18,"hasCheckout":true}'::jsonb, '2026-03-07T17:00:00-05:00');

insert into public.compensation_snapshots (
  appointment_reference,
  location_reference,
  barber_reference,
  barber_user_reference,
  barber_email,
  client_reference,
  client_email,
  compensation_model,
  business_date,
  gross_service_amount,
  deposit_amount,
  collected_amount,
  tip_amount,
  commission_rate,
  commission_amount,
  booth_rent_amount,
  booth_rent_period_label,
  rent_coverage_amount,
  checkout_reference,
  captured_at,
  updated_at
)
values
  ('appt-4', 'loc-ybor', 'barber-blaze', 'user-blaze', 'blaze@bvrb3r.demo', 'client-omar', 'omar@example.com', 'booth_rent', '2026-03-08', 70, 15, 55, 15, null, 0, 325, 'Week of Mar 10', -240, 'checkout-appt-4', '2026-03-08T09:45:00-05:00', '2026-03-08T09:45:00-05:00'),
  ('appt-7', 'loc-hyde', 'barber-luxe', 'user-luxe', 'lux@bvrb3r.demo', 'client-zoe', 'zoe@example.com', 'booth_rent', '2026-03-07', 83, 0, 83, 18, null, 0, 1250, 'March 2026', -1149, 'checkout-appt-7', '2026-03-07T17:00:00-05:00', '2026-03-07T17:00:00-05:00')
on conflict (appointment_reference) do update
set gross_service_amount = excluded.gross_service_amount,
    deposit_amount = excluded.deposit_amount,
    collected_amount = excluded.collected_amount,
    tip_amount = excluded.tip_amount,
    commission_rate = excluded.commission_rate,
    commission_amount = excluded.commission_amount,
    booth_rent_amount = excluded.booth_rent_amount,
    booth_rent_period_label = excluded.booth_rent_period_label,
    rent_coverage_amount = excluded.rent_coverage_amount,
    checkout_reference = excluded.checkout_reference,
    captured_at = excluded.captured_at,
    updated_at = excluded.updated_at,
    barber_email = excluded.barber_email,
    client_email = excluded.client_email;

insert into public.owner_daily_analytics (
  location_reference,
  business_date,
  booked_count,
  completed_services_count,
  paid_appointments_count,
  revenue_total,
  tip_total,
  outstanding_balance,
  updated_at
)
values
  ('loc-ybor', '2026-03-08', 1, 1, 1, 70, 15, 172, '2026-03-08T12:00:00-05:00'),
  ('loc-hyde', '2026-03-08', 2, 0, 0, 0, 0, 52, '2026-03-08T12:00:00-05:00'),
  ('loc-hyde', '2026-03-07', 0, 1, 1, 83, 18, 0, '2026-03-07T17:00:00-05:00')
on conflict (location_reference, business_date) do update
set booked_count = excluded.booked_count,
    completed_services_count = excluded.completed_services_count,
    paid_appointments_count = excluded.paid_appointments_count,
    revenue_total = excluded.revenue_total,
    tip_total = excluded.tip_total,
    outstanding_balance = excluded.outstanding_balance,
    updated_at = excluded.updated_at;
insert into public.shops (id, name, brand_line, neighborhood, city, state, phone, address, kind, latitude, longitude)
values
  ('loc-ybor', 'Centro Ybor Flagship', 'BVRB3R flagship shop', 'Ybor City', 'Tampa', 'FL', '(813) 555-0101', '1600 E 7th Ave, Tampa, FL 33605', 'shop', 27.960830, -82.440980),
  ('loc-hyde', 'Hyde Park Studio', 'Private studio energy with BVRB3R service standards', 'Hyde Park', 'Tampa', 'FL', '(813) 555-0121', '702 S Village Cir, Tampa, FL 33606', 'shop', 27.934930, -82.474050)
on conflict (id) do update
set name = excluded.name,
    brand_line = excluded.brand_line,
    neighborhood = excluded.neighborhood,
    city = excluded.city,
    state = excluded.state,
    phone = excluded.phone,
    address = excluded.address,
    kind = excluded.kind,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    updated_at = now();

insert into public.user_roles (user_email, role, location_references, barber_reference, client_reference)
values
  ('owner@bvrb3r.demo', 'owner', '{loc-ybor,loc-hyde}', null, null),
  ('manager@bvrb3r.demo', 'manager', '{loc-ybor}', null, null),
  ('frontdesk@bvrb3r.demo', 'front_desk', '{loc-ybor}', null, null),
  ('wave@bvrb3r.demo', 'manager', '{loc-ybor}', 'barber-wave', null),
  ('fade@bvrb3r.demo', 'commission_barber', '{loc-hyde}', 'barber-fade', null),
  ('blaze@bvrb3r.demo', 'booth_rent_barber', '{loc-ybor}', 'barber-blaze', null),
  ('lux@bvrb3r.demo', 'booth_rent_barber', '{loc-hyde}', 'barber-luxe', null),
  ('client@bvrb3r.demo', 'client', '{loc-ybor}', null, 'client-jordan')
on conflict (user_email) do update
set role = excluded.role,
    location_references = excluded.location_references,
    barber_reference = excluded.barber_reference,
    client_reference = excluded.client_reference,
    updated_at = now();

insert into public.client_profiles (client_reference, profile_email, full_name, phone, favorite_barber_reference, favorite_shop_reference, loyalty_points, retention_tag, notes)
values
  ('client-jordan', 'client@bvrb3r.demo', 'Jordan Ellis', '(813) 555-0190', 'barber-wave', 'loc-ybor', 220, 'vip', '["Prefers low taper","Likes text reminders"]'::jsonb),
  ('client-nova', 'nova@example.com', 'Nova Bennett', '(813) 555-0191', 'barber-blaze', 'loc-ybor', 44, 'repeat', '["Books every other Friday"]'::jsonb),
  ('client-rome', 'rome@example.com', 'Rome Jackson', '(813) 555-0192', 'barber-wave', 'loc-ybor', 12, 'new', '["Requested beard oil recommendation"]'::jsonb),
  ('client-ava', 'ava@example.com', 'Ava Rivera', '(813) 555-0193', 'barber-luxe', 'loc-hyde', 75, 'repeat', '["Usually books color camouflage"]'::jsonb),
  ('client-malik', 'malik@example.com', 'Malik Grant', '(813) 555-0194', 'barber-fade', 'loc-hyde', 34, 'repeat', '["Prefers Saturdays"]'::jsonb)
on conflict (client_reference) do update
set profile_email = excluded.profile_email,
    full_name = excluded.full_name,
    phone = excluded.phone,
    favorite_barber_reference = excluded.favorite_barber_reference,
    favorite_shop_reference = excluded.favorite_shop_reference,
    loyalty_points = excluded.loyalty_points,
    retention_tag = excluded.retention_tag,
    notes = excluded.notes,
    updated_at = now();

insert into public.barber_shop_memberships (barber_reference, shop_reference, membership_type, active)
values
  ('barber-wave', 'loc-ybor', 'primary', true),
  ('barber-blaze', 'loc-ybor', 'primary', true),
  ('barber-fade', 'loc-hyde', 'primary', true),
  ('barber-luxe', 'loc-hyde', 'primary', true)
on conflict (barber_reference, shop_reference) do update
set membership_type = excluded.membership_type,
    active = excluded.active,
    updated_at = now();

insert into public.barber_working_hours (barber_reference, shop_reference, weekday, start_time, end_time)
values
  ('barber-wave', 'loc-ybor', 1, '09:00', '19:00'),
  ('barber-wave', 'loc-ybor', 2, '09:00', '19:00'),
  ('barber-wave', 'loc-ybor', 3, '09:00', '19:00'),
  ('barber-wave', 'loc-ybor', 4, '09:00', '19:00'),
  ('barber-wave', 'loc-ybor', 5, '09:00', '19:00'),
  ('barber-wave', 'loc-ybor', 6, '10:00', '17:00'),
  ('barber-blaze', 'loc-ybor', 1, '09:00', '18:00'),
  ('barber-blaze', 'loc-ybor', 2, '09:00', '18:00'),
  ('barber-blaze', 'loc-ybor', 3, '09:00', '18:00'),
  ('barber-blaze', 'loc-ybor', 4, '09:00', '18:00'),
  ('barber-blaze', 'loc-ybor', 5, '09:00', '18:00'),
  ('barber-blaze', 'loc-ybor', 6, '10:00', '16:00'),
  ('barber-fade', 'loc-hyde', 1, '10:00', '18:00'),
  ('barber-fade', 'loc-hyde', 2, '10:00', '18:00'),
  ('barber-fade', 'loc-hyde', 3, '10:00', '18:00'),
  ('barber-fade', 'loc-hyde', 4, '10:00', '18:00'),
  ('barber-fade', 'loc-hyde', 5, '10:00', '18:00'),
  ('barber-fade', 'loc-hyde', 6, '11:00', '16:00'),
  ('barber-luxe', 'loc-hyde', 1, '10:00', '17:00'),
  ('barber-luxe', 'loc-hyde', 2, '10:00', '17:00'),
  ('barber-luxe', 'loc-hyde', 3, '10:00', '17:00'),
  ('barber-luxe', 'loc-hyde', 4, '10:00', '17:00'),
  ('barber-luxe', 'loc-hyde', 5, '10:00', '17:00'),
  ('barber-luxe', 'loc-hyde', 6, '11:00', '15:00')
on conflict (barber_reference, shop_reference, weekday, start_time, end_time) do update
set updated_at = now();

insert into public.barber_status (barber_reference, shop_reference, status, next_available_at, accepting_bookings, availability_note)
values
  ('barber-wave', 'loc-ybor', 'available', '2026-03-08T10:00:00-05:00', true, 'Trusted favorite chair open this morning.'),
  ('barber-blaze', 'loc-ybor', 'busy', '2026-03-08T14:20:00-05:00', true, 'Currently mid-day with executive clients.'),
  ('barber-fade', 'loc-hyde', 'available', '2026-03-08T13:00:00-05:00', true, 'Ready for design sessions this afternoon.'),
  ('barber-luxe', 'loc-hyde', 'available', '2026-03-08T15:00:00-05:00', true, 'Luxury color and finish openings remain.')
on conflict (barber_reference) do update
set shop_reference = excluded.shop_reference,
    status = excluded.status,
    next_available_at = excluded.next_available_at,
    accepting_bookings = excluded.accepting_bookings,
    availability_note = excluded.availability_note,
    updated_at = now();

insert into public.payments (appointment_reference, client_reference, barber_reference, location_reference, amount, type, provider, status, metadata, created_at, updated_at)
values
  ('appt-1', 'client-jordan', 'barber-wave', 'loc-ybor', 15, 'deposit', 'mock', 'authorized', '{"source":"booking"}'::jsonb, '2026-03-08T10:00:00-05:00', '2026-03-08T10:00:00-05:00'),
  ('appt-4', 'client-omar', 'barber-blaze', 'loc-ybor', 55, 'checkout', 'mock', 'captured', '{"tipAmount":15,"source":"booking"}'::jsonb, '2026-03-08T09:45:00-05:00', '2026-03-08T09:45:00-05:00'),
  ('appt-7', 'client-zoe', 'barber-luxe', 'loc-hyde', 83, 'checkout', 'mock', 'captured', '{"tipAmount":18,"source":"booking"}'::jsonb, '2026-03-07T17:00:00-05:00', '2026-03-07T17:00:00-05:00')
on conflict do nothing;

insert into public.notifications (profile_id, channel, title, body, status, scheduled_for, appointment_reference, client_reference, barber_reference, location_reference, metadata, created_at, updated_at)
values
  (null, 'sms', 'Appointment confirmed', 'Jordan Ellis is confirmed with Wave Carter at Centro Ybor Flagship.', 'scheduled', '2026-03-08T10:01:00-05:00', 'appt-1', 'client-jordan', 'barber-wave', 'loc-ybor', '{"audience":"client"}'::jsonb, '2026-03-08T10:00:00-05:00', '2026-03-08T10:00:00-05:00'),
  (null, 'in_app', 'Client checked in', 'Rome Jackson is checked in and ready for Wave Carter.', 'scheduled', '2026-03-08T11:31:00-05:00', 'appt-2', 'client-rome', 'barber-wave', 'loc-ybor', '{"audience":"barber"}'::jsonb, '2026-03-08T11:30:00-05:00', '2026-03-08T11:30:00-05:00'),
  (null, 'sms', 'Service complete', 'Omar Pierce has completed a visit with Blaze King.', 'sent', '2026-03-08T09:46:00-05:00', 'appt-4', 'client-omar', 'barber-blaze', 'loc-ybor', '{"audience":"client"}'::jsonb, '2026-03-08T09:45:00-05:00', '2026-03-08T09:45:00-05:00')
on conflict do nothing;
