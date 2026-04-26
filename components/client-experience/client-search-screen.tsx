"use client";

import type { Route } from "next";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, MapPin, ShieldCheck, Star } from "lucide-react";
import { ClientPrimarySearchBar } from "@/components/client-experience/client-primary-search-bar";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { ClientShopDiscoveryCard } from "@/components/client-experience/client-shop-discovery-card";
import { MarketplaceTrackedActionLink } from "@/components/client-experience/marketplace-tracked-action-link";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientHomeQuery } from "@/lib/booking/client";
import {
  useMarketplaceDiscovery,
  type MarketplaceApiError
} from "@/lib/marketplace/client";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { cn } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { DiscoveryResult, RecommendedShopView } from "@/types/domain";

type AvailabilityFilter = "any" | "today" | "now";
type ClientSearchType = "barbers" | "shops";

const serviceFilters = [
  { label: "Haircuts", query: "haircuts" },
  { label: "Beard", query: "beard" },
  { label: "Kids", query: "kids cuts" },
  { label: "Designs", query: "hair designs" }
] as const;

function RailSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="rounded-[28px] border border-white/8 bg-black/20 p-4">
          <Skeleton className="h-44 rounded-[22px]" />
          <Skeleton className="mt-4 h-6 w-40" />
          <Skeleton className="mt-3 h-4 w-28" />
          <Skeleton className="mt-4 h-11 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

function FilterChip({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition",
        active
          ? "border-[#d7ffab]/30 bg-[#d7ffab]/10 text-[#e8ffc2]"
          : "border-white/10 bg-black/18 text-white/68 hover:border-[#d7ffab]/18 hover:text-[#d7ffab]"
      )}
    >
      {children}
    </button>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getBarberVerifiedLabel(result: DiscoveryResult) {
  if (result.badges.some((badge) => badge.startsWith("verified_"))) {
    return "Verified";
  }

  return result.trustLabel ?? null;
}

function getBarberLocationLabel(result: DiscoveryResult) {
  return result.cityLabel ?? result.locationLabel ?? `${result.distanceMiles.toFixed(1)} mi away`;
}

function getFeedCaption(result: DiscoveryResult) {
  return result.mostBookedService ?? result.specialties[0] ?? "Fresh work";
}

