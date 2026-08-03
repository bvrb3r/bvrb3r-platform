-- Product PR27 — compliance, first-run, account control, and Culture safety.
--
-- This migration never moves money. Account deletion seals shared financial
-- truth and removes application access; it never rewrites a rent, payment,
-- refund, payout, or dispute ledger.

begin;

create schema if not exists compliance_private;
revoke all on schema compliance_private from public, anon, authenticated;
grant usage on schema compliance_private to service_role;

-- --------------------------------------------------------------------------
-- 1. Versioned legal truth. Drafts remain drafts until counsel approves them.
-- --------------------------------------------------------------------------

create table if not exists public.legal_document_versions (
  document_key text not null,
  document_version text not null,
  title text not null,
  status text not null check (status in ('draft', 'published', 'retired')),
  effective_at timestamptz,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  source_path text not null,
  requires_acceptance boolean not null default false,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (document_key, document_version),
  constraint legal_document_versions_publish_ck check (
    (status = 'draft' and effective_at is null and published_at is null)
    or (status = 'published' and effective_at is not null and published_at is not null)
    or (status = 'retired' and retired_at is not null)
  )
);

create unique index if not exists legal_document_versions_one_published_idx
  on public.legal_document_versions (document_key)
  where status = 'published';

alter table public.legal_document_versions enable row level security;
revoke all on table public.legal_document_versions from public, anon, authenticated;
grant select on table public.legal_document_versions to anon, authenticated;
grant all on table public.legal_document_versions to service_role;

drop policy if exists legal_document_versions_public_select on public.legal_document_versions;
create policy legal_document_versions_public_select
  on public.legal_document_versions
  for select
  to anon, authenticated
  using (status = 'published');

insert into public.legal_document_versions (
  document_key,
  document_version,
  title,
  status,
  effective_at,
  content_sha256,
  source_path,
  requires_acceptance,
  published_at
)
values
  (
    'terms',
    'draft-1-2026-07-26',
    'Terms of Service',
    'draft',
    null,
    'd528a0da49fbb5dce3f8d90dd64b3c63f3a75008a1017f9f605928c94d755754',
    'content/legal/LEGAL-TERMS-DRAFT.md',
    false,
    null
  ),
  (
    'privacy',
    'draft-1-2026-07-26',
    'Privacy Policy',
    'draft',
    null,
    'a243d8056c85123ccf3e80577178ff5d6dbf59db771f6b9a296a035b4fa745e8',
    'content/legal/LEGAL-PRIVACY-DRAFT.md',
    false,
    null
  ),
  (
    'refund',
    'draft-1-2026-07-26',
    'Refund & Cancellation Policy',
    'draft',
    null,
    '3228f55382c82456c5fca7fa2be023e959bd99f02f5f715add9a075af848f1d3',
    'content/legal/LEGAL-REFUND-DRAFT.md',
    false,
    null
  ),
  (
    'acceptable_use',
    'draft-1-2026-07-26',
    'Acceptable Use Policy',
    'draft',
    null,
    '3f85574c709dbc1fe6780e332d75992df11876c3629d0e4c5e5bbf7d8dba875e',
    'content/legal/LEGAL-ACCEPTABLE-USE-DRAFT.md',
    false,
    null
  )
on conflict (document_key, document_version) do update
set
  title = excluded.title,
  status = excluded.status,
  effective_at = excluded.effective_at,
  content_sha256 = excluded.content_sha256,
  source_path = excluded.source_path,
  requires_acceptance = excluded.requires_acceptance,
  published_at = excluded.published_at;

-- --------------------------------------------------------------------------
-- 2. Barber first-run evidence. Required truth controls go-live and kiosk.
-- --------------------------------------------------------------------------

create table if not exists public.barber_setup_evidence (
  barber_id uuid not null references public.barbers(id) on delete cascade,
  setup_key text not null check (setup_key in (
    'public_profile',
    'services_prices',
    'license_verification',
    'stripe_payouts',
    'shop_link_or_independent',
    'chairsync',
    'portfolio_culture',
    'chair_qr_nfc'
  )),
  status text not null default 'to_do' check (status in ('to_do', 'in_review', 'done')),
  evidence jsonb not null default '{}'::jsonb,
  verified_by_profile_id uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (barber_id, setup_key)
);

