-- Resolve PL/pgSQL output-column ambiguity in the PR27 deletion finalizer.

begin;

create or replace function compliance_private.finalize_account_deletion(
  p_profile_id uuid
)
returns table (
  profile_id uuid,
  finalized_at timestamptz,
  sealed_financial_truth boolean,
  auth_identity_disable_required boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  lifecycle public.account_privacy_lifecycles%rowtype;
  finalized_time timestamptz := now();
  open_booking_count integer;
begin
  select * into lifecycle
  from public.account_privacy_lifecycles l
  where l.profile_id = p_profile_id
  for update;

  if lifecycle.profile_id is null
    or lifecycle.status <> 'deletion_grace'
    or lifecycle.deletion_grace_ends_at > finalized_time
  then
    raise exception using
      errcode = 'P0001',
      message = 'Account deletion is not ready for finalization.';
  end if;

  select count(*)::integer into open_booking_count
  from public.appointments a
  where a.status::text in ('pending', 'confirmed', 'booked', 'checked_in', 'in_service')
    and (
      a.client_id in (select c.id from public.clients c where c.profile_id = p_profile_id)
      or a.barber_id in (select b.id from public.barbers b where b.profile_id = p_profile_id)
    );

  if open_booking_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'Open bookings must be resolved before account deletion.';
  end if;

  insert into compliance_private.finance_retention_vault (
    profile_id,
    retention_class,
    source_table,
    source_reference,
    sealed_payload,
    retain_until
  )
  values (
    p_profile_id,
    'consent',
    'account_privacy_lifecycles',
    p_profile_id::text,
    jsonb_build_object(
      'deletion_requested_at', lifecycle.deletion_requested_at,
      'deletion_grace_ends_at', lifecycle.deletion_grace_ends_at,
      'financial_ledgers_preserved', true
    ),
    finalized_time + interval '7 years'
  )
  on conflict (retention_class, source_table, source_reference) do nothing;

  update public.culture_posts
  set deleted_at = coalesce(deleted_at, finalized_time),
      publishing_status = 'deleted',
      caption = null,
      metadata = '{}'::jsonb,
      updated_at = finalized_time
  where author_profile_id = p_profile_id;

  update public.culture_comments
  set body = '[deleted]',
      deleted_at = coalesce(deleted_at, finalized_time),
      updated_at = finalized_time
  where actor_profile_id = p_profile_id;

  update public.messages
  set body = '[deleted by account holder]',
      metadata = jsonb_build_object('privacy_erased_at', finalized_time),
      sender_profile_id = null
  where sender_profile_id = p_profile_id;

  delete from public.culture_profile_mutes
  where muter_profile_id = p_profile_id or muted_profile_id = p_profile_id;
  delete from public.culture_profile_blocks
  where blocker_profile_id = p_profile_id or blocked_profile_id = p_profile_id;

  update public.barbers
  set is_bookable = false,
      is_discoverable = false,
      status = 'deleted',
      bio = null,
      booking_slug = null
  where profile_id = p_profile_id;

  update public.profiles
  set full_name = 'Deleted member',
      email = 'deleted+' || replace(p_profile_id::text, '-', '') || '@privacy.invalid',
      phone = null,
      profile_photo_path = null,
      profile_photo_url = null,
      public_bio = null,
      public_city = null,
      public_state = null,
      public_username = null,
      updated_at = finalized_time
  where id = p_profile_id;

  update public.account_privacy_lifecycles
  set status = 'deleted',
      deleted_at = finalized_time,
      profile_visible = false,
      notifications_enabled = false,
      version = version + 1,
      updated_at = finalized_time
  where account_privacy_lifecycles.profile_id = p_profile_id;

  update public.data_rights_requests
  set status = 'completed',
      completed_at = finalized_time,
      resolution_metadata = resolution_metadata || jsonb_build_object(
        'application_data_erased', true,
        'financial_truth_sealed', true,
        'auth_identity_disable_required', true
      ),
      updated_at = finalized_time
  where data_rights_requests.profile_id = p_profile_id
    and request_type = 'deletion'
    and status in ('pending', 'processing', 'blocked');

  return query
  select p_profile_id, finalized_time, true, true;
end;
$$;

revoke all on function compliance_private.finalize_account_deletion(uuid)
  from public, anon, authenticated;
grant execute on function compliance_private.finalize_account_deletion(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
