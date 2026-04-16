/* eslint-disable @typescript-eslint/no-explicit-any */
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  createEmptyMarketplaceState,
  createServiceDefinition,
  deleteServiceDefinition,
  getHaircutNowMatch,
  getMapDiscoveryMarkers,
  getPublicBarberProfileByUsername,
  getServiceCatalogView,
  searchMarketplace,
  updateServiceDefinition,
  MarketplaceValidationError,
  type MarketplaceActor,
  type MarketplaceState,
  type PublicBarberProfileView,
  type ServiceCatalogView,
  type ServiceMutationInput
} from "@/lib/marketplace/engine";
import { buildBarberProofSignals, enrichPublicProfileWithProof, rankDiscoveryResults, replaceServicePopularity } from "@/lib/marketplace/insights";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { EngagementState } from "@/types/engagement";
import type {
  Barber,
  BarberRankingInput,
  DiscoveryFilters,
  DiscoveryResult,
  HaircutNowMatch,
  Location,
  MarketplaceBookingAttribution,
  MarketplaceConversionEvent,
  PersistedServicePopularityRow,
  Service,
  Shop,
  StyleTag
} from "@/types/domain";
import type { TrustState } from "@/types/trust";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export interface MarketplaceRuntimeData {
  state: MarketplaceState;
  servicePopularity: PersistedServicePopularityRow[];
  rankingInputs: BarberRankingInput[];
  conversionEvents: MarketplaceConversionEvent[];
  bookingAttributions: MarketplaceBookingAttribution[];
}

export interface MarketplaceProvider {
  kind: "supabase";
  readRuntime(): Promise<MarketplaceRuntimeData>;
  createService(actor: MarketplaceActor, input: ServiceMutationInput): Promise<{ service: Service }>;
  updateService(actor: MarketplaceActor, serviceId: string, input: Partial<ServiceMutationInput>): Promise<{ service: Service }>;
  deleteService(actor: MarketplaceActor, serviceId: string): Promise<{ service: Service }>;
  recordDiscoveryImpression(input: { filters: DiscoveryFilters; results: DiscoveryResult[]; clientId?: string }): Promise<void>;
  recordProfileView(input: { barberId: string; username: string; clientId?: string }): Promise<void>;
  recordHaircutNowImpression(input: { match: HaircutNowMatch | null; clientId?: string }): Promise<void>;
  recordBookingCtaClick(input: { barberId: string; username?: string; sourceKind: MarketplaceConversionEvent["sourceKind"]; clientId?: string; locationId?: string; metadata?: Record<string, string | number | boolean | null> }): Promise<void>;
  recordShareEvent(input: { eventType: Extract<MarketplaceConversionEvent["eventType"], "profile_shared" | "referral_shared">; barberId?: string; username?: string; sourceKind: MarketplaceConversionEvent["sourceKind"]; clientId?: string; locationId?: string; sourceReference?: string; metadata?: Record<string, string | number | boolean | null> }): Promise<void>;
  recordBookingCreated(input: { appointmentId: string; barberId: string; username?: string; clientId?: string; clientEmail?: string; locationId?: string; sourceKind: MarketplaceConversionEvent["sourceKind"]; matchedFrom?: HaircutNowMatch["matchedFrom"]; query?: string }): Promise<void>;
  recordBookingCompleted(input: { appointmentId: string }): Promise<void>;
  recordFollowCreated(input: { barberId: string; username?: string; clientId?: string }): Promise<void>;
  joinWaitlist(input: { barberId?: string; serviceId: string; locationId: string; clientId?: string; query?: string }): Promise<{ id: string }>;
}

function nowIso() { return new Date().toISOString(); }
function makeId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function getClientEmail(clientId?: string) { return clientId ? `${clientId}@client.bvrb3r.local` : undefined; }
function tableRows<T>(rows: T[] | null | undefined) { return rows ?? []; }
function reference(row: { id?: string; reference_code?: string | null } | null | undefined) { return row?.reference_code ?? row?.id ?? ""; }
function uniqueStrings(values: Array<string | undefined | null>) { return [...new Set(values.filter(Boolean) as string[])]; }

function getServiceRowsByBarber(services: Service[]) {
  return services.reduce((map, service) => {
    if (!service.barberId) return map;
    map.set(service.barberId, [...(map.get(service.barberId) ?? []), service.id]);
    return map;
  }, new Map<string, string[]>());
}

function emptyRuntimeData(): MarketplaceRuntimeData {
  return {
    state: createEmptyMarketplaceState(),
    servicePopularity: [],
    rankingInputs: [],
    conversionEvents: [],
    bookingAttributions: []
  };
}

function serviceToRow(service: Service) {
  return {
    service_reference: service.id,
    category: service.category,
    name: service.name,
    description: service.description,
    duration_min: service.durationMin,
    buffer_min: service.bufferMin,
    price: service.price,
    deposit_amount: service.deposit,
    full_prepay_required: service.fullPrepay,
    owner_type: service.ownerType ?? "shop",
    barber_reference: service.barberId ?? null,
    shop_reference: service.shopId ?? null,
    style_tag_ids: service.styleTagIds ?? []
  };
}

