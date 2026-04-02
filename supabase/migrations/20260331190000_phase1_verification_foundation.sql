-- =========================================================
-- PHASE 1: VERIFICATION FOUNDATION
-- Safe additive migration only.
-- No destructive changes.
-- No consumer cutover in this migration.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Extend existing canonical verification_status enum
-- Existing live values:
--   unverified, pending, verified, rejected, expired
-- Additive values for richer lifecycle:
--   not_started, in_progress, submitted, under_review,
--   approved, needs_update, suspended
-- ---------------------------------------------------------

alter type public.verification_status add value if not exists 'not_started';
alter type public.verification_status add value if not exists 'in_progress';
alter type public.verification_status add value if not exists 'submitted';
alter type public.verification_status add value if not exists 'under_review';
alter type public.verification_status add value if not exists 'approved';
alter type public.verification_status add value if not exists 'needs_update';
alter type public.verification_status add value if not exists 'suspended';

-- ---------------------------------------------------------
-- 2) New enums for control-plane expansion
-- ---------------------------------------------------------

do $$
begin
  create type public.verification_subject_role as enum (
    'client',
    'barber',
    'shop_owner'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.verification_document_type as enum (
    'government_id_front',
    'government_id_back',
    'drivers_license',
    'state_id',
    'passport',
    'barber_license',
    'restricted_barber_license',
    'cosmetology_license',
    'specialty_license',
    'shop_license',
    'salon_license',
    'business_registration',
    'ein_letter',
    'insurance_document',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.verification_review_type as enum (
    'identity',
    'professional_license',
    'business',
    'payout_tax',
    'compliance',
    'overall'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.verification_action_type as enum (
    'submitted',
    'approved',
    'rejected',
    'requested_update',
    'expired',
    'suspended',
    'reactivated',
    'visibility_enabled',
    'visibility_disabled',
    'booking_enabled',
    'booking_disabled',
    'payout_enabled',
    'payout_disabled'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.professional_license_type as enum (
    'barber',
    'restricted_barber',
    'cosmetologist',
    'specialist',
    'braider',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.business_license_type as enum (
    'barber_shop',
    'salon',
    'cosmetology_salon',
    'hybrid_shop',
    'other'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------
-- 3) Shared trigger for updated_at
-- ---------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------
-- 4) Add new aggregate/control-plane table:
--    verification_profiles
--
-- One row per user needing verification.
-- This is the aggregate gating row, not a duplicate
-- of barber_verifications/shop_verifications truth.
-- ---------------------------------------------------------

create table if not exists public.verification_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.verification_subject_role not null,
  overall_status public.verification_status not null default 'unverified',
  identity_status public.verification_status not null default 'unverified',
  license_status public.verification_status not null default 'unverified',
  business_status public.verification_status not null default 'unverified',
  payout_status public.verification_status not null default 'unverified',
  compliance_status public.verification_status not null default 'unverified',
  public_verified boolean not null default false,
  can_accept_bookings boolean not null default false,
  can_receive_payouts boolean not null default false,
  can_create_shop_listing boolean not null default false,
  current_requirements jsonb not null default '[]'::jsonb,
  review_notes text,
  last_reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists verification_profiles_role_idx
  on public.verification_profiles(role);

create index if not exists verification_profiles_overall_status_idx
  on public.verification_profiles(overall_status);

create index if not exists verification_profiles_public_verified_idx
  on public.verification_profiles(public_verified);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_verification_profiles_updated_at'
      and tgrelid = 'public.verification_profiles'::regclass
      and not tgisinternal
  ) then
    create trigger trg_verification_profiles_updated_at
    before update on public.verification_profiles
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------
-- 5) Add compliance_acceptances
-- ---------------------------------------------------------

create table if not exists public.compliance_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.verification_subject_role not null,
  document_key text not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists compliance_acceptances_user_id_idx
  on public.compliance_acceptances(user_id);

create index if not exists compliance_acceptances_role_idx
  on public.compliance_acceptances(role);

create index if not exists compliance_acceptances_document_key_idx
  on public.compliance_acceptances(document_key);

-- ---------------------------------------------------------
-- 6) Add verification_reviews
-- Canonical review/action timeline.
-- ---------------------------------------------------------

create table if not exists public.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  verification_profile_id uuid not null references public.verification_profiles(id) on delete cascade,
  review_type public.verification_review_type not null,
  action_type public.verification_action_type not null,
  from_status public.verification_status,
  to_status public.verification_status,
  reviewed_by uuid not null references auth.users(id),
  reason text,
  internal_notes text,
  created_at timestamptz not null default now()
);

