import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BalanceLockWorkspace } from "@/components/billing/balance-lock-workspace";
import { BillingWorkspace } from "@/components/billing/billing-workspace";
import {
  buildBillingBalanceSnapshot,
  buildBillingPlanView,
  type BillingBalanceLineRow,
  type BillingWorkspaceSnapshot
} from "@/lib/billing/pr34-domain";
import { buildStandardEntitlementTruth, type ServerEntitlementTruth } from "@/lib/entitlements/domain";

const refreshMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, replace: replaceMock })
}));

function line(overrides: Partial<BillingBalanceLineRow> = {}): BillingBalanceLineRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    source_type: "refund_correction",
    source_reference: "CHECKOUT-4471",
    description: "Refund correction — checkout #4471",
    provider: "stripe",
    provider_reference: "ch_refund_4471",
    amount_cents: 15000,
    amount_paid_cents: 0,
    currency: "usd",
    status: "open",
    collection_paused: false,
    due_at: "2026-08-02T00:00:00.000Z",
    disputed_at: null,
    paid_at: null,
    created_at: "2026-08-02T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
    ...overrides
  };
}

function entitlement(role: ServerEntitlementTruth["accountRole"] = "barber_user"): ServerEntitlementTruth {
  return {
    profileId: "profile-1",
    accountRole: role,
    tier: "pro",
    billingInterval: "monthly",
    status: "active",
    source: "stripe_webhook",
    stripeCustomerId: "cus_private",
    stripeSubscriptionId: "sub_private",
    stripePriceId: "price_private",
    currentPeriodStart: "2026-08-01T00:00:00.000Z",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
    cancelAt: null,
    trialEnd: null,
    updatedAt: "2026-08-03T00:00:00.000Z",
    verification: { persistenceConnected: true, stripePriceMapped: true, webhookVerified: true, reasons: [] }
  };
}

function snapshot(input: {
  role?: ServerEntitlementTruth["accountRole"];
  rows?: BillingBalanceLineRow[] | null;
  standard?: boolean;
} = {}): BillingWorkspaceSnapshot {
  const currentEntitlement = input.standard
    ? buildStandardEntitlementTruth({ profileId: "profile-1", accountRole: input.role ?? "client_user" })
    : entitlement(input.role);
  const balance = buildBillingBalanceSnapshot(input.rows ?? []);
  const plan = buildBillingPlanView({
    entitlement: currentEntitlement,
    balance,
    configuredPriceKeys: new Set([
      `${currentEntitlement.accountRole}:pro:monthly`,
      `${currentEntitlement.accountRole}:elite:monthly`
    ])
  });
  return {
    available: balance.state !== "needs_review",
    unavailableReason: null,
    plan,
    balance,
    invoices: [{
      id: "in_123",
      stripeReference: "in_123",
      number: "BVR-2026-008",
      status: "paid",
      amountDueCents: 2900,
      amountPaidCents: 2900,
      currency: "usd",
      createdAt: "2026-08-01T00:00:00.000Z",
      dueAt: null,
      paidAt: "2026-08-01T00:00:00.000Z",
      hostedInvoiceUrl: "https://invoice.stripe.test/in_123",
      invoicePdfUrl: "https://invoice.stripe.test/in_123.pdf",
      lines: [{ id: "il_123", description: "Barber Pro — August", amountCents: 2900, currency: "usd", quantity: 1, priceReference: "price_123" }]
    }],
    history: [{ id: "event-1", eventType: "upgrade_submitted", label: "Pro upgrade submitted to Stripe", lineId: null, stripeReference: "sub_123", createdAt: "2026-08-01T00:00:00.000Z" }],
    providerState: currentEntitlement.tier === "standard" ? "not_required" : "connected",
    providerReason: currentEntitlement.tier === "standard" ? "Standard is exactly $0 and does not create a Stripe subscription." : null,
    manageCardEnabled: currentEntitlement.tier !== "standard",
    cancelEnabled: currentEntitlement.tier !== "standard" && !balance.blocksRiskActions,
    cancelReason: currentEntitlement.tier === "standard"
      ? "Standard has no paid subscription to cancel."
      : balance.blocksRiskActions
        ? balance.reason
        : null,
    supportHref: "mailto:support@bvrb3r.app",
    giftedCuts: { state: "v3_honest_gate", label: "Gifted Cuts · V3", reason: "Future V3 door." }
  };
}

describe("Product PR34 billing UI", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    replaceMock.mockReset();
  });

  it("renders Standard as exactly $0, Stripe invoices with line detail, and an honest Gifted Cuts gate", () => {
    render(<BillingWorkspace initial={snapshot({ standard: true })} />);

    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("Exactly $0 · never billed by Stripe")).toBeInTheDocument();
    expect(screen.queryByText(/^Free$/)).not.toBeInTheDocument();
    expect(screen.getByText("BVR-2026-008")).toBeInTheDocument();
    fireEvent.click(screen.getByText("BVR-2026-008"));
    expect(screen.getByText("Barber Pro — August")).toBeInTheDocument();
    expect(screen.getByText("V3 only — still being built")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Gifted Cuts · V3: V3 only/i }));
    expect(screen.getByText(/No gift pool, Stripe charge, redemption, or barber payout exists/i)).toBeInTheDocument();
  });

  it("blocks every non-current plan action and cancel when an owed balance exists", () => {
    render(<BillingWorkspace initial={snapshot({ rows: [line()] })} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Balance due — $150.00");
    expect(screen.getByRole("link", { name: "Pay in full" })).toHaveAttribute("href", "/locked");
    expect(screen.getAllByRole("button", { name: "Pay balance to change plans" })).toHaveLength(2);
    screen.getAllByRole("button", { name: "Pay balance to change plans" }).forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByRole("button", { name: /owed balance locks booking/i })).toBeDisabled();
  });

  it("shows a balance-check cancel confirmation with loss and kept-forever truth", () => {
    render(<BillingWorkspace initial={snapshot()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Balance check passed · $0.00");
    expect(screen.getByRole("dialog")).toHaveTextContent("Paid plan features pause");
    expect(screen.getByRole("dialog")).toHaveTextContent("Account and billing history");
  });
});

describe("Product PR34 balance lock UI", () => {
  it("shows itemized barber hold truth and pauses collection on disputed lines without a fake pay button", () => {
    const disputed = line({ status: "disputed", collection_paused: true, disputed_at: "2026-08-03T00:00:00.000Z" });
    render(<BalanceLockWorkspace initial={snapshot({ rows: [disputed] })} />);

    expect(screen.getByText(/Your booked clients and history stay exactly where they are/i)).toBeInTheDocument();
    expect(screen.getByText("Refund correction — checkout #4471")).toBeInTheDocument();
    expect(screen.getByText(/Collection is paused on \$150.00/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay \$150.00/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open support/i })).toHaveAttribute("href", "mailto:support@bvrb3r.app");
  });

  it("renders the zero-balance celebration only from a clear server snapshot", () => {
    render(<BalanceLockWorkspace initial={snapshot({ rows: [] })} />);

    expect(screen.getByText("Balance $0.00 · all clear")).toBeInTheDocument();
    expect(screen.getByText(/You’re square/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Into the app" })).toHaveAttribute("href", "/dashboard/barber");
  });
});
