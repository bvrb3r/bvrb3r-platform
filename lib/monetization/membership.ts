import type {
  AppointmentFinancialQuote
} from "@/lib/appointments/domain";
import type {
  ClientMembershipPlanView,
  MembershipPricingAdjustmentView,
  SubscriptionSummaryView
} from "@/types/monetization";

type ClientMembershipPlanConfig = {
  planCode: string;
  planName: string;
  planInterval: "monthly" | "annual";
  unitAmount: number;
  currency: string;
  summary: string;
  perkLabels: string[];
  discountPercent: number;
  maxDiscountAmount: number;
};

const CLIENT_MEMBERSHIP_PLAN_CONFIGS: ClientMembershipPlanConfig[] = [
  {
    planCode: "client_core_monthly",
    planName: "Client Core",
    planInterval: "monthly",
    unitAmount: 19,
    currency: "usd",
    summary: "Unlock member pricing, loyalty acceleration, and faster repeat-booking value.",
    perkLabels: ["10% booking savings", "Loyalty bonus triggers", "Member value visibility"],
    discountPercent: 10,
    maxDiscountAmount: 10
  },
  {
    planCode: "client_core_annual",
    planName: "Client Core Annual",
    planInterval: "annual",
    unitAmount: 190,
    currency: "usd",
    summary: "Twelve months of member pricing and loyalty acceleration at a lower effective rate.",
    perkLabels: ["10% booking savings", "Annual member rate", "Priority growth perks"],
    discountPercent: 10,
    maxDiscountAmount: 120
  }
];

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function listClientMembershipPlans(): ClientMembershipPlanView[] {
  return CLIENT_MEMBERSHIP_PLAN_CONFIGS.map((plan, index) => ({
    planCode: plan.planCode,
    planName: plan.planName,
    planInterval: plan.planInterval,
    unitAmount: plan.unitAmount,
    currency: plan.currency,
    summary: plan.summary,
    perkLabels: plan.perkLabels,
    highlighted: index === 0
  }));
}

export function getClientMembershipPlan(planCode?: string | null) {
  return CLIENT_MEMBERSHIP_PLAN_CONFIGS.find((plan) => plan.planCode === planCode) ?? null;
}

export function buildMembershipPricingAdjustment(
  subscription: Pick<SubscriptionSummaryView, "planCode" | "subscriptionStatus" | "billingState" | "entitlementStatus"> | null | undefined,
  subtotal: number
): MembershipPricingAdjustmentView | null {
  if (!subscription) {
    return null;
  }

  const plan = getClientMembershipPlan(subscription.planCode);
  if (!plan) {
    return null;
  }

  const isEligible =
    (subscription.subscriptionStatus === "active" || subscription.subscriptionStatus === "trialing")
    && subscription.billingState !== "past_due"
    && subscription.billingState !== "cancelled"
    && subscription.entitlementStatus === "enabled";

  if (!isEligible) {
    return null;
  }

  const discountAmount = roundCurrency(Math.min(subtotal * (plan.discountPercent / 100), plan.maxDiscountAmount));
  if (discountAmount <= 0) {
    return null;
  }

  return {
    planCode: plan.planCode,
    label: `${plan.planName} member savings`,
    discountAmount
  };
}

export function applyMembershipPricingAdjustmentToQuote(
  quote: AppointmentFinancialQuote,
  adjustment: MembershipPricingAdjustmentView | null
): AppointmentFinancialQuote {
  if (!adjustment) {
    return quote;
  }

  const discountTotal = roundCurrency(Math.min(quote.subtotal, quote.discountTotal + adjustment.discountAmount));
  const taxableBase = Math.max(quote.subtotal - discountTotal, 0);
  const taxRate = quote.subtotal - quote.discountTotal > 0
    ? quote.taxTotal / Math.max(quote.subtotal - quote.discountTotal, 0.0001)
    : 0;
  const taxTotal = roundCurrency(taxableBase * Math.max(taxRate, 0));
  const grandTotal = roundCurrency(taxableBase + taxTotal + quote.tipTotal);
  const preTipCharge = roundCurrency(Math.max(grandTotal - quote.tipTotal, 0));
  const requestedDeposit = roundCurrency(
    quote.tipTotal > 0 && quote.grandTotal > 0
      ? Math.min(quote.depositDue, preTipCharge)
      : Math.min(quote.depositDue, preTipCharge)
  );

  return {
    ...quote,
    discountTotal,
    taxTotal,
    grandTotal,
    depositDue: requestedDeposit,
    balanceDue: roundCurrency(Math.max(grandTotal - requestedDeposit, 0))
  };
}
