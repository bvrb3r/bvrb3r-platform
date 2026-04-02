create table if not exists public.client_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_reference text not null unique,
  favorite_barber_reference text,
  favorite_location_reference text,
  primary_service_reference text,
  last_completed_at timestamptz,
  next_due_at timestamptz,
  average_cycle_days integer,
  completed_visit_count integer not null default 0 check (completed_visit_count >= 0),
  repeat_visit_count integer not null default 0 check (repeat_visit_count >= 0),
  active_appointment_count integer not null default 0 check (active_appointment_count >= 0),
  rebooking_window text not null default 'building' check (rebooking_window in ('building', 'on_track', 'due_soon', 'due_now', 'overdue', 'scheduled')),
  churn_risk text not null default 'low' check (churn_risk in ('low', 'medium', 'high')),
  churn_score integer not null default 0 check (churn_score between 0 and 100),
  reengagement_eligible boolean not null default false,
  loyalty_segment text not null default 'new' check (loyalty_segment in ('new', 'repeat', 'loyal', 'vip', 'at_risk')),
  recommended_barber_reference text,
  recommended_location_reference text,
  recommended_service_reference text,
  next_best_action text not null default '',
  explanation text not null default '',
  recommendation_reasons jsonb not null default '[]'::jsonb,
  signal_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists client_intelligence_snapshots_rebooking_idx
  on public.client_intelligence_snapshots (rebooking_window, churn_risk, updated_at desc);

create index if not exists client_intelligence_snapshots_location_idx
  on public.client_intelligence_snapshots (favorite_location_reference, updated_at desc);

create index if not exists client_intelligence_snapshots_barber_idx
  on public.client_intelligence_snapshots (recommended_barber_reference, updated_at desc);

create table if not exists public.location_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  location_reference text not null unique,
  repeat_client_count integer not null default 0 check (repeat_client_count >= 0),
  loyal_client_count integer not null default 0 check (loyal_client_count >= 0),
  churn_risk_client_count integer not null default 0 check (churn_risk_client_count >= 0),
  reengagement_eligible_count integer not null default 0 check (reengagement_eligible_count >= 0),
  rebooking_opportunity_count integer not null default 0 check (rebooking_opportunity_count >= 0),
  completed_service_count integer not null default 0 check (completed_service_count >= 0),
  top_returning_clients jsonb not null default '[]'::jsonb,
  barber_retention jsonb not null default '[]'::jsonb,
  signal_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists location_intelligence_snapshots_updated_idx
  on public.location_intelligence_snapshots (updated_at desc);

create index if not exists location_intelligence_snapshots_opportunity_idx
  on public.location_intelligence_snapshots (rebooking_opportunity_count desc, churn_risk_client_count desc);
