begin;

do $preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.booth_rent_ledgers') is null
     or to_regclass('public.verification_documents') is null
     or to_regclass('public.rent_lifecycle_requests') is null
     or to_regclass('public.rent_payment_requests') is null
     or to_regclass('public.rent_obligations') is null
     or to_regclass('public.rent_line_disputes') is null
     or to_regclass('public.booth_rent_charges') is null
     or to_regclass('public.staff_locations') is null
     or to_regclass('storage.objects') is null then
    raise exception
      'Release-v22 convergence prerequisites are not present.';
  end if;

  if to_regprocedure('private.pr22_sha256(text)') is null
     or to_regprocedure('private.is_internal_operator(text[])') is null then
    raise exception
      'Required release-v22 private helpers are not present.';
  end if;
end
$preflight$;

create schema if not exists extensions;

do $extension$
declare
  extension_schema text;
begin
  select namespace.nspname
    into extension_schema
  from pg_extension extension_record
  join pg_namespace namespace
    on namespace.oid = extension_record.extnamespace
  where extension_record.extname = 'btree_gist';

  if extension_schema is null then
    raise exception 'Required extension btree_gist is not installed.';
  end if;

  if extension_schema <> 'extensions' then
    execute 'alter extension btree_gist set schema extensions';
  end if;
end
$extension$;

create or replace function private.release_current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path to ''
as $function$
  select profile.role
  from public.profiles profile
  where profile.id = (select auth.uid())
$function$;

revoke all on function private.release_current_profile_role()
  from public, anon, authenticated, service_role;

grant execute on function private.release_current_profile_role()
  to authenticated, service_role;

