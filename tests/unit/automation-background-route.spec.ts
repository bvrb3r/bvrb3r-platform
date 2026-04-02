import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getEngagementProviderMock,
  getLiveOperationsProviderMock,
  processBackgroundAutomationRunsMock
} = vi.hoisted(() => ({
  getEngagementProviderMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  processBackgroundAutomationRunsMock: vi.fn()
}));

vi.mock("@/lib/engagement/provider", () => ({
  getEngagementProvider: getEngagementProviderMock
}));

vi.mock("@/lib/operations/live-provider", () => ({
  getLiveOperationsProvider: getLiveOperationsProviderMock
}));

vi.mock("@/lib/automation/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/automation/service")>("@/lib/automation/service");
  return {
    ...actual,
    processBackgroundAutomationRuns: processBackgroundAutomationRunsMock
  };
});

import { POST as processAutomationInBackground } from "@/app/api/engagement/automations/process/route";

describe("phase 18 background automation route", () => {
  beforeEach(() => {
    process.env.AUTOMATION_PROCESS_SECRET = "phase18-secret";
    getEngagementProviderMock.mockReset();
    getLiveOperationsProviderMock.mockReset();
    processBackgroundAutomationRunsMock.mockReset();
  });

  it("rejects callers without the configured automation secret", async () => {
    const response = await processAutomationInBackground(new Request("http://localhost:3000/api/engagement/automations/process", {
      method: "POST",
      body: JSON.stringify({})
    }));

    expect(response.status).toBe(401);
  });

  it("processes automation runs for a secret-authenticated background caller", async () => {
    getEngagementProviderMock.mockResolvedValue({
      readState: vi.fn().mockResolvedValue({
        loyaltyAccounts: [],
        loyaltyTransactions: [],
        loyaltyRewardRules: [],
        referralCodes: [],
        referralEvents: [],
        barberFollows: [],
        engagementEvents: [],
        rebookingCycles: [],
        rebookingRecommendations: [],
        notificationPreferences: [],
        notifications: [],
        reputationScores: [],
        rankingSnapshots: [],
        growthRecommendations: []
      })
    });
    getLiveOperationsProviderMock.mockResolvedValue({
      readSnapshot: vi.fn().mockResolvedValue({
        mode: "demo",
        fetchedAt: "2026-03-23T09:00:00.000Z",
        appointments: [],
        clients: [],
        walkIns: [],
        workflowEvents: [],
        compensationSnapshots: [],
        ownerAnalytics: []
      })
    });
    processBackgroundAutomationRunsMock.mockResolvedValue({
      summary: {
        eligibleClients: 2,
        pendingRuns: 3,
        queuedRuns: 0,
        dueNowRuns: 1,
        processingRuns: 0,
        retryScheduledRuns: 1,
        retryDueRuns: 1,
        completedRuns: 4,
        failedRuns: 0,
        blockedRuns: 0,
        cancelledRuns: 0,
        retryCount: 2,
        backlogRuns: 4,
        completionRate: 100,
        failureRate: 0,
        rebookingReminderEligible: 1,
        reengagementEligible: 1,
        promotionEligible: 0,
        rewardEligible: 0,
        channelBreakdown: [],
        recentActivity: [],
        recentRuns: [],
        topPendingClients: []
      },
      processed: {
        completed: 1,
        failed: 0,
        retried: 1,
        due: 2
      }
    });

    const response = await processAutomationInBackground(new Request("http://localhost:3000/api/engagement/automations/process", {
      method: "POST",
      headers: {
        authorization: "Bearer phase18-secret",
        "content-type": "application/json"
      },
      body: JSON.stringify({ locationIds: ["loc-ybor"] })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(processBackgroundAutomationRunsMock).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), ["loc-ybor"]);
    expect(body.processed.retried).toBe(1);
  });
});
