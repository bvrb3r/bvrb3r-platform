import { describe, expect, it } from "vitest";
import { getPlatformSubscriptionPlan } from "@/lib/monetization/platform-subscriptions";

describe("platform subscription plans", () => {
  it("locks barber subscriptions to $10 weekly", () => {
    expect(getPlatformSubscriptionPlan("barber")).toMatchObject({
      planCode: "barber_core_weekly",
      interval: "weekly",
      unitAmount: 10,
      currency: "usd"
    });
  });

  it("locks shop subscriptions to $20 weekly", () => {
    expect(getPlatformSubscriptionPlan("shop")).toMatchObject({
      planCode: "shop_core_weekly",
      interval: "weekly",
      unitAmount: 20,
      currency: "usd"
    });
  });
});
