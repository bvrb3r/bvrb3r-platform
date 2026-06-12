create table if not exists public.culture_posts (
  id uuid primary key default gen_random_uuid(),
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  author_role public.app_role not null,
  barber_id uuid references public.barbers(id) on delete set null,
  shop_id text references public.shops(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  post_type text not null,
  caption text,
  visibility text not null default 'public',
  moderation_status text not null default 'pending',
  publishing_status text not null default 'draft',
  is_bookable boolean not null default false,
  is_promoted boolean not null default false,
  allow_comments boolean not null default false,
  quality_score numeric not null default 0,
  trust_score numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint culture_posts_author_role_ck check (author_role in (
    'client_user'::public.app_role,
    'barber_user'::public.app_role,
    'shop_owner_user'::public.app_role
  )),
  constraint culture_posts_visibility_ck check (visibility in ('public', 'followers', 'private', 'unlisted')),
  constraint culture_posts_moderation_status_ck check (moderation_status in ('pending', 'approved', 'rejected', 'flagged', 'removed')),
  constraint culture_posts_publishing_status_ck check (publishing_status in ('draft', 'published', 'archived', 'deleted')),
  constraint culture_posts_post_type_ck check (post_type in (
    'barber_cut',
    'barber_before_after',
    'barber_availability',
    'barber_tutorial',
    'shop_update',
    'shop_walkins',
    'shop_team',
    'shop_open_chair',
    'client_cut_review',
    'style_inspiration',
    'bvrb3r_official'
  ))
);

create table if not exists public.culture_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.culture_posts(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  media_url text,
  thumbnail_url text,
  media_type text not null,
  width integer,
  height integer,
  duration_seconds integer,
  sort_order integer not null default 0,
  processing_status text not null default 'ready',
  moderation_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint culture_media_media_type_ck check (media_type in ('image', 'video')),
  constraint culture_media_processing_status_ck check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  constraint culture_media_moderation_status_ck check (moderation_status in ('pending', 'approved', 'rejected', 'flagged', 'removed'))
);

create table if not exists public.culture_post_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.culture_posts(id) on delete cascade,
  tag text not null,
  tag_type text not null,
  created_at timestamptz not null default now(),
  constraint culture_post_tags_tag_type_ck check (tag_type in (
    'style',
    'service',
    'city',
    'shop',
    'barber',
    'event',
    'product',
    'business',
    'education',
    'community'
  ))
);

create table if not exists public.culture_engagements (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.culture_posts(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_role public.app_role not null,
  engagement_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (post_id, actor_profile_id, engagement_type),
  constraint culture_engagements_actor_role_ck check (actor_role in (
    'client_user'::public.app_role,
    'barber_user'::public.app_role,
    'shop_owner_user'::public.app_role
  )),
  constraint culture_engagements_type_ck check (engagement_type in (
    'view',
    'watch_complete',
    'like',
    'save',
    'share',
    'comment',
    'profile_click',
    'book_click',
    'shop_click',
    'message_click',
    'not_interested',
    'report'
  ))
);

create table if not exists public.culture_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.culture_posts(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_role public.app_role not null,
  body text not null,
  moderation_status text not null default 'pending',
  parent_comment_id uuid references public.culture_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint culture_comments_actor_role_ck check (actor_role in (
    'client_user'::public.app_role,
    'barber_user'::public.app_role,
    'shop_owner_user'::public.app_role
  )),
  constraint culture_comments_moderation_status_ck check (moderation_status in ('pending', 'approved', 'rejected', 'flagged', 'removed'))
);

create table if not exists public.culture_feed_events (
  id uuid primary key default gen_random_uuid(),
  feed_session_id uuid not null default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_role public.app_role not null,
  post_id uuid references public.culture_posts(id) on delete set null,
  event_type text not null,
  surface text not null default 'culture_feed',
  position integer,
  reason_codes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint culture_feed_events_actor_role_ck check (actor_role in (
    'client_user'::public.app_role,
    'barber_user'::public.app_role,
    'shop_owner_user'::public.app_role
  )),
  constraint culture_feed_events_type_ck check (event_type in (
    'feed_loaded',
    'post_impression',
    'post_view',
    'post_click',
    'like_clicked',
    'save_clicked',
    'share_clicked',
    'profile_clicked',
    'book_clicked',
    'shop_clicked',
    'not_interested',
    'report_clicked',
    'grid_tile_clicked'
  ))
);

create table if not exists public.culture_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.culture_posts(id) on delete cascade,
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  reporter_role public.app_role not null,
  reason text not null,
  details text,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint culture_reports_reporter_role_ck check (reporter_role in (
    'client_user'::public.app_role,
    'barber_user'::public.app_role,
    'shop_owner_user'::public.app_role
  )),
  constraint culture_reports_status_ck check (status in ('open', 'reviewing', 'resolved', 'dismissed'))
);

