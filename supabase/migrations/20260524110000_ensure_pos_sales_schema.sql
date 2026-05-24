create table if not exists public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  shop_id uuid references public.locations(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  customer_name text,
  source text not null default 'barber_keypad',
  status text not null default 'draft',
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  tip_cents integer not null default 0,
  platform_fee_cents integer not null default 0,
  client_fee_cents integer not null default 0,
  total_cents integer not null default 0,
  payment_id uuid references public.payments(id) on delete set null,
  note text,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pos_sales
  add column if not exists barber_id uuid references public.barbers(id) on delete cascade,
  add column if not exists shop_id uuid references public.locations(id) on delete set null,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists source text not null default 'barber_keypad',
  add column if not exists status text not null default 'draft',
  add column if not exists subtotal_cents integer not null default 0,
  add column if not exists discount_cents integer not null default 0,
  add column if not exists tip_cents integer not null default 0,
  add column if not exists platform_fee_cents integer not null default 0,
  add column if not exists client_fee_cents integer not null default 0,
  add column if not exists total_cents integer not null default 0,
  add column if not exists payment_id uuid references public.payments(id) on delete set null,
  add column if not exists note text,
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists payment_method text,
  add column if not exists cash_recorded_at timestamptz,
  add column if not exists invoice_url text,
  add column if not exists invoice_status text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists amount_cents integer,
  add column if not exists total_amount_cents integer,
  add column if not exists payment_status text,
  add column if not exists routing_required boolean,
  add column if not exists completed_at timestamptz;

alter table public.pos_sales
  drop constraint if exists pos_sales_status_ck,
  drop constraint if exists pos_sales_subtotal_cents_ck,
  drop constraint if exists pos_sales_discount_cents_ck,
  drop constraint if exists pos_sales_tip_cents_ck,
  drop constraint if exists pos_sales_platform_fee_cents_ck,
  drop constraint if exists pos_sales_client_fee_cents_ck,
  drop constraint if exists pos_sales_total_cents_ck,
  drop constraint if exists pos_sales_payment_method_ck,
  drop constraint if exists pos_sales_invoice_status_ck,
  drop constraint if exists pos_sales_payment_status_ck,
  drop constraint if exists pos_sales_amount_cents_ck,
  drop constraint if exists pos_sales_total_amount_cents_ck;

alter table public.pos_sales
  add constraint pos_sales_status_ck check (status in ('draft', 'payment_pending', 'paid', 'refunded', 'voided')),
  add constraint pos_sales_subtotal_cents_ck check (subtotal_cents >= 0),
  add constraint pos_sales_discount_cents_ck check (discount_cents >= 0),
  add constraint pos_sales_tip_cents_ck check (tip_cents >= 0),
  add constraint pos_sales_platform_fee_cents_ck check (platform_fee_cents >= 0),
  add constraint pos_sales_client_fee_cents_ck check (client_fee_cents >= 0),
  add constraint pos_sales_total_cents_ck check (total_cents >= 0),
  add constraint pos_sales_payment_method_ck check (
    payment_method is null
    or payment_method in ('tap_to_pay', 'card_on_file', 'cash', 'invoice', 'test')
  ),
  add constraint pos_sales_invoice_status_ck check (
    invoice_status is null
    or invoice_status in ('pending', 'sent', 'paid', 'expired', 'voided')
  ),
  add constraint pos_sales_payment_status_ck check (
    payment_status is null
    or payment_status in ('pending', 'pending_client_approval', 'paid', 'captured', 'failed', 'refunded')
  ),
  add constraint pos_sales_amount_cents_ck check (amount_cents is null or amount_cents >= 0),
  add constraint pos_sales_total_amount_cents_ck check (total_amount_cents is null or total_amount_cents >= 0);

create table if not exists public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  pos_sale_id uuid not null references public.pos_sales(id) on delete cascade,
  item_type text not null,
  service_id uuid references public.services(id) on delete set null,
  name_snapshot text not null,
  quantity integer not null default 1,
  unit_amount_cents integer not null,
  total_amount_cents integer not null,
  created_at timestamptz not null default now()
);

alter table public.pos_sale_items
  add column if not exists pos_sale_id uuid references public.pos_sales(id) on delete cascade,
  add column if not exists item_type text not null default 'custom_amount',
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists name_snapshot text not null default 'Custom Amount',
  add column if not exists quantity integer not null default 1,
  add column if not exists unit_amount_cents integer not null default 0,
  add column if not exists total_amount_cents integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

