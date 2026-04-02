alter table public.staff_locations
  add column if not exists routing_model text,
  add column if not exists commission_rate numeric(5,4),
  add column if not exists booth_rent_amount numeric(10,2),
  add column if not exists booth_rent_frequency text,
  add column if not exists payout_block_reason text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists fintech_updated_at timestamptz not null default now();

update public.staff_locations sl
set
  routing_model = coalesce(
    sl.routing_model,
    case
      when b.compensation_model = 'booth_rent' then 'booth_rent'
      else 'commission'
    end
  ),
  commission_rate = coalesce(sl.commission_rate, b.commission_rate),
  booth_rent_amount = coalesce(sl.booth_rent_amount, b.booth_rent_amount),
  booth_rent_frequency = coalesce(sl.booth_rent_frequency, b.booth_rent_frequency),
  updated_at = now(),
  fintech_updated_at = now()
from public.barbers b
where b.profile_id = sl.profile_id
  and (
    sl.routing_model is null
    or sl.commission_rate is null
    or sl.booth_rent_amount is null
    or sl.booth_rent_frequency is null
  );

update public.staff_locations
set
  routing_model = coalesce(routing_model, 'commission'),
  updated_at = now(),
  fintech_updated_at = now()
where routing_model is null;

alter table public.staff_locations
  drop constraint if exists staff_locations_routing_model_ck,
  drop constraint if exists staff_locations_commission_rate_ck,
  drop constraint if exists staff_locations_booth_rent_amount_ck,
  drop constraint if exists staff_locations_booth_rent_frequency_ck;

alter table public.staff_locations
  add constraint staff_locations_routing_model_ck check (routing_model in ('freelance', 'commission', 'booth_rent')),
  add constraint staff_locations_commission_rate_ck check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 1)),
  add constraint staff_locations_booth_rent_amount_ck check (booth_rent_amount is null or booth_rent_amount >= 0),
  add constraint staff_locations_booth_rent_frequency_ck check (booth_rent_frequency is null or booth_rent_frequency in ('weekly', 'monthly'));

create index if not exists staff_locations_location_routing_idx
  on public.staff_locations (location_id, routing_model, updated_at desc);

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('barber', 'shop')),
  barber_id uuid references public.barbers(id) on delete cascade,
  shop_id uuid references public.locations(id) on delete cascade,
  provider text not null default 'stripe_connect' check (provider in ('stripe_connect', 'manual')),
  provider_account_id text,
  onboarding_status text not null default 'not_started' check (onboarding_status in ('not_started', 'invited', 'pending', 'submitted', 'restricted', 'verified')),
  payout_readiness_status text not null default 'not_ready' check (payout_readiness_status in ('not_ready', 'needs_attention', 'ready', 'blocked')),
  legal_readiness_status text not null default 'pending' check (legal_readiness_status in ('pending', 'accepted', 'outdated')),
  tax_readiness_status text not null default 'pending' check (tax_readiness_status in ('pending', 'submitted', 'verified')),
  requirements_currently_due jsonb not null default '[]'::jsonb,
  requirements_eventually_due jsonb not null default '[]'::jsonb,
  requirements_past_due jsonb not null default '[]'::jsonb,
  disabled_reason text,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  last_checked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connected_accounts_subject_target_ck check (
    (subject_type = 'barber' and barber_id is not null and shop_id is null)
    or (subject_type = 'shop' and shop_id is not null and barber_id is null)
  )
);

create unique index if not exists connected_accounts_barber_uidx
  on public.connected_accounts (barber_id)
  where barber_id is not null;

create unique index if not exists connected_accounts_shop_uidx
  on public.connected_accounts (shop_id)
  where shop_id is not null;

create index if not exists connected_accounts_readiness_idx
  on public.connected_accounts (subject_type, payout_readiness_status, updated_at desc);

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  agreement_type text not null check (agreement_type in ('platform_terms', 'barber_agreement', 'shop_agreement', 'payout_tax_acknowledgment')),
  agreement_version text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_role public.app_role not null,
  barber_id uuid references public.barbers(id) on delete cascade,
  shop_id uuid references public.locations(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint legal_acceptances_target_ck check (barber_id is not null or shop_id is not null)
);

