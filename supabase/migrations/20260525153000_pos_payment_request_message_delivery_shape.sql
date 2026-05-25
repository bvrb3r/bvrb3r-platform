alter table if exists public.messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.messages
  drop constraint if exists messages_message_type_check;

alter table if exists public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'system'));

alter table if exists public.messages
  drop constraint if exists messages_body_check;

alter table if exists public.messages
  add constraint messages_body_check
  check (char_length(trim(body)) > 0);

create index if not exists messages_metadata_kind_idx
  on public.messages ((metadata->>'kind'))
  where metadata ? 'kind';

create index if not exists messages_pos_payment_request_idx
  on public.messages ((metadata->>'paymentRequestId'))
  where metadata->>'kind' = 'pos_payment_request';

notify pgrst, 'reload schema';
