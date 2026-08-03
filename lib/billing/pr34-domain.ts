import {
  rankEntitlementTier,
  type EntitlementAccountRole,
  type EntitlementBillingInterval,
  type EntitlementStatus,
  type EntitlementTier,
  type ServerEntitlementTruth
} from "@/lib/entitlements/domain";
import {
  CANONICAL_PLAN_TIERS,
  getCanonicalPlanPrice,
  PLAN_ROLE_LABELS
} from "@/lib/entitlements/plans";

export const BILLING_BALANCE_SOURCE_TYPES = [
  "subscription",
  "refund_correction",
  "dispute_reversal",
  "no_show_fee"
] as const;
export type BillingBalanceSourceType = (typeof BILLING_BALANCE_SOURCE_TYPES)[number];

export const BILLING_BALANCE_LINE_STATUSES = ["open", "disputed", "paid", "waived", "void"] as const;
export type BillingBalanceLineStatus = (typeof BILLING_BALANCE_LINE_STATUSES)[number];

export type BillingBalanceLineRow = {
  id: string;
  source_type: string;
  source_reference: string;
  description: string;
  provider: string;
  provider_reference: string | null;
  amount_cents: number;
  amount_paid_cents: number;
  currency: string;
  status: string;
  collection_paused: boolean;
  due_at: string | null;
  disputed_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingBalanceLineView = {
  id: string;
  sourceType: BillingBalanceSourceType;
  sourceLabel: string;
  reference: string;
  description: string;
  stripeReference: string | null;
  amountCents: number;
  amountPaidCents: number;
  outstandingCents: number;
  currency: "usd";
  status: BillingBalanceLineStatus;
  collectionPaused: boolean;
  dueAt: string | null;
  disputedAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type BillingBalanceSnapshot = {
  state: "clear" | "locked" | "needs_review";
  locked: boolean;
  blocksRiskActions: boolean;
  totalOwedCents: number | null;
  collectibleCents: number | null;
  disputedCents: number | null;
  currency: "usd";
  lines: BillingBalanceLineView[];
  reason: string;
};

export type BillingPlanCard = {
  tier: EntitlementTier;
  label: "Standard" | "Pro" | "Elite";
  monthlyCents: number;
  yearlyCents: number;
  billable: boolean;
  current: boolean;
  pitch: string;
  features: string[];
  action: {
    kind: "current" | "upgrade" | "downgrade" | "restore" | "unavailable";
    label: string;
    enabled: boolean;
    timing: "none" | "now" | "period_end";
    reason: string | null;
  };
};

export type BillingPlanView = {
  accountRole: EntitlementAccountRole;
  roleLabel: "Client" | "Barber" | "Shop Owner";
  tier: EntitlementTier;
  tierLabel: "Standard" | "Pro" | "Elite";
  status: EntitlementStatus;
  statusLabel: "Active" | "Past due" | "Canceled" | "Needs review";
  billingInterval: EntitlementBillingInterval;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  stripeCustomerConnected: boolean;
  stripeSubscriptionConnected: boolean;
  cards: BillingPlanCard[];
};

export type BillingInvoiceLineView = {
  id: string;
  description: string;
  amountCents: number;
  currency: string;
  quantity: number | null;
  priceReference: string | null;
};

export type BillingInvoiceView = {
  id: string;
  stripeReference: string;
  number: string | null;
  status: string;
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  createdAt: string;
  dueAt: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  lines: BillingInvoiceLineView[];
};

export type BillingHistoryEventView = {
  id: string;
  eventType: string;
  label: string;
  lineId: string | null;
  stripeReference: string | null;
  createdAt: string;
};

export type BillingWorkspaceSnapshot = {
  available: boolean;
  unavailableReason: string | null;
  plan: BillingPlanView;
  balance: BillingBalanceSnapshot;
  invoices: BillingInvoiceView[];
  history: BillingHistoryEventView[];
  providerState: "connected" | "not_required" | "needs_review";
  providerReason: string | null;
  manageCardEnabled: boolean;
  cancelEnabled: boolean;
  cancelReason: string | null;
  supportHref: "mailto:support@bvrb3r.app";
  giftedCuts: {
    state: "v3_honest_gate";
    label: "Gifted Cuts · V3";
    reason: string;
  };
};

export type BillingRiskAction = "booking" | "kiosk" | "upgrade" | "downgrade" | "cancel";

const SOURCE_LABELS: Record<BillingBalanceSourceType, string> = {
  subscription: "Subscription",
  refund_correction: "Refund correction",
  dispute_reversal: "Dispute reversal",
  no_show_fee: "No-show fee"
};

const PLAN_COPY: Record<EntitlementAccountRole, Record<EntitlementTier, { pitch: string; features: string[] }>> = {
  client_user: {
    standard: {
      pitch: "Your barber, your time, one clean booking path.",
      features: ["Book, pay, and rebook", "Queue status and notifications", "Reviews and favorites", "Account and payment basics"]
    },
    pro: {
      pitch: "More control for regulars without touching service payments.",
      features: ["Everything in Standard", "Verified Pro client tools", "Priority client experiences as released", "Server-owned entitlement proof"]
    },
    elite: {
      pitch: "The complete client tier as each verified door opens.",
      features: ["Everything in Pro", "Verified Elite client tools", "Concierge experiences as released", "Gifted Cuts remains V3-gated"]
    }
  },
  barber_user: {
    standard: {
      pitch: "Run the chair with tips, earnings, and rent kept separate.",
      features: ["Profile and booking setup", "Schedule and queue visibility", "Checkout and account basics", "Full Booth Rent and AutoBooth records"]
    },
    pro: {
      pitch: "Business tools that can earn back the subscription.",
      features: ["Everything in Standard", "Verified Pro barber tools", "Growth and analytics as released", "Stripe Billing stays separate from earnings"]
    },
    elite: {
      pitch: "The full chair operating tier as verified tools ship.",
      features: ["Everything in Pro", "Verified Elite barber tools", "Advanced insights as released", "Gifted Cuts pool remains V3-gated"]
    }
  },
  shop_owner_user: {
    standard: {
      pitch: "Keep the shop essentials open at exactly zero dollars.",
      features: ["Shop profile and team basics", "Floor and schedule visibility", "Kiosk and TV essentials", "Rent statements and core reports"]
    },
    pro: {
      pitch: "See the floor in numbers with verified owner controls.",
      features: ["Everything in Standard", "Verified Pro owner tools", "Reports and analytics as released", "Stripe Billing stays separate from shop money"]
    },
    elite: {
      pitch: "Scale the shop as each production-proven door opens.",
      features: ["Everything in Pro", "Verified Elite owner tools", "Multi-location tools as released", "Gifted Cuts remains V3-gated"]
    }
  }
};

function asBalanceSourceType(value: string): BillingBalanceSourceType {
  return BILLING_BALANCE_SOURCE_TYPES.includes(value as BillingBalanceSourceType)
    ? value as BillingBalanceSourceType
    : "subscription";
}

function asBalanceStatus(value: string): BillingBalanceLineStatus {
  return BILLING_BALANCE_LINE_STATUSES.includes(value as BillingBalanceLineStatus)
    ? value as BillingBalanceLineStatus
    : "open";
}

function tierLabel(tier: EntitlementTier): BillingPlanView["tierLabel"] {
  if (tier === "elite") return "Elite";
  if (tier === "pro") return "Pro";
  return "Standard";
}

function statusLabel(status: EntitlementStatus): BillingPlanView["statusLabel"] {
  if (status === "past_due" || status === "unpaid" || status === "incomplete" || status === "incomplete_expired") {
    return "Past due";
  }
  if (status === "canceled" || status === "paused") return "Canceled";
  if (status === "needs_review") return "Needs review";
  return "Active";
}

function planAction(input: {
  currentTier: EntitlementTier;
  targetTier: EntitlementTier;
  status: EntitlementStatus;
  balance: BillingBalanceSnapshot;
  priceConfigured: boolean;
}): BillingPlanCard["action"] {
  if (input.targetTier === input.currentTier) {
    if ((input.status === "canceled" || input.status === "paused") && input.targetTier !== "standard") {
      return input.balance.blocksRiskActions
        ? { kind: "unavailable", label: "Pay balance to restore", enabled: false, timing: "none", reason: input.balance.reason }
        : { kind: "restore", label: `Restore ${tierLabel(input.targetTier)}`, enabled: true, timing: "now", reason: null };
    }
    return { kind: "current", label: "Current plan", enabled: false, timing: "none", reason: null };
  }

  if (input.balance.blocksRiskActions) {
    return {
      kind: "unavailable",
      label: input.balance.state === "locked" ? "Pay balance to change plans" : "Balance check required",
      enabled: false,
      timing: "none",
      reason: input.balance.reason
    };
  }

  if (input.targetTier !== "standard" && !input.priceConfigured) {
    return {
      kind: "unavailable",
      label: "Plan checkout unavailable",
      enabled: false,
      timing: "none",
      reason: "The Stripe price for this plan is not configured."
    };
  }

  if (rankEntitlementTier(input.targetTier) > rankEntitlementTier(input.currentTier)) {
    return { kind: "upgrade", label: `Upgrade to ${tierLabel(input.targetTier)}`, enabled: true, timing: "now", reason: null };
  }

  return {
    kind: "downgrade",
    label: input.targetTier === "standard" ? "Move to Standard at period end" : `Downgrade to ${tierLabel(input.targetTier)}`,
    enabled: true,
    timing: "period_end",
    reason: null
  };
}

export function buildBillingBalanceSnapshot(rows: BillingBalanceLineRow[] | null): BillingBalanceSnapshot {
  if (!rows) {
    return {
      state: "needs_review",
      locked: false,
      blocksRiskActions: true,
      totalOwedCents: null,
      collectibleCents: null,
      disputedCents: null,
      currency: "usd",
      lines: [],
      reason: "The server could not verify that the account balance is clear."
    };
  }

  const lines = rows.map((row): BillingBalanceLineView => {
    const amountCents = Math.max(0, Math.trunc(row.amount_cents));
    const amountPaidCents = Math.min(amountCents, Math.max(0, Math.trunc(row.amount_paid_cents)));
    const status = asBalanceStatus(row.status);
    const sourceType = asBalanceSourceType(row.source_type);
    return {
      id: row.id,
      sourceType,
      sourceLabel: SOURCE_LABELS[sourceType],
      reference: row.source_reference,
      description: row.description,
      stripeReference: row.provider === "stripe" ? row.provider_reference : null,
      amountCents,
      amountPaidCents,
      outstandingCents: status === "paid" || status === "waived" || status === "void" ? 0 : amountCents - amountPaidCents,
      currency: "usd",
      status,
      collectionPaused: status === "disputed" || row.collection_paused,
      dueAt: row.due_at,
      disputedAt: row.disputed_at,
      paidAt: row.paid_at,
      createdAt: row.created_at
    };
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const totalOwedCents = lines.reduce((total, line) => total + line.outstandingCents, 0);
  const disputedCents = lines
    .filter((line) => line.status === "disputed")
    .reduce((total, line) => total + line.outstandingCents, 0);
  const collectibleCents = lines
    .filter((line) => line.status === "open" && !line.collectionPaused)
    .reduce((total, line) => total + line.outstandingCents, 0);

  if (totalOwedCents === 0) {
    return {
      state: "clear",
      locked: false,
      blocksRiskActions: false,
      totalOwedCents: 0,
      collectibleCents: 0,
      disputedCents: 0,
      currency: "usd",
      lines,
      reason: "Balance is $0.00."
    };
  }

  return {
    state: "locked",
    locked: true,
    blocksRiskActions: true,
    totalOwedCents,
    collectibleCents,
    disputedCents,
    currency: "usd",
    lines,
    reason: disputedCents > 0
      ? "An owed balance remains. Disputed lines are paused from collection while support reviews them."
      : "An owed balance locks booking, kiosk, upgrades, downgrades, and cancel until it is paid in full."
  };
}

export function buildBillingPlanView(input: {
  entitlement: ServerEntitlementTruth;
  balance: BillingBalanceSnapshot;
  configuredPriceKeys: Set<string>;
}): BillingPlanView {
  const cards = CANONICAL_PLAN_TIERS.map((tier): BillingPlanCard => {
    const price = getCanonicalPlanPrice(input.entitlement.accountRole, tier);
    const monthlyPriceKey = `${input.entitlement.accountRole}:${tier}:monthly`;
    const yearlyPriceKey = `${input.entitlement.accountRole}:${tier}:yearly`;
    return {
      tier,
      label: price.label,
      monthlyCents: price.monthlyCents,
      yearlyCents: price.yearlyCents,
      billable: price.billable,
      current: tier === input.entitlement.tier,
      ...PLAN_COPY[input.entitlement.accountRole][tier],
      action: planAction({
        currentTier: input.entitlement.tier,
        targetTier: tier,
        status: input.entitlement.status,
        balance: input.balance,
        priceConfigured: tier === "standard"
          || input.configuredPriceKeys.has(monthlyPriceKey)
          || input.configuredPriceKeys.has(yearlyPriceKey)
      })
    };
  });

  return {
    accountRole: input.entitlement.accountRole,
    roleLabel: PLAN_ROLE_LABELS[input.entitlement.accountRole],
    tier: input.entitlement.tier,
    tierLabel: tierLabel(input.entitlement.tier),
    status: input.entitlement.status,
    statusLabel: statusLabel(input.entitlement.status),
    billingInterval: input.entitlement.billingInterval,
    currentPeriodEnd: input.entitlement.currentPeriodEnd,
    cancelAt: input.entitlement.cancelAt,
    stripeCustomerConnected: Boolean(input.entitlement.stripeCustomerId),
    stripeSubscriptionConnected: Boolean(input.entitlement.stripeSubscriptionId),
    cards
  };
}

export function checkBillingRiskAction(balance: BillingBalanceSnapshot, action: BillingRiskAction) {
  if (!balance.blocksRiskActions) {
    return { allowed: true as const, action, reason: null };
  }

  return {
    allowed: false as const,
    action,
    reason: balance.state === "locked"
      ? `The account has an owed balance. ${action} remains paused until the balance is $0.00.`
      : `The server could not verify a $0.00 balance. ${action} remains paused.`
  };
}

export function roleTrueBalanceHoldCopy(role: EntitlementAccountRole) {
  if (role === "barber_user") {
    return "Your booked clients and history stay exactly where they are. New booking, kiosk, and plan changes reopen when the balance reaches $0.00.";
  }
  if (role === "shop_owner_user") {
    return "The floor keeps running for your barbers. Only owner-controlled locked actions pause, and they reopen when the balance reaches $0.00.";
  }
  return "Your appointments, favorites, messages, and history stay safe. Booking and plan changes reopen when the balance reaches $0.00.";
}
