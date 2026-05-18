import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isScheduledAppointmentStatus, isUpcomingAppointmentStatus } from "@/lib/appointments/domain";
import {
  ensureBarberProfileForIdentifier,
  ensureMarketplaceBarberProfileRows
} from "@/lib/barber/profile-repair";
import { ensureRecurringBooking } from "@/lib/booking/recurring";
import {
  canonicalAppointmentUuid,
  canonicalBarberUuid,
  canonicalClientUuid,
  canonicalLocationUuid,
  readCanonicalAppointmentServiceSnapshots,
  readCanonicalClientProfile,
  type CanonicalAppointmentServiceSnapshotRow
} from "@/lib/booking/canonical-booking";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildCanonicalAvailabilityPayload,
  buildCanonicalBarberProfile,
  buildCanonicalDiscoveryResults,
  buildCanonicalNextAvailableMatch
} from "@/lib/booking/intelligence";
import { decorateDiscoveryWithActivation, decoratePublicProfileWithActivation } from "@/lib/marketplace/activation";
import { getMarketplaceActivationProvider } from "@/lib/marketplace/activation-provider";
import { buildDiscoveryPayload, buildHaircutNowPayload, buildPublicProfilePayload, getMarketplaceProvider, type MarketplaceRuntimeData } from "@/lib/marketplace/provider";
import { syncAllOnboardingBarberServices } from "@/lib/marketplace/service-sync";
import { getMarketplaceState, setMarketplaceState } from "@/lib/marketplace/state";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { readBookingTransactionBreakdown } from "@/lib/fintech/breakdown";
import { readBookingReceipt } from "@/lib/fintech/receipt";
import { readBookingMoneyTimeline } from "@/lib/fintech/timeline";
import {
  buildClientMembershipExecutionSummary,
  buildClientMembershipValueSummary
} from "@/lib/monetization/service";
import { readPointsBalanceForClientReference } from "@/lib/points/engine";
import { readClientReferralSummary } from "@/lib/referrals/service";
import { computeShopVerificationDecision, createEmptyTrustState, getVerificationGateDecision } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { readAppointmentPaymentSummary, readClientPaymentMethodsByClientId, type ClientPaymentMethodView } from "@/lib/payments/service";
import { readBarberProfileMedia, readShopProfileMedia } from "@/lib/profile/service";
import type { LiveAppointmentRecord, LiveOperationsViewer } from "@/lib/operations/live-state";
import { getBarberCompensationSummary, getManagerOperationsSummary, getOwnerAnalyticsSummary } from "@/lib/operations/metrics";
import { getAppointmentViewModel } from "@/lib/utils/operations";
import type { Client, DiscoveryResult, RecommendedShopView, ReviewSentiment } from "@/types/domain";
import type { TrustState } from "@/types/trust";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ShopRecord = {
  id: string;
  name: string;
  brand_line: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string | null;
  address: string | null;
  kind: string;
  latitude: number | null;
  longitude: number | null;
  app_approval_status?: string | null;
};

type LocationRecord = {
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

type ClientPreferenceRecord = {
  client_reference: string;
  client_email: string;
  favorite_shop_reference: string | null;
  preferred_location_reference: string | null;
  preferred_city?: string | null;
  preferred_state?: string | null;
  preferred_postal_code?: string | null;
  prefers_instant_booking: boolean;
};

export type ClientPreferredLocation = {
  city: string;
  state: string;
  postalCode?: string;
  display?: string;
};

type NotificationPreferenceRecord = {
  role: string;
  user_email: string;
  in_app_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
};

type RebookingCycleRecord = {
  id: string;
  client_reference: string;
  client_email: string;
  barber_reference: string | null;
  service_reference: string | null;
  average_cycle_days: number;
  confidence: string;
  last_completed_at: string | null;
  next_suggested_at: string | null;
  updated_at: string;
};

type BarberDirectoryRecord = {
  id: string;
  reference_code: string | null;
  profile_id: string;
  compensation_model?: string | null;
};

type ProfileDirectoryRecord = {
  id: string;
  full_name: string | null;
};

type ServiceDirectoryRecord = {
  id: string;
  reference_code: string | null;
  name: string;
  category?: string | null;
};

type LocationAssignmentRecord = {
  profile_id: string;
  location_id: string;
};

type OperationalBarberIdentity = {
  id: string;
  name: string;
  compensationModel: string;
};

type OperationalServiceIdentity = {
  id: string;
  name: string;
  category: string;
};

type OperationalLocationIdentity = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
  label: string;
};

type AppointmentServiceRecord = CanonicalAppointmentServiceSnapshotRow;

type OperationalDirectories = {
  barbersByReference: Map<string, OperationalBarberIdentity>;
  servicesByReference: Map<string, OperationalServiceIdentity>;
  locationsByReference: Map<string, OperationalLocationIdentity>;
  barberAssignmentsByLocation: Map<string, Set<string>>;
};

export type ClientRoutineCadenceId = "weekly" | "biweekly" | "monthly";

export interface ClientRoutinePayload {
  cadenceId: ClientRoutineCadenceId;
  label: string;
  averageCycleDays: number;
  confidence: string;
  barberReference?: string;
  serviceReference?: string;
  lastCompletedAt: string | null;
  nextSuggestedAt: string | null;
  updatedAt: string;
}

export interface ClientAppointmentReviewPayload {
  id: string;
  rating: number;
  message: string;
  createdAt: string;
}

export interface ClientProfilePayload {
  client: {
    clientReference: string;
    fullName: string;
    phone: string;
    email: string;
    favoriteBarberReference?: string;
    favoriteShopReference?: string;
    preferredLocation?: ClientPreferredLocation;
    loyaltyPoints: number;
    retentionTag: string;
    notes: string[];
  } | null;
  favoriteBarber: Awaited<ReturnType<typeof getBarberDetailsPayload>> | null;
  preferredShops: Array<{
    id: string;
    name: string;
    brandLine: string;
    neighborhood: string;
    city: string;
    state: string;
    phone: string;
    address: string;
    kind: string;
    latitude?: number;
    longitude?: number;
  }>;
  notificationPreference: {
    inAppEnabled: boolean;
    smsEnabled: boolean;
    emailEnabled: boolean;
    pushEnabled: boolean;
  } | null;
  routine: ClientRoutinePayload | null;
  paymentMethods: ClientPaymentMethodView[];
}

type ClientRoutineUpsertInput = {
  clientId: string;
  cadenceId: ClientRoutineCadenceId;
  barberReference?: string;
  serviceReference?: string;
  anchorStartAt?: string;
  lastCompletedAt?: string;
};

type ClientFavoriteBarberInput = {
  clientId: string;
  barberReference: string;
};

type ClientFavoriteShopInput = {
  clientId: string;
  shopReference: string;
};

type ClientLocationInput = {
  clientId: string;
  city: string;
  state?: string;
  postalCode?: string;
};

type ClientProfileRepairInput = {
  userId: string;
  clientId?: string | null;
  email?: string | null;
  fullName?: string | null;
  phone?: string | null;
  role: string;
};

export type ClientProfileRepairStatus = {
  authUserExists: boolean;
  clientProfileRowExists: boolean;
  clientPreferencesRowExists: boolean;
  locationSaved: boolean;
  repaired: boolean;
  repairStatus: string;
  clientId: string;
};

type ClientReviewInput = {
  clientId: string;
  appointmentId: string;
  rating: number;
  message: string;
};

type ReviewRecordRow = {
  id: string;
  appointment_id: string;
  rating: number;
  message: string | null;
  created_at: string;
};

export class ClientReviewError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "invalid_client_review") {
    super(message);
    this.name = "ClientReviewError";
    this.status = status;
    this.code = code;
  }
}

const clientRoutineCadences: Record<ClientRoutineCadenceId, { label: string; days: number }> = {
  weekly: { label: "Weekly", days: 7 },
  biweekly: { label: "Every 2 weeks", days: 14 },
  monthly: { label: "Monthly", days: 30 }
};

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function mapLocationRecordAsShop(row: LocationRecord) {
  const fallbackAddress = !row.address && /\d/.test(row.neighborhood ?? "") ? row.neighborhood : null;
  return {
    id: row.reference_code ?? row.id,
    name: row.name,
    brandLine: "Trusted local shop",
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    phone: row.phone ?? "",
    address: row.address ?? fallbackAddress ?? `${row.name}, ${row.neighborhood}, ${row.city}, ${row.state}`,
    kind: "shop",
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined
  };
}

function isMissingClientLocationColumns(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";

  return ["42703", "PGRST204"].includes(code)
    || /preferred_(city|state|postal_code)|column .* does not exist|schema cache/i.test(message);
}

function isClientProfileRepairSchemaError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";

  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(code)
    || /relation .* does not exist|column .* does not exist|schema cache|could not find/i.test(message);
}

function isClientLocationReference(reference?: string | null) {
  return Boolean(reference?.startsWith("client-location:"));
}

function encodeClientLocationReference(location: ClientPreferredLocation) {
  const parts = [
    location.city.trim(),
    location.state.trim(),
    location.postalCode?.trim() ?? ""
  ].map((part) => encodeURIComponent(part));

  return `client-location:${parts.join(":")}`;
}

function formatClientPreferredLocation(location: ClientPreferredLocation) {
  return [location.city, location.state, location.postalCode].map((part) => part?.trim()).filter(Boolean).join(", ");
}

function decodeClientLocationReference(reference?: string | null): ClientPreferredLocation | undefined {
  if (!reference || !isClientLocationReference(reference)) {
    return undefined;
  }

  const [, encodedCity = "", encodedState = "", encodedPostalCode = ""] = reference.split(":");
  const city = decodeURIComponent(encodedCity).trim();
  const state = decodeURIComponent(encodedState).trim();
  const postalCode = decodeURIComponent(encodedPostalCode).trim();

  if (!city && !state) {
    return undefined;
  }

  const location = {
    city,
    state,
    postalCode: postalCode || undefined
  };

  return {
    ...location,
    display: formatClientPreferredLocation(location)
  };
}

function normalizeClientPreferredLocation(row?: Pick<ClientPreferenceRecord, "preferred_city" | "preferred_state" | "preferred_postal_code"> | null): ClientPreferredLocation | undefined {
  const city = row?.preferred_city?.trim();
  const state = row?.preferred_state?.trim();
  const postalCode = row?.preferred_postal_code?.trim();

  if (!city && !state) {
    return undefined;
  }

  const location = {
    city: city ?? "",
    state: state ?? "",
    postalCode: postalCode || undefined
  };

  return {
    ...location,
    display: formatClientPreferredLocation(location)
  };
}

function fallbackClientReferenceForUser(userId: string) {
  return `client-${userId.slice(0, 8)}`;
}

function resolveClientRepairReference(input: ClientProfileRepairInput) {
  const provided = input.clientId?.trim();
  return provided || fallbackClientReferenceForUser(input.userId);
}

function repairDisplayName(input: ClientProfileRepairInput) {
  const name = input.fullName?.trim();
  if (name) return name;
  const emailPrefix = input.email?.split("@")[0]?.trim();
  return emailPrefix || "Client";
}

function repairEmail(input: ClientProfileRepairInput, clientReference: string) {
  return input.email?.trim().toLowerCase() || `${clientReference}@client.bvrb3r.local`;
}

function serializeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function withMarketplaceSectionFallback<T>(
  reference: string,
  fallback: T,
  task: () => Promise<T>,
  metadata: Record<string, unknown> = {}
) {
  try {
    return await task();
  } catch (error) {
    console.error(`[platform-service] ${reference}`, {
      reference,
      ...metadata,
      message: serializeError(error)
    });
    return fallback;
  }
}

