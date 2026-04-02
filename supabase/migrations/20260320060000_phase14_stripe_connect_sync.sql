alter table public.connected_accounts
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists processor_last_synced_at timestamptz,
  add column if not exists processor_last_event_id text,
  add column if not exists processor_last_event_type text,
  add column if not exists dashboard_last_accessed_at timestamptz;

create unique index if not exists connected_accounts_provider_account_uidx
  on public.connected_accounts (provider_account_id)
  where provider_account_id is not null;

create index if not exists connected_accounts_processor_sync_idx
  on public.connected_accounts (provider, processor_last_synced_at desc);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  stripe_account_id text,
  connected_account_id uuid references public.connected_accounts(id) on delete set null,
  event_type text not null,
  livemode boolean not null default false,
  api_version text,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  attempt_count integer not null default 1 check (attempt_count >= 1),
  payload_excerpt jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_account_idx
  on public.stripe_webhook_events (stripe_account_id, received_at desc);

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events (processing_status, received_at desc);

alter table public.stripe_webhook_events enable row level security;

drop policy if exists "stripe webhook events management select" on public.stripe_webhook_events;

create policy "stripe webhook events management select" on public.stripe_webhook_events
  for select using (
    exists (
      select 1
      from public.staff_locations viewer_sl
      join public.profiles viewer_profile on viewer_profile.id = viewer_sl.profile_id
      left join public.connected_accounts ca on ca.id = stripe_webhook_events.connected_account_id
      where viewer_profile.id = auth.uid()
        and viewer_profile.role in ('owner', 'manager')
        and (
          (ca.subject_type = 'shop' and viewer_sl.location_id = ca.shop_id)
          or (
            ca.subject_type = 'barber'
            and exists (
              select 1
              from public.barbers b
              join public.staff_locations barber_sl on barber_sl.profile_id = b.profile_id
              where b.id = ca.barber_id
                and barber_sl.location_id = viewer_sl.location_id
            )
          )
        )
    )
  );
