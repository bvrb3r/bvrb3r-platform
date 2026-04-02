import { demoAppointments, demoBarbers, demoClients, demoLocations, demoReviews, demoServices } from "@/lib/data/demo";
import {
  demoBarberPortfolios,
  demoBarberProfiles,
  demoClientPreferences,
  demoFeaturedProfiles,
  demoLocationSearchIndex,
  demoMarketplaceServices,
  demoMarketplaceVisibility,
  demoSearchHistory,
  demoShops,
  demoStyleTags,
  demoTrendingStyles
} from "@/lib/data/marketplace";
import type {
  Barber,
  BarberPortfolioAsset,
  BarberProfile,
  ClientPreference,
  DiscoveryFilters,
  DiscoveryResult,
  FeaturedProfile,
  HaircutNowMatch,
  Location,
  LocationSearchIndexEntry,
  MapDiscoveryMarker,
  MarketplaceBadge,
  MarketplaceVisibility,
  Review,
  Role,
  SearchHistoryEntry,
  Service,
  ServiceOwnerType,
  ServicePopularityMetrics,
  Shop,
  StyleTag,
  TrendingStyle
} from "@/types/domain";
import type { TrustState } from "@/types/trust";
import { buildPublicTrustSignal, computeShopVerificationDecision, getVerificationGateDecision } from "@/lib/trust/engine";

const DEFAULT_SHOP_ID = "shop-bvrb3r";

const DEFAULT_SERVICE_STYLE_TAGS: Record<string, string[]> = {
  "srv-signature": ["style-low-taper", "style-executive"],
  "srv-premium": ["style-beard-lineup", "style-executive"],
  "srv-kids": ["style-kids"],
  "srv-razor": ["style-beard-lineup", "style-executive"],
  "srv-beard": ["style-beard-lineup"],
  "srv-enhancement": ["style-camera-ready"],
  "srv-blackmask": ["style-camera-ready"],
  "srv-color": ["style-grey-blend", "style-camera-ready"],
  "srv-design": ["style-design", "style-burst-fade"],
  "srv-membership": ["style-executive"]
};

const DEFAULT_PUBLIC_BIO: Record<string, string> = {
  "barber-wave": "Sharp blends, polished chair flow, and a premium guest experience from first consultation to final detail.",
  "barber-fade": "Creative specialist built for design-forward work, quick throughput, and a strong repeat-client book.",
  "barber-blaze": "Independent executive barber serving professionals who need reliable detail, speed, and clean finishing.",
  "barber-luxe": "Luxury-focused barber for camera-ready finishes, premium grooming, and high-frequency repeat visits."
};

export interface MarketplaceState {
  services: Service[];
  barberProfiles: BarberProfile[];
  visibilities: MarketplaceVisibility[];
  barberPortfolios: BarberPortfolioAsset[];
  reviews: Review[];
  styleTags: StyleTag[];
  shops: Shop[];
  featuredProfiles: FeaturedProfile[];
  searchHistory: SearchHistoryEntry[];
  clientPreferences: ClientPreference[];
  trendingStyles: TrendingStyle[];
  locationSearchIndex: LocationSearchIndexEntry[];
}

export interface MarketplaceActor {
  role: Role;
  barberId?: string;
  locationIds?: string[];
  email?: string;
}

export interface ServiceMutationInput {
  category: string;
  name: string;
  description: string;
  durationMin: number;
  bufferMin: number;
  price: number;
  deposit: number;
  fullPrepay: boolean;
  styleTagIds: string[];
  shopId?: string;
}

export interface ServiceCatalogItem {
  service: Service;
  popularity: ServicePopularityMetrics;
  ownerLabel: string;
  canEdit: boolean;
  styleTags: StyleTag[];
}

export interface ServiceCatalogView {
  viewerRole: Role;
  canCreate: boolean;
  createOwnerType?: ServiceOwnerType;
  editableServices: ServiceCatalogItem[];
  readOnlyServices: ServiceCatalogItem[];
  shops: Shop[];
  styleTags: StyleTag[];
}

export interface PublicBarberProfileProof {
  reviewScore: number;
  reviewCount: number;
  followCount: number;
  reputationScore: number;
  reputationTier?: string;
  rankingLabel?: string;
  profileViews: number;
  bookingClicks: number;
  bookingsCreated: number;
  bookingsCompleted: number;
  conversionRate: number;
  trustScore: number;
  completionRate: number;
  trustLabel?: string;
  reviewIntegrityLabel?: string;
  verificationLabels: string[];
  boostedLabel?: string;
  featuredLabel?: string;
  cityLabel?: string;
  activeBoostCount?: number;
  activePlacementCount?: number;
}

