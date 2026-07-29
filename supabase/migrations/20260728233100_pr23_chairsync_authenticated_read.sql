-- Product PR23 follow-up found by isolated staging privilege certification.
-- ChairSync already has client/barber/shop/Architect RLS policies; without a
-- table SELECT grant those scoped policies can never authorize a direct reader
-- or Realtime subscriber.

begin;

grant select on public.chairsync_appointments to authenticated;
alter table public.chairsync_appointments replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chairsync_appointments'
  ) then
    execute 'alter publication supabase_realtime add table public.chairsync_appointments';
  end if;
end;
$$;

commit;
