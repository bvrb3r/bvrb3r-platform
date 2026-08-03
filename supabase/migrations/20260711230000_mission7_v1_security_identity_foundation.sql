begin;

create schema if not exists private;

create or replace function private.canonicalize_profile_role(p_role text)
returns public.app_role
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_role, '')))
    when 'barber_user' then 'barber_user'::public.app_role
    when 'barber' then 'barber_user'::public.app_role
    when 'commission_barber' then 'barber_user'::public.app_role
    when 'booth_rent_barber' then 'barber_user'::public.app_role
    when 'shop_owner_user' then 'shop_owner_user'::public.app_role
    when 'shop_owner' then 'shop_owner_user'::public.app_role
    when 'owner' then 'shop_owner_user'::public.app_role
    else 'client_user'::public.app_role
  end;
$$;

revoke all on function private.canonicalize_profile_role(text) from public, anon, authenticated;

create or replace function private.enforce_canonical_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.role := private.canonicalize_profile_role(new.role::text);
  return new;
end;
$$;

revoke all on function private.enforce_canonical_profile_role() from public, anon, authenticated;

drop trigger if exists profiles_00_canonical_role_guard on public.profiles;
create trigger profiles_00_canonical_role_guard
before insert or update of role on public.profiles
for each row execute function private.enforce_canonical_profile_role();

update public.profiles
set role = private.canonicalize_profile_role(role::text)
where role::text not in ('client_user', 'barber_user', 'shop_owner_user');

alter table public.profiles drop constraint if exists profiles_canonical_public_role_check;
alter table public.profiles
  add constraint profiles_canonical_public_role_check
  check (role::text in ('client_user', 'barber_user', 'shop_owner_user')) not valid;
alter table public.profiles validate constraint profiles_canonical_public_role_check;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  canonical_role public.app_role;
begin
  canonical_role := private.canonicalize_profile_role(new.raw_user_meta_data ->> 'role');

  insert into public.profiles (id, role, full_name, email, phone)
  values (
    new.id,
    canonical_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do update
  set role = excluded.role,
      full_name = excluded.full_name,
      email = excluded.email,
      phone = excluded.phone;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

do $$
declare
  fn record;
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and p.prokind = 'f'
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) cfg
        where cfg = 'search_path=""'
          or cfg like 'search_path=pg_catalog%'
      )
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = pg_catalog, public, private, auth',
      fn.nspname,
      fn.proname,
      fn.args
    );
  end loop;
end;
$$;

revoke all on function private.is_message_thread_participant(uuid) from public, anon;
grant execute on function private.is_message_thread_participant(uuid) to authenticated;

update public.shops
set public_hours = jsonb_build_object(
      'status', 'contact_shop',
      'display', 'Contact the shop for current hours.',
      'timezone', 'America/New_York',
      'source', 'owner_confirmation_required'
    ),
    policies = 'Current prices, deposits, cancellation, lateness, no-show, refund, and service-specific requirements are shown before confirmation. Contact the shop before arrival for current hours, accessibility, or special requests.',
    updated_at = now()
where app_approval_status::text = 'approved'
  and (
    public_hours is null
    or policies is null
    or btrim(policies) = ''
  );

