begin;

alter table public.locations enable row level security;

drop policy if exists "locations owner bootstrap insert" on public.locations;
create policy "locations owner bootstrap insert"
  on public.locations
  for insert
  to authenticated
  with check (
    reference_code is not null
    and exists (
      select 1
      from public.shops s
      join public.profiles p on p.id = auth.uid()
      where s.id = reference_code
        and s.owner_profile_id = auth.uid()
        and p.primary_onboarding_role::text = 'shop_owner'
        and p.role::text in ('owner', 'shop_owner')
    )
  );

drop policy if exists "locations owner bootstrap update" on public.locations;
create policy "locations owner bootstrap update"
  on public.locations
  for update
  to authenticated
  using (
    reference_code is not null
    and exists (
      select 1
      from public.shops s
      join public.profiles p on p.id = auth.uid()
      where s.id = reference_code
        and s.owner_profile_id = auth.uid()
        and p.primary_onboarding_role::text = 'shop_owner'
        and p.role::text in ('owner', 'shop_owner')
    )
  )
  with check (
    reference_code is not null
    and exists (
      select 1
      from public.shops s
      join public.profiles p on p.id = auth.uid()
      where s.id = reference_code
        and s.owner_profile_id = auth.uid()
        and p.primary_onboarding_role::text = 'shop_owner'
        and p.role::text in ('owner', 'shop_owner')
    )
  );

drop policy if exists "staff locations owner bootstrap select" on public.staff_locations;
create policy "staff locations owner bootstrap select"
  on public.staff_locations
  for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "staff locations owner bootstrap insert" on public.staff_locations;
create policy "staff locations owner bootstrap insert"
  on public.staff_locations
  for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.locations l
      join public.shops s on s.id = l.reference_code
      join public.profiles p on p.id = auth.uid()
      where l.id = location_id
        and s.owner_profile_id = auth.uid()
        and p.primary_onboarding_role::text = 'shop_owner'
        and p.role::text in ('owner', 'shop_owner')
    )
  );

drop policy if exists "staff locations owner bootstrap update" on public.staff_locations;
create policy "staff locations owner bootstrap update"
  on public.staff_locations
  for update
  to authenticated
  using (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.locations l
      join public.shops s on s.id = l.reference_code
      join public.profiles p on p.id = auth.uid()
      where l.id = location_id
        and s.owner_profile_id = auth.uid()
        and p.primary_onboarding_role::text = 'shop_owner'
        and p.role::text in ('owner', 'shop_owner')
    )
  )
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.locations l
      join public.shops s on s.id = l.reference_code
      join public.profiles p on p.id = auth.uid()
      where l.id = location_id
        and s.owner_profile_id = auth.uid()
        and p.primary_onboarding_role::text = 'shop_owner'
        and p.role::text in ('owner', 'shop_owner')
    )
  );

commit;
