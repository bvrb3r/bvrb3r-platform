-- Product PR27 dispute evidence is visible to every participant who can read
-- the canonical dispute, while evidence writes remain server-owned.

begin;

drop policy if exists dispute_evidence_items_submitter_select
  on public.dispute_evidence_items;
create policy dispute_evidence_items_participant_select
  on public.dispute_evidence_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.disputes d
      where d.id = dispute_evidence_items.dispute_reference
    )
  );

notify pgrst, 'reload schema';
commit;
