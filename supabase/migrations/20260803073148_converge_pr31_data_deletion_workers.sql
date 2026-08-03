-- Staging ledger version: 20260803073148.
begin;

-- Product PR31 narrows new deletion cool-offs to seven days while preserving
-- every 30-day promise that was already active before this migration.
alter table public.account_privacy_lifecycles
  add column if not exists grace_period_days smallint not null default 7;

update public.account_privacy_lifecycles
set grace_period_days = 30
where deletion_requested_at is not null
  and deletion_grace_ends_at = deletion_requested_at + interval '30 days';

alter table public.account_privacy_lifecycles
  drop constraint if exists account_privacy_deletion_grace_ck;
alter table public.account_privacy_lifecycles
  drop constraint if exists account_privacy_grace_period_days_ck;
alter table public.account_privacy_lifecycles
  add constraint account_privacy_grace_period_days_ck
    check (grace_period_days in (7, 30)),
  add constraint account_privacy_deletion_grace_ck check (
    status <> 'deletion_grace'
    or (
      deletion_requested_at is not null
      and deletion_grace_ends_at is not null
      and deletion_grace_ends_at = deletion_requested_at + make_interval(days => grace_period_days)
    )
  );

-- New export links last 24 hours. Existing seven-day links retain the window
-- already communicated to their account holders.
alter table public.account_export_deliveries
  add column if not exists validity_hours smallint not null default 24,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error_code text;

update public.account_export_deliveries
set validity_hours = 168
where ready_at is not null
  and expires_at = ready_at + interval '7 days';

alter table public.account_export_deliveries
  drop constraint if exists account_export_deliveries_window_ck;
alter table public.account_export_deliveries
  drop constraint if exists account_export_deliveries_validity_hours_ck;
alter table public.account_export_deliveries
  add constraint account_export_deliveries_validity_hours_ck
    check (validity_hours in (24, 168)),
  add constraint account_export_deliveries_window_ck check (
    status not in ('ready', 'expired')
    or (
      ready_at is not null
      and expires_at is not null
      and expires_at = ready_at + make_interval(hours => validity_hours)
    )
  );

create index if not exists account_export_deliveries_worker_idx
  on public.account_export_deliveries (status, requested_at)
  where status in ('requested', 'building', 'failed');

create table if not exists compliance_private.account_export_archives (
  delivery_id uuid primary key
    references public.account_export_deliveries(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  archive_payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint account_export_archive_window_ck
    check (expires_at = created_at + interval '24 hours')
);

create index if not exists account_export_archives_expiry_idx
  on compliance_private.account_export_archives (expires_at);
create index if not exists account_export_archives_profile_idx
  on compliance_private.account_export_archives (profile_id);

alter table compliance_private.account_export_archives enable row level security;
alter table compliance_private.account_export_archives force row level security;
revoke all on table compliance_private.account_export_archives
  from public, anon, authenticated;
grant select, insert, update, delete on table compliance_private.account_export_archives
  to service_role;

drop policy if exists account_export_archives_service_role_only
  on compliance_private.account_export_archives;
create policy account_export_archives_service_role_only
  on compliance_private.account_export_archives
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists compliance_private.account_deletion_finalization_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'failed', 'completed', 'canceled')),
  due_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  application_finalized_at timestamptz,
  auth_disabled_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_deletion_finalization_due_idx
  on compliance_private.account_deletion_finalization_jobs (due_at, status)
  where status in ('scheduled', 'failed');

alter table compliance_private.account_deletion_finalization_jobs enable row level security;
alter table compliance_private.account_deletion_finalization_jobs force row level security;
revoke all on table compliance_private.account_deletion_finalization_jobs
  from public, anon, authenticated;
grant select, insert, update, delete on table compliance_private.account_deletion_finalization_jobs
  to service_role;

drop policy if exists account_deletion_jobs_service_role_only
  on compliance_private.account_deletion_finalization_jobs;
create policy account_deletion_jobs_service_role_only
  on compliance_private.account_deletion_finalization_jobs
  for all
  to service_role
  using (true)
  with check (true);

create or replace function compliance_private.pr31_sync_account_deletion_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'deletion_grace' then
    insert into compliance_private.account_deletion_finalization_jobs (
      profile_id,
      status,
      due_at,
      attempt_count,
      application_finalized_at,
      auth_disabled_at,
      completed_at,
      canceled_at,
      last_error_code,
      updated_at
    )
    values (
      new.profile_id,
      'scheduled',
      new.deletion_grace_ends_at,
      0,
      null,
      null,
      null,
      null,
      null,
      now()
    )
    on conflict (profile_id) do update
    set status = 'scheduled',
        due_at = excluded.due_at,
        attempt_count = 0,
        application_finalized_at = null,
        auth_disabled_at = null,
        completed_at = null,
        canceled_at = null,
        last_error_code = null,
        updated_at = now();
  elsif new.status in ('active', 'restored', 'deactivated') then
    update compliance_private.account_deletion_finalization_jobs
    set status = 'canceled',
        canceled_at = now(),
        updated_at = now()
    where profile_id = new.profile_id
      and status in ('scheduled', 'processing', 'failed');
  end if;
  return new;