create index if not exists legal_acceptances_actor_type_idx
  on public.legal_acceptances (actor_profile_id, agreement_type, accepted_at desc);

create index if not exists legal_acceptances_barber_type_idx
  on public.legal_acceptances (barber_id, agreement_type, accepted_at desc);

create index if not exists legal_acceptances_shop_type_idx
  on public.legal_acceptances (shop_id, agreement_type, accepted_at desc);

create table if not exists public.payment_routing_records (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  membership_id uuid references public.staff_locations(id) on delete set null,
  routing_model text not null check (routing_model in ('freelance', 'commission', 'booth_rent')),
  payout_recipient_type text not null check (payout_recipient_type in ('barber', 'shop', 'split')),
  provider_gross_amount numeric(10,2) not null default 0,
  refunded_amount numeric(10,2) not null default 0,
  provider_fee_amount numeric(10,2) not null default 0,
  provider_net_amount numeric(10,2) not null default 0,
  platform_fee_amount numeric(10,2) not null default 0,
  barber_payout_amount numeric(10,2) not null default 0,
  shop_split_amount numeric(10,2) not null default 0,
  currency text not null default 'usd',
  payout_readiness_status text not null default 'not_ready' check (payout_readiness_status in ('not_ready', 'needs_attention', 'ready', 'blocked')),
  money_routing_status text not null default 'pending' check (money_routing_status in ('pending', 'ready_for_payout', 'blocked', 'manual_review', 'paid_out', 'refunded')),
  blocked_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id),
  constraint payment_routing_provider_gross_ck check (provider_gross_amount >= 0),
  constraint payment_routing_refunded_ck check (refunded_amount >= 0),
  constraint payment_routing_provider_fee_ck check (provider_fee_amount >= 0),
  constraint payment_routing_provider_net_ck check (provider_net_amount >= 0),
  constraint payment_routing_platform_fee_ck check (platform_fee_amount >= 0),
  constraint payment_routing_barber_payout_ck check (barber_payout_amount >= 0),
  constraint payment_routing_shop_split_ck check (shop_split_amount >= 0),
  constraint payment_routing_currency_ck check (currency ~ '^[a-z]{3}$')
);

create index if not exists payment_routing_records_appointment_idx
  on public.payment_routing_records (appointment_id);

create index if not exists payment_routing_records_membership_idx
  on public.payment_routing_records (membership_id, updated_at desc);

create index if not exists payment_routing_records_status_idx
  on public.payment_routing_records (money_routing_status, payout_readiness_status, updated_at desc);

alter table public.connected_accounts enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.payment_routing_records enable row level security;

drop policy if exists "connected accounts barber self select" on public.connected_accounts;
drop policy if exists "connected accounts management select" on public.connected_accounts;
drop policy if exists "connected accounts management insert" on public.connected_accounts;
drop policy if exists "connected accounts management update" on public.connected_accounts;
drop policy if exists "legal acceptances actor select" on public.legal_acceptances;
drop policy if exists "legal acceptances barber self select" on public.legal_acceptances;
drop policy if exists "legal acceptances management select" on public.legal_acceptances;
drop policy if exists "legal acceptances actor insert" on public.legal_acceptances;
drop policy if exists "payment routing barber self select" on public.payment_routing_records;
drop policy if exists "payment routing management select" on public.payment_routing_records;

create policy "connected accounts barber self select" on public.connected_accounts
  for select using (
    subject_type = 'barber'
    and exists (
      select 1
      from public.barbers b
      where b.id = connected_accounts.barber_id
        and b.profile_id = auth.uid()
    )
  );

create policy "connected accounts management select" on public.connected_accounts
  for select using (
    exists (
      select 1
      from public.staff_locations viewer_sl
      join public.profiles viewer_profile on viewer_profile.id = viewer_sl.profile_id
      where viewer_profile.id = auth.uid()
        and viewer_profile.role in ('owner', 'manager')
        and (
          (connected_accounts.subject_type = 'shop' and viewer_sl.location_id = connected_accounts.shop_id)
          or (
            connected_accounts.subject_type = 'barber'
            and exists (
              select 1
              from public.barbers b
              join public.staff_locations barber_sl on barber_sl.profile_id = b.profile_id
              where b.id = connected_accounts.barber_id
                and barber_sl.location_id = viewer_sl.location_id
            )
          )
        )
    )
  );

