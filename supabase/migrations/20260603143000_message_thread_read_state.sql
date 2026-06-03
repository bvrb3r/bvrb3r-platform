alter table public.thread_participants
add column if not exists last_read_at timestamptz;

create index if not exists thread_participants_profile_thread_read_idx
on public.thread_participants (profile_id, thread_id, last_read_at);

comment on column public.thread_participants.last_read_at is
'Timestamp when this participant last opened/read the message thread. Used for per-user unread state.';

notify pgrst, 'reload schema';
