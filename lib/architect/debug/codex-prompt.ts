import type { ArchitectDebugPacket } from "@/lib/architect/debug/types";

function formatFacts(facts: string[]) {
  if (!facts.length) return "- No supporting facts were collected.";
  return facts.map((fact) => `- ${fact}`).join("\n");
}

export function generateCodexPromptFromDebugPacket(packet: ArchitectDebugPacket) {
  const appointmentId = packet.entities.appointment?.id ?? packet.targetId;
  const payment = packet.entities.payment;
  const routing = packet.entities.routing;

  return [
    `BVRB3R ${packet.summary.diagnosisCode.toUpperCase()} FIX`,
    "",
    "Production evidence:",
    `- Debug type: ${packet.debugType}`,
    `- Target: ${packet.targetType} ${packet.targetId}`,
    `- Health: ${packet.summary.health}`,
    `- Diagnosis: ${packet.summary.diagnosisCode}`,
    `- Headline: ${packet.summary.headline}`,
    "",
    "Exact IDs:",
    `- appointment_id = ${appointmentId ?? "unknown"}`,
    `- payment_id = ${payment?.id ?? "missing"}`,
    `- routing_id = ${routing?.id ?? "missing"}`,
    "",
    "Expected behavior:",
    "- Completed paid appointments must have a payment_routing_records row.",
    "- Completion makes payout eligible only; it must not release payout.",
    "- Freelance routing uses shop_split_amount = 0 and released_at = null.",
    "",
    "Actual behavior:",
    `- ${packet.summary.headline}`,
    "",
    "Database truth:",
    formatFacts(packet.diagnosis.supportingFacts),
    "",
    "Diagnosis:",
    `- Root cause: ${packet.diagnosis.likelyRootCause}`,
    `- Affected layer: ${packet.diagnosis.affectedLayer}`,
    `- Failed invariant: ${packet.diagnosis.failedInvariant}`,
    "",
    "Do not touch:",
    "- booking creation",
    "- Stripe booking charge",
    "- appointment lifecycle update",
    "- client discovery",
    "- client activity read",
    "- barber calendar read",
    "",
    "Files to inspect:",
    "- lib/fintech/service.ts",
    "- lib/architect/repairs/payment-routing-repair.ts",
    "- app/api/architect/repairs/payment-routing/route.ts",
    "",
    "Required fix:",
    `- Repair diagnosis code ${packet.summary.diagnosisCode}.`,
    "- Use production payment_routing_records columns only.",
    "- Lookup routing by appointment_id.",
    "- Accept captured/succeeded/paid/completed payment statuses from status or payment_status.",
    "",
    "Tests required:",
    "- architect-routing-repair.spec.ts",
    "- architect-debug-appointment.spec.ts",
    "- payout-completion-flow.spec.ts",
    "- core-booking-loop-regression.spec.ts",
    "",
    "Validation commands:",
    "- npm run typecheck",
    "- targeted ESLint on touched files",
    "- npx vitest run tests/unit/architect-debug-appointment.spec.ts tests/unit/architect-routing-repair.spec.ts tests/unit/payout-completion-flow.spec.ts",
    "- npm run build",
    "",
    "Final report:",
    "- commit hash",
    "- files changed",
    "- proof focused tests passed",
    "- proof build passed"
  ].join("\n");
}
