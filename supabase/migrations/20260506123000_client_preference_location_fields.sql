alter table public.client_preferences
  add column if not exists preferred_city text,
  add column if not exists preferred_state text,
  add column if not exists preferred_postal_code text;

create index if not exists client_preferences_city_state_idx
  on public.client_preferences (lower(preferred_city), lower(preferred_state));

comment on column public.client_preferences.preferred_city is 'Client saved booking city used for discovery context and profile display.';
comment on column public.client_preferences.preferred_state is 'Client saved booking state used for discovery context and profile display.';
comment on column public.client_preferences.preferred_postal_code is 'Optional client saved booking postal code.';
