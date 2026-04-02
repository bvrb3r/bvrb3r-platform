alter table public.workflow_events
  drop constraint if exists workflow_events_event_type_check;

alter table public.workflow_events
  add constraint workflow_events_event_type_check
  check (event_type in ('booking', 'check_in', 'service_start', 'service_complete', 'checkout', 'cancel'));