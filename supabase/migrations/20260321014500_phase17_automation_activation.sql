create table if not exists public.automation_trigger_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_reference text not null unique,
  client_email text not null,
  location_reference text,
  barber_reference text,
  recommended_promotion_id uuid references public.promotions(id) on delete set null,
  rebooking_window text not null default 'building' check (rebooking_window in ('building', 'on_track', 'due_soon', 'due_now', 'overdue', 'scheduled')),
  churn_risk text not null default 'low' check (churn_risk in ('low', 'medium', 'high')),
  churn_score integer not null default 0 check (churn_score between 0 and 100),
  reengagement_eligible boolean not null default false,
  loyalty_segment text not null default 'new' check (loyalty_segment in ('new', 'repeat', 'loyal', 'vip', 'at_risk')),
  active_appointment_count integer not null default 0 check (active_appointment_count >= 0),
  next_due_at timestamptz,
  rebooking_reminder_eligible boolean not null default false,
  reengagement_nudge_eligible boolean not null default false,
  promotion_follow_up_eligible boolean not null default false,
  reward_follow_up_eligible boolean not null default false,
  next_automation_due_at timestamptz,
  automation_reasons jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists automation_trigger_snapshots_location_idx
  on public.automation_trigger_snapshots (location_reference, updated_at desc);

create index if not exists automation_trigger_snapshots_due_idx
  on public.automation_trigger_snapshots (next_automation_due_at asc, reengagement_nudge_eligible, rebooking_reminder_eligible);

create index if not exists automation_trigger_snapshots_risk_idx
  on public.automation_trigger_snapshots (churn_risk, loyalty_segment, updated_at desc);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_type text not null check (automation_type in ('rebooking_reminder', 'reengagement_nudge', 'promotion_follow_up', 'reward_follow_up')),
  status text not null default 'pending' check (status in ('pending', 'queued', 'completed', 'failed', 'cancelled')),
  client_reference text not null,
  client_email text not null,
  location_reference text,
  barber_reference text,
  promotion_id uuid references public.promotions(id) on delete set null,
  title text not null,
  body text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'sms', 'email', 'push')),
  due_at timestamptz not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  notification_reference text,
  blocked_reason text,
  error_message text,
  queued_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists automation_runs_status_due_idx
  on public.automation_runs (status, due_at asc);

create index if not exists automation_runs_client_idx
  on public.automation_runs (client_reference, status, due_at desc);

create index if not exists automation_runs_location_idx
  on public.automation_runs (location_reference, status, due_at desc);

create index if not exists automation_runs_type_status_idx
  on public.automation_runs (automation_type, status, updated_at desc);

alter table public.automation_trigger_snapshots enable row level security;
alter table public.automation_runs enable row level security;

drop policy if exists "automation trigger snapshots scoped read" on public.automation_trigger_snapshots;
drop policy if exists "automation runs scoped read" on public.automation_runs;

create policy "automation trigger snapshots scoped read" on public.automation_trigger_snapshots
  for select using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
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
        and l.reference_code = automation_trigger_snapshots.location_reference
    )
  );

create policy "automation runs scoped read" on public.automation_runs
  for select using (
    client_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
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
        and l.reference_code = automation_runs.location_reference
    )
  );

comment on table public.automation_trigger_snapshots is 'Deterministic automation eligibility state derived from client intelligence, loyalty, and promotion readiness.';
comment on table public.automation_runs is 'Queued and executed automation work items for rebooking, re-engagement, and reward or promotion follow-up.';
