-- Product PR23 advisor follow-up: one permissive SELECT policy per role/table
-- evaluates the same client/barber/shop/Architect relationship checks without
-- multiplying policy work for every read.

begin;

drop policy if exists "pr23 waitlist client read"
  on public.waitlist_entries;
drop policy if exists "pr23 waitlist barber read"
  on public.waitlist_entries;
drop policy if exists "pr23 waitlist shop floor read"
  on public.waitlist_entries;
drop policy if exists "pr23 waitlist architect read"
  on public.waitlist_entries;
drop policy if exists "pr23 waitlist relationship read"
  on public.waitlist_entries;

create policy "pr23 waitlist relationship read"
  on public.waitlist_entries
  for select to authenticated
  using (
    private.is_booking_client(client_id)
    or (barber_id is not null and private.is_booking_barber(barber_id))
    or (
      barber_preference is not null
      and private.is_booking_barber(barber_preference)
    )
    or private.is_booking_shop_operator(location_id)
    or private.is_booking_platform_admin()
  );

drop policy if exists "pr23 chairsync client read"
  on public.chairsync_appointments;
drop policy if exists "pr23 chairsync barber read"
  on public.chairsync_appointments;
drop policy if exists "pr23 chairsync shop read"
  on public.chairsync_appointments;
drop policy if exists "pr23 chairsync architect read"
  on public.chairsync_appointments;
drop policy if exists "pr23 chairsync relationship read"
  on public.chairsync_appointments;

create policy "pr23 chairsync relationship read"
  on public.chairsync_appointments
  for select to authenticated
  using (
    (
      linked_client_id is not null
      and private.is_booking_client(linked_client_id)
    )
    or (barber_id is not null and private.is_booking_barber(barber_id))
    or private.is_booking_shop_operator(location_id)
    or private.is_booking_platform_admin()
  );

drop policy if exists "pr23 delivery self read"
  on public.notification_delivery_ledger;
drop policy if exists "pr23 delivery shop escalation read"
  on public.notification_delivery_ledger;
drop policy if exists "pr23 delivery relationship read"
  on public.notification_delivery_ledger;

create policy "pr23 delivery relationship read"
  on public.notification_delivery_ledger
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (
      waitlist_entry_id is not null
      and exists (
        select 1
        from public.waitlist_entries w
        where w.id = notification_delivery_ledger.waitlist_entry_id
          and private.is_booking_shop_operator(w.location_id)
      )
    )
  );

commit;
