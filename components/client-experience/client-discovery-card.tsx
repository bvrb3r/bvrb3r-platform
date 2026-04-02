import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, MapPin, ShieldCheck, Sparkles, Star, TrendingUp, Users } from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { MarketplaceTrackedActionLink } from "@/components/client-experience/marketplace-tracked-action-link";
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

function getRetentionLabel(score?: number) {
  if (!score) {
    return "Building repeat traffic";
  }

  if (score >= 90) {
    return "High rebooking pull";
  }

  if (score >= 55) {
    return "Strong repeat demand";
  }

  return "Growing repeat demand";
}

function getActivityLabel(score?: number) {
  if (!score) {
    return "Fresh profile activity";
  }

  if (score >= 120) {
    return "High marketplace momentum";
  }

  if (score >= 65) {
    return "Strong booking activity";
  }

  return "Active in discovery";
}

export function ClientDiscoveryCard({
  result,
  layout = "stacked"
}: {
  result: DiscoveryResult;
  layout?: "stacked" | "list";
}) {
  const [start, end] = getAccent(result.username);
  const initials = getInitials(result.barberName);
  const bookHref: Route = (result.bookingHref as Route | undefined) ??
    buildMarketplaceBookingHref({
      barberId: result.barberId,
      username: result.username,
      locationId: result.locationId,
      serviceId: result.mostBookedServiceId,
      sourceKind: "discovery",
      query: result.mostBookedService ?? undefined
    });
  const profileHref = `/barber/${result.username}` as Route;
  const titleBadge = result.rankingLabel ?? result.trustLabel ?? result.featuredLabel ?? result.cityLabel ?? "Trusted nearby";
  const descriptor = result.specialties[0] ?? result.mostBookedService ?? "Local favorite";
  const heroImage = result.galleryPreviewUrls?.[0] ?? result.profilePhotoUrl;
  const galleryPreview = (result.galleryPreviewUrls ?? []).slice(heroImage === result.galleryPreviewUrls?.[0] ? 1 : 0, 3);

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.99))] shadow-[0_24px_46px_rgba(0,0,0,0.22)]",
        layout === "stacked" ? "w-[18.5rem] shrink-0" : "w-full"
      )}
    >
      <div className={cn(layout === "stacked" ? "" : "md:grid md:grid-cols-[12.5rem_minmax(0,1fr)]")}>
        <div className={cn("relative overflow-hidden", layout === "stacked" ? "h-48" : "h-52 md:h-full")}>
          {heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImage}
              alt={`${result.barberName} discovery preview`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(145deg, ${start}, ${end})` }}
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12),rgba(0,0,0,0.74))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_55%)]" />
          <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/88">
            <ShieldCheck className="h-3.5 w-3.5" />
            {titleBadge}
          </div>
          <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] font-semibold text-white/92">
            <Star className="h-3.5 w-3.5 fill-current" />
            {result.rating.toFixed(1)}
          </div>
          <div className="absolute bottom-5 left-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] border border-white/10 bg-black/24 text-2xl font-semibold text-white/92 shadow-[0_18px_34px_rgba(0,0,0,0.24)]">
            {result.profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.profilePhotoUrl}
                alt={result.barberName}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="absolute bottom-5 right-4 flex items-end gap-2">
            {galleryPreview.length ? galleryPreview.map((imageUrl, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${result.barberId}-gallery-${index}`}
                src={imageUrl}
                alt={`${result.barberName} gallery ${index + 1}`}
                className="h-14 w-14 rounded-[18px] border border-white/10 object-cover shadow-[0_12px_28px_rgba(0,0,0,0.22)]"
              />
            )) : null}
            <div className="rounded-[18px] border border-white/10 bg-black/35 px-3 py-2 text-right text-[11px] uppercase tracking-[0.16em] text-white/72">
              <p>Known for</p>
              <p className="mt-1 text-sm font-semibold normal-case tracking-normal text-white">{descriptor}</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={profileHref} className="block line-clamp-2-safe text-xl font-semibold text-white transition hover:text-[#d7ffab]">
                {result.barberName}
              </Link>
              <p className="mt-1 line-clamp-2-safe text-sm text-white/58">{result.shopName ?? "Independent barber"}</p>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-black/22 px-3 py-2 text-right shadow-[0_12px_26px_rgba(0,0,0,0.18)]">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/46">Price range</p>
              <p className="mt-1 text-sm font-semibold text-white">{result.priceRangeLabel ?? `$${result.priceRange[0]} - $${result.priceRange[1]}`}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/72">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/18 px-3 py-2">
              <MapPin className="h-4 w-4 text-[#baff69]" />
              {result.locationLabel ?? `${result.distanceMiles.toFixed(1)} mi away`}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/18 px-3 py-2">
              <Clock3 className="h-4 w-4 text-[#d7ffab]" />
              {result.availabilityLabel ?? "Next available"}
            </span>
          </div>

          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/18 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/44">Why clients book here</p>
              <p className="mt-3 line-clamp-3-safe text-sm leading-6 text-white/74">
                {result.reviewCount} reviews, {result.rating.toFixed(1)} stars, and {getRetentionLabel(result.retentionScore).toLowerCase()} backed by {getActivityLabel(result.activityScore).toLowerCase()}.
              </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-xs text-white/72">
                <div className="inline-flex items-center gap-2 text-white/92">
                  <Users className="h-3.5 w-3.5 text-[#baff69]" />
                  {result.reviewCount} reviews
                </div>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-xs text-white/72">
                <div className="inline-flex items-center gap-2 text-white/92">
                  <Sparkles className="h-3.5 w-3.5 text-[#d7ffab]" />
                  {getRetentionLabel(result.retentionScore)}
                </div>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-xs text-white/72">
                <div className="inline-flex items-center gap-2 text-white/92">
                  <TrendingUp className="h-3.5 w-3.5 text-[#baff69]" />
                  {getActivityLabel(result.activityScore)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-white/56">
            {result.specialties.slice(0, 2).map((specialty) => (
              <span key={specialty} className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-white/78">
                {specialty}
              </span>
            ))}
            {result.reputationTier ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8ff9f]/18 bg-[#d8ff9f]/10 px-3 py-2 text-[#e8ffc2]">
                <Sparkles className="h-3.5 w-3.5" />
                {result.reputationTier}
              </span>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <MarketplaceTrackedActionLink
              href={bookHref}
              analytics={{
                eventType: "booking_cta_clicked",
                barberId: result.barberId,
                username: result.username,
                locationId: result.locationId,
                sourceKind: "discovery",
                sourceReference: layout,
                metadata: {
                  rating: result.rating,
                  reviewCount: result.reviewCount,
                  retentionScore: result.retentionScore ?? 0,
                  activityScore: result.activityScore ?? 0
                }
              }}
            >
              Book now
            </MarketplaceTrackedActionLink>
            <ClientActionLink href={profileHref} variant="secondary">
              View profile
              <ArrowRight className="h-4 w-4 text-[#baff69]" />
            </ClientActionLink>
          </div>
        </div>
      </div>
    </article>
  );
}
