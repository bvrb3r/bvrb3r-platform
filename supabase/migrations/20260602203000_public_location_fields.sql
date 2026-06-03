alter table public.barber_profiles
  add column if not exists public_address text,
  add column if not exists public_city text,
  add column if not exists public_state text,
  add column if not exists public_zip text;

alter table public.shops
  add column if not exists zip_code text;

comment on column public.barber_profiles.public_address is 'Freelance barber public service address shown on public barber profiles and discovery.';
comment on column public.barber_profiles.public_city is 'Freelance barber public city used for discovery and matching.';
comment on column public.barber_profiles.public_state is 'Freelance barber public state used for discovery and matching.';
comment on column public.barber_profiles.public_zip is 'Freelance barber public ZIP code used for discovery and matching.';
comment on column public.shops.zip_code is 'Public shop ZIP code used for discovery, booking context, and future maps.';

notify pgrst, 'reload schema';
