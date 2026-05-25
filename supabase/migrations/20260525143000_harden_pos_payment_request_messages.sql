alter table if exists public.messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists messages_metadata_kind_idx
  on public.messages ((metadata->>'kind'))
  where metadata ? 'kind';

create index if not exists messages_pos_payment_request_idx
  on public.messages ((metadata->>'paymentRequestId'))
  where metadata->>'kind' = 'pos_payment_request';

alter table if exists public.pos_payment_requests
  drop constraint if exists pos_payment_requests_status_ck;

alter table if exists public.pos_payment_requests
  add constraint pos_payment_requests_status_ck
  check (status in ('pending', 'pending_message_failed', 'approved', 'paid', 'declined', 'failed', 'expired'));

notify pgrst, 'reload schema';
