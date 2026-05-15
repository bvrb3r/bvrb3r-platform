do $$
begin
  alter type public.app_role add value if not exists 'barber';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type public.barber_subtype add value if not exists 'booth_rent';
exception
  when duplicate_object then null;
end $$;
