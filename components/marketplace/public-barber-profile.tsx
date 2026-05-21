import type { Route } from "next";
import type { ReactNode } from "react";
import { BadgeCheck, CalendarDays, CreditCard, MapPin, ShieldCheck, Star } from "lucide-react";
import { MarketplaceTrackedActionLink } from "@/components/client-experience/marketplace-tracked-action-link";
import { PublicBarberGrowthActions } from "@/components/marketplace/public-barber-growth-actions";
import { PublicBarberMessageAction } from "@/components/marketplace/public-barber-message-action";
import { PublicBarberPortfolioGrid } from "@/components/marketplace/public-barber-portfolio-grid";
import { PublicBarberReviewsSection } from "@/components/marketplace/public-barber-reviews-section";
import { getBookingLocationSummary } from "@/lib/marketplace/client-facing";
import { dateLabel } from "@/lib/utils";
import type { PublicBarberProfileView } from "@/lib/marketplace/engine";

const compactPanelClass = "rounded-lg border border-white/8 bg-white/[0.035] shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl";
const labelClass = "text-xs font-bold uppercase text-white/48";

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

function safeDateLabel(iso?: string | null) {
  if (!iso) return "Book appointment";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Book appointment";
  return dateLabel(iso);
}

function isInternalPublicReference(value: string) {
  return /^(barber|client|independent-barber|srv)-/i.test(value);
}

function cleanPublicText(value?: string | null) {
  const cleaned = value?.trim() ?? "";
  return cleaned && !isInternalPublicReference(cleaned) ? cleaned : "";
}

function getDisplayName(profile: PublicBarberProfileView) {
  return cleanPublicText(profile.barber.name) || cleanPublicText(profile.profile.username) || "BVRB3R barber";
}

function getHandle(username: string) {
  return username.startsWith("@") ? username : `@${username}`;
}

function getPrimarySpecialty(profile: PublicBarberProfileView) {
  return profile.profile.specialties[0] || profile.services[0]?.service.category || "Barber";
}

function getServiceLocation(profile: PublicBarberProfileView) {
  return profile.shopLocations[0]
    ? getBookingLocationSummary(profile.shopLocations[0])
    : profile.shop?.name ?? "Independent barber";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-base font-black text-white">{value}</p>
      <p className="mt-0.5 text-xs text-white/50">{label}</p>
    </div>
  );
}

function TrustItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="inline-flex min-h-12 items-center gap-3 rounded-lg border border-white/8 bg-black/30 px-3 py-2">
      <span className="text-[#d7ffab]">{icon}</span>
      <span>
        <span className="block text-xs font-bold text-white">{label}</span>
        <span className="block text-xs text-white/50">{value}</span>
      </span>
    </div>
  );
}

