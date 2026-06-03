create table if not exists public.public_usernames (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  owner_type text not null,
  owner_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_usernames_owner_type_check check (owner_type in ('client', 'barber', 'shop')),
  constraint public_usernames_username_not_blank check (btrim(username) <> ''),
  constraint public_usernames_username_lowercase_check check (username = lower(username)),
  constraint public_usernames_owner_unique unique (owner_type, owner_id)
);

create unique index if not exists public_usernames_username_lower_uidx
  on public.public_usernames (lower(username));

alter table public.public_usernames enable row level security;

create table if not exists public.public_username_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null,
  owner_id text not null,
  old_username text,
  new_username text not null,
  changed_by_profile_id uuid,
  changed_at timestamptz not null default now(),
  source text not null default 'profile_studio',
  constraint public_username_audit_owner_type_check check (owner_type in ('client', 'barber', 'shop')),
  constraint public_username_audit_new_username_not_blank check (btrim(new_username) <> '')
);

create index if not exists public_username_audit_owner_idx
  on public.public_username_audit_events (owner_type, owner_id, changed_at desc);

alter table public.public_username_audit_events enable row level security;

insert into public.public_usernames (username, owner_type, owner_id)
select lower(btrim(public_username)), 'client', id::text
from public.profiles
where public_username is not null and btrim(public_username) <> '';

insert into public.public_usernames (username, owner_type, owner_id)
select lower(btrim(username)), 'barber', barber_reference
from public.barber_profiles
where username is not null and btrim(username) <> '';

insert into public.public_usernames (username, owner_type, owner_id)
select lower(btrim(public_username)), 'shop', id::text
from public.shops
where public_username is not null and btrim(public_username) <> '';

create or replace function public.claim_public_username(
  p_owner_type text,
  p_owner_id text,
  p_new_username text,
  p_changed_by_profile_id uuid default null,
  p_source text default 'profile_studio'
)
returns table (
  username text,
  owner_type text,
  owner_id text,
  old_username text
)
language plpgsql
as $$
declare
  v_username text;
  v_old_username text;
  v_registry_id uuid;
begin
  v_username := lower(btrim(coalesce(p_new_username, '')));

  if p_owner_type not in ('client', 'barber', 'shop') then
    raise exception 'invalid_owner_type' using errcode = '22023';
  end if;

  if btrim(coalesce(p_owner_id, '')) = '' then
    raise exception 'invalid_owner_id' using errcode = '22023';
  end if;

  if length(v_username) < 3 or length(v_username) > 32 or v_username !~ '^[a-z0-9_-]+$' then
    raise exception 'invalid_public_username' using errcode = '22023';
  end if;

  if v_username = any(array[
    'admin',
    'support',
    'bvrb3r',
    'help',
    'payments',
    'system',
    'official',
    'login',
    'signup',
    'dashboard',
    'api',
    'client',
    'barber',
    'shop',
    'owner',
    'architect',
    'settings',
    'profile',
    'public'
  ]) then
    raise exception 'reserved_public_username' using errcode = '22023';
  end if;

  select pu.id, pu.username
    into v_registry_id, v_old_username
  from public.public_usernames pu
  where pu.owner_type = p_owner_type
    and pu.owner_id = p_owner_id
  for update;

  if v_registry_id is null then
    insert into public.public_usernames (username, owner_type, owner_id)
    values (v_username, p_owner_type, p_owner_id);
  elsif v_old_username <> v_username then
    update public.public_usernames
      set username = v_username,
          updated_at = now()
    where id = v_registry_id;
  end if;

  if coalesce(v_old_username, '') <> v_username then
    insert into public.public_username_audit_events (
      owner_type,
      owner_id,
      old_username,
      new_username,
      changed_by_profile_id,
      source
    )
    values (
      p_owner_type,
      p_owner_id,
      v_old_username,
      v_username,
      p_changed_by_profile_id,
      coalesce(nullif(btrim(p_source), ''), 'profile_studio')
    );
  end if;

  return query select v_username, p_owner_type, p_owner_id, v_old_username;
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = '23505';
end;
$$;

revoke all on function public.claim_public_username(text, text, text, uuid, text) from public;
revoke all on function public.claim_public_username(text, text, text, uuid, text) from anon;
revoke all on function public.claim_public_username(text, text, text, uuid, text) from authenticated;
grant execute on function public.claim_public_username(text, text, text, uuid, text) to service_role;

comment on table public.public_usernames is 'Global public username ownership registry. Private data remains attached to role/internal ids.';
comment on table public.public_username_audit_events is 'Audit trail for public username changes made through Profile Studio and future tools.';
