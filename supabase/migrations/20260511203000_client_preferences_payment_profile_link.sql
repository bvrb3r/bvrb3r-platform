alter table public.client_preferences
  add column if not exists client_id uuid references public.clients(id) on delete cascade;

create index if not exists client_preferences_client_id_idx
  on public.client_preferences (client_id)
  where client_id is not null;

comment on column public.client_preferences.client_id is 'Canonical client row linked to this preference record for wallet and booking payment setup repair.';
