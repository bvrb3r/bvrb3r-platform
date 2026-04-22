"use client";

import { useMemo } from "react";
import { ArrowRight, Landmark, ShieldAlert, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useFinancialAnomalyQueueQuery,
  useFintechManagementQuery,
  useFintechPayoutsQuery
} from "@/lib/fintech/client";
import { useShopDashboardQuery } from "@/lib/operations/barber-client";
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

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function formatDateTime(iso: string) {
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

export function OwnerMoneyWorkspace() {
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

  const ownerAnalytics = useMemo(() => shopQuery.data?.ownerAnalytics ?? [], [shopQuery.data?.ownerAnalytics]);
  const appointments = useMemo(() => shopQuery.data?.appointments ?? [], [shopQuery.data?.appointments]);
  const barbers = useMemo(() => shopQuery.data?.barbers ?? [], [shopQuery.data?.barbers]);
  const summary = shopQuery.data?.summary;
  const anomalies = anomaliesQuery.data?.items ?? [];
  const blockedPayments = useMemo(() => fintechQuery.data?.blockedPayments ?? [], [fintechQuery.data?.blockedPayments]);
  const payoutSummary = payoutsQuery.data?.summary;
  const readyRouting = useMemo(() => payoutsQuery.data?.readyRouting ?? [], [payoutsQuery.data?.readyRouting]);
  const recentPayoutExecutions = payoutsQuery.data?.recentExecutions ?? [];

  const revenueWindow = useMemo(() => {
    const businessDate = summary?.businessDate ?? summary?.latestDate ?? new Date().toISOString().slice(0, 10);
    const businessDateValue = new Date(`${businessDate}T00:00:00`);
    const weekStart = new Date(businessDateValue);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthKey = getMonthKey(businessDateValue);

    let weekRevenue = 0;
    let monthRevenue = 0;

    ownerAnalytics.forEach((row) => {
      const rowDate = new Date(`${row.businessDate}T00:00:00`);
      if (rowDate >= weekStart && rowDate <= businessDateValue) {
        weekRevenue += row.revenueTotal;
      }
      if (getMonthKey(rowDate) === monthKey) {
        monthRevenue += row.revenueTotal;
      }
    });

    return {
      todayRevenue: summary?.revenueToday ?? 0,
      weekRevenue,
      monthRevenue
    };
  }, [ownerAnalytics, summary?.businessDate, summary?.latestDate, summary?.revenueToday]);

  const busiestHour = useMemo(() => {
    const counts = new Map<number, number>();
    for (const appointment of appointments) {
      const hour = new Date(appointment.start).getHours();
      counts.set(hour, (counts.get(hour) ?? 0) + 1);
    }

    const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
    if (!top) {
      return "No peak yet";
    }

    const label = new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(new Date(2026, 0, 1, top[0]));
    return `${label} (${top[1]} appt${top[1] === 1 ? "" : "s"})`;
  }, [appointments]);

  const routedVisibility = useMemo(() => {
    const platformFees = [...blockedPayments, ...readyRouting].reduce((sum, row) => sum + row.platformFeeAmount, 0);
    const barberShare = [...blockedPayments, ...readyRouting].reduce((sum, row) => sum + row.barberPayoutAmount, 0);
    const shopShare = [...blockedPayments, ...readyRouting].reduce((sum, row) => sum + row.shopSplitAmount, 0);

    return {
      platformFees,
      barberShare,
      shopShare
    };
  }, [blockedPayments, readyRouting]);

  const recentRevenueAppointments = useMemo(() => {
    return appointments
      .filter((appointment) => appointment.status === "completed")
      .sort((left, right) => new Date(right.completedAt ?? right.end).getTime() - new Date(left.completedAt ?? left.end).getTime())
      .slice(0, 6);
  }, [appointments]);

  const tipTotal = ownerAnalytics.reduce((sum, row) => sum + row.tipTotal, 0);
  const averageTicket = summary?.completedCount
    ? (summary.revenueToday ?? 0) / Math.max(summary.completedCount, 1)
    : 0;
  const averageUtilization = barbers.length
    ? Math.round(barbers.reduce((sum, barber) => sum + barber.utilization, 0) / barbers.length)
    : 0;
  const revenuePerActiveBarber = barbers.length
    ? revenueWindow.todayRevenue / Math.max(barbers.length, 1)
    : 0;

  return (
    <div className="space-y-4" data-testid="owner-money-workspace">
      {errorMessage ? <FeedbackBanner tone="error" message={getReadableActionError(errorMessage)} /> : null}

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Money command</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Trust every dollar without inventing the story around it.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Revenue, payouts, routing visibility, and anomalies all stay tied to the canonical money layer. This lane is for understanding the business and acting safely.
            </p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/66">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
              <WalletCards className="h-4 w-4" />
              Canonical flow live
            </div>
            <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">{anomalies.length} active anomaly records</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {isInitialLoading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4">
                <p className="surface-label text-[#d7ffab]">Today</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{currency(revenueWindow.todayRevenue)}</p>
                <p className="mt-2 text-sm text-white/62">Revenue posted today.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">This week</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{currency(revenueWindow.weekRevenue)}</p>
                <p className="mt-2 text-sm text-white/58">Last 7 business days in scope.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">This month</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{currency(revenueWindow.monthRevenue)}</p>
                <p className="mt-2 text-sm text-white/58">Current month from owner analytics snapshots.</p>
              </div>
            </>
          )}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="rounded-[32px] p-6">
          <p className="surface-label">Breakdown</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : (
              <>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Service revenue</p>
                  <p className="mt-3 text-2xl font-semibold">{currency(revenueWindow.monthRevenue)}</p>
                  <p className="mt-2 text-sm text-white/58">Current-month gross revenue from owner snapshots.</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Tips</p>
                  <p className="mt-3 text-2xl font-semibold">{currency(tipTotal)}</p>
                  <p className="mt-2 text-sm text-white/58">Tips visible in owner analytics snapshots.</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Open platform fees</p>
                  <p className="mt-3 text-2xl font-semibold">{currency(routedVisibility.platformFees)}</p>
                  <p className="mt-2 text-sm text-white/58">Blocked plus ready routing rows still visible in scope.</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Open barber share</p>
                  <p className="mt-3 text-2xl font-semibold">{currency(routedVisibility.barberShare)}</p>
                  <p className="mt-2 text-sm text-white/58">Barber payout share across ready and blocked routing rows.</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Open shop share</p>
                  <p className="mt-3 text-2xl font-semibold">{currency(routedVisibility.shopShare)}</p>
                  <p className="mt-2 text-sm text-white/58">Shop-side routed revenue still awaiting settlement flow.</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Ready for payout</p>
                  <p className="mt-3 text-2xl font-semibold">{currency(fintechQuery.data?.summary.readyForPayoutAmount ?? payoutSummary?.readyForPayoutAmount ?? 0)}</p>
                  <p className="mt-2 text-sm text-white/58">Funds already clear to advance through payout rails.</p>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <p className="surface-label">Money flow</p>
          <div className="mt-4 rounded-[26px] border border-white/8 bg-black/20 p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
              <div className="rounded-[20px] border border-white/8 bg-black/20 px-3 py-4 text-center text-sm text-white/72">Client</div>
              <ArrowRight className="mx-auto h-4 w-4 self-center text-[#baff69]" />
              <div className="rounded-[20px] border border-white/8 bg-black/20 px-3 py-4 text-center text-sm text-white/72">Platform</div>
              <ArrowRight className="mx-auto h-4 w-4 self-center text-[#baff69]" />
              <div className="rounded-[20px] border border-white/8 bg-black/20 px-3 py-4 text-center text-sm text-white/72">Barber / Shop</div>
              <ArrowRight className="mx-auto h-4 w-4 self-center text-[#baff69]" />
              <div className="rounded-[20px] border border-white/8 bg-black/20 px-3 py-4 text-center text-sm text-white/72">Payout</div>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/58">
              Client payments route into the platform first, split against the canonical routing model, and only advance to payout when service, capture, and dispute status all allow it.
            </p>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="rounded-[32px] p-6">
          <p className="surface-label">Payout status</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : (
              <>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Pending</p><p className="mt-3 text-2xl font-semibold">{currency((blockedPayments.reduce((sum, row) => sum + row.barberPayoutAmount + row.shopSplitAmount, 0)))}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Executed</p><p className="mt-3 text-2xl font-semibold">{currency(payoutSummary?.executedAmount ?? 0)}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Failed / blocked</p><p className="mt-3 text-2xl font-semibold">{(payoutSummary?.failedExecutionRecords ?? 0) + (payoutSummary?.blockedExecutionRecords ?? 0)}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Instant payout fees</p><p className="mt-3 text-2xl font-semibold">{currency(recentPayoutExecutions.reduce((sum, row) => sum + (row.payoutSpeed === "instant" ? row.providerFeeAmount : 0), 0))}</p></div>
              </>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {recentPayoutExecutions.length ? recentPayoutExecutions.slice(0, 4).map((execution) => (
              <div key={execution.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-white">{execution.targetDisplayName ?? execution.barberName ?? execution.shopLabel ?? "Payout execution"}</p>
                  <span className="status-pill text-[#d7ffab]">{execution.executionStatus.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{currency(execution.amount)} - {execution.executionType.replaceAll("_", " ")} - {execution.blockedReason ?? execution.failureReason ?? "Execution recorded cleanly"}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm leading-7 text-white/58">
                No payout executions are recorded yet for this owner scope.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Alerts and exceptions</p>
            <ShieldAlert className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Anomalies open</p><p className="mt-3 text-2xl font-semibold">{anomalies.filter((item) => item.status === "open" || item.status === "investigating").length}</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Needs account attention</p><p className="mt-3 text-2xl font-semibold">{fintechQuery.data?.summary.needsAttentionAccounts ?? 0}</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Blocked routing</p><p className="mt-3 text-2xl font-semibold">{fintechQuery.data?.summary.blockedRoutingRecords ?? 0}</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Ready for payout</p><p className="mt-3 text-2xl font-semibold">{currency(payoutSummary?.readyForPayoutAmount ?? 0)}</p></div>
          </div>
          <div className="mt-4 space-y-3">
            {anomalies.length ? anomalies.slice(0, 4).map((anomaly) => (
              <div key={anomaly.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-white">{anomaly.summary}</p>
                  <span className="status-pill text-[#d7ffab]">{anomaly.status}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{anomaly.description ?? anomaly.anomalyType.replaceAll("_", " ")}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm leading-7 text-white/58">
                No financial anomalies are open in this owner scope right now.
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Recent revenue</p>
            <WalletCards className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {recentRevenueAppointments.length ? recentRevenueAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{appointment.display.clientName}</p>
                    <p className="mt-1 text-sm text-white/58">{appointment.display.barberName} - {appointment.display.serviceName}</p>
                  </div>
                  <span className="status-pill text-[#d7ffab]">{appointment.balanceDue > 0 ? "open balance" : "posted"}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{formatDateTime(appointment.completedAt ?? appointment.end)} - {currency(appointment.totalAmount)}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm leading-7 text-white/58">
                Revenue activity will appear here once the first completed appointments post.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Performance indicators</p>
            <Landmark className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : (
              <>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Average ticket</p><p className="mt-3 text-2xl font-semibold">{currency(averageTicket)}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Revenue per barber</p><p className="mt-3 text-2xl font-semibold">{currency(revenuePerActiveBarber)}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Busiest hour</p><p className="mt-3 text-2xl font-semibold">{busiestHour}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Chair utilization</p><p className="mt-3 text-2xl font-semibold">{averageUtilization}%</p></div>
              </>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
