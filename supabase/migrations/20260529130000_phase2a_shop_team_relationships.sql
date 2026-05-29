alter table public.shop_team_invites
  add column if not exists requested_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists approved_by_owner_at timestamptz,
  add column if not exists approved_by_barber_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists ended_by_role text,
  add column if not exists ended_reason text,
  add column if not exists routing_model text,
  add column if not exists barber_percent numeric(5,4),
  add column if not exists shop_percent numeric(5,4),
  add column if not exists commission_cap_amount numeric(10,2),
  add column if not exists commission_cap_frequency text,
  add column if not exists booth_rent_amount numeric(10,2),
  add column if not exists booth_rent_frequency text,
  add column if not exists payout_block_reason text;

update public.shop_team_invites
set status = case
  when status = 'pending' and requested_by_profile_id is not null then 'requested'
  when status = 'pending' then 'invited'
  when status = 'accepted' then 'active'
  when status in ('canceled', 'removed') then 'ended'
  else status
end
where status in ('pending', 'accepted', 'canceled', 'removed');

alter table public.shop_team_invites
  drop constraint if exists shop_team_invites_status_check,
  drop constraint if exists shop_team_invites_status_ck,
  drop constraint if exists shop_team_invites_routing_model_ck,
  drop constraint if exists shop_team_invites_commission_percent_ck,
  drop constraint if exists shop_team_invites_commission_cap_frequency_ck,
  drop constraint if exists shop_team_invites_booth_rent_frequency_ck,
  drop constraint if exists shop_team_invites_ended_by_role_ck;

alter table public.shop_team_invites
  add constraint shop_team_invites_status_ck check (status in ('invited', 'requested', 'active', 'rejected', 'declined', 'ended')),
  add constraint shop_team_invites_routing_model_ck check (routing_model is null or routing_model in ('freelance', 'booth_rent', 'commission')),
  add constraint shop_team_invites_commission_percent_ck check (
    (barber_percent is null or (barber_percent >= 0 and barber_percent <= 1))
    and (shop_percent is null or (shop_percent >= 0 and shop_percent <= 1))
  ),
  add constraint shop_team_invites_commission_cap_frequency_ck check (commission_cap_frequency is null or commission_cap_frequency in ('weekly', 'monthly')),
  add constraint shop_team_invites_booth_rent_frequency_ck check (booth_rent_frequency is null or booth_rent_frequency in ('daily', 'weekly', 'monthly')),
  add constraint shop_team_invites_ended_by_role_ck check (ended_by_role is null or ended_by_role in ('barber', 'owner', 'architect'));

drop index if exists public.shop_team_invites_pending_uidx;
create unique index if not exists shop_team_invites_active_request_uidx
  on public.shop_team_invites (shop_id, barber_id)
  where status in ('invited', 'requested', 'active');

alter table public.staff_locations
  add column if not exists relationship_status text,
  add column if not exists requested_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists invited_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists approved_by_owner_at timestamptz,
  add column if not exists approved_by_barber_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists ended_by_role text,
  add column if not exists ended_reason text,
  add column if not exists barber_percent numeric(5,4),
  add column if not exists shop_percent numeric(5,4),
  add column if not exists commission_cap_amount numeric(10,2),
  add column if not exists commission_cap_frequency text,
  add column if not exists payout_block_reason text,
  add column if not exists updated_at timestamptz;

update public.staff_locations
set relationship_status = coalesce(relationship_status, 'active')
where ended_at is null;

alter table public.staff_locations
  drop constraint if exists staff_locations_relationship_status_ck,
  drop constraint if exists staff_locations_commission_percent_ck,
  drop constraint if exists staff_locations_commission_cap_frequency_ck,
  drop constraint if exists staff_locations_booth_rent_frequency_ck,
  drop constraint if exists staff_locations_ended_by_role_ck;

alter table public.staff_locations
  add constraint staff_locations_relationship_status_ck check (relationship_status is null or relationship_status in ('invited', 'requested', 'active', 'rejected', 'declined', 'ended')),
  add constraint staff_locations_commission_percent_ck check (
    (barber_percent is null or (barber_percent >= 0 and barber_percent <= 1))
    and (shop_percent is null or (shop_percent >= 0 and shop_percent <= 1))
  ),
  add constraint staff_locations_commission_cap_frequency_ck check (commission_cap_frequency is null or commission_cap_frequency in ('weekly', 'monthly')),
  add constraint staff_locations_booth_rent_frequency_ck check (booth_rent_frequency is null or booth_rent_frequency in ('daily', 'weekly', 'monthly')),
  add constraint staff_locations_ended_by_role_ck check (ended_by_role is null or ended_by_role in ('barber', 'owner', 'architect'));

with ranked_active_relationships as (
  select
    ctid,
    row_number() over (
      partition by profile_id
      order by coalesce(updated_at, created_at) desc, created_at desc, id desc
    ) as relationship_rank
  from public.staff_locations
  where relationship_status = 'active'
    and ended_at is null
)
update public.staff_locations sl
set
  relationship_status = 'ended',
  ended_at = coalesce(sl.ended_at, now()),
  ended_by_role = coalesce(sl.ended_by_role, 'architect'),
  ended_reason = coalesce(sl.ended_reason, 'Phase 2A cleanup: older duplicate active shop relationship closed before enforcing one active shop per barber.'),
  updated_at = now()
from ranked_active_relationships ranked
where sl.ctid = ranked.ctid
  and ranked.relationship_rank > 1;

create unique index if not exists staff_locations_one_active_shop_per_barber_uidx
  on public.staff_locations (profile_id)
  where relationship_status = 'active' and ended_at is null;

create index if not exists staff_locations_relationship_status_idx
  on public.staff_locations (location_id, relationship_status, updated_at desc);

notify pgrst, 'reload schema';
