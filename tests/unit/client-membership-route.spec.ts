import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  getEngagementProviderMock,
  getLiveOperationsProviderMock,
  readPointsBalanceForClientReferenceMock,
  readStateMock,
  readSnapshotMock,
  getClientEngagementSummaryMock,
  buildClientMembershipExecutionSummaryMock,
  createClientMembershipSubscriptionSessionMock,
  cancelClientMembershipSubscriptionMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  getEngagementProviderMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  readPointsBalanceForClientReferenceMock: vi.fn(),
  readStateMock: vi.fn(),
  readSnapshotMock: vi.fn(),
  getClientEngagementSummaryMock: vi.fn(),
  buildClientMembershipExecutionSummaryMock: vi.fn(),
  createClientMembershipSubscriptionSessionMock: vi.fn(),
  cancelClientMembershipSubscriptionMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
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

vi.mock("@/lib/engagement/engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/engagement/engine")>("@/lib/engagement/engine");
  return {
    ...actual,
    getClientEngagementSummary: getClientEngagementSummaryMock
  };
});

vi.mock("@/lib/monetization/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/monetization/service")>("@/lib/monetization/service");
  return {
    ...actual,
    buildClientMembershipExecutionSummary: buildClientMembershipExecutionSummaryMock,
    createClientMembershipSubscriptionSession: createClientMembershipSubscriptionSessionMock,
    cancelClientMembershipSubscription: cancelClientMembershipSubscriptionMock
  };
});

import { DELETE as deleteMembership, GET as getMembership, POST as postMembership } from "@/app/api/client/membership/route";
import { MonetizationServiceError } from "@/lib/monetization/service";

describe("client membership route", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    getEngagementProviderMock.mockReset();
    getLiveOperationsProviderMock.mockReset();
    readPointsBalanceForClientReferenceMock.mockReset();
    readStateMock.mockReset();
    readSnapshotMock.mockReset();
    getClientEngagementSummaryMock.mockReset();
    buildClientMembershipExecutionSummaryMock.mockReset();
    createClientMembershipSubscriptionSessionMock.mockReset();
    cancelClientMembershipSubscriptionMock.mockReset();

    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "client",
        email: "client@bvrb3r.demo",
        name: "Jordan Ellis",
        clientId: "client-jordan"
      },
      clientId: "client-jordan",
      activeClient: {
        name: "Jordan Ellis"
      },
      isSignedInClient: true
    });
    getEngagementProviderMock.mockResolvedValue({
      readState: readStateMock
    });
    getLiveOperationsProviderMock.mockResolvedValue({
      readSnapshot: readSnapshotMock
    });
    readPointsBalanceForClientReferenceMock.mockResolvedValue({
      unlockedPoints: 220,
      lifetimeEarned: 480
    });
    readStateMock.mockResolvedValue({});
    readSnapshotMock.mockResolvedValue({});
    getClientEngagementSummaryMock.mockReturnValue({
      pointsBalance: 220,
      referralCredits: 2,
      rewards: [
        { unlocked: true },
        { unlocked: false }
      ],
      intelligence: {
        nextDueAt: "2026-04-02T09:00:00-04:00"
      }
    });
    buildClientMembershipExecutionSummaryMock.mockResolvedValue({
      subscription: null,
      value: null,
      plans: [
        {
          planCode: "client_core",
          planName: "Client Core",
          planInterval: "monthly",
          unitAmount: 19,
          currency: "usd",
          summary: "Member pricing and priority perks.",
          perkLabels: ["10% member pricing", "Priority booking"]
        }
      ],
      activePlan: {
        planCode: "client_core",
        planName: "Client Core",
        planInterval: "monthly",
        unitAmount: 19,
        currency: "usd",
        summary: "Member pricing and priority perks.",
        perkLabels: ["10% member pricing", "Priority booking"]
      },
      pricingAdjustment: null,
      canSubscribe: true,
      canCancel: false
    });
  });

  it("rejects non-client access", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "owner",
        email: "owner@bvrb3r.demo",
        name: "Owner"
      },
      clientId: null,
      activeClient: null,
      isSignedInClient: false
    });

    const response = await getMembership();

    expect(response.status).toBe(403);
  });

  it("returns the canonical membership execution summary for the signed-in client", async () => {
    const response = await getMembership();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getClientEngagementSummaryMock).toHaveBeenCalledWith(
      {},
      {},
      "client-jordan",
      {
        pointsBalance: 220,
        lifetimePoints: 480
      }
    );
    expect(buildClientMembershipExecutionSummaryMock).toHaveBeenCalledWith({
      clientId: "client-jordan",
      clientName: "Jordan Ellis",
      pointsBalance: 220,
      referralCredits: 2,
      unlockedRewardCount: 1,
      nextDueAt: "2026-04-02T09:00:00-04:00"
    });
    expect(body.membership.plans).toHaveLength(1);
  });

  it("starts a Stripe-backed membership checkout session for a valid plan", async () => {
    createClientMembershipSubscriptionSessionMock.mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.test/session_123",
      sessionId: "cs_test_123"
    });

    const response = await postMembership(new Request("http://localhost:3000/api/client/membership", {
      method: "POST",
      body: JSON.stringify({
        planCode: "client_core"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(createClientMembershipSubscriptionSessionMock).toHaveBeenCalledWith({
      user: {
        role: "client",
        email: "client@bvrb3r.demo",
        name: "Jordan Ellis",
        clientId: "client-jordan"
      },
      planCode: "client_core"
    });
    expect(body.checkoutUrl).toBe("https://checkout.stripe.test/session_123");
    expect(body.sessionId).toBe("cs_test_123");
  });

  it("returns a safe billing conflict when a client already has an active membership", async () => {
    createClientMembershipSubscriptionSessionMock.mockRejectedValue(
      new MonetizationServiceError("A client membership subscription is already active or awaiting billing attention.", 409)
    );

    const response = await postMembership(new Request("http://localhost:3000/api/client/membership", {
      method: "POST",
      body: JSON.stringify({
        planCode: "client_core"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/already active/i);
  });

  it("cancels the current client membership subscription", async () => {
    cancelClientMembershipSubscriptionMock.mockResolvedValue({
      id: "subscription-client-jordan",
      subjectType: "client",
      subjectId: "client-jordan",
      displayName: "Jordan Ellis",
      provider: "stripe_billing",
      providerSubscriptionId: "sub_123",
      providerCustomerId: "cus_123",
      providerPriceId: "price_123",
      planCode: "client_core",
      planName: "Client Core",
      planInterval: "monthly",
      unitAmount: 19,
      currency: "usd",
      subscriptionStatus: "cancelled",
      billingState: "cancelled",
      entitlementStatus: "limited",
      updatedAt: "2026-03-25T21:00:00-04:00"
    });

    const response = await deleteMembership();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(cancelClientMembershipSubscriptionMock).toHaveBeenCalledWith({
      user: {
        role: "client",
        email: "client@bvrb3r.demo",
        name: "Jordan Ellis",
        clientId: "client-jordan"
      }
    });
    expect(body.subscription.subscriptionStatus).toBe("cancelled");
  });
});
