"use client";

import type { Route } from "next";
import { useMemo } from "react";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  Repeat2,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards
} from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientDiscoveryCard } from "@/components/client-experience/client-discovery-card";
import { ClientFavoriteBarberCard } from "@/components/client-experience/client-favorite-barber-card";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import { NextAvailableChairCard } from "@/components/client-experience/next-available-chair-card";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientAiSummaryQuery, useTrackAiRecommendationMutation } from "@/lib/ai/client";
import {
  useBarberProfileQuery,
  useClientBookingsQuery,
  useClientHomeQuery,
  useClientPointsBalanceQuery,
  type BookingApiError
} from "@/lib/booking/client";
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
        : CLIENT_PRIMARY_TAB_HREFS.search;
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
      : CLIENT_PRIMARY_TAB_HREFS.search;

  const bookNowHref: Route = nextAvailableChair
    ? buildMarketplaceBookingHref({
        barberId: nextAvailableChair.barberId,
        username: nextAvailableChair.username,
        locationId: nextAvailableChair.locationId,
        appointmentTime: nextAvailableChair.appointmentTime,
        sourceKind: "haircut_now",
        matchedFrom: nextAvailableChair.matchedFrom
      })
    : CLIENT_PRIMARY_TAB_HREFS.search;
  const aiBookNowHref: Route | null = availableNowSuggestion
    ? buildMarketplaceBookingHref({
        ...availableNowSuggestion.booking,
        aiRecommendationId: availableNowSuggestion.recommendationId,
        aiRecommendationType: availableNowSuggestion.type
      })
    : null;
  const primaryBookNowHref = aiBookNowHref ?? bookNowHref;
  const walletProfileHref = `${CLIENT_PRIMARY_TAB_HREFS.profile}?section=wallet` as Route;
  const rewardsProfileHref = `${CLIENT_PRIMARY_TAB_HREFS.profile}?section=rewards` as Route;
  const activityCancelHref = `${CLIENT_PRIMARY_TAB_HREFS.activity}?intent=cancel` as Route;

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

  const quickActions: Array<{
    href: Route;
    icon: typeof Repeat2;
    label: string;
    onClick?: () => void;
  }> = [
    {
      href: repeatReference || favoriteBarber ? primaryRebookHref : CLIENT_PRIMARY_TAB_HREFS.search,
      icon: Repeat2,
      label: repeatReference || favoriteBarber ? "Book again" : "Find a barber",
      onClick: rebookingReminder
        ? () => {
            handleAiRecommendationClick({
              recommendationId: rebookingReminder.recommendationId,
              recommendationType: rebookingReminder.type,
              relatedIds: {
                barberId: rebookingReminder.booking.barberId,
                serviceId: rebookingReminder.booking.serviceId,
                locationId: rebookingReminder.booking.locationId
              }
            });
          }
        : undefined
    },
    {
      href: CLIENT_PRIMARY_TAB_HREFS.search,
      icon: Search,
      label: "Find barbers"
    },
    {
      href: `${CLIENT_PRIMARY_TAB_HREFS.search}?category=haircuts` as Route,
      icon: Sparkles,
      label: "Explore services"
    },
    {
      href: availableNowSuggestion || nextAvailableChair ? primaryBookNowHref : CLIENT_PRIMARY_TAB_HREFS.activity,
      icon: availableNowSuggestion || nextAvailableChair ? CalendarDays : WalletCards,
      label: availableNowSuggestion || nextAvailableChair ? "Book now" : "Open activity",
      onClick: availableNowSuggestion
        ? () => {
            handleAiRecommendationClick({
              recommendationId: availableNowSuggestion.recommendationId,
              recommendationType: availableNowSuggestion.type,
              relatedIds: {
                barberId: availableNowSuggestion.booking.barberId,
                locationId: availableNowSuggestion.locationId
              }
            });
          }
        : undefined
    }
  ];

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
              Home stays focused on fast booking moves: rebook your usual chair, check the next appointment, and jump back into discovery without digging through management screens.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ClientActionLink
                href={repeatReference || favoriteBarber ? primaryRebookHref : CLIENT_PRIMARY_TAB_HREFS.search}
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
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {quickActions.map((action) => {
                const Icon = action.icon;

                return (
                  <ClientActionLink
                    key={action.label}
                    href={action.href}
                    size="md"
                    variant="secondary"
                    className="justify-start"
                    onClick={action.onClick}
                  >
                    <Icon className="h-4 w-4 text-[#d7ffab]" />
                    {action.label}
                  </ClientActionLink>
                );
              })}
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
                      : "No upcoming appointment yet"}
                  </p>
                  <p className="mt-2 text-sm text-white/60">
                    {nextAppointment
                      ? formatAppointmentTime(nextAppointment.start)
                      : "Search live barbers and book when you are ready."}
                  </p>
                  <p className="mt-2 text-sm text-white/46">
                    {nextAppointment
                      ? `${nextAppointment.view?.barber?.name ?? favoriteBarber?.barberName ?? "Your barber"} | ${nextAppointment.view?.location?.name ?? "Your regular location"}`
                      : "Full appointment management lives in Activity once a real booking exists."}
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
                <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.activity} size="md">
                  View details
                </ClientActionLink>
                {nextAppointment ? (
                  <ClientActionLink href={rescheduleHref} size="md" variant="secondary">
                    Reschedule
                  </ClientActionLink>
                ) : null}
                {nextAppointment ? (
                  <ClientActionLink href={activityCancelHref} size="md" variant="outline">
                    Cancel
                  </ClientActionLink>
                ) : null}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/22 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Wallet and points snapshot</p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {defaultPaymentMethod ? defaultPaymentMethod.label : "No saved card yet"}
                  </p>
                  <p className="mt-2 text-sm text-white/60">
                    {paymentMethods.length
                      ? `${paymentMethods.length} saved payment method${paymentMethods.length === 1 ? "" : "s"} ready for booking.`
                      : "Save a payment method once and reuse it on future bookings."}
                  </p>
                  <p className="mt-2 text-sm text-white/46">
                    {pointsBalance?.unlockedPoints
                      ? `${pointsBalance.unlockedPoints} BVR Points are ready for a future booking discount.`
                      : "Points show up here after completed paid services close."}
                  </p>
                </div>
                <span className="rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#e8ffc2]">
                  {pointsBalance?.unlockedPoints
                    ? `${pointsBalance.unlockedPoints} pts`
                    : (paymentMethods.length ? "Saved" : "Add card")}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/72">
                  <CreditCard className="mr-2 inline h-4 w-4 text-[#d7ffab]" />
                  Default {defaultPaymentMethod ? "ready" : "missing"}
                </div>
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/72">
                  <WalletCards className="mr-2 inline h-4 w-4 text-[#d7ffab]" />
                  {pointsBalance?.pendingPoints
                    ? `${pointsBalance.pendingPoints} pts still unlocking`
                    : "Receipts live in Activity"}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <ClientActionLink href={walletProfileHref} size="md">
                  Open wallet
                </ClientActionLink>
                <ClientActionLink href={rewardsProfileHref} size="md" variant="secondary">
                  Open rewards
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
                  <p className="mt-3 text-white">
                    {repeatReference
                      ? currency(repeatReference.grandTotal ?? repeatReference.totalAmount)
                      : favoriteBarber?.priceRangeLabel ?? "Live price on profile"}
                  </p>
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
                  Book again
                </ClientActionLink>
                <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.search} size="lg" variant="secondary">
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
              <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.search} size="lg">
                Find a barber
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
              fallbackHref={CLIENT_PRIMARY_TAB_HREFS.search}
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
        eyebrow="Recommended"
        title="Recommended barbers around you."
        subtitle={trustedBarbers.length
          ? "Only approved, active, bookable barbers appear here. Compare real specialties, trust labels, prices, and next openings."
          : "No real barbers are live in this area yet. Verified, active, bookable supply will appear automatically when it exists."}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm text-white/72">
            <ShieldCheck className="h-4 w-4 text-[#baff69]" />
            Canonical discovery only
          </div>
          <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.search} size="md" variant="secondary">
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
    </div>
  );
}
