create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  actor_id text,
  actor_role text,
  source text not null check (source in ('ui', 'api', 'webhook', 'system')),
  related_ids jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists platform_events_idempotency_uidx
  on public.platform_events (idempotency_key);

create index if not exists platform_events_entity_idx
  on public.platform_events (entity_type, entity_id, occurred_at desc);

create index if not exists platform_events_type_idx
  on public.platform_events (event_type, occurred_at desc);

create index if not exists platform_events_actor_idx
  on public.platform_events (actor_id, occurred_at desc)
  where actor_id is not null;

create index if not exists platform_events_related_ids_gin_idx
  on public.platform_events using gin (related_ids);

alter table public.platform_events enable row level security;

drop policy if exists "Platform admins can read platform events" on public.platform_events;
create policy "Platform admins can read platform events"
  on public.platform_events
  for select
  using (
    exists (
      select 1
      from public.profiles profiles
      where profiles.id = auth.uid()
        and profiles.primary_onboarding_role = 'platform_admin'
    )
  );

drop policy if exists "Authenticated services can insert platform events" on public.platform_events;
create policy "Authenticated services can insert platform events"
  on public.platform_events
  for insert
  with check (auth.role() = 'service_role');
