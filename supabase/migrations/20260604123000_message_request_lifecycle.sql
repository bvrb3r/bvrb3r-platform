create table if not exists public.message_thread_requests (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  requested_by_profile_id uuid not null references public.profiles(id),
  requested_to_profile_id uuid not null references public.profiles(id),
  request_status text not null default 'pending'
    check (request_status in ('pending', 'accepted', 'declined', 'blocked', 'reported')),
  first_message_id uuid null references public.messages(id),
  accepted_at timestamptz null,
  accepted_by_profile_id uuid null references public.profiles(id),
  declined_at timestamptz null,
  declined_by_profile_id uuid null references public.profiles(id),
  blocked_at timestamptz null,
  blocked_by_profile_id uuid null references public.profiles(id),
  reported_at timestamptz null,
  reported_by_profile_id uuid null references public.profiles(id),
  report_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists message_thread_requests_thread_idx
  on public.message_thread_requests(thread_id);

create index if not exists message_thread_requests_requested_to_status_idx
  on public.message_thread_requests(requested_to_profile_id, request_status, created_at desc);

create table if not exists public.message_user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_profile_id uuid not null references public.profiles(id),
  blocked_profile_id uuid not null references public.profiles(id),
  thread_id uuid null references public.message_threads(id),
  reason text null,
  created_at timestamptz not null default now(),
  unique(blocker_profile_id, blocked_profile_id)
);

create index if not exists message_user_blocks_blocked_idx
  on public.message_user_blocks(blocked_profile_id, blocker_profile_id);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.message_threads(id),
  message_id uuid null references public.messages(id),
  reported_by_profile_id uuid references public.profiles(id),
  reported_profile_id uuid references public.profiles(id),
  reason text not null,
  details text null,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists message_reports_thread_idx
  on public.message_reports(thread_id, created_at desc);

alter table public.message_thread_requests enable row level security;
alter table public.message_user_blocks enable row level security;
alter table public.message_reports enable row level security;

drop policy if exists "message_thread_requests_participant_select" on public.message_thread_requests;
create policy "message_thread_requests_participant_select"
  on public.message_thread_requests
  for select
  using (
    requested_by_profile_id = auth.uid()
    or requested_to_profile_id = auth.uid()
    or exists (
      select 1
      from public.thread_participants tp
      where tp.thread_id = message_thread_requests.thread_id
        and tp.profile_id = auth.uid()
    )
  );

drop policy if exists "message_user_blocks_self_select" on public.message_user_blocks;
create policy "message_user_blocks_self_select"
  on public.message_user_blocks
  for select
  using (
    blocker_profile_id = auth.uid()
    or blocked_profile_id = auth.uid()
  );

drop policy if exists "message_user_blocks_self_insert" on public.message_user_blocks;
create policy "message_user_blocks_self_insert"
  on public.message_user_blocks
  for insert
  with check (blocker_profile_id = auth.uid());

drop policy if exists "message_reports_self_select" on public.message_reports;
create policy "message_reports_self_select"
  on public.message_reports
  for select
  using (reported_by_profile_id = auth.uid());

drop policy if exists "message_reports_self_insert" on public.message_reports;
create policy "message_reports_self_insert"
  on public.message_reports
  for insert
  with check (reported_by_profile_id = auth.uid());

comment on table public.message_thread_requests is
  'Lifecycle records for first-time public username message requests.';

comment on table public.message_user_blocks is
  'Per-profile message blocks that prevent future direct messaging.';

comment on table public.message_reports is
  'User-submitted message and thread reports for moderation review.';

notify pgrst, 'reload schema';
