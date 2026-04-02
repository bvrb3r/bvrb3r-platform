import type { Route } from "next";
import { ArrowRight, HeartHandshake, MapPin, Star } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { MarketplaceTrackedActionLink } from "@/components/client-experience/marketplace-tracked-action-link";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ClientFavoriteBarberCard({
  barberId,
  name,
  rating,
  locationLabel,
  headline,
  specialties,
  profileHref,
  bookHref,
  username
}: {
  barberId: string;
  name: string;
  rating: number;
  locationLabel: string;
  headline: string;
  specialties: string[];
  profileHref: Route;
  bookHref: Route;
  username?: string;
}) {
  const initials = getInitials(name);

  return (
    <article className="relative overflow-hidden rounded-[34px] border border-[#d9ff9e]/18 bg-[linear-gradient(180deg,rgba(19,24,12,0.96),rgba(8,8,8,0.99))] shadow-[0_28px_56px_rgba(0,0,0,0.24)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,255,0,0.14),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_28%)]" />
      <div className="relative grid gap-0 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="relative min-h-[14rem] overflow-hidden border-b border-white/8 bg-[linear-gradient(145deg,rgba(163,255,69,0.42),rgba(255,255,255,0.12),rgba(8,8,8,0.98))] lg:border-b-0 lg:border-r">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),transparent_56%)]" />
          <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/82">
            <HeartHandshake className="h-3.5 w-3.5" />
            Your barber
          </div>
          <div className="absolute bottom-5 left-5 flex h-24 w-24 items-center justify-center rounded-[28px] border border-black/10 bg-black/12 text-3xl font-semibold text-black/82 shadow-[0_20px_40px_rgba(0,0,0,0.18)]">
            {initials}
          </div>
          <div className="absolute bottom-5 right-5 rounded-[22px] border border-black/10 bg-black/12 px-4 py-3 text-right text-[11px] uppercase tracking-[0.16em] text-black/74">
            <p>Loyalty anchor</p>
            <p className="mt-1 text-sm font-semibold normal-case tracking-normal text-black/86">Repeat booking made easy</p>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <p className="text-[10px] uppercase tracking-[0.24em] text-[#d7ffab]">Favorite barber</p>
              <h3 className="mt-3 text-balance text-3xl font-semibold text-white sm:text-4xl" data-display="true">
                {name}
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/78">
                Your go-to chair stays first so booking with someone familiar feels fast, trusted, and personal.
              </p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-black/25 px-4 py-3 text-right shadow-[0_14px_30px_rgba(0,0,0,0.18)]">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/48">Rating</p>
              <p className="mt-2 flex items-center gap-1.5 text-base font-semibold text-white">
                <Star className="h-4 w-4 fill-current text-[#d7ffab]" />
                {rating.toFixed(1)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="rounded-[24px] border border-white/8 bg-black/18 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/46">Why clients keep coming back</p>
              <p className="mt-3 text-sm leading-7 text-white/74">{headline}</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/18 px-3 py-2 text-sm text-white/72">
              <MapPin className="h-4 w-4 text-[#baff69]" />
              {locationLabel}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-white/58">
            {specialties.slice(0, 3).map((specialty) => (
              <span key={specialty} className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-white/80">
                {specialty}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <MarketplaceTrackedActionLink
              href={bookHref}
              size="lg"
              analytics={{
                eventType: "booking_cta_clicked",
                barberId,
                username,
                sourceKind: "client_dashboard",
                sourceReference: "favorite_barber"
              }}
            >
              Book now
              <ArrowRight className="h-4 w-4" />
            </MarketplaceTrackedActionLink>
            <ClientActionLink href={profileHref} variant="secondary" size="lg">
              View profile
            </ClientActionLink>
          </div>
        </div>
      </div>
    </article>
  );
}