create table if not exists public.culture_promotions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.culture_posts(id) on delete cascade,
  promoter_profile_id uuid not null references public.profiles(id) on delete cascade,
  promoter_role public.app_role not null,
  status text not null default 'draft',
  goal text,
  budget_cents integer,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint culture_promotions_promoter_role_ck check (promoter_role in (
    'client_user'::public.app_role,
    'barber_user'::public.app_role,
    'shop_owner_user'::public.app_role
  )),
  constraint culture_promotions_status_ck check (status in ('draft', 'pending_review', 'approved', 'active', 'paused', 'ended', 'rejected'))
);

create index if not exists culture_posts_author_idx
  on public.culture_posts (author_profile_id, created_at desc);

create index if not exists culture_posts_feed_idx
  on public.culture_posts (publishing_status, moderation_status, visibility, created_at desc);

create index if not exists culture_media_post_idx
  on public.culture_media (post_id, sort_order);

create index if not exists culture_post_tags_post_idx
  on public.culture_post_tags (post_id);

create index if not exists culture_post_tags_lookup_idx
  on public.culture_post_tags (tag_type, tag);

create index if not exists culture_engagements_post_idx
  on public.culture_engagements (post_id, engagement_type, created_at desc);

create index if not exists culture_feed_events_actor_idx
  on public.culture_feed_events (actor_profile_id, created_at desc);

create index if not exists culture_reports_post_idx
  on public.culture_reports (post_id, status);

alter table public.culture_posts enable row level security;
alter table public.culture_media enable row level security;
alter table public.culture_post_tags enable row level security;
alter table public.culture_engagements enable row level security;
alter table public.culture_comments enable row level security;
alter table public.culture_feed_events enable row level security;
alter table public.culture_reports enable row level security;
alter table public.culture_promotions enable row level security;

drop policy if exists "culture posts public approved read" on public.culture_posts;
create policy "culture posts public approved read"
  on public.culture_posts
  for select
  to anon, authenticated
  using (
    publishing_status = 'published'
    and moderation_status = 'approved'
    and visibility = 'public'
    and deleted_at is null
  );

drop policy if exists "culture posts author private read" on public.culture_posts;
create policy "culture posts author private read"
  on public.culture_posts
  for select
  to authenticated
  using (author_profile_id = auth.uid());

drop policy if exists "culture posts barber own insert" on public.culture_posts;
create policy "culture posts barber own insert"
  on public.culture_posts
  for insert
  to authenticated
  with check (
    author_profile_id = auth.uid()
    and author_role = 'barber_user'::public.app_role
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('barber_user', 'barber', 'commission_barber', 'booth_rent_barber', 'freelance_barber')
    )
  );

drop policy if exists "culture posts owner own insert" on public.culture_posts;
create policy "culture posts owner own insert"
  on public.culture_posts
  for insert
  to authenticated
  with check (
    author_profile_id = auth.uid()
    and author_role = 'shop_owner_user'::public.app_role
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('shop_owner_user', 'owner', 'shop_owner')
    )
  );

drop policy if exists "culture posts author safe update" on public.culture_posts;
create policy "culture posts author safe update"
  on public.culture_posts
  for update
  to authenticated
  using (
    author_profile_id = auth.uid()
    and publishing_status in ('draft', 'published')
    and deleted_at is null
  )
  with check (
    author_profile_id = auth.uid()
    and publishing_status in ('draft', 'published', 'archived', 'deleted')
  );

drop policy if exists "culture posts author safe delete" on public.culture_posts;
create policy "culture posts author safe delete"
  on public.culture_posts
  for delete
  to authenticated
  using (
    author_profile_id = auth.uid()
    and publishing_status in ('draft', 'published')
  );

drop policy if exists "culture posts platform admin manage" on public.culture_posts;
create policy "culture posts platform admin manage"
  on public.culture_posts
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
    )
  );

drop policy if exists "culture media readable post read" on public.culture_media;
create policy "culture media readable post read"
  on public.culture_media
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.culture_posts cp
      where cp.id = culture_media.post_id
        and cp.publishing_status = 'published'
        and cp.moderation_status = 'approved'
        and cp.visibility = 'public'
        and cp.deleted_at is null
    )
  );

drop policy if exists "culture media author manage" on public.culture_media;
create policy "culture media author manage"
  on public.culture_media
  for all
  to authenticated
  using (
    exists (
      select 1 from public.culture_posts cp
      where cp.id = culture_media.post_id
        and cp.author_profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.culture_posts cp
      where cp.id = culture_media.post_id
        and cp.author_profile_id = auth.uid()
    )
  );

drop policy if exists "culture post tags readable post read" on public.culture_post_tags;
create policy "culture post tags readable post read"
  on public.culture_post_tags
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.culture_posts cp
      where cp.id = culture_post_tags.post_id
        and cp.publishing_status = 'published'
        and cp.moderation_status = 'approved'
        and cp.visibility = 'public'
        and cp.deleted_at is null
    )
  );

