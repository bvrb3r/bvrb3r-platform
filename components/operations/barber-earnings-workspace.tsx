"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  ReceiptText,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { BarberFintechReadinessPanel } from "@/components/operations/barber-fintech-readiness-panel";
import { usePwa } from "@/components/pwa/pwa-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FeatureGateTease } from "@/components/ui/feature-gate-tease";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBarberEarningsQuery,
  useBarberOverviewQuery,
  type BarberApiError
} from "@/lib/operations/barber-client";
import { useBarberPayoutsQuery } from "@/lib/fintech/client";
import {
  usePointsBalanceQuery,
  usePointsHistoryQuery,
  useRequestPointsCashoutMutation
} from "@/lib/points/client";
import { calculateInstantPayoutAmounts } from "@/lib/wallet/domain";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type MoneyTimelineRow = {
  id: string;
  label: string;
  detail: string;
  occurredAt: string | null;
  amount: number;
  tone: "positive" | "neutral" | "warning";
  kind: "service" | "tip" | "payout" | "refund" | "cashout" | "fee" | "booth_rent" | "subscription";
};

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatMoneyStatus(status: string) {
  return status.replaceAll("_", " ");
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function clampPercent(current: number, goal: number) {
  if (goal <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((current / goal) * 100)));
}

function isNegativeMoneyKind(kind: MoneyTimelineRow["kind"]) {
  return kind === "refund" || kind === "fee" || kind === "booth_rent" || kind === "subscription";
}

function getTimelineKindLabel(kind: MoneyTimelineRow["kind"]) {
  switch (kind) {
    case "service":
      return "Cut";
    case "tip":
      return "Tip";
    case "payout":
      return "Payout";
    case "refund":
      return "Refund";
    case "cashout":
      return "Points";
    case "fee":
      return "Fee";
    case "booth_rent":
      return "Booth";
    case "subscription":
      return "Plan";
    default:
      return "Money";
  }
}

function EarningsSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-3 h-4 w-40" />
    </div>
  );
}

function MoneyProgressRow({
  label,
  valueLabel,
  progress,
  detail
}: {
  label: string;
  valueLabel: string;
  progress: number;
  detail: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm text-white/76">
        <span>{label}</span>
        <span className="font-medium text-white">{valueLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(196, 242, 78,0.92),rgba(201,255,147,0.88))] transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-white/48">{detail}</p>
    </div>
  );
}

