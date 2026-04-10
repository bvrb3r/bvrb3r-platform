-- =========================================================
-- Production auth bootstrap hardening.
--
-- The app's canonical identity key is auth.uid() -> profiles.id.
-- These policies allow an authenticated user session to create,
-- read, and update only its own profile row when the service-role
-- server client is not available in the runtime.
-- =========================================================

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
      on public.profiles
      for select
      using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_own'
  ) then
    create policy profiles_insert_own
      on public.profiles
      for insert
      with check (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
      on public.profiles
      for update
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end $$;

grant select, insert, update on public.profiles to authenticated;

-- Phone verification challenges are created and consumed by guarded
-- server routes. If those routes run through the authenticated server
-- client rather than the service role client, RLS still keeps each
-- challenge scoped to the current auth.uid().
alter table public.phone_verification_challenges enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'phone_verification_challenges'
      and policyname = 'phone_verification_challenges_select_own'
  ) then
    create policy phone_verification_challenges_select_own
      on public.phone_verification_challenges
      for select
      using (auth.uid() = profile_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'phone_verification_challenges'
      and policyname = 'phone_verification_challenges_insert_own'
  ) then
    create policy phone_verification_challenges_insert_own
      on public.phone_verification_challenges
      for insert
      with check (auth.uid() = profile_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'phone_verification_challenges'
      and policyname = 'phone_verification_challenges_update_own'
  ) then
    create policy phone_verification_challenges_update_own
      on public.phone_verification_challenges
      for update
      using (auth.uid() = profile_id)
      with check (auth.uid() = profile_id);
  end if;
end $$;

grant select, insert, update on public.phone_verification_challenges to authenticated;
