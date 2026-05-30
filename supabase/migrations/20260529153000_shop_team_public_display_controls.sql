alter table public.shop_team_invites
  add column if not exists public_team_visible boolean not null default true,
  add column if not exists public_team_order integer not null default 0,
  add column if not exists featured_on_shop_profile boolean not null default false;

alter table public.staff_locations
  add column if not exists public_team_visible boolean not null default true,
  add column if not exists public_team_order integer not null default 0,
  add column if not exists featured_on_shop_profile boolean not null default false;

create index if not exists shop_team_invites_public_team_idx
  on public.shop_team_invites (shop_id, status, public_team_visible, public_team_order);

notify pgrst, 'reload schema';
