begin;

alter table public.notifications
  add column if not exists deep_link text;

alter table public.notifications
  drop constraint if exists notifications_deep_link_ck;

alter table public.notifications
  add constraint notifications_deep_link_ck
  check (
    deep_link is null
    or (
      length(deep_link) between 1 and 500
      and deep_link like '/%'
      and deep_link not like '//%'
    )
  );

alter table public.notification_preferences
  add column if not exists channel_preferences jsonb not null default '{
    "booking": {"push": true, "sms": true, "email": true},
    "queue": {"push": true, "sms": true, "email": false},
    "money": {"push": true, "sms": false, "email": true},
    "culture": {"push": false, "sms": false, "email": false},
    "team": {"push": true, "sms": false, "email": true},
    "system": {"push": true, "sms": false, "email": true}
  }'::jsonb,
  add column if not exists quiet_hours_enabled boolean not null default true;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_channel_preferences_ck;

alter table public.notification_preferences
  add constraint notification_preferences_channel_preferences_ck
  check (
    jsonb_typeof(channel_preferences) = 'object'
    and channel_preferences ?& array['booking', 'queue', 'money', 'culture', 'team', 'system']
    and jsonb_typeof(channel_preferences #> '{booking,push}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{booking,sms}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{booking,email}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{queue,push}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{queue,sms}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{queue,email}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{money,push}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{money,sms}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{money,email}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{culture,push}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{culture,sms}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{culture,email}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{team,push}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{team,sms}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{team,email}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{system,push}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{system,sms}') = 'boolean'
    and jsonb_typeof(channel_preferences #> '{system,email}') = 'boolean'
  );

alter table public.notification_consent_events
  drop constraint if exists notification_consent_category_ck;

alter table public.notification_consent_events
  add constraint notification_consent_category_ck
  check (
    category in (
      'booking', 'queue', 'money', 'culture', 'team', 'system',
      'reminders', 'messages', 'rebooking', 'social',
      'marketing_barber', 'marketing_platform'
    )
  );

create index if not exists notifications_profile_unread_idx
  on public.notifications (profile_id, created_at desc)
  where read_at is null and profile_id is not null;

create index if not exists notifications_email_unread_idx
  on public.notifications (audience_email, created_at desc)
  where read_at is null and audience_email is not null;

create or replace function private.pr30_enforce_active_queue_sms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_queue boolean := false;
begin
  if new.profile_id is not null then
    select exists (
      select 1
      from public.clients c
      join public.waitlist_entries w on w.client_id = c.id
      where c.profile_id = new.profile_id
        and w.operational_sms_consent
        and w.public_queue_state in (
          'waiting', 'almost_ready', 'ready', 'grace', 'behind',
          'delayed', 'reassigned', 'rejoin'
        )
    ) into active_queue;
  end if;

  if active_queue then
    new.channel_preferences := jsonb_set(
      coalesce(new.channel_preferences, '{}'::jsonb),
      '{queue,sms}',
      'true'::jsonb,
      true
    );
    new.sms_enabled := true;
  end if;

  return new;
end;
$$;

revoke all on function private.pr30_enforce_active_queue_sms()
  from public, anon, authenticated;
grant execute on function private.pr30_enforce_active_queue_sms()
  to postgres;

drop trigger if exists pr30_enforce_active_queue_sms
  on public.notification_preferences;
create trigger pr30_enforce_active_queue_sms
  before insert or update of profile_id, channel_preferences, sms_enabled
  on public.notification_preferences
  for each row execute function private.pr30_enforce_active_queue_sms();

comment on column public.notifications.deep_link is
  'PR30 safe app-relative destination for the exact appointment, thread, payout, or queue record.';
comment on column public.notification_preferences.channel_preferences is
  'PR30 category-by-channel matrix. Active queue SMS is enforced by the database trigger.';

commit;
