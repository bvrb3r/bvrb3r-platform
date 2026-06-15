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

const paymentHealthPromptInput = {
  ...basePromptInput,
  exactGoal: "Repair Payment Health without mutating money.",
  exactIssue: "Payment health",
  affectedFlow: "Payments finance readiness",
  currentTruth: "Payment health is currently Failed. Payment health uses appointment/payment/routing truth.",
  evidence: [
    "appointments.status = completed",
    "appointments.completed_at is populated",
    "payment.status = captured",
    "payment.status=captured",
    "payment_routing_records lookup by appointment_id returned 0 rows",
    "appointment.status=cancelled",
    "No recent routing repair constraint failure was found.",
    "Appointment existence has not been inspected",
    "Payment existence has not been inspected",
    "Status history has not been inspected",
    "Routing state has not been inspected",
    "Payout release guard has not been inspected"
  ],
  rootCauseHypothesis: [
    "appointments.status = completed and appointments.completed_at is populated",
    "payment.status = captured",
    "payment_routing_records lookup by appointment_id returned 0 rows",
    "payment.status = captured"
  ].join(" "),
  primaryRepairTarget: "Server-side payment routing creation/reconciliation after payment capture and appointment completion."
};

function promptSection(prompt: string, start: string, end: string) {
  return prompt.split(start)[1].split(end)[0].trim();
}

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
    expect(prompt).toContain("Evidence groups:");
    expect(prompt).toContain("Passing evidence:");
    expect(prompt).toContain("Failed evidence:");
    expect(prompt).toContain("Missing evidence:");
    expect(prompt).toContain("Conflicting evidence:");
    expect(prompt).toContain("Not inspected yet:");
    expect(prompt).toContain("Root-cause hypothesis:");
    expect(prompt).toContain("Primary repair target:");
    expect(prompt).toContain("First inspection step:");
    expect(prompt).toContain("Separate conflict path:");
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

  it("groups Payment Health evidence into passing, failed, conflicting, neutral, and not-inspected sections", () => {
    const prompt = buildArchitectCodexRepairPrompt(paymentHealthPromptInput);

    const passingSection = promptSection(prompt, "Passing evidence:", "Failed evidence:");
    const failedSection = promptSection(prompt, "Failed evidence:", "Missing evidence:");
    const missingSection = promptSection(prompt, "Missing evidence:", "Conflicting evidence:");
    const conflictSection = promptSection(prompt, "Conflicting evidence:", "Neutral / Context evidence:");
    const neutralSection = promptSection(prompt, "Neutral / Context evidence:", "Not inspected yet:");
    const notInspectedSection = promptSection(prompt, "Not inspected yet:", "Root-cause hypothesis:");

    expect(passingSection).toContain("appointments.status = completed");
    expect(passingSection).toContain("appointments.completed_at is populated");
    expect(passingSection.match(/payment.status = captured/g)).toHaveLength(1);
    expect(failedSection).toContain("payment_routing_records lookup by appointment_id returned 0 rows");
    expect(missingSection).not.toContain("appointment.status=cancelled");
    expect(conflictSection).toContain("payment.status = captured while appointment.status = cancelled");
    expect(conflictSection).not.toContain("- None.");
    expect(neutralSection).toContain("No recent routing repair constraint failure was found.");
    expect(notInspectedSection).toContain("Appointment existence has not been inspected");
    expect(notInspectedSection).toContain("Payment existence has not been inspected");
    expect(notInspectedSection).toContain("Status history has not been inspected");
    expect(notInspectedSection).toContain("Routing state has not been inspected");
    expect(notInspectedSection).toContain("Payout release guard has not been inspected");
  });

  it("generates non-truncated diagnosis instead of dumping duplicated raw evidence", () => {
    const prompt = buildArchitectCodexRepairPrompt(paymentHealthPromptInput);

    const rootCauseSection = prompt.split("Root-cause hypothesis:")[1].split("Primary repair target:")[0];
    const sentenceCount = rootCauseSection.split(".").filter((sentence) => sentence.trim()).length;

    expect(sentenceCount).toBeGreaterThanOrEqual(2);
    expect(sentenceCount).toBeLessThanOrEqual(5);
    expect(rootCauseSection).not.toContain("...");
    expect(rootCauseSection).not.toContain("appointments.status = completed");
    expect(rootCauseSection).not.toContain("payment_routing_records lookup by appointment_id returned 0 rows");
    expect(rootCauseSection.match(/payment.status = captured/g)).toBeNull();
    expect(rootCauseSection).toContain("server, Supabase, Stripe, and ledger evidence");
  });

  it("keeps Payment Health repair direction and conflict path explicit", () => {
    const prompt = buildArchitectCodexRepairPrompt(paymentHealthPromptInput);

    expect(prompt).toContain("Primary repair target:\nServer-side payment routing creation/reconciliation after payment capture and appointment completion.");
    expect(prompt).toContain("First inspection step:\nInspect the completed appointment with captured payment and missing routing record. Do not start by editing UI.");
    expect(prompt).toContain("Separate conflict path:\nCaptured payments attached to cancelled appointments must be investigated separately from completed/captured appointment routing.");
  });
});
