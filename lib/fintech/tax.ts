import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  canonicalAppointmentUuid,
  canonicalBarberUuid
} from "@/lib/booking/canonical-booking";
import { readScheduledExecutionStatus } from "@/lib/cron/fintech";
import { readFinancialAnomalyQueue } from "@/lib/fintech/anomalies";
import { listPayoutQueue } from "@/lib/payments/service";
import { readCashoutReviewQueue, readUserCashoutRequests } from "@/lib/points/cashout-review";
import { readPointsStateSnapshot } from "@/lib/points/engine";
import {
  readBoothRentSummaryForLocations,
  readLatestBoothRentStatusForBarber,
  readWalletBalance
} from "@/lib/wallet/service";
import type { LiveAppointmentRecord, LiveOperationsSnapshot } from "@/lib/operations/live-state";
import type { OwnerMonetizationSummary } from "@/types/monetization";
import type { OwnerPointsAnalyticsSummary } from "@/types/points";
import type {
  BarberMoneyDashboardView,
  OwnerMoneyDashboardView,
  TaxSummaryView
} from "@/types/fintech";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type PaymentRow = {
  id: string;
  appointment_id: string | null;
};

type RefundRow = {
  id: string;
  payment_id: string;
  amount: number | string;
  refunded_at: string;
};

type RoutingRow = {
  appointment_id: string | null;
  barber_payout_amount: number | string;
  platform_fee_amount: number | string;
  provider_fee_amount: number | string;
};

