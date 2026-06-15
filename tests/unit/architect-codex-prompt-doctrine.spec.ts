import { describe, expect, it } from "vitest";
import { buildArchitectCodexRepairPrompt } from "@/lib/architect/mission-control/codex-prompt-doctrine";

const basePromptInput = {
  exactGoal: "Repair routing evidence without mutating money.",
  exactIssue: "Routing health",
  lane: "Finance",
  affectedRole: "Architect / Finance operator",
  affectedFlow: "Routing finance readiness",
  currentStatus: "Failed",
  severity: "Critical blocker",
  currentTruth: "Routing health is currently Failed. Routing health uses payment_routing_records evidence.",
  evidence: ["duplicate evidence row", "duplicate evidence row", "payment captured"],
  rootCauseHypothesis: "Routing health failed because the ledger evidence is missing.",
  primaryRepairTarget: "Payment routing evidence and guarded server-side repair path.",
  filesToInspect: ["app/api/architect/debug/routing/route.ts", "payment_routing_records table"],
  rolePermissionRules: ["Architect prompt generation is read-only."],
  dataSourceTruthRules: ["Stripe/server/Supabase/ledger truth is authoritative."],
  actionRules: ["Generate a repair prompt only."],
  moneyRules: ["No payout guess.", "No refund or dispute mutation unless explicitly required and approved."],
  bookingRules: ["Booking lifecycle truth must stay consistent with appointment/payment records."],
  doNotTouch: ["Stripe mutation logic", "unrelated dirty files"],
  acceptanceCriteria: ["Routing health remains Failed until real evidence changes."],
  requiredValidation: ["Confirm no UI component calculates final money."],
  testsToRun: ["Targeted Architect Mission Control tests"]
};

describe("architect codex prompt doctrine", () => {
  it("generates V1 doctrine repair prompts with required sections", () => {
    const prompt = buildArchitectCodexRepairPrompt(basePromptInput);

    expect(prompt).toContain("Exact goal:");
    expect(prompt).toContain("Exact issue:");
    expect(prompt).toContain("Affected role: Architect / Finance operator");
    expect(prompt).toContain("Affected flow: Routing finance readiness");
    expect(prompt).toContain("Current status: Failed");
    expect(prompt).toContain("V1 Codex Prompt Doctrine:");
    expect(prompt).toContain("Good = Pass.");
    expect(prompt).toContain("Wrong, broken, incomplete, confusing, unsafe, unverified, or fake = Failed.");
    expect(prompt).toContain("Do not mark Pass unless verified.");
    expect(prompt).toContain("Missing data = Needs Review / Not connected.");
    expect(prompt).toContain("No fake Pass states.");
    expect(prompt).toContain("No fake data.");
    expect(prompt).toContain("Server owns serious business logic.");
    expect(prompt).toContain("UI must not calculate final money.");
    expect(prompt).toContain("Architect prompt generation does not repair the issue by itself.");
    expect(prompt).toContain("Evidence group - current issue evidence:");
    expect(prompt).toContain("Root-cause hypothesis:");
    expect(prompt).toContain("Primary repair target:");
    expect(prompt).toContain("Files / areas to inspect:");
    expect(prompt).toContain("Role and permission rules:");
    expect(prompt).toContain("Data / source-of-truth rules:");
    expect(prompt).toContain("Action rules:");
    expect(prompt).toContain("Money rules:");
    expect(prompt).toContain("Booking lifecycle rules:");
    expect(prompt).toContain("Do not touch:");
    expect(prompt).toContain("Acceptance criteria:");
    expect(prompt).toContain("Required validation:");
    expect(prompt).toContain("Tests to run:");
    expect(prompt).toContain("Typecheck / build requirements:");
    expect(prompt).toContain("Final report format:");
    expect(prompt).toContain("Dirty files untouched rule:");
  });

  it("deduplicates grouped evidence rows", () => {
    const prompt = buildArchitectCodexRepairPrompt(basePromptInput);

    expect(prompt.match(/- duplicate evidence row/g)).toHaveLength(1);
  });

  it("keeps root-cause hypotheses concise", () => {
    const prompt = buildArchitectCodexRepairPrompt({
      ...basePromptInput,
      rootCauseHypothesis: "x".repeat(500)
    });

    const rootCauseSection = prompt.split("Root-cause hypothesis:")[1].split("Primary repair target:")[0];
    expect(rootCauseSection.trim()).toHaveLength(320);
    expect(rootCauseSection).toContain("...");
  });
});
