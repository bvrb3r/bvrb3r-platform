"use client";

import { Gift, Link2, WalletCards } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FeatureGateTease } from "@/components/ui/feature-gate-tease";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientReferralSummary } from "@/lib/engagement/client";
import { useMarketplaceAnalyticsMutation } from "@/lib/marketplace/client";
import { POINTS_VALUE_COPY } from "@/lib/points/explanations";
import { usePointsBalanceQuery, usePointsHistoryQuery } from "@/lib/points/client";
import { currency } from "@/lib/utils";
import type { PointsActivityView } from "@/types/points";

function ActivitySkeleton() {
  return (
    <div className="rounded-[26px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-8 w-44" />
      <Skeleton className="mt-4 h-4 w-full" />
    </div>
  );
}

function formatOccurredAt(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function getToneClassName(tone: PointsActivityView["tone"]) {
  if (tone === "positive") {
    return "border-[#e4f9b8]/18 bg-[#e4f9b8]/8 text-[#eaffcb]";
  }

  if (tone === "warning") {
    return "border-amber-300/18 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-black/18 text-white/72";
}

export function ClientActivityScreen() {
  const balanceQuery = usePointsBalanceQuery();
  const historyQuery = usePointsHistoryQuery();
  const referralQuery = useClientReferralSummary();
  const analyticsMutation = useMarketplaceAnalyticsMutation();
  const balance = balanceQuery.data;
  const history = historyQuery.data;
  const activity = history?.activity ?? [];
  const pendingTransactions = history?.transactions.filter((transaction) => transaction.status === "pending" && transaction.pointsDelta > 0) ?? [];
  const latestPositiveActivity = activity.find((item) => item.tone === "positive" || item.tone === "neutral");
  const isInitialLoading = (balanceQuery.isLoading && !balance) || (historyQuery.isLoading && !history);
  const errorMessage = balanceQuery.error || historyQuery.error
    ? (balanceQuery.error ?? historyQuery.error)?.message ?? "Unable to load your BVR Points right now."
    : null;

  async function handleReferralCta() {
    try {
      await analyticsMutation.mutateAsync({
        eventType: "referral_shared",
        sourceKind: "client_dashboard",
        sourceReference: referralQuery.data?.referralCode?.code,
        metadata: {
          interaction: "cta_click",
          surface: "activity"
        }
      });
    } catch {
      // Rewards should stay responsive even if analytics persistence is unavailable.
    }
  }

  return (
    <div className="space-y-5" data-testid="client-activity-screen">
      <header className="overflow-hidden rounded-[34px] border border-[#d8ff9d]/16 bg-[linear-gradient(180deg,rgba(18,22,14,0.96),rgba(8,8,8,0.98))] p-5 shadow-[0_24px_48px_rgba(0,0,0,0.22)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#e0f6a0]">Rewards</p>
            <h1 className="mt-3 text-balance text-3xl font-semibold text-white sm:text-4xl" data-display="true">
              BVR Points, kept simple.
            </h1>
            <p className="mt-3 text-sm leading-7 text-white/66">
              This is the calm rewards hub: what you have, what it is worth, what is still unlocking, and what just moved through the ledger.
            </p>
          </div>
          <div className="rounded-[24px] border border-[#e4f9b8]/16 bg-[#e4f9b8]/10 px-4 py-4 text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#e8ffc2]">Balance</p>
            <p className="mt-2 text-3xl font-semibold text-white" data-display="true">{balance?.unlockedPoints ?? 0} pts</p>
            <p className="mt-2 text-sm text-white/72">{currency(balance?.inAppValue ?? 0)} in app</p>
          </div>
        </div>
      </header>

      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}

      <FeatureGateTease
        gateKey="client.analytics.style_history"
        label="Style history"
        eyebrow="Client analytics"
        detail="A client-controlled view of past styles, saved references, and repeat outcomes."
      />

      <ClientSectionBlock
        eyebrow="Balance"
        title="Know what you can use right now."
        subtitle="In-app value stays stronger than cash-out by design, so the next booking remains the clearest place to use your points."
      >
        {isInitialLoading ? (
          <ActivitySkeleton />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[30px] border border-[#a8ff47]/16 bg-[linear-gradient(180deg,rgba(196, 242, 78,0.12),rgba(8,8,8,0.98))] p-5 shadow-[0_18px_36px_rgba(0,0,0,0.18)] sm:p-6">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">Balance header</p>
              <h2 className="mt-3 text-4xl font-semibold text-white sm:text-5xl" data-display="true">
                {balance?.unlockedPoints ?? 0} pts
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">In-app value</p>
                  <p className="mt-3 text-xl font-semibold text-white">{currency(balance?.inAppValue ?? 0)}</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Pending</p>
                  <p className="mt-3 text-xl font-semibold text-white">{balance?.pendingPoints ?? 0} pts</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Dollar view</p>
                  <p className="mt-3 text-xl font-semibold text-white">{currency(balance?.inAppValue ?? 0)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="surface-label">Progress</p>
                  <span className="status-pill text-[#e4f9b8]">
                    {balance?.explanation.pointsToNextMilestone ?? 0} pts to go
                  </span>
                </div>
                <p className="mt-3 text-xl font-semibold text-white" data-display="true">
                  {balance?.explanation.progressLabel ?? "Your next milestone will show up here."}
                </p>
                <div className="mt-4 h-2 rounded-full bg-white/8">
                  <div
                    className="h-2 rounded-full bg-[linear-gradient(90deg,#c4f24e,#e4f9b8)]"
                    style={{ width: `${balance?.explanation.progressPercent ?? 0}%` }}
                  />
                </div>
                <p className="mt-3 text-sm leading-7 text-white/62">
                  {balance?.explanation.valueAdvantageLabel ?? `${POINTS_VALUE_COPY.inAppRate} stays stronger than ${POINTS_VALUE_COPY.cashoutRate}.`}
                </p>
              </div>

              <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
                <p className="surface-label">Latest reward update</p>
                <p className="mt-3 text-xl font-semibold text-white" data-display="true">
                  {latestPositiveActivity?.title ?? "No recent points movement yet"}
                </p>
                <p className="mt-3 text-sm leading-7 text-white/62">
                  {latestPositiveActivity?.detail ?? "Book, tip, refer, and redeem through the normal app loop to see activity here."}
                </p>
                {latestPositiveActivity ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="status-pill text-[#e4f9b8]">{latestPositiveActivity.amountLabel}</span>
                    <span className="status-pill text-white/72">{latestPositiveActivity.statusLabel}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Actions"
        title="Use points without overthinking it."
        subtitle="Redeem on a booking, refer someone real, or scroll straight into the ledger trail."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <WalletCards className="h-4 w-4 text-[#d9f985]" />
              Redeem
            </div>
            <p className="mt-3 text-lg font-semibold text-white">Use points on your next booking</p>
            <p className="mt-2 text-sm text-white/58">Apply BVR Points in checkout with instant total updates and live booking caps.</p>
            <div className="mt-4">
              <ClientActionLink href="/booking/new?mode=next-available" size="md">
                Redeem on booking
              </ClientActionLink>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <Link2 className="h-4 w-4 text-[#e4f9b8]" />
              Refer
            </div>
            <p className="mt-3 text-lg font-semibold text-white">Keep the growth loop moving</p>
            <p className="mt-2 text-sm text-white/58">
              {referralQuery.data?.totals.completed ?? 0} referral completion{(referralQuery.data?.totals.completed ?? 0) === 1 ? "" : "s"} and {referralQuery.data?.totals.credited ?? 0} credited so far.
            </p>
            <div className="mt-4">
              <ClientActionLink href="/referrals" size="md" onClick={() => void handleReferralCta()}>
                Refer friends
              </ClientActionLink>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <Gift className="h-4 w-4 text-[#d9f985]" />
              Activity
            </div>
            <p className="mt-3 text-lg font-semibold text-white">See the exact ledger trail</p>
            <p className="mt-2 text-sm text-white/58">Booking rewards, tip rewards, referrals, redemptions, reversals, and expirations stay in one readable list.</p>
            <div className="mt-4">
              <a
                href="#points-activity"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/18 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/82 transition hover:border-[#c4f24e]/18 hover:text-[#e4f9b8] sm:text-[11px] sm:tracking-[0.22em]"
              >
                View activity
              </a>
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Recent activity"
        title="Every point movement stays explainable."
        subtitle="The ledger list below only shows canonical transactions and cash-out states already persisted by the app."
      >
        <div id="points-activity" className="space-y-3">
          {isInitialLoading ? (
            <>
              <ActivitySkeleton />
              <ActivitySkeleton />
              <ActivitySkeleton />
            </>
          ) : activity.length ? activity.map((item) => (
            <article key={item.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#C4F24E]/16 hover:bg-black/28">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-2 text-sm leading-7 text-white/60">{item.detail}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center rounded-full border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${getToneClassName(item.tone)}`}>
                    {item.amountLabel}
                  </span>
                  <p className="mt-2 text-xs text-white/48">{item.statusLabel}</p>
                </div>
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/42">{formatOccurredAt(item.occurredAt)}</p>
            </article>
          )) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/15 p-5 text-sm leading-7 text-white/58">
              Your BVR Points activity will appear here after completed bookings, qualified tips, referrals, redemptions, or reversals.
            </div>
          )}
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Pending"
        title="Unlock timing stays honest."
        subtitle="Points do not unlock early. When something is still validating, this is where you see it."
      >
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
            <p className="surface-label">Unlock timing</p>
            <p className="mt-3 text-xl font-semibold text-white" data-display="true">
              {balance?.pendingPoints ?? 0} pending pts
            </p>
            <p className="mt-3 text-sm leading-7 text-white/62">
              {balance?.explanation.unlockHint ?? "Closed-loop validation has to clear before points move into unlocked value."}
            </p>
            <p className="mt-3 text-sm leading-7 text-white/52">
              {balance?.explanation.cashoutHint ?? POINTS_VALUE_COPY.inAppRate}
            </p>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
            <p className="surface-label">Pending rewards</p>
            <div className="mt-4 space-y-3">
              {pendingTransactions.length ? pendingTransactions.slice(0, 3).map((transaction) => (
                <div key={transaction.id} className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white">{transaction.eventType.replaceAll("_", " ")}</span>
                    <span className="status-pill text-white/72">+{transaction.pointsDelta} pts</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">
                    {transaction.unlockedAt ? `Expected unlock ${formatOccurredAt(transaction.unlockedAt)}.` : "Unlock timing is still validating."}
                  </p>
                </div>
              )) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-black/18 px-4 py-4 text-sm leading-7 text-white/58">
                  Nothing is waiting to unlock right now.
                </div>
              )}
            </div>
          </div>
        </div>
      </ClientSectionBlock>
    </div>
  );
}
