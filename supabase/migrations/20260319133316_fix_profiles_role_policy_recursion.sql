create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
$$;

drop policy if exists "profiles self or owner" on public.profiles;
create policy "profiles self or owner" on public.profiles
  for select using (
    auth.uid() = id
    or public.current_profile_role() = 'owner'::public.app_role
  );

drop policy if exists "appointments shop staff select" on public.appointments;
create policy "appointments shop staff select" on public.appointments
  for select using (
    public.current_profile_role() in ('owner'::public.app_role, 'manager'::public.app_role, 'front_desk'::public.app_role)
  );

drop policy if exists "payments shop staff select" on public.payments;
create policy "payments shop staff select" on public.payments
  for select using (
    public.current_profile_role() in ('owner'::public.app_role, 'manager'::public.app_role, 'front_desk'::public.app_role)
  );

drop policy if exists "reviews shop staff select" on public.reviews;
create policy "reviews shop staff select" on public.reviews
  for select using (
    public.current_profile_role() in ('owner'::public.app_role, 'manager'::public.app_role, 'front_desk'::public.app_role)
  );

drop policy if exists "walk in queue shop staff select" on public.walk_in_queue;
create policy "walk in queue shop staff select" on public.walk_in_queue
  for select using (
    public.current_profile_role() in ('owner'::public.app_role, 'manager'::public.app_role, 'front_desk'::public.app_role)
  );

drop policy if exists "booth rent owner or barber" on public.booth_rent_ledgers;
create policy "booth rent owner or barber" on public.booth_rent_ledgers
  for select using (
    exists (select 1 from public.barbers b where b.id = barber_id and b.profile_id = auth.uid())
    or public.current_profile_role() = 'owner'::public.app_role
  );

drop policy if exists "audit logs owner only" on public.audit_logs;
create policy "audit logs owner only" on public.audit_logs
  for select using (
    public.current_profile_role() = 'owner'::public.app_role
  );