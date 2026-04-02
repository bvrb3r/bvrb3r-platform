"use client";

import { useState } from "react";
import { Gift, Link2, MailPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientReferralSummary, useCreateReferralInviteMutation, type EngagementApiError } from "@/lib/engagement/client";
import { useMarketplaceAnalyticsMutation, type MarketplaceApiError } from "@/lib/marketplace/client";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { ReferralEventRecord, ReferralStatus } from "@/types/engagement";

const referralStages: Array<{
  key: "invited" | "signed_up" | "booked" | "completed" | "credited";
  label: string;
}> = [
  { key: "invited", label: "Shared" },
  { key: "signed_up", label: "Signed up" },
  { key: "booked", label: "Booked" },
  { key: "completed", label: "Completed" },
  { key: "credited", label: "Credited" }
];

function ReferralSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="rounded-[32px] p-6"><Skeleton className="h-48 w-full rounded-[24px]" /></Card>
      <div className="grid gap-4 lg:grid-cols-5">
        {referralStages.map((stage) => (
          <Card key={stage.key} className="rounded-[28px] p-5"><Skeleton className="h-20 w-full rounded-[20px]" /></Card>
        ))}
      </div>
      <Card className="rounded-[32px] p-6"><Skeleton className="h-56 w-full rounded-[24px]" /></Card>
    </div>
  );
}

function getStageIndex(status: ReferralStatus) {
  return referralStages.findIndex((stage) => stage.key === status);
}

function getStatusLabel(status: ReferralStatus) {
  if (status === "invited") {
    return "shared";
  }

  return status.replaceAll("_", " ");
}

