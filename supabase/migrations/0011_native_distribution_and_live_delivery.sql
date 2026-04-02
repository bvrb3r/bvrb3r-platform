alter table if exists public.notification_deliveries
  add column if not exists last_attempted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists retry_count integer not null default 0,
  add column if not exists provider_message_id text;

alter table if exists public.notification_delivery_attempts
  add column if not exists provider_message_id text,
  add column if not exists provider_status_code integer,
  add column if not exists executed_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.push_subscriptions
  add column if not exists native_bridge text,
  add column if not exists app_bundle_id text,
  add column if not exists app_version text,
  add column if not exists last_validated_at timestamptz;

create index if not exists notification_deliveries_updated_idx
  on public.notification_deliveries (updated_at desc, status);

create index if not exists notification_delivery_attempts_retry_idx
  on public.notification_delivery_attempts (status, next_retry_at desc nulls last);

create index if not exists push_subscriptions_native_idx
  on public.push_subscriptions (provider, native_bridge, status, updated_at desc);

comment on column public.notification_deliveries.last_attempted_at is 'Last delivery execution attempt timestamp across all providers.';
comment on column public.notification_deliveries.retry_count is 'Aggregate retry count derived from delivery attempts.';
comment on column public.notification_deliveries.provider_message_id is 'Provider-side delivery identifier when available.';
comment on column public.notification_delivery_attempts.provider_metadata is 'Execution metadata returned by the delivery provider or bridge.';
comment on column public.push_subscriptions.native_bridge is 'Native push bridge type used by wrapped app subscriptions.';
comment on column public.push_subscriptions.app_bundle_id is 'Wrapped-app bundle or package identifier reported by the device.';
comment on column public.push_subscriptions.app_version is 'Wrapped-app version reported by the device during activation.';
comment on column public.push_subscriptions.last_validated_at is 'Last time the subscription was validated or revoked by the runtime.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notification_deliveries'
  ) then
    execute 'alter publication supabase_realtime add table public.notification_deliveries';
  end if;
end $$;
