export type SubscriptionSubjectType = "barber" | "shop" | "client";
export type SubscriptionProvider = "manual" | "stripe_billing";
export type SubscriptionPlanInterval = "weekly" | "monthly" | "annual" | "custom";
export type SubscriptionStatus = "draft" | "trialing" | "active" | "past_due" | "paused" | "cancelled";
export type SubscriptionBillingState = "not_started" | "pending" | "current" | "past_due" | "cancelled";
export type SubscriptionEntitlementStatus = "locked" | "limited" | "enabled";

export interface SubscriptionSummaryView {
  id: string;
  subjectType: SubscriptionSubjectType;
  subjectId: string;
  displayName: string;
  provider: SubscriptionProvider;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  providerPriceId?: string;
  planCode: string;
  planName: string;
  planInterval: SubscriptionPlanInterval;
  unitAmount: number;
  currency: string;
  subscriptionStatus: SubscriptionStatus;
  billingState: SubscriptionBillingState;
  entitlementStatus: SubscriptionEntitlementStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialEndsAt?: string;
  cancelAt?: string;
  lastInvoicedAt?: string;
  lastPaidAt?: string;
  updatedAt: string;
}

export interface ClientMembershipValueView {
  subscriptionId?: string;
  provider?: SubscriptionProvider;
  providerCustomerId?: string;
  planCode?: string;
  sourceLabel: string;
  planName: string;
  subscriptionStatus: SubscriptionStatus;
  billingState: SubscriptionBillingState;
  entitlementStatus: SubscriptionEntitlementStatus;
  valueHeadline: string;
  valueMessage: string;
  savingsMessage: string;
  renewalMessage?: string;
  perkLabels: string[];
  estimatedSavingsAmount?: number;
  pricingPerkLabel?: string;
  canSubscribe?: boolean;
  canCancel?: boolean;
}

export interface ClientMembershipPlanView {
  planCode: string;
  planName: string;
  planInterval: SubscriptionPlanInterval;
  unitAmount: number;
  currency: string;
  summary: string;
  perkLabels: string[];
  highlighted?: boolean;
}

export interface MembershipPricingAdjustmentView {
  planCode: string;
  label: string;
  discountAmount: number;
}

export interface ClientMembershipExecutionView {
  subscription: SubscriptionSummaryView | null;
  value: ClientMembershipValueView | null;
  membershipStatus?: "none" | SubscriptionStatus;
  tier?: string;
  active?: boolean;
  points?: number;
  plans: ClientMembershipPlanView[];
  activePlan: ClientMembershipPlanView | null;
  pricingAdjustment: MembershipPricingAdjustmentView | null;
  canSubscribe: boolean;
  canCancel: boolean;
}

export interface PromotionPerformanceView {
  promotionId: string;
  promotionName: string;
  promotionCode?: string;
  shopId: string;
  shopLabel: string;
  redemptions: number;
  discountImpact: number;
  attributedRevenue: number;
  netRevenueAfterDiscount: number;
  averageDiscount: number;
  availabilityState: "active" | "scheduled" | "expired" | "inactive";
}

export interface MonetizationBarberContributionView {
  barberId: string;
  barberName: string;
  completedServices: number;
  grossRevenue: number;
  repeatClientRevenue: number;
  platformFeeGenerated: number;
}

export interface OwnerMonetizationSummary {
  revenue: {
    grossRevenue: number;
    platformFeeRevenue: number;
    processorFeeVisibility: number;
    subscriptionRevenue: number;
    repeatClientRevenue: number;
    retainedRevenueShare: number;
    revenueAtRisk: number;
  };
  subscriptions: {
    totalTracked: number;
    active: number;
    billingAttention: number;
    entitlementReady: number;
    subscriptionRevenue: number;
    rows: SubscriptionSummaryView[];
  };
  promotions: {
    totalRedemptions: number;
    totalDiscountImpact: number;
    attributedRevenue: number;
    topOffers: PromotionPerformanceView[];
  };
  growth: {
    referralConversions: number;
    referralConversionRevenue: number;
    loyaltyParticipants: number;
    loyaltyRedemptions: number;
    loyaltyRevenue: number;
    rebookingInfluencedRevenue: number;
  };
  barberContribution: MonetizationBarberContributionView[];
}

export interface BarberRevenueTrendPoint {
  label: string;
  grossRevenue: number;
  tipRevenue: number;
  completedServices: number;
}

export interface BarberRevenueTopClientView {
  clientId: string;
  clientName: string;
  completedServices: number;
  revenue: number;
  lastVisitAt?: string;
}

export interface BarberServiceMixView {
  serviceName: string;
  appointments: number;
  revenue: number;
}

export interface BarberRevenueIntelligenceView {
  weekRevenue: number;
  weekTips: number;
  weekCompletedServices: number;
  weekAverageTicket: number;
  weekRebookedClients: number;
  previousWeekRevenue: number;
  bestDayLabel: string | null;
  bestDayRevenue: number;
  monthRevenue: number;
  repeatClientRevenue: number;
  repeatClientShare: number;
  outstandingBalance: number;
  averageTip: number;
  trends: BarberRevenueTrendPoint[];
  topClients: BarberRevenueTopClientView[];
  serviceMix: BarberServiceMixView[];
  subscription: SubscriptionSummaryView | null;
}
