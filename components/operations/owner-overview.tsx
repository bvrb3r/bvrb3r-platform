"use client";

import { useMemo, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Info,
  Rocket,
  SlidersHorizontal,
  TrendingUp,
  UserPlus,
  Users
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/design/components";
import { useFinancialAnomalyQueueQuery, useFintechManagementQuery } from "@/lib/fintech/client";
import { useShopDashboardQuery, type ShopDashboardAppointment } from "@/lib/operations/barber-client";
import { sortOwnerDashboardAppointments } from "@/lib/operations/metrics";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type OwnerAlert = {
  title: string;
  subtitle: string;
  timestamp: string;
  href: ComponentProps<typeof Link>["href"];
  tone: "warning" | "opportunity" | "danger";
};

type TeamSnapshotCard = {
  id: string;
  name: string;
  initials: string;
  revenue: number;
  bookings: number;
  utilization: number;
  active: boolean;
};

const timeframeOptions = ["Today", "This Week", "This Month"];

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase())
    .join("") || "BV";
}

function getBarberFirstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

function getCompletedAppointmentRevenue(appointment: ShopDashboardAppointment) {
  if (appointment.status !== "completed") {
    return 0;
  }

  return appointment.totalAmount + appointment.tipAmount;
}

function getPeakTimeLabel(appointments: ShopDashboardAppointment[]) {
  if (appointments.length < 2) {
    return null;
  }

  const hourCounts = new Map<number, number>();
  for (const appointment of appointments) {
    const hour = new Date(appointment.start).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  const peak = [...hourCounts.entries()].sort((left, right) => right[1] - left[1])[0];
  if (!peak || peak[1] < 2) {
    return null;
  }

  const [hour] = peak;
  const start = new Date();
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start);
  end.setHours(hour + 1);

  return `${new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(start)} - ${new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(end)}`;
}

function getUtilizationTone(value: number | null) {
  if (value === null) {
    return "No schedule data";
  }

  if (value >= 70) {
    return "Great";
  }

  if (value >= 40) {
    return "Okay";
  }

  return "Low";
}

