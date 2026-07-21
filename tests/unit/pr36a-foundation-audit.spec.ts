import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMissionControlFoundation,
  buildOfficerGreenGates,
  buildRlsSecurityInventory
} from "@/lib/architect/mission-control/foundation";
import type {
  MissionControlStatus,
  MissionDepartment,
  MissionDepartmentLane,
  MissionEvidenceCard,
  MissionLaneId
} from "@/lib/architect/mission-control/types";

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, "docs/audits/pr36a-foundation-audit-before-client-v1.md");
const reportRepoPath = "docs/audits/pr36a-foundation-audit-before-client-v1.md";
const report = readFileSync(reportPath, "utf8");

function auditCommit() {
  try {
    return execFileSync("git", ["log", "--diff-filter=A", "-n", "1", "--format=%H", "--", reportRepoPath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function changedFiles() {
  const commit = auditCommit();
  if (!commit) return [];
  const output = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", commit], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function changedText(files = changedFiles()) {
  const commit = auditCommit();
  return files
    .filter((file) => !file.endsWith(".md"))
    .map((file) => {
      if (commit) {
        try {
          return execFileSync("git", ["show", `${commit}:${file}`], {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"]
          });
        } catch {
          // Fall through for environments with a shallow checkout.
        }
      }
      return existsSync(path.join(repoRoot, file)) ? readFileSync(path.join(repoRoot, file), "utf8") : "";
    })
    .join("\n");
}

function gateCard(
  id: string,
  label: string,
  department: MissionDepartment,
  status: MissionControlStatus,
  evidence: string[] = [`${label} evidence is connected.`]
): MissionEvidenceCard {
  return {
    id,
    label,
    department,
    workflow: "PR #36A fixture",
    status,
    summary: `${label} ${status}.`,
    evidence
  };
}

function gateLane(id: MissionLaneId, label: MissionDepartment, cards: MissionEvidenceCard[]): MissionDepartmentLane {
  return {
    id,
    label,
    purpose: `${label} PR #36A fixture lane.`,
    status: cards.some((card) => card.status === "Failed") ? "Failed" : cards.every((card) => card.status === "Pass") ? "Pass" : "Needs Review",
    cards
  };
}

const requiredProductCards = [
  ["product-client-health", "Client lane health"],
  ["product-barber-health", "Barber lane health"],
  ["product-owner-health", "Owner lane health"],
  ["product-culture-loop", "Culture loop health"],
  ["product-booking-ux", "Booking UX health"]
] as const;

const requiredOperationsCards = [
  ["operations-appointments", "Appointments"],
  ["operations-calendars", "Calendars"],
  ["operations-relationships", "Shop relationships"],
  ["operations-command-calendars", "Owner/barber command calendars"],
  ["operations-completion", "Service completion flow"]
] as const;

const requiredTechnologyCards = [
  ["technology-deployments", "Deployments"],
  ["technology-current-commit-proof", "Current commit proof"],
  ["technology-current-deploy-proof", "Current deploy proof"],
  ["technology-deployment-status-proof", "Vercel deployment status proof"],
  ["technology-build-tests", "Build/test status"],
  ["technology-rls-disabled", "RLS disabled tables"],
  ["technology-source-vault-readiness", "Source Vault readiness"],
  ["technology-coverage", "Regression coverage"]
] as const;

function cardsFrom(entries: readonly (readonly [string, string])[], department: MissionDepartment, overrides: Record<string, MissionControlStatus> = {}) {
  return entries.map(([id, label]) => gateCard(id, label, department, overrides[id] ?? "Pass"));
}

function platformGate(overrides: {
  ceo?: Record<string, MissionControlStatus>;
  product?: Record<string, MissionControlStatus>;
  operations?: Record<string, MissionControlStatus>;
  technology?: Record<string, MissionControlStatus>;
} = {}) {
  return buildOfficerGreenGates([
    gateCard("ceo-regression-deployment-health", "Deployment / Regression proof", "Technology", overrides.ceo?.["ceo-regression-deployment-health"] ?? "Pass"),
    gateCard("source-vault-status", "Source Vault proof", "Technology", overrides.ceo?.["source-vault-status"] ?? "Pass"),
    gateCard("critical-incidents", "Critical incident proof", "Technology", overrides.ceo?.["critical-incidents"] ?? "Pass"),
    gateCard("security-unsafe-actions", "Action Registry proof", "Security", "Pass"),
    gateCard("hive-ai", "Hive AI", "Technology", "Needs Review", ["Hive AI is parked/future."]),
    gateCard("codex-packets", "Codex Packets", "Technology", "Pass", ["No active incident requires a packet."])
  ], [
    gateLane("security", "Security", [
      gateCard("security-role-drift", "Profile role drift", "Security", "Pass"),
      gateCard("security-role-truth-inventory", "Role Truth Inventory", "Security", "Pass"),
      gateCard("security-rls-disabled", "RLS disabled tables", "Security", "Pass"),
      gateCard("security-rls-inventory", "RLS Security Inventory", "Security", "Pass"),
      gateCard("security-audit", "Audit trail coverage", "Security", "Pass")
    ]),
    gateLane("compliance", "Compliance", [
      gateCard("compliance-trust-gates", "Client/barber/shop trust gates", "Compliance", "Pass"),
      gateCard("compliance-verification", "Verification", "Compliance", "Pass"),
      gateCard("compliance-role-truth-inventory", "Role Truth Evidence", "Compliance", "Pass"),
      gateCard("audit-spine-coverage", "Audit Spine Coverage", "Compliance", "Pass")
    ]),
    gateLane("finance", "Finance", [
      gateCard("finance-payment-health", "Payment Health", "Finance", "Pass"),
      gateCard("finance-stripe", "Stripe Status", "Finance", "Pass"),
      gateCard("finance-payout", "Payout readiness", "Finance", "Pass"),
      gateCard("finance-refund-resolution", "Cancelled/captured refund resolution", "Finance", "Pass")
    ]),
    gateLane("product", "Product", cardsFrom(requiredProductCards, "Product", overrides.product)),
    gateLane("operations", "Operations", cardsFrom(requiredOperationsCards, "Operations", overrides.operations)),
    gateLane("technology", "Technology", [
      gateCard("platform_health-officer-green-gate", "Technology / Platform Health Gate", "Technology", "Failed"),
      ...cardsFrom(requiredTechnologyCards, "Technology", overrides.technology)
    ])
  ]).find((gate) => gate.id === "platform_health")!;
}

describe("PR #36A foundation audit cleanup", () => {
  it("adds the safe PR #36A audit report without consuming roadmap PR #37", () => {
    expect(existsSync(reportPath)).toBe(true);
    expect(report).toContain("Internal label: PR #36A");
    expect(report).toContain("GitHub PR number: pending / assigned by GitHub");
    expect(report).toContain("Roadmap protection: this internal cleanup must not consume roadmap PR #37.");
    expect(report).toContain("Next recommended PR: #37 Client V1 Surface Clean Pass");
  });

  it("records the PR #21 through PR #36 foundation history with current labels", () => {
    for (let pr = 21; pr <= 36; pr += 1) {
      expect(report).toContain(`#${pr}`);
    }

    expect(report).toContain("#26 Role Normalization Dry-Run / Approval Packet");
    expect(report).toContain("#27 Production Role Normalization Approval Evidence");
    expect(report).toContain("#36 Technology / Platform Health Gate");
  });

  it("keeps the audit report free of private content and production row dumps", () => {
    expect(report).not.toMatch(/BEGIN (RSA|OPENSSH|PRIVATE) KEY/i);
    expect(report).not.toMatch(/sk_live|whsec_|SUPABASE_SERVICE_ROLE_KEY/i);
    expect(report).not.toMatch(/raw private user data|production row dump|raw Stripe payload/i);
    expect(report).toContain("No private Source Vault content was exposed.");
  });

  it("does not add migrations, RLS policies, production SQL, role mutation, money mutation, or Client V1 surface files", () => {
    const files = changedFiles();

    expect(files).not.toContain("supabase/migrations");
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/^supabase\/migrations\//)]));
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/\.sql$/)]));
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/^app\/api\/architect\/roles\//)]));
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/^lib\/auth\/role-normalization/)]));
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/^app\/api\/architect\/payouts\//)]));
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/^app\/api\/payments\//)]));
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/^lib\/stripe/)]));
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/^app\/\(platform\)\/dashboard\/client\//)]));
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/^app\/\(platform\)\/client\//)]));
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/^app\/onboarding\//)]));
    expect(files).not.toEqual(expect.arrayContaining([expect.stringMatching(/^app\/pricing/)]));
  });

  it("does not add executable protected-risk mutation calls in changed non-doc files", () => {
    const text = changedText();

    expect(text).not.toMatch(/supabase\.from\([^)]*profiles[^)]*\)\.(update|upsert|delete|insert)/i);
    expect(text).not.toMatch(/stripe\.(refunds|payouts|transfers|paymentIntents)\.(create|update|cancel)/i);
    expect(text).not.toMatch(/^\s*(?:create|alter|drop)\s+policy\b.+\bon\b/gim);
    expect(text).not.toMatch(
      /^\s*alter\s+table\b.+\b(?:enable|disable)\s+row\s+level\s+security\b/gim,
    );
    expect(text).not.toMatch(/\bdelete\s+from\b|\bupdate\s+public\.profiles\b|\binsert\s+into\s+public\.profiles\b/i);
  });

  it("keeps Hive AI parked/future and Codex Packets idle/non-blocking in the audit report", () => {
    expect(report).toContain("Hive AI: Parked/future and non-blocking.");
    expect(report).toContain("Codex Packets: Idle/non-blocking unless an incident requires packet evidence.");
  });

  it("lets RLS-disabled evidence represent zero disabled public tables from connected current metadata", () => {
    const inventory = buildRlsSecurityInventory({
      rows: [{
        id: "rls-public-safe-table",
        schemaName: "public",
        tableName: "public_safe_table",
        rlsEnabled: "yes",
        policyCount: 1,
        policyNames: ["public_safe_table_platform_admin_read"],
        dataSensitivity: "Metadata-only PR #36A fixture.",
        userRoleExposure: ["platform_admin"],
        v1Required: true,
        futureParked: false,
        currentRiskLevel: "low",
        expectedPolicyPosture: "RLS enabled with narrow policy evidence.",
        suggestedPolicyPlanSummary: "No policy mutation in PR #36A.",
        nextRepairLane: "security",
        evidenceSource: "PR #36A current metadata fixture."
      }],
      productionDisabledPublicTableCount: 0,
      productionDisabledPublicTableNames: [],
      totalPublicTablesInspected: 42,
      disabledEvidenceConnected: true,
      disabledEvidenceCurrent: true,
      disabledEvidenceCheckedAt: "2026-06-25T12:00:00.000Z"
    });
    const foundation = buildMissionControlFoundation([], "2026-06-25T12:00:00.000Z", [], undefined, inventory);
    const rlsDisabled = foundation.ceoCommandCenter.find((card) => card.id === "ceo-rls-disabled-evidence");

    expect(rlsDisabled).toMatchObject({ status: "Pass" });
    expect(rlsDisabled?.evidence.join("\n")).toContain("0 public Supabase table(s) reported RLS disabled.");
  });

  it("keeps Security Needs Review rather than fake Pass when audit proof is missing", () => {
    const securityGate = buildOfficerGreenGates([], [
      gateLane("security", "Security", [
        gateCard("security-role-drift", "Profile role drift", "Security", "Pass"),
        gateCard("security-role-truth-inventory", "Role Truth Inventory", "Security", "Pass"),
        gateCard("security-rls-disabled", "RLS disabled tables", "Security", "Pass"),
        gateCard("security-rls-inventory", "RLS Security Inventory", "Security", "Pass"),
        gateCard("security-audit", "Audit Evidence", "Security", "Needs Review", ["Audit proof is not connected."])
      ])
    ]).find((gate) => gate.id === "security");

    expect(securityGate?.status).toBe("Needs Review");
    expect(securityGate?.blockerReasons.join("\n")).toContain("Audit Evidence");
  });

  it("keeps Platform Health from counting itself, Hive AI, or idle Codex Packets", () => {
    const gate = platformGate();
    const blockers = gate.blockerReasons.join("\n");

    expect(gate.status).toBe("Pass");
    expect(blockers).not.toContain("Technology / Platform Health Gate");
    expect(blockers).not.toContain("Hive AI");
    expect(blockers).not.toContain("Codex Packets");
  });

  it("keeps Platform Health Needs Review for review-only upstream proof", () => {
    const gate = platformGate({ product: { "product-client-health": "Needs Review" } });

    expect(gate.status).toBe("Needs Review");
    expect(gate.summary).toContain("missing, stale, or incomplete");
    expect(gate.blockerReasons.join("\n")).toContain("Product required evidence: Needs Review");
  });

  it("keeps Platform Health Failed and visible for real upstream failed evidence", () => {
    const gate = platformGate({ operations: { "operations-appointments": "Failed" } });

    expect(gate.status).toBe("Failed");
    expect(gate.summary).toContain("failed evidence source");
    expect(gate.blockerReasons.join("\n")).toContain("Operations required evidence: Failed");
    expect(gate.evidenceSources.join("\n")).toContain("Appointments: Failed");
  });

  it("keeps Product, Operations, and Technology blockers explicit for roadmap PR #37", () => {
    expect(report).toContain("Product blockers: client lane health, barber lane health, owner lane health, Culture loop health, and Booking UX");
    expect(report).toContain("Operations blockers: appointments, calendars, shop relationships, owner/barber command calendars, and service completion flow");
    expect(report).toContain("Technology blockers: deployment proof, current commit proof, current deploy proof, deployment status proof, build/test status");
  });

  it("states Client V1 surface work is deferred and not implemented in PR #36A", () => {
    for (const surface of ["Client Home", "Search", "Booking entry", "Activity", "Messages", "More", "Favorites visibility", "Rebook visibility"]) {
      expect(report.toLowerCase()).toContain(surface.toLowerCase());
    }

    expect(report).toContain("reserved for PR #37 and not implemented here");
    expect(report).toContain("No Client V1 surface feature work was added.");
    expect(report).toContain("No onboarding, paywall, role/product/operations surface build was added.");
  });
});
