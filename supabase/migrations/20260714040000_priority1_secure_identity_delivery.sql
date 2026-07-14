begin;

-- Priority 1 security hardening. Public kiosk identity is never trusted from a raw profile id.
create table if not exists public.kiosk_identity_challenges (
  id uuid primary key default gen_random_uuid(),
  shop_id text references public.shops(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  purpose text not null default 'kiosk_account_link' check (purpose in ('kiosk_account_link','appointment_check_in','account_recovery')),
  status text not null default 'candidate' check (status in ('candidate','sending','sent','verified','expired','locked','failed')),
  candidate_token_hash text not null unique,
  channel text check (channel in ('sms','email')),
  destination_masked text,
  verification_code_hash text,
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 6),
  max_attempts integer not null default 5 check (max_attempts between 1 and 6),
  candidate_expires_at timestamptz not null,
  code_expires_at timestamptz,
  verified_at timestamptz,
  verification_token_hash text unique,
  verification_token_expires_at timestamptz,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kiosk_identity_challenges_profile_created_idx
  on public.kiosk_identity_challenges(profile_id, created_at desc);
create index if not exists kiosk_identity_challenges_shop_status_idx
  on public.kiosk_identity_challenges(shop_id, status, created_at desc);

-- New kiosk clients remain provisional until they claim the account from their own device.
create table if not exists public.kiosk_provisional_clients (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  shop_id text references public.shops(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  contact_fingerprint text,
  preferred_channel text check (preferred_channel in ('sms','email')),
  status text not null default 'pending_activation' check (status in ('pending_activation','duplicate_review','claimed','expired','failed')),
  claimed_profile_id uuid references public.profiles(id) on delete set null,
  merged_into_client_id uuid references public.clients(id) on delete set null,
  transactional_sms_consent boolean not null default false,
  transactional_email_consent boolean not null default false,
  marketing_consent boolean not null default false,
  terms_version text,
  privacy_version text,
  shop_policy_version text,
  source_attribution jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kiosk_provisional_client_contact_check check (phone is not null or email is not null)
);

create index if not exists kiosk_provisional_clients_contact_idx
  on public.kiosk_provisional_clients(contact_fingerprint, created_at desc)
  where contact_fingerprint is not null;
create index if not exists kiosk_provisional_clients_status_idx
  on public.kiosk_provisional_clients(status, expires_at);

create table if not exists public.kiosk_account_activations (
  id uuid primary key default gen_random_uuid(),
  provisional_client_id uuid not null references public.kiosk_provisional_clients(id) on delete cascade,
  guest_visit_id uuid references public.kiosk_guest_visits(id) on delete set null,
  client_bridge_invitation_id uuid references public.client_bridge_invitations(id) on delete set null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','sent','opened','used','expired','failed','revoked')),
  channel text not null check (channel in ('sms','email','onscreen')),
  destination_masked text,
  delivery_notification_id uuid references public.notifications(id) on delete set null,
  expires_at timestamptz not null,
  sent_at timestamptz,
  opened_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  claimed_auth_user_id uuid,
  claimed_profile_id uuid references public.profiles(id) on delete set null,
  source_attribution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists kiosk_account_activations_one_active_idx
  on public.kiosk_account_activations(provisional_client_id)
  where status in ('pending','sent','opened');
create index if not exists kiosk_account_activations_status_expiry_idx
  on public.kiosk_account_activations(status, expires_at);

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('sms','email','push','in_app')),
  destination_masked text,
  provider text,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','failed','retrying','blocked','opted_out')),
  attempt_number integer not null default 1 check (attempt_number between 1 and 10),
  failure_code text,
  failure_message text,
  escalation_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists notification_delivery_attempts_notification_idx
  on public.notification_delivery_attempts(notification_id, attempt_number desc);
create index if not exists notification_delivery_attempts_failed_idx
  on public.notification_delivery_attempts(status, created_at desc)
  where status in ('failed','retrying');

alter table public.kiosk_guest_visits
  add column if not exists account_activation_id uuid references public.kiosk_account_activations(id) on delete set null,
  add column if not exists notification_escalation_required boolean not null default false;

-- PR23 locks ClientBridge to two invitations within sixty days. The time-window rule is enforced in server logic.
alter table public.client_bridge_invitations drop constraint if exists client_bridge_invitations_invitation_count_check;
alter table public.client_bridge_invitations
  add constraint client_bridge_invitations_invitation_count_check check (invitation_count between 1 and 2) not valid;
alter table public.client_bridge_invitations validate constraint client_bridge_invitations_invitation_count_check;

alter table public.client_bridge_invitations
  add column if not exists suppressed_reason text,
  add column if not exists provider_restriction jsonb not null default '{}'::jsonb;

-- Exactly one active queue entry may represent a native or imported appointment.
create unique index if not exists walk_in_queue_active_native_appointment_uidx
  on public.walk_in_queue(appointment_id)
  where appointment_id is not null and status in ('waiting','assigned','in_service');
create unique index if not exists walk_in_queue_active_external_appointment_uidx
  on public.walk_in_queue(external_appointment_id)
  where external_appointment_id is not null and status in ('waiting','assigned','in_service');

alter table public.kiosk_identity_challenges enable row level security;
alter table public.kiosk_provisional_clients enable row level security;
alter table public.kiosk_account_activations enable row level security;
alter table public.notification_delivery_attempts enable row level security;

revoke all on public.kiosk_identity_challenges from public, anon, authenticated;
revoke all on public.kiosk_provisional_clients from public, anon, authenticated;
revoke all on public.kiosk_account_activations from public, anon, authenticated;
revoke all on public.notification_delivery_attempts from public, anon, authenticated;

grant all on public.kiosk_identity_challenges to service_role;
grant all on public.kiosk_provisional_clients to service_role;
grant all on public.kiosk_account_activations to service_role;
grant all on public.notification_delivery_attempts to service_role;

-- Atomic public-kiosk check-in and queue creation. Callable only through the service-role server route.
create or replace function public.priority1_create_check_in_queue(
  p_shop_id text,
  p_location_id uuid,
  p_barber_id uuid,
  p_appointment_id uuid,
  p_external_appointment_id uuid,
  p_client_id uuid,
  p_profile_id uuid,
  p_identity_state text,
  p_booking_source text,
  p_payment_owner text,
  p_guest_display_name text,
  p_guest_phone text,
  p_guest_email text,
  p_transactional_sms_consent boolean,
  p_transactional_email_consent boolean,
  p_marketing_consent boolean,
  p_terms_version text,
  p_privacy_version text,
  p_shop_policy_version text,
  p_source_attribution jsonb,
  p_idempotency_key text,
  p_queue_reference text,
  p_requested_service text,
  p_position integer,
  p_wait_minutes integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_visit public.kiosk_guest_visits%rowtype;
  v_queue public.walk_in_queue%rowtype;
  v_old_status text;
begin
  select * into v_visit
  from public.kiosk_guest_visits
  where idempotency_key = p_idempotency_key;

  if found then
    select * into v_queue from public.walk_in_queue where id = v_visit.queue_entry_id;
    return jsonb_build_object(
      'guest_visit_id', v_visit.id,
      'queue_entry_id', v_visit.queue_entry_id,
      'queue_reference', coalesce(v_queue.reference_code, p_queue_reference),
      'duplicate', true
    );
  end if;

  if p_appointment_id is not null then
    select * into v_queue
    from public.walk_in_queue
    where appointment_id = p_appointment_id
      and status in ('waiting','assigned','in_service')
    order by requested_at desc
    limit 1;
  elsif p_external_appointment_id is not null then
    select * into v_queue
    from public.walk_in_queue
    where external_appointment_id = p_external_appointment_id
      and status in ('waiting','assigned','in_service')
    order by requested_at desc
    limit 1;
  end if;

  if found then
    select * into v_visit from public.kiosk_guest_visits where queue_entry_id = v_queue.id order by created_at desc limit 1;
    return jsonb_build_object(
      'guest_visit_id', v_visit.id,
      'queue_entry_id', v_queue.id,
      'queue_reference', coalesce(v_queue.reference_code, p_queue_reference),
      'duplicate', true
    );
  end if;

  insert into public.kiosk_guest_visits (
    shop_id, location_id, barber_id, appointment_id, external_appointment_id,
    client_id, profile_id, identity_state, visit_status, booking_source, payment_owner,
    guest_display_name, guest_phone, guest_email, transactional_sms_consent,
    transactional_email_consent, marketing_consent, terms_version, privacy_version,
    shop_policy_version, consent_captured_at, source_attribution, idempotency_key
  ) values (
    p_shop_id, p_location_id, p_barber_id, p_appointment_id, p_external_appointment_id,
    p_client_id, p_profile_id, p_identity_state, 'waiting', p_booking_source, p_payment_owner,
    p_guest_display_name, p_guest_phone, p_guest_email, p_transactional_sms_consent,
    p_transactional_email_consent, p_marketing_consent, p_terms_version, p_privacy_version,
    p_shop_policy_version,
    case when p_transactional_sms_consent or p_transactional_email_consent or p_marketing_consent then now() else null end,
    coalesce(p_source_attribution, '{}'::jsonb), p_idempotency_key
  ) returning * into v_visit;

  insert into public.walk_in_queue (
    location_id, client_name, requested_service, requested_at, status, assigned_barber_id,
    reference_code, client_id, position, wait_minutes, updated_at, appointment_id,
    external_appointment_id, guest_visit_id, booking_source, payment_owner, status_revision,
    source_attribution
  ) values (
    p_location_id, p_guest_display_name, p_requested_service, now(), 'assigned', p_barber_id,
    p_queue_reference, p_client_id, greatest(p_position, 1), greatest(p_wait_minutes, 0), now(),
    p_appointment_id, p_external_appointment_id, v_visit.id, p_booking_source, p_payment_owner, 1,
    coalesce(p_source_attribution, '{}'::jsonb)
  ) returning * into v_queue;

  update public.kiosk_guest_visits
  set queue_entry_id = v_queue.id, updated_at = now()
  where id = v_visit.id;

  if p_external_appointment_id is not null then
    update public.chair_sync_external_appointments
    set status = 'checked_in', updated_at = now()
    where id = p_external_appointment_id
      and status not in ('checked_in','waiting','almost_ready','ready','in_chair','completed');
  elsif p_appointment_id is not null then
    select status::text into v_old_status from public.appointments where id = p_appointment_id for update;
    if v_old_status is distinct from 'checked_in' then
      update public.appointments
      set status = 'checked_in', checked_in_at = coalesce(checked_in_at, now()), updated_at = now(),
          last_actor_role = 'front_desk', last_event_type = 'kiosk_checked_in'
      where id = p_appointment_id;

      insert into public.appointment_status_history (
        appointment_id, status, old_status, new_status, change_reason, changed_at
      ) values (
        p_appointment_id, 'checked_in', v_old_status::public.appointment_status,
        'checked_in', 'kiosk_checked_in', now()
      );
    end if;
  end if;

  return jsonb_build_object(
    'guest_visit_id', v_visit.id,
    'queue_entry_id', v_queue.id,
    'queue_reference', v_queue.reference_code,
    'duplicate', false
  );
exception
  when unique_violation then
    if p_appointment_id is not null then
      select * into v_queue from public.walk_in_queue
      where appointment_id = p_appointment_id and status in ('waiting','assigned','in_service')
      order by requested_at desc limit 1;
    else
      select * into v_queue from public.walk_in_queue
      where external_appointment_id = p_external_appointment_id and status in ('waiting','assigned','in_service')
      order by requested_at desc limit 1;
    end if;
    return jsonb_build_object(
      'guest_visit_id', v_queue.guest_visit_id,
      'queue_entry_id', v_queue.id,
      'queue_reference', coalesce(v_queue.reference_code, p_queue_reference),
      'duplicate', true
    );
end;
$$;

revoke all on function public.priority1_create_check_in_queue(
  text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text,
  boolean, boolean, boolean, text, text, text, jsonb, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.priority1_create_check_in_queue(
  text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text,
  boolean, boolean, boolean, text, text, text, jsonb, text, text, text, integer, integer
) to service_role;

comment on table public.kiosk_identity_challenges is
  'Opaque, short-lived candidate and OTP verification state for public kiosks. A raw profile id is never accepted as identity proof.';
comment on table public.kiosk_provisional_clients is
  'A kiosk-created client shell that is not an active BVRB3R account until claimed on the client device.';
comment on table public.kiosk_account_activations is
  'Single-use, 72-hour account-claim links. Passwords and passkeys are never created on the kiosk.';
comment on table public.notification_delivery_attempts is
  'Provider delivery ledger for operational SMS/email, retries, failures, and front-desk escalation.';

notify pgrst, 'reload schema';

commit;
