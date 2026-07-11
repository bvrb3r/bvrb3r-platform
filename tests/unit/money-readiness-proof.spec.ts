import { describe, expect, it } from "vitest";
import { buildMoneyReadinessProof, moneyProofMatchesCommit } from "@/lib/release/money-readiness-proof";

const cleanSnapshot = {
  schema_version: 2,
  generated_at: "2026-07-11T00:00:00.000Z",
  status: "pass",
  critical: {
    successful_payment_missing_routing_count: 0,
    unsafe_releasable_route_count: 0,
    routing_math_mismatch_count: 0,
    failed_payout_without_disposition_count: 0
  },
  review: {
    recent_live_webhook_proof_missing_count: 0,
    open_processor_reconciliation_count: 0
  },
  operational: { payment_count: 32 }
};

describe("Mission 2 money readiness proof", () => {
  it("certifies only a schema-v2 zero-blocker snapshot bound to a commit", () => {
    const proof = buildMoneyReadinessProof({
      snapshot: cleanSnapshot,
      validationCommit: "abc123",
      generatedAt: "2026-07-11T00:01:00.000Z"
    });

    expect(proof.status).toBe("pass");
    expect(proof.certifiable).toBe(true);
    expect(proof.criticalFindings).toEqual([]);
    expect(proof.reviewFindings).toEqual([]);
    expect(moneyProofMatchesCommit(proof, "abc123")).toBe(true);
    expect(moneyProofMatchesCommit(proof, "different")).toBe(false);
  });

  it("fails closed when a critical money invariant is nonzero", () => {
    const proof = buildMoneyReadinessProof({
      snapshot: {
        ...cleanSnapshot,
        status: "fail",
        critical: { refunded_route_still_releasable_count: 1 }
      },
      validationCommit: "abc123"
    });

    expect(proof.status).toBe("failed");
    expect(proof.certifiable).toBe(false);
    expect(proof.criticalFindings).toEqual([
      { metric: "refunded_route_still_releasable_count", value: 1 }
    ]);
  });

  it("returns needs review for missing processor evidence or a legacy snapshot", () => {
    const missingEvidence = buildMoneyReadinessProof({
      snapshot: {
        ...cleanSnapshot,
        status: "needs_review",
        review: { recent_live_webhook_proof_missing_count: 1 }
      },
      validationCommit: "abc123"
    });
    const legacy = buildMoneyReadinessProof({
      snapshot: { schema_version: 1, status: "pass", critical: {}, review: {} },
      validationCommit: "abc123"
    });

    expect(missingEvidence.status).toBe("needs_review");
    expect(missingEvidence.certifiable).toBe(false);
    expect(legacy.status).toBe("needs_review");
    expect(legacy.reasons).toContain("The production money snapshot is not on the Mission 2 schema-v2 contract.");
  });

  it("does not certify an otherwise clean snapshot without a commit binding", () => {
    const proof = buildMoneyReadinessProof({ snapshot: cleanSnapshot });

    expect(proof.certifiable).toBe(false);
    expect(proof.status).toBe("needs_review");
    expect(proof.reasons).toContain("The proof is not bound to a Git commit.");
  });
});