create index if not exists barber_setup_evidence_verifier_idx
  on public.barber_setup_evidence (verified_by_profile_id)
  where verified_by_profile_id is not null;

create table if not exists public.barber_setup_activations (
  barber_id uuid primary key references public.barbers(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  activated_at timestamptz,
  paused_at timestamptz,
  activated_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint barber_setup_activations_live_ck check (
    status <> 'live' or activated_at is not null
  )
);

create index if not exists barber_setup_activations_actor_idx
  on public.barber_setup_activations (activated_by_profile_id)
  where activated_by_profile_id is not null;

alter table public.barber_setup_evidence enable row level security;
alter table public.barber_setup_activations enable row level security;
revoke all on table public.barber_setup_evidence from public, anon, authenticated;
revoke all on table public.barber_setup_activations from public, anon, authenticated;
grant select on table public.barber_setup_evidence to authenticated;
grant select on table public.barber_setup_activations to authenticated;
grant all on table public.barber_setup_evidence to service_role;
grant all on table public.barber_setup_activations to service_role;

drop policy if exists barber_setup_evidence_named_barber_select on public.barber_setup_evidence;
create policy barber_setup_evidence_named_barber_select
  on public.barber_setup_evidence
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.barbers b
      where b.id = barber_setup_evidence.barber_id
        and b.profile_id = auth.uid()
    )
  );

drop policy if exists barber_setup_activations_named_barber_select on public.barber_setup_activations;
create policy barber_setup_activations_named_barber_select
  on public.barber_setup_activations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.barbers b
      where b.id = barber_setup_activations.barber_id
        and b.profile_id = auth.uid()
    )
  );

create or replace function public.pr27_barber_required_setup_complete(p_barber_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where e.status = 'done') = 5
    and count(*) = 5
  from public.barber_setup_evidence e
  where e.barber_id = p_barber_id
    and e.setup_key in (
      'public_profile',
      'services_prices',
      'license_verification',
      'stripe_payouts',
      'shop_link_or_independent'
    );
$$;

revoke all on function public.pr27_barber_required_setup_complete(uuid)
  from public, anon, authenticated;
grant execute on function public.pr27_barber_required_setup_complete(uuid)
  to service_role;

-- --------------------------------------------------------------------------
-- 3. Account privacy, export delivery, deletion grace, and sealed retention.
-- --------------------------------------------------------------------------

create table if not exists public.account_privacy_lifecycles (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'deactivated', 'deletion_grace', 'restored', 'deleted')),
  deactivated_at timestamptz,
  deletion_requested_at timestamptz,
  deletion_grace_ends_at timestamptz,
  restored_at timestamptz,
  deleted_at timestamptz,
  profile_visible boolean not null default true,
  notifications_enabled boolean not null default true,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  constraint account_privacy_lifecycle_shape_ck check (
    (status in ('active', 'restored') and profile_visible and notifications_enabled)
    or (status in ('deactivated', 'deletion_grace', 'deleted') and not profile_visible and not notifications_enabled)
  ),
  constraint account_privacy_deletion_grace_ck check (
    status <> 'deletion_grace'
    or (
      deletion_requested_at is not null
      and deletion_grace_ends_at is not null
      and deletion_grace_ends_at = deletion_requested_at + interval '30 days'
    )
  )
);

create index if not exists account_privacy_lifecycles_grace_idx
  on public.account_privacy_lifecycles (deletion_grace_ends_at)
  where status = 'deletion_grace';

create table if not exists compliance_private.account_deletion_challenges (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  challenge_hash text not null,
  expires_at timestamptz not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 10),
  created_at timestamptz not null default now()
);

create table if not exists public.account_export_deliveries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  data_rights_request_id uuid references public.data_rights_requests(id) on delete restrict,
  status text not null default 'requested'
    check (status in ('requested', 'building', 'ready', 'expired', 'failed')),
  storage_reference text,
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz,
  downloaded_at timestamptz,
  constraint account_export_deliveries_window_ck check (
    status not in ('ready', 'expired')
    or (
      ready_at is not null
      and expires_at is not null
      and expires_at = ready_at + interval '7 days'
    )
  )
);

create index if not exists account_export_deliveries_profile_idx
  on public.account_export_deliveries (profile_id, requested_at desc);
create index if not exists account_export_deliveries_expiry_idx
  on public.account_export_deliveries (expires_at)
  where status = 'ready';

