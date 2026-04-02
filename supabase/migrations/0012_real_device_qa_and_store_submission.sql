create table if not exists public.native_push_tokens (
  id text primary key,
  user_email text not null,
  app_role public.app_role not null,
  client_reference text,
  barber_reference text,
  device_id text not null,
  provider text not null,
  token_hash text not null,
  token_preview text not null,
  status text not null default 'pending',
  environment text not null default 'unknown',
  bundle_or_package_id text,
  app_version text,
  runtime_mode text not null default 'native_wrap_ready',
  rotated_from_id text,
  last_registered_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists native_push_tokens_unique_device_hash_idx
  on public.native_push_tokens (user_email, device_id, provider, token_hash);

create index if not exists native_push_tokens_user_provider_idx
  on public.native_push_tokens (user_email, provider, status, updated_at desc);

create index if not exists native_push_tokens_device_provider_idx
  on public.native_push_tokens (device_id, provider, updated_at desc);

alter table public.native_push_tokens enable row level security;

drop policy if exists "native push tokens scoped read" on public.native_push_tokens;
drop policy if exists "native push tokens self mutate" on public.native_push_tokens;

create policy "native push tokens scoped read" on public.native_push_tokens
  for select using (
    user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "native push tokens self mutate" on public.native_push_tokens
  for all using (
    user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  ) with check (
    user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

comment on table public.native_push_tokens is 'Hashed APNs and FCM device token ledger for wrapped-native push activation and rotation.';
comment on column public.native_push_tokens.token_hash is 'SHA-256 hash of the native APNs or FCM token. Raw tokens are never stored in this table.';
comment on column public.native_push_tokens.token_preview is 'Short preview used for operator-safe QA and support workflows.';
comment on column public.native_push_tokens.rotated_from_id is 'Prior active token record replaced during secure token refresh.';
comment on column public.native_push_tokens.environment is 'Runtime delivery environment reported during registration, such as development, staging, or production.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'native_push_tokens'
  ) then
    execute 'alter publication supabase_realtime add table public.native_push_tokens';
  end if;
end $$;