end;
$$;

revoke all on function compliance_private.pr31_sync_account_deletion_job()
  from public, anon, authenticated;

drop trigger if exists pr31_sync_account_deletion_job
  on public.account_privacy_lifecycles;
create trigger pr31_sync_account_deletion_job
after insert or update of status, deletion_grace_ends_at
on public.account_privacy_lifecycles
for each row execute function compliance_private.pr31_sync_account_deletion_job();

insert into compliance_private.account_deletion_finalization_jobs (
  profile_id,
  status,
  due_at,
  updated_at
)
select
  lifecycle.profile_id,
  'scheduled',
  lifecycle.deletion_grace_ends_at,
  now()
from public.account_privacy_lifecycles lifecycle
where lifecycle.status = 'deletion_grace'
on conflict (profile_id) do update
set status = 'scheduled',
    due_at = excluded.due_at,
    updated_at = now();

-- Serialize active appointment creation against account deletion. Both paths
-- lock the same lifecycle row, closing the window where an appointment could
-- otherwise appear after the deletion eligibility count but before the grace
-- state is stored.
create or replace function private.pr31_guard_active_appointment_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  blocked_profile_id uuid;
begin
  if new.status::text not in ('pending', 'confirmed', 'booked', 'checked_in', 'in_service') then
    return new;
  end if;

  insert into public.account_privacy_lifecycles (profile_id)
  select participant.profile_id
  from (
    select client.profile_id
    from public.clients client
    where client.id = new.client_id
      and client.profile_id is not null
    union
    select barber.profile_id
    from public.barbers barber
    where barber.id = new.barber_id
      and barber.profile_id is not null
  ) participant
  order by participant.profile_id
  on conflict (profile_id) do nothing;

  perform lifecycle.profile_id
  from public.account_privacy_lifecycles lifecycle
  join (
    select client.profile_id
    from public.clients client
    where client.id = new.client_id
      and client.profile_id is not null
    union
    select barber.profile_id
    from public.barbers barber
    where barber.id = new.barber_id
      and barber.profile_id is not null
  ) participant on participant.profile_id = lifecycle.profile_id
  order by lifecycle.profile_id
  for share of lifecycle;

  select lifecycle.profile_id into blocked_profile_id
  from public.account_privacy_lifecycles lifecycle
  where lifecycle.profile_id in (
    select client.profile_id from public.clients client where client.id = new.client_id
    union
    select barber.profile_id from public.barbers barber where barber.id = new.barber_id
  )
    and lifecycle.status in ('deactivated', 'deletion_grace', 'deleted')
  order by lifecycle.profile_id
  limit 1;

  if blocked_profile_id is not null then
    raise exception using
      errcode = '55000',
      message = 'An inactive account cannot create or hold an active appointment.';
  end if;

  return new;
end;
$$;

revoke all on function private.pr31_guard_active_appointment_participants()
  from public, anon, authenticated, service_role;

drop trigger if exists pr31_guard_active_appointment_participants
  on public.appointments;
create trigger pr31_guard_active_appointment_participants
before insert or update of client_id, barber_id, status
on public.appointments
for each row
execute function private.pr31_guard_active_appointment_participants();

