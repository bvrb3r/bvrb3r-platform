"use client";

import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle
} from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, GlassCard } from "@/design/components";
import {
  useFinancialAnomalyQueueQuery,
  useFintechManagementQuery,
  useFintechPayoutsQuery
} from "@/lib/fintech/client";
import { useShopDashboardQuery, type ShopDashboardAppointment } from "@/lib/operations/barber-client";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type MoneyRange = "day" | "week" | "month" | "year";
type BreakdownTone = "green" | "blue" | "amber" | "neutral";
type TransactionStatus = "completed" | "pending" | "failed" | "refunded" | "fee" | "disputed";

type ChartPoint = {
  label: string;
  value: number;
  date: string;
};

type BreakdownItem = {
  label: string;
  amount: number | null;
  percent: number | null;
  tone: BreakdownTone;
};

type TransactionRow = {
  id: string;
  name: string;
  initials: string;
  service: string;
  source: string;
  timestamp: string;
  method: string;
  amount: number;
  status: TransactionStatus;
  href: ComponentProps<typeof Link>["href"];
};

const rangeOptions: Array<{ key: MoneyRange; label: string; shortLabel: string }> = [
  { key: "day", label: "Today", shortLabel: "Day" },
  { key: "week", label: "This Week", shortLabel: "Week" },
  { key: "month", label: "This Month", shortLabel: "Month" },
  { key: "year", label: "This Year", shortLabel: "Year" }
];

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BV";
}

function getAnchorDate(value?: string) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function getRangeStart(anchorDate: Date, range: MoneyRange) {
  const start = new Date(anchorDate);

  if (range === "day") {
    return start;
  }

  if (range === "week") {
    start.setDate(start.getDate() - 6);
    return start;
  }

  if (range === "month") {
    start.setDate(1);
    return start;
  }

  start.setMonth(0, 1);
  return start;
}

function getPreviousRange(anchorDate: Date, range: MoneyRange) {
  const currentStart = getRangeStart(anchorDate, range);
  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = getRangeStart(previousEnd, range);

  return { previousStart, previousEnd };
}