export function PublicBarberProfile({
  profile,
  viewerCanFollow = false,
  viewerCanMessage = false,
  viewerCanReview = viewerCanFollow
}: {
  profile: PublicBarberProfileView;
  viewerCanFollow?: boolean;
  viewerCanMessage?: boolean;
  viewerCanReview?: boolean;
}) {
  const displayName = getDisplayName(profile);
  const handle = getHandle(profile.profile.username);
  const initials = getInitials(displayName);
  const reviewCount = profile.proof?.reviewCount ?? profile.reviews.length;
  const reviewScore = profile.proof?.reviewScore ?? profile.barber.rating;
  const followerCount = profile.proof?.followCount ?? 0;
  const completedBookings = profile.proof?.bookingsCompleted ?? 0;
  const verificationBadges = [
    ...profile.profile.badges.map(getBadgeLabel),
    ...(profile.proof?.verificationLabels ?? [])
  ].slice(0, 4);
  const isVerified = verificationBadges.length > 0;
  const serviceLocation = getServiceLocation(profile);
  const nextOpening = safeDateLabel(profile.nextAvailableAt);
  const bio = cleanPublicText(profile.barber.bio) || cleanPublicText(profile.profile.headline) || "Fresh work, sharp details, and clean appointments.";
  const primarySpecialty = getPrimarySpecialty(profile);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <section className={`${compactPanelClass} p-4 sm:p-6`} data-testid="public-barber-profile-header">
        <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
          <div className="mx-auto sm:mx-0">
            {profile.profile.profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.profile.profilePhotoUrl}
                alt={displayName}
                className="h-28 w-28 rounded-lg border border-white/10 object-cover shadow-[0_18px_46px_rgba(0,0,0,0.4)] sm:h-36 sm:w-36"
                data-testid="barber-profile-photo"
              />
            ) : (
              <div
                className="flex h-28 w-28 items-center justify-center rounded-lg border border-white/10 text-3xl font-black text-black shadow-[0_18px_46px_rgba(0,0,0,0.4)] sm:h-36 sm:w-36 sm:text-4xl"
                style={{ background: `linear-gradient(135deg, ${profile.profile.photoAccent}, #d7ffab)` }}
                data-testid="barber-profile-initials"
              >
                {initials}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-center text-3xl font-black text-white sm:text-left sm:text-4xl" data-display="true">
                {displayName}
              </h1>
              {isVerified ? <BadgeCheck className="h-5 w-5 text-[#a3ff12]" aria-label="Verified barber" /> : null}
            </div>
            <p className="mt-1 text-center text-sm font-semibold text-white/58 sm:text-left">{handle}</p>
            <p className="mt-2 text-center text-sm text-white/62 sm:text-left">
              {primarySpecialty} - {profile.profile.serviceAreaLabel || profile.shopLocations[0]?.city || "Tampa, FL"}
            </p>
            <p className="mt-1 text-center text-sm text-white/48 sm:text-left">{profile.shop?.name ?? profile.shopLocations[0]?.name ?? "Phil's chair"}</p>
            {verificationBadges.length ? (
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                {verificationBadges.map((badge) => (
                  <span key={badge} className="rounded-lg border border-[#a3ff12]/20 bg-[#a3ff12]/10 px-2.5 py-1 text-xs font-bold text-[#d7ffab]">
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-4 gap-3 border-y border-white/8 py-4 text-center sm:max-w-xl sm:text-left">
              <Stat label="followers" value={followerCount} />
              <Stat label="reviews" value={reviewCount} />
              <Stat label="bookings" value={completedBookings} />
              <Stat label="posts" value={profile.portfolio.length} />
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72">{bio}</p>

            <div className="mt-5 flex flex-wrap gap-3" data-testid="barber-profile-header-actions">
              <MarketplaceTrackedActionLink
                href={(profile.bookingCtaHref ?? "/booking/new") as Route}
                className="min-h-11 rounded-lg px-5 text-sm"
                analytics={{
                  eventType: "booking_cta_clicked",
                  barberId: profile.barber.id,
                  username: profile.profile.username,
                  locationId: profile.shopLocations[0]?.id,
                  sourceKind: "public_profile",
                  sourceReference: "profile_header",
                  metadata: {
                    reviewCount,
                    rating: reviewScore
                  }
                }}
              >
                Book
              </MarketplaceTrackedActionLink>
              <PublicBarberMessageAction
                barberProfileId={profile.barber.userId}
                canMessage={viewerCanMessage}
                username={profile.profile.username}
              />
              <PublicBarberGrowthActions
                barberId={profile.barber.id}
                username={profile.profile.username}
                canFollow={viewerCanFollow}
                initialFollowerCount={followerCount}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TrustItem icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} label={isVerified ? "Verified barber" : "Profile active"} value={isVerified ? verificationBadges[0] : "BVRB3R profile"} />
        <TrustItem icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />} label="Next opening" value={nextOpening} />
        <TrustItem icon={<MapPin className="h-4 w-4" aria-hidden="true" />} label="Location" value={serviceLocation} />
        <TrustItem icon={<CreditCard className="h-4 w-4" aria-hidden="true" />} label="Payments" value="Card-on-file supported" />
        <TrustItem icon={<Star className="h-4 w-4 fill-current" aria-hidden="true" />} label="Rating" value={`${reviewScore.toFixed(1)} from ${reviewCount} reviews`} />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={labelClass}>Portfolio</p>
            <h2 className="mt-1 text-2xl font-black text-white">Work grid</h2>
          </div>
          <span className="text-sm font-bold text-white/54">{profile.portfolio.length} posts</span>
        </div>
        <PublicBarberPortfolioGrid assets={profile.portfolio} barberName={displayName} />
      </section>

      <PublicBarberReviewsSection
        barberId={profile.barber.id}
        initialAverageRating={reviewScore}
        initialReviewCount={reviewCount}
        initialReviews={profile.reviews}
        viewerCanReview={viewerCanReview}
      />
    </div>
  );
}
