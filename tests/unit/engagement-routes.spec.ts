import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialLiveOperationsSnapshot } from "@/lib/operations/live-state";

const {
  requireEngagementActorMock,
  getOwnerIntelligenceSummaryMock,
  getOwnerAutomationSummaryMock,
  buildOwnerMonetizationSummaryMock,
  getEngagementProviderMock,
  getLiveOperationsProviderMock,
  getMarketplaceProviderMock,
  getTrustProviderMock,
  getMarketplaceActivationProviderMock,
  getNotificationDeliveryProviderMock,
  syncScopedEngagementIntelligenceMock,
  buildMarketplaceOwnerMetricsMock,
  buildOwnerPointsAnalyticsSummaryMock,
  getOwnerTrustSummaryMock,
  buildOwnerMarketplaceActivationSummaryMock,
  buildOwnerMoneyDashboardSummaryMock
} = vi.hoisted(() => ({
  requireEngagementActorMock: vi.fn(),
  getOwnerIntelligenceSummaryMock: vi.fn(),
  getOwnerAutomationSummaryMock: vi.fn(),
  buildOwnerMonetizationSummaryMock: vi.fn(),
  getEngagementProviderMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  getMarketplaceProviderMock: vi.fn(),
  getTrustProviderMock: vi.fn(),
  getMarketplaceActivationProviderMock: vi.fn(),
  getNotificationDeliveryProviderMock: vi.fn(),
  syncScopedEngagementIntelligenceMock: vi.fn(),
  buildMarketplaceOwnerMetricsMock: vi.fn(),
  buildOwnerPointsAnalyticsSummaryMock: vi.fn(),
  getOwnerTrustSummaryMock: vi.fn(),
  buildOwnerMarketplaceActivationSummaryMock: vi.fn(),
  buildOwnerMoneyDashboardSummaryMock: vi.fn()
}));

vi.mock("@/lib/engagement/auth", () => ({
  requireEngagementActor: requireEngagementActorMock
}));

vi.mock("@/lib/engagement/engine", () => ({
  getOwnerIntelligenceSummary: getOwnerIntelligenceSummaryMock
}));

vi.mock("@/lib/automation/service", () => ({
  getOwnerAutomationSummary: getOwnerAutomationSummaryMock
}));

vi.mock("@/lib/monetization/service", () => ({
  buildOwnerMonetizationSummary: buildOwnerMonetizationSummaryMock
}));

vi.mock("@/lib/engagement/provider", () => ({
  getEngagementProvider: getEngagementProviderMock
}));

vi.mock("@/lib/operations/live-provider", () => ({
  getLiveOperationsProvider: getLiveOperationsProviderMock
}));

vi.mock("@/lib/marketplace/provider", () => ({
  getMarketplaceProvider: getMarketplaceProviderMock
}));

vi.mock("@/lib/trust/provider", () => ({
  getTrustProvider: getTrustProviderMock
}));

vi.mock("@/lib/marketplace/activation-provider", () => ({
  getMarketplaceActivationProvider: getMarketplaceActivationProviderMock
}));

vi.mock("@/lib/engagement/delivery-provider", () => ({
  getNotificationDeliveryProvider: getNotificationDeliveryProviderMock
}));

vi.mock("@/lib/engagement/intelligence", () => ({
  syncScopedEngagementIntelligence: syncScopedEngagementIntelligenceMock
}));

vi.mock("@/lib/marketplace/growth", () => ({
  buildMarketplaceOwnerMetrics: buildMarketplaceOwnerMetricsMock
}));

vi.mock("@/lib/points/engine", () => ({
  buildOwnerPointsAnalyticsSummary: buildOwnerPointsAnalyticsSummaryMock
}));

vi.mock("@/lib/trust/engine", () => ({
  getOwnerTrustSummary: getOwnerTrustSummaryMock
}));

vi.mock("@/lib/marketplace/activation", () => ({
  buildOwnerMarketplaceActivationSummary: buildOwnerMarketplaceActivationSummaryMock
}));

vi.mock("@/lib/fintech/tax", () => ({
  buildOwnerMoneyDashboardSummary: buildOwnerMoneyDashboardSummaryMock
}));

import { GET as getOwnerIntelligence } from "@/app/api/engagement/owner/intelligence/route";