function dateFromKey(value: string) {
  const date = new Date(`${value}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isDateInRange(value: string, start: Date, end: Date) {
  const date = dateFromKey(value);
  return date >= start && date <= end;
}

function isIsoInRange(value: string | null | undefined, start: Date, end: Date) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  date.setHours(0, 0, 0, 0);
  return date >= start && date <= end;
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) {
    return "Time unavailable";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getChartLabel(dateKey: string, range: MoneyRange) {
  const date = dateFromKey(dateKey);
  if (range === "year") {
    return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
  }

  if (range === "month") {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date).toUpperCase();
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  return `${Math.round(value)}%`;
}

function getTrendCopy(current: number, previous: number, label: string) {
  if (previous <= 0) {
    return {
      available: false,
      positive: null as boolean | null,
      text: "Previous period unavailable"
    };
  }

  const delta = ((current - previous) / previous) * 100;
  const positive = delta >= 0;

  return {
    available: true,
    positive,
    text: `${positive ? "up" : "down"} ${Math.abs(delta).toFixed(1)}% vs ${label} ${currency(previous)}`
  };
}

function statusLabel(status: TransactionStatus) {
  switch (status) {
    case "completed":
      return "Completed";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "refunded":
      return "Refunded";
    case "fee":
      return "Fee";
    case "disputed":
      return "Disputed";
  }
}

function statusClass(status: TransactionStatus) {
  switch (status) {
    case "completed":
      return "text-[#A3FF12]";
    case "pending":
      return "text-amber-300";
    case "failed":
    case "disputed":
      return "text-red-300";
    case "refunded":
    case "fee":
      return "text-amber-200";
  }
}

function payoutStatusCopy(readyAccounts: number, readyAmount: number, blockedCount: number): {
  label: string;
  detail: string;
  tone: "green" | "amber";
  href: ComponentProps<typeof Link>["href"];
} {
  if (blockedCount > 0) {
    return {
      label: "Needs review",
      detail: "Review payout setup",
      tone: "amber" as const,
      href: "/dashboard/owner/money?view=fintech&section=payouts"
    };
  }

  if (readyAccounts > 0 || readyAmount > 0) {
    return {
      label: "Active",
      detail: "View Payouts",
      tone: "green" as const,
      href: "/dashboard/owner/money?view=fintech&section=payouts"
    };
  }

  return {
    label: "Setup incomplete",
    detail: "Complete setup",
    tone: "amber" as const,
    href: "/dashboard/owner/settings?section=payouts"
  };
}

function sumCompletedAppointmentRevenue(appointment: ShopDashboardAppointment) {
  if (appointment.status !== "completed") {
    return 0;
  }

  return appointment.totalAmount + appointment.tipAmount;
}

function CommandIconButton({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <summary
      aria-label={label}
      className="inline-flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/76 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#A3FF12]/35 hover:text-white hover:shadow-[0_0_24px_rgba(163,255,18,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70 sm:h-14 sm:w-14"
    >
      {children}
    </summary>
  );
}

function MetricSkeleton() {
  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-5">
      <Skeleton className="h-10 w-10 rounded-full" />
      <Skeleton className="mt-6 h-7 w-24" />
      <Skeleton className="mt-3 h-4 w-32" />
    </div>
  );
}

function SectionHeader({
  title,
  action
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-2xl font-extrabold tracking-[-0.04em] text-white">{title}</h2>
      {action}
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-white/12 bg-black/24 p-5">
      <p className="text-lg font-extrabold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/58">{detail}</p>
    </div>
  );
}

function ChartLine({ points }: { points: ChartPoint[] }) {
  if (!points.length) {
    return (
      <EmptyPanel
        title="Revenue chart unavailable"
        detail="Completed payments will appear here."
      />
    );
  }

  const width = 680;
  const height = 210;
  const paddingX = 28;
  const paddingY = 18;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const coordinates = points.map((point, index) => {
    const x = points.length === 1
      ? width / 2
      : paddingX + (index / (points.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - (point.value / maxValue) * (height - paddingY * 2);
    return { x, y };
  });
  const linePoints = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPoints = [
    `${coordinates[0]?.x ?? paddingX},${height - paddingY}`,
    linePoints,
    `${coordinates[coordinates.length - 1]?.x ?? width - paddingX},${height - paddingY}`
  ].join(" ");
  const axisValues = [maxValue, maxValue * 0.66, maxValue * 0.33, 0];

  return (
    <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Revenue trend chart" className="h-56 w-full overflow-visible">
          <defs>
            <linearGradient id="owner-money-chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#A3FF12" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#A3FF12" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={areaPoints} fill="url(#owner-money-chart-fill)" />
          <polyline
            fill="none"
            points={linePoints}
            stroke="#A3FF12"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="6"
            filter="drop-shadow(0 0 12px rgba(163,255,18,0.35))"
          />
          {coordinates.map((point, index) => (
            <circle key={`${points[index]?.date}-${index}`} cx={point.x} cy={point.y} r={index === coordinates.length - 1 ? 7 : 0} fill="#A3FF12" />
          ))}
        </svg>
        <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${Math.min(points.length, 7)}, minmax(0, 1fr))` }}>
          {points.slice(-7).map((point) => (
            <span key={point.date} className="text-center text-sm font-bold uppercase tracking-[0.08em] text-white/58">{point.label}</span>
          ))}
        </div>
      </div>
      <div className="hidden min-w-16 flex-col justify-between py-4 text-right text-sm font-semibold text-white/56 lg:flex">
        {axisValues.map((value, index) => (
          <span key={`${value}-${index}`}>{currency(value).replace(".00", "")}</span>
        ))}
      </div>
    </div>
  );
}

function BreakdownDot({ tone }: { tone: BreakdownTone }) {
  return (
    <span
      className={cn(
        "h-3.5 w-3.5 rounded-full",
        tone === "green" && "bg-[#A3FF12]",
        tone === "blue" && "bg-sky-400",
        tone === "amber" && "bg-amber-300",
        tone === "neutral" && "bg-white/45"
      )}
    />
  );
}

