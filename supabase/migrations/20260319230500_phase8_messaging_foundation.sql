create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  thread_type text not null check (thread_type in ('client_barber', 'support', 'shop_team')),
  appointment_id uuid references public.appointments(id) on delete set null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.thread_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  thread_role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (thread_id, profile_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  body text not null,
  message_type text not null check (message_type in ('text', 'system')),
  created_at timestamptz not null default now(),
  check ((message_type = 'system') or sender_profile_id is not null),
  check (char_length(trim(body)) > 0)
);

create index if not exists message_threads_updated_at_idx
  on public.message_threads (updated_at desc);

create unique index if not exists message_threads_appointment_idx
  on public.message_threads (appointment_id)
  where appointment_id is not null and thread_type = 'client_barber';

create index if not exists thread_participants_profile_idx
  on public.thread_participants (profile_id, created_at desc);

create index if not exists thread_participants_thread_idx
  on public.thread_participants (thread_id, profile_id);

create index if not exists messages_thread_created_at_idx
  on public.messages (thread_id, created_at asc);

create index if not exists messages_sender_created_at_idx
  on public.messages (sender_profile_id, created_at desc)
  where sender_profile_id is not null;

alter table public.message_threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;

create policy "message threads participant select" on public.message_threads
  for select using (
    exists (
      select 1
      from public.thread_participants tp
      where tp.thread_id = id
        and tp.profile_id = auth.uid()
    )
  );

create policy "thread participants participant select" on public.thread_participants
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.thread_participants tp
      where tp.thread_id = thread_id
        and tp.profile_id = auth.uid()
    )
  );

create policy "messages participant select" on public.messages
  for select using (
    exists (
      select 1
      from public.thread_participants tp
      where tp.thread_id = thread_id
        and tp.profile_id = auth.uid()
    )
  );

create policy "messages participant insert" on public.messages
  for insert with check (
    message_type = 'text'
    and sender_profile_id = auth.uid()
    and exists (
      select 1
      from public.thread_participants tp
      where tp.thread_id = thread_id
        and tp.profile_id = auth.uid()
    )
  );
