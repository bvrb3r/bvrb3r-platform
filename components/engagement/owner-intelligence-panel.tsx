"use client";

import { useState } from "react";
import { Globe2, HandCoins, RefreshCcw, ShieldCheck, Smartphone, Target, UploadCloud, Users } from "lucide-react";
import { usePwa } from "@/components/pwa/pwa-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerEngagementIntelligence, useProcessOwnerAutomationMutation } from "@/lib/engagement/client";
import {
  useDismissFinancialAnomalyMutation,
  useResolveFinancialAnomalyMutation,
  useRunScheduledFintechJobsMutation
} from "@/lib/fintech/client";
import { useMobileActivationSummary } from "@/lib/mobile/client";
import { useCreateFeaturedPlacementMutation, useUpdateCityRolloutMutation } from "@/lib/marketplace/activation-client";
import { useReleaseReadinessQuery } from "@/lib/release/client";
import {
  useApprovePointsCashoutMutation,
  useMarkFailedPointsCashoutMutation,
  useMarkPaidPointsCashoutMutation,
  useRejectPointsCashoutMutation,
  useReviewPointsCashoutMutation,
  useReversePointsCashoutMutation
} from "@/lib/points/client";
import {
  useCreateVerificationUploadMutation,
  useStartOwnerConnectOnboardingMutation,
  useSubmitShopVerificationMutation,
  useVerificationMe
} from "@/lib/trust/client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

function PanelSkeleton() {
  return (
    <Card className="rounded-[32px] p-6">
      <Skeleton className="h-5 w-48" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Skeleton className="h-28 w-full rounded-[24px]" />
        <Skeleton className="h-28 w-full rounded-[24px]" />
        <Skeleton className="h-28 w-full rounded-[24px]" />
        <Skeleton className="h-28 w-full rounded-[24px]" />
        <Skeleton className="h-28 w-full rounded-[24px]" />
      </div>
    </Card>
  );
}

