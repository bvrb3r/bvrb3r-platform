alter table public.media_assets
  add column if not exists featured boolean not null default false;

create unique index if not exists media_assets_one_featured_client_profile_post_idx
  on public.media_assets (owner_profile_id, asset_type)
  where featured is true and asset_type = 'client_profile_post';

create unique index if not exists barber_portfolios_one_featured_idx
  on public.barber_portfolios (barber_reference)
  where featured is true;

create unique index if not exists shop_media_assets_one_featured_idx
  on public.shop_media_assets (shop_reference)
  where featured is true;

comment on column public.media_assets.featured is 'Owner-selected public featured banner media for client Culture profiles.';
comment on index public.media_assets_one_featured_client_profile_post_idx is 'Ensures each client has one featured public Culture banner image.';
comment on index public.barber_portfolios_one_featured_idx is 'Ensures each barber has one featured public portfolio banner image.';
comment on index public.shop_media_assets_one_featured_idx is 'Ensures each shop has one featured public gallery banner image.';

notify pgrst, 'reload schema';
