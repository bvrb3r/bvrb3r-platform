"use client";

import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Heart, MapPin, ShieldCheck, Star, Store, UsersRound } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { useSaveFavoriteShopMutation } from "@/lib/booking/client";
import { cn } from "@/lib/utils";

type ClientShopCardData = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
  address?: string;
  activeBarbersCount?: number;
  brandLine?: string;
  kind?: string;
  nextAvailableLabel?: string;
  verifiedLabel?: string;
  rating?: number;
  reviewCount?: number;
  viewHref?: string;
  bookHref?: string;
  profilePhotoUrl?: string;
  coverPhotoUrl?: string;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BV";
}

function getLocationLabel(location: ClientShopCardData) {
  return location.address || [location.neighborhood, location.city, location.state].filter(Boolean).join(", ") || "Shop location";
}

function getBarberCountLabel(count: number) {
  if (count <= 0) {
    return "No active barbers yet";
  }

  return `${count} barber${count === 1 ? "" : "s"}`;
}

export function ClientShopDiscoveryCard({
  location,
  layout = "rail",
  canFavorite = false
}: {
  location: ClientShopCardData;
  layout?: "rail" | "grid";
  canFavorite?: boolean;
}) {
  const favoriteMutation = useSaveFavoriteShopMutation();
  const searchHref = (location.viewHref ?? `/shop/${encodeURIComponent(location.id)}`) as Route;
  const primaryCtaHref = (location.bookHref ?? searchHref) as Route;
  const primaryCtaLabel = "Book Next Available";
  const imageUrl = location.coverPhotoUrl ?? location.profilePhotoUrl;
  const ratingLabel = typeof location.rating === "number" ? location.rating.toFixed(1) : "Verified";
  const reviewLabel = typeof location.reviewCount === "number" && location.reviewCount > 0
    ? `${location.reviewCount} review${location.reviewCount === 1 ? "" : "s"}`
    : location.verifiedLabel ?? "Approved shop";
  const barberCount = location.activeBarbersCount ?? 0;
  const brandLine = location.brandLine?.trim() || [location.neighborhood, location.city].filter(Boolean).join(", ") || getLocationLabel(location);
  const saved = favoriteMutation.isSuccess;

  async function handleFavorite() {
    if (!canFavorite) {
      return;
    }

    await favoriteMutation.mutateAsync({ shopReference: location.id });
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(7,7,7,0.99))] shadow-[0_18px_36px_rgba(0,0,0,0.22)]",
        layout === "rail" ? "w-[16.25rem] shrink-0 sm:w-[17rem]" : "w-full"
      )}
      data-testid="compact-shop-card"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`${location.name} preview`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(124,255,0,0.28),rgba(255,255,255,0.08),rgba(8,8,8,0.98))]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.7))]" />
        <span className="absolute left-3 top-3 inline-flex max-w-[72%] items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/90">
          <ShieldCheck className="h-3.5 w-3.5 text-[#d7ffab]" />
          <span className="truncate">{location.verifiedLabel ?? "Verified shop"}</span>
        </span>
        {canFavorite ? (
          <button
            type="button"
            aria-label={`Favorite ${location.name}`}
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/48 text-white transition hover:border-[#d7ffab]/40 hover:text-[#d7ffab] disabled:opacity-60"
            disabled={favoriteMutation.isPending}
            onClick={() => void handleFavorite()}
          >
            <Heart className={cn("h-4 w-4", saved ? "fill-[#d7ffab] text-[#d7ffab]" : "")} />
          </button>
        ) : null}
        <div className="absolute bottom-3 left-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-[16px] border border-white/10 bg-black/30 text-base font-semibold text-[#d7ffab] shadow-[0_12px_26px_rgba(0,0,0,0.24)]">
          {location.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={location.profilePhotoUrl} alt={location.name} className="h-full w-full object-cover" />
          ) : (
            getInitials(location.name)
          )}
        </div>
      </div>

      <div className="p-3.5">
        <Link href={searchHref} className="line-clamp-1 text-lg font-semibold text-white transition hover:text-[#d7ffab]">
          {location.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/58">
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-current text-[#d7ffab]" />
            {ratingLabel} <span className="text-white/40">{reviewLabel}</span>
          </span>
        </div>

        <div className="mt-3 grid gap-2 text-sm text-white/68">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="h-4 w-4 shrink-0 text-[#baff69]" />
            <span className="truncate">{getLocationLabel(location)}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <UsersRound className="h-4 w-4 shrink-0 text-[#d7ffab]" />
            <span>{getBarberCountLabel(barberCount)}</span>
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-white/48">
          <Store className="h-3.5 w-3.5 text-[#d7ffab]" />
          <span className="truncate">{brandLine}</span>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <ClientActionLink href={primaryCtaHref} className="min-h-10 px-4 text-sm">
            {primaryCtaLabel}
          </ClientActionLink>
          <ClientActionLink href={searchHref} variant="outline" className="min-h-10 px-3 text-xs">
            View Shop
            <ArrowRight className="h-3.5 w-3.5 text-[#baff69]" />
          </ClientActionLink>
        </div>
      </div>
    </article>
  );
}
