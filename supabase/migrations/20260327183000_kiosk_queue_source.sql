alter table public.waitlist_entries
  drop constraint if exists waitlist_entries_queue_source_check;

alter table public.waitlist_entries
  add constraint waitlist_entries_queue_source_check
    check (queue_source in ('walk_in', 'cancellation_fill', 'manual', 'app', 'kiosk'));
