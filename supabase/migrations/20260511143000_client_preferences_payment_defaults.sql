alter table public.client_preferences
  add column if not exists provider_customer_ref text,
  add column if not exists default_payment_method_ref text;

create index if not exists client_preferences_payment_defaults_idx
  on public.client_preferences (provider_customer_ref, default_payment_method_ref);

comment on column public.client_preferences.provider_customer_ref is 'Default payment provider customer reference synced from the canonical client wallet.';
comment on column public.client_preferences.default_payment_method_ref is 'Default provider payment method reference selected for client booking checkout.';
