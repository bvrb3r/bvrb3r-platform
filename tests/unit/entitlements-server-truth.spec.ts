import { describe, expect, it, vi } from "vitest";
import {
  buildFreeEntitlementTruth,
  type ServerEntitlementTruth
} from "@/lib/entitlements/domain";
import {
  buildEntitlementSnapshot,
  checkEntitledFeatureAccess,
  resolveServerEntitlementForUser
} from "@/lib/entitlements/server";

function supabaseEntitlementResult(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result)
  };

  return {
    from(table: string) {
      expect(table).toBe("account_entitlements");
      return {
        select(columns: string) {
          expect(columns).toContain("account_role");
          return query;
        }
      };
    }
  };
}

function activeProEntitlement(overrides: Partial<ServerEntitlementTruth> = {}): ServerEntitlementTruth {
  return {
    profileId: "profile-client",
    accountRole: "client_user",
    tier: "pro",
    billingInterval: "monthly",
    status: "active",
    source: "stripe_webhook",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
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

describe("server entitlement truth", () => {
  it("defaults canonical signed-in accounts to Free without granting paid access", async () => {
    const entitlement = await resolveServerEntitlementForUser({
      user: { id: "profile-client", role: "client_user" },
      supabaseOverride: supabaseEntitlementResult({ data: null, error: null }) as never
    });

    expect(entitlement).toMatchObject({
      accountRole: "client_user",
      tier: "free",
      billingInterval: "none",
      status: "free",
      source: "server_default"
    });

    const proAccess = checkEntitledFeatureAccess({
      user: { id: "profile-client", role: "client_user" },
      featureKey: "client.loyalty.pro",
      entitlement
    });

    expect(proAccess).toMatchObject({
      allowed: false,
      state: "needs_upgrade"
    });
  });

  it("does not normalize legacy account roles into paid entitlement authority", async () => {
    const entitlement = await resolveServerEntitlementForUser({
      user: { id: "profile-owner", role: "owner" },
      supabaseOverride: supabaseEntitlementResult({ data: null, error: null }) as never
    });

    expect(entitlement).toBeNull();
  });

  it("allows paid features only with server persisted, mapped, webhook-verified active proof", () => {
    const access = checkEntitledFeatureAccess({
      user: { id: "profile-client", role: "client_user" },
      featureKey: "client.loyalty.pro",
      entitlement: activeProEntitlement()
    });

    expect(access).toMatchObject({
      allowed: true,
      state: "allowed",
      currentTier: "pro"
    });
  });

  it("keeps past-due paid entitlement from unlocking paid features", () => {
    const access = checkEntitledFeatureAccess({
      user: { id: "profile-client", role: "client_user" },
      featureKey: "client.loyalty.pro",
      entitlement: activeProEntitlement({ status: "past_due" })
    });

    expect(access.allowed).toBe(false);
    expect(access.state).toBe("needs_upgrade");
  });

  it("keeps unmapped paid proof in Needs Review rather than Pass", () => {
    const access = checkEntitledFeatureAccess({
      user: { id: "profile-client", role: "client_user" },
      featureKey: "client.loyalty.pro",
      entitlement: activeProEntitlement({
        verification: {
          persistenceConnected: true,
          stripePriceMapped: false,
          webhookVerified: true,
          reasons: ["Stripe price is not mapped to a canonical entitlement."]
        }
      })
    });

    expect(access.allowed).toBe(false);
    expect(access.state).toBe("needs_review");
  });

  it("returns a safe client snapshot without Stripe secrets or UI truth", () => {
    const snapshot = buildEntitlementSnapshot(activeProEntitlement());

    expect(snapshot).toMatchObject({
      accountRole: "client_user",
      tier: "pro",
      paidAccess: true,
      accessState: "allowed"
    });
    expect(snapshot).not.toHaveProperty("stripeCustomerId");
    expect(snapshot).not.toHaveProperty("stripeSubscriptionId");
  });

  it("treats unavailable entitlement persistence as Free plus Needs Review for paid access", async () => {
    const entitlement = await resolveServerEntitlementForUser({
      user: { id: "profile-client", role: "client_user" },
      supabaseOverride: supabaseEntitlementResult({
        data: null,
        error: { code: "42P01", message: "relation public.account_entitlements does not exist" }
      }) as never
    });

    expect(entitlement?.tier).toBe("free");
    expect(entitlement?.verification.persistenceConnected).toBe(false);

    const access = checkEntitledFeatureAccess({
      user: { id: "profile-client", role: "client_user" },
      featureKey: "client.loyalty.pro",
      entitlement
    });

    expect(access.allowed).toBe(false);
    expect(access.state).toBe("needs_review");
  });

  it("allows free features for canonical roles without paid proof", () => {
    const entitlement = buildFreeEntitlementTruth({
      profileId: "profile-barber",
      accountRole: "barber_user"
    });
    const access = checkEntitledFeatureAccess({
      user: { id: "profile-barber", role: "barber_user" },
      featureKey: "barber.profile.basic",
      entitlement
    });

    expect(access).toMatchObject({
      allowed: true,
      state: "allowed",
      requiredTier: "free"
    });
  });
});
