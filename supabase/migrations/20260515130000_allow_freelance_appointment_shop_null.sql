-- Freelance/barber-direct appointments are not shop-owned lanes.
-- Keep shop-owned appointment rows supported, but allow shop_id to be null when the
-- canonical booking context resolves to a freelance platform-hold appointment.
alter table public.appointments
  alter column shop_id drop not null;

create index if not exists appointments_freelance_barber_starts_at_idx
  on public.appointments (barber_id, starts_at)
  where shop_id is null;
