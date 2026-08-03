-- Product PR25 completion — reversible owner pause for a shop relationship.
-- Pausing removes floor eligibility without ending the agreement or changing
-- any booth-rent truth. Ending remains governed by the settle-first trigger.

begin;

alter table public.staff_locations
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists pause_reason text;

alter table public.staff_locations
  drop constraint if exists staff_locations_relationship_status_ck;
alter table public.staff_locations
  add constraint staff_locations_relationship_status_ck check (
    relationship_status is null
    or relationship_status in (
      'invited',
      'requested',
      'active',
      'paused',
      'rejected',
      'declined',
      'ended'
    )
  );

alter table public.staff_locations
  drop constraint if exists staff_locations_pause_state_ck;
alter table public.staff_locations
  add constraint staff_locations_pause_state_ck check (
    (
      relationship_status = 'paused'
      and paused_at is not null
      and paused_by_profile_id is not null
      and length(trim(pause_reason)) between 3 and 500
    )
    or
    (
      relationship_status is distinct from 'paused'
      and paused_at is null
      and paused_by_profile_id is null
      and pause_reason is null
    )
  );

create index if not exists staff_locations_paused_by_idx
  on public.staff_locations (paused_by_profile_id)
  where paused_by_profile_id is not null;

create or replace function public.set_shop_barber_relationship_pause_internal(
  p_staff_location_id uuid,
  p_actor_profile_id uuid,
  p_paused boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_row public.staff_locations%rowtype;
  relationship_row public.shop_barber_relationships%rowtype;
  reason_value text;
  next_status text;
begin
  reason_value := nullif(trim(p_reason), '');
  if reason_value is null or length(reason_value) < 3 or length(reason_value) > 500 then
    raise exception using errcode = '22023', message = 'A relationship pause or resume requires a reason.';
  end if;

  select sl.* into membership_row
  from public.staff_locations sl
  where sl.id = p_staff_location_id
  for update;

  if membership_row.id is null
     or membership_row.ended_at is not null
     or coalesce(membership_row.relationship_status, '') not in ('active', 'paused') then
    raise exception using errcode = '23514', message = 'Only an active or paused shop relationship can change pause state.';
  end if;

  select r.* into relationship_row
  from public.shop_barber_relationships r
  where r.staff_location_id = membership_row.id
    and r.status in ('active', 'suspended')
    and r.ended_at is null
  order by r.started_at desc, r.created_at desc
  limit 1
  for update;

  if relationship_row.id is null then
    raise exception using errcode = '23514', message = 'Canonical shop relationship is missing for this membership.';
  end if;

  if not exists (
    select 1
    from public.shop_operator_access soa
    where soa.profile_id = p_actor_profile_id
      and soa.shop_id = relationship_row.shop_id
      and soa.access_level = 'owner'
      and soa.status = 'active'
      and soa.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = 'Only an active shop owner can pause or resume this relationship.';
  end if;

  if p_paused and membership_row.relationship_status = 'paused' then
    raise exception using errcode = '23514', message = 'This relationship is already paused.';
  end if;
  if not p_paused and membership_row.relationship_status = 'active' then
    raise exception using errcode = '23514', message = 'This relationship is already active.';
  end if;

  next_status := case when p_paused then 'paused' else 'active' end;

  update public.shop_barber_relationships
  set status = case when p_paused then 'suspended' else 'active' end,
      updated_at = now()
  where id = relationship_row.id;

  update public.staff_locations
  set relationship_status = next_status,
      paused_at = case when p_paused then now() else null end,
      paused_by_profile_id = case when p_paused then p_actor_profile_id else null end,
      pause_reason = case when p_paused then reason_value else null end,
      updated_at = now()
  where id = membership_row.id;

  if p_paused then
    update public.shop_floor_controls
    set rotation_override_barber_id = null,
        rotation_override_reason = null,
        rotation_override_expires_at = null,
        version = version + 1,
        updated_at = now()
    where shop_id = relationship_row.shop_id
      and location_id = relationship_row.location_id
      and rotation_override_barber_id = relationship_row.barber_id;
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    target,
    severity,
    shop_id,
    location_id,
    target_type,
    target_id,
    previous_state,
    next_state,
    reason
  ) values (
    p_actor_profile_id,
    case when p_paused then 'owner_relationship_paused' else 'owner_relationship_resumed' end,
    membership_row.id::text,
    'info',
    relationship_row.shop_id,
    relationship_row.location_id,
    'staff_locations',
    membership_row.id::text,
    jsonb_build_object('relationshipStatus', membership_row.relationship_status),
    jsonb_build_object('relationshipStatus', next_status),
    reason_value
  );

  return jsonb_build_object(
    'staff_location_id', membership_row.id,
    'relationship_id', relationship_row.id,
    'status', next_status
  );
end;
$$;

revoke all on function public.set_shop_barber_relationship_pause_internal(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_shop_barber_relationship_pause_internal(uuid, uuid, boolean, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
