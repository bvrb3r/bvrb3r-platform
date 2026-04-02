import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CalendarDays, MapPinned, ShieldCheck, Sparkles, Star, Store, TrendingUp, Users, WandSparkles } from "lucide-react";
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

export function PublicBarberProfile({ profile, viewerCanFollow = false, viewerCanReport = false }: { profile: PublicBarberProfileView; viewerCanFollow?: boolean; viewerCanReport?: boolean; }) {
  const initials = profile.barber.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[36px] p-6 sm:p-8">
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
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="surface-label text-[#d7ffab]">Public barber profile</p>
                {profile.proof?.featuredLabel ? <span className="status-pill text-[#d7ffab]">{profile.proof.featuredLabel}</span> : null}
                {profile.proof?.boostedLabel ? <span className="status-pill text-white/72">{profile.proof.boostedLabel}</span> : null}
                {profile.proof?.cityLabel ? <span className="status-pill text-white/72">{profile.proof.cityLabel}</span> : null}
                {profile.proof?.rankingLabel ? <span className="status-pill text-[#d7ffab]">{profile.proof.rankingLabel}</span> : null}
                {profile.proof?.trustLabel ? <span className="status-pill text-[#d7ffab]">{profile.proof.trustLabel}</span> : null}
                {profile.proof?.reputationTier ? <span className="status-pill text-white/72">{profile.proof.reputationTier} trust tier</span> : null}
              </div>
              <h1 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">{profile.barber.name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/66">{profile.profile.headline}</p>
              <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em]">
                {profile.profile.badges.map((badge) => (
                  <span key={badge} className="status-pill text-[#d7ffab]">{getBadgeLabel(badge)}</span>
                ))}
                {(profile.proof?.verificationLabels ?? []).slice(0, 3).map((badge) => (
                  <span key={badge} className="status-pill text-white/72">{badge}</span>
                ))}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Experience</p>
                  <p className="mt-3 text-2xl font-semibold">{profile.profile.yearsExperience} years</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Review score</p>
                  <p className="mt-3 text-2xl font-semibold">{profile.proof?.reviewScore?.toFixed(1) ?? profile.barber.rating.toFixed(1)}</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Followers</p>
                  <p className="mt-3 text-2xl font-semibold">{profile.proof?.followCount ?? 0}</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Next available</p>
                  <p className="mt-3 text-lg font-semibold">{dateLabel(profile.nextAvailableAt)}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-white/58">
                <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-white/78">
                  {profile.proof?.reviewCount ?? profile.reviews.length} verified reviews
                </span>
                <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-white/78">
                  {profile.mostBookedService?.popularity.repeatRate ?? 0}% repeat on top service
                </span>
                <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-white/78">
                  {profile.proof?.completionRate ?? 0}% reliability
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-white/8 bg-black/20 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="surface-label">Professional profile</p>
                <p className="mt-2 text-sm text-white/62">{profile.barber.bio}</p>
              </div>
              <div className="grid w-full gap-3 sm:w-auto sm:flex sm:flex-wrap">
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
                      reviewCount: profile.proof?.reviewCount ?? profile.reviews.length,
                      repeatRate: profile.mostBookedService?.popularity.repeatRate ?? 0
                    }
                  }}
                >
                  Book this barber
                </MarketplaceTrackedActionLink>
                <Link href="/leaderboards" className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                  See rankings
                </Link>
                {viewerCanFollow ? (
                  <MarketplaceTrackedActionLink
                    href="/referrals"
                    variant="outline"
                    className="h-12 px-5"
                    analytics={{
                      eventType: "referral_shared",
                      barberId: profile.barber.id,
                      username: profile.profile.username,
                      locationId: profile.shopLocations[0]?.id,
                      sourceKind: "public_profile",
                      sourceReference: "profile_referral_cta",
                      metadata: {
                        reviewCount: profile.proof?.reviewCount ?? profile.reviews.length
                      }
                    }}
                  >
                    Refer a friend
                  </MarketplaceTrackedActionLink>
                ) : null}
              </div>
            </div>
            <div className="mt-5">
              <PublicBarberGrowthActions barberId={profile.barber.id} username={profile.profile.username} canFollow={viewerCanFollow} canReport={viewerCanReport} initialFollowerCount={profile.proof?.followCount ?? 0} />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                <p className="surface-label">Shop affiliation</p>
                <div className="mt-3 flex items-center gap-3">
                  {profile.shop?.profilePhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.shop.profilePhotoUrl}
                      alt={profile.shop.name}
                      className="h-10 w-10 rounded-[14px] border border-white/10 object-cover"
                    />
                  ) : null}
                  <p className="text-sm text-white/72">{profile.shop?.name ?? "Independent barber"}</p>
                </div>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                <p className="surface-label">Most booked service</p>
                <p className="mt-3 text-sm text-white/72">{profile.mostBookedService?.service.name ?? "Building booking history"}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                <p className="surface-label">Service area</p>
                <p className="mt-3 text-sm text-white/72">{profile.profile.serviceAreaLabel}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                <p className="surface-label">Price range</p>
                <p className="mt-3 text-sm text-white/72">{currency(profile.priceRange[0])} - {currency(profile.priceRange[1])}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                <p className="surface-label">Visibility</p>
                <p className="mt-3 text-sm text-white/72">{profile.proof?.activePlacementCount ?? 0} featured | {profile.proof?.activeBoostCount ?? 0} boosts</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Marketplace proof</p>
              <p className="mt-2 text-sm text-white/58">Trust, demand, activation, and conversion signals now come from persisted marketplace, trust, and monetization activity.</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-sm text-white/72"><Store className="h-4 w-4 text-[#baff69]" />{profile.shop?.brandLine ?? "Independent barber brand page"}</div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-sm text-white/72"><MapPinned className="h-4 w-4 text-[#baff69]" />{profile.shopLocations.length ? profile.shopLocations.map((location) => `${location.name}, ${location.neighborhood}`).join(" | ") : "Independent route coverage"}</div>
            </div>
            <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4">
              <div className="flex items-center gap-2 text-sm text-white/78"><CalendarDays className="h-4 w-4 text-[#d7ffab]" />Next opening: {dateLabel(profile.nextAvailableAt)}</div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-sm text-white/72"><Users className="h-4 w-4 text-[#baff69]" />{profile.proof?.followCount ?? 0} followers tracking availability</div>
            </div>
          </div>

          <div className="mt-5 rounded-[28px] border border-white/8 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Trust and placement signals</p>
              <span className="status-pill text-[#d7ffab]">{profile.proof?.trustLabel ?? "Trust building"}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                <p className="surface-label">Trust score</p>
                <p className="mt-3 text-2xl font-semibold">{profile.proof?.trustScore ?? 0}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                <p className="surface-label">Reliability</p>
                <p className="mt-3 text-2xl font-semibold">{profile.proof?.completionRate ?? 0}%</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                <p className="surface-label">Featured slots</p>
                <p className="mt-3 text-2xl font-semibold">{profile.proof?.activePlacementCount ?? 0}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                <p className="surface-label">Boosts live</p>
                <p className="mt-3 text-2xl font-semibold">{profile.proof?.activeBoostCount ?? 0}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.proof?.featuredLabel ? <span className="status-pill text-[#d7ffab]">{profile.proof.featuredLabel}</span> : null}
              {profile.proof?.boostedLabel ? <span className="status-pill text-white/72">{profile.proof.boostedLabel}</span> : null}
              {profile.proof?.cityLabel ? <span className="status-pill text-white/72">{profile.proof.cityLabel}</span> : null}
              {profile.proof?.reviewIntegrityLabel ? <span className="status-pill text-white/72">{profile.proof.reviewIntegrityLabel}</span> : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
              <p className="surface-label">Reviews</p>
              <p className="mt-3 text-2xl font-semibold">{profile.proof?.reviewCount ?? profile.reviews.length}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
              <p className="surface-label">Profile views</p>
              <p className="mt-3 text-2xl font-semibold">{profile.proof?.profileViews ?? 0}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
              <p className="surface-label">Booking conversion</p>
              <p className="mt-3 text-2xl font-semibold">{profile.proof?.conversionRate ?? 0}%</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
              <p className="surface-label">Booking clicks</p>
              <p className="mt-3 text-2xl font-semibold">{profile.proof?.bookingClicks ?? 0}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/25 p-4">
              <p className="surface-label">Bookings closed</p>
              <p className="mt-3 text-2xl font-semibold">{profile.proof?.bookingsCompleted ?? 0}</p>
            </div>
          </div>

          <div className="mt-5 rounded-[28px] border border-white/8 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="surface-label">Client reviews</p>
              <span className="status-pill text-[#d7ffab]">{profile.reviews.length} reviews</span>
            </div>
            <div className="mt-4 space-y-3">
              {profile.reviews.length ? profile.reviews.map((review) => (
                <div key={review.id} className="rounded-[22px] border border-white/8 bg-black/25 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[#d7ffab]"><Star className="h-4 w-4 fill-current" />{review.rating.toFixed(1)}</div>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-white/38">{review.createdAt}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-white/68">{review.message}</p>
                </div>
              )) : (
                <div className="empty-state-panel rounded-[22px] p-5 text-sm text-white/55">Review visibility will grow as more appointments close through the marketplace layer.</div>
              )}
            </div>
          </div>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Service menu</p>
              <p className="mt-2 text-sm text-white/58">Service ownership, pricing, and marketplace popularity show up in one place.</p>
            </div>
            <WandSparkles className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {profile.services.map((item) => (
              <div key={item.service.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/16 hover:bg-black/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{item.service.name}</p>
                    <p className="mt-2 text-sm text-white/62">{item.service.description}</p>
                  </div>
                  <span className="status-pill text-[#d7ffab]">{currency(item.service.price)}</span>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-white/68 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">{item.service.durationMin} min</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">{item.popularity.bookingCount} bookings</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">{item.popularity.repeatRate}% repeat</div>
                  <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3">#{item.popularity.popularityRank || "--"} popularity</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Portfolio</p>
              <p className="mt-2 text-sm text-white/58">The marketplace profile is ready for before-and-after content, style discovery, and shareable examples.</p>
            </div>
            <ArrowRight className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {profile.portfolio.length ? profile.portfolio.map((asset) => (
              <div key={asset.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                {asset.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.imageUrl}
                    alt={asset.caption || profile.barber.name}
                    className="h-36 w-full rounded-[20px] border border-white/8 object-cover"
                  />
                ) : (
                  <div className="flex h-36 items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-[linear-gradient(135deg,rgba(124,255,0,0.12),rgba(9,9,9,0.95))] text-lg font-semibold text-[#d7ffab]">{profile.barber.name.split(" ")[0]}</div>
                )}
                <p className="mt-4 text-sm leading-7 text-white/68">{asset.caption}</p>
              </div>
            )) : (
              <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/55 md:col-span-2">Portfolio media is scaffolded and ready for richer marketplace content uploads.</div>
            )}
          </div>
          {profile.shop?.gallery?.length ? (
            <div className="mt-5 rounded-[28px] border border-white/8 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="surface-label">Shop gallery</p>
                <span className="status-pill text-white/72">{profile.shop.gallery.length} images</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {profile.shop.gallery.map((asset) => (
                  <div key={asset.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                    {asset.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.imageUrl}
                        alt={asset.caption || profile.shop?.name || "Shop gallery image"}
                        className="h-36 w-full rounded-[20px] border border-white/8 object-cover"
                      />
                    ) : (
                      <div className="flex h-36 items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-black/18 text-sm text-white/42">
                        Shop image unavailable
                      </div>
                    )}
                    <p className="mt-4 text-sm leading-7 text-white/68">{asset.caption || "Shop atmosphere and operating context."}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-4 rounded-[28px] border border-white/8 bg-black/20 p-5 text-sm text-white/62">
            <div className="flex items-center gap-2 text-[#d7ffab]"><TrendingUp className="h-4 w-4" />Persisted proof keeps discovery ranking explainable: reviews, follows, conversion, availability, service demand, trust, and premium placement all contribute.</div>
            <MarketplaceTrackedActionLink
              href={(profile.bookingCtaHref ?? "/booking/new") as Route}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_38px_rgba(124,255,0,0.28)]"
              analytics={{
                eventType: "booking_cta_clicked",
                barberId: profile.barber.id,
                username: profile.profile.username,
                locationId: profile.shopLocations[0]?.id,
                sourceKind: "public_profile",
                sourceReference: "portfolio_cta",
                metadata: {
                  reviewCount: profile.proof?.reviewCount ?? profile.reviews.length,
                  featuredSlots: profile.proof?.activePlacementCount ?? 0
                }
              }}
            >
              <Sparkles className="h-4 w-4" />Book with {profile.barber.name.split(" ")[0]}
            </MarketplaceTrackedActionLink>
          </div>
        </Card>
      </section>
    </div>
  );
}









