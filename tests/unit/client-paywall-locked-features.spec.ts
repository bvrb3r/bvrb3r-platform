import { describe, expect, it } from "vitest";
import { buildFreeEntitlementTruth, type ServerEntitlementTruth } from "@/lib/entitlements/domain";
import { buildClientPaywallSummary } from "@/lib/entitlements/client-paywall";

function activeClientEntitlement(overrides: Partial<ServerEntitlementTruth> = {}): ServerEntitlementTruth {
  return {
    profileId: "profile-client",
    accountRole: "client_user",
    tier: "pro",
    billingInterval: "monthly",
    status: "active",
    source: "stripe_webhook",
    stripeCustomerId: "cus_should_not_render",
    stripeSubscriptionId: "sub_should_not_render",
    stripePriceId: "price_client_pro_monthly",
    currentPeriodStart: "2026-06-01T00:00:00.000Z",
    currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    cancelAt: null,
    trialEnd: null,
    updatedAt: "2026-06-28T00:00:00.000Z",
    verification: {
      persistenceConnected: true,
      stripePriceMapped: true,
      webhookVerified: true,
      reasons: []
    },
    ...overrides
  };
}

describe("client paywall locked feature model", () => {
  it("keeps free client booking, search, and discovery available from server entitlement truth", () => {
    const summary = buildClientPaywallSummary({
      user: { id: "profile-client", role: "client_user" },
      entitlement: buildFreeEntitlementTruth({
        profileId: "profile-client",
        accountRole: "client_user"
      })
    });

    expect(summary.currentPlanLabel).toBe("Free");
    expect(summary.freeBookingAvailable).toBe(true);
    expect(summary.features.free.every((feature) => feature.state === "available")).toBe(true);
    expect(summary.features.pro.every((feature) => feature.state === "locked")).toBe(true);
    expect(summary.features.elite.every((feature) => feature.state === "locked")).toBe(true);
  });

  it("does not treat server-verified paid access as a live feature build for V1 locked tools", () => {
    const summary = buildClientPaywallSummary({
      user: { id: "profile-client", role: "client_user" },
      entitlement: activeClientEntitlement({ tier: "elite" })
    });

    expect(summary.currentPlanLabel).toBe("Elite");
    expect(summary.statusLabel).toBe("Paid access verified");
    expect(summary.features.pro.every((feature) => feature.state === "coming_soon")).toBe(true);
    expect(summary.features.elite.every((feature) => feature.state === "coming_soon")).toBe(true);
    expect(summary.features.elite.map((feature) => feature.reason)).toContain("Server entitlement is valid, but this client feature is not live in V1.");
  });

  it("keeps unavailable persistence in Needs Review rather than fake upgrade success", () => {
    const summary = buildClientPaywallSummary({
      user: { id: "profile-client", role: "client_user" },
      entitlement: buildFreeEntitlementTruth({
        profileId: "profile-client",
        accountRole: "client_user",
        persistenceConnected: false,
        reason: "Supabase entitlement persistence is not connected; paid access remains locked."
      })
    });

    expect(summary.statusLabel).toBe("Needs review");
    expect(summary.needsReviewCount).toBeGreaterThan(0);
    expect(summary.features.pro.every((feature) => feature.state === "needs_review")).toBe(true);
  });

  it("does not unlock from role mismatch, UI memory, checkout URLs, portal URLs, or Stripe ids", () => {
    const summary = buildClientPaywallSummary({
      user: { id: "profile-client", role: "barber_user" },
      entitlement: activeClientEntitlement()
    });
    const serialized = JSON.stringify(summary);

    expect(summary.features.pro.every((feature) => feature.state === "locked")).toBe(true);
    expect(summary.checkoutUrl).toBeNull();
    expect(summary.portalUrl).toBeNull();
    expect(serialized).not.toContain("cus_should_not_render");
    expect(serialized).not.toContain("sub_should_not_render");
  });
});
