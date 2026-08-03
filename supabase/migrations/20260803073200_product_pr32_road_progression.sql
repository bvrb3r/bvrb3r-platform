-- Staging ledger version: 20260803073200.
begin;

create schema if not exists private;

-- The Road configuration is server-owned. Achievement keys are mapped to
-- verified platform events; browsers cannot assert completion.
create table if not exists public.road_set_rules (
  role text not null,
  set_index smallint not null,
  badge_key text not null,
  required_achievement_keys text[] not null,
  created_at timestamptz not null default now(),
  primary key (role, set_index),
  unique (role, badge_key),
  constraint road_set_rules_role_ck check (role in ('client_user', 'barber_user', 'shop_owner_user')),
  constraint road_set_rules_set_index_ck check (set_index between 0 and 4),
  constraint road_set_rules_required_keys_ck check (cardinality(required_achievement_keys) > 0)
);

insert into public.road_set_rules (role, set_index, badge_key, required_achievement_keys)
values
  ('client_user', 0, 'client.doorstep', array['client.account_created','client.contact_verified','client.username_claimed','client.guest_visits_claimed']),
  ('client_user', 1, 'client.fresh_fade', array['client.profile_completed','client.payment_method_saved','client.first_booking_created','client.first_cut_completed','client.first_review_published','client.first_barber_favorited']),
  ('client_user', 2, 'client.the_regular', array['client.same_barber_rebooked','client.three_cuts_completed','client.notifications_enabled','client.five_barbers_followed','client.first_like_and_comment']),
  ('client_user', 3, 'client.tastemaker', array['client.culture_booking_completed','client.first_post_shared','client.five_cut_streak','client.first_in_app_tip','client.first_referral_counted']),
  ('client_user', 4, 'client.gold_member', array['client.membership_activated','client.first_cut_gifted','client.first_concierge_booking','client.first_marketplace_order','client.ten_cut_streak']),
  ('barber_user', 0, 'barber.claimed_chair', array['barber.account_created','barber.username_claimed','barber.contact_verified']),
  ('barber_user', 1, 'barber.licensed_verified', array['barber.license_verified','barber.payout_connected','barber.menu_built','barber.availability_published','barber.profile_published']),
  ('barber_user', 2, 'barber.first_money', array['barber.first_booking_received','barber.first_checkout_completed','barber.first_tip_received','barber.walk_ins_enabled','barber.kiosk_activated','barber.first_rebook_sent']),
  ('barber_user', 3, 'barber.the_operator', array['barber.chairsync_connected','barber.first_clientbridge_conversion','barber.twenty_five_cuts_completed','barber.first_culture_post_published','barber.relationship_decided']),
  ('barber_user', 4, 'barber.master_craft', array['barber.pro_activated','barber.first_gifted_cut_received','barber.autobooth_authorized','barber.rent_autopay_enabled','barber.hundred_cuts_completed']),
  ('shop_owner_user', 0, 'owner.keyholder', array['owner.account_created','owner.shop_identity_completed','owner.shop_hours_set']),
  ('shop_owner_user', 1, 'owner.verified_shop', array['owner.business_verified','owner.stripe_connected','owner.policies_published','owner.shop_profile_published']),
  ('shop_owner_user', 2, 'owner.full_roster', array['owner.first_barber_invited','owner.first_barber_accepted','owner.first_rent_agreement_signed','owner.barber_permissions_set']),
  ('shop_owner_user', 3, 'owner.floor_general', array['owner.kiosk_paired','owner.rotation_configured','owner.first_kiosk_walk_in','owner.first_floor_day','owner.waiting_room_tv_activated']),
  ('shop_owner_user', 4, 'owner.empire', array['owner.empire_activated','owner.barber_pools_seeded','owner.autobooth_offered','owner.first_zero_reconciliation','owner.second_location_added'])
on conflict (role, set_index) do update
set badge_key = excluded.badge_key,
    required_achievement_keys = excluded.required_achievement_keys;

create table if not exists public.road_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  set_index smallint not null,
  achievement_key text not null,
  source_event_id uuid not null references public.platform_events(id) on delete restrict,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, role, achievement_key),
  unique (user_id, source_event_id, achievement_key),
  constraint road_progress_role_ck check (role in ('client_user', 'barber_user', 'shop_owner_user')),
  constraint road_progress_set_index_ck check (set_index between 0 and 4)
);

create index if not exists road_progress_user_role_set_idx
  on public.road_progress (user_id, role, set_index, completed_at);