create table if not exists compliance_private.finance_retention_vault (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  retention_class text not null
    check (retention_class in ('payment', 'refund', 'payout', 'rent', 'tax', 'dispute', 'consent')),
  source_table text not null,
  source_reference text not null,
  sealed_payload jsonb not null,
  retain_until timestamptz not null,
  legal_hold boolean not null default false,
  sealed_at timestamptz not null default now(),
  destroyed_at timestamptz,
  unique (retention_class, source_table, source_reference)
);

create index if not exists finance_retention_vault_profile_idx
  on compliance_private.finance_retention_vault (profile_id, sealed_at desc);
create index if not exists finance_retention_vault_expiry_idx
  on compliance_private.finance_retention_vault (retain_until)
  where destroyed_at is null and not legal_hold;

alter table public.account_privacy_lifecycles enable row level security;
alter table public.account_export_deliveries enable row level security;

revoke all on table public.account_privacy_lifecycles from public, anon, authenticated;
revoke all on table public.account_export_deliveries from public, anon, authenticated;
revoke all on table compliance_private.account_deletion_challenges from public, anon, authenticated;
revoke all on table compliance_private.finance_retention_vault from public, anon, authenticated;

grant select on table public.account_privacy_lifecycles to authenticated;
grant select on table public.account_export_deliveries to authenticated;
grant all on table public.account_privacy_lifecycles to service_role;
grant all on table public.account_export_deliveries to service_role;
grant all on table compliance_private.account_deletion_challenges to service_role;
grant all on table compliance_private.finance_retention_vault to service_role;

drop policy if exists account_privacy_lifecycle_self_select on public.account_privacy_lifecycles;
create policy account_privacy_lifecycle_self_select
  on public.account_privacy_lifecycles
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists account_export_deliveries_self_select on public.account_export_deliveries;
create policy account_export_deliveries_self_select
  on public.account_export_deliveries
  for select to authenticated
  using (profile_id = auth.uid());

-- --------------------------------------------------------------------------
-- 4. Culture report, block, mute, moderation, appeal, and strike truth.
-- --------------------------------------------------------------------------

create table if not exists public.culture_profile_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_profile_id uuid not null references public.profiles(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  constraint culture_profile_blocks_not_self_ck check (blocker_profile_id <> blocked_profile_id),
  unique (blocker_profile_id, blocked_profile_id)
);

create index if not exists culture_profile_blocks_reverse_idx
  on public.culture_profile_blocks (blocked_profile_id, blocker_profile_id)
  where active;

create table if not exists public.culture_profile_mutes (
  muter_profile_id uuid not null references public.profiles(id) on delete cascade,
  muted_profile_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  primary key (muter_profile_id, muted_profile_id),
  constraint culture_profile_mutes_not_self_ck check (muter_profile_id <> muted_profile_id)
);

create index if not exists culture_profile_mutes_target_idx
  on public.culture_profile_mutes (muted_profile_id, muter_profile_id)
  where active;

create table if not exists public.culture_safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references public.profiles(id) on delete restrict,
  reported_profile_id uuid not null references public.profiles(id) on delete restrict,
  post_id uuid references public.culture_posts(id) on delete set null,
  category text not null
    check (category in ('spam', 'harassment', 'stolen_work', 'explicit_content', 'dangerous_services', 'other')),
  details text,
  status text not null default 'received'
    check (status in ('received', 'under_review', 'auto_hidden', 'resolved_keep', 'resolved_action')),
  reporter_reference text not null unique,
  report_velocity integer not null default 1 check (report_velocity > 0),
  auto_hidden_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists culture_safety_reports_queue_idx
  on public.culture_safety_reports (status, report_velocity desc, created_at);
create index if not exists culture_safety_reports_reported_profile_idx
  on public.culture_safety_reports (reported_profile_id, created_at desc);
create index if not exists culture_safety_reports_post_idx
  on public.culture_safety_reports (post_id, created_at desc)
  where post_id is not null;

