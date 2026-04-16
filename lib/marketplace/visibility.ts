import {
  buildPublicTrustSignal,
  computeShopVerificationDecision,
  getVerificationGateDecision
} from "@/lib/trust/engine";
import type { MarketplaceState } from "@/lib/marketplace/engine";
import type { Barber, BarberProfile, Location, Service, Shop } from "@/types/domain";
import type { TrustState } from "@/types/trust";

const PUBLIC_VISIBILITY_STATES = new Set(["public", "featured"]);
const BARBER_MARKETPLACE_ROLES = new Set(["commission_barber", "booth_rent_barber"]);
const KNOWN_DEMO_MARKETPLACE_REFERENCES = new Set([
  "barber-wave",
  "barber-fade",
  "barber-blaze",
  "barber-luxe",
  "profile-wave",
  "profile-fade",
  "profile-blaze",
  "profile-luxe",
  "shop-bvrb3r",
  "loc-ybor",
  "loc-hyde",
  "srv-signature",
  "srv-premium",
  "srv-kids",
  "srv-razor",
  "srv-beard",
  "srv-enhancement",
  "srv-blackmask",
  "srv-color",
  "srv-design",
  "srv-membership",
  "srv-blaze-executive-detail",
  "srv-blaze-mobile-rush",
  "srv-luxe-camera-ready",
  "srv-luxe-color-refresh",
  "user-wave",
  "user-fade",
  "user-blaze",
  "user-luxe"
]);
const NON_PRODUCTION_TEXT_MARKERS = [
  "@bvrb3r.demo",
  "@example.com",
  "demo:",
  "seed:",
  "sample:"
];

export function hasRealMarketplaceText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function isPublicMarketplaceVisibilityState(value: string | null | undefined) {
  return PUBLIC_VISIBILITY_STATES.has(value ?? "");
}

export function isFutureBookableIso(value: string | null | undefined, now = Date.now()) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now;
}

export function isMarketplaceBookableService(service: Pick<Service, "name" | "category" | "durationMin" | "price">) {
  return hasRealMarketplaceText(service.name)
    && hasRealMarketplaceText(service.category)
    && service.durationMin >= 15
    && service.price > 0;
}

export function isKnownNonProductionMarketplaceValue(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return KNOWN_DEMO_MARKETPLACE_REFERENCES.has(normalized)
    || NON_PRODUCTION_TEXT_MARKERS.some((marker) => normalized.includes(marker));
}

export function isMarketplaceBarberTrustApproved(
  trustState: TrustState | undefined,
  barberId: string,
  shopId?: string
) {
  if (!trustState) {
    return false;
  }

  const trustSignal = buildPublicTrustSignal(trustState, barberId, shopId);
  const discoveryGate = getVerificationGateDecision(trustSignal.verificationDecision, "discovery");
  const bookingGate = getVerificationGateDecision(trustSignal.verificationDecision, "booking");
  return discoveryGate.allowed && bookingGate.allowed;
}

export function isMarketplaceShopTrustApproved(trustState: TrustState | undefined, shopId?: string) {
  if (!trustState) {
    return false;
  }

  if (!shopId) {
    return false;
  }

  return getVerificationGateDecision(computeShopVerificationDecision(trustState, shopId), "shop_activation").allowed;
}

function getBarber(state: MarketplaceState, barberId?: string) {
  return state.barbers.find((barber) => barber.id === barberId);
}

function getShop(state: MarketplaceState, shopId?: string) {
  return state.shops.find((shop) => shop.id === shopId);
}

function getLocationsForBarber(state: MarketplaceState, barber: Barber) {
  return barber.locationIds
    .map((locationId) => state.locations.find((location) => location.id === locationId))
    .filter((location): location is Location => Boolean(location));
}

function normalizeServiceOwner(service: Service): Service {
  return {
    ...service,
    ownerType: service.ownerType ?? "shop"
  };
}

function isRealLocation(location: Location) {
  return hasRealMarketplaceText(location.id)
    && hasRealMarketplaceText(location.name)
    && hasRealMarketplaceText(location.neighborhood)
    && hasRealMarketplaceText(location.city)
    && hasRealMarketplaceText(location.state)
    && ![
      location.id,
      location.name,
      location.neighborhood,
      location.city,
      location.phone
    ].some(isKnownNonProductionMarketplaceValue);
}

function isRealShopRecord(shop: Shop, locations: Location[]) {
  return hasRealMarketplaceText(shop.id)
    && hasRealMarketplaceText(shop.name)
    && shop.locationIds.length > 0
    && ![
      shop.id,
      shop.name,
      shop.brandLine,
      shop.phone
    ].some(isKnownNonProductionMarketplaceValue)
    && locations.some(isRealLocation);
}

