import Stripe from "stripe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientPlanAccessCard } from "@/components/client-experience/client-plan-access-card";
import { ShopOwnerPlanAccessCard } from "@/components/owner-experience/shop-owner-plan-access-card";
import { SubscriptionSettingsCard } from "@/components/subscription/subscription-settings-card";
import {
  buildFreeEntitlementTruth,
  isEntitlementAccountRole,
  isEntitlementTier,
  roleToEntitlementRole,
  type EntitlementAccountRole,
  type EntitlementTier,
  type ServerEntitlementTruth
} from "@/lib/entitlements/domain";
import { ENTITLED_FEATURE_REGISTRY, type EntitledFeatureKey } from "@/lib/entitlements/features";
import { buildClientPaywallSummary } from "@/lib/entitlements/client-paywall";
import { buildShopOwnerPaywallSummary } from "@/lib/entitlements/shop-owner-paywall";
import { buildSubscriptionSettingsSummary } from "@/lib/entitlements/subscription-settings";
import { buildStripeEntitlementWebhookUpdate, syncServerEntitlementFromStripeSubscription } from "@/lib/entitlements/stripe-webhook";
import { checkEntitledFeatureAccess, resolveServerEntitlementForUser } from "@/lib/entitlements/server";

const accountRoles = ["client_user", "barber_user", "shop_owner_user"] as const satisfies readonly EntitlementAccountRole[];
const tiers = ["free", "pro", "elite"] as const satisfies readonly EntitlementTier[];

const featureByRole = {
  client_user: {
    free: "client.booking.basic",
    pro: "client.loyalty.pro",
    elite: "client.priority.elite"
  },
  barber_user: {
    free: "barber.profile.basic",
    pro: "barber.retention.pro",
    elite: "barber.growth.elite"
  },
  shop_owner_user: {
    free: "shop_owner.shop.basic",
    pro: "shop_owner.money.pro",
    elite: "shop_owner.scale.elite"
  }
} as const satisfies Record<EntitlementAccountRole, Record<EntitlementTier, EntitledFeatureKey>>;

const forbiddenRoles = [
  "pro_client",
  "elite_client",
  "pro_barber",
  "elite_barber",
  "pro_owner",
  "elite_owner",
  "owner_user",
  "shop_admin",
  "admin_user",
  "guest_user",
  "freelance_barber",
  "booth_rent_barber",
  "commission_barber"
];

const forbiddenUserCopy =
  /client_user|barber_user|shop_owner_user|account_entitlements|stripe_customer_id|stripe_subscription_id|payment_intent|provider_payment_method_id|webhook_unverified|localStorage|server_default|payment_routing_records|payout_readiness_status|relationship_type|booth_rent_barber|commission_barber|freelance_barber/i;

