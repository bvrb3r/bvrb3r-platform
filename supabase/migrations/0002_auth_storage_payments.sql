create extension if not exists pgcrypto;

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'mock')),
  provider_customer_id text not null,
  default_payment_method_id text,
  created_at timestamptz not null default now(),
  unique(profile_id, provider)
);

create table if not exists public.saved_payment_methods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  billing_customer_id uuid not null references public.billing_customers(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'mock')),
  provider_payment_method_id text not null,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.location_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(profile_id, location_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email, phone)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'client'),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do update
  set role = excluded.role,
      full_name = excluded.full_name,
      email = excluded.email,
      phone = excluded.phone;

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public)
values ('bvrb3r-media', 'bvrb3r-media', true)
on conflict (id) do nothing;

alter table public.billing_customers enable row level security;
alter table public.saved_payment_methods enable row level security;
alter table public.location_memberships enable row level security;

create policy "billing customers self or owner" on public.billing_customers
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "billing customers self insert" on public.billing_customers
  for insert with check (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'front_desk', 'manager'))
  );

create policy "saved payment methods self or owner" on public.saved_payment_methods
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "saved payment methods self insert" on public.saved_payment_methods
  for insert with check (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'front_desk', 'manager'))
  );

create policy "location memberships self or owner" on public.location_memberships
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "storage upload own media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bvrb3r-media'
    and (
      auth.role() = 'authenticated'
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
    )
  );

create policy "storage read media" on storage.objects
  for select using (bucket_id = 'bvrb3r-media');