async function refreshDerivedSignals(supabase: SupabaseClient) {
  const [
    servicesResult,
    appointmentsResult,
    canonicalServicesResult,
    canonicalBarbersResult,
    canonicalClientsResult,
    reviewsResult,
    followsResult,
    reputationResult,
    visibilityResult,
    profilesResult,
    portfolioResult,
    conversionEventsResult
  ] = await Promise.all([
    supabase.from("marketplace_services").select("*"),
    supabase.from("appointments").select("service_id, barber_id, client_id, status, total_amount, starts_at"),
    supabase.from("services").select("id, reference_code"),
    supabase.from("barbers").select("id, reference_code"),
    supabase.from("clients").select("id, reference_code"),
    supabase.from("reviews").select("barber_id, client_id, rating"),
    supabase.from("barber_follows").select("barber_reference"),
    supabase.from("reputation_scores").select("barber_reference, overall_score, retention_score"),
    supabase.from("marketplace_visibility").select("barber_reference, visibility_state, featured_rank"),
    supabase.from("barber_profiles").select("barber_reference, next_available_at"),
    supabase.from("barber_portfolios").select("barber_reference, featured"),
    supabase.from("marketplace_conversion_events").select("event_type, barber_reference, source_kind")
  ]);

  for (const result of [servicesResult, appointmentsResult, canonicalServicesResult, canonicalBarbersResult, canonicalClientsResult, reviewsResult, followsResult, reputationResult, visibilityResult, profilesResult, portfolioResult, conversionEventsResult]) {
    if (result.error) throw result.error;
  }

  const services = tableRows(servicesResult.data).map((row: any) => ({ id: row.service_reference, barberId: row.barber_reference ?? undefined }));
  const serviceReferenceMap = new Map(tableRows(canonicalServicesResult.data).map((row: any) => [row.id, reference(row)]));
  const barberReferenceMap = new Map(tableRows(canonicalBarbersResult.data).map((row: any) => [row.id, reference(row)]));
  const clientReferenceMap = new Map(tableRows(canonicalClientsResult.data).map((row: any) => [row.id, reference(row)]));
  const appointmentRows = tableRows(appointmentsResult.data).map((appointment: any) => ({
    service_reference: serviceReferenceMap.get(appointment.service_id) ?? appointment.service_id,
    barber_reference: barberReferenceMap.get(appointment.barber_id) ?? appointment.barber_id,
    client_reference: clientReferenceMap.get(appointment.client_id) ?? appointment.client_id,
    status: appointment.status,
    total_amount: appointment.total_amount,
    starts_at: appointment.starts_at
  }));
  const reviewRows = tableRows(reviewsResult.data).map((review: any) => ({
    barber_reference: barberReferenceMap.get(review.barber_id) ?? review.barber_id,
    client_reference: clientReferenceMap.get(review.client_id) ?? review.client_id,
    rating: Number(review.rating ?? 0)
  }));

  const servicePopularity = services.map((service) => {
    const appointments = appointmentRows.filter((appointment: any) => appointment.service_reference === service.id && appointment.status !== "cancelled" && appointment.status !== "no_show");
    const completed = appointments.filter((appointment: any) => appointment.status === "completed");
    const uniqueClients = [...new Set(appointments.map((appointment: any) => appointment.client_reference))];
    const repeatClients = uniqueClients.filter((clientId) => appointments.filter((appointment: any) => appointment.client_reference === clientId).length > 1).length;
    const relatedReviews = reviewRows.filter((review) => (service.barberId ? review.barber_reference === service.barberId : true));
    return {
      service_reference: service.id,
      booking_count: appointments.length,
      revenue_generated: completed.reduce((sum: number, appointment: any) => sum + Number(appointment.total_amount ?? 0), 0),
      average_rating: relatedReviews.length ? relatedReviews.reduce((sum, review) => sum + review.rating, 0) / relatedReviews.length : 0,
      repeat_rate: uniqueClients.length ? Math.round((repeatClients / uniqueClients.length) * 100) : 0,
      popularity_rank: 0,
      updated_at: nowIso()
    };
  }).sort((left, right) => right.booking_count - left.booking_count || right.revenue_generated - left.revenue_generated);

  servicePopularity.forEach((row, index) => { row.popularity_rank = index + 1; });
  if (servicePopularity.length) {
    const result = await supabase.from("marketplace_service_popularity").upsert(servicePopularity, { onConflict: "service_reference" });
    if (result.error) throw result.error;
  }

  const followCounts = new Map<string, number>();
  tableRows(followsResult.data).forEach((row: any) => followCounts.set(row.barber_reference, (followCounts.get(row.barber_reference) ?? 0) + 1));
  const reputationMap = new Map(tableRows(reputationResult.data).map((row: any) => [row.barber_reference, row]));
  const visibilityMap = new Map(tableRows(visibilityResult.data).map((row: any) => [row.barber_reference, row]));
  const profileMap = new Map(tableRows(profilesResult.data).map((row: any) => [row.barber_reference, row]));
  const portfolioMap = new Map<string, { featured: number; total: number }>();
  tableRows(portfolioResult.data).forEach((row: any) => portfolioMap.set(row.barber_reference, {
    featured: (portfolioMap.get(row.barber_reference)?.featured ?? 0) + (row.featured ? 1 : 0),
    total: (portfolioMap.get(row.barber_reference)?.total ?? 0) + 1
  }));

  const conversionRows = tableRows(conversionEventsResult.data);
  const barberReferences = tableRows(canonicalBarbersResult.data).map((row: any) => reference(row)).filter(Boolean);
  const rankingRows = barberReferences.map((barberReference) => {
    const barberServices = services.filter((service) => service.barberId === barberReference);
    const barberReviewRows = reviewRows.filter((review) => review.barber_reference === barberReference);
    const reviewCount = barberReviewRows.length;
    const averageRating = barberReviewRows.length ? barberReviewRows.reduce((sum, review) => sum + review.rating, 0) / barberReviewRows.length : 0;
    const popularityScore = barberServices.reduce((sum, service) => sum + (servicePopularity.find((row) => row.service_reference === service.id)?.booking_count ?? 0), 0) * 6;
    const followCount = followCounts.get(barberReference) ?? 0;
    const reputation = reputationMap.get(barberReference);
    const portfolio = portfolioMap.get(barberReference) ?? { featured: 0, total: 0 };
    const nextAvailableAt = profileMap.get(barberReference)?.next_available_at ? new Date(profileMap.get(barberReference).next_available_at).getTime() : Date.now();
    const availabilityScore = Math.max(0, 18 - Math.min((nextAvailableAt - Date.now()) / 3_600_000, 18));
    const visibility = visibilityMap.get(barberReference);
    const bookingClicks = conversionRows.filter((row: any) => row.barber_reference === barberReference && row.event_type === "booking_cta_clicked").length;
    const bookingsCreated = conversionRows.filter((row: any) => row.barber_reference === barberReference && row.event_type === "booking_created").length;
    const conversionScore = bookingClicks ? (bookingsCreated / bookingClicks) * 100 : bookingsCreated * 10;
    const rankingScore = averageRating * 22 + reviewCount * 0.18 + followCount * 4 + Number(reputation?.overall_score ?? 0) * 0.6 + popularityScore + availabilityScore + portfolio.featured * 12 + portfolio.total * 4 + conversionScore + (visibility?.visibility_state === "featured" ? 18 - Number(visibility?.featured_rank ?? 0) : 6);
    return {
      barber_reference: barberReference,
      distance_score: 0,
      average_rating_score: averageRating * 20,
      review_volume_score: reviewCount,
      retention_score: Number(reputation?.retention_score ?? 0),
      availability_score: availabilityScore,
      portfolio_engagement_score: portfolio.featured * 12 + portfolio.total * 4,
      follow_count: followCount,
      reputation_score: Number(reputation?.overall_score ?? 0),
      service_popularity_score: popularityScore,
      rebooking_score: 0,
      conversion_score: conversionScore,
      visibility_score: visibility?.visibility_state === "featured" ? 16 : 6,
      ranking_score: rankingScore,
      label: visibility?.visibility_state === "featured" ? "Featured in marketplace" : "Visible in discovery",
      updated_at: nowIso()
    };
  });

  if (rankingRows.length) {
    const result = await supabase.from("barber_rankings").upsert(rankingRows, { onConflict: "barber_reference" });
    if (result.error) throw result.error;
  }
}

