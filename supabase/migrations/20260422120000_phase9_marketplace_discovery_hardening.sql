alter table public.barber_rankings
  add column if not exists completion_rate numeric(8,2) not null default 0,
  add column if not exists cancellation_rate numeric(8,2) not null default 0,
  add column if not exists activity_recency_score numeric(8,2) not null default 0;

create unique index if not exists reviews_one_per_appointment_uidx
  on public.reviews (appointment_id)
  where appointment_id is not null;

comment on column public.barber_rankings.completion_rate is
  'Canonical booking completion rate used in marketplace ranking.';

comment on column public.barber_rankings.cancellation_rate is
  'Canonical cancellation and no-show rate used in marketplace ranking.';

comment on column public.barber_rankings.activity_recency_score is
  'Canonical recent activity signal derived from real booking history.';