create policy "connected accounts management insert" on public.connected_accounts
  for insert with check (
    exists (
      select 1
      from public.staff_locations viewer_sl
      join public.profiles viewer_profile on viewer_profile.id = viewer_sl.profile_id
      where viewer_profile.id = auth.uid()
        and viewer_profile.role in ('owner', 'manager')
        and (
          (connected_accounts.subject_type = 'shop' and viewer_sl.location_id = connected_accounts.shop_id)
          or (
            connected_accounts.subject_type = 'barber'
            and exists (
              select 1
              from public.barbers b
              join public.staff_locations barber_sl on barber_sl.profile_id = b.profile_id
              where b.id = connected_accounts.barber_id
                and barber_sl.location_id = viewer_sl.location_id
            )
          )
        )
    )
  );

create policy "connected accounts management update" on public.connected_accounts
  for update using (
    exists (
      select 1
      from public.staff_locations viewer_sl
      join public.profiles viewer_profile on viewer_profile.id = viewer_sl.profile_id
      where viewer_profile.id = auth.uid()
        and viewer_profile.role in ('owner', 'manager')
        and (
          (connected_accounts.subject_type = 'shop' and viewer_sl.location_id = connected_accounts.shop_id)
          or (
            connected_accounts.subject_type = 'barber'
            and exists (
              select 1
              from public.barbers b
              join public.staff_locations barber_sl on barber_sl.profile_id = b.profile_id
              where b.id = connected_accounts.barber_id
                and barber_sl.location_id = viewer_sl.location_id
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.staff_locations viewer_sl
      join public.profiles viewer_profile on viewer_profile.id = viewer_sl.profile_id
      where viewer_profile.id = auth.uid()
        and viewer_profile.role in ('owner', 'manager')
        and (
          (connected_accounts.subject_type = 'shop' and viewer_sl.location_id = connected_accounts.shop_id)
          or (
            connected_accounts.subject_type = 'barber'
            and exists (
              select 1
              from public.barbers b
              join public.staff_locations barber_sl on barber_sl.profile_id = b.profile_id
              where b.id = connected_accounts.barber_id
                and barber_sl.location_id = viewer_sl.location_id
            )
          )
        )
    )
  );

create policy "legal acceptances actor select" on public.legal_acceptances
  for select using (actor_profile_id = auth.uid());

create policy "legal acceptances barber self select" on public.legal_acceptances
  for select using (
    barber_id is not null
    and exists (
      select 1
      from public.barbers b
      where b.id = legal_acceptances.barber_id
        and b.profile_id = auth.uid()
    )
  );

create policy "legal acceptances management select" on public.legal_acceptances
  for select using (
    exists (
      select 1
      from public.staff_locations viewer_sl
      join public.profiles viewer_profile on viewer_profile.id = viewer_sl.profile_id
      where viewer_profile.id = auth.uid()
        and viewer_profile.role in ('owner', 'manager')
        and (
          (legal_acceptances.shop_id is not null and viewer_sl.location_id = legal_acceptances.shop_id)
          or (
            legal_acceptances.barber_id is not null
            and exists (
              select 1
              from public.barbers b
              join public.staff_locations barber_sl on barber_sl.profile_id = b.profile_id
              where b.id = legal_acceptances.barber_id
                and barber_sl.location_id = viewer_sl.location_id
            )
          )
        )
    )
  );

create policy "legal acceptances actor insert" on public.legal_acceptances
  for insert with check (actor_profile_id = auth.uid());

create policy "payment routing barber self select" on public.payment_routing_records
  for select using (
    exists (
      select 1
      from public.payments p
      join public.barbers b on b.id = p.barber_id
      where p.id = payment_routing_records.payment_id
        and b.profile_id = auth.uid()
    )
  );

create policy "payment routing management select" on public.payment_routing_records
  for select using (
    exists (
      select 1
      from public.payments p
      join public.staff_locations viewer_sl on viewer_sl.location_id = p.shop_id
      join public.profiles viewer_profile on viewer_profile.id = viewer_sl.profile_id
      where p.id = payment_routing_records.payment_id
        and viewer_profile.id = auth.uid()
        and viewer_profile.role in ('owner', 'manager')
    )
  );
