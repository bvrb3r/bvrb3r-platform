-- PR 22 — canonical Full Booth Rent + AutoBooth Rent contract.
--
-- This migration is additive. Historical commission rows remain readable
-- through their existing legacy tables, but no function below creates or
-- calculates a new commission record.

create extension if not exists pgcrypto;

create table if not exists public.rent_agreements (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.shop_barber_relationships(id) on delete restrict,
  shop_id text not null references public.shops(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  version integer not null check (version > 0),
  model text not null check (model in ('booth_rent', 'autobooth_rent')),
  status text not null default 'pending_acceptance'
    check (status in ('draft', 'pending_acceptance', 'accepted', 'active', 'superseded', 'ended')),
  rent_amount_cents integer not null check (rent_amount_cents > 0),
  billing_frequency text not null check (billing_frequency in ('weekly', 'monthly')),
  autobooth_basis_points integer not null default 0
    check (autobooth_basis_points between 0 and 10000),
  grace_hours integer not null default 24 check (grace_hours between 0 and 168),
  late_fee_cents integer not null default 0 check (late_fee_cents >= 0),
  cash_settlement_method text not null default 'provider_transfer'
    check (cash_settlement_method in ('provider_transfer', 'manual_transfer_with_evidence')),
  terms_snapshot jsonb not null default '{}'::jsonb,
  terms_hash text not null check (terms_hash ~ '^[0-9a-f]{64}$'),
  owner_accepted_by uuid references public.profiles(id) on delete set null,
  owner_accepted_at timestamptz,
  barber_accepted_by uuid references public.profiles(id) on delete set null,
  barber_accepted_at timestamptz,
  effective_at timestamptz not null,
  ended_at timestamptz,
  supersedes_agreement_id uuid references public.rent_agreements(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rent_agreements_model_values_ck check (
    (model = 'booth_rent' and autobooth_basis_points = 0)
    or (model = 'autobooth_rent' and autobooth_basis_points between 1 and 10000)
  ),
  constraint rent_agreements_owner_acceptance_ck check (
    (owner_accepted_at is null and owner_accepted_by is null)
    or (owner_accepted_at is not null and owner_accepted_by is not null)
  ),
  constraint rent_agreements_barber_acceptance_ck check (
    (barber_accepted_at is null and barber_accepted_by is null)
    or (barber_accepted_at is not null and barber_accepted_by is not null)
  ),
  constraint rent_agreements_active_acceptance_ck check (
    status not in ('accepted', 'active', 'superseded', 'ended')
    or (owner_accepted_at is not null and barber_accepted_at is not null)
  ),
  constraint rent_agreements_dates_ck check (
    ended_at is null or ended_at >= effective_at
  ),
  unique (relationship_id, version)
);

create unique index if not exists rent_agreements_one_active_relationship_idx
  on public.rent_agreements (relationship_id)
  where status = 'active' and ended_at is null;
create index if not exists rent_agreements_shop_status_idx
  on public.rent_agreements (shop_id, status, effective_at desc);
create index if not exists rent_agreements_barber_status_idx
  on public.rent_agreements (barber_id, status, effective_at desc);

create table if not exists public.rent_obligations (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.rent_agreements(id) on delete restrict,
  relationship_id uuid not null references public.shop_barber_relationships(id) on delete restrict,
  shop_id text not null references public.shops(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  due_at timestamptz not null,
  base_rent_cents integer not null check (base_rent_cents > 0),
  late_fee_cents integer not null default 0 check (late_fee_cents >= 0),
  amount_settled_cents integer not null default 0 check (amount_settled_cents >= 0),
  status text not null default 'upcoming'
    check (status in ('upcoming', 'due', 'partially_funded', 'funded', 'overdue', 'waived', 'canceled')),
  grace_used_at timestamptz,
  grace_expires_at timestamptz,
  late_fee_applied_at timestamptz,
  waived_at timestamptz,
  waiver_reason text,
  funded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rent_obligations_period_ck check (period_end >= period_start),
  constraint rent_obligations_settlement_ck check (
    amount_settled_cents <= base_rent_cents + late_fee_cents
  ),
  constraint rent_obligations_funded_ck check (
    status <> 'funded'
    or (
      amount_settled_cents = base_rent_cents + late_fee_cents
      and funded_at is not null
    )
  ),
  constraint rent_obligations_grace_ck check (
    (grace_used_at is null and grace_expires_at is null)
    or (grace_used_at is not null and grace_expires_at is not null and grace_expires_at > grace_used_at)
  ),
  constraint rent_obligations_late_fee_once_ck check (
    (late_fee_applied_at is null and late_fee_cents = 0)
    or (late_fee_applied_at is not null and late_fee_cents > 0)
  ),
  constraint rent_obligations_waiver_ck check (
    status <> 'waived'
    or (waived_at is not null and length(btrim(coalesce(waiver_reason, ''))) >= 3)
  ),
  unique (agreement_id, period_start, period_end)
);

create index if not exists rent_obligations_shop_status_idx
  on public.rent_obligations (shop_id, status, due_at);
create index if not exists rent_obligations_barber_status_idx
  on public.rent_obligations (barber_id, status, due_at);
create index if not exists rent_obligations_agreement_idx
  on public.rent_obligations (agreement_id, period_start desc);

create table if not exists public.rent_contributions (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.rent_obligations(id) on delete restrict,
  agreement_id uuid not null references public.rent_agreements(id) on delete restrict,
  shop_id text not null references public.shops(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  contribution_kind text not null
    check (contribution_kind in ('autobooth_card', 'autobooth_cash', 'manual_payment', 'autopay', 'refund_reversal')),
  status text not null
    check (status in ('pending', 'settled', 'failed', 'canceled')),
  payment_id uuid references public.payments(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  provider_event_id text,
  evidence_reference text,
  idempotency_key text not null unique,
  eligible_service_cents integer not null default 0 check (eligible_service_cents >= 0),
  excluded_tip_cents integer not null default 0 check (excluded_tip_cents >= 0),
  excluded_tax_cents integer not null default 0 check (excluded_tax_cents >= 0),
  excluded_external_cents integer not null default 0 check (excluded_external_cents >= 0),
  refunded_service_cents integer not null default 0 check (refunded_service_cents >= 0),
  requested_cents integer not null default 0 check (requested_cents >= 0),
  applied_cents integer not null check (applied_cents >= 0),
  reversal_of_contribution_id uuid references public.rent_contributions(id) on delete restrict,
  settled_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rent_contributions_applied_ck check (
    applied_cents <= requested_cents
    and (
      contribution_kind in ('manual_payment', 'autopay', 'refund_reversal')
      or applied_cents <= greatest(eligible_service_cents - refunded_service_cents, 0)
    )
  ),
  constraint rent_contributions_settled_ck check (
    status <> 'settled' or settled_at is not null
  ),
  constraint rent_contributions_cash_truth_ck check (
    contribution_kind <> 'autobooth_cash'
    or status <> 'settled'
    or length(btrim(coalesce(evidence_reference, ''))) >= 3
  ),
  constraint rent_contributions_reversal_ck check (
    (contribution_kind = 'refund_reversal' and reversal_of_contribution_id is not null)
    or (contribution_kind <> 'refund_reversal' and reversal_of_contribution_id is null)
  )
);

create unique index if not exists rent_contributions_one_reversal_idx
  on public.rent_contributions (reversal_of_contribution_id)
  where reversal_of_contribution_id is not null;
create index if not exists rent_contributions_obligation_idx
  on public.rent_contributions (obligation_id, created_at);
create index if not exists rent_contributions_barber_idx
  on public.rent_contributions (barber_id, created_at desc);
create index if not exists rent_contributions_shop_idx
  on public.rent_contributions (shop_id, created_at desc);
create index if not exists rent_contributions_payment_idx
  on public.rent_contributions (payment_id) where payment_id is not null;
create index if not exists rent_contributions_appointment_idx
  on public.rent_contributions (appointment_id) where appointment_id is not null;

create table if not exists public.rent_actions_audit (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid references public.rent_agreements(id) on delete restrict,
  obligation_id uuid references public.rent_obligations(id) on delete restrict,
  contribution_id uuid references public.rent_contributions(id) on delete restrict,
  shop_id text not null references public.shops(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text not null,
  action_type text not null check (action_type in (
    'agreement_created', 'agreement_accepted', 'agreement_activated', 'agreement_ended',
    'obligation_created',
    'rent_reminder_sent', 'payment_retry_requested', 'grace_applied', 'late_fee_applied',
    'obligation_waived', 'kiosk_paused', 'contribution_created', 'cash_settled',
    'contribution_reversed', 'release_certified'
  )),
  reason text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists rent_actions_audit_idempotency_idx
  on public.rent_actions_audit (idempotency_key)
  where idempotency_key is not null;
create index if not exists rent_actions_audit_obligation_idx
  on public.rent_actions_audit (obligation_id, created_at desc)
  where obligation_id is not null;
create index if not exists rent_actions_audit_shop_idx
  on public.rent_actions_audit (shop_id, created_at desc);
create index if not exists rent_actions_audit_barber_idx
  on public.rent_actions_audit (barber_id, created_at desc);

create table if not exists public.shop_setup_gates (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  gate_key text not null check (gate_key in (
    'shop_identity', 'public_shop_profile', 'hours_and_closures', 'team_policies',
    'walk_in_policy', 'kiosk_settings', 'banking_and_payouts', 'booth_rent_policy',
    'active_barber', 'services_and_pricing', 'booking_rules', 'emergency_controls'
  )),
  status text not null default 'pending'
    check (status in ('pending', 'passed', 'approved_exception')),
  evidence jsonb not null default '{}'::jsonb,
  exception_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint shop_setup_gates_exception_ck check (
    status <> 'approved_exception'
    or (
      length(btrim(coalesce(exception_reason, ''))) >= 3
      and reviewed_by is not null
      and reviewed_at is not null
    )
  ),
  unique (shop_id, location_id, gate_key)
);

create index if not exists shop_setup_gates_location_idx
  on public.shop_setup_gates (location_id, status);

create table if not exists public.pr22_release_certificates (
  id uuid primary key default gen_random_uuid(),
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  deployment_id text not null,
  reconciliation_delta_cents integer not null,
  check_snapshot jsonb not null,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default now(),
  unique (commit_sha, deployment_id),
  constraint pr22_release_certificates_zero_delta_ck check (reconciliation_delta_cents = 0),
  constraint pr22_release_certificates_twelve_green_ck check (
    jsonb_array_length(coalesce(check_snapshot -> 'checks', '[]'::jsonb)) = 12
    and coalesce((check_snapshot ->> 'certifiable')::boolean, false)
  )
);

alter table public.rent_agreements enable row level security;
alter table public.rent_obligations enable row level security;
alter table public.rent_contributions enable row level security;
alter table public.rent_actions_audit enable row level security;
alter table public.shop_setup_gates enable row level security;
alter table public.pr22_release_certificates enable row level security;

revoke all on table public.rent_agreements from public, anon, authenticated;
revoke all on table public.rent_obligations from public, anon, authenticated;
revoke all on table public.rent_contributions from public, anon, authenticated;
revoke all on table public.rent_actions_audit from public, anon, authenticated;
revoke all on table public.shop_setup_gates from public, anon, authenticated;
revoke all on table public.pr22_release_certificates from public, anon, authenticated;

grant select on table public.rent_agreements to authenticated;
grant select on table public.rent_obligations to authenticated;
grant select on table public.rent_contributions to authenticated;
grant select on table public.rent_actions_audit to authenticated;
grant select on table public.shop_setup_gates to authenticated;
grant select on table public.pr22_release_certificates to authenticated;
grant all on table public.rent_agreements to service_role;
grant all on table public.rent_obligations to service_role;
grant all on table public.rent_contributions to service_role;
grant all on table public.rent_actions_audit to service_role;
grant all on table public.shop_setup_gates to service_role;
grant all on table public.pr22_release_certificates to service_role;

create or replace function private.pr22_is_barber(p_barber_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.barbers b
      where b.id = p_barber_id
        and b.profile_id = (select auth.uid())
    );
$$;

create or replace function private.pr22_is_shop_owner(p_shop_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.has_shop_operator_access(
      p_shop_id,
      null,
      array['owner']::text[]
    );
$$;

revoke all on function private.pr22_is_barber(uuid) from public, anon, authenticated;
revoke all on function private.pr22_is_shop_owner(text) from public, anon, authenticated;
grant execute on function private.pr22_is_barber(uuid) to authenticated, service_role;
grant execute on function private.pr22_is_shop_owner(text) to authenticated, service_role;

create or replace function private.pr22_sha256(p_value text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  extension_schema text;
  digest_value text;
begin
  select n.nspname
  into extension_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if extension_schema is null then
    raise exception using errcode = '55000', message = 'pgcrypto is required.';
  end if;

  execute format(
    'select encode(%I.digest($1, ''sha256''), ''hex'')',
    extension_schema
  )
  into digest_value
  using p_value;

  return digest_value;
end;
$$;

revoke all on function private.pr22_sha256(text) from public, anon, authenticated;
grant execute on function private.pr22_sha256(text) to authenticated, service_role;

drop policy if exists rent_agreements_participant_select on public.rent_agreements;
create policy rent_agreements_participant_select
on public.rent_agreements
for select
to authenticated
using (
  (select private.pr22_is_barber(barber_id))
  or (select private.pr22_is_shop_owner(shop_id))
  or (select private.is_internal_operator())
);

drop policy if exists rent_obligations_participant_select on public.rent_obligations;
create policy rent_obligations_participant_select
on public.rent_obligations
for select
to authenticated
using (
  (select private.pr22_is_barber(barber_id))
  or (select private.pr22_is_shop_owner(shop_id))
  or (select private.is_internal_operator())
);

-- Contributions contain service, tip, and fee evidence. Owners intentionally
-- have no direct table policy; their safe statement function returns only rent
-- funding amounts and never barber earnings, tips, or external money.
drop policy if exists rent_contributions_barber_or_internal_select on public.rent_contributions;
create policy rent_contributions_barber_or_internal_select
on public.rent_contributions
for select
to authenticated
using (
  (select private.pr22_is_barber(barber_id))
  or (select private.is_internal_operator())
);

drop policy if exists rent_actions_participant_select on public.rent_actions_audit;
create policy rent_actions_participant_select
on public.rent_actions_audit
for select
to authenticated
using (
  (select private.pr22_is_barber(barber_id))
  or (select private.pr22_is_shop_owner(shop_id))
  or (select private.is_internal_operator())
);

drop policy if exists shop_setup_owner_select on public.shop_setup_gates;
create policy shop_setup_owner_select
on public.shop_setup_gates
for select
to authenticated
using (
  (select private.pr22_is_shop_owner(shop_id))
  or (select private.is_internal_operator())
);

drop policy if exists pr22_certificates_internal_select on public.pr22_release_certificates;
create policy pr22_certificates_internal_select
on public.pr22_release_certificates
for select
to authenticated
using ((select private.is_internal_operator()));

create or replace function private.pr22_create_rent_agreement(
  p_relationship_id uuid,
  p_model text,
  p_rent_amount_cents integer,
  p_billing_frequency text,
  p_autobooth_basis_points integer,
  p_grace_hours integer,
  p_late_fee_cents integer,
  p_cash_settlement_method text,
  p_terms_snapshot jsonb,
  p_effective_at timestamptz
)
returns public.rent_agreements
language plpgsql
security definer
set search_path = ''
as $$
declare
  relationship_row public.shop_barber_relationships%rowtype;
  prior_row public.rent_agreements%rowtype;
  next_version integer;
  inserted_row public.rent_agreements%rowtype;
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into relationship_row
  from public.shop_barber_relationships
  where id = p_relationship_id;

  if relationship_row.id is null
     or not private.pr22_is_shop_owner(relationship_row.shop_id) then
    raise exception using errcode = '42501', message = 'Only the shop owner can create this rent agreement.';
  end if;

  if p_model not in ('booth_rent', 'autobooth_rent')
     or p_rent_amount_cents <= 0
     or p_billing_frequency not in ('weekly', 'monthly')
     or p_autobooth_basis_points not between 0 and 10000
     or (p_model = 'booth_rent' and p_autobooth_basis_points <> 0)
     or (p_model = 'autobooth_rent' and p_autobooth_basis_points = 0) then
    raise exception using errcode = '23514', message = 'The rent agreement terms are invalid.';
  end if;

  if p_effective_at <= now() then
    raise exception using errcode = '23514', message = 'Rent agreement versions are prospective only.';
  end if;

  select * into prior_row
  from public.rent_agreements
  where relationship_id = p_relationship_id
  order by version desc
  limit 1
  for update;

  next_version := coalesce(prior_row.version, 0) + 1;

  insert into public.rent_agreements (
    relationship_id, shop_id, location_id, barber_id, version, model, status,
    rent_amount_cents, billing_frequency, autobooth_basis_points, grace_hours,
    late_fee_cents, cash_settlement_method, terms_snapshot, terms_hash,
    owner_accepted_by, owner_accepted_at, effective_at, supersedes_agreement_id,
    created_by
  ) values (
    relationship_row.id, relationship_row.shop_id, relationship_row.location_id,
    relationship_row.barber_id, next_version, p_model, 'pending_acceptance',
    p_rent_amount_cents, p_billing_frequency, p_autobooth_basis_points,
    coalesce(p_grace_hours, 24), coalesce(p_late_fee_cents, 0),
    coalesce(p_cash_settlement_method, 'provider_transfer'),
    coalesce(p_terms_snapshot, '{}'::jsonb),
    private.pr22_sha256(coalesce(p_terms_snapshot, '{}'::jsonb)::text),
    actor_id, now(), p_effective_at, prior_row.id, actor_id
  )
  returning * into inserted_row;

  insert into public.rent_actions_audit (
    agreement_id, shop_id, barber_id, actor_profile_id, actor_role,
    action_type, after_state
  ) values (
    inserted_row.id, inserted_row.shop_id, inserted_row.barber_id, actor_id,
    'shop_owner', 'agreement_created', to_jsonb(inserted_row)
  );

  return inserted_row;
end;
$$;

create or replace function private.pr22_accept_rent_agreement(p_agreement_id uuid)
returns public.rent_agreements
language plpgsql
security definer
set search_path = ''
as $$
declare
  agreement_row public.rent_agreements%rowtype;
  updated_row public.rent_agreements%rowtype;
  actor_id uuid := (select auth.uid());
  actor_role_value text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into agreement_row
  from public.rent_agreements
  where id = p_agreement_id
  for update;

  if agreement_row.id is null or agreement_row.status not in ('pending_acceptance', 'accepted') then
    raise exception using errcode = '23514', message = 'This agreement version is not open for acceptance.';
  end if;

  if agreement_row.effective_at <= now() then
    raise exception using errcode = '23514', message = 'A rent agreement cannot be accepted retroactively.';
  end if;

  if private.pr22_is_shop_owner(agreement_row.shop_id) then
    actor_role_value := 'shop_owner';
    update public.rent_agreements
    set owner_accepted_by = coalesce(owner_accepted_by, actor_id),
        owner_accepted_at = coalesce(owner_accepted_at, now()),
        updated_at = now()
    where id = p_agreement_id;
  elsif private.pr22_is_barber(agreement_row.barber_id) then
    actor_role_value := 'barber';
    update public.rent_agreements
    set barber_accepted_by = coalesce(barber_accepted_by, actor_id),
        barber_accepted_at = coalesce(barber_accepted_at, now()),
        updated_at = now()
    where id = p_agreement_id;
  else
    raise exception using errcode = '42501', message = 'Only the named owner or barber may accept this agreement.';
  end if;

  update public.rent_agreements
  set status = case
        when owner_accepted_at is not null and barber_accepted_at is not null
          then 'accepted'
        else 'pending_acceptance'
      end,
      updated_at = now()
  where id = p_agreement_id
  returning * into updated_row;

  insert into public.rent_actions_audit (
    agreement_id, shop_id, barber_id, actor_profile_id, actor_role,
    action_type, before_state, after_state,
    idempotency_key
  ) values (
    updated_row.id, updated_row.shop_id, updated_row.barber_id, actor_id,
    actor_role_value, 'agreement_accepted', to_jsonb(agreement_row), to_jsonb(updated_row),
    'agreement-accept:' || updated_row.id::text || ':' || actor_id::text
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return updated_row;
end;
$$;

create or replace function private.pr22_activate_due_rent_agreements()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.rent_agreements%rowtype;
  activated_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  for candidate in
    select *
    from public.rent_agreements
    where status = 'accepted'
      and owner_accepted_at is not null
      and barber_accepted_at is not null
      and effective_at <= now()
    order by effective_at, version
    for update skip locked
  loop
    update public.rent_agreements
    set status = 'superseded',
        ended_at = greatest(candidate.effective_at, effective_at),
        updated_at = now()
    where relationship_id = candidate.relationship_id
      and id <> candidate.id
      and status = 'active'
      and ended_at is null;

    update public.rent_agreements
    set status = 'active',
        updated_at = now()
    where id = candidate.id;

    insert into public.rent_actions_audit (
      agreement_id, shop_id, barber_id, actor_role, action_type, after_state,
      idempotency_key
    ) values (
      candidate.id, candidate.shop_id, candidate.barber_id, 'system',
      'agreement_activated',
      jsonb_build_object('agreementId', candidate.id, 'effectiveAt', candidate.effective_at),
      'agreement-activate:' || candidate.id::text
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    activated_count := activated_count + 1;
  end loop;

  return activated_count;
end;
$$;

create or replace function private.pr22_generate_rent_obligation(
  p_agreement_id uuid,
  p_period_start date,
  p_period_end date,
  p_due_at timestamptz,
  p_idempotency_key text
)
returns public.rent_obligations
language plpgsql
security definer
set search_path = ''
as $$
declare
  agreement_row public.rent_agreements%rowtype;
  existing_row public.rent_obligations%rowtype;
  inserted_row public.rent_obligations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;
  if p_period_end < p_period_start or p_due_at <= p_period_start::timestamptz then
    raise exception using errcode = '23514', message = 'The rent obligation period is invalid.';
  end if;

  select * into agreement_row
  from public.rent_agreements
  where id = p_agreement_id
  for update;

  if agreement_row.id is null
     or agreement_row.status <> 'active'
     or agreement_row.effective_at > p_period_start::timestamptz then
    raise exception using errcode = '23514', message = 'Only an active prospective agreement can create this obligation.';
  end if;

  select * into existing_row
  from public.rent_obligations
  where agreement_id = p_agreement_id
    and period_start = p_period_start
    and period_end = p_period_end;
  if existing_row.id is not null then
    return existing_row;
  end if;

  insert into public.rent_obligations (
    agreement_id, relationship_id, shop_id, location_id, barber_id,
    period_start, period_end, due_at, base_rent_cents, status
  ) values (
    agreement_row.id, agreement_row.relationship_id, agreement_row.shop_id,
    agreement_row.location_id, agreement_row.barber_id, p_period_start,
    p_period_end, p_due_at, agreement_row.rent_amount_cents,
    case when p_due_at <= now() then 'due' else 'upcoming' end
  )
  returning * into inserted_row;

  insert into public.rent_actions_audit (
    agreement_id, obligation_id, shop_id, barber_id, actor_role,
    action_type, after_state, idempotency_key
  ) values (
    agreement_row.id, inserted_row.id, agreement_row.shop_id,
    agreement_row.barber_id, 'system', 'obligation_created',
    jsonb_build_object(
      'event', 'obligation_created',
      'obligationId', inserted_row.id,
      'baseRentCents', inserted_row.base_rent_cents,
      'periodStart', inserted_row.period_start,
      'periodEnd', inserted_row.period_end
    ),
    'obligation:' || coalesce(nullif(btrim(p_idempotency_key), ''), inserted_row.id::text)
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return inserted_row;
end;
$$;

create or replace function private.pr22_apply_rent_contribution(
  p_obligation_id uuid,
  p_contribution_kind text,
  p_service_amount_cents integer,
  p_platform_fee_cents integer,
  p_processing_fee_cents integer,
  p_tip_amount_cents integer,
  p_tax_amount_cents integer,
  p_refunded_service_cents integer,
  p_payment_id uuid,
  p_appointment_id uuid,
  p_provider_event_id text,
  p_evidence_reference text,
  p_idempotency_key text
)
returns public.rent_contributions
language plpgsql
security definer
set search_path = ''
as $$
declare
  obligation_row public.rent_obligations%rowtype;
  agreement_row public.rent_agreements%rowtype;
  existing_row public.rent_contributions%rowtype;
  inserted_row public.rent_contributions%rowtype;
  eligible_cents integer;
  outstanding_cents integer;
  requested_value integer;
  applied_value integer;
  status_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if length(btrim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception using errcode = '23514', message = 'A stable idempotency key is required.';
  end if;

  select * into existing_row
  from public.rent_contributions
  where idempotency_key = p_idempotency_key;
  if existing_row.id is not null then
    return existing_row;
  end if;

  select * into obligation_row
  from public.rent_obligations
  where id = p_obligation_id
  for update;

  select * into agreement_row
  from public.rent_agreements
  where id = obligation_row.agreement_id;

  if obligation_row.id is null
     or agreement_row.status <> 'active'
     or agreement_row.model <> 'autobooth_rent'
     or obligation_row.status in ('funded', 'waived', 'canceled') then
    raise exception using errcode = '23514', message = 'No active AutoBooth obligation can receive this contribution.';
  end if;

  if p_contribution_kind not in ('autobooth_card', 'autobooth_cash') then
    raise exception using errcode = '23514', message = 'This function only applies AutoBooth transaction contributions.';
  end if;

  eligible_cents := greatest(
    coalesce(p_service_amount_cents, 0)
      - coalesce(p_platform_fee_cents, 0)
      - coalesce(p_processing_fee_cents, 0),
    0
  );
  outstanding_cents := greatest(
    obligation_row.base_rent_cents
      + obligation_row.late_fee_cents
      - obligation_row.amount_settled_cents,
    0
  );
  requested_value := floor(
    greatest(eligible_cents - coalesce(p_refunded_service_cents, 0), 0)
      * agreement_row.autobooth_basis_points::numeric / 10000
  )::integer;
  applied_value := least(requested_value, outstanding_cents);
  status_value := case
    when p_contribution_kind = 'autobooth_cash' then 'pending'
    else 'settled'
  end;

  insert into public.rent_contributions (
    obligation_id, agreement_id, shop_id, barber_id, contribution_kind,
    status, payment_id, appointment_id, provider_event_id, evidence_reference,
    idempotency_key, eligible_service_cents, excluded_tip_cents,
    excluded_tax_cents, refunded_service_cents, requested_cents, applied_cents,
    settled_at
  ) values (
    obligation_row.id, agreement_row.id, obligation_row.shop_id,
    obligation_row.barber_id, p_contribution_kind, status_value, p_payment_id,
    p_appointment_id, p_provider_event_id, p_evidence_reference,
    p_idempotency_key, eligible_cents, greatest(coalesce(p_tip_amount_cents, 0), 0),
    greatest(coalesce(p_tax_amount_cents, 0), 0),
    greatest(coalesce(p_refunded_service_cents, 0), 0),
    requested_value, applied_value,
    case when status_value = 'settled' then now() else null end
  )
  returning * into inserted_row;

  if inserted_row.status = 'settled' and inserted_row.applied_cents > 0 then
    update public.rent_obligations
    set amount_settled_cents = amount_settled_cents + inserted_row.applied_cents,
        status = case
          when amount_settled_cents + inserted_row.applied_cents
                 = base_rent_cents + late_fee_cents
            then 'funded'
          else 'partially_funded'
        end,
        funded_at = case
          when amount_settled_cents + inserted_row.applied_cents
                 = base_rent_cents + late_fee_cents
            then now()
          else null
        end,
        updated_at = now()
    where id = obligation_row.id;
  end if;

  insert into public.rent_actions_audit (
    agreement_id, obligation_id, contribution_id, shop_id, barber_id,
    actor_role, action_type, after_state, idempotency_key
  ) values (
    agreement_row.id, obligation_row.id, inserted_row.id, obligation_row.shop_id,
    obligation_row.barber_id, 'system', 'contribution_created',
    jsonb_build_object(
      'contributionId', inserted_row.id,
      'status', inserted_row.status,
      'appliedCents', inserted_row.applied_cents,
      'tipExcludedCents', inserted_row.excluded_tip_cents,
      'taxExcludedCents', inserted_row.excluded_tax_cents
    ),
    'audit:' || p_idempotency_key
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return inserted_row;
end;
$$;

create or replace function private.pr22_settle_cash_contribution(
  p_contribution_id uuid,
  p_evidence_reference text
)
returns public.rent_contributions
language plpgsql
security definer
set search_path = ''
as $$
declare
  contribution_row public.rent_contributions%rowtype;
  updated_row public.rent_contributions%rowtype;
  obligation_row public.rent_obligations%rowtype;
  actor_id uuid := (select auth.uid());
begin
  select * into contribution_row
  from public.rent_contributions
  where id = p_contribution_id
  for update;

  if contribution_row.id is null
     or contribution_row.contribution_kind <> 'autobooth_cash'
     or contribution_row.status <> 'pending'
     or not private.pr22_is_shop_owner(contribution_row.shop_id) then
    raise exception using errcode = '42501', message = 'This cash contribution cannot be settled by this actor.';
  end if;
  if length(btrim(coalesce(p_evidence_reference, ''))) < 3 then
    raise exception using errcode = '23514', message = 'Cash remains pending until transfer evidence is recorded.';
  end if;

  select * into obligation_row
  from public.rent_obligations
  where id = contribution_row.obligation_id
  for update;

  if contribution_row.applied_cents
       > obligation_row.base_rent_cents + obligation_row.late_fee_cents - obligation_row.amount_settled_cents then
    raise exception using errcode = '23514', message = 'The cash contribution exceeds remaining rent.';
  end if;

  update public.rent_contributions
  set status = 'settled',
      evidence_reference = btrim(p_evidence_reference),
      settled_at = now()
  where id = contribution_row.id
  returning * into updated_row;

  update public.rent_obligations
  set amount_settled_cents = amount_settled_cents + updated_row.applied_cents,
      status = case
        when amount_settled_cents + updated_row.applied_cents = base_rent_cents + late_fee_cents
          then 'funded'
        else 'partially_funded'
      end,
      funded_at = case
        when amount_settled_cents + updated_row.applied_cents = base_rent_cents + late_fee_cents
          then now()
        else null
      end,
      updated_at = now()
  where id = obligation_row.id;

  insert into public.rent_actions_audit (
    agreement_id, obligation_id, contribution_id, shop_id, barber_id,
    actor_profile_id, actor_role, action_type, before_state, after_state,
    idempotency_key
  ) values (
    updated_row.agreement_id, updated_row.obligation_id, updated_row.id,
    updated_row.shop_id, updated_row.barber_id, actor_id, 'shop_owner',
    'cash_settled', to_jsonb(contribution_row), to_jsonb(updated_row),
    'cash-settle:' || updated_row.id::text
  );

  return updated_row;
end;
$$;

create or replace function private.pr22_reverse_rent_contribution(
  p_contribution_id uuid,
  p_provider_event_id text,
  p_idempotency_key text
)
returns public.rent_contributions
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_row public.rent_contributions%rowtype;
  obligation_row public.rent_obligations%rowtype;
  reversal_row public.rent_contributions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  select * into reversal_row
  from public.rent_contributions
  where idempotency_key = p_idempotency_key;
  if reversal_row.id is not null then
    return reversal_row;
  end if;

  select * into original_row
  from public.rent_contributions
  where id = p_contribution_id
  for update;

  if original_row.id is null
     or original_row.status <> 'settled'
     or original_row.contribution_kind = 'refund_reversal'
     or exists (
       select 1 from public.rent_contributions r
       where r.reversal_of_contribution_id = original_row.id
     ) then
    raise exception using errcode = '23514', message = 'This contribution cannot be reversed again.';
  end if;

  select * into obligation_row
  from public.rent_obligations
  where id = original_row.obligation_id
  for update;

  insert into public.rent_contributions (
    obligation_id, agreement_id, shop_id, barber_id, contribution_kind,
    status, provider_event_id, idempotency_key, eligible_service_cents,
    requested_cents, applied_cents, reversal_of_contribution_id, settled_at
  ) values (
    original_row.obligation_id, original_row.agreement_id, original_row.shop_id,
    original_row.barber_id, 'refund_reversal', 'settled', p_provider_event_id,
    p_idempotency_key, 0, original_row.applied_cents, original_row.applied_cents,
    original_row.id, now()
  )
  returning * into reversal_row;

  update public.rent_obligations
  set amount_settled_cents = greatest(amount_settled_cents - original_row.applied_cents, 0),
      status = case
        when greatest(amount_settled_cents - original_row.applied_cents, 0) = 0
          then case when due_at < now() then 'overdue' else 'due' end
        else 'partially_funded'
      end,
      funded_at = null,
      updated_at = now()
  where id = obligation_row.id;

  insert into public.rent_actions_audit (
    agreement_id, obligation_id, contribution_id, shop_id, barber_id,
    actor_role, action_type, before_state, after_state, idempotency_key
  ) values (
    original_row.agreement_id, original_row.obligation_id, reversal_row.id,
    original_row.shop_id, original_row.barber_id, 'system',
    'contribution_reversed', to_jsonb(original_row), to_jsonb(reversal_row),
    'audit:' || p_idempotency_key
  );

  return reversal_row;
end;
$$;

create or replace function private.pr22_apply_rent_action(
  p_obligation_id uuid,
  p_action text,
  p_reason text default null
)
returns public.rent_obligations
language plpgsql
security definer
set search_path = ''
as $$
declare
  obligation_row public.rent_obligations%rowtype;
  agreement_row public.rent_agreements%rowtype;
  updated_row public.rent_obligations%rowtype;
  actor_id uuid := (select auth.uid());
  audit_action text;
begin
  select * into obligation_row
  from public.rent_obligations
  where id = p_obligation_id
  for update;
  select * into agreement_row
  from public.rent_agreements
  where id = obligation_row.agreement_id;

  if obligation_row.id is null or not private.pr22_is_shop_owner(obligation_row.shop_id) then
    raise exception using errcode = '42501', message = 'Only the shop owner may perform this rent recovery action.';
  end if;

  if p_action = 'remind' then
    audit_action := 'rent_reminder_sent';
  elsif p_action = 'retry' then
    audit_action := 'payment_retry_requested';
  elsif p_action = 'grace' then
    if obligation_row.grace_used_at is not null then
      raise exception using errcode = '23514', message = 'Grace can only be applied once.';
    end if;
    update public.rent_obligations
    set grace_used_at = now(),
        grace_expires_at = now() + make_interval(hours => agreement_row.grace_hours),
        due_at = greatest(due_at, now()) + make_interval(hours => agreement_row.grace_hours),
        updated_at = now()
    where id = obligation_row.id;
    audit_action := 'grace_applied';
  elsif p_action = 'late_fee' then
    if obligation_row.late_fee_applied_at is not null
       or agreement_row.late_fee_cents <= 0 then
      raise exception using errcode = '23514', message = 'A late fee can only be applied once and must be in the accepted agreement.';
    end if;
    update public.rent_obligations
    set late_fee_cents = agreement_row.late_fee_cents,
        late_fee_applied_at = now(),
        updated_at = now()
    where id = obligation_row.id;
    audit_action := 'late_fee_applied';
  elsif p_action = 'waive' then
    if length(btrim(coalesce(p_reason, ''))) < 3 then
      raise exception using errcode = '23514', message = 'A waiver requires an auditable reason.';
    end if;
    update public.rent_obligations
    set status = 'waived',
        waived_at = now(),
        waiver_reason = btrim(p_reason),
        updated_at = now()
    where id = obligation_row.id;
    audit_action := 'obligation_waived';
  else
    raise exception using errcode = '23514', message = 'Unsupported rent recovery action.';
  end if;

  select * into updated_row
  from public.rent_obligations
  where id = obligation_row.id;

  insert into public.rent_actions_audit (
    agreement_id, obligation_id, shop_id, barber_id, actor_profile_id,
    actor_role, action_type, reason, before_state, after_state
  ) values (
    updated_row.agreement_id, updated_row.id, updated_row.shop_id,
    updated_row.barber_id, actor_id, 'shop_owner', audit_action,
    nullif(btrim(coalesce(p_reason, '')), ''), to_jsonb(obligation_row),
    to_jsonb(updated_row)
  );

  return updated_row;
end;
$$;

revoke all on function private.pr22_create_rent_agreement(uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function private.pr22_accept_rent_agreement(uuid) from public, anon, authenticated;
revoke all on function private.pr22_activate_due_rent_agreements() from public, anon, authenticated;
revoke all on function private.pr22_generate_rent_obligation(uuid, date, date, timestamptz, text) from public, anon, authenticated;
revoke all on function private.pr22_apply_rent_contribution(uuid, text, integer, integer, integer, integer, integer, integer, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.pr22_settle_cash_contribution(uuid, text) from public, anon, authenticated;
revoke all on function private.pr22_reverse_rent_contribution(uuid, text, text) from public, anon, authenticated;
revoke all on function private.pr22_apply_rent_action(uuid, text, text) from public, anon, authenticated;
grant execute on function private.pr22_create_rent_agreement(uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz) to authenticated;
grant execute on function private.pr22_accept_rent_agreement(uuid) to authenticated;
grant execute on function private.pr22_settle_cash_contribution(uuid, text) to authenticated;
grant execute on function private.pr22_apply_rent_action(uuid, text, text) to authenticated;
grant execute on function private.pr22_activate_due_rent_agreements() to service_role;
grant execute on function private.pr22_generate_rent_obligation(uuid, date, date, timestamptz, text) to service_role;
grant execute on function private.pr22_apply_rent_contribution(uuid, text, integer, integer, integer, integer, integer, integer, uuid, uuid, text, text, text) to service_role;
grant execute on function private.pr22_reverse_rent_contribution(uuid, text, text) to service_role;

create or replace function public.pr22_create_rent_agreement(
  p_relationship_id uuid,
  p_model text,
  p_rent_amount_cents integer,
  p_billing_frequency text,
  p_autobooth_basis_points integer,
  p_grace_hours integer,
  p_late_fee_cents integer,
  p_cash_settlement_method text,
  p_terms_snapshot jsonb,
  p_effective_at timestamptz
)
returns public.rent_agreements
language sql
security invoker
set search_path = ''
as $$
  select private.pr22_create_rent_agreement(
    p_relationship_id, p_model, p_rent_amount_cents, p_billing_frequency,
    p_autobooth_basis_points, p_grace_hours, p_late_fee_cents,
    p_cash_settlement_method, p_terms_snapshot, p_effective_at
  );
$$;

create or replace function public.pr22_accept_rent_agreement(p_agreement_id uuid)
returns public.rent_agreements
language sql
security invoker
set search_path = ''
as $$ select private.pr22_accept_rent_agreement(p_agreement_id); $$;

create or replace function public.pr22_settle_cash_contribution(
  p_contribution_id uuid,
  p_evidence_reference text
)
returns public.rent_contributions
language sql
security invoker
set search_path = ''
as $$ select private.pr22_settle_cash_contribution(p_contribution_id, p_evidence_reference); $$;

create or replace function public.pr22_apply_rent_action(
  p_obligation_id uuid,
  p_action text,
  p_reason text default null
)
returns public.rent_obligations
language sql
security invoker
set search_path = ''
as $$ select private.pr22_apply_rent_action(p_obligation_id, p_action, p_reason); $$;

create or replace function public.pr22_activate_due_rent_agreements()
returns integer
language sql
security invoker
set search_path = ''
as $$ select private.pr22_activate_due_rent_agreements(); $$;

create or replace function public.pr22_generate_rent_obligation(
  p_agreement_id uuid,
  p_period_start date,
  p_period_end date,
  p_due_at timestamptz,
  p_idempotency_key text
)
returns public.rent_obligations
language sql
security invoker
set search_path = ''
as $$
  select private.pr22_generate_rent_obligation(
    p_agreement_id, p_period_start, p_period_end, p_due_at, p_idempotency_key
  );
$$;

create or replace function public.pr22_apply_rent_contribution(
  p_obligation_id uuid,
  p_contribution_kind text,
  p_service_amount_cents integer,
  p_platform_fee_cents integer,
  p_processing_fee_cents integer,
  p_tip_amount_cents integer,
  p_tax_amount_cents integer,
  p_refunded_service_cents integer,
  p_payment_id uuid,
  p_appointment_id uuid,
  p_provider_event_id text,
  p_evidence_reference text,
  p_idempotency_key text
)
returns public.rent_contributions
language sql
security invoker
set search_path = ''
as $$
  select private.pr22_apply_rent_contribution(
    p_obligation_id, p_contribution_kind, p_service_amount_cents,
    p_platform_fee_cents, p_processing_fee_cents, p_tip_amount_cents,
    p_tax_amount_cents, p_refunded_service_cents, p_payment_id,
    p_appointment_id, p_provider_event_id, p_evidence_reference,
    p_idempotency_key
  );
$$;

create or replace function public.pr22_reverse_rent_contribution(
  p_contribution_id uuid,
  p_provider_event_id text,
  p_idempotency_key text
)
returns public.rent_contributions
language sql
security invoker
set search_path = ''
as $$
  select private.pr22_reverse_rent_contribution(
    p_contribution_id, p_provider_event_id, p_idempotency_key
  );
$$;

revoke all on function public.pr22_create_rent_agreement(uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz) from public, anon;
revoke all on function public.pr22_accept_rent_agreement(uuid) from public, anon;
revoke all on function public.pr22_settle_cash_contribution(uuid, text) from public, anon;
revoke all on function public.pr22_apply_rent_action(uuid, text, text) from public, anon;
grant execute on function public.pr22_create_rent_agreement(uuid, text, integer, text, integer, integer, integer, text, jsonb, timestamptz) to authenticated;
grant execute on function public.pr22_accept_rent_agreement(uuid) to authenticated;
grant execute on function public.pr22_settle_cash_contribution(uuid, text) to authenticated;
grant execute on function public.pr22_apply_rent_action(uuid, text, text) to authenticated;
revoke all on function public.pr22_activate_due_rent_agreements() from public, anon, authenticated;
revoke all on function public.pr22_generate_rent_obligation(uuid, date, date, timestamptz, text) from public, anon, authenticated;
revoke all on function public.pr22_apply_rent_contribution(uuid, text, integer, integer, integer, integer, integer, integer, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.pr22_reverse_rent_contribution(uuid, text, text) from public, anon, authenticated;
grant execute on function public.pr22_activate_due_rent_agreements() to service_role;
grant execute on function public.pr22_generate_rent_obligation(uuid, date, date, timestamptz, text) to service_role;
grant execute on function public.pr22_apply_rent_contribution(uuid, text, integer, integer, integer, integer, integer, integer, uuid, uuid, text, text, text) to service_role;
grant execute on function public.pr22_reverse_rent_contribution(uuid, text, text) to service_role;

create or replace function public.pr22_get_owner_rent_statement(p_shop_id text)
returns table (
  obligation_id uuid,
  barber_id uuid,
  period_start date,
  period_end date,
  due_at timestamptz,
  status text,
  obligation_cents integer,
  settled_cents integer,
  remaining_cents integer,
  autobooth_settled_cents bigint,
  cash_pending_cents bigint,
  manual_settled_cents bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with contribution_totals as (
    select
      c.obligation_id,
      coalesce(sum(
        case
          when c.status <> 'settled' then 0
          when c.contribution_kind in ('autobooth_card', 'autobooth_cash') then c.applied_cents
          when c.contribution_kind = 'refund_reversal'
            and original.contribution_kind in ('autobooth_card', 'autobooth_cash')
            then -c.applied_cents
          else 0
        end
      ), 0)::bigint as autobooth_settled_cents,
      coalesce(sum(
        case
          when c.status = 'pending' and c.contribution_kind = 'autobooth_cash'
            then c.applied_cents
          else 0
        end
      ), 0)::bigint as cash_pending_cents,
      coalesce(sum(
        case
          when c.status <> 'settled' then 0
          when c.contribution_kind in ('manual_payment', 'autopay') then c.applied_cents
          when c.contribution_kind = 'refund_reversal'
            and original.contribution_kind in ('manual_payment', 'autopay')
            then -c.applied_cents
          else 0
        end
      ), 0)::bigint as manual_settled_cents
    from public.rent_contributions c
    left join public.rent_contributions original
      on original.id = c.reversal_of_contribution_id
    group by c.obligation_id
  )
  select
    o.id,
    o.barber_id,
    o.period_start,
    o.period_end,
    o.due_at,
    o.status,
    o.base_rent_cents + o.late_fee_cents,
    o.amount_settled_cents,
    greatest(o.base_rent_cents + o.late_fee_cents - o.amount_settled_cents, 0),
    coalesce(t.autobooth_settled_cents, 0),
    coalesce(t.cash_pending_cents, 0),
    coalesce(t.manual_settled_cents, 0)
  from public.rent_obligations o
  left join contribution_totals t on t.obligation_id = o.id
  where o.shop_id = p_shop_id
    and private.pr22_is_shop_owner(p_shop_id);
$$;

revoke all on function public.pr22_get_owner_rent_statement(text) from public, anon, authenticated;
grant execute on function public.pr22_get_owner_rent_statement(text) to service_role;

create or replace function public.pr22_issue_queue_status_token(p_waitlist_entry_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_value text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;
  token_value := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.waitlist_entries
  set public_token_hash = private.pr22_sha256(token_value),
      updated_at = now()
  where id = p_waitlist_entry_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Queue entry not found.';
  end if;
  return token_value;
end;
$$;

create or replace function public.pr22_get_public_queue_status(p_token text)
returns table (
  queue_reference text,
  queue_state text,
  "position" integer,
  estimated_wait_minutes integer,
  ready_grace_expires_at timestamptz,
  shop_name text,
  reassigned_barber_label text,
  reassigned_price numeric,
  activation_offered boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with positioned as (
    select
      w.*,
      count(*) filter (
        where w.public_queue_state in ('waiting', 'almost_ready', 'ready', 'delayed', 'reassigned')
      ) over (
        partition by w.location_id
        order by w.created_at, w.id
        rows between unbounded preceding and current row
      )::integer as active_queue_position
    from public.waitlist_entries w
  )
  select
    'BVR-' || upper(substr(replace(w.id::text, '-', ''), 1, 4)),
    w.public_queue_state,
    case
      when w.public_queue_state in ('waiting', 'almost_ready', 'ready', 'delayed', 'reassigned')
        then w.active_queue_position
      else null
    end,
    w.estimated_wait_minutes,
    w.ready_grace_expires_at,
    l.name,
    case
      when w.public_queue_state = 'reassigned'
        then coalesce(p.full_name, 'Your new barber')
      else null
    end,
    case when w.public_queue_state = 'reassigned' then w.reassigned_price else null end,
    w.activation_offered,
    w.updated_at
  from positioned w
  join public.locations l on l.id = w.location_id
  left join public.barbers b on b.id = w.reassigned_barber_id
  left join public.profiles p on p.id = b.profile_id
  where length(p_token) between 32 and 128
    and w.public_token_hash = private.pr22_sha256(p_token)
  limit 1;
$$;

revoke all on function public.pr22_issue_queue_status_token(uuid) from public, anon, authenticated;
grant execute on function public.pr22_issue_queue_status_token(uuid) to service_role;
revoke all on function public.pr22_get_public_queue_status(text) from public, anon, authenticated;
grant execute on function public.pr22_get_public_queue_status(text) to service_role;

create or replace function private.pr22_seed_shop_setup_gates(
  p_shop_id text,
  p_location_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if not private.pr22_is_shop_owner(p_shop_id)
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Shop owner access required.';
  end if;

  insert into public.shop_setup_gates (shop_id, location_id, gate_key)
  select p_shop_id, p_location_id, gate_key
  from unnest(array[
    'shop_identity', 'public_shop_profile', 'hours_and_closures', 'team_policies',
    'walk_in_policy', 'kiosk_settings', 'banking_and_payouts', 'booth_rent_policy',
    'active_barber', 'services_and_pricing', 'booking_rules', 'emergency_controls'
  ]::text[]) gate_key
  on conflict (shop_id, location_id, gate_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.pr22_seed_shop_setup_gates(
  p_shop_id text,
  p_location_id uuid
)
returns integer
language sql
security invoker
set search_path = ''
as $$ select private.pr22_seed_shop_setup_gates(p_shop_id, p_location_id); $$;

create or replace function public.pr22_shop_setup_snapshot(
  p_shop_id text,
  p_location_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with gates as (
    select gate_key, status, exception_reason, evidence, updated_at
    from public.shop_setup_gates
    where shop_id = p_shop_id
      and location_id = p_location_id
      and private.pr22_is_shop_owner(p_shop_id)
  )
  select jsonb_build_object(
    'shopId', p_shop_id,
    'locationId', p_location_id,
    'requiredCount', 12,
    'passedCount', count(*) filter (where status in ('passed', 'approved_exception')),
    'operational', count(*) = 12
      and count(*) filter (where status in ('passed', 'approved_exception')) = 12,
    'gates', coalesce(jsonb_agg(
      jsonb_build_object(
        'key', gate_key,
        'status', status,
        'exceptionReason', exception_reason,
        'evidence', evidence,
        'updatedAt', updated_at
      ) order by gate_key
    ), '[]'::jsonb)
  )
  from gates;
$$;

create or replace function private.pr22_update_shop_setup_gate(
  p_shop_id text,
  p_location_id uuid,
  p_gate_key text,
  p_status text,
  p_evidence jsonb default '{}'::jsonb,
  p_exception_reason text default null
)
returns public.shop_setup_gates
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_row public.shop_setup_gates%rowtype;
  actor_id uuid := (select auth.uid());
begin
  if not private.pr22_is_shop_owner(p_shop_id)
     and not private.is_internal_operator() then
    raise exception using errcode = '42501', message = 'Shop owner or Architect access required.';
  end if;
  if p_status not in ('pending', 'passed', 'approved_exception') then
    raise exception using errcode = '23514', message = 'Invalid setup gate status.';
  end if;
  if p_status = 'approved_exception'
     and (
       not private.is_internal_operator()
       or length(btrim(coalesce(p_exception_reason, ''))) < 3
     ) then
    raise exception using errcode = '42501', message = 'Only Architect may approve a reasoned setup exception.';
  end if;

  perform private.pr22_seed_shop_setup_gates(p_shop_id, p_location_id);

  update public.shop_setup_gates
  set status = p_status,
      evidence = coalesce(p_evidence, '{}'::jsonb),
      exception_reason = case
        when p_status = 'approved_exception' then btrim(p_exception_reason)
        else null
      end,
      reviewed_by = case
        when p_status in ('passed', 'approved_exception') then actor_id
        else null
      end,
      reviewed_at = case
        when p_status in ('passed', 'approved_exception') then now()
        else null
      end,
      updated_at = now()
  where shop_id = p_shop_id
    and location_id = p_location_id
    and gate_key = p_gate_key
  returning * into updated_row;

  if updated_row.id is null then
    raise exception using errcode = 'P0002', message = 'Setup gate not found.';
  end if;
  return updated_row;
end;
$$;

create or replace function public.pr22_update_shop_setup_gate(
  p_shop_id text,
  p_location_id uuid,
  p_gate_key text,
  p_status text,
  p_evidence jsonb default '{}'::jsonb,
  p_exception_reason text default null
)
returns public.shop_setup_gates
language sql
security invoker
set search_path = ''
as $$
  select private.pr22_update_shop_setup_gate(
    p_shop_id, p_location_id, p_gate_key, p_status, p_evidence, p_exception_reason
  );
$$;

revoke all on function private.pr22_seed_shop_setup_gates(text, uuid) from public, anon, authenticated;
grant execute on function private.pr22_seed_shop_setup_gates(text, uuid) to authenticated, service_role;
revoke all on function private.pr22_update_shop_setup_gate(text, uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function private.pr22_update_shop_setup_gate(text, uuid, text, text, jsonb, text) to authenticated;
revoke all on function public.pr22_seed_shop_setup_gates(text, uuid) from public, anon;
grant execute on function public.pr22_seed_shop_setup_gates(text, uuid) to authenticated;
revoke all on function public.pr22_shop_setup_snapshot(text, uuid) from public, anon, authenticated;
grant execute on function public.pr22_shop_setup_snapshot(text, uuid) to service_role;
revoke all on function public.pr22_update_shop_setup_gate(text, uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.pr22_update_shop_setup_gate(text, uuid, text, text, jsonb, text) to authenticated;

create or replace function private.pr22_enforce_kiosk_setup_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resolved_shop_id text;
  resolved_location_id uuid;
  passed_count integer;
begin
  if new.scope <> 'shop' or not new.enabled then
    return new;
  end if;
  if new.emergency_disabled_at is not null then
    raise exception using errcode = '23514',
      message = 'An emergency-disabled kiosk cannot accept new bookings.';
  end if;

  select s.id, l.id
  into resolved_shop_id, resolved_location_id
  from public.locations l
  join public.shops s on s.id = l.reference_code
  where lower(new.target_reference) in (
    lower(s.id),
    lower(l.id::text),
    lower(coalesce(s.public_username, s.id))
  )
  limit 1;

  select count(*) filter (where status in ('passed', 'approved_exception'))
  into passed_count
  from public.shop_setup_gates
  where shop_id = resolved_shop_id
    and location_id = resolved_location_id;

  if resolved_shop_id is null or passed_count <> 12 then
    raise exception using errcode = '23514',
      message = 'Kiosk activation requires all 12 shop setup gates or approved exceptions.';
  end if;

  return new;
end;
$$;

drop trigger if exists pr22_kiosk_setup_gate on public.kiosk_settings;
create trigger pr22_kiosk_setup_gate
before insert or update of enabled, emergency_disabled_at
on public.kiosk_settings
for each row execute function private.pr22_enforce_kiosk_setup_gate();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'rent_agreements',
    'rent_obligations',
    'rent_contributions',
    'rent_actions_audit',
    'shop_setup_gates',
    'kiosk_sessions',
    'kiosk_settings',
    'waitlist_entries'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

create or replace function public.pr22_rent_release_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with reconciliation as (
    select
      coalesce((select sum(amount_settled_cents)::bigint from public.rent_obligations), 0)
      -
      coalesce((
        select sum(
          case
            when status <> 'settled' then 0
            when contribution_kind = 'refund_reversal' then -applied_cents
            else applied_cents
          end
        )::bigint
        from public.rent_contributions
      ), 0) as delta_cents
  ), checks as (
    select * from (values
      ('kiosk', not exists (
        select 1 from public.kiosk_sessions
        where status = 'active' and expires_at <= now()
      ), 'Active kiosk sessions expire inside their controlled window.'),
      ('queue', not exists (
        select 1 from public.waitlist_entries
        where public_token_hash is not null
          and public_token_hash !~ '^[0-9a-f]{64}$'
      ), 'Public queue capabilities are scoped hashed tokens.'),
      ('rotation', not exists (
        select 1 from public.kiosk_rotation_assignments
        where routing_type <> 'next_available_rotation'
          and rotation_entry_id is not null
      ), 'Direct choice never advances the shared rotation.'),
      ('wait_time', not exists (
        select 1 from public.waitlist_entries
        where estimated_wait_minutes is not null and estimated_wait_minutes < 0
      ), 'Wait estimates remain honest non-negative bounds.'),
      ('realtime', (
        select count(distinct tablename) = 8
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename in (
            'rent_agreements',
            'rent_obligations',
            'rent_contributions',
            'rent_actions_audit',
            'shop_setup_gates',
            'kiosk_sessions',
            'kiosk_settings',
            'waitlist_entries'
          )
      ), 'Queue, rent, and kiosk truth is present in the Supabase Realtime publication.'),
      ('notifications', not exists (
        select 1
        from public.notification_delivery_attempts
        where status in ('failed', 'retrying')
          and (
            length(btrim(coalesce(error_message, ''))) < 3
            or (next_retry_at is null and attempt_number < 3)
          )
      ), 'Failed notification attempts are observable and scheduled for retry or explicitly exhausted.'),
      ('activation', not exists (
        select 1
        from public.kiosk_settings k
        where k.scope = 'shop' and k.enabled
          and not exists (
            select 1
            from public.locations l
            join public.shops s on s.id = l.reference_code
            where lower(k.target_reference) in (
              lower(s.id), lower(l.id::text), lower(coalesce(s.public_username, s.id))
            )
              and (
                select count(*)
                from public.shop_setup_gates g
                where g.shop_id = s.id
                  and g.location_id = l.id
                  and g.status in ('passed', 'approved_exception')
              ) = 12
          )
      ), 'Operational kiosks require twelve passed setup gates.'),
      ('payments', not exists (
        select 1 from public.rent_contributions
        group by idempotency_key
        having count(*) > 1
      ), 'Rent payment events are idempotent.'),
      ('cash_truth', not exists (
        select 1 from public.rent_contributions
        where contribution_kind = 'autobooth_cash'
          and status = 'settled'
          and length(btrim(coalesce(evidence_reference, ''))) < 3
      ), 'Cash remains pending until actual transfer evidence exists.'),
      ('stripe_connect', not exists (
        select 1 from public.rent_contributions
        where contribution_kind = 'autobooth_card'
          and status = 'settled'
          and payment_id is null
      ), 'Settled card rent traces to a canonical payment.'),
      ('autobooth', not exists (
        select 1 from public.rent_contributions c
        join public.rent_agreements a on a.id = c.agreement_id
        where c.contribution_kind in ('autobooth_card', 'autobooth_cash')
          and (
            a.model <> 'autobooth_rent'
            or c.applied_cents > c.requested_cents
            or c.applied_cents > greatest(c.eligible_service_cents - c.refunded_service_cents, 0)
            or c.excluded_tip_cents < 0
            or c.excluded_tax_cents < 0
          )
      ), 'AutoBooth excludes tips and taxes and stops at outstanding rent.'),
      ('booth_rent', not exists (
        select 1 from public.rent_obligations
        where amount_settled_cents > base_rent_cents + late_fee_cents
      ) and (select delta_cents = 0 from reconciliation), 'Obligations and contribution ledgers reconcile to $0.00.')
    ) check_row(check_name, passed, detail)
  ), payload as (
    select jsonb_build_object(
      'schemaVersion', 1,
      'mission', 'PR22_BOOTH_RENT',
      'generatedAt', now(),
      'reconciliationDeltaCents', (select delta_cents from reconciliation),
      'checkCount', count(*),
      'passedCount', count(*) filter (where passed),
      'certifiable', count(*) = 12 and bool_and(passed)
        and (select delta_cents = 0 from reconciliation),
      'checks', jsonb_agg(
        jsonb_build_object('key', check_name, 'passed', passed, 'detail', detail)
        order by check_name
      )
    ) value
    from checks
  )
  select value from payload
  where (select private.is_internal_operator())
    or coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function public.pr22_issue_release_certificate(
  p_commit_sha text,
  p_deployment_id text
)
returns public.pr22_release_certificates
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  inserted_row public.pr22_release_certificates%rowtype;
  actor_id uuid := (select auth.uid());
begin
  if not private.is_internal_operator()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Architect access required.';
  end if;
  snapshot := public.pr22_rent_release_snapshot();
  if not coalesce((snapshot ->> 'certifiable')::boolean, false)
     or coalesce((snapshot ->> 'reconciliationDeltaCents')::integer, 1) <> 0 then
    raise exception using errcode = '23514', message = 'All twelve checks and $0.00 reconciliation are required.';
  end if;

  insert into public.pr22_release_certificates (
    commit_sha, deployment_id, reconciliation_delta_cents, check_snapshot, issued_by
  ) values (
    lower(p_commit_sha), p_deployment_id,
    (snapshot ->> 'reconciliationDeltaCents')::integer, snapshot, actor_id
  )
  on conflict (commit_sha, deployment_id)
  do update set check_snapshot = excluded.check_snapshot
  returning * into inserted_row;

  return inserted_row;
end;
$$;

revoke all on function public.pr22_rent_release_snapshot() from public, anon, authenticated;
grant execute on function public.pr22_rent_release_snapshot() to service_role;
revoke all on function public.pr22_issue_release_certificate(text, text) from public, anon, authenticated;
grant execute on function public.pr22_issue_release_certificate(text, text) to service_role;

comment on table public.rent_agreements is
  'Immutable, versioned, bilaterally accepted Full Booth Rent or AutoBooth Rent terms.';
comment on table public.rent_obligations is
  'Fixed rent debt by agreement period. Service earnings are never stored here.';
comment on table public.rent_contributions is
  'Auditable rent funding events. Tips, tax, refunds, and external money remain explicit exclusions.';
comment on table public.rent_actions_audit is
  'Append-only audit of agreement, contribution, recovery, and certification actions.';
comment on table public.shop_setup_gates is
  'The twelve required shop-operational setup checks and approved exceptions.';
