begin;

alter table public.locations
  add column if not exists address text,
  add column if not exists address_line_2 text,
  add column if not exists postal_code text;

comment on column public.locations.address
  is 'Client-facing street address for the booking/service location.';

comment on column public.locations.address_line_2
  is 'Optional suite, chair, or unit detail for the booking/service location.';

comment on column public.locations.postal_code
  is 'Optional postal code shown to clients after booking.';

notify pgrst, 'reload schema';

commit;