create or replace function private.release_is_verification_document_subject(
  document_user_id uuid,
  document_owner_type public.verification_owner_type,
  document_owner_reference text
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is not null
     and document_user_id is not null
     and (select auth.uid()) = document_user_id then
    return true;
  end if;

  if document_owner_type = 'barber'
     and exists (
       select 1
       from public.barber_profiles profile
       where profile.barber_reference = document_owner_reference
         and profile.barber_email = public.current_auth_email()
     ) then
    return true;
  end if;

  if document_owner_type = 'shop'
     and exists (
       select 1
       from public.shop_verifications verification
       where verification.shop_reference = document_owner_reference
         and verification.user_id = (select auth.uid())
     ) then
    return true;
  end if;

  return false;
end
$function$;

revoke all on function
  private.release_is_verification_document_subject(
    uuid,
    public.verification_owner_type,
    text
  )
  from public, anon, authenticated, service_role;

grant execute on function
  private.release_is_verification_document_subject(
    uuid,
    public.verification_owner_type,
    text
  )
  to authenticated, service_role;

create or replace function private.release_can_access_verification_storage_object(
  bucket_name text,
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select bucket_name = 'verification-private'
    and exists (
      select 1
      from public.verification_documents document
      where coalesce(
              document.storage_bucket,
              'verification-private'
            ) = bucket_name
        and document.storage_path = object_name
        and (
          private.is_internal_operator()
          or private.release_is_verification_document_subject(
            document.user_id,
            document.owner_type,
            document.owner_reference
          )
        )
    )
$function$;

revoke all on function
  private.release_can_access_verification_storage_object(text, text)
  from public, anon, authenticated, service_role;

grant execute on function
  private.release_can_access_verification_storage_object(text, text)
  to authenticated, service_role;

create or replace function private.release_can_read_profile(
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select (select auth.uid()) = target_profile_id
    or private.is_internal_operator()
    or exists (
      select 1
      from public.staff_locations membership
      where membership.profile_id = target_profile_id
        and membership.ended_at is null
        and membership.relationship_status in ('active', 'paused')
        and private.has_shop_operator_access(
          membership.shop_id,
          membership.location_id
        )
    )
$function$;

revoke all on function private.release_can_read_profile(uuid)
  from public, anon, authenticated, service_role;

grant execute on function private.release_can_read_profile(uuid)
  to authenticated, service_role;

drop policy if exists "profiles self or owner" on public.profiles;
drop policy if exists "release security profiles self or owner"
  on public.profiles;
drop policy if exists "release performance select" on public.profiles;

create policy "release profiles scoped select"
on public.profiles
for select
to authenticated
using (private.release_can_read_profile(id));

create or replace function private.release_can_read_booth_rent_ledger(
  ledger_barber_id uuid,
  ledger_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select private.is_internal_operator()
    or exists (
      select 1
      from public.barbers barber
      where barber.id = ledger_barber_id
        and barber.profile_id = (select auth.uid())
    )
    or private.has_shop_operator_access(
      ledger_shop_id::text,
      ledger_shop_id
    )
    or exists (
      select 1
      from public.barbers barber
      join public.staff_locations membership
        on membership.profile_id = barber.profile_id
      where barber.id = ledger_barber_id
        and membership.ended_at is null
        and membership.relationship_status in ('active', 'paused')
        and private.has_shop_operator_access(
          membership.shop_id,
          membership.location_id
        )
    )
$function$;

revoke all on function
  private.release_can_read_booth_rent_ledger(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  private.release_can_read_booth_rent_ledger(uuid, uuid)
  to authenticated, service_role;

drop policy if exists "booth rent owner or barber"
  on public.booth_rent_ledgers;

create policy "booth rent scoped owner or barber"
on public.booth_rent_ledgers
for select
to authenticated
using (
  private.release_can_read_booth_rent_ledger(barber_id, shop_id)
);

do $verification_policy$
begin
  execute
    'drop policy if exists "verification_documents_select_subject"
       on public.verification_documents';

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'verification_documents'
      and coalesce(qual, '') like
          '%private.release_is_verification_document_subject%'
  ) then
    execute $policy$
      create policy "release verification documents subject select"
      on public.verification_documents
      for select
      to authenticated
      using (
        private.is_internal_operator()
        or private.release_is_verification_document_subject(
          user_id,
          owner_type,
          owner_reference
        )
      )
    $policy$;
  end if;
end
$verification_policy$;

drop policy if exists "storage read media"
  on storage.objects;

drop policy if exists "verification private subject or admin read"
  on storage.objects;

create policy "verification private subject or admin read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-private'
  and private.release_can_access_verification_storage_object(
    bucket_id,
    name
  )
);

drop policy if exists "verification private subject or admin insert"
  on storage.objects;

create policy "verification private subject or admin insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'verification-private'
  and private.release_can_access_verification_storage_object(
    bucket_id,
    name
  )
);

drop function if exists
  public.can_access_verification_storage_object(text, text);

drop function if exists
  public.is_verification_document_subject(
    uuid,
    public.verification_owner_type,
    text
  );

drop function if exists public.current_profile_role();

alter table public.rent_lifecycle_requests
  add column if not exists request_fingerprint text;

update public.rent_lifecycle_requests
set request_fingerprint = private.pr22_sha256(
  jsonb_build_object(
    'actorProfileId', requested_by_profile_id,
    'relationshipId', relationship_id,
    'requestType', request_type,
    'reason', btrim(reason),
    'effectiveAt', requested_effective_at,
    'proposedTerms', proposed_terms
  )::text
);

alter table public.rent_lifecycle_requests
  alter column request_fingerprint set not null;

alter table public.rent_lifecycle_requests
  drop constraint if exists rent_lifecycle_requests_fingerprint_ck;

alter table public.rent_lifecycle_requests
  add constraint rent_lifecycle_requests_fingerprint_ck
  check (request_fingerprint ~ '^[0-9a-f]{64}$');

create or replace function
  private.release_rent_lifecycle_request_fingerprint()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE'
     and (
       new.requested_by_profile_id
         is distinct from old.requested_by_profile_id
       or new.relationship_id
         is distinct from old.relationship_id
       or new.request_type
         is distinct from old.request_type
       or new.reason
         is distinct from old.reason
       or new.requested_effective_at
         is distinct from old.requested_effective_at
       or new.proposed_terms
         is distinct from old.proposed_terms
     ) then
    raise exception using
      errcode = '23514',
      message =
        'A relationship lifecycle request identity is immutable.';
  end if;

  new.request_fingerprint := private.pr22_sha256(
    jsonb_build_object(
      'actorProfileId', new.requested_by_profile_id,
      'relationshipId', new.relationship_id,
      'requestType', new.request_type,
      'reason', btrim(new.reason),
      'effectiveAt', new.requested_effective_at,
      'proposedTerms', new.proposed_terms
    )::text
  );

  return new;
end
$function$;

revoke all on function
  private.release_rent_lifecycle_request_fingerprint()
  from public, anon, authenticated, service_role;

drop trigger if exists release_rent_lifecycle_request_fingerprint
  on public.rent_lifecycle_requests;

create trigger release_rent_lifecycle_request_fingerprint
before insert or update of
  requested_by_profile_id,
  relationship_id,
  request_type,
  reason,
  requested_effective_at,
  proposed_terms,
  request_fingerprint
on public.rent_lifecycle_requests
for each row
execute function
  private.release_rent_lifecycle_request_fingerprint();

alter table public.rent_payment_requests
  add column if not exists request_fingerprint text;

update public.rent_payment_requests
set request_fingerprint = private.pr22_sha256(
  jsonb_build_object(
    'actorProfileId', requested_by_profile_id,
    'obligationId', obligation_id,
    'paymentRail', payment_rail,
    'amountCents', requested_cents
  )::text
);

alter table public.rent_payment_requests
  alter column request_fingerprint set not null;

alter table public.rent_payment_requests
  drop constraint if exists rent_payment_requests_fingerprint_ck;

alter table public.rent_payment_requests
  add constraint rent_payment_requests_fingerprint_ck
  check (request_fingerprint ~ '^[0-9a-f]{64}$');

create or replace function
  private.release_rent_payment_request_fingerprint()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE'
     and (
       new.requested_by_profile_id
         is distinct from old.requested_by_profile_id
       or new.obligation_id
         is distinct from old.obligation_id
       or new.payment_rail
         is distinct from old.payment_rail
       or new.requested_cents
         is distinct from old.requested_cents
     ) then
    raise exception using
      errcode = '23514',
      message = 'A rent payment request identity is immutable.';
  end if;

  new.request_fingerprint := private.pr22_sha256(
    jsonb_build_object(
      'actorProfileId', new.requested_by_profile_id,
      'obligationId', new.obligation_id,
      'paymentRail', new.payment_rail,
      'amountCents', new.requested_cents
    )::text
  );

  return new;
end
$function$;

revoke all on function
  private.release_rent_payment_request_fingerprint()
  from public, anon, authenticated, service_role;

drop trigger if exists release_rent_payment_request_fingerprint
  on public.rent_payment_requests;

create trigger release_rent_payment_request_fingerprint
before insert or update of
  requested_by_profile_id,
  obligation_id,
  payment_rail,
  requested_cents,
  request_fingerprint
on public.rent_payment_requests
for each row
execute function
  private.release_rent_payment_request_fingerprint();

create or replace function
  private.release_relationship_has_unsettled_rent(
    p_relationship_id uuid
  )
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.rent_obligations obligation
    where obligation.relationship_id = p_relationship_id
      and obligation.status not in (
        'funded',
        'waived',
        'canceled'
      )
      and obligation.amount_settled_cents
          < obligation.base_rent_cents
            + obligation.late_fee_cents
  )
  or exists (
    select 1
    from public.rent_payment_requests payment_request
    join public.rent_obligations obligation
      on obligation.id = payment_request.obligation_id
    where obligation.relationship_id = p_relationship_id
      and payment_request.status in ('pending', 'processing')
  )
  or exists (
    select 1
    from public.rent_line_disputes dispute
    join public.rent_obligations obligation
      on obligation.id = dispute.obligation_id
    where obligation.relationship_id = p_relationship_id
      and dispute.status in ('open', 'under_review')
  )
  or exists (
    select 1
    from public.booth_rent_charges charge
    where charge.relationship_id = p_relationship_id
      and charge.status not in ('paid', 'waived', 'canceled')
      and charge.amount_paid_cents < charge.amount_cents
  )
$function$;

revoke all on function
  private.release_relationship_has_unsettled_rent(uuid)
  from public, anon, authenticated, service_role;

create or replace function
  private.release_staff_location_settle_first_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  relationship_id_value uuid;
begin
  if (
       old.relationship_status = 'active'
       and new.relationship_status in ('paused', 'ended')
     )
     or (
       old.relationship_status = 'paused'
       and new.relationship_status = 'ended'
     )
     or (
       old.ended_at is null
       and new.ended_at is not null
     ) then
    select relationship.id
      into relationship_id_value
    from public.shop_barber_relationships relationship
    where relationship.staff_location_id = new.id
      and relationship.status in ('active', 'suspended')
      and relationship.ended_at is null
    order by
      relationship.started_at desc nulls last,
      relationship.created_at desc
    limit 1;

    if relationship_id_value is not null
       and private.release_relationship_has_unsettled_rent(
         relationship_id_value
       ) then
      raise exception using
        errcode = '23514',
        message =
          'Rent must settle to $0.00 before pausing or ending this staff relationship.';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function
  private.release_staff_location_settle_first_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists release_staff_location_settle_first_guard
  on public.staff_locations;

create trigger release_staff_location_settle_first_guard
before update of relationship_status, ended_at
on public.staff_locations
for each row
execute function
  private.release_staff_location_settle_first_guard();

create or replace function
  private.release_relationship_settle_first_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (
       old.status = 'active'
       and new.status in ('suspended', 'ended')
     )
     or (
       old.status = 'suspended'
       and new.status = 'ended'
     )
     or (
       old.ended_at is null
       and new.ended_at is not null
     ) then
    if private.release_relationship_has_unsettled_rent(new.id) then
      raise exception using
        errcode = '23514',
        message =
          'Rent must settle to $0.00 before pausing or ending this shop relationship.';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function
  private.release_relationship_settle_first_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists release_relationship_settle_first_guard
  on public.shop_barber_relationships;

create trigger release_relationship_settle_first_guard
before update of status, ended_at
on public.shop_barber_relationships
for each row
execute function
  private.release_relationship_settle_first_guard();

notify pgrst, 'reload schema';

commit;
