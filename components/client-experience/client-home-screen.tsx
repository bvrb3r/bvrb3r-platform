"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  MapPin,
  Zap
} from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientGetCutNowAction } from "@/components/client-experience/client-get-cut-now-action";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { FavoriteRailCard } from "@/components/client-experience/favorite-rail-card";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FeatureGateTease } from "@/components/ui/feature-gate-tease";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/design/components";
import { RoadHomeWidget } from "@/components/road/road-home-widget";
import {
  useClientBookingsQuery,
  useClientHomeQuery,
  type BookingApiError
} from "@/lib/booking/client";
import { getClientFacingBarberName } from "@/lib/marketplace/client-facing";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { ClientPaywallSummary } from "@/lib/entitlements/client-paywall";

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
  displayName
}: {
  clientId?: string;
  isSignedInClient: boolean;
  displayName: string;
  paywallSummary?: ClientPaywallSummary;
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
  const isInitialLoading = (homeQuery.isLoading && !payload) || (bookingsQuery.isLoading && !bookingsPayload);
  const errorMessage = homeQuery.error || bookingsQuery.error
    ? getReadableActionError((homeQuery.error ?? bookingsQuery.error) as BookingApiError)
    : null;
  const defaultPaymentMethod = payload?.defaultPaymentMethod ?? bookingsPayload?.nextAppointmentPayment?.defaultPaymentMethod ?? null;

  const viewDetailsHref = nextAppointment
    ? { pathname: CLIENT_PRIMARY_TAB_HREFS.activity, query: { appointment: nextAppointment.id } }
    : CLIENT_PRIMARY_TAB_HREFS.activity;
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
      <Card className="relative overflow-hidden rounded-[38px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(6,6,6,0.99))] p-6 shadow-[0_30px_70px_rgba(0,0,0,0.32)] sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(196, 242, 78,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_26%)]" />
        <div className="relative">
          <PageHeader
            label="Book fast"
            title={heroTitle}
            subtitle={heroSubtitle}
          />

          <div className="mt-6 max-w-xl">
            <div className="rounded-[28px] border border-[#c4f24e]/22 bg-[linear-gradient(180deg,rgba(196, 242, 78,0.12),rgba(8,8,8,0.98))] p-5 shadow-[inset_0_1px_0_rgba(196,242,78,0.12),0_0_44px_rgba(196,242,78,0.06)]">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white/92">
                <Zap className="h-4 w-4 text-[#c4f24e]" />
                Get a cut now
              </div>
              <p className="mt-3 text-sm leading-7 text-white/68">
                We&apos;ll find the next eligible chair, confirm the details, and hold it while you pay.
              </p>
              <div className="mt-4">
                <ClientGetCutNowAction
                  hasResolvedLocation={hasResolvedLocation}
                  nextAvailableChair={payload?.nextAvailableChair ?? null}
                  defaultPaymentMethod={defaultPaymentMethod}
                  size="lg"
                  triggerLabel="Find the next chair →"
                />
              </div>
            </div>
          </div>

        </div>
      </Card>

      <RoadHomeWidget compact={Boolean(nextAppointment)} />

      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}

      <FeatureGateTease
        gateKey="client.home.group_booking"
        label="Group booking"
        eyebrow="Book together"
        detail="Choose one shop, line up several services, and keep every guest’s booking truth separate."
        scale="row"
      />

      <section data-testid="home-favorite-barbers">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="bvr-section-label">Barbers &amp; Shops</p>
            <h2 className="mt-2 text-2xl font-extrabold leading-tight text-[var(--text-primary)] sm:text-3xl" data-display="true">Favorite Barbers &amp; Shops</h2>
          </div>
          <Link href={`${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers` as Route} className="shrink-0 text-sm font-semibold text-white/64 transition hover:text-white">
            See all
          </Link>
        </div>
        {savedFavoriteBarbers.length || savedFavoriteShops.length ? (
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {savedFavoriteBarbers.map((result) => {
              const barberDisplayName = getClientFacingBarberName({ username: result.username, barberName: result.barberName });
              const distanceLine = result.cityLabel ?? result.locationLabel ?? (typeof result.distanceMiles === "number" ? `${result.distanceMiles.toFixed(1)} mi` : null);
              return (
                <FavoriteRailCard
                  key={result.barberId}
                  coverUrl={result.galleryPreviewUrls?.[0] ?? result.profilePhotoUrl}
                  name={barberDisplayName}
                  subtitle={[result.shopName ?? "Independent", distanceLine].filter(Boolean).join(" · ")}
                  availabilityLabel={result.availabilityLabel ?? "Available now"}
                  actionLabel={`Rebook · $${result.priceRange[0]}`}
                  actionHref={buildMarketplaceBookingHref({
                    barberId: result.barberId,
                    username: result.username,
                    locationId: result.locationId,
                    sourceKind: "discovery",
                    query: result.mostBookedService ?? undefined
                  })}
                  nameHref={`/barber/${result.username}` as Route}
                />
              );
            })}
            {savedFavoriteShops.map((shop) => {
              const shopHref = (shop.viewHref ?? `/shop/${encodeURIComponent(shop.id)}`) as Route;
              return (
                <FavoriteRailCard
                  key={shop.id}
                  coverUrl={shop.coverPhotoUrl ?? shop.profilePhotoUrl}
                  name={shop.name}
                  subtitle={shop.brandLine?.trim() || [shop.neighborhood, shop.city].filter(Boolean).join(", ")}
                  availabilityLabel={shop.nextAvailableLabel}
                  actionLabel="View shop"
                  actionHref={shopHref}
                  nameHref={shopHref}
                />
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-[var(--radius-lg,18px)] border border-dashed border-white/10 bg-white/[0.02] p-6 sm:p-7">
            <h3 className="text-2xl font-semibold text-white" data-display="true">No favorite barbers or shops yet.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Save barbers and shops you trust. They&apos;ll show here for faster rebooking.
            </p>
          </div>
        )}
      </section>

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
                  <CalendarDays className="h-4 w-4 text-[#d9f985]" />
                  Date
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{formatDateLabel(nextAppointment.start)}</p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78">
                  <Clock3 className="h-4 w-4 text-[#e4f9b8]" />
                  Time
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{formatTimeLabel(nextAppointment.start)}</p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78">
                  <MapPin className="h-4 w-4 text-[#d9f985]" />
                  Payment
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{paymentStatusCopy}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <ClientActionLink href={viewDetailsHref} size="lg">
                View details
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

    </div>
  );
}
