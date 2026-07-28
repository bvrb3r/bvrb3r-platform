-- PR23 — remove executable residue from the retired shop revenue-share model.
--
-- Full Booth Rent and AutoBooth Rent are the only shop-barber money
-- relationships. Freelance remains the no-shop state. Historical ledger and
-- ended relationship rows stay intact for audit; this migration removes active
-- write paths and current configuration residue without inventing rent.

-- 1. Current profile configuration must not carry the retired rate.
update public.barbers
set commission_rate = null
where commission_rate is not null;

alter table public.barbers
  drop constraint if exists barbers_no_retired_rate_ck;
alter table public.barbers
  add constraint barbers_no_retired_rate_ck
  check (commission_rate is null);

-- Historical membership/invite rows are preserved, while every new or updated
-- row must keep retired percentage terms empty.
alter table public.staff_locations
  drop constraint if exists staff_locations_no_retired_terms_ck,
  drop constraint if exists staff_locations_booth_rent_frequency_ck;
alter table public.staff_locations
  add constraint staff_locations_no_retired_terms_ck
    check (
      commission_rate is null
      and barber_percent is null
      and shop_percent is null
      and commission_cap_amount is null
      and commission_cap_frequency is null
    ) not valid,
  add constraint staff_locations_booth_rent_frequency_ck
    check (
      booth_rent_frequency is null
      or booth_rent_frequency in ('daily', 'weekly', 'monthly')
    );

alter table public.shop_team_invites
  drop constraint if exists shop_team_invites_no_retired_terms_ck;
alter table public.shop_team_invites
  add constraint shop_team_invites_no_retired_terms_ck
    check (
      barber_percent is null
      and shop_percent is null
      and commission_cap_amount is null
      and commission_cap_frequency is null
    ) not valid;

