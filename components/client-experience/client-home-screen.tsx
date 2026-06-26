"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  MapPin,
  Scissors,
  Sparkles
} from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientDiscoveryCard } from "@/components/client-experience/client-discovery-card";
import { ClientGetCutNowAction } from "@/components/client-experience/client-get-cut-now-action";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { ClientShopDiscoveryCard } from "@/components/client-experience/client-shop-discovery-card";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/design/components";
import {
  useClientBookingsQuery,
  useClientHomeQuery,
  type BookingApiError
} from "@/lib/booking/client";
import { getClientFacingBarberName } from "@/lib/marketplace/client-facing";
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

function HeroSkeleton() {
  return (
    <Card className="rounded-[38px] border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(6,6,6,0.99))] p-5 shadow-[0_30px_70px_rgba(0,0,0,0.32)] sm:p-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-12 w-80 max-w-full" />
      <Skeleton className="mt-4 h-5 w-[32rem] max-w-full" />
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="rounded-[28px] border border-white/10 bg-black/20 p-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-3 h-10 w-full" />
            <Skeleton className="mt-4 h-12 w-40" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function formatDateLabel(iso?: string | null) {
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
    day: "numeric"
  }).format(date);
}

function formatTimeLabel(iso?: string | null) {
  if (!iso) {
    return "Not scheduled";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function describeUpcomingPayment(input: {
  outstandingBalance: number;
  paymentStatus?: string | null;
}) {
  if (input.paymentStatus === "captured") {
    return "Payment captured.";
  }

  if (input.paymentStatus === "authorized") {
    return "Card on file is authorized.";
  }

  if (input.paymentStatus === "pending") {
    return "Payment is still processing.";
  }

  if (input.paymentStatus === "failed") {
    return "Payment needs attention.";
  }

  if (input.outstandingBalance > 0) {
    return `${currency(input.outstandingBalance)} still due at checkout.`;
  }

  return "No payment due right now.";
}

function humanAppointmentStatus(status?: string | null) {
  switch (status) {
    case "confirmed":
    case "booked":
      return "Booked";
    case "pending":
      return "Pending";
    case "pending_payment":
      return "Payment needed";
    case "paid":
      return "Paid";
    case "checked_in":
      return "Checked in";
    case "in_service":
      return "In service";
    case "completed":
      return "Completed";
    case "cancelled":
    case "canceled":
      return "Cancelled";
    case "no_show":
      return "No-show";
    case "refunded":
      return "Refunded";
    default:
      return "Scheduled";
  }
}

export function ClientHomeScreen({
  clientId,
  displayName
}: {
  clientId?: string;
  isSignedInClient: boolean;
  displayName: string;
}) {
  const homeQuery = useClientHomeQuery();
  const bookingsQuery = useClientBookingsQuery();

  const payload = homeQuery.data;
  const bookingsPayload = bookingsQuery.data;
  const firstName = displayName.trim().split(/\s+/)[0] || "there";
  const nextAppointment = bookingsPayload?.nextAppointment ?? null;
  const recentAppointment = bookingsPayload?.history?.[0] ?? null;
  const hasBookingHistory = Boolean(recentAppointment);
  const hasResolvedLocation = payload?.hasResolvedLocation ?? false;
  const savedFavoriteBarbers = payload?.favoriteBarber ? [payload.favoriteBarber] : [];
  const savedFavoriteShops = payload?.client?.favoriteShopReference
    ? (payload?.recommendedShops ?? []).filter((shop) => shop.id === payload.client?.favoriteShopReference)
    : [];
  const recommendedBarbers = payload?.recommendedBarbers ?? payload?.trustedBarbers ?? [];
  const marketplaceFeed = recommendedBarbers
    .filter((result) => (result.galleryPreviewUrls?.length ?? 0) > 0)
    .slice(0, 6);
  const isInitialLoading = (homeQuery.isLoading && !payload) || (bookingsQuery.isLoading && !bookingsPayload);
  const errorMessage = homeQuery.error || bookingsQuery.error
    ? getReadableActionError((homeQuery.error ?? bookingsQuery.error) as BookingApiError)
    : null;
  const defaultPaymentMethod = payload?.defaultPaymentMethod ?? bookingsPayload?.nextAppointmentPayment?.defaultPaymentMethod ?? null;

  const viewDetailsHref = CLIENT_PRIMARY_TAB_HREFS.activity;
  const heroTitle = nextAppointment || hasBookingHistory
    ? `Welcome back, ${firstName}.`
    : `Book your first cut, ${firstName}.`;
  const heroSubtitle = nextAppointment || hasBookingHistory
    ? "Book again, rebook a trusted chair, or jump into the next eligible cut."
    : "Start with the fastest eligible chair near you.";
  const paymentStatusCopy = describeUpcomingPayment({
    outstandingBalance: bookingsPayload?.nextAppointmentPayment?.outstandingBalance ?? nextAppointment?.balanceDue ?? 0,
    paymentStatus: bookingsPayload?.nextAppointmentPayment?.latestBookingPayment?.paymentStatus ?? null
  });
  const nextAppointmentDiscoveryMatch = nextAppointment
    ? recommendedBarbers.find((result) => result.barberId === nextAppointment.barberId)
      ?? payload?.trustedBarbers?.find((result) => result.barberId === nextAppointment.barberId)
    : undefined;
  const favoriteAppointmentBarber = nextAppointment && bookingsPayload?.favoriteBarber?.barber.id === nextAppointment.barberId
    ? bookingsPayload.favoriteBarber
    : null;
  const nextAppointmentBarberName = getClientFacingBarberName({
    username: nextAppointmentDiscoveryMatch?.username ?? favoriteAppointmentBarber?.profile.username,
    barberName: nextAppointment?.view?.barber?.name
  });

  if (isInitialLoading) {
    return (
      <div className="space-y-4" data-testid="client-home-screen">
        <HeroSkeleton />
        <RailSkeleton />
        <RailSkeleton />
        <RailSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="client-home-screen">
      <Card className="rounded-[38px] border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(6,6,6,0.99))] p-5 shadow-[0_30px_70px_rgba(0,0,0,0.32)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,255,0,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_26%)]" />
        <div className="relative">
          <PageHeader
            label="Book fast"
            title={heroTitle}
            subtitle={heroSubtitle}
          />

          <div className="mt-6 max-w-xl">
            <div className="rounded-[28px] border border-[#d7ffab]/14 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(8,8,8,0.98))] p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/92">
                <CalendarDays className="h-4 w-4 text-[#d7ffab]" />
                Get a Cut Now
              </div>
              <p className="mt-3 text-sm leading-7 text-white/68">
                See the next eligible chair, confirm details, and pay safely.
              </p>
              <div className="mt-4">
                <ClientGetCutNowAction
                  hasResolvedLocation={hasResolvedLocation}
                  nextAvailableChair={payload?.nextAvailableChair ?? null}
                  defaultPaymentMethod={defaultPaymentMethod}
                  size="lg"
                />
              </div>
            </div>
          </div>

        </div>
      </Card>

      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}

      <ClientSectionBlock
        eyebrow="Barbers"
        title="Favorite Barbers"
        subtitle={savedFavoriteBarbers.length
          ? "Saved chairs from your real client profile."
          : "Saved and eligible barbers will appear here."}
      >
        {savedFavoriteBarbers.length ? (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {savedFavoriteBarbers.map((result) => (
              <ClientDiscoveryCard key={result.barberId} result={result} canFavorite={Boolean(clientId)} />
            ))}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <h3 className="text-2xl font-semibold text-white" data-display="true">No favorite barbers yet.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Save barbers you trust. They&apos;ll show here for faster rebooking.
            </p>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Shops"
        title="Favorite Shops"
        subtitle={savedFavoriteShops.length
          ? "Saved shop context from your real client profile."
          : "Saved and eligible shops will appear here."}
      >
        {savedFavoriteShops.length ? (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {savedFavoriteShops.map((shop) => (
              <ClientShopDiscoveryCard
                key={shop.id}
                location={{
                  ...shop,
                  viewHref: `/shop/${encodeURIComponent(shop.id)}` as Route
                }}
                canFavorite={Boolean(clientId)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <h3 className="text-2xl font-semibold text-white" data-display="true">No favorite shops yet.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Save a shop from Search or book from a shop roster to keep trusted locations close.
            </p>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Discovery"
        title="Recommended Barbers"
        subtitle={recommendedBarbers.length
          ? "Real public barber results that can move you toward booking."
          : "Recommendations appear only when real barber evidence is available."}
      >
        {recommendedBarbers.length ? (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {recommendedBarbers.map((result) => (
              <ClientDiscoveryCard key={result.barberId} result={result} canFavorite={Boolean(clientId)} />
            ))}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <h3 className="text-2xl font-semibold text-white" data-display="true">No barber recommendations yet.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Search for an open chair when you are ready. We will not fill this area with fake barber data.
            </p>
            <div className="mt-5">
              <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.search} size="md">
                Open Search
              </ClientActionLink>
            </div>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Culture"
        title="Culture Preview"
        subtitle="Cuts, shops, style, and the BVRB3R community. Public-safe only."
      >
        {marketplaceFeed.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {marketplaceFeed.map((result) => {
              const imageUrl = result.galleryPreviewUrls?.[0];
              const profileHref = `/barber/${result.username}` as Route;

              return (
                <Link key={`${result.barberId}-feed`} href={profileHref} className="group block overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] p-2 text-left shadow-[0_22px_44px_rgba(0,0,0,0.2)]">
                  <span className="relative block h-56 overflow-hidden rounded-[28px]">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={`${result.barberName} public work`} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : null}
                    <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12),transparent_42%,rgba(0,0,0,0.82))]" />
                    <span className="absolute bottom-4 left-4 right-4">
                      <span className="block text-lg font-semibold text-white">{result.barberName}</span>
                      <span className="mt-1 block text-sm text-white/72">{result.mostBookedService ?? result.specialties[0] ?? "Fresh work"}</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#d7ffab]">
              <Sparkles className="h-4 w-4" />
              Culture lives here
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-white" data-display="true">Culture is getting ready.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Culture lives here - cuts, shops, style, and the BVRB3R community.
            </p>
            <div className="mt-5">
              <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.culture} size="md">
                Open Culture
              </ClientActionLink>
            </div>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Upcoming"
        title="Upcoming Appointment"
        subtitle="Keep your next real appointment available without letting an empty schedule dominate Home."
      >
        {nextAppointment ? (
          <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] p-5 shadow-[0_20px_42px_rgba(0,0,0,0.18)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold text-white" data-display="true">
                  {nextAppointmentBarberName}
                </p>
                <p className="mt-2 text-sm text-white/66">
                  {nextAppointment.view?.service?.name ?? "Service pending"} at {nextAppointment.view?.location?.name ?? "BVRB3R"}
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/72">
                {humanAppointmentStatus(nextAppointment.status)}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78">
                  <CalendarDays className="h-4 w-4 text-[#baff69]" />
                  Date
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{formatDateLabel(nextAppointment.start)}</p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78">
                  <Clock3 className="h-4 w-4 text-[#d7ffab]" />
                  Time
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{formatTimeLabel(nextAppointment.start)}</p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78">
                  <MapPin className="h-4 w-4 text-[#baff69]" />
                  Payment
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{paymentStatusCopy}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <ClientActionLink href={viewDetailsHref} size="lg">
                View Details
              </ClientActionLink>
            </div>
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-5">
            <h3 className="text-xl font-semibold text-white" data-display="true">No cut booked yet.</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">
              No cut booked yet. Find an open chair.
            </p>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Rebook"
        title="Recent Activity"
        subtitle="Past visits can support rebooking only when real appointment history exists."
      >
        {recentAppointment ? (
          <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] p-5 shadow-[0_20px_42px_rgba(0,0,0,0.18)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#d7ffab]">
                  <Scissors className="h-4 w-4" />
                  Last visit
                </div>
                <p className="mt-3 text-2xl font-semibold text-white" data-display="true">
                  {recentAppointment.view?.barber?.name ?? "Past barber"}
                </p>
                <p className="mt-2 text-sm text-white/66">
                  {recentAppointment.view?.service?.name ?? "Service"} at {recentAppointment.view?.location?.name ?? "BVRB3R"}
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/72">
                {humanAppointmentStatus(recentAppointment.status)}
              </span>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/62">
              {formatDateLabel(recentAppointment.start)}. Rebook from Search using the same barber, service, and shop when those public booking details are still available.
            </p>
            <div className="mt-5">
              <ClientActionLink href={`${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers` as Route} size="md">
                Rebook from Search
              </ClientActionLink>
            </div>
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-5">
            <h3 className="text-xl font-semibold text-white" data-display="true">No past visits yet.</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">
              Book your first cut and your completed visits will support faster rebooking here.
            </p>
          </div>
        )}
      </ClientSectionBlock>
    </div>
  );
}
