import { describe, expect, it } from "vitest";
import { buildChatGptPacket, buildCodexPacket, buildIncidentPacket } from "@/lib/architect/mission-control/packets";
import type { ArchitectIncident } from "@/lib/architect/mission-control/types";

const snapshot = {
  checkedAt: "2026-05-18T12:00:00.000Z",
  environment: {
    appEnv: "production",
    commitHash: "abc123",
    deploymentId: "dpl_123",
    branch: "main",
    buildTime: "2026-05-18T11:55:00.000Z"
  }
};

const incident: ArchitectIncident = {
  id: "completed_but_routing_missing:appointment:2090",
  diagnosisCode: "completed_but_routing_missing",
  affectedEntity: "appointment 2090",
  affectedRole: "barber",
  affectedTable: "payment_routing_records",
  affectedRoute: "/api/architect/repairs/payment-routing",
  severity: "critical",
  confidence: "high",
  createdAt: "2026-05-18T12:00:00.000Z",
  recommendedAction: "Run Safe Repair: payment routing.",
  canRepair: true,
  repairType: "payment_routing",
  codexRequired: false,
  targetType: "appointment",
  targetId: "2090",
  headline: "Completed paid appointment is missing payment routing.",
  evidence: ["appointment completed", "payment captured", "routing missing"],
  analysis: {
    likelyRootCause: "Routing ledger was not created.",
    confidence: 94,
    affectedLayer: "payment routing",
    failedInvariant: "completed + paid appointment must have routing",
    supportingEvidence: ["appointmentId=2090"],
    ruledOut: ["payment capture"],
    safeRepairAvailable: true,
    codexRequired: false,
    nextBestAction: "Run payment routing repair."
  },
  sqlSnippets: [{ label: "Routing", sql: "select * from payment_routing_records where appointment_id = '2090';" }]
};

describe("architect packet copy", () => {
  it("builds a ChatGPT packet for architecture reasoning", () => {
    const packet = buildChatGptPacket(snapshot, incident);

    expect(packet).toContain("DEBUG TYPE");
    expect(packet).toContain("PRODUCTION EVIDENCE");
    expect(packet).toContain("RECOMMENDED NEXT ACTION");
  });

  it("builds a Codex packet with implementation requirements", () => {
    const packet = buildCodexPacket(snapshot, incident);

    expect(packet).toContain("DO NOT TOUCH");
    expect(packet).toContain("FILES TO INSPECT");
    expect(packet).toContain("VALIDATION COMMANDS");
  });

  it("builds a full incident packet with SQL snippets", () => {
    const packet = JSON.parse(buildIncidentPacket(snapshot, incident));

    expect(packet.incident.diagnosisCode).toBe("completed_but_routing_missing");
    expect(packet.sqlSnippets[0].sql).toContain("payment_routing_records");
  });
});
