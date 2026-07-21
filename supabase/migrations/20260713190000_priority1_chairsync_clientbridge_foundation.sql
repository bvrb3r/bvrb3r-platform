begin;

create table if not exists public.chair_sync_external_appointments (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('booksy','square','thecut','external_calendar','other')),
  provider_appointment_id text not null,
  provider_calendar_id text,
  shop_id text references public.shops(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_name text not null,
  guest_display_name text not null,
  guest_phone text,
  guest_email text,
  guest_contact_fingerprint text,
  status text not null default 'confirmed' check (status in ('confirmed','arrived','checked_in','waiting','almost_ready','ready','in_chair','completed','canceled','no_show')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  payment_owner text not null check (payment_owner in ('booksy','square','thecut','external_provider','none')),
  provider_open_url text,
  provider_data_policy jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  last_provider_event_at timestamptz,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chair_sync_external_appointment_provider_unique unique (provider, provider_appointment_id),
  constraint chair_sync_external_appointment_time_check check (ends_at > starts_at),
  constraint chair_sync_external_appointment_money_isolation check (
    not (source_metadata ?| array['amount','price','balance','tip','payout','refund','dispute','fee'])
  )
);

create index if not exists chair_sync_external_appointments_shop_time_idx
  on public.chair_sync_external_appointments(shop_id, starts_at);
create index if not exists chair_sync_external_appointments_barber_time_idx
  on public.chair_sync_external_appointments(barber_id, starts_at);
create index if not exists chair_sync_external_appointments_contact_idx
  on public.chair_sync_external_appointments(guest_contact_fingerprint, starts_at desc)
  where guest_contact_fingerprint is not null;

create table if not exists public.kiosk_guest_visits (
  id uuid primary key default gen_random_uuid(),
  shop_id text references public.shops(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  barber_id uuid references public.barbers(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  external_appointment_id uuid references public.chair_sync_external_appointments(id) on delete set null,
  queue_entry_id uuid references public.walk_in_queue(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  identity_state text not null default 'external_guest' check (identity_state in ('external_guest','bvrb3r_guest','verified_bvrb3r_client')),
  visit_status text not null default 'identified' check (visit_status in ('identified','checked_in','waiting','almost_ready','ready','in_chair','completed','canceled','no_show')),
  booking_source text not null,
  payment_owner text not null check (payment_owner in ('bvrb3r','booksy','square','thecut','external_provider','none')),
  guest_display_name text not null,
  guest_phone text,
  guest_email text,
  transactional_sms_consent boolean not null default false,
  transactional_email_consent boolean not null default false,
  marketing_consent boolean not null default false,
  terms_version text,
  privacy_version text,
  shop_policy_version text,
  consent_captured_at timestamptz,
  source_attribution jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kiosk_guest_visits_one_appointment check (num_nonnulls(appointment_id, external_appointment_id) <= 1),
  constraint kiosk_guest_visits_idempotency_unique unique (idempotency_key)
);

create index if not exists kiosk_guest_visits_shop_created_idx
  on public.kiosk_guest_visits(shop_id, created_at desc);
create index if not exists kiosk_guest_visits_external_appointment_idx
  on public.kiosk_guest_visits(external_appointment_id)
  where external_appointment_id is not null;
create index if not exists kiosk_guest_visits_native_appointment_idx
  on public.kiosk_guest_visits(appointment_id)
  where appointment_id is not null;

create table if not exists public.client_bridge_invitations (
  id uuid primary key default gen_random_uuid(),
  guest_visit_id uuid not null references public.kiosk_guest_visits(id) on delete cascade,
  external_appointment_id uuid references public.chair_sync_external_appointments(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  barber_id uuid references public.barbers(id) on delete set null,
  shop_id text references public.shops(id) on delete set null,
  invitation_channel text not null check (invitation_channel in ('onscreen','sms','email','qr','nfc','barber_assisted')),
  destination_masked text,
  token_hash text not null,
  status text not null default 'offered' check (status in ('offered','sent','delivered','opened','declined','expired','opted_out','identity_verified','activated','first_native_booking','converted','retained','failed')),
  original_appointment_source text not null,
  conversion_touchpoint text not null,
  source_attribution jsonb not null default '{}'::jsonb,
  consent_evidence jsonb not null default '{}'::jsonb,
  invitation_count integer not null default 1 check (invitation_count between 1 and 3),
  offered_at timestamptz not null default now(),
  sent_at timestamptz,
  opened_at timestamptz,
  declined_at timestamptz,
  identity_verified_at timestamptz,
  activated_at timestamptz,
  first_native_booking_at timestamptz,
  converted_at timestamptz,
  retained_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_bridge_invitation_token_unique unique (token_hash)
);

create index if not exists client_bridge_invitations_guest_status_idx
  on public.client_bridge_invitations(guest_visit_id, status, created_at desc);
create index if not exists client_bridge_invitations_shop_created_idx
  on public.client_bridge_invitations(shop_id, created_at desc);

create table if not exists public.client_bridge_consent_events (
  id uuid primary key default gen_random_uuid(),
  guest_visit_id uuid references public.kiosk_guest_visits(id) on delete cascade,
  invitation_id uuid references public.client_bridge_invitations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('transactional_sms_granted','transactional_email_granted','marketing_granted','marketing_denied','join_offered','join_declined','invitation_opt_out','terms_accepted','privacy_accepted','identity_verified')),
  consent_version text,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint client_bridge_consent_event_subject_check check (num_nonnulls(guest_visit_id, invitation_id, profile_id) >= 1)
);

create index if not exists client_bridge_consent_events_visit_idx
  on public.client_bridge_consent_events(guest_visit_id, occurred_at desc);

alter table public.appointments
  add column if not exists payment_owner text not null default 'bvrb3r',
  add column if not exists original_booking_source text,
  add column if not exists source_attribution jsonb not null default '{}'::jsonb;

alter table public.appointments drop constraint if exists appointments_payment_owner_check;
alter table public.appointments
  add constraint appointments_payment_owner_check
  check (payment_owner in ('bvrb3r','booksy','square','thecut','external_provider','none')) not valid;
alter table public.appointments validate constraint appointments_payment_owner_check;

update public.appointments
set original_booking_source = coalesce(original_booking_source, booking_source, source),
    payment_owner = case
      when lower(coalesce(booking_source, source, '')) in ('booksy','square','thecut','external_calendar')
        then case lower(coalesce(booking_source, source, ''))
          when 'booksy' then 'booksy'
          when 'square' then 'square'
          when 'thecut' then 'thecut'
          else 'external_provider'
        end
      else 'bvrb3r'
    end
where original_booking_source is null;

alter table public.walk_in_queue
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists external_appointment_id uuid references public.chair_sync_external_appointments(id) on delete set null,
  add column if not exists guest_visit_id uuid references public.kiosk_guest_visits(id) on delete set null,
  add column if not exists booking_source text not null default 'walk_in_queue',
  add column if not exists payment_owner text not null default 'none',
  add column if not exists status_revision integer not null default 1,
  add column if not exists source_attribution jsonb not null default '{}'::jsonb;

alter table public.walk_in_queue drop constraint if exists walk_in_queue_payment_owner_check;
alter table public.walk_in_queue
  add constraint walk_in_queue_payment_owner_check
  check (payment_owner in ('bvrb3r','booksy','square','thecut','external_provider','none')) not valid;
alter table public.walk_in_queue validate constraint walk_in_queue_payment_owner_check;

alter table public.chair_sync_external_appointments enable row level security;
alter table public.kiosk_guest_visits enable row level security;
alter table public.client_bridge_invitations enable row level security;
alter table public.client_bridge_consent_events enable row level security;

revoke all on public.chair_sync_external_appointments from public, anon, authenticated;
revoke all on public.kiosk_guest_visits from public, anon, authenticated;
revoke all on public.client_bridge_invitations from public, anon, authenticated;
revoke all on public.client_bridge_consent_events from public, anon, authenticated;

grant all on public.chair_sync_external_appointments to service_role;
grant all on public.kiosk_guest_visits to service_role;
grant all on public.client_bridge_invitations to service_role;
grant all on public.client_bridge_consent_events to service_role;

comment on table public.chair_sync_external_appointments is
  'Schedule-only ChairSync imports. External provider money, tips, payouts, refunds, disputes, fees, and balances are forbidden.';
comment on table public.kiosk_guest_visits is
  'Public-kiosk visit truth for external guests, provisional BVRB3R guests, and verified BVRB3R clients.';
comment on table public.client_bridge_invitations is
  'Consent-based ClientBridge conversion funnel. Imported external customer data does not create an active BVRB3R account.';
comment on column public.appointments.payment_owner is
  'Determines which platform owns payment, refund, dispute, payout, fees, and financial reporting.';

create or replace function public.bvrb3r_priority1_readiness_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'generated_at', now(),
    'status', case when
      to_regclass('public.chair_sync_external_appointments') is not null
      and to_regclass('public.kiosk_guest_visits') is not null
      and to_regclass('public.client_bridge_invitations') is not null
      and to_regclass('public.client_bridge_consent_events') is not null
      and not exists (
        select 1
        from public.appointments a
        where a.payment_owner <> 'bvrb3r'
          and exists (select 1 from public.payments p where p.appointment_id = a.id)
      )
      then 'pass' else 'failed' end,
    'critical', jsonb_build_object(
      'external_appointments_with_bvrb3r_payments', (
        select count(*)
        from public.appointments a
        where a.payment_owner <> 'bvrb3r'
          and exists (select 1 from public.payments p where p.appointment_id = a.id)
      ),
      'external_appointments_with_routing', (
        select count(*)
        from public.appointments a
        where a.payment_owner <> 'bvrb3r'
          and exists (select 1 from public.payment_routing_records r where r.appointment_id = a.id)
      ),
      'expired_active_invitations', (
        select count(*) from public.client_bridge_invitations
        where status in ('offered','sent','delivered','opened') and expires_at <= now()
      )
    ),
    'operational', jsonb_build_object(
      'external_appointments', (select count(*) from public.chair_sync_external_appointments),
      'guest_visits', (select count(*) from public.kiosk_guest_visits),
      'client_bridge_invitations', (select count(*) from public.client_bridge_invitations),
      'activated_clients', (select count(*) from public.client_bridge_invitations where activated_at is not null),
      'completed_conversions', (select count(*) from public.client_bridge_invitations where converted_at is not null)
    )
  );
$$;

revoke all on function public.bvrb3r_priority1_readiness_snapshot() from public, anon, authenticated;
grant execute on function public.bvrb3r_priority1_readiness_snapshot() to service_role;

notify pgrst, 'reload schema';

commit;
