create table if not exists public.device_registrations (
  id text primary key,
  user_email text not null,
  app_role public.app_role not null,
  client_reference text,
  barber_reference text,
  device_id text not null,
  platform text not null default 'unknown',
  runtime_mode text not null default 'browser',
  device_label text not null,
  status text not null default 'active',
  user_agent text,
  push_supported boolean not null default false,
  share_supported boolean not null default false,
  standalone_supported boolean not null default false,
  service_worker_supported boolean not null default false,
  notification_permission text not null default 'default',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_email, device_id)
);

create table if not exists public.push_subscriptions (
  id text primary key,
  user_email text not null,
  app_role public.app_role not null,
  client_reference text,
  barber_reference text,
  device_id text not null,
  endpoint text not null,
  provider text not null default 'web_push_placeholder',
  status text not null default 'pending',
  p256dh_key text,
  auth_key text,
  expiration_time timestamptz,
  platform text not null default 'unknown',
  runtime_mode text not null default 'browser',
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_email, device_id)
);

create table if not exists public.notification_delivery_attempts (
  id text primary key,
  delivery_reference text not null,
  notification_reference text not null,
  channel text not null,
  provider text not null,
  status text not null,
  user_email text not null,
  destination text not null,
  attempt_number integer not null default 1,
  device_id text,
  push_subscription_reference text,
  deep_link_url text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deep_link_events (
  id text primary key,
  route text not null,
  label text not null,
  web_url text not null,
  app_url text not null,
  source text not null,
  user_email text,
  app_role public.app_role,
  device_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists device_registrations_user_idx on public.device_registrations (user_email, status, updated_at desc);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_email, status, updated_at desc);
create index if not exists notification_delivery_attempts_user_idx on public.notification_delivery_attempts (user_email, status, created_at desc);
create index if not exists notification_delivery_attempts_delivery_idx on public.notification_delivery_attempts (delivery_reference, attempt_number);
create index if not exists deep_link_events_user_idx on public.deep_link_events (user_email, created_at desc);
create index if not exists deep_link_events_route_idx on public.deep_link_events (route, created_at desc);

alter table public.device_registrations enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.deep_link_events enable row level security;

drop policy if exists "device registrations scoped read" on public.device_registrations;
drop policy if exists "device registrations self mutate" on public.device_registrations;
drop policy if exists "push subscriptions scoped read" on public.push_subscriptions;
drop policy if exists "push subscriptions self mutate" on public.push_subscriptions;
drop policy if exists "delivery attempts scoped read" on public.notification_delivery_attempts;
drop policy if exists "deep link events scoped read" on public.deep_link_events;
drop policy if exists "deep link events self mutate" on public.deep_link_events;

create policy "device registrations scoped read" on public.device_registrations
  for select using (
    user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "device registrations self mutate" on public.device_registrations
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

create policy "push subscriptions scoped read" on public.push_subscriptions
  for select using (
    user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "push subscriptions self mutate" on public.push_subscriptions
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

create policy "delivery attempts scoped read" on public.notification_delivery_attempts
  for select using (
    user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "deep link events scoped read" on public.deep_link_events
  for select using (
    user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "deep link events self mutate" on public.deep_link_events
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

comment on table public.device_registrations is 'Per-user and per-device registration ledger for mobile and PWA activation.';
comment on table public.push_subscriptions is 'Push subscription storage for browser and future wrapped-app notification targets.';
comment on table public.notification_delivery_attempts is 'Per-attempt notification delivery ledger with push-device targeting and deep-link metadata.';
comment on table public.deep_link_events is 'Deep-link generation and open events for app-ready routing and future native packaging analytics.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'device_registrations'
  ) then
    execute 'alter publication supabase_realtime add table public.device_registrations';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'push_subscriptions'
  ) then
    execute 'alter publication supabase_realtime add table public.push_subscriptions';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notification_delivery_attempts'
  ) then
    execute 'alter publication supabase_realtime add table public.notification_delivery_attempts';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deep_link_events'
  ) then
    execute 'alter publication supabase_realtime add table public.deep_link_events';
  end if;
end $$;
