-- Staging ledger version: 20260803073220.
begin;

create table if not exists public.app_identity_cards (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null,
  public_identifier uuid not null default gen_random_uuid(),
  code_version bigint not null default 1,
  code_expires_at timestamptz not null,
  paused_at timestamptz,
  regenerated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (public_identifier),
  constraint app_identity_cards_role_ck
    check (role in ('client_user', 'barber_user', 'shop_owner_user')),
  constraint app_identity_cards_version_ck check (code_version > 0),
  constraint app_identity_cards_expiry_ck check (code_expires_at > created_at)
);

create index if not exists app_identity_cards_active_resolver_idx
  on public.app_identity_cards (public_identifier, code_version, code_expires_at)
  where paused_at is null;

create table if not exists public.app_identity_card_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  previous_code_version bigint,
  next_code_version bigint not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint app_identity_card_events_action_ck
    check (action in ('issued', 'expired_rotation', 'regenerated', 'paused', 'resumed')),
  constraint app_identity_card_events_versions_ck check (
    next_code_version > 0
    and (previous_code_version is null or previous_code_version > 0)
  )
);

create index if not exists app_identity_card_events_user_idx
  on public.app_identity_card_events (user_id, created_at desc);

alter table public.app_identity_cards enable row level security;
alter table public.app_identity_cards force row level security;
alter table public.app_identity_card_events enable row level security;
alter table public.app_identity_card_events force row level security;

create policy "app id owner read"
  on public.app_identity_cards for select to authenticated
  using (
    (select auth.uid()) = public.app_identity_cards.user_id
    and exists (
      select 1
      from public.profiles p
      where p.id = public.app_identity_cards.user_id
        and p.role::text = public.app_identity_cards.role
    )
  );

create policy "app id event owner read"
  on public.app_identity_card_events for select to authenticated
  using ((select auth.uid()) = public.app_identity_card_events.user_id);

revoke all on public.app_identity_cards, public.app_identity_card_events
  from anon, authenticated;
grant select on public.app_identity_cards, public.app_identity_card_events
  to authenticated;
grant all on public.app_identity_cards, public.app_identity_card_events
  to service_role;

create or replace function private.pr36_lock_app_identity_card_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'App ID audit events are immutable';
end;
$$;

revoke all on function private.pr36_lock_app_identity_card_event()
  from public, anon, authenticated, service_role;
grant execute on function private.pr36_lock_app_identity_card_event()
  to postgres;

drop trigger if exists pr36_lock_app_identity_card_event
  on public.app_identity_card_events;
create trigger pr36_lock_app_identity_card_event
  before update or delete on public.app_identity_card_events
  for each row execute function private.pr36_lock_app_identity_card_event();

