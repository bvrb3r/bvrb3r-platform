begin;

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

/*
  PR #31 protected-risk RLS batch 4 candidate.

  Target tables:
  - Messaging: message_threads, thread_participants, messages,
    message_thread_requests, message_user_blocks, message_reports
  - Culture: culture_posts, culture_media, culture_post_tags,
    culture_engagements, culture_comments, culture_feed_events,
    culture_reports, culture_promotions
  - Reviews/reports/moderation: reviews, review_moderation,
    safety_reports, report_events, disputes, dispute_events,
    risk_flags, moderation_actions

  Public/anon behavior:
  - No anon access to private messages, message reports, reports,
    moderation, disputes, risk flags, or raw reviews.
  - Culture public feed rows stay anon-readable only when the parent post
    is published, approved, public, and not soft-deleted.

  Platform admin behavior:
  - platform_admin remains explicit through private helpers.
  - No role normalization or role repair happens in this migration.

  Write behavior:
  - Server/service-role paths remain authoritative for lifecycle,
    moderation, report resolution, dispute resolution, and system messages.
  - Direct authenticated writes are limited to safe actor-owned inserts or
    author-owned soft updates where the existing app flow already requires it.
*/

create or replace function private.rls_batch_4_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role::text = 'platform_admin'
        or p.primary_onboarding_role::text = 'platform_admin'
      )
  );
$$;

create or replace function private.rls_batch_4_is_profile_reference(
  p_reference text,
  p_email text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_reference is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.id::text = p_reference
          or lower(p.email) = lower(coalesce(p_email, ''))
          or lower(p.email) = lower(p_reference)
        )
    );
$$;

create or replace function private.rls_batch_4_is_shop_operator_reference(
  p_location_reference text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_location_reference is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('shop_owner_user', 'manager', 'front_desk')
    )
    and (
      exists (
        select 1
        from public.shops s
        where s.owner_profile_id = auth.uid()
          and s.id = p_location_reference
      )
      or exists (
        select 1
        from public.staff_locations sl
        left join public.locations l on l.id = sl.location_id
        where sl.profile_id = auth.uid()
          and coalesce(sl.relationship_status, 'active') = 'active'
          and sl.ended_at is null
          and (
            sl.location_id::text = p_location_reference
            or sl.shop_id = p_location_reference
            or l.reference_code = p_location_reference
          )
      )
    );
$$;

