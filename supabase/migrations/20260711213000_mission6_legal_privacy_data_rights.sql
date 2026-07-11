begin;

create table if not exists public.data_rights_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('export', 'deletion', 'correction', 'restriction', 'objection')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'blocked', 'completed', 'denied', 'canceled')),
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  blocked_reason text,
  request_metadata jsonb not null default '{}'::jsonb,
  resolution_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_rights_requests_profile_requested_idx
  on public.data_rights_requests(profile_id, requested_at desc);

create unique index if not exists data_rights_requests_open_deletion_idx
  on public.data_rights_requests(profile_id, request_type)
  where request_type = 'deletion' and status in ('pending', 'processing', 'blocked');

alter table public.data_rights_requests enable row level security;

revoke all on public.data_rights_requests from anon;
revoke all on public.data_rights_requests from authenticated;
grant select, insert on public.data_rights_requests to authenticated;

create policy "data rights requests are private to the authenticated profile"
  on public.data_rights_requests
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "authenticated users can create their own data rights request"
  on public.data_rights_requests
  for insert
  to authenticated
  with check (profile_id = auth.uid() and status = 'pending');

comment on table public.data_rights_requests is
  'Auditable access, export, deletion, correction, restriction, and objection requests. Deletion is a controlled workflow, not an immediate destructive client action.';

commit;
