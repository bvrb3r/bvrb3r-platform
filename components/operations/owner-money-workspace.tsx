"use client";

import { useMemo } from "react";
import { ArrowRight, Landmark, ShieldAlert, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerEngagementIntelligence } from "@/lib/engagement/client";
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

export function OwnerMoneyWorkspace() {
  const shopQuery = useShopDashboardQuery();
  const intelligenceQuery = useOwnerEngagementIntelligence();
  const fintechQuery = useFintechManagementQuery();
  const payoutsQuery = useFintechPayoutsQuery();
  const anomaliesQuery = useFinancialAnomalyQueueQuery();

  const isInitialLoading =
    (shopQuery.isLoading && !shopQuery.data)
    || (intelligenceQuery.isLoading && !intelligenceQuery.data)
    || (fintechQuery.isLoading && !fintechQuery.data)
    || (payoutsQuery.isLoading && !payoutsQuery.data);

  const errorMessage =
    shopQuery.error
    ?? intelligenceQuery.error
    ?? fintechQuery.error
    ?? payoutsQuery.error
    ?? anomaliesQuery.error;

  const ownerAnalytics = useMemo(() => shopQuery.data?.ownerAnalytics ?? [], [shopQuery.data?.ownerAnalytics]);
  const summary = shopQuery.data?.summary;
  const money = intelligenceQuery.data?.money;
  const monetization = intelligenceQuery.data?.monetization;
  const anomalies = anomaliesQuery.data?.items ?? [];
  const payoutSummary = payoutsQuery.data?.summary;
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
    for (const appointment of shopQuery.data?.appointments ?? []) {
      const hour = new Date(appointment.start).getHours();
      counts.set(hour, (counts.get(hour) ?? 0) + 1);
    }

    const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
    if (!top) {
      return "No peak yet";
    }

    const label = new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(new Date(2026, 0, 1, top[0]));
    return `${label} (${top[1]} appt${top[1] === 1 ? "" : "s"})`;
  }, [shopQuery.data?.appointments]);

  const revenuePerBarber = intelligenceQuery.data?.network.activeBarbers
    ? intelligenceQuery.data.network.revenue / Math.max(intelligenceQuery.data.network.activeBarbers, 1)
    : 0;
  const averageTicket = summary?.completedCount
    ? (summary.revenueToday ?? 0) / Math.max(summary.completedCount, 1)
    : 0;

  return (
    <div className="space-y-4" data-testid="owner-money-workspace">
      {errorMessage ? <FeedbackBanner tone="error" message={getReadableActionError(errorMessage)} /> : null}

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Money command</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Trust every dollar without digging for it.</h3>
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
              </>
            ) : (
              <>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Service revenue</p><p className="mt-3 text-2xl font-semibold">{currency(money?.revenueBreakdown.grossRevenue ?? 0)}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Tips</p><p className="mt-3 text-2xl font-semibold">{currency(ownerAnalytics.reduce((sum, row) => sum + row.tipTotal, 0))}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Platform fees</p><p className="mt-3 text-2xl font-semibold">{currency(money?.revenueBreakdown.platformFeeRevenue ?? 0)}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Barber payouts</p><p className="mt-3 text-2xl font-semibold">{currency((money?.payoutFlow.paidAmount ?? 0) + (money?.payoutFlow.pendingAmount ?? 0) + (money?.payoutFlow.queuedAmount ?? 0))}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Shop share</p><p className="mt-3 text-2xl font-semibold">{currency(money?.revenueBreakdown.netRevenue ?? 0)}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Booth-rent collections</p><p className="mt-3 text-2xl font-semibold">{currency(fintechQuery.data?.memberships.reduce((sum, membership) => sum + (membership.routingModel === "booth_rent" ? (membership.boothRentAmount ?? 0) : 0), 0) ?? 0)}</p></div>
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
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Pending</p><p className="mt-3 text-2xl font-semibold">{currency(money?.payoutFlow.pendingAmount ?? 0)}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Executed</p><p className="mt-3 text-2xl font-semibold">{currency(payoutSummary?.executedAmount ?? 0)}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Failed / blocked</p><p className="mt-3 text-2xl font-semibold">{(payoutSummary?.failedExecutionRecords ?? 0) + (payoutSummary?.blockedExecutionRecords ?? 0)}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Instant payout fees</p><p className="mt-3 text-2xl font-semibold">{currency(recentPayoutExecutions.reduce((sum, row) => sum + (row.payoutSpeed === "instant" ? row.providerFeeAmount : 0), 0))}</p></div>
              </>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {recentPayoutExecutions.slice(0, 4).map((execution) => (
              <div key={execution.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-white">{execution.targetDisplayName ?? execution.barberName ?? execution.shopLabel ?? "Payout execution"}</p>
                  <span className="status-pill text-[#d7ffab]">{execution.executionStatus.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{currency(execution.amount)} • {execution.executionType.replaceAll("_", " ")} • {execution.blockedReason ?? execution.failureReason ?? "Execution recorded cleanly"}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Alerts and exceptions</p>
            <ShieldAlert className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Anomalies open</p><p className="mt-3 text-2xl font-semibold">{anomalies.filter((item) => item.status === "open" || item.status === "investigating").length}</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Billing issues</p><p className="mt-3 text-2xl font-semibold">{monetization?.subscriptions.billingAttention ?? 0}</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Needs account attention</p><p className="mt-3 text-2xl font-semibold">{fintechQuery.data?.summary.needsAttentionAccounts ?? 0}</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Blocked routing</p><p className="mt-3 text-2xl font-semibold">{fintechQuery.data?.summary.blockedRoutingRecords ?? 0}</p></div>
          </div>
          <div className="mt-4 space-y-3">
            {anomalies.slice(0, 4).map((anomaly) => (
              <div key={anomaly.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-white">{anomaly.summary}</p>
                  <span className="status-pill text-[#d7ffab]">{anomaly.status}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{anomaly.description ?? anomaly.anomalyType.replaceAll("_", " ")}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

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
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Revenue per barber</p><p className="mt-3 text-2xl font-semibold">{currency(revenuePerBarber)}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Busiest hour</p><p className="mt-3 text-2xl font-semibold">{busiestHour}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Chair utilization</p><p className="mt-3 text-2xl font-semibold">{intelligenceQuery.data?.network.chairUtilization ?? 0}%</p></div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
