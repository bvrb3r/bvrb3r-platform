alter table if exists public.points_transactions
  drop constraint if exists points_transactions_event_type_check;

alter table if exists public.points_transactions
  add constraint points_transactions_event_type_check
  check (event_type in ('referral', 'booking', 'retention', 'tip', 'campaign', 'cashout'));

alter table if exists public.points_program_rules
  drop constraint if exists points_program_rules_event_type_check;

alter table if exists public.points_program_rules
  add constraint points_program_rules_event_type_check
  check (event_type in ('referral', 'booking', 'retention', 'tip', 'campaign', 'cashout'));

alter table if exists public.reward_campaigns
  drop constraint if exists reward_campaigns_event_target_check;

alter table if exists public.reward_campaigns
  add constraint reward_campaigns_event_target_check
  check (event_target in ('referral', 'booking', 'retention', 'tip', 'campaign', 'all'));

alter table if exists public.reward_eligibility_snapshots
  drop constraint if exists reward_eligibility_snapshots_event_type_check;

alter table if exists public.reward_eligibility_snapshots
  add constraint reward_eligibility_snapshots_event_type_check
  check (event_type in ('referral', 'booking', 'retention', 'tip', 'campaign', 'cashout'));

insert into public.points_program_rules (
  id,
  role,
  event_type,
  max_points_per_event,
  max_points_per_user_window,
  window_days,
  expiration_days,
  cashout_allowed,
  delay_unlock_hours,
  created_at
)
values (
  'points-rule-client-tip',
  'client',
  'tip',
  6,
  18,
  30,
  90,
  false,
  48,
  timezone('utc', now())
)
on conflict (id) do update set
  role = excluded.role,
  event_type = excluded.event_type,
  max_points_per_event = excluded.max_points_per_event,
  max_points_per_user_window = excluded.max_points_per_user_window,
  window_days = excluded.window_days,
  expiration_days = excluded.expiration_days,
  cashout_allowed = excluded.cashout_allowed,
  delay_unlock_hours = excluded.delay_unlock_hours;
