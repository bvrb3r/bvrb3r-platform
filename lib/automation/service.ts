import { createHash } from "node:crypto";
import {
  buildClientAutomationPlan,
  buildClientAutomationSummary,
  buildOwnerAutomationSummary,
  resolveAutomationExecutionResolution,
  type AutomationPromotionCandidate,
  type AutomationRunDraft
} from "@/lib/automation/domain";
import { buildAutomationReportingSnapshots } from "@/lib/automation/observability";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { demoClients } from "@/lib/data/demo";
import { getNotificationDeliveryProvider } from "@/lib/engagement/delivery-provider";
import { appendEngagementNotification } from "@/lib/engagement/notifications";
import { buildClientIntelligenceSnapshot } from "@/lib/engagement/intelligence";
import { setEngagementState } from "@/lib/engagement/state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { LiveOperationsSnapshot } from "@/lib/operations/live-state";
import type {
  AutomationEventRecord,
  AutomationReportingSnapshotRecord,
  AutomationRunRecord,
  AutomationTriggerSource,
  AutomationTriggerSnapshotRecord,
  ClientAutomationSummary,
  ClientEngagementSummary,
  ClientRewardOption,
  EngagementState,
  OwnerAutomationSummary
} from "@/types/engagement";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type PromotionLookupRow = {
  id: string;
  name: string;
  code: string | null;
  shop_id: string;
  service_id: string | null;
  barber_id: string | null;
  discount_type: "percent" | "fixed_amount";
  discount_value: number | string;
  max_discount_amount: number | string | null;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

type LocationReferenceRow = {
  id: string;
  reference_code: string | null;
};

type ServiceReferenceRow = {
  id: string;
  reference_code: string | null;
};

type BarberReferenceRow = {
  id: string;
  reference_code: string | null;
};

const REWARD_OPTIONS: Array<Omit<ClientRewardOption, "unlocked">> = [
  { id: "reward-add-on", title: "Premium add-on credit", pointsRequired: 120 },
  { id: "reward-discount", title: "15 dollars off your next visit", pointsRequired: 180 },
  { id: "reward-vip", title: "VIP early-booking access", pointsRequired: 260 }
];
const DEFAULT_AUTOMATION_MAX_ATTEMPTS = 3;

let demoTriggerSnapshots: AutomationTriggerSnapshotRecord[] = [];
let demoRuns: AutomationRunRecord[] = [];
let demoEvents: AutomationEventRecord[] = [];
let demoReportingSnapshots: AutomationReportingSnapshotRecord[] = [];

export class AutomationServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex");
  const base = hash.slice(0, 32).split("");
  base[12] = "5";
  base[16] = ((parseInt(base[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${base.slice(0, 8).join("")}-${base.slice(8, 12).join("")}-${base.slice(12, 16).join("")}-${base.slice(16, 20).join("")}-${base.slice(20, 32).join("")}`;
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function sortRuns(rows: AutomationRunRecord[]) {
  return [...rows].sort((left, right) => {
    const leftValue = left.updatedAt ?? left.createdAt;
    const rightValue = right.updatedAt ?? right.createdAt;
    return rightValue.localeCompare(leftValue);
  });
}

function sortEvents(rows: AutomationEventRecord[]) {
  return [...rows].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getClientRecord(snapshot: LiveOperationsSnapshot | undefined, clientId: string) {
  return snapshot?.clients.find((client) => client.id === clientId) ?? demoClients.find((client) => client.id === clientId) ?? null;
}

function getLatestLocationForClient(snapshot: LiveOperationsSnapshot | undefined, clientId: string) {
  const latest = (snapshot?.appointments ?? [])
    .filter((appointment) => appointment.clientId === clientId)
    .sort((left, right) => {
      const leftValue = left.completedAt ?? left.end ?? left.start;
      const rightValue = right.completedAt ?? right.end ?? right.start;
      return rightValue.localeCompare(leftValue);
    })[0];

  return latest?.locationId;
}

function buildRewards(pointsBalance: number) {
  return REWARD_OPTIONS.map((reward) => ({
    ...reward,
    unlocked: pointsBalance >= reward.pointsRequired
  }));
}

function toTriggerRow(record: AutomationTriggerSnapshotRecord) {
  return {
    client_reference: record.clientId,
    client_email: record.clientEmail,
    location_reference: record.locationId ?? null,
    barber_reference: record.barberId ?? null,
    recommended_promotion_id: record.recommendedPromotionId ?? null,
    rebooking_window: record.rebookingWindow,
    churn_risk: record.churnRisk,
    churn_score: record.churnScore,
    reengagement_eligible: record.reengagementEligible,
    loyalty_segment: record.loyaltySegment,
    active_appointment_count: record.activeAppointmentCount,
    next_due_at: record.nextDueAt ?? null,
    rebooking_reminder_eligible: record.rebookingReminderEligible,
    reengagement_nudge_eligible: record.reengagementNudgeEligible,
    promotion_follow_up_eligible: record.promotionFollowUpEligible,
    reward_follow_up_eligible: record.rewardFollowUpEligible,
    next_automation_due_at: record.nextAutomationDueAt ?? null,
    automation_reasons: record.automationReasons,
    updated_at: record.updatedAt
  };
}

function toRunRow(record: AutomationRunRecord) {
  return {
    id: record.id,
    automation_type: record.automationType,
    status: record.status,
    client_reference: record.clientId,
    client_email: record.clientEmail,
    location_reference: record.locationId ?? null,
    barber_reference: record.barberId ?? null,
    promotion_id: record.promotionId ?? null,
    title: record.title,
    body: record.body,
    channel: record.channel,
    due_at: record.dueAt,
    dedupe_key: record.dedupeKey,
    payload: record.payload,
    attempt_count: record.attemptCount,
    max_attempts: record.maxAttempts,
    retry_eligible: record.retryEligible,
    terminal_failure: record.terminalFailure,
    next_retry_at: record.nextRetryAt ?? null,
    retry_scheduled_at: record.retryScheduledAt ?? null,
    processing_started_at: record.processingStartedAt ?? null,
    last_failure_kind: record.lastFailureKind ?? null,
    last_trigger_source: record.lastTriggerSource ?? null,
    last_delivery_status: record.lastDeliveryStatus ?? null,
    last_delivery_provider: record.lastDeliveryProvider ?? null,
    last_delivery_attempt_reference: record.lastDeliveryAttemptId ?? null,
    notification_references: record.notificationIds,
    notification_reference: record.notificationId ?? null,
    blocked_reason: record.blockedReason ?? null,
    error_message: record.errorMessage ?? null,
    diagnostics: record.diagnostics ?? {},
    last_event_at: record.lastEventAt ?? null,
    queued_at: record.queuedAt ?? null,
    completed_at: record.completedAt ?? null,
    failed_at: record.failedAt ?? null,
    cancelled_at: record.cancelledAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

function fromRunRow(row: Record<string, unknown>): AutomationRunRecord {
  return {
    id: String(row.id),
    automationType: row.automation_type as AutomationRunRecord["automationType"],
    status: row.status as AutomationRunRecord["status"],
    clientId: String(row.client_reference),
    clientEmail: String(row.client_email),
    locationId: typeof row.location_reference === "string" ? row.location_reference : undefined,
    barberId: typeof row.barber_reference === "string" ? row.barber_reference : undefined,
    promotionId: typeof row.promotion_id === "string" ? row.promotion_id : undefined,
    title: String(row.title),
    body: String(row.body),
    channel: row.channel as AutomationRunRecord["channel"],
    dueAt: String(row.due_at),
    dedupeKey: String(row.dedupe_key),
    payload: (row.payload as Record<string, unknown> | null) ?? {},
    attemptCount: numeric(row.attempt_count),
    maxAttempts: Math.max(1, numeric(row.max_attempts) || DEFAULT_AUTOMATION_MAX_ATTEMPTS),
    retryEligible: Boolean(row.retry_eligible),
    terminalFailure: Boolean(row.terminal_failure),
    nextRetryAt: typeof row.next_retry_at === "string" ? row.next_retry_at : undefined,
    retryScheduledAt: typeof row.retry_scheduled_at === "string" ? row.retry_scheduled_at : undefined,
    processingStartedAt: typeof row.processing_started_at === "string" ? row.processing_started_at : undefined,
    lastFailureKind: typeof row.last_failure_kind === "string" ? row.last_failure_kind as AutomationRunRecord["lastFailureKind"] : undefined,
    lastTriggerSource: typeof row.last_trigger_source === "string" ? row.last_trigger_source as AutomationRunRecord["lastTriggerSource"] : undefined,
    lastDeliveryStatus: typeof row.last_delivery_status === "string" ? row.last_delivery_status as AutomationRunRecord["lastDeliveryStatus"] : undefined,
    lastDeliveryProvider: typeof row.last_delivery_provider === "string" ? row.last_delivery_provider : undefined,
    lastDeliveryAttemptId: typeof row.last_delivery_attempt_reference === "string" ? row.last_delivery_attempt_reference : undefined,
    notificationIds: Array.isArray(row.notification_references)
      ? row.notification_references.filter((value): value is string => typeof value === "string")
      : typeof row.notification_reference === "string"
        ? [row.notification_reference]
        : [],
    notificationId: typeof row.notification_reference === "string" ? row.notification_reference : undefined,
    blockedReason: typeof row.blocked_reason === "string" ? row.blocked_reason : undefined,
    errorMessage: typeof row.error_message === "string" ? row.error_message : undefined,
    diagnostics: (row.diagnostics as Record<string, unknown> | null) ?? {},
    lastEventAt: typeof row.last_event_at === "string" ? row.last_event_at : undefined,
    queuedAt: typeof row.queued_at === "string" ? row.queued_at : undefined,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : undefined,
    failedAt: typeof row.failed_at === "string" ? row.failed_at : undefined,
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString())
  };
}

function toEventRow(record: AutomationEventRecord) {
  return {
    id: record.id,
    run_reference: record.runId ?? null,
    client_reference: record.clientId,
    client_email: record.clientEmail ?? null,
    location_reference: record.locationId ?? null,
    barber_reference: record.barberId ?? null,
    automation_type: record.automationType,
    event_type: record.eventType,
    run_status: record.runStatus,
    attempt_number: record.attemptNumber,
    channel: record.channel ?? null,
    trigger_source: record.triggerSource,
    reason: record.reason ?? null,
    metadata: record.metadata,
    created_at: record.createdAt,
    dedupe_key: `${record.id}`
  };
}

function fromEventRow(row: Record<string, unknown>): AutomationEventRecord {
  return {
    id: String(row.id ?? row.dedupe_key),
    runId: typeof row.run_reference === "string" ? row.run_reference : undefined,
    clientId: String(row.client_reference),
    clientEmail: typeof row.client_email === "string" ? row.client_email : undefined,
    locationId: typeof row.location_reference === "string" ? row.location_reference : undefined,
    barberId: typeof row.barber_reference === "string" ? row.barber_reference : undefined,
    automationType: row.automation_type as AutomationEventRecord["automationType"],
    eventType: row.event_type as AutomationEventRecord["eventType"],
    runStatus: row.run_status as AutomationEventRecord["runStatus"],
    attemptNumber: numeric(row.attempt_number),
    channel: typeof row.channel === "string" ? row.channel as AutomationEventRecord["channel"] : undefined,
    triggerSource: row.trigger_source as AutomationEventRecord["triggerSource"],
    reason: typeof row.reason === "string" ? row.reason : undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: String(row.created_at ?? new Date().toISOString())
  };
}

function toReportingRow(record: AutomationReportingSnapshotRecord) {
  return {
    location_reference: record.locationId,
    eligible_clients: record.eligibleClients,
    due_now_runs: record.dueNowRuns,
    pending_runs: record.pendingRuns,
    queued_runs: record.queuedRuns,
    processing_runs: record.processingRuns,
    retry_scheduled_runs: record.retryScheduledRuns,
    retry_due_runs: record.retryDueRuns,
    completed_runs: record.completedRuns,
    failed_runs: record.failedRuns,
    blocked_runs: record.blockedRuns,
    cancelled_runs: record.cancelledRuns,
    backlog_runs: record.backlogRuns,
    retry_count: record.retryCount,
    completion_rate: record.completionRate,
    failure_rate: record.failureRate,
    channel_breakdown: record.channelBreakdown,
    recent_activity: record.recentActivity,
    updated_at: record.updatedAt
  };
}

function formatDiscountLabel(promotion: Pick<PromotionLookupRow, "discount_type" | "discount_value" | "max_discount_amount">) {
  if (promotion.discount_type === "percent") {
    const cap = promotion.max_discount_amount ? ` up to ${numeric(promotion.max_discount_amount).toFixed(0)}` : "";
    return `${numeric(promotion.discount_value).toFixed(0)}% off${cap}`;
  }

  return `${numeric(promotion.discount_value).toFixed(0)} dollars off`;
}

function buildAutomationEvent(input: {
  runId?: string;
  clientId: string;
  clientEmail?: string;
  locationId?: string;
  barberId?: string;
  automationType: AutomationRunRecord["automationType"];
  eventType: AutomationEventRecord["eventType"];
  runStatus: AutomationRunRecord["status"];
  attemptNumber?: number;
  channel?: AutomationEventRecord["channel"];
  triggerSource: AutomationTriggerSource;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  dedupeSeed: string;
}) {
  return {
    id: stableUuid(`automation-event:${input.dedupeSeed}`),
    runId: input.runId,
    clientId: input.clientId,
    clientEmail: input.clientEmail,
    locationId: input.locationId,
    barberId: input.barberId,
    automationType: input.automationType,
    eventType: input.eventType,
    runStatus: input.runStatus,
    attemptNumber: input.attemptNumber ?? 0,
    channel: input.channel,
    triggerSource: input.triggerSource,
    reason: input.reason,
    metadata: input.metadata ?? {},
    createdAt: input.createdAt
  } satisfies AutomationEventRecord;
}

function mergeEvents(existing: AutomationEventRecord[], incoming: AutomationEventRecord[]) {
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const event of incoming) {
    byId.set(event.id, event);
  }

  return sortEvents([...byId.values()]);
}

function buildScopeLocationIds(
  triggers: AutomationTriggerSnapshotRecord[],
  runs: AutomationRunRecord[],
  fallbackLocationIds: string[]
) {
  return [...new Set([
    ...fallbackLocationIds,
    ...triggers.map((record) => record.locationId).filter((value): value is string => Boolean(value)),
    ...runs.map((record) => record.locationId).filter((value): value is string => Boolean(value))
  ])];
}

function createDefaultRunRecord(draft: AutomationRunDraft, now: string) {
  return {
    id: stableUuid(`automation-run:${draft.dedupeKey}`),
    ...draft,
    status: "pending",
    attemptCount: 0,
    maxAttempts: DEFAULT_AUTOMATION_MAX_ATTEMPTS,
    retryEligible: false,
    terminalFailure: false,
    notificationIds: [],
    diagnostics: {},
    lastTriggerSource: "refresh",
    lastEventAt: now,
    createdAt: now,
    updatedAt: now
  } satisfies AutomationRunRecord;
}

async function readActivePromotions(supabase: SupabaseClient, locationReferences: string[]) {
  const uniqueReferences = [...new Set(locationReferences.filter(Boolean))];
  if (!uniqueReferences.length) {
    return [] as AutomationPromotionCandidate[];
  }

  const locationsResult = await supabase
    .from("locations")
    .select("id, reference_code")
    .in("reference_code", uniqueReferences);

  if (locationsResult.error) {
    throw new AutomationServiceError("Unable to resolve promotion locations for automation.", 500);
  }

  const locations = (locationsResult.data ?? []) as LocationReferenceRow[];
  const locationIds = locations.map((row) => row.id);
  if (!locationIds.length) {
    return [];
  }

  const promotionsResult = await supabase
    .from("promotions")
    .select("id, name, code, shop_id, service_id, barber_id, discount_type, discount_value, max_discount_amount, is_active, starts_at, ends_at")
    .in("shop_id", locationIds);

  if (promotionsResult.error) {
    throw new AutomationServiceError("Unable to load active promotions for automation.", 500);
  }

  const promotions = (promotionsResult.data ?? []) as PromotionLookupRow[];
  const now = new Date().toISOString();
  const activePromotions = promotions.filter((promotion) =>
    promotion.is_active
    && promotion.starts_at <= now
    && promotion.ends_at >= now
  );
  if (!activePromotions.length) {
    return [];
  }

  const serviceIds = [...new Set(activePromotions.map((promotion) => promotion.service_id).filter((value): value is string => Boolean(value)))];
  const barberIds = [...new Set(activePromotions.map((promotion) => promotion.barber_id).filter((value): value is string => Boolean(value)))];
  const [servicesResult, barbersResult] = await Promise.all([
    serviceIds.length
      ? supabase.from("services").select("id, reference_code").in("id", serviceIds)
      : Promise.resolve({ data: [], error: null }),
    barberIds.length
      ? supabase.from("barbers").select("id, reference_code").in("id", barberIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (servicesResult.error || barbersResult.error) {
    throw new AutomationServiceError("Unable to resolve promotion targets for automation.", 500);
  }

  const locationMap = new Map(locations.map((row) => [row.id, row.reference_code ?? row.id]));
  const serviceMap = new Map(((servicesResult.data ?? []) as ServiceReferenceRow[]).map((row) => [row.id, row.reference_code ?? row.id]));
  const barberMap = new Map(((barbersResult.data ?? []) as BarberReferenceRow[]).map((row) => [row.id, row.reference_code ?? row.id]));

  return activePromotions.map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    code: promotion.code ?? undefined,
    shopId: locationMap.get(promotion.shop_id) ?? promotion.shop_id,
    serviceId: promotion.service_id ? serviceMap.get(promotion.service_id) ?? promotion.service_id : undefined,
    barberId: promotion.barber_id ? barberMap.get(promotion.barber_id) ?? promotion.barber_id : undefined,
    discountLabel: formatDiscountLabel(promotion)
  }));
}

function pickPromotionCandidateForClient(
  promotions: AutomationPromotionCandidate[],
  trigger: Pick<AutomationTriggerSnapshotRecord, "locationId" | "barberId">,
  primaryServiceId?: string
) {
  const scoped = promotions.filter((promotion) => !promotion.shopId || !trigger.locationId || promotion.shopId === trigger.locationId);
  if (!scoped.length) {
    return null;
  }

  return [...scoped]
    .map((promotion) => {
      let score = 10;
      if (promotion.shopId && promotion.shopId === trigger.locationId) {
        score += 20;
      }
      if (promotion.barberId && promotion.barberId === trigger.barberId) {
        score += 18;
      }
      if (promotion.serviceId && promotion.serviceId === primaryServiceId) {
        score += 22;
      }
      if (promotion.code) {
        score += 4;
      }

      return { promotion, score };
    })
    .sort((left, right) => right.score - left.score || left.promotion.name.localeCompare(right.promotion.name))[0]?.promotion ?? null;
}

function buildScopedClientPlans(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  clientIds: string[],
  promotions: AutomationPromotionCandidate[]
) {
  const uniqueClientIds = [...new Set(clientIds.filter(Boolean))];

  return uniqueClientIds.map((clientId) => {
    const intelligence = buildClientIntelligenceSnapshot(state, snapshot, clientId);
    const client = getClientRecord(snapshot, clientId);
    if (!intelligence || !client?.email) {
      return null;
    }

    const account = state.loyaltyAccounts.find((entry) => entry.clientId === clientId);
    const pointsBalance = account?.pointsBalance ?? client.loyaltyPoints ?? 0;
    const rewards = buildRewards(pointsBalance);
    const locationId = intelligence.favoriteLocationId ?? getLatestLocationForClient(snapshot, clientId);
    const rebookingRecommendation = state.rebookingRecommendations
      .filter((entry) => entry.clientId === clientId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
    const promotion = pickPromotionCandidateForClient(
      promotions,
      { locationId, barberId: intelligence.favoriteBarberId },
      intelligence.primaryServiceId
    );

    return buildClientAutomationPlan({
      clientId,
      clientEmail: client.email,
      locationId,
      barberId: intelligence.favoriteBarberId,
      intelligence,
      rebookingRecommendation,
      pointsBalance,
      rewards,
      recommendedPromotion: promotion
    });
  }).filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));
}

function reconcileAutomationRuns(
  existingRuns: AutomationRunRecord[],
  desiredDrafts: AutomationRunDraft[],
  scopedClientIds: string[],
  now = new Date().toISOString()
) {
  const scopedClients = new Set(scopedClientIds);
  const scopedExisting = existingRuns.filter((run) => scopedClients.has(run.clientId));
  const desiredByKey = new Map(desiredDrafts.map((draft) => [draft.dedupeKey, draft]));
  const upserts: AutomationRunRecord[] = [];
  const events: AutomationEventRecord[] = [];
  const finalByKey = new Map<string, AutomationRunRecord>();

  for (const run of scopedExisting) {
    if (!desiredByKey.has(run.dedupeKey) && ["pending", "queued", "retry_scheduled", "blocked"].includes(run.status)) {
      const cancelled: AutomationRunRecord = {
        ...run,
        status: "cancelled",
        retryEligible: false,
        cancelledAt: now,
        lastEventAt: now,
        updatedAt: now
      };
      upserts.push(cancelled);
      events.push(buildAutomationEvent({
        runId: cancelled.id,
        clientId: cancelled.clientId,
        clientEmail: cancelled.clientEmail,
        locationId: cancelled.locationId,
        barberId: cancelled.barberId,
        automationType: cancelled.automationType,
        eventType: "run_cancelled",
        runStatus: cancelled.status,
        attemptNumber: cancelled.attemptCount,
        triggerSource: "refresh",
        reason: "Automation is no longer eligible in the current intelligence window.",
        metadata: {
          dedupeKey: cancelled.dedupeKey
        },
        createdAt: now,
        dedupeSeed: `cancelled:${cancelled.id}:${now}`
      }));
      finalByKey.set(cancelled.dedupeKey, cancelled);
      continue;
    }

    finalByKey.set(run.dedupeKey, run);
  }

  for (const draft of desiredDrafts) {
    const existing = finalByKey.get(draft.dedupeKey);
    if (existing && ["completed", "processing", "queued", "retry_scheduled", "blocked", "failed"].includes(existing.status)) {
      finalByKey.set(existing.dedupeKey, existing);
      continue;
    }

    const nextRecord: AutomationRunRecord = existing
      ? {
          ...existing,
          ...draft,
          status: "pending",
          retryEligible: false,
          terminalFailure: false,
          nextRetryAt: undefined,
          retryScheduledAt: undefined,
          processingStartedAt: undefined,
          lastFailureKind: undefined,
          lastDeliveryStatus: undefined,
          lastDeliveryProvider: undefined,
          lastDeliveryAttemptId: undefined,
          lastTriggerSource: "refresh",
          errorMessage: undefined,
          blockedReason: undefined,
          failedAt: undefined,
          cancelledAt: undefined,
          diagnostics: existing.diagnostics ?? {},
          lastEventAt: now,
          updatedAt: now
        }
      : createDefaultRunRecord(draft, now);

    upserts.push(nextRecord);
    events.push(buildAutomationEvent({
      runId: nextRecord.id,
      clientId: nextRecord.clientId,
      clientEmail: nextRecord.clientEmail,
      locationId: nextRecord.locationId,
      barberId: nextRecord.barberId,
      automationType: nextRecord.automationType,
      eventType: "run_queued",
      runStatus: nextRecord.status,
      attemptNumber: nextRecord.attemptCount,
      channel: nextRecord.channel,
      triggerSource: "refresh",
      reason: "Automation was queued from the current intelligence snapshot.",
      metadata: {
        dedupeKey: nextRecord.dedupeKey,
        dueAt: nextRecord.dueAt
      },
      createdAt: now,
      dedupeSeed: `queued:${nextRecord.id}:${now}`
    }));
    finalByKey.set(nextRecord.dedupeKey, nextRecord);
  }

  return {
    upserts,
    events,
    records: sortRuns([...finalByKey.values()].filter((run) => scopedClients.has(run.clientId)))
  };
}

async function persistTriggerSnapshots(supabase: SupabaseClient, triggers: AutomationTriggerSnapshotRecord[]) {
  if (!triggers.length) {
    return;
  }

  const result = await supabase
    .from("automation_trigger_snapshots")
    .upsert(triggers.map(toTriggerRow), { onConflict: "client_reference" });

  if (result.error) {
    throw new AutomationServiceError("Unable to persist automation trigger snapshots.", 500);
  }
}

async function readRunsForClients(supabase: SupabaseClient, clientIds: string[]) {
  if (!clientIds.length) {
    return [] as AutomationRunRecord[];
  }

  const result = await supabase
    .from("automation_runs")
    .select("*")
    .in("client_reference", clientIds);

  if (result.error) {
    throw new AutomationServiceError("Unable to read automation runs.", 500);
  }

  return (result.data ?? []).map((row) => fromRunRow(row as Record<string, unknown>));
}

async function persistAutomationRuns(supabase: SupabaseClient, runs: AutomationRunRecord[]) {
  if (!runs.length) {
    return;
  }

  const result = await supabase
    .from("automation_runs")
    .upsert(runs.map(toRunRow), { onConflict: "dedupe_key" });

  if (result.error) {
    throw new AutomationServiceError("Unable to persist automation runs.", 500);
  }
}

async function readAutomationEventsForClients(supabase: SupabaseClient, clientIds: string[]) {
  if (!clientIds.length) {
    return [] as AutomationEventRecord[];
  }

  const result = await supabase
    .from("automation_events")
    .select("*")
    .in("client_reference", clientIds)
    .order("created_at", { ascending: false });

  if (result.error) {
    throw new AutomationServiceError("Unable to read automation events.", 500);
  }

  return (result.data ?? []).map((row) => fromEventRow(row as Record<string, unknown>));
}

async function persistAutomationEvents(supabase: SupabaseClient, events: AutomationEventRecord[]) {
  if (!events.length) {
    return;
  }

  const result = await supabase
    .from("automation_events")
    .upsert(events.map(toEventRow), { onConflict: "dedupe_key" });

  if (result.error) {
    throw new AutomationServiceError("Unable to persist automation events.", 500);
  }
}

async function persistReportingSnapshots(supabase: SupabaseClient, snapshots: AutomationReportingSnapshotRecord[]) {
  if (!snapshots.length) {
    return;
  }

  const result = await supabase
    .from("automation_reporting_snapshots")
    .upsert(snapshots.map(toReportingRow), { onConflict: "location_reference" });

  if (result.error) {
    throw new AutomationServiceError("Unable to persist automation reporting snapshots.", 500);
  }
}

async function persistNotifications(supabase: SupabaseClient, notifications: ReturnType<typeof appendEngagementNotification>["notifications"]) {
  if (!notifications.length) {
    return;
  }

  const rows = notifications.map((record) => ({
    audience_role: record.role,
    audience_email: record.userEmail,
    client_reference: record.clientId ?? null,
    client_email: record.clientId ? record.userEmail : null,
    barber_reference: record.barberId ?? null,
    barber_email: null,
    location_reference: record.locationId ?? null,
    channel: record.channel,
    notification_type: record.type,
    title: record.title,
    body: record.body,
    status: record.status,
    metadata: {
      source: "phase17_automation",
      notificationId: record.id
    },
    created_at: record.createdAt,
    scheduled_for: record.scheduledFor ?? null,
    dedupe_key: record.id
  }));

  const result = await supabase
    .from("notifications")
    .upsert(rows, { onConflict: "dedupe_key" });

  if (result.error) {
    throw new AutomationServiceError("Unable to persist automation notifications.", 500);
  }
}

function buildSnapshotRefreshEvents(triggers: AutomationTriggerSnapshotRecord[]) {
  return triggers.map((trigger) => buildAutomationEvent({
    clientId: trigger.clientId,
    clientEmail: trigger.clientEmail,
    locationId: trigger.locationId,
    barberId: trigger.barberId,
    automationType: trigger.rebookingReminderEligible
      ? "rebooking_reminder"
      : trigger.reengagementNudgeEligible
        ? "reengagement_nudge"
        : trigger.promotionFollowUpEligible
          ? "promotion_follow_up"
          : "reward_follow_up",
    eventType: "snapshot_refreshed",
    runStatus: trigger.nextAutomationDueAt ? "pending" : "cancelled",
    triggerSource: "refresh",
    reason: "Automation trigger eligibility was refreshed from the current client intelligence state.",
    metadata: {
      clientId: trigger.clientId,
      rebookingWindow: trigger.rebookingWindow,
      churnRisk: trigger.churnRisk,
      reengagementEligible: trigger.reengagementEligible
    },
    createdAt: trigger.updatedAt,
    dedupeSeed: `snapshot:${trigger.clientId}:${trigger.updatedAt}`
  }));
}

function buildReportingSnapshotsForScope(
  triggers: AutomationTriggerSnapshotRecord[],
  runs: AutomationRunRecord[],
  events: AutomationEventRecord[],
  fallbackLocationIds: string[],
  now: string
) {
  return buildAutomationReportingSnapshots({
    locationIds: buildScopeLocationIds(triggers, runs, fallbackLocationIds),
    triggers,
    runs,
    events,
    now
  });
}

async function syncReportingSnapshotsForScope(
  supabase: SupabaseClient | null,
  triggers: AutomationTriggerSnapshotRecord[],
  runs: AutomationRunRecord[],
  events: AutomationEventRecord[],
  fallbackLocationIds: string[],
  now: string
) {
  const snapshots = buildReportingSnapshotsForScope(triggers, runs, events, fallbackLocationIds, now);

  if (!supabase) {
    const locationSet = new Set(snapshots.map((record) => record.locationId));
    demoReportingSnapshots = [
      ...demoReportingSnapshots.filter((record) => !locationSet.has(record.locationId)),
      ...clone(snapshots)
    ];
    return demoReportingSnapshots.filter((record) => locationSet.has(record.locationId));
  }

  await persistReportingSnapshots(supabase, snapshots);
  return snapshots;
}

async function readDeliveryDiagnostics(notificationIds: string[]) {
  const deliveryProvider = await getNotificationDeliveryProvider();
  const [deliveries, attempts] = await Promise.all([
    deliveryProvider.readDeliveries({ notificationIds }),
    deliveryProvider.readAttempts({ notificationIds })
  ]);

  const scopedDeliveries = deliveries.filter((delivery) => notificationIds.includes(delivery.notificationId));
  const scopedAttempts = attempts.filter((attempt) => notificationIds.includes(attempt.notificationId));
  const channels = scopedDeliveries.map((delivery) => {
    const latestAttempt = scopedAttempts
      .filter((attempt) => attempt.notificationId === delivery.notificationId)
      .sort((left, right) => (right.executedAt ?? right.updatedAt).localeCompare(left.executedAt ?? left.updatedAt))[0];

    return {
      notificationId: delivery.notificationId,
      channel: delivery.channel,
      status: latestAttempt?.status ?? delivery.status,
      provider: latestAttempt?.provider ?? delivery.provider,
      attemptId: latestAttempt?.id,
      nextRetryAt: latestAttempt?.nextRetryAt,
      errorMessage: latestAttempt?.errorMessage ?? delivery.errorMessage
    };
  });

  return {
    deliveries: scopedDeliveries,
    attempts: scopedAttempts,
    channels
  };
}

async function syncAutomationScope(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  clientIds: string[]
) {
  const now = new Date().toISOString();
  const scopedClientIds = [...new Set(clientIds.filter(Boolean))];
  const locationIds = scopedClientIds
    .map((clientId) => {
      const intelligence = buildClientIntelligenceSnapshot(state, snapshot, clientId);
      return intelligence?.favoriteLocationId ?? getLatestLocationForClient(snapshot, clientId);
    })
    .filter((value): value is string => Boolean(value));

  const supabase = getSupabase();
  const promotions = supabase ? await readActivePromotions(supabase, locationIds) : [];
  const plans = buildScopedClientPlans(state, snapshot, scopedClientIds, promotions);
  const triggers = plans.map((plan) => plan.trigger);
  const drafts = plans.flatMap((plan) => plan.drafts);
  const refreshEvents = buildSnapshotRefreshEvents(triggers);

  if (!supabase) {
    demoTriggerSnapshots = [
      ...demoTriggerSnapshots.filter((record) => !scopedClientIds.includes(record.clientId)),
      ...clone(triggers)
    ];
    const reconciled = reconcileAutomationRuns(demoRuns, drafts, scopedClientIds);
    const untouched = demoRuns.filter((run) => !scopedClientIds.includes(run.clientId));
    demoRuns = [...untouched, ...reconciled.records];
    demoEvents = mergeEvents(demoEvents, [...refreshEvents, ...reconciled.events]);
    const reporting = await syncReportingSnapshotsForScope(null, triggers, reconciled.records, demoEvents.filter((event) => scopedClientIds.includes(event.clientId)), locationIds, now);

    return {
      triggers: demoTriggerSnapshots.filter((record) => scopedClientIds.includes(record.clientId)),
      runs: sortRuns(demoRuns.filter((run) => scopedClientIds.includes(run.clientId))),
      events: demoEvents.filter((event) => scopedClientIds.includes(event.clientId)),
      reporting
    };
  }

  await persistTriggerSnapshots(supabase, triggers);
  const existingRuns = await readRunsForClients(supabase, scopedClientIds);
  const reconciled = reconcileAutomationRuns(existingRuns, drafts, scopedClientIds);
  await persistAutomationRuns(supabase, reconciled.upserts);
  await persistAutomationEvents(supabase, [...refreshEvents, ...reconciled.events]);
  const events = await readAutomationEventsForClients(supabase, scopedClientIds);
  const reporting = await syncReportingSnapshotsForScope(supabase, triggers, reconciled.records, events, locationIds, now);

  return {
    triggers,
    runs: reconciled.records,
    events,
    reporting
  };
}

function collectScopedClientIds(snapshot: LiveOperationsSnapshot | undefined, locationIds: string[]) {
  const scopedLocations = new Set(locationIds);
  const appointments = snapshot?.appointments ?? [];
  const clientIds = appointments
    .filter((appointment) => !locationIds.length || scopedLocations.has(appointment.locationId))
    .map((appointment) => appointment.clientId);

  return [...new Set(clientIds)];
}

function queueAutomationNotifications(
  state: EngagementState,
  run: AutomationRunRecord,
  createdAt: string
) {
  return appendEngagementNotification(state, {
    role: "client",
    userEmail: run.clientEmail,
    clientId: run.clientId,
    barberId: run.barberId,
    locationId: run.locationId,
    type: run.automationType,
    title: run.title,
    body: run.body,
    channel: run.channel,
    dedupeSeed: `automation:${run.id}`,
    createdAt
  });
}

export async function getClientAutomationSummary(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  clientId: string
): Promise<ClientAutomationSummary> {
  const scoped = await syncAutomationScope(state, snapshot, [clientId]);
  const trigger = scoped.triggers.find((record) => record.clientId === clientId) ?? null;
  const runs = scoped.runs.filter((record) => record.clientId === clientId);

  return buildClientAutomationSummary(trigger, runs);
}

export async function getOwnerAutomationSummary(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  locationIds: string[]
): Promise<OwnerAutomationSummary> {
  const clientIds = collectScopedClientIds(snapshot, locationIds);
  const scoped = await syncAutomationScope(state, snapshot, clientIds);
  const triggers = scoped.triggers.filter((record) => !locationIds.length || (record.locationId ? locationIds.includes(record.locationId) : false));
  const runs = scoped.runs.filter((record) => !locationIds.length || (record.locationId ? locationIds.includes(record.locationId) : false));
  const reporting = scoped.reporting.filter((record) => !locationIds.length || locationIds.includes(record.locationId));

  return buildOwnerAutomationSummary(triggers, runs, { reporting });
}

function isRunDue(run: AutomationRunRecord, now: string) {
  if (run.status === "pending" || run.status === "queued") {
    return run.dueAt <= now;
  }

  if (run.status === "retry_scheduled") {
    return (run.nextRetryAt ?? run.dueAt) <= now;
  }

  return false;
}

function replaceRun(rows: AutomationRunRecord[], nextRun: AutomationRunRecord) {
  const index = rows.findIndex((entry) => entry.id === nextRun.id);
  if (index >= 0) {
    rows[index] = nextRun;
    return;
  }

  rows.push(nextRun);
}

function mergeDemoRuns(scopedClientIds: string[], nextRuns: AutomationRunRecord[]) {
  demoRuns = [
    ...demoRuns.filter((record) => !scopedClientIds.includes(record.clientId)),
    ...sortRuns(nextRuns)
  ];
}

async function persistRunUpdate(supabase: SupabaseClient | null, run: AutomationRunRecord, scopedClientIds: string[], processedRuns: AutomationRunRecord[]) {
  if (supabase) {
    await persistAutomationRuns(supabase, [run]);
  } else {
    replaceRun(processedRuns, run);
    mergeDemoRuns(scopedClientIds, processedRuns);
  }
}

async function persistEventUpdates(supabase: SupabaseClient | null, events: AutomationEventRecord[]) {
  if (!events.length) {
    return;
  }

  if (supabase) {
    await persistAutomationEvents(supabase, events);
    return;
  }

  demoEvents = mergeEvents(demoEvents, events);
}

async function processAutomationRunsCore(args: {
  state: EngagementState;
  snapshot: LiveOperationsSnapshot | undefined;
  locationIds: string[];
  triggerSource: AutomationTriggerSource;
}) {
  const now = new Date().toISOString();
  const clientIds = collectScopedClientIds(args.snapshot, args.locationIds);
  const scoped = await syncAutomationScope(args.state, args.snapshot, clientIds);
  const scopedRuns = scoped.runs.filter((record) => !args.locationIds.length || (record.locationId ? args.locationIds.includes(record.locationId) : false));
  const dueRuns = scopedRuns.filter((run) => isRunDue(run, now));
  const supabase = getSupabase();

  let currentState = args.state;
  const processedRuns = [...scopedRuns];
  let scopedEvents = [...scoped.events];
  let completed = 0;
  let failed = 0;
  let retried = 0;

  for (const run of dueRuns) {
    const startedAt = new Date().toISOString();
    const processingRun: AutomationRunRecord = {
      ...run,
      status: "processing",
      attemptCount: run.attemptCount + 1,
      processingStartedAt: startedAt,
      queuedAt: run.queuedAt ?? startedAt,
      lastTriggerSource: args.triggerSource,
      lastEventAt: startedAt,
      updatedAt: startedAt
    };

    await persistRunUpdate(supabase, processingRun, clientIds, processedRuns);
    replaceRun(processedRuns, processingRun);

    const startedEvent = buildAutomationEvent({
      runId: processingRun.id,
      clientId: processingRun.clientId,
      clientEmail: processingRun.clientEmail,
      locationId: processingRun.locationId,
      barberId: processingRun.barberId,
      automationType: processingRun.automationType,
      eventType: "run_started",
      runStatus: processingRun.status,
      attemptNumber: processingRun.attemptCount,
      channel: processingRun.channel,
      triggerSource: args.triggerSource,
      reason: "Automation execution started.",
      metadata: {
        dedupeKey: processingRun.dedupeKey
      },
      createdAt: startedAt,
      dedupeSeed: `started:${processingRun.id}:${processingRun.attemptCount}`
    });
    await persistEventUpdates(supabase, [startedEvent]);
    scopedEvents = mergeEvents(scopedEvents, [startedEvent]);

    try {
      const notificationResult = queueAutomationNotifications(currentState, processingRun, startedAt);
      const notificationIds = notificationResult.notifications.map((entry) => entry.id);
      if (supabase) {
        await persistNotifications(supabase, notificationResult.notifications);
      } else {
        setEngagementState(notificationResult.state);
      }

      const deliveryProvider = await getNotificationDeliveryProvider();
      await deliveryProvider.syncNotifications(notificationResult.notifications);
      const diagnostics = await readDeliveryDiagnostics(notificationIds);
      const primaryDiagnostic = diagnostics.channels.find((channel) => channel.notificationId === notificationIds[0]) ?? diagnostics.channels[0];
      const resolvedAt = new Date().toISOString();
      const resolution = resolveAutomationExecutionResolution({
        now: resolvedAt,
        attemptCount: processingRun.attemptCount,
        maxAttempts: processingRun.maxAttempts,
        triggerSource: args.triggerSource,
        primaryDeliveryStatus: primaryDiagnostic?.status,
        primaryDeliveryProvider: primaryDiagnostic?.provider,
        primaryDeliveryAttemptId: primaryDiagnostic?.attemptId,
        nextRetryAt: primaryDiagnostic?.nextRetryAt,
        blockedReason: primaryDiagnostic?.status === "placeholder" ? primaryDiagnostic.errorMessage : undefined,
        errorMessage: primaryDiagnostic?.errorMessage,
        notificationIds,
        diagnostics: {
          channels: diagnostics.channels.map((channel) => ({
            notificationId: channel.notificationId,
            channel: channel.channel,
            status: channel.status,
            provider: channel.provider ?? null,
            nextRetryAt: channel.nextRetryAt ?? null,
            errorMessage: channel.errorMessage ?? null
          })),
          primaryNotificationId: notificationIds[0] ?? null
        }
      });

      const nextRun: AutomationRunRecord = {
        ...processingRun,
        ...resolution,
        notificationIds,
        notificationId: notificationIds[0],
        diagnostics: resolution.diagnostics
      };
      await persistRunUpdate(supabase, nextRun, clientIds, processedRuns);
      replaceRun(processedRuns, nextRun);
      currentState = notificationResult.state;

      const completionEventType = nextRun.status === "completed"
        ? "run_completed"
        : nextRun.status === "retry_scheduled"
          ? "retry_scheduled"
          : nextRun.status === "blocked"
            ? "run_failed"
            : "run_failed";
      const runEvent = buildAutomationEvent({
        runId: nextRun.id,
        clientId: nextRun.clientId,
        clientEmail: nextRun.clientEmail,
        locationId: nextRun.locationId,
        barberId: nextRun.barberId,
        automationType: nextRun.automationType,
        eventType: completionEventType,
        runStatus: nextRun.status,
        attemptNumber: nextRun.attemptCount,
        channel: nextRun.channel,
        triggerSource: args.triggerSource,
        reason: nextRun.blockedReason ?? nextRun.errorMessage,
        metadata: {
          dedupeKey: nextRun.dedupeKey,
          notificationIds
        },
        createdAt: resolvedAt,
        dedupeSeed: `${completionEventType}:${nextRun.id}:${nextRun.attemptCount}`
      });
      const deliveryEvents = diagnostics.channels.map((channel) => buildAutomationEvent({
        runId: nextRun.id,
        clientId: nextRun.clientId,
        clientEmail: nextRun.clientEmail,
        locationId: nextRun.locationId,
        barberId: nextRun.barberId,
        automationType: nextRun.automationType,
        eventType: channel.status === "delivered" ? "delivery_succeeded" : "delivery_failed",
        runStatus: nextRun.status,
        attemptNumber: nextRun.attemptCount,
        channel: channel.channel,
        triggerSource: args.triggerSource,
        reason: channel.errorMessage,
        metadata: {
          notificationId: channel.notificationId ?? null,
          provider: channel.provider ?? null,
          status: channel.status,
          nextRetryAt: channel.nextRetryAt ?? null
        },
        createdAt: resolvedAt,
        dedupeSeed: `delivery:${nextRun.id}:${nextRun.attemptCount}:${channel.channel}:${channel.status}`
      }));
      await persistEventUpdates(supabase, [runEvent, ...deliveryEvents]);
      scopedEvents = mergeEvents(scopedEvents, [runEvent, ...deliveryEvents]);

      if (nextRun.status === "completed") {
        completed += 1;
      } else if (nextRun.status === "retry_scheduled") {
        retried += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      const failedAt = new Date().toISOString();
      const resolution = resolveAutomationExecutionResolution({
        now: failedAt,
        attemptCount: processingRun.attemptCount,
        maxAttempts: processingRun.maxAttempts,
        triggerSource: args.triggerSource,
        errorMessage: error instanceof Error ? error.message : "Automation processing failed."
      });
      const failedRun: AutomationRunRecord = {
        ...processingRun,
        ...resolution,
        notificationIds: processingRun.notificationIds
      };
      await persistRunUpdate(supabase, failedRun, clientIds, processedRuns);
      replaceRun(processedRuns, failedRun);

      const failedEvent = buildAutomationEvent({
        runId: failedRun.id,
        clientId: failedRun.clientId,
        clientEmail: failedRun.clientEmail,
        locationId: failedRun.locationId,
        barberId: failedRun.barberId,
        automationType: failedRun.automationType,
        eventType: failedRun.status === "retry_scheduled" ? "retry_scheduled" : "run_failed",
        runStatus: failedRun.status,
        attemptNumber: failedRun.attemptCount,
        channel: failedRun.channel,
        triggerSource: args.triggerSource,
        reason: failedRun.errorMessage,
        metadata: {
          dedupeKey: failedRun.dedupeKey
        },
        createdAt: failedAt,
        dedupeSeed: `failure:${failedRun.id}:${failedRun.attemptCount}:${failedRun.status}`
      });
      await persistEventUpdates(supabase, [failedEvent]);
      scopedEvents = mergeEvents(scopedEvents, [failedEvent]);

      if (failedRun.status === "retry_scheduled") {
        retried += 1;
      } else {
        failed += 1;
      }
    }
  }

  const reporting = await syncReportingSnapshotsForScope(
    supabase,
    scoped.triggers.filter((record) => !args.locationIds.length || (record.locationId ? args.locationIds.includes(record.locationId) : false)),
    processedRuns,
    scopedEvents.filter((event) => !args.locationIds.length || (event.locationId ? args.locationIds.includes(event.locationId) : false)),
    args.locationIds,
    new Date().toISOString()
  );

  const summary = buildOwnerAutomationSummary(
    scoped.triggers.filter((record) => !args.locationIds.length || (record.locationId ? args.locationIds.includes(record.locationId) : false)),
    processedRuns,
    { reporting }
  );

  return {
    summary,
    processed: {
      completed,
      failed,
      retried,
      due: dueRuns.length
    }
  };
}

export async function processOwnerAutomationRuns(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  locationIds: string[]
) {
  return processAutomationRunsCore({
    state,
    snapshot,
    locationIds,
    triggerSource: "manual"
  });
}

export async function processBackgroundAutomationRuns(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  locationIds: string[]
) {
  return processAutomationRunsCore({
    state,
    snapshot,
    locationIds,
    triggerSource: "background"
  });
}

export async function enrichClientEngagementSummaryWithAutomation(
  summary: Omit<ClientEngagementSummary, "automation">,
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined
): Promise<ClientEngagementSummary> {
  return {
    ...summary,
    automation: await getClientAutomationSummary(state, snapshot, summary.clientId)
  };
}