function normalizeHours(hours: unknown) {
  if (!hours || (typeof hours === "object" && !Object.keys(hours).length)) return "Hours not configured";
  return typeof hours === "string" ? hours : JSON.stringify(hours);
}

function normalizeStyleCategory(category: string): StyleTag["category"] {
  return ["cut", "beard", "finish", "kids", "style"].includes(category) ? category as StyleTag["category"] : "style";
}

function withRuntimeTime(day: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(day);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function overlapsRuntimeRange(start: Date, end: Date, ranges: Array<{ startsAt: string; endsAt: string }>) {
  return ranges.some((range) => {
    const rangeStart = new Date(range.startsAt).getTime();
    const rangeEnd = new Date(range.endsAt).getTime();
    return start.getTime() < rangeEnd && end.getTime() > rangeStart;
  });
}

function getNextRuntimeBookableSlot(input: {
  barberUuid: string;
  locationReferences: string[];
  locationUuidByReference: Map<string, string>;
  services: Array<{
    durationMin: number;
    bufferMin: number;
    locationReference: string;
    barberReference?: string;
    shopReference?: string;
  }>;
  availabilityRules: any[];
  blockedTimes: any[];
  appointments: any[];
}) {
  const service = input.services
    .filter((entry) => input.locationReferences.includes(entry.shopReference ?? entry.locationReference))
    .sort((left, right) => left.durationMin + left.bufferMin - (right.durationMin + right.bufferMin))[0];
  if (!service) {
    return undefined;
  }

  const durationMinutes = service.durationMin + service.bufferMin;
  const blockedRanges = input.blockedTimes
    .filter((entry: any) => entry.barber_id === input.barberUuid)
    .map((entry: any) => ({ startsAt: entry.starts_at, endsAt: entry.ends_at }));
  const appointmentRanges = input.appointments
    .filter((entry: any) => entry.barber_id === input.barberUuid && entry.status !== "cancelled" && entry.status !== "no_show")
    .map((entry: any) => ({ startsAt: entry.starts_at, endsAt: entry.ends_at }));
  const now = new Date();
  const earliest = now.getTime() + 15 * 60_000;
  const slots: string[] = [];

  for (const locationReference of input.locationReferences) {
    const locationUuid = input.locationUuidByReference.get(locationReference);
    if (!locationUuid) {
      continue;
    }

    const scopedRules = input.availabilityRules.filter((entry: any) =>
      entry.barber_id === input.barberUuid
      && entry.location_id === locationUuid
    );

    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(now);
      day.setDate(now.getDate() + offset);
      const dayRules = scopedRules.filter((entry: any) => entry.weekday === day.getDay());

      for (const rule of dayRules) {
        const cursor = withRuntimeTime(day, rule.start_time);
        const endBoundary = withRuntimeTime(day, rule.end_time);

        while (cursor.getTime() + durationMinutes * 60_000 <= endBoundary.getTime()) {
          const slotStart = new Date(cursor);
          const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);
          if (
            slotStart.getTime() >= earliest
            && !overlapsRuntimeRange(slotStart, slotEnd, blockedRanges)
            && !overlapsRuntimeRange(slotStart, slotEnd, appointmentRanges)
          ) {
            slots.push(slotStart.toISOString());
          }

          cursor.setMinutes(cursor.getMinutes() + 30);
        }
      }
    }
  }

  return slots.sort()[0];
}

