begin;

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_booking_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
  );
$$;

create or replace function private.is_booking_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.profile_id = auth.uid()
  );
$$;

create or replace function private.is_booking_barber(p_barber_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.barbers b
    where b.id = p_barber_id
      and b.profile_id = auth.uid()
  );
$$;

create or replace function private.is_booking_shop_operator(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_location_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('shop_owner_user', 'owner', 'manager', 'front_desk')
    )
    and (
      exists (
        select 1
        from public.locations l
        join public.shops s on s.id = l.reference_code
        where l.id = p_location_id
          and s.owner_profile_id = auth.uid()
      )
      or exists (
        select 1
        from public.staff_locations sl
        left join public.locations l on l.id = p_location_id
        where sl.profile_id = auth.uid()
          and coalesce(sl.relationship_status, 'active') = 'active'
          and sl.ended_at is null
          and (
            sl.location_id = p_location_id
            or (l.reference_code is not null and sl.shop_id = l.reference_code)
          )
      )
    );
$$;

create or replace function private.can_read_booking_appointment(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.appointments a
    where a.id = p_appointment_id
      and (
        private.is_booking_platform_admin()
        or private.is_booking_client(a.client_id)
        or private.is_booking_barber(a.barber_id)
        or private.is_booking_shop_operator(coalesce(a.shop_id, a.location_id))
      )
  );
$$;