create index if not exists road_progress_source_event_idx
  on public.road_progress (source_event_id);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  set_index smallint not null,
  badge_key text not null,
  earned_at timestamptz not null,
  shared_at timestamptz,
  share_post_id uuid references public.culture_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role, set_index),
  unique (user_id, role, badge_key),
  unique (share_post_id),
  constraint badges_role_ck check (role in ('client_user', 'barber_user', 'shop_owner_user')),
  constraint badges_set_index_ck check (set_index between 0 and 4),
  constraint badges_share_pair_ck check ((shared_at is null) = (share_post_id is null))
);

create index if not exists badges_user_role_earned_idx
  on public.badges (user_id, role, earned_at desc);

-- A null referred_user_id row owns the code. Conversion rows reuse that code;
-- counted_at is written only when the referred account earns its SET 1 badge.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  referrer_role text not null,
  code text not null,
  referred_user_id uuid references public.profiles(id) on delete restrict,
  counted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referrals_role_ck check (referrer_role in ('client_user', 'barber_user', 'shop_owner_user')),
  constraint referrals_code_ck check (code ~ '^BVR-[A-Z0-9]{12}$'),
  constraint referrals_not_self_ck check (referred_user_id is null or referred_user_id <> referrer_user_id),
  constraint referrals_counted_user_ck check (counted_at is null or referred_user_id is not null)
);

create unique index if not exists referrals_code_owner_uidx
  on public.referrals (referrer_user_id, referrer_role)
  where referred_user_id is null;
create unique index if not exists referrals_code_uidx
  on public.referrals (code)
  where referred_user_id is null;
create unique index if not exists referrals_conversion_uidx
  on public.referrals (referrer_user_id, referred_user_id)
  where referred_user_id is not null;
do $$
begin
  if exists (
    select 1
    from public.referrals referral
    where referral.referred_user_id is not null
    group by referral.referred_user_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'PR32 cannot enforce one referral conversion because duplicate referred accounts exist.';
  end if;
end;
$$;
create unique index if not exists referrals_referred_user_uidx
  on public.referrals (referred_user_id)
  where referred_user_id is not null;
create index if not exists referrals_referred_pending_idx
  on public.referrals (referred_user_id, created_at)
  where referred_user_id is not null and counted_at is null;
create index if not exists referrals_referrer_counted_idx
  on public.referrals (referrer_user_id, referrer_role, counted_at desc)
  where counted_at is not null;

create table if not exists public.road_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  leaderboard_visible boolean not null default false,
  leaderboard_pushes_enabled boolean not null default false,
  milestone_pushes_enabled boolean not null default true,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, role),
  constraint road_preferences_role_ck check (role in ('client_user', 'barber_user', 'shop_owner_user')),
  constraint road_preferences_timezone_ck check (length(btrim(timezone)) between 1 and 100)
);

create or replace function private.pr32_validate_road_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.timezone := btrim(new.timezone);
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone_name
    where timezone_name.name = new.timezone
  ) then
    raise exception using
      errcode = '22023',
      message = 'Road timezone must be a recognized IANA timezone.';
  end if;
  return new;
end;
$$;

revoke all on function private.pr32_validate_road_timezone()
  from public, anon, authenticated, service_role;
grant execute on function private.pr32_validate_road_timezone() to postgres;

drop trigger if exists pr32_validate_road_timezone on public.road_preferences;
create trigger pr32_validate_road_timezone
before insert or update of timezone on public.road_preferences
for each row execute function private.pr32_validate_road_timezone();

create table if not exists public.road_streak_shields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_event_id uuid not null references public.platform_events(id) on delete restrict,
  earned_at timestamptz not null,
  spent_at timestamptz,
  spent_for_window date,
  created_at timestamptz not null default now(),
  unique (user_id, source_event_id),
  constraint road_streak_shields_spend_pair_ck check ((spent_at is null) = (spent_for_window is null))
);

create index if not exists road_streak_shields_available_idx
  on public.road_streak_shields (user_id, earned_at)
  where spent_at is null;

create table if not exists public.road_streak_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  window_start date not null,
  status text not null,
  shield_id uuid references public.road_streak_shields(id) on delete restrict,
  source_event_id uuid not null references public.platform_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, window_start),
  constraint road_streak_windows_status_ck check (status in ('completed', 'protected', 'missed')),
  constraint road_streak_windows_shield_ck check (
    (status = 'protected' and shield_id is not null)
    or (status <> 'protected' and shield_id is null)
  )
);

create index if not exists road_streak_windows_user_idx
  on public.road_streak_windows (user_id, window_start desc);

create table if not exists public.road_push_definitions (
  role text not null,
  push_key text not null,
  leaderboard_related boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (role, push_key),
  constraint road_push_definitions_role_ck check (role in ('client_user', 'barber_user', 'shop_owner_user'))
);

