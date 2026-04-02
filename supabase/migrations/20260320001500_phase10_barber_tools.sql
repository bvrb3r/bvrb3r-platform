alter table public.barber_status
  add column if not exists barber_id uuid references public.barbers(id) on delete cascade,
  add column if not exists current_shop_id uuid references public.locations(id) on delete set null,
  add column if not exists live_status text not null default 'offline' check (live_status in ('offline', 'available', 'busy', 'on_break', 'away')),
  add column if not exists is_online boolean not null default false,
  add column if not exists accepts_walk_ins boolean not null default false,
  add column if not exists last_seen_at timestamptz;

update public.barber_status bs
set
  barber_id = b.id,
  current_shop_id = coalesce(
    (
      select l.id
      from public.locations l
      where l.reference_code = bs.shop_reference
      limit 1
    ),
    bs.current_shop_id
  ),
  live_status = case
    when bs.status = 'busy' then 'busy'
    when bs.status = 'available' then 'available'
    else 'offline'
  end,
  is_online = case when bs.status = 'offline' then false else true end,
  accepts_walk_ins = coalesce(bs.accepting_bookings, false),
  last_seen_at = coalesce(bs.last_seen_at, bs.updated_at, now())
from public.barbers b
where b.reference_code = bs.barber_reference
  and (bs.barber_id is null or bs.current_shop_id is null or bs.last_seen_at is null);

create unique index if not exists barber_status_barber_id_idx
  on public.barber_status (barber_id)
  where barber_id is not null;

create index if not exists barber_status_current_shop_live_idx
  on public.barber_status (current_shop_id, live_status, is_online);

create index if not exists barber_status_next_available_idx
  on public.barber_status (next_available_at);

create policy "barber status self write" on public.barber_status
  for insert
  with check (
    exists (
      select 1
      from public.barbers b
      where b.id = barber_status.barber_id
        and b.profile_id = auth.uid()
    )
  );

create policy "barber status self update" on public.barber_status
  for update
  using (
    exists (
      select 1
      from public.barbers b
      where b.id = barber_status.barber_id
        and b.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.barbers b
      where b.id = barber_status.barber_id
        and b.profile_id = auth.uid()
    )
  );
