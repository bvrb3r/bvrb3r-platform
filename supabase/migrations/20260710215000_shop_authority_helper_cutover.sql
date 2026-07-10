-- BVRB3R V1 BLOCKER-1G
-- Cut shared Shop authorization helpers away from profiles.role and onto the
-- protected shop_operator_access model introduced by Mission 1F.

create or replace function private.has_shop_operator_access_to_any(
  target_shop_ids text[],
  required_levels text[] default array['owner', 'manager', 'front_desk']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and coalesce(cardinality(target_shop_ids), 0) > 0
    and exists (
      select 1
      from public.shop_operator_access soa
      where soa.profile_id = auth.uid()
        and soa.status = 'active'
        and soa.authority_level = any(required_levels)
        and soa.shop_id = any(target_shop_ids)
    );
$$;

revoke all on function private.has_shop_operator_access_to_any(text[], text[]) from public, anon, authenticated;
grant execute on function private.has_shop_operator_access_to_any(text[], text[]) to authenticated;

create or replace function private.is_current_client()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text = 'client_user'
    );
$$;

revoke all on function private.is_current_client() from public, anon, authenticated;
grant execute on function private.is_current_client() to authenticated;

create or replace function private.is_current_barber()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      join public.barbers b on b.profile_id = p.id
      where p.id = auth.uid()
        and p.role::text = 'barber_user'
    );
$$;

revoke all on function private.is_current_barber() from public, anon, authenticated;
grant execute on function private.is_current_barber() to authenticated;

create or replace function private.current_barber_subtype_in(required_subtypes text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      join public.barbers b on b.profile_id = p.id
      where p.id = auth.uid()
        and p.role::text = 'barber_user'
        and coalesce(b.barber_subtype::text, b.compensation_model) = any(required_subtypes)
    );
$$;

revoke all on function private.current_barber_subtype_in(text[]) from public, anon, authenticated;
grant execute on function private.current_barber_subtype_in(text[]) to authenticated;

