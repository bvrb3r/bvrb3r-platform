import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPaymentSuccessful, numberValue, roundMoney } from "@/lib/architect/debug/diagnosis";
import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";
import type { ArchitectActor, JsonRecord } from "@/lib/architect/debug/types";
import { buildAppointmentSqlSnippets } from "@/lib/architect/debug/sql-snippets";
import type { DeploymentRuntimeEvidence } from "@/lib/architect/mission-control/deployment-evidence";
import {
  isPayoutReadinessEligible,
  loadPaymentRoutingConstraintEvidence,
  paymentRoutingConstraintEvidenceToJson
} from "@/lib/architect/mission-control/schema-constraints";
import type {
  ArchitectIncident,
  FinanceRoutingEvidenceSummary,
  FinanceLogEntry,
  FinanceRefundMetrics,
  FinanceRefundTarget,
  MissionControlHealthItem,
  MissionControlSnapshot,
  MissionControlStatus,
  MissionEvidenceCard,
  MissionFinanceEvidence,
  MissionPacketSet
} from "@/lib/architect/mission-control/types";
import { buildChatGptPacket, buildCodexPacket, buildIncidentPacket } from "@/lib/architect/mission-control/packets";
import { buildDeploymentRegressionEvidence, buildMissionControlFoundation, buildRoleTruthInventory, classifyArchitectIncident } from "@/lib/architect/mission-control/foundation";
import { buildProductOperationsRuntimeLoopProofFixture } from "@/lib/architect/mission-control/runtime-loop-proof";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function fallbackDeploymentRuntimeEvidence(checkedAt: string): DeploymentRuntimeEvidence {
  const debugEnvironment = readArchitectDebugEnvironment();
  const expectedMainCommit = process.env.BVRB3R_EXPECTED_MAIN_COMMIT
    ?? process.env.NEXT_PUBLIC_EXPECTED_MAIN_COMMIT
    ?? null;
  const deploymentUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : null;
  const deploymentStatus = process.env.BVRB3R_DEPLOYMENT_STATUS
    ?? process.env.NEXT_PUBLIC_DEPLOYMENT_STATUS
    ?? null;
  const lastValidatedAt = process.env.BVRB3R_LAST_VALIDATED_AT
    ?? process.env.NEXT_PUBLIC_LAST_VALIDATED_AT
    ?? null;
  const environment = {
    ...debugEnvironment,
    expectedMainCommit,
    expectedMainCommitSource: expectedMainCommit ? "explicit environment metadata" : "not connected",
    deploymentUrl,
    deploymentStatus,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? null,
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? process.env.BUILD_TIME ?? null,
    lastValidatedAt
  };

  return {
    checkedAt,
    environment,
    validationProofConnected: false,
    validationProofFilePresent: false,
    validationProofFileState: "missing",
    evidenceInput: {
      expectedMainCommit: environment.expectedMainCommit,
      runtimeCommit: environment.commitHash,
      deploymentId: environment.deploymentId,
      deploymentEnvironment: environment.appEnv,
      deploymentTarget: environment.appEnv,
      deploymentUrl: environment.deploymentUrl,
      deploymentState: environment.deploymentStatus,
      buildEvidenceStatus: process.env.BVRB3R_BUILD_EVIDENCE_STATUS ?? process.env.NEXT_PUBLIC_BUILD_EVIDENCE_STATUS ?? null,
      lintEvidenceStatus: process.env.BVRB3R_LINT_EVIDENCE_STATUS ?? process.env.NEXT_PUBLIC_LINT_EVIDENCE_STATUS ?? null,
      typecheckEvidenceStatus: process.env.BVRB3R_TYPECHECK_EVIDENCE_STATUS ?? process.env.NEXT_PUBLIC_TYPECHECK_EVIDENCE_STATUS ?? null,
      testEvidenceStatus: process.env.BVRB3R_TEST_EVIDENCE_STATUS ?? process.env.NEXT_PUBLIC_TEST_EVIDENCE_STATUS ?? null,
      validationTimestamp: lastValidatedAt,
      lastValidatedAt,
      verifiedAt: checkedAt,
      evidenceSource: "fallback runtime environment metadata; generated deployment proof not supplied",
      evidenceFreshness: "missing",
      proofConnected: false
    }
  };
}

const MISSION_SYSTEMS: Array<{ key: MissionControlHealthItem["key"]; label: string; healthySummary: string }> = [
  { key: "bookings", label: "Bookings", healthySummary: "Latest booking loop evidence is clean." },
  { key: "payments", label: "Payments", healthySummary: "Captured payment records are linked." },
  { key: "routing", label: "Routing", healthySummary: "Completed paid appointments have routing." },
  { key: "discovery", label: "Discovery", healthySummary: "Approved bookable barbers have supply signals." },
  { key: "barber_calendar", label: "Barber Calendar", healthySummary: "Calendar visibility has no detected blockers." },
  { key: "client_activity", label: "Client Activity", healthySummary: "Client activity has no detected blockers." },
  { key: "verifications", label: "Verifications", healthySummary: "Verification queues have no detected blockers." },
  { key: "deployments", label: "Deployments", healthySummary: "Deployment metadata is available." },
  { key: "schema_health", label: "Schema Health", healthySummary: "Critical schema checks are readable." },
  { key: "payout_eligibility", label: "Payout Eligibility", healthySummary: "Eligible payout state is internally consistent." }
];

const CANONICAL_PUBLIC_PROFILE_ROLES = ["client_user", "barber_user", "shop_owner_user"] as const;
const PROFILE_ROLE_FIELDS = ["role", "primary_onboarding_role", "user_role", "account_role", "profile_role"] as const;
const INTERNAL_PROFILE_ROLES = ["platform_admin"] as const;
const EXPECTED_SHOP_RELATIONSHIP_TYPES = ["freelance", "booth_rent", "commission"] as const;
const KNOWN_RLS_DISABLED_PUBLIC_TABLE_COUNT = 28;

async function selectRows<T extends JsonRecord>(
  supabase: SupabaseClient,
  table: string,
  options: { column?: string; value?: unknown; orderColumn?: string; limit?: number; optional?: boolean } = {}
) {
  let query = supabase.from(table).select("*");
  if (options.column) query = query.eq(options.column, options.value);
  if (options.orderColumn) query = query.order(options.orderColumn, { ascending: false });
  if (options.limit) query = query.limit(options.limit);

  const result = await query;
  if (result.error) {
    if (options.optional) return [];
    throw result.error;
  }

  return ((result.data ?? []) as unknown as T[]) ?? [];
}

type TableRead = {
  rows: JsonRecord[];
  connected: boolean;
  errorMessage?: string;
};

async function trySelectRows(
  supabase: SupabaseClient,
  table: string,
  options: { column?: string; value?: unknown; orderColumn?: string; limit?: number } = {}
): Promise<TableRead> {
  try {
    return {
      rows: await selectRows<JsonRecord>(supabase, table, options),
      connected: true
    };
  } catch (error) {
    return {
      rows: [],
      connected: false,
      errorMessage: error instanceof Error ? error.message : `${table} could not be read.`
    };
  }
}

function latest<T extends JsonRecord>(rows: T[]) {
  return rows[0] ?? null;
}

function hasCompletedHistory(history: JsonRecord[]) {
  return history.some((row) =>
    String(row.new_status ?? row.status ?? "").toLowerCase() === "completed"
      || String(row.change_reason ?? "").toLowerCase() === "barber_completed_service"
  );
}

function hasRoutingConstraintFailure(audits: JsonRecord[], appointmentId: string) {
  return audits.some((audit) => {
    const targetMatches = String(audit.target_id ?? "") === appointmentId;
    const haystack = [
      audit.error_code,
      audit.error_message_safe,
      audit.postgres_code,
      audit.postgres_details,
      JSON.stringify(audit.payload ?? {})
    ].join(" ").toLowerCase();
    return targetMatches && haystack.includes("payout_readiness_status") && haystack.includes("check");
  });
}

function buildIncident(input: Omit<ArchitectIncident, "id" | "createdAt" | "sqlSnippets"> & { createdAt?: string; sqlSnippets?: ArchitectIncident["sqlSnippets"] }) {
  const id = `${input.diagnosisCode}:${input.targetType}:${input.targetId}`;
  const classification = classifyArchitectIncident(input.diagnosisCode);
  return {
    ...input,
    id,
    missionIncidentType: classification.type,
    affectedDepartment: classification.affectedDepartment,
    affectedWorkflow: classification.affectedWorkflow,
    validationChecklist: input.validationChecklist ?? classification.validationChecklist,
    createdAt: input.createdAt ?? new Date().toISOString(),
    sqlSnippets: input.sqlSnippets ?? (input.targetType === "appointment" ? buildAppointmentSqlSnippets(input.targetId) : [])
  };
}

function appointmentLabel(appointment: JsonRecord) {
  return `appointment ${String(appointment.id ?? "unknown")}`;
}

const APPOINTMENT_SCOPED_PAYMENT_TYPES = new Set(["booking", "tip", "add_on"]);
const FAILED_REFUND_STATUSES = new Set(["failed", "canceled", "cancelled", "void"]);
const FULL_REFUND_PAYMENT_STATUSES = new Set(["refunded", "reversed"]);
const ROUTING_REFUND_STATUSES = new Set(["refunded", "reversed"]);
const CONTROLLED_REFUND_REASON = "Cancelled appointment captured booking payment resolution";
const LEGAL_ROUTING_VALUES = {
  payout_readiness_status: new Set(["not_ready", "needs_attention", "ready", "blocked"]),
  money_routing_status: new Set(["pending", "ready_for_payout", "blocked", "manual_review", "paid_out", "refunded"]),
  routing_model: new Set(["freelance", "commission", "booth_rent"]),
  payout_recipient_type: new Set(["barber", "shop", "split"]),
  reconciliation_status: new Set(["open", "settled", "partially_reversed", "reversed", "manual_review"])
};

function isAppointmentScopedPayment(payment: JsonRecord) {
  const paymentType = String(payment.payment_type ?? payment.type ?? "").toLowerCase();
  return APPOINTMENT_SCOPED_PAYMENT_TYPES.has(paymentType);
}

function paymentAmountValue(payment: JsonRecord) {
  const amount = numberValue(payment.amount ?? payment.total_amount ?? payment.gross_amount);
  if (amount > 0) return amount;
  return numberValue(payment.amount_cents ?? payment.total_amount_cents ?? payment.gross_amount_cents) / 100;
}

function refundAmountValue(refund: JsonRecord) {
  const amount = numberValue(refund.amount ?? refund.refund_amount ?? refund.amount_refunded ?? refund.refunded_amount);
  if (amount > 0) return amount;
  return numberValue(refund.amount_cents ?? refund.refund_amount_cents ?? refund.amount_refunded_cents ?? refund.refunded_amount_cents) / 100;
}

function isRefundRowUsable(row: JsonRecord) {
  return !FAILED_REFUND_STATUSES.has(String(row.status ?? row.refund_status ?? "").toLowerCase());
}

function rowReferencesPayment(row: JsonRecord, paymentId: string) {
  return [row.payment_id, row.source_payment_id, row.original_payment_id].map(String).includes(paymentId);
}

function sumUsableRefundAmount(paymentId: string, refundRows: JsonRecord[]) {
  return refundRows
    .filter((row) => rowReferencesPayment(row, paymentId) && isRefundRowUsable(row))
    .reduce((total, row) => total + refundAmountValue(row), 0);
}