function getTimelineRows(input: {
  recentAppointments: NonNullable<ReturnType<typeof useBarberEarningsQuery>["data"]>["recentAppointments"];
  recentExecutions: NonNullable<ReturnType<typeof useBarberPayoutsQuery>["data"]>["recentExecutions"];
  boothRent: NonNullable<ReturnType<typeof useBarberEarningsQuery>["data"]>["money"]["boothRent"];
  subscription: NonNullable<ReturnType<typeof useBarberEarningsQuery>["data"]>["growth"]["subscription"];
  recentCashouts: NonNullable<ReturnType<typeof useBarberEarningsQuery>["data"]>["money"]["recentCashouts"];
}) {
  const serviceRows: MoneyTimelineRow[] = input.recentAppointments.slice(0, 4).map((appointment) => ({
    id: `service-${appointment.id}`,
    label: `${appointment.display.clientName} - ${appointment.display.serviceName}`,
    detail: appointment.financial.refundedAmount > 0
      ? "Refund touched this ticket after completion."
      : appointment.financial.latestStatusLabel,
    occurredAt: appointment.start,
    amount: appointment.totalAmount,
    tone: appointment.financial.refundedAmount > 0 ? "warning" : "positive",
    kind: appointment.financial.refundedAmount > 0 ? "refund" : "service"
  }));

  const tipRows: MoneyTimelineRow[] = input.recentAppointments
    .filter((appointment) => appointment.financial.tipAmount > 0)
    .slice(0, 3)
    .map((appointment) => ({
      id: `tip-${appointment.id}`,
      label: `Tip added for ${appointment.display.clientName}`,
      detail: `${appointment.display.serviceName} closed with gratuity.`,
      occurredAt: appointment.start,
      amount: appointment.financial.tipAmount,
      tone: "positive",
      kind: "tip"
    }));

  const payoutRows: MoneyTimelineRow[] = input.recentExecutions.slice(0, 4).map((entry) => ({
    id: `payout-${entry.id}`,
    label: entry.executionStatus === "executed" ? "Payout sent" : `Payout ${formatMoneyStatus(entry.executionStatus)}`,
    detail: `${entry.payoutSpeed === "instant" ? "Expedited" : "Standard"} payout${entry.targetDisplayName ? ` for ${entry.targetDisplayName}` : ""}`,
    occurredAt: entry.executedAt ?? entry.createdAt,
    amount: entry.netTransferAmount || entry.amount,
    tone: entry.executionStatus === "executed"
      ? "positive"
      : entry.executionStatus === "failed" || entry.executionStatus === "reversed"
        ? "warning"
        : "neutral",
    kind: "payout"
  }));

  const payoutFeeRows: MoneyTimelineRow[] = input.recentExecutions
    .filter((entry) => entry.instantPayoutFeeAmount > 0)
    .slice(0, 2)
    .map((entry) => ({
      id: `fee-${entry.id}`,
      label: "Expedited payout fee",
      detail: "Applied when expedited payout speed was selected.",
      occurredAt: entry.executedAt ?? entry.createdAt,
      amount: entry.instantPayoutFeeAmount,
      tone: "warning",
      kind: "fee"
    }));

  const boothRentRows: MoneyTimelineRow[] = input.boothRent.status !== "not_applicable"
    ? [{
        id: `booth-rent-${input.boothRent.periodLabel ?? input.boothRent.dueDate ?? "current"}`,
        label: input.boothRent.status === "paid" ? "Booth rent deducted" : input.boothRent.status === "overdue" ? "Booth rent overdue" : "Booth rent due",
        detail: input.boothRent.periodLabel ?? "Current booth-rent period.",
        occurredAt: input.boothRent.paidDate ?? input.boothRent.lastAttemptedAt ?? input.boothRent.dueDate,
        amount: input.boothRent.status === "overdue" ? input.boothRent.overdueAmount || input.boothRent.amount : input.boothRent.amount,
        tone: input.boothRent.status === "paid" ? "neutral" : "warning",
        kind: "booth_rent"
      }]
    : [];

  const subscriptionRows: MoneyTimelineRow[] = input.subscription
    ? [{
        id: `subscription-${input.subscription.id}`,
        label: input.subscription.billingState === "current" ? "Subscription charged" : "Subscription needs attention",
        detail: `${input.subscription.planName} | ${formatMoneyStatus(input.subscription.billingState)}`,
        occurredAt: input.subscription.lastPaidAt ?? input.subscription.lastInvoicedAt ?? input.subscription.updatedAt,
        amount: input.subscription.unitAmount,
        tone: input.subscription.billingState === "current" ? "neutral" : "warning",
        kind: "subscription"
      }]
    : [];

  const cashoutRows: MoneyTimelineRow[] = input.recentCashouts.slice(0, 2).map((entry) => ({
    id: `cashout-${entry.requestId}`,
    label: `Points cash-out ${formatMoneyStatus(entry.status)}`,
    detail: entry.failureReason ?? entry.reviewNote ?? `${entry.pointsRequested} pts requested`,
    occurredAt: entry.processedAt ?? entry.createdAt,
    amount: entry.cashValue,
    tone: entry.status === "paid" ? "positive" : entry.status === "failed" || entry.status === "rejected" ? "warning" : "neutral",
    kind: "cashout"
  }));

  return [
    ...serviceRows,
    ...tipRows,
    ...payoutRows,
    ...payoutFeeRows,
    ...boothRentRows,
    ...subscriptionRows,
    ...cashoutRows
  ]
    .sort((left, right) => new Date(right.occurredAt ?? 0).getTime() - new Date(left.occurredAt ?? 0).getTime())
    .slice(0, 10);
}

