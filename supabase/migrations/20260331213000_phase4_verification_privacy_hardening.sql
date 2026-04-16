-- =========================================================
-- PHASE 4: VERIFICATION PRIVACY HARDENING
-- Defense-in-depth across storage, RLS, and verification data.
-- =========================================================

insert into storage.buckets (id, name, public)
values ('verification-private', 'verification-private', false)
on conflict (id) do update
set public = false;

alter table public.verification_documents
  add column if not exists storage_bucket text not null default 'verification-private';

update public.verification_documents
set storage_bucket = 'verification-private'
where storage_bucket is null;

create or replace function public.current_auth_email()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '');
$$;

create or replace function public.is_platform_admin_request()
returns boolean
language sql
stable
as $$
  select false;
$$;

create or replace function public.is_verification_document_subject(
  doc_user_id uuid,
  doc_owner_type public.verification_owner_type,
  doc_owner_reference text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and doc_user_id is not null and auth.uid() = doc_user_id then
    return true;
  end if;

  if doc_owner_type = 'barber' and exists (
    select 1
    from public.barber_profiles bp
    where bp.barber_reference = doc_owner_reference
      and bp.barber_email = public.current_auth_email()
  ) then
    return true;
  end if;

  if doc_owner_type = 'shop' and exists (
    select 1
    from public.shop_verifications sv
    where sv.shop_reference = doc_owner_reference
      and sv.user_id = auth.uid()
  ) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.can_access_verification_storage_object(
  bucket_name text,
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    bucket_name = 'verification-private'
    and exists (
      select 1
      from public.verification_documents vd
      where coalesce(vd.storage_bucket, 'verification-private') = bucket_name
        and vd.storage_path = object_name
        and (
          public.is_platform_admin_request()
          or public.is_verification_document_subject(vd.user_id, vd.owner_type, vd.owner_reference)
        )
    );
$$;

alter table public.verification_documents enable row level security;
alter table public.verification_profiles enable row level security;
alter table public.verification_reviews enable row level security;
alter table public.verification_provider_links enable row level security;
alter table public.compliance_acceptances enable row level security;

drop policy if exists "verification documents self or owner" on public.verification_documents;
drop policy if exists verification_documents_select_subject on public.verification_documents;
drop policy if exists verification_documents_select_platform_admin on public.verification_documents;
drop policy if exists verification_profiles_select_own on public.verification_profiles;
drop policy if exists verification_profiles_select_platform_admin on public.verification_profiles;
drop policy if exists compliance_acceptances_select_own on public.compliance_acceptances;
drop policy if exists compliance_acceptances_select_platform_admin on public.compliance_acceptances;
drop policy if exists verification_reviews_select_platform_admin on public.verification_reviews;
drop policy if exists verification_provider_links_select_platform_admin on public.verification_provider_links;

create policy verification_documents_select_subject
  on public.verification_documents
  for select
  to authenticated
  using (public.is_verification_document_subject(user_id, owner_type, owner_reference));

create policy verification_documents_select_platform_admin
  on public.verification_documents
  for select
  to authenticated
  using (public.is_platform_admin_request());

create policy verification_profiles_select_own
  on public.verification_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy verification_profiles_select_platform_admin
  on public.verification_profiles
  for select
  to authenticated
  using (public.is_platform_admin_request());

create policy compliance_acceptances_select_own
  on public.compliance_acceptances
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy compliance_acceptances_select_platform_admin
  on public.compliance_acceptances
  for select
  to authenticated
  using (public.is_platform_admin_request());

create policy verification_reviews_select_platform_admin
  on public.verification_reviews
  for select
  to authenticated
  using (public.is_platform_admin_request());

create policy verification_provider_links_select_platform_admin
  on public.verification_provider_links
  for select
  to authenticated
  using (public.is_platform_admin_request());

drop policy if exists "verification private subject or admin read" on storage.objects;
drop policy if exists "verification private subject or admin insert" on storage.objects;

create policy "verification private subject or admin read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'verification-private'
    and public.can_access_verification_storage_object(bucket_id, name)
  );

create policy "verification private subject or admin insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'verification-private'
    and public.can_access_verification_storage_object(bucket_id, name)
  );
