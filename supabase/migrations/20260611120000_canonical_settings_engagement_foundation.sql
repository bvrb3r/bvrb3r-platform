alter table public.notification_preferences
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade,
  add column if not exists notification_preferences jsonb not null default '{}'::jsonb,
  add column if not exists quiet_hours_start text,
  add column if not exists quiet_hours_end text,
  add column if not exists preferred_contact_channel text not null default 'in_app',
  add column if not exists message_alerts_enabled boolean not null default true,
  add column if not exists booking_alerts_enabled boolean not null default true,
  add column if not exists payout_alerts_enabled boolean not null default true,
  add column if not exists creator_alerts_enabled boolean not null default false,
  add column if not exists rewards_alerts_enabled boolean not null default true;

create index if not exists notification_preferences_profile_idx
  on public.notification_preferences (profile_id, role)
  where profile_id is not null;

create table if not exists public.user_app_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  preferences jsonb not null default '{}'::jsonb,
  automation_preferences jsonb not null default '{}'::jsonb,
  default_view text not null default 'role_default',
  preferred_contact_channel text not null default 'in_app',
  rebooking_reminders_enabled boolean not null default false,
  auto_book_suggestions_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, role)
);

create table if not exists public.privacy_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  preferences jsonb not null default '{}'::jsonb,
  public_profile_visibility text not null default 'role_safe',
  follow_visibility text not null default 'private',
  saved_items_visibility text not null default 'private',
  activity_visibility text not null default 'private',
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, role),
  check (follow_visibility in ('private', 'followers', 'public')),
  check (saved_items_visibility in ('private')),
  check (activity_visibility in ('private'))
);

create table if not exists public.user_engagement_edges (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_role public.app_role not null,
  edge_type text not null check (edge_type in ('follow', 'save', 'favorite', 'like')),
  target_type text not null,
  target_id text not null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  visibility text not null default 'private' check (visibility in ('private', 'followers', 'public')),
  status text not null default 'active' check (status in ('active', 'removed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (actor_profile_id, edge_type, target_type, target_id)
);

create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_role public.app_role not null,
  event_type text not null,
  target_type text,
  target_id text,
  target_profile_id uuid references public.profiles(id) on delete set null,
  engagement_edge_id uuid references public.user_engagement_edges(id) on delete set null,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.user_safety_edges (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_role public.app_role not null,
  safety_type text not null check (safety_type in ('block', 'mute', 'report')),
  target_type text not null,
  target_id text not null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  reason text,
  details text,
  status text not null default 'active' check (status in ('active', 'resolved', 'removed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (actor_profile_id, safety_type, target_type, target_id)
);

create index if not exists user_app_preferences_profile_idx
  on public.user_app_preferences (profile_id, role);

create index if not exists privacy_preferences_profile_idx
  on public.privacy_preferences (profile_id, role);

create index if not exists user_engagement_edges_actor_idx
  on public.user_engagement_edges (actor_profile_id, edge_type, status, updated_at desc);

create index if not exists user_engagement_edges_public_follow_idx
  on public.user_engagement_edges (target_type, target_id, updated_at desc)
  where edge_type = 'follow' and visibility = 'public' and status = 'active' and deleted_at is null;

create index if not exists user_activity_events_actor_idx
  on public.user_activity_events (actor_profile_id, occurred_at desc);

create index if not exists user_safety_edges_actor_idx
  on public.user_safety_edges (actor_profile_id, safety_type, status, updated_at desc);

alter table public.notification_preferences enable row level security;
alter table public.user_app_preferences enable row level security;
alter table public.privacy_preferences enable row level security;
alter table public.user_engagement_edges enable row level security;
alter table public.user_activity_events enable row level security;
alter table public.user_safety_edges enable row level security;

drop policy if exists "notification preferences self or owner" on public.notification_preferences;
drop policy if exists "notification preferences self manage" on public.notification_preferences;
create policy "notification preferences self manage"
  on public.notification_preferences
  for all
  using (
    profile_id = auth.uid()
    or user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.primary_onboarding_role = 'platform_admin'
    )
  )
  with check (
    profile_id = auth.uid()
    or user_email = coalesce(auth.jwt() ->> 'email', '')
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.primary_onboarding_role = 'platform_admin'
    )
  );

drop policy if exists "user app preferences self manage" on public.user_app_preferences;
create policy "user app preferences self manage"
  on public.user_app_preferences
  for all
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.primary_onboarding_role = 'platform_admin'
    )
  )
  with check (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.primary_onboarding_role = 'platform_admin'
    )
  );

