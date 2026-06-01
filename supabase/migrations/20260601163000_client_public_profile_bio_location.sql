alter table public.profiles
  add column if not exists public_bio text,
  add column if not exists public_city text,
  add column if not exists public_state text;

notify pgrst, 'reload schema';
