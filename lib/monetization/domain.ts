import type {
  BarberRevenueIntelligenceView,
  BarberRevenueTopClientView,
  BarberServiceMixView,
  MonetizationBarberContributionView,
  OwnerMonetizationSummary,
  PromotionPerformanceView,
  SubscriptionSummaryView
} from "@/types/monetization";

type PromotionPerformanceInput = {
  promotionId: string;
  promotionName: string;
  promotionCode?: string;
  shopId: string;
  shopLabel: string;
  availabilityState: PromotionPerformanceView["availabilityState"];
  redemptions: Array<{
    appointmentId?: string;
    discountAmount: number;
  }>;
};

type RevenueAppointment = {
  id: string;
  clientId: string;
  clientName: string;
  barberId: string;
  barberName: string;
  serviceName: string;
  start: string;
  totalAmount: number;
  balanceDue: number;
  tipAmount: number;
  status: string;
};

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildEmptyOwnerMonetizationSummary(): OwnerMonetizationSummary {
  return {
    revenue: {
      grossRevenue: 0,
      platformFeeRevenue: 0,
      processorFeeVisibility: 0,
      subscriptionRevenue: 0,
      repeatClientRevenue: 0,
      retainedRevenueShare: 0,
      revenueAtRisk: 0
    },
    subscriptions: {
      totalTracked: 0,
      active: 0,
      billingAttention: 0,
      entitlementReady: 0,
      subscriptionRevenue: 0,
      rows: []
    },
    promotions: {
      totalRedemptions: 0,
      totalDiscountImpact: 0,
      attributedRevenue: 0,
      topOffers: []
    },
    growth: {
      referralConversions: 0,
      referralConversionRevenue: 0,
      loyaltyParticipants: 0,
      loyaltyRedemptions: 0,
      loyaltyRevenue: 0,
      rebookingInfluencedRevenue: 0
    },
    barberContribution: []
  };
}

function toDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(reference: Date, targetIso: string) {
  const target = toDate(targetIso);
  if (!target) {
    return Number.MAX_SAFE_INTEGER;
  }

  const diff = startOfDay(reference).getTime() - startOfDay(target).getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return roundCurrency((numerator / denominator) * 100);
}

export function buildSubscriptionPortfolioSummary(rows: SubscriptionSummaryView[]) {
  const active = rows.filter((row) => row.subscriptionStatus === "active" || row.subscriptionStatus === "trialing").length;
  const billingAttention = rows.filter((row) => row.billingState === "past_due" || row.subscriptionStatus === "past_due").length;
  const entitlementReady = rows.filter((row) => row.entitlementStatus === "enabled").length;
  const subscriptionRevenue = roundCurrency(
    rows
      .filter((row) => row.subscriptionStatus === "active" || row.subscriptionStatus === "trialing")
      .reduce((sum, row) => sum + row.unitAmount, 0)
  );

  return {
    totalTracked: rows.length,
    active,
    billingAttention,
    entitlementReady,
    subscriptionRevenue
  };
}

export function buildPromotionPerformanceViews(
  inputs: PromotionPerformanceInput[],
  appointmentRevenueById: Map<string, number>
) {
  const rows = inputs.map((promotion) => {
    const redemptions = promotion.redemptions.length;
    const discountImpact = roundCurrency(promotion.redemptions.reduce((sum, redemption) => sum + redemption.discountAmount, 0));
    const attributedRevenue = roundCurrency(
      promotion.redemptions.reduce((sum, redemption) => sum + (redemption.appointmentId ? appointmentRevenueById.get(redemption.appointmentId) ?? 0 : 0), 0)
    );
    const netRevenueAfterDiscount = roundCurrency(Math.max(attributedRevenue - discountImpact, 0));

    return {
      promotionId: promotion.promotionId,
      promotionName: promotion.promotionName,
      promotionCode: promotion.promotionCode,
      shopId: promotion.shopId,
      shopLabel: promotion.shopLabel,
      redemptions,
      discountImpact,
      attributedRevenue,
      netRevenueAfterDiscount,
      averageDiscount: redemptions ? roundCurrency(discountImpact / redemptions) : 0,
      availabilityState: promotion.availabilityState
    } satisfies PromotionPerformanceView;
  });

  return rows.sort(
    (left, right) =>
      right.netRevenueAfterDiscount - left.netRevenueAfterDiscount
      || right.redemptions - left.redemptions
      || left.promotionName.localeCompare(right.promotionName)
  );
}

