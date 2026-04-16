import type { Route } from "next";
import { ArrowRight, Clock3, Compass, MapPin, Store } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";

type ClientShopCardData = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
  address?: string;
  hours?: string;
  chairs?: number;
  brandLine?: string;
  kind?: string;
};

function getDescriptor(location: ClientShopCardData) {
  if (typeof location.chairs === "number" && location.chairs >= 8) {
    return "High-demand destination";
  }

  if (location.kind === "mobile") {
    return "Mobile grooming base";
  }

  return location.brandLine ?? "Trusted local studio";
}

function getHoursLabel(location: ClientShopCardData) {
  return location.hours ?? "Accepting bookings";
}

export function ClientShopDiscoveryCard({ location }: { location: ClientShopCardData; }) {
  const descriptor = getDescriptor(location);
  const searchHref = `/search?q=${encodeURIComponent(location.name)}` as Route;

  return (
    <article className="relative w-[18.5rem] shrink-0 overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] shadow-[0_24px_48px_rgba(0,0,0,0.22)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,255,0,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_25%)]" />
      <div className="relative h-44 overflow-hidden bg-[linear-gradient(145deg,rgba(124,255,0,0.26),rgba(255,255,255,0.08),rgba(8,8,8,0.96))]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.24),transparent_55%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.28))]" />
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/82">
          <Compass className="h-3.5 w-3.5" />
          {descriptor}
        </div>
        <div className="absolute right-4 top-4 rounded-full border border-black/10 bg-black/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/82">
          {typeof location.chairs === "number" ? `${location.chairs} chairs` : "Trusted shop"}
        </div>
        <div className="absolute bottom-5 left-4 flex h-16 w-16 items-center justify-center rounded-[22px] border border-black/10 bg-black/12 text-black/84 shadow-[0_18px_34px_rgba(0,0,0,0.18)]">
          <Store className="h-8 w-8" />
        </div>
        <div className="absolute bottom-5 right-4 rounded-[18px] border border-black/10 bg-black/12 px-3 py-2 text-right text-[11px] uppercase tracking-[0.16em] text-black/74">
          <p>{location.neighborhood}</p>
          <p className="mt-1 text-sm font-semibold normal-case tracking-normal text-black/84">{location.city}</p>
        </div>
      </div>

      <div className="relative p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-semibold text-white">{location.name}</p>
            <p className="mt-1 text-sm text-white/58">{descriptor}</p>
          </div>
          <span className="rounded-[18px] border border-white/8 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/62">
            {location.kind === "mobile" ? "Mobile" : "Live shop"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/72">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/18 px-3 py-2">
            <MapPin className="h-4 w-4 text-[#baff69]" />
            {location.neighborhood}, {location.state}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/18 px-3 py-2">
            <Clock3 className="h-4 w-4 text-[#d7ffab]" />
            {getHoursLabel(location)}
          </span>
        </div>

        <div className="mt-4 rounded-[22px] border border-white/8 bg-black/18 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/44">Why this shop stands out</p>
          <p className="mt-3 text-sm leading-6 text-white/74">
            {location.address
              ? `${location.address} with a clean path into barber selection and booking.`
              : "An active shop with visible, bookable barbers and a clean path into booking."}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <ClientActionLink href={searchHref} variant="secondary">
            Browse
          </ClientActionLink>
          <ClientActionLink href={searchHref} variant="outline">
            View shop
            <ArrowRight className="h-4 w-4 text-[#baff69]" />
          </ClientActionLink>
        </div>
      </div>
    </article>
  );
}