async function readSupabaseRuntime(supabase: SupabaseClient): Promise<MarketplaceRuntimeData> {
  const [
    services,
    profiles,
    visibility,
    portfolios,
    searchHistory,
    clientPreferences,
    reviews,
    barbers,
    canonicalProfiles,
    clients,
    locations,
    staffLocations,
    shops,
    styleTags,
    featuredProfiles,
    trendingStyles,
    locationSearchIndex,
    canonicalServices,
    availabilityRules,
    blockedTimes,
    scheduleAppointments,
    appointments,
    servicePopularity,
    rankings,
    conversionEvents,
    bookingAttributions
  ] = await Promise.all([
    supabase.from("marketplace_services").select("*").order("name"),
    supabase.from("barber_profiles").select("*").order("display_name"),
    supabase.from("marketplace_visibility").select("*"),
    supabase.from("barber_portfolios").select("*").order("created_at", { ascending: false }),
    supabase.from("search_history").select("client_reference, query, filters, searched_at").order("searched_at", { ascending: false }),
    supabase.from("client_preferences").select("client_reference, favorite_shop_reference, preferred_location_reference, preferred_style_tag_ids, prefers_instant_booking"),
    supabase.from("reviews").select("id, appointment_id, barber_id, client_id, location_id, rating, message, created_at").order("created_at", { ascending: false }),
    supabase.from("barbers").select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency, bio, booking_slug"),
    supabase.from("profiles").select("id, full_name, primary_onboarding_role, onboarding_state"),
    supabase.from("clients").select("id, reference_code"),
    supabase.from("locations").select("id, reference_code, name, neighborhood, city, state, phone, hours, tax_rate"),
    supabase.from("staff_locations").select("profile_id, location_id"),
    supabase.from("shops").select("id, name, brand_line, phone, kind"),
    supabase.from("style_tags").select("id, name, slug, category"),
    supabase.from("featured_profiles").select("id, barber_reference, label"),
    supabase.from("trending_styles").select("id, style_tag_slug, region_label, booking_count, rank"),
    supabase.from("location_search_index").select("id, location_reference, shop_reference, barber_reference, latitude, longitude, distance_miles"),
    supabase.from("services").select("id, reference_code, location_id, category, name, description, duration_min, buffer_min, price, deposit_amount, full_prepay_required, active, service_owner_type, barber_reference, shop_reference, style_tag_ids").eq("active", true),
    supabase.from("availability_rules").select("barber_id, location_id, weekday, start_time, end_time"),
    supabase.from("blocked_times").select("barber_id, starts_at, ends_at, reason"),
    supabase.from("appointments").select("barber_id, location_id, status, starts_at, ends_at"),
    supabase.from("appointments").select("id, reference_code"),
    supabase.from("marketplace_service_popularity").select("service_reference, booking_count, revenue_generated, average_rating, repeat_rate, popularity_rank"),
    supabase.from("barber_rankings").select("barber_reference, distance_score, average_rating_score, review_volume_score, retention_score, availability_score, portfolio_engagement_score, follow_count, reputation_score, service_popularity_score, rebooking_score, conversion_score, visibility_score, ranking_score, label"),
    supabase.from("marketplace_conversion_events").select("event_type, barber_reference, username, client_reference, client_email, appointment_reference, location_reference, source_kind, source_reference, metadata, created_at"),
    supabase.from("marketplace_booking_attributions").select("appointment_reference, barber_reference, username, client_reference, client_email, location_reference, source_kind, matched_from, discovery_query, metadata, created_at")
  ]);

  for (const result of [services, profiles, visibility, portfolios, searchHistory, clientPreferences, reviews, barbers, canonicalProfiles, clients, locations, staffLocations, shops, styleTags, featuredProfiles, trendingStyles, locationSearchIndex, canonicalServices, availabilityRules, blockedTimes, scheduleAppointments, appointments, servicePopularity, rankings, conversionEvents, bookingAttributions]) {
    if (result.error) throw result.error;
  }

  const profileRows = tableRows(profiles.data);
  const profileByBarberReference = new Map(profileRows.map((row: any) => [row.barber_reference, row]));
  const canonicalProfileById = new Map(tableRows(canonicalProfiles.data).map((row: any) => [row.id, row]));
  const locationReferenceMap = new Map(tableRows(locations.data).map((row: any) => [row.id, reference(row)]));
  const barberReferenceMap = new Map(tableRows(barbers.data).map((row: any) => [row.id, reference(row)]));
  const clientReferenceMap = new Map(tableRows(clients.data).map((row: any) => [row.id, reference(row)]));
  const appointmentReferenceMap = new Map(tableRows(appointments.data).map((row: any) => [row.id, reference(row)]));
  const indexRows = tableRows(locationSearchIndex.data);

  const locationState: Location[] = tableRows(locations.data).map((row: any) => ({
    id: reference(row),
    name: row.name,
    neighborhood: row.neighborhood ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    phone: row.phone ?? "",
    hours: normalizeHours(row.hours),
    chairs: 0,
    taxRate: Number(row.tax_rate ?? 0)
  })).filter((location) => Boolean(location.id));

  const locationIdsByProfile = new Map<string, string[]>();
  tableRows(staffLocations.data).forEach((row: any) => {
    const locationReference = locationReferenceMap.get(row.location_id) ?? row.location_id;
    locationIdsByProfile.set(row.profile_id, uniqueStrings([...(locationIdsByProfile.get(row.profile_id) ?? []), locationReference]));
  });

  const barberState: Barber[] = tableRows(barbers.data).map((row: any): Barber | null => {
    const barberReference = reference(row);
    const publicProfile = profileByBarberReference.get(barberReference);
    const canonicalProfile = canonicalProfileById.get(row.profile_id);
    const indexedLocationIds = indexRows.filter((entry: any) => entry.barber_reference === barberReference).map((entry: any) => entry.location_reference);
    const locationIds = uniqueStrings([...(locationIdsByProfile.get(row.profile_id) ?? []), ...indexedLocationIds]);
    const compensationModel: Barber["compensationModel"] = row.compensation_model === "booth_rent" ? "booth_rent" : "commission";
    const role: Barber["role"] = compensationModel === "booth_rent" ? "booth_rent_barber" : "commission_barber";

    if (canonicalProfile?.primary_onboarding_role !== "barber") {
      return null;
    }

    return {
      id: barberReference,
      userId: row.profile_id,
      name: publicProfile?.display_name ?? canonicalProfile?.full_name ?? barberReference,
      role,
      locationIds,
      specialties: publicProfile?.specialties ?? [],
      rating: 0,
      reviewCount: 0,
      compensationModel,
      commissionRate: row.commission_rate ? Number(row.commission_rate) : undefined,
      boothRentAmount: row.booth_rent_amount ? Number(row.booth_rent_amount) : undefined,
      boothRentFrequency: row.booth_rent_frequency ?? undefined,
      todayEarnings: 0,
      upcomingPayout: 0,
      availabilityLabel: "Availability not configured",
      bio: row.bio ?? publicProfile?.bio ?? "",
      bookingLink: row.booking_slug ? `bvrb3r.app/book/${row.booking_slug}` : ""
    };
  }).filter((barber): barber is Barber => Boolean(barber?.id));

  const shopState: Shop[] = tableRows(shops.data).map((row: any) => {
    const indexedLocationIds = indexRows.filter((entry: any) => entry.shop_reference === row.id && !entry.barber_reference).map((entry: any) => entry.location_reference);
    const bootstrapLocationIds = locationState.filter((location) => location.id === row.id).map((location) => location.id);

    return {
      id: row.id,
      name: row.name,
      brandLine: row.brand_line ?? "",
      phone: row.phone ?? "",
      locationIds: uniqueStrings([...indexedLocationIds, ...bootstrapLocationIds]),
      type: row.kind === "mobile" ? "mobile" : "shop"
    };
  });
  const locationUuidByReference = new Map(tableRows(locations.data).map((row: any) => [reference(row), row.id]));
  const canonicalServiceState: Service[] = tableRows(canonicalServices.data).map((row: any) => {
    const locationReference = locationReferenceMap.get(row.location_id) ?? row.location_id;
    return {
      id: reference(row),
      category: row.category,
      name: row.name,
      description: row.description ?? "",
      durationMin: Number(row.duration_min ?? 0),
      bufferMin: Number(row.buffer_min ?? 0),
      price: Number(row.price ?? 0),
      deposit: Number(row.deposit_amount ?? 0),
      fullPrepay: Boolean(row.full_prepay_required),
      addOnIds: [],
      ownerType: row.service_owner_type ?? "shop",
      barberId: row.barber_reference ?? undefined,
      shopId: row.shop_reference ?? locationReference,
      styleTagIds: row.style_tag_ids ?? []
    };
  });
  const marketplaceServiceState: Service[] = tableRows(services.data).map((row: any) => ({
    id: row.service_reference,
    category: row.category,
    name: row.name,
    description: row.description,
    durationMin: row.duration_min,
    bufferMin: row.buffer_min,
    price: Number(row.price),
    deposit: Number(row.deposit_amount),
    fullPrepay: row.full_prepay_required,
    addOnIds: [],
    ownerType: row.owner_type,
    barberId: row.barber_reference ?? undefined,
    shopId: row.shop_reference ?? undefined,
    styleTagIds: row.style_tag_ids ?? []
  }));
  const serviceState = [...new Map([...canonicalServiceState, ...marketplaceServiceState].map((service) => [service.id, service])).values()];
  const nextAvailableByBarber = new Map<string, string>();

  tableRows(barbers.data).forEach((row: any) => {
    const barberReference = reference(row);
    const indexedLocationIds = indexRows.filter((entry: any) => entry.barber_reference === barberReference).map((entry: any) => entry.location_reference);
    const locationReferences = uniqueStrings([...(locationIdsByProfile.get(row.profile_id) ?? []), ...indexedLocationIds]);
    const canonicalServicesForBarber = canonicalServiceState
      .filter((service) =>
        (service.ownerType === "barber" && service.barberId === barberReference)
        || (service.ownerType === "shop" && locationReferences.includes(service.shopId ?? ""))
      )
      .map((service) => ({
        durationMin: service.durationMin,
        bufferMin: service.bufferMin,
        locationReference: service.shopId ?? locationReferences[0] ?? "",
        barberReference: service.barberId,
        shopReference: service.shopId
      }));
    const nextAvailableAt = getNextRuntimeBookableSlot({
      barberUuid: row.id,
      locationReferences,
      locationUuidByReference,
      services: canonicalServicesForBarber,
      availabilityRules: tableRows(availabilityRules.data),
      blockedTimes: tableRows(blockedTimes.data),
      appointments: tableRows(scheduleAppointments.data)
    });

    if (nextAvailableAt) {
      nextAvailableByBarber.set(barberReference, nextAvailableAt);
    }
  });

  return {
    state: {
      services: serviceState,
      barbers: barberState,
      locations: locationState,
      barberProfiles: profileRows.map((row: any) => ({
        id: row.id,
        barberId: row.barber_reference,
        username: row.username,
        photoAccent: "#7cff00",
        profilePhotoUrl: row.profile_photo_path ?? undefined,
        yearsExperience: row.years_experience,
        shopId: row.shop_reference
          ?? indexRows.find((entry: any) => entry.barber_reference === row.barber_reference)?.shop_reference
          ?? indexRows.find((entry: any) => entry.barber_reference === row.barber_reference)?.location_reference
          ?? undefined,
        headline: row.bio ?? "",
        specialties: row.specialties ?? [],
        badges: row.badges ?? [],
        nextAvailableAt: nextAvailableByBarber.get(row.barber_reference) ?? "",
        serviceAreaLabel: row.service_area_label ?? "",
        visibilityState: row.visibility_state === "featured" || row.visibility_state === "public" ? row.visibility_state : "hidden"
      })),
      visibilities: tableRows(visibility.data).map((row: any) => ({
        barberId: row.barber_reference,
        visibilityState: row.visibility_state,
        acceptsInstantBookings: row.accepts_instant_bookings,
        featuredRank: row.featured_rank ?? undefined
      })),
      barberPortfolios: tableRows(portfolios.data).map((row: any) => ({
        id: row.id,
        barberId: row.barber_reference,
        imageUrl: row.storage_path,
        caption: row.caption,
        styleTagIds: row.style_tag_ids ?? [],
        featured: row.featured
      })),
      reviews: tableRows(reviews.data).map((row: any) => ({
        id: row.id,
        appointmentId: appointmentReferenceMap.get(row.appointment_id) ?? undefined,
        barberId: barberReferenceMap.get(row.barber_id) ?? row.barber_id,
        clientId: clientReferenceMap.get(row.client_id) ?? row.client_id,
        locationId: locationReferenceMap.get(row.location_id) ?? row.location_id,
        rating: Number(row.rating),
        sentiment: Number(row.rating) >= 5 ? "great" : Number(row.rating) >= 4 ? "good" : "watch",
        message: row.message ?? "",
        createdAt: row.created_at
      })),
      styleTags: tableRows(styleTags.data).map((row: any) => ({
        id: row.slug ?? row.id,
        name: row.name,
        slug: row.slug,
        category: normalizeStyleCategory(row.category)
      })),
      shops: shopState,
      featuredProfiles: tableRows(featuredProfiles.data).map((row: any) => ({
        id: row.id,
        barberId: row.barber_reference,
        label: row.label
      })),
      searchHistory: tableRows(searchHistory.data).map((row: any) => ({
        id: `${row.client_reference}-${row.searched_at}`,
        clientId: row.client_reference,
        query: row.query,
        filters: row.filters ?? {},
        searchedAt: row.searched_at
      })),
      clientPreferences: tableRows(clientPreferences.data).map((row: any) => ({
        clientId: row.client_reference,
        favoriteShopId: row.favorite_shop_reference ?? undefined,
        preferredLocationId: row.preferred_location_reference ?? undefined,
        preferredStyleTagIds: row.preferred_style_tag_ids ?? [],
        prefersInstantBooking: row.prefers_instant_booking
      })),
      trendingStyles: tableRows(trendingStyles.data).map((row: any) => ({
        id: row.id,
        styleTagId: row.style_tag_slug,
        regionLabel: row.region_label,
        bookingCount: Number(row.booking_count ?? 0),
        rank: Number(row.rank ?? 0)
      })),
      locationSearchIndex: indexRows.map((row: any) => ({
        id: row.id,
        locationId: row.location_reference,
        shopId: row.shop_reference ?? undefined,
        barberId: row.barber_reference ?? undefined,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        distanceMiles: Number(row.distance_miles ?? 0)
      }))
    },
    servicePopularity: tableRows(servicePopularity.data).map((row: any) => ({
      serviceId: row.service_reference,
      metrics: {
        bookingCount: row.booking_count,
        revenueGenerated: Number(row.revenue_generated),
        averageRating: Number(row.average_rating),
        repeatRate: Number(row.repeat_rate),
        popularityRank: row.popularity_rank
      }
    })),
    rankingInputs: tableRows(rankings.data).map((row: any) => ({
      barberId: row.barber_reference,
      distanceScore: Number(row.distance_score ?? 0),
      averageRatingScore: Number(row.average_rating_score ?? 0),
      reviewVolumeScore: Number(row.review_volume_score ?? 0),
      retentionScore: Number(row.retention_score ?? 0),
      availabilityScore: Number(row.availability_score ?? 0),
      portfolioEngagementScore: Number(row.portfolio_engagement_score ?? 0),
      followCount: Number(row.follow_count ?? 0),
      reputationScore: Number(row.reputation_score ?? 0),
      servicePopularityScore: Number(row.service_popularity_score ?? 0),
      rebookingScore: Number(row.rebooking_score ?? 0),
      conversionScore: Number(row.conversion_score ?? 0),
      visibilityScore: Number(row.visibility_score ?? 0),
      rankingScore: Number(row.ranking_score ?? 0),
      label: row.label ?? undefined
    })),
    conversionEvents: tableRows(conversionEvents.data).map((row: any) => ({
      id: `${row.event_type}-${row.barber_reference ?? "none"}-${row.created_at}`,
      eventType: row.event_type,
      barberId: row.barber_reference ?? undefined,
      username: row.username ?? undefined,
      clientId: row.client_reference ?? undefined,
      clientEmail: row.client_email ?? undefined,
      appointmentId: row.appointment_reference ?? undefined,
      locationId: row.location_reference ?? undefined,
      sourceKind: row.source_kind,
      sourceReference: row.source_reference ?? undefined,
      metadata: row.metadata ?? {},
      createdAt: row.created_at
    })),
    bookingAttributions: tableRows(bookingAttributions.data).map((row: any) => ({
      appointmentId: row.appointment_reference,
      barberId: row.barber_reference,
      username: row.username ?? undefined,
      clientId: row.client_reference ?? undefined,
      clientEmail: row.client_email ?? undefined,
      locationId: row.location_reference ?? undefined,
      sourceKind: row.source_kind,
      matchedFrom: row.matched_from ?? undefined,
      discoveryQuery: row.discovery_query ?? undefined,
      metadata: row.metadata ?? {},
      createdAt: row.created_at
    }))
  };
}

