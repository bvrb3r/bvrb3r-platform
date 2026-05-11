alter table public.payment_methods
  add column if not exists nickname text;

comment on column public.payment_methods.nickname is 'Client-facing saved-card nickname. Raw provider references remain internal.';
