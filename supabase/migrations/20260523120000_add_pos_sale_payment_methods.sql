alter table public.pos_sales
  add column if not exists payment_method text,
  add column if not exists cash_recorded_at timestamptz,
  add column if not exists invoice_url text,
  add column if not exists invoice_status text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text;

alter table public.pos_sales
  drop constraint if exists pos_sales_payment_method_ck,
  drop constraint if exists pos_sales_invoice_status_ck;

alter table public.pos_sales
  add constraint pos_sales_payment_method_ck
  check (
    payment_method is null
    or payment_method in ('tap_to_pay', 'card_on_file', 'cash', 'invoice', 'test')
  ),
  add constraint pos_sales_invoice_status_ck
  check (
    invoice_status is null
    or invoice_status in ('pending', 'sent', 'paid', 'expired', 'voided')
  );

create index if not exists pos_sales_payment_method_created_idx
  on public.pos_sales (payment_method, created_at desc)
  where payment_method is not null;

create index if not exists pos_sales_invoice_status_idx
  on public.pos_sales (invoice_status, created_at desc)
  where invoice_status is not null;
