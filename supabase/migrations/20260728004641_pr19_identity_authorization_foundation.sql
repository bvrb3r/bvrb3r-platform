-- =========================================================
-- PR 19 — identity and authorization foundation.
--
-- Three things happen here, all of them boundary work that PR 20 (booking),
-- PR 21 (queue) and PR 22 (money) will consume. No booking, queue or money
-- behaviour is defined in this migration.
--
--   1. Close a live privilege-escalation path on public.profiles.
--   2. Close Data API exposure on the three POS tables that never had RLS.
--   3. Add the append-only identity audit spine.
--
-- ---------------------------------------------------------
-- 1. profiles authority columns
--
-- Before this migration, `profiles_update_own` was:
--
--     for update using (auth.uid() = id) with check (auth.uid() = id)
--
-- paired with a table-wide `grant update on public.profiles to authenticated`.
-- WITH CHECK proved only that the row still belonged to the caller — nothing
-- pinned the `role` column. Any authenticated user could therefore PATCH their
-- own profile row through the Data API and set `role = 'owner'`, which the
-- policies in 0001_initial_schema.sql treat as blanket authority:
--
--     using (auth.uid() = id or exists (
--       select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
--
-- so the escalated row immediately unlocked every other profile, and the
-- appointment and staff policies keyed on the same role.
--
-- Two independent controls close it, because either one alone can be
-- undermined by a future grant or a future policy:
--
--   (a) Column-level UPDATE grants. `authenticated` simply loses the privilege
--       to write the authority columns, so the escalating statement is refused
--       by the grant system before RLS is consulted.
--   (b) A BEFORE trigger that rejects authority changes from any actor that is
--       not the service role. This survives someone re-granting the column
--       later, and it also covers the INSERT bootstrap path, where a first
--       profile row could otherwise be created already privileged.
--
-- Legitimate role changes still work: they run through the server on the
-- service-role client, which is exempt.
-- =========================================================

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Roles a user may hold as a self-selected public lane. Picking "shop owner"
-- at signup is intended product behaviour; it grants a lane, not authority
-- over anyone else's data.
create or replace function private.pr19_is_self_selectable_role(p_role text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_role in (
    'client_user',
    'barber_user',
    'shop_owner_user',
    -- Legacy values still present on pre-doctrine rows; normalization owns them.
    'client',
    'barber',
    'commission_barber',
    'booth_rent_barber'
  );
$$;

revoke all on function private.pr19_is_self_selectable_role(text) from public;
grant execute on function private.pr19_is_self_selectable_role(text) to authenticated, service_role;

-- The service role is the only actor allowed to move a profile between lanes
-- or into an operator/admin role. PostgREST sets `current_user` to the role
-- named in the JWT, so a service-key request arrives as `service_role`.
-- `auth.role()` is deliberately not used.
create or replace function private.pr19_actor_is_trusted_writer()
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select current_user in ('service_role', 'supabase_admin', 'postgres')
      or session_user in ('service_role', 'supabase_admin', 'postgres');
$$;

revoke all on function private.pr19_actor_is_trusted_writer() from public;
grant execute on function private.pr19_actor_is_trusted_writer() to authenticated, service_role;

-- SECURITY DEFINER is deliberate and, here, necessary: a security trigger must
-- fire identically no matter which role performs the write, and must not be
-- disarmed by a caller who happens to lack EXECUTE on the predicate helpers it
-- calls. It is constrained accordingly — it lives in the non-exposed `private`
-- schema, its search_path is pinned to pg_catalog only (no `public`, so no
-- object in a writable schema can shadow what it resolves), it reads nothing
-- privileged, and PUBLIC execute is revoked below.
create or replace function private.pr19_guard_profile_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if private.pr19_actor_is_trusted_writer() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A user bootstrapping their own row may only land on a public lane.
    if not private.pr19_is_self_selectable_role(new.role::text) then
      raise exception 'profile_role_not_self_assignable'
        using hint = 'Operator and admin roles are assigned server-side, never at signup.';
    end if;

    if new.primary_onboarding_role is not null
       and not private.pr19_is_self_selectable_role(new.primary_onboarding_role::text) then
      raise exception 'profile_onboarding_role_not_self_assignable';
    end if;

    return new;
  end if;

  -- UPDATE: authority columns are immutable to the account holder. Role
  -- transitions are an activation decision, not a profile edit.
  if new.role is distinct from old.role then
    raise exception 'profile_role_change_forbidden'
      using hint = 'Role activation is server-authorized; it cannot be self-applied.';
  end if;

  if new.primary_onboarding_role is distinct from old.primary_onboarding_role then
    raise exception 'profile_onboarding_role_change_forbidden';
  end if;

  if new.id is distinct from old.id then
    raise exception 'profile_id_change_forbidden';
  end if;

  -- The username registry owns this column and keeps its own audit trail.
  if new.public_username is distinct from old.public_username then
    raise exception 'profile_username_change_forbidden'
      using hint = 'Claim a username through the public username registry.';
  end if;

  return new;
end;
$$;

revoke all on function private.pr19_guard_profile_authority() from public;

drop trigger if exists pr19_guard_profile_authority on public.profiles;
create trigger pr19_guard_profile_authority
  before insert or update on public.profiles
  for each row
  execute function private.pr19_guard_profile_authority();

-- Control (a): take away the privilege entirely for the authority columns.
revoke update on public.profiles from authenticated;
grant update (
  full_name,
  phone,
  phone_verified_at,
  onboarding_state,
  last_onboarded_at,
  profile_photo_path,
  profile_photo_url,
  public_bio,
  public_city,
  public_state
) on public.profiles to authenticated;

-- SELECT and INSERT are unchanged in shape; restated so the grant set for this
-- table is explicit in one place rather than inherited from older migrations.
grant select, insert on public.profiles to authenticated;

-- Explicit rather than implied. RLS already denies anon on every profiles
-- policy, because each one tests `auth.uid() = id` and an anonymous request
-- carries no uid — but this repository has no `alter default privileges`
-- statement, so Supabase's defaults hand `anon` table privileges it should
-- never have held on identity data. Removing the privilege means the request
-- is refused before a policy is ever consulted.
revoke all on public.profiles from anon;

-- The self-update policy keeps USING and WITH CHECK. Both are required: USING
-- picks the rows the caller may attempt to change, WITH CHECK re-proves
-- ownership of the resulting row so an update cannot hand the row to someone
-- else.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

comment on policy profiles_update_own on public.profiles is
  'Self-service profile edits. Authority columns are additionally protected by column-level grants and private.pr19_guard_profile_authority.';

-- =========================================================
-- 2. POS tables: RLS and least-privilege grants
--
-- pos_sales, pos_sale_items and pos_payment_requests were created without
-- `enable row level security` and without any GRANT or REVOKE. This repository
-- has no `alter default privileges` statement, so the Supabase defaults apply
-- and both `anon` and `authenticated` held full table privileges on money
-- records that were never behind a policy.
--
-- Every reader and writer in the application uses createSupabaseAdminClient
-- (service role), which bypasses RLS, so a deny-by-default posture closes the
-- exposure with no functional change. PR 22 owns the real ownership predicates
-- for these tables; this migration deliberately adds none, because guessing a
-- money predicate is worse than requiring the service role.
-- =========================================================

alter table if exists public.pos_sales enable row level security;
alter table if exists public.pos_sale_items enable row level security;
alter table if exists public.pos_payment_requests enable row level security;

revoke all on public.pos_sales from anon, authenticated;
revoke all on public.pos_sale_items from anon, authenticated;
revoke all on public.pos_payment_requests from anon, authenticated;

grant select, insert, update, delete on public.pos_sales to service_role;
grant select, insert, update, delete on public.pos_sale_items to service_role;
grant select, insert, update, delete on public.pos_payment_requests to service_role;

comment on table public.pos_sales is
  'Service-role only until PR 22 defines ownership predicates. RLS enabled with no client policy: deny by default.';

-- =========================================================
-- 3. Identity audit spine
--
-- Append-only record of identity and authorization decisions. It stores who
-- acted, what authority they held at the time, and what happened — never a
-- token, password, OTP, or raw credential payload. The application redaction
-- layer enforces the payload rule; the database enforces append-only.
-- =========================================================

create table if not exists public.identity_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- The authenticated actor. Null only for pre-authentication events such as a
  -- failed sign-in, where no verified identity exists yet.
  actor_user_id uuid references public.profiles(id) on delete set null,
  -- Authority held at the moment of the event, captured so a later role change
  -- cannot rewrite the meaning of the record.
  effective_role text,
  internal_access boolean not null default false,
  -- Ties an event to one request or one session for incident reconstruction.
  correlation_id text,
  session_id text,
  source text not null,
  entity_type text not null,
  entity_id text,
  action text not null,
  outcome text not null default 'succeeded',
  metadata jsonb not null default '{}'::jsonb,
  constraint identity_audit_events_outcome_check
    check (outcome in ('succeeded', 'denied', 'failed'))
);

create index if not exists identity_audit_events_actor_idx
  on public.identity_audit_events (actor_user_id, occurred_at desc);
create index if not exists identity_audit_events_correlation_idx
  on public.identity_audit_events (correlation_id);
create index if not exists identity_audit_events_entity_idx
  on public.identity_audit_events (entity_type, entity_id, occurred_at desc);

alter table public.identity_audit_events enable row level security;

-- No client policy: the audit spine is written and read server-side only.
-- RLS enabled with zero policies denies every non-service actor outright.
revoke all on public.identity_audit_events from anon, authenticated;
grant select, insert on public.identity_audit_events to service_role;

-- Append-only, enforced in the database rather than by convention. Even the
-- service role cannot quietly rewrite history.
create or replace function private.pr19_identity_audit_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'identity_audit_events_is_append_only'
    using hint = 'Identity audit records cannot be modified or removed.';
end;
$$;

revoke all on function private.pr19_identity_audit_append_only() from public;

drop trigger if exists pr19_identity_audit_append_only on public.identity_audit_events;
create trigger pr19_identity_audit_append_only
  before update or delete on public.identity_audit_events
  for each row
  execute function private.pr19_identity_audit_append_only();

comment on table public.identity_audit_events is
  'Append-only identity and authorization audit. Never stores tokens, passwords, OTP codes, or raw credential payloads.';

commit;