create or replace function public.bvrb3r_v1_security_readiness_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $security$
with critical_tables(table_name) as (
  values
    ('profiles'), ('clients'), ('barbers'), ('shops'), ('appointments'),
    ('appointment_status_history'), ('payments'), ('payment_routing_records'),
    ('payout_executions'), ('refunds'), ('disputes'), ('message_threads'),
    ('messages'), ('notifications'), ('audit_logs'), ('platform_admin_audit_logs'),
    ('internal_operator_access'), ('shop_operator_access'), ('data_rights_requests')
),
base as (
  select
    (select count(*) from critical_tables c left join information_schema.tables t on t.table_schema='public' and t.table_name=c.table_name where t.table_name is null)::bigint as missing_critical_table_count,
    (select count(*) from critical_tables c join pg_catalog.pg_class pc on pc.relname=c.table_name join pg_catalog.pg_namespace pn on pn.oid=pc.relnamespace and pn.nspname='public' where not pc.relrowsecurity)::bigint as critical_table_without_rls_count,
    (select count(*) from public.profiles p where p.role::text not in ('client_user','barber_user','shop_owner_user'))::bigint as noncanonical_profile_role_count,
    (case when exists (
      select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_class t on t.oid=c.conrelid
      join pg_catalog.pg_namespace n on n.oid=t.relnamespace
      where n.nspname='public' and t.relname='profiles'
        and c.conname='profiles_canonical_public_role_check' and c.convalidated
    ) then 0 else 1 end)::bigint as canonical_role_constraint_missing_count,
    (case when exists (
      select 1 from pg_catalog.pg_trigger tg
      join pg_catalog.pg_class t on t.oid=tg.tgrelid
      join pg_catalog.pg_namespace n on n.oid=t.relnamespace
      where n.nspname='public' and t.relname='profiles'
        and tg.tgname='profiles_00_canonical_role_guard'
        and not tg.tgisinternal and tg.tgenabled <> 'D'
    ) then 0 else 1 end)::bigint as canonical_role_trigger_missing_count,
    (select count(*) from pg_catalog.pg_policies pol
      where pol.schemaname='public'
        and lower(coalesce(pol.qual,'') || ' ' || coalesce(pol.with_check,'')) ~
          $$('owner'|'manager'|'front_desk'|'commission_barber'|'booth_rent_barber'|'client')::(public\.)?app_role$$
    )::bigint as legacy_policy_literal_count,
    (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.prosecdef and p.prokind='f'
        and not exists (
          select 1 from unnest(coalesce(p.proconfig,array[]::text[])) cfg
          where cfg='search_path=""' or cfg like 'search_path=pg_catalog%'
        )
    )::bigint as unsafe_security_definer_search_path_count,
    (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.prosecdef
        and exists (
          select 1
          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
          left join pg_catalog.pg_roles r on r.oid=acl.grantee
          where acl.privilege_type='EXECUTE'
            and (acl.grantee=0 or r.rolname in ('anon','public'))
        )
    )::bigint as publicly_executable_security_definer_function_count,
    (select count(*) from pg_catalog.pg_policies pol
      where pol.schemaname='public'
        and pol.tablename in (
          'profiles','appointments','payment_methods','payments','payment_routing_records',
          'payout_executions','message_threads','messages','notifications','audit_logs',
          'platform_admin_audit_logs','internal_operator_access','shop_operator_access','data_rights_requests'
        )
        and pol.roles && array['public','anon']::name[]
        and (
          (pol.cmd in ('SELECT','DELETE','ALL') and (pol.qual is null or lower(btrim(pol.qual,' ()'))='true'))
          or (pol.cmd in ('INSERT','UPDATE','ALL') and (pol.with_check is null or lower(btrim(pol.with_check,' ()'))='true'))
        )
    )::bigint as anonymously_broad_sensitive_policy_count,
    (select count(*) from (
      select pol.schemaname,pol.tablename,pol.cmd,pol.roles,coalesce(pol.qual,''),coalesce(pol.with_check,''),count(*)
      from pg_catalog.pg_policies pol
      where pol.schemaname='public'
      group by pol.schemaname,pol.tablename,pol.cmd,pol.roles,coalesce(pol.qual,''),coalesce(pol.with_check,'')
      having count(*)>1
    ) d)::bigint as exact_duplicate_policy_group_count,
    (select count(*) from (
      select schemaname,tablename,cmd,roles,count(*)
      from pg_catalog.pg_policies
      where schemaname='public' and permissive='PERMISSIVE'
      group by schemaname,tablename,cmd,roles
      having count(*)>1
    ) d)::bigint as permissive_policy_overlap_group_count,
    (select count(*) from pg_catalog.pg_policies pol
      where pol.schemaname='public'
        and pol.tablename in (
          'profiles','appointments','payment_methods','payments','payment_routing_records',
          'payout_executions','message_threads','messages','notifications','audit_logs','platform_admin_audit_logs'
        )
        and 'public'=any(pol.roles)
    )::bigint as public_role_policy_count_on_sensitive_tables
), totals as (
  select base.*,
    case
      when canonical_role_constraint_missing_count=0
       and canonical_role_trigger_missing_count=0
       and noncanonical_profile_role_count=0
      then 0::bigint
      else legacy_policy_literal_count
    end as active_legacy_role_policy_path_count
  from base
), scored as (
  select totals.*,
    missing_critical_table_count
    + critical_table_without_rls_count
    + noncanonical_profile_role_count
    + canonical_role_constraint_missing_count
    + canonical_role_trigger_missing_count
    + active_legacy_role_policy_path_count
    + unsafe_security_definer_search_path_count
    + publicly_executable_security_definer_function_count
    + anonymously_broad_sensitive_policy_count
    + exact_duplicate_policy_group_count as critical_total
  from totals
)
select jsonb_build_object(
  'schema_version',2,
  'generated_at',now(),
  'status',case when critical_total>0 then 'fail' else 'pass' end,
  'critical',jsonb_build_object(
    'missing_critical_table_count',missing_critical_table_count,
    'critical_table_without_rls_count',critical_table_without_rls_count,
    'noncanonical_profile_role_count',noncanonical_profile_role_count,
    'canonical_role_constraint_missing_count',canonical_role_constraint_missing_count,
    'canonical_role_trigger_missing_count',canonical_role_trigger_missing_count,
    'active_legacy_role_policy_path_count',active_legacy_role_policy_path_count,
    'unsafe_security_definer_search_path_count',unsafe_security_definer_search_path_count,
    'publicly_executable_security_definer_function_count',publicly_executable_security_definer_function_count,
    'anonymously_broad_sensitive_policy_count',anonymously_broad_sensitive_policy_count,
    'exact_duplicate_policy_group_count',exact_duplicate_policy_group_count
  ),
  'operational',jsonb_build_object(
    'legacy_policy_literal_count',legacy_policy_literal_count,
    'permissive_policy_overlap_group_count',permissive_policy_overlap_group_count,
    'public_role_policy_count_on_sensitive_tables',public_role_policy_count_on_sensitive_tables,
    'rls_enabled_public_table_count',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
    'security_definer_function_count',(select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef)
  ),
  'assurance',jsonb_build_object(
    'legacy_role_literals_are_inactive',active_legacy_role_policy_path_count=0,
    'canonical_role_constraint_enforced',canonical_role_constraint_missing_count=0,
    'canonical_role_trigger_enforced',canonical_role_trigger_missing_count=0,
    'security_definer_search_paths_hardened',unsafe_security_definer_search_path_count=0,
    'anonymous_sensitive_access_absent',anonymously_broad_sensitive_policy_count=0
  )
) from scored;
$security$;

