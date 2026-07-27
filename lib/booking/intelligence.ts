import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { getClientFacingBarberName } from "@/lib/marketplace/client-facing";
import { getCanonicalAccountRole, isBarberAccountRole, normalizeBarberSubtype, normalizeCompensationModel } from "@/lib/auth/roles";
import { isAvailabilityBlockingAppointmentStatus } from "@/lib/appointments/domain";
import {
  DEFAULT_BOOKING_TIME_ZONE,
  addDaysToDateKey,
  buildCanonicalDateAvailability,
  getDateKeyInTimeZone,
  getWeekdayForDateKey,
  normalizeAvailabilityDateKey,
  normalizeBookingTimeZone
} from "@/lib/booking/availability-slot-engine";
import {
  buildPublicTrustSignal,
  computeShopVerificationDecision,
  getVerificationGateDecision
} from "@/lib/trust/engine";
import {
  hasRealMarketplaceText,
  isKnownNonProductionMarketplaceValue,
  isMarketplaceApprovedStatus,
  isMarketplaceBookableService,
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
  address_line_2?: string | null;
  postal_code?: string | null;
  latitude: number | null;
  longitude: number | null;
};

type CanonicalProfileRow = {
  id: string;
  role?: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  primary_onboarding_role: string | null;
  onboarding_state?: string | null;
};

type CanonicalBarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
  compensation_model: "booth_rent" | "autobooth_rent" | "freelance" | string | null;
  default_money_relationship?: "freelance" | "booth_rent" | "autobooth_rent" | null;
  barber_subtype?: "freelance" | "booth_rent" | "autobooth_rent" | "blueprint" | null;
  app_approval_status: string | null;
  shop_approval_status: string | null;
  status?: string | null;
  onboarding_status?: string | null;
  is_bookable?: boolean | null;
  is_discoverable?: boolean | null;
  autobooth_percent: number | string | null;
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
  service_owner?: "barber" | "shop" | null;
  barber_reference: string | null;
  shop_reference: string | null;
  booking_count: number | null;
  popularity_rank: number | null;
  source_table?: "services" | "marketplace_services";
};

function normalizeCanonicalBarberRow(row: Partial<CanonicalBarberRow>): CanonicalBarberRow {
  const reference = row.reference_code ?? row.booking_slug ?? row.id ?? "";
  return {
    id: row.id ?? reference,
    reference_code: row.reference_code ?? row.booking_slug ?? null,
    profile_id: row.profile_id ?? "",
    compensation_model: row.compensation_model ?? row.barber_subtype ?? "freelance",
    default_money_relationship: row.default_money_relationship ?? null,
    barber_subtype: row.barber_subtype ?? "freelance",
    app_approval_status: row.app_approval_status ?? null,
    shop_approval_status: row.shop_approval_status ?? null,
    status: row.status ?? null,
    onboarding_status: row.onboarding_status ?? null,
    is_bookable: row.is_bookable ?? null,
    is_discoverable: row.is_discoverable ?? null,
    autobooth_percent: row.autobooth_percent ?? null,
    booth_rent_amount: row.booth_rent_amount ?? null,
    booth_rent_frequency: row.booth_rent_frequency ?? null,
    bio: row.bio ?? null,
    booking_slug: row.booking_slug ?? row.reference_code ?? null
  };
}

function normalizeCanonicalServiceRow(row: Partial<CanonicalServiceRow>): CanonicalServiceRow {
  const owner = row.service_owner_type ?? row.service_owner ?? (row.barber_reference ? "barber" : "shop");
  return {
    id: row.id ?? row.reference_code ?? "",
    reference_code: row.reference_code ?? null,
    location_id: row.location_id ?? row.shop_reference ?? "",
    category: row.category ?? "Haircut",
    name: row.name ?? "Service",
    description: row.description ?? null,
    duration_min: Number(row.duration_min ?? 0),
    buffer_min: Number(row.buffer_min ?? 0),
    price: row.price ?? 0,
    currency: row.currency ?? "usd",
    deposit_amount: row.deposit_amount ?? 0,
    full_prepay_required: row.full_prepay_required ?? true,
    active: row.active !== false,
    is_bookable: row.is_bookable !== false,
    display_order: row.display_order ?? 0,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    service_owner_type: owner,
    service_owner: owner,
    barber_reference: row.barber_reference ?? null,
    shop_reference: row.shop_reference ?? null,
    booking_count: row.booking_count ?? null,
    popularity_rank: row.popularity_rank ?? null,
    source_table: row.source_table ?? "services"
  };
}

