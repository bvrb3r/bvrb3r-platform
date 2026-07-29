import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260729002000_pr27_role_normalization_approval_evidence.sql"),
  "utf8"
);
const semanticProof = readFileSync(
  join(process.cwd(), "supabase/tests/pr27_role_normalization_approval_evidence.sql"),
  "utf8"
);

describe("PR27 production role-normalization approval evidence", () => {
  it("stores private append-only approval evidence with idempotency", () => {
    expect(migration).toContain("private.role_normalization_approval_evidence");
    expect(migration).toContain("idempotency_key uuid primary key");
    expect(migration).toContain("on conflict (idempotency_key) do nothing");
    expect(migration).toContain("idempotency key was reused with different content");
    expect(migration).toContain("before update or delete");
    expect(migration).toContain("before truncate");
    expect(migration).toContain("approval evidence is append-only");
  });

  it("requires a certifiable PR26 packet and keeps execution disabled", () => {
    expect(migration).toContain("public.bvrb3r_pr26_role_normalization_dry_run_packet()");
    expect(migration).toContain('\"certifiable\": true');
    expect(migration).toContain('\"approvalRequired\": true');
    expect(migration).toContain('\"executionEnabled\": false');
    expect(migration).toContain('\"rawMutationExecuted\": false');
    expect(migration).toContain('\"rowsIncluded\": false');
    expect(migration).toContain("'roleMutationExecuted', false");
    expect(migration).toContain("'actorContentExposed', false");
    expect(migration).not.toMatch(/\b(update|delete\s+from|insert\s+into)\s+public\.profiles\b/i);
  });

  it("keeps the recorder and status service-only while denying direct ledger access", () => {
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("public.bvrb3r_pr27_record_role_normalization_approval_evidence");
    expect(migration).toContain("public.bvrb3r_pr27_role_normalization_approval_status");
    expect(migration).not.toMatch(/grant\s+(select|insert|update|delete|all)[\s\S]{0,120}role_normalization_approval_evidence/i);
  });

  it("proves idempotency, immutability, redaction, and profile-role non-mutation", () => {
    expect(semanticProof).toContain("idempotentReplay");
    expect(semanticProof).toContain("idempotency key was reused with different content");
    expect(semanticProof).toContain("approval evidence update unexpectedly succeeded");
    expect(semanticProof).toContain("approval evidence delete unexpectedly succeeded");
    expect(semanticProof).toContain("actorContentExposed");
    expect(semanticProof).toContain("v_before_fingerprint");
    expect(semanticProof).toContain("v_after_fingerprint");
    expect(semanticProof).toContain("rollback;");
  });
});
