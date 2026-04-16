"use client";

import Link from "next/link";
import type { Route } from "next";
import { useDeferredValue, useState } from "react";
import { ArrowRight, Compass, Scissors, Search, Sparkles, Star, TimerReset, TrendingUp, Users, WandSparkles } from "lucide-react";
import { DiscoveryMapPanel } from "@/components/marketplace/discovery-map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientEngagementSummary } from "@/lib/engagement/client";
import { useHaircutNowMatch, useMarketplaceDiscovery, useMarketplaceMap, type MarketplaceApiError } from "@/lib/marketplace/client";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { getReadableActionError } from "@/lib/utils/feedback";
import { currency, dateLabel } from "@/lib/utils";
import type { DiscoveryFilters, MarketplaceBadge } from "@/types/domain";

function DiscoveryCardSkeleton() {
  return (
    <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-3 h-4 w-28" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-16 rounded-[20px]" />
        <Skeleton className="h-16 rounded-[20px]" />
        <Skeleton className="h-16 rounded-[20px]" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-24 rounded-full" />
      </div>
    </div>
  );
}

function getBadgeLabel(badge: MarketplaceBadge) {
  switch (badge) {
    case "verified_license":
      return "Verified license";
    case "verified_identity":
      return "Verified identity";
    case "verified_shop":
      return "Verified shop";
    case "top_barber":
      return "Top barber";
    case "rising_barber":
      return "Rising barber";
    default:
      return badge;
  }
}

function getMatchLabel(source: string) {
  switch (source) {
    case "favorite_barber":
      return "Favorite barber match";
    case "favorite_shop":
      return "Favorite shop match";
    case "nearby":
      return "Nearby match";
    case "available_now":
      return "Fastest open chair";
    default:
      return "Instant match";
  }
}

