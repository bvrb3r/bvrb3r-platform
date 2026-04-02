import { describe, expect, it } from "vitest";
import {
  buildBarberRevenueIntelligence,
  buildEmptyOwnerMonetizationSummary,
  buildPromotionPerformanceViews,
  buildSubscriptionPortfolioSummary
} from "@/lib/monetization/domain";

describe("phase 19 monetization domain", () => {
  it("builds a zeroed owner monetization summary safely", () => {
    const summary = buildEmptyOwnerMonetizationSummary();

    expect(summary.revenue.grossRevenue).toBe(0);
    expect(summary.subscriptions.rows).toEqual([]);
    expect(summary.promotions.topOffers).toEqual([]);
  });

  it("rolls up subscription portfolio status counts and revenue", () => {
    const summary = buildSubscriptionPortfolioSummary([
      {
        id: "sub-shop",
        subjectType: "shop",
        subjectId: "loc-ybor",
        displayName: "BVRB3R Ybor",
        provider: "stripe_billing",
        planCode: "shop_core_weekly",
        planName: "Shop Core Weekly",
        planInterval: "weekly",
        unitAmount: 20,
        currency: "usd",
        subscriptionStatus: "active",
        billingState: "current",
        entitlementStatus: "enabled",
        updatedAt: "2026-03-23T12:00:00.000Z"
      },
      {
        id: "sub-barber",
        subjectType: "barber",
        subjectId: "barber-blaze",
        displayName: "Blaze King",
        provider: "stripe_billing",
        planCode: "barber_core_weekly",
        planName: "Barber Core Weekly",
        planInterval: "weekly",
        unitAmount: 10,
        currency: "usd",
        subscriptionStatus: "past_due",
        billingState: "past_due",
        entitlementStatus: "limited",
        updatedAt: "2026-03-23T12:00:00.000Z"
      }
    ]);

    expect(summary.totalTracked).toBe(2);
    expect(summary.active).toBe(1);
    expect(summary.billingAttention).toBe(1);
    expect(summary.entitlementReady).toBe(1);
    expect(summary.subscriptionRevenue).toBe(20);
  });

  it("sorts promotion performance by net revenue after discount", () => {
    const views = buildPromotionPerformanceViews(
      [
        {
          promotionId: "promo-a",
          promotionName: "VIP Spring Fade",
          shopId: "loc-ybor",
          shopLabel: "BVRB3R Ybor",
          availabilityState: "active",
          redemptions: [
            { appointmentId: "apt-a", discountAmount: 10 },
            { appointmentId: "apt-b", discountAmount: 5 }
          ]
        },
        {
          promotionId: "promo-b",
          promotionName: "Fresh Start",
          shopId: "loc-ybor",
          shopLabel: "BVRB3R Ybor",
          availabilityState: "active",
          redemptions: [
            { appointmentId: "apt-c", discountAmount: 12 }
          ]
        }
      ],
      new Map([
        ["apt-a", 80],
        ["apt-b", 50],
        ["apt-c", 40]
      ])
    );

    expect(views[0]?.promotionId).toBe("promo-a");
    expect(views[0]?.netRevenueAfterDiscount).toBe(115);
    expect(views[1]?.netRevenueAfterDiscount).toBe(28);
  });

  it("builds barber revenue intelligence from completed appointment history", () => {
    const summary = buildBarberRevenueIntelligence(
      [
        {
          id: "apt-1",
          clientId: "client-jordan",
          clientName: "Jordan Ellis",
          barberId: "barber-blaze",
          barberName: "Blaze King",
          serviceName: "Beard Sculpt",
          start: "2026-03-22T14:00:00.000Z",
          totalAmount: 55,
          balanceDue: 0,
          tipAmount: 10,
          status: "completed"
        },
        {
          id: "apt-2",
          clientId: "client-jordan",
          clientName: "Jordan Ellis",
          barberId: "barber-blaze",
          barberName: "Blaze King",
          serviceName: "Premium Fade",
          start: "2026-03-16T14:00:00.000Z",
          totalAmount: 65,
          balanceDue: 0,
          tipAmount: 12,
          status: "completed"
        },
        {
          id: "apt-3",
          clientId: "client-nova",
          clientName: "Nova Bennett",
          barberId: "barber-blaze",
          barberName: "Blaze King",
          serviceName: "Premium Fade",
          start: "2026-03-10T14:00:00.000Z",
          totalAmount: 45,
          balanceDue: 15,
          tipAmount: 0,
          status: "booked"
        },
        {
          id: "apt-4",
          clientId: "client-jordan",
          clientName: "Jordan Ellis",
          barberId: "barber-blaze",
          barberName: "Blaze King",
          serviceName: "Premium Fade",
          start: "2026-03-28T14:00:00.000Z",
          totalAmount: 65,
          balanceDue: 0,
          tipAmount: 0,
          status: "booked"
        }
      ],
      "2026-03-23T12:00:00.000Z",
      null
    );

    expect(summary.weekRevenue).toBe(120);
    expect(summary.weekTips).toBe(22);
    expect(summary.weekCompletedServices).toBe(2);
    expect(summary.weekAverageTicket).toBe(60);
    expect(summary.weekRebookedClients).toBe(1);
    expect(summary.previousWeekRevenue).toBe(0);
    expect(summary.bestDayRevenue).toBe(65);
    expect(summary.monthRevenue).toBe(120);
    expect(summary.repeatClientRevenue).toBe(120);
    expect(summary.repeatClientShare).toBe(100);
    expect(summary.outstandingBalance).toBe(15);
    expect(summary.topClients[0]?.clientId).toBe("client-jordan");
    expect(summary.serviceMix[0]?.serviceName).toBe("Premium Fade");
  });
});
