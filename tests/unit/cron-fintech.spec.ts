import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listPayoutQueueMock,
  processBoothRentAutoDeductionsMock,
  processPlatformSubscriptionBillingMock,
  processApprovedCashoutQueueMock,
  syncFinancialAnomaliesMock,
  readFinancialAnomalyQueueMock,
  processBackgroundAutomationRunsMock,
  readEngagementStateMock,
  readLiveSnapshotMock
} = vi.hoisted(() => ({
  listPayoutQueueMock: vi.fn(),
  processBoothRentAutoDeductionsMock: vi.fn(),
  processPlatformSubscriptionBillingMock: vi.fn(),
  processApprovedCashoutQueueMock: vi.fn(),
  syncFinancialAnomaliesMock: vi.fn(),
  readFinancialAnomalyQueueMock: vi.fn(),
  processBackgroundAutomationRunsMock: vi.fn(),
  readEngagementStateMock: vi.fn(),
  readLiveSnapshotMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: () => false
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => null
}));

vi.mock("@/lib/payments/service", () => ({
  listPayoutQueue: listPayoutQueueMock
}));

vi.mock("@/lib/wallet/service", () => ({
  processBoothRentAutoDeductions: processBoothRentAutoDeductionsMock
}));

vi.mock("@/lib/monetization/service", () => ({
  processPlatformSubscriptionBilling: processPlatformSubscriptionBillingMock
}));

vi.mock("@/lib/points/cashout-review", () => ({
  processApprovedCashoutQueue: processApprovedCashoutQueueMock
}));

vi.mock("@/lib/fintech/anomalies", () => ({
  syncFinancialAnomalies: syncFinancialAnomaliesMock,
  readFinancialAnomalyQueue: readFinancialAnomalyQueueMock
}));

vi.mock("@/lib/automation/service", () => ({
  processBackgroundAutomationRuns: processBackgroundAutomationRunsMock
}));

vi.mock("@/lib/engagement/provider", () => ({
  getEngagementProvider: async () => ({
    readState: readEngagementStateMock
  })
}));

vi.mock("@/lib/operations/live-provider", () => ({
  getLiveOperationsProvider: async () => ({
    readSnapshot: readLiveSnapshotMock
  })
}));

import {
  buildSyntheticPointsState,
  readPointsStateSnapshot,
  writePointsStateSnapshot
} from "@/lib/points/engine";
import {
  readScheduledExecutionStatus,
  resetScheduledJobRunsForTests,
  runScheduledFintechJobs
} from "@/lib/cron/fintech";

