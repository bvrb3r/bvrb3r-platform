import type {
  AutomationChannelSummary,
  AutomationDeliveryStatus,
  AutomationEventRecord,
  AutomationReportingSnapshotRecord,
  AutomationRunRecord,
  AutomationTriggerSnapshotRecord,
  NotificationChannel
} from "@/types/engagement";

type AutomationChannelDiagnostic = {
  notificationId?: string;
  channel: NotificationChannel;
  status: AutomationDeliveryStatus;
  provider?: string;
  nextRetryAt?: string;
  errorMessage?: string;
};

function getChannelDiagnostics(run: AutomationRunRecord): AutomationChannelDiagnostic[] {
  const channels = run.diagnostics?.channels;
  if (!Array.isArray(channels)) {
    return [];
  }

  return channels.filter((entry): entry is AutomationChannelDiagnostic => (
    Boolean(entry)
    && typeof entry === "object"
    && typeof (entry as AutomationChannelDiagnostic).channel === "string"
    && typeof (entry as AutomationChannelDiagnostic).status === "string"
  ));
}

function createEmptyChannelSummary(channel: NotificationChannel): AutomationChannelSummary {
  return {
    channel,
    delivered: 0,
    failed: 0,
    retrying: 0,
    queued: 0,
    placeholder: 0
  };
}

function incrementChannelSummary(summary: AutomationChannelSummary, status: AutomationDeliveryStatus) {
  if (status === "delivered") {
    summary.delivered += 1;
    return;
  }

  if (status === "failed") {
    summary.failed += 1;
    return;
  }

  if (status === "retrying") {
    summary.retrying += 1;
    return;
  }

  if (status === "placeholder") {
    summary.placeholder += 1;
    return;
  }

  summary.queued += 1;
}

function calculateCompletionRate(runs: AutomationRunRecord[]) {
  const completed = runs.filter((run) => run.status === "completed").length;
  const terminal = completed + runs.filter((run) => run.status === "failed" || run.status === "blocked").length;
  return terminal ? Math.round((completed / terminal) * 100) : 0;
}

function calculateFailureRate(runs: AutomationRunRecord[]) {
  const failed = runs.filter((run) => run.status === "failed" || run.status === "blocked").length;
  const terminal = runs.filter((run) => run.status === "completed" || run.status === "failed" || run.status === "blocked").length;
  return terminal ? Math.round((failed / terminal) * 100) : 0;
}

export function buildAutomationReportingSnapshots(args: {
  locationIds: string[];
  triggers: AutomationTriggerSnapshotRecord[];
  runs: AutomationRunRecord[];
  events: AutomationEventRecord[];
  now?: string;
}): AutomationReportingSnapshotRecord[] {
  const now = args.now ?? new Date().toISOString();

  return [...new Set(args.locationIds.filter(Boolean))].map((locationId) => {
    const scopedTriggers = args.triggers.filter((trigger) => trigger.locationId === locationId);
    const scopedRuns = args.runs.filter((run) => run.locationId === locationId);
    const scopedEvents = args.events
      .filter((event) => event.locationId === locationId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const channelMap = new Map<NotificationChannel, AutomationChannelSummary>();

    for (const run of scopedRuns) {
      const channels = getChannelDiagnostics(run);
      if (!channels.length && run.lastDeliveryStatus) {
        const summary = channelMap.get(run.channel) ?? createEmptyChannelSummary(run.channel);
        incrementChannelSummary(summary, run.lastDeliveryStatus);
        channelMap.set(run.channel, summary);
        continue;
      }

      for (const diagnostic of channels) {
        const summary = channelMap.get(diagnostic.channel) ?? createEmptyChannelSummary(diagnostic.channel);
        incrementChannelSummary(summary, diagnostic.status);
        channelMap.set(diagnostic.channel, summary);
      }
    }

    return {
      locationId,
      eligibleClients: scopedTriggers.filter((trigger) =>
        trigger.rebookingReminderEligible
        || trigger.reengagementNudgeEligible
        || trigger.promotionFollowUpEligible
        || trigger.rewardFollowUpEligible
      ).length,
      dueNowRuns: scopedRuns.filter((run) =>
        (run.status === "pending" && run.dueAt <= now)
        || (run.status === "retry_scheduled" && (run.nextRetryAt ?? run.dueAt) <= now)
      ).length,
      pendingRuns: scopedRuns.filter((run) => run.status === "pending" || run.status === "queued").length,
      queuedRuns: scopedRuns.filter((run) => run.status === "queued").length,
      processingRuns: scopedRuns.filter((run) => run.status === "processing").length,
      retryScheduledRuns: scopedRuns.filter((run) => run.status === "retry_scheduled").length,
      retryDueRuns: scopedRuns.filter((run) => run.status === "retry_scheduled" && (run.nextRetryAt ?? run.dueAt) <= now).length,
      completedRuns: scopedRuns.filter((run) => run.status === "completed").length,
      failedRuns: scopedRuns.filter((run) => run.status === "failed").length,
      blockedRuns: scopedRuns.filter((run) => run.status === "blocked").length,
      cancelledRuns: scopedRuns.filter((run) => run.status === "cancelled").length,
      backlogRuns: scopedRuns.filter((run) => ["pending", "queued", "processing", "retry_scheduled"].includes(run.status)).length,
      retryCount: scopedRuns.reduce((sum, run) => sum + Math.max(run.attemptCount - 1, 0), 0),
      completionRate: calculateCompletionRate(scopedRuns),
      failureRate: calculateFailureRate(scopedRuns),
      channelBreakdown: [...channelMap.values()].sort((left, right) => left.channel.localeCompare(right.channel)),
      recentActivity: scopedEvents.slice(0, 8).map((event) => ({
        eventId: event.id,
        runId: event.runId,
        clientId: event.clientId,
        clientEmail: event.clientEmail,
        automationType: event.automationType,
        status: event.runStatus,
        eventType: event.eventType,
        triggerSource: event.triggerSource,
        reason: event.reason,
        createdAt: event.createdAt
      })),
      updatedAt: now
    };
  });
}
