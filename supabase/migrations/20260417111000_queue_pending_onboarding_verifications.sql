-- Queue real pending barber/shop-owner onboarding lanes for Architect review.
-- This is intentionally scoped to real canonical production rows only:
-- profiles + barbers/shops with app_approval_status = pending.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.verification_profiles'::regclass
      and conname = 'verification_profiles_user_id_key'
  ) then
    alter table public.verification_profiles
      drop constraint verification_profiles_user_id_key;
  end if;
exception
  when undefined_table then null;
end $$;

create unique index if not exists verification_profiles_user_role_uidx
  on public.verification_profiles(user_id, role);

insert into public.verification_profiles (
  user_id,
  role,
  overall_status,
  identity_status,
  license_status,
  business_status,
  payout_status,
  compliance_status,
  public_verified,
  can_accept_bookings,
  can_receive_payouts,
  can_create_shop_listing,
  current_requirements
)
select
  b.profile_id,
  'barber'::public.verification_subject_role,
  'submitted'::public.verification_status,
  'not_started'::public.verification_status,
  'not_started'::public.verification_status,
  'not_started'::public.verification_status,
  'not_started'::public.verification_status,
  'not_started'::public.verification_status,
  false,
  false,
  false,
  false,
  jsonb_build_array(
    'Platform review required.',
    'Complete identity verification.',
    'Complete barber license verification.',
    'Connect payouts before going live.'
  )
from public.barbers b
join auth.users au
  on au.id = b.profile_id
join public.profiles p
  on p.id = b.profile_id
 and p.primary_onboarding_role = 'barber'
where b.app_approval_status = 'pending'
on conflict (user_id, role) do update
set
  overall_status = excluded.overall_status,
  current_requirements = case
    when public.verification_profiles.current_requirements = '[]'::jsonb
      then excluded.current_requirements
    else public.verification_profiles.current_requirements
  end,
  updated_at = now()
where public.verification_profiles.overall_status in (
  'unverified'::public.verification_status,
  'not_started'::public.verification_status,
  'pending'::public.verification_status,
  'in_progress'::public.verification_status,
  'submitted'::public.verification_status
);

insert into public.verification_profiles (
  user_id,
  role,
  overall_status,
  identity_status,
  license_status,
  business_status,
  payout_status,
  compliance_status,
  public_verified,
  can_accept_bookings,
  can_receive_payouts,
  can_create_shop_listing,
  current_requirements
)
select
  s.owner_profile_id,
  'shop_owner'::public.verification_subject_role,
  'submitted'::public.verification_status,
  'not_started'::public.verification_status,
  'not_started'::public.verification_status,
  'not_started'::public.verification_status,
  'not_started'::public.verification_status,
  'not_started'::public.verification_status,
  false,
  false,
  false,
  false,
  jsonb_build_array(
    'Platform review required.',
    'Complete business verification.',
    'Connect payouts before going live.',
    'Complete shop readiness before public listing.'
  )
from public.shops s
join auth.users au
  on au.id = s.owner_profile_id
join public.profiles p
  on p.id = s.owner_profile_id
 and p.primary_onboarding_role = 'shop_owner'
where s.app_approval_status = 'pending'
  and s.owner_profile_id is not null
on conflict (user_id, role) do update
set
  overall_status = excluded.overall_status,
  current_requirements = case
    when public.verification_profiles.current_requirements = '[]'::jsonb
      then excluded.current_requirements
    else public.verification_profiles.current_requirements
  end,
  updated_at = now()
where public.verification_profiles.overall_status in (
  'unverified'::public.verification_status,
  'not_started'::public.verification_status,
  'pending'::public.verification_status,
  'in_progress'::public.verification_status,
  'submitted'::public.verification_status
);

update public.barber_verifications bv
set
  user_id = b.profile_id,
  verification_profile_id = vp.id
from public.barbers b
join public.verification_profiles vp
  on vp.user_id = b.profile_id
 and vp.role = 'barber'
where bv.barber_reference = coalesce(b.reference_code, b.id::text)
  and (
    bv.user_id is null
    or bv.user_id = b.profile_id
  )
  and bv.verification_profile_id is distinct from vp.id;

update public.shop_verifications sv
set
  user_id = s.owner_profile_id,
  verification_profile_id = vp.id
from public.shops s
join public.verification_profiles vp
  on vp.user_id = s.owner_profile_id
 and vp.role = 'shop_owner'
where sv.shop_reference = s.id
  and s.owner_profile_id is not null
  and (
    sv.user_id is null
    or sv.user_id = s.owner_profile_id
  )
  and sv.verification_profile_id is distinct from vp.id;

update public.verification_documents vd
set
  user_id = b.profile_id,
  verification_profile_id = vp.id
from public.barbers b
join public.verification_profiles vp
  on vp.user_id = b.profile_id
 and vp.role = 'barber'
where vd.owner_type = 'barber'
  and vd.owner_reference = coalesce(b.reference_code, b.id::text)
  and (
    vd.user_id is null
    or vd.user_id = b.profile_id
  )
  and vd.verification_profile_id is distinct from vp.id;

update public.verification_documents vd
set
  user_id = s.owner_profile_id,
  shop_id = s.id,
  verification_profile_id = vp.id
from public.shops s
join public.verification_profiles vp
  on vp.user_id = s.owner_profile_id
 and vp.role = 'shop_owner'
where vd.owner_type = 'shop'
  and vd.owner_reference = s.id
  and s.owner_profile_id is not null
  and (
    vd.user_id is null
    or vd.user_id = s.owner_profile_id
  )
  and (
    vd.shop_id is distinct from s.id
    or vd.verification_profile_id is distinct from vp.id
  );