export function BarberEarningsWorkspace({ barberName }: { barberName: string }) {
  const { isOnline } = usePwa();
  const earningsQuery = useBarberEarningsQuery();
  const overviewQuery = useBarberOverviewQuery();
  const payoutsQuery = useBarberPayoutsQuery();
  const pointsBalanceQuery = usePointsBalanceQuery();
  const pointsHistoryQuery = usePointsHistoryQuery();
  const cashoutMutation = useRequestPointsCashoutMutation();
  const [pointsFeedback, setPointsFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [displayTodayEarned, setDisplayTodayEarned] = useState(0);
  const [pulseTodayEarned, setPulseTodayEarned] = useState(false);
  const previousTodayEarnedRef = useRef(0);

  const payload = earningsQuery.data;
  const overview = overviewQuery.data;
  const summary = payload?.summary;
  const growth = payload?.growth;
  const money = payload?.money;
  const pointsBalance = pointsBalanceQuery.data;
  const pointsHistory = pointsHistoryQuery.data;
  const recentAppointments = useMemo(() => payload?.recentAppointments ?? [], [payload?.recentAppointments]);
  const errorMessage = earningsQuery.error ? getReadableActionError(earningsQuery.error as BarberApiError) : null;

  const todayEarned = money?.todayEarnings ?? 0;
  const standardAvailable = money?.wallet.availableBalance ?? 0;
  const recentExecutions = useMemo(() => payoutsQuery.data?.recentExecutions ?? [], [payoutsQuery.data?.recentExecutions]);
  const instantPayoutQuote = useMemo(
    () => calculateInstantPayoutAmounts({ grossAmount: standardAvailable, speed: "instant" }),
    [standardAvailable]
  );
  const activePayout = useMemo(
    () =>
      money?.payoutVisibility?.find((entry) => ["pending", "queued", "in_transit"].includes(entry.status))
      ?? money?.payoutVisibility?.[0]
      ?? null,
    [money?.payoutVisibility]
  );
  const weeklyDelta = useMemo(
    () => (growth?.weekRevenue ?? 0) - (growth?.previousWeekRevenue ?? 0),
    [growth?.previousWeekRevenue, growth?.weekRevenue]
  );
  const todayRevenueGoal = useMemo(() => {
    if (growth?.previousWeekRevenue) {
      return roundCurrency(growth.previousWeekRevenue / 7);
    }

    if (growth?.weekAverageTicket && (summary?.todayBookings ?? 0) > 0) {
      return roundCurrency(growth.weekAverageTicket * (summary?.todayBookings ?? 0));
    }

    return 0;
  }, [growth?.previousWeekRevenue, growth?.weekAverageTicket, summary?.todayBookings]);
  const todayGuestGoal = summary?.todayBookings ?? 0;
  const revenueGoalProgress = clampPercent(todayEarned, todayRevenueGoal || todayEarned || 1);
  const guestGoalProgress = clampPercent(summary?.completedServices ?? 0, todayGuestGoal || 1);
  const topRepeatClientWithoutBooking = useMemo(
    () => overview?.quickClients?.find((client) => client.completedAppointments >= 2 && !client.nextVisitAt) ?? null,
    [overview?.quickClients]
  );
  const opportunity = useMemo(() => {
    if (overview?.status.nextAvailableAt) {
      return {
        eyebrow: "Opportunity",
        title: `Open chair at ${formatDateTime(overview.status.nextAvailableAt)}`,
        detail: topRepeatClientWithoutBooking
          ? `${topRepeatClientWithoutBooking.clientName} is a repeat guest without a future booking.`
          : `${overview.status.currentShopLabel ?? "Your floor"} still has room to convert another ticket today.`,
        href: (topRepeatClientWithoutBooking ? "/clients" : "/dashboard/barber") as Route,
        cta: topRepeatClientWithoutBooking ? "Review clients" : "Open calendar"
      };
    }

    if (topRepeatClientWithoutBooking) {
      return {
        eyebrow: "Opportunity",
        title: `${topRepeatClientWithoutBooking.clientName} is due back`,
        detail: `${topRepeatClientWithoutBooking.completedAppointments} completed visits and no next booking on the books yet.`,
        href: "/clients" as Route,
        cta: "Nudge repeat clients"
      };
    }

    if (growth?.serviceMix?.[0]) {
      return {
        eyebrow: "Opportunity",
        title: `${growth.serviceMix[0].serviceName} is leading the week`,
        detail: `${growth.serviceMix[0].appointments} services produced ${currency(growth.serviceMix[0].revenue)} so far.`,
        href: "/dashboard/barber/checkout?section=services" as Route,
        cta: "Open service library"
      };
    }

    return null;
  }, [growth?.serviceMix, overview?.status.currentShopLabel, overview?.status.nextAvailableAt, topRepeatClientWithoutBooking]);
  const weeklyInsight = weeklyDelta !== 0
    ? `${weeklyDelta > 0 ? "+" : "-"}${currency(Math.abs(weeklyDelta))} vs last week`
    : summary?.clientsRebookedToday
      ? `${summary.clientsRebookedToday} clients rebooked today`
      : `${growth?.weekRebookedClients ?? 0} clients rebooked this week`;
  const timelineRows = useMemo(
    () =>
      money
        ? getTimelineRows({
            recentAppointments,
            recentExecutions,
            boothRent: money.boothRent,
            subscription: growth?.subscription ?? null,
            recentCashouts: money.recentCashouts
          })
        : [],
    [growth?.subscription, money, recentAppointments, recentExecutions]
  );

  useEffect(() => {
    const target = todayEarned;
    const previous = previousTodayEarnedRef.current;

    if (previous === target) {
      setDisplayTodayEarned(target);
      return;
    }

    previousTodayEarnedRef.current = target;
    setPulseTodayEarned(true);

    const durationMs = 320;
    const startTime = performance.now();
    let frame = 0;
    let timeout = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayTodayEarned(roundCurrency(previous + (target - previous) * eased));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      timeout = window.setTimeout(() => setPulseTodayEarned(false), 260);
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [todayEarned]);

  async function handleCashout() {
    setPointsFeedback(null);
    if (!isOnline) {
      setPointsFeedback({
        tone: "error",
        message: "You're offline. Reconnect before submitting a cash-out request so payout eligibility stays canonical."
      });
      return;
    }

    try {
      const result = await cashoutMutation.mutateAsync({
        requestedPoints: pointsBalance?.cashoutEligiblePoints ?? 0
      });
      setPointsFeedback({
        tone: "success",
        message: `Cash-out request submitted for ${result.cashout.request.pointsRequested} points (${currency(result.cashout.request.cashValue)}).`
      });
    } catch (error) {
      setPointsFeedback({
        tone: "error",
        message: getReadableActionError(error as Error)
      });
    }
  }

  return (
    <div className="space-y-4" data-testid="barber-earnings-workspace">
      <FeatureGateTease
        gateKey="barber.analytics.city_benchmarks"
        label="City benchmarks"
        eyebrow="Barber analytics"
        detail="Privacy-safe city cohorts compare demand, rebooking, and service mix without exposing another barber’s money."
      />

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Checkout money</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">
              {barberName}
            </h3>
            <p className="mt-3 text-sm text-white/62">
              Know what landed today, what is ready now, and what is paying out next without turning this into accounting software.
            </p>
          </div>
          <div className="rounded-[24px] border border-[#c4f24e]/16 bg-[#c4f24e]/10 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">Checkout tab</p>
            <p className="mt-2 text-sm font-medium text-white">{currency(todayEarned)} today</p>
            <p className="mt-1 text-sm text-white/58">
              {money?.wallet.availableBalance
                ? `${currency(money.wallet.availableBalance)} available now`
                : "Waiting on the next completion"}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
          {pointsFeedback ? <FeedbackBanner tone={pointsFeedback.tone} message={pointsFeedback.message} /> : null}
        </div>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {earningsQuery.isLoading && !payload ? (
          <>
            <EarningsSkeleton />
            <EarningsSkeleton />
            <EarningsSkeleton />
            <EarningsSkeleton />
          </>
        ) : (
          <>
            <Card className="rounded-[28px] border-[#c4f24e]/16 bg-[linear-gradient(180deg,rgba(196, 242, 78,0.14),rgba(8,8,8,0.98))] p-5">
              <p className="surface-label text-[#e4f9b8]">Today earned</p>
              <p
                className={`mt-4 text-[2.5rem] font-semibold tracking-[-0.05em] transition-transform duration-500 ${pulseTodayEarned ? "scale-[1.02] text-[#f1ffd7]" : ""}`}
                data-display="true"
              >
                {currency(displayTodayEarned)}
              </p>
              <p className="mt-3 text-sm text-white/66">{summary?.completedServices ?? 0} completed services posted today.</p>
            </Card>
            <Card className="rounded-[28px] bg-[linear-gradient(180deg,rgba(24,24,24,0.98),rgba(10,10,10,0.98))] p-5">
              <p className="surface-label">Available now</p>
              <p className="mt-4 text-[2.1rem] font-semibold tracking-[-0.05em]" data-display="true">
                {currency(money?.wallet.availableBalance ?? 0)}
              </p>
              <p className="mt-3 text-sm text-white/62">Ready for the next standard payout.</p>
            </Card>
            <Card className="rounded-[28px] bg-[linear-gradient(180deg,rgba(24,24,24,0.98),rgba(10,10,10,0.98))] p-5">
              <p className="surface-label">Pending</p>
              <p className="mt-4 text-[2.1rem] font-semibold tracking-[-0.05em]" data-display="true">
                {currency(money?.wallet.pendingBalance ?? 0)}
              </p>
              <p className="mt-3 text-sm text-white/62">Captured money still waiting on service completion.</p>
            </Card>
            <Card className="rounded-[28px] bg-[linear-gradient(180deg,rgba(24,24,24,0.98),rgba(10,10,10,0.98))] p-5">
              <p className="surface-label">Tips today</p>
              <p className="mt-4 text-[2.1rem] font-semibold tracking-[-0.05em]" data-display="true">
                {currency(summary?.tips ?? 0)}
              </p>
              <p className="mt-3 text-sm text-white/62">Tips stay visible right beside chair earnings.</p>
            </Card>
          </>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Today goal</p>
              <p className="mt-2 text-sm text-white/58">A calm pace check built from real earnings and booked-guest progress.</p>
            </div>
            <Target className="h-5 w-5 text-[#e4f9b8]" />
          </div>

          <div className="mt-5 space-y-4">
            <MoneyProgressRow
              label="Earnings pace"
              valueLabel={todayRevenueGoal ? `${currency(todayEarned)} of ${currency(todayRevenueGoal)}` : currency(todayEarned)}
              progress={revenueGoalProgress}
              detail={
                todayRevenueGoal
                  ? growth?.previousWeekRevenue
                    ? "Based on last week's daily pace."
                    : "Based on this week's booked-ticket pace."
                  : "Goal pace will tighten as more earnings history comes in."
              }
            />
            <MoneyProgressRow
              label="Guests closed"
              valueLabel={todayGuestGoal ? `${summary?.completedServices ?? 0} of ${todayGuestGoal}` : `${summary?.completedServices ?? 0}`}
              progress={guestGoalProgress}
              detail={
                todayGuestGoal
                  ? `${summary?.completedServices ?? 0} completed out of ${todayGuestGoal} booked guests today.`
                  : "Guest progress appears once the calendar fills."
              }
            />
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Payout readiness</p>
              <p className="mt-2 text-sm text-white/58">See what is safe, what is next, and what instant speed costs before you tap anything.</p>
            </div>
            <span className="status-pill text-[#e4f9b8]">
              {activePayout ? formatMoneyStatus(activePayout.status) : "standard ready"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[22px] border border-[#c4f24e]/18 bg-[#c4f24e]/8 p-4 xl:col-span-2">
              <p className="surface-label text-[#e4f9b8]">Next payout amount</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">
                {currency(activePayout?.eligibleAmount ?? standardAvailable)}
              </p>
              <p className="mt-2 text-sm text-white/62">
                {activePayout?.nextAction ?? "Available balance is ready for standard payout."}
              </p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Standard payout</p>
              <p className="mt-3 text-2xl font-semibold">{currency(standardAvailable)}</p>
              <p className="mt-2 text-sm text-white/58">No speed fee.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Expedited payout estimate</p>
              <p className="mt-3 text-2xl font-semibold">{currency(instantPayoutQuote.netTransferAmount)}</p>
              <p className="mt-2 text-sm text-white/58">After the estimated expedited-payout fee. Eligibility and arrival timing depend on Stripe and bank conditions.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Expedited fee</p>
              <p className="mt-3 text-2xl font-semibold">{currency(instantPayoutQuote.instantFeeAmount)}</p>
              <p className="mt-2 text-sm text-white/58">Only when an eligible expedited payout is selected.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-pill text-white/72">
              Recent status {activePayout ? formatMoneyStatus(activePayout.status) : "waiting on completion"}
            </span>
            {activePayout?.blockedReasons?.length
              ? activePayout.blockedReasons.map((reason) => (
                  <span key={reason} className="status-pill text-white/72">
                    {formatMoneyStatus(reason)}
                  </span>
                ))
              : <span className="status-pill text-[#e4f9b8]">No active holds</span>}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Weekly performance</p>
              <p className="mt-2 text-sm text-white/58">This week should tell you if the chair is climbing, cooling off, or leaving money on the table.</p>
            </div>
            <TrendingUp className="h-5 w-5 text-[#d9f985]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[22px] border border-[#c4f24e]/18 bg-[#c4f24e]/8 p-4">
              <p className="surface-label text-[#e4f9b8]">Week earnings</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">{currency(growth?.weekRevenue ?? 0)}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Week tips</p>
              <p className="mt-3 text-2xl font-semibold">{currency(growth?.weekTips ?? 0)}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Completed</p>
              <p className="mt-3 text-2xl font-semibold">{growth?.weekCompletedServices ?? 0}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Average ticket</p>
              <p className="mt-3 text-2xl font-semibold">{currency(growth?.weekAverageTicket ?? 0)}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Rebooked</p>
              <p className="mt-3 text-2xl font-semibold">{growth?.weekRebookedClients ?? 0}</p>
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">Insight</p>
            <p className={`mt-3 text-xl font-semibold ${weeklyDelta >= 0 ? "text-[#e4f9b8]" : "text-amber-200"}`}>
              {weeklyInsight}
            </p>
            <p className="mt-2 text-sm text-white/58">
              Repeat clients contributed {currency(growth?.repeatClientRevenue ?? 0)} this week at {growth?.repeatClientShare ?? 0}% of completed revenue.
            </p>
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">{opportunity?.eyebrow ?? "Opportunity"}</p>
              <p className="mt-3 text-2xl font-semibold">{opportunity?.title ?? "More opportunity unlocks as the chair learns your flow."}</p>
              <p className="mt-3 text-sm leading-7 text-white/60">
                {opportunity?.detail ?? "As availability, repeat demand, and service mix grow, the best next earning move will stay visible here."}
              </p>
            </div>
            <Clock3 className="h-5 w-5 text-[#e4f9b8]" />
          </div>

          <div className="mt-5 rounded-[22px] border border-white/8 bg-black/20 p-4">
            <div className="flex flex-wrap gap-2">
              {overview?.status.nextAvailableAt ? (
                <span className="status-pill text-[#e4f9b8]">{formatDateTime(overview.status.nextAvailableAt)} open</span>
              ) : null}
              {topRepeatClientWithoutBooking ? (
                <span className="status-pill text-white/72">{topRepeatClientWithoutBooking.clientName} ready to rebook</span>
              ) : null}
              {growth?.serviceMix?.[0] ? (
                <span className="status-pill text-white/72">{growth.serviceMix[0].serviceName} leading</span>
              ) : null}
            </div>
            {opportunity ? (
              <div className="mt-4">
                <Link
                  href={opportunity.href}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/18 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/82 transition hover:border-[#c4f24e]/18 hover:text-[#e4f9b8] sm:text-[11px] sm:tracking-[0.22em]"
                >
                  {opportunity.cta}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">Momentum</p>
            <p className="mt-3 text-2xl font-semibold text-[#e4f9b8]">{growth?.bestDayLabel ?? "Building history"}</p>
            <p className="mt-2 text-sm text-white/58">
              Best earning day {growth?.bestDayRevenue ? `${currency(growth.bestDayRevenue)} posted.` : "will appear once more revenue history builds."}
            </p>
          </div>
        </Card>
      </section>

      <Card className="rounded-[32px] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="surface-label">Earnings activity</p>
            <p className="mt-2 text-sm text-white/58">Completed cuts, tips, payouts, fees, booth rent, and reversals stay readable in one calm list.</p>
          </div>
          <ReceiptText className="h-5 w-5 text-[#e4f9b8]" />
        </div>

        <div className="mt-4 space-y-3">
          {timelineRows.length ? timelineRows.map((row) => (
            <div key={row.id} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`status-pill ${row.tone === "positive" ? "text-[#e4f9b8]" : row.tone === "warning" ? "text-amber-200" : "text-white/72"}`}>
                      {getTimelineKindLabel(row.kind)}
                    </span>
                    <p className="font-medium text-white">{row.label}</p>
                  </div>
                  <p className="mt-2 text-sm text-white/58">{row.detail}</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-semibold ${row.tone === "positive" ? "text-[#e4f9b8]" : row.tone === "warning" ? "text-amber-200" : "text-white"}`}>
                    {isNegativeMoneyKind(row.kind) ? "-" : "+"}{currency(row.amount)}
                  </p>
                  <p className="mt-1 text-sm text-white/48">{row.occurredAt ? formatDateTime(row.occurredAt) : "Live"}</p>
                </div>
              </div>
            </div>
          )) : (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-black/18 px-4 py-5 text-sm text-white/58">
              Recent money events will appear here as soon as completed cuts, payouts, booth-rent movement, or cash-outs move through the canonical rails.
            </div>
          )}
        </div>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.94fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Tax / fee visibility</p>
              <p className="mt-2 text-sm text-white/58">Visible enough to build trust, quiet enough to keep the screen money-focused.</p>
            </div>
            <CircleDollarSign className="h-5 w-5 text-[#d9f985]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Net after fees</p>
              <p className="mt-3 text-2xl font-semibold">{currency(money?.tax.net ?? 0)}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Fees paid</p>
              <p className="mt-3 text-2xl font-semibold">{currency(money?.tax.fees ?? 0)}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Payout fees</p>
              <p className="mt-3 text-2xl font-semibold">{currency(instantPayoutQuote.instantFeeAmount)}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Payouts received</p>
              <p className="mt-3 text-2xl font-semibold">{currency(money?.tax.payouts ?? 0)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-pill text-white/72">Gross {currency(money?.tax.gross ?? 0)}</span>
            <span className="status-pill text-white/72">Refunds {currency(money?.tax.refunds ?? 0)}</span>
            <span className="status-pill text-white/72">Platform fees {currency(money?.tax.platformRevenue ?? 0)}</span>
            <span className="status-pill text-white/72">Points incentive cost {currency(money?.tax.pointsIncentiveCost ?? 0)}</span>
            <span className="status-pill text-white/72">{money?.tax.year ?? new Date().getFullYear()} tax year</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-4"
              disabled={!isOnline}
              onClick={() => window.open("/api/fintech/tax-summary", "_blank", "noopener,noreferrer")}
            >
              Open tax summary
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-4"
              disabled={!isOnline}
              onClick={() => window.open("/api/fintech/export/payouts", "_blank", "noopener,noreferrer")}
            >
              Export payouts
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-4"
              disabled={!isOnline}
              onClick={() => window.open("/api/fintech/export/incentives", "_blank", "noopener,noreferrer")}
            >
              Export incentives
            </Button>
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Points cash-out</p>
              <p className="mt-2 text-sm text-white/58">Keep earned points visible without letting them compete with haircut money.</p>
            </div>
            <WalletCards className="h-5 w-5 text-[#e4f9b8]" />
          </div>

            <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Unlocked points</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{pointsBalance?.unlockedPoints ?? 0}</p>
                  <p className="mt-2 text-sm text-white/58">
                    Pending {pointsBalance?.pendingPoints ?? 0} | Eligible {pointsBalance?.cashoutEligiblePoints ?? 0}
                  </p>
                </div>
                <div className="text-right">
                  <p className="surface-label">Cash value</p>
                  <p className="mt-3 text-2xl font-semibold text-[#e4f9b8]">{currency(pointsBalance?.cashoutValue ?? 0)}</p>
                  <p className="mt-2 text-sm text-white/58">In-app {currency(pointsBalance?.inAppValue ?? 0)}</p>
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-white/8 bg-black/18 p-4">
                <p className="surface-label">Points position</p>
                <p className="mt-3 text-sm leading-7 text-white/62">
                  {pointsBalance?.explanation.cashoutHint ?? "Cash-out stays optional. In-app credits remain the stronger value lane."}
                </p>
                <p className="mt-3 text-sm text-white/52">
                  {pointsBalance?.explanation.progressLabel ?? "Progress to the next value milestone will show here."}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {money ? (
                <>
                  <span className="status-pill text-white/72">Requested {money.cashoutSummary.requested}</span>
                  <span className="status-pill text-white/72">Under review {money.cashoutSummary.underReview}</span>
                  <span className="status-pill text-white/72">Approved {money.cashoutSummary.approved}</span>
                  <span className="status-pill text-[#e4f9b8]">Paid {money.cashoutSummary.paid}</span>
                </>
              ) : null}
            </div>

              <div className="mt-4">
                <Button
                  type="button"
                variant="secondary"
                className="h-11 px-5"
                disabled={cashoutMutation.isPending || !(pointsBalance?.cashoutEligiblePoints ?? 0) || !isOnline}
                onClick={() => void handleCashout()}
                >
                  {cashoutMutation.isPending ? "Submitting cash-out..." : "Request cash-out"}
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                <p className="surface-label">Recent point activity</p>
                {pointsHistory?.activity?.length ? pointsHistory.activity.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white">{entry.title}</p>
                        <p className="mt-1 text-sm text-white/58">{entry.detail}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${entry.tone === "positive" ? "text-[#e4f9b8]" : entry.tone === "warning" ? "text-amber-200" : "text-white/76"}`}>
                          {entry.amountLabel}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/42">{entry.statusLabel}</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-[18px] border border-dashed border-white/10 bg-black/15 px-3 py-4 text-sm text-white/58">
                    Completed point activity will appear here as referrals, tip rewards, redemptions, and cash-out actions move through the ledger.
                  </div>
                )}
              </div>
            </div>
          </Card>
        </section>

      <Card className="rounded-[32px] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="surface-label">Quiet motivation</p>
            <p className="mt-2 text-sm text-white/58">Progress stays visible here without turning Checkout into dashboard noise.</p>
          </div>
          <Sparkles className="h-5 w-5 text-[#e4f9b8]" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] border border-[#c4f24e]/18 bg-[#c4f24e]/8 p-4">
            <p className="surface-label text-[#e4f9b8]">Best earning day</p>
            <p className="mt-3 text-2xl font-semibold">{growth?.bestDayLabel ?? "Building history"}</p>
            <p className="mt-2 text-sm text-white/62">{currency(growth?.bestDayRevenue ?? 0)}</p>
          </div>
          <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">This week vs last week</p>
            <p className={`mt-3 text-2xl font-semibold ${weeklyDelta >= 0 ? "text-[#e4f9b8]" : "text-amber-200"}`}>
              {weeklyDelta >= 0 ? "+" : "-"}{currency(Math.abs(weeklyDelta))}
            </p>
            <p className="mt-2 text-sm text-white/58">{currency(growth?.previousWeekRevenue ?? 0)} last week baseline.</p>
          </div>
          <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">Repeat-client lift</p>
            <p className="mt-3 text-2xl font-semibold">{currency(growth?.repeatClientRevenue ?? 0)}</p>
            <p className="mt-2 text-sm text-white/58">
              {growth?.weekRebookedClients ?? 0} clients already rebooked from this week&apos;s flow.
            </p>
          </div>
        </div>
      </Card>

      <BarberFintechReadinessPanel />
    </div>
  );
}
