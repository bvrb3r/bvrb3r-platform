create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_message_thread_participant(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.thread_participants self
    where self.thread_id = p_thread_id
      and self.profile_id = auth.uid()
  );
$$;

revoke all on function private.is_message_thread_participant(uuid) from public;
grant execute on function private.is_message_thread_participant(uuid) to authenticated;

alter table public.message_threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;

drop policy if exists "message threads participant select" on public.message_threads;
drop policy if exists "thread participants participant select" on public.thread_participants;
drop policy if exists "messages participant select" on public.messages;
drop policy if exists "messages participant insert" on public.messages;

create policy "message threads participant select" on public.message_threads
  for select to authenticated
  using (
    private.is_message_thread_participant(public.message_threads.id)
  );

create policy "thread participants participant select" on public.thread_participants
  for select to authenticated
  using (
    private.is_message_thread_participant(public.thread_participants.thread_id)
  );

create policy "messages participant select" on public.messages
  for select to authenticated
  using (
    private.is_message_thread_participant(public.messages.thread_id)
  );

create policy "messages participant insert" on public.messages
  for insert to authenticated
  with check (
    message_type = 'text'
    and sender_profile_id = auth.uid()
    and private.is_message_thread_participant(public.messages.thread_id)
  );

comment on function private.is_message_thread_participant(uuid) is
  'Returns true when auth.uid() is a participant in the given message thread. Used by messaging RLS policies to avoid recursive self-policy checks.';

notify pgrst, 'reload schema';
