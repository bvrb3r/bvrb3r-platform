"use client";

import type { Route } from "next";
import { useMemo } from "react";
import { ArrowRight, Clock3, MapPin, Sparkles, Star } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientDiscoveryCard } from "@/components/client-experience/client-discovery-card";
import { ClientFavoriteBarberCard } from "@/components/client-experience/client-favorite-barber-card";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { NextAvailableChairCard } from "@/components/client-experience/next-available-chair-card";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBarberProfileQuery,
  useClientBookingsQuery,
  useClientHomeQuery,
  useClientPointsBalanceQuery,
  type BookingApiError
} from "@/lib/booking/client";
import { useClientEngagementSummary } from "@/lib/engagement/client";
import { getBestBarberForClient } from "@/lib/intelligence/matching";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { EngagementNotificationRecord } from "@/types/engagement";

function FeedSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
      {[0, 1, 2].map((index) => (
        <div key={index} className="w-[18.5rem] shrink-0 overflow-hidden rounded-[32px] border border-white/8 bg-black/20 p-4">
          <Skeleton className="h-44 rounded-[24px]" />
          <Skeleton className="mt-4 h-5 w-36" />
          <Skeleton className="mt-3 h-4 w-28" />
          <Skeleton className="mt-4 h-20 rounded-[20px]" />
          <Skeleton className="mt-5 h-11 w-32 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function FeedRail({ children }: { children: React.ReactNode; }) {
  return <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">{children}</div>;
}

function formatSlotTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatAppointmentTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function getEstimatedWaitLabel(matchedFrom: "favorite_barber" | "favorite_shop" | "nearby" | "available_now", distanceMiles?: number) {
  const baseMinutes = {
    favorite_barber: 12,
    favorite_shop: 16,
    nearby: 18,
    available_now: 10
  }[matchedFrom];
  const distanceAdjustment = distanceMiles ? Math.max(0, Math.round(distanceMiles * 4) - 3) : 0;
  return `${baseMinutes + distanceAdjustment} min`;
}

function pickRewardReminder(notifications: EngagementNotificationRecord[] = []) {
  return notifications.find((notification) =>
    notification.type === "loyalty_milestone"
    || notification.type === "reward_follow_up"
    || notification.type === "referral_reward"
  );
}

function buildRewardNudge(input: {
  unlockedPoints?: number;
  inAppValue?: number;
  explanation?: {
    pointsToNextMilestone: number;
    nextMilestoneInAppValue: number;
  };
  rewardReminder?: EngagementNotificationRecord;
}) {
  if (input.rewardReminder?.body) {
    return input.rewardReminder.body;
  }

  if ((input.unlockedPoints ?? 0) > 0 && (input.inAppValue ?? 0) >= 5) {
    return `You have ${currency(input.inAppValue ?? 0)} ready to use on your next booking.`;
  }

  if (input.explanation && input.explanation.pointsToNextMilestone > 0) {
    return `You are ${input.explanation.pointsToNextMilestone} pts away from ${currency(input.explanation.nextMilestoneInAppValue)} in booking value.`;
  }

  return "Book today and BVR Points will track as soon as the paid service is completed.";
}

export function ClientHomeScreen({
  isSignedInClient,
  displayName
}: {
  clientId?: string;
  isSignedInClient: boolean;
  displayName: string;
}) {
  const homeQuery = useClientHomeQuery();
  const bookingsQuery = useClientBookingsQuery();
  const pointsBalanceQuery = useClientPointsBalanceQuery(isSignedInClient);
  const engagementQuery = useClientEngagementSummary(isSignedInClient);
  const payload = homeQuery.data;
  const bookingsPayload = bookingsQuery.data;
  const shops = useMemo(() => payload?.shops ?? [], [payload?.shops]);
  const activeShop = shops.find((shop) => shop.id === payload?.locationId) ?? shops[0];
  const favoriteBarber = payload?.favoriteBarber ?? null;
  const trustedBarbers = useMemo(() => payload?.trustedBarbers ?? [], [payload?.trustedBarbers]);
  const favoriteBarberId = favoriteBarber?.barberId ?? payload?.client?.favoriteBarberReference;
  const favoriteProfileQuery = useBarberProfileQuery(favoriteBarberId);
  const favoriteProfile = favoriteProfileQuery.data;
  const nextAvailableChair = payload?.nextAvailableChair ?? null;
  const nextAvailableProfileQuery = useBarberProfileQuery(nextAvailableChair?.barberId);
  const nextAvailableProfile = nextAvailableProfileQuery.data;
  const nextAppointment = bookingsPayload?.nextAppointment ?? null;
  const lastCompletedAppointment = bookingsPayload?.history?.[0] ?? null;
  const pointsBalance = pointsBalanceQuery.data;
  const rewardReminder = pickRewardReminder(engagementQuery.data?.recentNotifications ?? []);
  const errorMessage = homeQuery.error || bookingsQuery.error
    ? getReadableActionError((homeQuery.error ?? bookingsQuery.error) as BookingApiError)
    : null;
  const isInitialLoading = (homeQuery.isLoading && !payload) || (bookingsQuery.isLoading && !bookingsPayload);

  const favoriteProfileHref = useMemo(() => {
    if (favoriteProfile) {
      return `/barber/${favoriteProfile.profile.username}` as Route;
    }

    if (favoriteBarber?.username) {
      return `/barber/${favoriteBarber.username}` as Route;
    }

    return "/search" as Route;
  }, [favoriteBarber?.username, favoriteProfile]);

  const repeatReference = nextAppointment ?? lastCompletedAppointment;
  const bookAgainHref = useMemo(() => {
    if (repeatReference) {
      return buildMarketplaceBookingHref({
        barberId: repeatReference.barberId,
        username: favoriteBarber?.barberId === repeatReference.barberId
          ? favoriteBarber?.username ?? favoriteProfile?.profile.username
          : favoriteProfile?.profile.username,
        locationId: repeatReference.locationId,
        serviceId: repeatReference.serviceId,
        sourceKind: "client_dashboard"
      });
    }

    if (favoriteProfile?.bookingCtaHref) {
      return favoriteProfile.bookingCtaHref as Route;
    }

    if (favoriteBarber) {
      return buildMarketplaceBookingHref({
        barberId: favoriteBarber.barberId,
        username: favoriteBarber.username,
        locationId: payload?.locationId,
        serviceId: favoriteBarber.mostBookedServiceId,
        sourceKind: "client_dashboard"
      });
    }

    return "/search" as Route;
  }, [favoriteBarber, favoriteProfile?.bookingCtaHref, favoriteProfile?.profile.username, payload?.locationId, repeatReference]);

  const bookAsapHref: Route = nextAvailableChair
    ? buildMarketplaceBookingHref({
        barberId: nextAvailableChair.barberId,
        username: nextAvailableChair.username,
        locationId: nextAvailableChair.locationId,
        sourceKind: "haircut_now",
        matchedFrom: nextAvailableChair.matchedFrom
      })
    : "/booking/new?mode=next-available";

  const nextAvailablePreview = useMemo(() => {
    if (!nextAvailableChair) {
      return null;
    }

    const matchedDiscoveryResult = [favoriteBarber, ...trustedBarbers].filter(Boolean).find((result) => result?.barberId === nextAvailableChair.barberId);
    return {
      accent: nextAvailableProfile?.profile.photoAccent ?? "#7cff00",
      barberId: nextAvailableChair.barberId,
      barberName: nextAvailableChair.barberName,
      bookHref: bookAsapHref,
      distanceLabel: matchedDiscoveryResult ? `${matchedDiscoveryResult.distanceMiles.toFixed(1)} mi away` : `${activeShop?.neighborhood ?? "Ybor City"}`,
      headline: nextAvailableProfile?.profile.headline ?? nextAvailableChair.matchReason,
      locationId: nextAvailableChair.locationId,
      nextSlotLabel: formatSlotTime(nextAvailableChair.appointmentTime),
      profileHref: nextAvailableProfile ? (`/barber/${nextAvailableProfile.profile.username}` as Route) : undefined,
      rating: nextAvailableChair.rating,
      shopName: nextAvailableChair.shopName ?? activeShop?.name ?? "BVRB3R Shop",
      username: nextAvailableChair.username,
      waitLabel: getEstimatedWaitLabel(nextAvailableChair.matchedFrom, matchedDiscoveryResult?.distanceMiles)
    };
  }, [activeShop?.name, activeShop?.neighborhood, bookAsapHref, favoriteBarber, nextAvailableChair, nextAvailableProfile, trustedBarbers]);

  const rewardNudge = buildRewardNudge({
    unlockedPoints: pointsBalance?.unlockedPoints,
    inAppValue: pointsBalance?.inAppValue,
    explanation: pointsBalance?.explanation,
    rewardReminder
  });
  const hasRepeatLane = Boolean(repeatReference || favoriteBarber || favoriteProfile?.bookingCtaHref);
  const primaryCtaHref: Route = hasRepeatLane ? bookAgainHref : "/search";
  const primaryCtaLabel = hasRepeatLane ? "Book Again" : "Find a Barber";
  const bestBarberMatches = useMemo(() => getBestBarberForClient({
    clientId: payload?.client?.clientReference,
    candidates: trustedBarbers,
    favoriteBarber,
    nextAvailableChair,
    lastServiceId: repeatReference?.serviceId,
    lastBarberId: repeatReference?.barberId
  }), [favoriteBarber, nextAvailableChair, payload?.client?.clientReference, repeatReference?.barberId, repeatReference?.serviceId, trustedBarbers]);
  const bestBarber = bestBarberMatches[0] ?? null;

  return (
    <div className="space-y-4" data-testid="client-home-screen">
      <Card className="rounded-[38px] border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(6,6,6,0.99))] p-5 shadow-[0_30px_70px_rgba(0,0,0,0.32)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,255,0,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_26%)]" />
        <div className="relative grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/72">
                {activeShop?.neighborhood ?? "Ybor City"}
              </span>
              <span className="rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#e8ffc2]">
                BVRB3R marketplace
              </span>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.24em] text-[#d7ffab]">Client home</p>
            <h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold sm:text-5xl" data-display="true">
              {isSignedInClient ? `Book fast with people you trust, ${displayName.split(" ")[0]}.` : "Book a trusted barber in minutes."}
            </h1>
            <p className="mt-4 max-w-2xl wrap-safe text-sm leading-7 text-white/68">
              Repeat the barber you already trust, grab the next open chair, and keep BVR Points close without turning Home into a rewards dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ClientActionLink href={primaryCtaHref} size="lg">
                {primaryCtaLabel}
              </ClientActionLink>
              <ClientActionLink href={bookAsapHref} size="lg" variant="secondary">
                Get a Haircut Now
              </ClientActionLink>
            </div>
            <div className="mt-5 rounded-[24px] border border-[#d7ffab]/16 bg-[#d7ffab]/8 px-4 py-4 text-sm text-white/78">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#d7ffab]" />
                <p>{rewardNudge}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-black/22 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">BVR Points</p>
                  <p className="mt-3 text-3xl font-semibold text-white" data-display="true">
                    {pointsBalanceQuery.isLoading && !pointsBalance ? "..." : pointsBalance?.unlockedPoints ?? 0} pts
                  </p>
                  <p className="mt-2 text-sm text-white/60">
                    {currency(pointsBalance?.inAppValue ?? 0)} in booking value
                  </p>
                </div>
                <div className="rounded-[22px] border border-[#d7ffab]/18 bg-[#d7ffab]/10 p-3 text-right">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#e8ffc2]">Pending</p>
                  <p className="mt-2 text-lg font-semibold text-white">{pointsBalance?.pendingPoints ?? 0}</p>
                </div>
              </div>
              <p className="mt-4 wrap-safe text-sm leading-7 text-white/60">
                {pointsBalance?.explanation.progressLabel ?? "Rewards stay ready here without interrupting your next booking."}
              </p>
              <div className="mt-4">
                <ClientActionLink href="/activity" size="md" variant="outline">
                  Open Rewards
                </ClientActionLink>
              </div>
            </div>

            {nextAppointment ? (
              <div className="rounded-[28px] border border-white/10 bg-black/22 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Active booking</p>
                    <p className="mt-3 line-clamp-2-safe text-xl font-semibold text-white">
                      {nextAppointment.view?.service?.name ?? "Upcoming appointment"}
                    </p>
                    <p className="mt-2 text-sm text-white/60">
                      {formatAppointmentTime(nextAppointment.start)}
                    </p>
                    <p className="mt-1 wrap-safe text-sm text-white/46">
                      {nextAppointment.view?.barber?.name ?? favoriteBarber?.barberName ?? "Your barber"} / {nextAppointment.view?.location?.name ?? activeShop?.name ?? "Your regular shop"}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/72">
                    {nextAppointment.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-4">
                  <ClientActionLink href="/bookings" size="md" variant="secondary">
                    Open Bookings
                  </ClientActionLink>
                </div>
              </div>
            ) : nextAvailablePreview ? (
              <div className="rounded-[28px] border border-white/10 bg-black/22 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Ready now</p>
                <p className="mt-3 text-xl font-semibold text-white">{nextAvailablePreview.barberName}</p>
                <p className="mt-2 text-sm text-white/60">
                  {nextAvailablePreview.shopName} / {nextAvailablePreview.nextSlotLabel}
                </p>
                <p className="mt-2 line-clamp-3-safe text-sm text-white/46">{nextAvailablePreview.headline}</p>
                <div className="mt-4">
                  <ClientActionLink href={bookAsapHref} size="md" variant="secondary">
                    Get a Haircut Now
                  </ClientActionLink>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}

      {nextAvailablePreview ? (
        <ClientSectionBlock
          eyebrow="Available now"
          title="Take the next open chair."
          subtitle="When you want a cut today, keep the fastest trusted option one tap away."
        >
          {isInitialLoading ? (
            <div className="rounded-[34px] border border-white/10 bg-black/18 p-5 sm:p-6">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="mt-4 h-10 w-64" />
              <Skeleton className="mt-5 h-40 w-full rounded-[28px]" />
            </div>
          ) : (
            <NextAvailableChairCard match={nextAvailablePreview} fallbackHref="/search" />
          )}
        </ClientSectionBlock>
      ) : null}

      {bestBarber ? (
        <ClientSectionBlock
          eyebrow="Best match"
          title="Best Barber Near You"
          subtitle="Fastest, highest-rated match for your next cut."
        >
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div
              className={cn(
                "card-safe rounded-[30px] border p-5 shadow-[0_20px_48px_rgba(0,0,0,0.22)]",
                bestBarber.isAvailableNow
                  ? "border-[#7cff00]/28 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(8,8,8,0.96))] shadow-[0_20px_56px_rgba(124,255,0,0.16)]"
                  : "border-white/10 bg-black/20"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="surface-label text-[#d7ffab]">{bestBarber.isAvailableNow ? "Available now" : "Best nearby fit"}</p>
                  <h3 className="mt-3 wrap-safe text-3xl font-semibold" data-display="true">{bestBarber.barberName}</h3>
                  <p className="mt-2 wrap-safe text-sm text-white/58">{bestBarber.shopName ?? bestBarber.locationLabel ?? "Nearby chair"}</p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-black/24 px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-1 text-sm font-semibold text-white">
                    <Star className="h-4 w-4 text-[#d7ffab]" />
                    {bestBarber.rating.toFixed(1)}
                  </div>
                  <p className="mt-1 text-xs text-white/52">{bestBarber.reviewCount || "Fresh"} reviews</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/72">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-black/18 px-3 py-2">
                  <Clock3 className="icon-safe text-[#baff69]" />
                  {bestBarber.isAvailableNow ? "Available now" : bestBarber.availabilityLabel ?? "Next available"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-black/18 px-3 py-2">
                  <MapPin className="icon-safe text-[#d7ffab]" />
                  {bestBarber.locationLabel ?? `${bestBarber.distanceMiles.toFixed(1)} mi away`}
                </span>
                <span className="inline-flex rounded-full border border-white/8 bg-black/18 px-3 py-2">
                  {bestBarber.priceRangeLabel ?? `$${bestBarber.priceRange[0]} - $${bestBarber.priceRange[1]}`}
                </span>
              </div>
              <p className="mt-4 line-clamp-3-safe text-sm leading-7 text-white/68">{bestBarber.matchReason}</p>
              <p className="text-sm text-white/54">{bestBarber.specialties[0] ?? bestBarber.mostBookedService ?? "Versatile barbershop service match"}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <ClientActionLink
                  href={buildMarketplaceBookingHref({
                    barberId: bestBarber.barberId,
                    username: bestBarber.username,
                    locationId: bestBarber.locationId,
                    serviceId: bestBarber.mostBookedServiceId ?? repeatReference?.serviceId,
                    sourceKind: "client_dashboard",
                    query: bestBarber.mostBookedService
                  })}
                  size="lg"
                >
                  Book Now
                </ClientActionLink>
                <ClientActionLink href={`/barber/${bestBarber.username}` as Route} size="lg" variant="secondary">
                  View profile
                </ClientActionLink>
              </div>
            </div>

            <div className="space-y-3">
              {bestBarberMatches.slice(1).length ? bestBarberMatches.slice(1).map((match) => (
                <div key={match.barberId} className="card-safe rounded-[26px] border border-white/10 bg-black/18 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-safe text-lg font-semibold text-white">{match.barberName}</p>
                      <p className="line-clamp-2-safe text-sm text-white/56">{match.specialties[0] ?? match.mostBookedService ?? "Closest available barber"}</p>
                    </div>
                    <span className={cn("status-pill text-white/72", match.isAvailableNow && "border-[#7cff00]/22 bg-[#7cff00]/10 text-[#d7ffab]")}>
                      {match.isAvailableNow ? "Now" : match.availabilityLabel ?? "Soon"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/62">
                    <span>{match.priceRangeLabel ?? `$${match.priceRange[0]} - $${match.priceRange[1]}`}</span>
                    <span>{match.locationLabel ?? `${match.distanceMiles.toFixed(1)} mi away`}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ClientActionLink
                      href={buildMarketplaceBookingHref({
                        barberId: match.barberId,
                        username: match.username,
                        locationId: match.locationId,
                        serviceId: match.mostBookedServiceId ?? repeatReference?.serviceId,
                        sourceKind: "client_dashboard",
                        query: match.mostBookedService
                      })}
                      variant="outline"
                    >
                      Book now
                    </ClientActionLink>
                    <ClientActionLink href={`/barber/${match.username}` as Route} variant="secondary">
                      View profile
                    </ClientActionLink>
                  </div>
                </div>
              )) : (
                <div className="card-safe rounded-[26px] border border-dashed border-white/10 bg-black/16 p-4 text-sm text-white/58">
                  <p className="surface-label">Closest available barbers</p>
                  <p className="wrap-safe">The fastest match is already surfaced above, so you can book without extra scrolling.</p>
                </div>
              )}
            </div>
          </div>
        </ClientSectionBlock>
      ) : null}

      <ClientSectionBlock
        eyebrow="Favorite barber"
        title={favoriteProfile || favoriteBarber ? "Book with your barber" : "Find your go-to barber"}
        subtitle={favoriteProfile || favoriteBarber
          ? "Your repeat-booking lane stays simple: one trusted barber, one obvious next move."
          : "Start with trusted local barbers and save the one you want Home to lead with next time."}
      >
        {favoriteProfile || favoriteBarber ? (
          <ClientFavoriteBarberCard
            barberId={favoriteProfile?.barber.id ?? favoriteBarber?.barberId ?? "favorite-barber"}
            name={favoriteProfile?.barber.name ?? favoriteBarber?.barberName ?? "Your barber"}
            rating={favoriteProfile?.proof?.reviewScore ?? favoriteBarber?.rating ?? 5}
            locationLabel={favoriteBarber?.shopName ?? (favoriteProfile?.shopLocations.map((location) => location.name).join(" | ") || activeShop?.name || "Your regular chair")}
            headline={favoriteProfile?.profile.headline ?? favoriteBarber?.mostBookedService ?? "Your go-to barber stays one tap away."}
            specialties={favoriteProfile?.profile.specialties ?? favoriteBarber?.specialties ?? []}
            profileHref={favoriteProfileHref}
            bookHref={bookAgainHref}
            username={favoriteProfile?.profile.username ?? favoriteBarber?.username}
          />
        ) : isInitialLoading ? (
          <div className="rounded-[32px] border border-white/8 bg-black/20 p-5 sm:p-6">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="mt-4 h-10 w-64" />
            <Skeleton className="mt-5 h-28 w-full rounded-[24px]" />
          </div>
        ) : (
          <div className="rounded-[32px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-5 sm:p-6">
            <h3 className="text-2xl font-semibold text-white" data-display="true">Find your go-to barber</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/64">
              Use Search to explore barbers, then save a favorite so Home becomes your fastest path back into a chair.
            </p>
            <div className="mt-5">
              <ClientActionLink href="/search" size="lg">
                Explore barbers
                <ArrowRight className="h-4 w-4" />
              </ClientActionLink>
            </div>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Trusted barbers"
        title="Trusted Barbers Around Ybor City"
        subtitle="Browse nearby chairs with real profile trust, visual proof, and direct booking actions."
      >
        {isInitialLoading ? (
          <FeedSkeleton />
        ) : (
          <FeedRail>
            {trustedBarbers.map((result) => <ClientDiscoveryCard key={`trusted-${result.barberId}`} result={result} />)}
          </FeedRail>
        )}
      </ClientSectionBlock>
    </div>
  );
}
