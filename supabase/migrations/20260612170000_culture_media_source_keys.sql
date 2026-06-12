alter table public.culture_media
  add column if not exists source_table text,
  add column if not exists source_id text,
  add column if not exists source_surface text;

with source_candidates as (
  select
    cm.id,
    nullif(coalesce(cm.source_table, cm.metadata->>'source_table'), '') as source_table,
    nullif(coalesce(cm.source_id, cm.metadata->>'source_id'), '') as source_id,
    nullif(coalesce(cm.source_surface, cm.metadata->>'source_surface'), '') as source_surface,
    cm.created_at
  from public.culture_media cm
  where coalesce(cm.source_table, cm.metadata->>'source_table') is not null
    and coalesce(cm.source_id, cm.metadata->>'source_id') is not null
    and coalesce(cm.source_surface, cm.metadata->>'source_surface') is not null
),
ranked_sources as (
  select
    *,
    row_number() over (
      partition by source_table, source_id, source_surface
      order by created_at desc nulls last, id desc
    ) as source_rank
  from source_candidates
  where source_table is not null
    and source_id is not null
    and source_surface is not null
)
update public.culture_media cm
set
  source_table = case when ranked_sources.source_rank = 1 then ranked_sources.source_table else null end,
  source_id = case when ranked_sources.source_rank = 1 then ranked_sources.source_id else null end,
  source_surface = case when ranked_sources.source_rank = 1 then ranked_sources.source_surface else null end,
  metadata = case
    when ranked_sources.source_rank = 1 then
      coalesce(cm.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source_table', ranked_sources.source_table,
          'source_id', ranked_sources.source_id,
          'source_surface', ranked_sources.source_surface
        )
    else
      coalesce(cm.metadata, '{}'::jsonb)
        || jsonb_build_object('duplicate_source_key_unindexed', true)
  end
from ranked_sources
where cm.id = ranked_sources.id;

with canonical_source_media as (
  select
    cm.id as media_id,
    cm.post_id,
    cm.source_table
  from public.culture_media cm
  where cm.source_surface = 'profile_studio'
    and cm.source_table in ('barber_portfolio', 'shop_media_asset')
    and cm.source_id is not null
),
approved_barber_posts as (
  select cp.id
  from public.culture_posts cp
  join canonical_source_media cm on cm.post_id = cp.id
  join public.barbers b on b.id = cp.barber_id
  where cm.source_table = 'barber_portfolio'
    and cp.author_role = 'barber_user'::public.app_role
    and cp.author_profile_id = b.profile_id
    and b.app_approval_status = 'approved'::public.approval_status
),
approved_owner_posts as (
  select cp.id
  from public.culture_posts cp
  join canonical_source_media cm on cm.post_id = cp.id
  join public.shops s on s.id = cp.shop_id
  where cm.source_table = 'shop_media_asset'
    and cp.author_role = 'shop_owner_user'::public.app_role
    and cp.author_profile_id = s.owner_profile_id
    and s.app_approval_status = 'approved'::public.approval_status
),
approved_profile_posts as (
  select id from approved_barber_posts
  union
  select id from approved_owner_posts
)
update public.culture_posts cp
set
  publishing_status = 'published',
  moderation_status = 'approved',
  visibility = 'public',
  updated_at = now(),
  metadata = coalesce(cp.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'autoLiveBackfilled', true,
      'autoLiveBackfilledAt', now()
    )
where cp.id in (select id from approved_profile_posts);

with canonical_source_media as (
  select
    cm.id as media_id,
    cm.post_id
  from public.culture_media cm
  where cm.source_surface = 'profile_studio'
    and cm.source_table in ('barber_portfolio', 'shop_media_asset')
    and cm.source_id is not null
)
update public.culture_media cm
set
  processing_status = 'ready',
  moderation_status = 'approved',
  metadata = coalesce(cm.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'autoLiveBackfilled', true,
      'autoLiveBackfilledAt', now()
    )
where cm.id in (
  select canonical_source_media.media_id
  from canonical_source_media
  join public.culture_posts cp on cp.id = canonical_source_media.post_id
  where cp.publishing_status = 'published'
    and cp.moderation_status = 'approved'
    and cp.visibility = 'public'
);

create index if not exists culture_media_source_lookup_idx
  on public.culture_media (source_surface, source_table, source_id)
  where source_table is not null
    and source_id is not null
    and source_surface is not null;

create unique index if not exists culture_media_source_unique_idx
  on public.culture_media (source_table, source_id, source_surface)
  where source_table is not null
    and source_id is not null
    and source_surface is not null;

comment on column public.culture_media.source_table is
  'Canonical source table for media bridged into Culture, used to prevent duplicate posts for Profile Studio media.';
comment on column public.culture_media.source_id is
  'Canonical source row id for media bridged into Culture.';
comment on column public.culture_media.source_surface is
  'Source surface for bridged media, such as profile_studio.';
comment on index public.culture_media_source_unique_idx is
  'Prevents future duplicate Culture media rows for the same source_table/source_id/source_surface. Existing duplicate rows keep metadata but remain unindexed.';