function CommandIconButton({
  href,
  label,
  children,
  badge
}: {
  href: ComponentProps<typeof Link>["href"];
  label: string;
  children: ReactNode;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#A3FF12]/35 hover:text-white hover:shadow-[0_0_24px_rgba(163,255,18,0.12)] sm:h-14 sm:w-14"
    >
      {children}
      {badge && badge > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#A3FF12] px-2 text-xs font-black text-black shadow-[0_0_14px_rgba(163,255,18,0.45)]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function SectionHeader({
  title,
  action,
  id
}: {
  title: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="flex items-center justify-between gap-4">
      <h2 className="text-2xl font-extrabold tracking-[-0.04em] text-white">{title}</h2>
      {action}
    </div>
  );
}

function UtilizationCard({
  icon,
  value,
  label,
  detail,
  href,
  tone = "green"
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  detail: ReactNode;
  href: ComponentProps<typeof Link>["href"];
  tone?: "green" | "amber" | "neutral";
}) {
  return (
    <Link
      href={href}
      className="group rounded-[22px] border border-white/9 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.045)] transition hover:-translate-y-0.5 hover:border-[#A3FF12]/30"
    >
      <div
        className={cn(
          "mb-7 inline-flex h-11 w-11 items-center justify-center rounded-[14px] border shadow-[0_0_20px_rgba(163,255,18,0.16)]",
          tone === "green" && "border-[#A3FF12]/25 bg-[#A3FF12]/12 text-[#A3FF12]",
          tone === "amber" && "border-amber-300/25 bg-amber-300/10 text-amber-300",
          tone === "neutral" && "border-white/12 bg-white/[0.04] text-white/74"
        )}
      >
        {icon}
      </div>
      <p className="text-3xl font-black tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-2 text-lg font-semibold text-white/78">{label}</p>
      <p className={cn("mt-3 text-base font-extrabold", tone === "amber" ? "text-amber-300" : tone === "neutral" ? "text-white/52" : "text-[#A3FF12]")}>
        {detail}
      </p>
    </Link>
  );
}

function LoadingCard() {
  return (
    <GlassCard className="p-5">
      <Skeleton className="h-9 w-9 rounded-full" />
      <Skeleton className="mt-7 h-8 w-24" />
      <Skeleton className="mt-3 h-4 w-32" />
    </GlassCard>
  );
}

export function OwnerOverview() {
  const shopQuery = useShopDashboardQuery();
  const fintechQuery = useFintechManagementQuery();
  const anomalyQuery = useFinancialAnomalyQueueQuery();

  const ownerAnalytics = useMemo(() => shopQuery.data?.ownerAnalytics ?? [], [shopQuery.data?.ownerAnalytics]);
  const appointments = useMemo(() => shopQuery.data?.appointments ?? [], [shopQuery.data?.appointments]);
  const walkIns = useMemo(() => shopQuery.data?.walkIns ?? [], [shopQuery.data?.walkIns]);
  const barbers = useMemo(() => shopQuery.data?.barbers ?? [], [shopQuery.data?.barbers]);
  const activeBarbers = useMemo(() => shopQuery.data?.activeBarbers ?? [], [shopQuery.data?.activeBarbers]);
  const summary = shopQuery.data?.summary;
  const businessDate = summary?.businessDate ?? summary?.latestDate ?? new Date().toISOString().slice(0, 10);
  const todayAppointments = useMemo(
    () => sortOwnerDashboardAppointments(appointments, businessDate),
    [appointments, businessDate]
  );
  const hasOwnerActivity = Boolean(appointments.length || walkIns.length || ownerAnalytics.length || barbers.length);
  const isInitialLoading = shopQuery.isLoading && !shopQuery.data;
  const errorMessage = shopQuery.error ? getReadableActionError(shopQuery.error) : null;

  const todayRevenue = summary?.revenueToday ?? 0;
  const openChairCount = barbers.filter((barber) => barber.activeAppointmentCount === 0).length;
  const chairsUsedPercent = barbers.length ? Math.round((activeBarbers.length / barbers.length) * 100) : null;
  const peakTime = getPeakTimeLabel(todayAppointments);
  const readyForCheckoutCount = summary?.readyForCheckoutCount ?? todayAppointments.filter((appointment) => appointment.status === "completed" && appointment.balanceDue > 0).length;
  const anomalyCount = (anomalyQuery.data?.items ?? []).filter((item) => item.status === "open" || item.status === "investigating").length;
  const payoutAttentionCount = (fintechQuery.data?.summary.needsAttentionAccounts ?? 0) + (fintechQuery.data?.summary.blockedRoutingRecords ?? 0);
  const alertCount = anomalyCount + payoutAttentionCount + readyForCheckoutCount + (openChairCount > 0 && hasOwnerActivity ? 1 : 0);

  const teamSnapshot = useMemo<TeamSnapshotCard[]>(() => {
    return barbers.slice(0, 8).map((barber) => {
      const barberAppointments = todayAppointments.filter((appointment) => appointment.barberId === barber.id);
      const revenue = barberAppointments.reduce((total, appointment) => total + getCompletedAppointmentRevenue(appointment), 0);
      const bookings = barber.bookedCount || barberAppointments.length;

      return {
        id: barber.id,
        name: getBarberFirstName(barber.name),
        initials: getInitials(barber.name),
        revenue,
        bookings,
        utilization: barber.utilization,
        active: activeBarbers.some((activeBarber) => activeBarber.id === barber.id) || barber.activeAppointmentCount > 0
      };
    });
  }, [activeBarbers, barbers, todayAppointments]);

  const alerts = useMemo<OwnerAlert[]>(() => {
    if (!hasOwnerActivity) {
      return [];
    }

    const items: OwnerAlert[] = [];

    if (anomalyCount > 0) {
      items.push({
        title: `${anomalyCount} financial anomal${anomalyCount === 1 ? "y" : "ies"} need review.`,
        subtitle: "Inspect the anomaly queue.",
        timestamp: "Now",
        href: "/dashboard/owner/money?section=anomalies",
        tone: "danger"
      });
    }

    if (payoutAttentionCount > 0) {
      items.push({
        title: `${payoutAttentionCount} payout or verification item${payoutAttentionCount === 1 ? "" : "s"} need review.`,
        subtitle: "Open money readiness.",
        timestamp: "Now",
        href: "/dashboard/owner/money?section=payouts",
        tone: "danger"
      });
    }

    if (readyForCheckoutCount > 0) {
      items.push({
        title: `${readyForCheckoutCount} completed ticket${readyForCheckoutCount === 1 ? "" : "s"} need checkout handoff.`,
        subtitle: "Close payment loops before the day ends.",
        timestamp: "Now",
        href: "/dashboard/owner/money?section=transactions",
        tone: "warning"
      });
    }

    if (openChairCount > 0) {
      items.push({
        title: `${openChairCount} chair${openChairCount === 1 ? "" : "s"} idle right now.`,
        subtitle: "Review open capacity on the schedule.",
        timestamp: "Now",
        href: "/dashboard/owner/schedule?filter=idle",
        tone: "warning"
      });
    }

    if (peakTime) {
      items.push({
        title: "Demand is clustering today.",
        subtitle: peakTime,
        timestamp: "Today",
        href: "/dashboard/owner/schedule?range=peak",
        tone: "opportunity"
      });
    }

    return items.slice(0, 3);
  }, [anomalyCount, hasOwnerActivity, openChairCount, payoutAttentionCount, peakTime, readyForCheckoutCount]);

  return (
    <div className="space-y-8" data-testid="owner-overview">
      <header className="flex items-start justify-between gap-5">
        <div>
          <h1 className="text-5xl font-black leading-none tracking-[-0.055em] text-white sm:text-6xl" data-display="true">
            Home
          </h1>
          <p className="mt-3 text-lg font-medium text-white/68">Shop health, team movement, and next actions.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <CommandIconButton href="#owner-alerts" label="Open owner alerts" badge={alertCount}>
            <Bell className="h-5 w-5" />
          </CommandIconButton>
          <details className="group relative">
            <summary className="inline-flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#A3FF12]/35 hover:text-white hover:shadow-[0_0_24px_rgba(163,255,18,0.12)] sm:h-14 sm:w-14" aria-label="Open overview filters">
              <SlidersHorizontal className="h-5 w-5" />
            </summary>
            <GlassCard className="absolute right-0 z-20 mt-3 w-56 p-3">
              <p className="px-3 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#A3FF12]">Timeframe</p>
              {timeframeOptions.map((option) => (
                <Link
                  key={option}
                  href={`/dashboard/owner?range=${option.toLowerCase().replaceAll(" ", "-")}`}
                  className="flex items-center justify-between rounded-[14px] px-3 py-3 text-sm font-bold text-white/74 transition hover:bg-white/[0.05] hover:text-white"
                >
                  {option}
                  {option === "Today" ? <span className="h-2 w-2 rounded-full bg-[#A3FF12]" /> : null}
                </Link>
              ))}
            </GlassCard>
          </details>
        </div>
      </header>

      {errorMessage ? (
        <GlassCard className="border-red-400/20 bg-red-500/8 p-5 text-sm font-semibold text-red-100">
          {errorMessage}
        </GlassCard>
      ) : null}

      <GlassCard className="border-[#A3FF12]/14 bg-[linear-gradient(135deg,rgba(163,255,18,0.08),rgba(8,8,8,0.92)_48%,rgba(0,0,0,0.96))] p-6 sm:p-7">
        <div className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr] xl:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#A3FF12]">Business command center</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.055em] text-white sm:text-4xl" data-display="true">
              Run the shop from health, capacity, and money signals.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
              Owner Home stays focused on what needs action today: revenue, team coverage, open chair time, and payment setup gaps.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/dashboard/owner/team" className="rounded-[22px] border border-white/8 bg-black/25 p-4 transition hover:border-[#A3FF12]/28">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Team</p>
              <p className="mt-3 text-2xl font-black text-white">{barbers.length}</p>
              <p className="mt-2 text-sm leading-6 text-white/56">Connected barbers</p>
            </Link>
            <Link href="/dashboard/owner/schedule" className="rounded-[22px] border border-white/8 bg-black/25 p-4 transition hover:border-[#A3FF12]/28">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Capacity</p>
              <p className="mt-3 text-2xl font-black text-white">{chairsUsedPercent === null ? "-" : `${chairsUsedPercent}%`}</p>
              <p className="mt-2 text-sm leading-6 text-white/56">Chairs in motion</p>
            </Link>
            <Link href="/dashboard/owner/money" className="rounded-[22px] border border-white/8 bg-black/25 p-4 transition hover:border-[#A3FF12]/28">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Money alerts</p>
              <p className={cn("mt-3 text-2xl font-black", alertCount ? "text-amber-300" : "text-[#A3FF12]")}>{alertCount}</p>
              <p className="mt-2 text-sm leading-6 text-white/56">{alertCount ? "Needs review" : "Clear"}</p>
            </Link>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.85fr] lg:items-stretch">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-extrabold tracking-[-0.04em] text-white">Today Revenue</h2>
              <details className="relative">
                <summary className="inline-flex cursor-pointer list-none items-center justify-center rounded-full text-white/42 transition hover:text-[#A3FF12]" aria-label="Explain today revenue">
                  <Info className="h-5 w-5" />
                </summary>
                <div className="absolute left-0 z-10 mt-3 w-80 rounded-[18px] border border-white/10 bg-[#090909] p-4 text-sm leading-6 text-white/68 shadow-[0_18px_50px_rgba(0,0,0,0.5)]">
                  Today Revenue includes completed/captured payments for this shop during the selected time range. Splits are based on canonical payment records.
                </div>
              </details>
            </div>

            {isInitialLoading ? (
              <Skeleton className="mt-7 h-16 w-72" />
            ) : (
              <p className="mt-7 text-6xl font-black leading-none tracking-[-0.08em] text-[#A3FF12] drop-shadow-[0_0_28px_rgba(163,255,18,0.26)] sm:text-7xl" data-display="true">
                {currency(todayRevenue)}
              </p>
            )}

            <div className="mt-7 space-y-2 text-lg font-semibold text-white/68">
              <p>Projected unavailable</p>
              <p>Goal unavailable</p>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-0 rounded-full bg-[#A3FF12]" />
            </div>
          </div>

          <div className="border-white/10 lg:border-l lg:pl-9">
            <details className="relative ml-auto w-fit">
              <summary className="inline-flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-[18px] border border-white/12 bg-black/30 px-5 text-lg font-extrabold text-white transition hover:border-[#A3FF12]/28">
                Today
                <ChevronDown className="h-5 w-5" />
              </summary>
              <GlassCard className="absolute right-0 z-10 mt-3 w-48 p-3">
                {timeframeOptions.map((option) => (
                  <Link
                    key={`revenue-${option}`}
                    href={`/dashboard/owner?range=${option.toLowerCase().replaceAll(" ", "-")}`}
                    className="block rounded-[14px] px-3 py-3 text-sm font-bold text-white/74 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    {option}
                  </Link>
                ))}
              </GlassCard>
            </details>
            <dl className="mt-7 space-y-7">
              <div>
                <dt className="text-lg font-semibold text-white/58">Shop Share</dt>
                <dd className="mt-2 text-xl font-black text-white/52">Unavailable</dd>
              </div>
              <div>
                <dt className="text-lg font-semibold text-white/58">Barber Earnings</dt>
                <dd className="mt-2 text-xl font-black text-white/52">Unavailable</dd>
              </div>
              <div>
                <dt className="text-lg font-semibold text-white/58">Platform Fee</dt>
                <dd className="mt-2 text-xl font-black text-white/52">Unavailable</dd>
              </div>
            </dl>
          </div>
        </div>
      </GlassCard>

      <section className="space-y-5">
        <SectionHeader
          title="Utilization"
          action={
            <Link href="/dashboard/owner/schedule" className="inline-flex items-center gap-2 text-lg font-extrabold text-[#A3FF12]">
              Today
              <ChevronDown className="h-5 w-5" />
            </Link>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isInitialLoading ? (
            <>
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </>
          ) : (
            <>
              <UtilizationCard
                icon={<CalendarDays className="h-5 w-5" />}
                value={chairsUsedPercent === null ? "--" : `${chairsUsedPercent}%`}
                label="Chairs Used"
                detail={getUtilizationTone(chairsUsedPercent)}
                href="/dashboard/owner/schedule?filter=utilization"
                tone={chairsUsedPercent === null ? "neutral" : chairsUsedPercent < 40 ? "amber" : "green"}
              />
              <UtilizationCard
                icon={<Clock3 className="h-5 w-5" />}
                value={openChairCount}
                label="Open Slots"
                detail="Today"
                href="/dashboard/owner/schedule?view=open-slots"
                tone={openChairCount > 0 ? "amber" : "green"}
              />
              <UtilizationCard
                icon={<TrendingUp className="h-5 w-5" />}
                value={peakTime ?? "--"}
                label="Peak Time"
                detail={peakTime ? "Today" : "Not enough data"}
                href="/dashboard/owner/schedule?range=peak"
                tone={peakTime ? "green" : "neutral"}
              />
              <UtilizationCard
                icon={<Users className="h-5 w-5" />}
                value={openChairCount}
                label="Idle Chairs"
                detail={openChairCount > 0 ? "Now" : "Clear"}
                href="/dashboard/owner/schedule?filter=idle"
                tone={openChairCount > 0 ? "amber" : "green"}
              />
            </>
          )}
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader
          title="Team Snapshot"
          action={
            <Link href="/dashboard/owner/team" className="inline-flex items-center gap-2 text-lg font-extrabold text-[#A3FF12]">
              View all
              <ChevronRight className="h-5 w-5" />
            </Link>
          }
        />
        {isInitialLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <LoadingCard />
            <LoadingCard />
            <LoadingCard />
            <LoadingCard />
            <LoadingCard />
          </div>
        ) : teamSnapshot.length ? (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {teamSnapshot.map((barber) => (
              <Link
                key={barber.id}
                href={`/dashboard/owner/team?barber=${encodeURIComponent(barber.id)}`}
                className="min-w-[9.25rem] rounded-[22px] border border-white/9 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-4 text-center shadow-[0_14px_42px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:-translate-y-0.5 hover:border-[#A3FF12]/30"
              >
                <div className="relative mx-auto h-20 w-20">
                  <div className={cn("flex h-20 w-20 items-center justify-center rounded-full border bg-[#111] text-xl font-black text-white shadow-[0_0_18px_rgba(163,255,18,0.12)]", barber.active ? "border-[#A3FF12]/70" : "border-white/14")}>
                    {barber.initials}
                  </div>
                  {barber.active ? (
                    <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-black bg-[#A3FF12] shadow-[0_0_12px_rgba(163,255,18,0.45)]" />
                  ) : null}
                </div>
                <p className="mt-4 text-xl font-black tracking-[-0.04em] text-white">{barber.name}</p>
                <p className="mt-2 text-2xl font-black text-white">{currency(barber.revenue)}</p>
                <p className="text-sm font-semibold text-white/58">Revenue</p>
                <p className="mt-3 text-xl font-extrabold text-white">{barber.bookings}</p>
                <p className="text-sm font-semibold text-white/58">Bookings</p>
                <p className="mt-3 text-xl font-extrabold text-white">{barber.utilization}%</p>
                <p className="text-sm font-semibold text-white/58">Utilization</p>
              </Link>
            ))}
          </div>
        ) : (
          <GlassCard className="p-6">
            <p className="text-xl font-extrabold text-white">No active team members yet.</p>
            <p className="mt-2 text-sm text-white/58">Invite barbers to start tracking performance.</p>
            <Link href="/dashboard/owner/team" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-[#A3FF12]/40 px-5 text-sm font-extrabold text-[#A3FF12] transition hover:bg-[#A3FF12]/10">
              Invite Barber
            </Link>
          </GlassCard>
        )}
      </section>

      <section className="space-y-5">
        <SectionHeader
          id="owner-alerts"
          title="Alerts & Opportunities"
          action={
            <Link href="#owner-alerts" className="text-lg font-extrabold text-[#A3FF12]">
              View all alerts
            </Link>
          }
        />
        <GlassCard className="overflow-hidden p-0">
          {isInitialLoading ? (
            <div className="p-5">
              <Skeleton className="h-20 w-full" />
            </div>
          ) : alerts.length ? (
            alerts.map((alert, index) => (
              <Link
                key={`${alert.title}-${alert.href}`}
                href={alert.href}
                className={cn(
                  "grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-5 transition hover:bg-white/[0.03]",
                  index > 0 && "border-t border-white/8"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-12 w-12 items-center justify-center rounded-[16px] border",
                    alert.tone === "warning" && "border-amber-300/25 bg-amber-300/10 text-amber-300",
                    alert.tone === "opportunity" && "border-[#A3FF12]/25 bg-[#A3FF12]/10 text-[#A3FF12]",
                    alert.tone === "danger" && "border-red-400/25 bg-red-500/10 text-red-300"
                  )}
                >
                  {alert.tone === "opportunity" ? <TrendingUp className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                </span>
                <span>
                  <span className="block text-lg font-extrabold text-white">{alert.title}</span>
                  <span className="mt-1 block text-base font-medium text-white/58">{alert.subtitle}</span>
                </span>
                <span className="hidden text-base font-semibold text-white/52 sm:block">{alert.timestamp}</span>
                <ChevronRight className="h-5 w-5 text-white/60" />
              </Link>
            ))
          ) : (
            <div className="p-6">
              <p className="text-xl font-extrabold text-white">No urgent alerts right now.</p>
              <p className="mt-2 text-sm text-white/58">Your shop is operating normally.</p>
            </div>
          )}
        </GlassCard>
      </section>

      <section className="space-y-5 pb-4">
        <SectionHeader title="Quick Actions" />
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/dashboard/owner/schedule?action=assign-walkin" className="inline-flex min-h-16 items-center justify-center gap-3 rounded-[20px] border border-[#A3FF12]/40 bg-black/25 px-5 text-lg font-extrabold text-[#A3FF12] transition hover:-translate-y-0.5 hover:bg-[#A3FF12]/10">
            <UserPlus className="h-5 w-5" />
            Assign Walk-in
          </Link>
          <Link href="/dashboard/owner/schedule?filter=open-slots" className="inline-flex min-h-16 items-center justify-center gap-3 rounded-[20px] border border-[#A3FF12]/40 bg-black/25 px-5 text-lg font-extrabold text-[#A3FF12] transition hover:-translate-y-0.5 hover:bg-[#A3FF12]/10">
            <Rocket className="h-5 w-5" />
            Boost Availability
          </Link>
          <Link href="/dashboard/owner/schedule" className="inline-flex min-h-16 items-center justify-center gap-3 rounded-[20px] border border-[#A3FF12]/40 bg-black/25 px-5 text-lg font-extrabold text-[#A3FF12] transition hover:-translate-y-0.5 hover:bg-[#A3FF12]/10">
            <CalendarDays className="h-5 w-5" />
            View Full Schedule
          </Link>
        </div>
      </section>
    </div>
  );
}