function BarberResultCard({
  result
}: {
  result: DiscoveryResult;
}) {
  const verifiedLabel = getBarberVerifiedLabel(result);
  const bookHref: Route = (result.bookingHref as Route | undefined) ?? buildMarketplaceBookingHref({
    barberId: result.barberId,
    username: result.username,
    locationId: result.locationId,
    serviceId: result.mostBookedServiceId,
    sourceKind: "discovery",
    query: result.mostBookedService ?? undefined
  });
  const profileHref = `/barber/${result.username}` as Route;
  const heroImage = result.galleryPreviewUrls?.[0] ?? result.profilePhotoUrl;

  return (
    <article className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] shadow-[0_22px_44px_rgba(0,0,0,0.2)]">
      <div className="relative h-48 overflow-hidden">
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt={`${result.barberName} preview`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(124,255,0,0.3),rgba(255,255,255,0.08),rgba(8,8,8,0.96))]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.72))]" />
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/88">
          <Clock3 className="h-3.5 w-3.5 text-[#d7ffab]" />
          {result.availabilityLabel ?? "Bookable"}
        </div>
        {verifiedLabel ? (
          <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/88">
            <ShieldCheck className="h-3.5 w-3.5 text-[#baff69]" />
            {verifiedLabel}
          </div>
        ) : null}
        <div className="absolute bottom-4 left-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-[20px] border border-white/10 bg-black/28 text-lg font-semibold text-white/92 shadow-[0_16px_30px_rgba(0,0,0,0.24)]">
          {result.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.profilePhotoUrl} alt={result.barberName} className="h-full w-full object-cover" />
          ) : (
            getInitials(result.barberName)
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={profileHref} className="line-clamp-2-safe text-xl font-semibold text-white transition hover:text-[#d7ffab]">
              {result.barberName}
            </Link>
            <p className="mt-1 text-sm text-white/58">{result.specialties[0] ?? result.mostBookedService ?? "Trusted barber"}</p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/88">
            <Star className="h-3.5 w-3.5 fill-current text-[#d7ffab]" />
            {result.rating.toFixed(1)}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/72">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/18 px-3 py-2">
            <MapPin className="h-4 w-4 text-[#baff69]" />
            {getBarberLocationLabel(result)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/18 px-3 py-2">
            <Star className="h-4 w-4 text-[#d7ffab]" />
            {result.reviewCount} review{result.reviewCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-5 flex gap-3">
          <MarketplaceTrackedActionLink
            href={bookHref}
            className="flex-1"
            analytics={{
              eventType: "booking_cta_clicked",
              barberId: result.barberId,
              username: result.username,
              locationId: result.locationId,
              sourceKind: "discovery",
              sourceReference: "search_barbers_near_you",
              metadata: {
                rating: result.rating,
                reviewCount: result.reviewCount
              }
            }}
          >
            Book
          </MarketplaceTrackedActionLink>
          <Link
            href={profileHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/18 px-4 text-[13px] font-semibold text-white/82 transition hover:border-[#d7ffab]/18 hover:text-[#d7ffab]"
          >
            View Barber
          </Link>
        </div>
      </div>
    </article>
  );
}

function MarketplaceFeedCard({
  result
}: {
  result: DiscoveryResult;
}) {
  const imageUrl = result.galleryPreviewUrls?.[0] ?? result.profilePhotoUrl;
  const profileHref = `/barber/${result.username}` as Route;
  const verifiedLabel = getBarberVerifiedLabel(result);

  return (
    <Link
      href={profileHref}
      className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] shadow-[0_18px_38px_rgba(0,0,0,0.18)] transition hover:border-[#d7ffab]/18"
    >
      <div className="relative h-56 overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`${result.barberName} feed post`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(124,255,0,0.3),rgba(255,255,255,0.08),rgba(8,8,8,0.96))]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12),transparent_42%,rgba(0,0,0,0.78))]" />
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/88">
          {verifiedLabel ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5 text-[#baff69]" />
              {verifiedLabel}
            </>
          ) : (
            <>
              <Clock3 className="h-3.5 w-3.5 text-[#d7ffab]" />
              Latest work
            </>
          )}
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-lg font-semibold text-white">{result.barberName}</p>
          <p className="mt-1 line-clamp-2-safe text-sm text-white/74">{getFeedCaption(result)}</p>
        </div>
      </div>
    </Link>
  );
}

export function ClientSearchScreen({
  clientId,
  initialType = "barbers",
  initialQuery = "",
  initialCategory = "",
  initialLocationId = "",
  initialMinRating,
  initialMaxPrice,
  initialAvailability = "any",
  initialSpecialty = "",
  initialVerifiedOnly = false,
  routeBase = "/search"
}: {
  clientId?: string;
  initialType?: ClientSearchType;
  initialQuery?: string;
  initialCategory?: string;
  initialLocationId?: string;
  initialMinRating?: number;
  initialMaxPrice?: number;
  initialAvailability?: AvailabilityFilter;
  initialSpecialty?: string;
  initialVerifiedOnly?: boolean;
  routeBase?: "/search" | "/discover" | "/dashboard/client/search";
}) {
  const router = useRouter();
  const homeQuery = useClientHomeQuery();
  const homePayload = homeQuery.data;
  const prefersShopDiscovery = initialType === "shops";
  const recommendedBarbers = homePayload?.recommendedBarbers ?? [];
  const allShops = useMemo(
    () => ((homePayload?.recommendedShops?.length ? homePayload.recommendedShops : homePayload?.shops ?? []) as RecommendedShopView[]),
    [homePayload]
  );
  const defaultLocationId = initialLocationId || homePayload?.locationId || homePayload?.shops?.[0]?.id || "";

  const [query, setQuery] = useState(initialQuery);
  const [serviceFilter, setServiceFilter] = useState(initialCategory || initialSpecialty);
  const [selectedLocationId, setSelectedLocationId] = useState(defaultLocationId);
  const [minRating, setMinRating] = useState<number | undefined>(initialMinRating);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(initialMaxPrice);
  const [availability, setAvailability] = useState<AvailabilityFilter>(initialAvailability);
  const [verifiedOnly, setVerifiedOnly] = useState(initialVerifiedOnly);

  useEffect(() => {
    if (!selectedLocationId && defaultLocationId) {
      setSelectedLocationId(defaultLocationId);
    }
  }, [defaultLocationId, selectedLocationId]);

  const deferredQuery = useDeferredValue(query);
  const trimmedQuery = deferredQuery.trim();
  const hasActiveSearchQuery = Boolean(
    trimmedQuery
    || serviceFilter
    || minRating
    || maxPrice
    || availability !== "any"
    || verifiedOnly
  );

  const discoveryQuery = useMarketplaceDiscovery({
    query: trimmedQuery || undefined,
    category: serviceFilter || undefined,
    locationId: selectedLocationId || undefined,
    minRating,
    maxPrice,
    availability,
    maxDistanceMiles: 20
  }, clientId);
  const canonicalResults = useMemo(() => discoveryQuery.data ?? [], [discoveryQuery.data]);
  const barberResults = useMemo(
    () => verifiedOnly
      ? canonicalResults.filter((result) => result.badges.some((badge) => badge.startsWith("verified_")))
      : canonicalResults,
    [canonicalResults, verifiedOnly]
  );
  const visibleBarbers = hasActiveSearchQuery
    ? barberResults
    : (recommendedBarbers.length ? recommendedBarbers : barberResults);
  const visibleShops = useMemo(() => {
    const normalizedQuery = trimmedQuery.toLowerCase();
    const ordered = [...allShops];
    if (selectedLocationId) {
      ordered.sort((left, right) => Number(right.id === selectedLocationId) - Number(left.id === selectedLocationId));
    }
    if (!normalizedQuery) {
      return ordered;
    }

    return ordered.filter((shop) => `${shop.name} ${shop.address ?? ""} ${shop.neighborhood} ${shop.city} ${shop.state}`.toLowerCase().includes(normalizedQuery));
  }, [allShops, selectedLocationId, trimmedQuery]);
  const marketplaceFeed = useMemo(() => {
    const source = visibleBarbers.length ? visibleBarbers : barberResults;
    return source.filter((result) => (result.galleryPreviewUrls?.length ?? 0) > 0 || Boolean(result.profilePhotoUrl)).slice(0, 8);
  }, [barberResults, visibleBarbers]);
  const errorMessage = discoveryQuery.error ? getReadableActionError(discoveryQuery.error as MarketplaceApiError) : null;

  function syncRoute(
    nextQuery: string,
    nextCategory: string,
    nextLocationId: string,
    nextMinRating?: number,
    nextMaxPrice?: number,
    nextAvailability: AvailabilityFilter = "any",
    nextVerifiedOnly = verifiedOnly
  ) {
    const params = new URLSearchParams();
    params.set("type", initialType);

    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }

    if (nextCategory) {
      params.set("category", nextCategory);
    }

    if (nextLocationId) {
      params.set("locationId", nextLocationId);
    }

    if (typeof nextMinRating === "number") {
      params.set("rating", String(nextMinRating));
    }

    if (typeof nextMaxPrice === "number") {
      params.set("price", String(nextMaxPrice));
    }

    if (nextAvailability !== "any") {
      params.set("availability", nextAvailability);
    }

    if (nextVerifiedOnly) {
      params.set("verified", "1");
    }

    router.replace(params.size ? `${routeBase}?${params.toString()}` : routeBase);
  }

  function handleSearchSubmit() {
    syncRoute(query, serviceFilter, selectedLocationId, minRating, maxPrice, availability, verifiedOnly);
  }

  function handleServiceShortcut(nextCategory: string) {
    const updatedCategory = serviceFilter === nextCategory ? "" : nextCategory;
    setServiceFilter(updatedCategory);
    syncRoute(query, updatedCategory, selectedLocationId, minRating, maxPrice, availability, verifiedOnly);
  }

  function handleRatingFilter(nextRating?: number) {
    setMinRating(nextRating);
    syncRoute(query, serviceFilter, selectedLocationId, nextRating, maxPrice, availability, verifiedOnly);
  }

  function handlePriceFilter(nextPrice?: number) {
    setMaxPrice(nextPrice);
    syncRoute(query, serviceFilter, selectedLocationId, minRating, nextPrice, availability, verifiedOnly);
  }

  function handleAvailabilityFilter(nextAvailability: AvailabilityFilter) {
    setAvailability(nextAvailability);
    syncRoute(query, serviceFilter, selectedLocationId, minRating, maxPrice, nextAvailability, verifiedOnly);
  }

  function handleVerifiedToggle() {
    const nextValue = !verifiedOnly;
    setVerifiedOnly(nextValue);
    syncRoute(query, serviceFilter, selectedLocationId, minRating, maxPrice, availability, nextValue);
  }

  const barbersSection = (
    <ClientSectionBlock
      eyebrow="Barbers"
      title="Barbers near you"
      subtitle="Compare real barbers, trust signals, and next openings without leaving booking context."
    >
      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
      {discoveryQuery.isLoading && !visibleBarbers.length ? (
        <RailSkeleton />
      ) : visibleBarbers.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleBarbers.slice(0, hasActiveSearchQuery ? 9 : 6).map((result) => (
            <BarberResultCard key={result.barberId} result={result} />
          ))}
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-white/10 bg-black/18 p-5 text-sm leading-7 text-white/62">
          We&apos;re expanding in your area. Explore top barbers on BVRB3R.
        </div>
      )}
    </ClientSectionBlock>
  );

  const shopsSection = (
    <ClientSectionBlock
      eyebrow="Shops"
      title="Shops near you"
      subtitle="Start with the shop when you want to choose the place first, then move into the active barbers working there."
    >
      {homeQuery.isLoading && !homePayload ? (
        <RailSkeleton />
      ) : visibleShops.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleShops.slice(0, 6).map((shop) => (
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
        <div className="rounded-[28px] border border-dashed border-white/10 bg-black/18 p-5 text-sm leading-7 text-white/62">
          {allShops.length
            ? "Explore barber shops on BVRB3R."
            : "Verified barbers and shops will appear here as they become bookable."}
        </div>
      )}
    </ClientSectionBlock>
  );

  return (
    <div className="space-y-4" data-testid="client-search-screen">
      <Card className="rounded-[34px] border-white/10 bg-[linear-gradient(180deg,rgba(17,17,17,0.96),rgba(6,6,6,0.98))] p-5 shadow-[0_26px_60px_rgba(0,0,0,0.24)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,255,0,0.12),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.06),transparent_26%)]" />
        <div className="relative">
          <h1 className="text-balance text-3xl font-semibold text-white sm:text-5xl" data-display="true">
            Find the right barber.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/66">
            Search barbers and shops, then book from a real profile.
          </p>
        </div>
      </Card>

      <ClientPrimarySearchBar
        value={query}
        onValueChange={setQuery}
        onSubmit={handleSearchSubmit}
        placeholder="Search barber or shop name"
        className="bg-[rgba(10,10,10,0.95)] backdrop-blur-xl"
      />

      <ClientSectionBlock
        eyebrow="Filters"
        title="Filter Chips"
        subtitle="Tap a service, rating, price, or timing filter to tighten the search."
      >
        <div className="flex flex-wrap gap-2">
          {serviceFilters.map((filter) => (
            <FilterChip
              key={filter.query}
              active={serviceFilter === filter.query}
              onClick={() => handleServiceShortcut(filter.query)}
            >
              {filter.label}
            </FilterChip>
          ))}
          <FilterChip active={minRating === 4.5} onClick={() => handleRatingFilter(minRating === 4.5 ? undefined : 4.5)}>
            <Star className="h-3.5 w-3.5" />
            4.5+
          </FilterChip>
          <FilterChip active={minRating === 4.8} onClick={() => handleRatingFilter(minRating === 4.8 ? undefined : 4.8)}>
            <Star className="h-3.5 w-3.5" />
            4.8+
          </FilterChip>
          <FilterChip active={maxPrice === 60} onClick={() => handlePriceFilter(maxPrice === 60 ? undefined : 60)}>
            Under $60
          </FilterChip>
          <FilterChip active={maxPrice === 80} onClick={() => handlePriceFilter(maxPrice === 80 ? undefined : 80)}>
            Under $80
          </FilterChip>
          <FilterChip active={availability === "now"} onClick={() => handleAvailabilityFilter(availability === "now" ? "any" : "now")}>
            Available Now
          </FilterChip>
          <FilterChip active={availability === "today"} onClick={() => handleAvailabilityFilter(availability === "today" ? "any" : "today")}>
            Today
          </FilterChip>
          <FilterChip active={verifiedOnly} onClick={handleVerifiedToggle}>
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified only
          </FilterChip>
        </div>
      </ClientSectionBlock>

      {prefersShopDiscovery ? shopsSection : barbersSection}
      {prefersShopDiscovery ? barbersSection : shopsSection}

      <ClientSectionBlock
        eyebrow="Feed"
        title="Marketplace Feed"
        subtitle="Browse real work, then tap into the barber profile when something looks right."
      >
        {marketplaceFeed.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {marketplaceFeed.map((result) => (
              <MarketplaceFeedCard key={`${result.barberId}-feed`} result={result} />
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-white/10 bg-black/18 p-5 text-sm leading-7 text-white/62">
            Verified barbers and shops will appear here as they become bookable.
          </div>
        )}
      </ClientSectionBlock>
    </div>
  );
}
