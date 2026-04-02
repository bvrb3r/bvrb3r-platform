alter table public.waitlist_entries
  add column if not exists shop_id uuid references public.locations(id) on delete cascade,
  add column if not exists barber_id uuid references public.barbers(id) on delete set null,
  add column if not exists preferred_date date,
  add column if not exists preferred_start_time time,
  add column if not exists preferred_end_time time,
  add column if not exists flexibility_minutes integer not null default 0,
  add column if not exists queue_source text not null default 'walk_in',
  add column if not exists notes text,
  add column if not exists status_reason text,
  add column if not exists assigned_at timestamptz,
  add column if not exists called_at timestamptz,
  add column if not exists converted_appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists converted_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.waitlist_entries
  drop constraint if exists waitlist_entries_status_check;

alter table public.waitlist_entries
  drop constraint if exists waitlist_entries_queue_source_check;

update public.waitlist_entries
set
  shop_id = coalesce(shop_id, location_id),
  preferred_date = coalesce(preferred_date, requested_date),
  flexibility_minutes = coalesce(flexibility_minutes, 0),
  queue_source = case
    when queue_source is null or queue_source = 'walk_in' then 'app'
    else queue_source
  end,
  status = case
    when status in ('waiting', 'notified') then 'active'
    when status = 'booked' then 'converted'
    when status is null then 'active'
    else status
  end,
  updated_at = coalesce(updated_at, created_at, now())
where
  shop_id is null
  or preferred_date is null
  or queue_source is null
  or status in ('waiting', 'notified', 'booked')
  or updated_at is null;

alter table public.waitlist_entries
  add constraint waitlist_entries_status_check
    check (status in ('active', 'called', 'assigned', 'converted', 'cancelled', 'expired', 'no_show')),
  add constraint waitlist_entries_queue_source_check
    check (queue_source in ('walk_in', 'cancellation_fill', 'manual', 'app')),
  add constraint waitlist_entries_flexibility_minutes_check
    check (flexibility_minutes >= 0);

create index if not exists waitlist_entries_shop_status_created_idx
  on public.waitlist_entries (shop_id, status, created_at desc);

create index if not exists waitlist_entries_barber_status_created_idx
  on public.waitlist_entries (barber_id, status, created_at desc)
  where barber_id is not null;

create index if not exists waitlist_entries_service_status_created_idx
  on public.waitlist_entries (service_id, status, created_at desc)
  where service_id is not null;

create index if not exists waitlist_entries_client_created_idx
  on public.waitlist_entries (client_id, created_at desc);

create unique index if not exists waitlist_entries_converted_appointment_uidx
  on public.waitlist_entries (converted_appointment_id)
  where converted_appointment_id is not null;

alter table public.waitlist_entries enable row level security;

drop policy if exists "waitlist entries shop staff select" on public.waitlist_entries;
drop policy if exists "waitlist entries barber assigned select" on public.waitlist_entries;
drop policy if exists "waitlist entries shop staff insert" on public.waitlist_entries;
drop policy if exists "waitlist entries shop staff update" on public.waitlist_entries;

create policy "waitlist entries shop staff select" on public.waitlist_entries
  for select using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations sl on sl.profile_id = p.id
      where p.id = auth.uid()
        and p.role in ('manager', 'front_desk')
        and sl.location_id = coalesce(waitlist_entries.shop_id, waitlist_entries.location_id)
    )
  );

create policy "waitlist entries barber assigned select" on public.waitlist_entries
  for select using (
    exists (
      select 1
      from public.barbers b
      where b.profile_id = auth.uid()
        and (
          b.id = waitlist_entries.barber_id
          or b.id = waitlist_entries.barber_preference
        )
    )
  );

create policy "waitlist entries shop staff insert" on public.waitlist_entries
  for insert with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations sl on sl.profile_id = p.id
      where p.id = auth.uid()
        and p.role in ('manager', 'front_desk')
        and sl.location_id = coalesce(waitlist_entries.shop_id, waitlist_entries.location_id)
    )
  );

create policy "waitlist entries shop staff update" on public.waitlist_entries
  for update using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations sl on sl.profile_id = p.id
      where p.id = auth.uid()
        and p.role in ('manager', 'front_desk')
        and sl.location_id = coalesce(waitlist_entries.shop_id, waitlist_entries.location_id)
    )
  ) with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
    )
    or exists (
      select 1
      from public.profiles p
      join public.staff_locations sl on sl.profile_id = p.id
      where p.id = auth.uid()
        and p.role in ('manager', 'front_desk')
        and sl.location_id = coalesce(waitlist_entries.shop_id, waitlist_entries.location_id)
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'waitlist_entries'
  ) then
    execute 'alter publication supabase_realtime add table public.waitlist_entries';
  end if;
end $$;