export interface PublicBarberProfileView {
  barber: Barber;
  profile: BarberProfile;
  shop?: Shop;
  services: ServiceCatalogItem[];
  portfolio: BarberPortfolioAsset[];
  reviews: Review[];
  mostBookedService?: ServiceCatalogItem;
  nextAvailableAt: string;
  shopLocations: Location[];
  priceRange: [number, number];
  proof?: PublicBarberProfileProof;
  bookingCtaHref?: string;
}

export class MarketplacePermissionError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "MarketplacePermissionError";
  }
}

export class MarketplaceNotFoundError extends Error {
  readonly status = 404;

  constructor(message: string) {
    super(message);
    this.name = "MarketplaceNotFoundError";
  }
}

export class MarketplaceValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "MarketplaceValidationError";
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeService(service: Service): Service {
  return {
    ...service,
    ownerType: service.ownerType ?? "shop",
    shopId: service.shopId ?? DEFAULT_SHOP_ID,
    styleTagIds: uniqueStrings(service.styleTagIds ?? DEFAULT_SERVICE_STYLE_TAGS[service.id] ?? [])
  };
}

function getNormalizedServices(state: MarketplaceState) {
  return state.services.map(normalizeService);
}

function getProfile(state: MarketplaceState, barberId: string) {
  return state.barberProfiles.find((profile) => profile.barberId === barberId);
}

function getShop(state: MarketplaceState, shopId?: string) {
  return state.shops.find((shop) => shop.id === shopId);
}

function getLocationEntry(state: MarketplaceState, barberId: string, locationId?: string) {
  const scoped = state.locationSearchIndex.filter((entry) => entry.barberId === barberId);
  if (!scoped.length) {
    return undefined;
  }

  return scoped.find((entry) => entry.locationId === locationId) ?? scoped[0];
}

