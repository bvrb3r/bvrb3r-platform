"use client";

import type { Route } from "next";
import Link from "next/link";
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
  const firstName = displayName.split(" ")[0] ?? "there";
  const nextAppointment = bookingsPayload?.nextAppointment ?? null;
  const hasBookingHistory = (bookingsPayload?.history?.length ?? 0) > 0;
  const hasResolvedLocation = payload?.hasResolvedLocation ?? false;
  const recommendedBarbers = payload?.recommendedBarbers ?? payload?.trustedBarbers ?? [];
  const recommendedShops = payload?.recommendedShops ?? [];
  const marketplaceFeed = recommendedBarbers
    .filter((result) => (result.galleryPreviewUrls?.length ?? 0) > 0)
    .slice(0, 6);
  const isInitialLoading = (homeQuery.isLoading && !payload) || (bookingsQuery.isLoading && !bookingsPayload);
  const errorMessage = homeQuery.error || bookingsQuery.error
    ? getReadableActionError((homeQuery.error ?? bookingsQuery.error) as BookingApiError)
    : null;
  const defaultPaymentMethod = payload?.defaultPaymentMethod ?? bookingsPayload?.nextAppointmentPayment?.defaultPaymentMethod ?? null;

  const barberSearchHref = `${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers` as Route;
  const shopSearchHref = `${CLIENT_PRIMARY_TAB_HREFS.search}?type=shops` as Route;
  const viewDetailsHref = CLIENT_PRIMARY_TAB_HREFS.activity;
  const heroTitle = nextAppointment || hasBookingHistory
    ? `Welcome back, ${firstName}.`
    : `Find your first barber, ${firstName}.`;
  const heroSubtitle = nextAppointment || hasBookingHistory
    ? "Book again, find the next available barber, or discover someone new."
    : "Book a real barber near you or browse verified barbers and shops.";
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
          <PageHeader
            label="Book fast"
            title={heroTitle}
            subtitle={heroSubtitle}
          />

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/86">
                <Search className="h-4 w-4 text-[#d7ffab]" />
                Find a Barber
              </div>
              <p className="mt-3 text-sm leading-7 text-white/62">
                Browse verified barbers and choose the right chair.
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

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/86">
                <Store className="h-4 w-4 text-[#d7ffab]" />
                Find a Barber Shop
              </div>
              <p className="mt-3 text-sm leading-7 text-white/62">
                Start with the shop, then pick the barber.
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
        subtitle="Keep your next real appointment in view."
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
              Find a barber or get a cut now when you are ready.
            </p>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Barbers"
        title="Recommended Barbers"
        subtitle={recommendedBarbers.length
          ? "Book fast from live barber profiles."
          : "Explore top barbers on BVRB3R."}
        action={recommendedBarbers.length ? (
          <ClientActionLink href={barberSearchHref} size="md" variant="secondary">
            Open Search
            <ArrowRight className="h-4 w-4" />
          </ClientActionLink>
        ) : undefined}
      >
        {recommendedBarbers.length ? (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {recommendedBarbers.map((result) => (
              <ClientDiscoveryCard key={result.barberId} result={result} canFavorite={Boolean(clientId)} />
            ))}
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <h3 className="text-2xl font-semibold text-white" data-display="true">Explore top barbers on BVRB3R.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Live barbers appear here as soon as they are ready to book.
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
          ? "Choose the shop first, then the chair."
          : "Explore barber shops on BVRB3R."}
        action={recommendedShops.length ? (
          <ClientActionLink href={shopSearchHref} size="md" variant="secondary">
            Find Barber Shops
            <ArrowRight className="h-4 w-4" />
          </ClientActionLink>
        ) : undefined}
      >
        {recommendedShops.length ? (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {recommendedShops.map((shop) => (
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
            <h3 className="text-2xl font-semibold text-white" data-display="true">Explore barber shops on BVRB3R.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Live shops appear here as soon as their roster is ready.
            </p>
            <div className="mt-5">
              <ClientActionLink href={shopSearchHref} size="lg" variant="secondary">
                Find Barber Shops
              </ClientActionLink>
            </div>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Feed"
        title="Marketplace Feed"
        subtitle="Real public work from live barber profiles."
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
            <h3 className="text-2xl font-semibold text-white" data-display="true">No public work posted yet.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Live barbers still appear in search and recommended barber cards. Public portfolio work will appear here when it is uploaded.
            </p>
          </div>
        )}
      </ClientSectionBlock>
    </div>
  );
}