drop policy if exists "culture post tags author manage" on public.culture_post_tags;
create policy "culture post tags author manage"
  on public.culture_post_tags
  for all
  to authenticated
  using (
    exists (
      select 1 from public.culture_posts cp
      where cp.id = culture_post_tags.post_id
        and cp.author_profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.culture_posts cp
      where cp.id = culture_post_tags.post_id
        and cp.author_profile_id = auth.uid()
    )
  );

drop policy if exists "culture engagements actor read" on public.culture_engagements;
create policy "culture engagements actor read"
  on public.culture_engagements
  for select
  to authenticated
  using (
    actor_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
    )
  );

drop policy if exists "culture engagements actor insert" on public.culture_engagements;
create policy "culture engagements actor insert"
  on public.culture_engagements
  for insert
  to authenticated
  with check (actor_profile_id = auth.uid());

drop policy if exists "culture comments public approved read" on public.culture_comments;
create policy "culture comments public approved read"
  on public.culture_comments
  for select
  to anon, authenticated
  using (
    moderation_status = 'approved'
    and deleted_at is null
    and exists (
      select 1 from public.culture_posts cp
      where cp.id = culture_comments.post_id
        and cp.publishing_status = 'published'
        and cp.moderation_status = 'approved'
        and cp.visibility = 'public'
        and cp.deleted_at is null
    )
  );

drop policy if exists "culture comments actor insert" on public.culture_comments;
create policy "culture comments actor insert"
  on public.culture_comments
  for insert
  to authenticated
  with check (
    actor_profile_id = auth.uid()
    and exists (
      select 1 from public.culture_posts cp
      where cp.id = culture_comments.post_id
        and cp.allow_comments = true
        and cp.publishing_status = 'published'
        and cp.moderation_status = 'approved'
        and cp.deleted_at is null
    )
  );

drop policy if exists "culture comments actor update" on public.culture_comments;
create policy "culture comments actor update"
  on public.culture_comments
  for update
  to authenticated
  using (actor_profile_id = auth.uid() and deleted_at is null)
  with check (actor_profile_id = auth.uid());

drop policy if exists "culture feed events actor insert" on public.culture_feed_events;
create policy "culture feed events actor insert"
  on public.culture_feed_events
  for insert
  to authenticated
  with check (actor_profile_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "culture feed events actor read" on public.culture_feed_events;
create policy "culture feed events actor read"
  on public.culture_feed_events
  for select
  to authenticated
  using (
    actor_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
    )
  );

drop policy if exists "culture reports actor insert" on public.culture_reports;
create policy "culture reports actor insert"
  on public.culture_reports
  for insert
  to authenticated
  with check (reporter_profile_id = auth.uid());

drop policy if exists "culture reports reporter admin read" on public.culture_reports;
create policy "culture reports reporter admin read"
  on public.culture_reports
  for select
  to authenticated
  using (
    reporter_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
    )
  );

drop policy if exists "culture reports admin update" on public.culture_reports;
create policy "culture reports admin update"
  on public.culture_reports
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
    )
  );

drop policy if exists "culture promotions promoter admin manage" on public.culture_promotions;
create policy "culture promotions promoter admin manage"
  on public.culture_promotions
  for all
  to authenticated
  using (
    promoter_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
    )
  )
  with check (
    promoter_profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
    )
  );

grant select on public.culture_posts to anon, authenticated;
grant select on public.culture_media to anon, authenticated;
grant select on public.culture_post_tags to anon, authenticated;
grant select on public.culture_comments to anon, authenticated;

grant insert, update, delete on public.culture_posts to authenticated;
grant insert, update, delete on public.culture_media to authenticated;
grant insert, update, delete on public.culture_post_tags to authenticated;
grant select, insert on public.culture_engagements to authenticated;
grant insert, update on public.culture_comments to authenticated;
grant select, insert on public.culture_feed_events to authenticated;
grant select, insert, update on public.culture_reports to authenticated;
grant select, insert, update, delete on public.culture_promotions to authenticated;

comment on table public.culture_posts is 'Canonical Culture Feed post truth. Client general posting is intentionally gated in v1.';
comment on column public.culture_posts.shop_id is 'Text shop reference because public.shops.id is text in this repository.';
comment on table public.culture_media is 'Canonical Culture media rows attached to posts without exposing private storage or identity details.';
comment on table public.culture_engagements is 'Culture engagement rows. Actor identities are private; public payloads must use aggregate-safe service output.';
comment on table public.culture_feed_events is 'Private Culture feed telemetry for ranking, safety, and product analytics.';
comment on table public.culture_reports is 'Private Culture report records readable only by reporter or platform admin.';
comment on table public.culture_promotions is 'Culture promotion scaffold only; paid promotion logic is not active in v1.';
