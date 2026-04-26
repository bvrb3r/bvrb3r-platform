"use client";

import { useMemo, type ComponentProps } from "react";
import Link from "next/link";
import { Activity, Building2, CircleDollarSign, ReceiptText, ShieldCheck } from "lucide-react";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { DataStatCard } from "@/design/components";
import { ShopManagerPanel } from "@/components/operations/shop-manager-panel";
import { useFinancialAnomalyQueueQuery, useFintechManagementQuery } from "@/lib/fintech/client";
import { useShopDashboardQuery, type ShopDashboardAppointment } from "@/lib/operations/barber-client";
import { buildOwnerRevenueSeriesFromAnalytics, sortOwnerDashboardAppointments } from "@/lib/operations/metrics";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

function MetricSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-20" />
      <Skeleton className="mt-4 h-4 w-32" />
    </div>
  );
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatActivityTimestamp(iso: string) {
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

function getAppointmentDetail(appointment: ShopDashboardAppointment) {
  if (appointment.status === "cancelled") {
    return "Ticket cancelled before service began.";
  }

  if (appointment.status === "completed" && appointment.balanceDue > 0) {
    return `${currency(appointment.balanceDue)} still open on this ticket.`;
  }

  if (appointment.status === "completed") {
    return "Paid and closed cleanly.";
  }

  return `${appointment.display.statusLabel} at ${appointment.display.locationName}.`;
}

function getTopProducingBarber(appointments: ShopDashboardAppointment[]) {
  const totals = new Map<string, { barberName: string; revenue: number; completedCount: number }>();

  for (const appointment of appointments) {
    if (appointment.status !== "completed") {
      continue;
    }

    const current = totals.get(appointment.barberId) ?? {
      barberName: appointment.display.barberName,
      revenue: 0,
      completedCount: 0
    };
    current.revenue += appointment.totalAmount + appointment.tipAmount;
    current.completedCount += 1;
    totals.set(appointment.barberId, current);
  }

  return [...totals.entries()]
    .map(([barberId, value]) => ({
      barberId,
      barberName: value.barberName,
      revenue: value.revenue,
      completedCount: value.completedCount
    }))
    .sort((left, right) => right.revenue - left.revenue)[0] ?? null;
}

const ownerSetupCards: Array<{
  title: string;
  detail: string;
  href: ComponentProps<typeof Link>["href"];
}> = [
  {
    title: "Complete shop profile",
    detail: "Add address, hours, photos, and the details clients need before booking.",
    href: "/dashboard/owner/settings"
  },
  {
    title: "Add first barber",
    detail: "Invite or create the first team member before opening the floor.",
    href: "/dashboard/owner/team"
  },
  {
    title: "Set services",
    detail: "Create the service menu, durations, pricing, deposits, and add-ons.",
    href: "/dashboard/owner/settings?section=services"
  },
  {
    title: "Connect payouts",
    detail: "Finish money readiness before live bookings and settlement.",
    href: "/dashboard/owner/settings"
  },
  {
    title: "Open booking",
    detail: "Review approval and activation status before your shop goes public.",
    href: "/activation-status"
  }
];

export function OwnerOverview() {
  const shopQuery = useShopDashboardQuery();
  const fintechQuery = useFintechManagementQuery();
  const anomalyQuery = useFinancialAnomalyQueueQuery();

  const ownerAnalytics = useMemo(() => shopQuery.data?.ownerAnalytics ?? [], [shopQuery.data?.ownerAnalytics]);
  const workflowEvents = shopQuery.data?.workflowEvents ?? [];
  const appointments = useMemo(() => shopQuery.data?.appointments ?? [], [shopQuery.data?.appointments]);
  const walkIns = useMemo(() => shopQuery.data?.walkIns ?? [], [shopQuery.data?.walkIns]);
  const barbers = shopQuery.data?.barbers ?? [];
  const activeBarbers = shopQuery.data?.activeBarbers ?? [];
  const summary = shopQuery.data?.summary;
  const businessDate = summary?.businessDate ?? summary?.latestDate ?? new Date().toISOString().slice(0, 10);
  const todayAppointments = useMemo(
    () => sortOwnerDashboardAppointments(appointments, businessDate),
    [appointments, businessDate]
  );
  const series = ownerAnalytics.length ? buildOwnerRevenueSeriesFromAnalytics(ownerAnalytics) : [];
  const bookedCount = summary?.bookedToday ?? todayAppointments.filter((appointment) => appointment.status === "confirmed" || appointment.status === "booked").length;
  const completedCount = summary?.completedServicesToday ?? summary?.completedCount ?? todayAppointments.filter((appointment) => appointment.status === "completed").length;
  const checkedInCount = summary?.checkedInCount ?? todayAppointments.filter((appointment) => appointment.status === "checked_in").length;
  const inMotionCount = todayAppointments.filter((appointment) => ["confirmed", "booked", "checked_in", "in_service"].includes(appointment.status)).length;
  const openChairCount = barbers.filter((barber) => barber.activeAppointmentCount === 0).length;
  const averageTicket = completedCount ? (summary?.revenueToday ?? 0) / Math.max(completedCount, 1) : 0;
  const hasOwnerActivity = Boolean(
    appointments.length
    || walkIns.length
    || ownerAnalytics.length
    || workflowEvents.length
  );
  const visibleSetupCards = barbers.length
    ? ownerSetupCards.filter((card) => card.title !== "Add first barber")
    : ownerSetupCards;
  const topProducer = useMemo(() => getTopProducingBarber(todayAppointments), [todayAppointments]);

  const quickInsights = useMemo(() => {
    if (!ownerAnalytics.length && !appointments.length && !barbers.length) {
      return [];
    }

    const sortedAnalytics = [...ownerAnalytics].sort((left, right) => left.businessDate.localeCompare(right.businessDate));
    const latest = sortedAnalytics.at(-1);
    const previous = sortedAnalytics.at(-2);
    const revenueDelta = latest && previous ? latest.revenueTotal - previous.revenueTotal : null;

    return [
      revenueDelta === null
        ? "Day-over-day revenue movement appears after two business snapshots are available."
        : `${revenueDelta >= 0 ? "Up" : "Down"} ${currency(Math.abs(revenueDelta))} versus the previous business date.`,
      topProducer
        ? `${topProducer.barberName} is leading posted revenue at ${currency(topProducer.revenue)} across ${topProducer.completedCount} completed tickets.`
        : "Top-producing barber signal appears as completed tickets settle.",
      walkIns.length
        ? `${walkIns.length} walk-in${walkIns.length === 1 ? "" : "s"} are still waiting while ${openChairCount} chair${openChairCount === 1 ? "" : "s"} look open.`
        : openChairCount
          ? `${openChairCount} chair${openChairCount === 1 ? "" : "s"} look open right now, which is usable same-day capacity.`
          : "Every in-scope chair is already carrying active demand."
    ];
  }, [appointments.length, barbers.length, openChairCount, ownerAnalytics, topProducer, walkIns.length]);

  const alerts = useMemo(() => {
    const anomalyCount = (anomalyQuery.data?.items ?? []).filter((item) => item.status === "open" || item.status === "investigating").length;
    const needsAttentionAccounts = fintechQuery.data?.summary.needsAttentionAccounts ?? 0;
    const blockedRouting = fintechQuery.data?.summary.blockedRoutingRecords ?? 0;
    const readyForCheckoutCount = summary?.readyForCheckoutCount ?? todayAppointments.filter((appointment) => appointment.status === "completed" && appointment.balanceDue > 0).length;

    if (!hasOwnerActivity) {
      return [];
    }

    return [
      anomalyCount
        ? `${anomalyCount} unresolved financial anomaly${anomalyCount === 1 ? "" : "ies"} need review.`
        : "No unresolved financial anomalies are open right now.",
      needsAttentionAccounts
        ? `${needsAttentionAccounts} connected account${needsAttentionAccounts === 1 ? "" : "s"} still need payout or verification attention.`
        : blockedRouting
          ? `${blockedRouting} routing record${blockedRouting === 1 ? "" : "s"} are blocked and need owner review.`
          : "Connected-account readiness is clear across the current scope.",
      readyForCheckoutCount
        ? `${readyForCheckoutCount} completed ticket${readyForCheckoutCount === 1 ? "" : "s"} still need checkout handoff.`
        : (summary?.outstandingBalance ?? 0) > 0
          ? `${currency(summary?.outstandingBalance ?? 0)} is still open across in-flight tickets.`
          : "No checkout or open-balance exceptions are waiting right now."
    ];
  }, [anomalyQuery.data?.items, fintechQuery.data?.summary.blockedRoutingRecords, fintechQuery.data?.summary.needsAttentionAccounts, hasOwnerActivity, summary?.outstandingBalance, summary?.readyForCheckoutCount, todayAppointments]);

  const isInitialLoading = shopQuery.isLoading && !shopQuery.data;
  const errorMessage = shopQuery.error ? getReadableActionError(shopQuery.error) : null;

  return (
    <div className="space-y-4" data-testid="owner-overview">
      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Today snapshot</p>
              {isInitialLoading ? (
                <Skeleton className="mt-3 h-14 w-48" />
              ) : (
                <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">
                  {currency(summary?.revenueToday ?? 0)}
                </h3>
              )}
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">
                Posted revenue, active chairs, open capacity, and the next owner action.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/68">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-[#d7ffab]">
                <ShieldCheck className="h-4 w-4" />
                Canonical shop signal
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">Business date {businessDate}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/dashboard/owner/money"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(124,255,0,0.32)] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
            >
              Open money
            </Link>
            <Link
              href="/dashboard/owner/schedule"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(31,31,31,0.96),rgba(11,11,11,0.98))] px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7cff00]/30 hover:bg-[linear-gradient(180deg,rgba(34,34,34,0.96),rgba(14,14,14,0.98))] hover:text-[#d8ff9f] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
            >
              Open schedule
            </Link>
            <Link
              href="/dashboard/owner/team"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(31,31,31,0.96),rgba(11,11,11,0.98))] px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7cff00]/30 hover:bg-[linear-gradient(180deg,rgba(34,34,34,0.96),rgba(14,14,14,0.98))] hover:text-[#d8ff9f] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
            >
              Open team
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : (
              <>
                <DataStatCard
                  label="Revenue today"
                  value={currency(summary?.revenueToday ?? 0)}
                  detail="Live posted revenue in owner scope."
                  className="border-[#A3FF12]/20 bg-[#A3FF12]/[0.06]"
                />
                <DataStatCard
                  label="Appointments completed"
                  value={completedCount}
                  detail={`Paid tickets ${summary?.paidAppointmentsToday ?? 0}`}
                />
                <DataStatCard
                  label="Active barbers"
                  value={activeBarbers.length}
                  detail={activeBarbers.slice(0, 2).map((entry) => entry.name).join(", ") || "No chair activity yet"}
                />
                <DataStatCard
                  label="Average ticket"
                  value={currency(averageTicket)}
                  detail="Average completed ticket today."
                />
              </>
            )}
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          {isInitialLoading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              <Card className="rounded-[32px] p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="surface-label">Floor in motion</p>
                    <p className="mt-3 text-3xl font-semibold" data-display="true">{inMotionCount}</p>
                    <p className="mt-2 text-sm leading-6 text-white/60">Booked, checked-in, and in-service tickets moving through the floor.</p>
                  </div>
                  <Activity className="h-5 w-5 text-[#baff69]" />
                </div>
              </Card>
              <Card className="rounded-[32px] p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="surface-label">Checked in and ready</p>
                    <p className="mt-3 text-3xl font-semibold" data-display="true">{checkedInCount}</p>
                    <p className="mt-2 text-sm leading-6 text-white/60">Clients in the shop and waiting for service.</p>
                  </div>
                  <ReceiptText className="h-5 w-5 text-[#baff69]" />
                </div>
              </Card>
              <Card className="rounded-[32px] p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="surface-label">Open chairs now</p>
                    <p className="mt-3 text-3xl font-semibold" data-display="true">{openChairCount}</p>
                    <p className="mt-2 text-sm leading-6 text-white/60">Same-day capacity the owner can fill.</p>
                  </div>
                  <CircleDollarSign className="h-5 w-5 text-[#d7ffab]" />
                </div>
              </Card>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isInitialLoading ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Paid appointments" value={String(summary?.paidAppointmentsToday ?? 0)} detail="Payments captured from completed services" />
            <StatCard label="Balance still open" value={currency(summary?.outstandingBalance ?? 0)} detail={`${bookedCount} booked appointments still in motion`} />
            <StatCard label="Queue average" value={`${summary?.queueAverageMinutes ?? 0} min`} detail={`${walkIns.length} walk-ins waiting on assignment`} />
            <StatCard label="Open chairs" value={String(openChairCount)} detail="Current barbers without live service pressure" />
          </>
        )}
      </section>

      {!isInitialLoading && !hasOwnerActivity ? (
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Fresh owner setup</p>
              <h3 className="mt-3 text-2xl font-semibold">Your shop is clean. Build the first real signals from here.</h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
                Metrics, queue entries, clients, barbers, and revenue stay at zero until this owner-linked shop creates real activity.
              </p>
            </div>
            <span className="status-pill text-[#d7ffab]">No demo activity</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {visibleSetupCards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm transition hover:border-[#7cff00]/25 hover:bg-black/30"
              >
                <p className="font-semibold text-white">{card.title}</p>
                <p className="mt-2 leading-6 text-white/58">{card.detail}</p>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <ShopManagerPanel />

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Quick insights</p>
              <p className="mt-2 text-sm text-white/58">A short owner read on revenue movement, chair capacity, and which barber is actually producing.</p>
            </div>
            <span className="status-pill text-[#d7ffab]">Shop dashboard live</span>
          </div>
          <div className="mt-6">
            {isInitialLoading ? (
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-6">
                <Skeleton className="h-44 w-full rounded-[24px]" />
              </div>
            ) : quickInsights.length ? (
              <div className="grid gap-3">
                {quickInsights.map((insight) => (
                  <div key={insight} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-7 text-white/68">
                    {insight}
                  </div>
                ))}
                {series.length ? (
                  <div className="overflow-hidden rounded-[24px] border border-white/8 bg-black/20 p-3">
                    <RevenueChart data={series} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
                Insights will appear here as more owner snapshots accumulate.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Live shop activity</p>
            <Building2 className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><Skeleton className="h-24 w-full" /></div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><Skeleton className="h-24 w-full" /></div>
              </>
            ) : todayAppointments.length ? todayAppointments.slice(0, 6).map((appointment) => (
              <div key={appointment.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{appointment.display.clientName}</p>
                    <p className="mt-1 text-sm text-white/55">{appointment.display.barberName} - {appointment.display.serviceName}</p>
                  </div>
                  <StatusBadge status={appointment.status} balanceDue={appointment.balanceDue} />
                </div>
                <p className="mt-3 text-sm text-white/58">{appointment.display.locationLabel} - {formatTime(appointment.start)}</p>
                <p className="mt-2 text-sm text-white/58">{getAppointmentDetail(appointment)}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm leading-7 text-white/58">
                Today&apos;s appointment activity will surface here as the shop begins taking bookings and moving them through the floor.
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Walk-in queue</p>
            <span className="status-pill text-[#d7ffab]">{walkIns.length} in queue</span>
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><Skeleton className="h-20 w-full" /></div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><Skeleton className="h-20 w-full" /></div>
              </>
            ) : walkIns.length ? walkIns.slice(0, 6).map((entry) => (
              <div key={entry.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">#{entry.position} - {entry.clientName}</p>
                  <span className="status-pill text-[#d7ffab]">{entry.display.statusLabel}</span>
                </div>
                <p className="mt-1 text-sm text-white/55">{entry.requestedService}</p>
                <p className="mt-3 text-sm text-white/58">{entry.display.locationLabel}</p>
                <p className="mt-2 text-sm text-white/58">
                  {entry.display.assignedBarberName ? `Assigned to ${entry.display.assignedBarberName}` : "Front desk routing still needed"} - {entry.waitMinutes} min wait
                </p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm leading-7 text-white/58">
                Walk-ins will surface here once the front desk starts adding queue traffic.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <p className="surface-label">Alerts and exceptions</p>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><Skeleton className="h-20 w-full" /></div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><Skeleton className="h-20 w-full" /></div>
              </>
            ) : alerts.length ? alerts.map((alert) => (
              <div key={alert} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                <p className="font-medium text-white">{alert}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm leading-7 text-white/58">
                Alerts and exceptions will appear here as the operating loop surfaces them.
              </div>
            )}
          </div>
          {workflowEvents.length ? (
            <div className="mt-4 rounded-[24px] border border-white/8 bg-black/18 p-4">
              <p className="surface-label">Latest activity</p>
              <div className="mt-3 space-y-3">
                {workflowEvents.slice(0, 3).map((activity) => (
                  <div key={`${activity.appointmentReference}-${activity.createdAt}`} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-white">{activity.title}</p>
                      <span className="status-pill text-[#d7ffab]">{activity.actorRole.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/58">{activity.detail}</p>
                    <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-white/38">{formatActivityTimestamp(activity.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
