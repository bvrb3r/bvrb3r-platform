export type ArchitectCodexPromptStatus = "Pass" | "Warning" | "Failed" | "Needs Review" | "Not Connected" | string;

export type ArchitectCodexRepairPromptInput = {
  exactGoal: string;
  exactIssue: string;
  lane: string;
  affectedRole: string;
  affectedFlow: string;
  currentStatus: ArchitectCodexPromptStatus;
  severity: string;
  currentTruth: string;
  evidence: string[];
  rootCauseHypothesis: string;
  primaryRepairTarget: string;
  filesToInspect: string[];
  rolePermissionRules: string[];
  dataSourceTruthRules: string[];
  actionRules: string[];
  moneyRules?: string[];
  bookingRules?: string[];
  doNotTouch: string[];
  acceptanceCriteria: string[];
  requiredValidation: string[];
  testsToRun: string[];
};

export type ArchitectCodexPromptEvidenceGroups = {
  passing: string[];
  failed: string[];
  missing: string[];
  conflicting: string[];
  notInspected: string[];
};

const V1_DOCTRINE = [
  "Good = Pass.",
  "Wrong, broken, incomplete, confusing, unsafe, unverified, or fake = Failed.",
  "Do not mark Pass unless verified.",
  "Missing data = Needs Review / Not connected.",
  "Failed data = Failed.",
  "No fake Pass states.",
  "No fake data.",
  "No unrelated changes.",
  "Server owns serious business logic.",
  "UI must not calculate final money.",
  "Architect prompt generation does not repair the issue by itself."
];

const STANDARD_TYPECHECK_BUILD_REQUIREMENTS = [
  "npm run typecheck must pass.",
  "npm run build must pass."
];

const STANDARD_FINAL_REPORT_FORMAT = [
  "Files changed",
  "Migration yes/no",
  "Root cause",
  "Repair behavior",
  "Validation performed",
  "Tests run",
  "Typecheck result",
  "Build result",
  "Commit hash",
  "Pushed yes/no",
  "Dirty files untouched yes/no"
];

const STANDARD_DIRTY_FILES_RULES = [
  "Run git status --short before staging.",
  "Stage only intended files.",
  "Do not stage unrelated dirty files.",
  "Leave unrelated dirty files untouched."
];

export function dedupePromptRows(rows: string[]) {
  const seen = new Set<string>();
  return rows
    .map((row) => row.replace(/\s+/g, " ").trim())
    .filter((row) => {
      if (!row || seen.has(row.toLowerCase())) return false;
      seen.add(row.toLowerCase());
      return true;
    });
}

function bulletSection(title: string, rows: string[]) {
  const safeRows = dedupePromptRows(rows);
  return [
    `${title}:`,
    ...(safeRows.length ? safeRows.map((row) => `- ${row}`) : ["- Not connected."])
  ];
}

function emptyEvidenceGroups(): ArchitectCodexPromptEvidenceGroups {
  return {
    passing: [],
    failed: [],
    missing: [],
    conflicting: [],
    notInspected: []
  };
}

function isPaymentHealthPrompt(input: ArchitectCodexRepairPromptInput) {
  return input.lane.toLowerCase() === "finance" && input.exactIssue.toLowerCase() === "payment health";
}