create or replace function private.rls_batch_4_is_message_thread_participant(
  p_thread_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_thread_id is not null
    and exists (
      select 1
      from public.thread_participants tp
      where tp.thread_id = p_thread_id
        and tp.profile_id = auth.uid()
    );
$$;

create or replace function private.rls_batch_4_can_read_culture_post(
  p_post_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_post_id is not null
    and exists (
      select 1
      from public.culture_posts cp
      where cp.id = p_post_id
        and (
          (
            cp.publishing_status = 'published'
            and cp.moderation_status = 'approved'
            and cp.visibility = 'public'
            and cp.deleted_at is null
          )
          or cp.author_profile_id = auth.uid()
          or private.rls_batch_4_is_platform_admin()
        )
    );
$$;

create or replace function private.rls_batch_4_can_manage_culture_post(
  p_post_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_post_id is not null
    and exists (
      select 1
      from public.culture_posts cp
      where cp.id = p_post_id
        and (
          cp.author_profile_id = auth.uid()
          or private.rls_batch_4_is_platform_admin()
        )
    );
$$;

create or replace function private.rls_batch_4_can_read_safety_report(
  p_report_id text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_report_id is not null
    and exists (
      select 1
      from public.safety_reports sr
      where sr.id = p_report_id
        and (
          private.rls_batch_4_is_platform_admin()
          or private.rls_batch_4_is_profile_reference(sr.reporter_reference, sr.reporter_email)
        )
    );
$$;

create or replace function private.rls_batch_4_can_read_dispute(
  p_dispute_id text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_dispute_id is not null
    and exists (
      select 1
      from public.disputes d
      where d.id = p_dispute_id
        and (
          private.rls_batch_4_is_platform_admin()
          or private.rls_batch_4_is_profile_reference(d.submitted_by_reference)
          or private.rls_batch_4_is_profile_reference(d.involved_party_reference)
          or private.rls_batch_4_is_shop_operator_reference(d.location_reference)
          or (
            d.appointment_reference is not null
            and private.can_read_booking_appointment_reference(d.appointment_reference)
          )
        )
    );
$$;

create or replace function private.rls_batch_4_can_read_review(
  p_appointment_id uuid,
  p_client_id uuid,
  p_barber_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.rls_batch_4_is_platform_admin()
    or (
      p_appointment_id is not null
      and private.can_read_booking_appointment(p_appointment_id)
    )
    or exists (
      select 1
      from public.clients c
      where c.id = p_client_id
        and c.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.barbers b
      where b.id = p_barber_id
        and b.profile_id = auth.uid()
    )
    or private.rls_batch_4_is_shop_operator_reference(p_location_id::text);
$$;

comment on function private.rls_batch_4_is_platform_admin() is
  'PR31 RLS helper: explicit platform_admin check for messaging, Culture, review, report, dispute, and moderation policies.';
comment on function private.rls_batch_4_is_profile_reference(text, text) is
  'PR31 RLS helper: maps legacy text actor/reporter references to the authenticated profile id or profile email without exposing raw private data.';
comment on function private.rls_batch_4_is_shop_operator_reference(text) is
  'PR31 RLS helper: confirms shop_owner_user or active manager/front_desk shop/location authority for report and dispute visibility.';
comment on function private.rls_batch_4_is_message_thread_participant(uuid) is
  'PR31 RLS helper: avoids recursive thread_participants policy checks while proving authenticated thread membership.';
comment on function private.rls_batch_4_can_read_culture_post(uuid) is
  'PR31 RLS helper: parent Culture post visibility for public-safe published posts, authors, and platform_admin.';
comment on function private.rls_batch_4_can_manage_culture_post(uuid) is
  'PR31 RLS helper: author/platform_admin parent Culture ownership predicate for media and tag mutations.';
comment on function private.rls_batch_4_can_read_safety_report(text) is
  'PR31 RLS helper: report events inherit reporter/platform_admin scope from the parent safety report.';
comment on function private.rls_batch_4_can_read_dispute(text) is
  'PR31 RLS helper: dispute events inherit submitter, involved party, authorized operator, appointment participant, or platform_admin scope.';
comment on function private.rls_batch_4_can_read_review(uuid, uuid, uuid, uuid) is
  'PR31 RLS helper: raw reviews are scoped to appointment participants, owning client/barber, authorized shop operator, or platform_admin. Public-safe review payloads stay server-rendered.';

revoke all on function private.rls_batch_4_is_platform_admin() from public, anon;
revoke all on function private.rls_batch_4_is_profile_reference(text, text) from public, anon;
revoke all on function private.rls_batch_4_is_shop_operator_reference(text) from public, anon;
revoke all on function private.rls_batch_4_is_message_thread_participant(uuid) from public, anon;
revoke all on function private.rls_batch_4_can_read_culture_post(uuid) from public, anon;
revoke all on function private.rls_batch_4_can_manage_culture_post(uuid) from public, anon;
revoke all on function private.rls_batch_4_can_read_safety_report(text) from public, anon;
revoke all on function private.rls_batch_4_can_read_dispute(text) from public, anon;
revoke all on function private.rls_batch_4_can_read_review(uuid, uuid, uuid, uuid) from public, anon;

grant execute on function private.rls_batch_4_is_platform_admin() to authenticated;
grant execute on function private.rls_batch_4_is_profile_reference(text, text) to authenticated;
grant execute on function private.rls_batch_4_is_shop_operator_reference(text) to authenticated;
grant execute on function private.rls_batch_4_is_message_thread_participant(uuid) to authenticated;
grant execute on function private.rls_batch_4_can_read_culture_post(uuid) to authenticated;
grant execute on function private.rls_batch_4_can_manage_culture_post(uuid) to authenticated;
grant execute on function private.rls_batch_4_can_read_safety_report(text) to authenticated;
grant execute on function private.rls_batch_4_can_read_dispute(text) to authenticated;
grant execute on function private.rls_batch_4_can_read_review(uuid, uuid, uuid, uuid) to authenticated;

alter table public.message_threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_thread_requests enable row level security;
alter table public.message_user_blocks enable row level security;
alter table public.message_reports enable row level security;
alter table public.culture_posts enable row level security;
alter table public.culture_media enable row level security;
alter table public.culture_post_tags enable row level security;
alter table public.culture_engagements enable row level security;
alter table public.culture_comments enable row level security;
alter table public.culture_feed_events enable row level security;
alter table public.culture_reports enable row level security;
alter table public.culture_promotions enable row level security;
alter table public.reviews enable row level security;
alter table public.review_moderation enable row level security;
alter table public.safety_reports enable row level security;
alter table public.report_events enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_events enable row level security;
alter table public.risk_flags enable row level security;
alter table public.moderation_actions enable row level security;

drop policy if exists "message threads participant select" on public.message_threads;
drop policy if exists "message threads participant or admin select" on public.message_threads;
create policy "message threads participant or admin select"
  on public.message_threads
  for select
  to authenticated
  using (
    private.rls_batch_4_is_message_thread_participant(public.message_threads.id)
    or private.rls_batch_4_is_platform_admin()
  );

drop policy if exists "thread participants participant select" on public.thread_participants;
drop policy if exists "thread participants same thread or admin select" on public.thread_participants;
create policy "thread participants same thread or admin select"
  on public.thread_participants
  for select
  to authenticated
  using (
    private.rls_batch_4_is_message_thread_participant(public.thread_participants.thread_id)
    or private.rls_batch_4_is_platform_admin()
  );

drop policy if exists "messages participant select" on public.messages;
drop policy if exists "messages participant insert" on public.messages;
drop policy if exists "messages participant or admin select" on public.messages;
drop policy if exists "messages participant text insert" on public.messages;
create policy "messages participant or admin select"
  on public.messages
  for select
  to authenticated
  using (
    private.rls_batch_4_is_message_thread_participant(public.messages.thread_id)
    or private.rls_batch_4_is_platform_admin()
  );

create policy "messages participant text insert"
  on public.messages
  for insert
  to authenticated
  with check (
    message_type = 'text'
    and sender_profile_id = auth.uid()
    and private.rls_batch_4_is_message_thread_participant(public.messages.thread_id)
  );

drop policy if exists "message_thread_requests_participant_select" on public.message_thread_requests;
drop policy if exists "message thread requests scoped select" on public.message_thread_requests;
drop policy if exists "message thread requests requester insert" on public.message_thread_requests;
drop policy if exists "message thread requests recipient update" on public.message_thread_requests;
create policy "message thread requests scoped select"
  on public.message_thread_requests
  for select
  to authenticated
  using (
    requested_by_profile_id = auth.uid()
    or requested_to_profile_id = auth.uid()
    or accepted_by_profile_id = auth.uid()
    or private.rls_batch_4_is_message_thread_participant(public.message_thread_requests.thread_id)
    or private.rls_batch_4_is_platform_admin()
  );

create policy "message thread requests requester insert"
  on public.message_thread_requests
  for insert
  to authenticated
  with check (
    requested_by_profile_id = auth.uid()
    and request_status = 'pending'
  );

create policy "message thread requests recipient update"
  on public.message_thread_requests
  for update
  to authenticated
  using (
    requested_to_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  )
  with check (
    requested_to_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  );

drop policy if exists "message_user_blocks_self_select" on public.message_user_blocks;
drop policy if exists "message_user_blocks_self_insert" on public.message_user_blocks;
drop policy if exists "message user blocks scoped select" on public.message_user_blocks;
drop policy if exists "message user blocks blocker insert" on public.message_user_blocks;
create policy "message user blocks scoped select"
  on public.message_user_blocks
  for select
  to authenticated
  using (
    blocker_profile_id = auth.uid()
    or blocked_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  );

create policy "message user blocks blocker insert"
  on public.message_user_blocks
  for insert
  to authenticated
  with check (blocker_profile_id = auth.uid());

drop policy if exists "message_reports_self_select" on public.message_reports;
drop policy if exists "message_reports_self_insert" on public.message_reports;
drop policy if exists "message reports reporter or admin select" on public.message_reports;
drop policy if exists "message reports reporter insert" on public.message_reports;
drop policy if exists "message reports admin update" on public.message_reports;
create policy "message reports reporter or admin select"
  on public.message_reports
  for select
  to authenticated
  using (
    reported_by_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  );

create policy "message reports reporter insert"
  on public.message_reports
  for insert
  to authenticated
  with check (reported_by_profile_id = auth.uid());

create policy "message reports admin update"
  on public.message_reports
  for update
  to authenticated
  using (private.rls_batch_4_is_platform_admin())
  with check (private.rls_batch_4_is_platform_admin());

drop policy if exists "culture posts public approved read" on public.culture_posts;
drop policy if exists "culture posts author private read" on public.culture_posts;
drop policy if exists "culture posts barber own insert" on public.culture_posts;
drop policy if exists "culture posts owner own insert" on public.culture_posts;
drop policy if exists "culture posts author safe update" on public.culture_posts;
drop policy if exists "culture posts author safe delete" on public.culture_posts;
drop policy if exists "culture posts platform admin manage" on public.culture_posts;
drop policy if exists "culture posts public approved read batch 4" on public.culture_posts;
drop policy if exists "culture posts author admin read batch 4" on public.culture_posts;
drop policy if exists "culture posts barber own insert batch 4" on public.culture_posts;
drop policy if exists "culture posts owner own insert batch 4" on public.culture_posts;
drop policy if exists "culture posts author update batch 4" on public.culture_posts;
drop policy if exists "culture posts admin update batch 4" on public.culture_posts;

create policy "culture posts public approved read batch 4"
  on public.culture_posts
  for select
  to anon, authenticated
  using (
    publishing_status = 'published'
    and moderation_status = 'approved'
    and visibility = 'public'
    and deleted_at is null
  );

create policy "culture posts author admin read batch 4"
  on public.culture_posts
  for select
  to authenticated
  using (
    author_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  );

create policy "culture posts barber own insert batch 4"
  on public.culture_posts
  for insert
  to authenticated
  with check (
    author_profile_id = auth.uid()
    and author_role = 'barber_user'::public.app_role
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text = 'barber_user'
    )
    and (
      barber_id is null
      or exists (
        select 1
        from public.barbers b
        where b.id = barber_id
          and b.profile_id = auth.uid()
      )
    )
  );

create policy "culture posts owner own insert batch 4"
  on public.culture_posts
  for insert
  to authenticated
  with check (
    author_profile_id = auth.uid()
    and author_role = 'shop_owner_user'::public.app_role
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text = 'shop_owner_user'
    )
    and (
      shop_id is null
      or exists (
        select 1
        from public.shops s
        where s.id = shop_id
          and s.owner_profile_id = auth.uid()
      )
    )
  );

create policy "culture posts author update batch 4"
  on public.culture_posts
  for update
  to authenticated
  using (
    author_profile_id = auth.uid()
    and deleted_at is null
    and moderation_status in ('pending', 'approved')
  )
  with check (
    author_profile_id = auth.uid()
    and moderation_status in ('pending', 'approved')
    and publishing_status in ('draft', 'published', 'archived', 'deleted')
  );

create policy "culture posts admin update batch 4"
  on public.culture_posts
  for update
  to authenticated
  using (private.rls_batch_4_is_platform_admin())
  with check (private.rls_batch_4_is_platform_admin());

drop policy if exists "culture media readable post read" on public.culture_media;
drop policy if exists "culture media author manage" on public.culture_media;
drop policy if exists "culture media parent read batch 4" on public.culture_media;
drop policy if exists "culture media author insert batch 4" on public.culture_media;
drop policy if exists "culture media author update batch 4" on public.culture_media;
create policy "culture media parent read batch 4"
  on public.culture_media
  for select
  to anon, authenticated
  using (
    moderation_status = 'approved'
    and processing_status = 'ready'
    and private.rls_batch_4_can_read_culture_post(public.culture_media.post_id)
  );

create policy "culture media author insert batch 4"
  on public.culture_media
  for insert
  to authenticated
  with check (private.rls_batch_4_can_manage_culture_post(public.culture_media.post_id));

create policy "culture media author update batch 4"
  on public.culture_media
  for update
  to authenticated
  using (private.rls_batch_4_can_manage_culture_post(public.culture_media.post_id))
  with check (private.rls_batch_4_can_manage_culture_post(public.culture_media.post_id));

drop policy if exists "culture post tags readable post read" on public.culture_post_tags;
drop policy if exists "culture post tags author manage" on public.culture_post_tags;
drop policy if exists "culture post tags parent read batch 4" on public.culture_post_tags;
drop policy if exists "culture post tags author insert batch 4" on public.culture_post_tags;
drop policy if exists "culture post tags author update batch 4" on public.culture_post_tags;
create policy "culture post tags parent read batch 4"
  on public.culture_post_tags
  for select
  to anon, authenticated
  using (private.rls_batch_4_can_read_culture_post(public.culture_post_tags.post_id));

create policy "culture post tags author insert batch 4"
  on public.culture_post_tags
  for insert
  to authenticated
  with check (private.rls_batch_4_can_manage_culture_post(public.culture_post_tags.post_id));

create policy "culture post tags author update batch 4"
  on public.culture_post_tags
  for update
  to authenticated
  using (private.rls_batch_4_can_manage_culture_post(public.culture_post_tags.post_id))
  with check (private.rls_batch_4_can_manage_culture_post(public.culture_post_tags.post_id));

drop policy if exists "culture engagements actor read" on public.culture_engagements;
drop policy if exists "culture engagements actor insert" on public.culture_engagements;
drop policy if exists "culture engagements actor admin read batch 4" on public.culture_engagements;
drop policy if exists "culture engagements actor insert batch 4" on public.culture_engagements;
create policy "culture engagements actor admin read batch 4"
  on public.culture_engagements
  for select
  to authenticated
  using (
    actor_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  );

create policy "culture engagements actor insert batch 4"
  on public.culture_engagements
  for insert
  to authenticated
  with check (
    actor_profile_id = auth.uid()
    and private.rls_batch_4_can_read_culture_post(public.culture_engagements.post_id)
  );

drop policy if exists "culture comments public approved read" on public.culture_comments;
drop policy if exists "culture comments actor insert" on public.culture_comments;
drop policy if exists "culture comments actor update" on public.culture_comments;
drop policy if exists "culture comments public approved read batch 4" on public.culture_comments;
drop policy if exists "culture comments actor admin read batch 4" on public.culture_comments;
drop policy if exists "culture comments actor insert batch 4" on public.culture_comments;
drop policy if exists "culture comments actor update batch 4" on public.culture_comments;
create policy "culture comments public approved read batch 4"
  on public.culture_comments
  for select
  to anon, authenticated
  using (
    moderation_status = 'approved'
    and deleted_at is null
    and private.rls_batch_4_can_read_culture_post(public.culture_comments.post_id)
  );

create policy "culture comments actor admin read batch 4"
  on public.culture_comments
  for select
  to authenticated
  using (
    actor_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  );

create policy "culture comments actor insert batch 4"
  on public.culture_comments
  for insert
  to authenticated
  with check (
    actor_profile_id = auth.uid()
    and exists (
      select 1
      from public.culture_posts cp
      where cp.id = public.culture_comments.post_id
        and cp.allow_comments = true
        and cp.publishing_status = 'published'
        and cp.moderation_status = 'approved'
        and cp.deleted_at is null
    )
  );

create policy "culture comments actor update batch 4"
  on public.culture_comments
  for update
  to authenticated
  using (actor_profile_id = auth.uid() and deleted_at is null)
  with check (actor_profile_id = auth.uid());

drop policy if exists "culture feed events actor insert" on public.culture_feed_events;
drop policy if exists "culture feed events actor read" on public.culture_feed_events;
drop policy if exists "culture feed events actor admin read batch 4" on public.culture_feed_events;
drop policy if exists "culture feed events actor insert batch 4" on public.culture_feed_events;
create policy "culture feed events actor admin read batch 4"
  on public.culture_feed_events
  for select
  to authenticated
  using (
    actor_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  );

create policy "culture feed events actor insert batch 4"
  on public.culture_feed_events
  for insert
  to authenticated
  with check (actor_profile_id = auth.uid());

drop policy if exists "culture reports actor insert" on public.culture_reports;
drop policy if exists "culture reports reporter admin read" on public.culture_reports;
drop policy if exists "culture reports admin update" on public.culture_reports;
drop policy if exists "culture reports reporter admin read batch 4" on public.culture_reports;
drop policy if exists "culture reports reporter insert batch 4" on public.culture_reports;
drop policy if exists "culture reports admin update batch 4" on public.culture_reports;
create policy "culture reports reporter admin read batch 4"
  on public.culture_reports
  for select
  to authenticated
  using (
    reporter_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  );

create policy "culture reports reporter insert batch 4"
  on public.culture_reports
  for insert
  to authenticated
  with check (reporter_profile_id = auth.uid());

create policy "culture reports admin update batch 4"
  on public.culture_reports
  for update
  to authenticated
  using (private.rls_batch_4_is_platform_admin())
  with check (private.rls_batch_4_is_platform_admin());

drop policy if exists "culture promotions promoter admin manage" on public.culture_promotions;
drop policy if exists "culture promotions promoter admin read batch 4" on public.culture_promotions;
drop policy if exists "culture promotions promoter insert batch 4" on public.culture_promotions;
drop policy if exists "culture promotions promoter update batch 4" on public.culture_promotions;
create policy "culture promotions promoter admin read batch 4"
  on public.culture_promotions
  for select
  to authenticated
  using (
    promoter_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  );

create policy "culture promotions promoter insert batch 4"
  on public.culture_promotions
  for insert
  to authenticated
  with check (
    promoter_profile_id = auth.uid()
    and status in ('draft', 'pending_review')
  );

create policy "culture promotions promoter update batch 4"
  on public.culture_promotions
  for update
  to authenticated
  using (
    promoter_profile_id = auth.uid()
    or private.rls_batch_4_is_platform_admin()
  )
  with check (
    (
      promoter_profile_id = auth.uid()
      and status in ('draft', 'pending_review', 'paused', 'ended')
    )
    or private.rls_batch_4_is_platform_admin()
  );

drop policy if exists "reviews participant select" on public.reviews;
drop policy if exists "reviews shop staff select" on public.reviews;
drop policy if exists "reviews participant shop admin select batch 4" on public.reviews;
create policy "reviews participant shop admin select batch 4"
  on public.reviews
  for select
  to authenticated
  using (
    private.rls_batch_4_can_read_review(
      public.reviews.appointment_id,
      public.reviews.client_id,
      public.reviews.barber_id,
      public.reviews.location_id
    )
  );

drop policy if exists "review moderation owner or barber" on public.review_moderation;
drop policy if exists "review moderation scoped select batch 4" on public.review_moderation;
drop policy if exists "review moderation admin update batch 4" on public.review_moderation;
create policy "review moderation scoped select batch 4"
  on public.review_moderation
  for select
  to authenticated
  using (
    private.rls_batch_4_is_platform_admin()
    or private.rls_batch_4_is_profile_reference(public.review_moderation.client_reference)
    or (
      public.review_moderation.appointment_reference is not null
      and private.can_read_booking_appointment_reference(public.review_moderation.appointment_reference)
    )
  );

create policy "review moderation admin update batch 4"
  on public.review_moderation
  for update
  to authenticated
  using (private.rls_batch_4_is_platform_admin())
  with check (private.rls_batch_4_is_platform_admin());

drop policy if exists "safety reports reporter or owner" on public.safety_reports;
drop policy if exists "safety reports reporter admin select batch 4" on public.safety_reports;
drop policy if exists "safety reports reporter insert batch 4" on public.safety_reports;
drop policy if exists "safety reports admin update batch 4" on public.safety_reports;
create policy "safety reports reporter admin select batch 4"
  on public.safety_reports
  for select
  to authenticated
  using (
    private.rls_batch_4_is_platform_admin()
    or private.rls_batch_4_is_profile_reference(
      public.safety_reports.reporter_reference,
      public.safety_reports.reporter_email
    )
  );

create policy "safety reports reporter insert batch 4"
  on public.safety_reports
  for insert
  to authenticated
  with check (
    private.rls_batch_4_is_profile_reference(
      public.safety_reports.reporter_reference,
      public.safety_reports.reporter_email
    )
  );

create policy "safety reports admin update batch 4"
  on public.safety_reports
  for update
  to authenticated
  using (private.rls_batch_4_is_platform_admin())
  with check (private.rls_batch_4_is_platform_admin());

drop policy if exists "report events reporter or owner" on public.report_events;
drop policy if exists "report events parent scoped select batch 4" on public.report_events;
drop policy if exists "report events admin insert batch 4" on public.report_events;
create policy "report events parent scoped select batch 4"
  on public.report_events
  for select
  to authenticated
  using (private.rls_batch_4_can_read_safety_report(public.report_events.report_reference));

create policy "report events admin insert batch 4"
  on public.report_events
  for insert
  to authenticated
  with check (private.rls_batch_4_is_platform_admin());

drop policy if exists "disputes scoped read" on public.disputes;
drop policy if exists "disputes scoped mutate" on public.disputes;
drop policy if exists "disputes scoped select batch 4" on public.disputes;
drop policy if exists "disputes submitter insert batch 4" on public.disputes;
drop policy if exists "disputes admin update batch 4" on public.disputes;
create policy "disputes scoped select batch 4"
  on public.disputes
  for select
  to authenticated
  using (
    private.rls_batch_4_is_platform_admin()
    or private.rls_batch_4_is_profile_reference(public.disputes.submitted_by_reference)
    or private.rls_batch_4_is_profile_reference(public.disputes.involved_party_reference)
    or private.rls_batch_4_is_shop_operator_reference(public.disputes.location_reference)
    or (
      public.disputes.appointment_reference is not null
      and private.can_read_booking_appointment_reference(public.disputes.appointment_reference)
    )
  );

create policy "disputes submitter insert batch 4"
  on public.disputes
  for insert
  to authenticated
  with check (private.rls_batch_4_is_profile_reference(public.disputes.submitted_by_reference));

create policy "disputes admin update batch 4"
  on public.disputes
  for update
  to authenticated
  using (private.rls_batch_4_is_platform_admin())
  with check (private.rls_batch_4_is_platform_admin());

drop policy if exists "dispute events scoped read" on public.dispute_events;
drop policy if exists "dispute events parent scoped select batch 4" on public.dispute_events;
drop policy if exists "dispute events admin insert batch 4" on public.dispute_events;
create policy "dispute events parent scoped select batch 4"
  on public.dispute_events
  for select
  to authenticated
  using (private.rls_batch_4_can_read_dispute(public.dispute_events.dispute_reference));

create policy "dispute events admin insert batch 4"
  on public.dispute_events
  for insert
  to authenticated
  with check (private.rls_batch_4_is_platform_admin());

drop policy if exists "risk flags owner only" on public.risk_flags;
drop policy if exists "risk flags admin select batch 4" on public.risk_flags;
drop policy if exists "risk flags admin insert batch 4" on public.risk_flags;
drop policy if exists "risk flags admin update batch 4" on public.risk_flags;
create policy "risk flags admin select batch 4"
  on public.risk_flags
  for select
  to authenticated
  using (private.rls_batch_4_is_platform_admin());

create policy "risk flags admin insert batch 4"
  on public.risk_flags
  for insert
  to authenticated
  with check (private.rls_batch_4_is_platform_admin());

create policy "risk flags admin update batch 4"
  on public.risk_flags
  for update
  to authenticated
  using (private.rls_batch_4_is_platform_admin())
  with check (private.rls_batch_4_is_platform_admin());

drop policy if exists "moderation actions owner only" on public.moderation_actions;
drop policy if exists "moderation actions admin select batch 4" on public.moderation_actions;
drop policy if exists "moderation actions admin insert batch 4" on public.moderation_actions;
create policy "moderation actions admin select batch 4"
  on public.moderation_actions
  for select
  to authenticated
  using (private.rls_batch_4_is_platform_admin());

create policy "moderation actions admin insert batch 4"
  on public.moderation_actions
  for insert
  to authenticated
  with check (private.rls_batch_4_is_platform_admin());

revoke delete on public.culture_posts from authenticated;
revoke delete on public.culture_media from authenticated;
revoke delete on public.culture_post_tags from authenticated;
revoke delete on public.culture_promotions from authenticated;

comment on table public.message_threads is
  'PR31 RLS target: thread metadata is readable only by participants or explicit platform_admin. No anon access.';
comment on table public.thread_participants is
  'PR31 RLS target: participant rows are readable only by participants in the same thread or explicit platform_admin.';
comment on table public.messages is
  'PR31 RLS target: message rows are readable only by thread participants or explicit platform_admin. Direct inserts are limited to text messages by authenticated participants; system/lifecycle writes remain server-side.';
comment on table public.message_thread_requests is
  'PR31 RLS target: request lifecycle is readable only by requester, recipient, accepted participant, or platform_admin.';
comment on table public.message_user_blocks is
  'PR31 RLS target: block rows are visible only to blocker/blocked profiles or platform_admin.';
comment on table public.message_reports is
  'PR31 RLS target: message reports are reporter/platform_admin scoped. Reporter identity and moderation status are not broadly readable.';
comment on table public.culture_posts is
  'PR31 RLS target: public Culture reads require published, approved, public, not-deleted rows. Authors and platform_admin may read private author rows. Client general posting remains gated.';
comment on table public.culture_media is
  'PR31 RLS target: media visibility follows the parent Culture post and media readiness/moderation status.';
comment on table public.culture_post_tags is
  'PR31 RLS target: tag visibility follows the parent Culture post.';
comment on table public.culture_engagements is
  'PR31 RLS target: engagement and feed telemetry are private actor/platform_admin data; public surfaces must use aggregate-safe service output.';
comment on table public.culture_feed_events is
  'PR31 RLS target: feed telemetry is private actor/platform_admin data.';
comment on table public.culture_reports is
  'PR31 RLS target: Culture reports are reporter/platform_admin scoped.';
comment on table public.culture_promotions is
  'PR31 RLS target: promotion rows remain protected scaffold data; this migration does not activate paid promotion logic.';
comment on table public.reviews is
  'PR31 RLS target: raw reviews are not anon-readable because they contain appointment/client identifiers. Public-safe review payloads remain server-rendered.';
comment on table public.review_moderation is
  'PR31 RLS target: review moderation is appointment participant/platform_admin scoped and not broadly client-readable.';
comment on table public.safety_reports is
  'PR31 RLS target: safety reports are reporter/platform_admin scoped; reporter identity is not broadly exposed.';
comment on table public.report_events is
  'PR31 RLS target: report events follow parent safety report scope.';
comment on table public.disputes is
  'PR31 RLS target: disputes are submitter, involved party, authorized shop/operator, appointment participant, or platform_admin scoped.';
comment on table public.dispute_events is
  'PR31 RLS target: dispute events follow parent dispute scope.';
comment on table public.risk_flags is
  'PR31 RLS target: risk flags are platform_admin/moderation-only.';
comment on table public.moderation_actions is
  'PR31 RLS target: moderation actions are platform_admin/moderation-only.';

notify pgrst, 'reload schema';

commit;
