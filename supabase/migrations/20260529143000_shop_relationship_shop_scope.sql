alter table if exists public.staff_locations
  add column if not exists shop_id text null;

alter table if exists public.staff_locations
  alter column location_id drop not null;

update public.staff_locations sl
set shop_id = coalesce(sl.shop_id, l.reference_code, sl.location_id)
from public.locations l
where sl.location_id = l.id
  and sl.shop_id is null;

update public.staff_locations
set shop_id = location_id
where shop_id is null
  and location_id is not null;

create index if not exists staff_locations_shop_id_idx
  on public.staff_locations (shop_id);

create unique index if not exists staff_locations_one_active_shop_relationship_per_barber_uidx
  on public.staff_locations (profile_id, shop_id)
  where relationship_status = 'active'
    and ended_at is null
    and shop_id is not null;

drop index if exists public.staff_locations_one_active_shop_per_barber_uidx;

create unique index if not exists staff_locations_one_active_relationship_per_barber_uidx
  on public.staff_locations (profile_id)
  where relationship_status = 'active'
    and ended_at is null;

notify pgrst, 'reload schema';
