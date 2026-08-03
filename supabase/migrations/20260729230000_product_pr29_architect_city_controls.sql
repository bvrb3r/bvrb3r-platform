-- Product PR29 — Architect City Map control spine.
-- Control writes are service-role only. The application route separately
-- requires Architect authority, verified provider connections, an exact
-- confirmation phrase, and an optimistic version.

create table if not exists public.architect_system_controls (
  control_key text primary key,
  label text not null,
  active boolean not null default false,
  reason text,
  version bigint not null default 1 check (version > 0),
  changed_by text,
  changed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint architect_system_controls_key_ck check (
    control_key in ('maintenance', 'bookings', 'kiosks', 'payouts', 'hive_ai')
  )
);

insert into public.architect_system_controls (control_key, label)
values
  ('maintenance', 'Maintenance mode'),
  ('bookings', 'Pause new bookings'),
  ('kiosks', 'Disable all kiosks'),
  ('payouts', 'Freeze payouts'),
  ('hive_ai', 'Pause Hive AI')
on conflict (control_key) do update
set label = excluded.label;

create table if not exists public.architect_control_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null,
  action_type text not null,
  target_type text not null,
  target_key text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  reason text not null,
  request_id text not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  constraint architect_control_audit_action_ck check (
    action_type in ('system_control_changed', 'feature_flag_changed')
  )
);

create unique index if not exists architect_control_audit_request_uidx
  on public.architect_control_audit (request_id);

create index if not exists architect_control_audit_target_idx
  on public.architect_control_audit (target_type, target_key, occurred_at desc);

create index if not exists architect_control_audit_actor_idx
  on public.architect_control_audit (actor_user_id, occurred_at desc);

create or replace function private.pr29_reject_architect_control_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'Architect control audit rows are append-only.';
end;
$$;

revoke all on function private.pr29_reject_architect_control_audit_mutation() from public, anon, authenticated, service_role;

drop trigger if exists pr29_architect_control_audit_append_only on public.architect_control_audit;
create trigger pr29_architect_control_audit_append_only
  before update or delete on public.architect_control_audit
  for each row execute function private.pr29_reject_architect_control_audit_mutation();

alter table public.architect_system_controls enable row level security;
alter table public.architect_system_controls force row level security;
alter table public.architect_control_audit enable row level security;
alter table public.architect_control_audit force row level security;

revoke all on public.architect_system_controls from public, anon, authenticated;
revoke all on public.architect_control_audit from public, anon, authenticated;

grant select, insert, update on public.architect_system_controls to service_role;
grant select, insert on public.architect_control_audit to service_role;

drop policy if exists "pr29 service owns architect controls" on public.architect_system_controls;
create policy "pr29 service owns architect controls"
  on public.architect_system_controls
  for all
  to service_role
  using (true)
  with check (true);
drop policy if exists "pr29 service reads architect control audit" on public.architect_control_audit;
create policy "pr29 service reads architect control audit"
  on public.architect_control_audit
  for select
  to service_role
  using (true);

drop policy if exists "pr29 service appends architect control audit" on public.architect_control_audit;
create policy "pr29 service appends architect control audit"
  on public.architect_control_audit
  for insert
  to service_role
  with check (true);