-- 2. Replace the stale PR22 activation implementation. The signature is kept
-- stable for the application, but its executable semantics are rent-only.
create or replace function public.activate_shop_barber_relationship_internal(
  p_invite_id uuid,
  p_actor_profile_id uuid,
  p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  invite_row public.shop_team_invites%rowtype;
  barber_row public.barbers%rowtype;
  location_row public.locations%rowtype;
  relationship_type_value text;
  membership_id_value uuid;
  relationship_id_value uuid;
  compensation_rule_id_value uuid;
  owner_profile_id_value uuid;
  shop_id_value text;
  owner_accepted_at_value timestamptz;
  barber_accepted_at_value timestamptz;
  accepted_at_value timestamptz := now();
  booth_rent_cents_value integer;
  autobooth_percent_value numeric(5,4);
begin
  if p_actor_role not in ('owner', 'barber') then
    raise exception using errcode = '22023', message = 'Agreement acceptance actor must be owner or barber.';
  end if;

  select i.* into invite_row
  from public.shop_team_invites i
  where i.id = p_invite_id
  for update;

  if invite_row.id is null or invite_row.status not in ('invited', 'requested') then
    raise exception using errcode = '23514', message = 'Only a pending shop-barber agreement can be activated.';
  end if;

  select b.* into barber_row
  from public.barbers b
  where b.id = invite_row.barber_id
  for update;

  select l.* into location_row
  from public.locations l
  where l.id::text = invite_row.shop_id
  for update;

  if barber_row.id is null
     or barber_row.profile_id is distinct from invite_row.barber_profile_id
     or location_row.id is null
     or location_row.reference_code is null
     or not exists (select 1 from public.shops s where s.id = location_row.reference_code) then
    raise exception using errcode = '23514', message = 'Agreement barber and shop location must resolve before activation.';
  end if;
  shop_id_value := location_row.reference_code;

  relationship_type_value := invite_row.routing_model;
  if relationship_type_value not in ('booth_rent', 'autobooth_rent') then
    raise exception using
      errcode = '23514',
      message = 'A shop relationship must explicitly choose Full Booth Rent or AutoBooth Rent.';
  end if;

  if invite_row.barber_percent is not null
     or invite_row.shop_percent is not null
     or invite_row.commission_cap_amount is not null
     or invite_row.commission_cap_frequency is not null then
    raise exception using
      errcode = '23514',
      message = 'Retired percentage terms cannot be activated.';
  end if;

  booth_rent_cents_value := round(invite_row.booth_rent_amount * 100)::integer;
  if booth_rent_cents_value is null
     or booth_rent_cents_value <= 0
     or invite_row.booth_rent_frequency not in ('daily', 'weekly', 'monthly') then
    raise exception using
      errcode = '23514',
      message = 'Booth rent requires a positive fixed amount and billing frequency.';
  end if;

  if relationship_type_value = 'autobooth_rent' then
    autobooth_percent_value := invite_row.autobooth_percent;
    if autobooth_percent_value is null
       or autobooth_percent_value <= 0
       or autobooth_percent_value > 1 then
      raise exception using
        errcode = '23514',
        message = 'AutoBooth Rent requires an owner-approved application portion greater than 0 and at most 1.';
    end if;
  elsif invite_row.autobooth_percent is not null then
    raise exception using
      errcode = '23514',
      message = 'Full Booth Rent cannot carry AutoBooth application terms.';
  end if;

  if invite_row.status = 'invited' then
    if p_actor_role <> 'barber' or p_actor_profile_id is distinct from barber_row.profile_id then
      raise exception using errcode = '42501', message = 'Only the invited barber can accept this agreement.';
    end if;
    owner_profile_id_value := invite_row.invited_by_profile_id;
    owner_accepted_at_value := coalesce(invite_row.approved_by_owner_at, invite_row.created_at);
    barber_accepted_at_value := accepted_at_value;
  else
    if p_actor_role <> 'owner' or not exists (
      select 1 from public.shop_operator_access soa
      where soa.profile_id = p_actor_profile_id
        and soa.shop_id = shop_id_value
        and soa.access_level = 'owner'
        and soa.status = 'active'
        and soa.revoked_at is null
    ) then
      raise exception using errcode = '42501', message = 'Only an active shop owner can accept this request.';
    end if;
    if invite_row.requested_by_profile_id is distinct from barber_row.profile_id then
      raise exception using errcode = '23514', message = 'The join request must be accepted by its requesting barber before owner review.';
    end if;
    owner_profile_id_value := p_actor_profile_id;
    owner_accepted_at_value := accepted_at_value;
    barber_accepted_at_value := coalesce(invite_row.approved_by_barber_at, invite_row.created_at);
  end if;

  if not exists (
    select 1 from public.shop_operator_access soa
    where soa.profile_id = owner_profile_id_value
      and soa.shop_id = shop_id_value
      and soa.access_level = 'owner'
      and soa.status = 'active'
      and soa.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'The agreement requires active owner authority.';
  end if;

  -- Freelance is the no-shop state. Close only that compatibility membership;
  -- a real active shop relationship still blocks this agreement.
  update public.staff_locations sl
  set relationship_status = 'ended',
      ended_at = accepted_at_value,
      ended_by_profile_id = barber_row.profile_id,
      ended_by_role = 'barber',
      ended_reason = 'Freelance membership ended when a bilateral shop agreement activated.',
      updated_at = accepted_at_value
  where sl.profile_id = barber_row.profile_id
    and coalesce(sl.relationship_status, 'active') = 'active'
    and sl.ended_at is null
    and (
      sl.shop_id is null
      or lower(sl.shop_id) like 'independent-barber-%'
      or exists (
        select 1 from public.locations independent_location
        where independent_location.id = sl.location_id
          and lower(coalesce(independent_location.reference_code, '')) like 'independent-barber-%'
      )
    );

  if exists (
    select 1 from public.staff_locations sl
    where sl.profile_id = barber_row.profile_id
      and coalesce(sl.relationship_status, 'active') = 'active'
      and sl.ended_at is null
  ) or exists (
    select 1 from public.shop_barber_relationships r
    where r.barber_id = barber_row.id
      and r.status = 'active'
      and r.ended_at is null
  ) then
    raise exception using errcode = '23505', message = 'The barber already has an active shop relationship.';
  end if;

  insert into public.staff_locations (
    profile_id, location_id, shop_id, relationship_status,
    requested_by_profile_id, invited_by_profile_id,
    approved_by_owner_at, approved_by_barber_at,
    routing_model, commission_rate,
    booth_rent_amount, booth_rent_frequency,
    barber_percent, shop_percent,
    commission_cap_amount, commission_cap_frequency,
    autobooth_percent, autobooth_cap_amount, autobooth_cap_frequency,
    ended_at, ended_by_profile_id, ended_by_role, ended_reason,
    public_team_visible, public_team_order, featured_on_shop_profile,
    updated_at, fintech_updated_at
  ) values (
    barber_row.profile_id, location_row.id, shop_id_value, 'active',
    invite_row.requested_by_profile_id, invite_row.invited_by_profile_id,
    owner_accepted_at_value, barber_accepted_at_value,
    relationship_type_value, null,
    invite_row.booth_rent_amount, invite_row.booth_rent_frequency,
    null, null, null, null,
    autobooth_percent_value, null, null,
    null, null, null, null,
    invite_row.public_team_visible, invite_row.public_team_order, invite_row.featured_on_shop_profile,
    accepted_at_value, accepted_at_value
  )
  on conflict (profile_id, location_id) do update
  set shop_id = excluded.shop_id,
      relationship_status = excluded.relationship_status,
      requested_by_profile_id = excluded.requested_by_profile_id,
      invited_by_profile_id = excluded.invited_by_profile_id,
      approved_by_owner_at = excluded.approved_by_owner_at,
      approved_by_barber_at = excluded.approved_by_barber_at,
      routing_model = excluded.routing_model,
      commission_rate = null,
      booth_rent_amount = excluded.booth_rent_amount,
      booth_rent_frequency = excluded.booth_rent_frequency,
      barber_percent = null,
      shop_percent = null,
      commission_cap_amount = null,
      commission_cap_frequency = null,
      autobooth_percent = excluded.autobooth_percent,
      autobooth_cap_amount = null,
      autobooth_cap_frequency = null,
      ended_at = null,
      ended_by_profile_id = null,
      ended_by_role = null,
      ended_reason = null,
      public_team_visible = excluded.public_team_visible,
      public_team_order = excluded.public_team_order,
      featured_on_shop_profile = excluded.featured_on_shop_profile,
      updated_at = excluded.updated_at,
      fintech_updated_at = excluded.fintech_updated_at
  returning id into membership_id_value;

  insert into public.shop_barber_relationships (
    shop_id, location_id, barber_id, staff_location_id,
    relationship_type, status, invited_by_profile_id,
    approved_by_owner_profile_id, approved_by_owner_at,
    approved_by_barber_profile_id, approved_by_barber_at,
    started_at, invitation_message, terms_snapshot, created_at, updated_at
  ) values (
    shop_id_value, location_row.id, barber_row.id, membership_id_value,
    relationship_type_value, 'active', invite_row.invited_by_profile_id,
    owner_profile_id_value, owner_accepted_at_value,
    barber_row.profile_id, barber_accepted_at_value,
    accepted_at_value, invite_row.message,
    jsonb_build_object(
      'invite_id', invite_row.id,
      'model', relationship_type_value,
      'booth_rent_amount_cents', booth_rent_cents_value,
      'booth_rent_frequency', invite_row.booth_rent_frequency,
      'autobooth_percent', autobooth_percent_value
    ),
    accepted_at_value, accepted_at_value
  )
  returning id into relationship_id_value;

  insert into public.compensation_rules (
    relationship_id, shop_id, location_id, barber_id, version, model,
    barber_percent, shop_percent,
    booth_rent_amount_cents, booth_rent_frequency, max_shop_charge_cents,
    variable_commission_enabled, variable_rules, autobooth_percent,
    is_active, starts_at, created_by_profile_id, created_at, updated_at
  ) values (
    relationship_id_value, shop_id_value, location_row.id, barber_row.id, 1,
    relationship_type_value,
    null, null,
    booth_rent_cents_value, invite_row.booth_rent_frequency, booth_rent_cents_value,
    false, '{}'::jsonb, autobooth_percent_value,
    true, accepted_at_value, owner_profile_id_value, accepted_at_value, accepted_at_value
  )
  returning id into compensation_rule_id_value;

  update public.shop_team_invites i
  set status = 'active',
      responded_at = accepted_at_value,
      approved_by_owner_at = owner_accepted_at_value,
      approved_by_barber_at = barber_accepted_at_value,
      rejected_at = null,
      declined_at = null,
      updated_at = accepted_at_value
  where i.id = invite_row.id;

  return jsonb_build_object(
    'invite_id', invite_row.id,
    'staff_location_id', membership_id_value,
    'relationship_id', relationship_id_value,
    'compensation_rule_id', compensation_rule_id_value,
    'relationship_type', relationship_type_value
  );
end;
$function$;

revoke all on function public.activate_shop_barber_relationship_internal(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.activate_shop_barber_relationship_internal(uuid, uuid, text)
  to service_role;

-- 3. Remove the unreachable dead synchronizer. The immutable historical ledger
-- and its fail-closed write-rejection trigger remain in place.
drop trigger if exists commission_ledger_routing_sync on public.payment_routing_records;
drop function if exists private.sync_commission_ledger_from_routing();

-- 4. A compact release truth snapshot for staging and production certification.
create or replace function public.bvrb3r_pr23_retired_model_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $snapshot$
with checks as (
  select * from (values
    ('profile_rates_cleared', not exists (
      select 1 from public.barbers b where b.commission_rate is not null
    )),
    ('active_memberships_rent_only', not exists (
      select 1 from public.staff_locations sl
      where coalesce(sl.relationship_status, 'active') = 'active'
        and sl.ended_at is null
        and (
          sl.routing_model not in ('freelance', 'booth_rent', 'autobooth_rent')
          or sl.commission_rate is not null
          or sl.barber_percent is not null
          or sl.shop_percent is not null
          or sl.commission_cap_amount is not null
          or sl.commission_cap_frequency is not null
        )
    )),
    ('open_agreements_rent_only', not exists (
      select 1 from public.shop_team_invites i
      where i.status in ('invited', 'requested', 'active')
        and (
          i.routing_model not in ('booth_rent', 'autobooth_rent')
          or i.barber_percent is not null
          or i.shop_percent is not null
          or i.commission_cap_amount is not null
          or i.commission_cap_frequency is not null
        )
    )),
    ('active_relationships_rent_only', not exists (
      select 1 from public.shop_barber_relationships r
      where r.status = 'active'
        and r.relationship_type not in ('booth_rent', 'autobooth_rent')
    )),
    ('active_rules_rent_only', not exists (
      select 1 from public.compensation_rules c
      where c.is_active
        and (
          c.model not in ('booth_rent', 'autobooth_rent')
          or c.booth_rent_amount_cents <= 0
          or c.booth_rent_frequency is null
          or c.max_shop_charge_cents < c.booth_rent_amount_cents
          or c.barber_percent is not null
          or c.shop_percent is not null
          or c.variable_commission_enabled
          or (c.model = 'booth_rent' and c.autobooth_percent is not null)
          or (
            c.model = 'autobooth_rent'
            and (c.autobooth_percent is null or c.autobooth_percent <= 0 or c.autobooth_percent > 1)
          )
        )
    )),
    ('active_rules_match_relationships', not exists (
      select 1
      from public.compensation_rules c
      join public.shop_barber_relationships r on r.id = c.relationship_id
      where c.is_active
        and (r.status <> 'active' or c.model <> r.relationship_type)
    )),
    ('payment_routes_supported', not exists (
      select 1 from public.payment_routing_records p
      where p.routing_model not in ('freelance', 'booth_rent', 'autobooth_rent')
    )),
    ('historical_ledger_immutable', exists (
      select 1
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'commission_ledger'
        and t.tgname = 'reject_commission_ledger_writes'
        and not t.tgisinternal
    ))
  ) v(check_name, passed)
), summary as (
  select count(*) as check_count,
         count(*) filter (where passed) as passed_count,
         jsonb_object_agg(check_name, passed order by check_name) as check_map
  from checks
)
select jsonb_build_object(
  'schemaVersion', 1,
  'mission', 'PR23_RETIRED_MODEL_CLEANUP',
  'generatedAt', now(),
  'status', case when check_count = 8 and passed_count = 8 then 'pass' else 'fail' end,
  'certifiable', check_count = 8 and passed_count = 8,
  'checkCount', check_count,
  'passedCount', passed_count,
  'checks', check_map
)
from summary;
$snapshot$;

revoke all on function public.bvrb3r_pr23_retired_model_snapshot()
  from public, anon, authenticated;
grant execute on function public.bvrb3r_pr23_retired_model_snapshot()
  to service_role;
