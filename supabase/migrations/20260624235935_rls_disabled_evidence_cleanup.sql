begin;

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

/*
  PR #34 protected-risk RLS disabled evidence cleanup candidate.

  Target tables:
  - platform_admin_controls, platform_admin_audit_logs
  - client_intelligence_snapshots, location_intelligence_snapshots
  - notes, tasks, media_assets
  - commission_rules, payouts, bonuses, deposits
  - gift_cards, promo_codes
  - retail_products, inventory_movements

  Safety:
  - No production data is mutated by this candidate.
  - No payment, payout, refund, Stripe, role-normalization, or booking lifecycle
    logic is changed.
  - All raw private/operational/financial/internal tables block anon access.
  - Public-safe catalog/lookup surfaces must be created separately if needed.
*/

create or replace function private.rls_disabled_cleanup_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.rls_batch_5_is_platform_admin();
$$;

create or replace function private.rls_disabled_cleanup_is_client_reference_owner(
  p_client_reference text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(btrim(coalesce(p_client_reference, '')), '') is not null
    and exists (
      select 1
      from public.clients c
      where c.profile_id = auth.uid()
        and p_client_reference in (c.id::text, c.profile_id::text, c.reference_code)
    );
$$;

create or replace function private.rls_disabled_cleanup_can_read_location_reference(
  p_location_reference text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.rls_disabled_cleanup_is_platform_admin()
    or private.rls_batch_5_is_shop_operator_reference(p_location_reference)
    or exists (
      select 1
      from public.locations l
      where (
          l.id::text = p_location_reference
          or l.reference_code = p_location_reference
        )
        and private.rls_batch_5_is_shop_operator_reference(l.reference_code, l.id)
    );
$$;

create or replace function private.rls_disabled_cleanup_can_read_appointment(
  p_appointment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_appointment_id is not null
    and exists (
      select 1
      from public.appointments a
      where a.id = p_appointment_id
        and (
          private.rls_disabled_cleanup_is_platform_admin()
          or private.rls_batch_5_is_client_owner(a.client_id)
          or private.rls_batch_5_is_barber_owner(a.barber_id)
          or private.rls_batch_5_is_shop_operator_reference(null, coalesce(a.shop_id, a.location_id))
        )
    );
$$;

create or replace function private.rls_disabled_cleanup_can_read_barber_finance(
  p_barber_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_barber_id is not null
    and (
      private.rls_disabled_cleanup_is_platform_admin()
      or private.rls_batch_5_can_read_barber_by_shop(p_barber_id)
    );
$$;

create or replace function private.rls_disabled_cleanup_can_read_retail_product(
  p_product_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_product_id is not null
    and exists (
      select 1
      from public.retail_products rp
      where rp.id = p_product_id
        and (
          private.rls_disabled_cleanup_is_platform_admin()
          or private.rls_batch_5_is_shop_operator_reference(null, rp.location_id)
        )
    );
$$;

comment on function private.rls_disabled_cleanup_is_platform_admin() is
  'PR34 RLS helper: explicit platform_admin check reused from PR32 without exposing private data.';
comment on function private.rls_disabled_cleanup_is_client_reference_owner(text) is
  'PR34 RLS helper: maps client intelligence references to stable client/profile ids owned by the authenticated profile.';
comment on function private.rls_disabled_cleanup_can_read_location_reference(text) is
  'PR34 RLS helper: proves shop/location authority through PR32 owner/operator helpers and stable shop/location references.';
comment on function private.rls_disabled_cleanup_can_read_appointment(uuid) is
  'PR34 RLS helper: proves appointment participant, scoped shop operator, or platform_admin read authority without changing booking lifecycle.';
comment on function private.rls_disabled_cleanup_can_read_barber_finance(uuid) is
  'PR34 RLS helper: proves barber self, scoped shop relationship, or platform_admin read authority for money-adjacent rows.';
comment on function private.rls_disabled_cleanup_can_read_retail_product(uuid) is
  'PR34 RLS helper: inventory movements inherit scoped shop/operator authority from the parent retail product.';

revoke all on function private.rls_disabled_cleanup_is_platform_admin() from public, anon;
revoke all on function private.rls_disabled_cleanup_is_client_reference_owner(text) from public, anon;
revoke all on function private.rls_disabled_cleanup_can_read_location_reference(text) from public, anon;
revoke all on function private.rls_disabled_cleanup_can_read_appointment(uuid) from public, anon;
revoke all on function private.rls_disabled_cleanup_can_read_barber_finance(uuid) from public, anon;
revoke all on function private.rls_disabled_cleanup_can_read_retail_product(uuid) from public, anon;

grant execute on function private.rls_disabled_cleanup_is_platform_admin() to authenticated;
grant execute on function private.rls_disabled_cleanup_is_client_reference_owner(text) to authenticated;
grant execute on function private.rls_disabled_cleanup_can_read_location_reference(text) to authenticated;
grant execute on function private.rls_disabled_cleanup_can_read_appointment(uuid) to authenticated;
grant execute on function private.rls_disabled_cleanup_can_read_barber_finance(uuid) to authenticated;
grant execute on function private.rls_disabled_cleanup_can_read_retail_product(uuid) to authenticated;

alter table public.platform_admin_controls enable row level security;
alter table public.platform_admin_audit_logs enable row level security;
alter table public.client_intelligence_snapshots enable row level security;
alter table public.location_intelligence_snapshots enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.media_assets enable row level security;
alter table public.commission_rules enable row level security;
alter table public.payouts enable row level security;
alter table public.bonuses enable row level security;
alter table public.deposits enable row level security;
alter table public.gift_cards enable row level security;
alter table public.promo_codes enable row level security;
alter table public.retail_products enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists "platform admin controls admin select batch 34" on public.platform_admin_controls;
create policy "platform admin controls admin select batch 34"
  on public.platform_admin_controls
  for select
  to authenticated
  using (private.rls_disabled_cleanup_is_platform_admin());

drop policy if exists "platform admin audit logs admin select batch 34" on public.platform_admin_audit_logs;
create policy "platform admin audit logs admin select batch 34"
  on public.platform_admin_audit_logs
  for select
  to authenticated
  using (private.rls_disabled_cleanup_is_platform_admin());

drop policy if exists "client intelligence owner admin select batch 34" on public.client_intelligence_snapshots;
create policy "client intelligence owner admin select batch 34"
  on public.client_intelligence_snapshots
  for select
  to authenticated
  using (
    private.rls_disabled_cleanup_is_client_reference_owner(public.client_intelligence_snapshots.client_reference)
    or private.rls_disabled_cleanup_is_platform_admin()
  );

drop policy if exists "location intelligence operator admin select batch 34" on public.location_intelligence_snapshots;
create policy "location intelligence operator admin select batch 34"
  on public.location_intelligence_snapshots
  for select
  to authenticated
  using (
    private.rls_disabled_cleanup_can_read_location_reference(public.location_intelligence_snapshots.location_reference)
  );

drop policy if exists "notes scoped select batch 34" on public.notes;
create policy "notes scoped select batch 34"
  on public.notes
  for select
  to authenticated
  using (
    public.notes.created_by = auth.uid()
    or private.rls_batch_5_is_client_owner(public.notes.client_id)
    or private.rls_disabled_cleanup_can_read_appointment(public.notes.appointment_id)
    or private.rls_disabled_cleanup_is_platform_admin()
  );

drop policy if exists "tasks assignee shop admin select batch 34" on public.tasks;
create policy "tasks assignee shop admin select batch 34"
  on public.tasks
  for select
  to authenticated
  using (
    public.tasks.assignee_profile_id = auth.uid()
    or private.rls_batch_5_is_shop_operator_reference(null, public.tasks.location_id)
    or private.rls_disabled_cleanup_is_platform_admin()
  );

drop policy if exists "media assets owner admin select batch 34" on public.media_assets;
create policy "media assets owner admin select batch 34"
  on public.media_assets
  for select
  to authenticated
  using (
    public.media_assets.owner_profile_id = auth.uid()
    or private.rls_disabled_cleanup_is_platform_admin()
  );

drop policy if exists "commission rules shop admin select batch 34" on public.commission_rules;
create policy "commission rules shop admin select batch 34"
  on public.commission_rules
  for select
  to authenticated
  using (
    private.rls_batch_5_is_shop_operator_reference(null, public.commission_rules.location_id)
    or private.rls_disabled_cleanup_is_platform_admin()
  );

drop policy if exists "payouts barber shop admin select batch 34" on public.payouts;
create policy "payouts barber shop admin select batch 34"
  on public.payouts
  for select
  to authenticated
  using (
    private.rls_disabled_cleanup_can_read_barber_finance(public.payouts.barber_id)
  );

drop policy if exists "bonuses barber shop admin select batch 34" on public.bonuses;
create policy "bonuses barber shop admin select batch 34"
  on public.bonuses
  for select
  to authenticated
  using (
    private.rls_disabled_cleanup_can_read_barber_finance(public.bonuses.barber_id)
  );

drop policy if exists "deposits appointment participant admin select batch 34" on public.deposits;
create policy "deposits appointment participant admin select batch 34"
  on public.deposits
  for select
  to authenticated
  using (
    private.rls_disabled_cleanup_can_read_appointment(public.deposits.appointment_id)
  );

drop policy if exists "gift cards admin select batch 34" on public.gift_cards;
create policy "gift cards admin select batch 34"
  on public.gift_cards
  for select
  to authenticated
  using (private.rls_disabled_cleanup_is_platform_admin());

drop policy if exists "promo codes admin select batch 34" on public.promo_codes;
create policy "promo codes admin select batch 34"
  on public.promo_codes
  for select
  to authenticated
  using (private.rls_disabled_cleanup_is_platform_admin());

drop policy if exists "retail products shop admin select batch 34" on public.retail_products;
create policy "retail products shop admin select batch 34"
  on public.retail_products
  for select
  to authenticated
  using (
    private.rls_batch_5_is_shop_operator_reference(null, public.retail_products.location_id)
    or private.rls_disabled_cleanup_is_platform_admin()
  );

drop policy if exists "inventory movements product shop admin select batch 34" on public.inventory_movements;
create policy "inventory movements product shop admin select batch 34"
  on public.inventory_movements
  for select
  to authenticated
  using (
    private.rls_disabled_cleanup_can_read_retail_product(public.inventory_movements.product_id)
  );

comment on table public.platform_admin_controls is
  'PR34 RLS target: raw platform admin controls are platform_admin scoped only; no anon or broad authenticated raw access.';
comment on table public.platform_admin_audit_logs is
  'PR34 RLS target: raw platform admin audit logs are platform_admin scoped only; server/service-role remains authoritative for audit event creation.';
comment on table public.client_intelligence_snapshots is
  'PR34 RLS target: client intelligence is readable only by the owning client profile or platform_admin. Server-side jobs own snapshot refresh.';
comment on table public.location_intelligence_snapshots is
  'PR34 RLS target: location intelligence is readable only by scoped shop operators or platform_admin. Server-side jobs own snapshot refresh.';
comment on table public.notes is
  'PR34 RLS target: notes are scoped to creator, client owner, appointment participant/shop operator, or platform_admin.';
comment on table public.tasks is
  'PR34 RLS target: tasks are scoped to assignee, shop/location operator, or platform_admin. Direct task mutation is intentionally absent in this cleanup.';
comment on table public.media_assets is
  'PR34 RLS target: raw media_assets rows are owner/profile or platform_admin scoped; public featured media needs a public-safe surface, not raw table reads.';
comment on table public.commission_rules is
  'PR34 RLS target: commission rules are shop/operator or platform_admin scoped. Money policy calculation remains server-side.';
comment on table public.payouts is
  'PR34 RLS target: payout rows are barber self, scoped shop relationship, or platform_admin readable only. This migration does not execute payouts.';
comment on table public.bonuses is
  'PR34 RLS target: bonus rows are barber self, scoped shop relationship, or platform_admin readable only.';
comment on table public.deposits is
  'PR34 RLS target: deposit rows follow appointment participant/shop/operator/platform_admin read scope. Payment routing logic is unchanged.';
comment on table public.gift_cards is
  'PR34 RLS target: raw gift cards are platform_admin scoped only. Redemption and lookup require a server-side validated route later.';
comment on table public.promo_codes is
  'PR34 RLS target: raw promo codes are platform_admin scoped only. Promo validation must remain server-side.';
comment on table public.retail_products is
  'PR34 RLS target: raw retail products are scoped to shop operators or platform_admin. Public catalog access needs a public-safe surface later.';
comment on table public.inventory_movements is
  'PR34 RLS target: inventory movement rows inherit scoped shop/operator access from the parent retail product or platform_admin.';

notify pgrst, 'reload schema';

commit;
