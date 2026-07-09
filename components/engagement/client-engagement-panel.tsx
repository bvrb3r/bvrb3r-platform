"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BellRing, Gift, Repeat2, Smartphone, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { usePwa } from "@/components/pwa/pwa-provider";
import { useClientEngagementSummary, useFollowBarberMutation, type EngagementApiError } from "@/lib/engagement/client";
import { useMobileActivationSummary } from "@/lib/mobile/client";
import { getReadableActionError } from "@/lib/utils/feedback";
import { dateLabel } from "@/lib/utils";

function PanelSkeleton() {
  return (
    <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
      <Card className="rounded-[32px] p-6">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-4 h-12 w-64" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 w-full rounded-[24px]" />
          <Skeleton className="h-28 w-full rounded-[24px]" />
        </div>
      </Card>
      <Card className="rounded-[32px] p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-32 w-full rounded-[24px]" />
        <Skeleton className="mt-4 h-20 w-full rounded-[24px]" />
      </Card>
    </section>
  );
}

function formatSignalLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function ClientEngagementPanel() {
  const summaryQuery = useClientEngagementSummary();
  const mobileSummaryQuery = useMobileActivationSummary();
  const followMutation = useFollowBarberMutation();
  const pwa = usePwa();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  async function handleFollow(barberId: string) {
    setFeedback(null);
    try {
      await followMutation.mutateAsync({ barberId, notifyOnAvailability: true, notifyOnPortfolio: true });
      setFeedback({ tone: "success", message: "Barber followed. New availability and profile activity can now feed your engagement lane." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as EngagementApiError) });
    }
  }

  async function handleEnablePush() {
    const result = await pwa.enablePush();
    setFeedback({ tone: result.ok ? "success" : "error", message: result.message });
  }

  async function handleDisablePush() {
    await pwa.disablePush();
    setFeedback({ tone: "success", message: "Push alerts were turned off for this device." });
  }

  if (summaryQuery.isLoading && !summaryQuery.data) {
    return <PanelSkeleton />;
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <Card className="rounded-[32px] p-6">
        <FeedbackBanner tone="error" message="Something went wrong while loading your engagement view. Please try again." />
      </Card>
    );
  }

  const summary = summaryQuery.data;
  const mobileSummary = mobileSummaryQuery.data;
  const rebooking = summary.rebookingRecommendation;
  const intelligence = summary.intelligence;
  const automation = summary.automation;
  const primarySuggestion = summary.followSuggestions[0];

  return (
    <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]" data-testid="client-engagement-panel">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label text-[#e4f9b8]">Engagement lane</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-4xl" data-display="true">Stay on your barber rhythm</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/64">
              Rebooking signals, BVRB3R Points, follows, reminders, and now mobile activation are all designed to make booking feel natural instead of transactional.
            </p>
          </div>
          <div className="rounded-[24px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 px-4 py-4">
            <p className="surface-label text-[#e4f9b8]">BVRB3R Points</p>
            <p className="mt-3 text-3xl font-semibold" data-display="true">{summary.pointsBalance}</p>
            <p className="mt-2 text-sm text-white/60">{summary.tier.toUpperCase()} tier with {summary.referralCredits} referral credit{summary.referralCredits === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Smart rebooking</p>
              <Repeat2 className="h-5 w-5 text-[#d9f985]" />
            </div>
            <p className="mt-4 text-lg font-semibold">{rebooking?.message ?? "We are still learning your ideal refresh cadence."}</p>
            <p className="mt-3 text-sm leading-7 text-white/62">{rebooking?.reason ?? "Complete a few more visits and the platform will tighten your reminder window automatically."}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="status-pill text-[#e4f9b8]">{formatSignalLabel(intelligence.rebookingWindow)}</span>
              <span className="status-pill text-white/72">{formatSignalLabel(intelligence.churnRisk)} risk</span>
              <span className="status-pill text-white/72">{formatSignalLabel(intelligence.loyaltySegment)}</span>
            </div>
            <div className="mt-4 rounded-[20px] border border-white/8 bg-black/25 p-4">
              <p className="surface-label">Recommended next step</p>
              <p className="mt-2 text-sm leading-7 text-white/64">{intelligence.nextBestAction}</p>
            </div>
            <div className="mt-4 rounded-[20px] border border-white/8 bg-black/25 p-4">
              <p className="surface-label">Automation readiness</p>
              <p className="mt-2 text-sm leading-7 text-white/64">
                {automation.nextAutomation
                  ? `${automation.nextAutomation.title} is ${automation.nextAutomation.status.replaceAll("_", " ")} for ${dateLabel(automation.nextAutomation.dueAt)}.`
                  : "No live follow-up run is pending right now. As your cadence, loyalty, and offer fit change, queued nudges will show here."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="status-pill text-[#e4f9b8]">{automation.pendingRuns} pending</span>
                <span className="status-pill text-white/72">{automation.retryScheduledRuns} retry scheduled</span>
                <span className="status-pill text-white/72">{automation.completedRuns} completed</span>
                <span className="status-pill text-white/72">{automation.failedRuns} failed</span>
                <span className="status-pill text-white/72">{automation.blockedRuns} blocked</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="status-pill text-[#e4f9b8]">{rebooking ? `Suggested ${dateLabel(rebooking.remindAt)}` : "Cadence building"}</span>
              <Link href="/booking/new" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/78 transition hover:border-[#C4F24E]/18 hover:text-[#e4f9b8]">
                Rebook from this signal
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/discover" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/78 transition hover:border-[#C4F24E]/18 hover:text-[#e4f9b8]">
                Discover more barbers
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Loyalty economy</p>
              <Gift className="h-5 w-5 text-[#d9f985]" />
            </div>
            <div className="mt-4 space-y-3">
              {summary.rewards.map((reward) => (
                <div key={reward.id} className="rounded-[20px] border border-white/8 bg-black/25 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{reward.title}</p>
                    <span className={reward.unlocked ? "status-pill text-[#e4f9b8]" : "status-pill text-white/58"}>{reward.pointsRequired} pts</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">{reward.unlocked ? "Ready to claim from your client home." : "Keep booking, reviewing, and referring to reach this reward."}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Mobile app activation</p>
            <Smartphone className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Push status</p>
              <p className="mt-3 text-2xl font-semibold" data-display="true">{mobileSummary?.pushEnabled ? "Live" : pwa.pushPermission === "granted" ? "Ready" : "Off"}</p>
              <p className="mt-2 text-sm text-white/58">{mobileSummary?.activeSubscriptionCount ?? 0} active device route{(mobileSummary?.activeSubscriptionCount ?? 0) === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Offline reads</p>
              <p className="mt-3 text-2xl font-semibold" data-display="true">{mobileSummary?.offlineSupport.cachedRoutes.length ?? 0}</p>
              <p className="mt-2 text-sm text-white/58">Cached discovery and booking-entry surfaces stay close even when the signal drops.</p>
            </div>
            <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4">
              <p className="surface-label text-[#e4f9b8]">Activation links</p>
              <p className="mt-3 text-2xl font-semibold" data-display="true">{mobileSummary?.deepLinks.length ?? 0}</p>
              <p className="mt-2 text-sm text-white/62">Deep links are ready for bookings, discovery, referrals, and your client home.</p>
            </div>
          </div>
          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/64">
            {mobileSummary?.offlineSupport.writeSafetyMessage ?? "Booking, checkout, and live updates stay online-only so your schedule stays correct across devices."}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {mobileSummary?.pushEnabled ? (
              <button type="button" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/78 transition hover:border-white/20 hover:text-white" onClick={() => void handleDisablePush()}>
                Turn off alerts
              </button>
            ) : (
              <button type="button" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#C4F24E]/20 bg-[#C4F24E]/10 px-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e4f9b8] transition hover:border-[#C4F24E]/30 hover:bg-[#C4F24E]/14" onClick={() => void handleEnablePush()}>
                Enable booking alerts
              </button>
            )}
            <Link href="/referrals" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/78 transition hover:border-[#C4F24E]/18 hover:text-[#e4f9b8]">
              Open referrals
            </Link>
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Followed barbers</p>
            <Users className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            {summary.followedBarbers.length ? summary.followedBarbers.map((follow) => (
              <div key={follow.barberId} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{follow.barberName}</p>
                    <p className="mt-2 text-sm text-white/55">{follow.username ? `@${follow.username}` : "Marketplace profile ready"}</p>
                  </div>
                  <span className="status-pill text-[#e4f9b8]">{follow.nextAvailableAt ? dateLabel(follow.nextAvailableAt) : "Availability soon"}</span>
                </div>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Follow a barber to keep rebooking, portfolio updates, and availability close to your client home.</div>
            )}
          </div>
          {primarySuggestion ? (
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/20 bg-[#C4F24E]/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e4f9b8] transition hover:border-[#C4F24E]/30 hover:bg-[#C4F24E]/14"
              onClick={() => void handleFollow(primarySuggestion.barberId)}
              disabled={followMutation.isPending}
            >
              {followMutation.isPending ? "Following..." : `Follow ${primarySuggestion.barberName}`}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Recommended next chair</p>
            <Repeat2 className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            {summary.recommendedBarbers.length ? summary.recommendedBarbers.map((barber) => (
              <div key={barber.barberId} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{barber.barberName}</p>
                    <p className="mt-2 text-sm text-white/55">{barber.username ? `@${barber.username}` : "Marketplace profile ready"}</p>
                  </div>
                  <span className="status-pill text-[#e4f9b8]">{barber.nextAvailableAt ? dateLabel(barber.nextAvailableAt) : "Open soon"}</span>
                </div>
                <p className="mt-3 text-sm leading-7 text-white/60">{barber.reason}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">As your booking history grows, BVRB3R will rank the best next barbers using trust, availability, and repeat-booking patterns.</div>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Notifications and proof</p>
            <BellRing className="h-5 w-5 text-[#d9f985]" />
          </div>
          <div className="mt-4 space-y-3">
            {summary.recentNotifications.length ? summary.recentNotifications.map((notification) => (
              <div key={notification.id} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{notification.title}</p>
                  <span className="status-pill text-[#e4f9b8]">{notification.channel.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-2 text-sm leading-7 text-white/60">{notification.body}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Reminders, loyalty milestones, and follow activity will surface here as the engagement layer grows.</div>
            )}
          </div>
          {summary.referralCode ? (
            <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/70">
              <p className="surface-label">Referral code</p>
              <p className="mt-3 text-lg font-semibold">{summary.referralCode.code}</p>
              <p className="mt-2 text-white/58">Share this code to turn referrals into future points and marketplace growth.</p>
              <Link href="/referrals" className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/20 bg-[#C4F24E]/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e4f9b8] transition hover:border-[#C4F24E]/30 hover:bg-[#C4F24E]/14">Open referrals</Link>
            </div>
          ) : null}
        </Card>
      </div>
    </section>
  );
}