type CanonicalAvailabilityRuleRow = {
  barber_id: string;
  location_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

type CanonicalBarberWorkingHoursRow = {
  barber_reference: string;
  shop_reference: string;
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
  username: string | null;
  display_name: string;
  bio: string;
  years_experience: number;
  shop_reference: string | null;
  profile_photo_path?: string | null;
  profile_photo_url?: string | null;
  specialties: string[] | null;
  badges: string[] | null;
  service_area_label: string | null;
  next_available_at: string | null;
  visibility_state: string;
};

type CanonicalPortfolioRow = {
  id: string;
  barber_reference: string;
  storage_path: string | null;
  image_url: string | null;
  caption: string | null;
  style_tag_ids: string[] | null;
  featured: boolean | null;
  created_at: string | null;
};

type CanonicalMarketplaceVisibilityRow = {
  barber_reference: string;
  visibility_state: string;
  accepts_instant_bookings: boolean;
  featured_rank: number | null;
};

type CanonicalBarberStatusRow = {
  barber_reference: string;
  status: string | null;
  live_status: string | null;
  accepting_bookings: boolean | null;
};

type CanonicalConnectedAccountRow = {
  subject_type: string | null;
  barber_id: string | null;
  payout_readiness_status: string | null;
  livemode?: boolean | null;
  charges_enabled: boolean | null;
  payouts_enabled: boolean | null;
  requirements_currently_due: unknown;
  requirements_past_due: unknown;
  disabled_reason: string | null;
};

type CanonicalStaffLocationRow = {
  profile_id: string;
  location_id: string;
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
  appointmentTime?: string;
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
  portfolios: CanonicalPortfolioRow[];
  profiles: CanonicalProfileRow[];
  services: CanonicalServiceRow[];
  locations: CanonicalLocationRow[];
  staffLocations: CanonicalStaffLocationRow[];
  availabilityRules: CanonicalAvailabilityRuleRow[];
  blockedTimes: CanonicalBlockedTimeRow[];
  appointments: CanonicalAppointmentRow[];
  reviews: CanonicalReviewRow[];
  marketplaceVisibility: CanonicalMarketplaceVisibilityRow[];
  barberStatus: CanonicalBarberStatusRow[];
  connectedAccounts: CanonicalConnectedAccountRow[];
};

export type MarketplaceBarberEligibilityDiagnostic = {
  eligible: boolean;
  isMarketplaceLive: boolean;
  includedInClientSearch: boolean;
  includedInClientHome: boolean;
  includedInMarketplaceFeed: boolean;
  includeInClientSearch: boolean;
  includeInClientHome: boolean;
  includeInMarketplaceFeed: boolean;
  directSearchIncluded: boolean;
  publicProfileRoute: string | null;
  displayName: string;
  searchableTerms: string[];
  blockers: string[];
  diagnostics: {
    approval: boolean;
    services: boolean;
    payout: boolean;
    visibility: boolean;
    availability: boolean;
    location: boolean;
    publicProfile: boolean;
    bookingActive: boolean;
    serviceCount: number;
    activeServiceCount: number;
    payoutReady: boolean;
    searchIncluded: boolean;
    feedIncluded: boolean;
  };
  facts: {
    profileId: string | null;
    userId: string | null;
    barberId: string;
    approvalStatus: string | null;
    verificationOverall: string | null;
    identityStatus: string | null;
    licenseStatus: string | null;
    payoutStatus: string | null;
    payoutMode: "test" | "live" | "missing";
    profileVisibility: string | null;
    bookingStatus: string | null;
    serviceCount: number;
    activeServiceCount: number;
    availabilityCount: number;
    workingHoursCount: number;
    independentLocationExists: boolean;
    acceptedShopCount: number;
    publicMediaCount: number;
    username: string | null;
    fallbackSlug: string;
    city: string | null;
    state: string | null;
    address: string | null;
    profileReady: boolean;
    locationReady: boolean;
    visibilityPublic: boolean;
    bookingActive: boolean;
    payoutReady: boolean;
    payoutAccountCount: number;
    checkoutLibraryServiceCount: number;
    marketplaceServiceCount: number;
    servicesTableServiceCount: number;
    clientVisibleServiceCount: number;
    firstServiceSourceTable: "services" | "marketplace_services" | null;
    firstServiceBarberKey: string | null;
    serviceSourceTablesChecked: string[];
    serviceBarberKeysChecked: string[];
    serviceSourceMismatchReason: string | null;
    marketplaceVisibilityRowFound: boolean;
    marketplaceVisibilityState: string | null;
    marketplaceVisibilityAcceptsInstantBookings: boolean | null;
    suspended: boolean;
    rejected: boolean;
    banned: boolean;
  };
};

export type CanonicalBarberService = {
  id: string;
  barberReference: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  clientVisible: boolean;
  sourceTable: "services" | "marketplace_services";
  barberKeyUsed: string | null;
};

export type CanonicalBarberServicesResult = {
  services: CanonicalBarberService[];
  activeServices: CanonicalBarberService[];
  clientVisibleServices: CanonicalBarberService[];
  sourceDiagnostics: {
    checkoutLibraryCount: number;
    marketplaceServicesCount: number;
    servicesTableCount: number;
    onboardingServicesCount: number;
    syncedCount: number;
    sourceTablesChecked: string[];
    barberKeysChecked: string[];
    sourceMismatchReason?: string;
  };
};

type InternalMarketplaceBarberEligibility = MarketplaceBarberEligibilityDiagnostic & {
  barberReference: string;
  barberUuid: string;
  profileRow?: CanonicalBarberProfileRow;
  profile?: CanonicalProfileRow;
  locationReferences: string[];
  bookableServices: Service[];
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

function isMissingRelationOrColumn(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";

  return ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(code)
    || /relation .* does not exist|column .* does not exist|schema cache/i.test(message);
}

function requirementList(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function isConnectedAccountPayoutReady(row?: CanonicalConnectedAccountRow | null) {
  return Boolean(
    row
    && row.payout_readiness_status === "ready"
    && row.charges_enabled
    && row.payouts_enabled
    && !row.disabled_reason
    && requirementList(row.requirements_currently_due).length === 0
    && requirementList(row.requirements_past_due).length === 0
  );
}

function isTrustPayoutReady(decision?: ReturnType<typeof getBarberTrustDecision>) {
  return decision?.canReceivePayouts === true || decision?.payoutStatus === "approved";
}

function createEligibilityDiagnostics(input: {
  eligible: boolean;
  includedInClientSearch: boolean;
  includedInMarketplaceFeed: boolean;
  publicProfileRoute: string | null;
  blockers: string[];
  facts: MarketplaceBarberEligibilityDiagnostic["facts"];
}) {
  return {
    approval: !input.blockers.some((blocker) => blocker.startsWith("Barber approval")),
    services: input.facts.activeServiceCount > 0,
    payout: input.facts.payoutReady,
    visibility: input.facts.profileVisibility === "public" || input.facts.profileVisibility === "featured",
    availability: input.facts.availabilityCount > 0,
    location: input.facts.locationReady,
    publicProfile: Boolean(input.publicProfileRoute),
    bookingActive: input.facts.bookingStatus === "active",
    serviceCount: input.facts.serviceCount,
    activeServiceCount: input.facts.activeServiceCount,
    payoutReady: input.facts.payoutReady,
    searchIncluded: input.includedInClientSearch,
    feedIncluded: input.includedInMarketplaceFeed
  };
}

function canonicalMediaUrl(imageUrl?: string | null, storagePath?: string | null) {
  return imageUrl?.trim() || storagePath?.trim() || undefined;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "barber";
}

function normalizePublicRouteSearchTerm(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/?barber\//i, "")
    .replace(/^@/, "");
}

function normalizePublicSlug(value?: string | null) {
  if (!value?.trim()) {
    return null;
  }

  const slug = slugify(value ?? "");
  return hasRealMarketplaceText(slug) && slug !== "barber" && !isKnownNonProductionMarketplaceValue(slug) ? slug : null;
}

function buildFallbackBarberSlug(barberReference: string) {
  const shortReference = barberReference
    .replace(/^barber[-_]?/i, "")
    .replace(/[^a-z0-9_-]+/gi, "")
    .slice(0, 18)
    .toLowerCase();
  return `barber-${shortReference || "profile"}`;
}

function resolvePublicBarberSlug(input: {
  profileRow?: CanonicalBarberProfileRow | null;
  barberRow: CanonicalBarberRow;
  barberReference: string;
}) {
  return normalizePublicSlug(input.profileRow?.username)
    ?? normalizePublicSlug(input.barberRow.booking_slug)
    ?? buildFallbackBarberSlug(input.barberReference);
}

function matchesBarberIdentifier(input: {
  identifier: string;
  row: CanonicalBarberRow;
  barberReference: string;
  profileRow?: CanonicalBarberProfileRow;
}) {
  const publicSlug = resolvePublicBarberSlug({
    profileRow: input.profileRow,
    barberRow: input.row,
    barberReference: input.barberReference
  });

  const identifier = normalizePublicRouteSearchTerm(input.identifier).toLowerCase();
  const candidateValues = [
    input.barberReference,
    input.row.id,
    input.row.profile_id,
    input.row.booking_slug,
    input.profileRow?.username,
    publicSlug
  ];

  return candidateValues.some((value) => normalizePublicRouteSearchTerm(value).toLowerCase() === identifier);
}

function toReference(id: string, referenceCode?: string | null) {
  return referenceCode ?? id;
}

function mapLocation(row: CanonicalLocationRow): Location {
  const fallbackAddress = !row.address && /\d/.test(row.neighborhood ?? "") ? row.neighborhood : undefined;
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
    address: row.address ?? fallbackAddress,
    addressLine2: row.address_line_2 ?? undefined,
    postalCode: row.postal_code ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined
  };
}

function parseIndependentServiceArea(label?: string | null) {
  const normalized = label?.trim() ?? "";
  const parts = normalized.includes("|")
    ? normalized.split("|").map((part) => part.trim()).filter(Boolean)
    : normalized.split("/").map((part) => part.trim()).filter(Boolean);
  const [rawName = "", rawArea = "", rawCityState = ""] = parts;
  const cityStateSource = rawCityState || rawArea;
  const areaParts = cityStateSource.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    name: rawName || "Independent barber",
    neighborhood: rawCityState ? rawArea : rawArea || rawName || "Independent service location",
    city: areaParts[0] ?? rawCityState ?? "",
    state: areaParts[1] ?? ""
  };
}

function buildIndependentFallbackLocation(locationReference: string, profileRow?: CanonicalBarberProfileRow): Location {
  const parsed = parseIndependentServiceArea(profileRow?.service_area_label);
  return {
    id: locationReference,
    name: parsed.name,
    neighborhood: parsed.neighborhood,
    city: parsed.city,
    state: parsed.state,
    phone: "",
    hours: "",
    chairs: 1,
    taxRate: 0
  };
}

function getCandidateLocation(
  locationsByReference: Map<string, Location>,
  locationReference: string,
  profileRow?: CanonicalBarberProfileRow
) {
  return locationsByReference.get(locationReference)
    ?? (isIndependentServiceLocationReference(locationReference)
      ? buildIndependentFallbackLocation(locationReference, profileRow)
      : undefined);
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

const TRUST_BLOCKING_STATUSES = new Set(["suspended", "expired", "rejected", "needs_update"]);

function isTrustDecisionBlocked(status?: string | null) {
  return TRUST_BLOCKING_STATUSES.has(status ?? "");
}

function isBarberDiscoverable(trustState: TrustState | undefined, barberId: string) {
  if (!trustState) {
    return true;
  }

  const decision = buildPublicTrustSignal(trustState, barberId).verificationDecision;
  return !decision || !isTrustDecisionBlocked(decision.canonicalOverallStatus);
}

function isCanonicalBarberPlatformApproved(barber: CanonicalBarberRow, trustState?: TrustState, barberReference?: string) {
  const appApproved = isMarketplaceApprovedStatus(barber.app_approval_status);
  if (appApproved) {
    return true;
  }

  if (!trustState || !barberReference) {
    return false;
  }

  const decision = buildPublicTrustSignal(trustState, barberReference).verificationDecision;
  return decision?.canonicalOverallStatus === "approved";
}

function isBlockedMarketplaceStatus(value?: string | null) {
  return ["suspended", "rejected", "banned", "disabled", "deactivated"].includes(value ?? "");
}

function barberIdentityValues(
  barberReference: string,
  barberUuid: string,
  profileId?: string | null
) {
  return new Set([barberReference, barberUuid, profileId].filter((value): value is string => Boolean(value)));
}

function matchesCanonicalBarberIdentity(
  value: string | null | undefined,
  barberReference: string,
  barberUuid: string,
  profileId?: string | null
) {
  return Boolean(value && barberIdentityValues(barberReference, barberUuid, profileId).has(value));
}

function getCanonicalBarberProfileRow(
  snapshot: CanonicalSnapshot,
  barberReference: string,
  barberUuid: string,
  profileId?: string | null
) {
  return snapshot.barberProfiles.find((row) =>
    matchesCanonicalBarberIdentity(row.barber_reference, barberReference, barberUuid, profileId)
  );
}

function isAcceptingBookingStatus(row?: CanonicalBarberStatusRow | null) {
  if (!row) {
    return true;
  }

  const status = `${row.status ?? ""}`.toLowerCase();
  const liveStatus = `${row.live_status ?? ""}`.toLowerCase();
  if (row.accepting_bookings === false || status === "offline" || liveStatus === "offline") {
    return false;
  }

  return row.accepting_bookings === true
    || ["active", "available", "live"].includes(status)
    || ["active", "available", "live"].includes(liveStatus);
}

function getCanonicalServiceOwnerType(row: Pick<CanonicalServiceRow, "service_owner_type" | "service_owner" | "barber_reference">) {
  const ownerType = row.service_owner_type ?? row.service_owner ?? null;
  if (ownerType === "barber" || ownerType === "shop") {
    return ownerType;
  }

  return row.barber_reference ? "barber" : "shop";
}

function isCanonicalProfileActive(profile?: CanonicalProfileRow | null) {
  const state = profile?.onboarding_state?.toLowerCase();
  return !state || ["active", "complete", "completed", "verified"].includes(state);
}

function isCanonicalBarberBookable(barber: CanonicalBarberRow, status?: CanonicalBarberStatusRow | null) {
  if (barber.is_bookable === true) {
    return true;
  }
  if (barber.is_bookable === false) {
    return false;
  }

  return isAcceptingBookingStatus(status);
}

function isCanonicalBarberDiscoverable(input: {
  barber: CanonicalBarberRow;
  profileRow?: CanonicalBarberProfileRow | null;
  visibility?: CanonicalMarketplaceVisibilityRow | null;
}) {
  if (input.barber.is_discoverable === true) {
    return true;
  }
  if (input.barber.is_discoverable === false) {
    return false;
  }

  return isPublicMarketplaceVisibilityState(input.profileRow?.visibility_state)
    || isPublicMarketplaceVisibilityState(input.visibility?.visibility_state);
}

function getCanonicalBarberStatusRow(
  snapshot: CanonicalSnapshot,
  barberReference: string,
  barberUuid: string,
  profileId?: string | null
) {
  const rows = snapshot.barberStatus.filter((row) =>
    matchesCanonicalBarberIdentity(row.barber_reference, barberReference, barberUuid, profileId)
  );
  return rows.find(isAcceptingBookingStatus) ?? rows[0];
}

function normalizeAvailabilityRules(input: {
  availabilityRules: CanonicalAvailabilityRuleRow[];
  workingHours: CanonicalBarberWorkingHoursRow[];
}) {
  const unique = new Map<string, CanonicalAvailabilityRuleRow>();
  for (const row of input.availabilityRules) {
    unique.set(`${row.barber_id}:${row.location_id}:${row.weekday}:${row.start_time}:${row.end_time}`, row);
  }
  for (const row of input.workingHours) {
    const normalized = {
      barber_id: row.barber_reference,
      location_id: row.shop_reference,
      weekday: row.weekday,
      start_time: row.start_time,
      end_time: row.end_time
    } satisfies CanonicalAvailabilityRuleRow;
    unique.set(`${normalized.barber_id}:${normalized.location_id}:${normalized.weekday}:${normalized.start_time}:${normalized.end_time}`, normalized);
  }
  return [...unique.values()];
}

function resolveDiscoveryRelationshipType(
  barberRow: CanonicalBarberRow,
  hasShopAssignment: boolean
): "freelance" | "booth_rent" | "autobooth_rent" {
  if (barberRow.barber_subtype === "freelance") {
    return "freelance";
  }

  if (barberRow.barber_subtype === "autobooth_rent") {
    return hasShopAssignment ? "autobooth_rent" : "freelance";
  }

  if (barberRow.barber_subtype === "booth_rent" || barberRow.barber_subtype === "blueprint") {
    return hasShopAssignment ? "booth_rent" : "freelance";
  }

  if (!hasShopAssignment) {
    return "freelance";
  }

  const normalized = `${barberRow.compensation_model ?? ""}`.toLowerCase();
  if (normalized.includes("autobooth")) {
    return "autobooth_rent";
  }
  if (normalized.includes("booth")) {
    return "booth_rent";
  }
  // Retired revenue-share values resolve to freelance.
  return "freelance";
}

function toDomainCompensationModel(value?: string | null) {
  return normalizeCompensationModel(value);
}

function isCanonicalBarberProfileRole(profile?: CanonicalProfileRow) {
  if (!profile) {
    return false;
  }

  const primaryRole = profile.primary_onboarding_role?.toString() ?? "";
  const role = profile.role?.toString() ?? "";
  return primaryRole === "barber"
    || isBarberAccountRole(role);
}

function getBarberBookingGate(trustState: TrustState | undefined, barberId: string): VerificationGateDecision | null {
  if (!trustState) {
    return null;
  }

  const decision = buildPublicTrustSignal(trustState, barberId).verificationDecision;
  return decision && isTrustDecisionBlocked(decision.canonicalOverallStatus)
    ? getVerificationGateDecision(decision, "booking")
    : null;
}

function isShopPubliclyActivatable(trustState: TrustState | undefined, shopId?: string) {
  if (!shopId) {
    return false;
  }
  if (!trustState) {
    return true;
  }

  const decision = computeShopVerificationDecision(trustState, shopId);
  return !isTrustDecisionBlocked(decision.canonicalOverallStatus);
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

function getMarketplaceVisibilityRow(
  snapshot: CanonicalSnapshot,
  barberReference: string,
  barberUuid?: string,
  profileId?: string | null
) {
  const rows = snapshot.marketplaceVisibility.filter((row) =>
    barberUuid
      ? matchesCanonicalBarberIdentity(row.barber_reference, barberReference, barberUuid, profileId)
      : row.barber_reference === barberReference
  );
  return rows.find((row) =>
    isPublicMarketplaceVisibilityState(row.visibility_state)
    && row.accepts_instant_bookings !== false
  ) ?? rows[0];
}

function isCanonicalMarketplaceVisibilityReady(
  snapshot: CanonicalSnapshot,
  barberReference: string,
  barberUuid: string,
  profileId?: string | null,
  profileRow?: CanonicalBarberProfileRow,
  barberRow?: CanonicalBarberRow
) {
  const visibility = getMarketplaceVisibilityRow(snapshot, barberReference, barberUuid, profileId);
  const status = getCanonicalBarberStatusRow(snapshot, barberReference, barberUuid, profileId);
  const acceptingBookings = barberRow ? isCanonicalBarberBookable(barberRow, status) : isAcceptingBookingStatus(status);

  if (!acceptingBookings) {
    return false;
  }

  const visible = barberRow
    ? isCanonicalBarberDiscoverable({ barber: barberRow, profileRow, visibility })
    : isPublicMarketplaceVisibilityState(profileRow?.visibility_state);
  if (!visible) {
    return false;
  }

  return ![
    barberReference,
    profileRow?.barber_reference,
    profileRow?.username,
    profileRow?.display_name,
    visibility?.barber_reference,
    barberRow?.booking_slug
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
    marketplaceServicesResult,
    locationsResult,
    staffLocationsResult,
    availabilityResult,
    barberWorkingHoursResult,
    blockedTimesResult,
    appointmentsResult,
    reviewsResult,
    marketplaceVisibilityResult,
    portfoliosResult,
    barberStatusResult,
    connectedAccountsResult
  ] = await Promise.all([
    supabase.from("barbers").select("id, reference_code, profile_id, booking_slug, barber_subtype, app_approval_status, shop_approval_status, status, is_bookable, is_discoverable"),
    supabase.from("barber_profiles").select("barber_reference, username, display_name, bio, years_experience, shop_reference, profile_photo_path, profile_photo_url, specialties, badges, service_area_label, next_available_at, visibility_state"),
    supabase.from("profiles").select("id, role, full_name, email, phone, primary_onboarding_role, onboarding_state"),
    supabase.from("services").select("id, reference_code, location_id, category, name, description, duration_min, buffer_min, price, currency, deposit_amount, full_prepay_required, active, is_bookable, display_order, created_at, updated_at, service_owner, service_owner_type, barber_reference, shop_reference").eq("active", true),
    supabase.from("marketplace_services").select("service_reference, category, name, description, duration_min, buffer_min, price, deposit_amount, full_prepay_required, owner_type, barber_reference, shop_reference, style_tag_ids, created_at, updated_at"),
    supabase.from("locations").select("id, reference_code, name, neighborhood, city, state, phone, address, address_line_2, postal_code, latitude, longitude"),
    supabase.from("staff_locations").select("profile_id, location_id"),
    supabase.from("availability_rules").select("barber_id, location_id, weekday, start_time, end_time"),
    supabase.from("barber_working_hours").select("barber_reference, shop_reference, weekday, start_time, end_time"),
    supabase.from("blocked_times").select("barber_id, starts_at, ends_at, reason"),
    supabase.from("appointments").select("id, reference_code, barber_id, client_id, service_id, location_id, status, starts_at, ends_at, total_amount"),
    supabase.from("reviews").select("id, appointment_id, barber_id, client_id, location_id, rating, message, created_at"),
    supabase.from("marketplace_visibility").select("barber_reference, visibility_state, accepts_instant_bookings, featured_rank"),
    supabase.from("barber_portfolios").select("id, barber_reference, storage_path, image_url, caption, style_tag_ids, featured, created_at").order("featured", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("barber_status").select("barber_reference, status, live_status, accepting_bookings"),
    supabase.from("connected_accounts").select("subject_type, barber_id, payout_readiness_status, livemode, charges_enabled, payouts_enabled, requirements_currently_due, requirements_past_due, disabled_reason")
  ]);

  const resolvedBarberProfilesResult = barberProfilesResult.error && isMissingRelationOrColumn(barberProfilesResult.error)
    ? await supabase.from("barber_profiles").select("barber_reference, username, display_name, bio, years_experience, shop_reference, profile_photo_path, specialties, badges, service_area_label, next_available_at, visibility_state")
    : barberProfilesResult;
  let resolvedBarbersResult = barbersResult.error && isMissingRelationOrColumn(barbersResult.error)
    ? await supabase.from("barbers").select("id, reference_code, profile_id, barber_subtype, app_approval_status, shop_approval_status, status, is_bookable, is_discoverable")
    : barbersResult;
  if (resolvedBarbersResult.error && isMissingRelationOrColumn(resolvedBarbersResult.error)) {
    resolvedBarbersResult = await supabase.from("barbers").select("id, reference_code, profile_id, compensation_model, app_approval_status, shop_approval_status") as typeof barbersResult;
  }
  const resolvedProfilesResult = profilesResult.error && isMissingRelationOrColumn(profilesResult.error)
    ? await supabase.from("profiles").select("id, role, full_name, email, phone")
    : profilesResult;
  let resolvedServicesResult = servicesResult.error && isMissingRelationOrColumn(servicesResult.error)
    ? await supabase.from("services").select("id, reference_code, location_id, category, name, description, duration_min, buffer_min, price, currency, deposit_amount, full_prepay_required, active, is_bookable, display_order, created_at, updated_at, service_owner, barber_reference, shop_reference").eq("active", true)
    : servicesResult as typeof servicesResult;
  if (resolvedServicesResult.error && isMissingRelationOrColumn(resolvedServicesResult.error)) {
    resolvedServicesResult = await supabase.from("services").select("id, reference_code, location_id, category, name, description, duration_min, buffer_min, price, currency, deposit_amount, full_prepay_required, active, is_bookable, display_order, created_at, updated_at, service_owner_type, barber_reference, shop_reference").eq("active", true) as typeof servicesResult;
  }
  if (resolvedServicesResult.error && isMissingRelationOrColumn(resolvedServicesResult.error)) {
    resolvedServicesResult = await supabase.from("services").select("id, location_id, name, duration_min, price, active, is_bookable, service_owner, barber_reference, shop_reference").eq("active", true) as typeof servicesResult;
  }
  if (resolvedServicesResult.error && isMissingRelationOrColumn(resolvedServicesResult.error)) {
    resolvedServicesResult = await supabase.from("services").select("id, location_id, name, duration_min, price, active, is_bookable, barber_reference, shop_reference").eq("active", true) as typeof servicesResult;
  }
  let resolvedLocationsResult = locationsResult.error && isMissingRelationOrColumn(locationsResult.error)
    ? await supabase.from("locations").select("id, reference_code, name, neighborhood, city, state, phone")
    : locationsResult;
  if (resolvedLocationsResult.error && isMissingRelationOrColumn(resolvedLocationsResult.error)) {
    resolvedLocationsResult = await supabase.from("locations").select("id, name, neighborhood, city, state, phone");
  }
  let resolvedMarketplaceServicesResult = marketplaceServicesResult;
  if (resolvedMarketplaceServicesResult.error && isMissingRelationOrColumn(resolvedMarketplaceServicesResult.error)) {
    resolvedMarketplaceServicesResult = await supabase
      .from("marketplace_services")
      .select("service_reference, category, name, description, duration_min, buffer_min, price, deposit_amount, full_prepay_required, owner_type, barber_reference, shop_reference");
  }

  const optionalResults = [
    resolvedMarketplaceServicesResult,
    staffLocationsResult,
    barberWorkingHoursResult,
    marketplaceVisibilityResult,
    portfoliosResult,
    barberStatusResult,
    connectedAccountsResult
  ];
  for (const result of [
    resolvedBarbersResult,
    resolvedBarberProfilesResult,
    resolvedProfilesResult,
    resolvedServicesResult,
    resolvedLocationsResult,
    availabilityResult,
    blockedTimesResult,
    appointmentsResult,
    reviewsResult
  ]) {
    if (result.error) {
      throw result.error;
    }
  }
  for (const result of optionalResults) {
    if (result.error && !isMissingRelationOrColumn(result.error)) {
      throw result.error;
    }
  }
  const resolvedConnectedAccountsResult = connectedAccountsResult.error && isMissingRelationOrColumn(connectedAccountsResult.error)
    ? await supabase.from("connected_accounts").select("subject_type, barber_id, payout_readiness_status, charges_enabled, payouts_enabled, requirements_currently_due, requirements_past_due, disabled_reason")
    : connectedAccountsResult;
  if (resolvedConnectedAccountsResult.error && !isMissingRelationOrColumn(resolvedConnectedAccountsResult.error)) {
    throw resolvedConnectedAccountsResult.error;
  }

  return {
    barbers: ((resolvedBarbersResult.data ?? []) as Array<Partial<CanonicalBarberRow>>).map(normalizeCanonicalBarberRow),
    barberProfiles: (resolvedBarberProfilesResult.data ?? []) as CanonicalBarberProfileRow[],
    portfolios: (portfoliosResult.error ? [] : portfoliosResult.data ?? []) as CanonicalPortfolioRow[],
    profiles: (resolvedProfilesResult.data ?? []) as CanonicalProfileRow[],
    services: [
      ...((resolvedServicesResult.data ?? []) as Array<Partial<CanonicalServiceRow>>).map((row) =>
        normalizeCanonicalServiceRow({ ...row, source_table: "services" })
      ),
      ...((resolvedMarketplaceServicesResult.error ? [] : resolvedMarketplaceServicesResult.data ?? []) as Array<{
        service_reference: string;
        category: string;
        name: string;
        description: string | null;
        duration_min: number;
        buffer_min: number;
        price: number | string;
        deposit_amount: number | string;
        full_prepay_required: boolean;
        owner_type: "barber" | "shop" | null;
        barber_reference: string | null;
        shop_reference: string | null;
        style_tag_ids: string[] | null;
        created_at: string | null;
        updated_at: string | null;
      }>).map((row) => ({
        id: row.service_reference,
        reference_code: row.service_reference,
        location_id: row.shop_reference ?? "",
        category: row.category,
        name: row.name,
        description: row.description,
        duration_min: row.duration_min,
        buffer_min: row.buffer_min,
        price: row.price,
        currency: "usd",
        deposit_amount: row.deposit_amount,
        full_prepay_required: row.full_prepay_required,
        active: true,
        is_bookable: true,
        display_order: 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
        service_owner_type: row.owner_type,
        service_owner: row.owner_type,
        barber_reference: row.barber_reference,
        shop_reference: row.shop_reference,
        booking_count: null,
        popularity_rank: null,
        source_table: "marketplace_services"
      } satisfies CanonicalServiceRow))
    ],
    locations: (resolvedLocationsResult.data ?? []) as CanonicalLocationRow[],
    staffLocations: (staffLocationsResult.error ? [] : staffLocationsResult.data ?? []) as CanonicalStaffLocationRow[],
    availabilityRules: normalizeAvailabilityRules({
      availabilityRules: (availabilityResult.data ?? []) as CanonicalAvailabilityRuleRow[],
      workingHours: (barberWorkingHoursResult.error ? [] : barberWorkingHoursResult.data ?? []) as CanonicalBarberWorkingHoursRow[]
    }),
    blockedTimes: (blockedTimesResult.data ?? []) as CanonicalBlockedTimeRow[],
    appointments: (appointmentsResult.data ?? []) as CanonicalAppointmentRow[],
    reviews: (reviewsResult.data ?? []) as CanonicalReviewRow[],
    marketplaceVisibility: (marketplaceVisibilityResult.error ? [] : marketplaceVisibilityResult.data ?? []) as CanonicalMarketplaceVisibilityRow[],
    barberStatus: (barberStatusResult.error ? [] : barberStatusResult.data ?? []) as CanonicalBarberStatusRow[],
    connectedAccounts: (resolvedConnectedAccountsResult.error ? [] : resolvedConnectedAccountsResult.data ?? []) as CanonicalConnectedAccountRow[]
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
    ownerType: getCanonicalServiceOwnerType(row),
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
  profileId: string,
  services: CanonicalServiceRow[],
  availabilityRules: CanonicalAvailabilityRuleRow[],
  appointments: CanonicalAppointmentRow[],
  locationReferenceByUuid: Map<string, string>
) {
  const references = new Set<string>();

  availabilityRules
    .filter((entry) => matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberUuid, profileId))
    .forEach((entry) => references.add(locationReferenceByUuid.get(entry.location_id) ?? entry.location_id));

  services
    .filter((entry) => matchesCanonicalBarberIdentity(entry.barber_reference, barberReference, barberUuid, profileId))
    .forEach((entry) => references.add(entry.shop_reference ?? locationReferenceByUuid.get(entry.location_id) ?? entry.location_id));

  appointments
    .filter((entry) => matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberUuid, profileId))
    .forEach((entry) => references.add(locationReferenceByUuid.get(entry.location_id) ?? entry.location_id));

  return [...references];
}

function getServicesForBarber(
  barberReference: string,
  barberUuid: string,
  profileId: string,
  locationReferences: string[],
  rows: CanonicalServiceRow[],
  locationReferenceByUuid: Map<string, string>
) {
  const serviceResult = getCanonicalBarberServicesFromRows({
    barberReference,
    barberUuid,
    profileId,
    locationReferences,
    rows,
    locationReferenceByUuid
  });
  const clientVisibleIds = new Set(serviceResult.clientVisibleServices.map((service) => service.id));
  const services = rows
    .filter((row) => {
      const locationReference = locationReferenceByUuid.get(row.location_id) ?? row.location_id;
      const directBarberMatch = matchesCanonicalBarberIdentity(row.barber_reference, barberReference, barberUuid, profileId);
      const sharedShopMatch = !row.barber_reference && locationReferences.includes(row.shop_reference ?? locationReference);
      const sharedLocationMatch = !row.shop_reference && locationReferences.includes(locationReference);
      return row.active && row.is_bookable !== false && (directBarberMatch || sharedShopMatch || sharedLocationMatch);
    })
    .map((row) => mapService(row, locationReferenceByUuid.get(row.location_id) ?? row.location_id));

  const unique = new Map<string, Service>();
  for (const service of services) {
    if (clientVisibleIds.has(service.id)) {
      unique.set(service.id, service);
    }
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

function getCanonicalBarberServicesFromRows(input: {
  barberReference: string;
  barberUuid: string;
  profileId: string;
  locationReferences: string[];
  rows: CanonicalServiceRow[];
  locationReferenceByUuid: Map<string, string>;
}): CanonicalBarberServicesResult {
  const barberKeys = [input.barberReference, input.barberUuid, input.profileId]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const barberKeySet = new Set(barberKeys);
  const matchedRows = input.rows.filter((row) => {
    const locationReference = input.locationReferenceByUuid.get(row.location_id) ?? row.location_id;
    const directBarberMatch = Boolean(row.barber_reference && barberKeySet.has(row.barber_reference));
    const sharedShopMatch = !row.barber_reference && input.locationReferences.includes(row.shop_reference ?? locationReference);
    const sharedLocationMatch = !row.shop_reference && input.locationReferences.includes(locationReference);
    return directBarberMatch || sharedShopMatch || sharedLocationMatch;
  });
  const services = matchedRows.map((row): CanonicalBarberService => {
    const active = row.active !== false && row.is_bookable !== false;
    const clientVisible = active
      && isMarketplaceBookableService(mapService(row, input.locationReferenceByUuid.get(row.location_id) ?? row.location_id))
      && ![toReference(row.id, row.reference_code), row.name, row.category, row.barber_reference, row.shop_reference]
        .some(isKnownNonProductionMarketplaceValue);
    return {
      id: toReference(row.id, row.reference_code),
      barberReference: input.barberReference,
      name: row.name,
      priceCents: Math.round(numeric(row.price) * 100),
      durationMinutes: Number(row.duration_min ?? 0),
      active,
      clientVisible,
      sourceTable: row.source_table ?? "services",
      barberKeyUsed: row.barber_reference ?? null
    };
  });
  const unique = new Map<string, CanonicalBarberService>();
  for (const service of services) {
    const previous = unique.get(service.id);
    if (!previous || (!previous.clientVisible && service.clientVisible)) {
      unique.set(service.id, service);
    }
  }
  const uniqueServices = [...unique.values()];
  const activeServices = uniqueServices.filter((service) => service.active);
  const clientVisibleServices = uniqueServices.filter((service) => service.clientVisible);
  const servicesTableCount = uniqueServices.filter((service) => service.sourceTable === "services").length;
  const marketplaceServicesCount = uniqueServices.filter((service) => service.sourceTable === "marketplace_services").length;
  const checkoutLibraryCount = input.rows.filter((row) =>
    row.source_table === "marketplace_services"
    && Boolean(row.barber_reference)
    && barberKeySet.has(row.barber_reference!)
  ).length;
  const wrongKeyRows = input.rows.filter((row) =>
    row.source_table === "marketplace_services"
    && Boolean(row.barber_reference)
    && row.barber_reference !== input.barberReference
    && barberKeySet.has(row.barber_reference!)
  );

  return {
    services: uniqueServices,
    activeServices,
    clientVisibleServices,
    sourceDiagnostics: {
      checkoutLibraryCount,
      marketplaceServicesCount,
      servicesTableCount,
      onboardingServicesCount: 0,
      syncedCount: 0,
      sourceTablesChecked: ["services", "marketplace_services"],
      barberKeysChecked: barberKeys,
      sourceMismatchReason: clientVisibleServices.length
        ? undefined
        : wrongKeyRows.length
          ? `Checkout Library uses marketplace_services keyed by ${wrongKeyRows[0]?.barber_reference}; marketplace checks canonical barber reference ${input.barberReference}.`
          : "No active client-visible service rows matched canonical barber service keys."
    }
  };
}

function matchesSearchableTerms(terms: string[], query?: string) {
  const normalizedQuery = normalizePublicRouteSearchTerm(query).toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const queryVariants = [normalizedQuery, normalizedQuery.replace(/^@/, "")]
    .filter((value, index, values) => value && values.indexOf(value) === index);

  return terms.some((term) => {
    const normalizedTerm = term.toLowerCase();
    const routeNormalizedTerm = normalizePublicRouteSearchTerm(term).toLowerCase();
    return queryVariants.some((variant) =>
      normalizedTerm.includes(variant) || routeNormalizedTerm.includes(variant)
    );
  });
}

function matchesServiceCategory(service: Service, category?: string) {
  const normalizedCategory = category?.trim().toLowerCase();
  if (!normalizedCategory) {
    return true;
  }

  const singularCategory = normalizedCategory.replace(/s$/, "");
  const haystack = `${service.category} ${service.name}`.toLowerCase();
  return haystack.includes(normalizedCategory) || haystack.includes(singularCategory);
}

function getBarberTrustDecision(trustState: TrustState | undefined, barberReference: string) {
  return trustState ? buildPublicTrustSignal(trustState, barberReference).verificationDecision : null;
}

function getPrimaryMarketplaceLocation(input: {
  locationsByReference: Map<string, Location>;
  locationReferences: string[];
  profileRow?: CanonicalBarberProfileRow;
}) {
  for (const locationReference of input.locationReferences) {
    const location = getCandidateLocation(input.locationsByReference, locationReference, input.profileRow);
    if (location) {
      return location;
    }
  }

  return undefined;
}

function buildMarketplaceBarberEligibility(
  snapshot: CanonicalSnapshot,
  barberRow: CanonicalBarberRow,
  options: {
    locationReferenceByUuid: Map<string, string>;
    locationsByReference: Map<string, Location>;
    trustState?: TrustState;
  }
): InternalMarketplaceBarberEligibility {
  const barberReference = toReference(barberRow.id, barberRow.reference_code);
  const profileRow = getCanonicalBarberProfileRow(snapshot, barberReference, barberRow.id, barberRow.profile_id);
  const profile = snapshot.profiles.find((row) => row.id === barberRow.profile_id);
  const visibility = getMarketplaceVisibilityRow(snapshot, barberReference, barberRow.id, barberRow.profile_id);
  const status = getCanonicalBarberStatusRow(snapshot, barberReference, barberRow.id, barberRow.profile_id);
  const connectedAccounts = snapshot.connectedAccounts.filter((row) => row.subject_type === "barber" && row.barber_id === barberRow.id);
  const connectedAccount = connectedAccounts[0];
  const trustDecision = getBarberTrustDecision(options.trustState, barberReference);
  const rawLocationReferences = getCandidateLocationReferences(
    barberReference,
    barberRow.id,
    barberRow.profile_id,
    snapshot.services,
    snapshot.availabilityRules,
    snapshot.appointments,
    options.locationReferenceByUuid
  );
  const locationReferences = rawLocationReferences.filter((locationReference) =>
    isLocationPubliclyBookable(options.trustState, locationReference)
  );
  const canonicalServices = getCanonicalBarberServicesFromRows({
    barberReference,
    barberUuid: barberRow.id,
    profileId: barberRow.profile_id,
    locationReferences,
    rows: snapshot.services,
    locationReferenceByUuid: options.locationReferenceByUuid
  });
  const services = getServicesForBarber(barberReference, barberRow.id, barberRow.profile_id, locationReferences, snapshot.services, options.locationReferenceByUuid);
  const bookableServices = services.filter((service) =>
    isMarketplaceBookableService(service)
    && ![service.id, service.name, service.category, service.barberId, service.shopId].some(isKnownNonProductionMarketplaceValue)
  );
  const publicMediaCount = snapshot.portfolios.filter((asset) =>
    asset.barber_reference === barberReference && Boolean(canonicalMediaUrl(asset.image_url, asset.storage_path))
  ).length;
  const availabilityCount = snapshot.availabilityRules.filter((row) =>
    matchesCanonicalBarberIdentity(row.barber_id, barberReference, barberRow.id, barberRow.profile_id)
  ).length;
  const independentLocationExists = locationReferences.some(isIndependentServiceLocationReference);
  const acceptedShopCount = snapshot.staffLocations.filter((row) => {
    if (row.profile_id !== barberRow.profile_id) {
      return false;
    }
    const locationReference = options.locationReferenceByUuid.get(row.location_id) ?? row.location_id;
    return !isIndependentServiceLocationReference(locationReference);
  }).length;
  const primaryLocation = getPrimaryMarketplaceLocation({
    locationsByReference: options.locationsByReference,
    locationReferences,
    profileRow
  });
  const publicSlug = resolvePublicBarberSlug({ profileRow, barberRow, barberReference });
  const fallbackSlug = buildFallbackBarberSlug(barberReference);
  const displayName = getClientFacingBarberName({
    username: profileRow?.username ?? barberRow.booking_slug,
    publicDisplayName: profileRow?.display_name,
    name: profile?.full_name ?? barberReference
  });
  const profileActive = isCanonicalProfileActive(profile);
  const profilePublic = isCanonicalBarberDiscoverable({ barber: barberRow, profileRow, visibility });
  const acceptingBookings = isCanonicalBarberBookable(barberRow, status);
  const trustPayoutReady = isTrustPayoutReady(trustDecision);
  const relationshipType = resolveDiscoveryRelationshipType(barberRow, acceptedShopCount > 0);
  const payoutReady = relationshipType === "freelance" || isConnectedAccountPayoutReady(connectedAccount) || trustPayoutReady;
  const approvalApproved = isCanonicalBarberPlatformApproved(barberRow, options.trustState, barberReference);
  const verificationOverall = trustDecision?.canonicalOverallStatus ?? null;
  const verificationStatusValue = `${verificationOverall ?? ""}`;
  const barberStatusValue = `${barberRow.status ?? ""}`.toLowerCase();
  const suspended = isBlockedMarketplaceStatus(barberRow.app_approval_status)
    || isBlockedMarketplaceStatus(barberStatusValue)
    || verificationStatusValue === "suspended";
  const rejected = barberRow.app_approval_status === "rejected" || verificationStatusValue === "rejected";
  const banned = barberRow.app_approval_status === "banned" || verificationStatusValue === "banned";
  const validLocationOrShop = independentLocationExists || acceptedShopCount > 0 || locationReferences.length > 0;
  const searchableTerms = [
    displayName,
    profileRow?.display_name,
    profile?.full_name,
    profile?.email,
    profileRow?.username,
    barberRow.booking_slug,
    publicSlug,
    `/barber/${publicSlug}`,
    fallbackSlug,
    `/barber/${fallbackSlug}`,
    barberReference,
    barberRow.id,
    primaryLocation?.name,
    primaryLocation?.neighborhood,
    primaryLocation?.city,
    primaryLocation?.state,
    primaryLocation?.address,
    ...bookableServices.flatMap((service) => [service.name, service.category])
  ].filter((value): value is string => Boolean(value?.trim()));
  const blockers = [
    profile ? null : "Missing identity profile",
    isCanonicalBarberProfileRole(profile) ? null : "Profile role is not barber",
    profileActive ? null : `Profile onboarding ${profile?.onboarding_state ?? "inactive"}`,
    hasRealMarketplaceText(displayName) ? null : "Missing public display name",
    approvalApproved ? null : `Barber approval ${barberRow.app_approval_status ?? verificationOverall ?? "missing"}`,
    suspended ? "Account suspended" : null,
    rejected ? "Account rejected" : null,
    banned ? "Account banned" : null,
    profilePublic ? null : "Profile visibility is hidden",
    acceptingBookings ? null : "Not accepting bookings",
    bookableServices.length > 0 ? null : "No active real services",
    availabilityCount > 0 ? null : "No real availability",
    validLocationOrShop ? null : "No service location or shop connection"
  ].filter((value): value is string => Boolean(value));
  const eligible = blockers.length === 0;

  const publicProfileRoute = eligible ? `/barber/${publicSlug}` : null;
  const includedInClientSearch = eligible;
  const includedInClientHome = eligible;
  const includedInMarketplaceFeed = eligible && publicMediaCount > 0;
  const facts = {
    profileId: barberRow.profile_id,
    userId: barberRow.profile_id,
    barberId: barberReference,
    approvalStatus: barberRow.app_approval_status,
    verificationOverall,
    identityStatus: trustDecision?.identityStatus ?? null,
    licenseStatus: trustDecision?.licenseStatus ?? null,
    payoutStatus: connectedAccount?.payout_readiness_status ?? (trustPayoutReady ? "ready" : trustDecision?.payoutStatus ?? null),
    payoutMode: connectedAccount ? (connectedAccount.livemode ? "live" : "test") : "missing",
    profileVisibility: profilePublic ? "public" : profileRow?.visibility_state ?? visibility?.visibility_state ?? null,
    bookingStatus: acceptingBookings ? "active" : status?.status ?? (visibility?.accepts_instant_bookings ? "active" : "inactive"),
    serviceCount: services.length,
    activeServiceCount: bookableServices.length,
    availabilityCount,
    workingHoursCount: availabilityCount,
    independentLocationExists,
    acceptedShopCount,
    publicMediaCount,
    username: profileRow?.username ?? null,
    fallbackSlug,
    city: primaryLocation?.city ?? null,
    state: primaryLocation?.state ?? null,
    address: primaryLocation?.address ?? primaryLocation?.neighborhood ?? null,
    profileReady: Boolean(profile && profileActive && hasRealMarketplaceText(displayName)),
    locationReady: validLocationOrShop,
    visibilityPublic: profilePublic,
    bookingActive: acceptingBookings,
    payoutReady,
    payoutAccountCount: connectedAccounts.length,
    checkoutLibraryServiceCount: canonicalServices.sourceDiagnostics.checkoutLibraryCount,
    marketplaceServiceCount: canonicalServices.sourceDiagnostics.marketplaceServicesCount,
    servicesTableServiceCount: canonicalServices.sourceDiagnostics.servicesTableCount,
    clientVisibleServiceCount: canonicalServices.clientVisibleServices.length,
    firstServiceSourceTable: canonicalServices.clientVisibleServices[0]?.sourceTable ?? canonicalServices.activeServices[0]?.sourceTable ?? canonicalServices.services[0]?.sourceTable ?? null,
    firstServiceBarberKey: canonicalServices.clientVisibleServices[0]?.barberKeyUsed ?? canonicalServices.activeServices[0]?.barberKeyUsed ?? canonicalServices.services[0]?.barberKeyUsed ?? null,
    serviceSourceTablesChecked: canonicalServices.sourceDiagnostics.sourceTablesChecked,
    serviceBarberKeysChecked: canonicalServices.sourceDiagnostics.barberKeysChecked,
    serviceSourceMismatchReason: canonicalServices.sourceDiagnostics.sourceMismatchReason ?? null,
    marketplaceVisibilityRowFound: Boolean(visibility),
    marketplaceVisibilityState: visibility?.visibility_state ?? null,
    marketplaceVisibilityAcceptsInstantBookings: visibility?.accepts_instant_bookings ?? null,
    suspended,
    rejected,
    banned
  } satisfies MarketplaceBarberEligibilityDiagnostic["facts"];

  return {
    eligible,
    isMarketplaceLive: eligible,
    includedInClientSearch,
    includedInClientHome,
    includedInMarketplaceFeed,
    includeInClientSearch: includedInClientSearch,
    includeInClientHome: includedInClientHome,
    includeInMarketplaceFeed: includedInMarketplaceFeed,
    directSearchIncluded: includedInClientSearch,
    publicProfileRoute,
    displayName,
    searchableTerms,
    blockers,
    diagnostics: createEligibilityDiagnostics({ eligible, includedInClientSearch, includedInMarketplaceFeed, publicProfileRoute, blockers, facts }),
    facts,
    barberReference,
    barberUuid: barberRow.id,
    profileRow,
    profile,
    locationReferences,
    bookableServices
  };
}

function missingMarketplaceEligibilityDiagnostic(barberId: string): MarketplaceBarberEligibilityDiagnostic {
  const facts = {
    profileId: null,
    userId: null,
    barberId,
    approvalStatus: null,
    verificationOverall: null,
    identityStatus: null,
    licenseStatus: null,
    payoutStatus: null,
    payoutMode: "missing",
    profileVisibility: null,
    bookingStatus: null,
    serviceCount: 0,
    activeServiceCount: 0,
    availabilityCount: 0,
    workingHoursCount: 0,
    independentLocationExists: false,
    acceptedShopCount: 0,
    publicMediaCount: 0,
    username: null,
    fallbackSlug: buildFallbackBarberSlug(barberId),
    city: null,
    state: null,
    address: null,
    profileReady: false,
    locationReady: false,
    visibilityPublic: false,
    bookingActive: false,
    payoutReady: false,
    payoutAccountCount: 0,
    checkoutLibraryServiceCount: 0,
    marketplaceServiceCount: 0,
    servicesTableServiceCount: 0,
    clientVisibleServiceCount: 0,
    firstServiceSourceTable: null,
    firstServiceBarberKey: null,
    serviceSourceTablesChecked: ["services", "marketplace_services"],
    serviceBarberKeysChecked: [barberId],
    serviceSourceMismatchReason: "Barber row was not found for canonical marketplace eligibility.",
    marketplaceVisibilityRowFound: false,
    marketplaceVisibilityState: null,
    marketplaceVisibilityAcceptsInstantBookings: null,
    suspended: false,
    rejected: false,
    banned: false
  } satisfies MarketplaceBarberEligibilityDiagnostic["facts"];
  const blockers = ["Missing barber row"];

  return {
    eligible: false,
    isMarketplaceLive: false,
    includedInClientSearch: false,
    includedInClientHome: false,
    includedInMarketplaceFeed: false,
    includeInClientSearch: false,
    includeInClientHome: false,
    includeInMarketplaceFeed: false,
    directSearchIncluded: false,
    publicProfileRoute: null,
    displayName: barberId,
    searchableTerms: [barberId],
    blockers,
    diagnostics: createEligibilityDiagnostics({
      eligible: false,
      includedInClientSearch: false,
      includedInMarketplaceFeed: false,
      publicProfileRoute: null,
      blockers,
      facts
    }),
    facts
  };
}

function listAvailabilitySlotsForBarber(params: {
  barberReference: string;
  barberUuid: string;
  profileId?: string | null;
  locationReference: string;
  locationUuidByReference: Map<string, string>;
  service: Service;
  availabilityRules: CanonicalAvailabilityRuleRow[];
  appointments: CanonicalAppointmentRow[];
  blockedTimes: CanonicalBlockedTimeRow[];
  days?: number;
  earliestAt?: string;
  startDate?: string;
  timeZone?: string;
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
    earliestAt,
    startDate,
    timeZone = DEFAULT_BOOKING_TIME_ZONE
  } = params;
  const bookingTimeZone = normalizeBookingTimeZone(timeZone);

  const locationIds = new Set([locationReference, locationUuidByReference.get(locationReference)].filter((value): value is string => Boolean(value)));
  if (!locationIds.size) {
    return [] as CanonicalSlot[];
  }

  const rules = availabilityRules.filter((entry) =>
    matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberUuid, params.profileId)
    && locationIds.has(entry.location_id)
  );
  if (!rules.length) {
    return [] as CanonicalSlot[];
  }

  const unavailableAppointments = appointments
    .filter((entry) =>
      matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberUuid, params.profileId)
      && isAvailabilityBlockingAppointmentStatus(entry.status)
    )
    .map((entry) => ({ startsAt: entry.starts_at, endsAt: entry.ends_at }));
  const blockedRanges = blockedTimes
    .filter((entry) => matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberUuid, params.profileId))
    .map((entry) => ({ startsAt: entry.starts_at, endsAt: entry.ends_at }));
  const durationMinutes = service.durationMin + service.bufferMin;
  const slots: CanonicalSlot[] = [];
  const now = new Date();
  const windowStartDateKey = normalizeAvailabilityDateKey(startDate) ?? getDateKeyInTimeZone(now, bookingTimeZone);

  for (let offset = 0; offset < days; offset += 1) {
    const dateKey = addDaysToDateKey(windowStartDateKey, offset);
    const weekday = getWeekdayForDateKey(dateKey);
    if (weekday == null) {
      continue;
    }
    const dayRules = rules.filter((entry) => entry.weekday === weekday);
    const availability = buildCanonicalDateAvailability({
      date: dateKey,
      timezone: bookingTimeZone,
      workingWindows: dayRules.map((rule, index) => ({
        startTime: rule.start_time,
        endTime: rule.end_time,
        sourceId: `${rule.location_id}-${index}`
      })),
      busyRanges: [...unavailableAppointments, ...blockedRanges],
      serviceDurationMinutes: durationMinutes,
      slotIntervalMinutes: 30,
      currentTime: now,
      earliestAt
    });

    for (const slot of availability.bookableSlots) {
      slots.push({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        label: slot.label,
        locationId: locationReference,
        barberId: barberReference,
        serviceId: service.id
      });
    }
  }

  return slots;
}

function getNextAvailabilityWindowStart(params: {
  barberReference: string;
  barberUuid: string;
  profileId?: string | null;
  locationReference: string;
  locationUuidByReference: Map<string, string>;
  availabilityRules: CanonicalAvailabilityRuleRow[];
  days?: number;
  earliestAt?: string | null;
}) {
  const {
    barberUuid,
    barberReference,
    locationReference,
    locationUuidByReference,
    availabilityRules,
    days = 14,
    earliestAt
  } = params;
  const locationIds = new Set([locationReference, locationUuidByReference.get(locationReference)].filter((value): value is string => Boolean(value)));
  if (!locationIds.size) {
    return undefined;
  }

  const rules = availabilityRules.filter((entry) =>
    matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberUuid, params.profileId)
    && locationIds.has(entry.location_id)
  );
  if (!rules.length) {
    return undefined;
  }

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
      const startsAt = withTime(day, rule.start_time);
      if (startsAt.getTime() >= earliestThreshold) {
        return startsAt.toISOString();
      }
    }
  }

  return undefined;
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
    diagnosticRouteName?: string;
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
  const servicesById = new Map(snapshot.services.map((row) => [row.id, row]));
  const defaultLocation = locationsByReference.get(options.locationId) ?? locations[0];

  const diagnostics = {
    totalCandidateBarbers: snapshot.barbers.length,
    filteredOutByShopAssignment: 0,
    filteredOutByPayoutSetup: 0,
    filteredOutByVerification: 0,
    finalVisibleBarbers: 0
  };
  const visibilityDiagnostics = {
    routeName: options.diagnosticRouteName ?? (normalizedQuery || normalizedCategory ? "client_search" : "client_home"),
    totalRawBarbers: snapshot.barbers.length,
    totalAfterRoleStatus: 0,
    totalAfterSuspension: 0,
    totalAfterServiceFilter: 0,
    totalAfterAvailabilityFilter: 0,
    totalAfterLocationFilter: 0,
    totalAfterVerificationFilter: 0,
    totalAfterShopAssignmentFilter: 0,
    totalAfterPayoutFilter: 0,
    totalAfterMarketplaceVisibilityFilter: 0,
    finalVisibleCount: 0,
    targetEmail: "phillipmcgee813@gmail.com",
    targetBarberId: null as string | null,
    targetBarberProfileId: null as string | null,
    targetReferenceCode: null as string | null,
    targetRole: null as string | null,
    targetCanonicalRole: null as string | null,
    targetOnboardingState: null as string | null,
    targetAppApprovalStatus: null as string | null,
    targetStatus: null as string | null,
    targetIsBookable: null as boolean | null,
    targetIsDiscoverable: null as boolean | null,
    targetServiceCount: 0,
    targetActiveServiceCount: 0,
    targetAvailabilityCount: 0,
    targetBookable: false,
    targetDiscoverable: false,
    targetBarberUsername: "philforsure",
    targetFoundRaw: false,
    targetCanonicalBarberIdPresent: false,
    targetHasActiveService: false,
    targetHasAvailability: false,
    targetRelationshipType: null as "freelance" | "booth_rent" | "autobooth_rent" | null,
    targetMarketplaceVisible: false,
    targetFilteredReason: null as string | null
  };

  const candidates = snapshot.barbers.flatMap((barberRow) => {
    const barberReference = toReference(barberRow.id, barberRow.reference_code);
    const eligibility = buildMarketplaceBarberEligibility(snapshot, barberRow, {
      locationReferenceByUuid,
      locationsByReference,
      trustState: options.trustState
    });
    const blockerText = eligibility.blockers.join(" ");
    const targetTerms = [
      eligibility.facts.username,
      eligibility.profileRow?.username,
      barberRow.booking_slug,
      barberRow.reference_code,
      eligibility.profile?.email,
      eligibility.displayName,
      eligibility.profile?.full_name,
      ...eligibility.bookableServices.flatMap((service) => [service.name, service.category])
    ].filter(Boolean).join(" ").toLowerCase();
    const isTargetBarber = targetTerms.includes("philforsure")
      || targetTerms.includes("phillipmcgee813@gmail.com")
      || targetTerms.includes("barber-43b3cda2")
      || targetTerms.includes("test cut")
      || (targetTerms.includes("phillip") && targetTerms.includes("mcgee"));
    const hasShopAssignment = eligibility.facts.acceptedShopCount > 0;
    if (!eligibility.blockers.includes("Profile role is not barber") && eligibility.facts.bookingActive) {
      visibilityDiagnostics.totalAfterRoleStatus += 1;
    }
    if (!eligibility.facts.suspended && !eligibility.facts.rejected && !eligibility.facts.banned) {
      visibilityDiagnostics.totalAfterSuspension += 1;
    }
    if (eligibility.facts.activeServiceCount > 0) {
      visibilityDiagnostics.totalAfterServiceFilter += 1;
    }
    if (eligibility.facts.availabilityCount > 0) {
      visibilityDiagnostics.totalAfterAvailabilityFilter += 1;
    }
    if (eligibility.facts.locationReady) {
      visibilityDiagnostics.totalAfterLocationFilter += 1;
    }
    if (!/approval|suspended|rejected|banned|verification/i.test(blockerText)) {
      visibilityDiagnostics.totalAfterVerificationFilter += 1;
    }
    if (!/shop|staff/i.test(blockerText)) {
      visibilityDiagnostics.totalAfterShopAssignmentFilter += 1;
    }
    if (!eligibility.blockers.includes("Payout setup incomplete")) {
      visibilityDiagnostics.totalAfterPayoutFilter += 1;
    }
    if (eligibility.facts.visibilityPublic && eligibility.facts.bookingActive) {
      visibilityDiagnostics.totalAfterMarketplaceVisibilityFilter += 1;
    }
    if (isTargetBarber) {
      visibilityDiagnostics.targetFoundRaw = true;
      visibilityDiagnostics.targetBarberId = barberRow.id;
      visibilityDiagnostics.targetBarberProfileId = barberRow.profile_id;
      visibilityDiagnostics.targetReferenceCode = barberReference;
      visibilityDiagnostics.targetRole = eligibility.profile?.role ?? null;
      visibilityDiagnostics.targetCanonicalRole = getCanonicalAccountRole(eligibility.profile?.role).toString();
      visibilityDiagnostics.targetOnboardingState = eligibility.profile?.onboarding_state ?? null;
      visibilityDiagnostics.targetAppApprovalStatus = barberRow.app_approval_status ?? null;
      visibilityDiagnostics.targetStatus = barberRow.status ?? null;
      visibilityDiagnostics.targetIsBookable = barberRow.is_bookable ?? null;
      visibilityDiagnostics.targetIsDiscoverable = barberRow.is_discoverable ?? null;
      visibilityDiagnostics.targetServiceCount = eligibility.facts.serviceCount;
      visibilityDiagnostics.targetActiveServiceCount = eligibility.facts.activeServiceCount;
      visibilityDiagnostics.targetAvailabilityCount = eligibility.facts.availabilityCount;
      visibilityDiagnostics.targetBookable = eligibility.facts.bookingActive;
      visibilityDiagnostics.targetDiscoverable = eligibility.facts.visibilityPublic;
      visibilityDiagnostics.targetCanonicalBarberIdPresent = Boolean(eligibility.barberUuid);
      visibilityDiagnostics.targetHasActiveService = eligibility.facts.activeServiceCount > 0;
      visibilityDiagnostics.targetHasAvailability = eligibility.facts.availabilityCount > 0;
      visibilityDiagnostics.targetRelationshipType = resolveDiscoveryRelationshipType(barberRow, hasShopAssignment);
    }
    if (!eligibility.eligible) {
      if (eligibility.blockers.some((blocker) => /shop|staff|location/i.test(blocker))) {
        diagnostics.filteredOutByShopAssignment += 1;
      }
      if (eligibility.blockers.includes("Payout setup incomplete")) {
        diagnostics.filteredOutByPayoutSetup += 1;
      }
      if (eligibility.blockers.some((blocker) => /approval|suspended|rejected|banned|verification/i.test(blocker))) {
        diagnostics.filteredOutByVerification += 1;
      }
      if (isTargetBarber) {
        visibilityDiagnostics.targetFilteredReason = eligibility.blockers[0] ?? "eligibility_blocked";
      }
      return [];
    }

    if (!matchesSearchableTerms(eligibility.searchableTerms, normalizedQuery)) {
      if (isTargetBarber) {
        visibilityDiagnostics.targetFilteredReason = "query_mismatch";
      }
      return [];
    }

    const matchingServices = eligibility.bookableServices.filter((service) => {
      if (!matchesServiceCategory(service, normalizedCategory)) {
        return false;
      }

      return true;
    });
    const servicePool = matchingServices.length ? matchingServices : eligibility.bookableServices;
    const bookableServicePool = servicePool.filter((service) =>
      isMarketplaceBookableService(service)
      && ![service.id, service.name, service.category, service.barberId, service.shopId].some(isKnownNonProductionMarketplaceValue)
    );
    const primaryService = [...bookableServicePool].sort((left, right) => left.price - right.price)[0];
    if (!primaryService) {
      if (isTargetBarber) {
        visibilityDiagnostics.targetFilteredReason = "no_matching_service";
      }
      return [];
    }
    const candidateLocationReference = options.clientSignal?.favoriteShopReference && eligibility.locationReferences.includes(options.clientSignal.favoriteShopReference)
      ? options.clientSignal.favoriteShopReference
      : eligibility.locationReferences.includes(options.locationId)
        ? options.locationId
        : eligibility.locationReferences[0];
    const slots = listAvailabilitySlotsForBarber({
      barberReference,
      barberUuid: barberRow.id,
      profileId: barberRow.profile_id,
      locationReference: candidateLocationReference,
      locationUuidByReference,
      service: primaryService,
      availabilityRules: snapshot.availabilityRules,
      appointments: snapshot.appointments,
      blockedTimes: snapshot.blockedTimes
    });
    const nextSlot = slots[0];
    const nextAvailableAt = nextSlot?.startsAt
      ?? getNextAvailabilityWindowStart({
        barberReference,
        barberUuid: barberRow.id,
        profileId: barberRow.profile_id,
        locationReference: candidateLocationReference,
        locationUuidByReference,
        availabilityRules: snapshot.availabilityRules,
        earliestAt: eligibility.profileRow?.next_available_at
      })
      ?? "";

    const location = getCandidateLocation(locationsByReference, candidateLocationReference, eligibility.profileRow);
    if (!location) {
      if (isTargetBarber) {
        visibilityDiagnostics.targetFilteredReason = "location_unresolved";
      }
      return [];
    }

    const barberAppointments = snapshot.appointments.filter((entry) =>
      matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberRow.id, barberRow.profile_id)
    );
    const completedAppointments = barberAppointments.filter((entry) => entry.status === "completed");
    const cancelledCount = barberAppointments.filter((entry) => entry.status === "cancelled").length;
    const reviewRows = snapshot.reviews.filter((entry) =>
      matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberRow.id, barberRow.profile_id)
    );
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
    const specialties = eligibility.profileRow?.specialties?.length
      ? eligibility.profileRow.specialties
      : [...new Set(bookableServicePool.slice(0, 3).map((service) => service.category))];
    const distanceMiles = Number(haversineMiles(defaultLocation ?? location, location).toFixed(1));
    const routineDueSoon = Boolean(options.routine?.nextSuggestedAt) && new Date(options.routine!.nextSuggestedAt!).getTime() <= Date.now() + 3 * 24 * 60 * 60 * 1000;
    const matchedFrom = getMatchClassification({
      barberReference,
      locationReference: candidateLocationReference,
      nextAvailableAt,
      favoriteBarberReference: options.clientSignal?.favoriteBarberReference,
      favoriteShopReference: options.clientSignal?.favoriteShopReference
    });
    const name = eligibility.displayName;
    const username = resolvePublicBarberSlug({ profileRow: eligibility.profileRow, barberRow, barberReference });
    const queryScore = normalizedQuery
      ? eligibility.searchableTerms.join(" ").toLowerCase().includes(normalizedQuery)
        ? 24
        : 0
      : 0;
    const nextAvailableTimestamp = new Date(nextAvailableAt).getTime();
    const waitMinutes = Number.isFinite(nextAvailableTimestamp)
      ? Math.max(0, Math.round((nextAvailableTimestamp - Date.now()) / 60_000))
      : 720;
    const availabilityScore = Math.max(0, 80 - waitMinutes);
    const preferredBarberBoost = matchedFrom === "favorite_barber" ? 90 : 0;
    const preferredShopBoost = matchedFrom === "favorite_shop" ? 54 : 0;
    const routineBoost = routineDueSoon && options.routine?.barberReference === barberReference ? 30 : 0;
    const reviewScore = rating * 12 + reviewCount * 2;
    const conversionScore = completedAppointments.length * 4 - cancelledCount * 3;
    const distanceScore = Math.max(0, 18 - distanceMiles * 3);
    const accelerationScore = preferredBarberBoost + preferredShopBoost + routineBoost + availabilityScore + reviewScore + conversionScore + distanceScore + queryScore;

    if (isTargetBarber) {
      visibilityDiagnostics.targetMarketplaceVisible = true;
      visibilityDiagnostics.targetFilteredReason = null;
    }

    return [{
      barberId: barberReference,
      barberUuid: barberRow.id,
      username,
      barberName: name,
      rating,
      reviewCount,
      priceRange: [
        Math.min(...bookableServicePool.map((service) => service.price)),
        Math.max(...bookableServicePool.map((service) => service.price))
      ],
      nextAvailableAt,
      appointmentTime: nextSlot?.startsAt,
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
        eligibility.profileRow?.badges,
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
  });

  diagnostics.finalVisibleBarbers = candidates.length;
  visibilityDiagnostics.finalVisibleCount = candidates.length;
  console.info("[marketplace] barberSearchFilters", {
    reference: "barberSearchFilters",
    query: options.query ?? null,
    category: options.category ?? null,
    locationId: options.locationId || null,
    ...diagnostics
  });
  console.info("[marketplace] barber_visibility_diagnostics", {
    reference: "barber_visibility_diagnostics",
    query: options.query ?? null,
    category: options.category ?? null,
    locationId: options.locationId || null,
    ...visibilityDiagnostics
  });
  console.info("[marketplace] client_search_barber_filter", {
    reference: "client_search_barber_filter",
    query: options.query ?? null,
    category: options.category ?? null,
    routeName: visibilityDiagnostics.routeName,
    targetEmail: visibilityDiagnostics.targetEmail,
    targetBarberId: visibilityDiagnostics.targetBarberId,
    targetReferenceCode: visibilityDiagnostics.targetReferenceCode,
    role: visibilityDiagnostics.targetRole,
    onboardingState: visibilityDiagnostics.targetOnboardingState,
    appApprovalStatus: visibilityDiagnostics.targetAppApprovalStatus,
    status: visibilityDiagnostics.targetStatus,
    isBookable: visibilityDiagnostics.targetIsBookable,
    isDiscoverable: visibilityDiagnostics.targetIsDiscoverable,
    serviceCount: visibilityDiagnostics.targetServiceCount,
    activeServiceCount: visibilityDiagnostics.targetActiveServiceCount,
    availabilityCount: visibilityDiagnostics.targetAvailabilityCount,
    finalIncluded: visibilityDiagnostics.targetMarketplaceVisible,
    filteredReason: visibilityDiagnostics.targetFilteredReason
  });

  return candidates.sort((left, right) => {
    const scoreDelta = right.accelerationScore - left.accelerationScore;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const leftTime = new Date(left.nextAvailableAt).getTime();
    const rightTime = new Date(right.nextAvailableAt).getTime();
    return (Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER);
  });
}

