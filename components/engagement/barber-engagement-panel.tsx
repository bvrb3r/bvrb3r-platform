"use client";

import { useState } from "react";
import { Award, Crown, ShieldCheck, Smartphone, TrendingUp, UploadCloud, Zap } from "lucide-react";
import { usePwa } from "@/components/pwa/pwa-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useBarberEngagementSummary, type EngagementApiError } from "@/lib/engagement/client";
import { useMobileActivationSummary } from "@/lib/mobile/client";
import { useCreateBoostCampaignMutation } from "@/lib/marketplace/activation-client";
import {
  useCreateVerificationUploadMutation,
  useStartBarberConnectOnboardingMutation,
  useStartBarberIdentitySessionMutation,
  useSubmitBarberVerificationMutation,
  useVerificationMe,
  type TrustApiError
} from "@/lib/trust/client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

function PanelSkeleton() {
  return (
    <Card className="rounded-[32px] p-6">
      <Skeleton className="h-5 w-44" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Skeleton className="h-28 w-full rounded-[24px]" />
        <Skeleton className="h-28 w-full rounded-[24px]" />
        <Skeleton className="h-28 w-full rounded-[24px]" />
        <Skeleton className="h-28 w-full rounded-[24px]" />
        <Skeleton className="h-28 w-full rounded-[24px]" />
        <Skeleton className="h-28 w-full rounded-[24px]" />
      </div>
    </Card>
  );
}

