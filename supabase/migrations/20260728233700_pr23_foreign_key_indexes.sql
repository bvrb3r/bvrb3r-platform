-- Product PR23 advisor follow-up: cover relationship foreign keys used by
-- deletion checks, claim merges, escalation reads, and audit investigations.

begin;

create index if not exists chairsync_checked_in_queue_idx
  on public.chairsync_appointments (checked_in_waitlist_entry_id)
  where checked_in_waitlist_entry_id is not null;
create index if not exists chairsync_linked_client_idx
  on public.chairsync_appointments (linked_client_id)
  where linked_client_id is not null;

create index if not exists clientbridge_consent_chairsync_idx
  on public.clientbridge_consent_events (chairsync_appointment_id)
  where chairsync_appointment_id is not null;

create index if not exists clientbridge_invitation_chairsync_idx
  on public.clientbridge_invitations (chairsync_appointment_id)
  where chairsync_appointment_id is not null;
create index if not exists clientbridge_invitation_claimed_profile_idx
  on public.clientbridge_invitations (claimed_profile_id)
  where claimed_profile_id is not null;
create index if not exists clientbridge_invitation_consent_idx
  on public.clientbridge_invitations (consent_event_id)
  where consent_event_id is not null;
create index if not exists clientbridge_invitation_queue_idx
  on public.clientbridge_invitations (waitlist_entry_id)
  where waitlist_entry_id is not null;

create index if not exists notification_delivery_invitation_idx
  on public.notification_delivery_ledger (clientbridge_invitation_id)
  where clientbridge_invitation_id is not null;
create index if not exists notification_delivery_consent_idx
  on public.notification_delivery_ledger (consent_event_id)
  where consent_event_id is not null;
create index if not exists notification_delivery_notification_idx
  on public.notification_delivery_ledger (notification_id)
  where notification_id is not null;

create index if not exists queue_mutation_audit_new_barber_idx
  on public.queue_mutation_audit (new_barber_id)
  where new_barber_id is not null;
create index if not exists queue_mutation_audit_previous_barber_idx
  on public.queue_mutation_audit (previous_barber_id)
  where previous_barber_id is not null;

create index if not exists waitlist_entries_last_mutated_by_idx
  on public.waitlist_entries (last_mutated_by)
  where last_mutated_by is not null;
create index if not exists waitlist_entries_rejoin_of_idx
  on public.waitlist_entries (rejoin_of_entry_id)
  where rejoin_of_entry_id is not null;

commit;
