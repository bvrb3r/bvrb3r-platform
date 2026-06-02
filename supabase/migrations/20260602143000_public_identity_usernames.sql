alter table public.profiles
  add column if not exists public_username text;

alter table public.shops
  add column if not exists public_username text;

create unique index if not exists profiles_public_username_uidx
  on public.profiles (lower(public_username))
  where public_username is not null and btrim(public_username) <> '';

create unique index if not exists shops_public_username_uidx
  on public.shops (lower(public_username))
  where public_username is not null and btrim(public_username) <> '';

notify pgrst, 'reload schema';