function routingHasRefundSupport(routing: JsonRecord | null, paymentAmount: number) {
  if (!routing) return false;
  const routingRefundAmount = numberValue(routing.refund_amount ?? routing.refunded_amount ?? routing.reversal_amount ?? routing.reversed_amount);
  const routingRefundCents = numberValue(routing.refund_amount_cents ?? routing.refunded_amount_cents ?? routing.reversal_amount_cents ?? routing.reversed_amount_cents) / 100;
  const amount = routingRefundAmount > 0 ? routingRefundAmount : routingRefundCents;
  if (paymentAmount > 0 && amount >= paymentAmount) return true;

  return Boolean(
    routing.refund_id
      || routing.provider_refund_id
      || routing.refund_reference
      || routing.reversal_id
      || routing.provider_reversal_id
      || routing.refunded_at
      || routing.reversed_at
  );
}

function hasRefundOrReversalEvidence(payment: JsonRecord, refundRows: JsonRecord[], routing: JsonRecord | null) {
  const paymentId = String(payment.id ?? "");
  const paymentStatus = String(payment.status ?? payment.payment_status ?? "").toLowerCase();
  const refundedAmount = numberValue(payment.refunded_amount ?? payment.amount_refunded);
  const paymentAmount = paymentAmountValue(payment);
  const refundAmount = sumUsableRefundAmount(paymentId, refundRows);
  const routingResolved = ROUTING_REFUND_STATUSES.has(String(routing?.money_routing_status ?? "").toLowerCase())
    || ROUTING_REFUND_STATUSES.has(String(routing?.reconciliation_status ?? "").toLowerCase());

  return FULL_REFUND_PAYMENT_STATUSES.has(paymentStatus)
    || (paymentAmount > 0 && refundedAmount >= paymentAmount)
    || (paymentAmount > 0 && refundAmount >= paymentAmount)
    || (routingResolved && routingHasRefundSupport(routing, paymentAmount));
}

function rawString(value: unknown) {
  return String(value ?? "");
}

function refundTimestamp(row: JsonRecord) {
  return rawString(row.refunded_at ?? row.created_at ?? row.updated_at);
}

function eventPayload(row: JsonRecord) {
  return (row.payload && typeof row.payload === "object" ? row.payload : {}) as JsonRecord;
}

function eventRelatedIds(row: JsonRecord) {
  return (row.related_ids && typeof row.related_ids === "object" ? row.related_ids : {}) as JsonRecord;
}

function routingStateLabel(routing: JsonRecord | null) {
  if (!routing) return "routing unavailable";
  return [
    stringValue(routing.payout_readiness_status || "unknown"),
    stringValue(routing.money_routing_status || "unknown"),
    stringValue(routing.reconciliation_status || "unknown")
  ].join("/");
}

function findMatchingRefundEvent(events: JsonRecord[], paymentId: string, refundId: string | null) {
  return events.find((event) => {
    const payload = eventPayload(event);
    const related = eventRelatedIds(event);
    const eventPaymentId = stringValue(event.entity_id ?? event.payment_id ?? payload.paymentId ?? related.paymentId);
    const eventRefundId = stringValue(event.refund_id ?? payload.refundId ?? related.refundId);
    return stringValue(event.event_type) === "payment_refunded"
      && eventPaymentId === paymentId
      && (!refundId || eventRefundId === refundId);
  }) ?? events.find((event) =>
    stringValue(event.event_type) === "payment_refunded"
      && stringValue(event.entity_id ?? event.payment_id ?? eventPayload(event).paymentId ?? eventRelatedIds(event).paymentId) === paymentId
  ) ?? null;
}

function findMatchingAdminAudit(audits: JsonRecord[], paymentId: string, refundId: string | null) {
  return audits.find((audit) => {
    const metadata = (audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {}) as JsonRecord;
    return stringValue(audit.target_id) === paymentId
      && (!refundId || stringValue(metadata.refundId) === refundId);
  }) ?? audits.find((audit) => stringValue(audit.target_id) === paymentId) ?? null;
}

function buildRefundLog(input: {
  refund: JsonRecord;
  payment: JsonRecord | null;
  appointment: JsonRecord | null;
  routing: JsonRecord | null;
  events: JsonRecord[];
  audits: JsonRecord[];
}): FinanceLogEntry {
  const paymentId = stringValue(input.refund.payment_id ?? input.refund.source_payment_id ?? input.payment?.id) || null;
  const refundId = stringValue(input.refund.id) || null;
  const event = paymentId ? findMatchingRefundEvent(input.events, paymentId, refundId) : null;
  const audit = paymentId ? findMatchingAdminAudit(input.audits, paymentId, refundId) : null;
  const payload = event ? eventPayload(event) : {};
  const auditMetadata = audit?.metadata && typeof audit.metadata === "object" ? audit.metadata as JsonRecord : {};

  return {
    id: refundId ? `refund:${refundId}` : `refund:${paymentId ?? "unknown"}:${refundTimestamp(input.refund)}`,
    category: "refund",
    paymentId,
    appointmentId: stringValue(input.refund.appointment_id ?? input.payment?.appointment_id ?? input.appointment?.id ?? payload.appointmentId ?? auditMetadata.appointmentId) || null,
    refundId,
    providerRefundId: stringValue(input.refund.provider_refund_id ?? input.refund.stripe_refund_id ?? input.refund.processor_refund_id ?? payload.providerRefundId) || null,
    amount: refundAmountValue(input.refund) || numberValue(payload.amount),
    reason: rawString(input.refund.reason ?? input.refund.refund_reason ?? payload.reason ?? auditMetadata.reason) || null,
    actorId: stringValue(event?.actor_id ?? audit?.actor_user_id ?? payload.actorId ?? auditMetadata.actorId) || null,
    actorRole: stringValue(event?.actor_role ?? audit?.actor_role ?? payload.actorRole ?? auditMetadata.actorRole) || null,
    source: stringValue(payload.source ?? auditMetadata.source ?? event?.source ?? input.refund.source) || null,
    timestamp: refundTimestamp(input.refund) || rawString(event?.occurred_at ?? audit?.created_at) || null,
    resultStatus: stringValue(input.refund.status ?? input.refund.refund_status ?? payload.result) || "succeeded",
    failureReason: null,
    routingState: routingStateLabel(input.routing)
  };
}

function buildFailedRefundLog(event: JsonRecord): FinanceLogEntry {
  const payload = eventPayload(event);
  const related = eventRelatedIds(event);
  const paymentId = stringValue(event.entity_id ?? event.payment_id ?? payload.paymentId ?? related.paymentId) || null;

  return {
    id: `failed-refund:${stringValue(event.id ?? event.idempotency_key ?? paymentId ?? event.occurred_at)}`,
    category: "failed_refund",
    paymentId,
    appointmentId: stringValue(payload.appointmentId ?? related.appointmentId) || null,
    refundId: stringValue(payload.refundId) || null,
    providerRefundId: null,
    amount: numberValue(payload.amount) || null,
    reason: rawString(payload.reason) || null,
    actorId: stringValue(event.actor_id ?? payload.actorId) || null,
    actorRole: stringValue(event.actor_role ?? payload.actorRole) || null,
    source: stringValue(payload.source ?? related.source ?? event.source) || null,
    timestamp: rawString(event.occurred_at ?? event.created_at) || null,
    resultStatus: "failed",
    failureReason: rawString(payload.safeMessage ?? payload.error ?? event.error_message_safe) || "Refund attempt failed.",
    routingState: null
  };
}

function buildRoutingLog(row: JsonRecord, category: "payout_block" | "manual_review"): FinanceLogEntry {
  return {
    id: `${category}:${stringValue(row.id ?? row.payment_id ?? row.appointment_id)}`,
    category,
    paymentId: stringValue(row.payment_id) || null,
    appointmentId: stringValue(row.appointment_id) || null,
    refundId: stringValue(row.refund_id) || null,
    providerRefundId: stringValue(row.provider_refund_id) || null,
    amount: null,
    reason: rawString(row.blocked_reason) || (category === "payout_block" ? "Payout remains blocked." : "Routing remains in manual review."),
    actorId: null,
    actorRole: null,
    source: "payment_routing_records",
    timestamp: rawString(row.updated_at ?? row.created_at ?? row.held_at) || null,
    resultStatus: category === "payout_block" ? "blocked" : "manual_review",
    failureReason: category === "payout_block" ? rawString(row.blocked_reason) || "Payout readiness is blocked." : null,
    routingState: routingStateLabel(row)
  };
}

function sortLogs(logs: FinanceLogEntry[]) {
  return [...logs].sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
}

function paymentRoutingFor(
  payment: JsonRecord,
  appointment: JsonRecord | null,
  routingByPaymentId: Map<string, JsonRecord>,
  routingByAppointmentId: Map<string, JsonRecord>
) {
  return routingByPaymentId.get(stringValue(payment.id))
    ?? (appointment ? routingByAppointmentId.get(stringValue(appointment.id)) : undefined)
    ?? null;
}

function routingRowsFor(
  payment: JsonRecord,
  appointment: JsonRecord | null,
  routingRecords: JsonRecord[]
) {
  const paymentId = stringValue(payment.id);
  const appointmentId = appointment ? stringValue(appointment.id) : stringValue(payment.appointment_id);
  return routingRecords.filter((row) =>
    stringValue(row.payment_id) === paymentId
      || (appointmentId && stringValue(row.appointment_id) === appointmentId)
  );
}

function payoutExecutionsFor(payment: JsonRecord, appointment: JsonRecord | null, routing: JsonRecord | null, payoutExecutions: JsonRecord[]) {
  const paymentId = stringValue(payment.id);
  const appointmentId = appointment ? stringValue(appointment.id) : stringValue(payment.appointment_id);
  const routingId = routing ? stringValue(routing.id) : "";

  return payoutExecutions.filter((row) =>
    [row.payment_id, row.appointment_id, row.routing_id, row.routing_record_id, row.payment_routing_record_id]
      .map((value) => stringValue(value))
      .some((value) => value === paymentId || (appointmentId && value === appointmentId) || (routingId && value === routingId))
  );
}

function isBookingPayment(payment: JsonRecord) {
  return String(payment.payment_type ?? payment.type ?? "").toLowerCase() === "booking";
}

function isCapturedLikePayment(payment: JsonRecord) {
  const status = String(payment.status ?? payment.payment_status ?? "").toLowerCase();
  return ["captured", "succeeded", "paid", "completed", "partially_refunded"].includes(status);
}

function isRefundedLikePayment(payment: JsonRecord) {
  const status = String(payment.status ?? payment.payment_status ?? "").toLowerCase();
  return ["refunded", "reversed"].includes(status);
}

function hasIllegalRoutingStatusValue(routing: JsonRecord | null) {
  if (!routing) return false;

  return !LEGAL_ROUTING_VALUES.payout_readiness_status.has(stringValue(routing.payout_readiness_status))
    || !LEGAL_ROUTING_VALUES.money_routing_status.has(stringValue(routing.money_routing_status))
    || !LEGAL_ROUTING_VALUES.routing_model.has(stringValue(routing.routing_model))
    || !LEGAL_ROUTING_VALUES.payout_recipient_type.has(stringValue(routing.payout_recipient_type))
    || !LEGAL_ROUTING_VALUES.reconciliation_status.has(stringValue(routing.reconciliation_status));
}

function isCancelledRefundedSafeTarget(input: {
  payment: JsonRecord;
  appointment: JsonRecord;
  routing: JsonRecord | null;
  refunds: JsonRecord[];
  payoutExecutionCount: number;
}) {
  return ["cancelled", "canceled"].includes(stringValue(input.appointment.status))
    && isRefundedLikePayment(input.payment)
    && Boolean(input.routing)
    && hasRefundOrReversalEvidence(input.payment, input.refunds, input.routing)
    && !input.routing?.released_at
    && input.payoutExecutionCount === 0
    && !hasIllegalRoutingStatusValue(input.routing);
}

