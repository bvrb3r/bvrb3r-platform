alter type public.appointment_status add value if not exists 'pending';
alter type public.appointment_status add value if not exists 'confirmed';
alter type public.appointment_status add value if not exists 'refunded';

alter table public.appointments
  add column if not exists confirmation_code text,
  add column if not exists shop_id uuid references public.locations(id) on delete restrict,
  add column if not exists membership_id uuid references public.staff_locations(id) on delete set null,
  add column if not exists booking_source text,
  add column if not exists service_total numeric(10,2) not null default 0,
  add column if not exists add_on_total numeric(10,2) not null default 0,
  add column if not exists subtotal numeric(10,2) not null default 0,
  add column if not exists discount_total numeric(10,2) not null default 0,
  add column if not exists tax_total numeric(10,2) not null default 0,
  add column if not exists grand_total numeric(10,2) not null default 0,
  add column if not exists checked_in_at timestamptz,
  add column if not exists service_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists notes text,
  add column if not exists internal_notes text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

update public.appointments
set
  confirmation_code = coalesce(confirmation_code, upper(substr(md5(coalesce(reference_code, id::text)), 1, 12))),
  shop_id = coalesce(shop_id, location_id),
  booking_source = coalesce(booking_source, source),
  service_total = coalesce(service_total, total_amount, 0),
  add_on_total = coalesce(add_on_total, 0),
  subtotal = coalesce(subtotal, total_amount, 0),
  discount_total = coalesce(discount_total, 0),
  tax_total = coalesce(tax_total, 0),
  grand_total = coalesce(grand_total, total_amount, 0) + coalesce(tip_amount, 0),
  checked_in_at = coalesce(
    checked_in_at,
    case when status::text in ('checked_in', 'in_service', 'completed', 'refunded') then starts_at else null end
  ),
  service_started_at = coalesce(
    service_started_at,
    case when status::text in ('in_service', 'completed', 'refunded') then starts_at else null end
  ),
  completed_at = coalesce(
    completed_at,
    case when status::text in ('completed', 'refunded') then coalesce(updated_at, ends_at, created_at) else null end
  ),
  cancelled_at = coalesce(
    cancelled_at,
    case when status::text = 'cancelled' then coalesce(updated_at, created_at) else null end
  ),
  notes = coalesce(notes, client_note)
where true;

update public.appointments a
set membership_id = sl.id
from public.barbers b
join public.staff_locations sl
  on sl.profile_id = b.profile_id
where a.barber_id = b.id
  and sl.location_id = a.location_id
  and a.membership_id is null;

alter table public.appointments
  alter column confirmation_code set not null,
  alter column shop_id set not null,
  alter column booking_source set not null;

create unique index if not exists appointments_confirmation_code_idx on public.appointments (confirmation_code);
create index if not exists appointments_shop_starts_at_idx on public.appointments (shop_id, starts_at);
create index if not exists appointments_status_starts_at_idx on public.appointments (status, starts_at);
create index if not exists appointments_membership_idx on public.appointments (membership_id) where membership_id is not null;

alter table public.appointment_services
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists service_name_snapshot text,
  add column if not exists duration_minutes_snapshot integer,
  add column if not exists unit_price_snapshot numeric(10,2),
  add column if not exists quantity integer not null default 1,
  add column if not exists line_total numeric(10,2) not null default 0;

update public.appointment_services aps
set
  service_id = coalesce(
    aps.service_id,
    (
      select s.id
      from public.services s
      where s.reference_code = aps.service_reference
      limit 1
    )
  ),
  service_name_snapshot = coalesce(aps.service_name_snapshot, aps.service_name),
  duration_minutes_snapshot = coalesce(aps.duration_minutes_snapshot, aps.duration_min),
  unit_price_snapshot = coalesce(aps.unit_price_snapshot, aps.price),
  line_total = case
    when aps.line_total = 0 then coalesce(aps.price, 0) * greatest(coalesce(aps.quantity, 1), 1)
    else aps.line_total
  end
where true;

create index if not exists appointment_services_appointment_service_idx on public.appointment_services (appointment_id, service_id);

create table if not exists public.appointment_add_ons (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  add_on_service_id uuid references public.services(id) on delete set null,
  add_on_reference text,
  add_on_name_snapshot text not null,
  unit_price_snapshot numeric(10,2) not null,
  quantity integer not null default 1 check (quantity > 0),
  line_total numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointment_add_ons_appointment_idx on public.appointment_add_ons (appointment_id);
create index if not exists appointment_add_ons_reference_idx on public.appointment_add_ons (add_on_reference);

alter table public.appointment_status_history
  add column if not exists old_status public.appointment_status,
  add column if not exists new_status public.appointment_status,
  add column if not exists change_reason text;

update public.appointment_status_history
set new_status = coalesce(new_status, status)
where new_status is null;

create index if not exists appointment_status_history_new_status_idx on public.appointment_status_history (appointment_id, new_status, changed_at desc);

create table if not exists public.appointment_check_in_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  event_type text not null check (event_type in ('arrived', 'checked_in', 'seated', 'started', 'completed')),
  recorded_by uuid references public.profiles(id) on delete set null,
  event_notes text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists appointment_check_in_events_appointment_idx on public.appointment_check_in_events (appointment_id, recorded_at desc);
create index if not exists appointment_check_in_events_type_idx on public.appointment_check_in_events (event_type, recorded_at desc);