insert into public.road_push_definitions (role, push_key, leaderboard_related)
values
  ('client_user','set_1_complete',false),
  ('client_user','streak_at_risk',false),
  ('client_user','referral_counted',false),
  ('client_user','leaderboard_digest',true),
  ('client_user','summit_open',false),
  ('barber_user','set_1_complete',false),
  ('barber_user','first_money',false),
  ('barber_user','cut_milestone',false),
  ('barber_user','referral_counted',false),
  ('barber_user','summit_open',false),
  ('shop_owner_user','shop_verified',false),
  ('shop_owner_user','first_kiosk_walk_in',false),
  ('shop_owner_user','rent_reconciled',false),
  ('shop_owner_user','referral_counted',false),
  ('shop_owner_user','summit_open',false)
on conflict (role, push_key) do update
set leaderboard_related = excluded.leaderboard_related;

create table if not exists public.road_milestone_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  push_key text not null,
  source_event_id uuid not null references public.platform_events(id) on delete restrict,
  status text not null,
  scheduled_for timestamptz,
  suppression_reason text,
  created_at timestamptz not null default now(),
  unique (user_id, role, push_key, source_event_id),
  constraint road_milestone_pushes_role_ck check (role in ('client_user', 'barber_user', 'shop_owner_user')),
  constraint road_milestone_pushes_status_ck check (status in ('queued', 'scheduled', 'suppressed', 'delivered', 'failed')),
  constraint road_milestone_pushes_suppression_ck check (
    (status = 'suppressed' and suppression_reason is not null)
    or (status <> 'suppressed' and suppression_reason is null)
  )
);

create index if not exists road_milestone_pushes_daily_idx
  on public.road_milestone_pushes (user_id, role, created_at desc)
  where status <> 'suppressed';
create index if not exists road_milestone_pushes_delivery_idx
  on public.road_milestone_pushes (status, scheduled_for, created_at)
  where status in ('queued', 'scheduled', 'failed');

alter table public.road_set_rules enable row level security;
alter table public.road_set_rules force row level security;
alter table public.road_progress enable row level security;
alter table public.road_progress force row level security;
alter table public.badges enable row level security;
alter table public.badges force row level security;
alter table public.referrals enable row level security;
alter table public.referrals force row level security;
alter table public.road_preferences enable row level security;
alter table public.road_preferences force row level security;
alter table public.road_streak_shields enable row level security;
alter table public.road_streak_shields force row level security;
alter table public.road_streak_windows enable row level security;
alter table public.road_streak_windows force row level security;
alter table public.road_push_definitions enable row level security;
alter table public.road_push_definitions force row level security;
alter table public.road_milestone_pushes enable row level security;
alter table public.road_milestone_pushes force row level security;

create policy "road progress self read"
  on public.road_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "road badges self read"
  on public.badges for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "road referrals participant read"
  on public.referrals for select to authenticated
  using ((select auth.uid()) = referrer_user_id or (select auth.uid()) = referred_user_id);
create policy "road preferences self read"
  on public.road_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "road preferences self insert"
  on public.road_preferences for insert to authenticated
  with check (
    (select auth.uid()) = public.road_preferences.user_id
    and exists (
      select 1
      from public.profiles p
      where p.id = public.road_preferences.user_id
        and p.role::text = public.road_preferences.role
    )
  );
create policy "road preferences self update"
  on public.road_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = public.road_preferences.user_id
    and exists (
      select 1
      from public.profiles p
      where p.id = public.road_preferences.user_id
        and p.role::text = public.road_preferences.role
    )
  );
create policy "road streak shields self read"
  on public.road_streak_shields for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "road streak windows self read"
  on public.road_streak_windows for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "road milestone pushes self read"
  on public.road_milestone_pushes for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.road_set_rules, public.road_progress, public.badges,
  public.referrals, public.road_preferences, public.road_streak_shields,
  public.road_streak_windows, public.road_push_definitions,
  public.road_milestone_pushes from anon, authenticated;
grant select on public.road_progress, public.badges, public.referrals,
  public.road_preferences, public.road_streak_shields,
  public.road_streak_windows, public.road_milestone_pushes to authenticated;
grant insert, update on public.road_preferences to authenticated;
grant all on public.road_set_rules, public.road_progress, public.badges,
  public.referrals, public.road_preferences, public.road_streak_shields,
  public.road_streak_windows, public.road_push_definitions,
  public.road_milestone_pushes to service_role;

create or replace function private.pr32_lock_road_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'road progress is immutable';
end;
$$;

