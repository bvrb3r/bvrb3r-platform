-- =========================================================
-- PHASE 4B: VERIFICATION PROFILE MULTI-ROLE SUPPORT
-- Allow one account to hold separate verification lanes for:
-- - barber
-- - shop_owner
-- =========================================================

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

create index if not exists verification_profiles_user_id_idx
  on public.verification_profiles(user_id);

insert into public.verification_profiles (
  user_id,
  role,
  overall_status,
  identity_status,
  license_status,
  business_status,
  payout_status,
  compliance_status
)
select distinct
  bv.user_id,
  'barber'::public.verification_subject_role,
  coalesce(bv.verification_status, 'unverified'::public.verification_status),
  coalesce(bv.identity_status, 'not_started'::public.verification_status),
  coalesce(bv.verification_status, 'unverified'::public.verification_status),
  'not_started'::public.verification_status,
  coalesce(bv.payout_status, 'not_started'::public.verification_status),
  coalesce(bv.compliance_status, 'not_started'::public.verification_status)
from public.barber_verifications bv
where bv.user_id is not null
on conflict (user_id, role) do nothing;

insert into public.verification_profiles (
  user_id,
  role,
  overall_status,
  identity_status,
  license_status,
  business_status,
  payout_status,
  compliance_status,
  can_create_shop_listing
)
select distinct
  sv.user_id,
  'shop_owner'::public.verification_subject_role,
  coalesce(sv.verification_status, 'unverified'::public.verification_status),
  coalesce(sv.identity_status, 'not_started'::public.verification_status),
  'not_started'::public.verification_status,
  coalesce(sv.verification_status, 'unverified'::public.verification_status),
  coalesce(sv.payout_status, 'not_started'::public.verification_status),
  coalesce(sv.compliance_status, 'not_started'::public.verification_status),
  false
from public.shop_verifications sv
where sv.user_id is not null
on conflict (user_id, role) do nothing;

update public.barber_verifications bv
set verification_profile_id = vp.id
from public.verification_profiles vp
where bv.user_id is not null
  and vp.user_id = bv.user_id
  and vp.role = 'barber'
  and bv.verification_profile_id is distinct from vp.id;

update public.shop_verifications sv
set verification_profile_id = vp.id
from public.verification_profiles vp
where sv.user_id is not null
  and vp.user_id = sv.user_id
  and vp.role = 'shop_owner'
  and sv.verification_profile_id is distinct from vp.id;

update public.verification_documents vd
set
  user_id = coalesce(vd.user_id, bv.user_id),
  verification_profile_id = vp.id
from public.barber_verifications bv
join public.verification_profiles vp
  on vp.user_id = bv.user_id
 and vp.role = 'barber'
where vd.owner_type = 'barber'
  and vd.owner_reference = bv.barber_reference
  and (vd.user_id is null or vd.user_id = bv.user_id)
  and (
    vd.user_id is null
    or vd.verification_profile_id is null
    or vd.verification_profile_id is distinct from vp.id
  );

update public.verification_documents vd
set
  user_id = coalesce(vd.user_id, sv.user_id),
  shop_id = coalesce(vd.shop_id, sv.shop_reference),
  verification_profile_id = vp.id
from public.shop_verifications sv
join public.verification_profiles vp
  on vp.user_id = sv.user_id
 and vp.role = 'shop_owner'
where vd.owner_type = 'shop'
  and vd.owner_reference = sv.shop_reference
  and (vd.user_id is null or vd.user_id = sv.user_id)
  and (
    vd.user_id is null
    or vd.verification_profile_id is null
    or vd.verification_profile_id is distinct from vp.id
    or vd.shop_id is null
  );