function buildFinanceRoutingEvidenceSummary(input: {
  appointments: TableRead;
  payments: TableRead;
  refunds: TableRead;
  payoutExecutions: TableRead;
  routingRecords: TableRead;
  routingByPaymentId: Map<string, JsonRecord>;
  routingByAppointmentId: Map<string, JsonRecord>;
}): FinanceRoutingEvidenceSummary {
  const evidenceCurrent = input.appointments.connected
    && input.payments.connected
    && input.refunds.connected
    && input.payoutExecutions.connected
    && input.routingRecords.connected;
  if (!evidenceCurrent) {
    return {
      status: "Needs Review",
      inspectedBookingPaymentRows: 0,
      rowsWithRouting: 0,
      completedCapturedMissingRoutingCount: 0,
      cancelledCapturedMissingRoutingCount: 0,
      cancelledRefundedSafeRowCount: 0,
      targetPayoutExecutionCount: 0,
      broaderPayoutExecutionReviewCount: 0,
      staleTargetCount: 0,
      proposedInsertCount: 0,
      proposedUpdateCount: 0,
      repairNeeded: false,
      repairRouteAvailable: true,
      repairRouteSafeToCall: false,
      illegalStatusValueCount: 0,
      duplicateUnsafeRoutingCount: 0,
      releasedTargetRoutingCount: 0,
      evidenceCurrent: false,
      reason: "Finance routing aggregate cannot be computed because one or more required evidence tables are not connected.",
      evidenceSource: "appointments/payments/refunds/payout_executions/payment_routing_records"
    };
  }

  const appointmentsById = new Map(input.appointments.rows.map((row) => [stringValue(row.id), row]));
  const scopedPayments = input.payments.rows.filter((payment) => {
    if (!isBookingPayment(payment)) return false;
    if (!payment.appointment_id) return false;
    return isCapturedLikePayment(payment) || isRefundedLikePayment(payment);
  });

  let rowsWithRouting = 0;
  let completedCapturedMissingRoutingCount = 0;
  let cancelledCapturedMissingRoutingCount = 0;
  let cancelledRefundedSafeRowCount = 0;
  let targetPayoutExecutionCount = 0;
  let broaderPayoutExecutionReviewCount = 0;
  let illegalStatusValueCount = 0;
  let duplicateUnsafeRoutingCount = 0;
  let releasedTargetRoutingCount = 0;
  let proposedInsertCount = 0;
  let proposedUpdateCount = 0;

  for (const payment of scopedPayments) {
    const appointment = appointmentsById.get(stringValue(payment.appointment_id)) ?? null;
    const appointmentStatus = stringValue(appointment?.status);
    const routing = paymentRoutingFor(payment, appointment, input.routingByPaymentId, input.routingByAppointmentId);
    const allRoutingRows = routingRowsFor(payment, appointment, input.routingRecords.rows);
    const payoutExecutionCount = payoutExecutionsFor(payment, appointment, routing, input.payoutExecutions.rows).length;
    const isCompletedCaptured = appointmentStatus === "completed" && isPaymentSuccessful(payment);
    const isCancelledCaptured = ["cancelled", "canceled"].includes(appointmentStatus) && isCapturedLikePayment(payment) && !isRefundedLikePayment(payment);

    if (routing) rowsWithRouting += 1;
    if (routing && hasIllegalRoutingStatusValue(routing)) illegalStatusValueCount += 1;
    if (allRoutingRows.length > 1) duplicateUnsafeRoutingCount += allRoutingRows.length - 1;

    if (isCompletedCaptured && !routing) {
      completedCapturedMissingRoutingCount += 1;
      proposedInsertCount += 1;
      targetPayoutExecutionCount += payoutExecutionCount;
      continue;
    }

    if (isCancelledCaptured) {
      const hasRefundEvidence = hasRefundOrReversalEvidence(payment, input.refunds.rows, routing);
      if (!routing) {
        cancelledCapturedMissingRoutingCount += 1;
        proposedInsertCount += 1;
        targetPayoutExecutionCount += payoutExecutionCount;
        continue;
      }
      if (!hasRefundEvidence || hasIllegalRoutingStatusValue(routing) || routing.released_at) {
        proposedUpdateCount += 1;
        targetPayoutExecutionCount += payoutExecutionCount;
        if (routing.released_at) releasedTargetRoutingCount += 1;
        continue;
      }
    }

    if (appointment && isCancelledRefundedSafeTarget({
      payment,
      appointment,
      routing,
      refunds: input.refunds.rows,
      payoutExecutionCount
    })) {
      cancelledRefundedSafeRowCount += 1;
      continue;
    }

    if (payoutExecutionCount > 0) broaderPayoutExecutionReviewCount += payoutExecutionCount;
  }

  const staleTargetCount = 0;
  const repairNeeded = proposedInsertCount > 0 || proposedUpdateCount > 0;
  const hasFailure = completedCapturedMissingRoutingCount > 0
    || cancelledCapturedMissingRoutingCount > 0
    || illegalStatusValueCount > 0
    || duplicateUnsafeRoutingCount > 0
    || releasedTargetRoutingCount > 0
    || targetPayoutExecutionCount > 0;
  const status: MissionControlStatus = hasFailure
    ? "Failed"
    : repairNeeded
      ? "Failed"
      : "Pass";
  const reason = repairNeeded
    ? "Current evidence still has payment-routing repair targets; repair route remains gated and should only be called after approval."
    : broaderPayoutExecutionReviewCount > 0
      ? "Routing repair not required. Broader payout executions exist outside stale repair targets and remain a separate Finance review item."
      : "Routing repair not required. Current production evidence has safe routing/refund posture for the payment-routing repair target classes.";

  return {
    status,
    inspectedBookingPaymentRows: scopedPayments.length,
    rowsWithRouting,
    completedCapturedMissingRoutingCount,
    cancelledCapturedMissingRoutingCount,
    cancelledRefundedSafeRowCount,
    targetPayoutExecutionCount,
    broaderPayoutExecutionReviewCount,
    staleTargetCount,
    proposedInsertCount,
    proposedUpdateCount,
    repairNeeded,
    repairRouteAvailable: true,
    repairRouteSafeToCall: repairNeeded,
    illegalStatusValueCount,
    duplicateUnsafeRoutingCount,
    releasedTargetRoutingCount,
    evidenceCurrent,
    reason,
    evidenceSource: "appointments/payments/refunds/payout_executions/payment_routing_records"
  };
}

function buildActiveRefundTargets(
  incidents: ArchitectIncident[],
  paymentsById: Map<string, JsonRecord>,
  appointmentsById: Map<string, JsonRecord>,
  routingByPaymentId: Map<string, JsonRecord>,
  routingByAppointmentId: Map<string, JsonRecord>
): FinanceRefundTarget[] {
  return incidents
    .filter((incident) => incident.diagnosisCode === "cancelled_captured_refund_missing")
    .map((incident) => {
      const payment = paymentsById.get(incident.targetId);
      const appointmentId = stringValue(payment?.appointment_id ?? incident.analysis.supportingEvidence.find((item) => item.startsWith("appointmentId="))?.replace("appointmentId=", ""));
      const appointment = appointmentId ? appointmentsById.get(appointmentId) : null;
      const routing = (payment ? routingByPaymentId.get(stringValue(payment.id)) : null) ?? (appointmentId ? routingByAppointmentId.get(appointmentId) : null) ?? null;
      const amount = payment ? paymentAmountValue(payment) : 5;

      if (!payment || amount !== 5) return null;

      return {
        appointmentId: appointmentId || stringValue(appointment?.id) || "unknown",
        paymentId: stringValue(payment.id),
        amount,
        reason: CONTROLLED_REFUND_REASON,
        currentRoutingState: `${routingStateLabel(routing)}, released_at ${routing?.released_at ? "set" : "null"}, payout_executions target count must remain 0`
      } satisfies FinanceRefundTarget;
    })
    .filter((target): target is FinanceRefundTarget => Boolean(target));
}

async function buildFinanceEvidence(supabase: SupabaseClient, incidents: ArchitectIncident[]): Promise<MissionFinanceEvidence> {
  const [appointments, payments, refunds, payoutExecutions, routingRecords, platformEvents, adminAudits] = await Promise.all([
    trySelectRows(supabase, "appointments", { limit: 10000 }),
    trySelectRows(supabase, "payments", { limit: 10000 }),
    trySelectRows(supabase, "refunds", { orderColumn: "created_at", limit: 10000 }),
    trySelectRows(supabase, "payout_executions", { orderColumn: "created_at", limit: 10000 }),
    trySelectRows(supabase, "payment_routing_records", { orderColumn: "updated_at", limit: 10000 }),
    trySelectRows(supabase, "platform_events", { orderColumn: "occurred_at", limit: 10000 }),
    trySelectRows(supabase, "platform_admin_audit_logs", { orderColumn: "created_at", limit: 10000 })
  ]);

  const paymentsById = new Map(payments.rows.map((row) => [stringValue(row.id), row]));
  const appointmentsById = new Map(appointments.rows.map((row) => [stringValue(row.id), row]));
  const routingByPaymentId = new Map(routingRecords.rows.filter((row) => row.payment_id).map((row) => [stringValue(row.payment_id), row]));
  const routingByAppointmentId = new Map(routingRecords.rows.filter((row) => row.appointment_id).map((row) => [stringValue(row.appointment_id), row]));
  const routingSummary = buildFinanceRoutingEvidenceSummary({
    appointments,
    payments,
    refunds,
    payoutExecutions,
    routingRecords,
    routingByPaymentId,
    routingByAppointmentId
  });
  const activeRefundTargets = buildActiveRefundTargets(incidents, paymentsById, appointmentsById, routingByPaymentId, routingByAppointmentId);
  const refundLogs = refunds.rows.map((refund) => {
    const payment = paymentsById.get(stringValue(refund.payment_id)) ?? null;
    const appointment = payment?.appointment_id ? appointmentsById.get(stringValue(payment.appointment_id)) ?? null : null;
    const routing = (payment ? routingByPaymentId.get(stringValue(payment.id)) : null) ?? (appointment ? routingByAppointmentId.get(stringValue(appointment.id)) : null) ?? null;
    return buildRefundLog({
      refund,
      payment,
      appointment,
      routing,
      events: platformEvents.rows,
      audits: adminAudits.rows
    });
  });
  const failedRefundLogs = platformEvents.rows
    .filter((event) => stringValue(event.event_type) === "payment_refund_failed")
    .map(buildFailedRefundLog);
  const routingLogs = routingRecords.rows.flatMap((row) => {
    const logs: FinanceLogEntry[] = [];
    if (stringValue(row.payout_readiness_status) === "blocked") {
      logs.push(buildRoutingLog(row, "payout_block"));
    }
    if (stringValue(row.money_routing_status) === "manual_review" || stringValue(row.reconciliation_status) === "manual_review") {
      logs.push(buildRoutingLog(row, "manual_review"));
    }
    return logs;
  });
  const logs = sortLogs([...refundLogs, ...failedRefundLogs, ...routingLogs]);
  const successfulRefundLogs = refundLogs.filter((log) => log.amount !== null && !FAILED_REFUND_STATUSES.has(log.resultStatus.toLowerCase()));
  const lastRefundTimestamp = successfulRefundLogs
    .map((log) => log.timestamp)
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort()
    .at(-1) ?? null;
  const refundMetrics: FinanceRefundMetrics = {
    refundCount: successfulRefundLogs.length,
    totalRefundedAmount: roundMoney(successfulRefundLogs.reduce((sum, log) => sum + (log.amount ?? 0), 0)),
    failedRefundAttemptCount: failedRefundLogs.length,
    activeUnresolvedRefundBlockerCount: activeRefundTargets.length,
    lastRefundTimestamp
  };

  return {
    activeRefundTargets,
    refundLogs: logs,
    refundMetrics,
    routingSummary
  };
}

