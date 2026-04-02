import { createHash } from "node:crypto";
import { processBackgroundAutomationRuns } from "@/lib/automation/service";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { readFinancialAnomalyQueue, syncFinancialAnomalies } from "@/lib/fintech/anomalies";
import { processPlatformSubscriptionBilling } from "@/lib/monetization/service";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { listPayoutQueue } from "@/lib/payments/service";
import { processApprovedCashoutQueue } from "@/lib/points/cashout-review";
import {
  readPointsStateSnapshot,
  syncPointsStateLifecycle,
  writePointsStateSnapshot
} from "@/lib/points/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processBoothRentAutoDeductions } from "@/lib/wallet/service";
import type {
  ScheduledJobName,
  ScheduledJobRunStatus,
  ScheduledJobRunView,
  ScheduledJobStatusView,
  ScheduledJobTriggerSource
} from "@/types/fintech";
import type { UserAccount } from "@/types/domain";

type ScheduledJobRunRow = {
  id: string;
  job_name: ScheduledJobName;
  scope_key: string;
  related_location_ids: string[] | null;
  status: ScheduledJobRunStatus;
  trigger_source: ScheduledJobTriggerSource;
  actor_user_id: string | null;
  actor_role: string | null;
  started_at: string;
  completed_at: string | null;
  failed_at: string | null;
  retry_count: number | string | null;
  last_error: string | null;
  result_summary: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

type JobRunnerInput = {
  locationIds?: string[];
  triggerSource?: ScheduledJobTriggerSource;
  actorUserId?: string;
  actorRole?: UserAccount["role"];
};

let demoScheduledJobRuns: ScheduledJobRunView[] = [];

const JOB_NAMES: ScheduledJobName[] = [
  "process_payout_eligibility",
  "process_booth_rent_deductions",
  "process_platform_subscription_billing",
  "unlock_pending_points",
  "expire_points",
  "process_cashout_queue",
  "detect_financial_anomalies",
  "process_growth_automations",
  "refresh_financial_reporting"
];

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

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

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function isMissingTableError(error: { code?: string | null; message?: string | null }) {
  return error.code === "42P01" || `${error.message ?? ""}`.toLowerCase().includes("does not exist");
}

function buildScopeKey(locationIds: string[]) {
  const scoped = [...new Set(locationIds.filter(Boolean))].sort();
  return scoped.length ? scoped.join("|") : "global";
}

function sortRuns(runs: ScheduledJobRunView[]) {
  return [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

function mapRow(row: ScheduledJobRunRow): ScheduledJobRunView {
  return {
    id: row.id,
    jobName: row.job_name,
    scopeKey: row.scope_key,
    relatedLocationIds: row.related_location_ids ?? [],
    status: row.status,
    triggerSource: row.trigger_source,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    retryCount: Number(row.retry_count ?? 0),
    lastError: row.last_error,
    resultSummary: clone(row.result_summary ?? {}),
    metadata: clone(row.metadata ?? {}),
    updatedAt: row.updated_at
  };
}

function toRow(run: ScheduledJobRunView) {
  return {
    id: run.id,
    job_name: run.jobName,
    scope_key: run.scopeKey,
    related_location_ids: run.relatedLocationIds,
    status: run.status,
    trigger_source: run.triggerSource,
    actor_user_id: run.actorUserId ?? null,
    actor_role: run.actorRole ?? null,
    started_at: run.startedAt,
    completed_at: run.completedAt ?? null,
    failed_at: run.failedAt ?? null,
    retry_count: run.retryCount,
    last_error: run.lastError ?? null,
    result_summary: run.resultSummary,
    metadata: run.metadata,
    updated_at: run.updatedAt
  };
}

async function readScheduledJobRuns() {
  const supabase = getSupabase();
  if (!supabase) {
    return clone(demoScheduledJobRuns);
  }

  const result = await supabase
    .from("scheduled_job_runs")
    .select("id, job_name, scope_key, related_location_ids, status, trigger_source, actor_user_id, actor_role, started_at, completed_at, failed_at, retry_count, last_error, result_summary, metadata, updated_at")
    .order("started_at", { ascending: false });

  if (result.error) {
    if (isMissingTableError(result.error)) {
      return [];
    }
    throw result.error;
  }

  return ((result.data ?? []) as ScheduledJobRunRow[]).map(mapRow);
}

async function persistScheduledJobRuns(runs: ScheduledJobRunView[]) {
  const supabase = getSupabase();
  if (!supabase) {
    demoScheduledJobRuns = sortRuns(clone(runs));
    return;
  }

  const result = await supabase
    .from("scheduled_job_runs")
    .upsert(runs.map(toRow), { onConflict: "id" });

  if (result.error) {
    if (isMissingTableError(result.error)) {
      demoScheduledJobRuns = sortRuns(clone(runs));
      return;
    }
    throw result.error;
  }
}

function buildJobStatusView(runs: ScheduledJobRunView[], locationIds: string[] = []): ScheduledJobStatusView {
  const filteredRuns = runs.filter((run) =>
    !locationIds.length
    || !run.relatedLocationIds.length
    || run.relatedLocationIds.some((locationId) => locationIds.includes(locationId))
  );
  const latestByJob = JOB_NAMES.reduce<Partial<Record<ScheduledJobName, ScheduledJobRunView>>>((accumulator, jobName) => {
    const latest = filteredRuns.find((run) => run.jobName === jobName);
    if (latest) {
      accumulator[jobName] = latest;
    }
    return accumulator;
  }, {});

  return {
    summary: {
      queued: filteredRuns.filter((run) => run.status === "queued").length,
      running: filteredRuns.filter((run) => run.status === "running").length,
      completed: filteredRuns.filter((run) => run.status === "completed").length,
      failed: filteredRuns.filter((run) => run.status === "failed").length,
      skipped: filteredRuns.filter((run) => run.status === "skipped").length
    },
    recentRuns: filteredRuns.slice(0, 12),
    latestByJob
  };
}

function createRunRecord(input: {
  jobName: ScheduledJobName;
  scopeKey: string;
  relatedLocationIds: string[];
  triggerSource: ScheduledJobTriggerSource;
  actorUserId?: string;
  actorRole?: UserAccount["role"];
  retryCount?: number;
}) {
  const now = new Date().toISOString();
  return {
    id: stableId(`scheduled-job:${input.jobName}:${input.scopeKey}:${now}:${Math.random().toString(36).slice(2, 8)}`),
    jobName: input.jobName,
    scopeKey: input.scopeKey,
    relatedLocationIds: input.relatedLocationIds,
    status: "running",
    triggerSource: input.triggerSource,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    startedAt: now,
    completedAt: null,
    failedAt: null,
    retryCount: input.retryCount ?? 0,
    lastError: null,
    resultSummary: {},
    metadata: {},
    updatedAt: now
  } satisfies ScheduledJobRunView;
}

function finalizeRun(
  run: ScheduledJobRunView,
  input: {
    status: Extract<ScheduledJobRunStatus, "completed" | "failed" | "skipped">;
    resultSummary?: Record<string, unknown>;
    error?: string;
  }
) {
  const now = new Date().toISOString();
  return {
    ...run,
    status: input.status,
    completedAt: input.status === "completed" || input.status === "skipped" ? now : run.completedAt,
    failedAt: input.status === "failed" ? now : run.failedAt,
    lastError: input.error ?? null,
    resultSummary: input.resultSummary ?? {},
    updatedAt: now
  } satisfies ScheduledJobRunView;
}

function summarizePointsLifecycle(beforePending: number, beforeExpired: number, nextState: Awaited<ReturnType<typeof unlockAndExpirePointsLifecycle>>) {
  const afterPending = nextState.transactions.filter((transaction) => transaction.status === "pending" && transaction.pointsDelta > 0).length;
  const afterExpired = nextState.transactions.filter((transaction) => transaction.status === "expired").length;
  return {
    unlockedCount: Math.max(beforePending - afterPending, 0),
    expiredCount: Math.max(afterExpired - beforeExpired, 0)
  };
}

export async function processPayoutEligibilityQueue(input?: { locationIds?: string[] }) {
  const queue = await listPayoutQueue({
    locationIds: input?.locationIds
  }).catch(() => []);

  return {
    ready: queue.filter((entry) => entry.status === "pending").length,
    queued: queue.filter((entry) => entry.status === "queued").length,
    blocked: queue.filter((entry) => entry.status === "not_ready").length,
    failed: queue.filter((entry) => entry.status === "failed").length,
    totalEligibleAmount: roundCurrency(queue.reduce((sum, entry) => sum + entry.eligibleAmount, 0)),
    queue
  };
}

export async function processBoothRentQueue(referenceAt = new Date().toISOString()) {
  return processBoothRentAutoDeductions(referenceAt);
}

export async function processPlatformBillingQueue(referenceAt = new Date().toISOString()) {
  return processPlatformSubscriptionBilling(referenceAt);
}

export async function unlockAndExpirePointsLifecycle(referenceAt = new Date().toISOString()) {
  const state = await readPointsStateSnapshot();
  const nextState = syncPointsStateLifecycle(state, referenceAt);
  await writePointsStateSnapshot(nextState);
  return nextState;
}

export async function processCashoutQueue() {
  return processApprovedCashoutQueue();
}

export async function flagFintechAnomalies(input?: { locationIds?: string[] }) {
  return syncFinancialAnomalies({
    locationIds: input?.locationIds
  });
}

async function runSingleJob(
  currentRuns: ScheduledJobRunView[],
  input: {
    jobName: ScheduledJobName;
    locationIds: string[];
    triggerSource: ScheduledJobTriggerSource;
    actorUserId?: string;
    actorRole?: UserAccount["role"];
    execute: () => Promise<Record<string, unknown>>;
  }
) {
  const scopeKey = buildScopeKey(input.locationIds);
  const conflictingRun = currentRuns.find((run) =>
    run.jobName === input.jobName
    && run.scopeKey === scopeKey
    && run.status === "running"
    && (Date.now() - new Date(run.startedAt).getTime()) < 15 * 60 * 1000
  );

  if (conflictingRun) {
    const skipped = finalizeRun(createRunRecord({
      jobName: input.jobName,
      scopeKey,
      relatedLocationIds: input.locationIds,
      triggerSource: input.triggerSource,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole
    }), {
      status: "skipped",
      resultSummary: {
        reason: "A recent run is already in progress.",
        runningRunId: conflictingRun.id
      }
    });
    currentRuns.unshift(skipped);
    await persistScheduledJobRuns(currentRuns);
    return skipped;
  }

  const running = createRunRecord({
    jobName: input.jobName,
    scopeKey,
    relatedLocationIds: input.locationIds,
    triggerSource: input.triggerSource,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole
  });
  currentRuns.unshift(running);
  await persistScheduledJobRuns(currentRuns);

  try {
    const resultSummary = await input.execute();
    const completed = finalizeRun(running, {
      status: "completed",
      resultSummary
    });
    const index = currentRuns.findIndex((run) => run.id === running.id);
    currentRuns[index] = completed;
    await persistScheduledJobRuns(currentRuns);
    return completed;
  } catch (error) {
    const failed = finalizeRun(running, {
      status: "failed",
      resultSummary: {},
      error: error instanceof Error ? error.message : "Scheduled job failed."
    });
    const index = currentRuns.findIndex((run) => run.id === running.id);
    currentRuns[index] = failed;
    await persistScheduledJobRuns(currentRuns);
    return failed;
  }
}

export async function runScheduledFintechJobs(input?: JobRunnerInput) {
  const locationIds = [...new Set((input?.locationIds ?? []).filter(Boolean))];
  const triggerSource = input?.triggerSource ?? "scheduled";
  const runs = await readScheduledJobRuns();
  const beforePointsState = await readPointsStateSnapshot().catch(() => null);
  const beforePending = beforePointsState?.transactions.filter((transaction) => transaction.status === "pending" && transaction.pointsDelta > 0).length ?? 0;
  const beforeExpired = beforePointsState?.transactions.filter((transaction) => transaction.status === "expired").length ?? 0;
  const executedRuns = [
    await runSingleJob(runs, {
      jobName: "process_payout_eligibility",
      locationIds,
      triggerSource,
      actorUserId: input?.actorUserId,
      actorRole: input?.actorRole,
      execute: async () => {
        const queue = await processPayoutEligibilityQueue({ locationIds });
        return {
          ready: queue.ready,
          queued: queue.queued,
          blocked: queue.blocked,
          failed: queue.failed,
          totalEligibleAmount: queue.totalEligibleAmount
        };
      }
    }),
    await runSingleJob(runs, {
      jobName: "process_booth_rent_deductions",
      locationIds,
      triggerSource,
      actorUserId: input?.actorUserId,
      actorRole: input?.actorRole,
      execute: async () => {
        const boothRent = await processBoothRentQueue();
        return {
          processed: boothRent.processed,
          paid: boothRent.paid,
          overdue: boothRent.overdue
        };
      }
    }),
    await runSingleJob(runs, {
      jobName: "process_platform_subscription_billing",
      locationIds,
      triggerSource,
      actorUserId: input?.actorUserId,
      actorRole: input?.actorRole,
      execute: async () => {
        const billing = await processPlatformBillingQueue();
        return {
          processed: billing.processed,
          activated: billing.activated,
          synced: billing.synced,
          pastDue: billing.pastDue,
          retried: billing.retried
        };
      }
    }),
    await runSingleJob(runs, {
      jobName: "unlock_pending_points",
      locationIds,
      triggerSource,
      actorUserId: input?.actorUserId,
      actorRole: input?.actorRole,
      execute: async () => {
        const nextState = await unlockAndExpirePointsLifecycle();
        const summary = summarizePointsLifecycle(beforePending, beforeExpired, nextState);
        return {
          unlockedCount: summary.unlockedCount,
          expiredDuringRun: summary.expiredCount
        };
      }
    }),
    await runSingleJob(runs, {
      jobName: "expire_points",
      locationIds,
      triggerSource,
      actorUserId: input?.actorUserId,
      actorRole: input?.actorRole,
      execute: async () => {
        const nextState = await unlockAndExpirePointsLifecycle();
        const summary = summarizePointsLifecycle(beforePending, beforeExpired, nextState);
        return {
          expiredCount: summary.expiredCount
        };
      }
    }),
    await runSingleJob(runs, {
      jobName: "process_cashout_queue",
      locationIds,
      triggerSource,
      actorUserId: input?.actorUserId,
      actorRole: input?.actorRole,
      execute: async () => {
        const queue = await processCashoutQueue();
        return {
          approvedReady: Array.isArray(queue.readyForPayout) ? queue.readyForPayout.length : 0,
          failed: Array.isArray(queue.failed) ? queue.failed.length : 0
        };
      }
    }),
    await runSingleJob(runs, {
      jobName: "detect_financial_anomalies",
      locationIds,
      triggerSource,
      actorUserId: input?.actorUserId,
      actorRole: input?.actorRole,
      execute: async () => {
        const queue = await flagFintechAnomalies({ locationIds });
        return {
          open: queue.summary.open,
          critical: queue.summary.critical,
          total: queue.items.length
        };
      }
    }),
    await runSingleJob(runs, {
      jobName: "process_growth_automations",
      locationIds,
      triggerSource,
      actorUserId: input?.actorUserId,
      actorRole: input?.actorRole,
      execute: async () => {
        const [engagementProvider, operationsProvider] = await Promise.all([
          getEngagementProvider(),
          getLiveOperationsProvider()
        ]);
        const [state, snapshot] = await Promise.all([
          engagementProvider.readState(),
          operationsProvider.readSnapshot({
            role: "owner",
            email: "cron@bvrb3r.internal",
            locationIds
          })
        ]);
        const result = await processBackgroundAutomationRuns(state, snapshot, locationIds);
        return {
          due: result.processed.due,
          completed: result.processed.completed,
          retried: result.processed.retried,
          failed: result.processed.failed
        };
      }
    }),
    await runSingleJob(runs, {
      jobName: "refresh_financial_reporting",
      locationIds,
      triggerSource,
      actorUserId: input?.actorUserId,
      actorRole: input?.actorRole,
      execute: async () => {
        const [payoutQueue, anomalyQueue, cashoutQueue] = await Promise.all([
          processPayoutEligibilityQueue({ locationIds }),
          readFinancialAnomalyQueue({ locationIds }),
          processCashoutQueue()
        ]);
        return {
          payoutRows: payoutQueue.queue.length,
          anomalyOpen: anomalyQueue.summary.open,
          cashoutApprovedReady: Array.isArray(cashoutQueue.readyForPayout) ? cashoutQueue.readyForPayout.length : 0
        };
      }
    })
  ];

  return {
    status: buildJobStatusView(runs, locationIds),
    recentRuns: executedRuns
  };
}

export async function readScheduledExecutionStatus(input?: { locationIds?: string[] }) {
  const runs = await readScheduledJobRuns();
  return buildJobStatusView(runs, input?.locationIds ?? []);
}

export function resetScheduledJobRunsForTests() {
  demoScheduledJobRuns = [];
}
