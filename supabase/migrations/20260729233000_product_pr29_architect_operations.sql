-- Product PR29 — durable Architect operations, health, and reporting truth.
-- These tables are deny-by-default and service-role owned. The application
-- separately requires Architect authority and verified provider connections.

create table if not exists public.architect_operation_commands (
  id uuid primary key default gen_random_uuid(),
  command_type text not null,
  target_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  actor_user_id text not null,
  reason text not null,
  idempotency_key text not null unique,
  requested_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  constraint architect_operation_commands_type_ck check (
    command_type in (
      'job_run',
      'webhook_replay',
      'broadcast',
      'device_restart',
      'sessions_revoke',
      'account_lock',
      'maintenance_schedule',
      'maintenance_cancel',
      'backup',
      'restore_drill',
      'cdn_purge',
      'rate_limit',
      'vercel_rollback'
    )
  ),
  constraint architect_operation_commands_status_ck check (
    status in ('queued', 'running', 'succeeded', 'failed', 'canceled')
  ),
  constraint architect_operation_commands_reason_ck check (length(btrim(reason)) >= 8)
);

create index if not exists architect_operation_commands_status_idx
  on public.architect_operation_commands (status, requested_at desc);
create index if not exists architect_operation_commands_target_idx
  on public.architect_operation_commands (command_type, target_key, requested_at desc);
create index if not exists architect_operation_commands_actor_idx
  on public.architect_operation_commands (actor_user_id, requested_at desc);

create table if not exists public.architect_uptime_checks (
  id uuid primary key default gen_random_uuid(),
  service_key text not null,
  status text not null,
  incident_reference text,
  response_ms integer,
  evidence jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default timezone('utc', now()),
  constraint architect_uptime_checks_status_ck check (
    status in ('operational', 'degraded', 'outage')
  ),
  constraint architect_uptime_checks_response_ck check (
    response_ms is null or response_ms >= 0
  )
);

create index if not exists architect_uptime_checks_service_idx
  on public.architect_uptime_checks (service_key, checked_at desc);
create index if not exists architect_uptime_checks_checked_idx
  on public.architect_uptime_checks (checked_at desc);

create table if not exists public.architect_service_metrics (
  id uuid primary key default gen_random_uuid(),
  service_key text not null,
  floor_id text not null,
  request_count bigint not null default 0,
  error_count bigint not null default 0,
  p75_ms integer,
  bucket_started_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  constraint architect_service_metrics_floor_ck check (
    floor_id in ('walk_ins', 'clients', 'barbers', 'shop_owner', 'money', 'hive_ai', 'core')
  ),
  constraint architect_service_metrics_counts_ck check (
    request_count >= 0 and error_count >= 0 and error_count <= request_count
  ),
  constraint architect_service_metrics_p75_ck check (p75_ms is null or p75_ms >= 0),
  unique (service_key, floor_id, bucket_started_at)
);

create index if not exists architect_service_metrics_floor_idx
  on public.architect_service_metrics (floor_id, bucket_started_at desc);
create index if not exists architect_service_metrics_service_idx
  on public.architect_service_metrics (service_key, bucket_started_at desc);

create table if not exists public.architect_report_preferences (
  architect_user_id text primary key,
  report_email text not null,
  auto_weekly boolean not null default false,
  auto_monthly boolean not null default false,
  timezone text not null default 'UTC',
  weekly_schedule text not null default 'MON 08:00',
  monthly_schedule text not null default 'DAY 1 08:00',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.architect_maintenance_windows (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled',
  reason text not null,
  scheduled_by text not null,
  canceled_by text,
  canceled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint architect_maintenance_windows_status_ck check (
    status in ('scheduled', 'active', 'completed', 'canceled')
  ),
  constraint architect_maintenance_windows_time_ck check (ends_at > starts_at),
  constraint architect_maintenance_windows_reason_ck check (length(btrim(reason)) >= 8)
);

create index if not exists architect_maintenance_windows_status_idx
  on public.architect_maintenance_windows (status, starts_at desc);

alter table public.architect_control_audit
  drop constraint if exists architect_control_audit_action_ck;
alter table public.architect_control_audit
  add constraint architect_control_audit_action_ck check (
    action_type in (
      'system_control_changed',
      'feature_flag_changed',
      'operation_queued',
      'operation_started',
      'operation_succeeded',
      'operation_failed',
      'operation_canceled'
    )
  );

alter table public.architect_operation_commands enable row level security;
alter table public.architect_operation_commands force row level security;
alter table public.architect_uptime_checks enable row level security;
alter table public.architect_uptime_checks force row level security;
alter table public.architect_service_metrics enable row level security;
alter table public.architect_service_metrics force row level security;
alter table public.architect_report_preferences enable row level security;
alter table public.architect_report_preferences force row level security;
alter table public.architect_maintenance_windows enable row level security;
alter table public.architect_maintenance_windows force row level security;

revoke all on public.architect_operation_commands from public, anon, authenticated;
revoke all on public.architect_uptime_checks from public, anon, authenticated;
revoke all on public.architect_service_metrics from public, anon, authenticated;
revoke all on public.architect_report_preferences from public, anon, authenticated;
revoke all on public.architect_maintenance_windows from public, anon, authenticated;

grant select, insert, update on public.architect_operation_commands to service_role;
grant select, insert, update on public.architect_uptime_checks to service_role;
grant select, insert, update on public.architect_service_metrics to service_role;
grant select, insert, update on public.architect_report_preferences to service_role;
grant select, insert, update on public.architect_maintenance_windows to service_role;

drop policy if exists "pr29 service owns architect operation commands" on public.architect_operation_commands;
create policy "pr29 service owns architect operation commands"
  on public.architect_operation_commands for all to service_role using (true) with check (true);
drop policy if exists "pr29 service owns architect uptime checks" on public.architect_uptime_checks;
create policy "pr29 service owns architect uptime checks"
  on public.architect_uptime_checks for all to service_role using (true) with check (true);
drop policy if exists "pr29 service owns architect service metrics" on public.architect_service_metrics;
create policy "pr29 service owns architect service metrics"
  on public.architect_service_metrics for all to service_role using (true) with check (true);
drop policy if exists "pr29 service owns architect report preferences" on public.architect_report_preferences;
create policy "pr29 service owns architect report preferences"
  on public.architect_report_preferences for all to service_role using (true) with check (true);
drop policy if exists "pr29 service owns architect maintenance windows" on public.architect_maintenance_windows;
create policy "pr29 service owns architect maintenance windows"
  on public.architect_maintenance_windows for all to service_role using (true) with check (true);

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'architect_system_controls'
    ) then
      alter publication supabase_realtime add table public.architect_system_controls;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'architect_operation_commands'
    ) then
      alter publication supabase_realtime add table public.architect_operation_commands;
    end if;
  end if;
end
$publication$;
