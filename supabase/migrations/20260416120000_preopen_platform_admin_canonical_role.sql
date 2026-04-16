-- Pre-open governance: make platform_admin a canonical profile lane.
alter type public.app_role add value if not exists 'platform_admin';
alter type public.verification_subject_role add value if not exists 'platform_admin';

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
      and p.role::text = 'platform_admin'
      and p.primary_onboarding_role::text = 'platform_admin'
  );
$$;
