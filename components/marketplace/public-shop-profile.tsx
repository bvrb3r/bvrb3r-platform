import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, Clock3, MapPin, Scissors, ShieldCheck, Star, UsersRound } from "lucide-react";
import { MarketplaceTrackedActionLink } from "@/components/client-experience/marketplace-tracked-action-link";
import { PublicShopFavoriteAction } from "@/components/marketplace/public-shop-favorite-action";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/design/components";
import { getClientFacingBarberName } from "@/lib/marketplace/client-facing";
import { currency, dateLabel } from "@/lib/utils";
import type { PublicShopProfilePayload } from "@/lib/booking/platform-service";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BV";
}

export function PublicShopProfile({
  payload,
  viewerCanFavorite = false
}: {
  payload: PublicShopProfilePayload;
  viewerCanFavorite?: boolean;
}) {
  const { shop, barbers, services } = payload;
  const gallery = shop.gallery ?? [];
  const address = shop.address ?? `${shop.neighborhood}, ${shop.city}, ${shop.state}`;

  return (
    <div className="space-y-4" data-testid="public-shop-profile">
      <Card className="overflow-hidden rounded-[36px] p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,255,0,0.12),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.06),transparent_28%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          {shop.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shop.profilePhotoUrl}
              alt={shop.name}
              className="h-28 w-28 rounded-[32px] border border-[#7CFF00]/40 object-cover shadow-[0_22px_52px_rgba(124,255,0,0.14)]"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-[32px] border border-[#7CFF00]/36 bg-[#7CFF00]/12 text-3xl font-black text-[#d7ffab] shadow-[0_22px_52px_rgba(124,255,0,0.14)]">
              {getInitials(shop.name)}
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="surface-label text-[#d7ffab]">Verified shop</span>
              <span className="status-pill text-[#d7ffab]">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                Verified
              </span>
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] text-white sm:text-6xl" data-display="true">
              {shop.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/66">{shop.brandLine ?? "Pick a barber and book."}</p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-white/66">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                <MapPin className="h-4 w-4 text-[#baff69]" />
                {address}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                <UsersRound className="h-4 w-4 text-[#baff69]" />
                {shop.activeBarbersCount ?? barbers.length} approved barber{(shop.activeBarbersCount ?? barbers.length) === 1 ? "" : "s"}
              </span>
              {shop.nextAvailableAt ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                  <Clock3 className="h-4 w-4 text-[#baff69]" />
                  Next {dateLabel(shop.nextAvailableAt)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <PublicShopFavoriteAction shopId={shop.id} canFavorite={viewerCanFavorite} />
            <Link
              href="/dashboard/client/search?type=shops"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-black/24 px-5 text-sm font-extrabold text-white transition hover:border-[#7CFF00]/35 hover:text-[#d7ffab]"
            >
              View barbers
            </Link>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.72fr]">
        <Card className="rounded-[36px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Barbers</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Choose a chair</h2>
            </div>
            <UsersRound className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {barbers.length ? barbers.map((profile) => {
              const barberName = getClientFacingBarberName({
                username: profile.profile.username,
                barberName: profile.barber.name
              });

              return (
                <div key={profile.barber.id} className="rounded-[28px] border border-white/8 bg-black/20 p-4">
                  <div className="flex items-start gap-4">
                    <Avatar
                      src={profile.profile.profilePhotoUrl}
                      alt={barberName}
                      initials={getInitials(barberName)}
                      className="h-16 w-16 border-2 border-[#7CFF00]/55"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xl font-black tracking-[-0.035em] text-white">{barberName}</p>
                        <ShieldCheck className="h-4 w-4 shrink-0 text-[#baff69]" />
                      </div>
                      <p className="mt-1 text-sm text-white/58">{profile.profile.specialties.slice(0, 2).join(" | ") || "Bookable barber"}</p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <span className="rounded-[16px] border border-white/8 bg-black/25 px-3 py-2 text-white/72">
                          <Star className="mr-1 inline h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                          {(profile.proof?.reviewScore ?? profile.barber.rating).toFixed(1)}
                        </span>
                        <span className="rounded-[16px] border border-white/8 bg-black/25 px-3 py-2 text-white/72">
                          {currency(profile.priceRange[0])}+
                        </span>
                        <span className="rounded-[16px] border border-white/8 bg-black/25 px-3 py-2 text-white/72">
                          {profile.services.length} services
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Link
                      href={`/barber/${profile.profile.username}` as Route}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/24 px-4 text-sm font-extrabold text-white transition hover:border-[#7CFF00]/35 hover:text-[#d7ffab]"
                    >
                      View Profile
                    </Link>
                    <MarketplaceTrackedActionLink
                      href={(profile.bookingCtaHref ?? `/booking/new?barberId=${profile.barber.id}&locationId=${shop.id}`) as Route}
                      className="min-h-11 px-4 text-sm"
                      analytics={{
                        eventType: "booking_cta_clicked",
                        barberId: profile.barber.id,
                        username: profile.profile.username,
                        locationId: shop.id,
                        sourceKind: "public_profile",
                        sourceReference: "shop_profile_barber_card"
                      }}
                    >
                      Book
                    </MarketplaceTrackedActionLink>
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/58">
                Bookable barbers will appear here when the roster is ready.
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-[36px] p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="surface-label">Services</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Menu</h2>
              </div>
              <Scissors className="h-5 w-5 text-[#baff69]" />
            </div>
            <div className="mt-4 space-y-3">
              {services.length ? services.slice(0, 6).map((item) => (
                <div key={item.service.id} className="rounded-[22px] border border-white/8 bg-black/24 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-white">{item.service.name}</p>
                      <p className="mt-1 text-sm text-white/58">{item.service.durationMin} min</p>
                    </div>
                    <span className="status-pill text-[#d7ffab]">{currency(item.service.price)}</span>
                  </div>
                </div>
              )) : (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/58">
                  Choose a barber to see their service menu.
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-[36px] p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="surface-label">Portfolio</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Gallery</h2>
              </div>
              <CalendarDays className="h-5 w-5 text-[#baff69]" />
            </div>
            {gallery.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {gallery.slice(0, 4).map((asset) => (
                  <div key={asset.id} className="overflow-hidden rounded-[20px] border border-white/8 bg-black/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.imageUrl} alt={asset.caption || shop.name} className="h-36 w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/58">
                Public shop work will appear here when it is added.
              </p>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