create or replace function private.can_read_booking_appointment_reference(p_appointment_reference text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_appointment_reference is not null
    and exists (
      select 1
      from public.appointments a
      where a.reference_code = p_appointment_reference
        and private.can_read_booking_appointment(a.id)
    );
$$;

comment on function private.is_booking_platform_admin() is
  'PR30 RLS helper: confirms gated Architect/platform_admin access for booking and calendar evidence.';
comment on function private.is_booking_client(uuid) is
  'PR30 RLS helper: confirms the authenticated profile owns the client identity on a booking row.';
comment on function private.is_booking_barber(uuid) is
  'PR30 RLS helper: confirms the authenticated profile owns the barber identity on a booking row.';
comment on function private.is_booking_shop_operator(uuid) is
  'PR30 RLS helper: confirms shop ownership or active operator membership for the appointment shop/location.';
comment on function private.can_read_booking_appointment(uuid) is
  'PR30 RLS helper: central appointment visibility predicate for client, barber, shop operator, and platform admin reads.';
comment on function private.can_read_booking_appointment_reference(text) is
  'PR30 RLS helper: supports appointment_services rows that still carry appointment_reference instead of appointment_id.';

revoke all on function private.is_booking_platform_admin() from public, anon;
revoke all on function private.is_booking_client(uuid) from public, anon;
revoke all on function private.is_booking_barber(uuid) from public, anon;
revoke all on function private.is_booking_shop_operator(uuid) from public, anon;
revoke all on function private.can_read_booking_appointment(uuid) from public, anon;
revoke all on function private.can_read_booking_appointment_reference(text) from public, anon;

grant execute on function private.is_booking_platform_admin() to authenticated;
grant execute on function private.is_booking_client(uuid) to authenticated;
grant execute on function private.is_booking_barber(uuid) to authenticated;
grant execute on function private.is_booking_shop_operator(uuid) to authenticated;
grant execute on function private.can_read_booking_appointment(uuid) to authenticated;
grant execute on function private.can_read_booking_appointment_reference(text) to authenticated;

alter table public.appointments enable row level security;
alter table public.appointment_status_history enable row level security;
alter table public.appointment_services enable row level security;
alter table public.appointment_add_ons enable row level security;
alter table public.appointment_check_in_events enable row level security;
alter table public.services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.walk_in_queue enable row level security;

drop policy if exists "appointments scoped by profile" on public.appointments;
drop policy if exists "appointments client self select" on public.appointments;
drop policy if exists "appointments barber self select" on public.appointments;
drop policy if exists "appointments shop staff select" on public.appointments;
drop policy if exists "appointments platform admin select" on public.appointments;

create policy "appointments client self select"
  on public.appointments
  for select
  to authenticated
  using (private.is_booking_client(public.appointments.client_id));

create policy "appointments barber self select"
  on public.appointments
  for select
  to authenticated
  using (private.is_booking_barber(public.appointments.barber_id));

create policy "appointments shop operator select"
  on public.appointments
  for select
  to authenticated
  using (private.is_booking_shop_operator(coalesce(public.appointments.shop_id, public.appointments.location_id)));

create policy "appointments platform admin select"
  on public.appointments
  for select
  to authenticated
  using (private.is_booking_platform_admin());

comment on table public.appointments is
  'PR30 booking/calendar RLS target. Authenticated clients read only their own appointments, barbers read only their own chair appointments, shop operators read only appointments for owned or actively operated shops, platform_admin reads remain explicit, and anon/public reads have no policy. Server-side service_role writes continue through service-role bypass.';

drop policy if exists "appointment status history appointment participant select" on public.appointment_status_history;

create policy "appointment status history appointment participant select"
  on public.appointment_status_history
  for select
  to authenticated
  using (private.can_read_booking_appointment(public.appointment_status_history.appointment_id));

comment on table public.appointment_status_history is
  'PR30 booking/calendar RLS target. Status history follows the parent appointment read predicate. Authenticated insert/update policies are intentionally absent so lifecycle writes remain server-side/service-role.';

drop policy if exists "appointment services appointment participant select" on public.appointment_services;

create policy "appointment services appointment participant select"
  on public.appointment_services
  for select
  to authenticated
  using (
    (
      public.appointment_services.appointment_id is not null
      and private.can_read_booking_appointment(public.appointment_services.appointment_id)
    )
    or private.can_read_booking_appointment_reference(public.appointment_services.appointment_reference)
  );

comment on table public.appointment_services is
  'PR30 booking/calendar RLS target. Appointment service snapshots are visible only through the parent appointment predicate. Authenticated write policies are intentionally absent.';

drop policy if exists "appointment add ons appointment participant select" on public.appointment_add_ons;

create policy "appointment add ons appointment participant select"
  on public.appointment_add_ons
  for select
  to authenticated
  using (private.can_read_booking_appointment(public.appointment_add_ons.appointment_id));

comment on table public.appointment_add_ons is
  'PR30 booking/calendar RLS target. Add-on rows follow the parent appointment predicate. Authenticated write policies are intentionally absent.';

drop policy if exists "appointment check in events appointment participant select" on public.appointment_check_in_events;

create policy "appointment check in events appointment participant select"
  on public.appointment_check_in_events
  for select
  to authenticated
  using (private.can_read_booking_appointment(public.appointment_check_in_events.appointment_id));

comment on table public.appointment_check_in_events is
  'PR30 booking/calendar RLS target. Check-in events follow the parent appointment predicate. Authenticated write policies are intentionally absent so lifecycle events stay server-side/service-role.';

drop policy if exists "services booking catalog select" on public.services;
drop policy if exists "services owner operator select" on public.services;
drop policy if exists "services platform admin select" on public.services;

create policy "services booking catalog select"
  on public.services
  for select
  to authenticated
  using (active = true and is_bookable = true);

create policy "services owner operator select"
  on public.services
  for select
  to authenticated
  using (
    private.is_booking_shop_operator(public.services.location_id)
    or (
      public.services.service_owner_type::text = 'barber'
      and exists (
        select 1
        from public.barbers b
        where b.profile_id = auth.uid()
          and (
            b.id::text = public.services.barber_reference
            or b.reference_code = public.services.barber_reference
          )
      )
    )
    or (
      public.services.shop_reference is not null
      and exists (
        select 1
        from public.locations l
        where l.reference_code = public.services.shop_reference
          and private.is_booking_shop_operator(l.id)
      )
    )
  );

create policy "services platform admin select"
  on public.services
  for select
  to authenticated
  using (private.is_booking_platform_admin());

comment on table public.services is
  'PR30 booking/calendar RLS target. Authenticated users can read active bookable catalog rows; barbers and shop operators can read their scoped service rows; platform_admin access remains explicit. Authenticated write policies are intentionally absent.';

drop policy if exists "availability rules barber self select" on public.availability_rules;
drop policy if exists "availability rules shop operator select" on public.availability_rules;
drop policy if exists "availability rules platform admin select" on public.availability_rules;

create policy "availability rules barber self select"
  on public.availability_rules
  for select
  to authenticated
  using (private.is_booking_barber(public.availability_rules.barber_id));

create policy "availability rules shop operator select"
  on public.availability_rules
  for select
  to authenticated
  using (private.is_booking_shop_operator(public.availability_rules.location_id));

create policy "availability rules platform admin select"
  on public.availability_rules
  for select
  to authenticated
  using (private.is_booking_platform_admin());

comment on table public.availability_rules is
  'PR30 booking/calendar RLS target. Availability reads are limited to the owning barber, authorized shop operators for the location, and explicit platform_admin access. Authenticated write policies are intentionally absent.';

drop policy if exists "walk in queue client self select" on public.walk_in_queue;
drop policy if exists "walk in queue barber self select" on public.walk_in_queue;
drop policy if exists "walk in queue shop staff select" on public.walk_in_queue;
drop policy if exists "walk in queue shop operator select" on public.walk_in_queue;
drop policy if exists "walk in queue platform admin select" on public.walk_in_queue;

create policy "walk in queue client self select"
  on public.walk_in_queue
  for select
  to authenticated
  using (
    public.walk_in_queue.client_id is not null
    and private.is_booking_client(public.walk_in_queue.client_id)
  );

create policy "walk in queue barber self select"
  on public.walk_in_queue
  for select
  to authenticated
  using (
    public.walk_in_queue.assigned_barber_id is not null
    and private.is_booking_barber(public.walk_in_queue.assigned_barber_id)
  );

create policy "walk in queue shop operator select"
  on public.walk_in_queue
  for select
  to authenticated
  using (private.is_booking_shop_operator(coalesce(public.walk_in_queue.shop_id, public.walk_in_queue.location_id)));

create policy "walk in queue platform admin select"
  on public.walk_in_queue
  for select
  to authenticated
  using (private.is_booking_platform_admin());

comment on table public.walk_in_queue is
  'PR30 booking/calendar RLS target. Queue rows are visible to the linked client, assigned barber, authorized shop operators, and explicit platform_admin access. Anon/public reads have no policy and authenticated write policies are intentionally absent.';

notify pgrst, 'reload schema';

commit;
