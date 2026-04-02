import type {
  AutomationChannelSummary,
  AutomationDeliveryStatus,
  AutomationEventType,
  AutomationFailureKind,
  AutomationReportingSnapshotRecord,
  AutomationRunRecord,
  AutomationRunStatus,
  AutomationTriggerSource,
  AutomationTriggerSnapshotRecord,
  AutomationType,
  ClientAutomationSummary,
  ClientIntelligenceSnapshotRecord,
  ClientRewardOption,
  OwnerAutomationSummary,
  RebookingRecommendationRecord
} from "@/types/engagement";

export type AutomationPromotionCandidate = {
  id: string;
  name: string;
  code?: string;
  shopId?: string;
  serviceId?: string;
  barberId?: string;
  discountLabel: string;
};

export type ClientAutomationPlanInput = {
  clientId: string;
  clientEmail: string;
  locationId?: string;
  barberId?: string;
  intelligence: ClientIntelligenceSnapshotRecord;
  rebookingRecommendation?: RebookingRecommendationRecord | null;
  pointsBalance: number;
  rewards: ClientRewardOption[];
  recommendedPromotion?: AutomationPromotionCandidate | null;
};

export type AutomationRunDraft = Omit<
  AutomationRunRecord,
  | "id"
  | "status"
  | "attemptCount"
  | "maxAttempts"
  | "retryEligible"
  | "terminalFailure"
  | "nextRetryAt"
  | "retryScheduledAt"
  | "processingStartedAt"
  | "lastFailureKind"
  | "lastTriggerSource"
  | "lastDeliveryStatus"
  | "lastDeliveryProvider"
  | "lastDeliveryAttemptId"
  | "notificationIds"
  | "notificationId"
  | "blockedReason"
  | "errorMessage"
  | "diagnostics"
  | "lastEventAt"
  | "queuedAt"
  | "completedAt"
  | "failedAt"
  | "cancelledAt"
  | "createdAt"
  | "updatedAt"
>;

