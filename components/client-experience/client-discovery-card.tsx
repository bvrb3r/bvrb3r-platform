"use client";

import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Heart, MapPin, Scissors, ShieldCheck, Star } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { MarketplaceTrackedActionLink } from "@/components/client-experience/marketplace-tracked-action-link";
import { useSaveFavoriteBarberMutation } from "@/lib/booking/client";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { cn } from "@/lib/utils";
import type { DiscoveryResult } from "@/types/domain";

const accents = [
  ["#7cff00", "#d7ffab"],
  ["#b7ff58", "#efffd5"],
  ["#8eff47", "#d9ffb8"],
  ["#caff6b", "#f4ffd1"]
] as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getAccent(username: string) {
  const hash = username.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return accents[hash % accents.length];
}

function getVerifiedLabel(result: DiscoveryResult) {
  if (result.badges.some((badge) => badge.startsWith("verified_"))) {
    return "Verified";
  }

  return result.trustLabel ?? null;
}

function getLocationLabel(result: DiscoveryResult) {
  return result.cityLabel ?? result.locationLabel ?? `${result.distanceMiles.toFixed(1)} mi away`;
}

function getServiceLine(result: DiscoveryResult) {
  const services = [
    result.mostBookedService,
    ...result.specialties
  ].filter((value, index, values): value is string => Boolean(value?.trim()) && values.indexOf(value) === index);

  return services.slice(0, 2).join(" + ") || "Bookable services";
}

export function ClientDiscoveryCard({
  result,
  layout = "rail",
  canFavorite = false
}: {
  result: DiscoveryResult;
  layout?: "rail" | "grid" | "stacked" | "list";
  canFavorite?: boolean;
}) {
  const [start, end] = getAccent(result.username);
  const initials = getInitials(result.barberName);
  const favoriteMutation = useSaveFavoriteBarberMutation();
  const saved = favoriteMutation.isSuccess;
  const bookHref: Route = buildMarketplaceBookingHref({
    barberId: result.barberId,
    username: result.username,
    locationId: result.locationId,
    sourceKind: "discovery",
    query: result.mostBookedService ?? undefined
  });
  const profileHref = `/barber/${result.username}` as Route;
  const heroImage = result.galleryPreviewUrls?.[0] ?? result.profilePhotoUrl;
  const ratingLabel = result.reviewCount > 0 ? result.rating.toFixed(1) : "New";
  const reviewLabel = result.reviewCount > 0
    ? `${result.reviewCount} review${result.reviewCount === 1 ? "" : "s"}`
    : "New barber";
  const verifiedLabel = getVerifiedLabel(result);
  const priceLabel = result.priceRangeLabel ?? `$${result.priceRange[0]} - $${result.priceRange[1]}`;
  const isRail = layout === "rail" || layout === "stacked";

  async function handleFavorite() {
    if (!canFavorite) {
      return;
    }

    await favoriteMutation.mutateAsync({ barberReference: result.barberId });
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(7,7,7,0.99))] shadow-[0_18px_36px_rgba(0,0,0,0.22)]",
        isRail ? "w-[16.25rem] shrink-0 sm:w-[17rem]" : "w-full"
      )}
      data-testid="compact-barber-card"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt={`${result.barberName} preview`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(145deg, ${start}, ${end})` }}
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.68))]" />
        <span className="absolute left-3 top-3 inline-flex max-w-[72%] items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/90">
          <Clock3 className="h-3.5 w-3.5 text-[#d7ffab]" />
          <span className="truncate">{result.availabilityLabel ?? "Book appointment"}</span>
        </span>
        {canFavorite ? (
          <button
            type="button"
            aria-label={`Favorite ${result.barberName}`}
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/48 text-white transition hover:border-[#d7ffab]/40 hover:text-[#d7ffab] disabled:opacity-60"
            disabled={favoriteMutation.isPending}
            onClick={() => void handleFavorite()}
          >
            <Heart className={cn("h-4 w-4", saved ? "fill-[#d7ffab] text-[#d7ffab]" : "")} />
          </button>
        ) : null}
        <div className="absolute bottom-3 left-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-[16px] border border-white/10 bg-black/30 text-base font-semibold text-white shadow-[0_12px_26px_rgba(0,0,0,0.24)]">
          {result.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.profilePhotoUrl} alt={result.barberName} className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={profileHref} className="line-clamp-1 text-lg font-semibold text-white transition hover:text-[#d7ffab]">
              {result.barberName}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/58">
              {verifiedLabel ? (
                <span className="inline-flex items-center gap-1 text-[#d7ffab]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {verifiedLabel}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-current text-[#d7ffab]" />
                {ratingLabel} <span className="text-white/40">{reviewLabel}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 text-sm text-white/68">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="h-4 w-4 shrink-0 text-[#baff69]" />
            <span className="truncate">{getLocationLabel(result)}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Scissors className="h-4 w-4 shrink-0 text-[#d7ffab]" />
            <span className="truncate">{getServiceLine(result)}</span>
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-white">{priceLabel}</span>
          <span className="text-xs text-white/48">{result.shopName ?? "Independent"}</span>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <MarketplaceTrackedActionLink
            href={bookHref}
            className="min-h-10 px-4 text-sm"
            analytics={{
              eventType: "booking_cta_clicked",
              barberId: result.barberId,
              username: result.username,
              locationId: result.locationId,
              sourceKind: "discovery",
              sourceReference: isRail ? "home_recommended_barbers" : "search_barbers_near_you",
              metadata: {
                rating: result.rating,
                reviewCount: result.reviewCount
              }
            }}
          >
            Book
          </MarketplaceTrackedActionLink>
          <ClientActionLink href={profileHref} variant="outline" className="min-h-10 px-3 text-xs">
            View Profile
            <ArrowRight className="h-3.5 w-3.5 text-[#baff69]" />
          </ClientActionLink>
        </div>
      </div>
    </article>
  );
}
