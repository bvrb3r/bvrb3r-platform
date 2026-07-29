-- Product PR23 staging certification follow-up.
-- barber_status.current_shop_id is the canonical location UUID on the verified
-- schema, so the queue projection must compare UUID to UUID.

begin;

create or replace function private.pr23_refresh_queue_truth(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_chairs integer;
begin
  if p_location_id is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_location_id::text || ':pr23-queue', 0)
  );

  select greatest(count(*)::integer, 1)
  into active_chairs
  from public.barber_status bs
  join public.locations l on l.id = p_location_id
  where bs.current_shop_id = l.id
    and coalesce(bs.is_online, false)
    and coalesce(bs.accepts_walk_ins, false)
    and bs.live_status in ('available', 'busy');

  with ordered as (
    select
      w.id,
      row_number() over (order by w.created_at, w.id)::integer as position,
      coalesce(
        sum(coalesce(s.duration_min, 30) + coalesce(s.buffer_min, 0))
          over (
            order by w.created_at, w.id
            rows between unbounded preceding and 1 preceding
          ),
        0
      )::integer as minutes_ahead
    from public.waitlist_entries w
    left join public.services s on s.id = w.service_id
    where w.location_id = p_location_id
      and w.status in ('active', 'called', 'assigned')
  ),
  truth as (
    select
      id,
      position,
      ceil(minutes_ahead::numeric / active_chairs)::integer as wait_minutes,
      pg_catalog.format(
        '%s ahead · service-duration schedule across %s active chair%s',
        greatest(position - 1, 0),
        active_chairs,
        case when active_chairs = 1 then '' else 's' end
      ) as reason
    from ordered
  )
  update public.waitlist_entries w
  set canonical_position = truth.position,
      estimated_wait_minutes = truth.wait_minutes,
      wait_reason = truth.reason,
      public_queue_state = case
        when w.public_queue_state in ('waiting', 'almost_ready')
          then case when truth.position <= 2 then 'almost_ready' else 'waiting' end
        else w.public_queue_state
      end,
      wait_version = w.wait_version + case
        when w.canonical_position is distinct from truth.position
          or w.estimated_wait_minutes is distinct from truth.wait_minutes
          or w.wait_reason is distinct from truth.reason
        then 1 else 0 end,
      last_synced_at = now(),
      updated_at = now()
  from truth
  where w.id = truth.id;

  update public.waitlist_entries
  set canonical_position = null,
      estimated_wait_minutes = null,
      last_synced_at = now(),
      updated_at = now()
  where location_id = p_location_id
    and status not in ('active', 'called', 'assigned')
    and (canonical_position is not null or estimated_wait_minutes is not null);
end;
$$;

revoke all on function private.pr23_refresh_queue_truth(uuid) from public;
grant execute on function private.pr23_refresh_queue_truth(uuid) to service_role;

commit;
