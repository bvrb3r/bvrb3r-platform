-- Pre-open governance: elevate the real founder-controlled admin account.
insert into public.profiles (
  id,
  role,
  full_name,
  email,
  phone,
  primary_onboarding_role,
  onboarding_state,
  phone_verified_at,
  last_onboarded_at
)
select
  au.id,
  'platform_admin'::public.app_role,
  coalesce(au.raw_user_meta_data ->> 'full_name', au.email),
  au.email,
  coalesce(au.phone, au.raw_user_meta_data ->> 'phone'),
  'platform_admin'::public.verification_subject_role,
  'active'::public.identity_onboarding_state,
  coalesce(au.phone_confirmed_at, now()),
  now()
from auth.users au
where lower(au.email) = 'pmcgeefsu@gmail.com'
on conflict (id) do update
set role = excluded.role,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    email = excluded.email,
    phone = coalesce(public.profiles.phone, excluded.phone),
    primary_onboarding_role = excluded.primary_onboarding_role,
    onboarding_state = excluded.onboarding_state,
    phone_verified_at = coalesce(public.profiles.phone_verified_at, excluded.phone_verified_at),
    last_onboarded_at = now();
