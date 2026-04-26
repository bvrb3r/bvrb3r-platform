import type { Route } from "next";
import { ArrowRight, Clock3, MapPin, ShieldCheck, Star, Store } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";

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
};

function getSubhead(location: ClientShopCardData) {
  if (location.brandLine) {
    return location.brandLine;
  }

  if (location.kind === "mobile") {
    return "Mobile grooming setup";
  }

  return "Trusted booking location";
}

export function ClientShopDiscoveryCard({ location }: { location: ClientShopCardData; }) {
  const searchHref = (location.viewHref
    ?? `/dashboard/client/search?type=shops&q=${encodeURIComponent(location.name)}&locationId=${encodeURIComponent(location.id)}`) as Route;
  const primaryCtaHref = (location.bookHref ?? searchHref) as Route;
  const primaryCtaLabel = location.bookHref ? "Book" : "View Barbers";

  return (
    <article className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] shadow-[0_22px_44px_rgba(0,0,0,0.2)]">
      <div className="relative h-44 overflow-hidden bg-[linear-gradient(145deg,rgba(124,255,0,0.22),rgba(255,255,255,0.08),rgba(8,8,8,0.96))]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.7))]" />
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/88">
          {location.verifiedLabel ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5 text-[#baff69]" />
              {location.verifiedLabel}
            </>
          ) : (
            <>
              <Store className="h-3.5 w-3.5 text-[#d7ffab]" />
              Barber shop
            </>
          )}
        </div>
        {typeof location.activeBarbersCount === "number" ? (
          <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/88">
            {location.activeBarbersCount} barber{location.activeBarbersCount === 1 ? "" : "s"}
          </div>
        ) : null}
        <div className="absolute bottom-4 left-4 flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-black/28 text-white shadow-[0_16px_30px_rgba(0,0,0,0.24)]">
          <Store className="h-7 w-7 text-[#d7ffab]" />
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-semibold text-white">{location.name}</p>
            <p className="mt-1 text-sm text-white/58">{getSubhead(location)}</p>
          </div>
          {typeof location.rating === "number" ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/88">
              <Star className="h-3.5 w-3.5 fill-current text-[#d7ffab]" />
              {location.rating.toFixed(1)}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/72">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/18 px-3 py-2">
            <MapPin className="h-4 w-4 text-[#baff69]" />
            {location.address ?? `${location.neighborhood}, ${location.city}, ${location.state}`}
          </span>
          {location.nextAvailableLabel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/18 px-3 py-2">
              <Clock3 className="h-4 w-4 text-[#d7ffab]" />
              {location.nextAvailableLabel}
            </span>
          ) : null}
          {typeof location.reviewCount === "number" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/18 px-3 py-2">
              <Star className="h-4 w-4 text-[#d7ffab]" />
              {location.reviewCount} review{location.reviewCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <div className="mt-5 flex gap-3">
          <ClientActionLink href={primaryCtaHref} variant="secondary" className="flex-1">
            {primaryCtaLabel}
          </ClientActionLink>
          <ClientActionLink href={searchHref} variant="outline">
            View Shop
            <ArrowRight className="h-4 w-4 text-[#baff69]" />
          </ClientActionLink>
        </div>
      </div>
    </article>
  );
}
