-- BVRB3R V1 BLOCKER-1H
-- Remove direct caller authorization through legacy profiles.role values while
-- preserving each policy's non-role logic. Shop access is added as a separate,
-- explicitly scoped policy backed by shop_operator_access.

create or replace function private.has_shop_operator_access_to_barber_reference(
  target_barber_reference text,
  required_levels text[] default array['owner', 'manager', 'front_desk']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and target_barber_reference is not null
    and exists (
      select 1
      from public.barber_shop_memberships bsm
      join public.shop_operator_access soa
        on soa.shop_id = bsm.shop_reference
      where bsm.barber_reference = target_barber_reference
        and bsm.active = true
        and soa.profile_id = auth.uid()
        and soa.status = 'active'
        and soa.authority_level = any(required_levels)
    );
$$;

revoke all on function private.has_shop_operator_access_to_barber_reference(text, text[]) from public, anon, authenticated;
grant execute on function private.has_shop_operator_access_to_barber_reference(text, text[]) to authenticated;

create or replace function private.has_shop_operator_access_to_barber_id(
  target_barber_id uuid,
  required_levels text[] default array['owner', 'manager', 'front_desk']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and target_barber_id is not null
    and exists (
      select 1
      from public.barbers b
      where b.id = target_barber_id
        and private.has_shop_operator_access_to_barber_reference(
          b.reference_code,
          required_levels
        )
    );
$$;

revoke all on function private.has_shop_operator_access_to_barber_id(uuid, text[]) from public, anon, authenticated;
grant execute on function private.has_shop_operator_access_to_barber_id(uuid, text[]) to authenticated;

create or replace function private.has_shop_operator_access_to_appointment(
  target_appointment_id uuid,
  required_levels text[] default array['owner', 'manager', 'front_desk']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and target_appointment_id is not null
    and exists (
      select 1
      from public.appointments a
      where a.id = target_appointment_id
        and (
          private.has_shop_operator_access(a.shop_id, required_levels)
          or private.has_location_operator_access(a.location_id, required_levels)
          or private.has_shop_operator_access_to_barber_id(a.barber_id, required_levels)
        )
    );
$$;

revoke all on function private.has_shop_operator_access_to_appointment(uuid, text[]) from public, anon, authenticated;
grant execute on function private.has_shop_operator_access_to_appointment(uuid, text[]) to authenticated;

create or replace function private.has_shop_operator_access_to_payment(
  target_payment_id uuid,
  required_levels text[] default array['owner', 'manager', 'front_desk']::text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and target_payment_id is not null
    and exists (
      select 1
      from public.payments p
      where p.id = target_payment_id
        and (
          private.has_shop_operator_access_to_appointment(
            p.appointment_id,
            required_levels
          )
          or private.has_shop_operator_access_to_barber_id(
            p.barber_id,
            required_levels
          )
        )
    );
$$;

revoke all on function private.has_shop_operator_access_to_payment(uuid, text[]) from public, anon, authenticated;
grant execute on function private.has_shop_operator_access_to_payment(uuid, text[]) to authenticated;

create or replace function private.v1_normalize_caller_role_policy_expression(expression_text text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  normalized text := expression_text;
begin
  if normalized is null or btrim(normalized) = '' then
    return normalized;
  end if;

  -- Canonical public identities.
  normalized := replace(normalized, '''client''::public.app_role', '''client_user''::public.app_role');
  normalized := replace(normalized, '''client''::app_role', '''client_user''::public.app_role');
  normalized := replace(normalized, '''client''::text', '''client_user''::text');
  normalized := replace(normalized, '''client''', '''client_user''');

  normalized := replace(normalized, '''commission_barber''::public.app_role', '''barber_user''::public.app_role');
  normalized := replace(normalized, '''commission_barber''::app_role', '''barber_user''::public.app_role');
  normalized := replace(normalized, '''commission_barber''::text', '''barber_user''::text');
  normalized := replace(normalized, '''commission_barber''', '''barber_user''');

  normalized := replace(normalized, '''booth_rent_barber''::public.app_role', '''barber_user''::public.app_role');
  normalized := replace(normalized, '''booth_rent_barber''::app_role', '''barber_user''::public.app_role');
  normalized := replace(normalized, '''booth_rent_barber''::text', '''barber_user''::text');
  normalized := replace(normalized, '''booth_rent_barber''', '''barber_user''');

  -- Legacy Shop and internal identities are never public account roles. Casted
  -- enum references become typed NULL; uncased text references become a value
  -- that cannot match production data. Separate policies restore authorized
  -- Shop/Internal access from protected truth.
  normalized := replace(normalized, '''owner''::public.app_role', 'null::public.app_role');
  normalized := replace(normalized, '''owner''::app_role', 'null::public.app_role');
  normalized := replace(normalized, '''owner''::text', 'null::text');
  normalized := replace(normalized, '''owner''', '''__removed_shop_authority__''');

  normalized := replace(normalized, '''manager''::public.app_role', 'null::public.app_role');
  normalized := replace(normalized, '''manager''::app_role', 'null::public.app_role');
  normalized := replace(normalized, '''manager''::text', 'null::text');
  normalized := replace(normalized, '''manager''', '''__removed_shop_authority__''');

  normalized := replace(normalized, '''front_desk''::public.app_role', 'null::public.app_role');
  normalized := replace(normalized, '''front_desk''::app_role', 'null::public.app_role');
  normalized := replace(normalized, '''front_desk''::text', 'null::text');
  normalized := replace(normalized, '''front_desk''', '''__removed_shop_authority__''');

  normalized := replace(normalized, '''platform_admin''::public.app_role', 'null::public.app_role');
  normalized := replace(normalized, '''platform_admin''::app_role', 'null::public.app_role');
  normalized := replace(normalized, '''platform_admin''::text', 'null::text');
  normalized := replace(normalized, '''platform_admin''', '''__removed_internal_authority__''');

  return normalized;
end;
$$;

revoke all on function private.v1_normalize_caller_role_policy_expression(text) from public, anon, authenticated;

-- Rewrite only policies that derive caller authorization from profiles or the
-- legacy current_profile_role helper. Row role/audience values outside caller
-- authorization remain untouched.
do $$
declare
  policy_row record;
  original_expression text;
  normalized_qual text;
  normalized_check text;
  required_levels text;
  scope_expression text;
  scoped_policy_name text;
  internal_policy_name text;
  has_shop_authority_literal boolean;
  has_internal_authority_literal boolean;
  has_shop_id boolean;
  has_shop_reference boolean;
  has_location_id boolean;
  has_location_reference boolean;
  has_location_references boolean;
  has_appointment_id boolean;
  has_payment_id boolean;
  has_barber_id boolean;
  has_barber_reference boolean;
begin
  for policy_row in
    select *
    from pg_policies pol
    where pol.schemaname = 'public'
      and (
        lower(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) like '%from profiles%'
        or lower(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) like '%current_profile_role%'
        or lower(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) like '%profiles.role%'
      )
      and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~
        '''(owner|manager|front_desk|platform_admin|commission_barber|booth_rent_barber|client)'''
  loop
    original_expression := coalesce(policy_row.qual, '') || ' ' || coalesce(policy_row.with_check, '');
    normalized_qual := private.v1_normalize_caller_role_policy_expression(policy_row.qual);
    normalized_check := private.v1_normalize_caller_role_policy_expression(policy_row.with_check);

    has_shop_authority_literal := original_expression ~ '''(owner|manager|front_desk)''';
    has_internal_authority_literal := original_expression ~ '''platform_admin''';

    if original_expression ~ '''front_desk''' then
      required_levels := 'array[''owner'', ''manager'', ''front_desk'']::text[]';
    elsif original_expression ~ '''manager''' then
      required_levels := 'array[''owner'', ''manager'']::text[]';
    else
      required_levels := 'array[''owner'']::text[]';
    end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = policy_row.schemaname
        and table_name = policy_row.tablename
        and column_name = 'shop_id'
    ) into has_shop_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = policy_row.schemaname
        and table_name = policy_row.tablename
        and column_name = 'shop_reference'
    ) into has_shop_reference;
    select exists (
      select 1 from information_schema.columns
      where table_schema = policy_row.schemaname
        and table_name = policy_row.tablename
        and column_name = 'location_id'
    ) into has_location_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = policy_row.schemaname
        and table_name = policy_row.tablename
        and column_name = 'location_reference'
    ) into has_location_reference;
    select exists (
      select 1 from information_schema.columns
      where table_schema = policy_row.schemaname
        and table_name = policy_row.tablename
        and column_name = 'location_references'
    ) into has_location_references;
    select exists (
      select 1 from information_schema.columns
      where table_schema = policy_row.schemaname
        and table_name = policy_row.tablename
        and column_name = 'appointment_id'
    ) into has_appointment_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = policy_row.schemaname
        and table_name = policy_row.tablename
        and column_name = 'payment_id'
    ) into has_payment_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = policy_row.schemaname
        and table_name = policy_row.tablename
        and column_name = 'barber_id'
    ) into has_barber_id;
    select exists (
      select 1 from information_schema.columns
      where table_schema = policy_row.schemaname
        and table_name = policy_row.tablename
        and column_name = 'barber_reference'
    ) into has_barber_reference;

    if policy_row.tablename = 'shops' then
      scope_expression := format(
        'private.has_shop_operator_access(id::text, %s)',
        required_levels
      );
    elsif has_shop_id then
      scope_expression := format(
        'private.has_shop_operator_access(shop_id::text, %s)',
        required_levels
      );
    elsif has_shop_reference then
      scope_expression := format(
        'private.has_shop_operator_access(shop_reference::text, %s)',
        required_levels
      );
    elsif has_location_id then
      scope_expression := format(
        'private.has_location_operator_access(location_id, %s)',
        required_levels
      );
    elsif has_location_reference then
      scope_expression := format(
        'private.has_shop_operator_access(location_reference::text, %s)',
        required_levels
      );
    elsif has_location_references then
      scope_expression := format(
        'private.has_shop_operator_access_to_any(location_references, %s)',
        required_levels
      );
    elsif has_appointment_id then
      scope_expression := format(
        'private.has_shop_operator_access_to_appointment(appointment_id, %s)',
        required_levels
      );
    elsif has_payment_id then
      scope_expression := format(
        'private.has_shop_operator_access_to_payment(payment_id, %s)',
        required_levels
      );
    elsif has_barber_id then
      scope_expression := format(
        'private.has_shop_operator_access_to_barber_id(barber_id, %s)',
        required_levels
      );
    elsif has_barber_reference then
      scope_expression := format(
        'private.has_shop_operator_access_to_barber_reference(barber_reference, %s)',
        required_levels
      );
    else
      scope_expression := format(
        'private.has_any_shop_operator_access(%s)',
        required_levels
      );
    end if;

    if policy_row.cmd = 'SELECT' or policy_row.cmd = 'DELETE' then
      execute format(
        'alter policy %I on %I.%I to authenticated using (%s)',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        coalesce(nullif(normalized_qual, ''), 'false')
      );
    elsif policy_row.cmd = 'INSERT' then
      execute format(
        'alter policy %I on %I.%I to authenticated with check (%s)',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        coalesce(nullif(normalized_check, ''), 'false')
      );
    else
      execute format(
        'alter policy %I on %I.%I to authenticated using (%s) with check (%s)',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        coalesce(nullif(normalized_qual, ''), 'false'),
        coalesce(nullif(normalized_check, ''), coalesce(nullif(normalized_qual, ''), 'false'))
      );
    end if;

    if has_shop_authority_literal then
      scoped_policy_name := 'v1_scope_' || substr(
        md5(policy_row.tablename || ':' || policy_row.policyname || ':' || policy_row.cmd),
        1,
        20
      );
      execute format(
        'drop policy if exists %I on %I.%I',
        scoped_policy_name,
        policy_row.schemaname,
        policy_row.tablename
      );

      if policy_row.cmd = 'SELECT' or policy_row.cmd = 'DELETE' then
        execute format(
          'create policy %I on %I.%I for %s to authenticated using (%s)',
          scoped_policy_name,
          policy_row.schemaname,
          policy_row.tablename,
          lower(policy_row.cmd),
          scope_expression
        );
      elsif policy_row.cmd = 'INSERT' then
        execute format(
          'create policy %I on %I.%I for insert to authenticated with check (%s)',
          scoped_policy_name,
          policy_row.schemaname,
          policy_row.tablename,
          scope_expression
        );
      else
        execute format(
          'create policy %I on %I.%I for %s to authenticated using (%s) with check (%s)',
          scoped_policy_name,
          policy_row.schemaname,
          policy_row.tablename,
          lower(policy_row.cmd),
          scope_expression,
          scope_expression
        );
      end if;
    end if;

    if has_internal_authority_literal then
      internal_policy_name := 'v1_internal_' || substr(
        md5(policy_row.tablename || ':' || policy_row.policyname || ':' || policy_row.cmd),
        1,
        17
      );
      execute format(
        'drop policy if exists %I on %I.%I',
        internal_policy_name,
        policy_row.schemaname,
        policy_row.tablename
      );

      if policy_row.cmd = 'SELECT' or policy_row.cmd = 'DELETE' then
        execute format(
          'create policy %I on %I.%I for %s to authenticated using (private.is_internal_operator())',
          internal_policy_name,
          policy_row.schemaname,
          policy_row.tablename,
          lower(policy_row.cmd)
        );
      elsif policy_row.cmd = 'INSERT' then
        execute format(
          'create policy %I on %I.%I for insert to authenticated with check (private.is_internal_operator())',
          internal_policy_name,
          policy_row.schemaname,
          policy_row.tablename
        );
      else
        execute format(
          'create policy %I on %I.%I for %s to authenticated using (private.is_internal_operator()) with check (private.is_internal_operator())',
          internal_policy_name,
          policy_row.schemaname,
          policy_row.tablename,
          lower(policy_row.cmd)
        );
      end if;
    end if;
  end loop;
end;
$$;

drop function private.v1_normalize_caller_role_policy_expression(text);

create or replace view public.v1_direct_role_policy_cutover_evidence
with (security_invoker = true)
as
select
  (
    select count(*)
    from pg_policies pol
    where pol.schemaname = 'public'
      and (
        lower(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) like '%from profiles%'
        or lower(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) like '%current_profile_role%'
        or lower(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) like '%profiles.role%'
      )
      and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ~
        '''(owner|manager|front_desk|platform_admin|commission_barber|booth_rent_barber|client)'''
  ) as remaining_direct_caller_role_policy_count,
  (
    select count(*)
    from pg_policies pol
    where pol.schemaname = 'public'
      and pol.policyname like 'v1_scope_%'
  ) as generated_scoped_shop_policy_count,
  (
    select count(*)
    from pg_policies pol
    where pol.schemaname = 'public'
      and pol.policyname like 'v1_internal_%'
  ) as generated_internal_operator_policy_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'has_shop_operator_access_to_barber_reference',
        'has_shop_operator_access_to_barber_id',
        'has_shop_operator_access_to_appointment',
        'has_shop_operator_access_to_payment'
      )
      and p.prosecdef
      and p.proconfig = array['search_path=""']::text[]
  ) as protected_scope_helper_count;

comment on view public.v1_direct_role_policy_cutover_evidence is
  'V1 evidence that direct caller-role policies no longer authorize through legacy profiles.role values.';

revoke all on table public.v1_direct_role_policy_cutover_evidence from public, anon, authenticated;
grant select on table public.v1_direct_role_policy_cutover_evidence to service_role;