-- Schedule the lifecycle, audit request, and worker job as one transaction.
-- The service verifies the out-of-band challenge before invoking this
-- service-role-only function; the database repeats the open-booking guard to
-- close the race between eligibility inspection and scheduling.
create or replace function public.pr31_schedule_account_deletion(
  p_profile_id uuid
)
returns table (
  status text,
  deletion_requested_at timestamptz,
  deletion_grace_ends_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  existing_lifecycle public.account_privacy_lifecycles%rowtype;
  requested_time timestamptz := now();
  grace_ends_time timestamptz := requested_time + interval '7 days';
  open_booking_count integer;
  open_request_id uuid;
begin
  -- Create the serialization row before inspecting appointments. Booking
  -- inserts lock this same row, so either the booking commits first and is
  -- counted here, or deletion wins and the booking is refused.
  insert into public.account_privacy_lifecycles (profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;

  select * into existing_lifecycle
  from public.account_privacy_lifecycles lifecycle
  where lifecycle.profile_id = p_profile_id
  for update;

  if existing_lifecycle.status = 'deletion_grace'
    and existing_lifecycle.deletion_grace_ends_at > requested_time
  then
    return query select
      existing_lifecycle.status,
      existing_lifecycle.deletion_requested_at,
      existing_lifecycle.deletion_grace_ends_at;
    return;
  end if;

  select count(*)::integer into open_booking_count
  from public.appointments appointment
  where appointment.status::text in ('pending', 'confirmed', 'booked', 'checked_in', 'in_service')
    and (
      appointment.client_id in (
        select client.id from public.clients client where client.profile_id = p_profile_id
      )
      or appointment.barber_id in (
        select barber.id from public.barbers barber where barber.profile_id = p_profile_id
      )
    );

  if open_booking_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'Open bookings must be resolved before account deletion.';
  end if;

  insert into public.account_privacy_lifecycles as lifecycle (
    profile_id,
    status,
    deactivated_at,
    deletion_requested_at,
    deletion_grace_ends_at,
    grace_period_days,
    restored_at,
    deleted_at,
    profile_visible,
    notifications_enabled,
    updated_at
  )
  values (
    p_profile_id,
    'deletion_grace',
    requested_time,
    requested_time,
    grace_ends_time,
    7,
    null,
    null,
    false,
    false,
    requested_time
  )
  on conflict (profile_id) do update
  set status = 'deletion_grace',
      deactivated_at = excluded.deactivated_at,
      deletion_requested_at = excluded.deletion_requested_at,
      deletion_grace_ends_at = excluded.deletion_grace_ends_at,
      grace_period_days = 7,
      restored_at = null,
      deleted_at = null,
      profile_visible = false,
      notifications_enabled = false,
      version = lifecycle.version + 1,
      updated_at = excluded.updated_at;

  select request.id into open_request_id
  from public.data_rights_requests request
  where request.profile_id = p_profile_id
    and request.request_type = 'deletion'
    and request.status in ('pending', 'processing', 'blocked')
  for update;

  if open_request_id is null then
    insert into public.data_rights_requests (
      profile_id,
      request_type,
      status,
      requested_at,
      acknowledged_at,
      request_metadata,
      updated_at
    )
    values (
      p_profile_id,
      'deletion',
      'processing',
      requested_time,
      requested_time,
      jsonb_build_object(
        'source', 'product_pr31_account_privacy',
        'grace_ends_at', grace_ends_time,
        'grace_period_days', 7,
        'sealed_finance_retention', true
      ),
      requested_time
    );
  else
    update public.data_rights_requests
    set status = 'processing',
        acknowledged_at = coalesce(acknowledged_at, requested_time),
        blocked_reason = null,
        request_metadata = request_metadata || jsonb_build_object(
          'source', 'product_pr31_account_privacy',
          'grace_ends_at', grace_ends_time,
          'grace_period_days', 7,
          'sealed_finance_retention', true
        ),
        updated_at = requested_time
    where id = open_request_id;
  end if;

  delete from compliance_private.account_deletion_challenges
  where account_deletion_challenges.profile_id = p_profile_id;

  return query select 'deletion_grace'::text, requested_time, grace_ends_time;
end;
$$;

revoke all on function public.pr31_schedule_account_deletion(uuid)
  from public, anon, authenticated;
grant execute on function public.pr31_schedule_account_deletion(uuid)
  to service_role;

create or replace function public.pr31_restore_account_deletion(
  p_profile_id uuid
)
returns table (
  profile_id uuid,
  status text,
  restored_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lifecycle public.account_privacy_lifecycles%rowtype;
  restored_time timestamptz := now();
begin
  select * into lifecycle
  from public.account_privacy_lifecycles current_lifecycle
  where current_lifecycle.profile_id = p_profile_id
  for update;

  if lifecycle.profile_id is null
    or lifecycle.status <> 'deletion_grace'
    or lifecycle.deletion_grace_ends_at <= restored_time
  then
    raise exception using
      errcode = 'P0001',
      message = 'Account deletion can no longer be restored.';
  end if;

  update public.account_privacy_lifecycles
  set status = 'restored',
      deactivated_at = null,
      deletion_requested_at = null,
      deletion_grace_ends_at = null,
      restored_at = restored_time,
      deleted_at = null,
      profile_visible = true,
      notifications_enabled = true,
      version = version + 1,
      updated_at = restored_time
  where account_privacy_lifecycles.profile_id = p_profile_id;

  update public.data_rights_requests
  set status = 'canceled',
      completed_at = restored_time,
      resolution_metadata = coalesce(resolution_metadata, '{}'::jsonb) || jsonb_build_object(
        'deletion_canceled_at', restored_time,
        'restored_losslessly', true
      ),
      updated_at = restored_time
  where data_rights_requests.profile_id = p_profile_id
    and request_type = 'deletion'
    and status in ('pending', 'processing', 'blocked');

  update compliance_private.account_deletion_finalization_jobs
  set status = 'canceled',
      canceled_at = restored_time,
      updated_at = restored_time
  where account_deletion_finalization_jobs.profile_id = p_profile_id
    and status in ('scheduled', 'processing', 'failed');

  delete from compliance_private.account_deletion_challenges
  where account_deletion_challenges.profile_id = p_profile_id;

  return query select p_profile_id, 'restored'::text, restored_time;
end;
$$;

revoke all on function public.pr31_restore_account_deletion(uuid)
  from public, anon, authenticated;
grant execute on function public.pr31_restore_account_deletion(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
