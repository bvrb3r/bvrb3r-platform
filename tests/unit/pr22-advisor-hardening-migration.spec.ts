import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260728124500_pr22_advisor_hardening.sql"
), "utf8");

describe("PR22 Supabase advisor hardening", () => {
  it("keeps public capability and certification RPCs behind the server boundary", () => {
    for (const signature of [
      "pr22_get_owner_rent_statement(text)",
      "pr22_get_public_queue_status(text)",
      "pr22_shop_setup_snapshot(text, uuid)",
      "pr22_issue_release_certificate(text, text)"
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature}`);
      expect(sql).toContain(`grant execute on function public.${signature}`);
    }
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toMatch(/grant execute[\s\S]{0,100}\bto (anon|authenticated)\b/i);
  });

  it("adds covering indexes for every PR22 foreign key reported by the advisor", () => {
    for (const index of [
      "rent_agreements_location_idx",
      "rent_agreements_created_by_idx",
      "rent_agreements_owner_accepted_by_idx",
      "rent_agreements_barber_accepted_by_idx",
      "rent_agreements_supersedes_idx",
      "rent_obligations_location_idx",
      "rent_obligations_relationship_idx",
      "rent_contributions_agreement_idx",
      "rent_actions_audit_actor_idx",
      "rent_actions_audit_agreement_idx",
      "rent_actions_audit_contribution_idx",
      "shop_setup_gates_reviewer_idx",
      "pr22_release_certificates_issuer_idx"
    ]) {
      expect(sql).toContain(`create index if not exists ${index}`);
    }
  });
});
