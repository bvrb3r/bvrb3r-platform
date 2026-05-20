"use client";

import { useState } from "react";
import { BookmarkCheck, Heart, Link2, ShieldAlert, Sparkles } from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Select } from "@/components/ui/select";
import { useSaveFavoriteBarberMutation, type BookingApiError } from "@/lib/booking/client";
import { useRecordDeepLinkMutation } from "@/lib/mobile/client";
import { buildDeepLinkPayload } from "@/lib/mobile/links";
import { useBarberFollowState, useFollowBarberMutation, useUnfollowBarberMutation, type EngagementApiError } from "@/lib/engagement/client";
import { useMarketplaceAnalyticsMutation, type MarketplaceApiError } from "@/lib/marketplace/client";
import { useSubmitSafetyReportMutation, type TrustApiError } from "@/lib/trust/client";
import { getReadableActionError } from "@/lib/utils/feedback";

const actionButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.045] px-4 py-2 text-sm font-bold text-white transition hover:border-[#a3ff12]/35 hover:bg-white/[0.075] hover:text-[#d7ffab] disabled:pointer-events-none disabled:opacity-55";
const primaryActionButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#a3ff12]/45 bg-[#a3ff12] px-4 py-2 text-sm font-black text-black shadow-[0_14px_36px_rgba(163,255,18,0.2)] transition hover:bg-[#d7ffab] disabled:pointer-events-none disabled:opacity-55";

export function PublicBarberGrowthActions({ barberId, username, canFollow, canReport = false, initialFollowerCount }: { barberId: string; username: string; canFollow: boolean; canReport?: boolean; initialFollowerCount: number; }) {
  const followStateQuery = useBarberFollowState(barberId, canFollow);
  const followMutation = useFollowBarberMutation();
  const unfollowMutation = useUnfollowBarberMutation();
  const analyticsMutation = useMarketplaceAnalyticsMutation();
  const reportMutation = useSubmitSafetyReportMutation();
  const deepLinkMutation = useRecordDeepLinkMutation();
  const favoriteMutation = useSaveFavoriteBarberMutation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("fake_profile");
  const [reportDetails, setReportDetails] = useState("This trust signal needs a closer review.");
  const isFollowing = followStateQuery.data?.isFollowing ?? false;
  const followerCount = followStateQuery.data?.followerCount ?? initialFollowerCount;
  const isPending = followMutation.isPending || unfollowMutation.isPending || analyticsMutation.isPending || reportMutation.isPending || deepLinkMutation.isPending || favoriteMutation.isPending;

  async function handleFollowToggle() {
    setFeedback(null);
    try {
      if (isFollowing) {
        await unfollowMutation.mutateAsync({ barberId });
        setFeedback({ tone: "info", message: "Follow removed." });
        return;
      }

      await followMutation.mutateAsync({ barberId, notifyOnAvailability: true, notifyOnPortfolio: true });
      setFeedback({ tone: "success", message: "Following." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as EngagementApiError) });
    }
  }

  async function handleFavorite() {
    setFeedback(null);
    try {
      await favoriteMutation.mutateAsync({ barberReference: barberId });
      setFeedback({ tone: "success", message: "Saved." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as BookingApiError) });
    }
  }

  async function handleShare() {
    setFeedback(null);
    const bundle = buildDeepLinkPayload(`/barber/${username}`, `Book ${username} on BVRB3R`);
    const shareText = `Book through BVRB3R: ${bundle.webUrl}\nApp link: ${bundle.appUrl}`;

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: `Book ${username} on BVRB3R`,
          text: "Check out this barber profile on BVRB3R Marketplace.",
          url: bundle.webUrl
        });
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      }

      await analyticsMutation.mutateAsync({
        eventType: "profile_shared",
        barberId,
        username,
        sourceKind: "public_profile",
        sourceReference: "profile_link",
        metadata: {
          channel: typeof navigator !== "undefined" && typeof navigator.share === "function" ? "native_share" : "copy_link",
          appUrl: bundle.appUrl
        }
      });

      try {
        await deepLinkMutation.mutateAsync({
          route: `/barber/${username}`,
          label: `Public barber profile: ${username}`,
          source: "share",
          metadata: {
            barberId,
            username
          }
        });
      } catch {
        // Share should still succeed even if the viewer is not signed into a role-safe mobile session.
      }

      setFeedback({ tone: "success", message: "Profile link ready." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as MarketplaceApiError) });
    }
  }

  async function handleReport() {
    setFeedback(null);
    try {
      await reportMutation.mutateAsync({ subjectType: "barber", subjectId: barberId, category: reportCategory, details: reportDetails });
      setFeedback({ tone: "success", message: "Report sent." });
      setReportOpen(false);
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as TrustApiError) });
    }
  }

  return (
    <div className="space-y-3">
      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
      <div className="flex flex-wrap gap-3">
        {canFollow ? (
          <button type="button" className={isFollowing ? actionButtonClass : primaryActionButtonClass} disabled={isPending} onClick={() => void handleFollowToggle()}>
            <Heart className={`h-4 w-4 ${isFollowing ? "fill-current" : ""}`} />
            {isFollowing ? "Following" : "Follow"}
          </button>
        ) : (
          <span className="inline-flex min-h-11 items-center rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-white/72">Follow from a client account</span>
        )}
        <button type="button" className={actionButtonClass} disabled={isPending} onClick={() => void handleShare()}>
          <Link2 className="h-4 w-4" />
          Share
        </button>
        {canFollow ? (
          <button type="button" className={actionButtonClass} disabled={isPending} onClick={() => void handleFavorite()}>
            <BookmarkCheck className="h-4 w-4" />
            {favoriteMutation.isPending ? "Saving..." : "Save"}
          </button>
        ) : null}
        {canReport ? (
          <button type="button" className={actionButtonClass} disabled={isPending} onClick={() => setReportOpen((open) => !open)}>
            <ShieldAlert className="h-4 w-4" />
            {reportOpen ? "Hide report" : "Report"}
          </button>
        ) : null}
        <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#a3ff12]/20 bg-[#a3ff12]/10 px-4 text-sm font-bold text-[#d7ffab]">
          <Sparkles className="h-4 w-4" />
          {followerCount} following
        </span>
      </div>
      {reportOpen ? (
        <div className="rounded-lg border border-white/8 bg-black/20 p-4">
          <p className="text-xs font-bold uppercase text-white/48">Trust and safety intake</p>
          <p className="mt-2 text-sm text-white/60">Only moderation-safe details are sent. Public profile visitors will not see this report.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[0.48fr_0.52fr]">
            <div>
              <label className="mb-3 block text-xs font-bold uppercase text-white/48">Concern type</label>
              <Select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}>
                <option value="fake_profile">Fake profile</option>
                <option value="unsafe_conduct">Unsafe conduct</option>
                <option value="harassment">Harassment</option>
                <option value="payment_dispute">Payment dispute</option>
                <option value="fake_review">Fake review</option>
              </Select>
            </div>
            <div>
              <label className="mb-3 block text-xs font-bold uppercase text-white/48">Notes</label>
              <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} className="min-h-[110px] w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-[#7CFF00]/30 focus:ring-2 focus:ring-[#7CFF00]/12" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={primaryActionButtonClass} disabled={isPending || reportDetails.trim().length < 12} onClick={() => void handleReport()}>
              {reportMutation.isPending ? "Sending report..." : "Send report"}
            </button>
            <span className="inline-flex min-h-11 items-center rounded-lg border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-white/62">Trust-safe intake only</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

