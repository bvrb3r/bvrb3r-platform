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

function conciseStatement(value: string, maxLength = 320) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function bulletSection(title: string, rows: string[]) {
  const safeRows = dedupePromptRows(rows);
  return [
    `${title}:`,
    ...(safeRows.length ? safeRows.map((row) => `- ${row}`) : ["- Not connected."])
  ];
}

export function buildArchitectCodexRepairPrompt(input: ArchitectCodexRepairPromptInput) {
  const evidence = dedupePromptRows(input.evidence);
  const moneyRules = dedupePromptRows(input.moneyRules ?? []);
  const bookingRules = dedupePromptRows(input.bookingRules ?? []);
  const rootCauseHypothesis = conciseStatement(input.rootCauseHypothesis);

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
    "Evidence group - current issue evidence:",
    ...(evidence.length ? evidence.map((row) => `- ${row}`) : ["- Not connected."]),
    "",
    "Root-cause hypothesis:",
    rootCauseHypothesis,
    "",
    "Primary repair target:",
    input.primaryRepairTarget,
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
