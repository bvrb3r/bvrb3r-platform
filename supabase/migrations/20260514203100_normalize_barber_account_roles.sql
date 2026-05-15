update public.barbers
set barber_subtype = 'booth_rent'::public.barber_subtype
where barber_subtype::text = 'blueprint';

update public.barbers
set barber_subtype = case
  when compensation_model = 'commission' then 'commission'::public.barber_subtype
  else 'freelance'::public.barber_subtype
end
where barber_subtype is null;

update public.profiles
set primary_onboarding_role = 'barber'::public.verification_subject_role
where role in ('commission_barber', 'booth_rent_barber')
  and primary_onboarding_role is distinct from 'barber'::public.verification_subject_role;

update public.profiles
set role = 'barber'::public.app_role
where role in ('commission_barber', 'booth_rent_barber');

update public.user_roles
set role = 'barber'
where role in ('commission_barber', 'booth_rent_barber');

update public.barbers
set shop_approval_status = 'not_required'::public.approval_status
where barber_subtype = 'freelance'::public.barber_subtype
  and (shop_approval_status is null or shop_approval_status <> 'approved'::public.approval_status);
