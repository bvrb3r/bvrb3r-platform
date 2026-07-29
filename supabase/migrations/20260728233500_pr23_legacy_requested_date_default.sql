-- Product PR23 staging certification follow-up.
-- requested_date is a required legacy queue column. New paths write it
-- explicitly, and this default keeps older safe callers compatible.

begin;

alter table public.waitlist_entries
  alter column requested_date set default current_date;

commit;
