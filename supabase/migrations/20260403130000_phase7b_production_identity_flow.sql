do $$
begin
  create type public.barber_subtype as enum (
    'freelance',
    'blueprint',
    'commission'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.identity_onboarding_state as enum (
    'awaiting_contact_verification',
    'awaiting_role_selection',
    'role_selected',
    'active'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.approval_status as enum (
    'not_required',
    'pending',
    'under_review',
    'approved',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists primary_onboarding_role public.verification_subject_role,
  add column if not exists onboarding_state public.identity_onboarding_state not null default 'awaiting_contact_verification',
  add column if not exists phone_verified_at timestamptz,
  add column if not exists last_onboarded_at timestamptz;

alter table public.barbers
  add column if not exists barber_subtype public.barber_subtype,
  add column if not exists app_approval_status public.approval_status not null default 'pending',
  add column if not exists shop_approval_status public.approval_status not null default 'not_required',
  add column if not exists approval_notes text;

alter table public.shops
  add column if not exists owner_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists app_approval_status public.approval_status not null default 'pending';

create index if not exists shops_owner_profile_id_idx
  on public.shops (owner_profile_id)
  where owner_profile_id is not null;

create table if not exists public.phone_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  phone text not null,
  code_hash text not null,
  delivery_channel text not null default 'sms',
  delivery_provider text not null default 'twilio',
  attempt_count integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists phone_verification_challenges_profile_created_idx
  on public.phone_verification_challenges (profile_id, created_at desc);

create index if not exists phone_verification_challenges_profile_open_idx
  on public.phone_verification_challenges (profile_id, expires_at desc)
  where consumed_at is null;

alter table public.phone_verification_challenges enable row level security;

update public.profiles
set primary_onboarding_role = case
  when role = 'client' then 'client'::public.verification_subject_role
  when role in ('commission_barber', 'booth_rent_barber') then 'barber'::public.verification_subject_role
  when role = 'owner' then 'shop_owner'::public.verification_subject_role
  else primary_onboarding_role
end
where primary_onboarding_role is null
  and role in ('client', 'commission_barber', 'booth_rent_barber', 'owner');

update public.profiles
set onboarding_state = case
  when phone_verified_at is not null and primary_onboarding_role is not null then 'active'::public.identity_onboarding_state
  when phone_verified_at is not null then 'awaiting_role_selection'::public.identity_onboarding_state
  else 'awaiting_contact_verification'::public.identity_onboarding_state
end
where onboarding_state is null
   or onboarding_state = 'awaiting_contact_verification';

update public.barbers
set barber_subtype = case
  when compensation_model = 'commission' then 'commission'::public.barber_subtype
  else 'freelance'::public.barber_subtype
end
where barber_subtype is null;

update public.barbers
set app_approval_status = coalesce(app_approval_status, 'pending'::public.approval_status),
    shop_approval_status = case
      when compensation_model = 'commission' then coalesce(shop_approval_status, 'pending'::public.approval_status)
      else coalesce(shop_approval_status, 'not_required'::public.approval_status)
    end
where app_approval_status is null
   or shop_approval_status is null;