export function BarberEngagementPanel() {
  const summaryQuery = useBarberEngagementSummary();
  const mobileSummaryQuery = useMobileActivationSummary();
  const pwa = usePwa();
  const uploadMutation = useCreateVerificationUploadMutation();
  const submitVerificationMutation = useSubmitBarberVerificationMutation();
  const verificationMeQuery = useVerificationMe();
  const identitySessionMutation = useStartBarberIdentitySessionMutation();
  const connectOnboardingMutation = useStartBarberConnectOnboardingMutation();
  const boostMutation = useCreateBoostCampaignMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [verificationCategory, setVerificationCategory] = useState<"identity_verification" | "license_verification" | "payout_verification" | "shop_affiliation_verification">("license_verification");
  const [legalName, setLegalName] = useState("Wave Carter");
  const [fileName, setFileName] = useState("updated-license.pdf");
  const [licenseNumber, setLicenseNumber] = useState("FL-BR-884201");
  const [issuingState, setIssuingState] = useState("FL");
  const [expirationDate, setExpirationDate] = useState("2027-06-30");

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
        <FeedbackBanner tone="error" message="Something went wrong while loading your barber engagement view. Please try again." />
      </Card>
    );
  }

  const summary = summaryQuery.data;
  const activation = summary.activation;
  const mobileSummary = mobileSummaryQuery.data;
  const isPending = uploadMutation.isPending
    || submitVerificationMutation.isPending
    || identitySessionMutation.isPending
    || connectOnboardingMutation.isPending
    || boostMutation.isPending;
  const barberVerificationProfile = verificationMeQuery.data?.profiles.find((profile) => profile.role === "barber");

  async function handleVerificationSubmit() {
    setFeedback(null);
    try {
      await uploadMutation.mutateAsync({
        ownerType: "barber",
        category: verificationCategory,
        fileName,
        contentType: "application/pdf",
        fileSizeBytes: 240000,
        expiresAt: verificationCategory === "license_verification" ? expirationDate : undefined
      });
      await submitVerificationMutation.mutateAsync({
        category: verificationCategory,
        legalName,
        licenseType: verificationCategory === "license_verification" ? "State barber license" : undefined,
        licenseNumber: verificationCategory === "license_verification" ? licenseNumber : undefined,
        issuingState: verificationCategory === "license_verification" ? issuingState : undefined,
        expirationDate: verificationCategory === "license_verification" ? expirationDate : undefined
      });
      setFeedback({ tone: "success", message: "Verification document captured securely and submitted for trust review." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as TrustApiError) });
    }
  }

  async function handleBoostLaunch() {
    setFeedback(null);
    try {
      await boostMutation.mutateAsync({
        scopeType: "barber",
        placementLabel: "Boosted in Tampa discovery",
        placementScope: "discover_city",
        citySlug: "tampa-bay",
        dailyBudgetCents: 4500,
        spendCents: 18000
      });
      setFeedback({ tone: "success", message: "Premium visibility is live. Discovery ranking now includes a trust-aware boost for your public profile." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as EngagementApiError) });
    }
  }

  async function handleIdentityLaunch() {
    setFeedback(null);
    try {
      const result = await identitySessionMutation.mutateAsync();
      if (result.url && typeof window !== "undefined") {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
      setFeedback({
        tone: result.degraded ? "info" : "success",
        message: result.degraded
          ? "Stripe Identity started, but provider sync is currently degraded. The verification lane is still available."
          : "Stripe Identity started. Complete the hosted verification flow to continue."
      });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as TrustApiError) });
    }
  }

  async function handleConnectOnboarding() {
    setFeedback(null);
    try {
      const result = await connectOnboardingMutation.mutateAsync();
      if (result.url && typeof window !== "undefined") {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
      setFeedback({ tone: "success", message: "Stripe Connect onboarding opened. Finish the hosted flow to unlock payout readiness." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as TrustApiError) });
    }
  }

  return (
    <section className="space-y-4" data-testid="barber-engagement-panel">
      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label text-[#e4f9b8]">Growth layer</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-4xl" data-display="true">Reputation, ranking, and marketplace momentum</h3>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/64">This layer turns your chair activity into visible proof, marketplace demand, premium visibility, and now mobile activation without mixing in anyone else&apos;s numbers.</p>
          </div>
          <span className="status-pill text-[#e4f9b8]">{summary.socialProof.trendingBadge ?? "Growth hooks scaffolded"}</span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Today</p><p className="mt-3 text-3xl font-semibold" data-display="true">{currency(summary.earnings.today)}</p><p className="mt-2 text-sm text-white/58">Earnings from today&apos;s posted chair activity</p></div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><p className="surface-label">This week</p><p className="mt-3 text-3xl font-semibold" data-display="true">{currency(summary.earnings.week)}</p><p className="mt-2 text-sm text-white/58">Seven-day earnings view for momentum tracking</p></div>
          <div className="rounded-[24px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">This month</p><p className="mt-3 text-3xl font-semibold" data-display="true">{currency(summary.earnings.month)}</p><p className="mt-2 text-sm text-white/62">Month-to-date growth signal for long-term visibility</p></div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Followers</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.followerCount}</p><p className="mt-2 text-sm text-white/58">Clients following your public profile</p></div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Profile views</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.marketplace.profileViews}</p><p className="mt-2 text-sm text-white/58">Marketplace proof your profile is getting real attention</p></div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Conversion</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.marketplace.conversionRate}%</p><p className="mt-2 text-sm text-white/58">Bookings created from clients who clicked into your chair</p></div>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3"><p className="surface-label">Reputation system</p><Award className="h-5 w-5 text-[#d9f985]" /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Overall score</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.reputation?.overallScore.toFixed(1) ?? "--"}</p><p className="mt-2 text-sm text-white/58">{summary.reputation?.tier ?? "standard"} trust tier</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Average tip</p><p className="mt-3 text-3xl font-semibold" data-display="true">{currency(summary.earnings.averageTip)}</p><p className="mt-2 text-sm text-white/58">Average from the current posted earnings window</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Client retention</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.clientInsights.retentionRate}%</p><p className="mt-2 text-sm text-white/58">Returning and VIP guests in your visible book</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Repeat clients</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.clientInsights.repeatClients}</p><p className="mt-2 text-sm text-white/58">Guests who have sat in your chair more than once</p></div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/68"><p className="surface-label">Booking clicks</p><p className="mt-3 text-2xl font-semibold text-white" data-display="true">{summary.marketplace.bookingClicks}</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/68"><p className="surface-label">Bookings closed</p><p className="mt-3 text-2xl font-semibold text-white" data-display="true">{summary.marketplace.bookingsCompleted}</p></div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/68"><p className="surface-label">Profile shares</p><p className="mt-3 text-2xl font-semibold text-white" data-display="true">{summary.marketplace.shareCount}</p></div>
          </div>
          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/68">Highest tipper in view: <span className="text-white">{summary.clientInsights.highestTipperName ?? "Building history"}</span></div>
        </Card>

        <div className="grid gap-4">
          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3"><p className="surface-label">Ranking inputs</p><TrendingUp className="h-5 w-5 text-[#d9f985]" /></div>
            <div className="mt-4 space-y-3">
              {summary.rankings.length ? summary.rankings.map((ranking) => (
                <div key={ranking.id} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                  <div className="flex items-center justify-between gap-3"><p className="font-medium">{ranking.label}</p><span className="status-pill text-[#e4f9b8]">#{ranking.rankPosition}</span></div>
                  <p className="mt-2 text-sm text-white/58">{ranking.dimension.replaceAll("_", " ")} score {ranking.score}</p>
                </div>
              )) : <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Ranking snapshots will appear here as marketplace leaderboards expand city by city.</div>}
            </div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3"><p className="surface-label">Growth coaching hooks</p><Crown className="h-5 w-5 text-[#d9f985]" /></div>
            <div className="mt-4 space-y-3">
              {summary.growthRecommendations.length ? summary.growthRecommendations.map((recommendation) => (
                <div key={recommendation.id} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
                  <div className="flex items-center justify-between gap-3"><p className="font-medium">{recommendation.title}</p><span className="status-pill text-[#e4f9b8]">{recommendation.priority}</span></div>
                  <p className="mt-2 text-sm leading-7 text-white/60">{recommendation.description}</p>
                  <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-white/40">{recommendation.actionLabel}</p>
                </div>
              )) : <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Coaching prompts will land here once more marketplace and engagement history accumulates.</div>}
            </div>
          </Card>
        </div>
      </section>

      {summary.trust ? (
        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3"><p className="surface-label">Verification and trust</p><ShieldCheck className="h-5 w-5 text-[#d9f985]" /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Trust score</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.trust.trustScore}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Verification progress</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.trust.verificationProgress}%</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Completion rate</p><p className="mt-3 text-3xl font-semibold" data-display="true">{summary.trust.completionRate}%</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{summary.trust.publicBadgePreview.length ? summary.trust.publicBadgePreview.map((badge) => <span key={badge} className="status-pill text-[#e4f9b8]">{badge}</span>) : <span className="status-pill text-white/72">Public trust badges will appear here as verification clears.</span>}</div>
            <div className="mt-4 space-y-3">{summary.trust.verificationItems.map((item) => <div key={item.category} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium">{item.label}</p><span className={`status-pill ${item.status === "verified" ? "text-[#e4f9b8]" : item.status === "pending" ? "text-amber-200" : "text-white/72"}`}>{item.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-sm text-white/58">{item.notes ?? item.nextStep}</p>{item.expiresAt ? <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/40">Expires {item.expiresAt}</p> : null}</div>)}</div>
            <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="surface-label">Provider-driven verification</p>
                <span className="status-pill text-white/72">{barberVerificationProfile?.providerStatuses.length ?? 0} linked provider lane{(barberVerificationProfile?.providerStatuses.length ?? 0) === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-4 space-y-3">
                {barberVerificationProfile?.providerStatuses.length ? barberVerificationProfile.providerStatuses.map((provider) => (
                  <div key={provider.id} className="rounded-[18px] border border-white/8 bg-black/25 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{provider.providerSubject.replaceAll("_", " ")}</p>
                      {provider.providerStatus ? <span className="status-pill text-white/72">{provider.providerStatus.replaceAll("_", " ")}</span> : null}
                    </div>
                    <p className="mt-2 text-sm text-white/62">{provider.summary}</p>
                    {provider.remediationMessage ? <p className="mt-2 text-sm text-[#e4f9b8]">{provider.remediationMessage}</p> : null}
                    {provider.requirementsCurrentlyDue.length ? <p className="mt-2 text-sm text-white/58">Current requirements: {provider.requirementsCurrentlyDue.join(" | ")}</p> : null}
                    {provider.requirementsPastDue.length ? <p className="mt-2 text-sm text-amber-200">Past due: {provider.requirementsPastDue.join(" | ")}</p> : null}
                  </div>
                )) : <div className="rounded-[18px] border border-dashed border-white/10 bg-black/25 px-4 py-4 text-sm text-white/58">Stripe verification and payout status will appear here as soon as this lane starts provider onboarding.</div>}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button className="h-11 px-5" variant="secondary" disabled={isPending} onClick={() => void handleIdentityLaunch()}>{identitySessionMutation.isPending ? "Opening Stripe Identity..." : "Verify with Stripe Identity"}</Button>
                <Button className="h-11 px-5" variant="secondary" disabled={isPending} onClick={() => void handleConnectOnboarding()}>{connectOnboardingMutation.isPending ? "Opening Connect..." : "Connect Stripe payouts"}</Button>
              </div>
            </div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-3"><p className="surface-label">Activation and premium visibility</p><Zap className="h-5 w-5 text-[#d9f985]" /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Delivered alerts</p><p className="mt-3 text-3xl font-semibold">{activation?.deliverySummary.delivered ?? 0}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Queued alerts</p><p className="mt-3 text-3xl font-semibold">{activation?.deliverySummary.queued ?? 0}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Live boosts</p><p className="mt-3 text-3xl font-semibold">{activation?.activeBoosts.length ?? 0}</p></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Push status</p><p className="mt-3 text-3xl font-semibold">{mobileSummary?.pushEnabled ? "Live" : pwa.pushPermission === "granted" ? "Ready" : "Off"}</p><p className="mt-2 text-sm text-white/58">{mobileSummary?.activeSubscriptionCount ?? 0} active device route{(mobileSummary?.activeSubscriptionCount ?? 0) === 1 ? "" : "s"}</p></div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4"><div className="flex items-center justify-between gap-3"><p className="surface-label">Native-ready links</p><Smartphone className="h-4 w-4 text-[#d9f985]" /></div><p className="mt-3 text-3xl font-semibold">{mobileSummary?.deepLinks.length ?? 0}</p><p className="mt-2 text-sm text-white/58">Chair updates, booking links, and profile routes are app-link ready.</p></div>
              <div className="rounded-[22px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-4"><p className="surface-label text-[#e4f9b8]">Offline read lanes</p><p className="mt-3 text-3xl font-semibold">{mobileSummary?.offlineSupport.cachedRoutes.length ?? 0}</p><p className="mt-2 text-sm text-white/62">Already-opened discovery and dashboard reads stay visible when signal drops.</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {mobileSummary?.pushEnabled ? <Button className="h-11 px-5" variant="secondary" onClick={() => void handleDisablePush()}>Turn off mobile alerts</Button> : <Button className="h-11 px-5" variant="secondary" onClick={() => void handleEnablePush()}>Enable chair alerts</Button>}
              <span className="status-pill text-white/62">Booking alerts, reviews, verification updates, and premium visibility changes can route here.</span>
            </div>
            <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-white/64">{activation?.monetizationEligibility.reason ?? "Activation rules are loading."}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3"><p className="surface-label">Secure verification upload</p><UploadCloud className="h-4 w-4 text-[#d9f985]" /></div>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-2 block surface-label">Verification category</label>
                    <Select value={verificationCategory} onChange={(event) => setVerificationCategory(event.target.value as typeof verificationCategory)}>
                      <option value="license_verification">License verification</option>
                      <option value="identity_verification">Identity verification</option>
                      <option value="payout_verification">Payout verification</option>
                      <option value="shop_affiliation_verification">Shop affiliation</option>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-2 block surface-label">Legal name</label>
                    <Input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
                  </div>
                  <div>
                    <label className="mb-2 block surface-label">Document name</label>
                    <Input value={fileName} onChange={(event) => setFileName(event.target.value)} />
                  </div>
                  {verificationCategory === "license_verification" ? (
                    <>
                      <Input value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} placeholder="License number" />
                      <Input value={issuingState} onChange={(event) => setIssuingState(event.target.value)} placeholder="Issuing state" />
                      <Input type="date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} />
                    </>
                  ) : null}
                  <Button className="h-11 w-full" disabled={isPending} onClick={() => void handleVerificationSubmit()}>{uploadMutation.isPending || submitVerificationMutation.isPending ? "Submitting verification..." : "Upload and submit"}</Button>
                </div>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Premium visibility</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/68">Featured placements active: {activation?.activePlacements.length ?? 0}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/68">Uploads on file: {activation?.verificationUploads.length ?? 0}</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/68">Delivery channels: {activation?.deliverySummary.channels.length ? activation.deliverySummary.channels.map((channel) => `${channel.channel} ${channel.count}`).join(" | ") : "Building delivery history"}</div>
                  <Button className="h-11 w-full" variant={activation?.monetizationEligibility.canBoostVisibility ? "primary" : "secondary"} disabled={isPending || !activation?.monetizationEligibility.canBoostVisibility} onClick={() => void handleBoostLaunch()}>{boostMutation.isPending ? "Launching boost..." : "Launch 7-day visibility boost"}</Button>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-3">{activation?.activeBoosts.length ? activation.activeBoosts.map((campaign) => <div key={campaign.id} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">{campaign.placementLabel}</p><span className="status-pill text-[#e4f9b8]">{currency(campaign.spendCents / 100)}</span></div><p className="mt-2 text-sm text-white/58">{campaign.trustReason}</p></div>) : <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">Trust-aware premium visibility will appear here once your profile meets activation requirements.</div>}</div>
          </Card>
        </section>
      ) : null}
    </section>
  );
}




