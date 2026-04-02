import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireEngagementActorMock,
  getEngagementProviderMock,
  getLiveOperationsProviderMock,
  processOwnerAutomationRunsMock
} = vi.hoisted(() => ({
  requireEngagementActorMock: vi.fn(),
  getEngagementProviderMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  processOwnerAutomationRunsMock: vi.fn()
}));

vi.mock("@/lib/engagement/auth", () => ({
  requireEngagementActor: requireEngagementActorMock
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
    processOwnerAutomationRuns: processOwnerAutomationRunsMock
  };
});

import { POST as processOwnerAutomations } from "@/app/api/engagement/owner/automations/process/route";

describe("phase 17 automation routes", () => {
  beforeEach(() => {
    requireEngagementActorMock.mockReset();
    getEngagementProviderMock.mockReset();
    getLiveOperationsProviderMock.mockReset();
    processOwnerAutomationRunsMock.mockReset();
  });

  it("processes due automations for owner and manager scopes", async () => {
    requireEngagementActorMock.mockResolvedValue({
      role: "manager",
      userEmail: "manager@bvrb3r.demo",
      locationIds: ["loc-ybor"]
    });
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
    processOwnerAutomationRunsMock.mockResolvedValue({
      summary: {
        eligibleClients: 3,
        pendingRuns: 4,
        dueNowRuns: 1,
        completedRuns: 2,
        failedRuns: 0,
        rebookingReminderEligible: 2,
        reengagementEligible: 1,
        promotionEligible: 1,
        rewardEligible: 0,
        recentRuns: [],
        topPendingClients: []
      },
      processed: {
        completed: 1,
        failed: 0,
        due: 1
      }
    });

    const response = await processOwnerAutomations();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(processOwnerAutomationRunsMock).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), ["loc-ybor"]);
    expect(body.summary.pendingRuns).toBe(4);
    expect(body.processed.completed).toBe(1);
  });
});
