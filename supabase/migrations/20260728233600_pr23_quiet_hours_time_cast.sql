-- Product PR23 staging certification follow-up.
-- The verified notification preference schema stores HH:MM quiet-hour values
-- as text, so delivery enforcement casts them explicitly at the server edge.

begin;

create or replace function private.pr23_enforce_notification_quiet_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preference_row record;
  local_now timestamp;
  local_date date;
  quiet_start timestamp;
  quiet_end timestamp;
begin
  new.updated_at := now();
  if new.operational or new.profile_id is null
     or new.status not in ('queued', 'scheduled', 'retrying') then
    return new;
  end if;

  select
    p.quiet_hours_start,
    p.quiet_hours_end,
    p.quiet_hours_timezone
  into preference_row
  from public.notification_preferences p
  where p.profile_id = new.profile_id
  order by p.updated_at desc
  limit 1;

  if preference_row.quiet_hours_start is null
     or preference_row.quiet_hours_end is null then
    return new;
  end if;

  local_now := now() at time zone preference_row.quiet_hours_timezone;
  local_date := local_now::date;
  quiet_start := local_date + preference_row.quiet_hours_start::time;
  quiet_end := local_date + preference_row.quiet_hours_end::time;

  if preference_row.quiet_hours_end::time
     <= preference_row.quiet_hours_start::time then
    if local_now::time < preference_row.quiet_hours_end::time then
      quiet_start := (local_date - 1)
        + preference_row.quiet_hours_start::time;
    else
      quiet_end := (local_date + 1)
        + preference_row.quiet_hours_end::time;
    end if;
  end if;

  if local_now >= quiet_start and local_now < quiet_end then
    new.status := 'scheduled';
    new.scheduled_for :=
      quiet_end at time zone preference_row.quiet_hours_timezone;
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('quietHoursApplied', true);
  end if;
  return new;
end;
$$;

revoke all on function private.pr23_enforce_notification_quiet_hours()
  from public;

commit;
