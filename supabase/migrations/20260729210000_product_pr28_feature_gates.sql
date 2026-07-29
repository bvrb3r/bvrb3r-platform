begin;

create table if not exists public.feature_flags (
  key text primary key,
  reason text not null check (reason in ('building', 'plan', 'debug', 'staged')),
  enabled boolean not null default false,
  plan_required text null check (plan_required is null or plan_required in ('standard', 'pro', 'elite')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;

drop policy if exists feature_flags_public_read on public.feature_flags;
create policy feature_flags_public_read
on public.feature_flags
for select
to anon, authenticated
using (true);

revoke all on table public.feature_flags from public, anon, authenticated;
grant select on table public.feature_flags to anon, authenticated;
grant all on table public.feature_flags to service_role;

insert into public.feature_flags (key, reason, enabled, plan_required)
values
  ('client.home.group_booking', 'building', false, null),
  ('culture.creator_tools', 'building', false, null),
  ('barber.analytics.city_benchmarks', 'building', false, null),
  ('owner.analytics.forecasting', 'plan', false, 'pro'),
  ('kiosk.analytics.multi_device_compare', 'building', false, null),
  ('client.analytics.style_history', 'building', false, null),
  ('queue.smart_overbook', 'debug', false, null),
  ('owner.floor.auto_rebalance', 'building', false, null),
  ('rent.autopilot', 'building', false, null),
  ('reports.custom_builder', 'plan', false, 'pro'),
  ('owner.reports.custom_builder', 'plan', false, 'pro'),
  ('messages.broadcasts', 'plan', false, 'pro'),
  ('barber.checkout.saved_cards', 'building', false, null),
  ('kiosk.shop.loyalty_check_in', 'staged', false, null),
  ('kiosk.barber.loyalty_check_in', 'staged', false, null)
on conflict (key) do nothing;

commit;
