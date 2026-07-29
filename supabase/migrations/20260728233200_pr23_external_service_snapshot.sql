-- Product PR23 staging certification follow-up.
-- Imported ChairSync appointments retain their provider service label without
-- manufacturing a BVRB3R service row or importing any external financial data.

begin;

alter table public.waitlist_entries
  alter column service_id drop not null,
  add column if not exists source_service_name text;

alter table public.waitlist_entries
  drop constraint if exists waitlist_entries_source_service_name_ck;

alter table public.waitlist_entries
  add constraint waitlist_entries_source_service_name_ck
    check (
      source_service_name is null
      or length(trim(source_service_name)) between 1 and 200
    );

comment on column public.waitlist_entries.source_service_name is
  'Operational service-name snapshot for imported appointments. It carries no price, amount, fee, tip, or revenue truth.';

commit;