async function insertConversionEvent(supabase: SupabaseClient, event: Omit<MarketplaceConversionEvent, "id"> & { dedupeKey?: string }) {
  const result = await supabase.from("marketplace_conversion_events").upsert({
    event_type: event.eventType,
    barber_reference: event.barberId ?? null,
    username: event.username ?? null,
    client_reference: event.clientId ?? null,
    client_email: event.clientEmail ?? null,
    appointment_reference: event.appointmentId ?? null,
    location_reference: event.locationId ?? null,
    source_kind: event.sourceKind,
    source_reference: event.sourceReference ?? null,
    metadata: event.metadata,
    created_at: event.createdAt,
    dedupe_key: event.dedupeKey ?? `${event.eventType}-${event.appointmentId ?? event.barberId ?? event.createdAt}`
  }, { onConflict: "dedupe_key" });
  if (result.error) throw result.error;
}

function createUnavailableSupabaseProvider(): MarketplaceProvider {
  const unavailable = () => new MarketplaceValidationError("Marketplace is unavailable because Supabase is not configured.");
  return {
    kind: "supabase",
    async readRuntime() { return emptyRuntimeData(); },
    async createService() { throw unavailable(); },
    async updateService() { throw unavailable(); },
    async deleteService() { throw unavailable(); },
    async recordDiscoveryImpression() {},
    async recordProfileView() {},
    async recordHaircutNowImpression() {},
    async recordBookingCtaClick() {},
    async recordShareEvent() {},
    async recordBookingCreated() {},
    async recordBookingCompleted() {},
    async recordFollowCreated() {},
    async joinWaitlist() { throw unavailable(); }
  };
}