export function DiscoveryWorkspace({ clientId }: { clientId?: string }) {
  const [query, setQuery] = useState("");
  const [locationId, setLocationId] = useState("");
  const [styleTagId, setStyleTagId] = useState("");
  const [minRating, setMinRating] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [availability, setAvailability] = useState<DiscoveryFilters["availability"]>("any");
  const [specialty, setSpecialty] = useState("");
  const [maxDistanceMiles, setMaxDistanceMiles] = useState("");
  const [showInstantMatch, setShowInstantMatch] = useState(false);

  const deferredQuery = useDeferredValue(query);
  const filters: DiscoveryFilters = {
    query: deferredQuery.trim() || undefined,
    locationId: locationId || undefined,
    styleTagId: styleTagId || undefined,
    minRating: minRating ? Number(minRating) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    availability,
    specialty: specialty.trim() || undefined,
    maxDistanceMiles: maxDistanceMiles ? Number(maxDistanceMiles) : undefined
  };

  const discoveryQuery = useMarketplaceDiscovery(filters, clientId);
  const clientSummaryQuery = useClientEngagementSummary(Boolean(clientId));
  const mapQuery = useMarketplaceMap(filters);
  const haircutNowQuery = useHaircutNowMatch(clientId, locationId || undefined);

  const discoveryError = discoveryQuery.error ? getReadableActionError(discoveryQuery.error as MarketplaceApiError) : null;
  const mapError = mapQuery.error ? getReadableActionError(mapQuery.error as MarketplaceApiError) : null;
  const instantError = haircutNowQuery.error ? getReadableActionError(haircutNowQuery.error as MarketplaceApiError) : null;
  const results = discoveryQuery.data ?? [];
  const markers = mapQuery.data ?? [];
  const locationOptions = [...new Map(results.filter((result) => result.locationId).map((result) => [result.locationId!, result.locationLabel ?? result.shopName ?? result.locationId!])).entries()];
  const clientSummary = clientSummaryQuery.data;
  const favoriteUpdates = (clientSummary?.followedBarbers ?? [])
    .map((follow) => results.find((result) => result.barberId === follow.barberId))
    .filter((result): result is NonNullable<typeof result> => Boolean(result))
    .slice(0, 3);
  const discoverySections = [
    {
      id: "nearby",
      title: "Nearby barbers",
      badge: `${Math.min(results.length, 3)} ready now`,
      items: [...results].sort((left, right) => left.distanceMiles - right.distanceMiles).slice(0, 3)
    },
    {
      id: "top-rated",
      title: "Top rated",
      badge: "Trust first",
      items: [...results].sort((left, right) => right.rating - left.rating || right.reviewCount - left.reviewCount).slice(0, 3)
    },
    {
      id: "trending",
      title: "Trending now",
      badge: "Momentum",
      items: [...results].sort((left, right) => ((right.followCount ?? 0) + (right.profileViews ?? 0)) - ((left.followCount ?? 0) + (left.profileViews ?? 0))).slice(0, 3)
    },
    {
      id: "available-next",
      title: "Available today",
      badge: "Fast lane",
      items: [...results].sort((left, right) => new Date(left.nextAvailableAt).getTime() - new Date(right.nextAvailableAt).getTime()).slice(0, 3)
    },
    {
      id: "rising",
      title: "Rising barbers",
      badge: "Early signal",
      items: [...results].filter((result) => result.badges.includes("rising_barber") || (result.rankingLabel ?? "").toLowerCase().includes("growing")).slice(0, 3)
    }
  ].filter((section) => section.items.length);
  const featuredStyles: Array<{ id: string; name: string; regionLabel: string; bookingCount: number; rank: number }> = [];

  return (
    <div className="space-y-4" data-testid="discovery-workspace">
      <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="rounded-[36px] p-6 sm:p-8">
          <p className="surface-label text-[#d7ffab]">BVRB3R Marketplace beta</p>
          <h2 className="mt-4 text-balance text-3xl font-semibold sm:text-5xl" data-display="true">Find the right barber as fast as booking a ride.</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/66">
            Search by barber, shop, service, style, or location. Discovery now reads persisted marketplace signals for proof, conversion, demand, and availability.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[24px] border border-[#7CFF00]/16 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(124,255,0,0.04))] p-4">
              <label className="surface-label mb-3 block">Search the network</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#baff69]" />
                <Input className="pl-11" placeholder="Search barber, shop, service, style, or neighborhood" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-white/50">
                <span className="status-pill text-[#d7ffab]">Nearby barbers</span>
                <span className="status-pill text-white/72">Top rated</span>
                <span className="status-pill text-white/72">Trending styles</span>
                <span className="status-pill text-white/72">Available now</span>
              </div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Signature shortcut</p>
              <p className="mt-3 text-2xl font-semibold" data-display="true">GET A HAIRCUT NOW</p>
              <p className="mt-3 text-sm leading-7 text-white/60">Match order: favorite barber, favorite shop, nearby fit, then the fastest open chair.</p>
              <Button className="mt-4 h-12 w-full" disabled={haircutNowQuery.isLoading} onClick={() => setShowInstantMatch(true)}>
                {haircutNowQuery.isLoading ? "Matching chair..." : "Get a haircut now"}
              </Button>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Public barber pages</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">Live</p>
              <p className="mt-2 text-sm text-white/58">Every visible barber can now share a professional landing page with proof signals.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Discovery results</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">{results.length}</p>
              <p className="mt-2 text-sm text-white/58">Ranked with persisted review, follow, availability, and conversion inputs.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Map markers</p>
              <p className="mt-3 text-3xl font-semibold" data-display="true">{markers.length}</p>
              <p className="mt-2 text-sm text-white/58">Map and list discovery now read from the same marketplace runtime.</p>
            </div>
          </div>
        </Card>

        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Client discovery feed</p>
              <p className="mt-2 text-sm text-white/58">The feed combines nearby talent, style demand, and real marketplace proof.</p>
            </div>
            <Compass className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {featuredStyles.length ? featuredStyles.slice(0, 4).map((style) => (
              <div key={style.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/18 hover:bg-black/30">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{style.name}</p>
                    <p className="mt-1 text-sm text-white/55">Trending in {style.regionLabel}</p>
                  </div>
                  <span className="status-pill text-[#d7ffab]">#{style.rank}</span>
                </div>
                <p className="mt-3 text-sm text-white/68">{style.bookingCount} real bookings powering marketplace demand signals.</p>
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-6 text-white/58">
                No marketplace style demand yet. Trending styles will appear after real bookings create a signal.
              </div>
            )}
          </div>
          <div className="mt-4 rounded-[28px] border border-dashed border-white/10 bg-black/15 p-5 text-sm leading-7 text-white/58">
            Reputation, follow growth, popularity, and conversion are now part of the ranking foundation. Style-image ranking remains intentionally deferred.
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Browse the growth layer</p>
              <p className="mt-2 text-sm text-white/58">Move between richer feed sections, style discovery, and visible ranking surfaces without losing booking speed.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/discover/top" className="status-pill text-white/72">Top in market</Link>
              <Link href="/discover/styles" className="status-pill text-white/72">Styles</Link>
              <Link href="/leaderboards" className="status-pill text-[#d7ffab]">Leaderboards</Link>
            </div>
          </div>
          {favoriteUpdates.length ? (
            <div className="mt-4 rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="surface-label text-[#d7ffab]">Favorite barber updates</p>
                  <p className="mt-2 text-sm text-white/70">Barbers you already follow stay close to the top so repeat usage feels natural.</p>
                </div>
                <span className="status-pill text-[#d7ffab]">For you</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {favoriteUpdates.map((result) => (
                  <Link key={`favorite-${result.barberId}`} href={`/barber/${result.username}` as Route} className="rounded-[22px] border border-white/10 bg-black/25 p-4 transition hover:border-[#7CFF00]/24 hover:bg-black/35">
                    <p className="font-medium">{result.barberName}</p>
                    <p className="mt-2 text-sm text-white/58">{result.shopName ?? "Independent barber"}</p>
                    <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-[#d7ffab]">{dateLabel(result.nextAvailableAt)}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {discoverySections.map((section) => (
              <div key={section.id} className="rounded-[24px] border border-white/8 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{section.title}</p>
                  <span className="status-pill text-[#d7ffab]">{section.badge}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {section.items.map((item) => (
                    <Link key={`${section.id}-${item.barberId}`} href={`/barber/${item.username}` as Route} className="block rounded-[20px] border border-white/8 bg-black/25 px-4 py-4 transition hover:border-[#7CFF00]/18 hover:bg-black/35">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{item.barberName}</p>
                        <span className="text-[11px] uppercase tracking-[0.22em] text-white/42">{item.rating.toFixed(1)}</span>
                      </div>
                      <p className="mt-2 text-sm text-white/58">{item.mostBookedService ?? item.shopName ?? "Marketplace profile"}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Most booked services</p>
              <p className="mt-2 text-sm text-white/58">Service demand is now visible enough to guide client browsing before a search ever starts.</p>
            </div>
            <TrendingUp className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {results.filter((result) => result.mostBookedService).length ? results.filter((result) => result.mostBookedService).slice(0, 4).map((result) => (
              <div key={`service-${result.barberId}`} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/18 hover:bg-black/30">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{result.mostBookedService}</p>
                    <p className="mt-2 text-sm text-white/55">with {result.barberName}</p>
                  </div>
                  <Link href={buildMarketplaceBookingHref({ barberId: result.barberId, username: result.username, locationId: locationId || undefined, sourceKind: "discovery", query: result.mostBookedService })} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                    Book
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-6 text-white/58">
                No booked-service demand yet. Services will appear here after real marketplace listings and bookings exist.
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Refine the search</p>
              <p className="mt-2 text-sm text-white/58">These filters shape the first persisted discovery engine without adding complexity too early.</p>
            </div>
            <WandSparkles className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-3 block surface-label">Location</label>
              <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">Any real location</option>
                {locationOptions.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-3 block surface-label">Style tag</label>
              <Select value={styleTagId} onChange={(event) => setStyleTagId(event.target.value)}>
                <option value="">Any real style</option>
              </Select>
            </div>
            <div>
              <label className="mb-3 block surface-label">Minimum rating</label>
              <Select value={minRating} onChange={(event) => setMinRating(event.target.value)}>
                <option value="">Any rating</option>
                <option value="4.0">4.0+</option>
                <option value="4.5">4.5+</option>
                <option value="4.8">4.8+</option>
              </Select>
            </div>
            <div>
              <label className="mb-3 block surface-label">Availability</label>
              <Select value={availability} onChange={(event) => setAvailability(event.target.value as DiscoveryFilters["availability"])}>
                <option value="any">Any time</option>
                <option value="today">Today</option>
                <option value="now">Available now</option>
              </Select>
            </div>
            <div>
              <label className="mb-3 block surface-label">Max starting price</label>
              <Input inputMode="numeric" placeholder="No price cap" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
            </div>
            <div>
              <label className="mb-3 block surface-label">Max distance (miles)</label>
              <Input inputMode="numeric" value={maxDistanceMiles} onChange={(event) => setMaxDistanceMiles(event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-3 block surface-label">Specialty keyword</label>
              <Input placeholder="precision fades, razor detail, kids cuts" value={specialty} onChange={(event) => setSpecialty(event.target.value)} />
            </div>
          </div>
          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm text-white/62">
            Search supports barber name, shop name, service, style tag, and location text in this first marketplace release.
          </div>
        </Card>

        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Instant match</p>
              <p className="mt-2 text-sm text-white/58">The signature matching engine now records real haircut-now demand and booking intent.</p>
            </div>
            <TimerReset className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {showInstantMatch && instantError ? <FeedbackBanner tone="error" message={instantError} /> : null}
            {!showInstantMatch ? (
              <div className="empty-state-panel rounded-[28px] p-6 text-sm leading-7 text-white/58">
                Trigger GET A HAIRCUT NOW to see the fastest match using favorite barber, favorite shop, nearby fit, and available-now logic.
              </div>
            ) : haircutNowQuery.isLoading ? (
              <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-4 h-10 w-56" />
                <Skeleton className="mt-4 h-16 w-full" />
                <Skeleton className="mt-4 h-11 w-36 rounded-full" />
              </div>
            ) : haircutNowQuery.data ? (
              <div className="rounded-[28px] border border-[#7CFF00]/18 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(10,10,10,0.98))] p-5">
                <span className="status-pill text-[#d7ffab]">{getMatchLabel(haircutNowQuery.data.matchedFrom)}</span>
                <h3 className="mt-4 text-3xl font-semibold" data-display="true">{haircutNowQuery.data.barberName}</h3>
                <p className="mt-3 text-sm leading-7 text-white/72">{haircutNowQuery.data.matchReason}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[22px] border border-white/10 bg-black/25 p-4">
                    <p className="surface-label">Appointment</p>
                    <p className="mt-3 text-sm text-white/76">{dateLabel(haircutNowQuery.data.appointmentTime)}</p>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-black/25 p-4">
                    <p className="surface-label">Starting price</p>
                    <p className="mt-3 text-sm text-white/76">{currency(haircutNowQuery.data.priceFrom)}</p>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-black/25 p-4">
                    <p className="surface-label">Rating</p>
                    <p className="mt-3 text-sm text-white/76">{haircutNowQuery.data.rating.toFixed(1)}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href={`/barber/${haircutNowQuery.data.username}` as Route} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                    View profile
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href={buildMarketplaceBookingHref({ barberId: haircutNowQuery.data.barberId, username: haircutNowQuery.data.username, locationId: haircutNowQuery.data.locationId, sourceKind: "haircut_now", matchedFrom: haircutNowQuery.data.matchedFrom, query: deferredQuery.trim() || undefined })} className="inline-flex items-center gap-2 rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_38px_rgba(124,255,0,0.28)]">
                    Book now
                    <Sparkles className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="empty-state-panel rounded-[28px] p-6 text-sm leading-7 text-white/58">
                No instant-chair match is live for this filter set. Verified barbers with real services and open booking time will appear here.
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Discovery results</p>
              <p className="mt-2 text-sm text-white/58">Client-facing cards now combine trust, pricing, next availability, conversion proof, and ranking context.</p>
            </div>
            <Scissors className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {discoveryError ? <FeedbackBanner tone="error" message={discoveryError} /> : null}
            {discoveryQuery.isLoading && !discoveryQuery.data ? (
              <>
                <DiscoveryCardSkeleton />
                <DiscoveryCardSkeleton />
                <DiscoveryCardSkeleton />
              </>
            ) : results.length ? results.map((result) => (
              <div key={result.barberId} className="rounded-[28px] border border-white/8 bg-black/20 p-5 transition hover:-translate-y-0.5 hover:border-[#7CFF00]/18 hover:bg-black/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-semibold">{result.barberName}</p>
                      {result.badges.slice(0, 2).map((badge) => (
                        <span key={badge} className="status-pill text-[#d7ffab]">{getBadgeLabel(badge)}</span>
                      ))}
                      {result.rankingLabel ? <span className="status-pill text-white/72">{result.rankingLabel}</span> : null}{result.trustLabel ? <span className="status-pill text-[#d7ffab]">{result.trustLabel}</span> : null}{result.featuredLabel ? <span className="status-pill text-[#d7ffab]">{result.featuredLabel}</span> : null}{result.boostedLabel ? <span className="status-pill text-white/72">{result.boostedLabel}</span> : null}{result.cityLabel ? <span className="status-pill text-white/72">{result.cityLabel}</span> : null}
                    </div>
                    <p className="mt-2 text-sm text-white/58">{result.shopName ?? "Independent barber"}</p>
                  </div>
                  <div className="rounded-[22px] border border-white/8 bg-black/25 px-4 py-3 text-right">
                    <p className="surface-label">Next available</p>
                    <p className="mt-2 text-sm text-white/76">{dateLabel(result.nextAvailableAt)}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                    <p className="surface-label">Rating</p>
                    <p className="mt-3 flex items-center gap-2 text-lg font-semibold"><Star className="h-4 w-4 fill-current text-[#d7ffab]" />{result.rating.toFixed(1)} ({result.reviewCount})</p>
                  </div>
                  <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                    <p className="surface-label">Price range</p>
                    <p className="mt-3 text-lg font-semibold">{currency(result.priceRange[0])} - {currency(result.priceRange[1])}</p>
                  </div>
                  <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                    <p className="surface-label">Distance</p>
                    <p className="mt-3 text-lg font-semibold">{result.distanceMiles.toFixed(1)} mi</p>
                  </div>
                  <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                    <p className="surface-label">Most booked</p>
                    <p className="mt-3 text-sm font-medium text-white/76">{result.mostBookedService ?? "Building demand history"}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-[20px] border border-white/8 bg-black/25 px-4 py-3 text-sm text-white/70">
                    <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#baff69]" />{result.followCount ?? 0} followers</div>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/25 px-4 py-3 text-sm text-white/70">
                    <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#baff69]" />Reputation {result.reputationScore?.toFixed(0) ?? "0"}</div>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/25 px-4 py-3 text-sm text-white/70">
                    <div className="flex items-center gap-2"><Compass className="h-4 w-4 text-[#baff69]" />{result.completionRate ?? 0}% reliability</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-white/50">
                  {result.specialties.slice(0, 4).map((specialty) => (
                    <span key={specialty} className="status-pill text-white/72">{specialty}</span>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href={`/barber/${result.username}` as Route} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                    View profile
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href={buildMarketplaceBookingHref({ barberId: result.barberId, username: result.username, locationId: locationId || undefined, sourceKind: "discovery", query: deferredQuery.trim() || undefined })} className="inline-flex items-center gap-2 rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_38px_rgba(124,255,0,0.28)]">
                    Book now
                    <Sparkles className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[28px] p-6 text-sm leading-7 text-white/58">
                No barbers are live on BVRB3R for this filter set. Clear a filter or check back when verified barbers begin accepting bookings.
              </div>
            )}
          </div>
        </Card>

        <DiscoveryMapPanel markers={markers} isLoading={mapQuery.isLoading && !mapQuery.data} error={mapError} />
      </section>
    </div>
  );
}