function classifyEvidenceRow(row: string, input: ArchitectCodexRepairPromptInput): keyof ArchitectCodexPromptEvidenceGroups {
  const normalized = row.toLowerCase().replace(/\s+/g, " ").trim();
  const paymentHealth = isPaymentHealthPrompt(input);
  const hasCapturedPayment = normalized.includes("payment.status=captured")
    || normalized.includes("payment.status = captured")
    || normalized.includes("payment captured")
    || normalized.includes("payment_status: captured");
  const hasCancelledAppointment = normalized.includes("appointment.status=cancelled")
    || normalized.includes("appointment.status = cancelled")
    || normalized.includes("appointment cancelled")
    || normalized.includes("appointments.status = cancelled");

  if (hasCapturedPayment && hasCancelledAppointment) return "conflicting";
  if (normalized.includes("has not been inspected")) return "notInspected";

  if (paymentHealth) {
    const completedAppointment = normalized.includes("appointments.status = completed")
      || normalized.includes("appointments.status=completed")
      || normalized.includes("appointment completed");
    const completedAtPopulated = normalized.includes("appointments.completed_at is populated")
      || normalized.includes("completed_at is populated")
      || normalized.includes("completed_at populated")
      || normalized.includes("appointment completed");

    if (completedAppointment && completedAtPopulated) return "passing";
    if (hasCapturedPayment) return "passing";
    if (normalized.includes("payment_routing_records lookup by appointment_id returned 0 rows")) return "failed";
    if (normalized.includes("routing missing")) return "failed";
  }

  if (normalized.includes("not connected")
    || normalized.includes("no connected evidence")
    || normalized.includes("is missing")
    || normalized.includes("not found")) {
    return "missing";
  }

  if (normalized.includes("failed")
    || normalized.includes("does not")
    || normalized.includes("detected")
    || normalized.includes("0 rows")
    || normalized.includes("missing without clear failure")
    || normalized.includes("violates")) {
    return "failed";
  }

  if (normalized.includes("exists")
    || normalized.includes("captured")
    || normalized.includes("completed")
    || normalized.includes("available")
    || normalized.includes("blocked before completion")
    || normalized.includes("verified")
    || normalized.includes("pass")) {
    return "passing";
  }

  return "missing";
}

export function groupArchitectCodexPromptEvidence(
  rows: string[],
  input: ArchitectCodexRepairPromptInput
): ArchitectCodexPromptEvidenceGroups {
  const groups = emptyEvidenceGroups();

  dedupePromptRows(rows).forEach((row) => {
    groups[classifyEvidenceRow(row, input)].push(row);
  });

  return {
    passing: dedupePromptRows(groups.passing),
    failed: dedupePromptRows(groups.failed),
    missing: dedupePromptRows(groups.missing),
    conflicting: dedupePromptRows(groups.conflicting),
    notInspected: dedupePromptRows(groups.notInspected)
  };
}

function groupedEvidenceSection(title: string, rows: string[]) {
  return [
    `${title}:`,
    ...(rows.length ? rows.map((row) => `- ${row}`) : ["- None."])
  ];
}

function buildRootCauseDiagnosis(
  input: ArchitectCodexRepairPromptInput,
  evidenceGroups: ArchitectCodexPromptEvidenceGroups
) {
  const hasFailed = evidenceGroups.failed.length > 0;
  const hasMissing = evidenceGroups.missing.length > 0 || evidenceGroups.notInspected.length > 0;
  const hasConflict = evidenceGroups.conflicting.length > 0;

  if (input.currentStatus === "Pass") {
    return [
      `${input.exactIssue} is not currently diagnosed as failed because connected evidence reports Pass.`,
      "Keep the workflow under read-only monitoring and do not create repair work unless new evidence changes."
    ].join(" ");
  }

  if (isPaymentHealthPrompt(input)) {
    const firstSentence = hasFailed
      ? "Payment Health is failing because completed/captured money evidence is not reconciled to a payment routing record."
      : "Payment Health cannot be marked Pass because required appointment, payment, status history, routing, or payout-guard evidence is missing or uninspected.";
    const conflictSentence = hasConflict
      ? "Captured payments attached to cancelled appointments are a separate conflict path and must be investigated separately."
      : "If any captured payment is attached to a cancelled appointment, treat it as a separate conflict path from completed/captured appointment routing.";

    return [
      firstSentence,
      "The repair target is server-side routing creation/reconciliation after payment capture and appointment completion, not UI display logic.",
      conflictSentence,
      "Do not mark this Pass until server, Supabase, Stripe, and ledger evidence prove routing and payout-guard truth."
    ].join(" ");
  }

  if (hasConflict) {
    return [
      `${input.exactIssue} has conflicting evidence in the ${input.affectedFlow} flow.`,
      "Resolve the conflict at the source-of-truth layer before changing UI state or checklist status.",
      "Keep failed or missing evidence visible until validation proves the workflow is safe."
    ].join(" ");
  }

  if (hasFailed) {
    return [
      `${input.exactIssue} is failing because required ${input.affectedFlow} evidence is not all passing.`,
      "Inspect the grouped failure evidence first and repair the primary source-of-truth path before changing any UI.",
      "Keep the issue Failed until validation proves the failed invariant has been repaired."
    ].join(" ");
  }

  if (hasMissing) {
    return [
      `${input.exactIssue} cannot be marked Pass because required evidence is missing or has not been inspected.`,
      "Connect and verify the source-of-truth evidence before changing checklist status.",
      "Missing data remains Needs Review / Not connected."
    ].join(" ");
  }

  return [
    `${input.exactIssue} needs diagnosis from connected evidence before repair work starts.`,
    "Inspect the owning workflow source of truth and keep the status unchanged until validation is complete."
  ].join(" ");
}

