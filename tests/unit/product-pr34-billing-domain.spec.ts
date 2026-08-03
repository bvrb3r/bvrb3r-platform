import { describe, expect, it } from "vitest";
import {
  buildBillingBalanceSnapshot,
  buildBillingPlanView,
  checkBillingRiskAction,
  roleTrueBalanceHoldCopy,
  type BillingBalanceLineRow
} from "@/lib/billing/pr34-domain";
import { buildStandardEntitlementTruth, type ServerEntitlementTruth } from "@/lib/entitlements/domain";

function line(overrides: Partial<BillingBalanceLineRow> = {}): BillingBalanceLineRow {
  return {
    id: "line-1",
    source_type: "subscription",
    source_reference: "INV-1001",
    description: "Pro subscription — July",
    provider: "stripe",
    provider_reference: "in_123",
    amount_cents: 2900,
    amount_paid_cents: 0,
    currency: "usd",
    status: "open",
    collection_paused: false,
    due_at: "2026-08-01T00:00:00.000Z",
    disputed_at: null,
    paid_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
}

function activeProEntitlement(): ServerEntitlementTruth {
  return {
    profileId: "profile-barber",
    accountRole: "barber_user",
    tier: "pro",
    billingInterval: "monthly",
    status: "active",
    source: "stripe_webhook",
    stripeCustomerId: "cus_123",
    stripeSubscriptionId: "sub_123",
    stripePriceId: "price_barber_pro",
    currentPeriodStart: "2026-08-01T00:00:00.000Z",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
    cancelAt: null,
    trialEnd: null,
    updatedAt: "2026-08-03T00:00:00.000Z",
    verification: {
      persistenceConnected: true,
      stripePriceMapped: true,
      webhookVerified: true,
      reasons: []
    }
  };
}

describe("Product PR34 billing and balance doctrine", () => {
  it("keeps Standard exactly $0 and never presents a legacy Free tier", () => {
    const balance = buildBillingBalanceSnapshot([]);
    const plan = buildBillingPlanView({
      entitlement: buildStandardEntitlementTruth({ profileId: "profile-client", accountRole: "client_user" }),
      balance,
      configuredPriceKeys: new Set(["client_user:pro:monthly", "client_user:elite:monthly"])
    });

    expect(plan.cards.map((card) => card.label)).toEqual(["Standard", "Pro", "Elite"]);
    expect(plan.cards[0]).toMatchObject({ monthlyCents: 0, yearlyCents: 0, billable: false });
    expect(JSON.stringify(plan)).not.toMatch(/\bfree\b/i);
  });

  it("locks every risk action when any positive owed balance exists", () => {
    const balance = buildBillingBalanceSnapshot([line({ amount_cents: 1, amount_paid_cents: 0 })]);

    expect(balance).toMatchObject({ state: "locked", locked: true, totalOwedCents: 1 });
    for (const action of ["booking", "kiosk", "upgrade", "downgrade", "cancel"] as const) {
      expect(checkBillingRiskAction(balance, action)).toMatchObject({ allowed: false, action });
    }
  });

  it("pauses collection on a disputed line without erasing its owed amount or lock", () => {
    const balance = buildBillingBalanceSnapshot([
      line({
        status: "disputed",
        collection_paused: true,
        disputed_at: "2026-08-02T00:00:00.000Z"
      })
    ]);

    expect(balance).toMatchObject({
      state: "locked",
      totalOwedCents: 2900,
      collectibleCents: 0,
      disputedCents: 2900
    });
    expect(balance.lines[0]).toMatchObject({ status: "disputed", collectionPaused: true, outstandingCents: 2900 });
  });

  it("unlocks only at a verified zero balance", () => {
    const balance = buildBillingBalanceSnapshot([
      line({ status: "paid", amount_paid_cents: 2900, paid_at: "2026-08-03T00:00:00.000Z" })
    ]);

    expect(balance).toMatchObject({ state: "clear", locked: false, blocksRiskActions: false, totalOwedCents: 0 });
    expect(checkBillingRiskAction(balance, "booking")).toEqual({ allowed: true, action: "booking", reason: null });
  });

  it("fails closed when balance persistence cannot prove $0.00", () => {
    const balance = buildBillingBalanceSnapshot(null);
    expect(balance).toMatchObject({ state: "needs_review", locked: false, blocksRiskActions: true, totalOwedCents: null });
    expect(checkBillingRiskAction(balance, "cancel")).toMatchObject({ allowed: false });
  });

  it("makes upgrades immediate, downgrades period-end, and blocks both behind balance truth", () => {
    const clear = buildBillingBalanceSnapshot([]);
    const connected = new Set(["barber_user:pro:monthly", "barber_user:elite:monthly"]);
    const plan = buildBillingPlanView({ entitlement: activeProEntitlement(), balance: clear, configuredPriceKeys: connected });

    expect(plan.cards.find((card) => card.tier === "elite")?.action).toMatchObject({ kind: "upgrade", timing: "now", enabled: true });
    expect(plan.cards.find((card) => card.tier === "standard")?.action).toMatchObject({ kind: "downgrade", timing: "period_end", enabled: true });

    const locked = buildBillingPlanView({
      entitlement: activeProEntitlement(),
      balance: buildBillingBalanceSnapshot([line()]),
      configuredPriceKeys: connected
    });
    expect(locked.cards.filter((card) => !card.current).every((card) => !card.action.enabled)).toBe(true);
  });

  it("uses role-true hold copy without deleting client, barber, or shop state", () => {
    expect(roleTrueBalanceHoldCopy("client_user")).toMatch(/appointments.*history stay safe/i);
    expect(roleTrueBalanceHoldCopy("barber_user")).toMatch(/booked clients.*stay/i);
    expect(roleTrueBalanceHoldCopy("shop_owner_user")).toMatch(/floor keeps running/i);
  });
});
