"use client";

import type { Route } from "next";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Search,
  Store
} from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientDiscoveryCard } from "@/components/client-experience/client-discovery-card";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { ClientShopDiscoveryCard } from "@/components/client-experience/client-shop-discovery-card";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useClientBookingsQuery,
  useClientHomeQuery,
  type BookingApiError
} from "@/lib/booking/client";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
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
      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
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

export function ClientHomeScreen({
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
  const firstName = displayName.split(" ")[0] ?? "there";
  const nextAppointment = bookingsPayload?.nextAppointment ?? null;
  const hasBookingHistory = (bookingsPayload?.history?.length ?? 0) > 0;
  const hasResolvedLocation = payload?.hasResolvedLocation ?? false;
  const recommendedBarbers = payload?.recommendedBarbers ?? payload?.trustedBarbers ?? [];
  const recommendedShops = payload?.recommendedShops ?? [];
  const isInitialLoading = (homeQuery.isLoading && !payload) || (bookingsQuery.isLoading && !bookingsPayload);
  const errorMessage = homeQuery.error || bookingsQuery.error
    ? getReadableActionError((homeQuery.error ?? bookingsQuery.error) as BookingApiError)
    : null;

  const barberSearchHref = `${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers` as Route;
  const shopSearchHref = `${CLIENT_PRIMARY_TAB_HREFS.search}?type=shops` as Route;
  const profileLocationHref = `${CLIENT_PRIMARY_TAB_HREFS.profile}?section=location` as Route;
  const viewDetailsHref = CLIENT_PRIMARY_TAB_HREFS.activity;
  const nextAvailableHref: Route = hasResolvedLocation && payload?.nextAvailableChair
    ? buildMarketplaceBookingHref({
        barberId: payload.nextAvailableChair.barberId,
        username: payload.nextAvailableChair.username,
        locationId: payload.nextAvailableChair.locationId,
        appointmentTime: payload.nextAvailableChair.appointmentTime,
        sourceKind: "haircut_now",
        matchedFrom: payload.nextAvailableChair.matchedFrom
      })
    : hasResolvedLocation
      ? barberSearchHref
      : profileLocationHref;
  const nextAvailableCtaLabel = !hasResolvedLocation
    ? "Add Location"
    : payload?.nextAvailableChair
      ? "Book Next Available"
      : "Search Barbers";
  const nextAvailableSupportCopy = !hasResolvedLocation
    ? "Add your location to book the next available barber near you."
    : payload?.nextAvailableChair
      ? `${payload.nextAvailableChair.barberName} has the fastest real opening near you.`
      : "No available barbers near you right now.";
  const heroTitle = nextAppointment || hasBookingHistory
    ? `Welcome back, ${firstName}.`
    : `Find your first barber, ${firstName}.`;
  const heroSubtitle = nextAppointment || hasBookingHistory
    ? "Book again, find the next available barber, or discover someone new."
    : "Book a real barber near you or browse verified barbers and shops on BVRB3R.";
  const paymentStatusCopy = describeUpcomingPayment({
    outstandingBalance: bookingsPayload?.nextAppointmentPayment?.outstandingBalance ?? nextAppointment?.balanceDue ?? 0,
    paymentStatus: bookingsPayload?.nextAppointmentPayment?.latestBookingPayment?.paymentStatus ?? null
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
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#d7ffab]">Client home</p>
          <h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold sm:text-5xl" data-display="true">
            {heroTitle}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
            {heroSubtitle}
          </p>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/86">
                <Search className="h-4 w-4 text-[#d7ffab]" />
                Find a Barber
              </div>
              <p className="mt-3 text-sm leading-7 text-white/62">
                Browse verified barbers, compare specialties, and choose the right chair yourself.
              </p>
              <div className="mt-4">
                <ClientActionLink href={barberSearchHref} size="lg">
                  Find a Barber
                </ClientActionLink>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#d7ffab]/14 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(8,8,8,0.98))] p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/92">
                <CalendarDays className="h-4 w-4 text-[#d7ffab]" />
                Book Next Available
              </div>
              <p className="mt-3 text-sm leading-7 text-white/68">
                {nextAvailableSupportCopy}
              </p>
              <div className="mt-4">
                <ClientActionLink href={nextAvailableHref} size="lg">
                  {nextAvailableCtaLabel}
                </ClientActionLink>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/86">
                <Store className="h-4 w-4 text-[#d7ffab]" />
                Find a Barber Shop
              </div>
              <p className="mt-3 text-sm leading-7 text-white/62">
                Start with the shop, then move into the barbers working there.
              </p>
              <div className="mt-4">
                <ClientActionLink href={shopSearchHref} size="lg" variant="secondary">
                  Find a Barber Shop
                </ClientActionLink>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}

      <ClientSectionBlock
        eyebrow="Upcoming"
        title="Upcoming Appointment"
        subtitle="See the next real booking without turning Home into a management dashboard."
      >
        {nextAppointment ? (
          <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] p-5 shadow-[0_20px_42px_rgba(0,0,0,0.18)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold text-white" data-display="true">
                  {nextAppointment.view?.barber?.name ?? "Upcoming appointment"}
                </p>
                <p className="mt-2 text-sm text-white/66">
                  {nextAppointment.view?.service?.name ?? "Service pending"} at {nextAppointment.view?.location?.name ?? "BVRB3R"}
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/72">
                {nextAppointment.status.replaceAll("_", " ")}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78">
                  <CalendarDays className="h-4 w-4 text-[#baff69]" />
                  Date
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{formatDateLabel(nextAppointment.start)}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78">
                  <Clock3 className="h-4 w-4 text-[#d7ffab]" />
                  Time
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{formatTimeLabel(nextAppointment.start)}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
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
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <h3 className="text-2xl font-semibold text-white" data-display="true">No upcoming appointment yet.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Find a barber or book the next available barber near you.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ClientActionLink href={barberSearchHref} size="lg" variant="secondary">
                Open Search
              </ClientActionLink>
              <ClientActionLink href={nextAvailableHref} size="lg">
                {nextAvailableCtaLabel}
              </ClientActionLink>
            </div>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Barbers"
        title="Recommended Barbers"
        subtitle={recommendedBarbers.length
          ? "Real recommendations get smarter as your booking history grows."
          : "Verified, active, bookable barbers will appear here automatically."}
        action={(
          <ClientActionLink href={barberSearchHref} size="md" variant="secondary">
            Open Search
            <ArrowRight className="h-4 w-4" />
          </ClientActionLink>
        )}
      >
        {recommendedBarbers.length ? (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {recommendedBarbers.map((result) => (
              <ClientDiscoveryCard key={result.barberId} result={result} />
            ))}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <h3 className="text-2xl font-semibold text-white" data-display="true">No barbers are accepting bookings here yet.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Verified, active, bookable barbers will appear here automatically.
            </p>
            <div className="mt-5">
              <ClientActionLink href={barberSearchHref} size="lg" variant="secondary">
                Open Search
              </ClientActionLink>
            </div>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Shops"
        title="Recommended Barber Shops"
        subtitle={recommendedShops.length
          ? "Start with a trusted shop, then choose the chair that fits."
          : "Verified shops will appear here once they are active."}
        action={(
          <ClientActionLink href={shopSearchHref} size="md" variant="secondary">
            Find Barber Shops
            <ArrowRight className="h-4 w-4" />
          </ClientActionLink>
        )}
      >
        {recommendedShops.length ? (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {recommendedShops.map((shop) => (
              <ClientShopDiscoveryCard
                key={shop.id}
                location={{
                  ...shop,
                  viewHref: `/dashboard/client/search?type=shops&q=${encodeURIComponent(shop.name)}&locationId=${encodeURIComponent(shop.id)}` as Route
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <h3 className="text-2xl font-semibold text-white" data-display="true">No barber shops are accepting bookings here yet.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Verified shops will appear here once active.
            </p>
            <div className="mt-5">
              <ClientActionLink href={shopSearchHref} size="lg" variant="secondary">
                Find Barber Shops
              </ClientActionLink>
            </div>
          </div>
        )}
      </ClientSectionBlock>
    </div>
  );
}
