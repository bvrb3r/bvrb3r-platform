alter table if exists public.pos_payment_requests
  drop constraint if exists pos_payment_requests_status_ck;

alter table if exists public.pos_payment_requests
  add constraint pos_payment_requests_status_ck
  check (status in (
    'pending',
    'pending_approval',
    'pending_message_failed',
    'approved',
    'paid',
    'declined',
    'failed',
    'expired',
    'canceled',
    'superseded',
    'canceled_duplicate'
  ));

do $$
begin
  if to_regclass('public.pos_payment_requests') is not null then
    with ranked_active_requests as (
      select
        id,
        row_number() over (
          partition by pos_sale_id
          order by updated_at desc nulls last, created_at desc nulls last, id desc
        ) as active_rank
      from public.pos_payment_requests
      where status in ('pending', 'pending_approval', 'pending_message_failed')
    )
    update public.pos_payment_requests request
    set
      status = 'superseded',
      updated_at = now()
    from ranked_active_requests ranked
    where request.id = ranked.id
      and ranked.active_rank > 1;
  end if;
end $$;

create unique index if not exists pos_payment_requests_one_active_per_sale_idx
  on public.pos_payment_requests (pos_sale_id)
  where status in ('pending', 'pending_approval', 'pending_message_failed');

create index if not exists pos_payment_requests_active_context_idx
  on public.pos_payment_requests (barber_id, client_id, amount_cents, updated_at desc)
  where status in ('pending', 'pending_approval', 'pending_message_failed');

notify pgrst, 'reload schema';
