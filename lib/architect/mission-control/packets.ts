import type { ArchitectIncident, MissionControlSnapshot } from "@/lib/architect/mission-control/types";
import { getCodexFailureClass } from "@/lib/architect/mission-control/foundation";

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
  const failureClass = getCodexFailureClass(incident.diagnosisCode);
  return [
    `TITLE\nBVRB3R ${failureClass.label.toUpperCase()} FIX`,
    `PROBLEM\n${incident.headline}`,
    `PRODUCTION EVIDENCE\n${evidenceLines(incident)}`,
    `ROOT CAUSE\n${incident.analysis.likelyRootCause}`,
    [
      "AFFECTED DEPARTMENTS",
      ...failureClass.affectedDepartments.map((department) => `- ${department}`)
    ].join("\n"),
    [
      "DO NOT TOUCH",
      ...failureClass.doNotTouch.map((item) => `- ${item}`)
    ].join("\n"),
    [
      "FILES TO INSPECT",
      ...failureClass.affectedFiles.map((item) => `- ${item}`)
    ].join("\n"),
    [
      "AFFECTED TABLES",
      ...(failureClass.affectedTables.length ? failureClass.affectedTables.map((item) => `- ${item}`) : ["- none known"])
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
      ...failureClass.testsRequired.map((item) => `- ${item}`)
    ].join("\n"),
    [
      "VALIDATION COMMANDS",
      ...failureClass.validationRequired.map((item) => `- ${item}`)
    ].join("\n"),
    `EXPECTED RESULT\n${incident.analysis.failedInvariant} is restored without touching unrelated surfaces.`,
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
