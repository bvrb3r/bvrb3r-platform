alter table public.cashout_requests
  drop constraint if exists cashout_requests_status_check;

alter table public.cashout_requests
  add constraint cashout_requests_status_check
  check (status in ('requested', 'under_review', 'approved', 'paid', 'failed', 'rejected', 'reversed'));

create table if not exists public.scheduled_job_runs (
  id text primary key,
  job_name text not null check (
    job_name in (
      'process_payout_eligibility',
      'unlock_pending_points',
      'expire_points',
      'process_cashout_queue',
      'detect_financial_anomalies',
      'process_growth_automations',
      'refresh_financial_reporting'
    )
  ),
  scope_key text not null default 'global',
  related_location_ids text[] not null default '{}'::text[],
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'skipped')),
  trigger_source text not null check (trigger_source in ('manual', 'scheduled', 'background')),
  actor_user_id text null,
  actor_role text null,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  failed_at timestamptz null,
  retry_count integer not null default 0 check (retry_count >= 0),
  last_error text null,
  result_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scheduled_job_runs_job_status_started_idx
  on public.scheduled_job_runs (job_name, status, started_at desc);

create index if not exists scheduled_job_runs_scope_started_idx
  on public.scheduled_job_runs (scope_key, started_at desc);

create index if not exists scheduled_job_runs_locations_gin_idx
  on public.scheduled_job_runs using gin (related_location_ids);

create table if not exists public.financial_anomalies (
  id text primary key,
  dedupe_key text not null unique,
  anomaly_type text not null check (
    anomaly_type in (
      'payout_stuck',
      'cashout_stale',
      'payout_failure',
      'cashout_failure',
      'refund_hold_gap',
      'negative_earnings',
      'breakdown_mismatch',
      'points_liability_spike'
    )
  ),
  status text not null check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  summary text not null,
  description text null,
  location_reference text null,
  barber_reference text null,
  user_reference text null,
  appointment_reference text null,
  payment_reference text null,
  cashout_request_id text null,
  actor_user_id text null,
  actor_role text null,
  detected_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null,
  dismissed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists financial_anomalies_status_detected_idx
  on public.financial_anomalies (status, detected_at desc);

create index if not exists financial_anomalies_type_status_idx
  on public.financial_anomalies (anomaly_type, status, detected_at desc);

create index if not exists financial_anomalies_location_status_idx
  on public.financial_anomalies (location_reference, status, detected_at desc)
  where location_reference is not null;

create index if not exists financial_anomalies_cashout_idx
  on public.financial_anomalies (cashout_request_id, status)
  where cashout_request_id is not null;

alter table public.scheduled_job_runs enable row level security;
alter table public.financial_anomalies enable row level security;

drop policy if exists "scheduled job runs owner manager read" on public.scheduled_job_runs;
create policy "scheduled job runs owner manager read"
  on public.scheduled_job_runs
  for select
  using (
    exists (
      select 1
      from public.profiles owner_profile
      where owner_profile.id = auth.uid()
        and owner_profile.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles manager_profile
      join public.staff_locations staff_scope
        on staff_scope.profile_id = manager_profile.id
      where manager_profile.id = auth.uid()
        and manager_profile.role = 'manager'
        and (
          coalesce(array_length(related_location_ids, 1), 0) = 0
          or staff_scope.location_id::text = any(related_location_ids)
        )
    )
  );

drop policy if exists "financial anomalies owner manager read" on public.financial_anomalies;
create policy "financial anomalies owner manager read"
  on public.financial_anomalies
  for select
  using (
    exists (
      select 1
      from public.profiles owner_profile
      where owner_profile.id = auth.uid()
        and owner_profile.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles manager_profile
      join public.staff_locations staff_scope
        on staff_scope.profile_id = manager_profile.id
      where manager_profile.id = auth.uid()
        and manager_profile.role = 'manager'
        and (
          location_reference is null
          or staff_scope.location_id::text = location_reference
        )
    )
  );