function createSupabaseProvider(supabase: SupabaseClient): MarketplaceProvider {
  return {
    kind: "supabase",
    async readRuntime() { return readSupabaseRuntime(supabase); },
    async createService(actor, input) { const runtime = await readSupabaseRuntime(supabase); const result = createServiceDefinition(runtime.state, actor, input); const persist = await supabase.from("marketplace_services").upsert(serviceToRow(result.service), { onConflict: "service_reference" }); if (persist.error) throw persist.error; await refreshDerivedSignals(supabase); return { service: result.service }; },
    async updateService(actor, serviceId, input) { const runtime = await readSupabaseRuntime(supabase); const result = updateServiceDefinition(runtime.state, actor, serviceId, input); const persist = await supabase.from("marketplace_services").upsert(serviceToRow(result.service), { onConflict: "service_reference" }); if (persist.error) throw persist.error; await refreshDerivedSignals(supabase); return { service: result.service }; },
    async deleteService(actor, serviceId) { const runtime = await readSupabaseRuntime(supabase); const result = deleteServiceDefinition(runtime.state, actor, serviceId); const persist = await supabase.from("marketplace_services").delete().eq("service_reference", serviceId); if (persist.error) throw persist.error; await refreshDerivedSignals(supabase); return { service: result.service }; },
    async recordDiscoveryImpression(input) { for (const result of input.results.slice(0, 6)) { await insertConversionEvent(supabase, { eventType: "discovery_impression", barberId: result.barberId, username: result.username, clientId: input.clientId, clientEmail: getClientEmail(input.clientId), locationId: input.filters.locationId, sourceKind: "discovery", sourceReference: input.filters.query ?? result.username, metadata: { query: input.filters.query ?? "", resultsCount: input.results.length }, createdAt: nowIso() }); } if (input.clientId) { const history = await supabase.from("search_history").insert({ client_reference: input.clientId, client_email: getClientEmail(input.clientId) ?? `${input.clientId}@client.bvrb3r.local`, query: input.filters.query ?? "marketplace", filters: input.filters, searched_at: nowIso() }); if (history.error) throw history.error; } },
    async recordProfileView(input) { await insertConversionEvent(supabase, { eventType: "profile_view", barberId: input.barberId, username: input.username, clientId: input.clientId, clientEmail: getClientEmail(input.clientId), sourceKind: "public_profile", sourceReference: input.username, metadata: {}, createdAt: nowIso() }); },
    async recordHaircutNowImpression(input) { if (!input.match) return; await insertConversionEvent(supabase, { eventType: "haircut_now_impression", barberId: input.match.barberId, username: input.match.username, clientId: input.clientId, clientEmail: getClientEmail(input.clientId), locationId: input.match.locationId, sourceKind: "haircut_now", sourceReference: input.match.matchedFrom, metadata: { matchedFrom: input.match.matchedFrom }, createdAt: nowIso() }); },
    async recordBookingCtaClick(input) { await insertConversionEvent(supabase, { eventType: "booking_cta_clicked", barberId: input.barberId, username: input.username, clientId: input.clientId, clientEmail: getClientEmail(input.clientId), locationId: input.locationId, sourceKind: input.sourceKind, sourceReference: input.username, metadata: input.metadata ?? {}, createdAt: nowIso() }); },
    async recordShareEvent(input) { await insertConversionEvent(supabase, { eventType: input.eventType, barberId: input.barberId, username: input.username, clientId: input.clientId, clientEmail: getClientEmail(input.clientId), locationId: input.locationId, sourceKind: input.sourceKind, sourceReference: input.sourceReference ?? input.username, metadata: input.metadata ?? {}, createdAt: nowIso() }); },
    async recordBookingCreated(input) { const attribution = await supabase.from("marketplace_booking_attributions").upsert({ appointment_reference: input.appointmentId, barber_reference: input.barberId, username: input.username ?? null, client_reference: input.clientId ?? null, client_email: input.clientEmail ?? null, location_reference: input.locationId ?? null, source_kind: input.sourceKind, matched_from: input.matchedFrom ?? null, discovery_query: input.query ?? null, metadata: { sourceKind: input.sourceKind }, created_at: nowIso() }, { onConflict: "appointment_reference" }); if (attribution.error) throw attribution.error; await insertConversionEvent(supabase, { eventType: "booking_created", barberId: input.barberId, username: input.username, clientId: input.clientId, clientEmail: input.clientEmail, appointmentId: input.appointmentId, locationId: input.locationId, sourceKind: input.sourceKind, sourceReference: input.username, metadata: { matchedFrom: input.matchedFrom ?? null, query: input.query ?? null }, createdAt: nowIso(), dedupeKey: `booking-created-${input.appointmentId}` }); await refreshDerivedSignals(supabase); },
    async recordBookingCompleted(input) { const attributionResult = await supabase.from("marketplace_booking_attributions").select("*").eq("appointment_reference", input.appointmentId).maybeSingle(); if (attributionResult.error) throw attributionResult.error; if (!attributionResult.data) return; const record = attributionResult.data as any; await insertConversionEvent(supabase, { eventType: "booking_completed", barberId: record.barber_reference, username: record.username ?? undefined, clientId: record.client_reference ?? undefined, clientEmail: record.client_email ?? undefined, appointmentId: record.appointment_reference, locationId: record.location_reference ?? undefined, sourceKind: record.source_kind, sourceReference: record.username ?? undefined, metadata: { matchedFrom: record.matched_from ?? null }, createdAt: nowIso(), dedupeKey: `booking-completed-${input.appointmentId}` }); await refreshDerivedSignals(supabase); },
    async recordFollowCreated(input) { await insertConversionEvent(supabase, { eventType: "follow_created", barberId: input.barberId, username: input.username, clientId: input.clientId, clientEmail: getClientEmail(input.clientId), sourceKind: "public_profile", sourceReference: input.username, metadata: {}, createdAt: nowIso() }); await refreshDerivedSignals(supabase); },
    async joinWaitlist(input) { const id = makeId("waitlist"); const request = await supabase.from("marketplace_waitlist_requests").insert({ request_reference: id, barber_reference: input.barberId ?? null, client_reference: input.clientId ?? null, client_email: getClientEmail(input.clientId) ?? null, service_reference: input.serviceId, location_reference: input.locationId, source_query: input.query ?? null, created_at: nowIso() }); if (request.error) throw request.error; await insertConversionEvent(supabase, { eventType: "waitlist_joined", barberId: input.barberId, clientId: input.clientId, clientEmail: getClientEmail(input.clientId), locationId: input.locationId, sourceKind: "client_dashboard", sourceReference: input.serviceId, metadata: { query: input.query ?? null }, createdAt: nowIso() }); return { id }; }
  };
}