function activeEntitlement(
  accountRole: EntitlementAccountRole,
  tier: Exclude<EntitlementTier, "free"> = "pro",
  overrides: Partial<ServerEntitlementTruth> = {}
): ServerEntitlementTruth {
  return {
    profileId: `profile-${accountRole}`,
    accountRole,
    tier,
    billingInterval: "monthly",
    status: "active",
    source: "stripe_webhook",
    stripeCustomerId: `cus_${accountRole}_should_not_render`,
    stripeSubscriptionId: `sub_${accountRole}_should_not_render`,
    stripePriceId: `price_${accountRole}_${tier}_monthly`,
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

function entitlementFor(accountRole: EntitlementAccountRole, tier: EntitlementTier): ServerEntitlementTruth {
  if (tier === "free") {
    return buildFreeEntitlementTruth({
      profileId: `profile-${accountRole}`,
      accountRole
    });
  }

  return activeEntitlement(accountRole, tier);
}

function tierRank(tier: EntitlementTier) {
  if (tier === "elite") return 2;
  if (tier === "pro") return 1;
  return 0;
}

function subscription(overrides: Partial<Stripe.Subscription> = {}) {
  return {
    id: "sub_regression",
    status: "active",
    customer: "cus_regression",
    current_period_start: 1780272000,
    current_period_end: 1782864000,
    cancel_at: null,
    trial_end: null,
    metadata: {
      profileId: "profile-client",
      accountRole: "client_user",
      entitlementSource: "server"
    },
    items: {
      data: [
        {
          price: {
            id: "price_client_pro_monthly",
            currency: "usd",
            unit_amount: 1900,
            recurring: { interval: "month" }
          }
        }
      ]
    },
    ...overrides
  } as unknown as Stripe.Subscription;
}

function entitlementEnv() {
  return {
    BVRB3R_CLIENT_PRO_MONTHLY_PRICE_ID: "price_client_pro_monthly",
    BVRB3R_CLIENT_ELITE_MONTHLY_PRICE_ID: "price_client_elite_monthly",
    BVRB3R_BARBER_PRO_MONTHLY_PRICE_ID: "price_barber_pro_monthly",
    BVRB3R_BARBER_ELITE_YEARLY_PRICE_ID: "price_barber_elite_yearly",
    BVRB3R_SHOP_OWNER_PRO_MONTHLY_PRICE_ID: "price_owner_pro_monthly",
    BVRB3R_SHOP_OWNER_ELITE_MONTHLY_PRICE_ID: "price_owner_elite_monthly"
  };
}

function supabaseUpsertStub(error: unknown = null) {
  const upserts: Array<Record<string, unknown>> = [];
  return {
    upserts,
    client: {
      from(table: string) {
        expect(table).toBe("account_entitlements");
        return {
          upsert(row: Record<string, unknown>, options: Record<string, unknown>) {
            expect(options).toEqual({ onConflict: "profile_id,account_role" });
            upserts.push(row);
            return Promise.resolve({ error });
          }
        };
      }
    }
  };
}

function visibleText() {
  return document.body.textContent ?? "";
}

describe("paywall entitlement regression lock", () => {
  it("enforces the 9 role/tier access matrix without cross-role contamination", () => {
    for (const accountRole of accountRoles) {
      for (const tier of tiers) {
        const entitlement = entitlementFor(accountRole, tier);
        const user = { id: `profile-${accountRole}`, role: accountRole };

        for (const requiredTier of tiers) {
          const access = checkEntitledFeatureAccess({
            user,
            entitlement,
            featureKey: featureByRole[accountRole][requiredTier]
          });
          const shouldAllow = requiredTier === "free" || tierRank(tier) >= tierRank(requiredTier);

          expect(access.allowed, `${accountRole} ${tier} -> ${requiredTier}`).toBe(shouldAllow);
          expect(access.requiredTier).toBe(requiredTier);
          if (requiredTier === "elite" && tier === "pro") {
            expect(access.state).toBe("needs_upgrade");
          }
        }

        const otherRoleFeatures = ENTITLED_FEATURE_REGISTRY.filter((feature) => feature.accountRole !== accountRole);
        for (const feature of otherRoleFeatures) {
          const access = checkEntitledFeatureAccess({
            user,
            entitlement,
            featureKey: feature.key
          });
          expect(access).toMatchObject({
            allowed: false,
            state: "forbidden_role"
          });
        }
      }
    }
  });

  it("keeps Client, Barber, and Shop Owner locked surfaces honest and non-crashing", () => {
    const clientSummary = buildClientPaywallSummary({
      user: { id: "profile-client", role: "client_user" },
      entitlement: buildFreeEntitlementTruth({ profileId: "profile-client", accountRole: "client_user" })
    });
    expect(clientSummary.currentPlanLabel).toBe("Free");
    expect(clientSummary.features.pro.every((feature) => feature.state === "locked")).toBe(true);
    expect(clientSummary.features.elite.every((feature) => feature.state === "locked")).toBe(true);
    expect(clientSummary.checkoutUrl).toBeNull();
    expect(clientSummary.portalUrl).toBeNull();

    render(<ClientPlanAccessCard summary={clientSummary} showFeatureGroups />);
    expect(screen.getByTestId("client-plan-access-card")).toHaveTextContent("Free client access");
    expect(screen.getByRole("link", { name: "Review plan access" })).toHaveAttribute("href", "/dashboard/client/more?section=wallet");

    const barberSummary = buildSubscriptionSettingsSummary({
      user: { id: "profile-barber", role: "barber_user" },
      entitlement: buildFreeEntitlementTruth({ profileId: "profile-barber", accountRole: "barber_user" })
    });
    expect(barberSummary).toMatchObject({
      roleLabel: "Barber",
      currentTierLabel: "Free",
      accessStateLabel: "Active"
    });
    render(<SubscriptionSettingsCard summary={barberSummary!} />);
    expect(screen.getByTestId("subscription-settings-card-barber")).toHaveTextContent("Paid barber tools stay locked until Stripe, webhook, and server entitlement truth agree.");
    expect(screen.getAllByRole("button", { name: "Plan management is being prepared." }).length).toBeGreaterThanOrEqual(2);

    const ownerSummary = buildShopOwnerPaywallSummary({
      user: { id: "profile-owner", role: "shop_owner_user" },
      entitlement: buildFreeEntitlementTruth({ profileId: "profile-owner", accountRole: "shop_owner_user" })
    });
    expect(ownerSummary.features.pro.every((feature) => feature.state === "locked")).toBe(true);
    expect(ownerSummary.upgradeHref).toBeNull();
    render(<ShopOwnerPlanAccessCard summary={ownerSummary} showFeatureGroups />);
    expect(screen.getByTestId("shop-owner-plan-access-card")).toHaveTextContent("Plan management is being prepared");

    expect(visibleText()).not.toMatch(forbiddenUserCopy);
  });

  it("rejects fake roles, fake tiers, frontend memory, and role mismatches before paid access", async () => {
    for (const role of forbiddenRoles) {
      expect(isEntitlementAccountRole(role), role).toBe(false);
      expect(roleToEntitlementRole(role), role).toBeNull();
      await expect(resolveServerEntitlementForUser({ user: { id: `profile-${role}`, role: role as never } })).resolves.toBeNull();
    }

    for (const tier of [...forbiddenRoles, "standard", "premium", "paid"]) {
      expect(isEntitlementTier(tier), tier).toBe(false);
    }

    window.localStorage.setItem("bvrb3r-tier", "elite");
    const freeClientEntitlement = buildFreeEntitlementTruth({
      profileId: "profile-client",
      accountRole: "client_user"
    });
    const freeClientAccess = checkEntitledFeatureAccess({
      user: { id: "profile-client", role: "client_user" },
      entitlement: freeClientEntitlement,
      featureKey: "client.priority.elite"
    });
    expect(freeClientAccess.allowed).toBe(false);
    expect(freeClientAccess.state).toBe("needs_upgrade");

    const fakeTierEntitlement = {
      ...activeEntitlement("client_user", "pro"),
      tier: "elite_client"
    } as unknown as ServerEntitlementTruth;
    const fakeTierAccess = checkEntitledFeatureAccess({
      user: { id: "profile-client", role: "client_user" },
      entitlement: fakeTierEntitlement,
      featureKey: "client.loyalty.pro"
    });
    expect(fakeTierAccess.allowed).toBe(false);

    const mismatchedSummary = buildSubscriptionSettingsSummary({
      user: { id: "profile-client", role: "client_user" },
      entitlement: activeEntitlement("barber_user", "elite")
    });
    expect(mismatchedSummary).toBeNull();
  });

  it("blocks inactive, unmapped, and unverified paid proof without fake Pass", () => {
    const blockedProofs: Array<Partial<ServerEntitlementTruth>> = [
      { status: "past_due" },
      { status: "canceled" },
      { status: "unpaid" },
      {
        source: "account_entitlements",
        verification: {
          persistenceConnected: true,
          stripePriceMapped: false,
          webhookVerified: false,
          reasons: ["Stripe price is not mapped to a canonical entitlement."]
        }
      },
      {
        source: "stripe_webhook",
        verification: {
          persistenceConnected: false,
          stripePriceMapped: true,
          webhookVerified: true,
          reasons: ["Entitlement persistence is unavailable."]
        }
      }
    ];

    for (const override of blockedProofs) {
      const access = checkEntitledFeatureAccess({
        user: { id: "profile-client", role: "client_user" },
        entitlement: activeEntitlement("client_user", "pro", override),
        featureKey: "client.loyalty.pro"
      });
      expect(access.allowed, JSON.stringify(override)).toBe(false);
      expect(["needs_upgrade", "needs_review"]).toContain(access.state);
    }
  });

  it("keeps Stripe webhook entitlement mapping canonical and blocks fake roles", async () => {
    const active = buildStripeEntitlementWebhookUpdate({
      subscription: subscription(),
      env: entitlementEnv()
    });
    expect(active).toMatchObject({
      handled: true,
      blocked: false,
      accountRole: "client_user",
      status: "active"
    });

    const pastDue = buildStripeEntitlementWebhookUpdate({
      subscription: subscription({ status: "past_due" }),
      env: entitlementEnv()
    });
    expect(pastDue).toMatchObject({
      handled: true,
      blocked: false,
      status: "past_due"
    });

    const canceled = buildStripeEntitlementWebhookUpdate({
      subscription: subscription({ status: "canceled" }),
      env: entitlementEnv()
    });
    expect(canceled).toMatchObject({
      handled: true,
      blocked: false,
      status: "canceled"
    });

    const fakeRole = buildStripeEntitlementWebhookUpdate({
      subscription: subscription({
        metadata: {
          profileId: "profile-client",
          accountRole: "pro_client",
          entitlementSource: "server"
        }
      }),
      env: entitlementEnv()
    });
    expect(fakeRole).toMatchObject({
      handled: true,
      blocked: true,
      accountRole: null,
      reason: "Stripe entitlement role metadata does not match the server price map."
    });

    const legacy = buildStripeEntitlementWebhookUpdate({
      subscription: subscription({
        metadata: { planCode: "legacy_client_plan" },
        items: {
          data: [{ price: { id: "price_legacy", recurring: { interval: "month" } } }]
        } as never
      }),
      env: entitlementEnv()
    });
    expect(legacy).toMatchObject({
      handled: false,
      blocked: false
    });

    const supabase = supabaseUpsertStub();
    await syncServerEntitlementFromStripeSubscription({
      supabase: supabase.client as never,
      subscription: subscription({ status: "past_due" }),
      eventId: "evt_paywall_regression",
      env: entitlementEnv()
    });
    expect(supabase.upserts).toHaveLength(1);
    expect(supabase.upserts[0]).toMatchObject({
      account_role: "client_user",
      tier: "pro",
      entitlement_status: "past_due",
      source_of_truth: "stripe_webhook",
      last_stripe_event_id: "evt_paywall_regression"
    });
  });

  it("keeps subscription settings copy safe while showing role-aware current tier and honest disabled actions", () => {
    const summaries = accountRoles.map((accountRole) => buildSubscriptionSettingsSummary({
      user: { id: `profile-${accountRole}`, role: accountRole },
      entitlement: accountRole === "client_user"
        ? buildFreeEntitlementTruth({ profileId: `profile-${accountRole}`, accountRole })
        : activeEntitlement(accountRole, accountRole === "shop_owner_user" ? "elite" : "pro")
    }));

    expect(summaries.map((summary) => summary?.roleLabel)).toEqual(["Client", "Barber", "Shop Owner"]);
    expect(summaries.map((summary) => summary?.currentTierLabel)).toEqual(["Free", "Pro", "Elite"]);
    for (const summary of summaries) {
      expect(summary?.manageAction).toMatchObject({
        href: null,
        state: "unavailable",
        unavailableReason: "Plan management is being prepared."
      });
      render(<SubscriptionSettingsCard summary={summary!} />);
    }

    expect(screen.getByTestId("subscription-settings-card-client")).toHaveTextContent("Free Client plan");
    expect(screen.getByTestId("subscription-settings-card-barber")).toHaveTextContent("Pro Barber plan");
    expect(screen.getByTestId("subscription-settings-card-shop_owner")).toHaveTextContent("Elite Shop Owner plan");
    expect(visibleText()).not.toMatch(forbiddenUserCopy);
  });
});