export type ClientAutomationPlan = {
  trigger: AutomationTriggerSnapshotRecord;
  drafts: AutomationRunDraft[];
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function sortByDueAt<T extends { dueAt: string }>(rows: T[]) {
  return [...rows].sort((left, right) => left.dueAt.localeCompare(right.dueAt));
}

function sortRuns(rows: AutomationRunRecord[]) {
  return [...rows].sort((left, right) => {
    const leftValue = left.updatedAt ?? left.createdAt;
    const rightValue = right.updatedAt ?? right.createdAt;
    return rightValue.localeCompare(leftValue);
  });
}

function firstDefined<T>(...values: Array<T | null | undefined>) {
  return values.find((value) => value !== undefined && value !== null);
}

function formatDateBucket(iso: string) {
  return iso.slice(0, 10);
}

function addDays(iso: string, days: number) {
  const next = new Date(iso);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function addMinutes(iso: string, minutes: number) {
  const next = new Date(iso);
  next.setMinutes(next.getMinutes() + minutes);
  return next.toISOString();
}

function asImmediateDueAt(referenceTime: string) {
  return addDays(referenceTime, 0);
}

function countByStatus(runs: AutomationRunRecord[], status: AutomationRunStatus) {
  return runs.filter((run) => run.status === status).length;
}

function sumChannelBreakdowns(rows: AutomationChannelSummary[]) {
  const map = new Map<AutomationChannelSummary["channel"], AutomationChannelSummary>();

  for (const row of rows) {
    const existing = map.get(row.channel);
    if (existing) {
      existing.delivered += row.delivered;
      existing.failed += row.failed;
      existing.retrying += row.retrying;
      existing.queued += row.queued;
      existing.placeholder += row.placeholder;
      continue;
    }

    map.set(row.channel, { ...row });
  }

  return [...map.values()].sort((left, right) => left.channel.localeCompare(right.channel));
}

export interface AutomationExecutionResolutionInput {
  now: string;
  attemptCount: number;
  maxAttempts: number;
  triggerSource: AutomationTriggerSource;
  primaryDeliveryStatus?: AutomationDeliveryStatus;
  primaryDeliveryProvider?: string;
  primaryDeliveryAttemptId?: string;
  nextRetryAt?: string;
  blockedReason?: string;
  errorMessage?: string;
  notificationIds?: string[];
  diagnostics?: Record<string, unknown>;
}

export interface AutomationExecutionResolution {
  status: AutomationRunStatus;
  retryEligible: boolean;
  terminalFailure: boolean;
  nextRetryAt?: string;
  retryScheduledAt?: string;
  lastFailureKind?: AutomationFailureKind;
  lastTriggerSource: AutomationTriggerSource;
  lastDeliveryStatus?: AutomationDeliveryStatus;
  lastDeliveryProvider?: string;
  lastDeliveryAttemptId?: string;
  notificationIds: string[];
  blockedReason?: string;
  errorMessage?: string;
  diagnostics: Record<string, unknown>;
  completedAt?: string;
  failedAt?: string;
  updatedAt: string;
  lastEventAt: string;
}

export function resolveAutomationExecutionResolution(input: AutomationExecutionResolutionInput): AutomationExecutionResolution {
  const nextRetryAt = input.nextRetryAt ?? addMinutes(input.now, input.primaryDeliveryStatus === "queued" ? 5 : 15);
  const base = {
    retryEligible: false,
    terminalFailure: false,
    lastFailureKind: undefined,
    lastTriggerSource: input.triggerSource,
    lastDeliveryStatus: input.primaryDeliveryStatus,
    lastDeliveryProvider: input.primaryDeliveryProvider,
    lastDeliveryAttemptId: input.primaryDeliveryAttemptId,
    notificationIds: input.notificationIds ?? [],
    blockedReason: input.blockedReason,
    errorMessage: input.errorMessage,
    diagnostics: input.diagnostics ?? {},
    updatedAt: input.now,
    lastEventAt: input.now
  } satisfies Omit<AutomationExecutionResolution, "status">;

  if (input.primaryDeliveryStatus === "delivered") {
    return {
      ...base,
      status: "completed",
      completedAt: input.now
    };
  }

  if (input.primaryDeliveryStatus === "placeholder") {
    return {
      ...base,
      status: "blocked",
      lastFailureKind: "blocked",
      blockedReason: input.blockedReason ?? input.errorMessage ?? "Delivery is blocked until the configured channel becomes available."
    };
  }

  if (input.primaryDeliveryStatus === "queued" || input.primaryDeliveryStatus === "retrying") {
    return {
      ...base,
      status: "retry_scheduled",
      retryEligible: true,
      nextRetryAt,
      retryScheduledAt: input.now,
      lastFailureKind: "transient"
    };
  }

  const retryAllowed = input.attemptCount < input.maxAttempts;
  if (retryAllowed) {
    return {
      ...base,
      status: "retry_scheduled",
      retryEligible: true,
      nextRetryAt,
      retryScheduledAt: input.now,
      lastFailureKind: "transient",
      failedAt: input.now
    };
  }

  return {
    ...base,
    status: "failed",
    terminalFailure: true,
    lastFailureKind: "terminal",
    failedAt: input.now
  };
}

function buildRewardFollowUp(pointsBalance: number, rewards: ClientRewardOption[]) {
  const nextLockedReward = rewards.find((reward) => !reward.unlocked);
  if (!nextLockedReward) {
    return {
      title: "You have a reward ready to use",
      body: "A loyalty reward is already unlocked. Use it on the next booking to keep your BVRB3R rhythm moving.",
      pointsGap: 0
    };
  }

  const pointsGap = Math.max(nextLockedReward.pointsRequired - pointsBalance, 0);
  return {
    title: pointsGap === 0 ? "You have a reward ready to use" : "You are close to your next BVRB3R reward",
    body: pointsGap === 0
      ? `${nextLockedReward.title} is unlocked and ready to use on your next booking.`
      : `${nextLockedReward.title} is only ${pointsGap} point${pointsGap === 1 ? "" : "s"} away. One more booked visit or review can get it over the line.`,
    pointsGap
  };
}

function formatPromotionLabel(promotion: AutomationPromotionCandidate) {
  if (promotion.code) {
    return `${promotion.name} (${promotion.code})`;
  }

  return promotion.name;
}

export function buildClientAutomationPlan(input: ClientAutomationPlanInput): ClientAutomationPlan {
  const reasons: Partial<Record<AutomationType, string>> = {};
  const drafts: AutomationRunDraft[] = [];
  const referenceTime = input.intelligence.updatedAt;
  const rewardFollowUp = buildRewardFollowUp(input.pointsBalance, input.rewards);

  const rebookingReminderEligible =
    input.intelligence.activeAppointmentCount === 0
    && input.intelligence.completedVisitCount > 0
    && (input.intelligence.rebookingWindow === "due_soon" || input.intelligence.rebookingWindow === "due_now");
  if (rebookingReminderEligible) {
    const dueAt = firstDefined(
      input.rebookingRecommendation?.remindAt,
      input.intelligence.nextDueAt,
      asImmediateDueAt(referenceTime)
    ) ?? referenceTime;
    reasons.rebooking_reminder = input.rebookingRecommendation?.reason ?? input.intelligence.explanation;
    drafts.push({
      automationType: "rebooking_reminder",
      clientId: input.clientId,
      clientEmail: input.clientEmail,
      locationId: input.locationId ?? input.intelligence.favoriteLocationId,
      barberId: input.barberId ?? input.intelligence.favoriteBarberId,
      promotionId: undefined,
      title: "Time to lock your next cut",
      body: input.rebookingRecommendation?.message ?? input.intelligence.nextBestAction,
      channel: "in_app",
      dueAt,
      dedupeKey: `rebooking:${input.clientId}:${formatDateBucket(dueAt)}:${input.intelligence.favoriteBarberId ?? "open"}`,
      payload: {
        reason: reasons.rebooking_reminder,
        nextDueAt: input.intelligence.nextDueAt ?? null
      }
    });
  }

  const reengagementNudgeEligible =
    input.intelligence.activeAppointmentCount === 0
    && input.intelligence.reengagementEligible
    && (input.intelligence.churnRisk === "medium" || input.intelligence.churnRisk === "high")
    && (input.intelligence.rebookingWindow === "due_now" || input.intelligence.rebookingWindow === "overdue");
  if (reengagementNudgeEligible) {
    const dueAt = asImmediateDueAt(referenceTime);
    reasons.reengagement_nudge = input.intelligence.explanation;
    drafts.push({
      automationType: "reengagement_nudge",
      clientId: input.clientId,
      clientEmail: input.clientEmail,
      locationId: input.locationId ?? input.intelligence.favoriteLocationId,
      barberId: input.barberId ?? input.intelligence.favoriteBarberId,
      promotionId: undefined,
      title: "Your chair rhythm needs a save",
      body: input.intelligence.nextBestAction,
      channel: "in_app",
      dueAt,
      dedupeKey: `reengagement:${input.clientId}:${input.intelligence.rebookingWindow}:${formatDateBucket(dueAt)}`,
      payload: {
        churnRisk: input.intelligence.churnRisk,
        churnScore: input.intelligence.churnScore,
        reason: reasons.reengagement_nudge
      }
    });
  }

  const promotionFollowUpEligible =
    Boolean(input.recommendedPromotion)
    && input.intelligence.activeAppointmentCount === 0
    && (input.intelligence.reengagementEligible || ["due_soon", "due_now", "overdue"].includes(input.intelligence.rebookingWindow));
  if (promotionFollowUpEligible && input.recommendedPromotion) {
    const dueAt = firstDefined(
      input.rebookingRecommendation?.remindAt,
      input.intelligence.nextDueAt,
      asImmediateDueAt(referenceTime)
    ) ?? referenceTime;
    reasons.promotion_follow_up = `${formatPromotionLabel(input.recommendedPromotion)} matches the current rebooking window and shop or service pattern.`;
    drafts.push({
      automationType: "promotion_follow_up",
      clientId: input.clientId,
      clientEmail: input.clientEmail,
      locationId: input.locationId ?? input.recommendedPromotion.shopId ?? input.intelligence.favoriteLocationId,
      barberId: input.barberId ?? input.recommendedPromotion.barberId ?? input.intelligence.favoriteBarberId,
      promotionId: input.recommendedPromotion.id,
      title: "A valid offer is ready for your next booking",
      body: `${formatPromotionLabel(input.recommendedPromotion)} is live right now. Use it while your current booking window is still open.`,
      channel: "in_app",
      dueAt,
      dedupeKey: `promotion:${input.clientId}:${input.recommendedPromotion.id}:${formatDateBucket(dueAt)}`,
      payload: {
        promotionId: input.recommendedPromotion.id,
        promotionName: input.recommendedPromotion.name,
        promotionCode: input.recommendedPromotion.code ?? null,
        discountLabel: input.recommendedPromotion.discountLabel,
        reason: reasons.promotion_follow_up
      }
    });
  }

  const rewardFollowUpEligible =
    input.intelligence.activeAppointmentCount === 0
    && (rewardFollowUp.pointsGap === 0 || rewardFollowUp.pointsGap <= 25);
  if (rewardFollowUpEligible) {
    const dueAt = asImmediateDueAt(referenceTime);
    reasons.reward_follow_up = rewardFollowUp.body;
    drafts.push({
      automationType: "reward_follow_up",
      clientId: input.clientId,
      clientEmail: input.clientEmail,
      locationId: input.locationId ?? input.intelligence.favoriteLocationId,
      barberId: input.barberId ?? input.intelligence.favoriteBarberId,
      promotionId: undefined,
      title: rewardFollowUp.title,
      body: rewardFollowUp.body,
      channel: "in_app",
      dueAt,
      dedupeKey: `reward:${input.clientId}:${rewardFollowUp.pointsGap}:${formatDateBucket(dueAt)}`,
      payload: {
        pointsBalance: round(input.pointsBalance),
        pointsGap: rewardFollowUp.pointsGap,
        reason: reasons.reward_follow_up
      }
    });
  }

  const sortedDrafts = sortByDueAt(drafts);

  return {
    trigger: {
      clientId: input.clientId,
      clientEmail: input.clientEmail,
      locationId: input.locationId ?? input.intelligence.favoriteLocationId,
      barberId: input.barberId ?? input.intelligence.favoriteBarberId,
      recommendedPromotionId: input.recommendedPromotion?.id,
      rebookingWindow: input.intelligence.rebookingWindow,
      churnRisk: input.intelligence.churnRisk,
      churnScore: input.intelligence.churnScore,
      reengagementEligible: input.intelligence.reengagementEligible,
      loyaltySegment: input.intelligence.loyaltySegment,
      activeAppointmentCount: input.intelligence.activeAppointmentCount,
      nextDueAt: input.intelligence.nextDueAt,
      rebookingReminderEligible,
      reengagementNudgeEligible,
      promotionFollowUpEligible,
      rewardFollowUpEligible,
      nextAutomationDueAt: sortedDrafts[0]?.dueAt,
      automationReasons: reasons,
      updatedAt: referenceTime
    },
    drafts: sortedDrafts
  };
}

export function buildClientAutomationSummary(
  trigger: AutomationTriggerSnapshotRecord | null,
  runs: AutomationRunRecord[]
): ClientAutomationSummary {
  const sorted = sortRuns(runs);
  const nextAutomation = sortByDueAt(
    runs.filter((run) => run.status === "pending" || run.status === "queued" || run.status === "retry_scheduled")
  )[0];

  return {
    eligibleAutomationCount: trigger
      ? [
          trigger.rebookingReminderEligible,
          trigger.reengagementNudgeEligible,
          trigger.promotionFollowUpEligible,
          trigger.rewardFollowUpEligible
        ].filter(Boolean).length
      : 0,
    pendingRuns: runs.filter((run) => run.status === "pending" || run.status === "queued").length,
    processingRuns: countByStatus(runs, "processing"),
    retryScheduledRuns: countByStatus(runs, "retry_scheduled"),
    completedRuns: countByStatus(runs, "completed"),
    failedRuns: countByStatus(runs, "failed"),
    blockedRuns: countByStatus(runs, "blocked"),
    nextAutomation,
    recentRuns: sorted.slice(0, 4)
  };
}

export interface OwnerAutomationSummaryOptions {
  now?: string;
  reporting?: AutomationReportingSnapshotRecord[];
}

export function buildOwnerAutomationSummary(
  triggers: AutomationTriggerSnapshotRecord[],
  runs: AutomationRunRecord[],
  options: OwnerAutomationSummaryOptions = {}
): OwnerAutomationSummary {
  const sortedRuns = sortRuns(runs);
  const now = options.now ?? new Date().toISOString();
  const reporting = options.reporting ?? [];
  const channelBreakdown = reporting.length
    ? sumChannelBreakdowns(reporting.flatMap((row) => row.channelBreakdown))
    : [];
  const recentActivity = reporting.length
    ? reporting.flatMap((row) => row.recentActivity).sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 8)
    : sortedRuns.slice(0, 8).map((run) => {
        const eventType: AutomationEventType = run.status === "completed"
          ? "run_completed"
          : run.status === "failed"
            ? "run_failed"
            : run.status === "cancelled"
              ? "run_cancelled"
              : run.status === "retry_scheduled"
                ? "retry_scheduled"
                : run.status === "processing"
                  ? "run_started"
                  : "run_queued";

        return {
          eventId: `run-${run.id}`,
          runId: run.id,
          clientId: run.clientId,
          clientEmail: run.clientEmail,
          automationType: run.automationType,
          status: run.status,
          eventType,
          triggerSource: run.lastTriggerSource ?? "manual",
          reason: run.blockedReason ?? run.errorMessage,
          createdAt: run.lastEventAt ?? run.updatedAt
        };
      });
  const completionRate = reporting.length
    ? Math.round(reporting.reduce((sum, row) => sum + row.completionRate, 0) / reporting.length)
    : (() => {
        const completed = countByStatus(runs, "completed");
        const terminal = completed + countByStatus(runs, "failed") + countByStatus(runs, "blocked");
        return terminal ? Math.round((completed / terminal) * 100) : 0;
      })();
  const failureRate = reporting.length
    ? Math.round(reporting.reduce((sum, row) => sum + row.failureRate, 0) / reporting.length)
    : (() => {
        const failed = countByStatus(runs, "failed") + countByStatus(runs, "blocked");
        const terminal = countByStatus(runs, "completed") + failed;
        return terminal ? Math.round((failed / terminal) * 100) : 0;
      })();
  const topPendingClients = sortByDueAt(
    runs.filter((run) => run.status === "pending" || run.status === "queued" || run.status === "retry_scheduled")
  ).slice(0, 6).map((run) => ({
    clientId: run.clientId,
    clientEmail: run.clientEmail,
    automationType: run.automationType,
    dueAt: run.dueAt,
    status: run.status,
    title: run.title
  }));

  return {
    eligibleClients: triggers.filter((trigger) =>
      trigger.rebookingReminderEligible
      || trigger.reengagementNudgeEligible
      || trigger.promotionFollowUpEligible
      || trigger.rewardFollowUpEligible
    ).length,
    pendingRuns: runs.filter((run) => run.status === "pending" || run.status === "queued").length,
    queuedRuns: countByStatus(runs, "queued"),
    dueNowRuns: runs.filter((run) =>
      (run.status === "pending" && run.dueAt <= now)
      || (run.status === "retry_scheduled" && (run.nextRetryAt ?? run.dueAt) <= now)
    ).length,
    processingRuns: countByStatus(runs, "processing"),
    retryScheduledRuns: countByStatus(runs, "retry_scheduled"),
    retryDueRuns: runs.filter((run) => run.status === "retry_scheduled" && (run.nextRetryAt ?? run.dueAt) <= now).length,
    completedRuns: countByStatus(runs, "completed"),
    failedRuns: countByStatus(runs, "failed"),
    blockedRuns: countByStatus(runs, "blocked"),
    cancelledRuns: countByStatus(runs, "cancelled"),
    retryCount: reporting.length ? reporting.reduce((sum, row) => sum + row.retryCount, 0) : runs.reduce((sum, run) => sum + Math.max(run.attemptCount - 1, 0), 0),
    backlogRuns: reporting.length ? reporting.reduce((sum, row) => sum + row.backlogRuns, 0) : runs.filter((run) => ["pending", "queued", "processing", "retry_scheduled"].includes(run.status)).length,
    completionRate,
    failureRate,
    rebookingReminderEligible: triggers.filter((trigger) => trigger.rebookingReminderEligible).length,
    reengagementEligible: triggers.filter((trigger) => trigger.reengagementNudgeEligible).length,
    promotionEligible: triggers.filter((trigger) => trigger.promotionFollowUpEligible).length,
    rewardEligible: triggers.filter((trigger) => trigger.rewardFollowUpEligible).length,
    channelBreakdown,
    recentActivity,
    recentRuns: sortedRuns.slice(0, 8),
    topPendingClients
  };
}