alter table public.pos_sale_items
  drop constraint if exists pos_sale_items_item_type_ck,
  drop constraint if exists pos_sale_items_quantity_ck,
  drop constraint if exists pos_sale_items_unit_amount_cents_ck,
  drop constraint if exists pos_sale_items_total_amount_cents_ck;

alter table public.pos_sale_items
  add constraint pos_sale_items_item_type_ck check (item_type in ('custom_amount', 'service', 'product', 'tip', 'discount')),
  add constraint pos_sale_items_quantity_ck check (quantity > 0),
  add constraint pos_sale_items_unit_amount_cents_ck check (unit_amount_cents >= 0),
  add constraint pos_sale_items_total_amount_cents_ck check (total_amount_cents >= 0);

create table if not exists public.pos_payment_requests (
  id uuid primary key default gen_random_uuid(),
  pos_sale_id uuid not null references public.pos_sales(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  amount_cents integer not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  message_thread_id uuid references public.message_threads(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pos_payment_requests
  add column if not exists pos_sale_id uuid references public.pos_sales(id) on delete cascade,
  add column if not exists barber_id uuid references public.barbers(id) on delete cascade,
  add column if not exists client_id uuid references public.clients(id) on delete cascade,
  add column if not exists amount_cents integer not null default 0,
  add column if not exists status text not null default 'pending',
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists message_thread_id uuid references public.message_threads(id) on delete set null,
  add column if not exists payment_id uuid references public.payments(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.pos_payment_requests
  drop constraint if exists pos_payment_requests_status_ck,
  drop constraint if exists pos_payment_requests_amount_cents_ck;

alter table public.pos_payment_requests
  add constraint pos_payment_requests_status_ck
    check (status in ('pending', 'approved', 'declined', 'expired', 'paid', 'failed')),
  add constraint pos_payment_requests_amount_cents_ck
    check (amount_cents > 0);

create index if not exists pos_sales_barber_created_idx
  on public.pos_sales (barber_id, created_at desc);

create index if not exists pos_sales_shop_created_idx
  on public.pos_sales (shop_id, created_at desc)
  where shop_id is not null;

create index if not exists pos_sales_client_created_idx
  on public.pos_sales (client_id, created_at desc)
  where client_id is not null;

create index if not exists pos_sales_payment_method_created_idx
  on public.pos_sales (payment_method, created_at desc)
  where payment_method is not null;

create index if not exists pos_sales_invoice_status_idx
  on public.pos_sales (invoice_status, created_at desc)
  where invoice_status is not null;

create index if not exists pos_sale_items_sale_idx
  on public.pos_sale_items (pos_sale_id);

create index if not exists pos_payment_requests_pos_sale_idx
  on public.pos_payment_requests (pos_sale_id, updated_at desc);

create index if not exists pos_payment_requests_client_status_idx
  on public.pos_payment_requests (client_id, status, requested_at desc);

create index if not exists pos_payment_requests_barber_status_idx
  on public.pos_payment_requests (barber_id, status, requested_at desc);

alter table public.payments
  add column if not exists pos_sale_id uuid references public.pos_sales(id) on delete set null;

create index if not exists payments_pos_sale_idx
  on public.payments (pos_sale_id)
  where pos_sale_id is not null;

alter table public.payments
  drop constraint if exists payments_payment_type_ck;

alter table public.payments
  add constraint payments_payment_type_ck
  check (payment_type in ('booking', 'tip', 'add_on', 'booth_rent', 'subscription', 'pos_sale'));

alter table public.payments
  drop constraint if exists payments_appointment_scope_ck,
  drop constraint if exists payments_pos_sale_scope_ck,
  drop constraint if exists payments_business_object_ck;

alter table public.payments
  add constraint payments_appointment_scope_ck
  check (payment_type not in ('booking', 'tip', 'add_on') or appointment_id is not null) not valid,
  add constraint payments_pos_sale_scope_ck
  check (payment_type <> 'pos_sale' or pos_sale_id is not null) not valid,
  add constraint payments_business_object_ck
  check (
    appointment_id is not null
    or pos_sale_id is not null
    or payment_type in ('booth_rent', 'subscription')
  ) not valid;

alter table public.payment_routing_records
  add column if not exists pos_sale_id uuid references public.pos_sales(id) on delete set null;

create index if not exists payment_routing_records_pos_sale_idx
  on public.payment_routing_records (pos_sale_id)
  where pos_sale_id is not null;

alter table public.payment_routing_records
  drop constraint if exists payment_routing_business_object_ck;

alter table public.payment_routing_records
  add constraint payment_routing_business_object_ck
  check (
    appointment_id is not null
    or pos_sale_id is not null
    or membership_id is not null
  ) not valid;

notify pgrst, 'reload schema';
