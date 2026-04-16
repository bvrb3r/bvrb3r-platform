import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  getLiveOperationsProviderMock,
  getEngagementProviderMock,
  getTrustProviderMock,
  readPointsStateSnapshotMock,
  buildOwnerPointsAnalyticsSummaryMock,
  readCashoutReviewQueueMock,
  syncFinancialAnomaliesMock,
  readFinancialAnomalyQueueMock,
  buildOwnerMonetizationSummaryMock,
  buildOwnerMoneyDashboardSummaryMock,
  buildReleaseReadinessSummaryMock,
  getOwnerAnalyticsSummaryMock,
  getOwnerTrustSummaryMock,
  getBarberTrustSummaryMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  getEngagementProviderMock: vi.fn(),
  getTrustProviderMock: vi.fn(),
  readPointsStateSnapshotMock: vi.fn(),
  buildOwnerPointsAnalyticsSummaryMock: vi.fn(),
  readCashoutReviewQueueMock: vi.fn(),
  syncFinancialAnomaliesMock: vi.fn(),
  readFinancialAnomalyQueueMock: vi.fn(),
  buildOwnerMonetizationSummaryMock: vi.fn(),
  buildOwnerMoneyDashboardSummaryMock: vi.fn(),
  buildReleaseReadinessSummaryMock: vi.fn(),
  getOwnerAnalyticsSummaryMock: vi.fn(),
  getOwnerTrustSummaryMock: vi.fn(),
  getBarberTrustSummaryMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: () => true
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/operations/live-provider", () => ({
  getLiveOperationsProvider: getLiveOperationsProviderMock
}));

vi.mock("@/lib/engagement/provider", () => ({
  getEngagementProvider: getEngagementProviderMock
}));

vi.mock("@/lib/trust/provider", () => ({
  getTrustProvider: getTrustProviderMock
}));

vi.mock("@/lib/points/engine", () => ({
  readPointsStateSnapshot: readPointsStateSnapshotMock,
  buildOwnerPointsAnalyticsSummary: buildOwnerPointsAnalyticsSummaryMock
}));

vi.mock("@/lib/points/cashout-review", () => ({
  readCashoutReviewQueue: readCashoutReviewQueueMock
}));

vi.mock("@/lib/fintech/anomalies", () => ({
  syncFinancialAnomalies: syncFinancialAnomaliesMock,
  readFinancialAnomalyQueue: readFinancialAnomalyQueueMock,
  dismissFinancialAnomaly: vi.fn(),
  resolveFinancialAnomaly: vi.fn()
}));

vi.mock("@/lib/monetization/service", () => ({
  buildOwnerMonetizationSummary: buildOwnerMonetizationSummaryMock
}));

vi.mock("@/lib/fintech/tax", () => ({
  buildOwnerMoneyDashboardSummary: buildOwnerMoneyDashboardSummaryMock
}));

vi.mock("@/lib/release/readiness", () => ({
  buildReleaseReadinessSummary: buildReleaseReadinessSummaryMock
}));

vi.mock("@/lib/operations/metrics", () => ({
  getOwnerAnalyticsSummary: getOwnerAnalyticsSummaryMock
}));

vi.mock("@/lib/trust/engine", () => ({
  getOwnerTrustSummary: getOwnerTrustSummaryMock,
  getBarberTrustSummary: getBarberTrustSummaryMock
}));

