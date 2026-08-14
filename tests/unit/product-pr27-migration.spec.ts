import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260729200000_product_pr27_compliance_trust.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");
const certificationSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260729201000_product_pr27_compliance_certification.sql"
  ),
  "utf8"
);
const finalizerFixSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260729202000_product_pr27_account_finalizer_fix.sql"
  ),
  "utf8"
);
const disputeSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260729203000_product_pr27_dispute_participant_evidence.sql"
  ),
  "utf8"
);
const serviceSource = fs.readFileSync(
  path.join(process.cwd(), "lib/trust/product-pr27-service.ts"),
  "utf8"
);

describe("Product PR27 migration contract", () => {
  it("keeps counsel drafts unpublished and version-addressable", () => {
    expect(sql).toContain("create table if not exists public.legal_document_versions");
    expect(sql).toContain("status text not null check (status in ('draft', 'published', 'retired'))");
    expect(sql).toContain("'draft-1-2026-07-26'");
    expect(sql).toContain("'content/legal/LEGAL-TERMS-DRAFT.md'");
    expect(sql).toContain("'content/legal/LEGAL-PRIVACY-DRAFT.md'");
    expect(sql).toContain("'content/legal/LEGAL-REFUND-DRAFT.md'");
    expect(sql).toContain("'content/legal/LEGAL-ACCEPTABLE-USE-DRAFT.md'");
    expect(sql).not.toMatch(/'draft-1-2026-07-26',[\s\S]{0,120}'published'/);
  });

  it("defines the five required barber gates and server-only go-live decision", () => {
    expect(sql).toContain("create table if not exists public.barber_setup_evidence");
    expect(sql).toContain("create table if not exists public.barber_setup_activations");
    expect(sql).toContain("create or replace function public.pr27_barber_required_setup_complete");
    expect(sql).toContain("count(*) filter (where e.status = 'done') = 5");
    expect(sql).toContain("grant execute on function public.pr27_barber_required_setup_complete(uuid)");
    expect(sql).toContain("to service_role");
  });

  it("uses an exact 30-day deletion grace and seven-day export link", () => {
    expect(sql).toContain("deletion_grace_ends_at = deletion_requested_at + interval '30 days'");
    expect(sql).toContain("expires_at = ready_at + interval '7 days'");
    expect(sql).toContain("compliance_private.finance_retention_vault");
    expect(sql).toContain("revoke all on table compliance_private.finance_retention_vault from public, anon, authenticated");
  });

  it("makes blocks bidirectional and mutes viewer-only", () => {
    expect(sql).toContain("create or replace function public.pr27_profiles_blocked");
    expect(sql).toContain("b.blocker_profile_id = p_right_profile_id and b.blocked_profile_id = p_left_profile_id");
    expect(sql).toContain("create table if not exists public.culture_profile_mutes");
    expect(sql).toContain("using (muter_profile_id = auth.uid())");
    expect(sql).toContain("drop policy if exists \"culture posts public approved read batch 4\"");
    expect(sql).toContain("create trigger pr27_prevent_blocked_booking");
  });

  it("requires decision reasoning and a different appeal reviewer", () => {
    expect(sql).toContain("length(btrim(coalesce(decision_reasoning, ''))) >= 12");
    expect(sql).toContain("appeal_reviewer_profile_id <> original_reviewer_profile_id");
    expect(sql).toContain("create table if not exists public.culture_moderation_audit");
  });

  it("auto-hides a reported post at the documented three-report velocity threshold", () => {
    expect(sql).toContain("create trigger pr27_auto_hide_culture_post");
    expect(sql).toContain("if recent_report_count >= 3 then");
    expect(sql).toContain("set moderation_status = 'flagged'");
  });

  it("limits the strike ladder to Culture and expires strikes after twelve months", () => {
    expect(sql).toContain("expires_at timestamptz not null default now() + interval '12 months'");
    expect(sql).toContain("then 'posting_pause'");
    expect(sql).toContain("then 'culture_ban'");
    expect(sql).toContain("booking_and_money_unaffected");
  });

  it("adds durable support tickets and dispute evidence without replacing conversation or ledger truth", () => {
    expect(sql).toContain("create table if not exists public.support_cases");
    expect(sql).toContain("thread_id uuid references public.message_threads");
    expect(sql).toContain("create table if not exists public.dispute_evidence_items");
    expect(sql).toContain("dispute_reference text not null references public.disputes");
    expect(disputeSql).toContain("dispute_evidence_items_participant_select");
    expect(disputeSql).toContain("from public.disputes d");
    expect(disputeSql).not.toMatch(/for\s+(insert|update|delete)/i);
  });

  it("persists required setup only from canonical server truth", () => {
    expect(serviceSource).toContain('source: "canonical_server_truth"');
    expect(serviceSource).toContain("buildPr27BarberSetup({ ...stored, ...computed })");
    expect(serviceSource).toContain("const setup = await getPr27BarberSetup(user)");
  });

  it("cannot claim Barber marketplace activation from the weaker PR27 checklist alone", () => {
    expect(serviceSource).toContain('supabase.rpc("pr32_get_road_setup_checks"');
    expect(serviceSource).toContain('isRoadCheckComplete(roadSetupChecks, "barber.profile_published")');
    expect(serviceSource).toContain("const canRequestActivation = setup.requiredComplete");
    expect(serviceSource).toContain("publishBarberMarketplaceReadiness(supabase, user.barberId)");
    expect(serviceSource).toContain('status: "paused"');
    expect(serviceSource).toContain('"canonical_marketplace_blocked"');
  });

  it("clears PR27 advisor debt without opening client writes", () => {
    expect(certificationSql).toContain("account_export_deliveries_request_idx");
    expect(certificationSql).toContain("culture_safety_reports_reporter_idx");
    expect(certificationSql).toContain("profile_id = (select auth.uid())");
    expect(certificationSql).toContain("culture_moderation_audit_no_client_read");
    expect(certificationSql).toContain("using (false)");
    expect(certificationSql).not.toMatch(/grant\s+(insert|update|delete|all).*authenticated/i);
  });

  it("finalizes only expired deletion grace while sealing financial truth", () => {
    expect(certificationSql).toContain("finalize_account_deletion");
    expect(certificationSql).toContain("lifecycle.deletion_grace_ends_at > finalized_time");
    expect(certificationSql).toContain("Open bookings must be resolved before account deletion.");
    expect(certificationSql).toContain("compliance_private.finance_retention_vault");
    expect(certificationSql).toContain("'financial_ledgers_preserved', true");
    expect(certificationSql).toContain("grant execute on function compliance_private.finalize_account_deletion(uuid)");
    expect(certificationSql).toContain("to service_role");
    expect(finalizerFixSql).toContain("#variable_conflict use_column");
  });

  it("expires clean Culture strikes through a server-owned worker", () => {
    expect(certificationSql).toContain("expire_clean_culture_strikes");
    expect(certificationSql).toContain("expires_at <= now()");
    expect(certificationSql).toContain("to service_role");
  });
});
