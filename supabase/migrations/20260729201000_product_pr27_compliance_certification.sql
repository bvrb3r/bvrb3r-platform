-- Product PR27 certification follow-up.
--
-- Keeps client access read-only, clears PR27 advisor findings, and provides
-- server-owned workers for expired strikes and post-grace account erasure.

begin;

create index if not exists account_export_deliveries_request_idx
  on public.account_export_deliveries (data_rights_request_id)
  where data_rights_request_id is not null;
create index if not exists culture_appeals_original_reviewer_idx
  on public.culture_appeals (original_reviewer_profile_id);
create index if not exists culture_moderation_cases_decider_idx
  on public.culture_moderation_cases (decided_by_profile_id)
  where decided_by_profile_id is not null;
create index if not exists culture_moderation_cases_post_idx
  on public.culture_moderation_cases (post_id)
  where post_id is not null;
create index if not exists culture_safety_reports_reporter_idx
  on public.culture_safety_reports (reporter_profile_id, created_at desc);

drop policy if exists barber_setup_evidence_named_barber_select on public.barber_setup_evidence;
create policy barber_setup_evidence_named_barber_select
  on public.barber_setup_evidence for select to authenticated
  using (
    exists (
      select 1 from public.barbers b
      where b.id = barber_setup_evidence.barber_id
        and b.profile_id = (select auth.uid())
    )
  );

drop policy if exists barber_setup_activations_named_barber_select on public.barber_setup_activations;
create policy barber_setup_activations_named_barber_select
  on public.barber_setup_activations for select to authenticated
  using (
    exists (
      select 1 from public.barbers b
      where b.id = barber_setup_activations.barber_id
        and b.profile_id = (select auth.uid())
    )
  );

drop policy if exists account_privacy_lifecycle_self_select on public.account_privacy_lifecycles;
create policy account_privacy_lifecycle_self_select
  on public.account_privacy_lifecycles for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists account_export_deliveries_self_select on public.account_export_deliveries;
create policy account_export_deliveries_self_select
  on public.account_export_deliveries for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists culture_profile_blocks_participant_select on public.culture_profile_blocks;
create policy culture_profile_blocks_participant_select
  on public.culture_profile_blocks for select to authenticated
  using (
    blocker_profile_id = (select auth.uid())
    or blocked_profile_id = (select auth.uid())
  );

drop policy if exists culture_profile_mutes_owner_select on public.culture_profile_mutes;
create policy culture_profile_mutes_owner_select
  on public.culture_profile_mutes for select to authenticated
  using (muter_profile_id = (select auth.uid()));

drop policy if exists culture_safety_reports_reporter_select on public.culture_safety_reports;
create policy culture_safety_reports_reporter_select
  on public.culture_safety_reports for select to authenticated
  using (reporter_profile_id = (select auth.uid()));

drop policy if exists culture_moderation_cases_subject_select on public.culture_moderation_cases;
create policy culture_moderation_cases_subject_select
  on public.culture_moderation_cases for select to authenticated
  using (reported_profile_id = (select auth.uid()));

drop policy if exists culture_strikes_subject_select on public.culture_strikes;
create policy culture_strikes_subject_select
  on public.culture_strikes for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists culture_appeals_appellant_select on public.culture_appeals;
create policy culture_appeals_appellant_select
  on public.culture_appeals for select to authenticated
  using (appellant_profile_id = (select auth.uid()));

drop policy if exists support_cases_reporter_select on public.support_cases;
create policy support_cases_reporter_select
  on public.support_cases for select to authenticated
  using (reporter_profile_id = (select auth.uid()));

drop policy if exists dispute_evidence_items_submitter_select on public.dispute_evidence_items;
create policy dispute_evidence_items_submitter_select
  on public.dispute_evidence_items for select to authenticated
  using (submitted_by_profile_id = (select auth.uid()));

drop policy if exists culture_moderation_audit_no_client_read on public.culture_moderation_audit;
create policy culture_moderation_audit_no_client_read
  on public.culture_moderation_audit for select to authenticated
  using (false);

create or replace function compliance_private.expire_clean_culture_strikes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  update public.culture_strikes
  set status = 'expired'
  where status = 'active'
    and expires_at <= now();
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function compliance_private.expire_clean_culture_strikes()
  from public, anon, authenticated;
grant execute on function compliance_private.expire_clean_culture_strikes()
  to service_role;

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