export function buildBarberRevenueIntelligence(
  appointments: RevenueAppointment[],
  referenceDateIso: string,
  subscription: SubscriptionSummaryView | null
): BarberRevenueIntelligenceView {
  const referenceDate = toDate(referenceDateIso) ?? new Date();
  const completed = appointments
    .filter((appointment) => appointment.status === "completed")
    .sort((left, right) => right.start.localeCompare(left.start));
  const completedThisWeek = completed.filter((appointment) => daysBetween(referenceDate, appointment.start) <= 7);
  const completedLastWeek = completed.filter((appointment) => {
    const age = daysBetween(referenceDate, appointment.start);
    return age > 7 && age <= 14;
  });
  const completedByClient = new Map<string, RevenueAppointment[]>();
  const serviceMixMap = new Map<string, BarberServiceMixView>();
  const topClientsMap = new Map<string, BarberRevenueTopClientView>();
  const dailyRevenueMap = new Map<string, { label: string; revenue: number }>();

  for (const appointment of completed) {
    const clientRows = completedByClient.get(appointment.clientId) ?? [];
    clientRows.push(appointment);
    completedByClient.set(appointment.clientId, clientRows);

    const serviceMix = serviceMixMap.get(appointment.serviceName) ?? {
      serviceName: appointment.serviceName,
      appointments: 0,
      revenue: 0
    };
    serviceMix.appointments += 1;
    serviceMix.revenue = roundCurrency(serviceMix.revenue + appointment.totalAmount);
    serviceMixMap.set(appointment.serviceName, serviceMix);

    const topClient = topClientsMap.get(appointment.clientId) ?? {
      clientId: appointment.clientId,
      clientName: appointment.clientName,
      completedServices: 0,
      revenue: 0,
      lastVisitAt: appointment.start
    };
    topClient.completedServices += 1;
    topClient.revenue = roundCurrency(topClient.revenue + appointment.totalAmount);
    if (!topClient.lastVisitAt || appointment.start > topClient.lastVisitAt) {
      topClient.lastVisitAt = appointment.start;
    }
    topClientsMap.set(appointment.clientId, topClient);

    const dayKey = appointment.start.slice(0, 10);
    const currentDay = dailyRevenueMap.get(dayKey) ?? {
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(appointment.start)),
      revenue: 0
    };
    currentDay.revenue = roundCurrency(currentDay.revenue + appointment.totalAmount);
    dailyRevenueMap.set(dayKey, currentDay);
  }

  const weekRevenue = roundCurrency(completedThisWeek.reduce((sum, appointment) => sum + appointment.totalAmount, 0));
  const weekTips = roundCurrency(completedThisWeek.reduce((sum, appointment) => sum + appointment.tipAmount, 0));
  const weekCompletedServices = completedThisWeek.length;
  const weekAverageTicket = weekCompletedServices ? roundCurrency(weekRevenue / weekCompletedServices) : 0;
  const previousWeekRevenue = roundCurrency(completedLastWeek.reduce((sum, appointment) => sum + appointment.totalAmount, 0));
  const monthRevenue = roundCurrency(
    completed.filter((appointment) => daysBetween(referenceDate, appointment.start) <= 30).reduce((sum, appointment) => sum + appointment.totalAmount, 0)
  );
  const grossRevenue = roundCurrency(completed.reduce((sum, appointment) => sum + appointment.totalAmount, 0));
  const repeatClientRevenue = roundCurrency(
    [...completedByClient.values()]
      .filter((rows) => rows.length >= 2)
      .reduce((sum, rows) => sum + rows.reduce((rowSum, row) => rowSum + row.totalAmount, 0), 0)
  );
  const completedTips = roundCurrency(completed.reduce((sum, appointment) => sum + appointment.tipAmount, 0));
  const outstandingBalance = roundCurrency(
    appointments
      .filter((appointment) => ["booked", "checked_in", "in_service", "completed"].includes(appointment.status))
      .reduce((sum, appointment) => sum + Math.max(appointment.balanceDue, 0), 0)
  );
  const weekRebookedClients = new Set(
    completedThisWeek
      .filter((appointment) =>
        appointments.some((candidate) =>
          candidate.clientId === appointment.clientId
          && ["booked", "checked_in", "in_service"].includes(candidate.status)
          && new Date(candidate.start).getTime() > new Date(appointment.start).getTime()
        )
      )
      .map((appointment) => appointment.clientId)
  ).size;
  const sortedTrendRows = completed.slice(0, 4).reverse().map((appointment) => ({
    label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(appointment.start)),
    grossRevenue: roundCurrency(appointment.totalAmount),
    tipRevenue: roundCurrency(appointment.tipAmount),
    completedServices: 1
  }));
  const bestDay = [...dailyRevenueMap.values()]
    .sort((left, right) => right.revenue - left.revenue || left.label.localeCompare(right.label))[0];

  return {
    weekRevenue,
    weekTips,
    weekCompletedServices,
    weekAverageTicket,
    weekRebookedClients,
    previousWeekRevenue,
    bestDayLabel: bestDay?.label ?? null,
    bestDayRevenue: bestDay?.revenue ?? 0,
    monthRevenue,
    repeatClientRevenue,
    repeatClientShare: ratio(repeatClientRevenue, grossRevenue),
    outstandingBalance,
    averageTip: completed.length ? roundCurrency(completedTips / completed.length) : 0,
    trends: sortedTrendRows,
    topClients: [...topClientsMap.values()]
      .sort((left, right) => right.revenue - left.revenue || right.completedServices - left.completedServices)
      .slice(0, 4),
    serviceMix: [...serviceMixMap.values()]
      .sort((left, right) => right.revenue - left.revenue || right.appointments - left.appointments)
      .slice(0, 4),
    subscription
  };
}