create or replace function compliance_private.auto_hide_culture_post_on_report_velocity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_report_count integer;
begin
  if new.post_id is null then
    return new;
  end if;

  select count(*)::integer
  into recent_report_count
  from public.culture_safety_reports r
  where r.post_id = new.post_id
    and r.created_at >= now() - interval '24 hours';

  update public.culture_safety_reports
  set report_velocity = recent_report_count
  where id = new.id;

  if recent_report_count >= 3 then
    update public.culture_posts
    set moderation_status = 'flagged', updated_at = now()
    where id = new.post_id
      and moderation_status = 'approved';

    update public.culture_safety_reports
    set status = 'auto_hidden', auto_hidden_at = coalesce(auto_hidden_at, now())
    where post_id = new.post_id
      and status in ('received', 'under_review');
  end if;

  return new;
end;
$$;

revoke all on function compliance_private.auto_hide_culture_post_on_report_velocity()
  from public, anon, authenticated, service_role;

drop trigger if exists pr27_auto_hide_culture_post on public.culture_safety_reports;
create trigger pr27_auto_hide_culture_post
after insert on public.culture_safety_reports
for each row
execute function compliance_private.auto_hide_culture_post_on_report_velocity();

create table if not exists public.culture_moderation_cases (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.culture_safety_reports(id) on delete restrict,
  reported_profile_id uuid not null references public.profiles(id) on delete restrict,
  post_id uuid references public.culture_posts(id) on delete set null,
  severity text not null check (severity in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'decided', 'appealed', 'closed')),
  decision text check (decision in ('keep', 'warn', 'remove', 'escalate')),
  decision_reasoning text,
  assigned_reviewer_profile_id uuid references public.profiles(id) on delete set null,
  decided_by_profile_id uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint culture_moderation_case_decision_ck check (
    decision is null
    or (
      decided_by_profile_id is not null
      and decided_at is not null
      and length(btrim(coalesce(decision_reasoning, ''))) >= 12
    )
  )
);

create index if not exists culture_moderation_cases_queue_idx
  on public.culture_moderation_cases (status, severity desc, created_at);
create index if not exists culture_moderation_cases_assignee_idx
  on public.culture_moderation_cases (assigned_reviewer_profile_id, status, created_at);
create index if not exists culture_moderation_cases_reported_idx
  on public.culture_moderation_cases (reported_profile_id, created_at desc);

create table if not exists public.culture_strikes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.culture_moderation_cases(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'removed', 'expired')),
  reason text not null check (length(btrim(reason)) >= 12),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 months',
  removed_at timestamptz,
  removed_by_profile_id uuid references public.profiles(id) on delete set null,
  unique (case_id, profile_id)
);

create index if not exists culture_strikes_profile_active_idx
  on public.culture_strikes (profile_id, issued_at desc)
  where status = 'active';
create index if not exists culture_strikes_expiry_idx
  on public.culture_strikes (expires_at)
  where status = 'active';
create index if not exists culture_strikes_removed_by_idx
  on public.culture_strikes (removed_by_profile_id)
  where removed_by_profile_id is not null;

create table if not exists public.culture_appeals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.culture_moderation_cases(id) on delete restrict,
  appellant_profile_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 12 and 2000),
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'upheld', 'denied')),
  original_reviewer_profile_id uuid not null references public.profiles(id) on delete restrict,
  appeal_reviewer_profile_id uuid references public.profiles(id) on delete set null,
  decision_reasoning text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint culture_appeals_fresh_reviewer_ck check (
    appeal_reviewer_profile_id is null
    or appeal_reviewer_profile_id <> original_reviewer_profile_id
  ),
  constraint culture_appeals_decision_ck check (
    status in ('submitted', 'under_review')
    or (
      appeal_reviewer_profile_id is not null
      and decided_at is not null
      and length(btrim(coalesce(decision_reasoning, ''))) >= 12
    )
  )
);

create index if not exists culture_appeals_appellant_idx
  on public.culture_appeals (appellant_profile_id, submitted_at desc);
create index if not exists culture_appeals_reviewer_idx
  on public.culture_appeals (appeal_reviewer_profile_id, status, submitted_at)
  where appeal_reviewer_profile_id is not null;

create table if not exists public.culture_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.culture_moderation_cases(id) on delete restrict,
  appeal_id uuid references public.culture_appeals(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  reasoning text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint culture_moderation_audit_target_ck check (case_id is not null or appeal_id is not null)
);

create index if not exists culture_moderation_audit_case_idx
  on public.culture_moderation_audit (case_id, created_at);
create index if not exists culture_moderation_audit_appeal_idx
  on public.culture_moderation_audit (appeal_id, created_at)
  where appeal_id is not null;