export async function getCanonicalMarketplaceEligibility(
  supabase: SupabaseClient,
  barberId: string,
  options: {
    trustState?: TrustState;
    directSearchQuery?: string;
  } = {}
): Promise<MarketplaceBarberEligibilityDiagnostic> {
  const snapshot = await readCanonicalSnapshot(supabase);
  const barberRow = snapshot.barbers.find((row) => {
    const barberReference = toReference(row.id, row.reference_code);
    return matchesBarberIdentifier({
      identifier: barberId,
      row,
      barberReference,
      profileRow: getCanonicalBarberProfileRow(snapshot, barberReference, row.id, row.profile_id)
    });
  });
  if (!barberRow) {
    return missingMarketplaceEligibilityDiagnostic(barberId);
  }

  const locations = snapshot.locations.map(mapLocation);
  const locationsByReference = new Map(locations.map((location) => [location.id, location]));
  const locationReferenceByUuid = new Map(snapshot.locations.map((row) => [row.id, toReference(row.id, row.reference_code)]));
  const diagnostic = buildMarketplaceBarberEligibility(snapshot, barberRow, {
    locationReferenceByUuid,
    locationsByReference,
    trustState: options.trustState
  });
  const publicDiagnostic: MarketplaceBarberEligibilityDiagnostic = {
    eligible: diagnostic.eligible,
    isMarketplaceLive: diagnostic.eligible,
    includedInClientSearch: diagnostic.includedInClientSearch,
    includedInClientHome: diagnostic.includedInClientHome,
    includedInMarketplaceFeed: diagnostic.includedInMarketplaceFeed,
    includeInClientSearch: diagnostic.includedInClientSearch,
    includeInClientHome: diagnostic.includedInClientHome,
    includeInMarketplaceFeed: diagnostic.includedInMarketplaceFeed,
    directSearchIncluded: diagnostic.includedInClientSearch,
    publicProfileRoute: diagnostic.publicProfileRoute,
    displayName: diagnostic.displayName,
    searchableTerms: diagnostic.searchableTerms,
    blockers: diagnostic.blockers,
    diagnostics: diagnostic.diagnostics,
    facts: diagnostic.facts
  };
  const directSearchQuery = options.directSearchQuery?.trim();
  if (directSearchQuery && diagnostic.eligible && !matchesSearchableTerms(diagnostic.searchableTerms, directSearchQuery)) {
    const blockers = [...diagnostic.blockers, `Direct search "${directSearchQuery}" does not match this barber`];
    return {
      ...publicDiagnostic,
      includedInClientSearch: false,
      includedInClientHome: false,
      includeInClientSearch: false,
      includeInClientHome: false,
      directSearchIncluded: false,
      blockers,
      diagnostics: createEligibilityDiagnostics({
        eligible: diagnostic.eligible,
        includedInClientSearch: false,
        includedInMarketplaceFeed: diagnostic.includedInMarketplaceFeed,
        publicProfileRoute: diagnostic.publicProfileRoute,
        blockers,
        facts: diagnostic.facts
      })
    };
  }

  return publicDiagnostic;
}

