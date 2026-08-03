-- Staging ledger version: 20260803073109.
do $migration$
declare
  v_conflicts text;
begin
  select string_agg(
    format('%s (%s:%s)', pu.username, pu.owner_type, pu.owner_id),
    ', ' order by pu.username
  )
  into v_conflicts
  from public.public_usernames pu
  where lower(btrim(pu.username)) = any(array[
    'ai',
    'analytics',
    'bridge',
    'chairfill',
    'chairs',
    'floor',
    'home',
    'identity',
    'kiosk',
    'messages',
    'money',
    'more',
    'policies',
    'rent',
    'reports',
    'schedule',
    'switch',
    'sync',
    'team',
    'tv',
    'verify'
  ]::text[]);

  if v_conflicts is not null then
    raise exception using
      errcode = '23514',
      message = 'canonical_shop_route_username_conflict',
      detail = v_conflicts,
      hint = 'Rename every conflicting public username before applying this migration; no username is changed automatically.';
  end if;
end
$migration$;

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
security invoker
set search_path = public, auth, pg_temp
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
    'public',
    'ai',
    'analytics',
    'bridge',
    'chairfill',
    'chairs',
    'floor',
    'home',
    'identity',
    'kiosk',
    'messages',
    'money',
    'more',
    'policies',
    'rent',
    'reports',
    'schedule',
    'switch',
    'sync',
    'team',
    'tv',
    'verify'
  ]::text[]) then
    raise exception 'reserved_public_username' using errcode = '22023';
  end if;

  if length(v_username) < 3 or length(v_username) > 32 or v_username !~ '^[a-z0-9_-]+$' then
    raise exception 'invalid_public_username' using errcode = '22023';
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

comment on function public.claim_public_username(text, text, text, uuid, text) is
  'Claims a globally unique public username after rejecting platform and canonical route names.';