drop policy if exists "privacy preferences self manage" on public.privacy_preferences;
create policy "privacy preferences self manage"
  on public.privacy_preferences
  for all
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.primary_onboarding_role = 'platform_admin'
    )
  )
  with check (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.primary_onboarding_role = 'platform_admin'
    )
  );

drop policy if exists "user engagement edges self read" on public.user_engagement_edges;
create policy "user engagement edges self read"
  on public.user_engagement_edges
  for select
  using (
    actor_profile_id = auth.uid()
    or (
      edge_type = 'follow'
      and visibility = 'public'
      and status = 'active'
      and deleted_at is null
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.primary_onboarding_role = 'platform_admin'
    )
  );

drop policy if exists "user engagement edges self insert" on public.user_engagement_edges;
create policy "user engagement edges self insert"
  on public.user_engagement_edges
  for insert
  with check (actor_profile_id = auth.uid());

drop policy if exists "user engagement edges self update" on public.user_engagement_edges;
create policy "user engagement edges self update"
  on public.user_engagement_edges
  for update
  using (actor_profile_id = auth.uid())
  with check (actor_profile_id = auth.uid());

drop policy if exists "user engagement edges self delete" on public.user_engagement_edges;
create policy "user engagement edges self delete"
  on public.user_engagement_edges
  for delete
  using (actor_profile_id = auth.uid());

drop policy if exists "user activity events self read" on public.user_activity_events;
create policy "user activity events self read"
  on public.user_activity_events
  for select
  using (
    actor_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.primary_onboarding_role = 'platform_admin'
    )
  );

drop policy if exists "user activity events self insert" on public.user_activity_events;
create policy "user activity events self insert"
  on public.user_activity_events
  for insert
  with check (actor_profile_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "user safety edges self read" on public.user_safety_edges;
create policy "user safety edges self read"
  on public.user_safety_edges
  for select
  using (
    actor_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.primary_onboarding_role = 'platform_admin'
    )
  );

drop policy if exists "user safety edges self insert" on public.user_safety_edges;
create policy "user safety edges self insert"
  on public.user_safety_edges
  for insert
  with check (actor_profile_id = auth.uid());

drop policy if exists "user safety edges self update" on public.user_safety_edges;
create policy "user safety edges self update"
  on public.user_safety_edges
  for update
  using (actor_profile_id = auth.uid())
  with check (actor_profile_id = auth.uid());

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.user_app_preferences to authenticated;
grant select, insert, update, delete on public.privacy_preferences to authenticated;
grant select, insert, update, delete on public.user_engagement_edges to authenticated;
grant select, insert on public.user_activity_events to authenticated;
grant select, insert, update on public.user_safety_edges to authenticated;

comment on table public.user_app_preferences is 'Role-scoped app behavior, dashboard defaults, and automation preference source of truth.';
comment on table public.privacy_preferences is 'Private account visibility and consent settings. Saves/favorites and activity remain private by default.';
comment on table public.user_engagement_edges is 'Canonical engagement graph for follows, saves, favorites, likes, and private relationship signals.';
comment on table public.user_activity_events is 'Private activity ledger for settings, engagement, and account control center actions.';
comment on table public.user_safety_edges is 'Private block, mute, and report graph records visible only to the actor and platform admins.';