function getServicesForMarketplaceBarber(state: MarketplaceState, barber: Barber, profile: BarberProfile) {
  const services = state.services.map(normalizeServiceOwner);

  if (barber.compensationModel === "booth_rent") {
    return services.filter((service) => service.ownerType === "barber" && service.barberId === barber.id);
  }

  if (!profile.shopId) {
    return [];
  }

  return services.filter((service) => service.ownerType === "shop" && service.shopId === profile.shopId);
}

function hasOnlyRealBookableServices(services: Service[]) {
  return services.some((service) =>
    isMarketplaceBookableService(service)
    && ![
      service.id,
      service.name,
      service.category,
      service.barberId,
      service.shopId
    ].some(isKnownNonProductionMarketplaceValue)
  );
}

export function isBarberMarketplaceVisible(
  state: MarketplaceState,
  barber: Barber,
  profile: BarberProfile,
  trustState?: TrustState
) {
  const visibility = state.visibilities.find((entry) => entry.barberId === barber.id);
  const shop = getShop(state, profile.shopId);
  const barberLocations = getLocationsForBarber(state, barber);

  if (!visibility?.acceptsInstantBookings) {
    return false;
  }

  if (
    !isPublicMarketplaceVisibilityState(profile.visibilityState)
    || !isPublicMarketplaceVisibilityState(visibility.visibilityState)
  ) {
    return false;
  }

  if (!BARBER_MARKETPLACE_ROLES.has(barber.role)) {
    return false;
  }

  if (
    !hasRealMarketplaceText(barber.id)
    || !hasRealMarketplaceText(barber.userId)
    || !hasRealMarketplaceText(barber.name)
    || !hasRealMarketplaceText(profile.id)
    || !hasRealMarketplaceText(profile.username)
    || !hasRealMarketplaceText(profile.headline || barber.bio)
    || !hasRealMarketplaceText(profile.serviceAreaLabel)
  ) {
    return false;
  }

  if ([
    barber.id,
    barber.userId,
    barber.name,
    barber.bookingLink,
    profile.id,
    profile.barberId,
    profile.username,
    profile.shopId,
    profile.headline,
    profile.serviceAreaLabel
  ].some(isKnownNonProductionMarketplaceValue)) {
    return false;
  }

  if (!isFutureBookableIso(profile.nextAvailableAt)) {
    return false;
  }

  if (!barberLocations.some(isRealLocation)) {
    return false;
  }

  if (profile.shopId) {
    const shopLocations = shop
      ? state.locations.filter((location) => shop.locationIds.includes(location.id))
      : state.locations.filter((location) => location.id === profile.shopId);
    if (shop && !isRealShopRecord(shop, shopLocations)) {
      return false;
    }

    if (!shop && !shopLocations.some(isRealLocation)) {
      return false;
    }

    const barberSharesShopScope = shop
      ? barber.locationIds.some((locationId) => shop.locationIds.includes(locationId))
      : barber.locationIds.includes(profile.shopId);
    if (!barberSharesShopScope) {
      return false;
    }
  }

  if (!hasOnlyRealBookableServices(getServicesForMarketplaceBarber(state, barber, profile))) {
    return false;
  }

  if (!isMarketplaceBarberTrustApproved(trustState, barber.id, profile.shopId)) {
    return false;
  }

  if (profile.shopId && !isMarketplaceShopTrustApproved(trustState, profile.shopId)) {
    return false;
  }

  return true;
}

export function filterVisibleMarketplaceBarbers(state: MarketplaceState, trustState?: TrustState) {
  return state.barberProfiles
    .map((profile) => {
      const barber = getBarber(state, profile.barberId);
      return barber && isBarberMarketplaceVisible(state, barber, profile, trustState)
        ? { barber, profile }
        : null;
    })
    .filter((entry): entry is { barber: Barber; profile: BarberProfile } => Boolean(entry));
}

export function isShopMarketplaceVisible(state: MarketplaceState, shop: Shop, trustState?: TrustState) {
  const locations = state.locations.filter((location) => shop.locationIds.includes(location.id));
  if (!isRealShopRecord(shop, locations)) {
    return false;
  }

  if (!isMarketplaceShopTrustApproved(trustState, shop.id)) {
    return false;
  }

  const visibleBarbers = filterVisibleMarketplaceBarbers(state, trustState);
  return visibleBarbers.some(({ barber, profile }) =>
    profile.shopId === shop.id
    || barber.locationIds.some((locationId) => shop.locationIds.includes(locationId))
  );
}

export function filterVisibleMarketplaceShops(state: MarketplaceState, trustState?: TrustState) {
  return state.shops.filter((shop) => isShopMarketplaceVisible(state, shop, trustState));
}