create or replace function private.pr36_validate_app_id_expiry(p_code_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_code_expires_at <= now() + interval '5 minutes'
     or p_code_expires_at > now() + interval '90 days' then
    raise exception 'App ID expiry must be between five minutes and ninety days from now';
  end if;
end;
$$;

revoke all on function private.pr36_validate_app_id_expiry(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function private.pr36_validate_app_id_expiry(timestamptz)
  to postgres;

create or replace function public.pr36_ensure_app_identity_card(
  p_user_id uuid,
  p_role text,
  p_code_expires_at timestamptz
)
returns public.app_identity_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  card public.app_identity_cards%rowtype;
  previous_version bigint;
begin
  if p_role not in ('client_user', 'barber_user', 'shop_owner_user') then
    raise exception 'unsupported App ID role';
  end if;
  perform 1
  from public.profiles p
  where p.id = p_user_id and p.role::text = p_role
  for update;
  if not found then
    raise exception 'App ID role does not match the canonical profile';
  end if;
  perform private.pr36_validate_app_id_expiry(p_code_expires_at);

  select * into card
  from public.app_identity_cards c
  where c.user_id = p_user_id
  for update;

  if not found then
    insert into public.app_identity_cards (
      user_id, role, code_expires_at
    ) values (
      p_user_id, p_role, p_code_expires_at
    ) returning * into card;

    insert into public.app_identity_card_events (
      user_id, action, next_code_version, actor_id
    ) values (
      p_user_id, 'issued', card.code_version, p_user_id
    );
  elsif card.code_expires_at <= now() or card.role <> p_role then
    previous_version := card.code_version;
    update public.app_identity_cards
    set role = p_role,
        code_version = code_version + 1,
        code_expires_at = p_code_expires_at,
        regenerated_at = now(),
        updated_at = now()
    where user_id = p_user_id
    returning * into card;

    insert into public.app_identity_card_events (
      user_id, action, previous_code_version, next_code_version, actor_id
    ) values (
      p_user_id, 'expired_rotation', previous_version, card.code_version, p_user_id
    );
  end if;

  return card;
end;
$$;

revoke all on function public.pr36_ensure_app_identity_card(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.pr36_ensure_app_identity_card(uuid, text, timestamptz)
  to service_role;

create or replace function public.pr36_regenerate_app_identity_card(
  p_user_id uuid,
  p_role text,
  p_code_expires_at timestamptz
)
returns public.app_identity_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  card public.app_identity_cards%rowtype;
  previous_version bigint;
begin
  perform 1
  from public.profiles p
  where p.id = p_user_id and p.role::text = p_role
  for update;
  if not found then
    raise exception 'App ID role does not match the canonical profile';
  end if;
  perform private.pr36_validate_app_id_expiry(p_code_expires_at);

  select * into card
  from public.app_identity_cards c
  where c.user_id = p_user_id and c.role = p_role
  for update;
  if not found then
    raise exception 'App ID card was not found';
  end if;

  previous_version := card.code_version;
  update public.app_identity_cards
  set code_version = code_version + 1,
      code_expires_at = p_code_expires_at,
      regenerated_at = now(),
      updated_at = now()
  where user_id = p_user_id
  returning * into card;

  insert into public.app_identity_card_events (
    user_id, action, previous_code_version, next_code_version, actor_id
  ) values (
    p_user_id, 'regenerated', previous_version, card.code_version, p_user_id
  );

  return card;
end;
$$;

revoke all on function public.pr36_regenerate_app_identity_card(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.pr36_regenerate_app_identity_card(uuid, text, timestamptz)
  to service_role;

create or replace function public.pr36_set_app_identity_card_paused(
  p_user_id uuid,
  p_role text,
  p_paused boolean
)
returns public.app_identity_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  card public.app_identity_cards%rowtype;
  next_paused_at timestamptz;
begin
  perform 1
  from public.profiles p
  where p.id = p_user_id and p.role::text = p_role
  for update;
  if not found then
    raise exception 'App ID role does not match the canonical profile';
  end if;

  next_paused_at := case when p_paused then now() else null end;
  update public.app_identity_cards
  set paused_at = next_paused_at,
      updated_at = now()
  where user_id = p_user_id and role = p_role
  returning * into card;
  if not found then
    raise exception 'App ID card was not found';
  end if;

  insert into public.app_identity_card_events (
    user_id, action, previous_code_version, next_code_version, actor_id
  ) values (
    p_user_id,
    case when p_paused then 'paused' else 'resumed' end,
    card.code_version,
    card.code_version,
    p_user_id
  );

  return card;
end;
$$;

revoke all on function public.pr36_set_app_identity_card_paused(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.pr36_set_app_identity_card_paused(uuid, text, boolean)
  to service_role;

comment on table public.app_identity_cards is
  'PR36 App ID resolver authority. A code is valid only when its signed version matches this row, has not expired, and the card is not paused.';
comment on table public.app_identity_card_events is
  'PR36 immutable audit trail for App ID issue, rotation, regeneration, pause, and resume transitions.';

notify pgrst, 'reload schema';

commit;
