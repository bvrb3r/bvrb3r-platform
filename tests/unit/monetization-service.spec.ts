import { describe, expect, it, vi } from "vitest";
import {
  buildOwnerMonetizationSummary,
  buildClientMembershipExecutionSummary,
  readActiveClientMembershipSubscription
} from "@/lib/monetization/service";

function createBillingSupabaseEmptyDouble() {
  const insert = vi.fn();
  const or = vi.fn().mockResolvedValue({
    data: [],
    error: null
  });
  const select = vi.fn(() => ({
    or
  }));
  const from = vi.fn(() => ({
    select,
    insert
  }));

  return {
    supabase: { from } as never,
    insert,
    from,
    select,
    or
  };
}

describe("monetization service", () => {
  it("does not create synthetic client subscriptions while reading membership execution", async () => {
    const mock = createBillingSupabaseEmptyDouble();

    const membership = await buildClientMembershipExecutionSummary({
      clientId: "client-jordan",
      clientName: "Jordan Ellis",
      pointsBalance: 120,
      referralCredits: 10,
      unlockedRewardCount: 0,
      nextDueAt: null,
      supabaseOverride: mock.supabase
    });

    expect(membership.subscription).toBeNull();
    expect(membership.value).toBeNull();
    expect(membership.canSubscribe).toBe(true);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("returns no active client subscription when no canonical billing row exists", async () => {
    const mock = createBillingSupabaseEmptyDouble();

    const subscription = await readActiveClientMembershipSubscription("client-jordan", mock.supabase);

    expect(subscription).toBeNull();
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("does not fall back to demo shop or barber labels when revenue scope is sparse", async () => {
    const summary = await buildOwnerMonetizationSummary({
      state: {
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
      } as never,
      snapshot: {
        mode: "supabase",
        fetchedAt: "2026-04-22T10:00:00.000Z",
        appointments: [
          {
            id: "appt-1",
            clientId: "client-1",
            barberId: "barber-real",
            serviceId: "service-1",
            locationId: "loc-real",
            start: "2026-04-22T14:00:00.000Z",
            end: "2026-04-22T15:00:00.000Z",
            status: "completed",
            chair: "Chair 1",
            note: "",
            totalAmount: 40,
            balanceDue: 0,
            depositAmount: 0,
            tipAmount: 5,
            grandTotal: 45,
            bookingSource: "marketplace",
            revision: 1
          }
        ],
        clients: [],
        walkIns: [],
        workflowEvents: [],
        compensationSnapshots: [],
        ownerAnalytics: []
      } as never,
      locationIds: []
    });

    expect(summary.revenue.grossRevenue).toBe(40);
    expect(summary.barberContribution[0]?.barberName).toBe("barber-real");
  });
});
