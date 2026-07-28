import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RETIRED_REVENUE_SHARE_ACCOUNT_ROLE } from "@/lib/doctrine/legacy-data-aliases";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260728234500_pr26_role_normalization_dry_run_packet.sql"),
  "utf8"
);
const semanticProof = readFileSync(
  join(process.cwd(), "supabase/tests/pr26_role_normalization_dry_run.sql"),
  "utf8"
);
const packetBuilder = readFileSync(
  join(process.cwd(), "lib/auth/role-normalization-plan.ts"),
  "utf8"
);

describe("PR26 role normalization dry-run packet", () => {
  it("publishes aggregate approval evidence without rows or profile content", () => {
    expect(migration).toContain("public.bvrb3r_pr26_role_normalization_dry_run_packet()");
    expect(migration).toContain("'rowsIncluded', false");
    expect(migration).toContain("'profileContentExposed', false");
    expect(migration).toContain("'publicOutputRedacted', true");
    expect(migration).not.toContain("'profileIds'");
    expect(migration).not.toContain("'rows',");
    expect(migration).toContain("as role_value");
    expect(migration).not.toContain("as current_role");
    expect(migration).not.toMatch(/p\.(full_name|email|phone)/);
  });

  it("keeps the packet non-executable and canonical-only", () => {
    expect(migration).toContain("'executionEnabled', false");
    expect(migration).toContain("'rawMutationExecuted', false");
    expect(migration).toContain("'relationshipMutationAttempted', false");
    expect(migration).toContain(
      `old_role in ('booth_rent_barber', '${RETIRED_REVENUE_SHARE_ACCOUNT_ROLE}') and has_barber_record`
    );
    expect(migration).not.toMatch(/update\s+public\.profiles/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.profiles/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.profiles/i);
  });

  it("is service-only and certifies ten fail-closed checks", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("'checkCount', c.check_count");
    expect(migration).toContain("'certifiable', c.check_count = 10 and c.passed_count = 10");
    expect(semanticProof).toContain("PR26 packet must be certifiable");
    expect(semanticProof).toContain("rollback;");
  });

  it("keeps the application approval packet redacted and mutation-disabled", () => {
    expect(packetBuilder).toContain('generatedFor: "public_review"');
    expect(packetBuilder).toContain("approvalRequired: true");
    expect(packetBuilder).toContain("rawMutationExecuted: false");
    expect(packetBuilder).toContain("publicOutputRedacted: true");
    expect(packetBuilder).toContain("redactedProfileId");
  });
});
