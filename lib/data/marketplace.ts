import {
  BarberPortfolioAsset,
  BarberProfile,
  ClientPreference,
  FeaturedProfile,
  LocationSearchIndexEntry,
  MarketplaceVisibility,
  Service,
  SearchHistoryEntry,
  Shop,
  StyleTag,
  TrendingStyle
} from "@/types/domain";

export const demoShops: Shop[] = [
  {
    id: "shop-bvrb3r",
    name: "The BVRB3R Shop(TM)",
    brandLine: "Premium grooming across Ybor City and Hyde Park.",
    phone: "(813) 555-0101",
    locationIds: ["loc-ybor", "loc-hyde"],
    type: "shop"
  }
];

export const demoStyleTags: StyleTag[] = [
  { id: "style-low-taper", name: "Low taper fade", slug: "low-taper-fade", category: "cut" },
  { id: "style-burst-fade", name: "Burst fade", slug: "burst-fade", category: "cut" },
  { id: "style-beard-lineup", name: "Beard lineup", slug: "beard-lineup", category: "beard" },
  { id: "style-kids", name: "Kids haircut", slug: "kids-haircut", category: "kids" },
  { id: "style-grey-blend", name: "Grey blend", slug: "grey-blend", category: "finish" },
  { id: "style-camera-ready", name: "Camera-ready finish", slug: "camera-ready-finish", category: "style" },
  { id: "style-executive", name: "Executive grooming", slug: "executive-grooming", category: "style" },
  { id: "style-design", name: "Design detail", slug: "design-detail", category: "cut" }
];

export const demoMarketplaceServices: Service[] = [
  {
    id: "srv-blaze-executive-detail",
    category: "Haircuts",
    name: "Blaze Executive Detail",
    description: "Independent chair signature with razor finish, beard detail, and premium consultation.",
    durationMin: 70,
    bufferMin: 10,
    price: 82,
    deposit: 20,
    fullPrepay: false,
    addOnIds: ["srv-blackmask"],
    ownerType: "barber",
    barberId: "barber-blaze",
    shopId: "shop-bvrb3r",
    styleTagIds: ["style-executive", "style-beard-lineup"]
  },
  {
    id: "srv-blaze-mobile-rush",
    category: "Haircuts",
    name: "Mobile Rush Refresh",
    description: "Fast premium cleanup designed for executive clients moving between meetings.",
    durationMin: 45,
    bufferMin: 5,
    price: 64,
    deposit: 18,
    fullPrepay: false,
    addOnIds: ["srv-enhancement"],
    ownerType: "barber",
    barberId: "barber-blaze",
    shopId: "shop-bvrb3r",
    styleTagIds: ["style-executive", "style-low-taper"]
  },
  {
    id: "srv-luxe-camera-ready",
    category: "Haircuts",
    name: "Camera-Ready Luxe Finish",
    description: "Luxury finish for clients headed into content, photo, or event-facing moments.",
    durationMin: 80,
    bufferMin: 10,
    price: 96,
    deposit: 24,
    fullPrepay: false,
    addOnIds: ["srv-color"],
    ownerType: "barber",
    barberId: "barber-luxe",
    shopId: "shop-bvrb3r",
    styleTagIds: ["style-camera-ready", "style-grey-blend"]
  },
  {
    id: "srv-luxe-color-refresh",
    category: "Color",
    name: "Luxe Color Refresh",
    description: "Independent color session with quick blend refinement and polished finish.",
    durationMin: 55,
    bufferMin: 10,
    price: 88,
    deposit: 22,
    fullPrepay: true,
    addOnIds: [],
    ownerType: "barber",
    barberId: "barber-luxe",
    shopId: "shop-bvrb3r",
    styleTagIds: ["style-grey-blend", "style-camera-ready"]
  }
];

export const demoBarberProfiles: BarberProfile[] = [
  {
    id: "profile-wave",
    barberId: "barber-wave",
    username: "wave",
    photoAccent: "#7cff00",
    yearsExperience: 11,
    shopId: "shop-bvrb3r",
    headline: "Precision fade specialist trusted by Ybor professionals.",
    specialties: ["low taper fades", "beard architecture", "VIP refresh"],
    badges: ["verified_license", "verified_identity", "top_barber"],
    nextAvailableAt: "2026-03-09T16:40:00-05:00",
    serviceAreaLabel: "Ybor City and downtown Tampa",
    visibilityState: "featured"
  },
  {
    id: "profile-fade",
    barberId: "barber-fade",
    username: "fade",
    photoAccent: "#9bff52",
    yearsExperience: 8,
    shopId: "shop-bvrb3r",
    headline: "Design-forward cuts with fast throughput and clean finishing.",
    specialties: ["burst fades", "kids cuts", "design detail"],
    badges: ["verified_license", "rising_barber"],
    nextAvailableAt: "2026-03-09T17:05:00-05:00",
    serviceAreaLabel: "Hyde Park and South Tampa",
    visibilityState: "public"
  },
  {
    id: "profile-blaze",
    barberId: "barber-blaze",
    username: "blaze",
    photoAccent: "#89ff37",
    yearsExperience: 13,
    shopId: "shop-bvrb3r",
    headline: "Independent executive barber with a premium grooming book.",
    specialties: ["executive grooming", "razor detail", "mobile-ready clients"],
    badges: ["verified_license", "verified_identity", "verified_shop"],
    nextAvailableAt: "2026-03-09T16:20:00-05:00",
    serviceAreaLabel: "Ybor City, Channelside, and downtown Tampa",
    visibilityState: "featured"
  },
  {
    id: "profile-luxe",
    barberId: "barber-luxe",
    username: "luxe",
    photoAccent: "#caff6b",
    yearsExperience: 10,
    shopId: "shop-bvrb3r",
    headline: "Luxury-focused barber for camera-ready finishes and premium repeat clients.",
    specialties: ["camera-ready finish", "grey blend", "luxury detail"],
    badges: ["verified_license", "verified_identity", "top_barber"],
    nextAvailableAt: "2026-03-10T11:00:00-05:00",
    serviceAreaLabel: "Hyde Park, Bayshore, and South Tampa",
    visibilityState: "public"
  }
];

