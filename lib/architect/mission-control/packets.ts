import type { ArchitectIncident, MissionControlSnapshot } from "@/lib/architect/mission-control/types";

type PacketEnvironment = Pick<MissionControlSnapshot, "checkedAt" | "environment">;

function evidenceLines(incident: ArchitectIncident) {
  return incident.evidence.map((item) => `- ${item}`).join("\n");
}

function sqlLines(incident: ArchitectIncident) {
  if (!incident.sqlSnippets.length) return "- No SQL snippets generated for this incident.";
  return incident.sqlSnippets.map((snippet) => `${snippet.label}\n${snippet.sql}`).join("\n\n");
}

export function buildChatGptPacket(snapshot: PacketEnvironment, incident: ArchitectIncident) {
  return [
    "DEBUG TYPE",
    "BVRB3R Mission Control Incident",
    "",
    "INCIDENT ID",
    incident.id,
    "",
    "HEALTH",
    incident.severity,
    "",
    "DIAGNOSIS",
    incident.diagnosisCode,
    "",
    "AFFECTED ENTITY",
    incident.affectedEntity,
    "",
    "AFFECTED ROUTE",
    incident.affectedRoute ?? "not route-specific",
    "",
    "AFFECTED TABLE",
    incident.affectedTable ?? "not table-specific",
    "",
    "PRODUCTION EVIDENCE",
    evidenceLines(incident),
    "",
    "VALIDATION FAILURES",
    `- ${incident.analysis.failedInvariant}`,
    "",
    "SAFE REPAIR RESULT",
    incident.canRepair ? `Safe repair available: ${incident.repairType}` : "No safe repair is currently available.",
    "",
    "RUNTIME ERROR",
    incident.analysis.supportingEvidence.join("\n"),
    "",
    "SCHEMA EVIDENCE",
    incident.diagnosisCode === "schema_constraint_mismatch"
      ? "A production check constraint rejected the attempted routing status value."
      : "No schema mismatch was selected as the primary diagnosis.",
    "",
    "CURRENT DEPLOYMENT",
    `environment=${snapshot.environment.appEnv}`,
    `commit=${snapshot.environment.commitHash ?? "unknown"}`,
    `deployment=${snapshot.environment.deploymentId ?? "unknown"}`,
    `branch=${snapshot.environment.branch ?? "unknown"}`,
    `checkedAt=${snapshot.checkedAt}`,
    "",
    "RECOMMENDED NEXT ACTION",
    incident.analysis.nextBestAction
  ].join("\n");
}

export function buildCodexPacket(snapshot: PacketEnvironment, incident: ArchitectIncident) {
  return [
    `TITLE\nBVRB3R ${incident.diagnosisCode.toUpperCase()} FIX`,
    `PROBLEM\n${incident.headline}`,
    `PRODUCTION EVIDENCE\n${evidenceLines(incident)}`,
    `ROOT CAUSE\n${incident.analysis.likelyRootCause}`,
    [
      "DO NOT TOUCH",
      "- booking creation",
      "- Stripe booking charge",
      "- client discovery",
      "- client activity read",
      "- barber calendar read",
      "- appointment details UI unless the incident specifically says UI"
    ].join("\n"),
    [
      "FILES TO INSPECT",
      "- lib/architect/repairs/payment-routing-repair.ts",
      "- lib/architect/mission-control/schema-constraints.ts",
      "- lib/architect/debug/diagnosis.ts",
      "- app/api/architect/repairs/payment-routing/route.ts",
      "- tests/unit/architect-routing-repair.spec.ts"
    ].join("\n"),
    [
      "REQUIRED FIX",
      incident.canRepair
        ? `Make the ${incident.repairType} path use production-legal schema values and audit the repair.`
        : "Implement the smallest code patch that restores the failed invariant."
    ].join("\n"),
    [
      "SCHEMA CONSTRAINTS",
      "- payment_routing_records uses decimal money fields, not cents fields",
      "- payout_readiness_status may use DB value ready for business meaning eligible",
      "- money_routing_status should remain pending for no-release completion state",
      "- do not release payout from repair or completion"
    ].join("\n"),
    [
      "TESTS REQUIRED",
      "- architect routing repair uses production-legal constraint values",
      "- completed paid appointment missing routing is detected",
      "- schema constraint mismatch generates a Codex-ready packet",
      "- core booking loop regression still passes",
      "- payout completion flow still passes"
    ].join("\n"),
    [
      "VALIDATION COMMANDS",
      "npm run typecheck",
      "npx vitest run tests/unit/architect-routing-repair.spec.ts tests/unit/architect-incident-detection.spec.ts tests/unit/architect-schema-constraint-debug.spec.ts",
      "npx vitest run tests/unit/core-booking-loop-regression.spec.ts tests/unit/payout-completion-flow.spec.ts tests/unit/barber-schedule-workspace.spec.tsx",
      "npm run build"
    ].join("\n"),
    `EXPECTED RESULT\n${incident.analysis.failedInvariant} is restored without touching unrelated booking/payment surfaces.`,
    [
      "FINAL REPORT FORMAT",
      "- files changed",
      "- routes updated",
      "- tests run",
      "- production appointment detection/repair/validation result",
      `- deployment fingerprint: ${snapshot.environment.commitHash ?? "unknown"}`
    ].join("\n")
  ].join("\n\n");
}

export function buildIncidentPacket(snapshot: PacketEnvironment, incident: ArchitectIncident) {
  return JSON.stringify({
    incident,
    deployment: snapshot.environment,
    checkedAt: snapshot.checkedAt,
    sqlSnippets: incident.sqlSnippets,
    recommendedAction: incident.recommendedAction
  }, null, 2);
}

export function buildMissionPacketLabels() {
  return {
    chatGpt: "Copy ChatGPT Packet",
    codex: "Copy Codex Packet",
    incident: "Copy Incident Packet"
  };
}

export { sqlLines };
