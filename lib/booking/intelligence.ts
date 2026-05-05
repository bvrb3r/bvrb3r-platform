import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import {
  buildPublicTrustSignal,
  computeShopVerificationDecision,
  getVerificationGateDecision
} from "@/lib/trust/engine";
import {
  hasRealMarketplaceText,
  isBarberPlatformApproved,
  isKnownNonProductionMarketplaceValue,
  isMarketplaceBarberTrustApproved,
  isMarketplaceBookableService,
  isMarketplaceShopTrustApproved,
  isPublicMarketplaceVisibilityState
} from "@/lib/marketplace/visibility";
import type { PublicBarberProfileView, ServiceCatalogItem } from "@/lib/marketplace/engine";
import type {
  Barber,
  DiscoveryResult,
  HaircutNowMatch,
  Location,
  MarketplaceBadge,
  Review,
  Service,
  ServicePopularityMetrics,
  Shop
} from "@/types/domain";
import type { TrustState, VerificationGateDecision } from "@/types/trust";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type CanonicalLocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

type CanonicalProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  primary_onboarding_role: string | null;
};

type CanonicalBarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
  compensation_model: "commission" | "booth_rent";
  app_approval_status: string | null;
  shop_approval_status: string | null;
  commission_rate: number | string | null;
  booth_rent_amount: number | string | null;
  booth_rent_frequency: "weekly" | "monthly" | null;
  bio: string | null;
  booking_slug: string | null;
};

type CanonicalServiceRow = {
  id: string;
  reference_code: string | null;
  location_id: string;
  category: string;
  name: string;
  description: string | null;
  duration_min: number;
  buffer_min: number;
  price: number | string;
  currency: string | null;
  deposit_amount: number | string;
  full_prepay_required: boolean;
  active: boolean;
  is_bookable: boolean;
  display_order: number;
  created_at: string | null;
  updated_at: string | null;
  service_owner_type: "barber" | "shop" | null;
  barber_reference: string | null;
  shop_reference: string | null;
  booking_count: number | null;
  popularity_rank: number | null;
};

type CanonicalAvailabilityRuleRow = {
  barber_id: string;
  location_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

type CanonicalBlockedTimeRow = {
  barber_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

type CanonicalAppointmentRow = {
  id: string;
  reference_code: string | null;
  barber_id: string;
  client_id: string;
  service_id: string;
  location_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  total_amount: number | string;
};

type CanonicalReviewRow = {
  id: string;
  appointment_id: string | null;
  barber_id: string;
  client_id: string;
  location_id: string;
  rating: number;
  message: string | null;
  created_at: string;
};

type CanonicalBarberProfileRow = {
  barber_reference: string;
  username: string;
  display_name: string;
  bio: string;
  years_experience: number;
  shop_reference: string | null;
  specialties: string[] | null;
  badges: string[] | null;
  service_area_label: string | null;
  next_available_at: string | null;
  visibility_state: string;
};

type CanonicalMarketplaceVisibilityRow = {
  barber_reference: string;
  visibility_state: string;
  accepts_instant_bookings: boolean;
  featured_rank: number | null;
};

type ClientBookingSignal = {
  favoriteBarberReference?: string;
  favoriteShopReference?: string;
  retainsInstantBooking?: boolean;
};

type RoutineSignal = {
  barberReference?: string;
  serviceReference?: string;
  nextSuggestedAt?: string | null;
  averageCycleDays?: number;
  confidence?: string;
};

type CanonicalSlot = {
  startsAt: string;
  endsAt: string;
  label: string;
  locationId: string;
  barberId: string;
  serviceId?: string;
};

type CandidateRecord = {
  barberId: string;
  barberUuid: string;
  username: string;
  barberName: string;
  rating: number;
  reviewCount: number;
  priceRange: [number, number];
  nextAvailableAt: string;
  appointmentTime: string;
  distanceMiles: number;
  shopName?: string;
  locationId: string;
  location: Location;
  specialties: string[];
  mostBookedService?: string;
  matchedFrom: HaircutNowMatch["matchedFrom"];
  matchReason: string;
  rankingLabel?: string;
  badges: MarketplaceBadge[];
  serviceOptions: Service[];
  primaryService?: Service;
  completedCount: number;
  cancelledCount: number;
  accelerationScore: number;
};

type CanonicalSnapshot = {
  barbers: CanonicalBarberRow[];
  barberProfiles: CanonicalBarberProfileRow[];
  profiles: CanonicalProfileRow[];
  services: CanonicalServiceRow[];
  locations: CanonicalLocationRow[];
  availabilityRules: CanonicalAvailabilityRuleRow[];
  blockedTimes: CanonicalBlockedTimeRow[];
  appointments: CanonicalAppointmentRow[];
  reviews: CanonicalReviewRow[];
  marketplaceVisibility: CanonicalMarketplaceVisibilityRow[];
};

const knownBadges = new Set<MarketplaceBadge>([
  "verified_identity",
  "verified_license",
  "verified_shop",
  "top_barber",
  "rising_barber"
]);

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "barber";
}

function toReference(id: string, referenceCode?: string | null) {
  return referenceCode ?? id;
}

function mapLocation(row: CanonicalLocationRow): Location {
  return {
    id: toReference(row.id, row.reference_code),
    name: row.name,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    phone: row.phone ?? "",
    hours: "",
    chairs: 0,
    taxRate: 0,
    address: row.address ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined
  };
}

function toShop(location: Location): Shop {
  return {
    id: location.id,
    name: location.name,
    brandLine: `${location.neighborhood} shop`,
    phone: location.phone,
    locationIds: [location.id],
    type: "shop"
  };
}

function haversineMiles(origin: Location, target: Location) {
  if (
    typeof origin.latitude !== "number" ||
    typeof origin.longitude !== "number" ||
    typeof target.latitude !== "number" ||
    typeof target.longitude !== "number"
  ) {
    if (origin.id === target.id) {
      return 0.2;
    }
    if (origin.neighborhood === target.neighborhood) {
      return 0.8;
    }
    if (origin.city === target.city) {
      return 3.2;
    }
    return 8.5;
  }

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const latitudeDelta = toRadians(target.latitude - origin.latitude);
  const longitudeDelta = toRadians(target.longitude - origin.longitude);
  const latitudeOne = toRadians(origin.latitude);
  const latitudeTwo = toRadians(target.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusMiles * c).toFixed(1));
}

function serviceMatchScore(service: Service, normalizedQuery: string) {
  if (!normalizedQuery) {
    return 0;
  }

  const haystack = `${service.name} ${service.category} ${service.description}`.toLowerCase();
  if (haystack.includes(normalizedQuery)) {
    return 16;
  }

  return 0;
}

function createSlotLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function withTime(day: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(day);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function overlapsRange(start: Date, end: Date, blockedRanges: Array<{ startsAt: string; endsAt: string }>) {
  return blockedRanges.some((entry) => {
    const blockedStart = new Date(entry.startsAt).getTime();
    const blockedEnd = new Date(entry.endsAt).getTime();
    return start.getTime() < blockedEnd && end.getTime() > blockedStart;
  });
}

function toBadgeList(values: string[] | null | undefined, reviewCount: number, rating: number): MarketplaceBadge[] {
  const mapped = (values ?? []).filter((value): value is MarketplaceBadge => knownBadges.has(value as MarketplaceBadge));
  if (rating >= 4.85 && reviewCount >= 3 && !mapped.includes("top_barber")) {
    mapped.push("top_barber");
  }
  if (reviewCount > 0 && !mapped.includes("verified_identity")) {
    mapped.push("verified_identity");
  }
  return mapped;
}

function isBarberDiscoverable(trustState: TrustState | undefined, barberId: string) {
  return isMarketplaceBarberTrustApproved(trustState, barberId);
}

function isCanonicalBarberPlatformApproved(barber: CanonicalBarberRow) {
  return isBarberPlatformApproved({
    appApprovalStatus: barber.app_approval_status ?? undefined,
    shopApprovalStatus: barber.shop_approval_status ?? undefined
  });
}

function getBarberBookingGate(trustState: TrustState | undefined, barberId: string): VerificationGateDecision | null {
  if (!trustState) {
    return null;
  }

  return getVerificationGateDecision(buildPublicTrustSignal(trustState, barberId).verificationDecision, "booking");
}

function isShopPubliclyActivatable(trustState: TrustState | undefined, shopId?: string) {
  return isMarketplaceShopTrustApproved(trustState, shopId);
}

function isIndependentServiceLocationReference(locationReference?: string | null) {
  return Boolean(locationReference?.startsWith("independent-"));
}

function isLocationPubliclyBookable(trustState: TrustState | undefined, locationReference?: string | null) {
  if (!locationReference) {
    return false;
  }

  if (!trustState || isIndependentServiceLocationReference(locationReference)) {
    return true;
  }

  return isShopPubliclyActivatable(trustState, locationReference);
}

function getLocationActivationGate(trustState: TrustState | undefined, locationReference?: string | null) {
  if (!trustState || !locationReference || isLocationPubliclyBookable(trustState, locationReference)) {
    return null;
  }

  return getVerificationGateDecision(computeShopVerificationDecision(trustState, locationReference), "shop_activation");
}

function getMarketplaceVisibilityRow(snapshot: CanonicalSnapshot, barberReference: string) {
  return snapshot.marketplaceVisibility.find((row) => row.barber_reference === barberReference);
}

function isCanonicalMarketplaceVisibilityReady(
  snapshot: CanonicalSnapshot,
  barberReference: string,
  profileRow?: CanonicalBarberProfileRow
) {
  const visibility = getMarketplaceVisibilityRow(snapshot, barberReference);
  if (!visibility?.accepts_instant_bookings) {
    return false;
  }

  if (
    !profileRow
    || !isPublicMarketplaceVisibilityState(profileRow.visibility_state)
    || !isPublicMarketplaceVisibilityState(visibility.visibility_state)
  ) {
    return false;
  }

  return ![
    barberReference,
    profileRow.barber_reference,
    profileRow.username,
    profileRow.display_name,
    visibility.barber_reference
  ].some(isKnownNonProductionMarketplaceValue);
}

function toCanonicalMarketplaceBadges(
  profileBadges: string[] | null | undefined,
  reviewCount: number,
  rating: number,
  trustState: TrustState | undefined,
  barberId: string,
  shopId?: string
) {
  const nonVerificationBadges = toBadgeList(profileBadges, reviewCount, rating).filter(
    (badge) => !["verified_identity", "verified_license", "verified_shop"].includes(badge)
  );

  if (!trustState) {
    return toBadgeList(profileBadges, reviewCount, rating);
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

async function readCanonicalSnapshot(supabase: SupabaseClient): Promise<CanonicalSnapshot> {
  const [
    barbersResult,
    barberProfilesResult,
    profilesResult,
    servicesResult,
    locationsResult,
    availabilityResult,
    blockedTimesResult,
    appointmentsResult,
    reviewsResult,
    marketplaceVisibilityResult
  ] = await Promise.all([
    supabase.from("barbers").select("id, reference_code, profile_id, compensation_model, app_approval_status, shop_approval_status, commission_rate, booth_rent_amount, booth_rent_frequency, bio, booking_slug"),
    supabase.from("barber_profiles").select("barber_reference, username, display_name, bio, years_experience, shop_reference, specialties, badges, service_area_label, next_available_at, visibility_state"),
    supabase.from("profiles").select("id, full_name, email, phone, primary_onboarding_role"),
    supabase.from("services").select("id, reference_code, location_id, category, name, description, duration_min, buffer_min, price, currency, deposit_amount, full_prepay_required, active, is_bookable, display_order, created_at, updated_at, service_owner_type, barber_reference, shop_reference, booking_count, popularity_rank").eq("active", true),
    supabase.from("locations").select("id, reference_code, name, neighborhood, city, state, phone, address, latitude, longitude"),
    supabase.from("availability_rules").select("barber_id, location_id, weekday, start_time, end_time"),
    supabase.from("blocked_times").select("barber_id, starts_at, ends_at, reason"),
    supabase.from("appointments").select("id, reference_code, barber_id, client_id, service_id, location_id, status, starts_at, ends_at, total_amount"),
    supabase.from("reviews").select("id, appointment_id, barber_id, client_id, location_id, rating, message, created_at"),
    supabase.from("marketplace_visibility").select("barber_reference, visibility_state, accepts_instant_bookings, featured_rank")
  ]);

  for (const result of [
    barbersResult,
    barberProfilesResult,
    profilesResult,
    servicesResult,
    locationsResult,
    availabilityResult,
    blockedTimesResult,
    appointmentsResult,
    reviewsResult,
    marketplaceVisibilityResult
  ]) {
    if (result.error) {
      throw result.error;
    }
  }

  return {
    barbers: (barbersResult.data ?? []) as CanonicalBarberRow[],
    barberProfiles: (barberProfilesResult.data ?? []) as CanonicalBarberProfileRow[],
    profiles: (profilesResult.data ?? []) as CanonicalProfileRow[],
    services: (servicesResult.data ?? []) as CanonicalServiceRow[],
    locations: (locationsResult.data ?? []) as CanonicalLocationRow[],
    availabilityRules: (availabilityResult.data ?? []) as CanonicalAvailabilityRuleRow[],
    blockedTimes: (blockedTimesResult.data ?? []) as CanonicalBlockedTimeRow[],
    appointments: (appointmentsResult.data ?? []) as CanonicalAppointmentRow[],
    reviews: (reviewsResult.data ?? []) as CanonicalReviewRow[],
    marketplaceVisibility: (marketplaceVisibilityResult.data ?? []) as CanonicalMarketplaceVisibilityRow[]
  };
}
function computeServicePopularity(
  services: Service[],
  serviceUuidByReference: Map<string, string>,
  appointments: CanonicalAppointmentRow[],
  reviews: CanonicalReviewRow[]
) {
  const metricsByService = new Map<string, ServicePopularityMetrics>();
  const rows = services.map((service) => {
    const serviceUuid = serviceUuidByReference.get(service.id) ?? service.id;
    const serviceAppointments = appointments.filter((entry) => entry.service_id === serviceUuid && entry.status !== "cancelled" && entry.status !== "no_show");
    const completed = serviceAppointments.filter((entry) => entry.status === "completed");
    const uniqueClients = [...new Set(completed.map((entry) => entry.client_id))];
    const repeatClients = uniqueClients.filter((clientId) => completed.filter((entry) => entry.client_id === clientId).length > 1).length;
    const relatedReviews = reviews.filter((entry) => completed.some((appointment) => appointment.id === entry.appointment_id));
    const metrics: ServicePopularityMetrics = {
      bookingCount: serviceAppointments.length,
      revenueGenerated: Number(completed.reduce((sum, entry) => sum + numeric(entry.total_amount), 0).toFixed(2)),
      averageRating: relatedReviews.length
        ? Number((relatedReviews.reduce((sum, entry) => sum + entry.rating, 0) / relatedReviews.length).toFixed(1))
        : 0,
      repeatRate: uniqueClients.length ? Math.round((repeatClients / uniqueClients.length) * 100) : 0,
      popularityRank: 0
    };
    metricsByService.set(service.id, metrics);
    return { serviceId: service.id, bookingCount: metrics.bookingCount, revenueGenerated: metrics.revenueGenerated };
  }).sort((left, right) => right.bookingCount - left.bookingCount || right.revenueGenerated - left.revenueGenerated);

  rows.forEach((entry, index) => {
    const current = metricsByService.get(entry.serviceId);
    if (current) {
      current.popularityRank = index + 1;
    }
  });

  return metricsByService;
}

function mapService(row: CanonicalServiceRow, locationReference: string): Service {
  return {
    id: toReference(row.id, row.reference_code),
    category: row.category,
    name: row.name,
    description: row.description ?? "",
    durationMin: row.duration_min,
    bufferMin: row.buffer_min,
    price: numeric(row.price),
    deposit: numeric(row.deposit_amount),
    fullPrepay: row.full_prepay_required,
    addOnIds: [],
    ownerType: row.service_owner_type ?? "shop",
    barberId: row.barber_reference ?? undefined,
    shopId: row.shop_reference ?? locationReference,
    currency: row.currency ?? "usd",
    isActive: row.active,
    isBookable: row.is_bookable !== false,
    displayOrder: row.display_order ?? 0,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function getCandidateLocationReferences(
  barberReference: string,
  barberUuid: string,
  services: CanonicalServiceRow[],
  availabilityRules: CanonicalAvailabilityRuleRow[],
  appointments: CanonicalAppointmentRow[],
  locationReferenceByUuid: Map<string, string>
) {
  const references = new Set<string>();

  availabilityRules
    .filter((entry) => entry.barber_id === barberUuid)
    .forEach((entry) => references.add(locationReferenceByUuid.get(entry.location_id) ?? entry.location_id));

  services
    .filter((entry) => entry.barber_reference === barberReference || entry.barber_reference === barberUuid)
    .forEach((entry) => references.add(entry.shop_reference ?? locationReferenceByUuid.get(entry.location_id) ?? entry.location_id));

  appointments
    .filter((entry) => entry.barber_id === barberUuid)
    .forEach((entry) => references.add(locationReferenceByUuid.get(entry.location_id) ?? entry.location_id));

  return [...references];
}

function getServicesForBarber(
  barberReference: string,
  barberUuid: string,
  locationReferences: string[],
  rows: CanonicalServiceRow[],
  locationReferenceByUuid: Map<string, string>
) {
  const services = rows
    .filter((row) => {
      const locationReference = locationReferenceByUuid.get(row.location_id) ?? row.location_id;
      const directBarberMatch = row.barber_reference === barberReference || row.barber_reference === barberUuid;
      const sharedShopMatch = !row.barber_reference && locationReferences.includes(row.shop_reference ?? locationReference);
      const sharedLocationMatch = !row.shop_reference && locationReferences.includes(locationReference);
      return row.active && row.is_bookable !== false && (directBarberMatch || sharedShopMatch || sharedLocationMatch);
    })
    .map((row) => mapService(row, locationReferenceByUuid.get(row.location_id) ?? row.location_id));

  const unique = new Map<string, Service>();
  for (const service of services) {
    unique.set(service.id, service);
  }

  return [...unique.values()].sort((left, right) => {
    const displayOrder = (left.displayOrder ?? Number.MAX_SAFE_INTEGER) - (right.displayOrder ?? Number.MAX_SAFE_INTEGER);
    if (displayOrder !== 0) {
      return displayOrder;
    }
    if ((left.price ?? 0) !== (right.price ?? 0)) {
      return left.price - right.price;
    }
    return left.name.localeCompare(right.name);
  });
}

function listAvailabilitySlotsForBarber(params: {
  barberReference: string;
  barberUuid: string;
  locationReference: string;
  locationUuidByReference: Map<string, string>;
  service: Service;
  availabilityRules: CanonicalAvailabilityRuleRow[];
  appointments: CanonicalAppointmentRow[];
  blockedTimes: CanonicalBlockedTimeRow[];
  days?: number;
  earliestAt?: string;
}) {
  const {
    barberReference,
    barberUuid,
    locationReference,
    locationUuidByReference,
    service,
    availabilityRules,
    appointments,
    blockedTimes,
    days = 7,
    earliestAt
  } = params;

  const locationUuid = locationUuidByReference.get(locationReference);
  if (!locationUuid) {
    return [] as CanonicalSlot[];
  }

  const rules = availabilityRules.filter((entry) => entry.barber_id === barberUuid && entry.location_id === locationUuid);
  if (!rules.length) {
    return [] as CanonicalSlot[];
  }

  const unavailableAppointments = appointments
    .filter((entry) => entry.barber_id === barberUuid && entry.status !== "cancelled" && entry.status !== "no_show")
    .map((entry) => ({ startsAt: entry.starts_at, endsAt: entry.ends_at }));
  const blockedRanges = blockedTimes
    .filter((entry) => entry.barber_id === barberUuid)
    .map((entry) => ({ startsAt: entry.starts_at, endsAt: entry.ends_at }));
  const durationMinutes = service.durationMin + service.bufferMin;
  const slots: CanonicalSlot[] = [];
  const now = new Date();
  const earliestDate = earliestAt ? new Date(earliestAt) : null;
  const earliestThreshold = earliestDate && !Number.isNaN(earliestDate.getTime())
    ? Math.max(now.getTime() + 15 * 60_000, earliestDate.getTime())
    : now.getTime() + 15 * 60_000;

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + offset);
    const weekday = day.getDay();
    const dayRules = rules.filter((entry) => entry.weekday === weekday);

    for (const rule of dayRules) {
      const cursor = withTime(day, rule.start_time);
      const endBoundary = withTime(day, rule.end_time);

      while (cursor.getTime() + durationMinutes * 60_000 <= endBoundary.getTime()) {
        const slotStart = new Date(cursor);
        const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);
        const isFuture = slotStart.getTime() >= earliestThreshold;
        if (
          isFuture &&
          !overlapsRange(slotStart, slotEnd, unavailableAppointments) &&
          !overlapsRange(slotStart, slotEnd, blockedRanges)
        ) {
          slots.push({
            startsAt: slotStart.toISOString(),
            endsAt: slotEnd.toISOString(),
            label: createSlotLabel(slotStart),
            locationId: locationReference,
            barberId: barberReference,
            serviceId: service.id
          });
        }

        cursor.setMinutes(cursor.getMinutes() + 30);
      }
    }
  }

  return slots;
}

function getMatchClassification(candidate: {
  barberReference: string;
  locationReference: string;
  nextAvailableAt: string;
  favoriteBarberReference?: string;
  favoriteShopReference?: string;
}) {
  if (candidate.favoriteBarberReference && candidate.barberReference === candidate.favoriteBarberReference) {
    return "favorite_barber" as const;
  }

  if (candidate.favoriteShopReference && candidate.locationReference === candidate.favoriteShopReference) {
    return "favorite_shop" as const;
  }

  const minutesUntilNext = Math.round((new Date(candidate.nextAvailableAt).getTime() - Date.now()) / 60_000);
  if (minutesUntilNext <= 45) {
    return "available_now" as const;
  }

  return "nearby" as const;
}

function getMatchReason(input: {
  matchedFrom: HaircutNowMatch["matchedFrom"];
  barberName: string;
  locationName: string;
  routineDueSoon: boolean;
  serviceName?: string;
}) {
  if (input.matchedFrom === "favorite_barber") {
    return input.routineDueSoon
      ? `${input.barberName} is open right when your usual comeback window hits, so you can stay on schedule without extra searching.`
      : `${input.barberName} is your fastest trusted chair right now.`;
  }

  if (input.matchedFrom === "favorite_shop") {
    return `${input.locationName} has the cleanest same-day opening for a quick booking right now.`;
  }

  if (input.matchedFrom === "available_now") {
    return input.serviceName
      ? `${input.serviceName} can start soon with the fastest real opening we found nearby.`
      : "This is the fastest confirmed chair we can place for you right now.";
  }

  return "Best nearby match for time, shop fit, and booking confidence.";
}

function getRankingLabel(
  matchedFrom: HaircutNowMatch["matchedFrom"],
  routineDueSoon: boolean,
  reviewCount: number
) {
  if (matchedFrom === "favorite_barber") {
    return routineDueSoon ? "Routine priority" : "Favorite barber";
  }
  if (matchedFrom === "favorite_shop") {
    return "Preferred shop";
  }
  if (matchedFrom === "available_now") {
    return "Fastest chair";
  }
  return reviewCount >= 3 ? "Trusted nearby" : "Open nearby";
}
function buildCandidateRecords(
  snapshot: CanonicalSnapshot,
  options: {
    locationId: string;
    query?: string;
    category?: string;
    clientSignal?: ClientBookingSignal;
    routine?: RoutineSignal | null;
    trustState?: TrustState;
  }
) {
  const normalizedQuery = options.query?.trim().toLowerCase() ?? "";
  const normalizedCategory = options.category?.trim().toLowerCase() ?? "";
  const locations = snapshot.locations.map(mapLocation);
  const locationsByReference = new Map(locations.map((location) => [location.id, location]));
  const locationReferenceByUuid = new Map(snapshot.locations.map((row) => [row.id, toReference(row.id, row.reference_code)]));
  const locationUuidByReference = new Map(snapshot.locations.map((row) => [toReference(row.id, row.reference_code), row.id]));
  const profilesById = new Map(snapshot.profiles.map((row) => [row.id, row]));
  const barberProfilesByReference = new Map(snapshot.barberProfiles.map((row) => [row.barber_reference, row]));
  const servicesById = new Map(snapshot.services.map((row) => [row.id, row]));
  const defaultLocation = locationsByReference.get(options.locationId) ?? locations[0];
  if (!defaultLocation) {
    return [];
  }

  return snapshot.barbers.flatMap((barberRow) => {
    const barberReference = toReference(barberRow.id, barberRow.reference_code);
    const profileRow = barberProfilesByReference.get(barberReference);
    const profile = profilesById.get(barberRow.profile_id);
    if (
      profile?.primary_onboarding_role !== "barber"
      || !isCanonicalBarberPlatformApproved(barberRow)
      || !profileRow
      || !isCanonicalMarketplaceVisibilityReady(snapshot, barberReference, profileRow)
      || !hasRealMarketplaceText(profileRow.username)
      || !hasRealMarketplaceText(profile?.full_name ?? profileRow.display_name)
      || !isBarberDiscoverable(options.trustState, barberReference)
    ) {
      return [];
    }
    const rawLocationReferences = getCandidateLocationReferences(
      barberReference,
      barberRow.id,
      snapshot.services,
      snapshot.availabilityRules,
      snapshot.appointments,
      locationReferenceByUuid
    );
    const locationReferences = rawLocationReferences.filter((locationReference) =>
      isLocationPubliclyBookable(options.trustState, locationReference)
    );
    const services = getServicesForBarber(barberReference, barberRow.id, locationReferences, snapshot.services, locationReferenceByUuid);
    if (!services.length || !locationReferences.length) {
      return [];
    }

    const matchingServices = services.filter((service) => {
      if (normalizedCategory && !`${service.category} ${service.name}`.toLowerCase().includes(normalizedCategory)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return serviceMatchScore(service, normalizedQuery) > 0;
    });
    const servicePool = matchingServices.length ? matchingServices : services;
    const bookableServicePool = servicePool.filter((service) =>
      isMarketplaceBookableService(service)
      && ![service.id, service.name, service.category, service.barberId, service.shopId].some(isKnownNonProductionMarketplaceValue)
    );
    const primaryService = [...bookableServicePool].sort((left, right) => left.price - right.price)[0];
    if (!primaryService) {
      return [];
    }
    const candidateLocationReference = options.clientSignal?.favoriteShopReference && locationReferences.includes(options.clientSignal.favoriteShopReference)
      ? options.clientSignal.favoriteShopReference
      : locationReferences.includes(options.locationId)
        ? options.locationId
        : locationReferences[0];
    const slots = listAvailabilitySlotsForBarber({
      barberReference,
      barberUuid: barberRow.id,
      locationReference: candidateLocationReference,
      locationUuidByReference,
      service: primaryService,
      availabilityRules: snapshot.availabilityRules,
      appointments: snapshot.appointments,
      blockedTimes: snapshot.blockedTimes
    });
    const nextSlot = slots[0];
    if (!nextSlot) {
      return [];
    }

    const location = locationsByReference.get(candidateLocationReference);
    if (!location) {
      return [];
    }

    const barberAppointments = snapshot.appointments.filter((entry) => entry.barber_id === barberRow.id);
    const completedAppointments = barberAppointments.filter((entry) => entry.status === "completed");
    const cancelledCount = barberAppointments.filter((entry) => entry.status === "cancelled").length;
    const reviewRows = snapshot.reviews.filter((entry) => entry.barber_id === barberRow.id);
    const reviewCount = reviewRows.length;
    const rating = Number(((reviewCount
      ? reviewRows.reduce((sum, entry) => sum + entry.rating, 0) / reviewCount
      : 5)).toFixed(1));
    const serviceCounts = new Map<string, number>();
    completedAppointments.forEach((entry) => {
      const serviceReference = toReference(entry.service_id, servicesById.get(entry.service_id)?.reference_code);
      serviceCounts.set(serviceReference, (serviceCounts.get(serviceReference) ?? 0) + 1);
    });
    const mostBookedServiceReference = [...serviceCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    const mostBookedService = bookableServicePool.find((service) => service.id === mostBookedServiceReference)?.name
      ?? primaryService.name;
    const specialties = profileRow?.specialties?.length
      ? profileRow.specialties
      : [...new Set(bookableServicePool.slice(0, 3).map((service) => service.category))];
    const distanceMiles = Number(haversineMiles(defaultLocation, location).toFixed(1));
    const routineDueSoon = Boolean(options.routine?.nextSuggestedAt) && new Date(options.routine!.nextSuggestedAt!).getTime() <= Date.now() + 3 * 24 * 60 * 60 * 1000;
    const matchedFrom = getMatchClassification({
      barberReference,
      locationReference: candidateLocationReference,
      nextAvailableAt: nextSlot.startsAt,
      favoriteBarberReference: options.clientSignal?.favoriteBarberReference,
      favoriteShopReference: options.clientSignal?.favoriteShopReference
    });
    const name = profile?.full_name ?? profileRow?.display_name ?? barberReference;
    const queryScore = normalizedQuery
      ? `${name} ${profileRow?.username ?? barberRow.booking_slug ?? ""} ${location.name} ${location.neighborhood} ${services.map((service) => service.name).join(" ")}`.toLowerCase().includes(normalizedQuery)
        ? 24
        : 0
      : 0;
    if (normalizedQuery && queryScore === 0 && matchingServices.length === 0) {
      return [];
    }
    const waitMinutes = Math.max(0, Math.round((new Date(nextSlot.startsAt).getTime() - Date.now()) / 60_000));
    const availabilityScore = Math.max(0, 80 - waitMinutes);
    const preferredBarberBoost = matchedFrom === "favorite_barber" ? 90 : 0;
    const preferredShopBoost = matchedFrom === "favorite_shop" ? 54 : 0;
    const routineBoost = routineDueSoon && options.routine?.barberReference === barberReference ? 30 : 0;
    const reviewScore = rating * 12 + reviewCount * 2;
    const conversionScore = completedAppointments.length * 4 - cancelledCount * 3;
    const distanceScore = Math.max(0, 18 - distanceMiles * 3);
    const accelerationScore = preferredBarberBoost + preferredShopBoost + routineBoost + availabilityScore + reviewScore + conversionScore + distanceScore + queryScore;

    return [{
      barberId: barberReference,
      barberUuid: barberRow.id,
      username: profileRow?.username ?? barberRow.booking_slug ?? slugify(name),
      barberName: name,
      rating,
      reviewCount,
      priceRange: [
        Math.min(...bookableServicePool.map((service) => service.price)),
        Math.max(...bookableServicePool.map((service) => service.price))
      ],
      nextAvailableAt: nextSlot.startsAt,
      appointmentTime: nextSlot.startsAt,
      distanceMiles,
      shopName: location.name,
      locationId: candidateLocationReference,
      location,
      specialties,
      mostBookedService,
      matchedFrom,
      matchReason: getMatchReason({
        matchedFrom,
        barberName: name,
        locationName: location.name,
        routineDueSoon,
        serviceName: primaryService.name
      }),
      rankingLabel: getRankingLabel(matchedFrom, routineDueSoon, reviewCount),
      badges: toCanonicalMarketplaceBadges(
        profileRow?.badges,
        reviewCount,
        rating,
        options.trustState,
        barberReference,
        candidateLocationReference
      ),
      serviceOptions: bookableServicePool,
      primaryService,
      completedCount: completedAppointments.length,
      cancelledCount,
      accelerationScore
    } satisfies CandidateRecord];
  }).sort((left, right) => right.accelerationScore - left.accelerationScore || new Date(left.nextAvailableAt).getTime() - new Date(right.nextAvailableAt).getTime());
}

export async function buildCanonicalDiscoveryResults(
  supabase: SupabaseClient,
  options: {
    locationId: string;
    query?: string;
    category?: string;
    clientSignal?: ClientBookingSignal;
    routine?: RoutineSignal | null;
    trustState?: TrustState;
  }
) {
  const snapshot = await readCanonicalSnapshot(supabase);
  const candidates = buildCandidateRecords(snapshot, options);

  return candidates.map((candidate) => ({
    barberId: candidate.barberId,
    username: candidate.username,
    barberName: candidate.barberName,
    locationId: candidate.locationId,
    locationLabel: candidate.location.name,
    rating: candidate.rating,
    reviewCount: candidate.reviewCount,
    priceRange: candidate.priceRange,
    nextAvailableAt: candidate.nextAvailableAt,
    distanceMiles: candidate.distanceMiles,
    shopName: candidate.shopName,
    specialties: candidate.specialties,
    mostBookedService: candidate.mostBookedService,
    mostBookedServiceId: candidate.primaryService?.id,
    badges: candidate.badges,
    rankingLabel: candidate.rankingLabel,
    bookingHref: buildMarketplaceBookingHref({
      barberId: candidate.barberId,
      username: candidate.username,
      locationId: candidate.locationId,
      serviceId: candidate.primaryService?.id,
      sourceKind: options.query || options.category ? "discovery" : "client_dashboard",
      matchedFrom: candidate.matchedFrom,
      query: options.query || options.category || candidate.mostBookedService,
      appointmentTime: candidate.appointmentTime
    })
  } satisfies DiscoveryResult));
}

export async function buildCanonicalNextAvailableMatch(
  supabase: SupabaseClient,
  options: {
    locationId: string;
    clientSignal?: ClientBookingSignal;
    routine?: RoutineSignal | null;
    trustState?: TrustState;
  }
) {
  const snapshot = await readCanonicalSnapshot(supabase);
  const candidate = buildCandidateRecords(snapshot, options)[0];
  if (!candidate) {
    return null;
  }

  return {
    barberId: candidate.barberId,
    username: candidate.username,
    barberName: candidate.barberName,
    matchedFrom: candidate.matchedFrom,
    matchReason: candidate.matchReason,
    appointmentTime: candidate.appointmentTime,
    locationId: candidate.locationId,
    shopName: candidate.shopName,
    priceFrom: candidate.priceRange[0],
    rating: candidate.rating
  } satisfies HaircutNowMatch;
}

export async function findCanonicalBookableSlot(
  supabase: SupabaseClient,
  barberIdOrUsername: string,
  options: {
    serviceId?: string;
    preferredLocationId?: string;
    days?: number;
    earliestAt?: string;
    trustState?: TrustState;
  }
) {
  const snapshot = await readCanonicalSnapshot(supabase);
  const barberProfilesByReference = new Map(snapshot.barberProfiles.map((row) => [row.barber_reference, row]));
  const barberByUsername = new Map(snapshot.barberProfiles.map((row) => [row.username, row.barber_reference]));
  const barberRow = snapshot.barbers.find((row) => {
    const reference = toReference(row.id, row.reference_code);
    return reference === barberIdOrUsername
      || row.id === barberIdOrUsername
      || row.booking_slug === barberIdOrUsername
      || barberByUsername.get(barberIdOrUsername) === reference
      || barberProfilesByReference.get(reference)?.username === barberIdOrUsername;
  });
  if (!barberRow) {
    return null;
  }

  const locationReferenceByUuid = new Map(snapshot.locations.map((row) => [row.id, toReference(row.id, row.reference_code)]));
  const locationUuidByReference = new Map(snapshot.locations.map((row) => [toReference(row.id, row.reference_code), row.id]));
  const barberReference = toReference(barberRow.id, barberRow.reference_code);
  const profileRow = barberProfilesByReference.get(barberReference);
  if (
    !isCanonicalBarberPlatformApproved(barberRow)
    || !isCanonicalMarketplaceVisibilityReady(snapshot, barberReference, profileRow)
    || !isBarberDiscoverable(options.trustState, barberReference)
  ) {
    return null;
  }

  const bookingGate = getBarberBookingGate(options.trustState, barberReference);
  if (bookingGate && !bookingGate.allowed) {
    return null;
  }

  const rawLocationReferences = getCandidateLocationReferences(
    barberReference,
    barberRow.id,
    snapshot.services,
    snapshot.availabilityRules,
    snapshot.appointments,
    locationReferenceByUuid
  );
  const locationReferences = rawLocationReferences.filter((locationReference) =>
    isLocationPubliclyBookable(options.trustState, locationReference)
  );
  const services = getServicesForBarber(barberReference, barberRow.id, locationReferences, snapshot.services, locationReferenceByUuid);
  const bookableServices = services.filter((service) =>
    isMarketplaceBookableService(service)
    && ![service.id, service.name, service.category, service.barberId, service.shopId].some(isKnownNonProductionMarketplaceValue)
  );
  const selectedService = bookableServices.find((entry) => entry.id === options.serviceId) ?? bookableServices[0] ?? null;
  if (!selectedService) {
    return null;
  }

  const candidateLocations = (
    options.preferredLocationId
      ? [options.preferredLocationId, ...locationReferences.filter((entry) => entry !== options.preferredLocationId)]
      : locationReferences
  ).filter((locationReference) => isLocationPubliclyBookable(options.trustState, locationReference));
  const slots = candidateLocations.flatMap((locationReference) =>
    listAvailabilitySlotsForBarber({
      barberReference,
      barberUuid: barberRow.id,
      locationReference,
      locationUuidByReference,
      service: selectedService,
      availabilityRules: snapshot.availabilityRules,
      appointments: snapshot.appointments,
      blockedTimes: snapshot.blockedTimes,
      days: options.days,
      earliestAt: options.earliestAt
    })
  ).sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  const slot = slots[0];
  if (!slot) {
    return null;
  }

  return {
    barberId: barberReference,
    locationId: slot.locationId,
    service: {
      id: selectedService.id,
      name: selectedService.name,
      durationMin: selectedService.durationMin,
      bufferMin: selectedService.bufferMin,
      price: selectedService.price,
      deposit: selectedService.deposit,
      fullPrepay: selectedService.fullPrepay
    },
    slot
  };
}
export async function buildCanonicalAvailabilityPayload(
  supabase: SupabaseClient,
  barberIdOrUsername: string,
  options: {
    serviceId?: string;
    locationId?: string;
    days?: number;
    earliestAt?: string;
    trustState?: TrustState;
  }
) {
  const snapshot = await readCanonicalSnapshot(supabase);
  const barberProfilesByReference = new Map(snapshot.barberProfiles.map((row) => [row.barber_reference, row]));
  const barberByUsername = new Map(snapshot.barberProfiles.map((row) => [row.username, row.barber_reference]));
  const barberRow = snapshot.barbers.find((row) => {
    const reference = toReference(row.id, row.reference_code);
    return reference === barberIdOrUsername
      || row.id === barberIdOrUsername
      || row.booking_slug === barberIdOrUsername
      || barberByUsername.get(barberIdOrUsername) === reference
      || barberProfilesByReference.get(reference)?.username === barberIdOrUsername;
  });
  if (!barberRow) {
    return null;
  }

  const locationReferenceByUuid = new Map(snapshot.locations.map((row) => [row.id, toReference(row.id, row.reference_code)]));
  const locationUuidByReference = new Map(snapshot.locations.map((row) => [toReference(row.id, row.reference_code), row.id]));
  const barberReference = toReference(barberRow.id, barberRow.reference_code);
  const profileRow = barberProfilesByReference.get(barberReference);
  if (
    !isCanonicalBarberPlatformApproved(barberRow)
    || !isCanonicalMarketplaceVisibilityReady(snapshot, barberReference, profileRow)
    || !isBarberDiscoverable(options.trustState, barberReference)
  ) {
    return {
      barberId: barberReference,
      locationId: options.locationId ?? "",
      service: null,
      slots: [],
      gating: getBarberBookingGate(options.trustState, barberReference)
    };
  }

  const bookingGate = getBarberBookingGate(options.trustState, barberReference);
  const rawLocationReferences = getCandidateLocationReferences(
    barberReference,
    barberRow.id,
    snapshot.services,
    snapshot.availabilityRules,
    snapshot.appointments,
    locationReferenceByUuid
  );
  const locationReferences = rawLocationReferences.filter((locationReference) =>
    isLocationPubliclyBookable(options.trustState, locationReference)
  );
  const services = getServicesForBarber(barberReference, barberRow.id, locationReferences, snapshot.services, locationReferenceByUuid);
  const bookableServices = services.filter((service) =>
    isMarketplaceBookableService(service)
    && ![service.id, service.name, service.category, service.barberId, service.shopId].some(isKnownNonProductionMarketplaceValue)
  );
  const selectedService = bookableServices.find((entry) => entry.id === options.serviceId) ?? bookableServices[0] ?? null;
  const locationId = options.locationId ?? locationReferences[0] ?? rawLocationReferences[0];
  const locationGate = getLocationActivationGate(options.trustState, locationId);
  if (!selectedService || !locationId) {
    return {
      barberId: barberReference,
      locationId: locationId ?? "",
      service: null,
      slots: [],
      gating: bookingGate && !bookingGate.allowed ? bookingGate : locationGate
    };
  }

  if ((bookingGate && !bookingGate.allowed) || (locationGate && !locationGate.allowed)) {
    return {
      barberId: barberReference,
      locationId,
      service: {
        id: selectedService.id,
        name: selectedService.name,
        durationMin: selectedService.durationMin,
        bufferMin: selectedService.bufferMin,
        price: selectedService.price,
        deposit: selectedService.deposit,
        fullPrepay: selectedService.fullPrepay
      },
      slots: [],
      gating: (bookingGate && !bookingGate.allowed ? bookingGate : locationGate) ?? null
    };
  }

  const slots = listAvailabilitySlotsForBarber({
    barberReference,
    barberUuid: barberRow.id,
    locationReference: locationId,
    locationUuidByReference,
    service: selectedService,
    availabilityRules: snapshot.availabilityRules,
    appointments: snapshot.appointments,
    blockedTimes: snapshot.blockedTimes,
    days: options.days,
    earliestAt: options.earliestAt
  });

  return {
    barberId: barberReference,
    locationId,
    service: {
      id: selectedService.id,
      name: selectedService.name,
      durationMin: selectedService.durationMin,
      bufferMin: selectedService.bufferMin,
      price: selectedService.price,
      deposit: selectedService.deposit,
      fullPrepay: selectedService.fullPrepay
    },
    slots: slots.slice(0, 16),
    gating: null
  };
}
export async function buildCanonicalBarberProfile(
  supabase: SupabaseClient,
  barberIdOrUsername: string,
  trustState?: TrustState
): Promise<PublicBarberProfileView | null> {
  const snapshot = await readCanonicalSnapshot(supabase);
  const barberProfilesByReference = new Map(snapshot.barberProfiles.map((row) => [row.barber_reference, row]));
  const barberByUsername = new Map(snapshot.barberProfiles.map((row) => [row.username, row.barber_reference]));
  const barberRow = snapshot.barbers.find((row) => {
    const reference = toReference(row.id, row.reference_code);
    const usernameReference = barberByUsername.get(barberIdOrUsername);
    return reference === barberIdOrUsername
      || row.id === barberIdOrUsername
      || row.booking_slug === barberIdOrUsername
      || usernameReference === reference;
  });
  if (!barberRow) {
    return null;
  }

  const barberReference = toReference(barberRow.id, barberRow.reference_code);
  if (!isCanonicalBarberPlatformApproved(barberRow) || !isBarberDiscoverable(trustState, barberReference)) {
    return null;
  }

  const profileRow = barberProfilesByReference.get(barberReference);
  const profile = snapshot.profiles.find((entry) => entry.id === barberRow.profile_id);
  if (
    profile?.primary_onboarding_role !== "barber"
    || !profileRow
    || !isCanonicalMarketplaceVisibilityReady(snapshot, barberReference, profileRow)
    || !hasRealMarketplaceText(profileRow.username)
    || !hasRealMarketplaceText(profile?.full_name ?? profileRow.display_name)
  ) {
    return null;
  }
  const locationReferenceByUuid = new Map(snapshot.locations.map((row) => [row.id, toReference(row.id, row.reference_code)]));
  const locationUuidByReference = new Map(snapshot.locations.map((row) => [toReference(row.id, row.reference_code), row.id]));
  const rawLocationReferences = getCandidateLocationReferences(
    barberReference,
    barberRow.id,
    snapshot.services,
    snapshot.availabilityRules,
    snapshot.appointments,
    locationReferenceByUuid
  );
  const locationReferences = rawLocationReferences.filter((locationReference) =>
    isLocationPubliclyBookable(trustState, locationReference)
  );
  const locations = snapshot.locations
    .map(mapLocation)
    .filter((location) => locationReferences.includes(location.id))
  const services = getServicesForBarber(barberReference, barberRow.id, locationReferences, snapshot.services, locationReferenceByUuid);
  const bookableServices = services.filter((service) =>
    isMarketplaceBookableService(service)
    && ![service.id, service.name, service.category, service.barberId, service.shopId].some(isKnownNonProductionMarketplaceValue)
  );
  if (!locations.length || !bookableServices.length) {
    return null;
  }

  const serviceUuidByReference = new Map(snapshot.services.map((row) => [toReference(row.id, row.reference_code), row.id]));
  const serviceMetrics = computeServicePopularity(bookableServices, serviceUuidByReference, snapshot.appointments, snapshot.reviews);
  const serviceCatalog = bookableServices
    .map((service) => ({
      service,
      popularity: serviceMetrics.get(service.id) ?? {
        bookingCount: 0,
        revenueGenerated: 0,
        averageRating: 0,
        repeatRate: 0,
        popularityRank: Number.MAX_SAFE_INTEGER
      },
      ownerLabel: service.ownerType === "barber" ? "Barber-owned" : "Shop service",
      canEdit: false,
      styleTags: []
    } satisfies ServiceCatalogItem))
    .sort((left, right) => left.popularity.popularityRank - right.popularity.popularityRank || left.service.price - right.service.price);
  const reviewRows = snapshot.reviews.filter((entry) => entry.barber_id === barberRow.id);
  const reviews = reviewRows.map((row) => ({
    id: row.id,
    barberId: barberReference,
    clientId: row.client_id,
    locationId: locationReferenceByUuid.get(row.location_id) ?? row.location_id,
    rating: row.rating,
    sentiment: row.rating >= 5 ? "great" : row.rating >= 4 ? "good" : "watch",
    message: row.message ?? "",
    createdAt: row.created_at
  } satisfies Review));
  const averageRating = Number(((reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 5)).toFixed(1));
  const primaryLocation = locations[0];
  const nextSlots = listAvailabilitySlotsForBarber({
    barberReference,
    barberUuid: barberRow.id,
    locationReference: primaryLocation.id,
    locationUuidByReference,
    service: serviceCatalog[0].service,
    availabilityRules: snapshot.availabilityRules,
    appointments: snapshot.appointments,
    blockedTimes: snapshot.blockedTimes
  });
  const nextSlot = nextSlots[0];
  if (!nextSlot) {
    return null;
  }

  const nextAvailableAt = nextSlot.startsAt;
  const completedAppointments = snapshot.appointments.filter((entry) => entry.barber_id === barberRow.id && entry.status === "completed");
  const bookingsCreated = snapshot.appointments.filter((entry) => entry.barber_id === barberRow.id && entry.status !== "cancelled").length;
  const completionRate = bookingsCreated ? Math.round((completedAppointments.length / bookingsCreated) * 100) : 100;
  const locationIds = locations.map((location) => location.id);
  const name = profile?.full_name ?? profileRow?.display_name ?? barberReference;
  const username = profileRow?.username ?? barberRow.booking_slug ?? slugify(name);
  const trustSignal = trustState ? buildPublicTrustSignal(trustState, barberReference, primaryLocation.id) : null;
  const ratingBadges = toCanonicalMarketplaceBadges(
    profileRow?.badges,
    reviews.length,
    averageRating,
    trustState,
    barberReference,
    primaryLocation.id
  );
  const mostBookedService = serviceCatalog[0];
  const barber: Barber = {
    id: barberReference,
    userId: barberRow.profile_id,
    name,
    role: barberRow.compensation_model === "booth_rent" ? "booth_rent_barber" : "commission_barber",
    locationIds,
    specialties: profileRow?.specialties?.length ? profileRow.specialties : [...new Set(serviceCatalog.map((entry) => entry.service.category))],
    rating: averageRating,
    reviewCount: reviews.length,
    compensationModel: barberRow.compensation_model,
    commissionRate: barberRow.compensation_model === "commission" ? numeric(barberRow.commission_rate) : undefined,
    boothRentAmount: barberRow.compensation_model === "booth_rent" ? numeric(barberRow.booth_rent_amount) : undefined,
    boothRentFrequency: barberRow.booth_rent_frequency ?? undefined,
    todayEarnings: Number(completedAppointments.filter((entry) => entry.starts_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((sum, entry) => sum + numeric(entry.total_amount), 0).toFixed(2)),
    upcomingPayout: Number(completedAppointments.reduce((sum, entry) => sum + numeric(entry.total_amount), 0).toFixed(2)),
    availabilityLabel: nextSlots[0] ? createSlotLabel(new Date(nextSlots[0].startsAt)) : "Open soon",
    bio: barberRow.bio ?? profileRow?.bio ?? `${name} is ready to book on BVRB3R.`,
    bookingLink: buildMarketplaceBookingHref({
      barberId: barberReference,
      username,
      locationId: primaryLocation.id,
      serviceId: mostBookedService?.service.id,
      sourceKind: "public_profile",
      appointmentTime: nextAvailableAt
    })
  };
  const profileView = {
    id: barberReference,
    barberId: barberReference,
    username,
    photoAccent: "#7cff00",
    yearsExperience: profileRow?.years_experience ?? 0,
    shopId: primaryLocation.id,
    headline: profileRow?.bio || barberRow.bio || `${name} on the BVRB3R network.`,
    specialties: barber.specialties,
    badges: ratingBadges,
    nextAvailableAt,
    serviceAreaLabel: profileRow?.service_area_label ?? `${primaryLocation.city} • ${primaryLocation.neighborhood}`,
    visibilityState: (profileRow?.visibility_state as "public" | "featured" | "hidden" | undefined) ?? "public"
  };
  const shop = toShop(primaryLocation);

  return {
    barber,
    profile: profileView,
    shop,
    services: serviceCatalog,
    portfolio: [],
    reviews,
    mostBookedService,
    nextAvailableAt,
    shopLocations: locations,
    priceRange: [
      Math.min(...serviceCatalog.map((entry) => entry.service.price)),
      Math.max(...serviceCatalog.map((entry) => entry.service.price))
    ],
    proof: {
      reviewScore: averageRating,
      reviewCount: reviews.length,
      followCount: 0,
      reputationScore: Number((averageRating * 20).toFixed(1)),
      rankingLabel: mostBookedService ? "Best booking fit" : undefined,
      profileViews: 0,
      bookingClicks: 0,
      bookingsCreated,
      bookingsCompleted: completedAppointments.length,
      conversionRate: 0,
      trustScore: trustSignal?.trustScore ?? Math.min(100, Math.round(averageRating * 20 + completedAppointments.length * 2)),
      completionRate,
      trustLabel: trustSignal?.trustLabel ?? (reviews.length ? "Review-backed" : "Booking-ready"),
      reviewIntegrityLabel: trustSignal?.reviewIntegrityLabel ?? (reviews.length ? "Client review history" : "New reputation track"),
      verificationLabels: trustSignal?.publicBadgeLabels ?? [],
      reputationTier: reviews.length >= 3 ? "Trusted" : "Rising"
    },
    bookingCtaHref: buildMarketplaceBookingHref({
      barberId: barberReference,
      username,
      locationId: primaryLocation.id,
      serviceId: mostBookedService?.service.id,
      sourceKind: "public_profile",
      appointmentTime: nextAvailableAt
    })
  };
}






