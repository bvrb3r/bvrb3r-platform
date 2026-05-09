"use client";

import type { Route } from "next";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, RefreshCw, ShieldCheck, Star } from "lucide-react";
import { ClientDiscoveryCard } from "@/components/client-experience/client-discovery-card";
import { ClientPrimarySearchBar } from "@/components/client-experience/client-primary-search-bar";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { ClientShopDiscoveryCard } from "@/components/client-experience/client-shop-discovery-card";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterChip, PageHeader } from "@/design/components";
import { useClientHomeQuery } from "@/lib/booking/client";
import {
  useMarketplaceDiscovery,
  type MarketplaceApiError
} from "@/lib/marketplace/client";
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

const emptyDiscoveryResults: DiscoveryResult[] = [];

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

function SearchEmptyState({
  title,
  body,
  actionLabel,
  href,
  onAction
}: {
  title: string;
  body: string;
  actionLabel: string;
  href?: string;
  onAction?: () => void;
}) {
  const actionClassName = "mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#A3FF12]/28 bg-[#A3FF12]/10 px-5 text-sm font-extrabold text-[#A3FF12] transition hover:border-[#A3FF12]/48 hover:bg-[#A3FF12]/15";

  return (
    <div className="rounded-[28px] border border-dashed border-white/10 bg-black/18 p-5">
      <h3 className="text-2xl font-semibold tracking-[-0.03em] text-white" data-display="true">{title}</h3>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">{body}</p>
      {href ? (
        <Link href={href as Route} className={actionClassName}>
          {actionLabel}
        </Link>
      ) : (
        <button type="button" className={actionClassName} onClick={onAction}>
          <RefreshCw className="h-4 w-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function getBarberVerifiedLabel(result: DiscoveryResult) {
  if (result.badges.some((badge) => badge.startsWith("verified_"))) {
    return "Verified";
  }

  return result.trustLabel ?? null;
}

function getFeedCaption(result: DiscoveryResult) {
  return result.mostBookedService ?? result.specialties[0] ?? "Fresh work";
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
  const recommendedBarbers = homePayload?.recommendedBarbers ?? emptyDiscoveryResults;
  const allShops = useMemo(
    () => ((homePayload?.recommendedShops?.length ? homePayload.recommendedShops : homePayload?.shops ?? []) as RecommendedShopView[]),
    [homePayload]
  );
  const defaultLocationId = initialLocationId || (homePayload?.hasResolvedLocation ? homePayload.locationId : "") || "";
  const clientLocationLabel = homePayload?.client?.preferredLocation
    ? [homePayload.client.preferredLocation.city, homePayload.client.preferredLocation.state].filter(Boolean).join(", ")
    : "";

  const [query, setQuery] = useState(initialQuery);
  const [serviceFilter, setServiceFilter] = useState(initialCategory || initialSpecialty);
  const [selectedLocationId, setSelectedLocationId] = useState(defaultLocationId);
  const [minRating, setMinRating] = useState<number | undefined>(initialMinRating);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(initialMaxPrice);
  const [availability, setAvailability] = useState<AvailabilityFilter>(initialAvailability);
  const [verifiedOnly, setVerifiedOnly] = useState(initialVerifiedOnly);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState(initialQuery.trim());
  const [manualSearchPending, setManualSearchPending] = useState(false);

  useEffect(() => {
    if (!selectedLocationId && defaultLocationId) {
      setSelectedLocationId(defaultLocationId);
    }
  }, [defaultLocationId, selectedLocationId]);

  const deferredSubmittedQuery = useDeferredValue(submittedQuery);
  const trimmedQuery = deferredSubmittedQuery.trim();
  const draftQuery = query.trim();
  const hasActiveSearchQuery = Boolean(
    trimmedQuery
    || serviceFilter
    || minRating
    || maxPrice
    || availability !== "any"
    || verifiedOnly
  );
  const hasSubmittedDirectSearch = Boolean(lastSubmittedQuery);

  const discoveryQuery = useMarketplaceDiscovery({
    query: trimmedQuery || undefined,
    category: serviceFilter || undefined,
    locationId: selectedLocationId || undefined,
    minRating,
    maxPrice,
    availability,
    maxDistanceMiles: 20
  }, clientId);
  const discoveryBusy = Boolean(discoveryQuery.isLoading || discoveryQuery.isFetching || manualSearchPending);

  useEffect(() => {
    if (!manualSearchPending) {
      return;
    }

    if (!discoveryQuery.isLoading && !discoveryQuery.isFetching) {
      setManualSearchPending(false);
      return;
    }

    const timeout = window.setTimeout(() => setManualSearchPending(false), 5_500);
    return () => window.clearTimeout(timeout);
  }, [discoveryQuery.isFetching, discoveryQuery.isLoading, manualSearchPending]);

  const canonicalResults = useMemo(() => discoveryQuery.data ?? [], [discoveryQuery.data]);
  const barberResults = useMemo(
    () => verifiedOnly
      ? canonicalResults.filter((result) => result.badges.some((badge) => badge.startsWith("verified_")))
      : canonicalResults,
    [canonicalResults, verifiedOnly]
  );
  const defaultBarberResults = useMemo(() => {
    const results = new Map<string, DiscoveryResult>();
    for (const result of [...recommendedBarbers, ...barberResults]) {
      results.set(result.barberId, result);
    }

    return [...results.values()];
  }, [barberResults, recommendedBarbers]);
  const visibleBarbers = hasActiveSearchQuery
    ? barberResults
    : defaultBarberResults;
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
  const debugEnabled = process.env.NODE_ENV !== "production";
  const hasKnownBookableBarbers = Boolean(barberResults.length || defaultBarberResults.length);
  const barberEmptyState = hasSubmittedDirectSearch && hasActiveSearchQuery
    ? {
        title: "No matching barbers found.",
        body: "Try a different name or clear filters to search all live BVRB3R barbers.",
        actionLabel: "Refresh Search"
      }
    : hasKnownBookableBarbers && hasActiveSearchQuery
    ? {
        title: "No nearby matches yet.",
        body: "Try searching by name or expanding your city.",
        actionLabel: "Search all BVRB3R",
        href: `${routeBase}?type=barbers`
      }
    : {
        title: "No live barbers yet.",
        body: "Approved barbers appear here after services, hours, location/shop, booking, and payout setup are complete.",
        actionLabel: "Refresh Search"
      };
  const shopEmptyState = allShops.length && hasActiveSearchQuery
    ? {
        title: "No nearby matches yet.",
        body: "Try searching by name or expanding your city.",
        actionLabel: "Search all BVRB3R",
        href: `${routeBase}?type=shops`
      }
    : {
        title: "No live shops yet.",
        body: "Approved shops appear here after the shop is set up and at least one approved barber is bookable.",
        actionLabel: "Refresh Search"
      };

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
    const nextQuery = draftQuery;
    setSubmittedQuery(nextQuery);
    setLastSubmittedQuery(nextQuery);
    setManualSearchPending(true);
    syncRoute(nextQuery, serviceFilter, selectedLocationId, minRating, maxPrice, availability, verifiedOnly);
    if (nextQuery === trimmedQuery) {
      void Promise.resolve(discoveryQuery.refetch()).finally(() => setManualSearchPending(false));
    }
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
      subtitle="Real profiles, ratings, and next openings."
    >
      {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
      {discoveryBusy ? <FeedbackBanner tone="info" message={`Searching ${trimmedQuery || draftQuery || "marketplace"}...`} /> : null}
      {discoveryBusy && !visibleBarbers.length ? (
        <RailSkeleton />
      ) : visibleBarbers.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visibleBarbers.slice(0, hasActiveSearchQuery ? 9 : 6).map((result) => (
            <ClientDiscoveryCard key={result.barberId} result={result} layout="grid" canFavorite={Boolean(clientId)} />
          ))}
        </div>
      ) : (
        <SearchEmptyState
          {...barberEmptyState}
          onAction={() => void discoveryQuery.refetch()}
        />
      )}
    </ClientSectionBlock>
  );

  const shopsSection = (
    <ClientSectionBlock
      eyebrow="Shops"
      title="Shops near you"
      subtitle="Choose the shop first, then pick the chair."
    >
      {homeQuery.isLoading && !homePayload ? (
        <RailSkeleton />
      ) : visibleShops.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visibleShops.slice(0, 6).map((shop) => (
            <ClientShopDiscoveryCard
              key={shop.id}
              location={{
                ...shop,
                viewHref: `/shop/${encodeURIComponent(shop.id)}` as Route
              }}
              layout="grid"
              canFavorite={Boolean(clientId)}
            />
          ))}
        </div>
      ) : (
        <SearchEmptyState
          {...shopEmptyState}
          onAction={() => void homeQuery.refetch()}
        />
      )}
    </ClientSectionBlock>
  );

  return (
    <div className="space-y-4" data-testid="client-search-screen">
      <Card className="rounded-[34px] border-white/10 bg-[linear-gradient(180deg,rgba(17,17,17,0.96),rgba(6,6,6,0.98))] p-5 shadow-[0_26px_60px_rgba(0,0,0,0.24)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,255,0,0.12),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.06),transparent_26%)]" />
        <div className="relative">
          <PageHeader
            title="Find the right barber."
            subtitle="Search live barbers and shops."
          />
        </div>
      </Card>

      <ClientPrimarySearchBar
        value={query}
        onValueChange={setQuery}
        onSubmit={handleSearchSubmit}
        placeholder="Search barber or shop name"
        className="bg-[rgba(10,10,10,0.95)] backdrop-blur-xl"
        isSubmitting={discoveryBusy}
      />

      {homePayload && !homePayload.hasResolvedLocation ? (
        <FeedbackBanner tone="info" message="Set your city to prioritize nearby barbers. Search still shows live BVRB3R barbers across the platform." />
      ) : null}

      <ClientSectionBlock
        eyebrow="Filters"
        title="Filters"
        subtitle="Tap once to tighten the search."
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
          <FilterChip active={minRating === 4.5} onClick={() => handleRatingFilter(minRating === 4.5 ? undefined : 4.5)} className="gap-2">
            <Star className="h-3.5 w-3.5" />
            4.5+
          </FilterChip>
          <FilterChip active={minRating === 4.8} onClick={() => handleRatingFilter(minRating === 4.8 ? undefined : 4.8)} className="gap-2">
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
          <FilterChip active={verifiedOnly} onClick={handleVerifiedToggle} className="gap-2">
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
        subtitle="Browse real work from active barber profiles."
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

      {debugEnabled ? (
        <details className="rounded-[24px] border border-white/10 bg-black/30 p-4 text-sm text-white/62" data-testid="client-search-debug">
          <summary className="cursor-pointer font-semibold text-white">Discovery debug</summary>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            <div><dt className="text-white/40">Discovery request succeeded</dt><dd>{discoveryQuery.error ? "no" : "yes"}</dd></div>
            <div><dt className="text-white/40">Request status</dt><dd>{discoveryBusy ? "loading" : discoveryQuery.error ? "error" : "ready"}</dd></div>
            <div><dt className="text-white/40">Last query submitted</dt><dd>{lastSubmittedQuery || "none"}</dd></div>
            <div><dt className="text-white/40">Barber count</dt><dd>{barberResults.length}</dd></div>
            <div><dt className="text-white/40">Shop count</dt><dd>{visibleShops.length}</dd></div>
            <div><dt className="text-white/40">Feed count</dt><dd>{marketplaceFeed.length}</dd></div>
            <div><dt className="text-white/40">Last error</dt><dd>{discoveryQuery.error instanceof Error ? discoveryQuery.error.message : "none"}</dd></div>
            <div><dt className="text-white/40">Client location</dt><dd>{clientLocationLabel || "not set"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-white/40">First barber results</dt><dd>{barberResults.slice(0, 5).map((result) => `${result.barberName} (${result.barberId})`).join(", ") || "none"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-white/40">Filters</dt><dd>{JSON.stringify({ query: trimmedQuery, serviceFilter, selectedLocationId, minRating, maxPrice, availability, verifiedOnly })}</dd></div>
          </dl>
        </details>
      ) : null}
    </div>
  );
}
