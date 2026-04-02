alter table public.automation_runs
  drop constraint if exists automation_runs_status_check;

alter table public.automation_runs
  add column if not exists max_attempts integer not null default 3 check (max_attempts >= 1),
  add column if not exists retry_eligible boolean not null default false,
  add column if not exists terminal_failure boolean not null default false,
  add column if not exists next_retry_at timestamptz,
  add column if not exists retry_scheduled_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists last_failure_kind text check (last_failure_kind in ('transient', 'terminal', 'blocked')),
  add column if not exists last_trigger_source text check (last_trigger_source in ('manual', 'background', 'refresh')),
  add column if not exists last_delivery_status text check (last_delivery_status in ('queued', 'retrying', 'delivered', 'placeholder', 'failed')),
  add column if not exists last_delivery_provider text,
  add column if not exists last_delivery_attempt_reference text,
  add column if not exists notification_references jsonb not null default '[]'::jsonb,
  add column if not exists diagnostics jsonb not null default '{}'::jsonb,
  add column if not exists last_event_at timestamptz;

alter table public.automation_runs
  add constraint automation_runs_status_check check (status in ('pending', 'queued', 'processing', 'retry_scheduled', 'completed', 'failed', 'cancelled', 'blocked'));

create index if not exists automation_runs_retry_due_idx
  on public.automation_runs (status, next_retry_at asc);

create index if not exists automation_runs_processing_idx
  on public.automation_runs (status, processing_started_at desc);

create index if not exists automation_runs_location_status_retry_idx
  on public.automation_runs (location_reference, status, next_retry_at asc);

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  run_reference uuid references public.automation_runs(id) on delete set null,
  client_reference text not null,
  client_email text,
  location_reference text,
  barber_reference text,
  automation_type text not null check (automation_type in ('rebooking_reminder', 'reengagement_nudge', 'promotion_follow_up', 'reward_follow_up')),
  event_type text not null check (event_type in ('snapshot_refreshed', 'run_queued', 'run_started', 'run_completed', 'run_failed', 'run_cancelled', 'retry_scheduled', 'delivery_succeeded', 'delivery_failed')),
  run_status text not null check (run_status in ('pending', 'queued', 'processing', 'retry_scheduled', 'completed', 'failed', 'cancelled', 'blocked')),
  attempt_number integer not null default 0 check (attempt_number >= 0),
  channel text check (channel in ('in_app', 'sms', 'email', 'push')),
  trigger_source text not null default 'refresh' check (trigger_source in ('manual', 'background', 'refresh')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  dedupe_key text not null unique
);

create index if not exists automation_events_run_idx
  on public.automation_events (run_reference, created_at desc);

create index if not exists automation_events_location_idx
  on public.automation_events (location_reference, created_at desc);

create index if not exists automation_events_type_idx
  on public.automation_events (event_type, created_at desc);

create table if not exists public.automation_reporting_snapshots (
  id uuid primary key default gen_random_uuid(),
  location_reference text not null unique,
  eligible_clients integer not null default 0 check (eligible_clients >= 0),
  due_now_runs integer not null default 0 check (due_now_runs >= 0),
  pending_runs integer not null default 0 check (pending_runs >= 0),
  queued_runs integer not null default 0 check (queued_runs >= 0),
  processing_runs integer not null default 0 check (processing_runs >= 0),
  retry_scheduled_runs integer not null default 0 check (retry_scheduled_runs >= 0),
  retry_due_runs integer not null default 0 check (retry_due_runs >= 0),
  completed_runs integer not null default 0 check (completed_runs >= 0),
  failed_runs integer not null default 0 check (failed_runs >= 0),
  blocked_runs integer not null default 0 check (blocked_runs >= 0),
  cancelled_runs integer not null default 0 check (cancelled_runs >= 0),
  backlog_runs integer not null default 0 check (backlog_runs >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  completion_rate integer not null default 0 check (completion_rate between 0 and 100),
  failure_rate integer not null default 0 check (failure_rate between 0 and 100),
  channel_breakdown jsonb not null default '[]'::jsonb,
  recent_activity jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists automation_reporting_snapshots_updated_idx
  on public.automation_reporting_snapshots (updated_at desc);

create index if not exists automation_reporting_snapshots_location_idx
  on public.automation_reporting_snapshots (location_reference, due_now_runs desc, retry_due_runs desc);

alter table public.automation_events enable row level security;
alter table public.automation_reporting_snapshots enable row level security;

drop policy if exists "automation events scoped read" on public.automation_events;
drop policy if exists "automation reporting snapshots scoped read" on public.automation_reporting_snapshots;

create policy "automation events scoped read" on public.automation_events
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations sl on sl.profile_id = p.id
      join public.locations l on l.id = sl.location_id
      where p.id = auth.uid()
        and p.role = 'manager'
        and l.reference_code = automation_events.location_reference
    )
  );

create policy "automation reporting snapshots scoped read" on public.automation_reporting_snapshots
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations sl on sl.profile_id = p.id
      join public.locations l on l.id = sl.location_id
      where p.id = auth.uid()
        and p.role = 'manager'
        and l.reference_code = automation_reporting_snapshots.location_reference
    )
  );

comment on table public.automation_events is 'Auditable automation lifecycle and delivery telemetry for background-safe execution, retries, and diagnostics.';
comment on table public.automation_reporting_snapshots is 'Operational automation aggregates by location for backlog, throughput, retry, and channel-performance visibility.';
