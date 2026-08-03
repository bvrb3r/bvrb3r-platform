-- Staging ledger version: 20260803073145.
-- Product PR31 LEGAL: make one acceptance of one published version immutable.
--
-- This migration deliberately refuses to discard duplicate audit evidence. If
-- a divergent environment already contains duplicates, reconcile those rows
-- explicitly before applying the unique key.

do $migration$
begin
  if to_regclass('public.compliance_acceptances') is null then
    raise exception 'public.compliance_acceptances is required before legal acceptance convergence';
  end if;

  if exists (
    select 1
    from public.compliance_acceptances
    group by user_id, document_key, document_version
    having count(*) > 1
  ) then
    raise exception 'duplicate legal acceptance evidence blocks idempotency convergence'
      using hint = 'Reconcile duplicate user_id/document_key/document_version rows without inventing or erasing acceptance evidence, then retry this migration.';
  end if;
end;
$migration$;

create unique index if not exists compliance_acceptances_user_document_version_uidx
  on public.compliance_acceptances (user_id, document_key, document_version);

comment on index public.compliance_acceptances_user_document_version_uidx is
  'One immutable acceptance record per user and published legal document version; supports idempotent API writes.';
