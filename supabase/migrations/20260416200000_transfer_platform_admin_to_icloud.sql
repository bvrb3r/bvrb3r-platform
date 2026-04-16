-- Pre-open governance: transfer the sole Architect account to bvrb3r@icloud.com.
-- Keeps historical audit rows intact while removing platform_admin state from
-- every other profile, including the retired pmcgeefsu@gmail.com account.
do $$
declare
  target_admin_email text := 'bvrb3r@icloud.com';
  retired_admin_email text := 'pmcgeefsu@gmail.com';
  target_admin_id uuid;
begin
  select au.id
    into target_admin_id
  from auth.users au
  where lower(au.email) = target_admin_email
  limit 1;

  if target_admin_id is null then
    raise exception 'Cannot transfer platform admin access: auth user % does not exist', target_admin_email;
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role',
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'role'
  where lower(email) = retired_admin_email
     or lower(email) = target_admin_email
     or id in (
       select p.id
       from public.profiles p
       where p.role::text = 'platform_admin'
          or p.primary_onboarding_role::text = 'platform_admin'
     );

  update public.profiles
  set role = 'client'::public.app_role,
      primary_onboarding_role = null,
      onboarding_state = case
        when coalesce(email, '') <> ''
          and coalesce(phone, '') <> ''
          and phone_verified_at is not null
          then 'awaiting_role_selection'::public.identity_onboarding_state
        else 'awaiting_contact_verification'::public.identity_onboarding_state
      end,
      last_onboarded_at = null
  where lower(email) = retired_admin_email
     or (
       id <> target_admin_id
       and (
         role::text = 'platform_admin'
         or primary_onboarding_role::text = 'platform_admin'
       )
     );

  insert into public.profiles (
    id,
    role,
    full_name,
    email,
    phone,
    primary_onboarding_role,
    onboarding_state,
    phone_verified_at,
    last_onboarded_at
  )
  select
    au.id,
    'platform_admin'::public.app_role,
    coalesce(nullif(au.raw_user_meta_data ->> 'full_name', ''), 'BVRB3R Architect'),
    lower(au.email),
    nullif(coalesce(au.phone, au.raw_user_meta_data ->> 'phone'), ''),
    'platform_admin'::public.verification_subject_role,
    'active'::public.identity_onboarding_state,
    coalesce(au.phone_confirmed_at, now()),
    now()
  from auth.users au
  where au.id = target_admin_id
  on conflict (id) do update
  set role = excluded.role,
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
      email = excluded.email,
      phone = coalesce(public.profiles.phone, excluded.phone),
      primary_onboarding_role = excluded.primary_onboarding_role,
      onboarding_state = excluded.onboarding_state,
      phone_verified_at = coalesce(public.profiles.phone_verified_at, excluded.phone_verified_at),
      last_onboarded_at = now();

  if exists (
    select 1
    from public.profiles p
    where (p.role::text = 'platform_admin' or p.primary_onboarding_role::text = 'platform_admin')
      and p.id <> target_admin_id
  ) then
    raise exception 'Platform admin transfer left an unexpected non-target admin profile';
  end if;
end $$;

create or replace function public.is_platform_admin_request()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(p.email) = 'bvrb3r@icloud.com'
      and p.role::text = 'platform_admin'
      and p.primary_onboarding_role::text = 'platform_admin'
  );
$$;