export async function getCanonicalBarberServices(
  supabase: SupabaseClient,
  barberIdOrReference: string
): Promise<CanonicalBarberServicesResult> {
  const snapshot = await readCanonicalSnapshot(supabase);
  const barberRow = snapshot.barbers.find((row) => {
    const reference = toReference(row.id, row.reference_code);
    return row.id === barberIdOrReference
      || row.profile_id === barberIdOrReference
      || reference === barberIdOrReference;
  });

  if (!barberRow) {
    return {
      services: [],
      activeServices: [],
      clientVisibleServices: [],
      sourceDiagnostics: {
        checkoutLibraryCount: 0,
        marketplaceServicesCount: 0,
        servicesTableCount: 0,
        onboardingServicesCount: 0,
        syncedCount: 0,
        sourceTablesChecked: ["services", "marketplace_services"],
        barberKeysChecked: [barberIdOrReference],
        sourceMismatchReason: "Barber row was not found for canonical service lookup."
      }
    };
  }

  const locationReferenceByUuid = new Map(snapshot.locations.map((row) => [row.id, toReference(row.id, row.reference_code)]));
  const barberReference = toReference(barberRow.id, barberRow.reference_code);
  const locationReferences = getCandidateLocationReferences(
    barberReference,
    barberRow.id,
    barberRow.profile_id,
    snapshot.services,
    snapshot.availabilityRules,
    snapshot.appointments,
    locationReferenceByUuid
  );

  return getCanonicalBarberServicesFromRows({
    barberReference,
    barberUuid: barberRow.id,
    profileId: barberRow.profile_id,
    locationReferences,
    rows: snapshot.services,
    locationReferenceByUuid
  });
}