create index if not exists culture_moderation_audit_actor_idx
  on public.culture_moderation_audit (actor_profile_id, created_at)
  where actor_profile_id is not null;

alter table public.culture_profile_blocks enable row level security;
alter table public.culture_profile_mutes enable row level security;
alter table public.culture_safety_reports enable row level security;
alter table public.culture_moderation_cases enable row level security;
alter table public.culture_strikes enable row level security;
alter table public.culture_appeals enable row level security;
alter table public.culture_moderation_audit enable row level security;

revoke all on table public.culture_profile_blocks from public, anon, authenticated;
revoke all on table public.culture_profile_mutes from public, anon, authenticated;
revoke all on table public.culture_safety_reports from public, anon, authenticated;
revoke all on table public.culture_moderation_cases from public, anon, authenticated;
revoke all on table public.culture_strikes from public, anon, authenticated;
revoke all on table public.culture_appeals from public, anon, authenticated;
revoke all on table public.culture_moderation_audit from public, anon, authenticated;

grant select on table public.culture_profile_blocks to authenticated;
grant select on table public.culture_profile_mutes to authenticated;
grant select on table public.culture_safety_reports to authenticated;
grant select on table public.culture_moderation_cases to authenticated;
grant select on table public.culture_strikes to authenticated;
grant select on table public.culture_appeals to authenticated;
grant all on table public.culture_profile_blocks to service_role;
grant all on table public.culture_profile_mutes to service_role;
grant all on table public.culture_safety_reports to service_role;
grant all on table public.culture_moderation_cases to service_role;
grant all on table public.culture_strikes to service_role;
grant all on table public.culture_appeals to service_role;
grant all on table public.culture_moderation_audit to service_role;

drop policy if exists culture_profile_blocks_participant_select on public.culture_profile_blocks;
create policy culture_profile_blocks_participant_select
  on public.culture_profile_blocks
  for select to authenticated
  using (blocker_profile_id = auth.uid() or blocked_profile_id = auth.uid());

drop policy if exists culture_profile_mutes_owner_select on public.culture_profile_mutes;
create policy culture_profile_mutes_owner_select
  on public.culture_profile_mutes
  for select to authenticated
  using (muter_profile_id = auth.uid());

drop policy if exists culture_safety_reports_reporter_select on public.culture_safety_reports;
create policy culture_safety_reports_reporter_select
  on public.culture_safety_reports
  for select to authenticated
  using (reporter_profile_id = auth.uid());

drop policy if exists culture_moderation_cases_subject_select on public.culture_moderation_cases;
create policy culture_moderation_cases_subject_select
  on public.culture_moderation_cases
  for select to authenticated
  using (reported_profile_id = auth.uid());

drop policy if exists culture_strikes_subject_select on public.culture_strikes;
create policy culture_strikes_subject_select
  on public.culture_strikes
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists culture_appeals_appellant_select on public.culture_appeals;
create policy culture_appeals_appellant_select
  on public.culture_appeals
  for select to authenticated
  using (appellant_profile_id = auth.uid());

create or replace function public.pr27_profiles_blocked(
  p_left_profile_id uuid,
  p_right_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.culture_profile_blocks b
    where b.active
      and (
        (b.blocker_profile_id = p_left_profile_id and b.blocked_profile_id = p_right_profile_id)
        or
        (b.blocker_profile_id = p_right_profile_id and b.blocked_profile_id = p_left_profile_id)
      )
  );
$$;

