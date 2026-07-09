"use client";

import { useMemo } from "react";
import { Megaphone, Sparkles, Target, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerEngagementIntelligence } from "@/lib/engagement/client";
import { usePromotionsManagementQuery } from "@/lib/promotions/client";
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

function formatDate(iso?: string) {
  if (!iso) {
    return "No future booking";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatHour(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

export function OwnerGrowthWorkspace() {
  const intelligenceQuery = useOwnerEngagementIntelligence();
  const promotionsQuery = usePromotionsManagementQuery();
  const shopQuery = useShopDashboardQuery();

  const isInitialLoading =
    (intelligenceQuery.isLoading && !intelligenceQuery.data)
    || (promotionsQuery.isLoading && !promotionsQuery.data)
    || (shopQuery.isLoading && !shopQuery.data);

  const errorMessage =
    intelligenceQuery.error
    ?? promotionsQuery.error
    ?? shopQuery.error;

  const summary = intelligenceQuery.data;
  const promotions = promotionsQuery.data?.promotions ?? [];
  const points = summary?.points;

  const openWindows = useMemo(() => {
    const appointments = shopQuery.data?.appointments ?? [];
    const counts = new Map<string, { count: number; sampleStart: string }>();

    for (const appointment of appointments) {
      const date = new Date(appointment.start);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
      const current = counts.get(key);
      counts.set(key, {
        count: (current?.count ?? 0) + 1,
        sampleStart: current?.sampleStart ?? appointment.start
      });
    }

    return [...counts.entries()]
      .filter(([, value]) => value.count <= 1)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .slice(0, 4)
      .map(([, value]) => value.sampleStart);
  }, [shopQuery.data?.appointments]);

  const growthInsight = useMemo(() => {
    const weekDelta = (summary?.monetization.revenue.repeatClientRevenue ?? 0) - ((summary?.monetization.growth.rebookingInfluencedRevenue ?? 0) / 2);
    if (weekDelta > 0) {
      return `Repeat-client revenue is carrying ${currency(weekDelta)} more than your rebooking-influenced baseline.`;
    }

    if ((summary?.retention.rebookingOpportunities ?? 0) > 0) {
      return `${summary?.retention.rebookingOpportunities ?? 0} repeat clients are due back without a future booking.`;
    }

    return "Marketplace, referrals, and loyalty are all live and ready for the next campaign move.";
  }, [summary?.monetization.growth.rebookingInfluencedRevenue, summary?.monetization.revenue.repeatClientRevenue, summary?.retention.rebookingOpportunities]);

  return (
    <div className="space-y-4" data-testid="owner-growth-workspace">
      {errorMessage ? <FeedbackBanner tone="error" message={getReadableActionError(errorMessage)} /> : null}

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Growth command</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Grow the shop from inside the app.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Growth is tied to real behavior here: promotions, referrals, points ROI, repeat guests, and open demand windows all sit on canonical data instead of guesswork.
            </p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/66">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/20 bg-[#C4F24E]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">
              <Sparkles className="h-4 w-4" />
              {promotions.filter((promotion) => promotion.availabilityState === "active").length} campaigns live
            </div>
            <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">{summary?.retention.rebookingOpportunities ?? 0} rebooking opportunities open</p>
          </div>
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
              <div className="rounded-[24px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4">
                <p className="surface-label text-[#e4f9b8]">Active campaigns</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{promotions.filter((promotion) => promotion.availabilityState === "active").length}</p>
                <p className="mt-2 text-sm text-white/62">Offers clients can use right now.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Referral conversions</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{summary?.retention.referralConversions ?? 0}</p>
                <p className="mt-2 text-sm text-white/58">Completed referral events in owner scope.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Points participants</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{summary?.retention.loyaltyParticipants ?? 0}</p>
                <p className="mt-2 text-sm text-white/58">Clients already participating in BVR Points.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Discovery to booking</p>
                <p className="mt-3 text-3xl font-semibold" data-display="true">{summary?.marketplace.discoveryToBookingRate ?? 0}%</p>
                <p className="mt-2 text-sm text-white/58">How discover traffic converts into real bookings.</p>
              </div>
            </>
          )}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Referrals and campaigns</p>
            <Megaphone className="h-5 w-5 text-[#d9f985]" />
          </div>
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
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Invites shared</p><p className="mt-3 text-2xl font-semibold">{summary?.marketplace.referralInvites ?? 0}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Signed up</p><p className="mt-3 text-2xl font-semibold">{summary?.marketplace.referralSignUps ?? 0}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Booked</p><p className="mt-3 text-2xl font-semibold">{summary?.marketplace.referralBookings ?? 0}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Credited</p><p className="mt-3 text-2xl font-semibold">{summary?.marketplace.referralCredited ?? 0}</p></div>
              </>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {promotions.slice(0, 4).map((promotion) => (
              <div key={promotion.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-white">{promotion.name}</p>
                  <span className="status-pill text-[#e4f9b8]">{promotion.availabilityState}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{promotion.shopLabel} • {promotion.usageCount} redemptions • {promotion.discountType === "percent" ? `${promotion.discountValue}% off` : `${currency(promotion.discountValue)} off`}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">BVR Points ROI</p>
            <Target className="h-5 w-5 text-[#d9f985]" />
          </div>
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
                <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Issued points</p><p className="mt-3 text-2xl font-semibold">{points?.issuedPoints ?? 0}</p><p className="mt-2 text-sm text-white/62">{currency(points?.issuedInAppValue ?? 0)} in issued value.</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Redeemed / cash-out</p><p className="mt-3 text-2xl font-semibold">{points?.redeemedPoints ?? 0} / {points?.cashedOutPoints ?? 0}</p><p className="mt-2 text-sm text-white/58">{points?.redemptionRate ?? 0}% redeemed • {points?.cashoutRate ?? 0}% cashed out.</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Point liability</p><p className="mt-3 text-2xl font-semibold">{currency(points?.pointLiabilityValue ?? 0)}</p><p className="mt-2 text-sm text-white/58">{points?.pointLiabilityPoints ?? 0} points still outstanding.</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Reward cost rate</p><p className="mt-3 text-2xl font-semibold">{points?.rewardSpendRate ?? 0}%</p><p className="mt-2 text-sm text-white/58">{points?.fraudReviewRate ?? 0}% fraud review rate • {points?.reversalRate ?? 0}% reversals.</p></div>
              </>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Retention signals</p>
            <Users className="h-5 w-5 text-[#d9f985]" />
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
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Repeat rate</p><p className="mt-3 text-2xl font-semibold">{summary?.retention.repeatClientRate ?? 0}%</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Due back</p><p className="mt-3 text-2xl font-semibold">{summary?.retention.rebookingOpportunities ?? 0}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Lapsed risk</p><p className="mt-3 text-2xl font-semibold">{summary?.retention.churnRiskClients ?? 0}</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Top retention barber</p><p className="mt-3 text-2xl font-semibold">{summary?.barberRetention[0]?.barberName ?? "None yet"}</p></div>
              </>
            )}
          </div>
          <div className="mt-4 space-y-3">
            {summary?.topReturningClients.slice(0, 4).map((client) => (
              <div key={client.clientId} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-white">{client.clientName}</p>
                  <span className="status-pill text-[#e4f9b8]">{client.loyaltySegment.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{client.completedVisits} completed visits • {currency(client.lifetimeValue)} lifetime value • Last visit {formatDate(client.lastVisitAt)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Growth opportunities</p>
            <Sparkles className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 rounded-[24px] border border-[#C4F24E]/16 bg-[#C4F24E]/8 p-4">
            <p className="text-sm leading-7 text-white/78">{growthInsight}</p>
          </div>
          <div className="mt-4 space-y-3">
            {openWindows.length ? (
              openWindows.map((window) => (
                <div key={window} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-white">Low coverage window</p>
                    <span className="status-pill text-[#e4f9b8]">{formatHour(window)}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">A lighter appointment hour where a targeted promotion or walk-in push could lift same-day revenue.</p>
                </div>
              ))
            ) : null}
            {summary?.topBarbers.slice(0, 2).map((barber) => (
              <div key={barber.barberId} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-white">Promote {barber.barberName}</p>
                  <span className="status-pill text-[#e4f9b8]">{currency(barber.revenue)}</span>
                </div>
                <p className="mt-2 text-sm text-white/58">{barber.followerCount} follows • reputation {barber.reputationScore.toFixed(1)} • best candidate for featured placement.</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
