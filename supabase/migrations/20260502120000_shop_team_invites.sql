create table if not exists public.shop_team_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.locations(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  barber_profile_id uuid not null references public.profiles(id) on delete cascade,
  invited_by_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled', 'removed')),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists shop_team_invites_pending_uidx
  on public.shop_team_invites (shop_id, barber_id)
  where status = 'pending';

create index if not exists shop_team_invites_shop_status_idx
  on public.shop_team_invites (shop_id, status, created_at desc);

create index if not exists shop_team_invites_barber_status_idx
  on public.shop_team_invites (barber_id, status, created_at desc);

alter table public.shop_team_invites enable row level security;

drop policy if exists "shop team invites owner read" on public.shop_team_invites;
create policy "shop team invites owner read"
  on public.shop_team_invites
  for select
  using (
    exists (
      select 1
      from public.locations l
      join public.shops s on s.id = l.reference_code
      where l.id = shop_id
        and s.owner_profile_id = auth.uid()
    )
  );

drop policy if exists "shop team invites barber read" on public.shop_team_invites;
create policy "shop team invites barber read"
  on public.shop_team_invites
  for select
  using (barber_profile_id = auth.uid());

drop policy if exists "shop team invites owner write" on public.shop_team_invites;
create policy "shop team invites owner write"
  on public.shop_team_invites
  for insert
  with check (
    exists (
      select 1
      from public.locations l
      join public.shops s on s.id = l.reference_code
      where l.id = shop_id
        and s.owner_profile_id = auth.uid()
    )
  );

drop policy if exists "shop team invites barber update" on public.shop_team_invites;
create policy "shop team invites barber update"
  on public.shop_team_invites
  for update
  using (barber_profile_id = auth.uid())
  with check (barber_profile_id = auth.uid());

comment on table public.shop_team_invites is 'Canonical shop-to-barber team invitation lifecycle before staff location membership is created.';
