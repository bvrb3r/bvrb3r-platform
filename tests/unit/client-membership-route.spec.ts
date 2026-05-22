import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  createSupabaseAdminClientMock,
  readPointsBalanceForClientReferenceMock,
  readClientReferralSummaryMock,
  buildClientMembershipExecutionSummaryMock,
  createClientMembershipSubscriptionSessionMock,
  cancelClientMembershipSubscriptionMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
  readPointsBalanceForClientReferenceMock: vi.fn(),
  readClientReferralSummaryMock: vi.fn(),
  buildClientMembershipExecutionSummaryMock: vi.fn(),
  createClientMembershipSubscriptionSessionMock: vi.fn(),
  cancelClientMembershipSubscriptionMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/points/engine", () => ({
  readPointsBalanceForClientReference: readPointsBalanceForClientReferenceMock
}));

vi.mock("@/lib/referrals/service", () => ({
  readClientReferralSummary: readClientReferralSummaryMock
}));

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
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getClientExperienceContextMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    readPointsBalanceForClientReferenceMock.mockReset();
    readClientReferralSummaryMock.mockReset();
    buildClientMembershipExecutionSummaryMock.mockReset();
    createClientMembershipSubscriptionSessionMock.mockReset();
    cancelClientMembershipSubscriptionMock.mockReset();

    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "client_user",
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
    createSupabaseAdminClientMock.mockReturnValue({ from: vi.fn() });
    readPointsBalanceForClientReferenceMock.mockResolvedValue({
      unlockedPoints: 220,
      lifetimeEarned: 480
    });
    readClientReferralSummaryMock.mockResolvedValue({
      clientId: "client-jordan",
      inviteLink: "/referrals",
      shareMessage: "Share your code.",
      totals: {
        invited: 3,
        signedUp: 2,
        booked: 2,
        completed: 1,
        credited: 1,
        rewardPointsEarned: 10
      },
      recentReferrals: []
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

  afterEach(() => {
    warnSpy.mockRestore();
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
    const supabase = { from: vi.fn() };
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const response = await getMembership();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(readPointsBalanceForClientReferenceMock).toHaveBeenCalledWith("client-jordan", supabase);
    expect(readClientReferralSummaryMock).toHaveBeenCalledWith({
      clientId: "client-jordan",
      clientEmail: "client@bvrb3r.demo"
    }, supabase);
    expect(buildClientMembershipExecutionSummaryMock).toHaveBeenCalledWith({
      clientId: "client-jordan",
      clientName: "Jordan Ellis",
      pointsBalance: 220,
      referralCredits: 10,
      unlockedRewardCount: 0,
      nextDueAt: null,
      supabaseOverride: supabase
    });
    expect(body.membership.plans).toHaveLength(1);
  });

  it("allows legacy client role membership hydration", async () => {
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

    const response = await getMembership();

    expect(response.status).toBe(200);
  });

  it("returns no membership as a safe default without an error response", async () => {
    buildClientMembershipExecutionSummaryMock.mockResolvedValue({
      subscription: null,
      value: null,
      membershipStatus: "none",
      tier: "none",
      active: false,
      points: 0,
      plans: [],
      activePlan: null,
      pricingAdjustment: null,
      canSubscribe: true,
      canCancel: false
    });

    const response = await getMembership();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.membership).toMatchObject({
      subscription: null,
      membershipStatus: "none",
      tier: "none",
      active: false,
      points: 0
    });
    expect(warnSpy).toHaveBeenCalledWith("[client-profile] membership_status_defaulted", expect.objectContaining({
      membershipStatus: "none",
      tier: "none",
      active: false,
      points: 0
    }));
    expect(warnSpy).not.toHaveBeenCalledWith("[client-profile] membership_status_failed", expect.anything());
  });

  it("returns a warning response only when membership hydration fails", async () => {
    buildClientMembershipExecutionSummaryMock.mockRejectedValue(new Error("billing_subscriptions query failed"));

    const response = await getMembership();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("billing_subscriptions query failed");
    expect(warnSpy).toHaveBeenCalledWith("[client-profile] membership_status_failed", expect.objectContaining({
      stage: "read_execution_summary",
      role: "client_user",
      message: "billing_subscriptions query failed"
    }));
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
        role: "client_user",
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
        role: "client_user",
        email: "client@bvrb3r.demo",
        name: "Jordan Ellis",
        clientId: "client-jordan"
      }
    });
    expect(body.subscription.subscriptionStatus).toBe("cancelled");
  });
});
