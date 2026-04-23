"use client";

import type { Route } from "next";
import { useMemo } from "react";
import { ArrowRight, Search, ShieldCheck } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientDiscoveryCard } from "@/components/client-experience/client-discovery-card";
import { ClientFavoriteBarberCard } from "@/components/client-experience/client-favorite-barber-card";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { NextAvailableChairCard } from "@/components/client-experience/next-available-chair-card";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientAiSummaryQuery, useTrackAiRecommendationMutation } from "@/lib/ai/client";
import {
  useBarberProfileQuery,
  useClientBookingsQuery,
  useClientHomeQuery,
  useClientMembershipQuery,
  useClientPointsBalanceQuery,
  type BookingApiError
} from "@/lib/booking/client";
import { useClientReferralSummary } from "@/lib/engagement/client";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { usePaymentMethodsQuery } from "@/lib/payments/client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

function RailSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
      {[0, 1].map((index) => (
        <div key={index} className="w-[18.5rem] shrink-0 overflow-hidden rounded-[30px] border border-white/8 bg-black/20 p-4">
          <Skeleton className="h-44 rounded-[24px]" />
          <Skeleton className="mt-4 h-5 w-36" />
          <Skeleton className="mt-3 h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

const EMPTY_TRUSTED_BARBERS: NonNullable<NonNullable<ReturnType<typeof useClientHomeQuery>["data"]>["trustedBarbers"]> = [];

function formatAppointmentTime(iso?: string | null) {
  if (!iso) {
    return "Not scheduled";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function describePaymentStatus(input: {
  outstandingBalance: number;
  paymentStatus?: string | null;
  paymentMethodLabel?: string | null;
}) {
  if (input.paymentStatus === "captured") {
    return "Payment captured for this booking.";
  }

  if (input.paymentStatus === "authorized") {
    return "Card on file is authorized for this booking.";
  }

  if (input.paymentStatus === "pending") {
    return "Payment is waiting to complete.";
  }

  if (input.paymentStatus === "failed") {
    return "Payment needs attention before checkout.";
  }

  if (input.outstandingBalance > 0 && input.paymentMethodLabel) {
    return `${input.paymentMethodLabel} is ready for the next booking payment.`;
  }

  if (input.outstandingBalance > 0) {
    return "Add a saved payment method to make the next booking faster.";
  }

  return "No payment due right now.";
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
  const aiSummaryQuery = useClientAiSummaryQuery(isSignedInClient);
  const pointsBalanceQuery = useClientPointsBalanceQuery(isSignedInClient);
  const referralSummaryQuery = useClientReferralSummary(isSignedInClient);
  const membershipQuery = useClientMembershipQuery(isSignedInClient);
  const trackAiRecommendationMutation = useTrackAiRecommendationMutation();
  const paymentMethodsQuery = usePaymentMethodsQuery(undefined, isSignedInClient);

  const payload = homeQuery.data;
  const bookingsPayload = bookingsQuery.data;
  const trustedBarbers = payload?.trustedBarbers ?? EMPTY_TRUSTED_BARBERS;
  const favoriteBarber = payload?.favoriteBarber ?? null;
  const nextAvailableChair = payload?.nextAvailableChair ?? null;
  const nextAppointment = bookingsPayload?.nextAppointment ?? null;
  const history = bookingsPayload?.history ?? [];
  const lastCompletedAppointment = history[0] ?? null;
  const rebookingReminder = aiSummaryQuery.data?.rebookingReminder ?? null;
  const availableNowSuggestion = aiSummaryQuery.data?.availableNowSuggestions[0] ?? null;
  const firstName = displayName.split(" ")[0] ?? "there";
  const isInitialLoading = (homeQuery.isLoading && !payload) || (bookingsQuery.isLoading && !bookingsPayload);
  const errorMessage = homeQuery.error || bookingsQuery.error
    ? getReadableActionError((homeQuery.error ?? bookingsQuery.error) as BookingApiError)
    : null;

  const favoriteBarberId = favoriteBarber?.barberId ?? payload?.client?.favoriteBarberReference;
  const favoriteProfileQuery = useBarberProfileQuery(favoriteBarberId);
  const favoriteProfile = favoriteProfileQuery.data;
  const paymentMethods = paymentMethodsQuery.data?.methods ?? [];
  const defaultPaymentMethod = paymentMethods.find((method) => method.isDefault)
    ?? bookingsPayload?.nextAppointmentPayment?.defaultPaymentMethod
    ?? null;
  const pointsBalance = pointsBalanceQuery.data ?? null;
  const referralSummary = referralSummaryQuery.data ?? null;
  const membership = membershipQuery.data ?? null;
  const activeMembership = membership?.subscription ?? null;
  const membershipValue = membership?.value ?? null;

  const repeatReference = nextAppointment ?? lastCompletedAppointment;

  function handleAiRecommendationClick(input: {
    recommendationId: string;
    recommendationType: "rebooking_reminder" | "available_now" | "barber_gap_alert";
    relatedIds?: Record<string, unknown>;
    payload?: Record<string, unknown>;
  }) {
    trackAiRecommendationMutation.mutate({
      recommendationId: input.recommendationId,
      recommendationType: input.recommendationType,
      action: "clicked",
      surface: "client_home",
      relatedIds: input.relatedIds,
      payload: input.payload
    });
  }

  const rebookHref: Route = repeatReference
    ? buildMarketplaceBookingHref({
        barberId: repeatReference.barberId,
        username: favoriteBarber?.barberId === repeatReference.barberId
          ? favoriteBarber?.username ?? favoriteProfile?.profile.username
          : favoriteProfile?.profile.username,
        locationId: repeatReference.locationId,
        serviceId: repeatReference.serviceId,
        sourceKind: "client_dashboard"
      })
    : favoriteProfile?.bookingCtaHref
      ? (favoriteProfile.bookingCtaHref as Route)
      : favoriteBarber
        ? buildMarketplaceBookingHref({
            barberId: favoriteBarber.barberId,
            username: favoriteBarber.username,
            locationId: payload?.locationId,
            serviceId: favoriteBarber.mostBookedServiceId,
            sourceKind: "client_dashboard"
          })
        : "/search";
  const aiRebookHref: Route | null = rebookingReminder
    ? buildMarketplaceBookingHref({
        ...rebookingReminder.booking,
        aiRecommendationId: rebookingReminder.recommendationId,
        aiRecommendationType: rebookingReminder.type
      })
    : null;
  const primaryRebookHref = aiRebookHref ?? rebookHref;

  const rescheduleHref: Route = nextAppointment
    ? buildMarketplaceBookingHref({
        barberId: nextAppointment.barberId,
        username: favoriteBarber?.barberId === nextAppointment.barberId
          ? favoriteBarber?.username ?? favoriteProfile?.profile.username
          : favoriteProfile?.profile.username,
        locationId: nextAppointment.locationId,
        serviceId: nextAppointment.serviceId,
        sourceKind: "client_dashboard"
      })
    : "/booking/new";

  const favoriteProfileHref: Route = favoriteProfile
    ? (`/barber/${favoriteProfile.profile.username}` as Route)
    : favoriteBarber?.username
      ? (`/barber/${favoriteBarber.username}` as Route)
      : "/search";

  const bookNowHref: Route = nextAvailableChair
    ? buildMarketplaceBookingHref({
        barberId: nextAvailableChair.barberId,
        username: nextAvailableChair.username,
        locationId: nextAvailableChair.locationId,
        appointmentTime: nextAvailableChair.appointmentTime,
        sourceKind: "haircut_now",
        matchedFrom: nextAvailableChair.matchedFrom
      })
    : "/search";
  const aiBookNowHref: Route | null = availableNowSuggestion
    ? buildMarketplaceBookingHref({
        ...availableNowSuggestion.booking,
        aiRecommendationId: availableNowSuggestion.recommendationId,
        aiRecommendationType: availableNowSuggestion.type
      })
    : null;
  const primaryBookNowHref = aiBookNowHref ?? bookNowHref;

  const nextAvailablePreview = useMemo(() => {
    if (availableNowSuggestion) {
      return {
        accent: "#7cff00",
        barberId: availableNowSuggestion.booking.barberId,
        barberName: availableNowSuggestion.barberName,
        bookHref: primaryBookNowHref,
        distanceLabel: availableNowSuggestion.distanceMiles
          ? `${availableNowSuggestion.distanceMiles.toFixed(1)} mi away`
          : "Nearby",
        headline: availableNowSuggestion.explanation,
        locationId: availableNowSuggestion.locationId,
        nextSlotLabel: formatAppointmentTime(availableNowSuggestion.appointmentTime),
        profileHref: `/barber/${availableNowSuggestion.username}` as Route,
        rating: availableNowSuggestion.rating,
        shopName: availableNowSuggestion.shopName ?? "BVRB3R marketplace",
        username: availableNowSuggestion.username,
        waitLabel: "AI available now"
      };
    }

    if (!nextAvailableChair) {
      return null;
    }

    const matchedResult = [favoriteBarber, ...trustedBarbers]
      .filter(Boolean)
      .find((candidate) => candidate?.barberId === nextAvailableChair.barberId);

    return {
      accent: matchedResult?.badges.includes("top_barber") ? "#d7ffab" : "#7cff00",
      barberId: nextAvailableChair.barberId,
      barberName: nextAvailableChair.barberName,
      bookHref: bookNowHref,
      distanceLabel: matchedResult ? `${matchedResult.distanceMiles.toFixed(1)} mi away` : "Nearby",
      headline: nextAvailableChair.matchReason,
      locationId: nextAvailableChair.locationId,
      nextSlotLabel: formatAppointmentTime(nextAvailableChair.appointmentTime),
      profileHref: `/barber/${nextAvailableChair.username}` as Route,
      rating: nextAvailableChair.rating,
      shopName: nextAvailableChair.shopName ?? "BVRB3R marketplace",
      username: nextAvailableChair.username,
      waitLabel: "Next open chair"
    };
  }, [availableNowSuggestion, bookNowHref, favoriteBarber, nextAvailableChair, primaryBookNowHref, trustedBarbers]);

  const paymentStatusCopy = describePaymentStatus({
    outstandingBalance: bookingsPayload?.nextAppointmentPayment?.outstandingBalance ?? nextAppointment?.balanceDue ?? 0,
    paymentStatus: bookingsPayload?.nextAppointmentPayment?.latestBookingPayment?.paymentStatus ?? null,
    paymentMethodLabel: defaultPaymentMethod?.label
  });

  const homeIsEmpty = !isInitialLoading
    && !nextAppointment
    && !lastCompletedAppointment
    && !favoriteBarber
    && !trustedBarbers.length
    && !nextAvailableChair;

  return (
    <div className="space-y-4" data-testid="client-home-screen">
      <Card className="rounded-[38px] border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(6,6,6,0.99))] p-5 shadow-[0_30px_70px_rgba(0,0,0,0.32)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,255,0,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_26%)]" />
        <div className="relative grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#d7ffab]">Client home</p>
            <h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold sm:text-5xl" data-display="true">
              {homeIsEmpty
                ? `Find your first barber, ${firstName}.`
                : `Book fast with people you trust, ${firstName}.`}
            </h1>
            <p className="mt-4 max-w-2xl wrap-safe text-sm leading-7 text-white/68">
              Rebook your regular barber, grab the next open chair, and keep your booking and payment basics close without turning Home into a business dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ClientActionLink
                href={repeatReference || favoriteBarber ? primaryRebookHref : "/search"}
                size="lg"
                onClick={() => {
                  if (!rebookingReminder) {
                    return;
                  }

                  handleAiRecommendationClick({
                    recommendationId: rebookingReminder.recommendationId,
                    recommendationType: rebookingReminder.type,
                    relatedIds: {
                      barberId: rebookingReminder.booking.barberId,
                      serviceId: rebookingReminder.booking.serviceId,
                      locationId: rebookingReminder.booking.locationId
                    }
                  });
                }}
              >
                {repeatReference || favoriteBarber ? "Rebook" : "Find a barber"}
              </ClientActionLink>
              <ClientActionLink
                href={primaryBookNowHref}
                size="lg"
                variant="secondary"
                onClick={() => {
                  if (!availableNowSuggestion) {
                    return;
                  }

                  handleAiRecommendationClick({
                    recommendationId: availableNowSuggestion.recommendationId,
                    recommendationType: availableNowSuggestion.type,
                    relatedIds: {
                      barberId: availableNowSuggestion.booking.barberId,
                      locationId: availableNowSuggestion.locationId
                    }
                  });
                }}
              >
                {availableNowSuggestion || nextAvailableChair ? "Book the next open chair" : "Search availability"}
              </ClientActionLink>
            </div>
            {rebookingReminder ? (
              <div className="mt-5 rounded-[24px] border border-[#d7ffab]/16 bg-[#d7ffab]/8 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#d7ffab]">Rebooking reminder</p>
                <p className="mt-3 text-lg font-semibold text-white">{rebookingReminder.title}</p>
                <p className="mt-2 text-sm leading-7 text-white/68">{rebookingReminder.reason}</p>
                <p className="mt-2 text-sm text-white/52">{rebookingReminder.explanation}</p>
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-white/58">
              {lastCompletedAppointment ? (
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-white/78">
                  Last service {lastCompletedAppointment.view?.service?.name ?? "Completed visit"}
                </span>
              ) : null}
              {lastCompletedAppointment ? (
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-white/78">
                  Last price {currency(lastCompletedAppointment.grandTotal ?? lastCompletedAppointment.totalAmount)}
                </span>
              ) : null}
              {favoriteBarber ? (
                <span className="rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-3 py-2 text-[#e8ffc2]">
                  Favorite barber {favoriteBarber.barberName}
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-black/22 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Upcoming appointment</p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {nextAppointment
                      ? (nextAppointment.view?.service?.name ?? "Upcoming appointment")
                      : "Nothing booked yet"}
                  </p>
                  <p className="mt-2 text-sm text-white/60">
                    {nextAppointment
                      ? formatAppointmentTime(nextAppointment.start)
                      : "Use Search to compare real barbers, services, and next availability."}
                  </p>
                  <p className="mt-2 text-sm text-white/46">
                    {nextAppointment
                      ? `${nextAppointment.view?.barber?.name ?? favoriteBarber?.barberName ?? "Your barber"} | ${nextAppointment.view?.location?.name ?? "Your regular location"}`
                      : "Fresh client accounts start clean until a real booking exists."}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/72">
                  {nextAppointment ? nextAppointment.status.replaceAll("_", " ") : "Empty"}
                </span>
              </div>
              <div className="mt-4 rounded-[22px] border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#d7ffab]">Payment and policy</p>
                <p className="mt-3 text-sm leading-7 text-white/68">{paymentStatusCopy}</p>
                {nextAppointment ? (
                  <p className="mt-2 text-sm text-white/52">
                    Deposit reserved {currency(nextAppointment.depositAmount)} | Remaining balance {currency(nextAppointment.balanceDue)}
                  </p>
                ) : null}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <ClientActionLink href="/bookings" size="md">
                  Manage
                </ClientActionLink>
                {nextAppointment ? (
                  <ClientActionLink href={rescheduleHref} size="md" variant="secondary">
                    Reschedule
                  </ClientActionLink>
                ) : null}
                {nextAppointment ? (
                  <ClientActionLink href="/bookings?intent=cancel" size="md" variant="outline">
                    Cancel
                  </ClientActionLink>
                ) : null}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/22 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Wallet snapshot</p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {defaultPaymentMethod ? defaultPaymentMethod.label : "No saved card yet"}
                  </p>
                  <p className="mt-2 text-sm text-white/60">
                    {paymentMethods.length
                      ? `${paymentMethods.length} saved payment method${paymentMethods.length === 1 ? "" : "s"} ready for booking.`
                      : "Save a payment method once and reuse it on future bookings."}
                  </p>
                </div>
                <span className="rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#e8ffc2]">
                  {paymentMethods.length ? "Saved" : "Add card"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/72">
                  Default {defaultPaymentMethod ? "ready" : "missing"}
                </div>
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/72">
                  Receipts live in past visits
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <ClientActionLink href="/profile" size="md">
                  Manage wallet
                </ClientActionLink>
                <ClientActionLink href="/bookings" size="md" variant="secondary">
                  Open receipts
                </ClientActionLink>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/22 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">BVR Points and retention</p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {pointsBalance?.unlockedPoints
                      ? `${pointsBalance.unlockedPoints} BVR Points`
                      : "Retention starts after real visits close"}
                  </p>
                  <p className="mt-2 text-sm text-white/60">
                    {pointsBalance?.unlockedPoints
                      ? `Redeem up to ${currency(pointsBalance.inAppValue)} on a future booking once you want to use it.`
                      : "Completed paid services unlock points, referrals, and membership value from canonical booking and payment truth."}
                  </p>
                  {membershipValue ? (
                    <p className="mt-2 text-sm text-white/46">
                      {membershipValue.valueMessage}
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#e8ffc2]">
                  {activeMembership ? activeMembership.subscriptionStatus.replaceAll("_", " ") : "No membership"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/72">
                  Referrals {referralSummary?.totals.credited ?? 0} credited
                </div>
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/72">
                  {referralSummary?.referralCode?.code
                    ? `Code ${referralSummary.referralCode.code}`
                    : "Referral code ready when your account is live"}
                </div>
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/72">
                  {activeMembership
                    ? `${activeMembership.planName} | ${activeMembership.billingState.replaceAll("_", " ")}`
                    : "No active membership yet"}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <ClientActionLink href="/referrals" size="md">
                  Open referrals
                </ClientActionLink>
                <ClientActionLink href="/profile" size="md" variant="secondary">
                  Manage points and membership
                </ClientActionLink>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}

      <ClientSectionBlock
        eyebrow="Rebook"
        title={repeatReference || favoriteBarber ? "Get back into your usual chair." : "Start with a real barber."}
        subtitle={repeatReference || favoriteBarber
          ? "Use your last barber, last service, and real booking history to move straight back into the right appointment."
          : "Fresh accounts stay clean until there is real history. Search live barbers and book your first visit from canonical availability."}
      >
        {repeatReference || favoriteBarber ? (
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] p-5 shadow-[0_20px_42px_rgba(0,0,0,0.18)]">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Strongest next action</p>
              <h3 className="mt-3 text-2xl font-semibold text-white" data-display="true">
                {repeatReference?.view?.service?.name ?? favoriteBarber?.mostBookedService ?? "Book your next service"}
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/64">
                {repeatReference
                  ? `Last booked with ${repeatReference.view?.barber?.name ?? favoriteBarber?.barberName ?? "your barber"} at ${formatAppointmentTime(repeatReference.start)}.`
                  : `Your favorite barber is ${favoriteBarber?.barberName}.`}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Barber</p>
                  <p className="mt-3 text-white">{repeatReference?.view?.barber?.name ?? favoriteBarber?.barberName ?? "Your barber"}</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Price</p>
                  <p className="mt-3 text-white">{repeatReference ? currency(repeatReference.grandTotal ?? repeatReference.totalAmount) : favoriteBarber?.priceRangeLabel ?? "Live price on profile"}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <ClientActionLink
                  href={primaryRebookHref}
                  size="lg"
                  onClick={() => {
                    if (!rebookingReminder) {
                      return;
                    }

                    handleAiRecommendationClick({
                      recommendationId: rebookingReminder.recommendationId,
                      recommendationType: rebookingReminder.type,
                      relatedIds: {
                        barberId: rebookingReminder.booking.barberId,
                        serviceId: rebookingReminder.booking.serviceId,
                        locationId: rebookingReminder.booking.locationId
                      }
                    });
                  }}
                >
                  Rebook now
                </ClientActionLink>
                <ClientActionLink href="/search" size="lg" variant="secondary">
                  Search more barbers
                </ClientActionLink>
              </div>
            </div>

            {favoriteProfile || favoriteBarber ? (
              <ClientFavoriteBarberCard
                barberId={favoriteProfile?.barber.id ?? favoriteBarber?.barberId ?? "favorite-barber"}
                name={favoriteProfile?.barber.name ?? favoriteBarber?.barberName ?? "Your barber"}
                rating={favoriteProfile?.proof?.reviewScore ?? favoriteBarber?.rating ?? 5}
                locationLabel={
                  favoriteBarber?.shopName
                  ?? favoriteProfile?.shopLocations.map((location) => location.name).join(" | ")
                  ?? "Trusted chair"
                  }
                  headline={favoriteProfile?.profile.headline ?? favoriteBarber?.mostBookedService ?? "Keep your repeat booking lane simple."}
                  specialties={favoriteProfile?.profile.specialties ?? favoriteBarber?.specialties ?? []}
                  profileHref={favoriteProfileHref}
                  bookHref={primaryRebookHref}
                  username={favoriteProfile?.profile.username ?? favoriteBarber?.username}
                />
              ) : null}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">First booking</p>
            <h3 className="mt-3 text-2xl font-semibold text-white" data-display="true">No booking history yet.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Search real barbers, compare services and trust signals, and book your first appointment from live availability. Nothing is fabricated here.
            </p>
            <div className="mt-5">
              <ClientActionLink href="/search" size="lg">
                Search barbers
                <Search className="h-4 w-4" />
              </ClientActionLink>
            </div>
          </div>
        )}
      </ClientSectionBlock>

      {nextAvailablePreview ? (
        <ClientSectionBlock
          eyebrow="Available now"
          title="Take the next open chair."
          subtitle={availableNowSuggestion
            ? "This suggestion is based on live canonical availability and only shows supply that is currently trusted and bookable."
            : "When you want a cut today, the fastest real opening stays one tap away."}
        >
          {isInitialLoading ? <RailSkeleton /> : (
            <NextAvailableChairCard
              match={nextAvailablePreview}
              fallbackHref="/search"
              onBookClick={() => {
                if (!availableNowSuggestion) {
                  return;
                }

                handleAiRecommendationClick({
                  recommendationId: availableNowSuggestion.recommendationId,
                  recommendationType: availableNowSuggestion.type,
                  relatedIds: {
                    barberId: availableNowSuggestion.booking.barberId,
                    locationId: availableNowSuggestion.locationId
                  }
                });
              }}
            />
          )}
        </ClientSectionBlock>
      ) : null}

      <ClientSectionBlock
        eyebrow="Discovery"
        title="Search live barbers around you."
        subtitle={trustedBarbers.length
          ? "Only approved, active, bookable barbers appear here. Compare real specialties, trust labels, prices, and next openings."
          : "No real barbers are live in this area yet. Verified, active, bookable supply will appear automatically when it exists."}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm text-white/72">
            <ShieldCheck className="h-4 w-4 text-[#baff69]" />
            Canonical discovery only
          </div>
          <ClientActionLink href="/search" size="md" variant="secondary">
            Open search
            <ArrowRight className="h-4 w-4" />
          </ClientActionLink>
        </div>
        {isInitialLoading ? (
          <RailSkeleton />
        ) : trustedBarbers.length ? (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {trustedBarbers.map((result) => (
              <ClientDiscoveryCard key={result.barberId} result={result} />
            ))}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">No live barbers</p>
            <h3 className="mt-3 text-2xl font-semibold text-white" data-display="true">No barbers are accepting bookings here yet.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              BVRB3R only exposes barbers after verification, activation, and booking readiness are all real.
            </p>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Recent visits"
        title="Past appointments stay ready for rebook and receipts."
        subtitle={history.length
          ? "Completed visits show the real barber, service, date, total, and receipt trail so rebooking stays easy."
          : "Your completed visits will show up here after the first real appointment closes."}
      >
        {isInitialLoading ? (
          <RailSkeleton />
        ) : history.length ? (
          <div className="space-y-3">
            {history.slice(0, 3).map((appointment) => (
              <div key={appointment.id} className="rounded-[26px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">
                      {appointment.view?.service?.name ?? appointment.serviceSnapshot?.service_name ?? "Completed service"}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-white/62">
                      {appointment.view?.barber?.name ?? "Your barber"} | {formatAppointmentTime(appointment.start)}
                    </p>
                    <p className="text-sm text-white/50">
                      {appointment.view?.location?.name ?? "Your regular location"} | {currency(appointment.grandTotal ?? appointment.totalAmount)}
                    </p>
                  </div>
                  <ClientActionLink
                    href={buildMarketplaceBookingHref({
                      barberId: appointment.barberId,
                      locationId: appointment.locationId,
                      serviceId: appointment.serviceId,
                      sourceKind: "client_dashboard"
                    })}
                    size="md"
                  >
                    Book again
                  </ClientActionLink>
                </div>
              </div>
            ))}
            <ClientActionLink href="/bookings" size="md" variant="secondary">
              Open full history
            </ClientActionLink>
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-white/12 bg-black/18 p-5 sm:p-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">No past appointments</p>
            <p className="mt-3 text-lg font-semibold text-white">
              Your first completed visit will show up here.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">
              Once an appointment is completed, this section becomes the fastest way to rebook and open the receipt trail.
            </p>
          </div>
        )}
      </ClientSectionBlock>
    </div>
  );
}


