import { createHash } from "node:crypto";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { listPayoutQueue } from "@/lib/payments/service";
import { readCashoutReviewQueue } from "@/lib/points/cashout-review";
import { readPointsStateSnapshot } from "@/lib/points/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  FinancialAnomalyQueueView,
  FinancialAnomalySeverity,
  FinancialAnomalyStatus,
  FinancialAnomalyType,
  FinancialAnomalyView
} from "@/types/fintech";
import type { UserAccount } from "@/types/domain";

type FinancialAnomalyRow = {
  id: string;
  dedupe_key: string;
  anomaly_type: FinancialAnomalyType;
  status: FinancialAnomalyStatus;
  severity: FinancialAnomalySeverity;
  summary: string;
  description: string | null;
  location_reference: string | null;
  barber_reference: string | null;
  user_reference: string | null;
  appointment_reference: string | null;
  payment_reference: string | null;
  cashout_request_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  detected_at: string;
  resolved_at: string | null;
  dismissed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type DetectedAnomalyInput = Omit<
  FinancialAnomalyView,
  "id" | "status" | "actorUserId" | "actorRole" | "resolvedAt" | "dismissedAt"
> & {
  dedupeKey: string;
};

let demoFinancialAnomalies: FinancialAnomalyView[] = [];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableId(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${((Number.parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join("-");
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function isMissingTableError(error: { code?: string | null; message?: string | null }) {
  return error.code === "42P01" || `${error.message ?? ""}`.toLowerCase().includes("does not exist");
}

function parseAgeHours(now: string, referenceAt?: string | null) {
  if (!referenceAt) {
    return 0;
  }

  return Math.max(0, (new Date(now).getTime() - new Date(referenceAt).getTime()) / 36e5);
}

function appendAuditLog(
  metadata: Record<string, unknown> | null | undefined,
  input: {
    actorUserId: string;
    actorRole: string;
    action: string;
    note?: string;
  }
) {
  const nextMetadata = clone(metadata ?? {});
  const auditLog = Array.isArray(nextMetadata.auditLog) ? nextMetadata.auditLog : [];
  nextMetadata.auditLog = [
    ...auditLog,
    {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: input.action,
      note: input.note ?? null,
      createdAt: new Date().toISOString()
    }
  ];
  return nextMetadata;
}

function sortItems(items: FinancialAnomalyView[]) {
  return [...items].sort((left, right) => {
    const severityWeight: Record<FinancialAnomalySeverity, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };
    return severityWeight[right.severity] - severityWeight[left.severity]
      || right.detectedAt.localeCompare(left.detectedAt);
  });
}

function mapRow(row: FinancialAnomalyRow): FinancialAnomalyView {
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    anomalyType: row.anomaly_type,
    status: row.status,
    severity: row.severity,
    summary: row.summary,
    description: row.description,
    locationId: row.location_reference,
    barberId: row.barber_reference,
    userId: row.user_reference,
    appointmentId: row.appointment_reference,
    paymentId: row.payment_reference,
    cashoutRequestId: row.cashout_request_id,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at,
    dismissedAt: row.dismissed_at,
    metadata: clone(row.metadata ?? {})
  };
}

function toRow(record: FinancialAnomalyView) {
  return {
    id: record.id,
    dedupe_key: record.dedupeKey,
    anomaly_type: record.anomalyType,
    status: record.status,
    severity: record.severity,
    summary: record.summary,
    description: record.description ?? null,
    location_reference: record.locationId ?? null,
    barber_reference: record.barberId ?? null,
    user_reference: record.userId ?? null,
    appointment_reference: record.appointmentId ?? null,
    payment_reference: record.paymentId ?? null,
    cashout_request_id: record.cashoutRequestId ?? null,
    actor_user_id: record.actorUserId ?? null,
    actor_role: record.actorRole ?? null,
    detected_at: record.detectedAt,
    resolved_at: record.resolvedAt ?? null,
    dismissed_at: record.dismissedAt ?? null,
    metadata: record.metadata,
    updated_at: new Date().toISOString()
  };
}

async function readAllAnomalies() {
  const supabase = getSupabase();
  if (!supabase) {
    return clone(demoFinancialAnomalies);
  }

  const result = await supabase
    .from("financial_anomalies")
    .select("id, dedupe_key, anomaly_type, status, severity, summary, description, location_reference, barber_reference, user_reference, appointment_reference, payment_reference, cashout_request_id, actor_user_id, actor_role, detected_at, resolved_at, dismissed_at, metadata, created_at, updated_at")
    .order("detected_at", { ascending: false });

  if (result.error) {
    if (isMissingTableError(result.error)) {
      return [];
    }
    throw result.error;
  }

  return ((result.data ?? []) as FinancialAnomalyRow[]).map(mapRow);
}

async function persistAnomalies(items: FinancialAnomalyView[]) {
  const supabase = getSupabase();
  if (!supabase) {
    demoFinancialAnomalies = sortItems(clone(items));
    return;
  }

  const result = await supabase
    .from("financial_anomalies")
    .upsert(items.map(toRow), { onConflict: "id" });

  if (result.error) {
    if (isMissingTableError(result.error)) {
      demoFinancialAnomalies = sortItems(clone(items));
      return;
    }
    throw result.error;
  }
}

function buildDetectedAnomaly(input: {
  type: FinancialAnomalyType;
  severity: FinancialAnomalySeverity;
  summary: string;
  description?: string | null;
  locationId?: string | null;
  barberId?: string | null;
  userId?: string | null;
  appointmentId?: string | null;
  paymentId?: string | null;
  cashoutRequestId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeParts: string[];
  detectedAt: string;
}) {
  const dedupeKey = `${input.type}:${input.dedupeParts.join(":")}`;
  return {
    dedupeKey,
    anomalyType: input.type,
    severity: input.severity,
    summary: input.summary,
    description: input.description ?? null,
    locationId: input.locationId ?? null,
    barberId: input.barberId ?? null,
    userId: input.userId ?? null,
    appointmentId: input.appointmentId ?? null,
    paymentId: input.paymentId ?? null,
    cashoutRequestId: input.cashoutRequestId ?? null,
    detectedAt: input.detectedAt,
    metadata: input.metadata ?? {}
  } satisfies DetectedAnomalyInput;
}

async function detectFinancialAnomalies(input?: { locationIds?: string[]; now?: string }) {
  const now = input?.now ?? new Date().toISOString();
  const locationIds = input?.locationIds ?? [];
  const [payoutQueue, cashoutQueue, pointsState] = await Promise.all([
    listPayoutQueue({ locationIds }).catch(() => []),
    readCashoutReviewQueue().catch(() => ({ summary: { requested: 0, underReview: 0, approved: 0, paid: 0, failed: 0, rejected: 0, reversed: 0 }, requests: [] })),
    readPointsStateSnapshot().catch(() => null)
  ]);
  const anomalies: DetectedAnomalyInput[] = [];

  for (const entry of payoutQueue) {
    const ageHours = parseAgeHours(now, entry.lastUpdatedAt);
    if ((entry.status === "pending" || entry.status === "queued") && ageHours >= 48 && entry.thresholdRemaining === 0) {
      anomalies.push(buildDetectedAnomaly({
        type: "payout_stuck",
        severity: ageHours >= 96 ? "critical" : "high",
        summary: `Payout for ${entry.appointmentId ?? entry.paymentId} is stuck in ${entry.status.replaceAll("_", " ")}.`,
        description: `The payout has not advanced for ${Math.round(ageHours)} hours even though the threshold has been met.`,
        locationId: locationIds[0] ?? null,
        appointmentId: entry.appointmentId ?? null,
        paymentId: entry.paymentId,
        metadata: {
          status: entry.status,
          ageHours: roundCurrency(ageHours),
          nextAction: entry.nextAction,
          blockedReasons: entry.blockedReasons
        },
        dedupeParts: [entry.paymentId, entry.status],
        detectedAt: now
      }));
    }

    if (entry.status === "in_transit" && ageHours >= 24) {
      anomalies.push(buildDetectedAnomaly({
        type: "payout_stuck",
        severity: ageHours >= 72 ? "high" : "medium",
        summary: `Payout for ${entry.appointmentId ?? entry.paymentId} has been in transit too long.`,
        description: `The payout is still marked in transit after ${Math.round(ageHours)} hours.`,
        locationId: locationIds[0] ?? null,
        appointmentId: entry.appointmentId ?? null,
        paymentId: entry.paymentId,
        metadata: {
          status: entry.status,
          ageHours: roundCurrency(ageHours)
        },
        dedupeParts: [entry.paymentId, "in_transit"],
        detectedAt: now
      }));
    }

    if (entry.status === "failed") {
      anomalies.push(buildDetectedAnomaly({
        type: "payout_failure",
        severity: "high",
        summary: `Payout execution failed for ${entry.appointmentId ?? entry.paymentId}.`,
        description: entry.blockedReasons.join(" | ") || entry.nextAction,
        locationId: locationIds[0] ?? null,
        appointmentId: entry.appointmentId ?? null,
        paymentId: entry.paymentId,
        metadata: {
          blockedReasons: entry.blockedReasons,
          nextAction: entry.nextAction
        },
        dedupeParts: [entry.paymentId, "failed"],
        detectedAt: now
      }));
    }

    if (entry.refundHold && !["reversed", "failed", "not_ready"].includes(entry.status)) {
      anomalies.push(buildDetectedAnomaly({
        type: "refund_hold_gap",
        severity: "critical",
        summary: `Refund hold mismatch detected for ${entry.appointmentId ?? entry.paymentId}.`,
        description: "The payout still appears active even though the booking is carrying a refund hold.",
        locationId: locationIds[0] ?? null,
        appointmentId: entry.appointmentId ?? null,
        paymentId: entry.paymentId,
        metadata: {
          status: entry.status,
          refundHold: entry.refundHold
        },
        dedupeParts: [entry.paymentId, "refund_hold_gap"],
        detectedAt: now
      }));
    }

    if (entry.eligibleAmount < 0) {
      anomalies.push(buildDetectedAnomaly({
        type: "negative_earnings",
        severity: "critical",
        summary: `Negative payout eligibility detected for ${entry.appointmentId ?? entry.paymentId}.`,
        description: "Eligible payout amount should never be negative in the canonical money layer.",
        locationId: locationIds[0] ?? null,
        appointmentId: entry.appointmentId ?? null,
        paymentId: entry.paymentId,
        metadata: {
          eligibleAmount: entry.eligibleAmount
        },
        dedupeParts: [entry.paymentId, "negative"],
        detectedAt: now
      }));
    }
  }

  for (const request of cashoutQueue.requests) {
    const ageHours = parseAgeHours(now, request.processedAt ?? request.createdAt);
    if (request.status === "approved" && ageHours >= 48) {
      anomalies.push(buildDetectedAnomaly({
        type: "cashout_stale",
        severity: ageHours >= 96 ? "high" : "medium",
        summary: `Approved cash-out ${request.requestId} is still waiting for payout.`,
        description: `The request has remained approved for ${Math.round(ageHours)} hours without payment completion.`,
        userId: request.userId,
        cashoutRequestId: request.requestId,
        metadata: {
          role: request.role,
          ageHours: roundCurrency(ageHours),
          cashValue: request.cashValue,
          pointsRequested: request.pointsRequested
        },
        dedupeParts: [request.requestId, "approved_wait"],
        detectedAt: now
      }));
    }

    if (request.status === "failed") {
      anomalies.push(buildDetectedAnomaly({
        type: "cashout_failure",
        severity: "high",
        summary: `Cash-out ${request.requestId} failed and needs operator review.`,
        description: request.failureReason ?? request.reviewNote ?? "The cash-out request failed during payout completion.",
        userId: request.userId,
        cashoutRequestId: request.requestId,
        metadata: {
          role: request.role,
          cashValue: request.cashValue,
          pointsRequested: request.pointsRequested
        },
        dedupeParts: [request.requestId, "failed"],
        detectedAt: now
      }));
    }
  }

  if (pointsState) {
    const pendingInAppValue = pointsState.transactions
      .filter((transaction) => transaction.status === "pending" && transaction.pointsDelta > 0)
      .reduce((sum, transaction) => sum + transaction.inAppValue, 0);
    const unlockedInAppValue = pointsState.transactions
      .filter((transaction) => transaction.status === "unlocked" && transaction.pointsDelta > 0)
      .reduce((sum, transaction) => sum + transaction.inAppValue, 0);
    const totalLiability = roundCurrency(pendingInAppValue + unlockedInAppValue);

    if (totalLiability >= 75) {
      anomalies.push(buildDetectedAnomaly({
        type: "points_liability_spike",
        severity: totalLiability >= 150 ? "high" : "medium",
        summary: "BVR Points liability is elevated and should be reviewed.",
        description: "Pending and unlocked point value is rising faster than normal and may need campaign or cash-out review.",
        metadata: {
          pendingInAppValue: roundCurrency(pendingInAppValue),
          unlockedInAppValue: roundCurrency(unlockedInAppValue),
          totalLiability
        },
        dedupeParts: ["global", `${Math.floor(totalLiability / 25)}`],
        detectedAt: now
      }));
    }
  }

  return anomalies;
}

function buildQueue(items: FinancialAnomalyView[]): FinancialAnomalyQueueView {
  return {
    summary: {
      open: items.filter((item) => item.status === "open").length,
      investigating: items.filter((item) => item.status === "investigating").length,
      resolved: items.filter((item) => item.status === "resolved").length,
      dismissed: items.filter((item) => item.status === "dismissed").length,
      critical: items.filter((item) => item.status === "open" && item.severity === "critical").length
    },
    items: sortItems(items)
  };
}

export async function syncFinancialAnomalies(input?: { locationIds?: string[]; now?: string }) {
  const existing = await readAllAnomalies();
  const detected = await detectFinancialAnomalies(input);
  const byDedupeKey = new Map(existing.map((item) => [item.dedupeKey, item]));
  const nextItems = [...existing];

  for (const anomaly of detected) {
    const existingRecord = byDedupeKey.get(anomaly.dedupeKey);
    const nextRecord: FinancialAnomalyView = {
      id: existingRecord?.id ?? stableId(`financial-anomaly:${anomaly.dedupeKey}`),
      dedupeKey: anomaly.dedupeKey,
      anomalyType: anomaly.anomalyType,
      status: existingRecord?.status === "investigating" ? "investigating" : "open",
      severity: anomaly.severity,
      summary: anomaly.summary,
      description: anomaly.description,
      locationId: anomaly.locationId,
      barberId: anomaly.barberId,
      userId: anomaly.userId,
      appointmentId: anomaly.appointmentId,
      paymentId: anomaly.paymentId,
      cashoutRequestId: anomaly.cashoutRequestId,
      actorUserId: existingRecord?.status === "investigating" ? existingRecord.actorUserId : null,
      actorRole: existingRecord?.status === "investigating" ? existingRecord.actorRole : null,
      detectedAt: anomaly.detectedAt,
      resolvedAt: null,
      dismissedAt: null,
      metadata: existingRecord
        ? {
            ...existingRecord.metadata,
            ...anomaly.metadata
          }
        : anomaly.metadata
    };
    const existingIndex = nextItems.findIndex((item) => item.dedupeKey === anomaly.dedupeKey);
    if (existingIndex >= 0) {
      nextItems[existingIndex] = nextRecord;
    } else {
      nextItems.unshift(nextRecord);
    }
  }

  await persistAnomalies(nextItems);
  return buildQueue(
    nextItems.filter((item) =>
      !input?.locationIds?.length
      || !item.locationId
      || input.locationIds.includes(item.locationId)
    )
  );
}

export async function readFinancialAnomalyQueue(input?: {
  locationIds?: string[];
  statuses?: FinancialAnomalyStatus[];
}) {
  const items = await readAllAnomalies();
  return buildQueue(
    items.filter((item) => {
      if (input?.locationIds?.length && item.locationId && !input.locationIds.includes(item.locationId)) {
        return false;
      }

      if (input?.statuses?.length && !input.statuses.includes(item.status)) {
        return false;
      }

      return true;
    })
  );
}

async function updateAnomalyStatus(input: {
  id: string;
  status: Extract<FinancialAnomalyStatus, "resolved" | "dismissed" | "investigating">;
  actorUserId: string;
  actorRole: UserAccount["role"];
  note?: string;
}) {
  const items = await readAllAnomalies();
  const index = items.findIndex((item) => item.id === input.id);
  if (index < 0) {
    throw new Error("Financial anomaly not found.");
  }

  const now = new Date().toISOString();
  items[index] = {
    ...items[index],
    status: input.status,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    resolvedAt: input.status === "resolved" ? now : items[index].resolvedAt ?? null,
    dismissedAt: input.status === "dismissed" ? now : items[index].dismissedAt ?? null,
    metadata: appendAuditLog(items[index].metadata, {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: input.status,
      note: input.note
    })
  };

  await persistAnomalies(items);
  return items[index];
}

export async function resolveFinancialAnomaly(input: {
  id: string;
  actorUserId: string;
  actorRole: UserAccount["role"];
  note?: string;
}) {
  return updateAnomalyStatus({
    ...input,
    status: "resolved"
  });
}

export async function dismissFinancialAnomaly(input: {
  id: string;
  actorUserId: string;
  actorRole: UserAccount["role"];
  note?: string;
}) {
  return updateAnomalyStatus({
    ...input,
    status: "dismissed"
  });
}

export function resetFinancialAnomaliesForTests() {
  demoFinancialAnomalies = [];
}
