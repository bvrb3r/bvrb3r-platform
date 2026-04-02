create table if not exists public.user_onboarding_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.verification_subject_role not null,
  status text not null default 'not_started',
  current_step text not null,
  completed_steps jsonb not null default '[]'::jsonb,
  profile_data jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_onboarding_states_user_role_uidx
  on public.user_onboarding_states(user_id, role);

create index if not exists user_onboarding_states_user_id_idx
  on public.user_onboarding_states(user_id);

create index if not exists user_onboarding_states_status_idx
  on public.user_onboarding_states(status);

drop trigger if exists trg_user_onboarding_states_updated_at on public.user_onboarding_states;
create trigger trg_user_onboarding_states_updated_at
before update on public.user_onboarding_states
for each row
execute function public.set_updated_at();

alter table public.user_onboarding_states enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_onboarding_states'
      and policyname = 'user_onboarding_states_select_own'
  ) then
    create policy user_onboarding_states_select_own
      on public.user_onboarding_states
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_onboarding_states'
      and policyname = 'user_onboarding_states_select_platform_admin'
  ) then
    create policy user_onboarding_states_select_platform_admin
      on public.user_onboarding_states
      for select
      using (public.is_platform_admin_request());
  end if;
end $$;