revoke all on function public.pr27_profiles_blocked(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.pr27_profiles_blocked(uuid, uuid)
  to service_role;

drop policy if exists "culture posts public approved read batch 4" on public.culture_posts;
create policy "culture posts public approved read batch 4"
  on public.culture_posts
  for select
  to anon, authenticated
  using (
    publishing_status = 'published'
    and moderation_status = 'approved'
    and visibility = 'public'
    and deleted_at is null
    and (
      auth.uid() is null
      or not exists (
        select 1
        from public.culture_profile_blocks b
        where b.active
          and (
            (b.blocker_profile_id = auth.uid() and b.blocked_profile_id = culture_posts.author_profile_id)
            or
            (b.blocker_profile_id = culture_posts.author_profile_id and b.blocked_profile_id = auth.uid())
          )
      )
    )
  );

create or replace function compliance_private.prevent_blocked_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  client_profile_id uuid;
  barber_profile_id uuid;
begin
  select c.profile_id into client_profile_id
  from public.clients c
  where c.id = new.client_id;

  select b.profile_id into barber_profile_id
  from public.barbers b
  where b.id = new.barber_id;

  if client_profile_id is not null
    and barber_profile_id is not null
    and public.pr27_profiles_blocked(client_profile_id, barber_profile_id)
  then
    raise exception using
      errcode = 'P0001',
      message = 'Booking is unavailable between blocked accounts.';
  end if;

  return new;
end;
$$;

revoke all on function compliance_private.prevent_blocked_booking()
  from public, anon, authenticated, service_role;

drop trigger if exists pr27_prevent_blocked_booking on public.appointments;
create trigger pr27_prevent_blocked_booking
before insert or update of client_id, barber_id
on public.appointments
for each row
execute function compliance_private.prevent_blocked_booking();

create or replace function public.pr27_culture_standing(p_profile_id uuid)
returns table (
  active_strike_count integer,
  enforcement text,
  posting_paused_until timestamptz,
  booking_and_money_unaffected boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with active as (
    select issued_at
    from public.culture_strikes
    where profile_id = p_profile_id
      and status = 'active'
      and expires_at > now()
  ),
  summary as (
    select count(*)::integer as strike_count, max(issued_at) as latest_strike
    from active
  )
  select
    strike_count,
    case
      when strike_count >= 3 then 'culture_ban'
      when strike_count = 2 then 'posting_pause'
      when strike_count = 1 then 'warning'
      else 'clear'
    end,
    case when strike_count = 2 then latest_strike + interval '7 days' else null end,
    true
  from summary;
$$;

revoke all on function public.pr27_culture_standing(uuid)
  from public, anon, authenticated;
grant execute on function public.pr27_culture_standing(uuid)
  to service_role;

-- Server-owned support cases give an issue a durable ticket state while the
-- existing support message thread remains the conversation.
create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references public.profiles(id) on delete restrict,
  thread_id uuid references public.message_threads(id) on delete set null,
  category text not null,
  severity text not null check (severity in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'received'
    check (status in ('received', 'triaged', 'in_progress', 'waiting_on_user', 'resolved', 'closed')),
  public_reference text not null unique,
  assigned_lane text not null,
  summary text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists support_cases_reporter_idx
  on public.support_cases (reporter_profile_id, created_at desc);
create index if not exists support_cases_queue_idx
  on public.support_cases (status, severity desc, created_at);
create index if not exists support_cases_thread_idx
  on public.support_cases (thread_id)
  where thread_id is not null;

alter table public.support_cases enable row level security;
revoke all on table public.support_cases from public, anon, authenticated;
grant select on table public.support_cases to authenticated;
grant all on table public.support_cases to service_role;

drop policy if exists support_cases_reporter_select on public.support_cases;
create policy support_cases_reporter_select
  on public.support_cases
  for select to authenticated
  using (reporter_profile_id = auth.uid());

create table if not exists public.dispute_evidence_items (
  id uuid primary key default gen_random_uuid(),
  dispute_reference text not null references public.disputes(id) on delete cascade,
  submitted_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('image', 'document', 'message', 'receipt', 'timeline_note')),
  storage_reference text,
  statement text,
  created_at timestamptz not null default now(),
  constraint dispute_evidence_item_body_ck check (
    length(btrim(coalesce(storage_reference, ''))) >= 3
    or length(btrim(coalesce(statement, ''))) >= 3
  )
);

create index if not exists dispute_evidence_items_dispute_idx
  on public.dispute_evidence_items (dispute_reference, created_at);
create index if not exists dispute_evidence_items_submitter_idx
  on public.dispute_evidence_items (submitted_by_profile_id, created_at desc);

alter table public.dispute_evidence_items enable row level security;
revoke all on table public.dispute_evidence_items from public, anon, authenticated;
grant select on table public.dispute_evidence_items to authenticated;
grant all on table public.dispute_evidence_items to service_role;

drop policy if exists dispute_evidence_items_submitter_select on public.dispute_evidence_items;
create policy dispute_evidence_items_submitter_select
  on public.dispute_evidence_items
  for select to authenticated
  using (submitted_by_profile_id = auth.uid());

notify pgrst, 'reload schema';
commit;
