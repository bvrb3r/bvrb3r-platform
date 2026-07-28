"use client";

import type { Route } from "next";
import { useMemo, useState } from "react";
import {
  BellRing,
  CalendarCheck2,
  Gift,
  Heart,
  Link2,
  Medal,
  Repeat2,
  Sparkles,
  Ticket,
  Users,
  WalletCards
} from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientFavoriteBarberCard } from "@/components/client-experience/client-favorite-barber-card";
import { MarketplaceTrackedActionLink } from "@/components/client-experience/marketplace-tracked-action-link";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCancelClientMembershipMutation,
  useClientBillingHistoryQuery,
  useClientBookingsQuery,
  useClientHomeQuery,
  useClientPointsBalanceQuery,
  useRetryClientBillingMutation,
  useSaveFavoriteBarberMutation,
  useSubscribeClientMembershipMutation,
  type BookingApiError
} from "@/lib/booking/client";
import {
  buildClientPrimaryBookingHref,
  buildClientDashboardFeed,
  buildClientFavoriteCandidates,
  buildQuickRebookHref
} from "@/lib/client-experience/dashboard";
import {
  useClientEngagementSummary,
  useClientReferralSummary,
  useRecordEngagementEventMutation,
  type EngagementApiError
} from "@/lib/engagement/client";
import { useMarketplaceAnalyticsMutation } from "@/lib/marketplace/client";
import { getReadableActionError } from "@/lib/utils/feedback";
import { currency } from "@/lib/utils";

function MetricSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-24" />
      <Skeleton className="mt-4 h-4 w-32" />
    </div>
  );
}

function FeedCardSkeleton() {
  return (
    <div className="w-[20rem] shrink-0 rounded-[28px] border border-white/8 bg-black/20 p-5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-8 w-44" />
      <Skeleton className="mt-4 h-20 w-full rounded-[20px]" />
      <Skeleton className="mt-5 h-11 w-32 rounded-full" />
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-3 h-4 w-48" />
      <Skeleton className="mt-4 h-10 w-28 rounded-full" />
    </div>
  );
}