describe("fintech cron scheduler", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T08:30:00.000Z"));
    resetScheduledJobRunsForTests();
    listPayoutQueueMock.mockReset();
    processBoothRentAutoDeductionsMock.mockReset();
    processPlatformSubscriptionBillingMock.mockReset();
    processApprovedCashoutQueueMock.mockReset();
    syncFinancialAnomaliesMock.mockReset();
    readFinancialAnomalyQueueMock.mockReset();
    processBackgroundAutomationRunsMock.mockReset();
    readEngagementStateMock.mockReset();
    readLiveSnapshotMock.mockReset();

    listPayoutQueueMock.mockResolvedValue([]);
    processBoothRentAutoDeductionsMock.mockResolvedValue({
      processed: 0,
      paid: 0,
      overdue: 0,
      ledgers: []
    });
    processPlatformSubscriptionBillingMock.mockResolvedValue({
      processed: 0,
      activated: 0,
      synced: 0,
      pastDue: 0,
      retried: 0
    });
    processApprovedCashoutQueueMock.mockResolvedValue({
      processed: 0,
      readyForPayout: [],
      failed: [],
      queue: {
        summary: {
          requested: 0,
          underReview: 0,
          approved: 0,
          paid: 0,
          failed: 0,
          rejected: 0,
          reversed: 0
        },
        requests: []
      }
    });
    syncFinancialAnomaliesMock.mockResolvedValue({
      summary: {
        open: 0,
        investigating: 0,
        resolved: 0,
        dismissed: 0,
        critical: 0
      },
      items: []
    });
    readFinancialAnomalyQueueMock.mockResolvedValue({
      summary: {
        open: 0,
        investigating: 0,
        resolved: 0,
        dismissed: 0,
        critical: 0
      },
      items: []
    });
    processBackgroundAutomationRunsMock.mockResolvedValue({
      processed: {
        due: 0,
        completed: 0,
        retried: 0,
        failed: 0
      }
    });
    readEngagementStateMock.mockResolvedValue({});
    readLiveSnapshotMock.mockResolvedValue({});

    const state = buildSyntheticPointsState();
    state.transactions = [
      {
        id: "txn-pending-unlock",
        userId: "client-jordan",
        role: "client",
        pointClass: "earned",
        eventType: "booking",
        sourceType: "appointment",
        sourceId: "appt-1",
        pointsDelta: 10,
        inAppValue: 1,
        cashValue: 0.7,
        status: "pending",
        createdAt: "2026-03-20T08:00:00.000Z",
        unlockedAt: "2026-03-20T09:00:00.000Z",
        expiresAt: "2026-04-20T09:00:00.000Z",
        reversedAt: null,
        metadata: {}
      },
      {
        id: "txn-expire-old",
        userId: "client-jordan",
        role: "client",
        pointClass: "promo",
        eventType: "campaign",
        sourceType: "campaign_credit",
        sourceId: "campaign-1",
        pointsDelta: 20,
        inAppValue: 2,
        cashValue: 0,
        status: "unlocked",
        createdAt: "2026-03-01T08:00:00.000Z",
        unlockedAt: "2026-03-01T08:00:00.000Z",
        expiresAt: "2026-03-21T08:00:00.000Z",
        reversedAt: null,
        metadata: {}
      }
    ];
    await writePointsStateSnapshot(state);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("unlocks and expires points once, then stays idempotent across repeated scheduled runs", async () => {
    vi.setSystemTime(new Date("2026-03-26T09:00:00.000Z"));
    const firstRun = await runScheduledFintechJobs({
      locationIds: ["loc-ybor"],
      triggerSource: "manual",
      actorUserId: "user-owner",
      actorRole: "owner"
    });
    const secondRun = await runScheduledFintechJobs({
      locationIds: ["loc-ybor"],
      triggerSource: "manual",
      actorUserId: "user-owner",
      actorRole: "owner"
    });
    const state = await readPointsStateSnapshot();
    const schedulerStatus = await readScheduledExecutionStatus({
      locationIds: ["loc-ybor"]
    });

    const firstUnlockRun = firstRun.recentRuns.find((run) => run.jobName === "unlock_pending_points");
    const firstExpireRun = firstRun.recentRuns.find((run) => run.jobName === "expire_points");
    const firstBoothRentRun = firstRun.recentRuns.find((run) => run.jobName === "process_booth_rent_deductions");
    const firstBillingRun = firstRun.recentRuns.find((run) => run.jobName === "process_platform_subscription_billing");
    const secondUnlockRun = secondRun.recentRuns.find((run) => run.jobName === "unlock_pending_points");
    const secondExpireRun = secondRun.recentRuns.find((run) => run.jobName === "expire_points");

    expect(firstUnlockRun?.status).toBe("completed");
    expect(firstUnlockRun?.resultSummary).toMatchObject({
      unlockedCount: 0,
      expiredDuringRun: 0
    });
    expect(firstExpireRun?.resultSummary).toMatchObject({
      expiredCount: 0
    });
    expect(firstBoothRentRun?.resultSummary).toMatchObject({
      processed: 0,
      paid: 0,
      overdue: 0
    });
    expect(firstBillingRun?.resultSummary).toMatchObject({
      processed: 0,
      activated: 0,
      synced: 0,
      pastDue: 0,
      retried: 0
    });

    expect(secondUnlockRun?.resultSummary).toMatchObject({
      unlockedCount: 0,
      expiredDuringRun: 0
    });
    expect(secondExpireRun?.resultSummary).toMatchObject({
      expiredCount: 0
    });

    expect(state.transactions.find((transaction) => transaction.id === "txn-pending-unlock")?.status).toBe("unlocked");
    expect(state.transactions.find((transaction) => transaction.id === "txn-expire-old")?.status).toBe("expired");
    expect(processBoothRentAutoDeductionsMock).toHaveBeenCalledTimes(2);
    expect(processPlatformSubscriptionBillingMock).toHaveBeenCalledTimes(2);
    expect(schedulerStatus.summary.completed).toBe(18);
    expect(schedulerStatus.summary.failed).toBe(0);
  });
});