function getReferralDateLabel(referral: ReferralEventRecord) {
  const timestamp = referral.creditedAt
    ?? referral.completedAt
    ?? referral.bookedAt
    ?? referral.signedUpAt
    ?? referral.createdAt;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export function ReferralsWorkspace() {
  const summaryQuery = useClientReferralSummary();
  const inviteMutation = useCreateReferralInviteMutation();
  const analyticsMutation = useMarketplaceAnalyticsMutation();
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);

  async function handleShareLink() {
    if (!summaryQuery.data) {
      return;
    }

    setFeedback(null);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: "Join BVRB3R Marketplace",
          text: summaryQuery.data.shareMessage,
          url: summaryQuery.data.inviteLink
        });
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summaryQuery.data.inviteLink);
      }

      await analyticsMutation.mutateAsync({
        eventType: "referral_shared",
        sourceKind: "client_dashboard",
        sourceReference: summaryQuery.data.referralCode?.code,
        metadata: { channel: typeof navigator !== "undefined" && typeof navigator.share === "function" ? "native_share" : "copy_link" }
      });
      setFeedback({ tone: "success", message: "Referral link ready. Progress will update as the invite moves from shared to credited." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as MarketplaceApiError) });
    }
  }

  async function handleInvite() {
    if (!email.trim()) {
      setFeedback({ tone: "error", message: "Enter an email address to send a referral invite." });
      return;
    }

    setFeedback(null);
    try {
      await inviteMutation.mutateAsync({ referredClientEmail: email.trim() });
      setEmail("");
      setFeedback({ tone: "success", message: "Referral shared. Points only post after the invited client completes a paid service." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as EngagementApiError) });
    }
  }

  if (summaryQuery.isLoading && !summaryQuery.data) {
    return <ReferralSkeleton />;
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <Card className="rounded-[32px] p-6">
        <FeedbackBanner tone="error" message="Something went wrong while loading referrals. Please try again." />
      </Card>
    );
  }

  const summary = summaryQuery.data;
  const shareOfferLabel = `${summary.referralCode?.rewardPoints ?? 0} pts after the first paid service closes`;

  return (
    <div className="space-y-4" data-testid="referrals-workspace">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="surface-label text-[#d7ffab]">Referral growth loop</p>
            <h3 className="mt-3 text-4xl font-semibold sm:text-5xl" data-display="true">Share one clean invite. Earn when the visit really closes.</h3>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/64">
              Referrals stay closed-loop and honest: shared, signed up, booked, completed, then credited. No fake signup rewards and no early unlocks.
            </p>
          </div>
          <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4 text-sm text-white/68">
            <p className="surface-label text-[#d7ffab]">Your offer</p>
            <p className="mt-3 text-2xl font-semibold" data-display="true">{summary.referralCode?.code ?? "BVRB3R"}</p>
            <p className="mt-2 text-white/58">{shareOfferLabel}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-5">
            <p className="surface-label">Share your invite link</p>
            <p className="mt-3 text-sm leading-7 text-white/62">{summary.shareMessage}</p>
            <div className="mt-4 rounded-[20px] border border-white/8 bg-black/25 px-4 py-4 text-sm text-white/72">{summary.inviteLink}</div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" className="h-11 rounded-full px-5" onClick={() => void handleShareLink()} disabled={analyticsMutation.isPending}>
                <Link2 className="h-4 w-4" />
                {analyticsMutation.isPending ? "Sharing..." : "Share link"}
              </Button>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-5">
            <p className="surface-label">Send a direct invite</p>
            <p className="mt-3 text-sm leading-7 text-white/62">Invite someone specific and let the lifecycle progress appear here as they move through the platform.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="friend@example.com" className="sm:flex-1" />
              <Button type="button" variant="secondary" className="h-11 rounded-full px-5" onClick={() => void handleInvite()} disabled={inviteMutation.isPending}>
                <MailPlus className="h-4 w-4" />
                {inviteMutation.isPending ? "Sending..." : "Send invite"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="rounded-[28px] p-5">
          <p className="surface-label">Shared</p>
          <p className="mt-3 text-3xl font-semibold" data-display="true">{summary.totals.invited}</p>
          <p className="mt-2 text-sm text-white/58">Invite link or direct share sent.</p>
        </Card>
        <Card className="rounded-[28px] p-5">
          <p className="surface-label">Signed up</p>
          <p className="mt-3 text-3xl font-semibold" data-display="true">{summary.totals.signedUp}</p>
          <p className="mt-2 text-sm text-white/58">Client profile created from the invite.</p>
        </Card>
        <Card className="rounded-[28px] p-5">
          <p className="surface-label">Booked</p>
          <p className="mt-3 text-3xl font-semibold" data-display="true">{summary.totals.booked}</p>
          <p className="mt-2 text-sm text-white/58">First booking moved into the calendar.</p>
        </Card>
        <Card className="rounded-[28px] p-5">
          <p className="surface-label">Completed</p>
          <p className="mt-3 text-3xl font-semibold" data-display="true">{summary.totals.completed}</p>
          <p className="mt-2 text-sm text-white/58">Paid service finished and validated.</p>
        </Card>
        <Card className="rounded-[28px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-5">
          <p className="surface-label text-[#d7ffab]">Credited</p>
          <p className="mt-3 text-3xl font-semibold" data-display="true">{summary.totals.credited}</p>
          <p className="mt-2 text-sm text-white/64">{summary.totals.rewardPointsEarned} pts earned.</p>
        </Card>
      </section>

      <Card className="rounded-[32px] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="surface-label">Recent referral progress</p>
            <p className="mt-3 text-xl font-semibold text-white" data-display="true">See where each invite actually stands.</p>
          </div>
          <Gift className="h-5 w-5 text-[#baff69]" />
        </div>

        <div className="mt-5 space-y-3">
          {summary.recentReferrals.length ? summary.recentReferrals.map((referral) => {
            const activeStageIndex = getStageIndex(referral.status);

            return (
              <div key={referral.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{referral.referredClientEmail}</p>
                    <p className="mt-2 text-sm text-white/58">{getReferralDateLabel(referral)} • {referral.rewardPoints} pts at credit</p>
                  </div>
                  <span className="status-pill text-[#d7ffab]">{getStatusLabel(referral.status)}</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-5">
                  {referralStages.map((stage, index) => {
                    const isComplete = index <= activeStageIndex;
                    const isActive = index === activeStageIndex;
                    return (
                      <div
                        key={`${referral.id}-${stage.key}`}
                        className={[
                          "rounded-[18px] border px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.16em]",
                          isComplete
                            ? "border-[#d7ffab]/18 bg-[#d7ffab]/10 text-[#eaffcb]"
                            : "border-white/8 bg-black/18 text-white/42",
                          isActive ? "shadow-[0_12px_24px_rgba(124,255,0,0.1)]" : ""
                        ].join(" ")}
                      >
                        {stage.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }) : (
            <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/58">
              Referral activity will appear here as soon as you share your first invite.
            </div>
          )}
        </div>

        <div className="mt-5 rounded-[24px] border border-white/8 bg-black/18 p-4">
          <div className="flex items-center gap-2 text-sm text-white/78">
            <Users className="h-4 w-4 text-[#baff69]" />
            Real lifecycle only
          </div>
          <p className="mt-3 text-sm leading-7 text-white/60">
            BVRB3R only credits referrals after the invited client completes a qualified paid service. That keeps rewards honest and profit-safe.
          </p>
        </div>
      </Card>
    </div>
  );
}
