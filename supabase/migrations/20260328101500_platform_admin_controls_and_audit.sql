create table if not exists public.platform_admin_controls (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  control_key text not null,
  control_value jsonb not null default '{}'::jsonb,
  updated_by_user_id text,
  updated_by_role text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists platform_admin_controls_target_key_idx
  on public.platform_admin_controls (target_type, target_id, control_key);

create index if not exists platform_admin_controls_updated_at_idx
  on public.platform_admin_controls (updated_at desc);

create table if not exists public.platform_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null,
  actor_role text not null,
  action_class text not null,
  action_type text not null,
  target_type text not null,
  target_id text not null,
  note text,
  before_summary text,
  after_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists platform_admin_audit_logs_created_at_idx
  on public.platform_admin_audit_logs (created_at desc);

create index if not exists platform_admin_audit_logs_target_idx
  on public.platform_admin_audit_logs (target_type, target_id, created_at desc);

create index if not exists platform_admin_audit_logs_actor_idx
  on public.platform_admin_audit_logs (actor_user_id, created_at desc);
