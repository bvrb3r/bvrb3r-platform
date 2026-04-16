import type { Route } from "next";
import { ArrowRight, Clock3, MapPin, ShieldCheck, Star } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { MarketplaceTrackedActionLink } from "@/components/client-experience/marketplace-tracked-action-link";

type MatchPreview = {
  accent: string;
  barberId: string;
  barberName: string;
  bookHref: Route;
  distanceLabel: string;
  headline: string;
  locationId: string;
  nextSlotLabel: string;
  profileHref?: Route;
  rating: number;
  shopName: string;
  username?: string;
  waitLabel: string;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function NextAvailableChairCard({
  fallbackHref,
  match
}: {
  fallbackHref: Route;
  match: MatchPreview | null;
}) {
  if (!match) {
    return (
      <article className="relative overflow-hidden rounded-[34px] border border-[#d9ff9e]/18 bg-[linear-gradient(180deg,rgba(22,28,14,0.96),rgba(8,8,8,0.99))] p-5 shadow-[0_28px_60px_rgba(0,0,0,0.28)] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,255,0,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_24%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#efffd4]">Need a Cut Right Now?</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold text-white sm:text-4xl" data-display="true">
                No Instant Chair Yet
              </h2>
            </div>
            <span className="rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-3 py-2 text-[11px] font-semibold text-[#efffd4]">
              Pre-open
            </span>
          </div>

          <div className="mt-5 rounded-[28px] border border-white/10 bg-black/18 p-4 sm:p-5">
            <p className="text-sm leading-7 text-white/76">
              No barbers are live on BVRB3R in this area yet. When a verified barber has real services and open booking time, the fastest chair will appear here.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ClientActionLink href={fallbackHref} size="lg" className="min-w-[12rem]">
                Refresh Discovery
                <ArrowRight className="h-4 w-4" />
              </ClientActionLink>
            </div>
          </div>
        </div>
      </article>
    );
  }

  const initials = getInitials(match.barberName);

  return (
    <article className="relative overflow-hidden rounded-[34px] border border-[#d9ff9e]/18 bg-[linear-gradient(180deg,rgba(22,28,14,0.96),rgba(8,8,8,0.99))] p-5 shadow-[0_28px_60px_rgba(0,0,0,0.28)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,255,0,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_24%)]" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#efffd4]">Need a Cut Right Now?</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold text-white sm:text-4xl" data-display="true">
              Next Available Chair
            </h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-3 py-2 text-[11px] font-semibold text-[#efffd4]">
            <ShieldCheck className="h-4 w-4" />
            Fastest local match
          </span>
        </div>

        <div className="mt-5 rounded-[28px] border border-white/10 bg-black/18 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="flex min-w-0 gap-4">
              <div
                className="relative flex h-24 w-24 shrink-0 items-end overflow-hidden rounded-[28px] border border-white/10 shadow-[0_18px_34px_rgba(0,0,0,0.18)]"
                style={{ background: `linear-gradient(145deg, ${match.accent}, rgba(255,255,255,0.18), rgba(8,8,8,0.96))` }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),transparent_58%)]" />
                <div className="relative m-3 flex h-12 w-12 items-center justify-center rounded-[16px] border border-black/10 bg-black/12 text-lg font-semibold text-black/84">
                  {initials}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold text-white sm:text-[2rem]" data-display="true">{match.barberName}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-sm text-white/78">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                    <Star className="h-4 w-4 fill-current text-[#d7ffab]" />
                    {match.rating.toFixed(1)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                    <MapPin className="h-4 w-4 text-[#baff69]" />
                    {match.shopName} • {match.distanceLabel}
                  </span>
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-white/74">{match.headline}</p>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(8,8,8,0.2))] p-4 lg:min-w-[14rem]">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#d7ffab]">Next Slot</p>
              <p className="mt-3 text-2xl font-semibold text-white">{match.nextSlotLabel}</p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-white/72">
                <Clock3 className="h-4 w-4 text-[#d7ffab]" />
                {match.waitLabel}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <MarketplaceTrackedActionLink
              href={match.bookHref}
              size="lg"
              className="min-w-[12rem]"
              analytics={{
                eventType: "booking_cta_clicked",
                barberId: match.barberId,
                username: match.username,
                locationId: match.locationId,
                sourceKind: "haircut_now",
                sourceReference: match.waitLabel,
                metadata: {
                  matchHeadline: match.headline,
                  nextSlotLabel: match.nextSlotLabel
                }
              }}
            >
              Book This Chair
              <ArrowRight className="h-4 w-4" />
            </MarketplaceTrackedActionLink>
            {match.profileHref ? (
              <ClientActionLink href={match.profileHref} size="lg" variant="outline">
                Open Profile
              </ClientActionLink>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
