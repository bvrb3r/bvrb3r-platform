-- PR #35 protected-risk migration candidate.
-- Creates metadata-only Architect evidence for public table RLS posture.
-- content_exposed=false; no table row contents are selected or exposed.

do $$
begin
  if to_regprocedure('private.rls_batch_5_is_platform_admin()') is null then
    raise exception 'private.rls_batch_5_is_platform_admin() is required before creating public.architect_rls_evidence';
  end if;
end $$;

create or replace view public.architect_rls_evidence
with (security_invoker = true)
as
with public_tables as (
  select
    c.oid as table_oid,
    n.nspname as schema_name,
    c.relname as table_name,
    c.relrowsecurity as rls_enabled
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not like 'pg\_%' escape '\'
    and c.relname not like 'sql\_%' escape '\'
),
policy_metadata as (
  select
    p.polrelid as table_oid,
    count(*)::integer as policy_count,
    coalesce(array_agg(p.polname::text order by p.polname), array[]::text[]) as policy_names
  from pg_catalog.pg_policy p
  group by p.polrelid
)
select
  concat(pt.schema_name, '.', pt.table_name) as id,
  pt.schema_name,
  pt.table_name,
  pt.rls_enabled,
  coalesce(pm.policy_count, 0) as policy_count,
  coalesce(pm.policy_names, array[]::text[]) as policy_names,
  count(*) over ()::integer as total_public_tables_inspected,
  now() as checked_at,
  now() as last_verified_at,
  true as evidence_current
from public_tables pt
left join policy_metadata pm on pm.table_oid = pt.table_oid
where private.rls_batch_5_is_platform_admin();

comment on view public.architect_rls_evidence is
  'Architect-only metadata view for public table RLS posture. Exposes table names, RLS enabled state, policy count, and policy names only. content_exposed=false; no user, business, money, Source Vault, or private row contents are exposed.';

comment on column public.architect_rls_evidence.id is
  'Safe metadata key in schema.table format.';

comment on column public.architect_rls_evidence.rls_enabled is
  'Safe metadata boolean from pg_class.relrowsecurity.';

comment on column public.architect_rls_evidence.policy_names is
  'Safe policy name metadata from pg_policy.polname; policy expressions and table rows are not exposed.';

revoke all on public.architect_rls_evidence from public;
revoke all on public.architect_rls_evidence from anon;
grant select on public.architect_rls_evidence to authenticated;
