-- Minimal staging seed for canonical booking lifecycle validation.
-- Prerequisite auth users must already exist so public.handle_new_user()
-- has created matching public.profiles rows:
--   client@bvrb3r.demo
--   blaze@bvrb3r.demo
--   owner@bvrb3r.demo
--
-- This intentionally seeds only the canonical launch path:
-- profiles -> locations -> barbers/clients -> services -> availability_rules
-- No marketplace, trust, engagement, or analytics seed is included here.
-- Reference codes intentionally align with the existing runtime/demo IDs so
-- the booking provider and dashboard payloads operate against staging cleanly.

begin;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.profiles
    WHERE email IN ('client@bvrb3r.demo', 'blaze@bvrb3r.demo', 'owner@bvrb3r.demo')
  ) < 3 THEN
    RAISE EXCEPTION 'seed.staging-minimal.sql requires auth-backed profiles for client@bvrb3r.demo, blaze@bvrb3r.demo, and owner@bvrb3r.demo';
  END IF;
END $$;

update public.profiles
set role = case email
  when 'client@bvrb3r.demo' then 'client'::public.app_role
  when 'blaze@bvrb3r.demo' then 'booth_rent_barber'::public.app_role
  when 'owner@bvrb3r.demo' then 'owner'::public.app_role
  else role
end,
full_name = case email
  when 'client@bvrb3r.demo' then 'Jordan Ellis'
  when 'blaze@bvrb3r.demo' then 'Blaze King'
  when 'owner@bvrb3r.demo' then 'Brandon Rivers'
  else full_name
end,
phone = case email
  when 'client@bvrb3r.demo' then '(813) 555-0190'
  when 'blaze@bvrb3r.demo' then '(813) 555-0188'
  when 'owner@bvrb3r.demo' then '(813) 555-0101'
  else phone
end
where email in ('client@bvrb3r.demo', 'blaze@bvrb3r.demo', 'owner@bvrb3r.demo');

insert into public.locations (
  id,
  name,
  neighborhood,
  city,
  state,
  phone,
  hours,
  tax_rate,
  reference_code
)
values (
  '11111111-1111-1111-1111-111111111111',
  'BVRB3R Ybor',
  'Ybor City',
  'Tampa',
  'FL',
  '(813) 555-0100',
  '{"mon":["09:00","18:00"],"tue":["09:00","18:00"],"wed":["09:00","18:00"],"thu":["09:00","18:00"],"fri":["09:00","19:00"],"sat":["10:00","17:00"]}'::jsonb,
  0.0750,
  'loc-ybor'
)
on conflict (id) do update
set
  name = excluded.name,
  neighborhood = excluded.neighborhood,
  city = excluded.city,
  state = excluded.state,
  phone = excluded.phone,
  hours = excluded.hours,
  tax_rate = excluded.tax_rate,
  reference_code = excluded.reference_code;

insert into public.services (
  id,
  location_id,
  category,
  name,
  description,
  duration_min,
  buffer_min,
  price,
  deposit_amount,
  full_prepay_required,
  active,
  reference_code
)
values (
  '33333333-3333-3333-3333-333333333331',
  '11111111-1111-1111-1111-111111111111',
  'Haircuts',
  'Signature Precision Cut',
  'Tailored fade, shear finish, hot towel detail.',
  60,
  10,
  55.00,
  15.00,
  false,
  true,
  'srv-signature'
)
on conflict (id) do update
set
  location_id = excluded.location_id,
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  duration_min = excluded.duration_min,
  buffer_min = excluded.buffer_min,
  price = excluded.price,
  deposit_amount = excluded.deposit_amount,
  full_prepay_required = excluded.full_prepay_required,
  active = excluded.active,
  reference_code = excluded.reference_code;

insert into public.barbers (
  id,
  profile_id,
  compensation_model,
  booth_rent_amount,
  booth_rent_frequency,
  bio,
  booking_slug,
  reference_code
)
select
  '3738ba51-df72-585a-b043-073a3690563e',
  p.id,
  'booth_rent',
  325.00,
  'weekly',
  'Clean fades, razor work, and steady chair time in Ybor.',
  'blaze-king',
  'barber-blaze'
from public.profiles p
where p.email = 'blaze@bvrb3r.demo'
on conflict (id) do update
set
  profile_id = excluded.profile_id,
  compensation_model = excluded.compensation_model,
  booth_rent_amount = excluded.booth_rent_amount,
  booth_rent_frequency = excluded.booth_rent_frequency,
  bio = excluded.bio,
  booking_slug = excluded.booking_slug,
  reference_code = excluded.reference_code;

insert into public.clients (
  id,
  profile_id,
  favorite_barber_id,
  loyalty_points,
  retention_tag,
  reference_code
)
select
  'b8bb000a-fb19-50ea-b040-7f9a40cfaf46',
  p.id,
  '3738ba51-df72-585a-b043-073a3690563e',
  220,
  'vip',
  'client-jordan'
from public.profiles p
where p.email = 'client@bvrb3r.demo'
on conflict (id) do update
set
  profile_id = excluded.profile_id,
  favorite_barber_id = excluded.favorite_barber_id,
  loyalty_points = excluded.loyalty_points,
  retention_tag = excluded.retention_tag,
  reference_code = excluded.reference_code;

insert into public.staff_locations (
  profile_id,
  location_id
)
select
  p.id,
  '11111111-1111-1111-1111-111111111111'
from public.profiles p
where p.email in ('blaze@bvrb3r.demo', 'owner@bvrb3r.demo')
on conflict (profile_id, location_id) do nothing;

insert into public.location_memberships (
  profile_id,
  location_id
)
select
  p.id,
  '11111111-1111-1111-1111-111111111111'
from public.profiles p
where p.email in ('blaze@bvrb3r.demo', 'owner@bvrb3r.demo')
on conflict (profile_id, location_id) do nothing;

delete from public.availability_rules
where barber_id = '3738ba51-df72-585a-b043-073a3690563e'
  and location_id = '11111111-1111-1111-1111-111111111111';

insert into public.availability_rules (
  barber_id,
  location_id,
  weekday,
  start_time,
  end_time
)
values
  ('3738ba51-df72-585a-b043-073a3690563e', '11111111-1111-1111-1111-111111111111', 1, '09:00', '17:00'),
  ('3738ba51-df72-585a-b043-073a3690563e', '11111111-1111-1111-1111-111111111111', 2, '09:00', '17:00'),
  ('3738ba51-df72-585a-b043-073a3690563e', '11111111-1111-1111-1111-111111111111', 3, '09:00', '17:00'),
  ('3738ba51-df72-585a-b043-073a3690563e', '11111111-1111-1111-1111-111111111111', 4, '09:00', '18:00'),
  ('3738ba51-df72-585a-b043-073a3690563e', '11111111-1111-1111-1111-111111111111', 5, '10:00', '16:00');

commit;