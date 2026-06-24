begin;

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

/*
  PR #32 protected-risk RLS batch 5 candidate.

  Target tables:
  - Core identity/support: clients, barbers, shops, staff_locations,
    shop_team_invites, barber_shop_memberships, barber_working_hours,
    blocked_times.
  - Public identity registry: public_usernames, public_username_audit_events.

  Identity doctrine:
  - Supabase/auth/profile ids and role-owned internal ids remain authority.
  - Public usernames are mutable handles for lookup and display only.
  - Public username history is private to the owner or explicit platform_admin.
  - Sensitive ownership checks never use username as the only join path.

  Safety:
  - No production data mutation is performed by this candidate.
  - No account-role normalization is performed.
  - Earlier protected RLS batches remain outside this scope.
  - Direct authenticated writes are limited to existing owner/bootstrap or
    self-owned schedule flows; lifecycle and financial authority stays server-side.
*/

create or replace function private.rls_batch_5_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role::text = 'platform_admin'
        or p.primary_onboarding_role::text = 'platform_admin'
      )
  );
$$;

create or replace function private.rls_batch_5_is_shop_owner_actor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role::text in ('shop_owner_user', 'owner', 'shop_owner')
        or p.primary_onboarding_role::text = 'shop_owner'
      )
  );
$$;