function getReviewAverage(reviews: Review[]) {
  if (!reviews.length) {
    return 0;
  }

  return Number((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(2));
}

export function createInitialMarketplaceState(): MarketplaceState {
  return {
    services: [...demoServices, ...demoMarketplaceServices],
    barberProfiles: demoBarberProfiles,
    visibilities: demoMarketplaceVisibility,
    barberPortfolios: demoBarberPortfolios,
    reviews: demoReviews,
    styleTags: demoStyleTags,
    shops: demoShops,
    featuredProfiles: demoFeaturedProfiles,
    searchHistory: demoSearchHistory,
    clientPreferences: demoClientPreferences,
    trendingStyles: demoTrendingStyles,
    locationSearchIndex: demoLocationSearchIndex
  };
}

export function canCreateServiceDefinition(actor: MarketplaceActor) {
  return actor.role === "owner" || actor.role === "booth_rent_barber";
}

export function canEditServiceDefinition(actor: MarketplaceActor, service: Service) {
  const normalizedService = normalizeService(service);

  if (actor.role === "owner") {
    return normalizedService.ownerType === "shop";
  }

  if (actor.role === "booth_rent_barber") {
    return normalizedService.ownerType === "barber" && normalizedService.barberId === actor.barberId;
  }

  return false;
}

export function getServicePopularity(state: MarketplaceState) {
  const services = getNormalizedServices(state);
  const appointments = demoAppointments.filter((appointment) => appointment.status !== "cancelled" && appointment.status !== "no_show");

  const rows = services.map((service) => {
    const matchingAppointments = appointments.filter((appointment) => appointment.serviceId === service.id);
    const completedAppointments = matchingAppointments.filter((appointment) => appointment.status === "completed");
    const uniqueClientIds = uniqueStrings(matchingAppointments.map((appointment) => appointment.clientId));
    const repeatClientCount = uniqueClientIds.filter((clientId) => matchingAppointments.filter((appointment) => appointment.clientId === clientId).length > 1).length;
    const relatedReviews = state.reviews.filter((review) => matchingAppointments.some((appointment) => appointment.barberId === review.barberId && appointment.clientId === review.clientId));

    return {
      serviceId: service.id,
      metrics: {
        bookingCount: matchingAppointments.length,
        revenueGenerated: Number(completedAppointments.reduce((sum, appointment) => sum + appointment.totalAmount, 0).toFixed(2)),
        averageRating: getReviewAverage(relatedReviews),
        repeatRate: uniqueClientIds.length ? Math.round((repeatClientCount / uniqueClientIds.length) * 100) : 0,
        popularityRank: 0
      }
    };
  });

  rows
    .sort((left, right) => right.metrics.bookingCount - left.metrics.bookingCount || right.metrics.revenueGenerated - left.metrics.revenueGenerated || right.metrics.averageRating - left.metrics.averageRating || left.serviceId.localeCompare(right.serviceId))
    .forEach((row, index) => {
      row.metrics.popularityRank = index + 1;
    });

  return new Map(rows.map((row) => [row.serviceId, row.metrics]));
}

function getServicesForBarber(state: MarketplaceState, barber: Barber, profile: BarberProfile) {
  const services = getNormalizedServices(state);

  if (barber.compensationModel === "booth_rent") {
    return services.filter((service) => service.ownerType === "barber" && service.barberId === barber.id);
  }

  return services.filter((service) => service.ownerType === "shop" && (service.shopId ?? DEFAULT_SHOP_ID) === (profile.shopId ?? DEFAULT_SHOP_ID));
}

function getOwnerLabel(service: Service, state: MarketplaceState) {
  const normalizedService = normalizeService(service);
  if (normalizedService.ownerType === "barber") {
    const barber = demoBarbers.find((entry) => entry.id === normalizedService.barberId);
    return barber ? `${barber.name} owns this service` : "Barber-owned service";
  }

  const shop = getShop(state, normalizedService.shopId ?? DEFAULT_SHOP_ID);
  return shop ? `${shop.name} controls this service` : "Shop-owned service";
}

function toCatalogItem(service: Service, state: MarketplaceState, actor: MarketplaceActor): ServiceCatalogItem {
  const popularity = getServicePopularity(state).get(service.id) ?? {
    bookingCount: 0,
    revenueGenerated: 0,
    averageRating: 0,
    repeatRate: 0,
    popularityRank: 0
  };

  return {
    service: normalizeService(service),
    popularity,
    ownerLabel: getOwnerLabel(service, state),
    canEdit: canEditServiceDefinition(actor, service),
    styleTags: state.styleTags.filter((styleTag) => normalizeService(service).styleTagIds?.includes(styleTag.id))
  };
}

export function getServiceCatalogView(state: MarketplaceState, actor: MarketplaceActor): ServiceCatalogView {
  const popularityMap = getServicePopularity(state);
  const services = getNormalizedServices(state);

  if (actor.role === "owner") {
    const editableServices = services
      .filter((service) => service.ownerType === "shop")
      .map((service) => ({ ...toCatalogItem(service, state, actor), popularity: popularityMap.get(service.id)! }))
      .sort((left, right) => left.service.name.localeCompare(right.service.name));
    const readOnlyServices = services
      .filter((service) => service.ownerType === "barber")
      .map((service) => ({ ...toCatalogItem(service, state, actor), popularity: popularityMap.get(service.id)! }))
      .sort((left, right) => left.service.name.localeCompare(right.service.name));

    return {
      viewerRole: actor.role,
      canCreate: true,
      createOwnerType: "shop",
      editableServices,
      readOnlyServices,
      shops: state.shops,
      styleTags: state.styleTags
    };
  }

  if (actor.role === "booth_rent_barber") {
    const editableServices = services
      .filter((service) => service.ownerType === "barber" && service.barberId === actor.barberId)
      .map((service) => ({ ...toCatalogItem(service, state, actor), popularity: popularityMap.get(service.id)! }))
      .sort((left, right) => left.service.name.localeCompare(right.service.name));

    return {
      viewerRole: actor.role,
      canCreate: true,
      createOwnerType: "barber",
      editableServices,
      readOnlyServices: [],
      shops: state.shops,
      styleTags: state.styleTags
    };
  }

  if (actor.role === "commission_barber") {
    const barber = demoBarbers.find((entry) => entry.id === actor.barberId);
    const profile = actor.barberId ? getProfile(state, actor.barberId) : undefined;
    if (!barber || !profile) {
      return {
        viewerRole: actor.role,
        canCreate: false,
        editableServices: [],
        readOnlyServices: [],
        shops: state.shops,
        styleTags: state.styleTags
      };
    }

    const readOnlyServices = getServicesForBarber(state, barber, profile)
      .map((service) => ({ ...toCatalogItem(service, state, actor), popularity: popularityMap.get(service.id)! }))
      .sort((left, right) => left.service.name.localeCompare(right.service.name));

    return {
      viewerRole: actor.role,
      canCreate: false,
      editableServices: [],
      readOnlyServices,
      shops: state.shops,
      styleTags: state.styleTags
    };
  }

  throw new MarketplacePermissionError("You do not have access to marketplace service management.");
}

function validateServiceMutation(input: ServiceMutationInput) {
  if (!input.name.trim()) {
    throw new MarketplaceValidationError("Service name is required.");
  }

  if (!input.category.trim()) {
    throw new MarketplaceValidationError("Service category is required.");
  }

  if (input.durationMin < 15) {
    throw new MarketplaceValidationError("Service duration must be at least 15 minutes.");
  }

  if (input.price <= 0) {
    throw new MarketplaceValidationError("Service price must be greater than zero.");
  }
}

function getPreferredShopId(state: MarketplaceState, actor: MarketplaceActor, requestedShopId?: string) {
  if (actor.role === "owner") {
    return requestedShopId ?? DEFAULT_SHOP_ID;
  }

  if (actor.role === "booth_rent_barber") {
    const profile = actor.barberId ? getProfile(state, actor.barberId) : undefined;
    return profile?.shopId ?? DEFAULT_SHOP_ID;
  }

  return DEFAULT_SHOP_ID;
}

export function createServiceDefinition(state: MarketplaceState, actor: MarketplaceActor, input: ServiceMutationInput) {
  if (!canCreateServiceDefinition(actor)) {
    throw new MarketplacePermissionError("You do not have permission to create this service.");
  }

  validateServiceMutation(input);

  const ownerType: ServiceOwnerType = actor.role === "owner" ? "shop" : "barber";
  const nextService: Service = normalizeService({
    id: `srv-${slugify(`${input.name}-${Date.now()}`)}`,
    category: input.category,
    name: input.name.trim(),
    description: input.description.trim(),
    durationMin: input.durationMin,
    bufferMin: input.bufferMin,
    price: input.price,
    deposit: input.deposit,
    fullPrepay: input.fullPrepay,
    addOnIds: [],
    ownerType,
    barberId: ownerType === "barber" ? actor.barberId : undefined,
    shopId: getPreferredShopId(state, actor, input.shopId),
    styleTagIds: uniqueStrings(input.styleTagIds)
  });

  return {
    state: {
      ...state,
      services: [nextService, ...state.services]
    },
    service: nextService
  };
}

export function updateServiceDefinition(state: MarketplaceState, actor: MarketplaceActor, serviceId: string, input: Partial<ServiceMutationInput>) {
  const services = getNormalizedServices(state);
  const target = services.find((service) => service.id === serviceId);

  if (!target) {
    throw new MarketplaceNotFoundError("Service not found.");
  }

  if (!canEditServiceDefinition(actor, target)) {
    throw new MarketplacePermissionError("You do not have permission to edit this service.");
  }

  const updatedService = normalizeService({
    ...target,
    category: input.category?.trim() || target.category,
    name: input.name?.trim() || target.name,
    description: input.description?.trim() || target.description,
    durationMin: input.durationMin ?? target.durationMin,
    bufferMin: input.bufferMin ?? target.bufferMin,
    price: input.price ?? target.price,
    deposit: input.deposit ?? target.deposit,
    fullPrepay: input.fullPrepay ?? target.fullPrepay,
    styleTagIds: input.styleTagIds ? uniqueStrings(input.styleTagIds) : target.styleTagIds
  });

  validateServiceMutation({
    category: updatedService.category,
    name: updatedService.name,
    description: updatedService.description,
    durationMin: updatedService.durationMin,
    bufferMin: updatedService.bufferMin,
    price: updatedService.price,
    deposit: updatedService.deposit,
    fullPrepay: updatedService.fullPrepay,
    styleTagIds: updatedService.styleTagIds ?? [],
    shopId: updatedService.shopId
  });

  return {
    state: {
      ...state,
      services: state.services.map((service) => (service.id === serviceId ? updatedService : service))
    },
    service: updatedService
  };
}

export function deleteServiceDefinition(state: MarketplaceState, actor: MarketplaceActor, serviceId: string) {
  const services = getNormalizedServices(state);
  const target = services.find((service) => service.id === serviceId);

  if (!target) {
    throw new MarketplaceNotFoundError("Service not found.");
  }

  if (!canEditServiceDefinition(actor, target)) {
    throw new MarketplacePermissionError("You do not have permission to delete this service.");
  }

  return {
    state: {
      ...state,
      services: state.services.filter((service) => service.id !== serviceId)
    },
    service: target
  };
}

function getVisibleProfiles(state: MarketplaceState) {
  return state.barberProfiles.filter((profile) => {
    const visibility = state.visibilities.find((entry) => entry.barberId === profile.barberId);
    return (visibility?.visibilityState ?? profile.visibilityState) !== "hidden";
  });
}

function isBarberDiscoverable(trustState: TrustState | undefined, barberId: string) {
  if (!trustState) {
    return true;
  }

  return getVerificationGateDecision(buildPublicTrustSignal(trustState, barberId).verificationDecision, "discovery").allowed;
}

function isShopPubliclyActivatable(trustState: TrustState | undefined, shopId?: string) {
  if (!trustState || !shopId) {
    return true;
  }

  return getVerificationGateDecision(computeShopVerificationDecision(trustState, shopId), "shop_activation").allowed;
}

function toMarketplaceBadges(
  profileBadges: MarketplaceBadge[] | undefined,
  trustState: TrustState | undefined,
  barberId: string,
  shopId?: string
) {
  const nonVerificationBadges = (profileBadges ?? []).filter(
    (badge) => !["verified_identity", "verified_license", "verified_shop"].includes(badge)
  );

  if (!trustState) {
    return profileBadges ?? [];
  }

  const trustSignal = buildPublicTrustSignal(trustState, barberId, shopId);
  const verificationBadges: MarketplaceBadge[] = [];

  if (trustSignal.verifiedBarber) {
    verificationBadges.push("verified_identity");
  }
  if (trustSignal.verifiedLicense) {
    verificationBadges.push("verified_license");
  }
  if (trustSignal.verifiedShop) {
    verificationBadges.push("verified_shop");
  }

  return [...new Set([...verificationBadges, ...nonVerificationBadges])] as MarketplaceBadge[];
}

function getServicesForPublicProfile(state: MarketplaceState, barber: Barber, profile: BarberProfile) {
  return getServicesForBarber(state, barber, profile);
}

function getReviewsForBarber(state: MarketplaceState, barberId: string) {
  return state.reviews.filter((review) => review.barberId === barberId);
}

function getReviewSnapshot(state: MarketplaceState, barber: Barber) {
  const reviews = getReviewsForBarber(state, barber.id);
  const reviewCount = reviews.length || barber.reviewCount;
  const averageRating = reviews.length
    ? Number((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1))
    : barber.rating;

  return {
    reviews,
    reviewCount,
    averageRating
  };
}

function formatDiscoveryAvailabilityLabel(nextAvailableAt: string) {
  const nextAvailableDate = new Date(nextAvailableAt);
  if (Number.isNaN(nextAvailableDate.getTime())) {
    return "Availability updating";
  }

  const diffMinutes = (nextAvailableDate.getTime() - Date.now()) / 60_000;
  if (diffMinutes <= 90) {
    return "Available now";
  }

  const today = new Date().toISOString().slice(0, 10);
  if (nextAvailableAt.slice(0, 10) === today) {
    return "Open today";
  }

  return `Next ${new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(nextAvailableDate)}`;
}

export function getPublicBarberProfileByUsername(
  state: MarketplaceState,
  username: string,
  trustState?: TrustState
): PublicBarberProfileView | null {
  const profile = getVisibleProfiles(state).find((entry) => entry.username === username);
  if (!profile) {
    return null;
  }

  const barber = demoBarbers.find((entry) => entry.id === profile.barberId);
  if (!barber) {
    return null;
  }
  if (!isBarberDiscoverable(trustState, barber.id)) {
    return null;
  }

  const shop = getShop(state, profile.shopId);
  const visibleShop = shop && isShopPubliclyActivatable(trustState, shop.id) ? shop : undefined;
  const services = getServicesForPublicProfile(state, barber, profile).map((service) => toCatalogItem(service, state, { role: barber.role, barberId: barber.id }));
  const { reviews, reviewCount, averageRating } = getReviewSnapshot(state, barber);
  const portfolio = state.barberPortfolios.filter((asset) => asset.barberId === barber.id);
  const mostBookedService = [...services].sort((left, right) => left.popularity.popularityRank - right.popularity.popularityRank || right.popularity.bookingCount - left.popularity.bookingCount)[0];
  const prices = services.map((entry) => entry.service.price);
  const shopLocations = demoLocations.filter((location) => visibleShop?.locationIds.includes(location.id));

  return {
    barber: {
      ...barber,
      rating: averageRating,
      reviewCount,
      bio: DEFAULT_PUBLIC_BIO[barber.id] ?? barber.bio
    },
    profile: {
      ...profile,
      badges: toMarketplaceBadges(profile.badges, trustState, barber.id, profile.shopId)
    },
    shop: visibleShop,
    services,
    portfolio,
    reviews,
    mostBookedService,
    nextAvailableAt: profile.nextAvailableAt,
    shopLocations,
    priceRange: prices.length ? [Math.min(...prices), Math.max(...prices)] : [0, 0]
  };
}

function getDiscoveryRow(
  state: MarketplaceState,
  barber: Barber,
  profile: BarberProfile,
  requestedLocationId?: string,
  trustState?: TrustState
): DiscoveryResult | null {
  const visibility = state.visibilities.find((entry) => entry.barberId === barber.id);
  if ((visibility?.visibilityState ?? profile.visibilityState) === "hidden") {
    return null;
  }
  if (!isBarberDiscoverable(trustState, barber.id)) {
    return null;
  }

  const services = getServicesForPublicProfile(state, barber, profile);
  if (!services.length) {
    return null;
  }

  const prices = services.map((service) => service.price);
  const mostBookedService = services
    .map((service) => ({ service, popularity: getServicePopularity(state).get(service.id) }))
    .sort((left, right) => (left.popularity?.popularityRank ?? 999) - (right.popularity?.popularityRank ?? 999))[0]?.service;
  const entry = getLocationEntry(state, barber.id, requestedLocationId);
  const shop = getShop(state, profile.shopId);
  const visibleShop = shop && isShopPubliclyActivatable(trustState, shop.id) ? shop : undefined;
  const { reviewCount, averageRating } = getReviewSnapshot(state, barber);
  const location = demoLocations.find((candidate) => candidate.id === (entry?.locationId ?? requestedLocationId))
    ?? demoLocations.find((candidate) => barber.locationIds.includes(candidate.id));
  const portfolioPreview = state.barberPortfolios
    .filter((asset) => asset.barberId === barber.id)
    .sort((left, right) => Number(right.featured) - Number(left.featured) || left.id.localeCompare(right.id))
    .slice(0, 3)
    .map((asset) => asset.imageUrl)
    .filter(Boolean);
  const priceRange: [number, number] = [Math.min(...prices), Math.max(...prices)];

  return {
    barberId: barber.id,
    username: profile.username,
    barberName: barber.name,
    locationId: location?.id ?? entry?.locationId,
    locationLabel: location ? `${location.name} | ${location.neighborhood}` : undefined,
    profilePhotoUrl: profile.profilePhotoUrl,
    galleryPreviewUrls: portfolioPreview,
    rating: averageRating,
    reviewCount,
    priceRange,
    priceRangeLabel: `${priceRange[0] === priceRange[1] ? `$${priceRange[0]}` : `$${priceRange[0]} - $${priceRange[1]}`}`,
    nextAvailableAt: profile.nextAvailableAt,
    availabilityLabel: formatDiscoveryAvailabilityLabel(profile.nextAvailableAt),
    distanceMiles: entry?.distanceMiles ?? 0,
    shopName: visibleShop?.name,
    specialties: uniqueStrings([...profile.specialties, ...barber.specialties]),
    mostBookedService: mostBookedService?.name,
    mostBookedServiceId: mostBookedService?.id,
    badges: toMarketplaceBadges(profile.badges, trustState, barber.id, profile.shopId)
  };
}

function getStyleTagMap(state: MarketplaceState) {
  return new Map(state.styleTags.map((tag) => [tag.id, tag]));
}

function getBarberScore(result: DiscoveryResult, state: MarketplaceState) {
  const visibility = state.visibilities.find((entry) => entry.barberId === result.barberId);
  const featuredBoost = visibility?.visibilityState === "featured" ? 18 - (visibility.featuredRank ?? 0) : 0;
  const hoursUntilNext = Math.max((new Date(result.nextAvailableAt).getTime() - new Date().getTime()) / 3_600_000, 0);
  const availabilityBoost = Math.max(0, 12 - Math.min(hoursUntilNext, 12));
  return result.rating * 20 + result.reviewCount * 0.18 + availabilityBoost + featuredBoost - result.distanceMiles * 2;
}

export function searchMarketplace(state: MarketplaceState, filters: DiscoveryFilters, trustState?: TrustState) {
  const styleTagMap = getStyleTagMap(state);
  const normalizedQuery = filters.query?.trim().toLowerCase();
  const requestedLocationId = filters.locationId;
  const requestedStyleTag = filters.styleTagId;
  const results = getVisibleProfiles(state)
    .map((profile) => {
      const barber = demoBarbers.find((entry) => entry.id === profile.barberId);
      return barber ? getDiscoveryRow(state, barber, profile, requestedLocationId, trustState) : null;
    })
    .filter((row): row is DiscoveryResult => Boolean(row))
    .filter((row) => {
      const publicProfile = state.barberProfiles.find((profile) => profile.barberId === row.barberId);
      const barber = demoBarbers.find((entry) => entry.id === row.barberId);
      const services = barber && publicProfile ? getServicesForPublicProfile(state, barber, publicProfile) : [];
      const searchText = [
        row.barberName,
        row.username,
        row.shopName,
        row.specialties.join(" "),
        services.map((service) => service.name).join(" "),
        services.flatMap((service) => service.styleTagIds ?? []).map((styleTagId) => styleTagMap.get(styleTagId)?.name ?? "").join(" "),
        demoLocations.filter((location) => barber?.locationIds.includes(location.id)).map((location) => `${location.name} ${location.neighborhood} ${location.city}`).join(" ")
      ]
        .join(" ")
        .toLowerCase();

      if (normalizedQuery && !searchText.includes(normalizedQuery)) {
        return false;
      }

      if (requestedLocationId && !barber?.locationIds.includes(requestedLocationId)) {
        return false;
      }

      if (requestedStyleTag && !services.some((service) => service.styleTagIds?.includes(requestedStyleTag))) {
        return false;
      }

      if (typeof filters.minRating === "number" && row.rating < filters.minRating) {
        return false;
      }

      if (typeof filters.maxPrice === "number" && row.priceRange[0] > filters.maxPrice) {
        return false;
      }

      if (filters.specialty && !row.specialties.some((specialty) => specialty.toLowerCase().includes(filters.specialty!.toLowerCase()))) {
        return false;
      }

      if (typeof filters.maxDistanceMiles === "number" && row.distanceMiles > filters.maxDistanceMiles) {
        return false;
      }

      if (filters.availability === "today") {
        const today = new Date().toISOString().slice(0, 10);
        if (row.nextAvailableAt.slice(0, 10) !== today) {
          return false;
        }
      }

      if (filters.availability === "now") {
        const diffMinutes = (new Date(row.nextAvailableAt).getTime() - Date.now()) / 60_000;
        if (diffMinutes > 90) {
          return false;
        }
      }

      return true;
    })
    .sort((left, right) => getBarberScore(right, state) - getBarberScore(left, state));

  return results;
}

export function getMapDiscoveryMarkers(state: MarketplaceState, filters: DiscoveryFilters, trustState?: TrustState) {
  const filteredResults = searchMarketplace(state, filters, trustState);
  const visibleBarberIds = new Set(filteredResults.map((result) => result.barberId));
  const shopMarkers: MapDiscoveryMarker[] = state.locationSearchIndex
    .filter((entry) => !entry.barberId)
    .filter((entry) => !filters.locationId || entry.locationId === filters.locationId)
    .map((entry): MapDiscoveryMarker | null => {
      const shop = getShop(state, entry.shopId);
      if (!isShopPubliclyActivatable(trustState, shop?.id)) {
        return null;
      }
      const location = demoLocations.find((item) => item.id === entry.locationId);
      return {
        id: `shop-${entry.locationId}`,
        kind: "shop",
        label: location?.name ?? shop?.name ?? "Shop",
        latitude: entry.latitude,
        longitude: entry.longitude,
        rating: 4.9,
        priceRangeLabel: "$32 - $96",
        nextAvailableAt: state.barberProfiles.sort((left, right) => left.nextAvailableAt.localeCompare(right.nextAvailableAt))[0]?.nextAvailableAt ?? new Date().toISOString(),
        shopName: shop?.name
      };
    })
    .filter((marker): marker is MapDiscoveryMarker => Boolean(marker));

  const barberMarkers = state.locationSearchIndex
    .filter((entry) => entry.barberId && visibleBarberIds.has(entry.barberId))
    .map((entry) => {
      const result = filteredResults.find((row) => row.barberId === entry.barberId);
      if (!result) {
        return null;
      }

      const marker: MapDiscoveryMarker = {
        id: `barber-${entry.barberId}`,
        kind: "barber",
        label: result.barberName,
        latitude: entry.latitude,
        longitude: entry.longitude,
        rating: result.rating,
        priceRangeLabel: `$${result.priceRange[0]} - $${result.priceRange[1]}`,
        nextAvailableAt: result.nextAvailableAt,
        shopName: result.shopName
      };

      return marker;
    })
    .filter((marker): marker is MapDiscoveryMarker => Boolean(marker));

  return [...shopMarkers, ...barberMarkers];
}

function pickEarliest(results: DiscoveryResult[]) {
  return [...results].sort((left, right) => new Date(left.nextAvailableAt).getTime() - new Date(right.nextAvailableAt).getTime())[0];
}

export function getHaircutNowMatch(
  state: MarketplaceState,
  clientId = "client-jordan",
  locationId?: string,
  trustState?: TrustState
): HaircutNowMatch | null {
  const client = demoClients.find((entry) => entry.id === clientId);
  const preferences = state.clientPreferences.find((entry) => entry.clientId === clientId);
  const visibleResults = searchMarketplace(state, { locationId, availability: "any" }, trustState);

  const favoriteBarberResult = client?.favoriteBarberId ? visibleResults.find((result) => result.barberId === client.favoriteBarberId) : undefined;
  if (favoriteBarberResult) {
    return {
      barberId: favoriteBarberResult.barberId,
      username: favoriteBarberResult.username,
      barberName: favoriteBarberResult.barberName,
      matchedFrom: "favorite_barber",
      matchReason: "Your favorite barber is the fastest trusted chair right now.",
      appointmentTime: favoriteBarberResult.nextAvailableAt,
      locationId: demoBarbers.find((entry) => entry.id === favoriteBarberResult.barberId)?.locationIds[0] ?? locationId ?? "loc-ybor",
      shopName: favoriteBarberResult.shopName,
      priceFrom: favoriteBarberResult.priceRange[0],
      rating: favoriteBarberResult.rating
    };
  }

  const favoriteShopId = preferences?.favoriteShopId;
  const favoriteShopResults = favoriteShopId
    ? visibleResults.filter((result) => state.barberProfiles.find((profile) => profile.barberId === result.barberId)?.shopId === favoriteShopId)
    : [];
  const favoriteShopMatch = pickEarliest(favoriteShopResults);
  if (favoriteShopMatch) {
    return {
      barberId: favoriteShopMatch.barberId,
      username: favoriteShopMatch.username,
      barberName: favoriteShopMatch.barberName,
      matchedFrom: "favorite_shop",
      matchReason: "Your favorite shop has the fastest open chair available.",
      appointmentTime: favoriteShopMatch.nextAvailableAt,
      locationId: demoBarbers.find((entry) => entry.id === favoriteShopMatch.barberId)?.locationIds[0] ?? locationId ?? "loc-ybor",
      shopName: favoriteShopMatch.shopName,
      priceFrom: favoriteShopMatch.priceRange[0],
      rating: favoriteShopMatch.rating
    };
  }

  const nearbyMatch = pickEarliest([...visibleResults].sort((left, right) => left.distanceMiles - right.distanceMiles || new Date(left.nextAvailableAt).getTime() - new Date(right.nextAvailableAt).getTime()));
  if (nearbyMatch) {
    return {
      barberId: nearbyMatch.barberId,
      username: nearbyMatch.username,
      barberName: nearbyMatch.barberName,
      matchedFrom: "nearby",
      matchReason: "This is the closest high-fit chair with strong availability right now.",
      appointmentTime: nearbyMatch.nextAvailableAt,
      locationId: demoBarbers.find((entry) => entry.id === nearbyMatch.barberId)?.locationIds[0] ?? locationId ?? "loc-ybor",
      shopName: nearbyMatch.shopName,
      priceFrom: nearbyMatch.priceRange[0],
      rating: nearbyMatch.rating
    };
  }

  const availableNowMatch = pickEarliest(visibleResults);
  if (!availableNowMatch) {
    return null;
  }

  return {
    barberId: availableNowMatch.barberId,
    username: availableNowMatch.username,
    barberName: availableNowMatch.barberName,
    matchedFrom: "available_now",
    matchReason: "This is the fastest next available appointment in the visible network.",
    appointmentTime: availableNowMatch.nextAvailableAt,
    locationId: demoBarbers.find((entry) => entry.id === availableNowMatch.barberId)?.locationIds[0] ?? locationId ?? "loc-ybor",
    shopName: availableNowMatch.shopName,
    priceFrom: availableNowMatch.priceRange[0],
    rating: availableNowMatch.rating
  };
}