export function enrichMarketplaceRuntime(runtime: MarketplaceRuntimeData, engagementState: EngagementState) {
  const baseResults = searchMarketplace(runtime.state, {});
  return buildBarberProofSignals({ discoveryResults: baseResults, engagementState, rankingInputs: runtime.rankingInputs, servicePopularity: runtime.servicePopularity, conversionEvents: runtime.conversionEvents, serviceIdsByBarber: getServiceRowsByBarber(runtime.state.services) });
}

export async function getMarketplaceProvider(): Promise<MarketplaceProvider> {
  if (!isSupabaseEnabled()) {
    console.warn("[marketplace-provider] Supabase is disabled; returning empty marketplace data instead of demo listings.");
    return createUnavailableSupabaseProvider();
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) return createUnavailableSupabaseProvider();
  return createSupabaseProvider(supabase);
}

export function buildDiscoveryPayload(runtime: MarketplaceRuntimeData, engagementState: EngagementState, trustState: TrustState | undefined, filters: DiscoveryFilters) {
  const discoveryResults = searchMarketplace(runtime.state, filters, trustState);
  const proofSignals = buildBarberProofSignals({ discoveryResults, engagementState, rankingInputs: runtime.rankingInputs, servicePopularity: runtime.servicePopularity, conversionEvents: runtime.conversionEvents, serviceIdsByBarber: getServiceRowsByBarber(runtime.state.services), trustState });
  return rankDiscoveryResults(discoveryResults, proofSignals);
}

