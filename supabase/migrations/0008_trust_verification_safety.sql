do $$
begin
  create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected', 'expired');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.verification_owner_type as enum ('barber', 'shop');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.trust_badge_kind as enum ('verified_barber', 'verified_license', 'verified_shop', 'trusted_pro', 'top_rated', 'rising_barber');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.review_moderation_status as enum ('eligible', 'approved', 'flagged', 'under_review', 'removed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.safety_report_status as enum ('open', 'under_review', 'resolved', 'dismissed', 'escalated');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.risk_severity as enum ('low', 'medium', 'high');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.barber_verifications (
  id text primary key,
  barber_reference text not null,
  category text not null,
  legal_name text not null,
  license_type text,
  license_number text,
  issuing_state text,
  expiration_date date,
  verification_status public.verification_status not null default 'pending',
  verification_submitted_at timestamptz,
  verification_reviewed_at timestamptz,
  verification_notes text,
  document_path text,
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_verifications (
  id text primary key,
  shop_reference text not null,
  category text not null,
  business_name text not null,
  verification_status public.verification_status not null default 'pending',
  verification_submitted_at timestamptz,
  verification_reviewed_at timestamptz,
  verification_notes text,
  document_path text,
  updated_at timestamptz not null default now()
);

create table if not exists public.verification_documents (
  id text primary key,
  owner_type public.verification_owner_type not null,
  owner_reference text not null,
  category text not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.trust_badges (
  id text primary key,
  scope_type public.verification_owner_type not null,
  scope_reference text not null,
  badge_kind public.trust_badge_kind not null,
  label text not null,
  public_visible boolean not null default true,
  granted_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.review_moderation (
  id text primary key,
  review_reference text not null,
  barber_reference text not null,
  client_reference text not null,
  appointment_reference text,
  eligible boolean not null default true,
  moderation_status public.review_moderation_status not null default 'eligible',
  suspicious_flags text[] not null default '{}',
  abuse_reported boolean not null default false,
  integrity_score numeric(8,2) not null default 100,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_reference)
);

create table if not exists public.safety_reports (
  id text primary key,
  reporter_role public.app_role not null,
  reporter_reference text not null,
  reporter_email text,
  subject_type text not null,
  subject_reference text not null,
  category text not null,
  details text not null,
  status public.safety_report_status not null default 'open',
  location_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_events (
  id text primary key,
  report_reference text not null references public.safety_reports(id) on delete cascade,
  actor_role public.app_role not null,
  actor_reference text not null,
  action_label text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.disputes (
  id text primary key,
  dispute_type text not null,
  dispute_status public.safety_report_status not null default 'open',
  submitted_by_role public.app_role not null,
  submitted_by_reference text not null,
  involved_party_type text not null,
  involved_party_reference text not null,
  appointment_reference text,
  location_reference text,
  summary text not null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dispute_events (
  id text primary key,
  dispute_reference text not null references public.disputes(id) on delete cascade,
  actor_role public.app_role not null,
  actor_reference text not null,
  action_label text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.risk_flags (
  id text primary key,
  entity_type text not null,
  entity_reference text not null,
  signal_type text not null,
  severity public.risk_severity not null default 'low',
  score numeric(8,2) not null default 0,
  public_impact boolean not null default false,
  is_open boolean not null default true,
  notes text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.moderation_actions (
  id text primary key,
  target_type text not null,
  target_reference text not null,
  action_label text not null,
  actor_role text not null,
  actor_reference text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reliability_scores (
  barber_reference text primary key,
  completion_rate numeric(8,2) not null default 0,
  on_time_rate numeric(8,2) not null default 0,
  rebooking_rate numeric(8,2) not null default 0,
  review_integrity_score numeric(8,2) not null default 0,
  overall_trust_score numeric(8,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.barber_rankings
  add column if not exists trust_score numeric(8,2) not null default 0,
  add column if not exists reliability_score numeric(8,2) not null default 0,
  add column if not exists integrity_score numeric(8,2) not null default 0,
  add column if not exists moderation_penalty_score numeric(8,2) not null default 0;

create index if not exists barber_verifications_barber_idx on public.barber_verifications (barber_reference, verification_status, updated_at desc);
create index if not exists shop_verifications_shop_idx on public.shop_verifications (shop_reference, verification_status, updated_at desc);
create index if not exists trust_badges_scope_idx on public.trust_badges (scope_type, scope_reference, public_visible);
create index if not exists review_moderation_barber_idx on public.review_moderation (barber_reference, moderation_status, updated_at desc);
create index if not exists safety_reports_scope_idx on public.safety_reports (subject_type, subject_reference, status, created_at desc);
create index if not exists report_events_report_idx on public.report_events (report_reference, created_at desc);
create index if not exists disputes_scope_idx on public.disputes (involved_party_type, involved_party_reference, dispute_status, created_at desc);
create index if not exists dispute_events_dispute_idx on public.dispute_events (dispute_reference, created_at desc);
create index if not exists risk_flags_entity_idx on public.risk_flags (entity_type, entity_reference, is_open, severity);
create index if not exists moderation_actions_target_idx on public.moderation_actions (target_type, target_reference, created_at desc);
create index if not exists reliability_scores_rank_idx on public.reliability_scores (overall_trust_score desc, completion_rate desc);

alter table public.barber_verifications enable row level security;
alter table public.shop_verifications enable row level security;
alter table public.verification_documents enable row level security;
alter table public.trust_badges enable row level security;
alter table public.review_moderation enable row level security;
alter table public.safety_reports enable row level security;
alter table public.report_events enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_events enable row level security;
alter table public.risk_flags enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.reliability_scores enable row level security;

drop policy if exists "barber verifications self or owner" on public.barber_verifications;
drop policy if exists "shop verifications owner only" on public.shop_verifications;
drop policy if exists "verification documents self or owner" on public.verification_documents;
drop policy if exists "trust badges public read" on public.trust_badges;
drop policy if exists "trust badges owner mutate" on public.trust_badges;
drop policy if exists "review moderation owner or barber" on public.review_moderation;
drop policy if exists "safety reports reporter or owner" on public.safety_reports;
drop policy if exists "report events reporter or owner" on public.report_events;
drop policy if exists "disputes scoped read" on public.disputes;
drop policy if exists "disputes scoped mutate" on public.disputes;
drop policy if exists "dispute events scoped read" on public.dispute_events;
drop policy if exists "risk flags owner only" on public.risk_flags;
drop policy if exists "moderation actions owner only" on public.moderation_actions;
drop policy if exists "reliability scores public read" on public.reliability_scores;
drop policy if exists "reliability scores owner mutate" on public.reliability_scores;

create policy "barber verifications self or owner" on public.barber_verifications
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or exists (
      select 1 from public.barber_profiles bp
      where bp.barber_reference = barber_verifications.barber_reference
        and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or exists (
      select 1 from public.barber_profiles bp
      where bp.barber_reference = barber_verifications.barber_reference
        and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "shop verifications owner only" on public.shop_verifications
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "verification documents self or owner" on public.verification_documents
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or (
      verification_documents.owner_type = 'barber'
      and exists (
        select 1 from public.barber_profiles bp
        where bp.barber_reference = verification_documents.owner_reference
          and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
      )
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or (
      verification_documents.owner_type = 'barber'
      and exists (
        select 1 from public.barber_profiles bp
        where bp.barber_reference = verification_documents.owner_reference
          and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
      )
    )
  );

create policy "trust badges public read" on public.trust_badges
  for select using (public_visible = true);

create policy "trust badges owner mutate" on public.trust_badges
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "review moderation owner or barber" on public.review_moderation
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or exists (
      select 1 from public.barber_profiles bp
      where bp.barber_reference = review_moderation.barber_reference
        and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "safety reports reporter or owner" on public.safety_reports
  for all using (
    reporter_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  ) with check (
    reporter_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "report events reporter or owner" on public.report_events
  for select using (
    exists (
      select 1 from public.safety_reports sr
      where sr.id = report_events.report_reference
        and sr.reporter_email = coalesce(auth.jwt() ->> 'email', '')
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "disputes scoped read" on public.disputes
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or submitted_by_reference = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.barber_profiles bp
      where bp.barber_reference = disputes.involved_party_reference
        and bp.barber_email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "disputes scoped mutate" on public.disputes
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or submitted_by_reference = coalesce(auth.jwt() ->> 'email', '')
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
    or submitted_by_reference = coalesce(auth.jwt() ->> 'email', '')
  );

create policy "dispute events scoped read" on public.dispute_events
  for select using (
    exists (
      select 1 from public.disputes d
      where d.id = dispute_events.dispute_reference
        and d.submitted_by_reference = coalesce(auth.jwt() ->> 'email', '')
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "risk flags owner only" on public.risk_flags
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "moderation actions owner only" on public.moderation_actions
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "reliability scores public read" on public.reliability_scores
  for select using (true);

create policy "reliability scores owner mutate" on public.reliability_scores
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

comment on table public.barber_verifications is 'Private barber identity, license, payout, and shop-affiliation verification records.';
comment on table public.shop_verifications is 'Private shop and ownership verification records used to issue public-safe verified shop outcomes.';
comment on table public.verification_documents is 'Secure verification document references for barber and shop trust review.';
comment on table public.trust_badges is 'Public-safe trust outcomes rendered on barber profiles and discovery surfaces.';
comment on table public.review_moderation is 'Review integrity and moderation state tied to completed bookings and fraud-review workflows.';
comment on table public.safety_reports is 'Trust and safety intake for marketplace abuse, unsafe conduct, and fraud concerns.';
comment on table public.disputes is 'Refund, payment, no-show, and service-quality dispute intake records.';
comment on table public.risk_flags is 'Modular fraud and safety risk signals used by trust review and ranking safeguards.';
comment on table public.reliability_scores is 'Public-safe reliability and trust score aggregates for discovery ranking and profile proof.';
comment on column public.barber_rankings.trust_score is 'Persisted trust input available for explainable marketplace ranking.';
comment on column public.barber_rankings.moderation_penalty_score is 'Visible moderation or trust penalty input reserved for explainable ranking adjustments.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trust_badges'
  ) then
    execute 'alter publication supabase_realtime add table public.trust_badges';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'safety_reports'
  ) then
    execute 'alter publication supabase_realtime add table public.safety_reports';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'disputes'
  ) then
    execute 'alter publication supabase_realtime add table public.disputes';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'risk_flags'
  ) then
    execute 'alter publication supabase_realtime add table public.risk_flags';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reliability_scores'
  ) then
    execute 'alter publication supabase_realtime add table public.reliability_scores';
  end if;
end $$;