create or replace function private.rls_batch_5_is_client_owner(
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_client_id is not null
    and exists (
      select 1
      from public.clients c
      where c.id = p_client_id
        and c.profile_id = auth.uid()
    );
$$;

create or replace function private.rls_batch_5_is_barber_owner(
  p_barber_id uuid,
  p_barber_reference text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.barbers b
    where b.profile_id = auth.uid()
      and (
        (p_barber_id is not null and b.id = p_barber_id)
        or (
          nullif(btrim(coalesce(p_barber_reference, '')), '') is not null
          and p_barber_reference in (
            b.reference_code,
            b.id::text,
            b.profile_id::text,
            b.booking_slug
          )
        )
      )
  );
$$;

create or replace function private.rls_batch_5_has_barber_membership(
  p_barber_reference text,
  p_shop_reference text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(btrim(coalesce(p_barber_reference, '')), '') is not null
    and nullif(btrim(coalesce(p_shop_reference, '')), '') is not null
    and exists (
      select 1
      from public.barber_shop_memberships bsm
      where bsm.barber_reference = p_barber_reference
        and bsm.shop_reference = p_shop_reference
        and bsm.active = true
    );
$$;

create or replace function private.rls_batch_5_is_shop_owner_reference(
  p_shop_reference text,
  p_location_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.rls_batch_5_is_shop_owner_actor()
    and exists (
      select 1
      from public.shops s
      left join public.locations l
        on l.reference_code = s.id
      where s.owner_profile_id = auth.uid()
        and (
          (nullif(btrim(coalesce(p_shop_reference, '')), '') is not null and s.id = p_shop_reference)
          or (p_location_id is not null and l.id = p_location_id)
          or (nullif(btrim(coalesce(p_shop_reference, '')), '') is not null and l.id::text = p_shop_reference)
        )
    );
$$;

create or replace function private.rls_batch_5_is_shop_operator_reference(
  p_shop_reference text,
  p_location_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('shop_owner_user', 'owner', 'shop_owner', 'manager', 'front_desk')
    )
    and (
      private.rls_batch_5_is_shop_owner_reference(p_shop_reference, p_location_id)
      or exists (
        select 1
        from public.staff_locations sl
        left join public.locations l on l.id = sl.location_id
        where sl.profile_id = auth.uid()
          and coalesce(sl.relationship_status, 'active') = 'active'
          and sl.ended_at is null
          and (
            (p_location_id is not null and sl.location_id = p_location_id)
            or (nullif(btrim(coalesce(p_shop_reference, '')), '') is not null and sl.shop_id = p_shop_reference)
            or (nullif(btrim(coalesce(p_shop_reference, '')), '') is not null and sl.location_id::text = p_shop_reference)
            or (nullif(btrim(coalesce(p_shop_reference, '')), '') is not null and l.reference_code = p_shop_reference)
          )
      )
    );
$$;

create or replace function private.rls_batch_5_can_read_barber_by_shop(
  p_barber_id uuid,
  p_barber_reference text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.rls_batch_5_is_barber_owner(p_barber_id, p_barber_reference)
    or private.rls_batch_5_is_platform_admin()
    or exists (
      select 1
      from public.barbers b
      join public.staff_locations barber_sl
        on barber_sl.profile_id = b.profile_id
      where (
          (p_barber_id is not null and b.id = p_barber_id)
          or (
            nullif(btrim(coalesce(p_barber_reference, '')), '') is not null
            and p_barber_reference in (
              b.reference_code,
              b.id::text,
              b.profile_id::text,
              b.booking_slug
            )
          )
        )
        and coalesce(barber_sl.relationship_status, 'active') = 'active'
        and barber_sl.ended_at is null
        and private.rls_batch_5_is_shop_operator_reference(barber_sl.shop_id, barber_sl.location_id)
    );
$$;

create or replace function private.rls_batch_5_owns_public_username(
  p_owner_type text,
  p_owner_id text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(btrim(coalesce(p_owner_id, '')), '') is not null
    and (
      (
        p_owner_type = 'client'
        and exists (
          select 1
          from public.clients c
          where c.profile_id = auth.uid()
            and p_owner_id in (c.id::text, c.profile_id::text, c.reference_code)
        )
      )
      or (
        p_owner_type = 'barber'
        and exists (
          select 1
          from public.barbers b
          where b.profile_id = auth.uid()
            and p_owner_id in (b.id::text, b.profile_id::text, b.reference_code, b.booking_slug)
        )
      )
      or (
        p_owner_type = 'shop'
        and exists (
          select 1
          from public.shops s
          where s.owner_profile_id = auth.uid()
            and p_owner_id = s.id
        )
      )
    );
$$;

comment on function private.rls_batch_5_is_platform_admin() is
  'PR32 RLS helper: explicit platform_admin check for identity/core support policies.';
comment on function private.rls_batch_5_is_shop_owner_actor() is
  'PR32 RLS helper: identifies the owner bootstrap actor lane without mutating account roles.';
comment on function private.rls_batch_5_is_client_owner(uuid) is
  'PR32 RLS helper: stable profile id owns the client row; username is not authority.';
comment on function private.rls_batch_5_is_barber_owner(uuid, text) is
  'PR32 RLS helper: stable barber/profile references own barber rows; public usernames are display handles only.';
comment on function private.rls_batch_5_has_barber_membership(text, text) is
  'PR32 RLS helper: active barber/shop membership proof for schedule ownership checks.';
comment on function private.rls_batch_5_is_shop_owner_reference(text, uuid) is
  'PR32 RLS helper: stable shop owner profile id owns shop/location scope.';
comment on function private.rls_batch_5_is_shop_operator_reference(text, uuid) is
  'PR32 RLS helper: stable owner or active staff relationship proves shop operator scope.';
comment on function private.rls_batch_5_can_read_barber_by_shop(uuid, text) is
  'PR32 RLS helper: barber self, platform_admin, or active shop relationship can read raw barber support rows.';
comment on function private.rls_batch_5_owns_public_username(text, text) is
  'PR32 RLS helper: public usernames resolve to stable owner ids; username alone is never authority.';

revoke all on function private.rls_batch_5_is_platform_admin() from public, anon;
revoke all on function private.rls_batch_5_is_shop_owner_actor() from public, anon;
revoke all on function private.rls_batch_5_is_client_owner(uuid) from public, anon;
revoke all on function private.rls_batch_5_is_barber_owner(uuid, text) from public, anon;
revoke all on function private.rls_batch_5_has_barber_membership(text, text) from public, anon;
revoke all on function private.rls_batch_5_is_shop_owner_reference(text, uuid) from public, anon;
revoke all on function private.rls_batch_5_is_shop_operator_reference(text, uuid) from public, anon;
revoke all on function private.rls_batch_5_can_read_barber_by_shop(uuid, text) from public, anon;
revoke all on function private.rls_batch_5_owns_public_username(text, text) from public, anon;

grant execute on function private.rls_batch_5_is_platform_admin() to authenticated;
grant execute on function private.rls_batch_5_is_shop_owner_actor() to authenticated;
grant execute on function private.rls_batch_5_is_client_owner(uuid) to authenticated;
grant execute on function private.rls_batch_5_is_barber_owner(uuid, text) to authenticated;
grant execute on function private.rls_batch_5_has_barber_membership(text, text) to authenticated;
grant execute on function private.rls_batch_5_is_shop_owner_reference(text, uuid) to authenticated;
grant execute on function private.rls_batch_5_is_shop_operator_reference(text, uuid) to authenticated;
grant execute on function private.rls_batch_5_can_read_barber_by_shop(uuid, text) to authenticated;
grant execute on function private.rls_batch_5_owns_public_username(text, text) to authenticated;

alter table public.clients enable row level security;
alter table public.barbers enable row level security;
alter table public.shops enable row level security;
alter table public.staff_locations enable row level security;
alter table public.shop_team_invites enable row level security;
alter table public.barber_shop_memberships enable row level security;
alter table public.barber_working_hours enable row level security;
alter table public.blocked_times enable row level security;
alter table public.public_usernames enable row level security;
alter table public.public_username_audit_events enable row level security;

drop policy if exists "clients self or admin select batch 5" on public.clients;
create policy "clients self or admin select batch 5"
  on public.clients
  for select
  to authenticated
  using (
    private.rls_batch_5_is_client_owner(public.clients.id)
    or private.rls_batch_5_is_platform_admin()
  );

drop policy if exists "barbers self shop admin select batch 5" on public.barbers;
create policy "barbers self shop admin select batch 5"
  on public.barbers
  for select
  to authenticated
  using (
    private.rls_batch_5_can_read_barber_by_shop(public.barbers.id, public.barbers.reference_code)
  );

drop policy if exists "shops owner operator admin select batch 5" on public.shops;
create policy "shops owner operator admin select batch 5"
  on public.shops
  for select
  to authenticated
  using (
    public.shops.owner_profile_id = auth.uid()
    or private.rls_batch_5_is_shop_operator_reference(public.shops.id)
    or private.rls_batch_5_is_platform_admin()
  );

drop policy if exists "shops owner insert batch 5" on public.shops;
create policy "shops owner insert batch 5"
  on public.shops
  for insert
  to authenticated
  with check (
    owner_profile_id = auth.uid()
    and private.rls_batch_5_is_shop_owner_actor()
  );

drop policy if exists "shops owner update batch 5" on public.shops;
create policy "shops owner update batch 5"
  on public.shops
  for update
  to authenticated
  using (
    owner_profile_id = auth.uid()
    and private.rls_batch_5_is_shop_owner_actor()
  )
  with check (
    owner_profile_id = auth.uid()
    and private.rls_batch_5_is_shop_owner_actor()
  );

drop policy if exists "staff locations owner bootstrap select" on public.staff_locations;
drop policy if exists "staff locations owner bootstrap insert" on public.staff_locations;
drop policy if exists "staff locations owner bootstrap update" on public.staff_locations;
drop policy if exists "staff locations scoped select batch 5" on public.staff_locations;
create policy "staff locations scoped select batch 5"
  on public.staff_locations
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or private.rls_batch_5_is_shop_operator_reference(public.staff_locations.shop_id, public.staff_locations.location_id)
    or private.rls_batch_5_is_platform_admin()
  );

drop policy if exists "staff locations owner bootstrap insert batch 5" on public.staff_locations;
create policy "staff locations owner bootstrap insert batch 5"
  on public.staff_locations
  for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and private.rls_batch_5_is_shop_owner_reference(public.staff_locations.shop_id, public.staff_locations.location_id)
  );

drop policy if exists "staff locations owner bootstrap update batch 5" on public.staff_locations;
create policy "staff locations owner bootstrap update batch 5"
  on public.staff_locations
  for update
  to authenticated
  using (
    profile_id = auth.uid()
    and private.rls_batch_5_is_shop_owner_reference(public.staff_locations.shop_id, public.staff_locations.location_id)
  )
  with check (
    profile_id = auth.uid()
    and private.rls_batch_5_is_shop_owner_reference(public.staff_locations.shop_id, public.staff_locations.location_id)
  );

drop policy if exists "shop team invites owner read" on public.shop_team_invites;
drop policy if exists "shop team invites barber read" on public.shop_team_invites;
drop policy if exists "shop team invites owner write" on public.shop_team_invites;
drop policy if exists "shop team invites barber update" on public.shop_team_invites;
drop policy if exists "shop team invites scoped select batch 5" on public.shop_team_invites;
create policy "shop team invites scoped select batch 5"
  on public.shop_team_invites
  for select
  to authenticated
  using (
    barber_profile_id = auth.uid()
    or invited_by_profile_id = auth.uid()
    or requested_by_profile_id = auth.uid()
    or private.rls_batch_5_is_shop_operator_reference(null, public.shop_team_invites.shop_id)
    or private.rls_batch_5_is_platform_admin()
  );

drop policy if exists "shop team invites scoped insert batch 5" on public.shop_team_invites;
create policy "shop team invites scoped insert batch 5"
  on public.shop_team_invites
  for insert
  to authenticated
  with check (
    (
      private.rls_batch_5_is_shop_owner_reference(null, public.shop_team_invites.shop_id)
      or private.rls_batch_5_is_shop_operator_reference(null, public.shop_team_invites.shop_id)
    )
    and (invited_by_profile_id is null or invited_by_profile_id = auth.uid())
    and (requested_by_profile_id is null or requested_by_profile_id = auth.uid())
  );

drop policy if exists "shop team invites scoped update batch 5" on public.shop_team_invites;
create policy "shop team invites scoped update batch 5"
  on public.shop_team_invites
  for update
  to authenticated
  using (
    barber_profile_id = auth.uid()
    or invited_by_profile_id = auth.uid()
    or requested_by_profile_id = auth.uid()
    or private.rls_batch_5_is_shop_operator_reference(null, public.shop_team_invites.shop_id)
    or private.rls_batch_5_is_platform_admin()
  )
  with check (
    barber_profile_id = auth.uid()
    or invited_by_profile_id = auth.uid()
    or requested_by_profile_id = auth.uid()
    or private.rls_batch_5_is_shop_operator_reference(null, public.shop_team_invites.shop_id)
    or private.rls_batch_5_is_platform_admin()
  );

drop policy if exists "barber shop memberships scoped select batch 5" on public.barber_shop_memberships;
create policy "barber shop memberships scoped select batch 5"
  on public.barber_shop_memberships
  for select
  to authenticated
  using (
    private.rls_batch_5_is_barber_owner(null, public.barber_shop_memberships.barber_reference)
    or private.rls_batch_5_is_shop_operator_reference(public.barber_shop_memberships.shop_reference)
    or private.rls_batch_5_is_platform_admin()
  );

drop policy if exists "barber working hours scoped select batch 5" on public.barber_working_hours;
create policy "barber working hours scoped select batch 5"
  on public.barber_working_hours
  for select
  to authenticated
  using (
    private.rls_batch_5_is_barber_owner(null, public.barber_working_hours.barber_reference)
    or private.rls_batch_5_is_shop_operator_reference(public.barber_working_hours.shop_reference)
    or private.rls_batch_5_is_platform_admin()
  );

drop policy if exists "barber working hours owner insert batch 5" on public.barber_working_hours;
create policy "barber working hours owner insert batch 5"
  on public.barber_working_hours
  for insert
  to authenticated
  with check (
    private.rls_batch_5_is_barber_owner(null, public.barber_working_hours.barber_reference)
    and private.rls_batch_5_has_barber_membership(
      public.barber_working_hours.barber_reference,
      public.barber_working_hours.shop_reference
    )
  );

drop policy if exists "barber working hours owner update batch 5" on public.barber_working_hours;
create policy "barber working hours owner update batch 5"
  on public.barber_working_hours
  for update
  to authenticated
  using (
    private.rls_batch_5_is_barber_owner(null, public.barber_working_hours.barber_reference)
    and private.rls_batch_5_has_barber_membership(
      public.barber_working_hours.barber_reference,
      public.barber_working_hours.shop_reference
    )
  )
  with check (
    private.rls_batch_5_is_barber_owner(null, public.barber_working_hours.barber_reference)
    and private.rls_batch_5_has_barber_membership(
      public.barber_working_hours.barber_reference,
      public.barber_working_hours.shop_reference
    )
  );

drop policy if exists "blocked times scoped select batch 5" on public.blocked_times;
create policy "blocked times scoped select batch 5"
  on public.blocked_times
  for select
  to authenticated
  using (
    private.rls_batch_5_is_barber_owner(public.blocked_times.barber_id)
    or private.rls_batch_5_can_read_barber_by_shop(public.blocked_times.barber_id)
    or private.rls_batch_5_is_platform_admin()
  );

drop policy if exists "blocked times barber insert batch 5" on public.blocked_times;
create policy "blocked times barber insert batch 5"
  on public.blocked_times
  for insert
  to authenticated
  with check (
    private.rls_batch_5_is_barber_owner(public.blocked_times.barber_id)
  );

drop policy if exists "blocked times barber update batch 5" on public.blocked_times;
create policy "blocked times barber update batch 5"
  on public.blocked_times
  for update
  to authenticated
  using (
    private.rls_batch_5_is_barber_owner(public.blocked_times.barber_id)
  )
  with check (
    private.rls_batch_5_is_barber_owner(public.blocked_times.barber_id)
  );

drop policy if exists "public usernames public lookup batch 5" on public.public_usernames;
create policy "public usernames public lookup batch 5"
  on public.public_usernames
  for select
  to anon, authenticated
  using (
    owner_type in ('client', 'barber', 'shop')
    and nullif(btrim(username), '') is not null
    and nullif(btrim(owner_id), '') is not null
  );

drop policy if exists "public username audit owner admin select batch 5" on public.public_username_audit_events;
create policy "public username audit owner admin select batch 5"
  on public.public_username_audit_events
  for select
  to authenticated
  using (
    private.rls_batch_5_owns_public_username(
      public.public_username_audit_events.owner_type,
      public.public_username_audit_events.owner_id
    )
    or private.rls_batch_5_is_platform_admin()
  );

comment on table public.clients is
  'PR32 RLS target: client support rows are self/profile scoped or platform_admin only. Public usernames are not authority.';
comment on table public.barbers is
  'PR32 RLS target: raw barber support rows are barber self, active shop relationship, or platform_admin scoped. Public usernames stay mutable display handles.';
comment on table public.shops is
  'PR32 RLS target: raw shop rows are owner, active operator, or platform_admin scoped. Public shop discovery must use public-safe surfaces.';
comment on table public.staff_locations is
  'PR32 RLS target: staff relationship rows are self, active shop operator, owner bootstrap, or platform_admin scoped.';
comment on table public.shop_team_invites is
  'PR32 RLS target: shop team invites are scoped to invited barber, requester/inviter, owning/operating shop, or platform_admin.';
comment on table public.barber_shop_memberships is
  'PR32 RLS target: memberships are scoped to barber self, active shop operator, or platform_admin.';
comment on table public.barber_working_hours is
  'PR32 RLS target: working hours are barber-owned for direct writes and shop/operator readable by active scope.';
comment on table public.blocked_times is
  'PR32 RLS target: blocked times are barber-owned for direct writes and shop/operator readable by active scope.';
comment on table public.public_usernames is
  'PR32 public identity registry: public usernames are mutable lookup/display handles; stable owner ids remain authority.';
comment on table public.public_username_audit_events is
  'PR32 username audit registry: username history is owner/platform_admin scoped and is not anon-readable.';

commit;
