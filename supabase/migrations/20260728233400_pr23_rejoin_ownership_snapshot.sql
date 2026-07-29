-- Product PR23 staging certification follow-up.
-- Rejoining is a new queue visit, but it must retain the original appointment
-- source, service snapshot, payment owner, and locked barber relationship.

begin;

create or replace function public.pr23_rejoin_public_queue(
  p_token text,
  p_idempotency_key text
)
returns table (
  waitlist_entry_id uuid,
  public_token text,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_row public.waitlist_entries%rowtype;
  existing_row public.waitlist_entries%rowtype;
  token_value text;
  payload_hash text;
  inserted_id uuid;
begin
  if not private.pr19_actor_is_trusted_writer() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;

  token_value := private.pr22_sha256(p_idempotency_key);

  select *
  into original_row
  from public.waitlist_entries w
  where length(p_token) between 32 and 128
    and w.public_token_hash = private.pr22_sha256(p_token)
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Queue status not found.';
  end if;
  if original_row.public_queue_state not in ('missed', 'canceled') then
    raise exception using errcode = '23514', message = 'Only a missed or canceled visit can rejoin.';
  end if;

  select *
  into existing_row
  from public.waitlist_entries w
  where w.location_id = original_row.location_id
    and w.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    return query select existing_row.id, token_value, true;
    return;
  end if;

  payload_hash := private.pr22_sha256(
    original_row.location_id::text || ':' || original_row.client_id::text || ':rejoin:' || original_row.id::text
  );

  insert into public.waitlist_entries (
    location_id, shop_id, client_id, service_id, barber_id, barber_preference,
    requested_date, preferred_date, preferred_start_time, preferred_end_time,
    flexibility_minutes,
    queue_source, idempotency_key, idempotency_payload_hash, entry_type,
    source_provider, source_service_name, payment_owner, assignment_locked,
    public_token_hash, public_queue_state, operational_sms_consent,
    rejoin_of_entry_id, notes, status_reason, status, created_by,
    last_mutated_by, last_mutation_reason, created_at, updated_at
  ) values (
    original_row.location_id, original_row.shop_id, original_row.client_id,
    original_row.service_id, original_row.barber_id, original_row.barber_preference,
    current_date, current_date, null, null, original_row.flexibility_minutes,
    original_row.queue_source, p_idempotency_key, payload_hash,
    original_row.entry_type, original_row.source_provider,
    original_row.source_service_name, original_row.payment_owner,
    original_row.assignment_locked, private.pr22_sha256(token_value),
    'rejoin', original_row.operational_sms_consent, original_row.id,
    original_row.notes, 'Client rejoined after a missed or canceled visit',
    'active', original_row.created_by, null,
    'Client rejoined from the private queue-status link', now(), now()
  )
  returning id into inserted_id;

  return query select inserted_id, token_value, false;
end;
$$;

revoke all on function public.pr23_rejoin_public_queue(text, text)
  from public, anon, authenticated;
grant execute on function public.pr23_rejoin_public_queue(text, text)
  to service_role;

commit;