create index if not exists verification_reviews_profile_id_idx
  on public.verification_reviews(verification_profile_id);

create index if not exists verification_reviews_action_type_idx
  on public.verification_reviews(action_type);

create index if not exists verification_reviews_created_at_idx
  on public.verification_reviews(created_at desc);

-- ---------------------------------------------------------
-- 7) Add verification_provider_links
-- Provider references only. No raw SSN.
-- ---------------------------------------------------------

create table if not exists public.verification_provider_links (
  id uuid primary key default gen_random_uuid(),
  verification_profile_id uuid not null references public.verification_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  provider_reference_id text not null,
  provider_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists verification_provider_links_provider_ref_uidx
  on public.verification_provider_links(provider, provider_subject, provider_reference_id);

create index if not exists verification_provider_links_profile_id_idx
  on public.verification_provider_links(verification_profile_id);

create index if not exists verification_provider_links_user_id_idx
  on public.verification_provider_links(user_id);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_verification_provider_links_updated_at'
      and tgrelid = 'public.verification_provider_links'::regclass
      and not tgisinternal
  ) then
    create trigger trg_verification_provider_links_updated_at
    before update on public.verification_provider_links
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------
-- 8) Expand canonical verification_documents in place
--
-- Existing table is already live and richer in DB than TS model.
-- Preserve existing columns and behavior.
-- Add only metadata/control fields needed for unified review.
-- ---------------------------------------------------------

alter table public.verification_documents
  add column if not exists verification_profile_id uuid references public.verification_profiles(id) on delete set null,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists shop_id text references public.shops(id) on delete set null,
  add column if not exists document_type public.verification_document_type,
  add column if not exists status public.verification_status,
  add column if not exists mime_type text,
  add column if not exists issuing_state text,
  add column if not exists document_last4 text,
  add column if not exists issued_at date,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists review_notes text,
  add column if not exists updated_at timestamptz not null default now();

update public.verification_documents
set mime_type = content_type
where mime_type is null
  and content_type is not null;

update public.verification_documents
set status = 'pending'
where status is null;

create index if not exists verification_documents_profile_id_idx
  on public.verification_documents(verification_profile_id);

create index if not exists verification_documents_user_id_idx
  on public.verification_documents(user_id);

create index if not exists verification_documents_shop_id_idx
  on public.verification_documents(shop_id);

create index if not exists verification_documents_status_idx
  on public.verification_documents(status);

create index if not exists verification_documents_document_type_idx
  on public.verification_documents(document_type);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_verification_documents_updated_at'
      and tgrelid = 'public.verification_documents'::regclass
      and not tgisinternal
  ) then
    create trigger trg_verification_documents_updated_at
    before update on public.verification_documents
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------
-- 9) Expand barber_verifications in place
--
-- Existing canonical detail table for professional verification.
-- Add aggregate/profile linkage and richer review metadata.
-- ---------------------------------------------------------

alter table public.barber_verifications
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists verification_profile_id uuid references public.verification_profiles(id) on delete set null,
  add column if not exists professional_license_type public.professional_license_type,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists current_requirements jsonb not null default '[]'::jsonb,
  add column if not exists identity_status public.verification_status,
  add column if not exists payout_status public.verification_status,
  add column if not exists compliance_status public.verification_status,
  add column if not exists provider_identity_status text,
  add column if not exists provider_connect_status text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists barber_verifications_user_id_idx
  on public.barber_verifications(user_id);

