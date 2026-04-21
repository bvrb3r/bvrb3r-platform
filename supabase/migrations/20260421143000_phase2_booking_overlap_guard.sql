create extension if not exists btree_gist;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_no_overlap_active'
  ) then
    alter table public.appointments
      add constraint appointments_no_overlap_active
      exclude using gist (
        barber_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status <> 'cancelled' and status <> 'no_show');
  end if;
end
$$;