export function buildBarberContributionViews(
  appointments: RevenueAppointment[],
  platformFeeByAppointmentId: Map<string, number>
) {
  const grouped = new Map<string, MonetizationBarberContributionView>();
  const completedByClientAndBarber = new Map<string, number>();

  for (const appointment of appointments.filter((entry) => entry.status === "completed")) {
    const clientBarberKey = `${appointment.barberId}:${appointment.clientId}`;
    completedByClientAndBarber.set(clientBarberKey, (completedByClientAndBarber.get(clientBarberKey) ?? 0) + 1);

    const current = grouped.get(appointment.barberId) ?? {
      barberId: appointment.barberId,
      barberName: appointment.barberName,
      completedServices: 0,
      grossRevenue: 0,
      repeatClientRevenue: 0,
      platformFeeGenerated: 0
    };
    current.completedServices += 1;
    current.grossRevenue = roundCurrency(current.grossRevenue + appointment.totalAmount);
    current.platformFeeGenerated = roundCurrency(current.platformFeeGenerated + (platformFeeByAppointmentId.get(appointment.id) ?? 0));
    if ((completedByClientAndBarber.get(clientBarberKey) ?? 0) >= 2) {
      current.repeatClientRevenue = roundCurrency(current.repeatClientRevenue + appointment.totalAmount);
    }
    grouped.set(appointment.barberId, current);
  }

  return [...grouped.values()]
    .sort((left, right) => right.grossRevenue - left.grossRevenue || right.repeatClientRevenue - left.repeatClientRevenue)
    .slice(0, 6);
}