function formatOperationalStatusLabel(status: string, balanceDue = 0) {
  if (status === "completed" && balanceDue > 0) {
    return "Ready for checkout";
  }

  return status
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatOperationalLocationLabel(location: Pick<OperationalLocationIdentity, "name" | "neighborhood" | "city" | "state">) {
  const area = [location.neighborhood, location.city].filter(Boolean).join(" • ");
  return area ? `${location.name} • ${area}` : [location.name, location.state].filter(Boolean).join(" • ");
}

function buildEmptyOperationalDirectories(): OperationalDirectories {
  return {
    barbersByReference: new Map(),
    servicesByReference: new Map(),
    locationsByReference: new Map(),
    barberAssignmentsByLocation: new Map()
  };
}

function isSchemaColumnError(error: unknown) {
  const candidate = error && typeof error === "object"
    ? error as { code?: string | null; message?: string | null }
    : null;
  const message = `${candidate?.message ?? ""}`.toLowerCase();
  return candidate?.code === "42703" || message.includes("schema cache") || message.includes("does not exist");
}

async function readBarberDirectoryRows(supabase: SupabaseClient) {
  const result = await supabase.from("barbers").select("id, reference_code, profile_id, compensation_model");
  if (!result.error || !isSchemaColumnError(result.error)) {
    return result;
  }

  const fallback = await supabase.from("barbers").select("id, reference_code, profile_id");
  return {
    ...fallback,
    data: ((fallback.data ?? []) as Array<Omit<BarberDirectoryRecord, "compensation_model">>).map((row) => ({
      ...row,
      compensation_model: "freelance"
    }))
  };
}

async function readServiceDirectoryRows(supabase: SupabaseClient) {
  const result = await supabase.from("services").select("id, reference_code, name, category");
  if (!result.error || !isSchemaColumnError(result.error)) {
    return result;
  }

  const fallback = await supabase.from("services").select("id, reference_code, name");
  return {
    ...fallback,
    data: ((fallback.data ?? []) as Array<Omit<ServiceDirectoryRecord, "category">>).map((row) => ({
      ...row,
      category: "Service"
    }))
  };
}

async function readLocationDirectoryRows(supabase: SupabaseClient) {
  const result = await supabase.from("locations").select("id, reference_code, name, neighborhood, city, state");
  if (!result.error || !isSchemaColumnError(result.error)) {
    return result;
  }

  const fallback = await supabase.from("locations").select("id, name, neighborhood, city, state");
  return {
    ...fallback,
    data: ((fallback.data ?? []) as Array<Omit<LocationRecord, "reference_code">>).map((row) => ({
      ...row,
      reference_code: null
    }))
  };
}

async function readOperationalDirectories(supabase: SupabaseClient | null): Promise<OperationalDirectories> {
  if (!supabase) {
    return buildEmptyOperationalDirectories();
  }

  const [barbersResult, profilesResult, servicesResult, locationsResult, assignmentsResult] = await Promise.all([
    readBarberDirectoryRows(supabase),
    supabase.from("profiles").select("id, full_name"),
    readServiceDirectoryRows(supabase),
    readLocationDirectoryRows(supabase),
    supabase.from("staff_locations").select("profile_id, location_id")
  ]);

  if (barbersResult.error || profilesResult.error || servicesResult.error || locationsResult.error || assignmentsResult.error) {
    console.error("[platform-service] unable to read operational directories", {
      barbersError: barbersResult.error,
      profilesError: profilesResult.error,
      servicesError: servicesResult.error,
      locationsError: locationsResult.error,
      assignmentsError: assignmentsResult.error
    });
    return buildEmptyOperationalDirectories();
  }

  const profileNamesById = new Map(
    ((profilesResult.data ?? []) as ProfileDirectoryRecord[]).map((row) => [row.id, row.full_name ?? row.id])
  );
  const barberRows = (barbersResult.data ?? []) as BarberDirectoryRecord[];
  const serviceRows = (servicesResult.data ?? []) as ServiceDirectoryRecord[];
  const locationRows = (locationsResult.data ?? []) as LocationRecord[];
  const assignmentRows = (assignmentsResult.data ?? []) as LocationAssignmentRecord[];

  const barberReferenceByProfileId = new Map(barberRows.map((row) => [row.profile_id, row.reference_code ?? row.id]));
  const locationReferenceByUuid = new Map(locationRows.map((row) => [row.id, row.reference_code ?? row.id]));
  const barbersByReference = new Map<string, OperationalBarberIdentity>();
  for (const row of barberRows) {
      const reference = row.reference_code ?? row.id;
    const identity = {
      id: reference,
      name: profileNamesById.get(row.profile_id) ?? reference,
      compensationModel: row.compensation_model ?? "freelance"
    } satisfies OperationalBarberIdentity;
    barbersByReference.set(reference, identity);
    barbersByReference.set(row.id, identity);
  }
  const servicesByReference = new Map<string, OperationalServiceIdentity>();
  for (const row of serviceRows) {
      const reference = row.reference_code ?? row.id;
    const identity = {
      id: reference,
      name: row.name,
      category: row.category ?? "Service"
    } satisfies OperationalServiceIdentity;
    servicesByReference.set(reference, identity);
    servicesByReference.set(row.id, identity);
  }
  const locationsByReference = new Map<string, OperationalLocationIdentity>();
  for (const row of locationRows) {
      const reference = row.reference_code ?? row.id;
    const identity = {
      id: reference,
      name: row.name,
      neighborhood: row.neighborhood,
      city: row.city,
      state: row.state,
      label: formatOperationalLocationLabel(row)
    } satisfies OperationalLocationIdentity;
    locationsByReference.set(reference, identity);
    locationsByReference.set(row.id, identity);
  }
  const barberAssignmentsByLocation = new Map<string, Set<string>>();

  for (const row of assignmentRows) {
    const locationReference = locationReferenceByUuid.get(row.location_id) ?? row.location_id;
    const barberReference = barberReferenceByProfileId.get(row.profile_id);
    if (!barberReference) {
      continue;
    }
    const existing = barberAssignmentsByLocation.get(locationReference) ?? new Set<string>();
    existing.add(barberReference);
    barberAssignmentsByLocation.set(locationReference, existing);
  }

  return {
    barbersByReference,
    servicesByReference,
    locationsByReference,
    barberAssignmentsByLocation
  };
}

async function readShops(supabase: SupabaseClient | null) {
  if (!supabase) {
    return [];
  }

  const shopResult = await supabase.from("shops").select("*").order("neighborhood");
  if (!shopResult.error && (shopResult.data ?? []).length) {
    return (shopResult.data as ShopRecord[]).map((row) => ({
      id: row.id,
      name: row.name,
      brandLine: row.brand_line,
      neighborhood: row.neighborhood,
      city: row.city,
      state: row.state,
      phone: row.phone ?? "",
      address: row.address ?? `${row.name}, ${row.neighborhood}, ${row.city}, ${row.state}`,
      kind: row.kind,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      appApprovalStatus: row.app_approval_status ?? undefined
    }));
  }

  const locationResult = await supabase
    .from("locations")
    .select("id, reference_code, name, neighborhood, city, state, phone, address, address_line_2, postal_code, latitude, longitude")
    .order("neighborhood");

  if (locationResult.error || !(locationResult.data ?? []).length) {
    return [];
  }

  return (locationResult.data as LocationRecord[]).map(mapLocationRecordAsShop);
}

async function readClientPreference(supabase: SupabaseClient | null, clientId?: string) {
  if (!supabase || !clientId) {
    return null;
  }

  const selectWithLocation = "client_reference, client_email, favorite_shop_reference, preferred_location_reference, preferred_city, preferred_state, preferred_postal_code, prefers_instant_booking";
  const selectWithoutLocation = "client_reference, client_email, favorite_shop_reference, preferred_location_reference, prefers_instant_booking";
  const result = await supabase
    .from("client_preferences")
    .select(selectWithLocation)
    .eq("client_reference", clientId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const resolvedResult = result.error && isMissingClientLocationColumns(result.error)
    ? await supabase
        .from("client_preferences")
        .select(selectWithoutLocation)
        .eq("client_reference", clientId)
        .order("updated_at", { ascending: false })
        .limit(1)
    : result;

  if (resolvedResult.error || !(resolvedResult.data ?? []).length) {
    return null;
  }

  const row = resolvedResult.data[0] as ClientPreferenceRecord;
  const preferredLocationReference = row.preferred_location_reference ?? undefined;
  return {
    favoriteShopReference: row.favorite_shop_reference ?? (isClientLocationReference(preferredLocationReference) ? undefined : preferredLocationReference),
    preferredLocation: normalizeClientPreferredLocation(row) ?? decodeClientLocationReference(preferredLocationReference),
    prefersInstantBooking: row.prefers_instant_booking
  };
}

async function readNotificationPreference(supabase: SupabaseClient | null, email?: string) {
  if (!supabase || !email) {
    return null;
  }

  const result = await supabase
    .from("notification_preferences")
    .select("role, user_email, in_app_enabled, sms_enabled, email_enabled, push_enabled")
    .eq("role", "client")
    .eq("user_email", email)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (result.error || !(result.data ?? []).length) {
    return null;
  }

  const row = result.data[0] as NotificationPreferenceRecord;
  return {
    inAppEnabled: row.in_app_enabled,
    smsEnabled: row.sms_enabled,
    emailEnabled: row.email_enabled,
    pushEnabled: row.push_enabled
  };
}

function toRoutineCadenceId(days: number): ClientRoutineCadenceId {
  if (days <= 10) {
    return "weekly";
  }

  if (days <= 21) {
    return "biweekly";
  }

  return "monthly";
}

function mapRoutineRow(row: RebookingCycleRecord | null | undefined): ClientRoutinePayload | null {
  if (!row) {
    return null;
  }

  const cadenceId = toRoutineCadenceId(row.average_cycle_days);
  return {
    cadenceId,
    label: clientRoutineCadences[cadenceId].label,
    averageCycleDays: row.average_cycle_days,
    confidence: row.confidence,
    barberReference: row.barber_reference ?? undefined,
    serviceReference: row.service_reference ?? undefined,
    lastCompletedAt: row.last_completed_at,
    nextSuggestedAt: row.next_suggested_at,
    updatedAt: row.updated_at
  };
}

async function readClientRoutine(
  supabase: SupabaseClient | null,
  clientId?: string,
  favoriteBarberReference?: string
) {
  if (!supabase || !clientId) {
    return null;
  }

  const result = await supabase
    .from("rebooking_cycles")
    .select("id, client_reference, client_email, barber_reference, service_reference, average_cycle_days, confidence, last_completed_at, next_suggested_at, updated_at")
    .eq("client_reference", clientId)
    .order("updated_at", { ascending: false })
    .limit(12);

  if (result.error || !(result.data ?? []).length) {
    return null;
  }

  const rows = result.data as RebookingCycleRecord[];
  const selected = favoriteBarberReference
    ? rows.find((row) => row.barber_reference === favoriteBarberReference) ?? rows[0]
    : rows[0];

  return mapRoutineRow(selected);
}

async function readClientProfile(supabase: SupabaseClient | null, clientId?: string) {
  if (!clientId) {
    return undefined;
  }

  if (!supabase) {
    return undefined;
  }

  const profile = await readCanonicalClientProfile(supabase, clientId);
  if (!profile) {
    return undefined;
  }

  const preference = await readClientPreference(supabase, clientId);

  return {
    ...profile,
    favoriteShopReference: preference?.favoriteShopReference,
    preferredLocation: preference?.preferredLocation
  };
}

async function readClientPreferenceForRepair(supabase: SupabaseClient, clientReference: string) {
  const selectWithLocation = "client_reference, client_email, favorite_shop_reference, preferred_location_reference, preferred_city, preferred_state, preferred_postal_code, prefers_instant_booking";
  const selectWithoutLocation = "client_reference, client_email, favorite_shop_reference, preferred_location_reference, prefers_instant_booking";
  const result = await supabase
    .from("client_preferences")
    .select(selectWithLocation)
    .eq("client_reference", clientReference)
    .order("updated_at", { ascending: false })
    .limit(1);

  const resolvedResult = result.error && isMissingClientLocationColumns(result.error)
    ? await supabase
        .from("client_preferences")
        .select(selectWithoutLocation)
        .eq("client_reference", clientReference)
        .order("updated_at", { ascending: false })
        .limit(1)
    : result;

  if (resolvedResult.error) {
    throw resolvedResult.error;
  }

  const row = resolvedResult.data?.[0] as ClientPreferenceRecord | undefined;
  return {
    row,
    locationSaved: Boolean(normalizeClientPreferredLocation(row) ?? decodeClientLocationReference(row?.preferred_location_reference))
  };
}

async function upsertClientProfileMirror(
  supabase: SupabaseClient,
  clientReference: string,
  email: string,
  fullName: string,
  phone: string
) {
  const write = await supabase
    .from("client_profiles")
    .upsert({
      client_reference: clientReference,
      profile_email: email,
      full_name: fullName,
      phone,
      loyalty_points: 0,
      retention_tag: "new",
      notes: []
    }, { onConflict: "profile_email" });

  if (write.error && !isClientProfileRepairSchemaError(write.error)) {
    throw write.error;
  }
}

export async function ensureClientProfileForUser(input: ClientProfileRepairInput): Promise<ClientProfileRepairStatus> {
  let clientReference = resolveClientRepairReference(input);
  if (input.role !== "client") {
    throw new Error("Only client accounts can repair client profile rows.");
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      authUserExists: Boolean(input.userId),
      clientProfileRowExists: false,
      clientPreferencesRowExists: false,
      locationSaved: false,
      repaired: false,
      repairStatus: "supabase_unavailable",
      clientId: clientReference
    };
  }

  const now = new Date().toISOString();
  const email = repairEmail(input, clientReference);
  const fullName = repairDisplayName(input);
  const phone = input.phone?.trim() ?? "";
  const actions: string[] = [];

  const profileLookup = await supabase
    .from("profiles")
    .select("id, role, full_name, email, phone")
    .eq("id", input.userId)
    .maybeSingle();

  if (profileLookup.error && !isClientProfileRepairSchemaError(profileLookup.error)) {
    throw profileLookup.error;
  }

  if (!profileLookup.data) {
    const profilePayload = {
      id: input.userId,
      role: "client",
      full_name: fullName,
      email,
      phone: phone || null,
      primary_onboarding_role: "client",
      onboarding_state: "active",
      last_onboarded_at: now
    };
    let profileWrite = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });
    if (profileWrite.error && isClientProfileRepairSchemaError(profileWrite.error)) {
      profileWrite = await supabase.from("profiles").upsert({
        id: input.userId,
        role: "client",
        full_name: fullName,
        email,
        phone: phone || null
      }, { onConflict: "id" });
    }

    if (profileWrite.error) {
      throw profileWrite.error;
    }

    actions.push("created_profile_row");
  }

  const clientByProfile = await supabase
    .from("clients")
    .select("id, reference_code, profile_id, loyalty_points, retention_tag, created_at")
    .eq("profile_id", input.userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (clientByProfile.error && !isClientProfileRepairSchemaError(clientByProfile.error)) {
    throw clientByProfile.error;
  }

  let clientRow = (clientByProfile.data?.[0] as { id: string; reference_code?: string | null; profile_id?: string | null } | undefined) ?? null;
  if (!clientRow) {
    const clientByReference = await supabase
      .from("clients")
      .select("id, reference_code, profile_id, loyalty_points, retention_tag, created_at")
      .eq("reference_code", clientReference)
      .order("created_at", { ascending: true })
      .limit(1);

    if (clientByReference.error && !isClientProfileRepairSchemaError(clientByReference.error)) {
      throw clientByReference.error;
    }

    clientRow = (clientByReference.data?.[0] as { id: string; reference_code?: string | null; profile_id?: string | null } | undefined) ?? null;
  }

  if (clientRow?.reference_code) {
    clientReference = clientRow.reference_code;
  }

  if (clientRow?.profile_id && clientRow.profile_id !== input.userId) {
    throw new Error("Client profile reference belongs to another account.");
  }

  if (!clientRow) {
    const clientWrite = await supabase.from("clients").insert({
      id: canonicalClientUuid(clientReference),
      profile_id: input.userId,
      reference_code: clientReference,
      loyalty_points: 0,
      retention_tag: "new"
    });

    if (clientWrite.error) {
      throw clientWrite.error;
    }

    actions.push("created_client_row");
  } else if (!clientRow.reference_code) {
    const clientUpdate = await supabase
      .from("clients")
      .update({
        profile_id: input.userId,
        reference_code: clientReference
      })
      .eq("id", clientRow.id);

    if (clientUpdate.error) {
      throw clientUpdate.error;
    }

    actions.push("repaired_client_reference");
  }

  await upsertClientProfileMirror(supabase, clientReference, email, fullName, phone);

  let preference = await readClientPreferenceForRepair(supabase, clientReference);
  if (!preference.row) {
    const preferenceWrite = await supabase.from("client_preferences").insert({
      client_reference: clientReference,
      client_email: email,
      favorite_shop_reference: null,
      preferred_location_reference: null,
      prefers_instant_booking: false,
      updated_at: now,
      created_at: now
    });

    if (preferenceWrite.error) {
      throw preferenceWrite.error;
    }

    actions.push("created_client_preferences_row");
    preference = await readClientPreferenceForRepair(supabase, clientReference);
  } else if (preference.row.client_email !== email) {
    const preferenceUpdate = await supabase
      .from("client_preferences")
      .update({
        client_email: email,
        updated_at: now
      })
      .eq("client_reference", clientReference);

    if (preferenceUpdate.error) {
      throw preferenceUpdate.error;
    }
  }

  return {
    authUserExists: true,
    clientProfileRowExists: true,
    clientPreferencesRowExists: Boolean(preference.row),
    locationSaved: preference.locationSaved,
    repaired: actions.length > 0,
    repairStatus: actions.length ? actions.join(", ") : "already_ready",
    clientId: clientReference
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveReviewSentiment(rating: number): ReviewSentiment {
  if (rating >= 5) {
    return "great";
  }

  if (rating >= 4) {
    return "good";
  }

  return "watch";
}

async function readAppointmentReviewMap(
  supabase: SupabaseClient | null,
  clientId: string,
  appointmentIds: string[]
) {
  const reviewMap = new Map<string, ClientAppointmentReviewPayload>();

  if (!appointmentIds.length) {
    return reviewMap;
  }

  if (!supabase) {
    return reviewMap;
  }

  const canonicalAppointmentIds = appointmentIds.map((appointmentId) => canonicalAppointmentUuid(appointmentId));
  const appointmentReferenceByCanonicalId = new Map(
    appointmentIds.map((appointmentId) => [canonicalAppointmentUuid(appointmentId), appointmentId])
  );
  const result = await supabase
    .from("reviews")
    .select("id, appointment_id, rating, message, created_at")
    .eq("client_id", canonicalClientUuid(clientId))
    .in("appointment_id", canonicalAppointmentIds);

  if (result.error) {
    throw result.error;
  }

  for (const row of (result.data ?? []) as ReviewRecordRow[]) {
    const appointmentId = appointmentReferenceByCanonicalId.get(row.appointment_id);
    if (!appointmentId) {
      continue;
    }

    reviewMap.set(appointmentId, {
      id: row.id,
      rating: Number(row.rating ?? 0),
      message: row.message ?? "",
      createdAt: row.created_at
    });
  }

  return reviewMap;
}

async function persistClientRoutine(supabase: SupabaseClient | null, input: ClientRoutineUpsertInput) {
  const cadence = clientRoutineCadences[input.cadenceId];
  const now = new Date();
  const rawAnchor = input.anchorStartAt ? new Date(input.anchorStartAt) : now;
  const safeAnchor = Number.isNaN(rawAnchor.getTime()) ? now : rawAnchor;
  const anchoredDate = new Date(Math.max(safeAnchor.getTime(), now.getTime()));
  const nextSuggestedAt = addDays(anchoredDate, cadence.days).toISOString();
  const updatedAt = now.toISOString();

  if (!supabase) {
    return {
      cadenceId: input.cadenceId,
      label: cadence.label,
      averageCycleDays: cadence.days,
      confidence: "high",
      barberReference: input.barberReference,
      serviceReference: input.serviceReference,
      lastCompletedAt: input.lastCompletedAt ?? null,
      nextSuggestedAt,
      updatedAt
    } satisfies ClientRoutinePayload;
  }

  const clientProfile = await readCanonicalClientProfile(supabase, input.clientId);
  if (!clientProfile) {
    throw new Error("Client profile not found for routine persistence.");
  }

  const effectiveBarberReference = input.barberReference ?? clientProfile.favoriteBarberReference;
  if (!effectiveBarberReference) {
    throw new Error("A favorite barber is required before auto-book can be saved.");
  }

  const existingResult = await supabase
    .from("rebooking_cycles")
    .select("id, client_reference, client_email, barber_reference, service_reference, average_cycle_days, confidence, last_completed_at, next_suggested_at, updated_at")
    .eq("client_reference", input.clientId)
    .order("updated_at", { ascending: false })
    .limit(12);

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existingRows = (existingResult.data ?? []) as RebookingCycleRecord[];
  const existingRow = existingRows.find((row) => row.barber_reference === effectiveBarberReference) ?? existingRows[0] ?? null;

  const routineRow = {
    client_reference: input.clientId,
    client_email: clientProfile.email,
    barber_reference: effectiveBarberReference,
    service_reference: input.serviceReference ?? existingRow?.service_reference ?? null,
    average_cycle_days: cadence.days,
    confidence: "high",
    last_completed_at: input.lastCompletedAt ?? existingRow?.last_completed_at ?? null,
    next_suggested_at: nextSuggestedAt,
    updated_at: updatedAt
  };

  const cycleWrite = existingRow
    ? await supabase.from("rebooking_cycles").update(routineRow).eq("id", existingRow.id)
    : await supabase.from("rebooking_cycles").insert(routineRow);

  if (cycleWrite.error) {
    throw cycleWrite.error;
  }

  const preferenceResult = await supabase
    .from("client_preferences")
    .select("client_reference, client_email, favorite_shop_reference, preferred_location_reference, prefers_instant_booking")
    .eq("client_reference", input.clientId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (preferenceResult.error) {
    throw preferenceResult.error;
  }

  const existingPreference = (preferenceResult.data?.[0] as ClientPreferenceRecord | undefined) ?? null;
  const preferenceWrite = existingPreference
    ? await supabase
        .from("client_preferences")
        .update({
          client_email: clientProfile.email,
          prefers_instant_booking: true,
          updated_at: updatedAt
        })
        .eq("client_reference", input.clientId)
    : await supabase.from("client_preferences").insert({
        client_reference: input.clientId,
        client_email: clientProfile.email,
        favorite_shop_reference: null,
        preferred_location_reference: null,
        prefers_instant_booking: true,
        updated_at: updatedAt,
        created_at: updatedAt
      });

  if (preferenceWrite.error) {
    throw preferenceWrite.error;
  }

  const savedRoutine = (await readClientRoutine(supabase, input.clientId, effectiveBarberReference)) ?? {
    cadenceId: input.cadenceId,
    label: cadence.label,
    averageCycleDays: cadence.days,
    confidence: "high",
    barberReference: effectiveBarberReference,
    serviceReference: input.serviceReference,
    lastCompletedAt: input.lastCompletedAt ?? existingRow?.last_completed_at ?? null,
    nextSuggestedAt,
    updatedAt
  };

  await ensureRecurringBooking(supabase, {
    clientId: input.clientId,
    trigger: "routine_saved"
  });

  return (await readClientRoutine(supabase, input.clientId, effectiveBarberReference)) ?? savedRoutine;
}

function resolvePreferredShops(
  shops: Awaited<ReturnType<typeof readShops>>,
  favoriteShopReference?: string,
  favoriteBarber?: Awaited<ReturnType<typeof getBarberDetailsPayload>> | null
) {
  const preferred = new Map<string, (typeof shops)[number]>();

  if (favoriteShopReference) {
    const directMatch = shops.find((shop) => shop.id === favoriteShopReference);
    if (directMatch) {
      preferred.set(directMatch.id, directMatch);
    }
  }

  for (const location of favoriteBarber?.shopLocations ?? []) {
    const match = shops.find((shop) => shop.id === location.id);
    if (match) {
      preferred.set(match.id, match);
    }
  }

  return [...preferred.values()].slice(0, 4);
}

export async function saveClientLocation(input: ClientLocationInput) {
  const city = input.city.trim();
  const state = input.state?.trim() ?? "";
  const postalCode = input.postalCode?.trim() ?? "";

  if (!city) {
    throw new Error("Enter a city to save your booking location.");
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Client location cannot be saved because Supabase is not configured.");
  }

  const clientProfile = await readCanonicalClientProfile(supabase, input.clientId);
  if (!clientProfile) {
    throw new Error("Client profile could not be found.");
  }

  const updatedAt = new Date().toISOString();
  const preference = await readClientPreference(supabase, input.clientId);
  const location = {
    city,
    state,
    postalCode: postalCode || undefined
  };
  const normalizedLocation = {
    ...location,
    display: formatClientPreferredLocation(location)
  };
  const preferredLocationReference = encodeClientLocationReference(normalizedLocation);
  const basePayload = {
    client_reference: input.clientId,
    client_email: clientProfile.email,
    favorite_shop_reference: preference?.favoriteShopReference ?? null,
    preferred_location_reference: preferredLocationReference,
    preferred_city: city,
    preferred_state: state || null,
    preferred_postal_code: postalCode || null,
    prefers_instant_booking: preference?.prefersInstantBooking ?? false,
    updated_at: updatedAt
  };
  const existingResult = await supabase
    .from("client_preferences")
    .select("client_reference")
    .eq("client_reference", input.clientId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existing = (existingResult.data ?? [])[0] as { client_reference: string } | undefined;
  const updateWithLocation = {
    client_email: basePayload.client_email,
    favorite_shop_reference: basePayload.favorite_shop_reference,
    preferred_location_reference: basePayload.preferred_location_reference,
    preferred_city: basePayload.preferred_city,
    preferred_state: basePayload.preferred_state,
    preferred_postal_code: basePayload.preferred_postal_code,
    updated_at: basePayload.updated_at
  };
  const updateWithoutLocationColumns = {
    client_email: basePayload.client_email,
    favorite_shop_reference: basePayload.favorite_shop_reference,
    preferred_location_reference: basePayload.preferred_location_reference,
    updated_at: basePayload.updated_at
  };
  let writeResult = existing
    ? await supabase
        .from("client_preferences")
        .update(updateWithLocation)
        .eq("client_reference", input.clientId)
    : await supabase.from("client_preferences").insert({
        ...basePayload,
        created_at: updatedAt
      });

  if (writeResult.error && isMissingClientLocationColumns(writeResult.error)) {
    writeResult = existing
      ? await supabase
          .from("client_preferences")
          .update(updateWithoutLocationColumns)
          .eq("client_reference", input.clientId)
      : await supabase.from("client_preferences").insert({
          client_reference: basePayload.client_reference,
          client_email: basePayload.client_email,
          favorite_shop_reference: basePayload.favorite_shop_reference,
          preferred_location_reference: basePayload.preferred_location_reference,
          prefers_instant_booking: basePayload.prefers_instant_booking,
          updated_at: basePayload.updated_at,
          created_at: updatedAt
        });
  }

  if (writeResult.error) {
    throw writeResult.error;
  }

  const savedProfile = await readClientProfile(supabase, input.clientId);

  return {
    location: normalizedLocation,
    client: savedProfile ?? {
      clientReference: input.clientId,
      fullName: clientProfile.fullName,
      phone: clientProfile.phone,
      email: clientProfile.email,
      favoriteBarberReference: clientProfile.favoriteBarberReference,
      favoriteShopReference: preference?.favoriteShopReference,
      preferredLocation: normalizedLocation,
      loyaltyPoints: clientProfile.loyaltyPoints,
      retentionTag: clientProfile.retentionTag,
      notes: clientProfile.notes
    }
  };
}

export async function saveClientFavoriteBarber(input: ClientFavoriteBarberInput) {
  const supabase = getSupabase();
  const barberProfile = await getBarberDetailsPayload(input.barberReference);
  if (!barberProfile) {
    throw new Error("Barber could not be found.");
  }

  const favoriteShopReference = barberProfile.shopLocations[0]?.id;

  if (!supabase) {
    const clientProfile = await readClientProfile(supabase, input.clientId);
    return {
      client: clientProfile
        ? {
            ...clientProfile,
            favoriteBarberReference: input.barberReference,
            favoriteShopReference: favoriteShopReference ?? clientProfile.favoriteShopReference
          }
        : null,
      favoriteBarber: barberProfile
    };
  }

  const clientProfile = await readCanonicalClientProfile(supabase, input.clientId);
  if (!clientProfile) {
    throw new Error("Client profile could not be found.");
  }

  const updatedAt = new Date().toISOString();
  const clientWrite = await supabase
    .from("clients")
    .update({
      favorite_barber_id: canonicalBarberUuid(input.barberReference)
    })
    .eq("reference_code", input.clientId);

  if (clientWrite.error) {
    throw clientWrite.error;
  }

  const preferenceResult = await supabase
    .from("client_preferences")
    .select("client_reference, client_email, favorite_shop_reference, preferred_location_reference, prefers_instant_booking")
    .eq("client_reference", input.clientId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (preferenceResult.error) {
    throw preferenceResult.error;
  }

  const existingPreference = (preferenceResult.data?.[0] as ClientPreferenceRecord | undefined) ?? null;
  const existingPreferredLocationReference = existingPreference?.preferred_location_reference ?? null;
  const effectiveFavoriteShopReference = favoriteShopReference
    ?? existingPreference?.favorite_shop_reference
    ?? (isClientLocationReference(existingPreferredLocationReference) ? null : existingPreferredLocationReference)
    ?? null;
  const preferenceRow = {
    client_reference: input.clientId,
    client_email: clientProfile.email,
    favorite_shop_reference: effectiveFavoriteShopReference,
    preferred_location_reference: isClientLocationReference(existingPreferredLocationReference)
      ? existingPreferredLocationReference
      : effectiveFavoriteShopReference,
    prefers_instant_booking: existingPreference?.prefers_instant_booking ?? true,
    updated_at: updatedAt
  };
  const preferenceWrite = existingPreference
    ? await supabase
        .from("client_preferences")
        .update({
          client_email: preferenceRow.client_email,
          favorite_shop_reference: preferenceRow.favorite_shop_reference,
          preferred_location_reference: preferenceRow.preferred_location_reference,
          prefers_instant_booking: preferenceRow.prefers_instant_booking,
          updated_at: preferenceRow.updated_at
        })
        .eq("client_reference", input.clientId)
    : await supabase.from("client_preferences").insert({
        ...preferenceRow,
        created_at: updatedAt
      });

  if (preferenceWrite.error) {
    throw preferenceWrite.error;
  }

  const savedProfile = await readClientProfile(supabase, input.clientId);

  return {
    client: savedProfile ?? {
      clientReference: input.clientId,
      fullName: clientProfile.fullName,
      phone: clientProfile.phone,
      email: clientProfile.email,
      favoriteBarberReference: input.barberReference,
      favoriteShopReference: effectiveFavoriteShopReference ?? undefined,
      loyaltyPoints: clientProfile.loyaltyPoints,
      retentionTag: clientProfile.retentionTag,
      notes: clientProfile.notes
    },
    favoriteBarber: barberProfile
  };
}

export async function saveClientFavoriteShop(input: ClientFavoriteShopInput) {
  const supabase = getSupabase();
  const shopProfile = await getPublicShopProfilePayload(input.shopReference);
  if (!shopProfile) {
    throw new Error("Shop could not be found.");
  }

  if (!supabase) {
    const clientProfile = await readClientProfile(supabase, input.clientId);
    return {
      client: clientProfile
        ? {
            ...clientProfile,
            favoriteShopReference: shopProfile.shop.id
          }
        : null,
      favoriteShop: shopProfile
    };
  }

  const clientProfile = await readCanonicalClientProfile(supabase, input.clientId);
  if (!clientProfile) {
    throw new Error("Client profile could not be found.");
  }

  const updatedAt = new Date().toISOString();
  const preferenceResult = await supabase
    .from("client_preferences")
    .select("client_reference, client_email, favorite_shop_reference, preferred_location_reference, prefers_instant_booking")
    .eq("client_reference", input.clientId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (preferenceResult.error) {
    throw preferenceResult.error;
  }

  const existingPreference = (preferenceResult.data?.[0] as ClientPreferenceRecord | undefined) ?? null;
  const preferenceRow = {
    client_reference: input.clientId,
    client_email: clientProfile.email,
    favorite_shop_reference: shopProfile.shop.id,
    preferred_location_reference: shopProfile.shop.id,
    prefers_instant_booking: existingPreference?.prefers_instant_booking ?? true,
    updated_at: updatedAt
  };
  const preferenceWrite = existingPreference
    ? await supabase
        .from("client_preferences")
        .update({
          client_email: preferenceRow.client_email,
          favorite_shop_reference: preferenceRow.favorite_shop_reference,
          preferred_location_reference: preferenceRow.preferred_location_reference,
          prefers_instant_booking: preferenceRow.prefers_instant_booking,
          updated_at: preferenceRow.updated_at
        })
        .eq("client_reference", input.clientId)
    : await supabase.from("client_preferences").insert({
        ...preferenceRow,
        created_at: updatedAt
      });

  if (preferenceWrite.error) {
    throw preferenceWrite.error;
  }

  const savedProfile = await readClientProfile(supabase, input.clientId);

  return {
    client: savedProfile ?? {
      clientReference: input.clientId,
      fullName: clientProfile.fullName,
      phone: clientProfile.phone,
      email: clientProfile.email,
      favoriteBarberReference: clientProfile.favoriteBarberReference,
      favoriteShopReference: shopProfile.shop.id,
      loyaltyPoints: clientProfile.loyaltyPoints,
      retentionTag: clientProfile.retentionTag,
      notes: clientProfile.notes
    },
    favoriteShop: shopProfile
  };
}

async function readAppointmentServiceSnapshots(supabase: SupabaseClient | null, appointmentIds: string[]) {
  if (!supabase || !appointmentIds.length) {
    return new Map<string, AppointmentServiceRecord>();
  }

  return readCanonicalAppointmentServiceSnapshots(supabase, appointmentIds);
}

function hydrateAppointments(
  appointments: LiveAppointmentRecord[],
  clients: Client[],
  appointmentServices: Map<string, AppointmentServiceRecord>,
  directories: OperationalDirectories = buildEmptyOperationalDirectories()
) {
  return appointments.map((appointment) => {
    const serviceSnapshot = appointmentServices.get(appointment.id) ?? null;
    const barber = directories.barbersByReference.get(appointment.barberId);
    const service = directories.servicesByReference.get(appointment.serviceId);
    const location = directories.locationsByReference.get(appointment.locationId);
    const view = getAppointmentViewModel(appointment, clients);

    return {
      ...appointment,
      serviceSnapshot,
      view: {
        ...view,
        barber: barber
          ? ({
              id: barber.id,
              userId: barber.id,
              name: barber.name,
              role: "barber_user",
              locationIds: [],
              specialties: [],
              rating: 0,
              reviewCount: 0,
              compensationModel: barber.compensationModel,
              todayEarnings: 0,
              upcomingPayout: 0,
              availabilityLabel: "",
              bio: "",
              bookingLink: ""
            } as NonNullable<typeof view.barber>)
          : view.barber,
        service: service
          ? ({
              id: service.id,
              name: serviceSnapshot?.service_name ?? service.name,
              category: service.category,
              description: serviceSnapshot?.description ?? "",
              durationMin: serviceSnapshot?.duration_min ?? 0,
              bufferMin: serviceSnapshot?.buffer_min ?? 0,
              price: Number(serviceSnapshot?.price ?? appointment.totalAmount),
              deposit: Number(serviceSnapshot?.deposit_amount ?? appointment.depositAmount),
              fullPrepay: serviceSnapshot?.full_prepay_required ?? false,
              addOnIds: serviceSnapshot?.add_on_references ?? []
            } as NonNullable<typeof view.service>)
          : view.service,
        location: location
          ? ({
              id: location.id,
              name: appointment.chair && appointment.chair !== "Front desk assign" ? appointment.chair : location.name,
              neighborhood: location.neighborhood,
              city: location.city,
              state: location.state,
              phone: "",
              hours: "",
              chairs: 1,
              taxRate: 0
            } as NonNullable<typeof view.location>)
          : view.location
      }
    };
  });
}

function getBarberLifecycleDetail(status: LiveAppointmentRecord["status"], balanceDue: number) {
  if (status === "cancelled") {
    return "Cancelled before chair time.";
  }

  if (status === "completed") {
    return balanceDue > 0 ? "Waiting on checkout handoff." : "Completed and posted to the shop dashboard.";
  }

  if (status === "checked_in") {
    return "Client is checked in and ready for service.";
  }

  if (status === "in_service") {
    return "Service is in progress right now.";
  }

  return "Client is booked and still arriving for the chair.";
}

function hydrateBarberAppointments(
  appointments: LiveAppointmentRecord[],
  clients: Client[],
  appointmentServices: Map<string, AppointmentServiceRecord>,
  directories: OperationalDirectories
) {
  return appointments.map((appointment) => {
    const client = clients.find((entry) => entry.id === appointment.clientId);
    const serviceSnapshot = appointmentServices.get(appointment.id) ?? null;
    const service = directories.servicesByReference.get(appointment.serviceId);
    const location = directories.locationsByReference.get(appointment.locationId);

    return {
      ...appointment,
      serviceSnapshot,
      display: {
        clientName: client?.name ?? appointment.clientId,
        clientProfilePhotoUrl: client?.profilePhotoUrl ?? null,
        serviceName: serviceSnapshot?.service_name ?? service?.name ?? appointment.serviceId,
        locationName: location?.name ?? appointment.locationId,
        locationLabel: location?.label ?? appointment.locationId,
        statusLabel: formatOperationalStatusLabel(appointment.status, appointment.balanceDue),
        lifecycleDetail: getBarberLifecycleDetail(appointment.status, appointment.balanceDue)
      }
    };
  });
}

async function readMarketplaceBundle() {
  const [marketplaceProvider, trustProvider, activationProvider] = await Promise.all([
    getMarketplaceProvider(),
    getTrustProvider(),
    getMarketplaceActivationProvider()
  ]);
  const [runtime, trustState, activationState] = await Promise.all([
    marketplaceProvider.readRuntime(),
    trustProvider.readState(),
    activationProvider.readState()
  ]);

  return {
    runtime,
    trustState,
    activationState
  };
}

async function readTrustStateSafe() {
  try {
    const trustProvider = await getTrustProvider();
    return await trustProvider.readState();
  } catch (error) {
    console.error("[platform-service] verification trust state unavailable", {
      message: error instanceof Error ? error.message : String(error)
    });
    return createEmptyTrustState();
  }
}

const TRUST_BLOCKING_STATUSES = new Set(["suspended", "expired", "rejected", "needs_update"]);

function isTrustDecisionBlocked(status?: string | null) {
  return TRUST_BLOCKING_STATUSES.has(status ?? "");
}

function isShopRecordApprovedForMarketplace(shop: { appApprovalStatus?: string | null; app_approval_status?: string | null }) {
  const status = shop.appApprovalStatus ?? shop.app_approval_status;
  return !status || status === "approved";
}

function isShopTrustBlockedForMarketplace(trustState: TrustState | undefined, shopId: string) {
  if (!trustState) {
    return false;
  }

  const decision = computeShopVerificationDecision(trustState, shopId);
  return isTrustDecisionBlocked(decision.canonicalOverallStatus);
}

function filterBookableMarketplaceShops<T extends { id: string; name?: string; appApprovalStatus?: string | null; app_approval_status?: string | null }>(
  shops: T[],
  trustState: TrustState | undefined,
  visibleResults: Array<{ locationId?: string; shopName?: string }>
) {
  const activeLocationIds = new Set(visibleResults.map((result) => result.locationId).filter(Boolean));
  const activeShopNames = new Set(
    visibleResults.map((result) => result.shopName?.trim().toLowerCase()).filter(Boolean)
  );

  return shops.filter((shop) =>
    (activeLocationIds.has(shop.id) || activeShopNames.has(shop.name?.trim().toLowerCase() ?? ""))
    && isShopRecordApprovedForMarketplace(shop)
    && !isShopTrustBlockedForMarketplace(trustState, shop.id)
  );
}

function resolveLocationId(shops: Array<{ id: string }>, preferredShopId?: string) {
  return preferredShopId ?? shops[0]?.id;
}

function resolveBarberUsername(runtime: MarketplaceRuntimeData, barberIdOrUsername: string) {
  return runtime.state.barberProfiles.find(
    (profile) => profile.barberId === barberIdOrUsername || profile.username === barberIdOrUsername
  )?.username;
}

type VisitStats = {
  count: number;
  lastCompletedAt: string;
};

type ShopDiscoveryMetrics = {
  activeBarbersCount: number;
  minDistanceMiles?: number;
  nextAvailableAt?: string;
  nextAvailableLabel?: string;
  bookHref?: string;
  sortRating?: number;
  sortReviewCount?: number;
  rating?: number;
  reviewCount?: number;
};

function toTimestamp(value?: string | null) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function formatDiscoveryTime(value?: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function normalizeLabel(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function buildVisitStats(
  appointments: LiveAppointmentRecord[],
  getKey: (appointment: LiveAppointmentRecord) => string | undefined
) {
  const stats = new Map<string, VisitStats>();

  for (const appointment of appointments) {
    const key = getKey(appointment);
    if (!key) {
      continue;
    }

    const existing = stats.get(key);
    if (existing) {
      existing.count += 1;
      if (toTimestamp(appointment.start) < Number.POSITIVE_INFINITY && toTimestamp(appointment.start) > toTimestamp(existing.lastCompletedAt)) {
        existing.lastCompletedAt = appointment.start;
      }
      continue;
    }

    stats.set(key, {
      count: 1,
      lastCompletedAt: appointment.start
    });
  }

  return stats;
}

function mergeUniqueByKey<T>(sources: T[][], getKey: (item: T) => string) {
  const merged: T[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    for (const item of source) {
      const key = getKey(item);
      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

function buildRecommendedBarbers(
  discovery: DiscoveryResult[],
  completedAppointments: LiveAppointmentRecord[],
  hasResolvedLocation: boolean
) {
  const visitStats = buildVisitStats(completedAppointments, (appointment) => appointment.barberId);
  const mostBooked = discovery
    .filter((result) => visitStats.has(result.barberId))
    .sort((left, right) => {
      const leftStats = visitStats.get(left.barberId)!;
      const rightStats = visitStats.get(right.barberId)!;

      return rightStats.count - leftStats.count
        || toTimestamp(rightStats.lastCompletedAt) - toTimestamp(leftStats.lastCompletedAt)
        || toTimestamp(left.nextAvailableAt) - toTimestamp(right.nextAvailableAt);
    });
  const nearby = hasResolvedLocation
    ? [...discovery].sort((left, right) =>
        left.distanceMiles - right.distanceMiles
        || toTimestamp(left.nextAvailableAt) - toTimestamp(right.nextAvailableAt)
        || right.rating - left.rating
        || right.reviewCount - left.reviewCount
      )
    : [];

  return mergeUniqueByKey(
    [mostBooked, discovery, nearby],
    (result) => result.barberId
  ).slice(0, 6);
}

function getShopMetrics(
  shop: {
    id: string;
    name: string;
  },
  discovery: DiscoveryResult[]
) {
  const matchingResults = discovery.filter((result) =>
    result.locationId === shop.id
    || normalizeLabel(result.shopName) === normalizeLabel(shop.name)
  );

  if (!matchingResults.length) {
    return null;
  }

  const candidate = [...matchingResults].sort((left, right) =>
    toTimestamp(left.nextAvailableAt) - toTimestamp(right.nextAvailableAt)
    || right.rating - left.rating
    || right.reviewCount - left.reviewCount
  )[0];
  const uniqueBarbers = new Set(matchingResults.map((result) => result.barberId));
  const minDistance = matchingResults.reduce<number | undefined>((current, result) => {
    if (typeof result.distanceMiles !== "number" || Number.isNaN(result.distanceMiles)) {
      return current;
    }

    if (typeof current !== "number") {
      return result.distanceMiles;
    }

    return Math.min(current, result.distanceMiles);
  }, undefined);

  return {
    activeBarbersCount: uniqueBarbers.size,
    minDistanceMiles: minDistance,
    nextAvailableAt: candidate.nextAvailableAt,
    nextAvailableLabel: candidate.availabilityLabel ?? formatDiscoveryTime(candidate.nextAvailableAt),
    bookHref: candidate.bookingHref,
    sortRating: candidate.rating,
    sortReviewCount: candidate.reviewCount,
    rating: candidate.rating,
    reviewCount: candidate.reviewCount
  } satisfies ShopDiscoveryMetrics;
}

function buildRecommendedShops(
  shops: Awaited<ReturnType<typeof readShops>>,
  discovery: DiscoveryResult[],
  completedAppointments: LiveAppointmentRecord[],
  hasResolvedLocation: boolean,
  locationId?: string
) {
  const locationVisitStats = buildVisitStats(completedAppointments, (appointment) => appointment.locationId);
  const preferredShop = hasResolvedLocation ? shops.find((shop) => shop.id === locationId) : undefined;
  const metricsByShopId = new Map<string, ShopDiscoveryMetrics>();

  for (const shop of shops) {
    const metrics = getShopMetrics(shop, discovery);
    if (metrics) {
      metricsByShopId.set(shop.id, metrics);
    }
  }

  const mostVisited = shops
    .filter((shop) => locationVisitStats.has(shop.id))
    .sort((left, right) => {
      const leftStats = locationVisitStats.get(left.id)!;
      const rightStats = locationVisitStats.get(right.id)!;

      return rightStats.count - leftStats.count
        || toTimestamp(rightStats.lastCompletedAt) - toTimestamp(leftStats.lastCompletedAt);
    });
  const topPlatform = [...shops].sort((left, right) => {
    const leftMetrics = metricsByShopId.get(left.id);
    const rightMetrics = metricsByShopId.get(right.id);

    return (rightMetrics?.activeBarbersCount ?? 0) - (leftMetrics?.activeBarbersCount ?? 0)
      || toTimestamp(leftMetrics?.nextAvailableAt) - toTimestamp(rightMetrics?.nextAvailableAt)
      || (rightMetrics?.sortRating ?? 0) - (leftMetrics?.sortRating ?? 0)
      || (rightMetrics?.sortReviewCount ?? 0) - (leftMetrics?.sortReviewCount ?? 0)
      || left.name.localeCompare(right.name);
  });
  const nearby = hasResolvedLocation
    ? [...shops].sort((left, right) => {
        const leftMetrics = metricsByShopId.get(left.id);
        const rightMetrics = metricsByShopId.get(right.id);
        const leftSameCity = preferredShop && left.city === preferredShop.city ? 1 : 0;
        const rightSameCity = preferredShop && right.city === preferredShop.city ? 1 : 0;

        return rightSameCity - leftSameCity
          || (leftMetrics?.minDistanceMiles ?? Number.POSITIVE_INFINITY) - (rightMetrics?.minDistanceMiles ?? Number.POSITIVE_INFINITY)
          || toTimestamp(leftMetrics?.nextAvailableAt) - toTimestamp(rightMetrics?.nextAvailableAt)
          || (rightMetrics?.activeBarbersCount ?? 0) - (leftMetrics?.activeBarbersCount ?? 0);
      })
    : [];
  const merged = mergeUniqueByKey([mostVisited, topPlatform, nearby, shops], (shop) => shop.id).slice(0, 6);

  return merged.map((shop) => {
    const metrics = metricsByShopId.get(shop.id);

    return {
      id: shop.id,
      name: shop.name,
      brandLine: shop.brandLine,
      neighborhood: shop.neighborhood,
      city: shop.city,
      state: shop.state,
      address: shop.address,
      kind: shop.kind,
      activeBarbersCount: metrics?.activeBarbersCount,
      nextAvailableAt: metrics?.nextAvailableAt,
      nextAvailableLabel: metrics?.nextAvailableLabel,
      rating: metrics?.rating,
      reviewCount: metrics?.reviewCount,
      bookHref: metrics?.bookHref
    } satisfies RecommendedShopView;
  });
}

async function readCompletedClientAppointments(clientId?: string) {
  if (!clientId) {
    return [];
  }

  try {
    const provider = await getLiveOperationsProvider();
    const snapshot = await provider.readSnapshot({ role: "client", clientId } as LiveOperationsViewer);

    return snapshot.appointments
      .filter((appointment) => appointment.status === "completed")
      .sort((left, right) => toTimestamp(right.start) - toTimestamp(left.start));
  } catch (error) {
    console.error("[platform-service] client completed appointments unavailable", {
      clientId,
      message: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

export async function getClientHomePayload(clientId?: string) {
  const supabase = getSupabase();
  const shops = await withMarketplaceSectionFallback(
    "recommended_shops_load_failed",
    [] as Awaited<ReturnType<typeof readShops>>,
    () => readShops(supabase),
    { clientId }
  );
  const clientProfile = await withMarketplaceSectionFallback(
    "client_location_load_failed",
    undefined as Awaited<ReturnType<typeof readClientProfile>>,
    () => readClientProfile(supabase, clientId),
    { clientId }
  );
  const hasSavedLocation = Boolean(clientProfile?.favoriteShopReference || clientProfile?.preferredLocation);
  const locationId = clientProfile?.favoriteShopReference
    ? resolveLocationId(shops, clientProfile.favoriteShopReference)
    : undefined;
  const completedAppointments = await readCompletedClientAppointments(clientId);
  let defaultPaymentMethod: ClientPaymentMethodView | null = null;

  if (supabase && clientId) {
    try {
      const paymentMethods = await readClientPaymentMethodsByClientId(clientId, supabase);
      defaultPaymentMethod = paymentMethods.find((method) => method.isDefault) ?? null;
    } catch (error) {
      console.error("[platform-service] client home payment methods unavailable", {
        clientId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (!supabase) {
    const bundle = await readMarketplaceBundle();
    const discovery = decorateDiscoveryWithActivation(
      buildDiscoveryPayload(bundle.runtime, bundle.trustState, {
        locationId,
        maxDistanceMiles: hasSavedLocation ? 12 : undefined,
        availability: "any"
      }),
      bundle.activationState,
      bundle.trustState
    );
    const nextAvailable = buildHaircutNowPayload(bundle.runtime, clientId, locationId, bundle.trustState);
    const localizedDiscovery = orderDiscoveryByPreferredLocation(discovery, clientProfile?.preferredLocation);
    const favoriteBarber = clientProfile?.favoriteBarberReference
      ? localizedDiscovery.find((result) => result.barberId === clientProfile.favoriteBarberReference)
      : undefined;
    const visibleShops = filterBookableMarketplaceShops(shops, bundle.trustState, localizedDiscovery);
    const recommendedBarbers = buildRecommendedBarbers(localizedDiscovery, completedAppointments, hasSavedLocation);
    const recommendedShops = buildRecommendedShops(
      visibleShops,
      localizedDiscovery,
      completedAppointments,
      hasSavedLocation,
      locationId
    );

    return {
      client: clientProfile ?? null,
      shops: visibleShops,
      trustedBarbers: localizedDiscovery.filter((result) => result.barberId !== clientProfile?.favoriteBarberReference).slice(0, 6),
      recommendedBarbers,
      recommendedShops,
      favoriteBarber: favoriteBarber ?? null,
      nextAvailableChair: nextAvailable,
      defaultPaymentMethod,
      locationId: locationId ?? "",
      hasResolvedLocation: hasSavedLocation
    };
  }

  const routine = await withMarketplaceSectionFallback(
    "client_routine_load_failed",
    null as Awaited<ReturnType<typeof readClientRoutine>>,
    () => readClientRoutine(supabase, clientId, clientProfile?.favoriteBarberReference),
    { clientId }
  );
  const trustState = await withMarketplaceSectionFallback(
    "marketplace_trust_load_failed",
    createEmptyTrustState() as Awaited<ReturnType<typeof readTrustStateSafe>>,
    () => readTrustStateSafe(),
    { clientId }
  );
  if (supabase) {
    await withMarketplaceSectionFallback(
      "barber_profile_repair_failed",
      null,
      () => ensureMarketplaceBarberProfileRows(supabase),
      { clientId }
    );
  }
  const discovery = await withMarketplaceSectionFallback(
    "recommended_barbers_load_failed",
    [] as DiscoveryResult[],
    () => buildCanonicalDiscoveryResults(supabase, {
      locationId: locationId ?? "",
      diagnosticRouteName: "client_home",
      clientSignal: {
        favoriteBarberReference: clientProfile?.favoriteBarberReference,
        favoriteShopReference: clientProfile?.favoriteShopReference
      },
      routine,
      trustState
    }),
    { clientId, locationId: locationId ?? "" }
  );
  const nextAvailable = await withMarketplaceSectionFallback(
    "next_available_load_failed",
    null as Awaited<ReturnType<typeof buildCanonicalNextAvailableMatch>>,
    () => buildCanonicalNextAvailableMatch(supabase, {
    locationId: locationId ?? "",
    clientSignal: {
      favoriteBarberReference: clientProfile?.favoriteBarberReference,
      favoriteShopReference: clientProfile?.favoriteShopReference
    },
    routine,
    trustState
  }),
    { clientId, locationId: locationId ?? "" }
  );
  const localizedDiscovery = orderDiscoveryByPreferredLocation(discovery, clientProfile?.preferredLocation);
  const favoriteBarber = clientProfile?.favoriteBarberReference
    ? localizedDiscovery.find((result) => result.barberId === clientProfile.favoriteBarberReference) ?? null
    : null;
  const visibleShops = await withMarketplaceSectionFallback(
    "recommended_shops_load_failed",
    [] as Awaited<ReturnType<typeof readShops>>,
    async () => filterBookableMarketplaceShops(shops, trustState, localizedDiscovery),
    { clientId, locationId: locationId ?? "" }
  );
  const recommendedBarbers = buildRecommendedBarbers(localizedDiscovery, completedAppointments, hasSavedLocation);
  const recommendedShops = buildRecommendedShops(
    visibleShops,
    localizedDiscovery,
    completedAppointments,
    hasSavedLocation,
    locationId
  );

  return {
    client: clientProfile ?? null,
    shops: visibleShops,
    trustedBarbers: localizedDiscovery.filter((result) => result.barberId !== clientProfile?.favoriteBarberReference).slice(0, 6),
    recommendedBarbers,
    recommendedShops,
    favoriteBarber,
    nextAvailableChair: nextAvailable,
    defaultPaymentMethod,
    locationId: locationId ?? "",
    hasResolvedLocation: hasSavedLocation
  };
}

function filterDiscoveryResults(
  results: DiscoveryResult[],
  filters: {
    minRating?: number;
    maxPrice?: number;
    availability?: "any" | "today" | "now";
    specialty?: string;
    maxDistanceMiles?: number;
  }
) {
  const now = new Date();
  return results.filter((result) => {
    if (typeof filters.minRating === "number" && result.rating < filters.minRating) return false;
    if (typeof filters.maxPrice === "number" && result.priceRange[0] > filters.maxPrice) return false;
    if (typeof filters.maxDistanceMiles === "number" && result.distanceMiles > filters.maxDistanceMiles) return false;
    if (filters.specialty) {
      const specialty = filters.specialty.toLowerCase();
      if (!result.specialties.some((entry) => entry.toLowerCase().includes(specialty))) return false;
    }
    if (filters.availability === "today") {
      const date = new Date(result.nextAvailableAt);
      return !Number.isNaN(date.getTime()) && date.toDateString() === now.toDateString();
    }
    if (filters.availability === "now") {
      const date = new Date(result.nextAvailableAt);
      return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime() + 2 * 60 * 60 * 1000;
    }
    return true;
  });
}

function scorePreferredLocation(result: DiscoveryResult, location?: ClientPreferredLocation) {
  if (!location) {
    return 0;
  }

  const city = location.city.trim().toLowerCase();
  const state = location.state.trim().toLowerCase();
  const searchable = [
    result.cityLabel,
    result.locationLabel,
    result.shopName
  ].filter(Boolean).join(" ").toLowerCase();

  return (city && searchable.includes(city) ? 2 : 0) + (state && searchable.includes(state) ? 1 : 0);
}

function orderDiscoveryByPreferredLocation(results: DiscoveryResult[], location?: ClientPreferredLocation) {
  if (!location?.city && !location?.state) {
    return results;
  }

  return results
    .map((result, index) => ({ result, index, score: scorePreferredLocation(result, location) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ result }) => result);
}

function discoveryResultMatchesQuery(result: DiscoveryResult, query?: string) {
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const queryVariants = normalizedQuery.startsWith("@")
    ? [normalizedQuery, normalizedQuery.slice(1)]
    : [normalizedQuery];
  const haystack = [
    result.barberName,
    result.username,
    result.barberId,
    result.locationLabel,
    result.cityLabel,
    result.shopName,
    result.mostBookedService,
    ...(result.specialties ?? [])
  ].filter(Boolean).join(" ").toLowerCase();

  return queryVariants.some((variant) => haystack.includes(variant));
}

export async function searchBarbersAndShopsPayload(params: {
  query?: string;
  category?: string;
  clientId?: string;
  locationId?: string;
  minRating?: number;
  maxPrice?: number;
  availability?: "any" | "today" | "now";
  specialty?: string;
  maxDistanceMiles?: number;
}) {
  const supabase = getSupabase();
  const shops = await withMarketplaceSectionFallback(
    "recommended_shops_load_failed",
    [] as Awaited<ReturnType<typeof readShops>>,
    () => readShops(supabase),
    { clientId: params.clientId }
  );
  const queryText = params.query?.trim();
  const effectiveQuery = queryText || params.category || undefined;
  const clientProfile = await withMarketplaceSectionFallback(
    "client_location_load_failed",
    undefined as Awaited<ReturnType<typeof readClientProfile>>,
    () => readClientProfile(supabase, params.clientId),
    { clientId: params.clientId }
  );
  const hasLocationScope = Boolean(params.locationId || clientProfile?.favoriteShopReference);
  const locationId = params.locationId || (clientProfile?.favoriteShopReference
    ? resolveLocationId(shops, clientProfile.favoriteShopReference)
    : undefined);
  const distanceAwareFilters = {
    ...params,
    maxDistanceMiles: hasLocationScope ? params.maxDistanceMiles : undefined
  };

  if (!supabase) {
    const bundle = await readMarketplaceBundle();
    const results = filterDiscoveryResults(decorateDiscoveryWithActivation(
      buildDiscoveryPayload(bundle.runtime, bundle.trustState, {
        query: effectiveQuery,
        locationId,
        availability: params.availability ?? "any",
        minRating: params.minRating,
        maxPrice: params.maxPrice,
        specialty: params.specialty,
        maxDistanceMiles: hasLocationScope ? params.maxDistanceMiles ?? 12 : undefined
      }),
      bundle.activationState,
      bundle.trustState
    ), distanceAwareFilters);
    const localizedResults = orderDiscoveryByPreferredLocation(results, clientProfile?.preferredLocation);
    const visibleShops = filterBookableMarketplaceShops(shops, bundle.trustState, localizedResults);
    const matchingShops = queryText
      ? visibleShops.filter((shop) => `${shop.name} ${shop.neighborhood} ${shop.city}`.toLowerCase().includes(queryText.toLowerCase()))
      : visibleShops;

    return {
      mode: effectiveQuery ? "search" : "browse",
      query: queryText ?? "",
      category: params.category ?? "",
      shops: matchingShops.slice(0, 4),
      barbers: localizedResults
    };
  }

  const routine = await withMarketplaceSectionFallback(
    "client_routine_load_failed",
    null as Awaited<ReturnType<typeof readClientRoutine>>,
    () => readClientRoutine(supabase, params.clientId, clientProfile?.favoriteBarberReference),
    { clientId: params.clientId }
  );
  const trustState = await withMarketplaceSectionFallback(
    "marketplace_trust_load_failed",
    createEmptyTrustState() as Awaited<ReturnType<typeof readTrustStateSafe>>,
    () => readTrustStateSafe(),
    { clientId: params.clientId }
  );
  await withMarketplaceSectionFallback(
    "barber_profile_repair_failed",
    null,
    () => ensureMarketplaceBarberProfileRows(supabase),
    { clientId: params.clientId, query: queryText ?? "" }
  );
  await withMarketplaceSectionFallback(
    "barber_service_sync_failed",
    [],
    () => syncAllOnboardingBarberServices(supabase),
    { clientId: params.clientId, query: queryText ?? "" }
  );
  const canonicalResults = await buildCanonicalDiscoveryResults(supabase, {
    locationId: locationId ?? "",
    query: queryText,
    category: params.category,
    diagnosticRouteName: "client_search",
    clientSignal: {
      favoriteBarberReference: clientProfile?.favoriteBarberReference,
      favoriteShopReference: clientProfile?.favoriteShopReference
    },
    routine,
    trustState
  });
  let results = filterDiscoveryResults(canonicalResults, distanceAwareFilters);
  if (!results.length && queryText) {
    const fallbackResults = await buildCanonicalDiscoveryResults(supabase, {
      locationId: locationId ?? "",
      category: params.category,
      diagnosticRouteName: "client_search_fallback",
      clientSignal: {
        favoriteBarberReference: clientProfile?.favoriteBarberReference,
        favoriteShopReference: clientProfile?.favoriteShopReference
      },
      routine,
      trustState
    });
    results = filterDiscoveryResults(
      fallbackResults.filter((result) => discoveryResultMatchesQuery(result, queryText)),
      distanceAwareFilters
    );
  }
  const localizedResults = orderDiscoveryByPreferredLocation(results, clientProfile?.preferredLocation);
  const visibleShops = filterBookableMarketplaceShops(shops, trustState, localizedResults);
  const matchingShops = queryText
    ? visibleShops.filter((shop) => `${shop.name} ${shop.neighborhood} ${shop.city}`.toLowerCase().includes(queryText.toLowerCase()))
    : visibleShops;

  return {
    mode: effectiveQuery ? "search" : "browse",
    query: queryText ?? "",
    category: params.category ?? "",
    shops: matchingShops.slice(0, 4),
    barbers: localizedResults
  };
}

export async function getBarberDetailsPayload(barberIdOrUsername: string) {
  async function mergeProfileMedia<T extends NonNullable<Awaited<ReturnType<typeof buildPublicProfilePayload>>>>(profile: T) {
    const barberMedia = await readBarberProfileMedia(profile.barber.id).catch(() => null);
    const shopId = profile.shop?.id ?? profile.profile.shopId ?? profile.shopLocations[0]?.id;
    const shopMedia = shopId ? await readShopProfileMedia(shopId).catch(() => null) : null;

    return {
      ...profile,
      profile: {
        ...profile.profile,
        profilePhotoUrl: barberMedia?.profilePhotoUrl ?? profile.profile.profilePhotoUrl
      },
      portfolio: barberMedia?.gallery.length
        ? barberMedia.gallery.map((asset) => ({
            id: asset.id,
            barberId: profile.barber.id,
            imageUrl: asset.imageUrl,
            caption: asset.caption,
            styleTagIds: [],
            featured: asset.featured
          }))
        : profile.portfolio,
      shop: profile.shop
        ? {
            ...profile.shop,
            profilePhotoUrl: shopMedia?.profilePhotoUrl ?? profile.shop.profilePhotoUrl,
            gallery: shopMedia?.gallery.length
              ? shopMedia.gallery.map((asset) => ({
                  id: asset.id,
                  shopId: profile.shop!.id,
                  imageUrl: asset.imageUrl,
                  caption: asset.caption,
                  featured: asset.featured
                }))
              : profile.shop.gallery
          }
        : profile.shop
    };
  }

  const supabase = getSupabase();
  if (supabase) {
    const trustState = await readTrustStateSafe();
    await syncAllOnboardingBarberServices(supabase).catch((error) => {
      console.error("[platform-service] onboarding barber service sync before public profile failed", {
        barberIdOrUsername,
        message: error instanceof Error ? error.message : String(error)
      });
    });
    let canonicalProfile = await buildCanonicalBarberProfile(supabase, barberIdOrUsername, trustState);
    if (!canonicalProfile) {
      await ensureBarberProfileForIdentifier(barberIdOrUsername, supabase).catch((error) => {
        console.error("[platform-service] barber profile repair before public profile failed", {
          barberIdOrUsername,
          message: error instanceof Error ? error.message : String(error)
        });
      });
      canonicalProfile = await buildCanonicalBarberProfile(supabase, barberIdOrUsername, trustState);
    }
    if (canonicalProfile) {
      return mergeProfileMedia(canonicalProfile);
    }
  }

  const bundle = await readMarketplaceBundle();
  const username = resolveBarberUsername(bundle.runtime, barberIdOrUsername) ?? barberIdOrUsername;
  const profile = buildPublicProfilePayload(bundle.runtime, bundle.trustState, username);
  if (!profile) {
    return null;
  }

  return mergeProfileMedia(decoratePublicProfileWithActivation(profile, bundle.activationState));
}

export type PublicShopProfilePayload = {
  shop: RecommendedShopView & {
    phone?: string;
    profilePhotoUrl?: string | null;
    gallery?: Array<{
      id: string;
      shopId: string;
      imageUrl: string;
      caption: string;
      featured?: boolean;
    }>;
  };
  barbers: NonNullable<Awaited<ReturnType<typeof getBarberDetailsPayload>>>[];
  services: NonNullable<Awaited<ReturnType<typeof getBarberDetailsPayload>>>["services"];
};

function findPublicShop<T extends { id: string; name: string }>(shops: T[], shopIdOrSlug: string) {
  const decoded = decodeURIComponent(shopIdOrSlug);
  const normalized = normalizeLabel(decoded);
  const slugged = decoded.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return shops.find((shop) =>
    shop.id === decoded
    || normalizeLabel(shop.name) === normalized
    || shop.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === slugged
  );
}

export async function getPublicShopProfilePayload(shopIdOrSlug: string): Promise<PublicShopProfilePayload | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const shops = await readShops(supabase);
  const candidateShop = findPublicShop(shops, shopIdOrSlug);
  if (!candidateShop) {
    return null;
  }

  const trustState = await readTrustStateSafe();
  const discovery = await buildCanonicalDiscoveryResults(supabase, {
    locationId: candidateShop.id,
    trustState
  });
  const visibleShops = filterBookableMarketplaceShops(shops, trustState, discovery);
  const visibleShop = findPublicShop(visibleShops, candidateShop.id);
  if (!visibleShop) {
    return null;
  }

  const recommendedShop = buildRecommendedShops(visibleShops, discovery, [], true, visibleShop.id)
    .find((shop) => shop.id === visibleShop.id) ?? {
      ...visibleShop,
      activeBarbersCount: discovery.filter((result) => result.locationId === visibleShop.id).length
    };
  const linkedResults = discovery.filter((result) =>
    result.locationId === visibleShop.id
    || normalizeLabel(result.shopName) === normalizeLabel(visibleShop.name)
  );
  const seenBarbers = new Set<string>();
  const barbers = (await Promise.all(linkedResults.map((result) =>
    getBarberDetailsPayload(result.username ?? result.barberId)
  )))
    .filter((profile): profile is NonNullable<Awaited<ReturnType<typeof getBarberDetailsPayload>>> => Boolean(profile))
    .filter((profile) => {
      if (seenBarbers.has(profile.barber.id)) {
        return false;
      }
      seenBarbers.add(profile.barber.id);
      return true;
    });

  if (!barbers.length) {
    return null;
  }

  const shopMedia = await readShopProfileMedia(visibleShop.id).catch(() => null);
  const serviceMap = new Map<string, PublicShopProfilePayload["services"][number]>();
  for (const profile of barbers) {
    for (const service of profile.services) {
      if (service.ownerLabel === "Shop service" || service.service.shopId === visibleShop.id) {
        serviceMap.set(service.service.id, service);
      }
    }
  }

  return {
    shop: {
      ...recommendedShop,
      phone: visibleShop.phone,
      profilePhotoUrl: shopMedia?.profilePhotoUrl ?? null,
      gallery: shopMedia?.gallery.map((asset) => ({
        id: asset.id,
        shopId: visibleShop.id,
        imageUrl: asset.imageUrl,
        caption: asset.caption,
        featured: asset.featured
      })) ?? []
    },
    barbers,
    services: [...serviceMap.values()]
  };
}

export async function getBarberAvailabilityPayload(barberId: string, options: { serviceId?: string; locationId?: string; days?: number; }) {
  const supabase = getSupabase();
  if (supabase) {
    const trustState = await readTrustStateSafe();
    const canonicalPayload = await buildCanonicalAvailabilityPayload(supabase, barberId, { ...options, trustState });
    if (canonicalPayload) {
      return canonicalPayload;
    }
  }

  return {
    barberId,
    locationId: options.locationId ?? "",
    service: null,
    slots: [],
    gating: getVerificationGateDecision(undefined, "booking")
  };
}
export async function getClientBookingsPayload(clientId: string) {
  const supabase = getSupabase();
  const provider = await getLiveOperationsProvider();
  console.info("[client-activity] appointment_read_started", {
    reference: "appointment_read_started",
    clientId,
    statusFilter: ["confirmed", "pending", "pending_payment", "checked_in", "in_service", "booked", "paid", "completed"]
  });
  const snapshot = await provider.readSnapshot({ role: "client", clientId } as LiveOperationsViewer);
  const clientProfile = await readClientProfile(supabase, clientId);
  const appointments = [...snapshot.appointments];
  console.info("[client-activity] appointment_read_result", {
    reference: "appointment_read_result",
    clientId,
    appointmentCount: appointments.length,
    latestAppointmentId: appointments[0]?.id ?? null,
    errorSuppressed: false
  });
  const appointmentServices = await readAppointmentServiceSnapshots(supabase, appointments.map((entry) => entry.id));
  const directories = await readOperationalDirectories(supabase);
  const hydratedAppointments = hydrateAppointments(appointments, snapshot.clients, appointmentServices, directories);
  const upcomingAppointments = hydratedAppointments
    .filter((appointment) => isUpcomingAppointmentStatus(appointment.status))
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
  const nextAppointment = upcomingAppointments[0] ?? null;
  const history = hydratedAppointments
    .filter((appointment) => ["completed", "cancelled", "no_show", "refunded"].includes(appointment.status))
    .sort((left, right) => new Date(right.start).getTime() - new Date(left.start).getTime())
    .slice(0, 6);
  const favoriteBarberProfile = clientProfile?.favoriteBarberReference
    ? await getBarberDetailsPayload(clientProfile.favoriteBarberReference)
    : null;
  const routine = await readClientRoutine(
    supabase,
    clientId,
    favoriteBarberProfile?.barber.id ?? clientProfile?.favoriteBarberReference
  );
  let nextAppointmentPayment = null;
  if (nextAppointment && supabase) {
    try {
      nextAppointmentPayment = await readAppointmentPaymentSummary(nextAppointment.id, supabase);
    } catch (error) {
      console.warn("[client-activity] payment_summary_read_failed", {
        reference: "payment_summary_read_failed",
        appointmentId: nextAppointment.id,
        errorName: error instanceof Error ? error.name : null,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorSuppressed: true
      });
    }
  }
  const reviewMap = await readAppointmentReviewMap(
    supabase,
    clientId,
    history.map((appointment) => appointment.id)
  );
  const receiptTargets = [...new Set([...upcomingAppointments.map((appointment) => appointment.id), ...history.map((appointment) => appointment.id)])];
  const receiptEntries = await Promise.all(receiptTargets.map(async (appointmentId) => [
    appointmentId,
    {
      receipt: await readBookingReceipt(appointmentId).catch(() => null),
      breakdown: await readBookingTransactionBreakdown(appointmentId).catch(() => null),
      moneyTimeline: await readBookingMoneyTimeline(appointmentId).catch(() => null)
    }
  ] as const));
  const receiptMap = new Map(receiptEntries);
  const reviewHistory = history.map((appointment) => ({
    ...appointment,
    review: reviewMap.get(appointment.id) ?? null,
    canReview: appointment.status === "completed" && !reviewMap.has(appointment.id),
    receipt: receiptMap.get(appointment.id)?.receipt ?? null,
    breakdown: receiptMap.get(appointment.id)?.breakdown ?? null,
    moneyTimeline: receiptMap.get(appointment.id)?.moneyTimeline ?? null
  }));
  const hydratedUpcomingAppointments = upcomingAppointments.map((appointment) => ({
    ...appointment,
    receipt: receiptMap.get(appointment.id)?.receipt ?? null,
    breakdown: receiptMap.get(appointment.id)?.breakdown ?? null,
    moneyTimeline: receiptMap.get(appointment.id)?.moneyTimeline ?? null
  }));
  const nextHydratedAppointment = hydratedUpcomingAppointments[0] as (typeof hydratedUpcomingAppointments)[number] | undefined;
  let membershipValue = null;
  let membershipExecution = null;

  try {
    const [pointsBalance, referralSummary] = await Promise.all([
      readPointsBalanceForClientReference(clientId, supabase),
      readClientReferralSummary({
        clientId,
        clientEmail: clientProfile?.email
      }, supabase)
    ]);
    membershipExecution = await buildClientMembershipExecutionSummary({
      clientId,
      clientName: clientProfile?.fullName,
      pointsBalance: pointsBalance.unlockedPoints,
      referralCredits: referralSummary.totals.rewardPointsEarned,
      unlockedRewardCount: 0,
      nextDueAt: routine?.nextSuggestedAt ?? null
    });
    membershipValue = await buildClientMembershipValueSummary({
      clientId,
      clientName: clientProfile?.fullName,
      favoriteBarberId: favoriteBarberProfile?.barber.id ?? clientProfile?.favoriteBarberReference,
      favoriteBarberName: favoriteBarberProfile?.barber.name,
      favoriteShopId: favoriteBarberProfile?.shopLocations[0]?.id ?? clientProfile?.favoriteShopReference,
      favoriteShopLabel: favoriteBarberProfile?.shopLocations[0]
        ? `${favoriteBarberProfile.shopLocations[0].name} / ${favoriteBarberProfile.shopLocations[0].neighborhood}`
        : undefined,
      pointsBalance: pointsBalance.unlockedPoints,
      referralCredits: referralSummary.totals.rewardPointsEarned,
      unlockedRewardCount: 0,
      nextDueAt: routine?.nextSuggestedAt ?? null
    });
  } catch {
    membershipValue = null;
    membershipExecution = null;
  }

  return {
    client: clientProfile ?? null,
    favoriteBarber: favoriteBarberProfile,
    upcoming: hydratedUpcomingAppointments,
    nextAppointment: nextHydratedAppointment ?? null,
    history: reviewHistory,
    routine,
    membershipValue,
    membershipExecution,
    nextAppointmentPayment
  };
}

export async function getClientProfilePayload(clientId: string): Promise<ClientProfilePayload> {
  const supabase = getSupabase();
  const [shops, clientProfile] = await Promise.all([
    readShops(supabase),
    readClientProfile(supabase, clientId)
  ]);
  const favoriteBarber = clientProfile?.favoriteBarberReference
    ? await getBarberDetailsPayload(clientProfile.favoriteBarberReference)
    : null;
  const [notificationPreference, routine] = await Promise.all([
    readNotificationPreference(supabase, clientProfile?.email),
    readClientRoutine(supabase, clientId, favoriteBarber?.barber.id ?? clientProfile?.favoriteBarberReference)
  ]);
  let paymentMethods: ClientPaymentMethodView[] = [];
  if (supabase) {
    try {
      paymentMethods = await readClientPaymentMethodsByClientId(clientId, supabase);
    } catch (error) {
      console.error("[platform-service] client profile payment methods unavailable", {
        clientId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    client: clientProfile ?? null,
    favoriteBarber,
    preferredShops: resolvePreferredShops(shops, clientProfile?.favoriteShopReference, favoriteBarber),
    notificationPreference,
    routine,
    paymentMethods
  };
}

export async function saveClientRoutine(input: ClientRoutineUpsertInput) {
  const supabase = getSupabase();
  return persistClientRoutine(supabase, input);
}

export async function submitClientReview(input: ClientReviewInput) {
  const provider = await getLiveOperationsProvider();
  const snapshot = await provider.readSnapshot({ role: "client", clientId: input.clientId } as LiveOperationsViewer);
  const appointment = snapshot.appointments.find((entry) => entry.id === input.appointmentId);

  if (!appointment) {
    throw new ClientReviewError("This appointment could not be found for your account.", 404, "appointment_not_found");
  }

  if (appointment.clientId !== input.clientId) {
    throw new ClientReviewError("You can only review your own completed appointments.", 403, "review_forbidden");
  }

  if (appointment.status !== "completed") {
    throw new ClientReviewError("Reviews can only be submitted after an appointment is completed.", 409, "appointment_not_completed");
  }

  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const message = input.message.trim();
  const supabase = getSupabase();
  const existingReviews = await readAppointmentReviewMap(supabase, input.clientId, [input.appointmentId]);
  const existingReview = existingReviews.get(input.appointmentId);

  if (existingReview) {
    throw new ClientReviewError("A review has already been submitted for this appointment.", 409, "review_already_exists");
  }

  const createdAt = new Date().toISOString();

  if (!supabase) {
    const nextReview = {
      id: `review-${Date.now()}`,
      appointmentId: appointment.id,
      barberId: appointment.barberId,
      clientId: appointment.clientId,
      locationId: appointment.locationId,
      rating,
      sentiment: resolveReviewSentiment(rating) as ReviewSentiment,
      message,
      createdAt
    };

    const nextState = getMarketplaceState();
    setMarketplaceState({
      ...nextState,
      reviews: [nextReview, ...nextState.reviews]
    });

    try {
      const engagementProvider = await getEngagementProvider();
      const clientEmail = snapshot.clients.find((client) => client.id === input.clientId)?.email;
      if (clientEmail) {
        await engagementProvider.recordEvent(
          {
            role: "client",
            userEmail: clientEmail,
            clientId: input.clientId
          },
          {
            eventType: "barber_reviewed",
            targetType: "barber",
            targetId: appointment.barberId,
            metadata: {
              appointmentId: appointment.id,
              rating
            }
          }
        );
      }
    } catch {}

    return {
      review: {
        id: nextReview.id,
        rating: nextReview.rating,
        message: nextReview.message,
        createdAt: nextReview.createdAt
      }
    };
  }

  const insertResult = await supabase
    .from("reviews")
    .insert({
      appointment_id: canonicalAppointmentUuid(appointment.id),
      barber_id: canonicalBarberUuid(appointment.barberId),
      client_id: canonicalClientUuid(appointment.clientId),
      location_id: canonicalLocationUuid(appointment.locationId),
      rating,
      message: message || null,
      created_at: createdAt
    })
    .select("id, appointment_id, rating, message, created_at")
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      throw new ClientReviewError("A review has already been submitted for this appointment.", 409, "review_already_exists");
    }
    throw new ClientReviewError("Unable to save this review right now.", 500, "review_persist_failed");
  }

  try {
    const engagementProvider = await getEngagementProvider();
    const clientProfile = await readClientProfile(supabase, input.clientId);
    if (clientProfile?.email) {
      await engagementProvider.recordEvent(
        {
          role: "client",
          userEmail: clientProfile.email,
          clientId: input.clientId
        },
        {
          eventType: "barber_reviewed",
          targetType: "barber",
          targetId: appointment.barberId,
          metadata: {
            appointmentId: appointment.id,
            rating
          }
        }
      );
    }
  } catch {}

  const row = insertResult.data as ReviewRecordRow;
  return {
    review: {
      id: row.id,
      rating: Number(row.rating ?? rating),
      message: row.message ?? "",
      createdAt: row.created_at
    }
  };
}

export async function getBarberDashboardPayload(viewer: LiveOperationsViewer) {
  const supabase = getSupabase();
  const provider = await getLiveOperationsProvider();
  const snapshot = await provider.readSnapshot(viewer);
  const directories = await readOperationalDirectories(supabase);
  const barberId = viewer.barberId ?? snapshot.appointments[0]?.barberId ?? "";
  const compensationRows = snapshot.compensationSnapshots.filter((entry) => entry.barberReference === barberId);
  const baseSummary = getBarberCompensationSummary(barberId, snapshot.appointments, compensationRows);
  const appointmentServices = await readAppointmentServiceSnapshots(supabase, snapshot.appointments.map((entry) => entry.id));
  const hydratedAppointments = hydrateBarberAppointments(snapshot.appointments, snapshot.clients, appointmentServices, directories);
  const todayAppointments = hydratedAppointments.filter((appointment) => appointment.start.slice(0, 10) === baseSummary.businessDate);
  const upcomingAppointment = [...hydratedAppointments]
      .filter((appointment) => isUpcomingAppointmentStatus(appointment.status))
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())[0] ?? null;
  const summary = {
    ...baseSummary,
      bookedCount: todayAppointments.filter((appointment) => isScheduledAppointmentStatus(appointment.status)).length,
    checkedInCount: todayAppointments.filter((appointment) => appointment.status === "checked_in").length,
    inServiceCount: todayAppointments.filter((appointment) => appointment.status === "in_service").length,
    completedCount: todayAppointments.filter((appointment) => appointment.status === "completed").length,
    cancelledCount: todayAppointments.filter((appointment) => appointment.status === "cancelled").length
  };

  return {
    barberId,
    summary,
    appointments: hydratedAppointments,
    clients: snapshot.clients,
    compensationSnapshots: compensationRows,
    upcomingAppointment
  };
}

export async function getBarberAppointmentsPayload(viewer: LiveOperationsViewer) {
  const supabase = getSupabase();
  const provider = await getLiveOperationsProvider();
  const snapshot = await provider.readSnapshot(viewer);
  const directories = await readOperationalDirectories(supabase);
  const appointmentServices = await readAppointmentServiceSnapshots(supabase, snapshot.appointments.map((entry) => entry.id));

  return {
    appointments: hydrateBarberAppointments(snapshot.appointments, snapshot.clients, appointmentServices, directories),
    clients: snapshot.clients
  };
}

export async function getShopDashboardPayload(viewer: LiveOperationsViewer) {
  const supabase = getSupabase();
  const provider = await getLiveOperationsProvider();
  const snapshot = await provider.readSnapshot(viewer);
  const directories = await readOperationalDirectories(supabase);
  const managerSummary = getManagerOperationsSummary(snapshot.appointments, snapshot.ownerAnalytics, snapshot.walkIns);
  const ownerSummary = getOwnerAnalyticsSummary(snapshot.ownerAnalytics);
  const summary = viewer.role === "manager" ? managerSummary : ownerSummary;
  const businessDate = viewer.role === "manager" ? managerSummary.latestDate : ownerSummary.businessDate;
  const appointmentServices = await readAppointmentServiceSnapshots(supabase, snapshot.appointments.map((entry) => entry.id));
  const appointments = snapshot.appointments.map((appointment) => {
    const client = snapshot.clients.find((entry) => entry.id === appointment.clientId);
    const barber = directories.barbersByReference.get(appointment.barberId);
    const serviceSnapshot = appointmentServices.get(appointment.id);
    const service = directories.servicesByReference.get(appointment.serviceId);
    const location = directories.locationsByReference.get(appointment.locationId);

    return {
      ...appointment,
      display: {
        clientName: client?.name ?? appointment.clientId,
        barberName: barber?.name ?? appointment.barberId,
        serviceName: serviceSnapshot?.service_name ?? service?.name ?? appointment.serviceId,
        locationName: location?.name ?? appointment.locationId,
        locationLabel: location?.label ?? appointment.locationId,
        statusLabel: formatOperationalStatusLabel(appointment.status, appointment.balanceDue)
      }
    };
  });
  const walkIns = snapshot.walkIns.map((entry, index) => {
    const location = directories.locationsByReference.get(entry.locationId);
    const assignedBarber = entry.assignedBarberId
      ? directories.barbersByReference.get(entry.assignedBarberId)
      : undefined;

    return {
      ...entry,
      position: index + 1,
      display: {
        locationName: location?.name ?? entry.locationId,
        locationLabel: location?.label ?? entry.locationId,
        assignedBarberName: assignedBarber?.name,
        statusLabel: formatOperationalStatusLabel(entry.status)
      }
    };
  });
  const locationRefsInScope = viewer.locationIds ?? [];
  const assignedBarberIds = new Set<string>();

  for (const locationId of locationRefsInScope) {
    for (const barberId of directories.barberAssignmentsByLocation.get(locationId) ?? []) {
      assignedBarberIds.add(barberId);
    }
  }

  for (const appointment of appointments) {
    assignedBarberIds.add(appointment.barberId);
  }

  for (const walkIn of walkIns) {
    if (walkIn.assignedBarberId) {
      assignedBarberIds.add(walkIn.assignedBarberId);
    }
  }

  const barbers = [...assignedBarberIds]
    .map((barberId) => {
      const identity = directories.barbersByReference.get(barberId);
      const barberAppointments = appointments.filter(
        (appointment) => appointment.barberId === barberId && appointment.start.slice(0, 10) === businessDate
      );
      const liveAppointmentCount = barberAppointments.filter((appointment) => ["checked_in", "in_service"].includes(appointment.status)).length;
  const activeAppointmentCount = barberAppointments.filter((appointment) => isUpcomingAppointmentStatus(appointment.status)).length;
  const bookedCount = barberAppointments.filter((appointment) => isScheduledAppointmentStatus(appointment.status)).length;
      const completedCount = barberAppointments.filter((appointment) => appointment.status === "completed").length;
      const nextAppointmentStart = barberAppointments
    .filter((appointment) => isUpcomingAppointmentStatus(appointment.status))
        .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())[0]?.start ?? null;

      return {
        id: barberId,
        name: identity?.name ?? barberId,
        compensationModel: identity?.compensationModel ?? "commission",
        activeAppointmentCount,
        liveAppointmentCount,
        bookedCount,
        completedCount,
        utilization: barberAppointments.length ? Math.round(((liveAppointmentCount + completedCount) / barberAppointments.length) * 100) : 0,
        nextAppointmentStart
      };
    })
    .sort((left, right) => right.liveAppointmentCount - left.liveAppointmentCount || right.completedCount - left.completedCount || left.name.localeCompare(right.name));
  const activeBarbers = barbers.filter((barber) => barber.activeAppointmentCount > 0);
  const locations = locationRefsInScope
    .map((locationId) => directories.locationsByReference.get(locationId))
    .filter((location): location is OperationalLocationIdentity => Boolean(location))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    summary,
    barbers,
    activeBarbers,
    appointments,
    ownerAnalytics: snapshot.ownerAnalytics,
    walkIns,
    locations,
    workflowEvents: snapshot.workflowEvents.slice(0, 12)
  };
}























