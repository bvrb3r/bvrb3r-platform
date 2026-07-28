-- PR22 post-advisor hardening. The public application reaches these read and
-- certification capabilities through authenticated Next.js routes backed by
-- the service role; no browser role needs direct PostgREST RPC execution.
revoke all on function public.pr22_get_owner_rent_statement(text)
  from public, anon, authenticated;
grant execute on function public.pr22_get_owner_rent_statement(text)
  to service_role;

revoke all on function public.pr22_get_public_queue_status(text)
  from public, anon, authenticated;
grant execute on function public.pr22_get_public_queue_status(text)
  to service_role;

revoke all on function public.pr22_shop_setup_snapshot(text, uuid)
  from public, anon, authenticated;
grant execute on function public.pr22_shop_setup_snapshot(text, uuid)
  to service_role;

revoke all on function public.pr22_issue_release_certificate(text, text)
  from public, anon, authenticated;
grant execute on function public.pr22_issue_release_certificate(text, text)
  to service_role;

-- The owner update function invokes the seed helper inside its guarded
-- SECURITY DEFINER boundary. Direct authenticated execution is unnecessary.
revoke all on function public.pr22_seed_shop_setup_gates(text, uuid)
  from public, anon, authenticated;
grant execute on function public.pr22_seed_shop_setup_gates(text, uuid)
  to service_role;
revoke all on function private.pr22_seed_shop_setup_gates(text, uuid)
  from public, anon, authenticated;
grant execute on function private.pr22_seed_shop_setup_gates(text, uuid)
  to service_role;

create index if not exists rent_agreements_location_idx
  on public.rent_agreements (location_id);
create index if not exists rent_agreements_created_by_idx
  on public.rent_agreements (created_by);
create index if not exists rent_agreements_owner_accepted_by_idx
  on public.rent_agreements (owner_accepted_by);
create index if not exists rent_agreements_barber_accepted_by_idx
  on public.rent_agreements (barber_accepted_by);
create index if not exists rent_agreements_supersedes_idx
  on public.rent_agreements (supersedes_agreement_id);

create index if not exists rent_obligations_location_idx
  on public.rent_obligations (location_id);
create index if not exists rent_obligations_relationship_idx
  on public.rent_obligations (relationship_id);

create index if not exists rent_contributions_agreement_idx
  on public.rent_contributions (agreement_id);

create index if not exists rent_actions_audit_actor_idx
  on public.rent_actions_audit (actor_profile_id);
create index if not exists rent_actions_audit_agreement_idx
  on public.rent_actions_audit (agreement_id);
create index if not exists rent_actions_audit_contribution_idx
  on public.rent_actions_audit (contribution_id);

create index if not exists shop_setup_gates_reviewer_idx
  on public.shop_setup_gates (reviewed_by);
create index if not exists pr22_release_certificates_issuer_idx
  on public.pr22_release_certificates (issued_by);
