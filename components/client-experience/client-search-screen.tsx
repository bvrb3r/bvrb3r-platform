"use client";

import type { Route } from "next";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ShieldCheck, SlidersHorizontal, Sparkles, Star } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientDiscoveryCard } from "@/components/client-experience/client-discovery-card";
import { ClientPrimarySearchBar } from "@/components/client-experience/client-primary-search-bar";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { clientServiceCategories } from "@/components/client-experience/client-service-grid";
import { ClientShopDiscoveryCard } from "@/components/client-experience/client-shop-discovery-card";
import { NextAvailableChairCard } from "@/components/client-experience/next-available-chair-card";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientHomeQuery } from "@/lib/booking/client";
import { buildClientDiscoverySections } from "@/lib/client-experience/discovery";
import { useClientReferralSummary } from "@/lib/engagement/client";
import {
  useHaircutNowMatch,
  useMarketplaceAnalyticsMutation,
  useMarketplaceDiscovery,
  type MarketplaceApiError
} from "@/lib/marketplace/client";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { cn } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type AvailabilityFilter = "any" | "today" | "now";

function ResultSkeleton() {
  return (
    <div className="rounded-[30px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-40 rounded-[24px] md:h-32" />
      <Skeleton className="mt-4 h-5 w-40" />
      <Skeleton className="mt-3 h-4 w-28" />
      <Skeleton className="mt-4 h-4 w-full" />
    </div>
  );
}

function RailSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
      {[0, 1].map((index) => (
        <div key={index} className="w-[18.5rem] shrink-0 rounded-[32px] border border-white/8 bg-black/20 p-4">
          <Skeleton className="h-44 rounded-[24px]" />
          <Skeleton className="mt-4 h-5 w-32" />
          <Skeleton className="mt-3 h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

function formatSlotTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
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

export function ClientSearchScreen({
  clientId,
  initialQuery = "",
  initialCategory = "",
  initialLocationId = "",
  initialMinRating,
  initialMaxPrice,
  initialAvailability = "any",
  routeBase = "/search"
}: {
  clientId?: string;
  initialQuery?: string;
  initialCategory?: string;
  initialLocationId?: string;
  initialMinRating?: number;
  initialMaxPrice?: number;
  initialAvailability?: AvailabilityFilter;
  routeBase?: "/search" | "/discover";
}) {
  const router = useRouter();
  const homeQuery = useClientHomeQuery();
  const referralQuery = useClientReferralSummary(Boolean(clientId));
  const analyticsMutation = useMarketplaceAnalyticsMutation();
  const homePayload = homeQuery.data;
  const shops = homePayload?.shops ?? [];
  const defaultLocationId = initialLocationId || homePayload?.locationId || shops[0]?.id || "";

  const [query, setQuery] = useState(initialQuery);
  const [serviceFilter, setServiceFilter] = useState(initialCategory);
  const [selectedLocationId, setSelectedLocationId] = useState(defaultLocationId);
  const [minRating, setMinRating] = useState<number | undefined>(initialMinRating);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(initialMaxPrice);
  const [availability, setAvailability] = useState<AvailabilityFilter>(initialAvailability);

  useEffect(() => {
    if (!selectedLocationId && defaultLocationId) {
      setSelectedLocationId(defaultLocationId);
    }
  }, [defaultLocationId, selectedLocationId]);

  const activeShop = shops.find((shop) => shop.id === selectedLocationId) ?? shops[0];

  const deferredQuery = useDeferredValue(query);
  const trimmedQuery = deferredQuery.trim();
  const combinedQuery = [trimmedQuery, serviceFilter].filter(Boolean).join(" ").trim();
  const hasActiveSearchQuery = Boolean(trimmedQuery || serviceFilter || minRating || maxPrice || availability !== "any");

  const discoveryQuery = useMarketplaceDiscovery({
    query: combinedQuery || undefined,
    locationId: selectedLocationId || undefined,
    minRating,
    maxPrice,
    availability,
    maxDistanceMiles: 20
  }, clientId);
  const haircutNowQuery = useHaircutNowMatch(clientId, selectedLocationId || undefined);
  const barberResults = useMemo(() => discoveryQuery.data ?? [], [discoveryQuery.data]);
  const errorMessage = discoveryQuery.error ? getReadableActionError(discoveryQuery.error as MarketplaceApiError) : null;
  const discoverySections = useMemo(() => buildClientDiscoverySections(barberResults), [barberResults]);
  const showClientAccountFeatures = Boolean(clientId);
  const categoryLabel = useMemo(
    () => clientServiceCategories.find((category) => category.query === serviceFilter)?.label,
    [serviceFilter]
  );

  const nextAvailableChair = haircutNowQuery.data ?? null;
  const nextAvailablePreview = useMemo(() => {
    if (!nextAvailableChair) {
      return null;
    }

    const matchedResult = barberResults.find((result) => result.barberId === nextAvailableChair.barberId);
    return {
      accent: matchedResult?.badges.includes("top_barber") ? "#d7ffab" : "#7cff00",
      barberId: nextAvailableChair.barberId,
      barberName: nextAvailableChair.barberName,
      bookHref: buildMarketplaceBookingHref({
        barberId: nextAvailableChair.barberId,
        username: nextAvailableChair.username,
        locationId: nextAvailableChair.locationId,
        appointmentTime: nextAvailableChair.appointmentTime,
        sourceKind: "haircut_now",
        matchedFrom: nextAvailableChair.matchedFrom
      }),
      distanceLabel: matchedResult ? `${matchedResult.distanceMiles.toFixed(1)} mi away` : (activeShop?.neighborhood ?? "Nearby"),
      headline: nextAvailableChair.matchReason,
      locationId: nextAvailableChair.locationId,
      nextSlotLabel: formatSlotTime(nextAvailableChair.appointmentTime),
      profileHref: `/barber/${nextAvailableChair.username}` as Route,
      rating: nextAvailableChair.rating,
      shopName: nextAvailableChair.shopName ?? activeShop?.name ?? "BVRB3R marketplace",
      username: nextAvailableChair.username,
      waitLabel: getEstimatedWaitLabel(nextAvailableChair.matchedFrom, matchedResult?.distanceMiles)
    };
  }, [activeShop?.name, activeShop?.neighborhood, barberResults, nextAvailableChair]);

  const resultsTitle = categoryLabel && !trimmedQuery
    ? `${categoryLabel} around ${activeShop?.neighborhood ?? "Ybor City"}`
    : `Barber discovery around ${activeShop?.neighborhood ?? "Ybor City"}`;
  const resultsSubtitle = hasActiveSearchQuery
    ? "Use the ranked list below to compare reviews, price, retention, and next availability without leaving the booking lane."
    : "The marketplace now ranks real nearby barbers by retention, review trust, and live booking activity.";

  async function handleReferralCta() {
    try {
      await analyticsMutation.mutateAsync({
        eventType: "referral_shared",
        sourceKind: "discovery",
        sourceReference: referralQuery.data?.referralCode?.code,
        metadata: {
          interaction: "cta_click",
          surface: routeBase
        }
      });
    } catch {
      // Discovery should remain responsive even if analytics persistence is unavailable.
    }
  }

  function syncRoute(
    nextQuery: string,
    nextCategory: string,
    nextLocationId: string,
    nextMinRating?: number,
    nextMaxPrice?: number,
    nextAvailability: AvailabilityFilter = "any"
  ) {
    const params = new URLSearchParams();

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

    router.replace(params.size ? `${routeBase}?${params.toString()}` : routeBase);
  }

  function handleSearchSubmit() {
    syncRoute(query, serviceFilter, selectedLocationId, minRating, maxPrice, availability);
  }

  function handleServiceShortcut(nextCategory: string) {
    const updatedCategory = serviceFilter === nextCategory ? "" : nextCategory;
    setServiceFilter(updatedCategory);
    syncRoute(query, updatedCategory, selectedLocationId, minRating, maxPrice, availability);
  }

  function handleLocationFilter(nextLocationId: string) {
    setSelectedLocationId(nextLocationId);
    syncRoute(query, serviceFilter, nextLocationId, minRating, maxPrice, availability);
  }

  function handleRatingFilter(nextRating?: number) {
    setMinRating(nextRating);
    syncRoute(query, serviceFilter, selectedLocationId, nextRating, maxPrice, availability);
  }

  function handlePriceFilter(nextPrice?: number) {
    setMaxPrice(nextPrice);
    syncRoute(query, serviceFilter, selectedLocationId, minRating, nextPrice, availability);
  }

  function handleAvailabilityFilter(nextAvailability: AvailabilityFilter) {
    setAvailability(nextAvailability);
    syncRoute(query, serviceFilter, selectedLocationId, minRating, maxPrice, nextAvailability);
  }

  return (
    <div className="space-y-4" data-testid="client-search-screen">
      <Card className="rounded-[34px] border-white/10 bg-[linear-gradient(180deg,rgba(17,17,17,0.96),rgba(6,6,6,0.98))] p-5 shadow-[0_26px_60px_rgba(0,0,0,0.24)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,255,0,0.12),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.06),transparent_26%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#d7ffab]">Marketplace discovery</p>
            <h1 className="mt-3 text-balance text-3xl font-semibold text-white sm:text-4xl" data-display="true">
              Discover barbers worth booking.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
              Browse ranked barbers, compare real review proof, jump on the next open chair, and move straight into booking without losing context.
            </p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-black/22 px-4 py-3 shadow-[0_14px_28px_rgba(0,0,0,0.18)]">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/46">Marketplace zone</p>
            <p className="mt-2 text-sm font-medium text-white">{activeShop?.name ?? "BVRB3R Search"}</p>
            <p className="mt-1 text-sm text-white/58">{activeShop?.neighborhood ?? "Ybor City"}, {activeShop?.city ?? "Tampa"}</p>
          </div>
        </div>
      </Card>

      <ClientPrimarySearchBar
        value={query}
        onValueChange={setQuery}
        onSubmit={handleSearchSubmit}
        placeholder="Find a barber, service, or style"
        className="bg-[rgba(10,10,10,0.95)] backdrop-blur-xl"
      />

      <ClientSectionBlock
        eyebrow="Filters"
        title="Dial in the marketplace."
        subtitle="Filter by location, service, rating, price, and live availability without breaking the ranked discovery flow."
        action={<span className="inline-flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-[#baff69]" />Smart ranking stays on</span>}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="space-y-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/46">Location</span>
              <select
                value={selectedLocationId}
                onChange={(event) => handleLocationFilter(event.target.value)}
                className="h-12 w-full rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#7cff00]/30"
                aria-label="Filter by location"
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name} | {shop.neighborhood}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-[20px] border border-white/10 bg-black/18 px-4 py-3 text-sm leading-6 text-white/66">
              Ranking blends retention, review proof, and booking activity so the strongest working chairs rise first.
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
            {clientServiceCategories.map((category) => {
              const Icon = category.icon;
              const active = serviceFilter === category.query;

              return (
                <button
                  key={category.label}
                  type="button"
                  onClick={() => handleServiceShortcut(category.query)}
                  className={cn(
                    "group flex min-h-[7rem] w-[9.5rem] shrink-0 flex-col items-center justify-center rounded-[26px] border px-3 py-4 text-center shadow-[0_14px_34px_rgba(0,0,0,0.16)] transition",
                    active
                      ? "border-[#d7ffab]/24 bg-[linear-gradient(180deg,rgba(124,255,0,0.16),rgba(8,8,8,0.96))]"
                      : "border-white/8 bg-[linear-gradient(180deg,rgba(20,20,20,0.96),rgba(9,9,9,0.98))] hover:-translate-y-0.5 hover:border-[#7CFF00]/18 hover:bg-black/30"
                  )}
                >
                  <div className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-[20px] border text-[#d7ffab] shadow-[0_12px_28px_rgba(124,255,0,0.1)] transition",
                    active
                      ? "border-[#d7ffab]/22 bg-[linear-gradient(135deg,rgba(124,255,0,0.28),rgba(18,18,18,0.96))]"
                      : "border-[#7CFF00]/16 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(18,18,18,0.96))] group-hover:scale-[1.03]"
                  )}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/82 sm:tracking-[0.18em]">{category.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterChip active={!minRating} onClick={() => handleRatingFilter(undefined)}>Any rating</FilterChip>
            <FilterChip active={minRating === 4.5} onClick={() => handleRatingFilter(minRating === 4.5 ? undefined : 4.5)}>
              <Star className="h-3.5 w-3.5" />
              4.5+
            </FilterChip>
            <FilterChip active={minRating === 4.8} onClick={() => handleRatingFilter(minRating === 4.8 ? undefined : 4.8)}>
              <Star className="h-3.5 w-3.5" />
              4.8+
            </FilterChip>
            <FilterChip active={!maxPrice} onClick={() => handlePriceFilter(undefined)}>Any price</FilterChip>
            <FilterChip active={maxPrice === 60} onClick={() => handlePriceFilter(maxPrice === 60 ? undefined : 60)}>
              Under $60
            </FilterChip>
            <FilterChip active={maxPrice === 80} onClick={() => handlePriceFilter(maxPrice === 80 ? undefined : 80)}>
              Under $80
            </FilterChip>
            <FilterChip active={availability === "any"} onClick={() => handleAvailabilityFilter("any")}>Any time</FilterChip>
            <FilterChip active={availability === "today"} onClick={() => handleAvailabilityFilter(availability === "today" ? "any" : "today")}>
              Today
            </FilterChip>
            <FilterChip active={availability === "now"} onClick={() => handleAvailabilityFilter(availability === "now" ? "any" : "now")}>
              Available now
            </FilterChip>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Available now"
        title="Get a haircut now."
        subtitle="Jump straight into the fastest viable chair without leaving the marketplace."
      >
        {haircutNowQuery.isLoading && !nextAvailableChair ? (
          <div className="rounded-[34px] border border-white/10 bg-black/18 p-5 sm:p-6">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="mt-4 h-10 w-64" />
            <Skeleton className="mt-5 h-40 w-full rounded-[28px]" />
          </div>
        ) : (
          <NextAvailableChairCard match={nextAvailablePreview} fallbackHref={routeBase as Route} />
        )}
      </ClientSectionBlock>

      {showClientAccountFeatures ? (
        <ClientSectionBlock
          eyebrow="Referral boost"
          title="Bring someone into the marketplace with you."
          subtitle="Referral value now lives alongside discovery so the best moment to share is close to the next great profile."
        >
          <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Referral code</p>
                <h3 className="mt-3 text-2xl font-semibold text-white" data-display="true">
                  {referralQuery.data?.referralCode?.code ?? "BVRB3R"}
                </h3>
                <p className="mt-3 text-sm leading-7 text-white/62">
                  {referralQuery.data?.shareMessage ?? "Share your marketplace invite while the discovery intent is fresh and let the rewards stack into future visits."}
                </p>
              </div>
              <div className="rounded-[22px] border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-4 py-3 text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#e8ffc2]">Reward points</p>
                <p className="mt-2 text-2xl font-semibold text-white">{referralQuery.data?.referralCode?.rewardPoints ?? 0}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <ClientActionLink href="/referrals" size="lg" onClick={() => void handleReferralCta()}>
                Open referrals
              </ClientActionLink>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/62">
                {referralQuery.data?.totals.completed ?? 0} converted
              </span>
            </div>
          </div>
        </ClientSectionBlock>
      ) : null}

      <ClientSectionBlock
        eyebrow="Shops near you"
        title="Browse the nearby shop layer."
        subtitle="Discovery stays grounded in real places so clients can evaluate where they want to book."
      >
        {homeQuery.isLoading && !homePayload ? (
          <RailSkeleton />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {shops.map((shop) => (
              <ClientShopDiscoveryCard key={shop.id} location={shop} />
            ))}
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow={hasActiveSearchQuery ? "Search results" : "Marketplace feed"}
        title={hasActiveSearchQuery
          ? (barberResults.length ? `Results for ${trimmedQuery || categoryLabel || "your filters"}` : "No results found")
          : resultsTitle}
        subtitle={barberResults.length ? resultsSubtitle : "Try adjusting the filters or broadening your service/search terms."}
        action={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#baff69]" />Deterministic ranking</span>}
      >
        {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
        {discoveryQuery.isLoading && !barberResults.length ? (
          <div className="space-y-4">
            <RailSkeleton />
            <ResultSkeleton />
            <ResultSkeleton />
          </div>
        ) : barberResults.length ? (
          hasActiveSearchQuery ? (
            <div className="space-y-3">
              {barberResults.map((result) => (
                <ClientDiscoveryCard key={result.barberId} result={result} layout="list" />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {discoverySections.map((section) => (
                <div key={section.id} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
                        <Sparkles className="h-3.5 w-3.5" />
                        {section.badge}
                      </div>
                      <h3 className="mt-2 text-2xl font-semibold text-white" data-display="true">{section.title}</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-7 text-white/62">{section.description}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
                    {section.items.map((result) => (
                      <ClientDiscoveryCard key={`${section.id}-${result.barberId}`} result={result} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-6 sm:p-7">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">No matching barbers</p>
            <h3 className="mt-3 text-2xl font-semibold text-white" data-display="true">Try a broader search.</h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
              Search by barber name, shop name, or a service category above to reopen the discovery flow.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-sm text-white/72">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/18 px-3 py-2">
                <MapPin className="h-4 w-4 text-[#baff69]" />
                {activeShop?.name ?? "BVRB3R Search"}
              </span>
            </div>
          </div>
        )}
      </ClientSectionBlock>
    </div>
  );
}