export function OwnerIntelligencePanel({ viewerRole = "owner" }: { viewerRole?: "owner" | "manager" }) {
  const summaryQuery = useOwnerEngagementIntelligence();
  const mobileSummaryQuery = useMobileActivationSummary();
  const automationMutation = useProcessOwnerAutomationMutation();
  const reviewCashoutMutation = useReviewPointsCashoutMutation();
  const approveCashoutMutation = useApprovePointsCashoutMutation();
  const rejectCashoutMutation = useRejectPointsCashoutMutation();
  const markPaidCashoutMutation = useMarkPaidPointsCashoutMutation();
  const markFailedCashoutMutation = useMarkFailedPointsCashoutMutation();
  const reverseCashoutMutation = useReversePointsCashoutMutation();
  const runScheduledJobsMutation = useRunScheduledFintechJobsMutation();
  const resolveAnomalyMutation = useResolveFinancialAnomalyMutation();
  const dismissAnomalyMutation = useDismissFinancialAnomalyMutation();
  const pwa = usePwa();
  const releaseReadinessQuery = useReleaseReadinessQuery(viewerRole === "owner" || viewerRole === "manager");
  const uploadMutation = useCreateVerificationUploadMutation();
  const submitShopVerificationMutation = useSubmitShopVerificationMutation();
  const verificationMeQuery = useVerificationMe();
  const connectOnboardingMutation = useStartOwnerConnectOnboardingMutation();
  const featureMutation = useCreateFeaturedPlacementMutation();
  const rolloutMutation = useUpdateCityRolloutMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [shopDocumentName, setShopDocumentName] = useState("bvrb3r-business-license.pdf");

  function handleRequestPush() {
    const result = pwa.requestPushPrimer("owner");
    if (!result.opened) {
      setFeedback({ tone: "info", message: result.message });
    }
  }

  async function handleDisablePush() {
    await pwa.disablePush();
    setFeedback({ tone: "success", message: "Owner mobile alerts were turned off for this device." });
  }

  if (summaryQuery.isLoading && !summaryQuery.data) {
    return <PanelSkeleton />;
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <Card className="rounded-[32px] p-6">
        <FeedbackBanner tone="error" message="Something went wrong while loading owner engagement intelligence. Please try again." />
      </Card>
    );
  }

  const summary = summaryQuery.data;
  const automation = summary.automation;
  const activation = summary.activation;
  const monetization = summary.monetization;
  const points = summary.points;
  const money = summary.money;
  const mobileSummary = mobileSummaryQuery.data;
  const releaseReadiness = releaseReadinessQuery.data;
  const isPending = uploadMutation.isPending
    || submitShopVerificationMutation.isPending
    || connectOnboardingMutation.isPending
    || featureMutation.isPending
    || rolloutMutation.isPending;
  const cashoutActionPending = reviewCashoutMutation.isPending
    || approveCashoutMutation.isPending
    || rejectCashoutMutation.isPending
    || markPaidCashoutMutation.isPending
    || markFailedCashoutMutation.isPending
    || reverseCashoutMutation.isPending;
  const anomalyActionPending = resolveAnomalyMutation.isPending || dismissAnomalyMutation.isPending;
  const canManageCashouts = viewerRole === "owner";
  const canExecuteCashouts = viewerRole === "owner" || viewerRole === "manager";
  const ownerVerificationProfile = verificationMeQuery.data?.profiles.find((profile) => profile.role === "shop_owner");

  async function handleRunAutomations() {
    setFeedback(null);
    try {
      const result = await automationMutation.mutateAsync();
      setFeedback({
        tone: "success",
        message: result.processed.due
          ? `Processed ${result.processed.completed} completed, ${result.processed.retried} retry-scheduled, and ${result.processed.failed} failed automation run${result.processed.due === 1 ? "" : "s"}.`
          : "No due automations were waiting to run."
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as Error) });
    }
  }

  async function handleRunScheduledJobs() {
    setFeedback(null);
    try {
      const result = await runScheduledJobsMutation.mutateAsync({});
      setFeedback({
        tone: "success",
        message: `Scheduled execution ran ${result.jobs.recentRuns.length} finance and growth job${result.jobs.recentRuns.length === 1 ? "" : "s"} on the current scope.`
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as Error) });
    }
  }

  async function handleShopVerification() {
    setFeedback(null);
    try {
      await uploadMutation.mutateAsync({
        ownerType: "shop",
        ownerId: "shop-bvrb3r",
        category: "business_verification",
        fileName: shopDocumentName,
        contentType: "application/pdf",
        fileSizeBytes: 410000
      });
      await submitShopVerificationMutation.mutateAsync({
        shopId: "shop-bvrb3r",
        category: "business_verification",
        businessName: "The BVRB3R Shop(TM)"
      });
      setFeedback({ tone: "success", message: "Shop verification was submitted with a private document reference for trust review." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as Error) });
    }
  }

  async function handleOwnerConnectOnboarding() {
    setFeedback(null);
    try {
      const result = await connectOnboardingMutation.mutateAsync({ shopId: "shop-bvrb3r" });
      if (result.url && typeof window !== "undefined") {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
      setFeedback({ tone: "success", message: "Stripe Connect onboarding opened for the shop-owner lane." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as Error) });
    }
  }

  async function handleFeaturedPlacement() {
    setFeedback(null);
    try {
      await featureMutation.mutateAsync({
        scopeType: "barber",
        scopeId: "barber-wave",
        label: "Featured barber in Tampa Bay",
        placementScope: "discover_hero",
        citySlug: "tampa-bay",
        priority: 1,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString()
      });
      setFeedback({ tone: "success", message: "Featured placement inventory updated for the current launch market." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as Error) });
    }
  }

  async function handleCityRollout() {
    setFeedback(null);
    try {
      await rolloutMutation.mutateAsync({
        citySlug: "st-petersburg",
        activationState: "live",
        launchVisible: true,
        densityScore: 72,
        marketNotes: "Promoted to live after density, referrals, and discovery demand crossed the launch threshold."
      });
      setFeedback({ tone: "success", message: "City rollout updated. Discovery can now treat the market as launch-visible." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as Error) });
    }
  }

  async function handleCashoutReviewAction(input: {
    requestId: string;
    action: "review" | "approve" | "reject";
    fraudFlags?: string[];
  }) {
    setFeedback(null);
    try {
      if (input.action === "review") {
        await reviewCashoutMutation.mutateAsync({
          requestId: input.requestId,
          note: "Moved into owner review from the money dashboard.",
          fraudFlags: input.fraudFlags
        });
        setFeedback({ tone: "success", message: "Cash-out request moved into review." });
        return;
      }

      if (input.action === "approve") {
        await approveCashoutMutation.mutateAsync({
          requestId: input.requestId,
          note: "Approved from the owner money dashboard."
        });
        setFeedback({ tone: "success", message: "Cash-out request approved and queued for payout completion." });
        return;
      }

      await rejectCashoutMutation.mutateAsync({
        requestId: input.requestId,
        note: "Rejected from the owner money dashboard.",
        fraudFlags: input.fraudFlags
      });
      setFeedback({ tone: "success", message: "Cash-out request rejected." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as Error) });
    }
  }

  async function handleCashoutExecutionAction(input: {
    requestId: string;
    action: "paid" | "failed" | "reverse";
  }) {
    setFeedback(null);
    try {
      if (input.action === "paid") {
        await markPaidCashoutMutation.mutateAsync({
          requestId: input.requestId,
          note: "Marked paid from the owner money dashboard."
        });
        setFeedback({ tone: "success", message: "Cash-out payout marked paid." });
        return;
      }

      if (input.action === "failed") {
        await markFailedCashoutMutation.mutateAsync({
          requestId: input.requestId,
          note: "Marked failed from the owner money dashboard."
        });
        setFeedback({ tone: "success", message: "Cash-out payout marked failed without releasing reserved eligibility." });
        return;
      }

      await reverseCashoutMutation.mutateAsync({
        requestId: input.requestId,
        note: "Reversed from the owner money dashboard."
      });
      setFeedback({ tone: "success", message: "Cash-out payout reversed with an audit trail." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as Error) });
    }
  }

  async function handleAnomalyAction(input: { anomalyId: string; action: "resolve" | "dismiss" }) {
    setFeedback(null);
    try {
      if (input.action === "resolve") {
        await resolveAnomalyMutation.mutateAsync({
          anomalyId: input.anomalyId,
          note: "Resolved from the owner money dashboard."
        });
        setFeedback({ tone: "success", message: "Financial anomaly resolved." });
        return;
      }

      await dismissAnomalyMutation.mutateAsync({
        anomalyId: input.anomalyId,
        note: "Dismissed from the owner money dashboard."
      });
      setFeedback({ tone: "success", message: "Financial anomaly dismissed." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as Error) });
    }
  }

  return (
    <section className="space-y-4" data-testid="owner-intelligence-panel">
      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label text-[#e4f9b8]">Owner intelligence</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-4xl" data-display="true">Retention, loyalty, referrals, and marketplace lift</h3>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/64">The operating system now has a monetization, trust, and mobile activation layer for featured placement, boosted discovery, rollout density, and delivery-aware marketplace reporting.</p>
          </div>
          <span className="status-pill text-[#e4f9b8]">{summary.assignedLocationIds.length} locations in scope</span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Floor service volume</p><p className="mt-3 text-3xl font-semibold" data-display="true">{currency(summary.network.revenue)}</p><p className="mt-2 text-sm text-white/58">Operational barber service volume for the current business date · not shop revenue</p></div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Marketplace bookings</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.marketplace.bookingsCreated}</p><p className="mt-2 text-sm text-white/58">Bookings created through discover, profile, or haircut-now flows</p></div>
          <div className="rounded-[24px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Loyalty participants</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.retention.loyaltyParticipants}</p><p className="mt-2 text-sm text-white/62">Clients already inside the BVRB3R Points economy</p></div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Referral conversions</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.retention.referralConversions}</p><p className="mt-2 text-sm text-white/58">Completed or credited referral events in owner scope</p></div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Chair utilization</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.network.chairUtilization}%</p><p className="mt-2 text-sm text-white/58">Utilization scaffold tied to active chair throughput</p></div>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="surface-label">Monetization command</p>
              <p className="mt-2 text-sm text-white/58">Subscriptions, platform fees, repeat-client service volume, and service-volume-at-risk visibility sit on the same reporting lane without treating barber money as shop revenue.</p>
            </div>
            <HandCoins className="h-5 w-5 text-[#d9f985]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Gross service volume</p><p className="mt-3 text-3xl font-semibold" data-display="true">{currency(monetization.revenue.grossRevenue)}</p><p className="mt-2 text-sm text-white/62">Completed barber service volume in current owner scope · not shop revenue.</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Platform fees</p><p className="mt-3 text-3xl font-semibold" data-display="true">{currency(monetization.revenue.platformFeeRevenue)}</p><p className="mt-2 text-sm text-white/58">Canonical fee visibility from payment routing records.</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Subscriptions</p><p className="mt-3 text-3xl font-semibold" data-display="true">{currency(monetization.revenue.subscriptionRevenue)}</p><p className="mt-2 text-sm text-white/58">{monetization.subscriptions.active} active or trialing rows across barber and shop scope.</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Repeat-client service volume</p><p className="mt-3 text-3xl font-semibold" data-display="true">{currency(monetization.revenue.repeatClientRevenue)}</p><p className="mt-2 text-sm text-white/58">{monetization.revenue.retainedRevenueShare}% of service volume is associated with repeat behavior.</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Service volume at risk</p><p className="mt-3 text-3xl font-semibold" data-display="true">{currency(monetization.revenue.revenueAtRisk)}</p><p className="mt-2 text-sm text-white/58">Heuristic booking opportunity tied to churn-risk and re-engagement signals.</p></div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="status-pill text-[#e4f9b8]">{monetization.subscriptions.totalTracked} tracked subscriptions</span>
            <span className="status-pill text-white/72">{monetization.subscriptions.billingAttention} need billing attention</span>
            <span className="status-pill text-white/72">{monetization.subscriptions.entitlementReady} entitlement-ready</span>
            <span className="status-pill text-white/72">Processor fee visibility {currency(monetization.revenue.processorFeeVisibility)}</span>
            <span className="status-pill text-white/72">Referral-attributed volume {currency(monetization.growth.referralConversionRevenue)}</span>
            <span className="status-pill text-white/72">Loyalty-attributed volume {currency(monetization.growth.loyaltyRevenue)}</span>
          </div>
          {points ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Points issued</p><p className="mt-3 text-2xl font-semibold">{points.issuedPoints}</p><p className="mt-2 text-sm text-white/62">{currency(points.issuedInAppValue)} in app value issued.</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Redeemed / cash-out</p><p className="mt-3 text-2xl font-semibold">{points.redeemedPoints} / {points.cashedOutPoints}</p><p className="mt-2 text-sm text-white/58">{currency(points.redeemedInAppValue)} redeemed | {currency(points.cashedOutValue)} cashed out.</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Reward spend rate</p><p className="mt-3 text-2xl font-semibold">{points.rewardSpendRate}%</p><p className="mt-2 text-sm text-white/58">Share of gross service volume represented by BVR Points rewards.</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Referral reward rate</p><p className="mt-3 text-2xl font-semibold">{points.referralConversionRate}%</p><p className="mt-2 text-sm text-white/58">{points.referralRewardTransactions} referral reward transactions credited.</p></div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Point liability</p><p className="mt-3 text-2xl font-semibold">{points.pointLiabilityPoints}</p><p className="mt-2 text-sm text-white/58">{currency(points.pointLiabilityValue)} still sitting on the balance sheet.</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Reversal rate</p><p className="mt-3 text-2xl font-semibold">{points.reversalRate}%</p><p className="mt-2 text-sm text-white/58">{points.reversedPoints} point{points.reversedPoints === 1 ? "" : "s"} reversed by refunds, disputes, or failed validation.</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Fraud review rate</p><p className="mt-3 text-2xl font-semibold">{points.fraudReviewRate}%</p><p className="mt-2 text-sm text-white/58">Share of eligibility checks that routed into review instead of immediate issue.</p></div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Redemption vs cash-out</p><p className="mt-3 text-2xl font-semibold">{points.redemptionRate}% / {points.cashoutRate}%</p><p className="mt-2 text-sm text-white/58">How much issued value is staying in-app versus leaving the system.</p></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {points.issuanceByEventType.length ? points.issuanceByEventType.map((event) => (
                  <span key={event.eventType} className="status-pill text-white/72">
                    {event.eventType.replaceAll("_", " ")} {event.issuedPoints} pts / {currency(event.issuedInAppValue)}
                  </span>
                )) : <span className="status-pill text-white/72">Event-level issuance mix will appear here as rewards move through the canonical ledger.</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {points.topCampaigns.length ? points.topCampaigns.map((campaign) => (
                  <span key={campaign.campaignId} className="status-pill text-white/72">
                    {campaign.name} {campaign.issuedPoints} pts / {currency(campaign.redeemedValue)} redeemed / {campaign.redemptionRate}% redeemed / {campaign.attributedRevenue ? `${currency(campaign.attributedRevenue)} attributed service volume` : `${campaign.rewardCostRate}% cost`}
                  </span>
                )) : <span className="status-pill text-white/72">BVR Points campaign impact will appear here as reward issuance builds.</span>}
              </div>
            </>
          ) : null}

          <div className="mt-4 space-y-3">
            {monetization.subscriptions.rows.length ? monetization.subscriptions.rows.slice(0, 6).map((subscription) => (
              <div key={subscription.id} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{subscription.displayName}</p>
                    <p className="mt-1 text-sm text-white/58">{subscription.planName} | {subscription.planInterval} | {subscription.provider.replaceAll("_", " ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold">{currency(subscription.unitAmount)}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-white/48">{subscription.subscriptionStatus.replaceAll("_", " ")}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/62">
                  <span className="status-pill text-[#e4f9b8]">{subscription.billingState.replaceAll("_", " ")}</span>
                  <span className="status-pill text-white/72">{subscription.entitlementStatus.replaceAll("_", " ")}</span>
                  <span className="status-pill text-white/72">{subscription.subjectType}</span>
                </div>
              </div>
            )) : <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Subscription rows will appear here as barber and shop monetization state is tracked in the live environment.</div>}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="surface-label">Offer and service-volume performance</p>
              <p className="mt-2 text-sm text-white/58">Promotion redemptions, discount impact, barber contribution, and rebooking-linked service volume stay grounded in persisted appointment and payout truth.</p>
            </div>
            <span className="status-pill text-[#e4f9b8]">{monetization.promotions.totalRedemptions} total redemptions</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Discount impact</p><p className="mt-3 text-2xl font-semibold">{currency(monetization.promotions.totalDiscountImpact)}</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Attributed service volume</p><p className="mt-3 text-2xl font-semibold">{currency(monetization.promotions.attributedRevenue)}</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Rebooking influenced</p><p className="mt-3 text-2xl font-semibold">{currency(monetization.growth.rebookingInfluencedRevenue)}</p></div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="surface-label">Top-performing offers</p>
              {monetization.promotions.topOffers.length ? monetization.promotions.topOffers.map((offer) => (
                <div key={offer.promotionId} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{offer.promotionName}</p>
                    <span className="status-pill text-[#e4f9b8]">{offer.redemptions} redeems</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">{offer.shopLabel} | {offer.availabilityState}</p>
                  <p className="mt-2 text-sm text-white/58">Discount {currency(offer.discountImpact)} | Net service volume {currency(offer.netRevenueAfterDiscount)} | Avg {currency(offer.averageDiscount)}</p>
                </div>
              )) : <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Promotion performance will appear here after offers are redeemed through live bookings.</div>}
            </div>

            <div className="space-y-3">
              <p className="surface-label">Barber contribution</p>
              {monetization.barberContribution.length ? monetization.barberContribution.map((row) => (
                <div key={row.barberId} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{row.barberName}</p>
                    <span className="status-pill text-[#e4f9b8]">{currency(row.grossRevenue)}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">Completed services {row.completedServices} | Repeat-client service volume {currency(row.repeatClientRevenue)}</p>
                  <p className="mt-2 text-sm text-white/58">Platform fee generated {currency(row.platformFeeGenerated)}</p>
                </div>
              )) : <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Barber contribution reporting will populate as completed appointment and routing records accumulate.</div>}
            </div>
          </div>
        </Card>
      </section>

      {money ? (
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="surface-label">Money command</p>
              <p className="mt-2 text-sm text-white/58">Gross-to-net clarity, payout flow, points incentive cost, and cash-out review all now read from the same reconstructable money layer.</p>
            </div>
            <span className="status-pill text-[#e4f9b8]">{viewerRole === "owner" ? "Owner controls" : "Manager visibility"}</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4">
              <p className="surface-label text-[#e4f9b8]">Net routed service amount</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">{currency(money.revenueBreakdown.netRevenue)}</p>
              <p className="mt-2 text-sm text-white/62">Operational routing context after platform and processor fees · not shop revenue.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Pending payouts</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">{currency(money.payoutFlow.pendingAmount + money.payoutFlow.queuedAmount)}</p>
              <p className="mt-2 text-sm text-white/58">Still waiting on execution or threshold readiness.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Paid out</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">{currency(money.payoutFlow.paidAmount)}</p>
              <p className="mt-2 text-sm text-white/58">Completed payout value already sent through the payout rails.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Reward cost rate</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">{money.pointsCostVsRevenue}%</p>
              <p className="mt-2 text-sm text-white/58">Issued points cost as a share of current gross service volume.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Refund rate</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">{money.refundRate}%</p>
              <p className="mt-2 text-sm text-white/58">Refund pressure on the live appointment set in this scope.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
            <div className="space-y-4">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Service-payment breakdown</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Gross {currency(money.revenueBreakdown.grossRevenue)}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Platform fees {currency(money.revenueBreakdown.platformFeeRevenue)}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Processor fees {currency(money.revenueBreakdown.processorFeeVisibility)}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Subscriptions {currency(money.revenueBreakdown.subscriptionRevenue)}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="status-pill text-[#e4f9b8]">Service volume per user {currency(money.revenuePerUser)}</span>
                  <span className="status-pill text-white/72">Barber service-volume growth {money.barberEarningsGrowth}%</span>
                  <span className="status-pill text-white/72">Avg payout delay {money.payoutFlow.avgPayoutDelayHours}h</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" className="h-10 px-4" onClick={() => window.open(money.exports.taxSummaryPath, "_blank", "noopener,noreferrer")}>
                    Open tax summary
                  </Button>
                  <Button type="button" variant="secondary" className="h-10 px-4" onClick={() => window.open(money.exports.payoutsPath, "_blank", "noopener,noreferrer")}>
                    Export payouts
                  </Button>
                  <Button type="button" variant="secondary" className="h-10 px-4" onClick={() => window.open(money.exports.revenuePath, "_blank", "noopener,noreferrer")}>
                    Export service-volume report
                  </Button>
                  <Button type="button" variant="secondary" className="h-10 px-4" onClick={() => window.open(money.exports.incentivesPath, "_blank", "noopener,noreferrer")}>
                    Export incentives
                  </Button>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Payout flow visibility</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Pending {currency(money.payoutFlow.pendingAmount)}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Queued {currency(money.payoutFlow.queuedAmount)}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">In transit {currency(money.payoutFlow.inTransitAmount)}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Paid {currency(money.payoutFlow.paidAmount)}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Failed {currency(money.payoutFlow.failedAmount)}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Reversed {currency(money.payoutFlow.reversedAmount)}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="status-pill text-white/72">Booth rent paid {money.boothRent.paid}</span>
                  <span className="status-pill text-white/72">Booth rent due {money.boothRent.due}</span>
                  <span className="status-pill text-amber-200">Booth rent overdue {money.boothRent.overdue}</span>
                  <span className="status-pill text-amber-200">Overdue amount {currency(money.boothRent.overdueAmount)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Points cash-out review</p>
                  <p className="mt-2 text-sm text-white/58">Review queue, fraud flags, and payout references stay on one audit trail. Owners can transition requests here without creating a parallel payout tool.</p>
                </div>
                <span className="status-pill text-[#e4f9b8]">{money.recentCashouts.length} recent requests</span>
              </div>

              <div className="mt-4 space-y-3">
                {money.recentCashouts.length ? money.recentCashouts.map((request) => (
                  <div key={request.requestId} className="rounded-[18px] border border-white/8 bg-black/25 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{request.userLabel}</p>
                        <p className="mt-1 text-sm text-white/58">{request.role} | {request.pointsRequested} pts | {currency(request.cashValue)}</p>
                      </div>
                      <span className={`status-pill ${request.status === "paid" ? "text-[#e4f9b8]" : request.status === "rejected" ? "text-rose-200" : "text-white/72"}`}>
                        {request.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {request.fraudFlags.length ? request.fraudFlags.map((flag) => (
                        <span key={flag} className="status-pill text-amber-200">{flag}</span>
                      )) : <span className="status-pill text-white/72">No fraud flags</span>}
                      {request.payoutReference ? <span className="status-pill text-white/72">{request.payoutReference}</span> : null}
                    </div>
                    {request.reviewNote ? <p className="mt-3 text-sm text-white/58">{request.reviewNote}</p> : null}
                    {request.failureReason ? <p className="mt-2 text-sm text-amber-200">{request.failureReason}</p> : null}
                    {canManageCashouts || canExecuteCashouts ? (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {request.canReview ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-10 px-4"
                            disabled={cashoutActionPending}
                            onClick={() => void handleCashoutReviewAction({ requestId: request.requestId, action: "review", fraudFlags: request.fraudFlags })}
                          >
                            {reviewCashoutMutation.isPending ? "Reviewing..." : "Mark under review"}
                          </Button>
                        ) : null}
                        {request.canApprove ? (
                          <Button
                            type="button"
                            className="h-10 px-4"
                            disabled={cashoutActionPending}
                            onClick={() => void handleCashoutReviewAction({ requestId: request.requestId, action: "approve" })}
                          >
                            {approveCashoutMutation.isPending ? "Approving..." : "Approve"}
                          </Button>
                        ) : null}
                        {request.canReject ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-10 px-4"
                            disabled={cashoutActionPending}
                            onClick={() => void handleCashoutReviewAction({ requestId: request.requestId, action: "reject", fraudFlags: request.fraudFlags })}
                          >
                            {rejectCashoutMutation.isPending ? "Rejecting..." : "Reject"}
                          </Button>
                        ) : null}
                        {request.canMarkPaid && canExecuteCashouts ? (
                          <Button
                            type="button"
                            className="h-10 px-4"
                            disabled={cashoutActionPending}
                            onClick={() => void handleCashoutExecutionAction({ requestId: request.requestId, action: "paid" })}
                          >
                            {markPaidCashoutMutation.isPending ? "Marking paid..." : "Mark paid"}
                          </Button>
                        ) : null}
                        {request.canMarkFailed && canExecuteCashouts ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-10 px-4"
                            disabled={cashoutActionPending}
                            onClick={() => void handleCashoutExecutionAction({ requestId: request.requestId, action: "failed" })}
                          >
                            {markFailedCashoutMutation.isPending ? "Marking failed..." : "Mark failed"}
                          </Button>
                        ) : null}
                        {request.canReverse && viewerRole === "owner" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-10 px-4"
                            disabled={cashoutActionPending}
                            onClick={() => void handleCashoutExecutionAction({ requestId: request.requestId, action: "reverse" })}
                          >
                            {reverseCashoutMutation.isPending ? "Reversing..." : "Reverse"}
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-white/52">Owner or manager financial permissions are required to change cash-out lifecycle state.</p>
                    )}
                  </div>
                )) : (
                  <div className="empty-state-panel rounded-[18px] p-5 text-sm text-white/58">
                    Cash-out review requests will appear here as barbers and owners request earned-point payouts.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Scheduled execution health</p>
                  <p className="mt-2 text-sm text-white/58">Recurring finance and growth jobs now write canonical execution records instead of relying on invisible helper calls.</p>
                </div>
                <span className="status-pill text-[#e4f9b8]">{money.scheduledJobs.summary.running} running</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-[18px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 px-3 py-3 text-sm text-white/72">Completed {money.scheduledJobs.summary.completed}</div>
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Queued {money.scheduledJobs.summary.queued}</div>
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Running {money.scheduledJobs.summary.running}</div>
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Failed {money.scheduledJobs.summary.failed}</div>
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Skipped {money.scheduledJobs.summary.skipped}</div>
              </div>
              <Button className="mt-4 h-11 px-5" variant="secondary" disabled={runScheduledJobsMutation.isPending} onClick={() => void handleRunScheduledJobs()}>
                {runScheduledJobsMutation.isPending ? "Running scheduled jobs..." : "Run scheduled jobs"}
              </Button>
              <div className="mt-4 space-y-3">
                {money.scheduledJobs.recentRuns.length ? money.scheduledJobs.recentRuns.slice(0, 5).map((run) => (
                  <div key={run.id} className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium">{run.jobName.replaceAll("_", " ")}</p>
                      <span className={`status-pill ${run.status === "completed" ? "text-[#e4f9b8]" : run.status === "failed" ? "text-rose-200" : "text-white/72"}`}>
                        {run.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-white/58">Started {run.startedAt.replace("T", " ").slice(0, 16)} | scope {run.scopeKey}</p>
                    {run.lastError ? <p className="mt-2 text-sm text-rose-200">{run.lastError}</p> : null}
                  </div>
                )) : <div className="empty-state-panel rounded-[18px] p-5 text-sm text-white/58">Scheduled finance and growth runs will appear here once the recurring execution layer starts firing.</div>}
              </div>
            </div>

            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Financial anomaly queue</p>
                  <p className="mt-2 text-sm text-white/58">Payout stalls, cash-out failures, refund hold mismatches, and liability spikes are now persisted as operator-visible exceptions.</p>
                </div>
                <span className="status-pill text-[#e4f9b8]">{money.anomalies.summary.open} open</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="status-pill text-white/72">Investigating {money.anomalies.summary.investigating}</span>
                <span className="status-pill text-white/72">Resolved {money.anomalies.summary.resolved}</span>
                <span className="status-pill text-white/72">Dismissed {money.anomalies.summary.dismissed}</span>
                <span className="status-pill text-amber-200">Critical {money.anomalies.summary.critical}</span>
              </div>
              <div className="mt-4 space-y-3">
                {money.anomalies.items.length ? money.anomalies.items.slice(0, 5).map((anomaly) => (
                  <div key={anomaly.id} className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium">{anomaly.summary}</p>
                      <span className={`status-pill ${anomaly.severity === "critical" ? "text-amber-200" : anomaly.status === "resolved" ? "text-[#e4f9b8]" : "text-white/72"}`}>
                        {anomaly.status.replaceAll("_", " ")} / {anomaly.severity}
                      </span>
                    </div>
                    {anomaly.description ? <p className="mt-2 text-sm text-white/58">{anomaly.description}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {anomaly.appointmentId ? <span className="status-pill text-white/72">Appointment {anomaly.appointmentId}</span> : null}
                      {anomaly.cashoutRequestId ? <span className="status-pill text-white/72">Cash-out {anomaly.cashoutRequestId}</span> : null}
                      {anomaly.paymentId ? <span className="status-pill text-white/72">Payment {anomaly.paymentId}</span> : null}
                    </div>
                    {viewerRole === "owner" || viewerRole === "manager" ? (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {anomaly.status === "open" || anomaly.status === "investigating" ? (
                          <>
                            <Button
                              type="button"
                              className="h-10 px-4"
                              disabled={anomalyActionPending}
                              onClick={() => void handleAnomalyAction({ anomalyId: anomaly.id, action: "resolve" })}
                            >
                              {resolveAnomalyMutation.isPending ? "Resolving..." : "Resolve"}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-10 px-4"
                              disabled={anomalyActionPending}
                              onClick={() => void handleAnomalyAction({ anomalyId: anomaly.id, action: "dismiss" })}
                            >
                              {dismissAnomalyMutation.isPending ? "Dismissing..." : "Dismiss"}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )) : <div className="empty-state-panel rounded-[18px] p-5 text-sm text-white/58">No persisted payout or cash-out anomalies are currently open in this scope.</div>}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3"><p className="surface-label">Retention signals</p><RefreshCcw className="h-5 w-5 text-[#d9f985]" /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Repeat client rate</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.retention.repeatClientRate}%</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Rebooking effectiveness</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.retention.rebookingEffectiveness}%</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Points issued</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.retention.loyaltyPointsIssued}</p><p className="mt-2 text-sm text-white/58">Ready to feed conversion reporting and ranking weight later.</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Referral invites</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.marketplace.referralInvites}</p><p className="mt-2 text-sm text-white/58">Tracked invites flowing through the client growth loop.</p></div>
            <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Rebooking opportunities</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.retention.rebookingOpportunities}</p><p className="mt-2 text-sm text-white/62">Clients due soon, due now, or overdue without an active booking.</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">High-risk clients</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.retention.churnRiskClients}</p><p className="mt-2 text-sm text-white/58">Repeat guests whose current cadence suggests a retention save opportunity.</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Re-engagement eligible</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.retention.reengagementEligibleClients}</p><p className="mt-2 text-sm text-white/58">Good candidates for reminder, promo, or follow-up automation later.</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Loyal clients</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.retention.loyalClients}</p><p className="mt-2 text-sm text-white/58">Clients already behaving like reliable repeat business.</p></div>
          </div>
          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/64">Discovery impressions {summary.marketplace.discoveryImpressions} | Profile views {summary.marketplace.profileViews} | Shares {summary.marketplace.shareCount} | Haircut-now signals {summary.marketplace.haircutNowImpressions}</div>
          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Discovery conversion</p>
              <Target className="h-4 w-4 text-[#d9f985]" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">
                <p className="surface-label">Discovery to booking</p>
                <p className="mt-2 text-2xl font-semibold">{summary.marketplace.discoveryToBookingRate}%</p>
                <p className="mt-2 text-sm text-white/58">{summary.marketplace.discoveryImpressions} discovery impressions</p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">
                <p className="surface-label">Profile to booking</p>
                <p className="mt-2 text-2xl font-semibold">{summary.marketplace.profileToBookingRate}%</p>
                <p className="mt-2 text-sm text-white/58">{summary.marketplace.profileViews} profile views</p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">
                <p className="surface-label">Click to booking</p>
                <p className="mt-2 text-2xl font-semibold">{summary.marketplace.clickToBookingRate}%</p>
                <p className="mt-2 text-sm text-white/58">{summary.marketplace.bookingClicks} booking CTA clicks</p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">
                <p className="surface-label">Referral shares</p>
                <p className="mt-2 text-2xl font-semibold">{summary.marketplace.referralShares}</p>
                <p className="mt-2 text-sm text-white/58">{summary.marketplace.followsCreated} favorite or follow actions tracked</p>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-3">{summary.bookingTrends.map((trend) => <div key={trend.label} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{trend.label}</p><span className="status-pill text-[#e4f9b8]">{trend.value}</span></div></div>)}</div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Top returning clients</p>
              <div className="mt-4 space-y-3">
                {summary.topReturningClients.length ? summary.topReturningClients.map((client) => (
                  <div key={client.clientId} className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{client.clientName}</p>
                      <span className="status-pill text-[#e4f9b8]">{client.completedVisits} visits</span>
                    </div>
                    <p className="mt-2 text-sm text-white/58">Lifetime value {currency(client.lifetimeValue)} | {client.loyaltySegment.replaceAll("_", " ")} | {client.churnRisk} risk</p>
                  </div>
                )) : <div className="empty-state-panel rounded-[18px] p-4 text-sm text-white/58">Returning-client intelligence will appear here as more completed appointments build history.</div>}
              </div>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Barber retention visibility</p>
              <div className="mt-4 space-y-3">
                {summary.barberRetention.length ? summary.barberRetention.map((row) => (
                  <div key={row.barberId} className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{row.barberName}</p>
                      <span className="status-pill text-[#e4f9b8]">{row.rebookingOpportunities} rebook opps</span>
                    </div>
                    <p className="mt-2 text-sm text-white/58">Repeat clients {row.repeatClients} | At-risk {row.atRiskClients} | Completed services {row.completedServices}</p>
                  </div>
                )) : <div className="empty-state-panel rounded-[18px] p-4 text-sm text-white/58">Barber retention visibility will populate as the intelligence tables refresh.</div>}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3"><p className="surface-label">Top barbers in scope</p><Users className="h-5 w-5 text-[#d9f985]" /></div>
            <div className="mt-4 space-y-3">{summary.topBarbers.map((barber) => <div key={barber.barberId} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{barber.barberName}</p><span className="status-pill text-[#e4f9b8]">{currency(barber.revenue)} service volume</span></div><div className="mt-3 grid gap-3 text-sm text-white/60 sm:grid-cols-3"><div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">Followers {barber.followerCount}</div><div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">Reputation {barber.reputationScore.toFixed(1)}</div><div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">Service volume {currency(barber.revenue)}</div></div></div>)}</div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3"><p className="surface-label">Notification hooks</p><HandCoins className="h-5 w-5 text-[#d9f985]" /></div>
            <div className="mt-4 space-y-3">{summary.recentNotifications.length ? summary.recentNotifications.map((notification) => <div key={notification.id} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{notification.title}</p><span className="status-pill text-[#e4f9b8]">{notification.type.replaceAll("_", " ")}</span></div><p className="mt-2 text-sm leading-7 text-white/60">{notification.body}</p></div>) : <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Owner-facing engagement alerts will appear here as the growth engine begins firing live notifications.</div>}</div>
            <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/64">Nearby-client instant booking alerts, loyalty milestone nudges, referral monitoring, verification updates, and push-ready activation all route through the same delivery ledger.</div>
            <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/64">Top growth sources: {summary.marketplace.topSources.length ? summary.marketplace.topSources.map((source) => `${source.sourceKind} ${source.count}`).join(" | ") : "Building source attribution"}</div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3"><p className="surface-label">Automation command</p><RefreshCcw className="h-5 w-5 text-[#d9f985]" /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Due now</p><p className="mt-3 text-3xl font-semibold" data-display="true">{automation.dueNowRuns}</p><p className="mt-2 text-sm text-white/62">Queued reminders that can safely run right now.</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Pending runs</p><p className="mt-3 text-3xl font-semibold" data-display="true">{automation.pendingRuns}</p><p className="mt-2 text-sm text-white/58">Still waiting on their due window or the next execution pass.</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Backlog</p><p className="mt-3 text-3xl font-semibold" data-display="true">{automation.backlogRuns}</p><p className="mt-2 text-sm text-white/58">Runs currently pending, queued, processing, or waiting on retry.</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Retry scheduled</p><p className="mt-3 text-3xl font-semibold" data-display="true">{automation.retryScheduledRuns}</p><p className="mt-2 text-sm text-white/58">Transient failures that have a next retry window already scheduled.</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Retry count</p><p className="mt-3 text-3xl font-semibold" data-display="true">{automation.retryCount}</p><p className="mt-2 text-sm text-white/58">Bounded retry attempts across automation runs in the current scope.</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Completed</p><p className="mt-3 text-3xl font-semibold" data-display="true">{automation.completedRuns}</p><p className="mt-2 text-sm text-white/58">Automation actions already written into the delivery ledger.</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Failed</p><p className="mt-3 text-3xl font-semibold" data-display="true">{automation.failedRuns}</p><p className="mt-2 text-sm text-white/58">Runs that need a later retry or operator review.</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="status-pill text-[#e4f9b8]">{automation.rebookingReminderEligible} rebooking eligible</span>
              <span className="status-pill text-white/72">{automation.reengagementEligible} re-engagement eligible</span>
              <span className="status-pill text-white/72">{automation.promotionEligible} promotion eligible</span>
              <span className="status-pill text-white/72">{automation.rewardEligible} reward eligible</span>
              <span className="status-pill text-white/72">{automation.completionRate}% completion rate</span>
              <span className="status-pill text-white/72">{automation.failureRate}% failure rate</span>
            </div>
            <Button className="mt-4 h-11 px-5" variant="secondary" disabled={automationMutation.isPending} onClick={() => void handleRunAutomations()}>
              {automationMutation.isPending ? "Running due automations..." : "Run due automations"}
            </Button>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="space-y-3">
              {automation.topPendingClients.length ? automation.topPendingClients.map((run) => (
                <div key={`${run.clientId}-${run.automationType}-${run.dueAt}`} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{run.clientEmail}</p>
                    <span className="status-pill text-[#e4f9b8]">{run.automationType.replaceAll("_", " ")}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">{run.title}</p>
                </div>
              )) : <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Due rebooking, retention, promotion, and reward follow-ups will queue here when the intelligence layer says they are ready.</div>}
              </div>
              <div className="space-y-3">
                {automation.recentActivity.length ? automation.recentActivity.map((activity) => (
                  <div key={activity.eventId} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{activity.clientEmail ?? activity.clientId}</p>
                      <span className="status-pill text-[#e4f9b8]">{activity.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/58">{activity.automationType.replaceAll("_", " ")} via {activity.triggerSource}</p>
                    <p className="mt-2 text-sm text-white/58">{activity.reason ?? "Recent lifecycle activity is available for this run."}</p>
                  </div>
                )) : <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Recent automation lifecycle activity will appear here once runs start processing and retries begin flowing.</div>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {automation.channelBreakdown.length ? automation.channelBreakdown.map((channel) => (
                <span key={channel.channel} className="status-pill text-white/72">
                  {channel.channel} d{channel.delivered} q{channel.queued} r{channel.retrying} f{channel.failed} p{channel.placeholder}
                </span>
              )) : <span className="status-pill text-white/72">Channel diagnostics will populate after delivery attempts run.</span>}
            </div>
          </Card>
        </div>
      </section>

      {summary.trust ? (
        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3"><p className="surface-label">Trust and verification command</p><ShieldCheck className="h-5 w-5 text-[#d9f985]" /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Open reports</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.trust.openReports}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Open disputes</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.trust.openDisputes}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">High-risk flags</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.trust.highRiskFlags}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Integrity alerts</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.trust.reviewIntegrityAlerts}</p></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Staff verified</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.trust.staffVerification.verified}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Pending</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.trust.staffVerification.pending}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Expired or rejected</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.trust.staffVerification.expired + summary.trust.staffVerification.rejected}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{summary.trust.shopTrustBadges.length ? summary.trust.shopTrustBadges.map((badge) => <span key={badge} className="status-pill text-[#e4f9b8]">{badge}</span>) : <span className="status-pill text-white/72">Shop trust badges will appear here as verification clears.</span>}</div>
            <div className="mt-4 space-y-3">{summary.trust.shopStatuses.map((shop) => <div key={shop.shopId} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium">{shop.shopName}</p><span className={`status-pill ${shop.status === "verified" ? "text-[#e4f9b8]" : shop.status === "pending" ? "text-amber-200" : "text-white/72"}`}>{shop.badgeLabel}</span></div><p className="mt-2 text-sm text-white/58">Verified categories: {shop.verifiedCategories.length ? shop.verifiedCategories.map((category) => category.replaceAll("_", " ")).join(" | ") : "Verification still in progress"}</p></div>)}</div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3"><p className="surface-label">Activation and monetization</p><Globe2 className="h-5 w-5 text-[#d9f985]" /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Boost impressions</p><p className="mt-3 text-3xl font-semibold">{activation?.monetizationTotals.boostImpressions ?? 0}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Featured bookings</p><p className="mt-3 text-3xl font-semibold">{activation?.monetizationTotals.featuredBookings ?? 0}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Delivered alerts</p><p className="mt-3 text-3xl font-semibold">{activation?.deliverySummary.delivered ?? 0}</p></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Push status</p><p className="mt-3 text-3xl font-semibold">{mobileSummary?.pushEnabled ? "Live" : pwa.pushPermission === "granted" ? "Ready" : "Off"}</p><p className="mt-2 text-sm text-white/58">{mobileSummary?.activeSubscriptionCount ?? 0} executive device route{(mobileSummary?.activeSubscriptionCount ?? 0) === 1 ? "" : "s"}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><div className="flex items-center justify-between gap-3"><p className="surface-label">Native-ready routes</p><Smartphone className="h-4 w-4 text-[#d9f985]" /></div><p className="mt-3 text-3xl font-semibold">{mobileSummary?.deepLinks.length ?? 0}</p><p className="mt-2 text-sm text-white/58">Owner, discovery, and leaderboard links are ready for app-open behavior.</p></div>
              <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Offline read lanes</p><p className="mt-3 text-3xl font-semibold">{mobileSummary?.offlineSupport.cachedRoutes.length ?? 0}</p><p className="mt-2 text-sm text-white/62">High-level metrics stay readable while live actions remain safely online-only.</p></div>
            </div>
            {releaseReadiness ? (
              <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="surface-label">Release readiness</p>
                    <p className="mt-2 text-sm text-white/58">Android wrapper, push bridge, env secrets, and launch docs are checked from the same runtime assumptions the wrapped app will use.</p>
                  </div>
                  <span className={`status-pill ${releaseReadiness.summary.attentionCount ? "text-amber-200" : "text-[#e4f9b8]"}`}>
                    {releaseReadiness.summary.readyCount} ready / {releaseReadiness.summary.attentionCount} attention
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {releaseReadiness.checks.slice(0, 5).map((check) => (
                    <span key={check.id} className={`status-pill ${check.status === "ready" ? "text-[#e4f9b8]" : "text-amber-200"}`}>
                      {check.label}
                    </span>
                  ))}
                  <span className="status-pill text-white/72">Generated {new Date(releaseReadiness.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" className="h-11 px-5" onClick={() => window.open("/api/release/readiness", "_blank", "noopener,noreferrer")}>
                    Open readiness JSON
                  </Button>
                  <span className="inline-flex items-center text-sm text-white/54">
                    Use alongside <code className="ml-1 rounded bg-black/25 px-1.5 py-0.5 text-[12px]">npm run release:check</code>
                  </span>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              {mobileSummary?.pushEnabled ? <Button className="h-11 px-5" variant="secondary" onClick={() => void handleDisablePush()}>Turn off owner alerts</Button> : <Button className="h-11 px-5" variant="secondary" onClick={handleRequestPush}>Enable owner alerts</Button>}
              <span className="status-pill text-white/62">Marketplace highlights, trust alerts, and activation signals can now route through the mobile layer.</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3"><p className="surface-label">Shop verification upload</p><UploadCloud className="h-4 w-4 text-[#d9f985]" /></div>
                  <Input className="mt-4" value={shopDocumentName} onChange={(event) => setShopDocumentName(event.target.value)} />
                  <Button className="mt-4 h-11 w-full" disabled={isPending} onClick={() => void handleShopVerification()}>{uploadMutation.isPending || submitShopVerificationMutation.isPending ? "Submitting verification..." : "Submit shop verification"}</Button>
                  <div className="mt-4 rounded-[18px] border border-white/8 bg-black/25 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="surface-label">Stripe provider status</p>
                      <span className="status-pill text-white/72">{ownerVerificationProfile?.providerStatuses.length ?? 0} linked provider lane{(ownerVerificationProfile?.providerStatuses.length ?? 0) === 1 ? "" : "s"}</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {ownerVerificationProfile?.providerStatuses.length ? ownerVerificationProfile.providerStatuses.map((provider) => (
                        <div key={provider.id} className="rounded-[16px] border border-white/8 bg-black/20 px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-white">{provider.providerSubject.replaceAll("_", " ")}</p>
                            {provider.providerStatus ? <span className="status-pill text-white/72">{provider.providerStatus.replaceAll("_", " ")}</span> : null}
                          </div>
                          <p className="mt-2 text-sm text-white/62">{provider.summary}</p>
                          {provider.remediationMessage ? <p className="mt-2 text-sm text-[#e4f9b8]">{provider.remediationMessage}</p> : null}
                          {provider.requirementsCurrentlyDue.length ? <p className="mt-2 text-sm text-white/58">Current requirements: {provider.requirementsCurrentlyDue.join(" | ")}</p> : null}
                          {provider.requirementsPastDue.length ? <p className="mt-2 text-sm text-amber-200">Past due: {provider.requirementsPastDue.join(" | ")}</p> : null}
                        </div>
                      )) : <div className="rounded-[16px] border border-dashed border-white/10 bg-black/20 px-3 py-3 text-sm text-white/58">Stripe payout and compliance readiness will appear here after onboarding starts.</div>}
                    </div>
                    <Button className="mt-4 h-11 w-full" variant="secondary" disabled={isPending || viewerRole !== "owner"} onClick={() => void handleOwnerConnectOnboarding()}>{connectOnboardingMutation.isPending ? "Opening Stripe Connect..." : "Open Stripe Connect onboarding"}</Button>
                  </div>
                </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Launch-market controls</p>
                <div className="mt-4 space-y-3">
                  <Button className="h-11 w-full" variant="secondary" disabled={isPending} onClick={() => void handleFeaturedPlacement()}>{featureMutation.isPending ? "Scheduling featured slot..." : "Activate featured barber slot"}</Button>
                  <Button className="h-11 w-full" variant="secondary" disabled={isPending} onClick={() => void handleCityRollout()}>{rolloutMutation.isPending ? "Updating rollout..." : "Promote St. Pete to live"}</Button>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-3">{activation?.boostCampaigns.length ? activation.boostCampaigns.slice(0, 3).map((campaign) => <div key={campaign.id} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{campaign.placementLabel}</p><span className="status-pill text-[#e4f9b8]">{currency(campaign.spendCents / 100)}</span></div><p className="mt-2 text-sm text-white/58">{campaign.trustReason}</p></div>) : <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Boost campaigns will appear here once premium placement inventory is active.</div>}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">{activation?.topMarkets.map((market) => <div key={market.citySlug} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{market.cityLabel}</p><span className="status-pill text-[#e4f9b8]">{market.activationState}</span></div><p className="mt-2 text-sm text-white/58">Density {market.densityScore}</p></div>)}</div>
          </Card>
        </section>
      ) : null}
    </section>
  );
}

