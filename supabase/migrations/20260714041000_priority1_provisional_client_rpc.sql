begin;

create or replace function public.priority1_create_provisional_client(
  p_client_id uuid,
  p_provisional_id uuid,
  p_activation_id uuid,
  p_shop_id text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_contact_fingerprint text,
  p_preferred_channel text,
  p_transactional_sms_consent boolean,
  p_transactional_email_consent boolean,
  p_marketing_consent boolean,
  p_terms_version text,
  p_privacy_version text,
  p_shop_policy_version text,
  p_source_attribution jsonb,
  p_idempotency_key text,
  p_activation_token_hash text,
  p_activation_expires_at timestamptz,
  p_guest_visit_id uuid,
  p_client_bridge_invitation_id uuid,
  p_destination_masked text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing public.kiosk_provisional_clients%rowtype;
  v_activation public.kiosk_account_activations%rowtype;
begin
  select * into v_existing
  from public.kiosk_provisional_clients
  where idempotency_key = p_idempotency_key;

  if found then
    select * into v_activation
    from public.kiosk_account_activations
    where provisional_client_id = v_existing.id
    order by created_at desc
    limit 1;
    return jsonb_build_object(
      'client_id', v_existing.client_id,
      'provisional_client_id', v_existing.id,
      'activation_id', v_activation.id,
      'expires_at', v_activation.expires_at,
      'duplicate', true
    );
  end if;

  insert into public.clients (id, profile_id, loyalty_points, retention_tag, reference_code)
  values (p_client_id, null, 0, 'new', 'client-kiosk-' || left(replace(p_client_id::text, '-', ''), 12));

  insert into public.kiosk_provisional_clients (
    id, client_id, shop_id, full_name, phone, email, contact_fingerprint,
    preferred_channel, status, transactional_sms_consent, transactional_email_consent,
    marketing_consent, terms_version, privacy_version, shop_policy_version,
    source_attribution, idempotency_key, expires_at
  ) values (
    p_provisional_id, p_client_id, p_shop_id, p_full_name, p_phone, p_email,
    p_contact_fingerprint, p_preferred_channel, 'pending_activation',
    p_transactional_sms_consent, p_transactional_email_consent, p_marketing_consent,
    p_terms_version, p_privacy_version, p_shop_policy_version,
    coalesce(p_source_attribution, '{}'::jsonb), p_idempotency_key, p_activation_expires_at
  ) returning * into v_existing;

  insert into public.kiosk_account_activations (
    id, provisional_client_id, guest_visit_id, client_bridge_invitation_id,
    token_hash, status, channel, destination_masked, expires_at,
    source_attribution
  ) values (
    p_activation_id, p_provisional_id, p_guest_visit_id, p_client_bridge_invitation_id,
    p_activation_token_hash, 'pending', p_preferred_channel, p_destination_masked,
    p_activation_expires_at, coalesce(p_source_attribution, '{}'::jsonb)
  ) returning * into v_activation;

  return jsonb_build_object(
    'client_id', v_existing.client_id,
    'provisional_client_id', v_existing.id,
    'activation_id', v_activation.id,
    'expires_at', v_activation.expires_at,
    'duplicate', false
  );
end;
$$;

revoke all on function public.priority1_create_provisional_client(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, boolean, boolean,
  text, text, text, jsonb, text, text, timestamptz, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.priority1_create_provisional_client(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, boolean, boolean,
  text, text, text, jsonb, text, text, timestamptz, uuid, uuid, text
) to service_role;

comment on function public.priority1_create_provisional_client(
  uuid, uuid, uuid, text, text, text, text, text, text, boolean, boolean, boolean,
  text, text, text, jsonb, text, text, timestamptz, uuid, uuid, text
) is 'Atomically creates the non-auth kiosk client shell and its 72-hour, single-use activation record.';

notify pgrst, 'reload schema';
commit;
