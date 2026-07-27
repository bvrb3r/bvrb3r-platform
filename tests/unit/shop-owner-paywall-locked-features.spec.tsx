import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShopOwnerPlanAccessCard, ShopOwnerUpgradePrompt } from "@/components/owner-experience/shop-owner-plan-access-card";
import { buildFreeEntitlementTruth, type ServerEntitlementTruth } from "@/lib/entitlements/domain";
import { buildShopOwnerPaywallSummary } from "@/lib/entitlements/shop-owner-paywall";

const forbiddenUserCopy = /shop_owner_user|client_user|barber_user|guest_user|owner_user|shop_admin|entitlement_status|stripe_customer_id|stripe_subscription_id|account_entitlements|provider_payment_method_id|payment_intent|localStorage|webhook_unverified|server_default|payout_readiness_status|payment_routing_records|relationship_type|booth_rent_barber|commission_barber|freelance_barber/i;  // doctrine-allow

function activeOwnerEntitlement(overrides: Partial<ServerEntitlementTruth> = {}): ServerEntitlementTruth {
  return {
    profileId: "profile-owner",
    accountRole: "shop_owner_user",
    tier: "pro",
    billingInterval: "monthly",
    status: "active",
    source: "stripe_webhook",
    stripeCustomerId: "cus_should_not_render",
    stripeSubscriptionId: "sub_should_not_render",
    stripePriceId: "price_owner_pro_monthly",
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

describe("shop owner paywall locked feature model", () => {
  it("keeps Free owner shop setup available and paid owner tools locked", () => {
    const summary = buildShopOwnerPaywallSummary({
      user: { id: "profile-owner", role: "shop_owner_user" },
      entitlement: buildFreeEntitlementTruth({
        profileId: "profile-owner",
        accountRole: "shop_owner_user"
      })
    });

    expect(summary.activeOwnerPaywall).toBe(true);
    expect(summary.currentPlanLabel).toBe("Free");
    expect(summary.freeShopSetupAvailable).toBe(true);
    expect(summary.features.free.every((feature) => feature.state === "available")).toBe(true);
    expect(summary.features.pro.every((feature) => feature.state === "locked")).toBe(true);
    expect(summary.features.elite.every((feature) => feature.state === "locked")).toBe(true);
    expect(summary.checkoutUrl).toBeNull();
    expect(summary.portalUrl).toBeNull();
    expect(summary.upgradeHref).toBeNull();
    expect(summary.upgradeActionLabel).toBe("Plan management is being prepared");
  });

  it("unlocks live Pro owner tools only from server-verified owner entitlement proof", () => {
    const summary = buildShopOwnerPaywallSummary({
      user: { id: "profile-owner", role: "shop_owner_user" },
      entitlement: activeOwnerEntitlement({ tier: "pro" })
    });

    expect(summary.currentPlanLabel).toBe("Pro");
    expect(summary.statusLabel).toBe("Paid access verified");
    expect(summary.features.pro.filter((feature) => feature.state === "available").map((feature) => feature.id)).toEqual([
      "owner-advanced-team-controls",
      "owner-schedule-capacity-tools",
      "owner-money-reports",
      "owner-performance-analytics"
    ]);
    expect(summary.features.pro.filter((feature) => feature.state === "coming_soon").map((feature) => feature.id)).toEqual([
      "owner-compensation-advanced",
      "owner-kiosk-advanced"
    ]);
    expect(summary.features.elite.every((feature) => feature.state === "locked")).toBe(true);
  });

  it("treats Elite owner proof as included for future Elite surfaces without making parked features active", () => {
    const summary = buildShopOwnerPaywallSummary({
      user: { id: "profile-owner", role: "shop_owner_user" },
      entitlement: activeOwnerEntitlement({ tier: "elite" })
    });

    expect(summary.currentPlanLabel).toBe("Elite");
    expect(summary.statusLabel).toBe("Paid access verified");
    expect(summary.features.pro.filter((feature) => feature.state === "available")).toHaveLength(4);
    expect(summary.features.elite.every((feature) => feature.state === "coming_soon")).toBe(true);
    expect(summary.features.elite.map((feature) => feature.reason)).toEqual(
      expect.arrayContaining(["Included with Elite when the shop owner feature is live."])
    );
  });

  it("keeps unknown paid entitlement proof in Needs Review rather than fake paid access", () => {
    const summary = buildShopOwnerPaywallSummary({
      user: { id: "profile-owner", role: "shop_owner_user" },
      entitlement: activeOwnerEntitlement({
        status: "needs_review",
        source: "account_entitlements",
        verification: {
          persistenceConnected: true,
          stripePriceMapped: false,
          webhookVerified: false,
          reasons: ["Stored entitlement tier is missing or noncanonical."]
        }
      })
    });

    expect(summary.statusLabel).toBe("Needs Review");
    expect(summary.needsReviewCount).toBeGreaterThan(0);
    expect(summary.features.pro.every((feature) => feature.state === "needs_review")).toBe(true);
    expect(summary.features.elite.every((feature) => feature.state === "needs_review")).toBe(true);
  });

  it("handles missing entitlement persistence as Needs Review without fake Pro or Elite access", () => {
    const summary = buildShopOwnerPaywallSummary({
      user: { id: "profile-owner", role: "shop_owner_user" },
      entitlement: buildFreeEntitlementTruth({
        profileId: "profile-owner",
        accountRole: "shop_owner_user",
        persistenceConnected: false,
        reason: "Paid access remains locked."
      })
    });

    expect(summary.currentPlanLabel).toBe("Free");
    expect(summary.statusLabel).toBe("Needs Review");
    expect(summary.features.free.every((feature) => feature.state === "available")).toBe(true);
    expect(summary.features.pro.every((feature) => feature.state === "needs_review")).toBe(true);
    expect(summary.features.elite.every((feature) => feature.state === "needs_review")).toBe(true);
  });

  it("does not unlock owner tools from Client or Barber entitlement proof", () => {
    const clientSummary = buildShopOwnerPaywallSummary({
      user: { id: "profile-client", role: "client_user" },
      entitlement: { ...activeOwnerEntitlement(), accountRole: "client_user", tier: "elite" }
    });
    const barberSummary = buildShopOwnerPaywallSummary({
      user: { id: "profile-barber", role: "barber_user" },
      entitlement: { ...activeOwnerEntitlement(), accountRole: "barber_user", tier: "elite" }
    });

    expect(clientSummary.activeOwnerPaywall).toBe(false);
    expect(barberSummary.activeOwnerPaywall).toBe(false);
    expect(clientSummary.features.free.every((feature) => feature.state === "forbidden_role")).toBe(true);
    expect(barberSummary.features.pro.every((feature) => feature.state === "forbidden_role")).toBe(true);
  });

  it("does not expose backend labels, provider identifiers, fake roles, checkout URLs, or money calculations", () => {
    const summary = buildShopOwnerPaywallSummary({
      user: { id: "profile-owner", role: "shop_owner_user" },
      entitlement: activeOwnerEntitlement()
    });
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toContain("cus_should_not_render");
    expect(serialized).not.toContain("sub_should_not_render");
    expect(serialized).not.toMatch(forbiddenUserCopy);
    expect(summary.checkoutUrl).toBeNull();
    expect(summary.portalUrl).toBeNull();
    expect(serialized).not.toMatch(/providerGrossAmount|barberPayoutAmount|shopSplitAmount|readyForPayoutAmount|\$\d/);
  });

  it("renders owner plan cards and parked plan-management CTA without forbidden copy", () => {
    const summary = buildShopOwnerPaywallSummary({
      user: { id: "profile-owner", role: "shop_owner_user" },
      entitlement: buildFreeEntitlementTruth({
        profileId: "profile-owner",
        accountRole: "shop_owner_user"
      })
    });

    render(<ShopOwnerPlanAccessCard summary={summary} showFeatureGroups />);
    const card = screen.getByTestId("shop-owner-plan-access-card");

    expect(within(card).getByText("Shop owner plan access")).toBeInTheDocument();
    expect(within(card).getByText("Free shop access")).toBeInTheDocument();
    expect(within(card).getByText("Shop profile, location, hours, and chairs")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Plan management is being prepared" })).toBeDisabled();
    expect(within(card).getByRole("link", { name: "Keep setting up your shop" })).toHaveAttribute("href", "/dashboard/owner/more");
    expect(card.textContent).not.toMatch(forbiddenUserCopy);
  });

  it("does not render the active owner paywall for non-owner summaries", () => {
    const summary = buildShopOwnerPaywallSummary({
      user: { id: "profile-client", role: "client_user" },
      entitlement: { ...activeOwnerEntitlement(), accountRole: "client_user" }
    });

    render(<ShopOwnerPlanAccessCard summary={summary} />);
    expect(screen.queryByTestId("shop-owner-plan-access-card")).not.toBeInTheDocument();
  });

  it("keeps direct locked money and kiosk access safely blocked for Free owners", () => {
    const summary = buildShopOwnerPaywallSummary({
      user: { id: "profile-owner", role: "shop_owner_user" },
      entitlement: buildFreeEntitlementTruth({
        profileId: "profile-owner",
        accountRole: "shop_owner_user"
      })
    });
    const moneyFeature = summary.features.pro.find((feature) => feature.id === "owner-money-reports");
    const kioskFeature = summary.features.pro.find((feature) => feature.id === "owner-kiosk-advanced");

    expect(moneyFeature).toMatchObject({ state: "locked", requiredPlanLabel: "Pro" });
    expect(kioskFeature).toMatchObject({ state: "locked", requiredPlanLabel: "Pro" });
  });

  it("renders the upgrade prompt as a safe parked plan-management state", () => {
    const summary = buildShopOwnerPaywallSummary({
      user: { id: "profile-owner", role: "shop_owner_user" },
      entitlement: buildFreeEntitlementTruth({
        profileId: "profile-owner",
        accountRole: "shop_owner_user"
      })
    });

    render(<ShopOwnerUpgradePrompt summary={summary} feature={summary.features.pro[0]} />);

    expect(screen.getByTestId("shop-owner-upgrade-prompt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan management is being prepared" })).toBeDisabled();
    expect(screen.getByText("Server owns plan truth")).toBeInTheDocument();
    expect(screen.getByText("Money stays server-owned")).toBeInTheDocument();
    expect(screen.getByText("Plan management is parked")).toBeInTheDocument();
    expect(screen.getByTestId("shop-owner-upgrade-prompt").textContent).not.toMatch(forbiddenUserCopy);
  });
});
