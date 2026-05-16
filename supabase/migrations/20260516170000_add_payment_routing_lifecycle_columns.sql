alter table public.payment_routing_records
  add column if not exists hold_reason text,
  add column if not exists eligible_at timestamptz,
  add column if not exists held_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists reversed_at timestamptz;

create index if not exists payment_routing_records_lifecycle_idx
  on public.payment_routing_records (money_routing_status, eligible_at desc, held_at desc);