describe("phase 16 engagement routes", () => {
  beforeEach(() => {
    requireEngagementActorMock.mockReset();
    getOwnerIntelligenceSummaryMock.mockReset();
    getOwnerAutomationSummaryMock.mockReset();
    buildOwnerMonetizationSummaryMock.mockReset();
    getEngagementProviderMock.mockReset();
    getLiveOperationsProviderMock.mockReset();
    getMarketplaceProviderMock.mockReset();
    getTrustProviderMock.mockReset();
    getMarketplaceActivationProviderMock.mockReset();
    getNotificationDeliveryProviderMock.mockReset();
    syncScopedEngagementIntelligenceMock.mockReset();
    buildMarketplaceOwnerMetricsMock.mockReset();
    buildOwnerPointsAnalyticsSummaryMock.mockReset();
    getOwnerTrustSummaryMock.mockReset();
    buildOwnerMarketplaceActivationSummaryMock.mockReset();
    buildOwnerMoneyDashboardSummaryMock.mockReset();
  });

  it("returns owner intelligence for manager-scoped access without leaking internals", async () => {
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
      readSnapshot: vi.fn().mockResolvedValue(createInitialLiveOperationsSnapshot())
    });
    getMarketplaceProviderMock.mockResolvedValue({
      readRuntime: vi.fn().mockResolvedValue({})
    });
    getTrustProviderMock.mockResolvedValue({
      readState: vi.fn().mockResolvedValue({})
    });
    getMarketplaceActivationProviderMock.mockResolvedValue({
      readState: vi.fn().mockResolvedValue({})
    });
    getNotificationDeliveryProviderMock.mockResolvedValue({
      readDeliveries: vi.fn().mockResolvedValue([])
    });
    getOwnerIntelligenceSummaryMock.mockReturnValue({
      assignedLocationIds: ["loc-ybor"],
      network: {
        revenue: 1200,
        chairUtilization: 64,
        activeBarbers: 2,
        completedServices: 9
      },
      retention: {
        repeatClientRate: 48,
        loyaltyParticipants: 4,
        loyaltyPointsIssued: 250,
        referralConversions: 2,
        rebookingEffectiveness: 40,
        churnRiskClients: 1,
        reengagementEligibleClients: 2,
        rebookingOpportunities: 3,
        loyalClients: 2
      },
      bookingTrends: [],
      topBarbers: [],
      topReturningClients: [],
      barberRetention: [],
      recentNotifications: [],
      automation: {
        eligibleClients: 0,
        pendingRuns: 0,
        queuedRuns: 0,
        dueNowRuns: 0,
        processingRuns: 0,
        retryScheduledRuns: 0,
        retryDueRuns: 0,
        completedRuns: 0,
        failedRuns: 0,
        blockedRuns: 0,
        cancelledRuns: 0,
        retryCount: 0,
        backlogRuns: 0,
        completionRate: 0,
        failureRate: 0,
        rebookingReminderEligible: 0,
        reengagementEligible: 0,
        promotionEligible: 0,
        rewardEligible: 0,
        channelBreakdown: [],
        recentActivity: [],
        recentRuns: [],
        topPendingClients: []
      },
      monetization: {
        revenue: {
          grossRevenue: 0,
          platformFeeRevenue: 0,
          processorFeeVisibility: 0,
          subscriptionRevenue: 0,
          repeatClientRevenue: 0,
          retainedRevenueShare: 0,
          revenueAtRisk: 0
        },
        subscriptions: {
          totalTracked: 0,
          active: 0,
          billingAttention: 0,
          entitlementReady: 0,
          subscriptionRevenue: 0,
          rows: []
        },
        promotions: {
          totalRedemptions: 0,
          totalDiscountImpact: 0,
          attributedRevenue: 0,
          topOffers: []
        },
        growth: {
          referralConversions: 0,
          referralConversionRevenue: 0,
          loyaltyParticipants: 0,
          loyaltyRedemptions: 0,
          loyaltyRevenue: 0,
          rebookingInfluencedRevenue: 0
        },
        barberContribution: []
      },
      marketplace: {
        discoveryImpressions: 0,
        profileViews: 0,
        bookingClicks: 0,
        bookingsCreated: 0,
        bookingsCompleted: 0,
        followsCreated: 0,
        haircutNowImpressions: 0,
        shareCount: 0,
        referralShares: 0,
        referralSignUps: 0,
        referralBookings: 0,
        referralCompleted: 0,
        referralCredited: 0,
        discoveryToBookingRate: 0,
        profileToBookingRate: 0,
        clickToBookingRate: 0,
        referralInvites: 0,
        topSources: []
      }
    });
    syncScopedEngagementIntelligenceMock.mockResolvedValue({
      clientRecords: [],
      locationRecords: []
    });
    getOwnerAutomationSummaryMock.mockResolvedValue({
      eligibleClients: 3,
      pendingRuns: 4,
      dueNowRuns: 2,
      completedRuns: 5,
      failedRuns: 1,
      rebookingReminderEligible: 2,
      reengagementEligible: 1,
      promotionEligible: 1,
      rewardEligible: 1,
      queuedRuns: 0,
      processingRuns: 0,
      retryScheduledRuns: 0,
      retryDueRuns: 0,
      blockedRuns: 0,
      cancelledRuns: 0,
      retryCount: 0,
      backlogRuns: 0,
      completionRate: 0,
      failureRate: 0,
      channelBreakdown: [],
      recentActivity: [],
      recentRuns: [],
      topPendingClients: []
    });
    buildOwnerMonetizationSummaryMock.mockResolvedValue({
      revenue: {
        grossRevenue: 1250,
        platformFeeRevenue: 120,
        processorFeeVisibility: 45,
        subscriptionRevenue: 99,
        repeatClientRevenue: 540,
        retainedRevenueShare: 43.2,
        revenueAtRisk: 180
      },
      subscriptions: {
        totalTracked: 2,
        active: 1,
        billingAttention: 1,
        entitlementReady: 1,
        subscriptionRevenue: 99,
        rows: []
      },
      promotions: {
        totalRedemptions: 3,
        totalDiscountImpact: 25,
        attributedRevenue: 210,
        topOffers: []
      },
      growth: {
        referralConversions: 2,
        referralConversionRevenue: 140,
        loyaltyParticipants: 4,
        loyaltyRedemptions: 1,
        loyaltyRevenue: 320,
        rebookingInfluencedRevenue: 540
      },
      barberContribution: []
    });
    buildMarketplaceOwnerMetricsMock.mockResolvedValue({
      discoveryImpressions: 0,
      profileViews: 0,
      bookingClicks: 0,
      bookingsCreated: 0,
      bookingsCompleted: 0,
      followsCreated: 0,
      haircutNowImpressions: 0,
      shareCount: 0,
      referralShares: 0,
      referralSignUps: 0,
      referralBookings: 0,
      referralCompleted: 0,
      referralCredited: 0,
      discoveryToBookingRate: 0,
      profileToBookingRate: 0,
      clickToBookingRate: 0,
      referralInvites: 0,
      topSources: []
    });
    buildOwnerPointsAnalyticsSummaryMock.mockResolvedValue({
      issuedPoints: 320,
      pendingPoints: 40,
      unlockedPoints: 280,
      redeemedPoints: 60,
      cashedOutPoints: 20,
      pointLiabilityPoints: 240,
      pointLiabilityValue: 24,
      reversedPoints: 12,
      issuedInAppValue: 32,
      redeemedInAppValue: 6,
      cashedOutValue: 1.4,
      rewardSpendRate: 0.6,
      redemptionRate: 18.75,
      cashoutRate: 6.25,
      reversalRate: 3.6,
      fraudReviewRate: 4.2,
      referralRewardTransactions: 3,
      referralConversionRate: 50,
      ltvUplift: 6,
      issuanceByEventType: [],
      topCampaigns: []
    });
    buildOwnerMoneyDashboardSummaryMock.mockResolvedValue({
      revenueBreakdown: {
        grossRevenue: 1250,
        netRevenue: 1085,
        platformFeeRevenue: 120,
        processorFeeVisibility: 45,
        subscriptionRevenue: 99
      },
      payoutFlow: {
        pendingAmount: 40,
        queuedAmount: 20,
        inTransitAmount: 10,
        paidAmount: 55,
        failedAmount: 0,
        reversedAmount: 0,
        avgPayoutDelayHours: 18
      },
      pointsCostVsRevenue: 0.6,
      refundRate: 0,
      revenuePerUser: 312.5,
      barberEarningsGrowth: 12.5,
      recentCashouts: []
    });
    getOwnerTrustSummaryMock.mockReturnValue(undefined);
    buildOwnerMarketplaceActivationSummaryMock.mockReturnValue(undefined);

    const response = await getOwnerIntelligence();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.assignedLocationIds).toEqual(["loc-ybor"]);
    expect(syncScopedEngagementIntelligenceMock).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), ["loc-ybor"]);
    expect(getOwnerAutomationSummaryMock).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), ["loc-ybor"]);
    expect(buildOwnerMonetizationSummaryMock).toHaveBeenCalledWith({
      state: expect.any(Object),
      snapshot: expect.any(Object),
      locationIds: ["loc-ybor"]
    });
    expect(body.summary.automation.pendingRuns).toBe(4);
    expect(body.summary.monetization.revenue.subscriptionRevenue).toBe(99);
    expect(body.summary.points.issuedPoints).toBe(320);
    expect(body.summary.money.revenueBreakdown.netRevenue).toBe(1085);
    expect(body.summary.connectedAccount).toBeUndefined();
    expect(body.summary.rawStripeAccount).toBeUndefined();
  });
});