export const demoBarberPortfolios: BarberPortfolioAsset[] = [
  { id: "portfolio-wave-1", barberId: "barber-wave", imageUrl: "", caption: "Low taper fade with soft beard blend.", styleTagIds: ["style-low-taper", "style-beard-lineup"], featured: true },
  { id: "portfolio-wave-2", barberId: "barber-wave", imageUrl: "", caption: "Precision executive finish before an event weekend.", styleTagIds: ["style-executive"], featured: false },
  { id: "portfolio-fade-1", barberId: "barber-fade", imageUrl: "", caption: "Burst fade with design detail for a game-day look.", styleTagIds: ["style-burst-fade", "style-design"], featured: true },
  { id: "portfolio-blaze-1", barberId: "barber-blaze", imageUrl: "", caption: "Executive shave and beard structure with premium line work.", styleTagIds: ["style-executive", "style-beard-lineup"], featured: true },
  { id: "portfolio-luxe-1", barberId: "barber-luxe", imageUrl: "", caption: "Luxury grey blend with camera-ready polish.", styleTagIds: ["style-grey-blend", "style-camera-ready"], featured: true }
];

export const demoMarketplaceVisibility: MarketplaceVisibility[] = [
  { barberId: "barber-wave", visibilityState: "featured", acceptsInstantBookings: true, featuredRank: 1 },
  { barberId: "barber-fade", visibilityState: "public", acceptsInstantBookings: true },
  { barberId: "barber-blaze", visibilityState: "featured", acceptsInstantBookings: true, featuredRank: 2 },
  { barberId: "barber-luxe", visibilityState: "public", acceptsInstantBookings: true }
];

export const demoFeaturedProfiles: FeaturedProfile[] = [
  { id: "featured-wave", barberId: "barber-wave", label: "Top barber this week" },
  { id: "featured-blaze", barberId: "barber-blaze", label: "Fastest availability near downtown" }
];

export const demoSearchHistory: SearchHistoryEntry[] = [
  { id: "search-1", clientId: "client-jordan", query: "low taper fade ybor", filters: { locationId: "loc-ybor", styleTagId: "style-low-taper" }, searchedAt: "2026-03-08T09:05:00-05:00" },
  { id: "search-2", clientId: "client-nova", query: "executive shave downtown", filters: { maxPrice: 90, specialty: "executive grooming" }, searchedAt: "2026-03-08T11:40:00-05:00" }
];

export const demoClientPreferences: ClientPreference[] = [
  { clientId: "client-jordan", favoriteShopId: "shop-bvrb3r", preferredLocationId: "loc-ybor", preferredStyleTagIds: ["style-low-taper", "style-beard-lineup"], prefersInstantBooking: true },
  { clientId: "client-nova", favoriteShopId: "shop-bvrb3r", preferredLocationId: "loc-ybor", preferredStyleTagIds: ["style-executive"], prefersInstantBooking: true },
  { clientId: "client-ava", favoriteShopId: "shop-bvrb3r", preferredLocationId: "loc-hyde", preferredStyleTagIds: ["style-camera-ready", "style-grey-blend"], prefersInstantBooking: false }
];

export const demoTrendingStyles: TrendingStyle[] = [
  { id: "trend-1", styleTagId: "style-low-taper", regionLabel: "Tampa Bay", bookingCount: 128, rank: 1 },
  { id: "trend-2", styleTagId: "style-beard-lineup", regionLabel: "Tampa Bay", bookingCount: 101, rank: 2 },
  { id: "trend-3", styleTagId: "style-camera-ready", regionLabel: "South Tampa", bookingCount: 72, rank: 3 }
];

export const demoLocationSearchIndex: LocationSearchIndexEntry[] = [
  { id: "index-loc-ybor", locationId: "loc-ybor", shopId: "shop-bvrb3r", latitude: 27.9606, longitude: -82.4286, distanceMiles: 1.2 },
  { id: "index-loc-hyde", locationId: "loc-hyde", shopId: "shop-bvrb3r", latitude: 27.9366, longitude: -82.4893, distanceMiles: 4.8 },
  { id: "index-wave", locationId: "loc-ybor", shopId: "shop-bvrb3r", barberId: "barber-wave", latitude: 27.9609, longitude: -82.4291, distanceMiles: 1.1 },
  { id: "index-fade", locationId: "loc-hyde", shopId: "shop-bvrb3r", barberId: "barber-fade", latitude: 27.9368, longitude: -82.4891, distanceMiles: 5.0 },
  { id: "index-blaze", locationId: "loc-ybor", shopId: "shop-bvrb3r", barberId: "barber-blaze", latitude: 27.9602, longitude: -82.4278, distanceMiles: 1.4 },
  { id: "index-luxe", locationId: "loc-hyde", shopId: "shop-bvrb3r", barberId: "barber-luxe", latitude: 27.9362, longitude: -82.4887, distanceMiles: 4.7 }
];