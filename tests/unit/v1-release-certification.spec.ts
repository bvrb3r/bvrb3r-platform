import { describe, expect, it } from "vitest";
import {
  buildV1CertificationSummary,
  summarizeV1Certification,
  type V1CertificationGate
} from "@/lib/release/v1-certification";

describe("V1 release certification", () => {
  it("fails closed when production evidence has not been connected", () => {
    const result = buildV1CertificationSummary();

    expect(result.certifiable).toBe(false);
    expect(result.overallStatus).toBe("needs_review");
    expect(result.counts.needs_review).toBe(result.gates.length);
    expect(result.gates).toHaveLength(11);
  });

  it("uses the most severe gate as the overall status", () => {
    const gates: V1CertificationGate[] = [
      {
        id: "healthy",
        label: "Healthy",
        owner: "Technology",
        status: "pass",
        summary: "Evidence proves healthy.",
        evidence: ["test"],
        remediation: [],
        requiredTests: ["test"]
      },
      {
        id: "money",
        label: "Money",
        owner: "Finance",
        status: "critical_failed",
        summary: "Money invariant failed.",
        evidence: ["routing mismatch"],
        remediation: ["Reconcile routing."],
        requiredTests: ["payment-routing-completion-regression"]
      }
    ];

    const result = summarizeV1Certification(gates, "2026-07-10T00:00:00.000Z");

    expect(result.overallStatus).toBe("critical_failed");
    expect(result.certifiable).toBe(false);
    expect(result.blockers).toEqual(["money"]);
  });

  it("certifies only when no failed or needs-review gates remain", () => {
    const result = summarizeV1Certification([
      {
        id: "deployment",
        label: "Deployment",
        owner: "Technology",
        status: "pass",
        summary: "Deployment is certified.",
        evidence: ["commit matches deployment"],
        remediation: [],
        requiredTests: ["production-smoke"]
      },
      {
        id: "non-blocking-warning",
        label: "Non-blocking warning",
        owner: "Product",
        status: "warning",
        summary: "Safe degraded behavior is documented.",
        evidence: ["accepted limitation"],
        remediation: ["Schedule follow-up."],
        requiredTests: ["degraded-state"]
      }
    ]);

    expect(result.certifiable).toBe(true);
    expect(result.overallStatus).toBe("warning");
  });
});