function formatDateTime(iso?: string | null) {
  if (!iso) {
    return "Not enough history yet";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Not enough history yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatShortDate(iso?: string | null) {
  if (!iso) {
    return "Not scheduled";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function getWindowCopy(window?: string) {
  switch (window) {
    case "due_now":
      return "You are due";
    case "overdue":
      return "Time to come back";
    case "due_soon":
      return "Due soon";
    case "scheduled":
      return "Already booked";
    case "on_track":
      return "Routine on track";
    default:
      return "Build your rhythm";
  }
}

function getFeedIcon(kind: ReturnType<typeof buildClientDashboardFeed>[number]["kind"]) {
  switch (kind) {
    case "rebook":
      return Repeat2;
    case "favorite":
      return Heart;
    case "availability":
      return CalendarCheck2;
    case "promotion":
      return Sparkles;
    case "loyalty":
      return WalletCards;
    case "notification":
      return BellRing;
    case "referral":
      return Link2;
    case "membership":
      return Medal;
    default:
      return Sparkles;
  }
}

export function ClientWorkspace({ clientId, locationIds }: { clientId: string; locationIds: string[] }) {
  const homeQuery = useClientHomeQuery();
  const bookingsQuery = useClientBookingsQuery();
  const billingHistoryQuery = useClientBillingHistoryQuery();
  const pointsBalanceQuery = useClientPointsBalanceQuery();
  const engagementQuery = useClientEngagementSummary();
  const referralQuery = useClientReferralSummary();
  const saveFavoriteMutation = useSaveFavoriteBarberMutation();
  const subscribeMembershipMutation = useSubscribeClientMembershipMutation();
  const cancelMembershipMutation = useCancelClientMembershipMutation();
  const retryBillingMutation = useRetryClientBillingMutation();
  const rewardMutation = useRecordEngagementEventMutation();
  const marketplaceAnalyticsMutation = useMarketplaceAnalyticsMutation();
  const [favoriteFeedback, setFavoriteFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [valueFeedback, setValueFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const homePayload = homeQuery.data;
  const bookingsPayload = bookingsQuery.data;
  const billingHistory = billingHistoryQuery.data;
  const engagementSummary = engagementQuery.data;
  const referralSummary = referralQuery.data;
  const preferredLocationId = homePayload?.locationId ?? locationIds[0] ?? "";
  const favoriteBarberId = bookingsPayload?.favoriteBarber?.barber.id
    ?? homePayload?.favoriteBarber?.barberId
    ?? engagementSummary?.intelligence.favoriteBarberId;
  const favoriteBarberName = bookingsPayload?.favoriteBarber?.barber.name
    ?? homePayload?.favoriteBarber?.barberName
    ?? engagementSummary?.favoriteBarberName
    ?? "your barber";
  const favoriteBarberUsername = bookingsPayload?.favoriteBarber?.profile.username
    ?? homePayload?.favoriteBarber?.username
    ?? engagementSummary?.followedBarbers[0]?.username;
  const preferredServiceId = bookingsPayload?.history?.[0]?.serviceId
    ?? bookingsPayload?.nextAppointment?.serviceId
    ?? bookingsPayload?.routine?.serviceReference
    ?? bookingsPayload?.favoriteBarber?.mostBookedService?.service.id
    ?? engagementSummary?.intelligence.primaryServiceId;
  let heroHref: Route = "/booking/new?mode=next-available";
  if (homePayload && bookingsPayload && engagementSummary) {
    heroHref = buildClientPrimaryBookingHref({
      home: {
        ...homePayload,
        locationId: homePayload.locationId || preferredLocationId
      },
      bookings: bookingsPayload,
      summary: engagementSummary
    });
  } else if (favoriteBarberId) {
    heroHref = buildQuickRebookHref({
      barberId: favoriteBarberId,
      username: favoriteBarberUsername,
      locationId: bookingsPayload?.favoriteBarber?.shopLocations[0]?.id ?? bookingsPayload?.nextAppointment?.locationId ?? preferredLocationId,
      serviceId: preferredServiceId
    });
  }

  const feedItems = useMemo(() => {
    if (!homePayload || !bookingsPayload || !engagementSummary) {
      return [];
    }

    return buildClientDashboardFeed({
      home: {
        ...homePayload,
        locationId: homePayload.locationId || preferredLocationId
      },
      bookings: bookingsPayload,
      summary: engagementSummary,
      referrals: referralSummary
    });
  }, [bookingsPayload, engagementSummary, homePayload, preferredLocationId, referralSummary]);

  const favoriteCandidates = useMemo(() => {
    if (!homePayload || !engagementSummary) {
      return [];
    }

    return buildClientFavoriteCandidates({
      home: {
        ...homePayload,
        locationId: homePayload.locationId || preferredLocationId
      },
      summary: engagementSummary,
      favoriteBarberId
    });
  }, [engagementSummary, favoriteBarberId, homePayload, preferredLocationId]);

  const isInitialLoading = (homeQuery.isLoading && !homePayload)
    || (bookingsQuery.isLoading && !bookingsPayload)
    || (engagementQuery.isLoading && !engagementSummary);
  const latestVisit = bookingsPayload?.history?.[0] ?? null;
  const nextAppointment = bookingsPayload?.nextAppointment ?? null;
  const pointsBalance = pointsBalanceQuery.data;
  const totalHistorySpend = (bookingsPayload?.history ?? []).reduce(
    (sum, appointment) => sum + (appointment.grandTotal ?? appointment.totalAmount ?? 0),
    0
  );
  const unreadNotifications = engagementSummary?.recentNotifications.slice(0, 4) ?? [];
  const unlockedRewards = engagementSummary?.rewards.filter((reward) => reward.unlocked) ?? [];
  const lockedRewards = engagementSummary?.rewards.filter((reward) => !reward.unlocked) ?? [];
  const displayName = homePayload?.client?.fullName ?? bookingsPayload?.client?.fullName ?? clientId;
  const firstName = displayName.split(" ")[0] ?? "Client";
  const summaryError = homeQuery.error ?? bookingsQuery.error ?? engagementQuery.error;
  const latestInvoice = billingHistory?.invoices[0] ?? null;
  const recoveryInvoice = billingHistory?.recoveryInvoice ?? null;

  async function handleSaveFavorite(barberReference: string) {
    setFavoriteFeedback(null);
    try {
      await saveFavoriteMutation.mutateAsync({ barberReference });
      setFavoriteFeedback({
        tone: "success",
        message: "Favorite barber saved. Home, search, and future reminder flows now prioritize this chair."
      });
    } catch (error) {
      setFavoriteFeedback({
        tone: "error",
        message: getReadableActionError(error as BookingApiError)
      });
    }
  }

  async function handleClaimReward(rewardId: string, title: string, pointsRequired: number) {
    setValueFeedback(null);
    try {
      await rewardMutation.mutateAsync({
        eventType: "reward_redeemed",
        targetType: "client",
        targetId: clientId,
        metadata: {
          rewardId,
          rewardTitle: title,
          pointsRequired
        }
      });
      setValueFeedback({
        tone: "success",
        message: `${title} claimed. Your loyalty balance and follow-up lane have been updated from canonical engagement state.`
      });
    } catch (error) {
      setValueFeedback({
        tone: "error",
        message: getReadableActionError(error as EngagementApiError)
      });
    }
  }

  async function handleReferralCta(surface: "client_dashboard" | "activity" | "public_profile" | "discovery") {
    try {
      await marketplaceAnalyticsMutation.mutateAsync({
        eventType: "referral_shared",
        sourceKind: "client_dashboard",
        sourceReference: referralSummary?.referralCode?.code,
        metadata: {
          interaction: "cta_click",
          surface
        }
      });
    } catch {
      // Referral UX should stay responsive even if analytics persistence is unavailable.
    }
  }

  async function handleStartMembership(planCode: string) {
    setValueFeedback(null);
    try {
      const result = await subscribeMembershipMutation.mutateAsync({ planCode });
      setValueFeedback({
        tone: "success",
        message: "Membership checkout is ready. Stripe will finish the subscription while canonical client billing state stays in sync."
      });
      if (result.checkoutUrl && typeof window !== "undefined") {
        window.location.href = result.checkoutUrl;
      }
    } catch (error) {
      setValueFeedback({
        tone: "error",
        message: getReadableActionError(error as BookingApiError)
      });
    }
  }

  async function handleCancelMembership() {
    setValueFeedback(null);
    try {
      await cancelMembershipMutation.mutateAsync();
      setValueFeedback({
        tone: "success",
        message: "Membership cancellation was scheduled from the live Stripe-backed subscription state."
      });
    } catch (error) {
      setValueFeedback({
        tone: "error",
        message: getReadableActionError(error as BookingApiError)
      });
    }
  }

  async function handleRetryBilling() {
    setValueFeedback(null);
    try {
      const result = await retryBillingMutation.mutateAsync();
      setValueFeedback({
        tone: "success",
        message: "Billing recovery is ready. Stripe will finish the retry flow while the subscription state stays in sync."
      });
      if (typeof window !== "undefined") {
        window.location.href = result.retry.recoveryUrl;
      }
    } catch (error) {
      setValueFeedback({
        tone: "error",
        message: getReadableActionError(error as BookingApiError)
      });
    }
  }

  return (
    <div className="space-y-5" data-testid="client-workspace">
      <Card className="overflow-hidden rounded-[38px] border-white/10 bg-[linear-gradient(180deg,rgba(18,22,14,0.96),rgba(8,8,8,0.99))] p-5 shadow-[0_28px_60px_rgba(0,0,0,0.28)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(196, 242, 78,0.12),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_24%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#e4f9b8]">Client dashboard</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold sm:text-5xl" data-display="true">
              {getWindowCopy(engagementSummary?.intelligence.rebookingWindow)} for {firstName}.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
              Your dashboard now guides the next move for you: rebook with {favoriteBarberName}, keep an eye on live availability, and act on the reminders, rewards, and promotions already waiting in the system.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-white/58">
              <span className="rounded-full border border-[#e4f9b8]/20 bg-[#e4f9b8]/10 px-3 py-2 text-[#e7ffc5]">
                {engagementSummary ? `${engagementSummary.pointsBalance} loyalty points` : "Client intelligence"}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2">
                Last barber {favoriteBarberName}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2">
                Last service {latestVisit?.view?.service?.name ?? bookingsPayload?.favoriteBarber?.mostBookedService?.service.name ?? "Build your routine"}
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <ClientActionLink href={heroHref} size="lg">
                Quick rebook
              </ClientActionLink>
              <ClientActionLink href="/bookings" size="lg" variant="secondary">
                Open bookings
              </ClientActionLink>
              <ClientActionLink href="/discover" size="lg" variant="outline">
                Discover barbers
              </ClientActionLink>
            </div>
          </div>
          <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-black/24 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">Next best action</p>
            <p className="mt-3 text-xl font-semibold text-white">{engagementSummary?.intelligence.nextBestAction ?? "Lock your next chair."}</p>
            <p className="mt-3 text-sm leading-7 text-white/62">
              {engagementSummary?.intelligence.explanation
                ?? "The app is using your visit history, loyalty signals, and automation reminders to keep the next step obvious."}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/72">
                Last visit {formatShortDate(latestVisit?.start)}
              </div>
              <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/72">
                Next visit {formatShortDate(nextAppointment?.start ?? bookingsPayload?.routine?.nextSuggestedAt)}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {favoriteFeedback ? <FeedbackBanner tone={favoriteFeedback.tone} message={favoriteFeedback.message} /> : null}
      {valueFeedback ? <FeedbackBanner tone={valueFeedback.tone} message={valueFeedback.message} /> : null}
      {summaryError ? <FeedbackBanner tone="error" message={getReadableActionError(summaryError as BookingApiError)} /> : null}

      <ClientSectionBlock
        eyebrow="Smart feed"
        title="Your home feed now drives the next booking."
        subtitle="Rebooking nudges, favorite-barber availability, live offers, and loyalty messages stay in one personalized rail."
      >
        {isInitialLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            <FeedCardSkeleton />
            <FeedCardSkeleton />
            <FeedCardSkeleton />
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {feedItems.length ? feedItems.map((item) => {
              const Icon = getFeedIcon(item.kind);
              return (
                <article key={item.id} className="w-[20rem] shrink-0 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] p-5 shadow-[0_18px_36px_rgba(0,0,0,0.18)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-[0.22em] text-[#e4f9b8]">{item.eyebrow}</span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-white/68">
                      <Icon className="h-3.5 w-3.5 text-[#d9f985]" />
                      {item.badge ?? item.kind}
                    </span>
                  </div>
                  <p className="mt-4 text-2xl font-semibold text-white" data-display="true">{item.title}</p>
                  <p className="mt-3 text-sm leading-7 text-white/64">{item.detail}</p>
                  <div className="mt-5">
                    <ClientActionLink href={item.href} size="lg">
                      {item.ctaLabel}
                    </ClientActionLink>
                  </div>
                </article>
              );
            }) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/15 p-5 text-sm leading-7 text-white/58">
                Your smart feed fills up as you book, revisit favorite barbers, earn rewards, and receive automation reminders.
              </div>
            )}
          </div>
        )}
      </ClientSectionBlock>

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
            <Card className="rounded-[26px] p-4">
              <p className="surface-label">Last visit</p>
              <p className="mt-4 text-3xl font-semibold" data-display="true">{formatShortDate(latestVisit?.start)}</p>
              <p className="mt-4 text-sm text-white/58">{latestVisit?.view?.service?.name ?? "Your service history builds here."}</p>
            </Card>
            <Card className="rounded-[26px] p-4">
              <p className="surface-label">Preferred barber</p>
              <p className="mt-4 text-3xl font-semibold" data-display="true">{favoriteBarberName}</p>
              <p className="mt-4 text-sm text-white/58">{engagementSummary?.favoriteBarberName ? "Saved for faster discovery and reminders." : "Choose a favorite to personalize home."}</p>
            </Card>
            <Card className="rounded-[26px] p-4">
              <p className="surface-label">Visit rhythm</p>
              <p className="mt-4 text-3xl font-semibold" data-display="true">{engagementSummary?.intelligence.averageCycleDays ?? bookingsPayload?.routine?.averageCycleDays ?? 0}d</p>
              <p className="mt-4 text-sm text-white/58">{engagementSummary?.intelligence.rebookingWindow.replaceAll("_", " ") ?? "Routine building"}</p>
            </Card>
            <Card className="rounded-[26px] p-4">
              <p className="surface-label">Loyalty signal</p>
              <p className="mt-4 text-3xl font-semibold" data-display="true">{engagementSummary?.tier.toUpperCase() ?? "CORE"}</p>
              <p className="mt-4 text-sm text-white/58">{engagementSummary?.pointsBalance ?? 0} points and {engagementSummary?.intelligence.loyaltySegment.replaceAll("_", " ") ?? "new"} momentum.</p>
            </Card>
          </>
        )}
      </section>

      <ClientSectionBlock
        eyebrow="Favorite barber"
        title={favoriteBarberId ? "Your go-to barber stays first." : "Choose the barber you want this app to optimize around."}
        subtitle="Favorites now persist as your primary barber so home, search, rebooking, and future notification flows all point at the same trusted chair."
      >
        {bookingsPayload?.favoriteBarber ? (
          <ClientFavoriteBarberCard
            barberId={bookingsPayload.favoriteBarber.barber.id}
            name={bookingsPayload.favoriteBarber.barber.name}
            rating={bookingsPayload.favoriteBarber.proof?.reviewScore ?? bookingsPayload.favoriteBarber.barber.rating}
            locationLabel={bookingsPayload.favoriteBarber.shopLocations.map((location) => `${location.name} | ${location.neighborhood}`).join(" | ") || "Your regular chair"}
            headline={bookingsPayload.favoriteBarber.profile.headline}
            specialties={bookingsPayload.favoriteBarber.profile.specialties}
            profileHref={`/barber/${bookingsPayload.favoriteBarber.profile.username}` as Route}
            bookHref={heroHref}
            username={bookingsPayload.favoriteBarber.profile.username}
          />
        ) : (
          <div className="rounded-[28px] border border-dashed border-white/10 bg-black/18 p-5 text-sm leading-7 text-white/62">
            Pick a barber below and the client app will start prioritizing that chair across home, search, rebooking, and availability reminders.
          </div>
        )}

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {isInitialLoading ? (
            <>
              <HistorySkeleton />
              <HistorySkeleton />
            </>
          ) : favoriteCandidates.length ? favoriteCandidates.map((candidate) => (
            <div key={candidate.barberId} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#C4F24E]/16 hover:bg-black/28">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-white">{candidate.barberName}</p>
                  <p className="mt-1 text-sm text-white/58">{candidate.shopName ?? "Trusted barber"}</p>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/68">
                  {candidate.rating ? `${candidate.rating.toFixed(1)} rating` : "Recommended"}
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-white/64">{candidate.reason}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-white/58">
                {candidate.specialties.slice(0, 3).map((specialty) => (
                  <span key={specialty} className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-white/78">
                    {specialty}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="h-11 px-5"
                  disabled={saveFavoriteMutation.isPending}
                  onClick={() => void handleSaveFavorite(candidate.barberId)}
                >
                  {saveFavoriteMutation.isPending ? "Saving..." : "Make favorite"}
                </Button>
                <MarketplaceTrackedActionLink
                  href={candidate.bookingHref}
                  variant="secondary"
                  analytics={{
                    eventType: "booking_cta_clicked",
                    barberId: candidate.barberId,
                    username: candidate.username,
                    sourceKind: "client_dashboard",
                    sourceReference: "favorite_candidate"
                  }}
                >
                  Quick book
                </MarketplaceTrackedActionLink>
                <ClientActionLink href={candidate.profileHref} variant="outline">
                  View profile
                </ClientActionLink>
              </div>
            </div>
          )) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/15 p-5 text-sm leading-7 text-white/58">
              More barber suggestions unlock as your booking history and engagement signals grow.
            </div>
          )}
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Client value"
        title="Rewards, referrals, and membership value stay actionable."
        subtitle="The marketplace now makes points, invites, and subscription-backed perks easier to understand and easier to use."
      >
        <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="surface-label">BVR Points wallet</p>
                  <p className="mt-3 text-xl font-semibold text-white" data-display="true">
                    {pointsBalance ? `${pointsBalance.unlockedPoints} unlocked points` : "Points wallet loading"}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white/62">
                    Your wallet now stays visible alongside rewards and referrals, so booking discounts and progress are easy to understand before checkout.
                  </p>
                </div>
                <span className="rounded-full border border-[#e4f9b8]/16 bg-[#e4f9b8]/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e8ffc2]">
                  {currency(pointsBalance?.inAppValue ?? 0)} value
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <p className="surface-label">Unlocked</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{pointsBalance?.unlockedPoints ?? 0}</p>
                  <p className="mt-2 text-sm text-white/58">Ready for in-app redemption.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <p className="surface-label">Pending</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{pointsBalance?.pendingPoints ?? 0}</p>
                  <p className="mt-2 text-sm text-white/58">Unlocks after validation windows close.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <p className="surface-label">Referral pending</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{pointsBalance?.referralPendingPoints ?? 0}</p>
                  <p className="mt-2 text-sm text-white/58">Tracks closed-loop referral credit still settling.</p>
                </div>
              </div>
              <div className="mt-4 rounded-[24px] border border-white/8 bg-black/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="surface-label">Next value milestone</p>
                    <p className="mt-3 text-lg font-semibold text-white" data-display="true">
                      {pointsBalance?.explanation.progressLabel ?? "Keep stacking unlocked points."}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-white/62">
                      {pointsBalance?.explanation.unlockHint ?? "Pending rewards move into unlocked value after their validation window closes."}
                    </p>
                  </div>
                  <span className="status-pill text-[#e4f9b8]">
                    {pointsBalance?.explanation.valueAdvantageLabel ?? "In-app value stays stronger than cash-out."}
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,rgba(196, 242, 78,0.92),rgba(201,255,147,0.88))] transition-[width] duration-500"
                    style={{ width: `${pointsBalance?.explanation.progressPercent ?? 0}%` }}
                  />
                </div>
                <p className="mt-3 text-sm text-white/56">
                  {pointsBalance?.explanation.cashoutHint ?? "Booking discounts keep points more valuable than the default cash-out rate."}
                </p>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Rewards you can actually use</p>
                  <p className="mt-3 text-xl font-semibold text-white" data-display="true">
                    {unlockedRewards.length ? `${unlockedRewards.length} reward${unlockedRewards.length === 1 ? "" : "s"} ready` : "Keep stacking points"}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white/62">
                    Loyalty is no longer hidden in the backend. Claim what is unlocked, see what is next, and keep the next visit feeling earned.
                  </p>
                </div>
                <span className="rounded-full border border-[#e4f9b8]/16 bg-[#e4f9b8]/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e8ffc2]">
                  {engagementSummary?.pointsBalance ?? 0} pts
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {(engagementSummary?.rewards ?? []).map((reward) => (
                  <div key={reward.id} className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{reward.title}</p>
                        <p className="mt-2 text-sm text-white/58">
                          {reward.unlocked
                            ? "Ready to claim now from your client dashboard."
                            : `${Math.max(0, reward.pointsRequired - (engagementSummary?.pointsBalance ?? 0))} more points until this unlocks.`}
                        </p>
                      </div>
                      <span className={`status-pill ${reward.unlocked ? "text-[#e4f9b8]" : "text-white/68"}`}>
                        {reward.pointsRequired} pts
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {reward.unlocked ? (
                        <Button
                          type="button"
                          className="h-11 px-5"
                          disabled={rewardMutation.isPending}
                          onClick={() => void handleClaimReward(reward.id, reward.title, reward.pointsRequired)}
                        >
                          <Gift className="h-4 w-4" />
                          {rewardMutation.isPending ? "Claiming..." : "Claim reward"}
                        </Button>
                      ) : null}
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/62">
                        <Ticket className="h-3.5 w-3.5 text-[#d9f985]" />
                        {reward.unlocked ? "Redemption live" : "Progress tracked"}
                      </span>
                    </div>
                  </div>
                ))}
                {!engagementSummary?.rewards.length ? (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-black/15 p-5 text-sm leading-7 text-white/58">
                    Reward options will surface here as soon as the loyalty catalog has enough client activity to work with.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Membership-backed perks</p>
                  <p className="mt-3 text-xl font-semibold text-white" data-display="true">
                    {bookingsPayload?.membershipValue?.valueHeadline ?? "Value layer ready"}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white/62">
                    {bookingsPayload?.membershipValue?.valueMessage ?? "As live subscription state is tracked for your regular shop or barber, that value will show up here with renewal and perk context."}
                  </p>
                </div>
                {bookingsPayload?.membershipValue ? (
                  <span className="status-pill text-[#e4f9b8]">
                    {bookingsPayload.membershipValue.subscriptionStatus.replaceAll("_", " ")}
                  </span>
                ) : null}
              </div>
              {bookingsPayload?.membershipValue ? (
                <>
                  <div className="mt-4 rounded-[24px] border border-white/8 bg-black/25 p-4">
                    <p className="surface-label">Savings and status</p>
                    <p className="mt-3 text-sm leading-7 text-white/68">{bookingsPayload.membershipValue.savingsMessage}</p>
                    <p className="mt-3 text-sm text-white/52">{bookingsPayload.membershipValue.renewalMessage}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-white/62">
                    {bookingsPayload.membershipValue.perkLabels.map((perk) => (
                      <span key={perk} className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-white/78">
                        {perk}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {bookingsPayload.membershipExecution?.canSubscribe && bookingsPayload.membershipExecution.activePlan ? (
                      <Button
                        type="button"
                        className="h-11 px-5"
                        disabled={subscribeMembershipMutation.isPending}
                        onClick={() => void handleStartMembership(bookingsPayload.membershipExecution?.activePlan?.planCode ?? "client_core_monthly")}
                      >
                        {subscribeMembershipMutation.isPending ? "Opening Stripe..." : "Start membership"}
                      </Button>
                    ) : null}
                    {bookingsPayload.membershipExecution?.canCancel ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-11 px-5"
                        disabled={cancelMembershipMutation.isPending}
                        onClick={() => void handleCancelMembership()}
                      >
                        {cancelMembershipMutation.isPending ? "Cancelling..." : "Cancel membership"}
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : null}
              {!bookingsPayload?.membershipValue && bookingsPayload?.membershipExecution?.activePlan ? (
                <div className="mt-4 rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <p className="surface-label">Available plan</p>
                  <p className="mt-3 text-sm leading-7 text-white/68">
                    {bookingsPayload.membershipExecution.activePlan.planName} | {currency(bookingsPayload.membershipExecution.activePlan.unitAmount)} / {bookingsPayload.membershipExecution.activePlan.planInterval}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      className="h-11 px-5"
                      disabled={subscribeMembershipMutation.isPending}
                      onClick={() => void handleStartMembership(bookingsPayload.membershipExecution?.activePlan?.planCode ?? "client_core_monthly")}
                    >
                      {subscribeMembershipMutation.isPending ? "Opening Stripe..." : "Start membership"}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="mt-4 rounded-[24px] border border-white/8 bg-black/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="surface-label">Billing clarity</p>
                    <p className="mt-3 text-sm leading-7 text-white/68">
                      {billingHistory?.subscription
                        ? `Current state ${billingHistory.subscription.subscriptionStatus.replaceAll("_", " ")} with ${billingHistory.subscription.billingState.replaceAll("_", " ")} billing.`
                        : "Invoice and billing recovery visibility will appear here as soon as subscription billing is active."}
                    </p>
                  </div>
                  {latestInvoice ? (
                    <span className={`status-pill ${latestInvoice.status === "paid" ? "text-[#e4f9b8]" : latestInvoice.status === "failed" || latestInvoice.status === "past_due" ? "text-amber-200" : "text-white/72"}`}>
                      {latestInvoice.status.replaceAll("_", " ")}
                    </span>
                  ) : null}
                </div>
                {latestInvoice ? (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[20px] border border-white/8 bg-black/20 px-3 py-3 text-sm text-white/72">
                        Amount due {currency(latestInvoice.amountDue)}
                      </div>
                      <div className="rounded-[20px] border border-white/8 bg-black/20 px-3 py-3 text-sm text-white/72">
                        Amount paid {currency(latestInvoice.amountPaid)}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {recoveryInvoice ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-11 px-5"
                          disabled={retryBillingMutation.isPending}
                          onClick={() => void handleRetryBilling()}
                        >
                          {retryBillingMutation.isPending ? "Opening Stripe..." : "Retry billing"}
                        </Button>
                      ) : null}
                      {latestInvoice.hostedInvoiceUrl ? (
                        <a
                          href={latestInvoice.hostedInvoiceUrl}
                          rel="noreferrer"
                          className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#9bff2f]/45 px-5 text-[14px] font-semibold tracking-[-0.01em] text-[#e4f9b8] transition duration-200 hover:border-[#d4f97a]/72 hover:bg-[#d4f97a]/8 hover:text-[#efffd4]"
                        >
                          Open invoice
                        </a>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Referral activation</p>
                  <p className="mt-3 text-xl font-semibold text-white" data-display="true">
                    {referralSummary?.referralCode?.code ?? "Referral code ready"}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white/62">
                    {referralSummary?.shareMessage ?? "Share your code where the motivation is highest so referrals turn into future points and discovery growth."}
                  </p>
                </div>
                <span className="rounded-full border border-[#e4f9b8]/16 bg-[#e4f9b8]/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e8ffc2]">
                  {referralSummary?.totals.rewardPointsEarned ?? 0} pts earned
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <p className="surface-label">Invited</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.invited ?? 0}</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <p className="surface-label">Converted</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.completed ?? 0}</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <p className="surface-label">Credited</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.credited ?? 0}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <ClientActionLink
                  href="/referrals"
                  size="lg"
                  onClick={() => void handleReferralCta("client_dashboard")}
                >
                  Open referrals
                  <Users className="h-4 w-4" />
                </ClientActionLink>
                <ClientActionLink href="/discover" size="lg" variant="secondary">
                  Use this in discovery
                </ClientActionLink>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="surface-label">What clients trust</p>
                  <p className="mt-3 text-xl font-semibold text-white" data-display="true">
                    {favoriteBarberName} stays high-conviction
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white/62">
                    Strong reviews, favorite-barber history, and repeat-booking signals are already shaping what this app prioritizes for you.
                  </p>
                </div>
                <span className="status-pill text-[#e4f9b8]">
                  {lockedRewards.length ? `${lockedRewards[0].pointsRequired - (engagementSummary?.pointsBalance ?? 0)} pts to next reward` : "Reward lane active"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <p className="surface-label">Last visit signal</p>
                  <p className="mt-3 text-sm leading-7 text-white/68">
                    {latestVisit ? `${favoriteBarberName} handled your last ${latestVisit.view?.service?.name ?? "service"} on ${formatShortDate(latestVisit.start)}.` : "Your completed visits will sharpen this trust summary."}
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
                  <p className="surface-label">Automation + loyalty</p>
                  <p className="mt-3 text-sm leading-7 text-white/68">
                    {engagementSummary?.automation.nextAutomation?.title ?? "No queued nudge right now."} Your tier, rewards, and reminders now reinforce discovery-to-booking instead of living in separate screens.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <ClientSectionBlock
          eyebrow="History and spend"
          title="Past visits stay ready for one-tap repeats."
          subtitle="See the last services you booked, what you spent, and jump right back into the same chair without rebuilding the flow."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Completed visits</p>
              <p className="mt-4 text-3xl font-semibold" data-display="true">{engagementSummary?.completedBookings ?? bookingsPayload?.history.length ?? 0}</p>
              <p className="mt-4 text-sm text-white/58">Your strongest retention signal is still the services you actually complete.</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Recent spend</p>
              <p className="mt-4 text-3xl font-semibold" data-display="true">{currency(totalHistorySpend)}</p>
              <p className="mt-4 text-sm text-white/58">Basic spend visibility stays grounded in real completed appointment totals.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <HistorySkeleton />
                <HistorySkeleton />
              </>
            ) : bookingsPayload?.history.length ? bookingsPayload.history.slice(0, 4).map((appointment) => (
              <div key={appointment.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#C4F24E]/16 hover:bg-black/28">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{appointment.view?.service?.name ?? "Completed service"}</p>
                    <p className="mt-1 text-sm text-white/58">{appointment.view?.barber?.name ?? favoriteBarberName} | {formatDateTime(appointment.start)}</p>
                    <p className="mt-1 text-sm text-white/46">{appointment.view?.location?.name ?? "Your regular location"}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/68">
                    {currency(appointment.grandTotal ?? appointment.totalAmount)}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ClientActionLink
                    href={buildQuickRebookHref({
                      barberId: appointment.barberId,
                      username: appointment.barberId === favoriteBarberId ? favoriteBarberUsername : undefined,
                      locationId: appointment.locationId,
                      serviceId: appointment.serviceId
                    })}
                    size="lg"
                  >
                    Book again
                  </ClientActionLink>
                </div>
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/15 p-5 text-sm leading-7 text-white/58">
                Finished appointments will show up here with one-tap repeats and basic spend visibility once your history grows.
              </div>
            )}
          </div>
        </ClientSectionBlock>

        <ClientSectionBlock
          eyebrow="Notifications"
          title="Reminders, offers, and alerts stay visible."
          subtitle="Automation-triggered reminders now feel useful on the client side instead of living only in backend state."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Latest reminder</p>
              <p className="mt-4 text-2xl font-semibold" data-display="true">{unreadNotifications[0]?.title ?? "Nothing urgent"}</p>
              <p className="mt-4 text-sm text-white/58">{unreadNotifications[0]?.body ?? "Rebooking reminders, promotions, and booking alerts will appear here as they are triggered."}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Automation status</p>
              <p className="mt-4 text-2xl font-semibold" data-display="true">{engagementSummary?.automation.nextAutomation?.status.replaceAll("_", " ") ?? "Ready"}</p>
              <p className="mt-4 text-sm text-white/58">{engagementSummary?.automation.nextAutomation?.title ?? "The automation engine is ready to keep the right message close to your next booking."}</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {isInitialLoading ? (
              <>
                <HistorySkeleton />
                <HistorySkeleton />
              </>
            ) : unreadNotifications.length ? unreadNotifications.map((notification) => (
              <div key={notification.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#C4F24E]/16 hover:bg-black/28">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{notification.title}</p>
                    <p className="mt-2 text-sm leading-7 text-white/62">{notification.body}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/68">
                    {notification.type.replaceAll("_", " ")}
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/15 p-5 text-sm leading-7 text-white/58">
                Notifications will show reminders, promotions, and booking alerts as soon as the automation engine or booking lifecycle creates them.
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <ClientActionLink href="/activity" size="lg">
              Open activity
            </ClientActionLink>
            <ClientActionLink href="/profile" variant="secondary" size="lg">
              Open profile
            </ClientActionLink>
          </div>
        </ClientSectionBlock>
      </section>
    </div>
  );
}