create index if not exists barber_verifications_profile_id_idx
  on public.barber_verifications(verification_profile_id);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_barber_verifications_updated_at'
      and tgrelid = 'public.barber_verifications'::regclass
      and not tgisinternal
  ) then
    create trigger trg_barber_verifications_updated_at
    before update on public.barber_verifications
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------
-- 10) Expand shop_verifications in place
--
-- Existing canonical detail table for business/shop verification.
-- shops.id is text in this repo, so keep text linkage.
-- ---------------------------------------------------------

alter table public.shop_verifications
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists verification_profile_id uuid references public.verification_profiles(id) on delete set null,
  add column if not exists dba_name text,
  add column if not exists ein_last4 text,
  add column if not exists state_of_registration text,
  add column if not exists business_license_type public.business_license_type,
  add column if not exists shop_license_number text,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists current_requirements jsonb not null default '[]'::jsonb,
  add column if not exists identity_status public.verification_status,
  add column if not exists payout_status public.verification_status,
  add column if not exists compliance_status public.verification_status,
  add column if not exists provider_connect_status text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists shop_verifications_user_id_idx
  on public.shop_verifications(user_id);

create index if not exists shop_verifications_profile_id_idx
  on public.shop_verifications(verification_profile_id);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_shop_verifications_updated_at'
      and tgrelid = 'public.shop_verifications'::regclass
      and not tgisinternal
  ) then
    create trigger trg_shop_verifications_updated_at
    before update on public.shop_verifications
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------
-- 11) Backfill verification_profiles from existing canonical subjects
--
-- Conservative bootstrap:
-- - barbers with barber_verifications => role barber
-- - owners tied to shop_verifications => role shop_owner
--
-- This only inserts rows where user_id is already known.
-- Deeper backfill can happen during service-layer cutover.
-- ---------------------------------------------------------

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
  'unverified'::public.verification_status,
  coalesce(bv.verification_status, 'unverified'::public.verification_status),
  'unverified'::public.verification_status,
  coalesce(bv.payout_status, 'unverified'::public.verification_status),
  coalesce(bv.compliance_status, 'unverified'::public.verification_status)
from public.barber_verifications bv
where bv.user_id is not null
on conflict (user_id) do nothing;

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
  coalesce(sv.identity_status, 'unverified'::public.verification_status),
  'unverified'::public.verification_status,
  coalesce(sv.verification_status, 'unverified'::public.verification_status),
  coalesce(sv.payout_status, 'unverified'::public.verification_status),
  coalesce(sv.compliance_status, 'unverified'::public.verification_status),
  false
from public.shop_verifications sv
where sv.user_id is not null
on conflict (user_id) do nothing;

update public.barber_verifications bv
set verification_profile_id = vp.id
from public.verification_profiles vp
where bv.user_id is not null
  and vp.user_id = bv.user_id
  and vp.role = 'barber'
  and bv.verification_profile_id is null;

update public.shop_verifications sv
set verification_profile_id = vp.id
from public.verification_profiles vp
where sv.user_id is not null
  and vp.user_id = sv.user_id
  and vp.role = 'shop_owner'
  and sv.verification_profile_id is null;

update public.verification_documents vd
set verification_profile_id = vp.id
from public.verification_profiles vp
where vd.user_id is not null
  and vp.user_id = vd.user_id
  and vd.verification_profile_id is null;

-- ---------------------------------------------------------
-- 12) RLS foundation
--
-- Enable RLS now; strict policies can be refined in Phase 2.
-- This migration avoids permissive policy rewrites until service
-- cutover is ready. Add minimal read-safe policies if absent.
-- ---------------------------------------------------------

alter table public.verification_profiles enable row level security;
alter table public.compliance_acceptances enable row level security;
alter table public.verification_reviews enable row level security;
alter table public.verification_provider_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'verification_profiles'
      and policyname = 'verification_profiles_select_own'
  ) then
    create policy verification_profiles_select_own
      on public.verification_profiles
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'compliance_acceptances'
      and policyname = 'compliance_acceptances_select_own'
  ) then
    create policy compliance_acceptances_select_own
      on public.compliance_acceptances
      for select
      using (auth.uid() = user_id);
  end if;
end $$;
