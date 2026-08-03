import { describe, expect, it } from "vitest";
import {
  buildStandardEntitlementTruth,
  ENTITLEMENT_TIERS,
  normalizeEntitlementStatus,
  normalizeEntitlementTier
} from "@/lib/entitlements/domain";
import {
  CANONICAL_PLAN_PRICING,
  CANONICAL_PLAN_TIERS,
  getCanonicalPlanPrice
} from "@/lib/entitlements/plans";

describe("Standard / Pro / Elite pricing doctrine", () => {
  it("keeps Standard at exactly $0 for every account role", () => {
    for (const role of ["client_user", "barber_user", "shop_owner_user"] as const) {
      expect(getCanonicalPlanPrice(role, "standard")).toEqual({
        tier: "standard",
        label: "Standard",
        monthlyCents: 0,
        yearlyCents: 0,
        billable: false
      });
    }
  });

  it("publishes only Standard, Pro, and Elite in canonical order", () => {
    expect(ENTITLEMENT_TIERS).toEqual(["standard", "pro", "elite"]);
    expect(CANONICAL_PLAN_TIERS).toEqual(["standard", "pro", "elite"]);
  });

  it("locks the approved role-aware paid prices without assigning a charge to Standard", () => {
    expect(CANONICAL_PLAN_PRICING.client_user.pro.monthlyCents).toBe(999);
    expect(CANONICAL_PLAN_PRICING.client_user.elite.monthlyCents).toBe(1_999);
    expect(CANONICAL_PLAN_PRICING.barber_user.pro.monthlyCents).toBe(2_900);
    expect(CANONICAL_PLAN_PRICING.barber_user.elite.monthlyCents).toBe(4_900);
    expect(CANONICAL_PLAN_PRICING.shop_owner_user.pro.monthlyCents).toBe(7_900);
    expect(CANONICAL_PLAN_PRICING.shop_owner_user.elite.monthlyCents).toBe(12_900);
  });

  it("normalizes legacy free persistence without exposing it as a current plan", () => {
    expect(normalizeEntitlementTier("free")).toBe("standard");
    expect(normalizeEntitlementStatus("free")).toBe("standard");

    expect(buildStandardEntitlementTruth({
      profileId: "profile-client",
      accountRole: "client_user"
    })).toMatchObject({
      tier: "standard",
      billingInterval: "none",
      status: "standard",
      stripeSubscriptionId: null,
      stripePriceId: null
    });
  });
});
