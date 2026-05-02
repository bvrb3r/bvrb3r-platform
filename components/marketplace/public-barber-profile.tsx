import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, Clock3, CreditCard, MapPin, ShieldCheck, Star } from "lucide-react";
import { MarketplaceTrackedActionLink } from "@/components/client-experience/marketplace-tracked-action-link";
import { PublicBarberGrowthActions } from "@/components/marketplace/public-barber-growth-actions";
import { Card } from "@/components/ui/card";
import { currency, dateLabel } from "@/lib/utils";
import type { PublicBarberProfileView } from "@/lib/marketplace/engine";

function getBadgeLabel(badge: string) {
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

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getPolicyNotes(profile: PublicBarberProfileView) {
  const deposits = profile.services
    .map((item) => item.service.deposit)
    .filter((amount) => amount > 0);
  const requiresCardOnFile = profile.services.some((item) => item.service.deposit > 0 || item.service.fullPrepay);

  return [
    deposits.length ? `Deposits apply to select services starting at ${currency(Math.min(...deposits))}.` : null,
    requiresCardOnFile ? "Card on file is required when the selected service policy needs it." : null
  ].filter(Boolean) as string[];
}

export function PublicBarberProfile({
  profile,
  viewerCanFollow = false,
  viewerCanReport = false
}: {
  profile: PublicBarberProfileView;
  viewerCanFollow?: boolean;
  viewerCanReport?: boolean;
}) {
  const initials = getInitials(profile.barber.name);
  const reviewCount = profile.proof?.reviewCount ?? profile.reviews.length;
  const reviewScore = profile.proof?.reviewScore ?? profile.barber.rating;
  const verificationBadges = [
    ...profile.profile.badges.map(getBadgeLabel),
    ...(profile.proof?.verificationLabels ?? [])
  ].slice(0, 6);
  const serviceLocations = profile.shopLocations.length
    ? profile.shopLocations.map((location) => `${location.name} • ${location.neighborhood}`).join(" | ")
    : profile.shop?.name ?? "Independent barber";
  const policyNotes = getPolicyNotes(profile);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card id="barber-profile-services" className="rounded-[36px] scroll-mt-6 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {profile.profile.profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.profile.profilePhotoUrl}
                alt={profile.barber.name}
                className="h-24 w-24 rounded-[28px] border border-white/10 object-cover shadow-[0_20px_42px_rgba(124,255,0,0.14)] sm:h-32 sm:w-32 sm:rounded-[32px]"
              />
            ) : (
              <div
                className="flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/10 text-3xl font-semibold text-black shadow-[0_20px_42px_rgba(124,255,0,0.14)] sm:h-32 sm:w-32 sm:rounded-[32px] sm:text-4xl"
                style={{ background: `linear-gradient(135deg, ${profile.profile.photoAccent}, #f4ffd1)` }}
              >
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="surface-label text-[#d7ffab]">Barber profile</p>
                {verificationBadges.map((badge) => (
                  <span key={badge} className="status-pill text-[#d7ffab]">{badge}</span>
                ))}
              </div>
              <h1 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">{profile.barber.name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/66">{profile.profile.headline}</p>
              <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-white/58">
                {profile.profile.specialties.slice(0, 4).map((specialty) => (
                  <span key={specialty} className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-white/78">
                    {specialty}
                  </span>
                ))}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Review score</p>
                  <p className="mt-3 text-2xl font-semibold">{reviewScore.toFixed(1)}</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Reviews</p>
                  <p className="mt-3 text-2xl font-semibold">{reviewCount}</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Starting price</p>
                  <p className="mt-3 text-2xl font-semibold">{currency(profile.priceRange[0])}</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Next available</p>
                  <p className="mt-3 text-lg font-semibold">{dateLabel(profile.nextAvailableAt)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-white/8 bg-black/20 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="surface-label">Book with confidence</p>
                <div className="mt-3 space-y-2 text-sm leading-7 text-white/68">
                  <p className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#baff69]" />{serviceLocations}</p>
                  <p className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#d7ffab]" />Next opening {dateLabel(profile.nextAvailableAt)}</p>
                  <p className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#d7ffab]" />Only real approved marketplace supply appears here.</p>
                </div>
              </div>
              <div className="grid w-full gap-3 sm:w-auto">
                <MarketplaceTrackedActionLink
                  href={(profile.bookingCtaHref ?? "/booking/new") as Route}
                  className="h-12 px-6"
                  analytics={{
                    eventType: "booking_cta_clicked",
                    barberId: profile.barber.id,
                    username: profile.profile.username,
                    locationId: profile.shopLocations[0]?.id,
                    sourceKind: "public_profile",
                    sourceReference: "hero_cta",
                    metadata: {
                      reviewCount,
                      rating: reviewScore
                    }
                  }}
                >
                  Book this barber
                </MarketplaceTrackedActionLink>
                <Link href={(profile.bookingCtaHref ?? `/booking/new?barberId=${profile.barber.id}&locationId=${profile.shopLocations[0]?.id ?? ""}`) as Route} className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-black/25 px-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                  View booking flow
                </Link>
              </div>
            </div>
            <div className="mt-5">
              <PublicBarberGrowthActions
                barberId={profile.barber.id}
                username={profile.profile.username}
                canFollow={viewerCanFollow}
                canReport={viewerCanReport}
                initialFollowerCount={profile.proof?.followCount ?? 0}
              />
            </div>
          </div>
        </Card>

        <Card id="barber-profile-reviews" className="rounded-[36px] scroll-mt-6 p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Service menu</p>
              <p className="mt-2 text-sm text-white/58">Pricing, duration, and booking rules all come from the shared service system.</p>
            </div>
            <Clock3 className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {profile.services.length ? profile.services.map((item) => (
              <div key={item.service.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">{item.service.name}</p>
                    <p className="mt-2 text-sm text-white/62">{item.service.description}</p>
                  </div>
                  <span className="status-pill text-[#d7ffab]">{currency(item.service.price)}</span>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-white/68 sm:grid-cols-3">
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">{item.service.durationMin} min</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">
                    {item.service.deposit > 0 ? `Deposit ${currency(item.service.deposit)}` : "No deposit"}
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">
                    {item.service.fullPrepay ? "Prepay required" : "Card-on-file supported"}
                  </div>
                </div>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/55">
                No services are live on this barber profile yet.
              </div>
            )}
          </div>

          {policyNotes.length ? (
            <div className="mt-5 rounded-[28px] border border-white/8 bg-black/20 p-5">
              <div className="flex items-center gap-2 text-[#d7ffab]">
                <CreditCard className="h-4 w-4" />
                <p className="surface-label">Booking policies</p>
              </div>
              <div className="mt-4 space-y-3 text-sm leading-7 text-white/68">
                {policyNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        {profile.portfolio.length ? (
          <Card className="rounded-[36px] p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="surface-label">Portfolio</p>
                <p className="mt-2 text-sm text-white/58">Recent work from the real barber profile and shop gallery.</p>
              </div>
              <span className="status-pill text-white/72">{profile.portfolio.length} images</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {profile.portfolio.map((asset) => (
                <div key={asset.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  {asset.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.imageUrl}
                      alt={asset.caption || profile.barber.name}
                      className="h-40 w-full rounded-[20px] border border-white/8 object-cover"
                    />
                  ) : null}
                  <p className="mt-4 text-sm leading-7 text-white/68">{asset.caption || "Recent work from this barber."}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="rounded-[36px] p-6 sm:p-8">
            <p className="surface-label">Portfolio</p>
            <p className="mt-3 text-lg font-semibold text-white">No portfolio images yet.</p>
            <p className="mt-3 text-sm leading-7 text-white/62">
              This barber profile is live, but gallery images have not been added yet.
            </p>
          </Card>
        )}

        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Review summary</p>
              <p className="mt-2 text-sm text-white/58">Real review history only. No placeholder testimonials.</p>
            </div>
            <div className="inline-flex items-center gap-2 text-[#d7ffab]">
              <Star className="h-4 w-4 fill-current" />
              <span className="text-sm font-semibold text-white">{reviewScore.toFixed(1)}</span>
            </div>
          </div>
          {profile.reviews.length ? (
            <div className="mt-4 space-y-3">
              {profile.reviews.slice(0, 4).map((review) => (
                <div key={review.id} className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[#d7ffab]">
                      <Star className="h-4 w-4 fill-current" />
                      {review.rating.toFixed(1)}
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/38">{review.createdAt}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-white/68">{review.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-black/18 p-5 text-sm leading-7 text-white/58">
              Reviews will appear here after completed appointments generate real client feedback.
            </div>
          )}
          <div className="mt-5">
            <MarketplaceTrackedActionLink
              href={(profile.bookingCtaHref ?? "/booking/new") as Route}
              className="h-12 px-6"
              analytics={{
                eventType: "booking_cta_clicked",
                barberId: profile.barber.id,
                username: profile.profile.username,
                locationId: profile.shopLocations[0]?.id,
                sourceKind: "public_profile",
                sourceReference: "reviews_cta",
                metadata: {
                  reviewCount,
                  rating: reviewScore
                }
              }}
            >
              Book with {profile.barber.name.split(" ")[0]}
            </MarketplaceTrackedActionLink>
          </div>
        </Card>
      </section>
    </div>
  );
}