export async function getMarketplaceEligibilityForBarber(
  supabase: SupabaseClient,
  barberId: string,
  options: {
    trustState?: TrustState;
    directSearchQuery?: string;
  } = {}
): Promise<MarketplaceBarberEligibilityDiagnostic> {
  return getCanonicalMarketplaceEligibility(supabase, barberId, options);
}

export async function buildCanonicalDiscoveryResults(
  supabase: SupabaseClient,
  options: {
    locationId: string;
    query?: string;
    category?: string;
    diagnosticRouteName?: string;
    clientSignal?: ClientBookingSignal;
    routine?: RoutineSignal | null;
    trustState?: TrustState;
  }
) {
  const snapshot = await readCanonicalSnapshot(supabase);
  const candidates = buildCandidateRecords(snapshot, options);
  const profileByBarberReference = new Map(snapshot.barberProfiles.map((profile) => [profile.barber_reference, profile]));
  const portfolioPreviewByBarberReference = new Map<string, string[]>();

  for (const asset of snapshot.portfolios) {
    const imageUrl = canonicalMediaUrl(asset.image_url, asset.storage_path);
    if (!imageUrl) {
      continue;
    }

    portfolioPreviewByBarberReference.set(asset.barber_reference, [
      ...(portfolioPreviewByBarberReference.get(asset.barber_reference) ?? []),
      imageUrl
    ].slice(0, 4));
  }

  return candidates.map((candidate) => ({
    barberId: candidate.barberId,
    username: candidate.username,
    barberName: candidate.barberName,
    locationId: candidate.locationId,
    locationLabel: candidate.location.name,
    cityLabel: [candidate.location.city, candidate.location.state].filter(Boolean).join(", ") || undefined,
    profilePhotoUrl: canonicalMediaUrl(
      profileByBarberReference.get(candidate.barberId)?.profile_photo_url,
      profileByBarberReference.get(candidate.barberId)?.profile_photo_path
    ),
    galleryPreviewUrls: portfolioPreviewByBarberReference.get(candidate.barberId) ?? [],
    rating: candidate.rating,
    reviewCount: candidate.reviewCount,
    priceRange: candidate.priceRange,
    nextAvailableAt: candidate.nextAvailableAt,
    availabilityLabel: candidate.appointmentTime ? undefined : "Book appointment",
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
  if (!candidate?.appointmentTime) {
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
    timeZone?: string;
    trustState?: TrustState;
  }
) {
  const snapshot = await readCanonicalSnapshot(supabase);
  const barberRow = snapshot.barbers.find((row) => {
    const reference = toReference(row.id, row.reference_code);
    return matchesBarberIdentifier({
      identifier: barberIdOrUsername,
      row,
      barberReference: reference,
      profileRow: getCanonicalBarberProfileRow(snapshot, reference, row.id, row.profile_id)
    });
  });
  if (!barberRow) {
    return null;
  }

  const locationReferenceByUuid = new Map(snapshot.locations.map((row) => [row.id, toReference(row.id, row.reference_code)]));
  const locationUuidByReference = new Map(snapshot.locations.map((row) => [toReference(row.id, row.reference_code), row.id]));
  const barberReference = toReference(barberRow.id, barberRow.reference_code);
  const profileRow = getCanonicalBarberProfileRow(snapshot, barberReference, barberRow.id, barberRow.profile_id);
  if (
    !isCanonicalBarberPlatformApproved(barberRow, options.trustState, barberReference)
    || !isCanonicalMarketplaceVisibilityReady(snapshot, barberReference, barberRow.id, barberRow.profile_id, profileRow, barberRow)
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
    barberRow.profile_id,
    snapshot.services,
    snapshot.availabilityRules,
    snapshot.appointments,
    locationReferenceByUuid
  );
  const locationReferences = rawLocationReferences.filter((locationReference) =>
    isLocationPubliclyBookable(options.trustState, locationReference)
  );
  const services = getServicesForBarber(barberReference, barberRow.id, barberRow.profile_id, locationReferences, snapshot.services, locationReferenceByUuid);
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
      profileId: barberRow.profile_id,
      locationReference,
      locationUuidByReference,
      service: selectedService,
      availabilityRules: snapshot.availabilityRules,
      appointments: snapshot.appointments,
      blockedTimes: snapshot.blockedTimes,
      days: options.days,
      earliestAt: options.earliestAt,
      timeZone: options.timeZone
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
    startDate?: string;
    timeZone?: string;
    trustState?: TrustState;
  }
) {
  const snapshot = await readCanonicalSnapshot(supabase);
  const barberRow = snapshot.barbers.find((row) => {
    const reference = toReference(row.id, row.reference_code);
    return matchesBarberIdentifier({
      identifier: barberIdOrUsername,
      row,
      barberReference: reference,
      profileRow: getCanonicalBarberProfileRow(snapshot, reference, row.id, row.profile_id)
    });
  });
  if (!barberRow) {
    return null;
  }

  const locationReferenceByUuid = new Map(snapshot.locations.map((row) => [row.id, toReference(row.id, row.reference_code)]));
  const locationUuidByReference = new Map(snapshot.locations.map((row) => [toReference(row.id, row.reference_code), row.id]));
  const barberReference = toReference(barberRow.id, barberRow.reference_code);
  const profileRow = getCanonicalBarberProfileRow(snapshot, barberReference, barberRow.id, barberRow.profile_id);
  if (
    !isCanonicalBarberPlatformApproved(barberRow, options.trustState, barberReference)
    || !isCanonicalMarketplaceVisibilityReady(snapshot, barberReference, barberRow.id, barberRow.profile_id, profileRow, barberRow)
    || !isBarberDiscoverable(options.trustState, barberReference)
  ) {
    return {
      barberId: barberReference,
      locationId: options.locationId ?? "",
      timezone: normalizeBookingTimeZone(options.timeZone),
      service: null,
      slots: [],
      gating: getBarberBookingGate(options.trustState, barberReference)
    };
  }

  const bookingGate = getBarberBookingGate(options.trustState, barberReference);
  const rawLocationReferences = getCandidateLocationReferences(
    barberReference,
    barberRow.id,
    barberRow.profile_id,
    snapshot.services,
    snapshot.availabilityRules,
    snapshot.appointments,
    locationReferenceByUuid
  );
  const locationReferences = rawLocationReferences.filter((locationReference) =>
    isLocationPubliclyBookable(options.trustState, locationReference)
  );
  const services = getServicesForBarber(barberReference, barberRow.id, barberRow.profile_id, locationReferences, snapshot.services, locationReferenceByUuid);
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
      timezone: normalizeBookingTimeZone(options.timeZone),
      service: null,
      slots: [],
      gating: bookingGate && !bookingGate.allowed ? bookingGate : locationGate
    };
  }

  if ((bookingGate && !bookingGate.allowed) || (locationGate && !locationGate.allowed)) {
    return {
      barberId: barberReference,
      locationId,
      timezone: normalizeBookingTimeZone(options.timeZone),
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
    profileId: barberRow.profile_id,
    locationReference: locationId,
    locationUuidByReference,
    service: selectedService,
    availabilityRules: snapshot.availabilityRules,
    appointments: snapshot.appointments,
    blockedTimes: snapshot.blockedTimes,
    days: options.days,
    earliestAt: options.earliestAt,
    startDate: options.startDate,
    timeZone: options.timeZone
  });

  return {
    barberId: barberReference,
    locationId,
    timezone: normalizeBookingTimeZone(options.timeZone),
    service: {
      id: selectedService.id,
      name: selectedService.name,
      durationMin: selectedService.durationMin,
      bufferMin: selectedService.bufferMin,
      price: selectedService.price,
      deposit: selectedService.deposit,
      fullPrepay: selectedService.fullPrepay
    },
    slots: slots.slice(0, 128),
    gating: null
  };
}
export async function buildCanonicalBarberProfile(
  supabase: SupabaseClient,
  barberIdOrUsername: string,
  trustState?: TrustState
): Promise<PublicBarberProfileView | null> {
  const snapshot = await readCanonicalSnapshot(supabase);
  const barberRow = snapshot.barbers.find((row) => {
    const reference = toReference(row.id, row.reference_code);
    return matchesBarberIdentifier({
      identifier: barberIdOrUsername,
      row,
      barberReference: reference,
      profileRow: getCanonicalBarberProfileRow(snapshot, reference, row.id, row.profile_id)
    });
  });
  if (!barberRow) {
    return null;
  }

  const barberReference = toReference(barberRow.id, barberRow.reference_code);
  if (!isCanonicalBarberPlatformApproved(barberRow, trustState, barberReference) || !isBarberDiscoverable(trustState, barberReference)) {
    return null;
  }

  const profileRow = getCanonicalBarberProfileRow(snapshot, barberReference, barberRow.id, barberRow.profile_id);
  const profile = snapshot.profiles.find((entry) => entry.id === barberRow.profile_id);
  if (
    !isCanonicalBarberProfileRole(profile)
    || !isCanonicalMarketplaceVisibilityReady(snapshot, barberReference, barberRow.id, barberRow.profile_id, profileRow, barberRow)
    || !hasRealMarketplaceText(profile?.full_name ?? profileRow?.display_name)
  ) {
    return null;
  }
  const locationReferenceByUuid = new Map(snapshot.locations.map((row) => [row.id, toReference(row.id, row.reference_code)]));
  const locationUuidByReference = new Map(snapshot.locations.map((row) => [toReference(row.id, row.reference_code), row.id]));
  const rawLocationReferences = getCandidateLocationReferences(
    barberReference,
    barberRow.id,
    barberRow.profile_id,
    snapshot.services,
    snapshot.availabilityRules,
    snapshot.appointments,
    locationReferenceByUuid
  );
  const locationReferences = rawLocationReferences.filter((locationReference) =>
    isLocationPubliclyBookable(trustState, locationReference)
  );
  const locationsByReference = new Map(snapshot.locations.map((row) => [toReference(row.id, row.reference_code), mapLocation(row)]));
  const locations = locationReferences
    .map((locationReference) => getCandidateLocation(locationsByReference, locationReference, profileRow))
    .filter((location): location is Location => Boolean(location));
  const services = getServicesForBarber(barberReference, barberRow.id, barberRow.profile_id, locationReferences, snapshot.services, locationReferenceByUuid);
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
  const reviewRows = snapshot.reviews.filter((entry) =>
    matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberRow.id, barberRow.profile_id)
  );
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
    profileId: barberRow.profile_id,
    locationReference: primaryLocation.id,
    locationUuidByReference,
    service: serviceCatalog[0].service,
    availabilityRules: snapshot.availabilityRules,
    appointments: snapshot.appointments,
    blockedTimes: snapshot.blockedTimes
  });
  const nextSlot = nextSlots[0];
  const nextAvailableAt = nextSlot?.startsAt
    ?? getNextAvailabilityWindowStart({
      barberReference,
      barberUuid: barberRow.id,
      profileId: barberRow.profile_id,
      locationReference: primaryLocation.id,
      locationUuidByReference,
      availabilityRules: snapshot.availabilityRules,
      earliestAt: profileRow?.next_available_at
    })
    ?? "";

  const completedAppointments = snapshot.appointments.filter((entry) =>
    matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberRow.id, barberRow.profile_id)
    && entry.status === "completed"
  );
  const bookingsCreated = snapshot.appointments.filter((entry) =>
    matchesCanonicalBarberIdentity(entry.barber_id, barberReference, barberRow.id, barberRow.profile_id)
    && entry.status !== "cancelled"
  ).length;
  const completionRate = bookingsCreated ? Math.round((completedAppointments.length / bookingsCreated) * 100) : 100;
  const locationIds = locations.map((location) => location.id);
  const name = getClientFacingBarberName({
    username: profileRow?.username ?? barberRow.booking_slug,
    publicDisplayName: profileRow?.display_name,
    name: profile?.full_name ?? barberReference
  });
  const username = resolvePublicBarberSlug({ profileRow, barberRow, barberReference });
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
    role: "barber",
    barberSubtype: normalizeBarberSubtype(barberRow.barber_subtype),
    locationIds,
    specialties: profileRow?.specialties?.length ? profileRow.specialties : [...new Set(serviceCatalog.map((entry) => entry.service.category))],
    rating: averageRating,
    reviewCount: reviews.length,
    compensationModel: toDomainCompensationModel(barberRow.compensation_model),
    autoBoothPercent: barberRow.compensation_model === "autobooth_rent" && barberRow.autobooth_percent !== null
      ? numeric(barberRow.autobooth_percent)
      : undefined,
    // Both supported models are rent agreements, so both carry rent terms.
    boothRentAmount: barberRow.compensation_model === "booth_rent" || barberRow.compensation_model === "autobooth_rent"
      ? numeric(barberRow.booth_rent_amount)
      : undefined,
    boothRentFrequency: barberRow.booth_rent_frequency ?? undefined,
    todayEarnings: Number(completedAppointments.filter((entry) => entry.starts_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((sum, entry) => sum + numeric(entry.total_amount), 0).toFixed(2)),
    upcomingPayout: Number(completedAppointments.reduce((sum, entry) => sum + numeric(entry.total_amount), 0).toFixed(2)),
    availabilityLabel: nextSlot ? createSlotLabel(new Date(nextSlot.startsAt)) : "Book appointment",
    bio: barberRow.bio ?? profileRow?.bio ?? `${name} is ready to book on BVRB3R.`,
    bookingLink: buildMarketplaceBookingHref({
      barberId: barberReference,
      username,
      locationId: primaryLocation.id,
      serviceId: mostBookedService?.service.id,
      sourceKind: "public_profile",
      appointmentTime: nextSlot?.startsAt
    })
  };
  const profileView = {
    id: barberReference,
    barberId: barberReference,
    username,
    photoAccent: "#7cff00",
    profilePhotoUrl: canonicalMediaUrl(profileRow?.profile_photo_url, profileRow?.profile_photo_path),
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
      appointmentTime: nextSlot?.startsAt
    })
  };
}