revoke all on function private.pr32_lock_road_progress() from public, anon, authenticated, service_role;
grant execute on function private.pr32_lock_road_progress() to postgres;

drop trigger if exists pr32_lock_road_progress on public.road_progress;
create trigger pr32_lock_road_progress
  before update or delete on public.road_progress
  for each row execute function private.pr32_lock_road_progress();

create or replace function private.pr32_lock_badge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'earned badges cannot be deleted';
  end if;

  if new.user_id <> old.user_id
     or new.role <> old.role
     or new.set_index <> old.set_index
     or new.badge_key <> old.badge_key
     or new.earned_at <> old.earned_at
     or new.created_at <> old.created_at then
    raise exception 'earned badge identity is immutable';
  end if;

  if old.shared_at is not null
     and (new.shared_at is distinct from old.shared_at
       or new.share_post_id is distinct from old.share_post_id) then
    raise exception 'a badge can be shared only once';
  end if;

  return new;
end;
$$;

revoke all on function private.pr32_lock_badge() from public, anon, authenticated, service_role;
grant execute on function private.pr32_lock_badge() to postgres;

drop trigger if exists pr32_lock_badge on public.badges;
create trigger pr32_lock_badge
  before update or delete on public.badges
  for each row execute function private.pr32_lock_badge();

create or replace function private.pr32_lock_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'road referral evidence cannot be deleted';
  end if;
  if new.referrer_user_id <> old.referrer_user_id
     or new.referrer_role <> old.referrer_role
     or new.code <> old.code
     or new.referred_user_id is distinct from old.referred_user_id
     or new.created_at <> old.created_at then
    raise exception 'road referral identity is immutable';
  end if;
  if old.counted_at is not null and new.counted_at is distinct from old.counted_at then
    raise exception 'counted referral evidence is immutable';
  end if;
  return new;
end;
$$;

revoke all on function private.pr32_lock_referral() from public, anon, authenticated, service_role;
grant execute on function private.pr32_lock_referral() to postgres;

drop trigger if exists pr32_lock_referral on public.referrals;
create trigger pr32_lock_referral
  before update or delete on public.referrals
  for each row execute function private.pr32_lock_referral();

create or replace function private.pr32_lock_streak_shield()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'streak shields cannot be deleted';
  end if;
  if new.user_id <> old.user_id
     or new.source_event_id <> old.source_event_id
     or new.earned_at <> old.earned_at
     or new.created_at <> old.created_at then
    raise exception 'streak shield identity is immutable';
  end if;
  if old.spent_at is not null
     and (new.spent_at is distinct from old.spent_at
       or new.spent_for_window is distinct from old.spent_for_window) then
    raise exception 'spent streak shields cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function private.pr32_lock_streak_shield() from public, anon, authenticated, service_role;
grant execute on function private.pr32_lock_streak_shield() to postgres;

drop trigger if exists pr32_lock_streak_shield on public.road_streak_shields;
create trigger pr32_lock_streak_shield
  before update or delete on public.road_streak_shields
  for each row execute function private.pr32_lock_streak_shield();

create or replace function public.pr32_record_road_event(
  p_user_id uuid,
  p_role text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.platform_events%rowtype;
  set_rule public.road_set_rules%rowtype;
  recorded boolean := false;
  badge_earned boolean := false;
  achievement_count integer := 0;
  completion_time timestamptz;
begin
  if p_role not in ('client_user', 'barber_user', 'shop_owner_user') then
    raise exception 'unsupported road role';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role::text = p_role
  ) then
    raise exception 'road identity does not match the canonical profile role';
  end if;

  select * into event_row
  from public.platform_events e
  where e.id = p_event_id;
  if not found then
    raise exception 'platform event evidence was not found';
  end if;
  if event_row.source = 'ui' then
    raise exception 'client-asserted road completion is prohibited';
  end if;
  if coalesce(event_row.related_ids ->> 'road_user_id', event_row.actor_id, '') <> p_user_id::text then
    raise exception 'platform event evidence is not bound to this road account';
  end if;

  select * into set_rule
  from public.road_set_rules r
  where r.role = p_role
    and event_row.event_type = any(r.required_achievement_keys);
  if not found then
    return jsonb_build_object('status', 'ignored', 'reason', 'event_not_bound');
  end if;

  if set_rule.set_index > 0 and not exists (
    select 1 from public.badges b
    where b.user_id = p_user_id
      and b.role = p_role
      and b.set_index = set_rule.set_index - 1
  ) then
    return jsonb_build_object('status', 'deferred', 'reason', 'previous_set_incomplete');
  end if;

  completion_time := coalesce(event_row.occurred_at, event_row.created_at, now());
  insert into public.road_progress (
    user_id, role, set_index, achievement_key, source_event_id, completed_at
  ) values (
    p_user_id, p_role, set_rule.set_index, event_row.event_type, p_event_id, completion_time
  )
  on conflict (user_id, role, achievement_key) do nothing;
  recorded := found;

  select count(distinct rp.achievement_key)::integer
  into achievement_count
  from public.road_progress rp
  where rp.user_id = p_user_id
    and rp.role = p_role
    and rp.set_index = set_rule.set_index
    and rp.achievement_key = any(set_rule.required_achievement_keys);

  if achievement_count = cardinality(set_rule.required_achievement_keys) then
    insert into public.badges (user_id, role, set_index, badge_key, earned_at)
    values (p_user_id, p_role, set_rule.set_index, set_rule.badge_key, completion_time)
    on conflict (user_id, role, set_index) do nothing;
    badge_earned := found;

    if badge_earned and set_rule.set_index = 1 then
      update public.referrals
      set counted_at = completion_time
      where referred_user_id = p_user_id
        and counted_at is null;
    end if;
  end if;

  return jsonb_build_object(
    'status', case when recorded then 'recorded' else 'duplicate' end,
    'setIndex', set_rule.set_index,
    'achievementKey', event_row.event_type,
    'badgeEarned', badge_earned
  );
