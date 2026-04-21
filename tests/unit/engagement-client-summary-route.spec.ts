import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireEngagementActorMock,
  getEngagementProviderMock,
  getLiveOperationsProviderMock,
  readPointsBalanceForClientReferenceMock,
  enrichClientEngagementSummaryWithAutomationMock,
  buildClientIntelligenceSnapshotMock,
  syncClientIntelligenceSnapshotsMock,
  getClientEngagementSummaryMock,
  readStateMock,
  readSnapshotMock
} = vi.hoisted(() => ({
  requireEngagementActorMock: vi.fn(),
  getEngagementProviderMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  readPointsBalanceForClientReferenceMock: vi.fn(),
  enrichClientEngagementSummaryWithAutomationMock: vi.fn(),
  buildClientIntelligenceSnapshotMock: vi.fn(),
  syncClientIntelligenceSnapshotsMock: vi.fn(),
  getClientEngagementSummaryMock: vi.fn(),
  readStateMock: vi.fn(),
  readSnapshotMock: vi.fn()
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

vi.mock("@/lib/points/engine", () => ({
  readPointsBalanceForClientReference: readPointsBalanceForClientReferenceMock
}));

vi.mock("@/lib/automation/service", () => ({
  enrichClientEngagementSummaryWithAutomation: enrichClientEngagementSummaryWithAutomationMock
}));

vi.mock("@/lib/engagement/intelligence", () => ({
  buildClientIntelligenceSnapshot: buildClientIntelligenceSnapshotMock,
  syncClientIntelligenceSnapshots: syncClientIntelligenceSnapshotsMock
}));

vi.mock("@/lib/engagement/engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/engagement/engine")>("@/lib/engagement/engine");
  return {
    ...actual,
    getClientEngagementSummary: getClientEngagementSummaryMock
  };
});

import { GET as getClientSummary } from "@/app/api/engagement/client/summary/route";

describe("client engagement summary route", () => {
  beforeEach(() => {
    requireEngagementActorMock.mockReset();
    getEngagementProviderMock.mockReset();
    getLiveOperationsProviderMock.mockReset();
    readPointsBalanceForClientReferenceMock.mockReset();
    enrichClientEngagementSummaryWithAutomationMock.mockReset();
    buildClientIntelligenceSnapshotMock.mockReset();
    syncClientIntelligenceSnapshotsMock.mockReset();
    getClientEngagementSummaryMock.mockReset();
    readStateMock.mockReset();
    readSnapshotMock.mockReset();

    requireEngagementActorMock.mockResolvedValue({
      role: "client",
      clientId: "client-jordan",
      barberId: undefined,
      locationIds: [],
      userEmail: "jordan@example.com"
    });
    getEngagementProviderMock.mockResolvedValue({
      readState: readStateMock
    });
    getLiveOperationsProviderMock.mockResolvedValue({
      readSnapshot: readSnapshotMock
    });
    readPointsBalanceForClientReferenceMock.mockResolvedValue({
      unlockedPoints: 340,
      lifetimeEarned: 910
    });
    readStateMock.mockResolvedValue({});
    readSnapshotMock.mockResolvedValue({});
    buildClientIntelligenceSnapshotMock.mockReturnValue(null);
    syncClientIntelligenceSnapshotsMock.mockResolvedValue(undefined);
    getClientEngagementSummaryMock.mockReturnValue({
      clientId: "client-jordan",
      pointsBalance: 340,
      lifetimePoints: 910,
      tier: "vip",
      referralCredits: 1,
      completedBookings: 4,
      rebookingRecommendation: null,
      intelligence: {
        churnRisk: "low",
        rebookingWindow: "due_soon",
        completedVisitCount: 4,
        activeAppointmentCount: 1,
        lastCompletedAt: null,
        nextDueAt: null,
        nextBestAction: "Stay booked",
        explanation: "Points-backed loyalty summary",
        loyaltySegment: "loyal",
        reengagementEligible: false
      },
      recommendedBarbers: [],
      followedBarbers: [],
      followSuggestions: [],
      rewards: [],
      recentTransactions: [],
      recentNotifications: [],
      recentEvents: [],
      automation: {
        eligibleAutomationCount: 0,
        pendingRuns: 0,
        processingRuns: 0,
        retryScheduledRuns: 0,
        completedRuns: 0,
        failedRuns: 0,
        blockedRuns: 0,
        nextAutomation: undefined,
        recentRuns: []
      }
    });
    enrichClientEngagementSummaryWithAutomationMock.mockImplementation(async (summary) => summary);
  });

  it("hydrates client rewards from canonical points balance instead of legacy loyalty rows", async () => {
    const response = await getClientSummary();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getClientEngagementSummaryMock).toHaveBeenCalledWith(
      {},
      {},
      "client-jordan",
      {
        pointsBalance: 340,
        lifetimePoints: 910
      }
    );
    expect(body.summary.pointsBalance).toBe(340);
  });
});