describe("platform admin service fallback", () => {
  beforeEach(() => {
    const missingTableError = {
      code: "42P01",
      details: null,
      hint: null,
      message: "relation does not exist"
    };
    const result = { data: null, error: missingTableError };
    const orderResult = Object.assign(Promise.resolve(result), {
      limit: () => Promise.resolve(result)
    });

    createSupabaseAdminClientMock.mockReset();
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => orderResult)
        })),
        upsert: vi.fn(() => Promise.resolve({ error: missingTableError })),
        insert: vi.fn(() => Promise.resolve({ error: missingTableError }))
      }))
    });

    getLiveOperationsProviderMock.mockReset();
    getLiveOperationsProviderMock.mockResolvedValue({
      readSnapshot: vi.fn().mockResolvedValue({
        mode: "supabase",
        fetchedAt: new Date().toISOString(),
        appointments: [],
        clients: [],
        walkIns: [],
        workflowEvents: [],
        compensationSnapshots: [],
        ownerAnalytics: []
      })
    });

    getEngagementProviderMock.mockReset();
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

    getTrustProviderMock.mockReset();
    getTrustProviderMock.mockResolvedValue({
      readState: vi.fn().mockResolvedValue({
        barberVerifications: [],
        shopVerifications: [],
        verificationDocuments: [],
        trustBadges: [],
        reviewModeration: [],
        safetyReports: [],
        reportEvents: [],
        disputes: [],
        disputeEvents: [],
        riskFlags: [],
        moderationActions: [],
        reliabilityScores: []
      })
    });

    readPointsStateSnapshotMock.mockReset();
    readPointsStateSnapshotMock.mockResolvedValue({
      balances: [],
      transactions: [],
      programRules: [],
      campaigns: [],
      eligibilitySnapshots: [],
      cashoutRequests: []
    });

    buildOwnerPointsAnalyticsSummaryMock.mockReset();
    buildOwnerPointsAnalyticsSummaryMock.mockResolvedValue({
      issuedPoints: 0,
      pendingPoints: 0,
      unlockedPoints: 0,
      redeemedPoints: 0,
      cashedOutPoints: 0,
      pointLiabilityPoints: 0,
      pointLiabilityValue: 0,
      reversedPoints: 0,
      issuedInAppValue: 0,
      redeemedInAppValue: 0,
      cashedOutValue: 0,
      rewardSpendRate: 0,
      redemptionRate: 0,
      cashoutRate: 0,
      reversalRate: 0,
      fraudReviewRate: 0,
      referralRewardTransactions: 0,
      referralConversionRate: 0,
      ltvUplift: 0,
      issuanceByEventType: [],
      topCampaigns: []
    });

    readCashoutReviewQueueMock.mockReset();
    readCashoutReviewQueueMock.mockResolvedValue({
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
    });

    syncFinancialAnomaliesMock.mockReset();
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

    readFinancialAnomalyQueueMock.mockReset();
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

    buildOwnerMonetizationSummaryMock.mockReset();
    buildOwnerMonetizationSummaryMock.mockResolvedValue({
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
    });

    buildOwnerMoneyDashboardSummaryMock.mockReset();
    buildOwnerMoneyDashboardSummaryMock.mockResolvedValue({
      revenueBreakdown: {
        grossRevenue: 0,
        netRevenue: 0,
        platformFeeRevenue: 0,
        processorFeeVisibility: 0,
        subscriptionRevenue: 0
      },
      payoutFlow: {
        pendingAmount: 0,
        queuedAmount: 0,
        inTransitAmount: 0,
        paidAmount: 0,
        failedAmount: 0,
        reversedAmount: 0,
        avgPayoutDelayHours: 0
      },
      boothRent: {
        paid: 0,
        due: 0,
        overdue: 0,
        overdueAmount: 0
      },
      pointsCostVsRevenue: 0,
      refundRate: 0,
      revenuePerUser: 0,
      barberEarningsGrowth: 0,
      cashoutQueue: {
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
      },
      anomalies: {
        summary: {
          open: 0,
          investigating: 0,
          resolved: 0,
          dismissed: 0,
          critical: 0
        },
        items: []
      },
      scheduledJobs: {
        summary: {
          queued: 0,
          running: 0,
          completed: 0,
          failed: 0,
          skipped: 0
        },
        recentRuns: [],
        latestByJob: {}
      },
      exports: {
        taxSummaryPath: "/exports/tax-summary.csv",
        payoutsPath: "/exports/payouts.csv",
        revenuePath: "/exports/revenue.csv",
        incentivesPath: "/exports/incentives.csv"
      },
      recentCashouts: []
    });

    buildReleaseReadinessSummaryMock.mockReset();
    buildReleaseReadinessSummaryMock.mockReturnValue({
      generatedAt: new Date().toISOString(),
      summary: {
        readyCount: 0,
        attentionCount: 0
      },
      runtime: {
        appUrl: "",
        authMode: "unknown",
        mobileRuntime: "browser",
        androidPackageName: "",
        iosBundleId: "",
        capacitorServerUrl: null
      },
      bootstrap: {
        appName: "BVRB3R",
        scheme: "bvrb3r",
        runtimeMode: "browser",
        universalLinkHost: "",
        startLinks: [],
        pushBridge: {
          webPushConfigured: false,
          apnsBridgeReady: false,
          fcmBridgeReady: false,
          supportedProviders: []
        },
        tokenBridge: {
          registrationApi: "/api/mobile/native/tokens",
          revokeApi: "/api/mobile/native/tokens",
          storageMode: "server_hashed",
          supportsApnsRegistration: false,
          supportsFcmRegistration: false,
          refreshFlowReady: false
        },
        deliveryProviders: {
          emailConfigured: false,
          smsConfigured: false,
          webPushConfigured: false
        },
        releaseCandidate: {
          qaDocs: [],
          storeDocs: [],
          certificationDocs: []
        },
        launchAssets: []
      },
      checks: [],
      docs: {
        mobileQa: "/MOBILE_DEVICE_QA.md",
        releaseCertification: "/RELEASE_CANDIDATE_CERTIFICATION.md",
        storeLaunch: "/STORE_LAUNCH_CHECKLIST.md"
      }
    });

    getOwnerAnalyticsSummaryMock.mockReset();
    getOwnerAnalyticsSummaryMock.mockReturnValue({
      businessDate: "2026-03-28",
      revenueToday: 0,
      tipsToday: 0,
      outstandingBalance: 0,
      completedServicesToday: 0,
      bookedToday: 0,
      paidAppointmentsToday: 0
    });

    getOwnerTrustSummaryMock.mockReset();
    getOwnerTrustSummaryMock.mockReturnValue({
      totalVerifications: 0,
      verifiedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      expiredCount: 0,
      highRiskFlags: 0,
      openDisputes: 0,
      verificationCoverage: 0,
      readinessLabel: "Unavailable"
    });

    getBarberTrustSummaryMock.mockReset();
    getBarberTrustSummaryMock.mockReturnValue({
      overallStatus: "unverified",
      verificationItems: [],
      openDisputes: 0
    });
  });

  it("falls back safely when architect control tables are missing", async () => {
    const { getPlatformAdminConsolePayload, getPlatformAccountStatus, readPlatformShopControlState, resetPlatformAdminStateForTests } = await import("@/lib/platform-admin/service");
    const { makePlatformAdminUser } = await import("@/tests/unit/platform-admin-test-user");
    resetPlatformAdminStateForTests();
    const founder = makePlatformAdminUser();

    const payload = await getPlatformAdminConsolePayload(founder);
    const accountStatus = await getPlatformAccountStatus("user-owner");
    const shopControls = await readPlatformShopControlState("shop-bvrb3r");

    expect(payload.actorName).toBe(founder.name);
    expect(payload.warnings).toContain("Architect data is partially unavailable. Core access is still active.");
    expect(payload.warnings).toContain("Architect control storage is unavailable; using fallback founder-safe memory mode.");
    expect(payload.warnings).toContain("Architect audit storage is unavailable; recent audit history may be incomplete.");
    expect(accountStatus).toBe("active");
    expect(shopControls).toEqual({
      shopStatus: "active",
      kioskEnabled: true,
      aiManagerEnabled: true
    });
  });
});
