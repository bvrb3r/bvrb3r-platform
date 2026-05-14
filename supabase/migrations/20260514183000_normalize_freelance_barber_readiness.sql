do $$
begin
  if to_regclass('public.barber_status') is not null
    and to_regclass('public.barbers') is not null then
    insert into public.barber_status (
      barber_reference,
      shop_reference,
      status,
      next_available_at,
      accepting_bookings,
      availability_note,
      created_at,
      updated_at,
      barber_id,
      current_shop_id,
      live_status,
      is_online,
      accepts_walk_ins,
      last_seen_at
    )
    select
      b.reference_code,
      bs.shop_reference,
      bs.status,
      bs.next_available_at,
      bs.accepting_bookings,
      bs.availability_note,
      bs.created_at,
      now(),
      b.id,
      bs.current_shop_id,
      bs.live_status,
      bs.is_online,
      bs.accepts_walk_ins,
      coalesce(bs.last_seen_at, bs.updated_at, now())
    from public.barber_status bs
    join public.barbers b
      on bs.barber_reference in (b.id::text, b.profile_id::text, coalesce(b.booking_slug, ''))
    where b.reference_code is not null
      and not exists (
        select 1
        from public.barber_status existing
        where existing.barber_reference = b.reference_code
      );

    update public.barber_status bs
    set
      barber_id = b.id,
      updated_at = now()
    from public.barbers b
    where bs.barber_reference = b.reference_code
      and (bs.barber_id is distinct from b.id);
  end if;
end $$;

do $$
begin
  if to_regclass('public.availability_rules') is not null
    and to_regclass('public.barber_working_hours') is not null
    and to_regclass('public.barbers') is not null
    and to_regclass('public.locations') is not null then
    insert into public.availability_rules (
      barber_id,
      location_id,
      weekday,
      start_time,
      end_time
    )
    select
      b.id,
      l.id,
      wh.weekday,
      wh.start_time,
      wh.end_time
    from public.barber_working_hours wh
    join public.barbers b
      on wh.barber_reference in (b.reference_code, b.id::text, b.profile_id::text, coalesce(b.booking_slug, ''))
    join public.locations l
      on wh.shop_reference in (l.id::text, coalesce(l.reference_code, ''))
    where not exists (
      select 1
      from public.availability_rules ar
      where ar.barber_id = b.id
        and ar.location_id = l.id
        and ar.weekday = wh.weekday
        and ar.start_time = wh.start_time
        and ar.end_time = wh.end_time
    );
  end if;
end $$;
