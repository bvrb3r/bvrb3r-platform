alter table public.shops
  add column if not exists public_bio text,
  add column if not exists cover_photo_url text,
  add column if not exists public_hours jsonb,
  add column if not exists policies text,
  add column if not exists shop_username text;

create unique index if not exists shops_shop_username_uidx
  on public.shops (lower(shop_username))
  where shop_username is not null and btrim(shop_username) <> '';

notify pgrst, 'reload schema';
