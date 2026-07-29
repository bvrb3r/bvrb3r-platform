begin;

-- Product PR26 — cover every new foreign key used during parent-row maintenance.
-- The distinct chair index is intentionally unfiltered so retired assignments
-- remain covered after the active-only uniqueness index stops containing them.

create index if not exists rent_autopay_preferences_updated_by_idx
  on public.rent_autopay_preferences (updated_by_profile_id);

create index if not exists rent_payment_requests_agreement_idx
  on public.rent_payment_requests (agreement_id);
create index if not exists rent_payment_requests_requested_by_idx
  on public.rent_payment_requests (requested_by_profile_id);

create index if not exists rent_line_disputes_agreement_idx
  on public.rent_line_disputes (agreement_id);
create index if not exists rent_line_disputes_submitted_by_idx
  on public.rent_line_disputes (submitted_by_profile_id);

create index if not exists rent_lifecycle_requests_requested_by_idx
  on public.rent_lifecycle_requests (requested_by_profile_id);

create index if not exists shop_chairs_assigned_barber_cover_idx
  on public.shop_chairs (assigned_barber_id);

commit;
