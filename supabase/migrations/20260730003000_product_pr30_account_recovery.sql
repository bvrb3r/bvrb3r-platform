begin;

create table if not exists public.auth_recovery_challenges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  channel text not null,
  target_hash text not null,
  request_source_hash text not null,
  code_hash text not null,
  reset_token_hash text,
  attempt_count integer not null default 0,
  status text not null default 'issued',
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_recovery_channel_ck check (channel in ('email', 'sms')),
  constraint auth_recovery_attempt_count_ck check (attempt_count between 0 and 5),
  constraint auth_recovery_status_ck check (
    status in ('issued', 'verified', 'consumed', 'expired', 'locked', 'delivery_failed')
  ),
  constraint auth_recovery_hash_ck check (
    target_hash ~ '^[0-9a-f]{64}$'
    and request_source_hash ~ '^[0-9a-f]{64}$'
    and code_hash ~ '^[0-9a-f]{64}$'
    and (reset_token_hash is null or reset_token_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint auth_recovery_expiry_ck check (expires_at > created_at),
  constraint auth_recovery_state_time_ck check (
    (status = 'verified' and verified_at is not null)
    or (status = 'consumed' and verified_at is not null and consumed_at is not null)
    or status not in ('verified', 'consumed')
  )
);

create index if not exists auth_recovery_target_rate_idx
  on public.auth_recovery_challenges (target_hash, created_at desc);

create index if not exists auth_recovery_source_rate_idx
  on public.auth_recovery_challenges (request_source_hash, created_at desc);

create unique index if not exists auth_recovery_reset_token_uidx
  on public.auth_recovery_challenges (reset_token_hash)
  where reset_token_hash is not null;

create index if not exists auth_recovery_profile_idx
  on public.auth_recovery_challenges (profile_id);

alter table public.auth_recovery_challenges enable row level security;
alter table public.auth_recovery_challenges force row level security;

revoke all on public.auth_recovery_challenges
  from public, anon, authenticated;
grant select, insert, update, delete on public.auth_recovery_challenges
  to service_role;

drop policy if exists auth_recovery_service_role_only
  on public.auth_recovery_challenges;
create policy auth_recovery_service_role_only
  on public.auth_recovery_challenges
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.auth_recovery_challenges is
  'PR30 short-lived account-recovery evidence. Stores digests only; no plaintext recovery codes or reset tokens.';

commit;