-- Existing policies depend on these function signatures. Replacing their
-- bodies preserves policy bindings while removing public-role authorization.
create or replace function private.is_booking_shop_operator(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_location_operator_access(
    target_location_id,
    array['owner', 'manager', 'front_desk']::text[]
  );
$$;

revoke all on function private.is_booking_shop_operator(uuid) from public, anon, authenticated;
grant execute on function private.is_booking_shop_operator(uuid) to authenticated;

create or replace function private.is_booking_shop_operator(target_shop_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_shop_operator_access(
    target_shop_id,
    array['owner', 'manager', 'front_desk']::text[]
  );
$$;

revoke all on function private.is_booking_shop_operator(text) from public, anon, authenticated;
grant execute on function private.is_booking_shop_operator(text) to authenticated;

create or replace function private.rls_batch_4_is_shop_operator_reference(target_shop_reference text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_shop_operator_access(
    target_shop_reference,
    array['owner', 'manager', 'front_desk']::text[]
  );
$$;

revoke all on function private.rls_batch_4_is_shop_operator_reference(text) from public, anon, authenticated;
grant execute on function private.rls_batch_4_is_shop_operator_reference(text) to authenticated;

create or replace function private.rls_batch_5_is_shop_operator_reference(target_shop_reference text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_shop_operator_access(
    target_shop_reference,
    array['owner', 'manager', 'front_desk']::text[]
  );
$$;

revoke all on function private.rls_batch_5_is_shop_operator_reference(text) from public, anon, authenticated;
grant execute on function private.rls_batch_5_is_shop_operator_reference(text) to authenticated;

create or replace function private.rls_batch_5_is_shop_operator_reference(
  target_shop_reference text,
  target_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_shop_operator_access(
      target_shop_reference,
      array['owner', 'manager', 'front_desk']::text[]
    )
    or private.has_location_operator_access(
      target_location_id,
      array['owner', 'manager', 'front_desk']::text[]
    );
$$;

revoke all on function private.rls_batch_5_is_shop_operator_reference(text, uuid) from public, anon, authenticated;
grant execute on function private.rls_batch_5_is_shop_operator_reference(text, uuid) to authenticated;

create or replace function private.rls_batch_5_is_shop_operator_reference(
  target_shop_reference text,
  target_location_reference text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_shop_operator_access(
    coalesce(target_shop_reference, target_location_reference),
    array['owner', 'manager', 'front_desk']::text[]
  );
$$;

revoke all on function private.rls_batch_5_is_shop_operator_reference(text, text) from public, anon, authenticated;
grant execute on function private.rls_batch_5_is_shop_operator_reference(text, text) to authenticated;

create or replace function private.rls_batch_5_is_shop_owner_actor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_shop_operator_access(array['owner']::text[]);
$$;

revoke all on function private.rls_batch_5_is_shop_owner_actor() from public, anon, authenticated;
grant execute on function private.rls_batch_5_is_shop_owner_actor() to authenticated;

create or replace function private.rls_batch_4_is_shop_owner_actor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_shop_operator_access(array['owner']::text[]);
$$;

revoke all on function private.rls_batch_4_is_shop_owner_actor() from public, anon, authenticated;
grant execute on function private.rls_batch_4_is_shop_owner_actor() to authenticated;

create or replace function private.rls_batch_5_is_shop_operator_actor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_shop_operator_access(
    array['owner', 'manager', 'front_desk']::text[]
  );
$$;

revoke all on function private.rls_batch_5_is_shop_operator_actor() from public, anon, authenticated;
grant execute on function private.rls_batch_5_is_shop_operator_actor() to authenticated;

create or replace function private.rls_batch_4_is_shop_operator_actor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_any_shop_operator_access(
    array['owner', 'manager', 'front_desk']::text[]
  );
$$;

revoke all on function private.rls_batch_4_is_shop_operator_actor() from public, anon, authenticated;
grant execute on function private.rls_batch_4_is_shop_operator_actor() to authenticated;

-- Replace the two known direct policies that used public identity as Shop
-- authority. These retain self-service behavior and become Shop/location scoped.
alter policy "location_memberships self or owner"
on public.location_memberships
using (
  profile_id = auth.uid()
  or private.has_location_operator_access(
    location_id,
    array['owner', 'manager']::text[]
  )
)
with check (
  profile_id = auth.uid()
  or private.has_location_operator_access(
    location_id,
    array['owner', 'manager']::text[]
  )
);

alter policy "user roles self or internal read"
on public.user_roles
using (
  lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or private.is_internal_operator()
  or private.has_shop_operator_access_to_any(
    location_references,
    array['owner', 'manager', 'front_desk']::text[]
  )
);

-- The profile table itself now rejects any future public account role outside
-- the canonical three, while historical actor/audience columns can keep the
-- wider shared enum until they are separately migrated.
alter table public.profiles
  drop constraint if exists profiles_public_account_role_check;

alter table public.profiles
  add constraint profiles_public_account_role_check
  check (role::text in ('client_user', 'barber_user', 'shop_owner_user'))
  not valid;

alter table public.profiles
  validate constraint profiles_public_account_role_check;

create or replace view public.v1_shop_authority_cutover_evidence
with (security_invoker = true)
as
select
  (
    select count(*)
    from public.profiles p
    where p.role::text not in ('client_user', 'barber_user', 'shop_owner_user')
  ) as noncanonical_profile_count,
  (
    select count(*)
    from pg_constraint c
    where c.conrelid = 'public.profiles'::regclass
      and c.conname = 'profiles_public_account_role_check'
      and c.convalidated
  ) as validated_profile_role_constraint_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'is_booking_shop_operator',
        'rls_batch_4_is_shop_operator_reference',
        'rls_batch_5_is_shop_operator_reference',
        'rls_batch_4_is_shop_owner_actor',
        'rls_batch_5_is_shop_owner_actor',
        'rls_batch_4_is_shop_operator_actor',
        'rls_batch_5_is_shop_operator_actor'
      )
      and pg_get_functiondef(p.oid) ~
        '''(owner|manager|front_desk|platform_admin|commission_barber|booth_rent_barber|client)'''
      and pg_get_functiondef(p.oid) !~ 'array\['
  ) as shared_helpers_with_profile_role_literal_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'is_booking_shop_operator',
        'rls_batch_4_is_shop_operator_reference',
        'rls_batch_5_is_shop_operator_reference',
        'rls_batch_4_is_shop_owner_actor',
        'rls_batch_5_is_shop_owner_actor',
        'rls_batch_4_is_shop_operator_actor',
        'rls_batch_5_is_shop_operator_actor'
      )
      and p.prosecdef
      and p.proconfig = array['search_path=""']::text[]
  ) as protected_shared_helper_count,
  (
    select count(*)
    from pg_policies pol
    where pol.schemaname = 'public'
      and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~
        '''(owner|manager|front_desk|platform_admin|commission_barber|booth_rent_barber|client)'''
  ) as remaining_legacy_role_policy_literal_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and p.proname not in (
        'bvrb3r_v1_identity_readiness_snapshot',
        'enforce_quarantined_profile_state',
        'has_shop_operator_access',
        'has_location_operator_access',
        'has_any_shop_operator_access',
        'has_shop_operator_access_to_any',
        'rls_batch_4_is_shop_operator_reference',
        'rls_batch_5_is_shop_operator_reference',
        'rls_batch_4_is_shop_owner_actor',
        'rls_batch_5_is_shop_owner_actor',
        'rls_batch_4_is_shop_operator_actor',
        'rls_batch_5_is_shop_operator_actor'
      )
      and pg_get_functiondef(p.oid) ~
        '''(owner|manager|front_desk|platform_admin|commission_barber|booth_rent_barber|client)'''
  ) as remaining_legacy_role_function_literal_count;

comment on view public.v1_shop_authority_cutover_evidence is
  'V1 evidence for canonical profile-role enforcement and Shop helper cutover.';

revoke all on table public.v1_shop_authority_cutover_evidence from public, anon, authenticated;
grant select on table public.v1_shop_authority_cutover_evidence to service_role;