type PayoutExecutionRow = {
  appointment_id: string | null;
  amount: number | string;
  execution_status: string;
  created_at: string;
  executed_at: string | null;
};

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function yearRange(year: number) {
  return {
    start: `${year}-01-01T00:00:00.000Z`,
    end: `${year}-12-31T23:59:59.999Z`
  };
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return roundCurrency(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function readRefundsForAppointments(supabase: SupabaseClient, appointmentIds: string[]) {
  if (!appointmentIds.length) {
    return [] as RefundRow[];
  }

  const paymentResult = await supabase
    .from("payments")
    .select("id, appointment_id")
    .in("appointment_id", appointmentIds.map((appointmentId) => canonicalAppointmentUuid(appointmentId)));

  if (paymentResult.error) {
    return [] as RefundRow[];
  }

  const paymentIds = ((paymentResult.data ?? []) as PaymentRow[]).map((row) => row.id);
  if (!paymentIds.length) {
    return [] as RefundRow[];
  }

  const refundResult = await supabase
    .from("refunds")
    .select("id, payment_id, amount, refunded_at")
    .in("payment_id", paymentIds);

  return (refundResult.data ?? []) as RefundRow[];
}

async function readRoutingRowsForAppointments(supabase: SupabaseClient, appointmentIds: string[]) {
  if (!appointmentIds.length) {
    return [] as RoutingRow[];
  }

  const result = await supabase
    .from("payment_routing_records")
    .select("appointment_id, barber_payout_amount, platform_fee_amount, provider_fee_amount")
    .in("appointment_id", appointmentIds.map((appointmentId) => canonicalAppointmentUuid(appointmentId)));

  return (result.data ?? []) as RoutingRow[];
}

async function readPayoutExecutionsForAppointments(supabase: SupabaseClient, appointmentIds: string[]) {
  if (!appointmentIds.length) {
    return [] as PayoutExecutionRow[];
  }

  const result = await supabase
    .from("payout_executions")
    .select("appointment_id, amount, execution_status, created_at, executed_at")
    .in("appointment_id", appointmentIds.map((appointmentId) => canonicalAppointmentUuid(appointmentId)));

  return (result.data ?? []) as PayoutExecutionRow[];
}

export async function buildTaxSummary(input: {
  role: "barber" | "shop" | "owner";
  subjectId: string;
  year: number;
  appointments?: LiveAppointmentRecord[];
  userId?: string;
  monetization?: OwnerMonetizationSummary;
}): Promise<TaxSummaryView> {
  const { start, end } = yearRange(input.year);
  const pointsState = await readPointsStateSnapshot();
  const pointsIncentiveCost = roundCurrency(
    pointsState.transactions
      .filter((transaction) =>
        transaction.userId === input.userId
        && transaction.createdAt >= start
        && transaction.createdAt <= end
        && transaction.pointsDelta > 0
        && transaction.status !== "reversed"
        && transaction.status !== "expired"
      )
      .reduce((sum, transaction) => sum + transaction.inAppValue, 0)
  );

  if (!isSupabaseEnabled()) {
    const appointments = (input.appointments ?? []).filter((appointment) => appointment.start >= start && appointment.start <= end);
    const gross = roundCurrency(appointments.reduce((sum, appointment) => sum + numeric(appointment.grandTotal ?? appointment.totalAmount), 0));
    const refunds = roundCurrency(appointments.filter((appointment) => appointment.status === "refunded").reduce((sum, appointment) => sum + numeric(appointment.grandTotal ?? appointment.totalAmount), 0));

    return {
      role: input.role,
      subjectId: input.subjectId,
      year: input.year,
      gross,
      fees: 0,
      net: roundCurrency(gross - refunds),
      payouts: 0,
      refunds,
      pointsIncentiveCost,
      platformRevenue: input.monetization?.revenue.platformFeeRevenue ?? 0,
      subscriptionRevenue: input.monetization?.revenue.subscriptionRevenue ?? 0,
      generatedAt: new Date().toISOString()
    };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return {
      role: input.role,
      subjectId: input.subjectId,
      year: input.year,
      gross: 0,
      fees: 0,
      net: 0,
      payouts: 0,
      refunds: 0,
      pointsIncentiveCost,
      platformRevenue: 0,
      subscriptionRevenue: 0,
      generatedAt: new Date().toISOString()
    };
  }

  if (input.role === "barber") {
    const appointmentResult = await supabase
      .from("appointments")
      .select("reference_code, starts_at")
      .eq("barber_id", canonicalBarberUuid(input.subjectId))
      .gte("starts_at", start)
      .lte("starts_at", end);

    const appointmentIds = (appointmentResult.data ?? []).map((row) => row.reference_code as string).filter(Boolean);
    const [routingRows, refundRows, payoutRows] = await Promise.all([
      readRoutingRowsForAppointments(supabase, appointmentIds),
      readRefundsForAppointments(supabase, appointmentIds),
      readPayoutExecutionsForAppointments(supabase, appointmentIds)
    ]);

    const gross = roundCurrency(routingRows.reduce((sum, row) => sum + numeric(row.barber_payout_amount), 0));
    const fees = roundCurrency(routingRows.reduce((sum, row) => sum + numeric(row.provider_fee_amount), 0));
    const payouts = roundCurrency(
      payoutRows
        .filter((row) => row.execution_status === "executed")
        .reduce((sum, row) => sum + numeric(row.amount), 0)
    );
    const refunds = roundCurrency(refundRows.reduce((sum, row) => sum + numeric(row.amount), 0));

    return {
      role: input.role,
      subjectId: input.subjectId,
      year: input.year,
      gross,
      fees,
      net: roundCurrency(gross - fees - refunds),
      payouts,
      refunds,
      pointsIncentiveCost,
      platformRevenue: 0,
      subscriptionRevenue: 0,
      generatedAt: new Date().toISOString()
    };
  }

  const monetization = input.monetization;
  const gross = monetization?.revenue.grossRevenue ?? 0;
  const fees = (monetization?.revenue.platformFeeRevenue ?? 0) + (monetization?.revenue.processorFeeVisibility ?? 0);
  const refunds = roundCurrency(
    (input.appointments ?? [])
      .filter((appointment) => appointment.status === "refunded")
      .reduce((sum, appointment) => sum + numeric(appointment.grandTotal ?? appointment.totalAmount), 0)
  );
  const payouts = roundCurrency(
    (await listPayoutQueue({
      locationIds: input.role === "shop" ? [input.subjectId] : undefined,
      supabase
    }))
      .filter((entry) => entry.status === "paid")
      .reduce((sum, entry) => sum + entry.eligibleAmount, 0)
  );

  return {
    role: input.role,
    subjectId: input.subjectId,
    year: input.year,
    gross: roundCurrency(gross),
    fees: roundCurrency(fees),
    net: roundCurrency(gross - fees - refunds),
    payouts,
    refunds,
    pointsIncentiveCost,
    platformRevenue: monetization?.revenue.platformFeeRevenue ?? 0,
    subscriptionRevenue: monetization?.revenue.subscriptionRevenue ?? 0,
    generatedAt: new Date().toISOString()
  };
}

function calculateGrowthRate(current: number, previous: number) {
  if (!previous) {
    return current ? 100 : 0;
  }

  return roundCurrency(((current - previous) / previous) * 100);
}

export async function buildOwnerMoneyDashboardSummary(input: {
  locationIds: string[];
  snapshot: LiveOperationsSnapshot;
  monetization: OwnerMonetizationSummary;
  points?: OwnerPointsAnalyticsSummary;
}): Promise<OwnerMoneyDashboardView> {
  const scopedLocationIds = input.locationIds.length
    ? input.locationIds
    : [...new Set(input.snapshot.appointments.map((appointment) => appointment.locationId).filter(Boolean))];
  const scopedAppointments = input.snapshot.appointments.filter((appointment) =>
    !scopedLocationIds.length || scopedLocationIds.includes(appointment.locationId)
  );
  const payoutQueue = await listPayoutQueue({
    locationIds: scopedLocationIds
  }).catch(() => []);
  const queueByStatus = (status: string) => roundCurrency(
    payoutQueue
      .filter((entry) => entry.status === status)
      .reduce((sum, entry) => sum + entry.eligibleAmount, 0)
  );
  const distinctClients = new Set(scopedAppointments.map((appointment) => appointment.clientId)).size || 1;
  const now = new Date();
  const last30Start = new Date(now);
  last30Start.setDate(now.getDate() - 30);
  const prior30Start = new Date(now);
  prior30Start.setDate(now.getDate() - 60);
  const last30Revenue = scopedAppointments
    .filter((appointment) => appointment.status === "completed" && new Date(appointment.start) >= last30Start)
    .reduce((sum, appointment) => sum + numeric(appointment.grandTotal ?? appointment.totalAmount), 0);
  const prior30Revenue = scopedAppointments
    .filter((appointment) => appointment.status === "completed" && new Date(appointment.start) >= prior30Start && new Date(appointment.start) < last30Start)
    .reduce((sum, appointment) => sum + numeric(appointment.grandTotal ?? appointment.totalAmount), 0);
  const supabase = isSupabaseEnabled() ? createSupabaseAdminClient() : null;
  const paidExecutionRows = supabase
    ? await readPayoutExecutionsForAppointments(
      supabase,
      scopedAppointments.map((appointment) => appointment.id)
    ).catch(() => [])
    : [];
  const delayHours = paidExecutionRows
    .filter((row) => row.execution_status === "executed" && row.executed_at)
    .map((row) => (new Date(row.executed_at as string).getTime() - new Date(row.created_at).getTime()) / 36e5)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const cashoutQueue = await readCashoutReviewQueue();
  const boothRent = await readBoothRentSummaryForLocations(scopedLocationIds).catch(() => ({
    paid: 0,
    overdue: 0,
    due: 0,
    overdueAmount: 0
  }));

  return {
    revenueBreakdown: {
      grossRevenue: input.monetization.revenue.grossRevenue,
      netRevenue: roundCurrency(
        input.monetization.revenue.grossRevenue
        - input.monetization.revenue.platformFeeRevenue
        - input.monetization.revenue.processorFeeVisibility
      ),
      platformFeeRevenue: input.monetization.revenue.platformFeeRevenue,
      processorFeeVisibility: input.monetization.revenue.processorFeeVisibility,
      subscriptionRevenue: input.monetization.revenue.subscriptionRevenue
    },
    payoutFlow: {
      pendingAmount: queueByStatus("pending"),
      queuedAmount: queueByStatus("queued"),
      inTransitAmount: queueByStatus("in_transit"),
      paidAmount: queueByStatus("paid"),
      failedAmount: queueByStatus("failed"),
      reversedAmount: queueByStatus("reversed"),
      avgPayoutDelayHours: average(delayHours)
    },
    boothRent,
    pointsCostVsRevenue: input.points && input.monetization.revenue.grossRevenue
      ? roundCurrency(((input.points.redeemedInAppValue + input.points.cashedOutValue) / input.monetization.revenue.grossRevenue) * 100)
      : 0,
    refundRate: scopedAppointments.length
      ? roundCurrency((scopedAppointments.filter((appointment) => appointment.status === "refunded").length / scopedAppointments.length) * 100)
      : 0,
    revenuePerUser: roundCurrency(input.monetization.revenue.grossRevenue / distinctClients),
    barberEarningsGrowth: calculateGrowthRate(last30Revenue, prior30Revenue),
    cashoutQueue,
    anomalies: await readFinancialAnomalyQueue({ locationIds: scopedLocationIds }),
    scheduledJobs: await readScheduledExecutionStatus({ locationIds: scopedLocationIds }),
    exports: {
      taxSummaryPath: "/api/fintech/tax-summary",
      payoutsPath: "/api/fintech/export/payouts",
      revenuePath: "/api/fintech/export/revenue",
      incentivesPath: "/api/fintech/export/incentives"
    },
    recentCashouts: cashoutQueue.requests.slice(0, 5)
  };
}

export async function buildBarberMoneyDashboardSummary(input: {
  userId: string;
  barberId: string;
  todayEarnings: number;
  appointments: LiveAppointmentRecord[];
  year: number;
}): Promise<BarberMoneyDashboardView> {
  const payoutQueue = await listPayoutQueue().catch(() => []);
  const appointmentIds = new Set(input.appointments.map((appointment) => appointment.id));
  const relevantPayouts = payoutQueue.filter((entry) => entry.appointmentId && appointmentIds.has(entry.appointmentId));
  const pointsState = await readPointsStateSnapshot();
  const scopedTransactions = pointsState.transactions.filter((transaction) => transaction.userId === input.userId && transaction.role === "barber");
  const recentCashouts = await readUserCashoutRequests({ userId: input.userId, role: "barber" });
  const [wallet, boothRent] = await Promise.all([
    readWalletBalance({
      subjectType: "barber",
      subjectId: input.barberId
    }).catch(() => null),
    readLatestBoothRentStatusForBarber(input.barberId).catch(() => ({
      amount: 0,
      frequency: null,
      status: "not_applicable" as const,
      periodLabel: null,
      dueDate: null,
      paidDate: null,
      overdueAmount: 0,
      lastAttemptedAt: null
    }))
  ]);
  const tax = await buildTaxSummary({
    role: "barber",
    subjectId: input.barberId,
    userId: input.userId,
    year: input.year,
    appointments: input.appointments
  });

  return {
    todayEarnings: input.todayEarnings,
    pendingPayouts: roundCurrency(
      relevantPayouts
        .filter((entry) => entry.status === "pending" || entry.status === "queued" || entry.status === "in_transit")
        .reduce((sum, entry) => sum + entry.eligibleAmount, 0)
    ),
    completedPayouts: roundCurrency(
      relevantPayouts
        .filter((entry) => entry.status === "paid")
        .reduce((sum, entry) => sum + entry.eligibleAmount, 0)
    ),
    wallet: {
      pendingBalance: wallet?.pendingBalance ?? 0,
      availableBalance: wallet?.availableBalance ?? 0,
      currency: wallet?.currency ?? "usd",
      updatedAt: wallet?.updatedAt ?? null
    },
    boothRent,
    pointsEarned: scopedTransactions
      .filter((transaction) => transaction.pointsDelta > 0 && transaction.status !== "expired" && transaction.status !== "reversed")
      .reduce((sum, transaction) => sum + transaction.pointsDelta, 0),
    pointsCashedOut: Math.abs(
      scopedTransactions
        .filter((transaction) => transaction.pointsDelta < 0 && transaction.status === "cashed_out")
        .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)
      ),
    tax,
    cashoutSummary: {
      requested: recentCashouts.filter((request) => request.status === "requested").length,
      underReview: recentCashouts.filter((request) => request.status === "under_review").length,
      approved: recentCashouts.filter((request) => request.status === "approved").length,
      paid: recentCashouts.filter((request) => request.status === "paid").length,
      failed: recentCashouts.filter((request) => request.status === "failed").length,
      reversed: recentCashouts.filter((request) => request.status === "reversed").length
    },
    payoutVisibility: relevantPayouts.slice(0, 6).map((entry) => ({
      appointmentId: entry.appointmentId ?? "",
      paymentId: entry.paymentId,
      routingRecordId: entry.routingRecordId,
      status: entry.status,
      eligibleAmount: entry.eligibleAmount,
      thresholdAmount: entry.thresholdAmount,
      thresholdRemaining: entry.thresholdRemaining,
      minimumThresholdMet: entry.minimumThresholdMet,
      blockedReasons: entry.blockedReasons,
      stripeReady: entry.stripeReady,
      disputeHold: entry.disputeHold,
      refundHold: entry.refundHold,
      nextAction: entry.nextAction,
      executionCount: entry.executionCount,
      lastUpdatedAt: entry.lastUpdatedAt
    })),
    recentCashouts
  };
}
