import { describe, expect, it } from "vitest";
import {
  AUDIT_WRITE_SPINE_SAFE_CATEGORIES,
  buildAuditWriteSpineDryRunProof,
  buildAuditWriteSpineEvent,
  validateAuditWriteSpineEvent
} from "@/lib/architect/audit-write-spine";
import { buildAuditWriteSpineEvidenceCard } from "@/lib/architect/mission-control/foundation";

describe("audit write spine", () => {
  it("builds a structured Finance audit event without persistence", () => {
    const event = buildAuditWriteSpineEvent({
      category: "finance.payment_evidence_checked",
      action: "payment_evidence_checked",
      actorType: "system",
      officerLane: "Finance",
      targetType: "mission_evidence_card",
      targetId: "finance-payment-health",
      metadata: { content_exposed: false },
      occurredAt: "2026-06-23T12:00:00.000Z"
    });

    expect(event).toMatchObject({
      category: "finance.payment_evidence_checked",
      action: "payment_evidence_checked",
      actorType: "system",
      actorId: "system",
      officerLane: "Finance",
      targetType: "mission_evidence_card",
      targetId: "finance-payment-health",
      mutationIntent: "none",
      productionMutation: false,
      wouldPersist: false
    });
    expect(event.id).toContain("audit-write-spine:finance.payment_evidence_checked");
    expect(validateAuditWriteSpineEvent(event)).toMatchObject({ valid: true, productionMutation: false, wouldPersist: false });
  });

  it("keeps Compliance proof content-free and dry-run only", () => {
    const proof = buildAuditWriteSpineDryRunProof({
      category: "compliance.verification_evidence_checked",
      action: "verification_evidence_checked",
      actorType: "officer_assistant",
      actorId: "compliance-assistant",
      officerLane: "Compliance",
      targetType: "mission_evidence_card",
      targetId: "compliance-verification",
      metadata: { content_exposed: false, source_label: "safe metadata only" },
      occurredAt: "2026-06-23T12:00:00.000Z"
    });

    expect(proof.validation.valid).toBe(true);
    expect(proof.contentExposed).toBe(false);
    expect(proof.productionMutation).toBe(false);
    expect(proof.wouldPersist).toBe(false);
    expect(JSON.stringify(proof)).not.toContain("private document text");
  });

  it("rejects unsupported or mutation-shaped audit events", () => {
    const proof = buildAuditWriteSpineDryRunProof({
      category: "finance.refund_execute",
      action: "stripe_refund_execute",
      actorType: "platform_admin",
      actorId: "admin-1",
      officerLane: "Finance",
      targetType: "payment",
      targetId: "payment-1",
      metadata: { refund_amount_cents: 5000 },
      occurredAt: "2026-06-23T12:00:00.000Z"
    });

    expect(AUDIT_WRITE_SPINE_SAFE_CATEGORIES).not.toContain("finance.refund_execute");
    expect(proof.event.mutationIntent).toBe("forbidden");
    expect(proof.validation).toMatchObject({
      valid: false,
      safeCategory: false,
      forbiddenMutationRequested: true,
      productionMutation: false,
      wouldPersist: false
    });
  });

  it("does not allow helper proof alone to become Pass", () => {
    const financeCard = buildAuditWriteSpineEvidenceCard("Finance");
    const complianceCard = buildAuditWriteSpineEvidenceCard("Compliance");

    expect(financeCard).toMatchObject({
      id: "finance-audit-write-spine",
      department: "Finance",
      status: "Needs Review",
      scope: "v2_infrastructure",
      blocksCurrentRelease: false
    });
    expect(complianceCard).toMatchObject({
      id: "compliance-audit-write-spine",
      department: "Compliance",
      status: "Needs Review",
      scope: "v2_infrastructure",
      blocksCurrentRelease: false
    });
    expect(financeCard.evidence.join("\n")).toContain("Runtime persisted audit proof: not connected.");
    expect(complianceCard.evidence.join("\n")).toContain("content_exposed=false");
  });
});