function latestByField(rows: JsonRecord[], field: string, value: unknown) {
  return rows.find((row) => String(row[field] ?? "") === String(value ?? "")) ?? null;
}

export async function detectArchitectMissionIncidents(supabase: SupabaseClient) {
  const [appointments, payments, posSales, barbers, services, availabilityRules, audits, refunds, payoutExecutions, routingRecords] = await Promise.all([
    selectRows<JsonRecord>(supabase, "appointments", { orderColumn: "updated_at", limit: 80, optional: true }),
    selectRows<JsonRecord>(supabase, "payments", { orderColumn: "created_at", limit: 80, optional: true }),
    selectRows<JsonRecord>(supabase, "pos_sales", { orderColumn: "updated_at", limit: 80, optional: true }),
    selectRows<JsonRecord>(supabase, "barbers", { orderColumn: "updated_at", limit: 80, optional: true }),
    selectRows<JsonRecord>(supabase, "services", { orderColumn: "updated_at", limit: 200, optional: true }),
    selectRows<JsonRecord>(supabase, "availability_rules", { limit: 200, optional: true }),
    selectRows<JsonRecord>(supabase, "architect_repair_audit_logs", { orderColumn: "created_at", limit: 50, optional: true }),
    selectRows<JsonRecord>(supabase, "refunds", { orderColumn: "created_at", limit: 200, optional: true }),
    selectRows<JsonRecord>(supabase, "payout_executions", { orderColumn: "created_at", limit: 200, optional: true }),
    selectRows<JsonRecord>(supabase, "payment_routing_records", { orderColumn: "updated_at", limit: 300, optional: true })
  ]);

  const incidents: ArchitectIncident[] = [];

  for (const appointment of appointments) {
    const appointmentId = String(appointment.id ?? "");
    const status = String(appointment.status ?? "").toLowerCase();
    const appointmentPayments = payments.filter((payment) => payment.appointment_id === appointment.id);
    const payment = latest(appointmentPayments);
    const routing = latestByField(routingRecords, "appointment_id", appointment.id);
    const history = await selectRows<JsonRecord>(supabase, "appointment_status_history", {
      column: "appointment_id",
      value: appointment.id,
      orderColumn: "changed_at",
      optional: true
    });
    const capturedPayment = isPaymentSuccessful(payment);
    const recentConstraintFailure = hasRoutingConstraintFailure(audits, appointmentId);

    if (status === "completed" && appointment.completed_at && capturedPayment && !routing) {
      incidents.push(buildIncident({
        diagnosisCode: "completed_but_routing_missing",
        affectedEntity: appointmentLabel(appointment),
        affectedRole: "barber",
        affectedTable: "payment_routing_records",
        affectedRoute: "/api/architect/repairs/payment-routing",
        severity: "critical",
        confidence: "high",
        recommendedAction: recentConstraintFailure ? "Run constraint-aware safe repair, or generate Codex patch if repair still fails." : "Run Safe Repair: payment routing.",
        canRepair: true,
        repairType: "payment_routing",
        codexRequired: recentConstraintFailure,
        targetType: "appointment",
        targetId: appointmentId,
        headline: "Completed paid appointment is missing payment routing.",
        evidence: [
          "appointments.status = completed",
          "appointments.completed_at is populated",
          `payment.status = ${String(payment?.status ?? payment?.payment_status ?? "unknown")}`,
          "payment_routing_records lookup by appointment_id returned 0 rows",
          recentConstraintFailure ? "A previous repair failed on payout_readiness_status check constraint." : "No recent routing repair constraint failure was found."
        ],
        analysis: {
          likelyRootCause: recentConstraintFailure
            ? "The repair path attempted a payout_readiness_status value rejected by production constraints."
            : "The payout-routing ledger was never created or repaired after service completion.",
          confidence: recentConstraintFailure ? 94 : 90,
          affectedLayer: "payment routing",
          failedInvariant: "completed + paid appointment must have a payment_routing_records row.",
          supportingEvidence: [
            `appointmentId=${appointmentId}`,
            `paymentId=${String(payment?.id ?? "missing")}`,
            `amount=${String(payment?.amount ?? "unknown")}`,
            "routingFound=false"
          ],
          ruledOut: [
            "appointment completion persisted",
            "status history can be evaluated separately",
            "payment capture exists"
          ],
          safeRepairAvailable: true,
          codexRequired: recentConstraintFailure,
          nextBestAction: recentConstraintFailure
            ? "Run the constraint-aware safe repair from Mission Control. Generate a Codex packet if production still rejects the insert."
            : "Run payment routing repair."
        }
      }));
    }

    if (status === "completed" && !hasCompletedHistory(history)) {
      incidents.push(buildIncident({
        diagnosisCode: "appointment_completed_history_missing",
        affectedEntity: appointmentLabel(appointment),
        affectedRole: "barber",
        affectedTable: "appointment_status_history",
        affectedRoute: "/api/barber/appointments/[id]/complete",
        severity: "broken",
        confidence: "high",
        recommendedAction: "Run status-history repair.",
        canRepair: false,
        repairType: "status_history",
        codexRequired: false,
        targetType: "appointment",
        targetId: appointmentId,
        headline: "Appointment is completed but completed history is missing.",
        evidence: ["appointments.status = completed", "No completed appointment_status_history row found."],
        analysis: {
          likelyRootCause: "Lifecycle update persisted without audit history.",
          confidence: 91,
          affectedLayer: "appointment lifecycle",
          failedInvariant: "Completed appointments must have a completed status-history row.",
          supportingEvidence: [`appointmentId=${appointmentId}`],
          ruledOut: ["appointment row exists"],
          safeRepairAvailable: false,
          codexRequired: false,
          nextBestAction: "Open Deep Debug and repair status history when the safe route is enabled."
        }
      }));
    }

    if (routing && status === "completed" && !isPayoutReadinessEligible(routing.payout_readiness_status)) {
      incidents.push(buildIncident({
        diagnosisCode: "routing_exists_but_not_eligible",
        affectedEntity: appointmentLabel(appointment),
        affectedRole: "barber",
        affectedTable: "payment_routing_records",
        affectedRoute: null,
        severity: "broken",
        confidence: "high",
        recommendedAction: "Inspect routing block reason and payment/dispute state.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "appointment",
        targetId: appointmentId,
        headline: "Completed appointment has routing that is not payout eligible.",
        evidence: [`payout_readiness_status=${String(routing.payout_readiness_status ?? "unknown")}`],
        analysis: {
          likelyRootCause: "Routing status did not transition to a business-eligible value.",
          confidence: 88,
          affectedLayer: "payout eligibility",
          failedInvariant: "Completed paid undisputed appointments should make payout routing eligible.",
          supportingEvidence: [`appointmentId=${appointmentId}`, `routingId=${String(routing.id ?? "unknown")}`],
          ruledOut: ["routing row exists"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Generate Codex Patch."
        }
      }));
    }
  }

  for (const payment of payments) {
    if (!isPaymentSuccessful(payment)) continue;
    if (isAppointmentScopedPayment(payment) && !payment.appointment_id) {
      incidents.push(buildIncident({
        diagnosisCode: "orphaned_captured_payment",
        affectedEntity: `payment ${String(payment.id ?? "unknown")}`,
        affectedRole: "barber",
        affectedTable: "payments",
        affectedRoute: "/api/payments/[paymentId]/capture",
        severity: "critical",
        confidence: "high",
        recommendedAction: "Place payment under manual review; do not repair into appointment routing without a valid appointment or POS sale.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "payment",
        targetId: String(payment.id ?? ""),
        headline: "Captured appointment-scoped payment has no business object.",
        evidence: [
          `payment.status=${String(payment.status ?? payment.payment_status ?? "unknown")}`,
          `payment.payment_type=${String(payment.payment_type ?? payment.type ?? "unknown")}`,
          "payment.appointment_id is empty",
          "No POS/walk-in sale record is linked for Role 1."
        ],
        analysis: {
          likelyRootCause: "A payment capture path allowed appointment-scoped money without an appointment relation.",
          confidence: 92,
          affectedLayer: "payment capture",
          failedInvariant: "No captured money without appointment, walk-in/POS sale, subscription, booth rent, product order, refund, or dispute object.",
          supportingEvidence: [`paymentId=${String(payment.id ?? "unknown")}`],
          ruledOut: ["safe routing repair is not allowed for orphan payments"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Generate Codex Patch or manually classify and hold the payment."
        }
      }));
      continue;
    }
    const paymentType = String(payment.payment_type ?? payment.type ?? "").toLowerCase();
    if (paymentType === "pos_sale" && !payment.pos_sale_id) {
      incidents.push(buildIncident({
        diagnosisCode: "orphaned_captured_payment",
        affectedEntity: `payment ${String(payment.id ?? "unknown")}`,
        affectedRole: "barber",
        affectedTable: "payments",
        affectedRoute: "/api/barber/pos-sales/[id]/charge",
        severity: "critical",
        confidence: "high",
        recommendedAction: "Place payment under manual review; do not repair into appointment routing without a valid POS sale.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "payment",
        targetId: String(payment.id ?? ""),
        headline: "Captured POS sale payment has no POS sale business object.",
        evidence: [
          `payment.status=${String(payment.status ?? payment.payment_status ?? "unknown")}`,
          "payment.payment_type=pos_sale",
          "payment.pos_sale_id is empty"
        ],
        analysis: {
          likelyRootCause: "A POS payment capture path allowed money without a POS sale relation.",
          confidence: 92,
          affectedLayer: "POS payment capture",
          failedInvariant: "No captured money without appointment, POS sale, subscription, booth rent, product order, refund, or dispute object.",
          supportingEvidence: [`paymentId=${String(payment.id ?? "unknown")}`],
          ruledOut: ["safe appointment routing repair is not allowed for POS orphans"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Generate Codex Patch or manually classify and hold the payment."
        }
      }));
      continue;
    }
    if (paymentType === "pos_sale" && payment.pos_sale_id) {
      continue;
    }
    const appointment = appointments.find((row) => row.id === payment.appointment_id);
    const appointmentStatus = String(appointment?.status ?? "").toLowerCase();
    if (appointment && ["cancelled", "canceled"].includes(appointmentStatus)) {
      const routing = latestByField(routingRecords, "appointment_id", appointment.id);
      if (hasRefundOrReversalEvidence(payment, refunds, routing)) {
        continue;
      }

      const paymentId = String(payment.id ?? "");
      const appointmentId = String(appointment.id ?? "");
      const routingId = String(routing?.id ?? "");
      const targetPayoutExecutions = payoutExecutions.filter((row) =>
        [row.payment_id, row.appointment_id, row.routing_id, row.payment_routing_record_id]
          .map((value) => String(value ?? ""))
          .some((value) => value === paymentId || value === appointmentId || (routingId && value === routingId))
      );

      incidents.push(buildIncident({
        diagnosisCode: "cancelled_captured_refund_missing",
        affectedEntity: `payment ${String(payment.id ?? "unknown")}`,
        affectedRole: "client",
        affectedTable: "refunds",
        affectedRoute: "/api/payments/[paymentId]/refund",
        severity: "critical",
        confidence: "high",
        recommendedAction: "Resolve through the controlled canonical refund route after explicit owner approval; keep routing blocked/manual_review until refund evidence exists.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "payment",
        targetId: paymentId,
        headline: "Cancelled appointment has captured payment without refund evidence.",
        evidence: [
          `payment.status = ${String(payment.status ?? payment.payment_status ?? "unknown")}`,
          `appointment.status=${appointmentStatus}`,
          routing ? `payment_routing_records.payout_readiness_status=${String(routing.payout_readiness_status ?? "unknown")}` : "payment_routing_records row is missing for cancelled/captured payment",
          routing ? `payment_routing_records.money_routing_status=${String(routing.money_routing_status ?? "unknown")}` : "routing money status is unavailable",
          "refunds lookup by payment_id returned 0 resolved rows",
          `payout_executions target count=${targetPayoutExecutions.length}`,
          "captured payment + cancelled appointment must remain blocked/manual_review until refund or reversal truth is resolved"
        ],
        analysis: {
          likelyRootCause: "A cancellation path left captured money attached to a cancelled appointment, and no refund/reversal evidence has been recorded yet.",
          confidence: 91,
          affectedLayer: "refund resolution",
          failedInvariant: "Cancelled appointments with captured payments require refund/reversal evidence before Finance can Pass.",
          supportingEvidence: [
            `paymentId=${String(payment.id ?? "unknown")}`,
            `appointmentId=${appointmentId}`,
            `routingId=${routingId || "missing"}`,
            `payoutExecutions=${targetPayoutExecutions.length}`
          ],
          ruledOut: ["payment capture exists"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Use controlled refund resolution only through POST /api/payments/{paymentId}/refund after authorization. Do not start by editing UI or SQL."
        }
      }));
      continue;
    }
    if (!appointment || !["confirmed", "completed", "checked_in", "in_service"].includes(appointmentStatus)) {
      incidents.push(buildIncident({
        diagnosisCode: "payment_captured_but_appointment_missing",
        affectedEntity: `payment ${String(payment.id ?? "unknown")}`,
        affectedRole: "client",
        affectedTable: "payments",
        affectedRoute: "/api/bookings",
        severity: "critical",
        confidence: "high",
        recommendedAction: "Generate Codex Patch and inspect booking transaction rollback.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "payment",
        targetId: String(payment.id ?? ""),
        headline: "Captured payment is not attached to a valid appointment state.",
        evidence: [
          `payment.status=${String(payment.status ?? payment.payment_status ?? "unknown")}`,
          appointment ? `appointment.status=${appointmentStatus}` : "appointment row missing"
        ],
        analysis: {
          likelyRootCause: "Payment capture succeeded without durable appointment state.",
          confidence: 90,
          affectedLayer: "booking transaction",
          failedInvariant: "Captured booking payments must have a confirmed or completed appointment.",
          supportingEvidence: [`paymentId=${String(payment.id ?? "unknown")}`],
          ruledOut: ["payment capture exists"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Generate Codex Patch."
        }
      }));
    }
  }

  for (const posSale of posSales) {
    const status = String(posSale.status ?? "").toLowerCase();
    if (status !== "paid") continue;
    const paymentMethod = String(posSale.payment_method ?? "").toLowerCase();
    if (paymentMethod === "cash") continue;

    const saleId = String(posSale.id ?? "");
    const payment = latest(payments.filter((row) => row.pos_sale_id === posSale.id || row.id === posSale.payment_id));
    if (!isPaymentSuccessful(payment)) continue;

    if (!latestByField(routingRecords, "pos_sale_id", posSale.id)) {
      const grossAmount = Number(posSale.total_cents ?? 0) / 100;
      incidents.push(buildIncident({
        diagnosisCode: "paid_pos_sale_missing_routing",
        affectedEntity: `POS sale ${saleId}`,
        affectedRole: "barber",
        affectedTable: "payment_routing_records",
        affectedRoute: "/api/barber/pos-sales/[id]/charge",
        severity: "critical",
        confidence: "high",
        recommendedAction: "Repair POS sale routing or rerun POS payment routing sync.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "pos_sale",
        targetId: saleId,
        headline: "Paid POS sale is missing payment routing.",
        evidence: [
          "pos_sales.status = paid",
          `payment.status = ${String(payment?.status ?? payment?.payment_status ?? "unknown")}`,
          "payment_routing_records lookup by pos_sale_id returned 0 rows",
          `gross amount = ${grossAmount.toFixed(2)}`,
          `expected platform fee = ${(grossAmount * 0.05).toFixed(2)}`,
          `expected barber payout = ${(grossAmount - grossAmount * 0.05).toFixed(2)}`
        ],
        analysis: {
          likelyRootCause: "The POS payment ledger succeeded without a corresponding routing ledger row.",
          confidence: 90,
          affectedLayer: "POS payment routing",
          failedInvariant: "paid POS sale + captured payment must have payment_routing_records.pos_sale_id.",
          supportingEvidence: [
            `posSaleId=${saleId}`,
            `paymentId=${String(payment?.id ?? "missing")}`,
            `barberId=${String(posSale.barber_id ?? payment?.barber_id ?? "unknown")}`
          ],
          ruledOut: ["draft/payment_pending POS sales are ignored"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Open Deep Debug and repair POS sale routing."
        }
      }));
    }
  }

  for (const audit of audits) {
    const haystack = [
      audit.error_code,
      audit.error_message_safe,
      audit.postgres_code,
      audit.postgres_details
    ].join(" ").toLowerCase();
    if (haystack.includes("payout_readiness_status") && haystack.includes("check")) {
      incidents.push(buildIncident({
        diagnosisCode: "schema_constraint_mismatch",
        affectedEntity: `appointment ${String(audit.target_id ?? "unknown")}`,
        affectedRole: "architect",
        affectedTable: "payment_routing_records",
        affectedRoute: "/api/architect/repairs/payment-routing",
        severity: "critical",
        confidence: "high",
        createdAt: String(audit.created_at ?? new Date().toISOString()),
        recommendedAction: "Generate Codex Patch or run the constraint-aware repair after deploy.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "appointment",
        targetId: String(audit.target_id ?? ""),
        headline: "Payment routing repair hit a production check constraint.",
        evidence: [
          "payment_routing_records_payout_readiness_status_check rejected the attempted value.",
          String(audit.error_message_safe ?? audit.postgres_details ?? "No safe error detail was stored.")
        ],
        analysis: {
          likelyRootCause: "Code attempted a business-display value that is not legal in the production DB constraint.",
          confidence: 94,
          affectedLayer: "schema-aware repair",
          failedInvariant: "Safe repairs must map business meanings to production-legal enum/check values.",
          supportingEvidence: [String(audit.postgres_details ?? audit.error_message_safe ?? "")],
          ruledOut: ["appointment completion", "payment capture"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Generate Codex Patch."
        }
      }));
    }
  }

  for (const barber of barbers) {
    const barberId = String(barber.id ?? "");
    const isApproved = String(barber.app_approval_status ?? "approved").toLowerCase() === "approved";
    const active = String(barber.status ?? "active").toLowerCase() === "active";
    const bookable = barber.is_bookable !== false;
    const discoverable = barber.is_discoverable !== false;
    if (!isApproved || !active || !bookable || !discoverable) continue;

    const barberReference = String(barber.reference_code ?? barber.booking_slug ?? "");
    const hasService = services.some((service) =>
      (service.barber_reference === barberReference || service.barber_id === barber.id)
        && service.active !== false
        && service.is_bookable !== false
    );
    const hasAvailability = availabilityRules.some((rule) => rule.barber_id === barber.id || rule.barber_reference === barberReference);

    if (!hasService) {
      incidents.push(buildIncident({
        diagnosisCode: "barber_hidden_no_service",
        affectedEntity: `barber ${barberReference || barberId}`,
        affectedRole: "barber",
        affectedTable: "services",
        affectedRoute: "/api/marketplace/discover",
        severity: "warning",
        confidence: "medium",
        recommendedAction: "Add or repair an active bookable service.",
        canRepair: false,
        repairType: null,
        codexRequired: false,
        targetType: "barber",
        targetId: barberId,
        headline: "Approved bookable barber has no active service.",
        evidence: ["No active bookable services matched barber reference."],
        analysis: {
          likelyRootCause: "Supply readiness is missing a service row.",
          confidence: 76,
          affectedLayer: "discovery",
          failedInvariant: "Discoverable barbers need at least one active bookable service.",
          supportingEvidence: [`barberId=${barberId}`, `reference=${barberReference}`],
          ruledOut: ["barber approval flags"],
          safeRepairAvailable: false,
          codexRequired: false,
          nextBestAction: "Open Deep Debug."
        }
      }));
    }

    if (!hasAvailability) {
      incidents.push(buildIncident({
        diagnosisCode: "barber_hidden_no_availability",
        affectedEntity: `barber ${barberReference || barberId}`,
        affectedRole: "barber",
        affectedTable: "availability_rules",
        affectedRoute: "/api/marketplace/discover",
        severity: "warning",
        confidence: "medium",
        recommendedAction: "Backfill or repair availability rules.",
        canRepair: false,
        repairType: null,
        codexRequired: false,
        targetType: "barber",
        targetId: barberId,
        headline: "Approved bookable barber has no availability.",
        evidence: ["No availability_rules rows matched barber id."],
        analysis: {
          likelyRootCause: "Supply readiness is missing availability.",
          confidence: 78,
          affectedLayer: "discovery",
          failedInvariant: "Discoverable barbers need availability rules.",
          supportingEvidence: [`barberId=${barberId}`],
          ruledOut: ["barber approval flags"],
          safeRepairAvailable: false,
          codexRequired: false,
          nextBestAction: "Open Deep Debug."
        }
      }));
    }
  }

  return incidents;
}

function healthFromIncidents(incidents: ArchitectIncident[], checkedAt: string): MissionControlHealthItem[] {
  return MISSION_SYSTEMS.map((system) => {
    const related = incidents.filter((incident) => {
      if (system.key === "routing") return ["completed_but_routing_missing", "routing_exists_but_not_eligible", "schema_constraint_mismatch"].includes(incident.diagnosisCode);
      if (system.key === "payments") return incident.diagnosisCode.includes("payment") || incident.diagnosisCode.includes("refund");
      if (system.key === "discovery") return incident.diagnosisCode.startsWith("barber_hidden");
      if (system.key === "barber_calendar") return incident.diagnosisCode.includes("calendar");
      if (system.key === "client_activity") return incident.diagnosisCode.includes("client_activity");
      if (system.key === "schema_health") return incident.diagnosisCode === "schema_constraint_mismatch";
      if (system.key === "payout_eligibility") return incident.diagnosisCode.includes("routing") || incident.diagnosisCode.includes("payout") || incident.diagnosisCode.includes("refund");
      return false;
    });

    if (!related.length) {
      return {
        key: system.key,
        label: system.label,
        status: system.key === "deployments" ? "unknown" : "healthy",
        summary: system.healthySummary,
        lastCheckedAt: checkedAt
      };
    }

    const critical = related.some((incident) => incident.severity === "critical");
    const broken = related.some((incident) => incident.severity === "broken");
    return {
      key: system.key,
      label: system.label,
      status: critical ? "critical" : broken ? "broken" : "warning",
      summary: related.length === 1 ? related[0].headline : `${related.length} active incidents detected.`,
      lastCheckedAt: checkedAt
    };
  });
}

function packetSet(snapshotBase: { environment: MissionControlSnapshot["environment"]; checkedAt: string }, incident: ArchitectIncident): MissionPacketSet {
  return {
    chatGptPacket: buildChatGptPacket(snapshotBase, incident),
    codexPacket: buildCodexPacket(snapshotBase, incident),
    incidentPacket: buildIncidentPacket(snapshotBase, incident)
  };
}

function metricCard(
  id: string,
  label: string,
  workflow: string,
  status: MissionControlStatus,
  metricValue: string,
  summary: string,
  evidence: string[]
): MissionEvidenceCard {
  return {
    id,
    label,
    workflow,
    status,
    metricValue,
    summary,
    evidence,
    department: "CEO"
  };
}

function formatMetricMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function stringValue(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function hasRole(row: JsonRecord, roles: string[]) {
  const values = [
    row.role,
    row.primary_onboarding_role,
    row.user_role,
    row.account_role,
    row.profile_role
  ].map(stringValue);
  return roles.some((role) => values.includes(role));
}

function isActiveEntity(row: JsonRecord) {
  const status = stringValue(row.status ?? row.account_status ?? row.lifecycle_status);
  const approval = stringValue(row.app_approval_status ?? row.approval_status ?? row.verification_status);
  return !["inactive", "suspended", "deleted", "ended", "declined", "rejected"].includes(status)
    && !["rejected", "suspended", "denied"].includes(approval);
}

function isPendingApproval(row: JsonRecord) {
  const approval = stringValue(row.app_approval_status ?? row.approval_status ?? row.verification_status ?? row.status);
  return ["pending", "pending_review", "under_review", "needs_review", "submitted"].includes(approval);
}

function dateStringForRow(row: JsonRecord) {
  return String(row.starts_at ?? row.start_time ?? row.scheduled_at ?? row.appointment_date ?? row.created_at ?? "");
}

function isSameIsoDate(row: JsonRecord, isoDate: string) {
  return dateStringForRow(row).startsWith(isoDate);
}

function sumMoney(rows: JsonRecord[], fields: string[]) {
  return rows.reduce((total, row) => {
    const raw = fields.map((field) => row[field]).find((value) => typeof value === "number" || (typeof value === "string" && value.trim() !== ""));
    const amount = Number(raw ?? 0);
    return Number.isFinite(amount) ? total + amount : total;
  }, 0);
}

function buildRoleDriftMetric(profiles: TableRead) {
  if (!profiles.connected) {
    return metricCard(
      "ceo-role-drift-health",
      "Role Drift Evidence",
      "Security",
      "Needs Review",
      "Not connected",
      "Profile role drift cannot be verified because profiles is not connected.",
      [
        profiles.errorMessage ?? "profiles table is not connected.",
        "Read-only evidence only; no role mutation was attempted."
      ]
    );
  }

  const canonicalRoles = new Set<string>(CANONICAL_PUBLIC_PROFILE_ROLES);
  const driftCounts = new Map<string, number>();

  for (const row of profiles.rows) {
    for (const field of PROFILE_ROLE_FIELDS) {
      const value = stringValue(row[field]).trim();
      if (!value || canonicalRoles.has(value)) {
        continue;
      }
      driftCounts.set(value, (driftCounts.get(value) ?? 0) + 1);
    }
  }

  const driftSummary = [...driftCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([role, count]) => `${role} (${count})`);
  const driftCount = [...driftCounts.values()].reduce((total, count) => total + count, 0);

  return metricCard(
    "ceo-role-drift-health",
    "Role Drift Evidence",
    "Security",
    driftCount > 0 ? "Failed" : "Pass",
    `${driftCount} drift`,
    driftCount > 0
      ? "Non-canonical public role evidence exists in profiles and must remain Failed until role truth is cleaned safely."
      : "Connected profiles evidence found no non-canonical public role values.",
    [
      `${profiles.rows.length} profile row(s) inspected for role drift.`,
      `Canonical public roles: ${CANONICAL_PUBLIC_PROFILE_ROLES.join(", ")}.`,
      driftCount > 0 ? `Non-canonical role values found: ${driftSummary.join(", ")}.` : "No non-canonical public role values found.",
      "Read-only evidence only; no role mutation was attempted."
    ]
  );
}

function firstUsableId(row: JsonRecord, fields: string[]) {
  return fields.map((field) => stringValue(row[field]).trim()).find(Boolean) ?? "";
}

function countByValue(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function formatCounts(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => `${value}=${count}`)
    .join(", ") || "none";
}

function relationLabel(count: number) {
  return count === 1 ? "row" : "rows";
}

function buildProductionRoleTruthInventory(tables: {
  profiles: TableRead;
  clients: TableRead;
  barbers: TableRead;
  shops: TableRead;
  shopBarberRelationships: TableRead;
}) {
  const connectedReads = [
    ["profiles", tables.profiles],
    ["clients", tables.clients],
    ["barbers", tables.barbers],
    ["shops", tables.shops],
    ["shop_barber_relationships", tables.shopBarberRelationships]
  ] as const;
  const disconnectedReads = connectedReads.filter(([, read]) => !read.connected).map(([table]) => table);
  const profileIds = new Set(tables.profiles.rows.map((row) => firstUsableId(row, ["id", "profile_id", "user_id"])).filter(Boolean));
  const profileRoleById = new Map(
    tables.profiles.rows
      .map((row) => [firstUsableId(row, ["id", "profile_id", "user_id"]), stringValue(row.role).trim()] as const)
      .filter(([id]) => Boolean(id))
  );
  const canonicalRoleSet = new Set<string>(CANONICAL_PUBLIC_PROFILE_ROLES);
  const internalRoleSet = new Set<string>(INTERNAL_PROFILE_ROLES);
  const relationshipTypeSet = new Set<string>(EXPECTED_SHOP_RELATIONSHIP_TYPES);
  const primaryProfileRoles = tables.profiles.rows.map((row) => stringValue(row.role).trim());
  const roleCounts = countByValue(primaryProfileRoles.filter(Boolean));
  const nullOrMissingRoleCount = primaryProfileRoles.filter((value) => !value).length;
  const invalidRoleCounts = countByValue(primaryProfileRoles.filter((value) => value && !canonicalRoleSet.has(value) && !internalRoleSet.has(value)));
  const clientLinkageGaps = tables.clients.rows.filter((row) => {
    const profileId = firstUsableId(row, ["profile_id", "user_id", "account_id"]);
    return !profileId || !profileIds.has(profileId) || profileRoleById.get(profileId) !== "client_user";
  }).length;
  const barberLinkageGaps = tables.barbers.rows.filter((row) => {
    const profileId = firstUsableId(row, ["profile_id", "user_id", "account_id"]);
    return !profileId || !profileIds.has(profileId) || profileRoleById.get(profileId) !== "barber_user";
  }).length;
  const shopOwnerLinkageGaps = tables.shops.rows.filter((row) => {
    const ownerProfileId = firstUsableId(row, ["owner_id", "owner_profile_id", "shop_owner_id", "profile_id", "user_id", "created_by"]);
    return !ownerProfileId || !profileIds.has(ownerProfileId) || profileRoleById.get(ownerProfileId) !== "shop_owner_user";
  }).length;
  const relationshipTypeValues = tables.shopBarberRelationships.rows.map((row) => stringValue(row.relationship_type).trim());
  const relationshipTypeCounts = countByValue(relationshipTypeValues.filter(Boolean));
  const missingRelationshipTypeCount = relationshipTypeValues.filter((value) => !value).length;
  const invalidRelationshipTypeCounts = countByValue(relationshipTypeValues.filter((value) => value && !relationshipTypeSet.has(value)));
  const invalidRoleCount = [...invalidRoleCounts.values()].reduce((total, count) => total + count, 0);
  const invalidRelationshipTypeCount = [...invalidRelationshipTypeCounts.values()].reduce((total, count) => total + count, 0);
  const totalLinkageGapCount = clientLinkageGaps + barberLinkageGaps + shopOwnerLinkageGaps;
  const missingEvidence = disconnectedReads.length
    ? [`Disconnected read-only source table(s): ${disconnectedReads.join(", ")}.`]
    : [];

  const baseRow = {
    currentUsageLocations: ["production Supabase read-only evidence"],
    v1Required: true,
    futureParked: false,
    suggestedMigrationPath: "Read-only evidence connector only; do not normalize or mutate roles in this PR.",
    rollbackNote: "No rollback needed because this PR performs no role writes, no migrations, and no production data mutation.",
    evidenceSource: "Production read-only Supabase metadata; content_exposed=false; mutation_attempted=false.",
    nextRepairLane: "security" as const,
    accountRoleMisuse: false
  };

  return buildRoleTruthInventory({
    evidenceSource: [
      "Production Role Evidence Connector: profiles, clients, barbers, shops, and shop_barber_relationships were read only.",
      `profileRoleCounts=${formatCounts(roleCounts)}.`,
      `invalidProfileRoleCounts=${formatCounts(invalidRoleCounts)}.`,
      `nullOrMissingProfileRoleCount=${nullOrMissingRoleCount}.`,
      `relationshipTypeCounts=${formatCounts(relationshipTypeCounts)}.`,
      `invalidRelationshipTypeCounts=${formatCounts(invalidRelationshipTypeCounts)}.`,
      `missingRelationshipTypeCount=${missingRelationshipTypeCount}.`,
      `clientLinkageGaps=${clientLinkageGaps}; barberLinkageGaps=${barberLinkageGaps}; shopOwnerLinkageGaps=${shopOwnerLinkageGaps}.`,
      "content_exposed=false; mutation_attempted=false."
    ].join(" "),
    rows: [
      ...CANONICAL_PUBLIC_PROFILE_ROLES.map((role) => ({
        ...baseRow,
        id: `production-profile-role-${role}`,
        currentRoleValue: role,
        normalizedDisplayLabel: role.replace(/_/g, " "),
        canonicalClassification: "public_account_role" as const,
        expectedCanonicalDestination: `profiles.role = ${role}`,
        affectedRoleOrLane: "Production role truth",
        userImpactRisk: "low" as const,
        securityRisk: "low" as const,
        currentStatus: disconnectedReads.length ? "Needs Review" as const : "Pass" as const,
        migrationRequired: "no" as const,
        failureMeaning: `${role} count is read from production profile metadata.`,
        staleOrMissingEvidenceState: disconnectedReads.length ? missingEvidence : [],
        evidenceSource: `profiles.role ${role} count=${roleCounts.get(role) ?? 0}; content_exposed=false.`
      })),
      ...INTERNAL_PROFILE_ROLES.map((role) => ({
        ...baseRow,
        id: `production-profile-role-${role}`,
        currentRoleValue: role,
        normalizedDisplayLabel: role.replace(/_/g, " "),
        canonicalClassification: "internal_platform_role" as const,
        expectedCanonicalDestination: `profiles.role = ${role} for gated Architect accounts only`,
        affectedRoleOrLane: "Architect / Security",
        userImpactRisk: "medium" as const,
        securityRisk: "critical" as const,
        currentStatus: disconnectedReads.length ? "Needs Review" as const : "Pass" as const,
        migrationRequired: "no" as const,
        failureMeaning: `${role} count is read from production profile metadata.`,
        staleOrMissingEvidenceState: disconnectedReads.length ? missingEvidence : [],
        evidenceSource: `profiles.role ${role} count=${roleCounts.get(role) ?? 0}; internal role; content_exposed=false.`
      })),
      {
        ...baseRow,
        id: "production-profile-role-invalid-or-null",
        currentRoleValue: "invalid_or_null_profile_role",
        normalizedDisplayLabel: "Invalid or null profile role",
        canonicalClassification: "unknown" as const,
        expectedCanonicalDestination: `profiles.role in ${CANONICAL_PUBLIC_PROFILE_ROLES.join(", ")} or gated ${INTERNAL_PROFILE_ROLES.join(", ")}`,
        affectedRoleOrLane: "Security / Compliance",
        userImpactRisk: "critical" as const,
        securityRisk: "critical" as const,
        currentStatus: disconnectedReads.length ? "Needs Review" as const : invalidRoleCount || nullOrMissingRoleCount ? "Failed" as const : "Pass" as const,
        migrationRequired: invalidRoleCount || nullOrMissingRoleCount ? "unknown" as const : "no" as const,
        failureMeaning: "Invalid or null primary profile roles are broken role truth evidence and cannot be marked Pass.",
        staleOrMissingEvidenceState: disconnectedReads.length ? missingEvidence : invalidRoleCount || nullOrMissingRoleCount ? [
          `invalidProfileRoleCounts=${formatCounts(invalidRoleCounts)}.`,
          `nullOrMissingProfileRoleCount=${nullOrMissingRoleCount}.`
        ] : [],
        accountRoleMisuse: invalidRoleCount > 0,
        evidenceSource: `invalidProfileRoleCounts=${formatCounts(invalidRoleCounts)}; nullOrMissingProfileRoleCount=${nullOrMissingRoleCount}; content_exposed=false.`
      },
      {
        ...baseRow,
        id: "production-client-barber-shop-linkage",
        currentRoleValue: "client_barber_shop_linkage",
        normalizedDisplayLabel: "Client/barber/shop owner linkage",
        canonicalClassification: "business_relationship" as const,
        expectedCanonicalDestination: "clients.profile_id -> client_user, barbers.profile_id -> barber_user, shops.owner_id/profile id -> shop_owner_user",
        affectedRoleOrLane: "Product / Operations",
        userImpactRisk: "high" as const,
        securityRisk: "high" as const,
        currentStatus: disconnectedReads.length ? "Needs Review" as const : totalLinkageGapCount ? "Failed" as const : "Pass" as const,
        migrationRequired: totalLinkageGapCount ? "unknown" as const : "no" as const,
        failureMeaning: "Broken profile/client/barber/shop owner linkage is connected evidence of role truth failure.",
        staleOrMissingEvidenceState: disconnectedReads.length ? missingEvidence : totalLinkageGapCount ? [
          `clientLinkageGaps=${clientLinkageGaps}.`,
          `barberLinkageGaps=${barberLinkageGaps}.`,
          `shopOwnerLinkageGaps=${shopOwnerLinkageGaps}.`
        ] : [],
        evidenceSource: `clients=${tables.clients.rows.length} ${relationLabel(tables.clients.rows.length)}; barbers=${tables.barbers.rows.length} ${relationLabel(tables.barbers.rows.length)}; shops=${tables.shops.rows.length} ${relationLabel(tables.shops.rows.length)}; clientLinkageGaps=${clientLinkageGaps}; barberLinkageGaps=${barberLinkageGaps}; shopOwnerLinkageGaps=${shopOwnerLinkageGaps}; content_exposed=false.`
      },
      {
        ...baseRow,
        id: "production-shop-barber-relationship-types",
        currentRoleValue: "shop_barber_relationship_type",
        normalizedDisplayLabel: "Shop/barber relationship type",
        canonicalClassification: "business_relationship" as const,
        expectedCanonicalDestination: `shop_barber_relationships.relationship_type in ${EXPECTED_SHOP_RELATIONSHIP_TYPES.join(", ")}`,
        affectedRoleOrLane: "Operations / Finance",
        userImpactRisk: "high" as const,
        securityRisk: "medium" as const,
        currentStatus: disconnectedReads.length ? "Needs Review" as const : invalidRelationshipTypeCount || missingRelationshipTypeCount ? "Failed" as const : "Pass" as const,
        migrationRequired: invalidRelationshipTypeCount || missingRelationshipTypeCount ? "unknown" as const : "no" as const,
        failureMeaning: "Invalid or missing shop/barber relationship_type values break relationship truth evidence.",
        staleOrMissingEvidenceState: disconnectedReads.length ? missingEvidence : invalidRelationshipTypeCount || missingRelationshipTypeCount ? [
          `invalidRelationshipTypeCounts=${formatCounts(invalidRelationshipTypeCounts)}.`,
          `missingRelationshipTypeCount=${missingRelationshipTypeCount}.`
        ] : [],
        evidenceSource: `relationshipTypeCounts=${formatCounts(relationshipTypeCounts)}; invalidRelationshipTypeCounts=${formatCounts(invalidRelationshipTypeCounts)}; missingRelationshipTypeCount=${missingRelationshipTypeCount}; content_exposed=false.`
      }
    ]
  });
}

function buildRlsDisabledEvidenceMetric() {
  return metricCard(
    "ceo-rls-disabled-evidence",
    "RLS Disabled Evidence",
    "Security",
    "Failed",
    `${KNOWN_RLS_DISABLED_PUBLIC_TABLE_COUNT} disabled`,
    "Safe cleanup evidence reports public Supabase tables with RLS disabled. This must remain Failed until policy work repairs the underlying table protections.",
    [
      `Safe cleanup input reports ${KNOWN_RLS_DISABLED_PUBLIC_TABLE_COUNT} public Supabase table(s) have RLS disabled.`,
      "This pass is read-only for RLS: no RLS enablement, policy creation, migration, or production data mutation was attempted.",
      "RLS truth must be repaired through an explicit approved security migration before Pass."
    ]
  );
}

function buildAuditEvidenceMetric(auditLogs: TableRead) {
  if (!auditLogs.connected) {
    return metricCard(
      "ceo-audit-log-evidence",
      "Audit Evidence",
      "Security",
      "Needs Review",
      "Not connected",
      "Audit trail evidence cannot be verified because audit_logs is not connected.",
      [
        auditLogs.errorMessage ?? "audit_logs table is not connected.",
        "Read-only evidence only; no audit row was inserted."
      ]
    );
  }

  const auditCount = auditLogs.rows.length;
  return metricCard(
    "ceo-audit-log-evidence",
    "Audit Evidence",
    "Security",
    auditCount > 0 ? "Pass" : "Failed",
    `${auditCount} row(s)`,
    auditCount > 0
      ? "audit_logs has connected rows for audit trail evidence."
      : "audit_logs is connected but empty, so audit trail coverage is Failed until canonical audit writes exist.",
    [
      `audit_logs returned ${auditCount} row(s).`,
      "Read-only evidence only; no audit row was inserted."
    ]
  );
}

function countCard(
  id: string,
  label: string,
  workflow: string,
  table: TableRead,
  count: number,
  connectedSummary: string
) {
  return metricCard(
    id,
    label,
    workflow,
    table.connected ? "Pass" : "Needs Review",
    table.connected ? String(count) : "Not connected",
    table.connected ? connectedSummary : `${label} cannot be verified because the source table is not connected.`,
    table.connected ? [`${count} row(s) counted from connected production evidence.`] : [table.errorMessage ?? "Not connected."]
  );
}

function financeRoutingEvidenceRows(summary: FinanceRoutingEvidenceSummary) {
  return [
    `inspectedBookingPaymentRows=${summary.inspectedBookingPaymentRows}`,
    `rowsWithRouting=${summary.rowsWithRouting}`,
    `completedCapturedMissingRouting=${summary.completedCapturedMissingRoutingCount}`,
    `cancelledCapturedMissingRouting=${summary.cancelledCapturedMissingRoutingCount}`,
    `cancelledRefundedSafeRows=${summary.cancelledRefundedSafeRowCount}`,
    `targetPayoutExecutionCount=${summary.targetPayoutExecutionCount}`,
    `broaderPayoutExecutionReviewCount=${summary.broaderPayoutExecutionReviewCount}`,
    `staleTargetCount=${summary.staleTargetCount}`,
    `proposedInsertCount=${summary.proposedInsertCount}`,
    `proposedUpdateCount=${summary.proposedUpdateCount}`,
    `repairNeeded=${summary.repairNeeded ? "yes" : "no"}`,
    `repairRouteAvailable=${summary.repairRouteAvailable ? "yes" : "no"}`,
    `repairRouteSafeToCall=${summary.repairRouteSafeToCall ? "yes" : "no"}`,
    `illegalStatusValueCount=${summary.illegalStatusValueCount}`,
    `duplicateUnsafeRoutingCount=${summary.duplicateUnsafeRoutingCount}`,
    `releasedTargetRoutingCount=${summary.releasedTargetRoutingCount}`,
    `evidenceCurrent=${summary.evidenceCurrent ? "yes" : "no"}`,
    `evidenceSource=${summary.evidenceSource}`,
    summary.reason
  ];
}

async function buildCeoPlatformMetrics(
  supabase: SupabaseClient,
  incidents: ArchitectIncident[],
  checkedAt: string,
  financeEvidence?: MissionFinanceEvidence
) {
  const [
    profiles,
    clients,
    barbers,
    shops,
    appointments,
    payments,
    routingRows,
    culturePosts,
    auditLogs
  ] = await Promise.all([
    trySelectRows(supabase, "profiles", { limit: 10000 }),
    trySelectRows(supabase, "clients", { limit: 10000 }),
    trySelectRows(supabase, "barbers", { limit: 10000 }),
    trySelectRows(supabase, "shops", { limit: 10000 }),
    trySelectRows(supabase, "appointments", { limit: 10000 }),
    trySelectRows(supabase, "payments", { limit: 10000 }),
    trySelectRows(supabase, "payment_routing_records", { limit: 10000 }),
    trySelectRows(supabase, "culture_posts", { limit: 10000 }),
    trySelectRows(supabase, "audit_logs", { limit: 100 })
  ]);

  const today = checkedAt.slice(0, 10);
  const profileRows = profiles.rows;
  const clientCount = clients.connected ? clients.rows.length : profileRows.filter((row) => hasRole(row, ["client_user", "client"])).length;
  const barberCount = barbers.connected ? barbers.rows.length : profileRows.filter((row) => hasRole(row, ["barber_user", "barber"])).length;
  const ownerCount = profileRows.filter((row) => hasRole(row, ["shop_owner_user", "shop_owner", "owner_user"])).length;
  const completedAppointments = appointments.rows.filter((row) => stringValue(row.status) === "completed");
  const capturedPayments = payments.rows.filter(isPaymentSuccessful);
  const financeIncidents = incidents.filter((incident) => incident.affectedDepartment === "Finance" || incident.diagnosisCode.includes("payment") || incident.diagnosisCode.includes("routing"));
  const publicCulturePosts = culturePosts.rows.filter((row) => {
    const visibility = stringValue(row.visibility ?? row.audience ?? "public");
    const status = stringValue(row.status ?? row.publish_status ?? "published");
    const moderation = stringValue(row.moderation_status ?? row.approval_status ?? "approved");
    return visibility === "public" && status === "published" && moderation === "approved" && row.deleted_at == null;
  });
  const activeBarbers = barbers.rows.filter((row) => isActiveEntity(row) && row.is_bookable !== false);
  const activeShops = shops.rows.filter(isActiveEntity);
  const pendingApprovals = [...barbers.rows, ...shops.rows].filter(isPendingApproval);
  const grossBookedVolume = sumMoney(appointments.rows, ["grand_total", "total_amount", "price", "amount"]);
  const platformFees = sumMoney(routingRows.rows, ["platform_fee_amount", "application_fee_amount", "app_fee_amount"]);
  const routingSummary = financeEvidence?.routingSummary;
  const routingHealth: MissionControlStatus = routingSummary?.status
    ?? (financeIncidents.length ? "Failed" : routingRows.connected && routingRows.rows.length ? "Pass" : "Needs Review");
  const payoutReadiness: MissionControlStatus = financeIncidents.length
    ? "Failed"
    : routingRows.connected && routingRows.rows.some((row) => ["ready", "eligible"].includes(stringValue(row.payout_readiness_status)))
      ? "Pass"
      : "Needs Review";
  const refundMetricValues: FinanceRefundMetrics = financeEvidence?.refundMetrics ?? {
    refundCount: 0,
    totalRefundedAmount: 0,
    failedRefundAttemptCount: 0,
    activeUnresolvedRefundBlockerCount: 0,
    lastRefundTimestamp: null
  };
  const refundMetricsConnected = Boolean(financeEvidence?.refundMetrics);
  const activeRefundBlockerStatus: MissionControlStatus = refundMetricsConnected
    ? refundMetricValues.activeUnresolvedRefundBlockerCount > 0
      ? "Failed"
      : "Pass"
    : "Needs Review";
  const refundHistoryStatus: MissionControlStatus = refundMetricsConnected
    ? refundMetricValues.activeUnresolvedRefundBlockerCount > 0
      ? "Failed"
      : refundMetricValues.refundCount > 0
        ? "Pass"
        : "Needs Review"
    : "Needs Review";

  return [
    countCard("ceo-total-users", "Total Users", "Audience", profiles, profileRows.length, "Profiles table is connected and user count is read from production evidence."),
    countCard("ceo-clients-total", "Clients", "Audience", clients.connected ? clients : profiles, clientCount, "Client count is read from connected client/profile evidence."),
    countCard("ceo-barbers-total", "Barbers", "Supply", barbers.connected ? barbers : profiles, barberCount, "Barber count is read from connected barber/profile evidence."),
    countCard("ceo-shop-owners-total", "Shop Owners", "Supply", profiles, ownerCount, "Shop owner count is read from connected profile evidence."),
    countCard("ceo-total-bookings", "Total Bookings", "Bookings", appointments, appointments.rows.length, "Booking count is read from appointments."),
    countCard("ceo-todays-bookings", "Today's Bookings", "Bookings", appointments, appointments.rows.filter((row) => isSameIsoDate(row, today)).length, `Today's booking count uses ${today}.`),
    countCard("ceo-completed-appointments", "Completed Appointments", "Operations", appointments, completedAppointments.length, "Completed appointment count is read from appointments.status."),
    metricCard("ceo-gross-booked-volume", "Gross Booked Volume", "Finance", appointments.connected ? "Pass" : "Needs Review", appointments.connected ? formatMetricMoney(grossBookedVolume) : "Not connected", appointments.connected ? "Gross booked volume is summed from appointment amount fields." : "Gross booked volume source is not connected.", appointments.connected ? ["Fields checked: grand_total, total_amount, price, amount."] : [appointments.errorMessage ?? "Not connected."]),
    metricCard("ceo-platform-fees", "Platform Fees / App Revenue", "Finance", routingRows.connected && routingRows.rows.length ? "Pass" : "Needs Review", routingRows.connected && routingRows.rows.length ? formatMetricMoney(platformFees) : "Not connected", routingRows.connected && routingRows.rows.length ? "Platform fees are summed from routing rows." : "Platform fee truth needs payment routing evidence.", routingRows.connected ? ["Fields checked: platform_fee_amount, application_fee_amount, app_fee_amount."] : [routingRows.errorMessage ?? "Not connected."]),
    countCard("ceo-payments-captured", "Payments Captured", "Finance", payments, capturedPayments.length, "Captured payment count uses successful payment status evidence."),
    metricCard("ceo-refund-count", "Refund Count", "Finance", refundHistoryStatus, refundMetricsConnected ? String(refundMetricValues.refundCount) : "Not connected", refundMetricsConnected ? "Refund count is read from refund and platform event evidence." : "Refund count is not connected.", refundMetricsConnected ? [`${refundMetricValues.refundCount} refund row(s) connected.`] : ["Refund evidence is not connected."]),
    metricCard("ceo-total-refunded", "Total Refunded Amount", "Finance", refundHistoryStatus, refundMetricsConnected ? formatMetricMoney(refundMetricValues.totalRefundedAmount) : "Not connected", refundMetricsConnected ? "Total refunded amount is summed from usable refund evidence." : "Refund amount evidence is not connected.", refundMetricsConnected ? [`totalRefunded=${formatMetricMoney(refundMetricValues.totalRefundedAmount)}`] : ["Refund amount evidence is not connected."]),
    metricCard("ceo-failed-refund-attempts", "Failed Refund Attempts", "Finance", refundMetricsConnected ? (refundMetricValues.failedRefundAttemptCount > 0 ? "Failed" : "Pass") : "Needs Review", refundMetricsConnected ? String(refundMetricValues.failedRefundAttemptCount) : "Not connected", refundMetricsConnected ? "Failed refund attempts are read from platform event evidence." : "Failed refund attempt evidence is not connected.", refundMetricsConnected ? [`payment_refund_failed events=${refundMetricValues.failedRefundAttemptCount}`] : ["Platform event evidence is not connected."]),
    metricCard("ceo-active-refund-blockers", "Active Refund Blockers", "Finance", activeRefundBlockerStatus, refundMetricsConnected ? String(refundMetricValues.activeUnresolvedRefundBlockerCount) : "Not connected", refundMetricsConnected ? "Active unresolved refund blockers are read from cancelled/captured incident evidence." : "Active refund blocker evidence is not connected.", refundMetricsConnected ? [`activeRefundTargets=${refundMetricValues.activeUnresolvedRefundBlockerCount}`] : ["Cancelled/captured refund target evidence is not connected."]),
    metricCard("ceo-last-refund-timestamp", "Last Refund Timestamp", "Finance", refundMetricsConnected && refundMetricValues.lastRefundTimestamp ? "Pass" : "Needs Review", refundMetricValues.lastRefundTimestamp ?? "Not connected", refundMetricsConnected && refundMetricValues.lastRefundTimestamp ? "Last refund timestamp is read from refund evidence." : "No connected refund timestamp exists yet.", refundMetricsConnected ? [`lastRefundTimestamp=${refundMetricValues.lastRefundTimestamp ?? "none"}`] : ["Refund timestamp evidence is not connected."]),
    metricCard(
      "ceo-payment-routing-health",
      "Payment Routing Health",
      "Finance",
      routingHealth,
      routingSummary
        ? routingSummary.repairNeeded ? "Repair needed" : "No repair required"
        : routingHealth,
      routingSummary
        ? routingSummary.reason
        : financeIncidents.length
          ? "Finance incident evidence is active."
          : "Routing health is derived from routing rows and finance incidents.",
      routingSummary
        ? financeRoutingEvidenceRows(routingSummary)
        : financeIncidents.length
          ? financeIncidents.map((incident) => incident.headline)
          : [`payment_routing_records rows=${routingRows.rows.length}`]
    ),
    metricCard("ceo-payout-readiness-health", "Payout Readiness Health", "Finance", payoutReadiness, payoutReadiness, payoutReadiness === "Pass" ? "At least one routing row is payout-ready." : "Payout readiness cannot be fully verified from current evidence.", routingRows.connected ? routingRows.rows.slice(0, 3).map((row) => `payout_readiness_status=${String(row.payout_readiness_status ?? "unknown")}`) : [routingRows.errorMessage ?? "Not connected."]),
    metricCard("ceo-culture-health", "Culture Health", "Culture", culturePosts.connected && publicCulturePosts.length ? "Pass" : "Needs Review", culturePosts.connected ? `${publicCulturePosts.length} public post(s)` : "Not connected", culturePosts.connected && publicCulturePosts.length ? "Public approved Culture post evidence exists." : "Culture health needs public approved post or clean empty-state evidence.", culturePosts.connected ? [`culture_posts rows=${culturePosts.rows.length}`] : [culturePosts.errorMessage ?? "Not connected."]),
    countCard("ceo-active-shops", "Active Shops", "Operations", shops, activeShops.length, "Active shop count is read from shops status evidence."),
    countCard("ceo-active-barbers", "Active Barbers", "Operations", barbers, activeBarbers.length, "Active barber count is read from barber status/bookable evidence."),
    metricCard("ceo-pending-approvals", "Pending Barber/Shop Approvals", "Compliance", barbers.connected || shops.connected ? "Pass" : "Needs Review", barbers.connected || shops.connected ? String(pendingApprovals.length) : "Not connected", "Pending approvals are counted from barber/shop approval status fields.", [`barber rows=${barbers.rows.length}`, `shop rows=${shops.rows.length}`]),
    buildRoleDriftMetric(profiles),
    buildRlsDisabledEvidenceMetric(),
    buildAuditEvidenceMetric(auditLogs),
    metricCard("ceo-critical-incidents", "Critical Incidents", "Incidents", incidents.some((incident) => incident.severity === "critical") ? "Failed" : "Needs Review", String(incidents.filter((incident) => incident.severity === "critical").length), "Absence of critical incidents does not prove full-platform health.", incidents.length ? incidents.map((incident) => incident.headline).slice(0, 4) : ["Automatic incident detector returned no incidents."]),
    metricCard("ceo-regression-deployment-health", "Regression / Deployment Health", "Technology", "Needs Review", "Needs Review", "Deployment and regression truth require CI/deployment evidence beyond this database snapshot.", ["Commit fingerprint is displayed separately."]),
    metricCard("ceo-next-executive-decisions", "Next Executive Decisions", "Executive Decisions", "Needs Review", "Needs Review", "Mission Control surfaces decisions; Phillip remains final executive decision maker.", ["Review Failed and Needs Review cards before release decisions."])
  ];
}

export async function buildMissionControlSnapshot(
  supabase: SupabaseClient,
  actor: ArchitectActor,
  deploymentRuntimeEvidence?: DeploymentRuntimeEvidence
): Promise<MissionControlSnapshot> {
  void actor;
  const checkedAt = new Date().toISOString();
  const runtimeEvidence = deploymentRuntimeEvidence ?? fallbackDeploymentRuntimeEvidence(checkedAt);
  const environment = runtimeEvidence.environment;
  const [incidents, constraintEvidence] = await Promise.all([
    detectArchitectMissionIncidents(supabase),
    loadPaymentRoutingConstraintEvidence(supabase)
  ]);
  const [financeEvidence, runtimeLoopFixture] = await Promise.all([
    buildFinanceEvidence(supabase, incidents),
    buildProductOperationsRuntimeLoopProofFixture(supabase)
  ]);
  const ceoPlatformMetrics = await buildCeoPlatformMetrics(supabase, incidents, checkedAt, financeEvidence);
  const roleTruthInventory = buildProductionRoleTruthInventory({
    profiles: await trySelectRows(supabase, "profiles", { limit: 10000 }),
    clients: await trySelectRows(supabase, "clients", { limit: 10000 }),
    barbers: await trySelectRows(supabase, "barbers", { limit: 10000 }),
    shops: await trySelectRows(supabase, "shops", { limit: 10000 }),
    shopBarberRelationships: await trySelectRows(supabase, "shop_barber_relationships", { limit: 10000 })
  });
  const health = healthFromIncidents(incidents, checkedAt);
  const packets = Object.fromEntries(incidents.map((incident) => [incident.id, packetSet({ checkedAt, environment }, incident)]));

const deploymentRegression = buildDeploymentRegressionEvidence(runtimeEvidence.evidenceInput);
const foundation = buildMissionControlFoundation(
  incidents,
  checkedAt,
  ceoPlatformMetrics,
  deploymentRegression,
  undefined,
  roleTruthInventory,
  undefined,
  runtimeLoopFixture
);


  return {
    ok: true,
    checkedAt,
    environment,
    health,
    incidents,
    selectedIncidentId: incidents[0]?.id ?? null,
    packets,
    foundation,
    financeEvidence,
    schemaEvidence: {
      paymentRouting: paymentRoutingConstraintEvidenceToJson(constraintEvidence)
    }
  };
}

export function expectedFreelanceRoutingFromPayment(payment: JsonRecord) {
  const gross = roundMoney(numberValue(payment.amount));
  const platformFee = roundMoney(gross * 0.05);
  return {
    gross,
    platformFee,
    barberPayout: roundMoney(Math.max(gross - platformFee, 0)),
    shopSplit: 0
  };
}