revoke all on function public.bvrb3r_v1_security_readiness_snapshot() from public, anon, authenticated;
grant execute on function public.bvrb3r_v1_security_readiness_snapshot() to service_role;

create or replace function public.bvrb3r_v1_final_readiness_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with s as (
  select public.bvrb3r_v1_security_readiness_snapshot() security,
         public.bvrb3r_v1_identity_readiness_snapshot() identity,
         public.bvrb3r_v1_money_readiness_snapshot() money
)
select jsonb_build_object(
  'schema_version',1,
  'generated_at',now(),
  'status',case
    when security->>'status'='pass' and identity->>'status'='pass' and money->>'status'='pass' then 'pass'
    when security->>'status'='fail' or identity->>'status'='fail' or money->>'status'='fail' then 'fail'
    else 'needs_review'
  end,
  'security',security,
  'identity',identity,
  'money',money
) from s;
$$;

revoke all on function public.bvrb3r_v1_final_readiness_snapshot() from public, anon, authenticated;
grant execute on function public.bvrb3r_v1_final_readiness_snapshot() to service_role;

create table if not exists public.v1_architect_certification_records (
  id uuid primary key default gen_random_uuid(),
  commit_sha text not null,
  deployment_id text not null,
  environment text not null default 'production',
  status text not null,
  readiness_percent integer not null,
  gate_counts jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  integrity_algorithm text not null default 'sha256',
  integrity_signature text not null,
  signed_by_profile_id uuid null references public.profiles(id) on delete set null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint v1_architect_certification_status_check check (status in ('pass','failed')),
  constraint v1_architect_certification_percent_check check (readiness_percent between 0 and 100),
  constraint v1_architect_certification_commit_unique unique (commit_sha, environment)
);

alter table public.v1_architect_certification_records enable row level security;
revoke all on table public.v1_architect_certification_records from public, anon, authenticated;
grant all on table public.v1_architect_certification_records to service_role;

comment on table public.v1_architect_certification_records is
  'Commit-bound Mission 7 Architect certification records. The integrity signature is a SHA-256 evidence digest, not an external certificate-authority signature.';

notify pgrst, 'reload schema';

commit;
