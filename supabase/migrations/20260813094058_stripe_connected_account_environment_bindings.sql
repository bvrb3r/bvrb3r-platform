-- Make Stripe Connect account mappings environment-aware and retain every
-- provider binding when a mapping is deliberately replaced. This migration is
-- additive; the affected production account is reset only after the matching
-- application code is deployed and verified.

alter table public.connected_accounts
  add column if not exists provider_environment text,
  add column if not exists provider_account_generation bigint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'connected_accounts_provider_environment_ck'
      and conrelid = 'public.connected_accounts'::regclass
  ) then
    alter table public.connected_accounts
      add constraint connected_accounts_provider_environment_ck
      check (provider_environment is null or provider_environment in ('live', 'test'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'connected_accounts_provider_environment_account_ck'
      and conrelid = 'public.connected_accounts'::regclass
  ) then
    alter table public.connected_accounts
      add constraint connected_accounts_provider_environment_account_ck
      check (provider_environment is null or provider_account_id is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'connected_accounts_provider_generation_ck'
      and conrelid = 'public.connected_accounts'::regclass
  ) then
    alter table public.connected_accounts
      add constraint connected_accounts_provider_generation_ck
      check (provider_account_generation >= 0);
  end if;
end
$$;

create table if not exists public.connected_account_provider_bindings (
  id uuid primary key default gen_random_uuid(),
  connected_account_id uuid not null references public.connected_accounts(id) on delete restrict,
  provider text not null default 'stripe_connect',
  provider_account_id text not null,
  provider_environment text not null,
  binding_generation bigint not null,
  binding_status text not null default 'active',
  archive_reason text,
  metadata jsonb not null default '{}'::jsonb,
  attached_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint connected_account_provider_bindings_provider_ck
    check (provider = 'stripe_connect'),
  constraint connected_account_provider_bindings_environment_ck
    check (provider_environment in ('live', 'test')),
  constraint connected_account_provider_bindings_generation_ck
    check (binding_generation >= 0),
  constraint connected_account_provider_bindings_status_ck
    check (
      (binding_status = 'active' and archived_at is null and archive_reason is null)
      or
      (binding_status = 'archived' and archived_at is not null and nullif(btrim(archive_reason), '') is not null)
    )
);

create unique index if not exists connected_account_provider_bindings_provider_uidx
  on public.connected_account_provider_bindings (
    provider,
    provider_environment,
    provider_account_id
  );

create unique index if not exists connected_account_provider_bindings_generation_uidx
  on public.connected_account_provider_bindings (connected_account_id, binding_generation);

create unique index if not exists connected_account_provider_bindings_active_uidx
  on public.connected_account_provider_bindings (connected_account_id)
  where binding_status = 'active';

create index if not exists connected_account_provider_bindings_account_history_idx
  on public.connected_account_provider_bindings (connected_account_id, attached_at desc);

alter table public.connected_account_provider_bindings enable row level security;

revoke all on table public.connected_account_provider_bindings
  from public, anon, authenticated, service_role;
grant select on table public.connected_account_provider_bindings
  to service_role;

comment on table public.connected_account_provider_bindings is
  'Server-only Stripe Connect binding history. Archived mappings remain immutable evidence and are never relabeled across live/test environments.';

comment on column public.connected_accounts.provider_environment is
  'Explicit Stripe API environment for provider_account_id. Null is allowed only for an unbound or legacy unclassified mapping.';

comment on column public.connected_accounts.provider_account_generation is
  'Monotonic generation used in Stripe account-creation idempotency keys; incremented by the guarded reset function.';

create or replace function public.register_connected_account_provider_binding(
  p_connected_account_id uuid,
  p_provider_account_id text,
  p_provider_environment text,
  p_binding_generation bigint
)
returns setof public.connected_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.connected_accounts%rowtype;
  binding_row public.connected_account_provider_bindings%rowtype;
  normalized_provider_account_id text := nullif(btrim(p_provider_account_id), '');
  normalized_environment text := lower(nullif(btrim(p_provider_environment), ''));
begin
  if normalized_provider_account_id is null then
    raise exception 'provider_account_id_is_required' using errcode = '22023';
  end if;

  if normalized_environment is null or normalized_environment not in ('live', 'test') then
    raise exception 'provider_environment_must_be_live_or_test' using errcode = '22023';
  end if;

  select *
  into account_row
  from public.connected_accounts
  where id = p_connected_account_id
  for update;

  if not found then
    raise exception 'connected_account_not_found' using errcode = 'P0002';
  end if;

  if account_row.provider <> 'stripe_connect' then
    raise exception 'connected_account_provider_is_not_stripe_connect' using errcode = '23514';
  end if;

  if account_row.provider_account_generation <> p_binding_generation then
    raise exception 'connected_account_binding_generation_changed' using errcode = '40001';
  end if;

  if account_row.provider_account_id is not null
    and account_row.provider_account_id <> normalized_provider_account_id then
    raise exception 'connected_account_already_has_a_different_provider_account' using errcode = '23505';
  end if;

  if account_row.provider_environment is not null
    and account_row.provider_environment <> normalized_environment then
    raise exception 'connected_account_provider_environment_mismatch' using errcode = '23514';
  end if;

  select *
  into binding_row
  from public.connected_account_provider_bindings
  where provider = 'stripe_connect'
    and provider_environment = normalized_environment
    and provider_account_id = normalized_provider_account_id
  for update;

  if found then
    if binding_row.connected_account_id <> account_row.id
      or binding_row.binding_generation <> p_binding_generation
      or binding_row.binding_status <> 'active' then
      raise exception 'provider_account_binding_conflict' using errcode = '23505';
    end if;
  else
    insert into public.connected_account_provider_bindings (
      connected_account_id,
      provider,
      provider_account_id,
      provider_environment,
      binding_generation,
      binding_status,
      metadata
    ) values (
      account_row.id,
      'stripe_connect',
      normalized_provider_account_id,
      normalized_environment,
      p_binding_generation,
      'active',
      jsonb_build_object('source', 'stripe_connect_sync')
    );
  end if;

  return query
  update public.connected_accounts
  set provider_account_id = normalized_provider_account_id,
      provider_environment = normalized_environment,
      updated_at = now()
  where id = account_row.id
  returning *;
end;
$$;

revoke all on function public.register_connected_account_provider_binding(uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.register_connected_account_provider_binding(uuid, text, text, bigint)
  to service_role;

create or replace function public.reset_connected_account_provider_binding(
  p_connected_account_id uuid,
  p_expected_provider_account_id text,
  p_archived_provider_environment text,
  p_archive_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns setof public.connected_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.connected_accounts%rowtype;
  normalized_provider_account_id text := nullif(btrim(p_expected_provider_account_id), '');
  normalized_environment text := lower(nullif(btrim(p_archived_provider_environment), ''));
  normalized_archive_reason text := nullif(btrim(p_archive_reason), '');
  safe_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if normalized_provider_account_id is null then
    raise exception 'expected_provider_account_id_is_required' using errcode = '22023';
  end if;

  if normalized_environment is null or normalized_environment not in ('live', 'test') then
    raise exception 'archived_provider_environment_must_be_live_or_test' using errcode = '22023';
  end if;

  if normalized_archive_reason is null then
    raise exception 'archive_reason_is_required' using errcode = '22023';
  end if;

  if jsonb_typeof(safe_metadata) <> 'object' then
    raise exception 'binding_metadata_must_be_a_json_object' using errcode = '22023';
  end if;

  select *
  into account_row
  from public.connected_accounts
  where id = p_connected_account_id
  for update;

  if not found then
    raise exception 'connected_account_not_found' using errcode = 'P0002';
  end if;

  if account_row.provider <> 'stripe_connect' then
    raise exception 'connected_account_provider_is_not_stripe_connect' using errcode = '23514';
  end if;

  if account_row.provider_account_id is distinct from normalized_provider_account_id then
    raise exception 'connected_account_provider_account_precondition_failed' using errcode = '40001';
  end if;

  if account_row.provider_environment is not null
    and account_row.provider_environment <> normalized_environment then
    raise exception 'connected_account_provider_environment_precondition_failed' using errcode = '40001';
  end if;

  insert into public.connected_account_provider_bindings (
    connected_account_id,
    provider,
    provider_account_id,
    provider_environment,
    binding_generation,
    binding_status,
    metadata,
    attached_at
  ) values (
    account_row.id,
    'stripe_connect',
    normalized_provider_account_id,
    normalized_environment,
    account_row.provider_account_generation,
    'active',
    jsonb_build_object('source', 'guarded_provider_reset') || safe_metadata,
    coalesce(account_row.onboarding_started_at, account_row.created_at)
  )
  on conflict (provider, provider_environment, provider_account_id) do nothing;

  if not exists (
    select 1
    from public.connected_account_provider_bindings binding
    where binding.connected_account_id = account_row.id
      and binding.provider = 'stripe_connect'
      and binding.provider_account_id = normalized_provider_account_id
      and binding.provider_environment = normalized_environment
      and binding.binding_generation = account_row.provider_account_generation
      and binding.binding_status = 'active'
  ) then
    raise exception 'connected_account_active_binding_conflict' using errcode = '23505';
  end if;

  update public.connected_account_provider_bindings
  set binding_status = 'archived',
      archive_reason = normalized_archive_reason,
      metadata = metadata || safe_metadata,
      archived_at = now()
  where connected_account_id = account_row.id
    and binding_generation = account_row.provider_account_generation
    and binding_status = 'active';

  return query
  update public.connected_accounts
  set provider_account_id = null,
      provider_environment = null,
      provider_account_generation = provider_account_generation + 1,
      onboarding_status = 'not_started',
      payout_readiness_status = 'not_ready',
      tax_readiness_status = 'pending',
      requirements_currently_due = '[]'::jsonb,
      requirements_eventually_due = '[]'::jsonb,
      requirements_past_due = '[]'::jsonb,
      disabled_reason = null,
      charges_enabled = false,
      payouts_enabled = false,
      last_checked_at = null,
      onboarding_started_at = null,
      onboarding_completed_at = null,
      processor_last_synced_at = null,
      processor_last_event_id = null,
      processor_last_event_type = null,
      provider_payout_block_reason = null,
      provider_payout_blocked_at = null,
      provider_payout_block_destination_id = null,
      provider_payout_block_currency = null,
      provider_payout_block_cleared_at = null,
      dashboard_last_accessed_at = null,
      updated_at = now()
  where id = account_row.id
  returning *;
end;
$$;

revoke all on function public.reset_connected_account_provider_binding(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.reset_connected_account_provider_binding(uuid, text, text, text, jsonb)
  to service_role;

-- Extend the existing client-write guard so the new environment and generation
-- fields remain service-managed like every other provider-owned field.
create or replace function private.protect_connected_account_provider_payout_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  request_claims text := nullif(current_setting('request.jwt.claims', true), '');
  request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  if request_claims is not null then
    request_role := coalesce(request_claims::jsonb ->> 'role', request_role);
  end if;

  if new.provider_payout_block_reason is not null
    and new.payout_readiness_status <> 'blocked' then
    raise exception 'an active provider payout block requires blocked payout readiness'
      using errcode = '23514';
  end if;

  if current_user::text in ('anon', 'authenticated')
    or request_role in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.provider_account_id is not null
        or new.provider_environment is not null
        or new.provider_account_generation <> 0
        or new.onboarding_status <> 'not_started'
        or new.payout_readiness_status <> 'not_ready'
        or new.legal_readiness_status <> 'pending'
        or new.tax_readiness_status <> 'pending'
        or new.requirements_currently_due <> '[]'::jsonb
        or new.requirements_eventually_due <> '[]'::jsonb
        or new.requirements_past_due <> '[]'::jsonb
        or new.disabled_reason is not null
        or new.charges_enabled
        or new.payouts_enabled
        or new.last_checked_at is not null
        or new.onboarding_started_at is not null
        or new.onboarding_completed_at is not null
        or new.processor_last_synced_at is not null
        or new.processor_last_event_id is not null
        or new.processor_last_event_type is not null
        or new.provider_payout_block_reason is not null
        or new.provider_payout_blocked_at is not null
        or new.provider_payout_block_destination_id is not null
        or new.provider_payout_block_currency is not null
        or new.provider_payout_block_cleared_at is not null then
        raise exception 'connected-account provider and readiness fields are server-managed'
          using errcode = '42501';
      end if;
    elsif new.provider_account_id is distinct from old.provider_account_id
      or new.provider_environment is distinct from old.provider_environment
      or new.provider_account_generation is distinct from old.provider_account_generation
      or new.onboarding_status is distinct from old.onboarding_status
      or new.payout_readiness_status is distinct from old.payout_readiness_status
      or new.legal_readiness_status is distinct from old.legal_readiness_status
      or new.tax_readiness_status is distinct from old.tax_readiness_status
      or new.requirements_currently_due is distinct from old.requirements_currently_due
      or new.requirements_eventually_due is distinct from old.requirements_eventually_due
      or new.requirements_past_due is distinct from old.requirements_past_due
      or new.disabled_reason is distinct from old.disabled_reason
      or new.charges_enabled is distinct from old.charges_enabled
      or new.payouts_enabled is distinct from old.payouts_enabled
      or new.last_checked_at is distinct from old.last_checked_at
      or new.onboarding_started_at is distinct from old.onboarding_started_at
      or new.onboarding_completed_at is distinct from old.onboarding_completed_at
      or new.processor_last_synced_at is distinct from old.processor_last_synced_at
      or new.processor_last_event_id is distinct from old.processor_last_event_id
      or new.processor_last_event_type is distinct from old.processor_last_event_type
      or new.provider_payout_block_reason is distinct from old.provider_payout_block_reason
      or new.provider_payout_blocked_at is distinct from old.provider_payout_blocked_at
      or new.provider_payout_block_destination_id is distinct from old.provider_payout_block_destination_id
      or new.provider_payout_block_currency is distinct from old.provider_payout_block_currency
      or new.provider_payout_block_cleared_at is distinct from old.provider_payout_block_cleared_at then
      raise exception 'connected-account provider and readiness fields are server-managed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_connected_account_provider_payout_fields()
  from public, anon, authenticated;
grant execute on function private.protect_connected_account_provider_payout_fields()
  to service_role;