end;
$$;

revoke all on function public.pr32_record_road_event(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.pr32_record_road_event(uuid, text, uuid)
  to service_role;

create or replace function public.pr32_ensure_referral_code(
  p_user_id uuid,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_code text;
  generated_code text;
begin
  if p_role not in ('client_user', 'barber_user', 'shop_owner_user') then
    raise exception 'unsupported road role';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role::text = p_role
  ) then
    raise exception 'road identity does not match the canonical profile role';
  end if;

  select r.code into existing_code
  from public.referrals r
  where r.referrer_user_id = p_user_id
    and r.referrer_role = p_role
    and r.referred_user_id is null;
  if found then
    return existing_code;
  end if;

  generated_code := 'BVR-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 12));
  insert into public.referrals (referrer_user_id, referrer_role, code)
  values (p_user_id, p_role, generated_code)
  on conflict (referrer_user_id, referrer_role) where referred_user_id is null
  do nothing;

  select r.code into existing_code
  from public.referrals r
  where r.referrer_user_id = p_user_id
    and r.referrer_role = p_role
    and r.referred_user_id is null;
  return existing_code;
end;
$$;

revoke all on function public.pr32_ensure_referral_code(uuid, text)
  from public, anon, authenticated;
grant execute on function public.pr32_ensure_referral_code(uuid, text)
  to service_role;

create or replace function public.pr32_attach_referral(
  p_code text,
  p_referred_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_row public.referrals%rowtype;
  referral_id uuid;
begin
  select * into owner_row
  from public.referrals r
  where r.code = upper(btrim(p_code))
    and r.referred_user_id is null;
  if not found then
    raise exception 'referral code was not found';
  end if;
  if owner_row.referrer_user_id = p_referred_user_id then
    raise exception 'self-referral is prohibited';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_referred_user_id) then
    raise exception 'referred profile was not found';
  end if;

  insert into public.referrals (
    referrer_user_id, referrer_role, code, referred_user_id
  ) values (
    owner_row.referrer_user_id, owner_row.referrer_role, owner_row.code, p_referred_user_id
  )
  on conflict (referred_user_id) where referred_user_id is not null
  do nothing
  returning id into referral_id;
  if referral_id is null then
    select referral.id into referral_id
    from public.referrals referral
    where referral.referred_user_id = p_referred_user_id;
  end if;
  return referral_id;
end;
$$;

revoke all on function public.pr32_attach_referral(text, uuid)
  from public, anon, authenticated;
grant execute on function public.pr32_attach_referral(text, uuid)
  to service_role;

create or replace function public.pr32_get_friend_leaderboard(
  p_viewer_user_id uuid,
  p_role text
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  completed_achievements integer,
  total_achievements integer,
  percent integer,
  earned_badges integer,
  current_set integer,
  is_viewer boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer_allowed as (
    select 1
    from public.road_preferences rp
    where rp.user_id = p_viewer_user_id
      and rp.role = p_role
      and rp.leaderboard_visible
  ),
  mutual_friends as (
    select e1.target_profile_id as user_id
    from public.user_engagement_edges e1
    join public.user_engagement_edges e2
      on e2.actor_profile_id = e1.target_profile_id
     and e2.target_profile_id = p_viewer_user_id
     and e2.edge_type = 'follow'
     and e2.status = 'active'
     and e2.deleted_at is null
    where e1.actor_profile_id = p_viewer_user_id
      and e1.edge_type = 'follow'
      and e1.status = 'active'
      and e1.deleted_at is null
      and e1.target_profile_id is not null
  ),
  candidates as (
    select p_viewer_user_id as user_id
    union
    select mf.user_id from mutual_friends mf
  ),
  totals as (
    select coalesce(sum(cardinality(r.required_achievement_keys)), 0)::integer as count
    from public.road_set_rules r
    where r.role = p_role
  ),
  scored as (
    select
      c.user_id,
      p.full_name,
      p.public_username,
      count(distinct rp.achievement_key)::integer as completed_count,
      totals.count as total_count,
      count(distinct b.id)::integer as badge_count,
      coalesce(min(rules.set_index) filter (where b.id is null), 4)::integer as active_set
    from candidates c
    join viewer_allowed va on true
    join public.profiles p on p.id = c.user_id and p.role::text = p_role
    join public.road_preferences prefs
      on prefs.user_id = c.user_id
     and prefs.role = p_role
     and prefs.leaderboard_visible
    cross join totals
    join public.road_set_rules rules on rules.role = p_role
    left join public.road_progress rp
      on rp.user_id = c.user_id and rp.role = p_role
    left join public.badges b
      on b.user_id = c.user_id and b.role = p_role and b.set_index = rules.set_index
    group by c.user_id, p.full_name, p.public_username, totals.count
  )
  select
    s.user_id,
    s.full_name,
    nullif(btrim(s.public_username), ''),
    s.completed_count,
    s.total_count,
    case when s.total_count = 0 then 0
      else round((s.completed_count::numeric / s.total_count::numeric) * 100)::integer end,
    s.badge_count,
    s.active_set,
    s.user_id = p_viewer_user_id
  from scored s
  order by s.completed_count desc, s.badge_count desc, s.user_id;
$$;

revoke all on function public.pr32_get_friend_leaderboard(uuid, text)
  from public, anon, authenticated;
grant execute on function public.pr32_get_friend_leaderboard(uuid, text)
  to service_role;

create or replace function public.pr32_award_streak_shield(
  p_user_id uuid,
  p_source_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.platform_events%rowtype;
  available_count integer;
  inserted_id uuid;
begin
  perform 1
  from public.profiles p
  where p.id = p_user_id and p.role::text = 'client_user'
  for update;
  if not found then
    raise exception 'streak shields are client-road only';
  end if;
  select * into event_row from public.platform_events e where e.id = p_source_event_id;
  if not found or event_row.source = 'ui' then
    raise exception 'verified server event evidence is required';
  end if;
  if coalesce(event_row.related_ids ->> 'road_user_id', event_row.actor_id, '') <> p_user_id::text then
    raise exception 'streak shield event is not bound to this client account';
  end if;
  if event_row.event_type not in (
    'client.set_2_completed', 'client.referral_counted', 'client.five_cut_streak'
  ) then
    raise exception 'event is not a streak shield earn path';
  end if;

  select count(*)::integer into available_count
  from public.road_streak_shields s
  where s.user_id = p_user_id and s.spent_at is null;
  if available_count >= 3 then
    return jsonb_build_object('status', 'capped', 'available', available_count);
  end if;

  insert into public.road_streak_shields (user_id, source_event_id, earned_at)
  values (p_user_id, p_source_event_id, coalesce(event_row.occurred_at, event_row.created_at, now()))
  on conflict (user_id, source_event_id) do nothing
  returning id into inserted_id;
  return jsonb_build_object(
    'status', case when inserted_id is null then 'duplicate' else 'awarded' end,
    'shieldId', inserted_id
  );
end;
$$;

revoke all on function public.pr32_award_streak_shield(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.pr32_award_streak_shield(uuid, uuid)
  to service_role;

create or replace function public.pr32_apply_client_streak_window(
  p_user_id uuid,
  p_window_start date,
  p_completed boolean,
  p_source_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.platform_events%rowtype;
  shield_row public.road_streak_shields%rowtype;
  window_status text;
begin
  perform 1
  from public.profiles p
  where p.id = p_user_id and p.role::text = 'client_user'
  for update;
  if not found then
    raise exception 'streak windows are client-road only';
  end if;
  select * into event_row from public.platform_events e where e.id = p_source_event_id;
  if not found or event_row.source = 'ui' then
    raise exception 'verified server event evidence is required';
  end if;
  if coalesce(event_row.related_ids ->> 'road_user_id', event_row.actor_id, '') <> p_user_id::text then
    raise exception 'streak window event is not bound to this client account';
  end if;
  if (p_completed and event_row.event_type <> 'client.streak_window_completed')
     or (not p_completed and event_row.event_type <> 'client.streak_window_missed') then
    raise exception 'streak event does not match the window result';
  end if;

  if exists (
    select 1 from public.road_streak_windows w
    where w.user_id = p_user_id and w.window_start = p_window_start
  ) then
    select w.status into window_status
    from public.road_streak_windows w
    where w.user_id = p_user_id and w.window_start = p_window_start;
    return jsonb_build_object('status', 'duplicate', 'windowStatus', window_status);
  end if;

  if p_completed then
    window_status := 'completed';
    insert into public.road_streak_windows (
      user_id, window_start, status, source_event_id
    ) values (p_user_id, p_window_start, window_status, p_source_event_id);
  else
    select * into shield_row
    from public.road_streak_shields s
    where s.user_id = p_user_id and s.spent_at is null
    order by s.earned_at, s.id
    for update skip locked
    limit 1;

    if found then
      update public.road_streak_shields
      set spent_at = coalesce(event_row.occurred_at, event_row.created_at, now()),
          spent_for_window = p_window_start
      where id = shield_row.id;
      window_status := 'protected';
      insert into public.road_streak_windows (
        user_id, window_start, status, shield_id, source_event_id
      ) values (
        p_user_id, p_window_start, window_status, shield_row.id, p_source_event_id
      );
    else
      window_status := 'missed';
      insert into public.road_streak_windows (
        user_id, window_start, status, source_event_id
      ) values (p_user_id, p_window_start, window_status, p_source_event_id);
    end if;
  end if;

  return jsonb_build_object('status', 'recorded', 'windowStatus', window_status);
end;
$$;

revoke all on function public.pr32_apply_client_streak_window(uuid, date, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.pr32_apply_client_streak_window(uuid, date, boolean, uuid)
  to service_role;

create or replace function public.pr32_queue_milestone_push(
  p_user_id uuid,
  p_role text,
  p_push_key text,
  p_source_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.platform_events%rowtype;
  definition_row public.road_push_definitions%rowtype;
  preference_row public.road_preferences%rowtype;
  local_now timestamp;
  local_day date;
  daily_count integer;
  next_delivery timestamptz;
  push_status text := 'queued';
  suppression text;
  inserted_id uuid;
begin
  perform 1
  from public.profiles p
  where p.id = p_user_id and p.role::text = p_role
  for update;
  if not found then
    raise exception 'road identity does not match the canonical profile role';
  end if;
  select * into event_row from public.platform_events e where e.id = p_source_event_id;
  if not found or event_row.source = 'ui' then
    raise exception 'verified server event evidence is required';
  end if;
  if coalesce(event_row.related_ids ->> 'road_user_id', event_row.actor_id, '') <> p_user_id::text then
    raise exception 'milestone push event is not bound to this road account';
  end if;
  select * into definition_row
  from public.road_push_definitions d
  where d.role = p_role and d.push_key = p_push_key;
  if not found then
    raise exception 'unsupported road push';
  end if;

  select * into preference_row
  from public.road_preferences p
  where p.user_id = p_user_id and p.role = p_role;
  if not found then
    preference_row.timezone := 'America/New_York';
    preference_row.leaderboard_pushes_enabled := false;
    preference_row.milestone_pushes_enabled := true;
  end if;

  if not preference_row.milestone_pushes_enabled then
    push_status := 'suppressed';
    suppression := 'milestone_pushes_disabled';
  elsif definition_row.leaderboard_related and not preference_row.leaderboard_pushes_enabled then
    push_status := 'suppressed';
    suppression := 'leaderboard_pushes_off_by_default';
  end if;

  local_now := now() at time zone preference_row.timezone;
  local_day := local_now::date;
  select count(*)::integer into daily_count
  from public.road_milestone_pushes p
  where p.user_id = p_user_id
    and p.role = p_role
    and p.status <> 'suppressed'
    and (p.created_at at time zone preference_row.timezone)::date = local_day;
  if push_status <> 'suppressed' and daily_count >= 2 then
    push_status := 'suppressed';
    suppression := 'daily_cap_reached';
  end if;

  if push_status <> 'suppressed' then
    if local_now::time >= time '21:00' then
      push_status := 'scheduled';
      next_delivery := ((local_day + 1) + time '09:00') at time zone preference_row.timezone;
    elsif local_now::time < time '09:00' then
      push_status := 'scheduled';
      next_delivery := (local_day + time '09:00') at time zone preference_row.timezone;
    end if;
  end if;

  insert into public.road_milestone_pushes (
    user_id, role, push_key, source_event_id, status, scheduled_for, suppression_reason
  ) values (
    p_user_id, p_role, p_push_key, p_source_event_id, push_status, next_delivery, suppression
  )
  on conflict (user_id, role, push_key, source_event_id) do nothing
  returning id into inserted_id;

  return jsonb_build_object(
    'status', case when inserted_id is null then 'duplicate' else push_status end,
    'pushId', inserted_id,
    'scheduledFor', next_delivery,
    'suppressionReason', suppression
  );
end;
$$;

revoke all on function public.pr32_queue_milestone_push(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.pr32_queue_milestone_push(uuid, text, text, uuid)
  to service_role;

-- Road badge posts are first-class Culture posts. Captions remain moderation-
-- pending; generated media never auto-posts without the earner's explicit action.
alter table public.culture_posts
  drop constraint if exists culture_posts_post_type_ck;
alter table public.culture_posts
  add constraint culture_posts_post_type_ck check (post_type in (
    'barber_cut', 'barber_before_after', 'barber_availability',
    'barber_tutorial', 'shop_update', 'shop_walkins', 'shop_team',
    'shop_open_chair', 'client_cut_review', 'style_inspiration',
    'bvrb3r_official', 'road_badge'
  ));

create or replace function public.pr32_share_badge_to_culture(
  p_user_id uuid,
  p_badge_id uuid,
  p_caption text,
  p_media_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  badge_row public.badges%rowtype;
  post_id uuid;
  target_barber_id uuid;
  target_client_id uuid;
  target_shop_id text;
begin
  if length(btrim(coalesce(p_caption, ''))) not between 1 and 2200 then
    raise exception 'badge caption must be between 1 and 2200 characters';
  end if;
  if p_media_url !~ '^/api/road/badges/[0-9a-f-]{36}/share-card$' then
    raise exception 'badge share media URL is invalid';
  end if;

  select * into badge_row
  from public.badges b
  where b.id = p_badge_id and b.user_id = p_user_id
  for update;
  if not found then
    raise exception 'earned badge was not found';
  end if;
  if badge_row.shared_at is not null then
    raise exception 'badge was already shared';
  end if;

  if badge_row.role = 'barber_user' then
    select b.id into target_barber_id
    from public.barbers b where b.profile_id = p_user_id limit 1;
  elsif badge_row.role = 'client_user' then
    select c.id into target_client_id
    from public.clients c where c.profile_id = p_user_id limit 1;
  elsif badge_row.role = 'shop_owner_user' then
    select s.id into target_shop_id
    from public.shops s where s.owner_profile_id = p_user_id limit 1;
  end if;

  insert into public.culture_posts (
    author_profile_id, author_role, barber_id, shop_id, client_id,
    post_type, caption, visibility, moderation_status, publishing_status,
    is_bookable, allow_comments, metadata
  ) values (
    p_user_id, badge_row.role::public.app_role, target_barber_id, target_shop_id,
    target_client_id, 'road_badge', btrim(p_caption), 'public', 'pending',
    'published', badge_row.role <> 'client_user', true,
    jsonb_build_object(
      'roadBadgeId', badge_row.id,
      'roadBadgeKey', badge_row.badge_key,
      'roadSetIndex', badge_row.set_index,
      'platformFundedReward', true
    )
  ) returning id into post_id;

  insert into public.culture_media (
    post_id, media_url, media_type, width, height, processing_status,
    moderation_status, metadata
  ) values (
    post_id, p_media_url, 'image', 1080, 1350, 'ready', 'pending',
    jsonb_build_object('generatedBy', 'pr32_road_badge_card')
  );

  update public.badges
  set shared_at = now(), share_post_id = post_id
  where id = badge_row.id;
  return post_id;
end;
$$;

revoke all on function public.pr32_share_badge_to_culture(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.pr32_share_badge_to_culture(uuid, uuid, text, text)
  to service_role;

comment on table public.road_progress is
  'PR32 immutable achievement completions accepted only from verified, non-UI platform event evidence.';
comment on table public.badges is
  'PR32 immutable earned set badges. Only the one-time explicit Culture share fields may advance.';
comment on table public.referrals is
  'PR32 referral code and conversion evidence. counted_at advances only when the referred user completes SET 1.';
comment on table public.road_preferences is
  'PR32 friends-only leaderboard and milestone push privacy. Leaderboard visibility and pushes default off.';
comment on table public.road_streak_shields is
  'PR32 client streak shields: max three available, never expire, never purchasable, and auto-spent one per missed window.';
comment on table public.road_milestone_pushes is
  'PR32 server-enforced milestone push queue: maximum two per local day and quiet hours 21:00-09:00.';

notify pgrst, 'reload schema';

commit;
