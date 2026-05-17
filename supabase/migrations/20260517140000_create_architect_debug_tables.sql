create table if not exists public.architect_debug_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_email text,
  debug_type text not null,
  target_type text not null,
  target_id text not null,
  health text not null,
  diagnosis_code text,
  headline text,
  recommended_action text,
  repair_available boolean not null default false,
  packet jsonb not null default '{}'::jsonb,
  codex_prompt text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  locked_at timestamptz,
  constraint architect_debug_sessions_health_ck check (health in ('healthy', 'warning', 'broken', 'critical')),
  constraint architect_debug_sessions_status_ck check (status in (
    'open',
    'investigating',
    'diagnosed',
    'safe_repair_available',
    'repair_running',
    'repair_succeeded',
    'repair_failed',
    'codex_required',
    'codex_prompt_generated',
    'code_pushed',
    'deployed',
    'production_retest_needed',
    'verified',
    'locked',
    'archived'
  ))
);

create index if not exists architect_debug_sessions_target_idx
  on public.architect_debug_sessions (target_type, target_id, created_at desc);

create index if not exists architect_debug_sessions_actor_idx
  on public.architect_debug_sessions (actor_profile_id, created_at desc);

create index if not exists architect_debug_sessions_status_idx
  on public.architect_debug_sessions (status, created_at desc);

create table if not exists public.architect_repair_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_email text,
  repair_type text not null,
  target_type text not null,
  target_id text not null,
  safety_class text not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  payload jsonb,
  result text not null,
  error_code text,
  error_message_safe text,
  postgres_code text,
  postgres_details text,
  created_at timestamptz not null default now(),
  constraint architect_repair_audit_safety_ck check (safety_class in ('safe', 'guarded', 'danger')),
  constraint architect_repair_audit_result_ck check (result in ('previewed', 'succeeded', 'failed', 'skipped'))
);

create index if not exists architect_repair_audit_target_idx
  on public.architect_repair_audit_logs (target_type, target_id, created_at desc);

create index if not exists architect_repair_audit_actor_idx
  on public.architect_repair_audit_logs (actor_profile_id, created_at desc);

create table if not exists public.architect_validation_runs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  validation_type text not null,
  target_type text,
  target_id text,
  expected_state jsonb,
  actual_state jsonb,
  passed boolean not null default false,
  failed_checks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists architect_validation_runs_target_idx
  on public.architect_validation_runs (target_type, target_id, created_at desc);

create table if not exists public.architect_debug_notes (
  id uuid primary key default gen_random_uuid(),
  debug_session_id uuid references public.architect_debug_sessions(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists architect_debug_notes_session_idx
  on public.architect_debug_notes (debug_session_id, created_at desc);

alter table public.architect_debug_sessions enable row level security;
alter table public.architect_repair_audit_logs enable row level security;
alter table public.architect_validation_runs enable row level security;
alter table public.architect_debug_notes enable row level security;

drop policy if exists "architect debug sessions admin access" on public.architect_debug_sessions;
drop policy if exists "architect repair audit admin access" on public.architect_repair_audit_logs;
drop policy if exists "architect validation runs admin access" on public.architect_validation_runs;
drop policy if exists "architect debug notes admin access" on public.architect_debug_notes;

create policy "architect debug sessions admin access" on public.architect_debug_sessions
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('platform_admin', 'architect') or p.primary_onboarding_role = 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('platform_admin', 'architect') or p.primary_onboarding_role = 'platform_admin')
    )
  );

create policy "architect repair audit admin access" on public.architect_repair_audit_logs
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('platform_admin', 'architect') or p.primary_onboarding_role = 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('platform_admin', 'architect') or p.primary_onboarding_role = 'platform_admin')
    )
  );

create policy "architect validation runs admin access" on public.architect_validation_runs
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('platform_admin', 'architect') or p.primary_onboarding_role = 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('platform_admin', 'architect') or p.primary_onboarding_role = 'platform_admin')
    )
  );

create policy "architect debug notes admin access" on public.architect_debug_notes
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('platform_admin', 'architect') or p.primary_onboarding_role = 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('platform_admin', 'architect') or p.primary_onboarding_role = 'platform_admin')
    )
  );