function PerformanceMetric({
  icon,
  label,
  value,
  trend,
  href
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  trend?: string;
  href?: ComponentProps<typeof Link>["href"];
}) {
  const content = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#A3FF12]/22 bg-[#A3FF12]/10 text-[#A3FF12] shadow-[0_0_18px_rgba(163,255,18,0.14)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white/68">{label}</span>
        <span className="mt-2 block text-2xl font-black tracking-[-0.04em] text-white">{value}</span>
        {trend ? <span className="mt-2 block text-sm font-extrabold text-[#A3FF12]">{trend}</span> : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="grid gap-3 rounded-[18px] p-4 transition hover:bg-white/[0.035] sm:grid-cols-[auto_1fr]">
        {content}
      </Link>
    );
  }

  return <div className="grid gap-3 rounded-[18px] p-4 sm:grid-cols-[auto_1fr]">{content}</div>;
}

export function OwnerMoneyWorkspace() {
  const [selectedRange, setSelectedRange] = useState<MoneyRange>("week");
  const shopQuery = useShopDashboardQuery();
  const fintechQuery = useFintechManagementQuery();
  const payoutsQuery = useFintechPayoutsQuery();
  const anomaliesQuery = useFinancialAnomalyQueueQuery();

  const isInitialLoading =
    (shopQuery.isLoading && !shopQuery.data)
    || (fintechQuery.isLoading && !fintechQuery.data)
    || (payoutsQuery.isLoading && !payoutsQuery.data);

  const errorMessage =
    shopQuery.error
    ?? fintechQuery.error
    ?? payoutsQuery.error
    ?? anomaliesQuery.error;

  const selectedRangeOption = rangeOptions.find((option) => option.key === selectedRange) ?? rangeOptions[1];
  const ownerAnalytics = useMemo(() => shopQuery.data?.ownerAnalytics ?? [], [shopQuery.data?.ownerAnalytics]);
  const appointments = useMemo(() => shopQuery.data?.appointments ?? [], [shopQuery.data?.appointments]);
  const summary = shopQuery.data?.summary;
  const blockedPayments = useMemo(() => fintechQuery.data?.blockedPayments ?? [], [fintechQuery.data?.blockedPayments]);
  const readyRouting = useMemo(() => payoutsQuery.data?.readyRouting ?? [], [payoutsQuery.data?.readyRouting]);
  const payoutSummary = payoutsQuery.data?.summary;
  const recentPayoutExecutions = payoutsQuery.data?.recentExecutions ?? [];
  const anomalies = anomaliesQuery.data?.items ?? [];
  const rangeEnd = getAnchorDate(summary?.businessDate ?? summary?.latestDate);
  const rangeStart = getRangeStart(rangeEnd, selectedRange);
  const previousRange = getPreviousRange(rangeEnd, selectedRange);

  const analyticsInRange = useMemo(
    () => ownerAnalytics.filter((row) => isDateInRange(row.businessDate, rangeStart, rangeEnd)),
    [ownerAnalytics, rangeEnd, rangeStart]
  );
  const previousAnalytics = useMemo(
    () => ownerAnalytics.filter((row) => isDateInRange(row.businessDate, previousRange.previousStart, previousRange.previousEnd)),
    [ownerAnalytics, previousRange.previousEnd, previousRange.previousStart]
  );
  const appointmentsInRange = useMemo(
    () => appointments.filter((appointment) => isIsoInRange(appointment.completedAt ?? appointment.end ?? appointment.start, rangeStart, rangeEnd)),
    [appointments, rangeEnd, rangeStart]
  );

  const completedAppointments = useMemo(
    () => appointmentsInRange.filter((appointment) => appointment.status === "completed"),
    [appointmentsInRange]
  );

  const analyticsRevenue = analyticsInRange.reduce((sum, row) => sum + row.revenueTotal, 0);
  const hasAnalyticsRevenue = analyticsInRange.length > 0;
  const totalRevenue = hasAnalyticsRevenue
    ? analyticsRevenue
    : selectedRange === "day"
      ? summary?.revenueToday ?? 0
      : 0;
  const previousRevenue = previousAnalytics.reduce((sum, row) => sum + row.revenueTotal, 0);
  const previousLabel = selectedRange === "week"
    ? "last week"
    : selectedRange === "month"
      ? "last month"
      : selectedRange === "year"
        ? "last year"
        : "yesterday";
  const trend = getTrendCopy(totalRevenue, previousRevenue, previousLabel);

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (!analyticsInRange.length) {
      return [];
    }

    return analyticsInRange
      .slice()
      .sort((left, right) => left.businessDate.localeCompare(right.businessDate))
      .map((row) => ({
        date: row.businessDate,
        label: getChartLabel(row.businessDate, selectedRange),
        value: row.revenueTotal
      }));
  }, [analyticsInRange, selectedRange]);

  const routingRows = useMemo(() => [...blockedPayments, ...readyRouting], [blockedPayments, readyRouting]);
  const splitTotals = useMemo(() => {
    const total = routingRows.reduce((sum, row) => sum + row.providerGrossAmount, 0);
    const shop = routingRows.reduce((sum, row) => sum + row.shopSplitAmount, 0);
    const barber = routingRows.reduce((sum, row) => sum + row.barberPayoutAmount, 0);
    const platform = routingRows.reduce((sum, row) => sum + row.platformFeeAmount, 0);

    return { total, shop, barber, platform };
  }, [routingRows]);
  const hasSplitData = routingRows.length > 0 && splitTotals.total > 0;
  const breakdownItems: BreakdownItem[] = [
    {
      label: "Shop Earnings",
      amount: hasSplitData ? splitTotals.shop : null,
      percent: hasSplitData ? (splitTotals.shop / splitTotals.total) * 100 : null,
      tone: "green"
    },
    {
      label: "Barber Payouts",
      amount: hasSplitData ? splitTotals.barber : null,
      percent: hasSplitData ? (splitTotals.barber / splitTotals.total) * 100 : null,
      tone: "blue"
    },
    {
      label: "Platform Fees",
      amount: hasSplitData ? splitTotals.platform : null,
      percent: hasSplitData ? (splitTotals.platform / splitTotals.total) * 100 : null,
      tone: "amber"
    },
    {
      label: "Total Revenue",
      amount: hasSplitData ? splitTotals.total : null,
      percent: hasSplitData ? 100 : null,
      tone: "neutral"
    }
  ];

  const appointmentCount = analyticsInRange.length
    ? analyticsInRange.reduce((sum, row) => sum + row.completedServicesCount, 0)
    : completedAppointments.length;
  const previousAppointmentCount = previousAnalytics.reduce((sum, row) => sum + row.completedServicesCount, 0);
  const appointmentTrend = previousAppointmentCount > 0
    ? `${appointmentCount >= previousAppointmentCount ? "up" : "down"} ${Math.abs(((appointmentCount - previousAppointmentCount) / previousAppointmentCount) * 100).toFixed(1)}%`
    : undefined;
  const avgTicket = appointmentCount > 0 ? totalRevenue / appointmentCount : null;
  const noShowCount = appointmentsInRange.filter((appointment) => appointment.status === "no_show").length;
  const noShowRate = appointmentsInRange.length ? (noShowCount / appointmentsInRange.length) * 100 : null;

  const transactions = useMemo<TransactionRow[]>(() => {
    return completedAppointments
      .slice()
      .sort((left, right) => new Date(right.completedAt ?? right.end).getTime() - new Date(left.completedAt ?? left.end).getTime())
      .slice(0, 6)
      .map((appointment) => ({
        id: appointment.id,
        name: appointment.display.barberName || appointment.display.clientName,
        initials: getInitials(appointment.display.barberName || appointment.display.clientName),
        service: appointment.display.serviceName,
        source: appointment.balanceDue > 0 ? "Balance due" : "Paid by client",
        timestamp: formatDateTime(appointment.completedAt ?? appointment.end),
        method: "Payment method unavailable",
        amount: sumCompletedAppointmentRevenue(appointment),
        status: appointment.balanceDue > 0 ? "pending" : "completed",
        href: `/dashboard/owner/money?section=transactions&appointment=${encodeURIComponent(appointment.id)}`
      }));
  }, [completedAppointments]);

  const payoutReadyAmount = payoutSummary?.readyForPayoutAmount ?? fintechQuery.data?.summary.readyForPayoutAmount ?? 0;
  const payoutStatus = payoutStatusCopy(
    fintechQuery.data?.summary.readyAccounts ?? 0,
    payoutReadyAmount,
    (payoutSummary?.blockedExecutionRecords ?? 0) + (payoutSummary?.failedExecutionRecords ?? 0) + (fintechQuery.data?.summary.blockedRoutingRecords ?? 0)
  );
  const latestExecution = recentPayoutExecutions.find((execution) => execution.executedAt) ?? null;
  const nextPayoutLabel = latestExecution?.executedAt ? formatDateTime(latestExecution.executedAt) : "Unavailable";

  return (
    <div className="space-y-7" data-testid="owner-money-workspace">
      <header className="flex items-start justify-between gap-5">
        <div>
          <h1 className="text-5xl font-black leading-none tracking-[-0.055em] text-white sm:text-6xl" data-display="true">
            Money
          </h1>
          <p className="mt-3 text-lg font-medium text-white/68">Revenue & payouts</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
            Platform-collected revenue, payout readiness, and future commission or booth-rent lanes stay separated from Architect payout execution.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <details className="group relative">
            <summary className="inline-flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-5 text-sm font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#A3FF12]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70 sm:min-h-14 sm:px-6 sm:text-base">
              {selectedRangeOption.label}
              <ChevronDown className="h-5 w-5" />
            </summary>
            <GlassCard className="absolute right-0 z-20 mt-3 w-56 p-3">
              <p className="px-3 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#A3FF12]">Timeframe</p>
              {rangeOptions.map((option) => (
                <button
                  key={`header-range-${option.key}`}
                  type="button"
                  onClick={() => setSelectedRange(option.key)}
                  className="flex w-full items-center justify-between rounded-[14px] px-3 py-3 text-left text-sm font-bold text-white/74 transition hover:bg-white/[0.05] hover:text-white"
                >
                  {option.label}
                  {selectedRange === option.key ? <span className="h-2 w-2 rounded-full bg-[#A3FF12]" /> : null}
                </button>
              ))}
            </GlassCard>
          </details>
          <details className="group relative">
            <CommandIconButton label="Open money filters">
              <SlidersHorizontal className="h-5 w-5" />
            </CommandIconButton>
            <GlassCard className="absolute right-0 z-20 mt-3 w-72 p-4">
              <p className="px-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#A3FF12]">Money filters</p>
              <div className="mt-3 grid gap-2">
                <Link href="/dashboard/owner/money?section=transactions" className="rounded-[14px] px-3 py-3 text-sm font-bold text-white/74 transition hover:bg-white/[0.05] hover:text-white">Transactions</Link>
                <Link href="/dashboard/owner/money?view=fintech&section=payouts" className="rounded-[14px] px-3 py-3 text-sm font-bold text-white/74 transition hover:bg-white/[0.05] hover:text-white">Payout operations</Link>
                <Link href="/dashboard/owner/money?section=breakdown" className="rounded-[14px] px-3 py-3 text-sm font-bold text-white/74 transition hover:bg-white/[0.05] hover:text-white">Revenue breakdown</Link>
                {anomalies.length ? (
                  <Link href="/dashboard/owner/money?section=anomalies" className="rounded-[14px] px-3 py-3 text-sm font-bold text-amber-200 transition hover:bg-white/[0.05] hover:text-white">Refunds, disputes, and anomalies</Link>
                ) : null}
              </div>
            </GlassCard>
          </details>
        </div>
      </header>

      {errorMessage ? <FeedbackBanner tone="error" message={getReadableActionError(errorMessage)} /> : null}

      <GlassCard className="grid gap-4 p-5 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Owner money control</p>
          <p className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">Revenue now. Splits later.</p>
          <p className="mt-2 text-sm leading-6 text-white/56">
            This tab reads owner-facing money posture only. Architect remains the release authority for Phase 1 payouts.
          </p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Booth rent</p>
          <p className="mt-3 text-lg font-black text-white">Coming next</p>
          <p className="mt-2 text-sm leading-6 text-white/56">Separate invoices, not service payout deductions.</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Commission</p>
          <p className="mt-3 text-lg font-black text-white">Future split lane</p>
          <p className="mt-2 text-sm leading-6 text-white/56">Will use real relationship rules when wired.</p>
        </div>
      </GlassCard>

      <GlassCard className="p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xl font-extrabold tracking-[-0.035em] text-white">Total Revenue ({selectedRangeOption.label})</p>
            {isInitialLoading ? (
              <Skeleton className="mt-6 h-16 w-72" />
            ) : (
              <p className="mt-6 text-6xl font-black leading-none tracking-[-0.08em] text-[#A3FF12] drop-shadow-[0_0_28px_rgba(163,255,18,0.26)] sm:text-7xl" data-display="true">
                {currency(totalRevenue)}
              </p>
            )}
            <p className={cn("mt-5 inline-flex items-center gap-2 text-lg font-extrabold", trend.positive === false ? "text-red-300" : trend.available ? "text-[#A3FF12]" : "text-white/54")}>
              {trend.available ? (
                trend.positive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />
              ) : null}
              {trend.text}
            </p>
          </div>
          <Link href="/dashboard/owner/money?section=revenue" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 text-sm font-extrabold text-white/72 transition hover:border-[#A3FF12]/35 hover:text-[#A3FF12]">
            Revenue detail
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {isInitialLoading ? <Skeleton className="mt-7 h-56 rounded-[24px]" /> : <ChartLine points={chartPoints} />}
      </GlassCard>

      <GlassCard className="p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-extrabold tracking-[-0.04em] text-white">Revenue Breakdown</h2>
          <Link href="/dashboard/owner/money?section=breakdown" className="inline-flex items-center gap-2 text-base font-extrabold text-[#A3FF12]">
            View details
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
        {isInitialLoading ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </div>
        ) : hasSplitData ? (
          <div className="mt-5 grid gap-0 overflow-hidden rounded-[22px] border border-white/8 sm:grid-cols-2 xl:grid-cols-4">
            {breakdownItems.map((item, index) => (
              <div key={item.label} className={cn("p-5", index > 0 && "border-white/8 sm:border-l")}>
                <div className="flex items-center gap-3">
                  <BreakdownDot tone={item.tone} />
                  <p className="text-base font-semibold text-white/72">{item.label}</p>
                </div>
                <p className="mt-5 text-2xl font-black tracking-[-0.035em] text-white">{item.amount === null ? "-" : currency(item.amount)}</p>
                <p className="mt-3 text-xl font-semibold text-white/62">{formatPercent(item.percent)}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyPanel
              title="Split breakdown unavailable."
              detail="Canonical split records will appear here once payments are processed."
            />
          </div>
        )}
      </GlassCard>

      <section className="grid grid-cols-4 overflow-hidden rounded-full border border-white/10 bg-white/[0.025] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        {rangeOptions.map((option, index) => (
          <button
            key={`segmented-${option.key}`}
            type="button"
            onClick={() => setSelectedRange(option.key)}
            className={cn(
              "min-h-12 rounded-full text-base font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70",
              selectedRange === option.key
                ? "bg-[linear-gradient(135deg,#A3FF12_0%,#7DCE00_100%)] text-black shadow-[0_0_28px_rgba(163,255,18,0.24)]"
                : "text-white/72 hover:bg-white/[0.035] hover:text-white",
              index > 0 && selectedRange !== option.key && "border-l border-white/8"
            )}
          >
            {option.shortLabel}
          </button>
        ))}
      </section>

      <GlassCard className="grid gap-0 overflow-hidden p-0 sm:grid-cols-2 xl:grid-cols-4">
        {isInitialLoading ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <PerformanceMetric
              icon={<CalendarDays className="h-5 w-5" />}
              label="Appointments"
              value={appointmentCount || "-"}
              trend={appointmentTrend}
              href={`/dashboard/owner/schedule?range=${selectedRange}`}
            />
            <PerformanceMetric
              icon={<CircleDollarSign className="h-5 w-5" />}
              label="Avg. Ticket Size"
              value={avgTicket === null ? "-" : currency(avgTicket)}
              href="/dashboard/owner/money?section=tickets"
            />
            <PerformanceMetric
              icon={<Users className="h-5 w-5" />}
              label="Returning Clients"
              value="-"
              href="/dashboard/owner/money?section=clients"
            />
            <PerformanceMetric
              icon={<XCircle className="h-5 w-5" />}
              label="No-Show Rate"
              value={noShowRate === null ? "-" : `${noShowRate.toFixed(1)}%`}
              href="/dashboard/owner/schedule?filter=no-shows"
            />
          </>
        )}
      </GlassCard>

      <section className="space-y-4" id="owner-money-transactions">
        <SectionHeader
          title="Recent Transactions"
          action={
            <Link href="/dashboard/owner/money?section=transactions" className="text-base font-extrabold text-[#A3FF12]">
              View all
            </Link>
          }
        />
        <GlassCard className="overflow-hidden p-0">
          {isInitialLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-20 rounded-[18px]" />
              <Skeleton className="h-20 rounded-[18px]" />
              <Skeleton className="h-20 rounded-[18px]" />
            </div>
          ) : transactions.length ? (
            transactions.map((transaction, index) => (
              <Link
                key={transaction.id}
                href={transaction.href}
                className={cn(
                  "grid gap-4 px-5 py-5 transition hover:bg-white/[0.03] md:grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.9fr)_minmax(7rem,0.45fr)_auto] md:items-center",
                  index > 0 && "border-t border-white/8"
                )}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar alt={transaction.name} initials={transaction.initials} className="h-16 w-16 border border-white/12" />
                  <div className="min-w-0">
                    <p className="truncate text-xl font-extrabold tracking-[-0.035em] text-white">{transaction.name}</p>
                    <p className="mt-1 truncate text-base font-medium text-white/64">{transaction.service}</p>
                    <p className="mt-1 text-sm font-semibold text-white/48">{transaction.source}</p>
                  </div>
                </div>
                <div className="text-sm font-semibold text-white/58">
                  <p>{transaction.timestamp}</p>
                  <p className="mt-2 inline-flex rounded-[9px] bg-white/[0.055] px-2 py-1 text-white/62">{transaction.method}</p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-xl font-black text-white">{currency(transaction.amount)}</p>
                  <p className={cn("mt-2 text-sm font-extrabold", statusClass(transaction.status))}>{statusLabel(transaction.status)}</p>
                </div>
                <ChevronRight className="hidden h-6 w-6 justify-self-end text-white/72 md:block" />
              </Link>
            ))
          ) : (
            <div className="p-6">
              <EmptyPanel
                title="No transactions yet."
                detail="Payments, tips, fees, refunds, and adjustments will appear here."
              />
            </div>
          )}
        </GlassCard>
      </section>

      <GlassCard className="p-6" id="owner-money-payouts">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-extrabold tracking-[-0.04em] text-white">Payout Status</h2>
          <Link href="/dashboard/owner/money?view=fintech&section=payouts" className="inline-flex items-center gap-2 text-base font-extrabold text-[#A3FF12]">
            View all payouts
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
        {isInitialLoading ? (
          <Skeleton className="mt-5 h-32 rounded-[24px]" />
        ) : (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">
            <div className="lg:border-r lg:border-white/10 lg:pr-6">
              <p className="text-base font-semibold text-white/62">Available Balance</p>
              <p className="mt-4 text-4xl font-black tracking-[-0.055em] text-[#A3FF12]">{currency(payoutReadyAmount)}</p>
            </div>
            <div className="lg:border-r lg:border-white/10 lg:pr-6">
              <p className="text-base font-semibold text-white/62">Next Payout</p>
              <p className="mt-4 text-2xl font-black text-white">{nextPayoutLabel}</p>
            </div>
            <div>
              <p className="text-base font-semibold text-white/62">Status</p>
              <p className={cn("mt-4 text-2xl font-black", payoutStatus.tone === "green" ? "text-[#A3FF12]" : "text-amber-300")}>{payoutStatus.label}</p>
            </div>
            <Link
              href={payoutStatus.href}
              className="inline-flex min-h-16 items-center justify-center gap-3 rounded-[18px] border border-[#A3FF12]/44 bg-black/25 px-6 text-base font-black text-[#A3FF12] transition hover:-translate-y-0.5 hover:bg-[#A3FF12]/10"
            >
              <Building2 className="h-5 w-5" />
              {payoutStatus.detail}
            </Link>
          </div>
        )}
      </GlassCard>

      <section className="grid gap-4 md:grid-cols-2">
        <GlassCard className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Platform-collected revenue</p>
          <p className="mt-3 text-sm leading-6 text-white/58">
            Card/app payments flow through BVRB3R records. Cash collected outside the platform should stay separate from payout readiness.
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Shop split readiness</p>
          <p className="mt-3 text-sm leading-6 text-white/58">
            Commission and shop-owner payout release are future phases. This view shows honest readiness without moving money.
          </p>
        </GlassCard>
      </section>
    </div>
  );
}