function firstInspectionStep(input: ArchitectCodexRepairPromptInput) {
  if (isPaymentHealthPrompt(input)) {
    return "Inspect the completed appointment with captured payment and missing routing record. Do not start by editing UI.";
  }

  return `Inspect the source-of-truth evidence for ${input.exactIssue}. Do not start by editing UI.`;
}

function separateConflictPath(input: ArchitectCodexRepairPromptInput) {
  if (input.lane.toLowerCase() === "finance") {
    return "Captured payments attached to cancelled appointments must be investigated separately from completed/captured appointment routing.";
  }

  return "Conflicting evidence must be investigated separately from the primary repair path.";
}

export function buildArchitectCodexRepairPrompt(input: ArchitectCodexRepairPromptInput) {
  const evidenceGroups = groupArchitectCodexPromptEvidence(input.evidence, input);
  const moneyRules = dedupePromptRows(input.moneyRules ?? []);
  const bookingRules = dedupePromptRows(input.bookingRules ?? []);
  const rootCauseHypothesis = buildRootCauseDiagnosis(input, evidenceGroups);

  return [
    `BVRB3R V1 CODEX REPAIR PROMPT - ${input.exactIssue}`,
    "",
    "Exact goal:",
    input.exactGoal,
    "",
    "Exact issue:",
    `- Exact issue name: ${input.exactIssue}`,
    `- Lane: ${input.lane}`,
    `- Affected role: ${input.affectedRole}`,
    `- Affected flow: ${input.affectedFlow}`,
    `- Current status: ${input.currentStatus}`,
    `- Severity / criticality: ${input.severity}`,
    "",
    "Current truth:",
    input.currentTruth,
    "",
    ...bulletSection("V1 Codex Prompt Doctrine", V1_DOCTRINE),
    "",
    "Evidence groups:",
    ...groupedEvidenceSection("Passing evidence", evidenceGroups.passing),
    "",
    ...groupedEvidenceSection("Failed evidence", evidenceGroups.failed),
    "",
    ...groupedEvidenceSection("Missing evidence", evidenceGroups.missing),
    "",
    ...groupedEvidenceSection("Conflicting evidence", evidenceGroups.conflicting),
    "",
    ...groupedEvidenceSection("Not inspected yet", evidenceGroups.notInspected),
    "",
    "Root-cause hypothesis:",
    rootCauseHypothesis,
    "",
    "Primary repair target:",
    input.primaryRepairTarget,
    "",
    "First inspection step:",
    firstInspectionStep(input),
    "",
    "Separate conflict path:",
    separateConflictPath(input),
    "",
    ...bulletSection("Files / areas to inspect", input.filesToInspect),
    "",
    ...bulletSection("Role and permission rules", input.rolePermissionRules),
    "",
    ...bulletSection("Data / source-of-truth rules", input.dataSourceTruthRules),
    "",
    ...bulletSection("Action rules", input.actionRules),
    "",
    ...(moneyRules.length ? [...bulletSection("Money rules", moneyRules), ""] : []),
    ...(bookingRules.length ? [...bulletSection("Booking lifecycle rules", bookingRules), ""] : []),
    ...bulletSection("Do not touch", input.doNotTouch),
    "",
    ...bulletSection("Acceptance criteria", input.acceptanceCriteria),
    "",
    ...bulletSection("Required validation", input.requiredValidation),
    "",
    ...bulletSection("Tests to run", input.testsToRun),
    "",
    ...bulletSection("Typecheck / build requirements", STANDARD_TYPECHECK_BUILD_REQUIREMENTS),
    "",
    "Do not mark Pass until:",
    "- Real evidence changes after code fix, deploy, and production validation.",
    "- Required tests pass.",
    "- Typecheck passes.",
    "- Build passes.",
    "- No fake data or fake Pass state was introduced.",
    "",
    ...bulletSection("Final report format", STANDARD_FINAL_REPORT_FORMAT),
    "",
    ...bulletSection("Dirty files untouched rule", STANDARD_DIRTY_FILES_RULES)
  ].join("\n");
}