export function buildPublicProfilePayload(runtime: MarketplaceRuntimeData, engagementState: EngagementState, trustState: TrustState | undefined, username: string): PublicBarberProfileView | null {
  const profile = getPublicBarberProfileByUsername(runtime.state, username, trustState);
  if (!profile) return null;
  const proofSignals = buildBarberProofSignals({ discoveryResults: searchMarketplace(runtime.state, {}, trustState), engagementState, rankingInputs: runtime.rankingInputs, servicePopularity: runtime.servicePopularity, conversionEvents: runtime.conversionEvents, serviceIdsByBarber: getServiceRowsByBarber(runtime.state.services), trustState });
  const nextServices = replaceServicePopularity(profile.services, runtime.servicePopularity);
  const mostBookedService = [...nextServices].sort((left, right) => left.popularity.popularityRank - right.popularity.popularityRank || right.popularity.bookingCount - left.popularity.bookingCount)[0];
  return enrichPublicProfileWithProof({ ...profile, services: nextServices, mostBookedService }, proofSignals);
}

export function buildServiceCatalogPayload(runtime: MarketplaceRuntimeData, actor: MarketplaceActor): ServiceCatalogView {
  const view = getServiceCatalogView(runtime.state, actor);
  return { ...view, editableServices: replaceServicePopularity(view.editableServices, runtime.servicePopularity), readOnlyServices: replaceServicePopularity(view.readOnlyServices, runtime.servicePopularity) };
}

export function buildMapPayload(runtime: MarketplaceRuntimeData, filters: DiscoveryFilters, trustState?: TrustState) {
  return getMapDiscoveryMarkers(runtime.state, filters, trustState);
}

export function buildHaircutNowPayload(runtime: MarketplaceRuntimeData, engagementState: EngagementState, clientId?: string, locationId?: string, trustState?: TrustState) {
  const baseline = getHaircutNowMatch(runtime.state, clientId, locationId, trustState);
  if (!clientId || baseline?.matchedFrom === "favorite_shop") {
    return baseline;
  }

  const followedBarberIds = engagementState.barberFollows.filter((follow) => follow.clientId === clientId).map((follow) => follow.barberId);
  if (!followedBarberIds.length) {
    return baseline;
  }

  const followedMatch = searchMarketplace(runtime.state, { locationId }, trustState)
    .filter((result) => followedBarberIds.includes(result.barberId))
    .sort((left, right) => new Date(left.nextAvailableAt).getTime() - new Date(right.nextAvailableAt).getTime())[0];
  if (!followedMatch?.locationId) {
    return baseline;
  }

  return {
    barberId: followedMatch.barberId,
    username: followedMatch.username,
    barberName: followedMatch.barberName,
    matchedFrom: "nearby" as const,
    matchReason: "A barber you follow has the fastest trusted opening in the visible network right now.",
    appointmentTime: followedMatch.nextAvailableAt,
    locationId: followedMatch.locationId,
    shopName: followedMatch.shopName,
    priceFrom: followedMatch.priceRange[0],
    rating: followedMatch.rating
  };
}
