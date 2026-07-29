import { createHash, randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findCanonicalBookableSlot } from "@/lib/booking/intelligence";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { toLifecycleActorRole } from "@/lib/booking/route-auth";
import {
  canonicalAppointmentUuid,
  canonicalBarberUuid,
  canonicalClientUuid,
  canonicalLocationUuid,
  canonicalProfileUuid,
  canonicalServiceUuid
} from "@/lib/booking/canonical-booking";
import { formatLiveStatusLabel } from "@/lib/barber/domain";
import {
  assertQueueStatusTransition,
  getQueueStatusLabel,
  normalizeQueueCreateInput,
  pickBestQueueBarber,
  sortQueueEntries,
  type QueueBarberCandidate,
  type QueueCreateInput,
  type QueueSource,
  type QueueStatus
} from "@/lib/queue/domain";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { isBarberAccountRole, isShopOwnerRole } from "@/lib/auth/roles";
import {
  resolveQueueAssignmentLock,
  type BookingSourceProvider,
  type PaymentOwner
} from "@/lib/clientbridge/domain";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  /** The handle a client may be shown. Null for a profile that has not set one. */
  public_username?: string | null;
  phone: string | null;
  role: UserAccount["role"];
};

type LocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ClientRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
};

type ServiceRow = {
  id: string;
  reference_code: string | null;
  name: string;
  category: string;
  /** `numeric(10,2)` — Supabase returns it as a number or a numeric string. */
  price: number | string | null;
  duration_min: number;
  buffer_min: number | null;
  location_id: string;
  barber_reference: string | null;
  shop_reference: string | null;
};

type BarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
};

type StaffLocationRow = {
  location_id: string;
  profile_id: string;
};

type BarberStatusRow = {
  barber_reference: string;
  barber_id: string | null;
  current_shop_id: string | null;
  live_status: "offline" | "available" | "busy" | "on_break" | "away" | null;
  is_online: boolean | null;
  accepts_walk_ins: boolean | null;
  next_available_at: string | null;
};

type QueueRow = {
  id: string;
  location_id: string;
  shop_id: string | null;
  client_id: string;
  service_id: string | null;
  barber_id: string | null;
  barber_preference: string | null;
  preferred_date: string | null;
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  flexibility_minutes: number | null;
  queue_source: QueueSource | null;
  idempotency_key: string | null;
  idempotency_payload_hash: string | null;
  entry_type: "booked" | "walkin";
  source_provider: BookingSourceProvider;
  payment_owner: PaymentOwner;
  assignment_locked: boolean;
  canonical_position: number | null;
  estimated_wait_minutes: number | null;
  wait_reason: string | null;
  wait_version: number;
  public_queue_state: "waiting" | "almost_ready" | "ready" | "grace" | "behind" | "delayed" | "reassigned" | "missed" | "rejoin" | "canceled" | "done";
  ready_grace_expires_at: string | null;
  last_synced_at: string;
  chairsync_appointment_id: string | null;
  source_service_name: string | null;
  operational_sms_consent: boolean;
  rejoin_of_entry_id: string | null;
  notes: string | null;
  status_reason: string | null;
  status: QueueStatus;
  created_at: string;
  called_at: string | null;
  assigned_at: string | null;
  converted_appointment_id: string | null;
  converted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  updated_at: string;
};

type AppointmentReferenceRow = {
  id: string;
  reference_code: string | null;
};

type QueueScopeContext = {
  scopedLocations: LocationRow[];
  scopedLocationIds: string[];
  scopedLocationReferences: string[];
};

type QueueActorContext = QueueScopeContext & {
  user: UserAccount;
  profile: ProfileRow;
};

const QUEUE_ROW_SELECT = "id, location_id, shop_id, client_id, service_id, barber_id, barber_preference, preferred_date, preferred_start_time, preferred_end_time, flexibility_minutes, queue_source, idempotency_key, idempotency_payload_hash, entry_type, source_provider, payment_owner, assignment_locked, canonical_position, estimated_wait_minutes, wait_reason, wait_version, public_queue_state, ready_grace_expires_at, last_synced_at, chairsync_appointment_id, source_service_name, operational_sms_consent, rejoin_of_entry_id, notes, status_reason, status, created_at, called_at, assigned_at, converted_appointment_id, converted_at, completed_at, cancelled_at, created_by, updated_at";
const QUEUE_SERVICE_SELECT = "id, reference_code, name, category, price, duration_min, buffer_min, location_id, barber_reference, shop_reference";

export type QueueBarberOptionView = {
  id: string;
  /** Real name — internal operator surfaces only. */
  name: string;
  /**
   * The barber's public handle, or null. Public surfaces such as the kiosk
   * show this and never `name`; null means "no public label", never "use the
   * real name instead".
   */
  publicUsername: string | null;
  currentShopId: string | null;
  currentShopLabel: string | null;
  liveStatus: "offline" | "available" | "busy" | "on_break" | "away";
  liveStatusLabel: string;
  isOnline: boolean;
  acceptsWalkIns: boolean;
  nextAvailableAt: string | null;
};

export type QueueServiceOptionView = {
  id: string;
  name: string;
  category: string;
  shopId: string;
  /**
   * Present so the shop kiosk can show each barber their own prices. Null when
   * the row carries no price — callers must render the absence, never a zero.
   */
  priceCents: number | null;
  durationMinutes: number;
  bufferMinutes: number;
  /** Null for a shop-wide service every chair offers. */
  barberReference: string | null;
};

export type QueueShopScopeView = {
  id: string;
  label: string;
};

export type QueueEntryView = {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  shopId: string;
  shopLabel: string;
  serviceId?: string;
  serviceName: string;
  preferredBarberId?: string;
  preferredBarberName?: string;
  assignedBarberId?: string;
  assignedBarberName?: string;
  bestAvailableBarber?: {
    barberId: string;
    barberName: string;
    nextAvailableAt: string | null;
    liveStatusLabel: string;
  };
  preferredDate?: string;
  preferredStartTime?: string;
  preferredEndTime?: string;
  flexibilityMinutes: number;
  queueSource: QueueSource;
  entryType: "booked" | "walkin";
  sourceProvider: BookingSourceProvider;
  paymentOwner: PaymentOwner;
  assignmentLocked: boolean;
  reassignable: boolean;
  position: number | null;
  estimatedWaitMinutes: number | null;
  waitReason?: string;
  waitVersion: number;
  publicState: QueueRow["public_queue_state"];
  readyGraceExpiresAt?: string;
  lastSyncedAt: string;
  chairsyncAppointmentId?: string;
  operationalSmsConsent: boolean;
  rejoinOfEntryId?: string;
  status: QueueStatus;
  statusLabel: string;
  statusReason?: string;
  notes?: string;
  createdAt: string;
  calledAt?: string;
  assignedAt?: string;
  convertedAppointmentId?: string;
  waitMinutes: number;
};

export type QueueWorkspacePayload = {
  summary: {
    activeCount: number;
    calledCount: number;
    assignedCount: number;
    averageWaitMinutes: number;
  };
  shops: QueueShopScopeView[];
  barbers: QueueBarberOptionView[];
  services: QueueServiceOptionView[];
  entries: QueueEntryView[];
  recentResolvedEntries: QueueEntryView[];
};

export class QueueServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function getSupabaseOrThrow() {
  if (!isSupabaseEnabled()) {
    throw new QueueServiceError("Queue operations require the live Supabase environment.", 503);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new QueueServiceError("Queue operations require the live Supabase environment.", 503);
  }

  return supabase;
}

function isQueueManager(role: UserAccount["role"]) {
  return isShopOwnerRole(role) || role === "manager" || role === "front_desk";
}

function isBarberQueueOperator(role: UserAccount["role"]) {
  return isBarberAccountRole(role);
}

function canUseQueueCreationFlow(role: UserAccount["role"]) {
  return isQueueManager(role) || isBarberQueueOperator(role);
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function formatShopLabel(location: Pick<LocationRow, "name" | "neighborhood" | "city" | "state">) {
  const area = [location.neighborhood, location.city].filter(Boolean).join(" / ");
  return area ? `${location.name} / ${area}` : [location.name, location.state].filter(Boolean).join(" / ");
}

function queueGuestEmail(clientName: string, clientPhone: string, providedEmail?: string) {
  if (providedEmail) {
    return providedEmail.trim().toLowerCase();
  }

  const normalizedPhone = normalizePhone(clientPhone) || randomUUID().slice(0, 8);
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guest";
  return `${slug}-${normalizedPhone}@guest.bvrb3r.local`;
}

function queueIdempotencyPayloadHash(input: {
  locationId: string;
  clientPhone: string;
  serviceId: string | null;
  preferredBarberId: string | null;
  entryType: "booked" | "walkin";
  sourceProvider: BookingSourceProvider;
  paymentOwner: PaymentOwner;
  chairsyncAppointmentId: string | null;
}) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function toQueueScope(scopedLocations: LocationRow[]): QueueScopeContext {
  return {
    scopedLocations,
    scopedLocationIds: scopedLocations.map((location) => location.id),
    scopedLocationReferences: scopedLocations.map((location) => location.reference_code ?? location.id)
  };
}

async function resolveActor(user: UserAccount, supabase: SupabaseClient): Promise<QueueActorContext> {
  if (!canUseQueueCreationFlow(user.role)) {
    throw new QueueServiceError("Only owner, manager, front desk, or an assigned barber can use the walk-in queue.", 403);
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, role")
    .eq("email", user.email)
    .maybeSingle();

  if (profileResult.error) {
    throw new QueueServiceError("Unable to resolve the queue operator profile.", 500);
  }

  if (!profileResult.data) {
    throw new QueueServiceError("No queue operator profile is available for this account.", 404);
  }

  const referenceValues = user.locationIds.filter((value) => !/^[0-9a-f-]{36}$/i.test(value));
  const uuidValues = user.locationIds.filter((value) => /^[0-9a-f-]{36}$/i.test(value));
  const [referenceResult, uuidResult] = await Promise.all([
    referenceValues.length
      ? supabase
        .from("locations")
        .select("id, reference_code, name, neighborhood, city, state")
        .in("reference_code", referenceValues)
      : Promise.resolve({ data: [], error: null }),
    uuidValues.length
      ? supabase
        .from("locations")
        .select("id, reference_code, name, neighborhood, city, state")
        .in("id", uuidValues)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (referenceResult.error || uuidResult.error) {
    throw new QueueServiceError("Unable to resolve the queue operator shop scope.", 500);
  }

  const scopedLocations = [
    ...((referenceResult.data ?? []) as LocationRow[]),
    ...((uuidResult.data ?? []) as LocationRow[])
  ].filter((location, index, rows) => rows.findIndex((candidate) => candidate.id === location.id) === index);

  return {
    user,
    profile: profileResult.data as ProfileRow,
    ...toQueueScope(scopedLocations)
  };
}

function assertQueueManagerRole(user: UserAccount) {
  if (!isQueueManager(user.role)) {
    throw new QueueServiceError("Only owner, manager, or front desk can manage the walk-in queue.", 403);
  }
}

function assertLocationScope(actor: QueueActorContext, shopReference: string) {
  if (isShopOwnerRole(actor.user.role)) {
    return;
  }

  if (!actor.scopedLocationReferences.includes(shopReference)) {
    throw new QueueServiceError("This queue action is outside the current shop scope.", 403);
  }
}

async function resolveLocationByReference(supabase: SupabaseClient, shopReference: string) {
  const shopUuid = canonicalLocationUuid(shopReference);
  const result = await supabase
    .from("locations")
    .select("id, reference_code, name, neighborhood, city, state")
    .or(`reference_code.eq.${shopReference},id.eq.${shopUuid}`)
    .maybeSingle();

  if (result.error) {
    throw new QueueServiceError("Unable to resolve the selected shop.", 500);
  }

  if (!result.data) {
    throw new QueueServiceError("The selected shop could not be found.", 404);
  }

  return result.data as LocationRow;
}

async function resolveQueueScopeByShopReferences(supabase: SupabaseClient, shopReferences: string[]) {
  const resolvedLocations = await Promise.all(
    [...new Set(shopReferences)].map((shopReference) => resolveLocationByReference(supabase, shopReference))
  );

  return toQueueScope(
    resolvedLocations.filter((location, index, rows) => rows.findIndex((candidate) => candidate.id === location.id) === index)
  );
}

async function resolveServiceByReference(supabase: SupabaseClient, serviceReference: string) {
  const serviceUuid = canonicalServiceUuid(serviceReference);
  const result = await supabase
    .from("services")
    .select(QUEUE_SERVICE_SELECT)
    .or(`reference_code.eq.${serviceReference},id.eq.${serviceUuid}`)
    .maybeSingle();

  if (result.error) {
    throw new QueueServiceError("Unable to resolve the requested service.", 500);
  }

  if (!result.data) {
    throw new QueueServiceError("The requested service could not be found.", 404);
  }

  return result.data as ServiceRow;
}

async function resolveBarberByReference(supabase: SupabaseClient, barberReference: string) {
  const barberUuid = canonicalBarberUuid(barberReference);
  const result = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id")
    .or(`reference_code.eq.${barberReference},id.eq.${barberUuid}`)
    .maybeSingle();

  if (result.error) {
    throw new QueueServiceError("Unable to resolve the selected barber.", 500);
  }

  if (!result.data) {
    throw new QueueServiceError("The selected barber could not be found.", 404);
  }

  return result.data as BarberRow;
}

async function assertBarberInShop(supabase: SupabaseClient, barber: BarberRow, locationId: string) {
  const membershipResult = await supabase
    .from("staff_locations")
    .select("location_id, profile_id")
    .eq("profile_id", barber.profile_id)
    .eq("location_id", locationId)
    .maybeSingle();

  if (membershipResult.error) {
    throw new QueueServiceError("Unable to verify the barber's shop assignment.", 500);
  }

  if (!membershipResult.data) {
    throw new QueueServiceError("The selected barber is not assigned to this shop.", 409);
  }
}

async function resolveOrCreateQueueClient(
  supabase: SupabaseClient,
  input: {
    clientId?: string;
    clientName: string;
    clientPhone: string;
    clientEmail?: string;
    preferredBarberId?: string;
  }
) {
  if (input.clientId) {
    const clientUuid = canonicalClientUuid(input.clientId);
    const result = await supabase
      .from("clients")
      .select("id, reference_code, profile_id")
      .or(`reference_code.eq.${input.clientId},id.eq.${clientUuid}`)
      .maybeSingle();

    if (result.error) {
      throw new QueueServiceError("Unable to resolve the selected client.", 500);
    }

    if (!result.data) {
      throw new QueueServiceError("The selected client could not be found.", 404);
    }

    const profileResult = await supabase
      .from("profiles")
      .select("id, email, full_name, phone")
      .eq("id", result.data.profile_id)
      .maybeSingle();

    if (profileResult.error || !profileResult.data) {
      throw new QueueServiceError("Unable to resolve the selected client profile.", 500);
    }

    return {
      clientId: result.data.id as string,
      clientReference: (result.data.reference_code as string | null) ?? input.clientId,
      profileId: profileResult.data.id as string,
      clientName: (profileResult.data.full_name as string | null) ?? input.clientName,
      clientPhone: (profileResult.data.phone as string | null) ?? input.clientPhone,
      clientEmail: (profileResult.data.email as string | null) ?? queueGuestEmail(input.clientName, input.clientPhone, input.clientEmail)
    };
  }

  const normalizedPhone = normalizePhone(input.clientPhone);
  const email = queueGuestEmail(input.clientName, input.clientPhone, input.clientEmail);
  const profileSearch = await supabase
    .from("profiles")
    .select("id, email, full_name, phone")
    .or(`email.eq.${email},phone.eq.${input.clientPhone}`);

  if (profileSearch.error) {
    throw new QueueServiceError("Unable to resolve the walk-in client profile.", 500);
  }

  const matchingProfile = (profileSearch.data ?? []).find((profile) => {
    const phone = normalizePhone((profile.phone as string | null) ?? "");
    return phone === normalizedPhone || ((profile.email as string | null) ?? "").toLowerCase() === email;
  });

  const profileId = (matchingProfile?.id as string | undefined) ?? canonicalProfileUuid(email);
  const profileResult = await supabase.from("profiles").upsert({
    id: profileId,
    role: "client_user",
    full_name: input.clientName,
    email,
    phone: input.clientPhone
  }, { onConflict: "id" });

  if (profileResult.error) {
    throw new QueueServiceError("Unable to create the walk-in client profile.", 500);
  }

  const existingClientResult = await supabase
    .from("clients")
    .select("id, reference_code, profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (existingClientResult.error) {
    throw new QueueServiceError("Unable to resolve the walk-in client record.", 500);
  }

  const clientReference = (existingClientResult.data?.reference_code as string | null) ?? `client-walkin-${randomUUID().slice(0, 8)}`;
  const clientId = (existingClientResult.data?.id as string | undefined) ?? canonicalClientUuid(clientReference);
  const clientInsert = await supabase.from("clients").upsert({
    id: clientId,
    reference_code: clientReference,
    profile_id: profileId,
    favorite_barber_id: input.preferredBarberId ? canonicalBarberUuid(input.preferredBarberId) : null,
    loyalty_points: 0,
    retention_tag: "new"
  }, { onConflict: "id" });

  if (clientInsert.error) {
    throw new QueueServiceError("Unable to create the walk-in client record.", 500);
  }

  return {
    clientId,
    clientReference,
    profileId,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    clientEmail: email
  };
}

async function loadScopedQueueDependencies(
  supabase: SupabaseClient,
  scopedLocationIds: string[]
) {
  const [locationsResult, queueResult, barbersResult, profilesResult, servicesResult, membershipsResult, statusResult, appointmentsResult] = await Promise.all([
    scopedLocationIds.length
      ? supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").in("id", scopedLocationIds)
      : supabase.from("locations").select("id, reference_code, name, neighborhood, city, state"),
    scopedLocationIds.length
      ? supabase.from("waitlist_entries").select(QUEUE_ROW_SELECT).in("shop_id", scopedLocationIds).order("created_at", { ascending: true }).limit(80)
      : supabase.from("waitlist_entries").select(QUEUE_ROW_SELECT).order("created_at", { ascending: true }).limit(80),
    supabase.from("barbers").select("id, reference_code, profile_id"),
    supabase.from("profiles").select("id, email, full_name, public_username, phone, role"),
    scopedLocationIds.length
      ? supabase.from("services").select(QUEUE_SERVICE_SELECT).in("location_id", scopedLocationIds)
      : supabase.from("services").select(QUEUE_SERVICE_SELECT),
    scopedLocationIds.length
      ? supabase.from("staff_locations").select("location_id, profile_id").in("location_id", scopedLocationIds)
      : supabase.from("staff_locations").select("location_id, profile_id"),
    supabase.from("barber_status").select("barber_reference, barber_id, current_shop_id, live_status, is_online, accepts_walk_ins, next_available_at"),
    supabase.from("appointments").select("id, reference_code").order("updated_at", { ascending: false })
  ]);

  for (const result of [locationsResult, queueResult, barbersResult, profilesResult, servicesResult, membershipsResult, statusResult, appointmentsResult]) {
    if (result.error) {
      throw new QueueServiceError("Unable to load queue operations data.", 500);
    }
  }

  const locations = (locationsResult.data ?? []) as LocationRow[];
  const queueRows = (queueResult.data ?? []) as QueueRow[];
  const barbers = (barbersResult.data ?? []) as BarberRow[];
  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const services = (servicesResult.data ?? []) as ServiceRow[];
  const memberships = (membershipsResult.data ?? []) as StaffLocationRow[];
  const statuses = (statusResult.data ?? []) as BarberStatusRow[];
  const appointmentReferences = (appointmentsResult.data ?? []) as AppointmentReferenceRow[];

  const locationReferenceById = new Map(locations.map((location) => [location.id, location.reference_code ?? location.id]));
  const locationByReference = new Map(locations.map((location) => [location.reference_code ?? location.id, location]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const barberById = new Map(barbers.map((barber) => [barber.id, barber]));
  const barberNameByReference = new Map(
    barbers.map((barber) => [barber.reference_code ?? barber.id, profileById.get(barber.profile_id)?.full_name ?? barber.reference_code ?? barber.id])
  );
  const servicesById = new Map(services.map((service) => [service.id, service]));
  const appointmentReferenceById = new Map(appointmentReferences.map((appointment) => [appointment.id, appointment.reference_code ?? appointment.id]));
  const membershipsByLocation = new Map<string, BarberRow[]>();

  for (const membership of memberships) {
    const barber = barbers.find((candidate) => candidate.profile_id === membership.profile_id);
    if (!barber) {
      continue;
    }

    const rows = membershipsByLocation.get(membership.location_id) ?? [];
    rows.push(barber);
    membershipsByLocation.set(membership.location_id, rows);
  }

  const statusByReference = new Map(statuses.map((status) => [status.barber_reference, status]));
  const clientIds = [...new Set(queueRows.map((row) => row.client_id))];
  const clientsResult = clientIds.length
    ? await supabase.from("clients").select("id, reference_code, profile_id").in("id", clientIds)
    : { data: [], error: null };

  if (clientsResult.error) {
    throw new QueueServiceError("Unable to load queue clients.", 500);
  }

  const clients = (clientsResult.data ?? []) as ClientRow[];
  const clientById = new Map(clients.map((client) => [client.id, client]));

  const barberOptions = Array.from(
    new Map(
      barbers
        .filter((barber) => {
          if (!scopedLocationIds.length) {
            return true;
          }

          return memberships.some((membership) => membership.profile_id === barber.profile_id && scopedLocationIds.includes(membership.location_id));
        })
        .map((barber) => {
          const reference = barber.reference_code ?? barber.id;
          const status = statusByReference.get(reference);
          const currentShopReference = status?.current_shop_id ? locationReferenceById.get(status.current_shop_id) ?? status.current_shop_id : null;
          const currentShop = currentShopReference ? locationByReference.get(currentShopReference) : null;

          const barberProfile = barber.profile_id ? profileById.get(barber.profile_id) : undefined;

          return [reference, {
            id: reference,
            name: barberNameByReference.get(reference) ?? reference,
            publicUsername: barberProfile?.public_username?.trim().replace(/^@+/, "") || null,
            currentShopId: currentShopReference,
            currentShopLabel: currentShop ? formatShopLabel(currentShop) : null,
            liveStatus: status?.live_status ?? "offline",
            liveStatusLabel: formatLiveStatusLabel(status?.live_status ?? "offline"),
            isOnline: status?.is_online ?? false,
            acceptsWalkIns: status?.accepts_walk_ins ?? false,
            nextAvailableAt: status?.next_available_at ?? null
          } satisfies QueueBarberOptionView] as const;
        })
    ).values()
  );

  const serviceOptions = services
    .map((service) => {
      const serviceReference = service.reference_code ?? service.id;
      const shopReference = service.shop_reference ?? locationReferenceById.get(service.location_id) ?? service.location_id;
      const rawPrice = Number(service.price);
      return {
        id: serviceReference,
        name: service.name,
        category: service.category,
        shopId: shopReference,
        priceCents: Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice * 100) : null,
        durationMinutes: Math.max(1, Math.round(service.duration_min)),
        bufferMinutes: Math.max(0, Math.round(service.buffer_min ?? 0)),
        barberReference: service.barber_reference ?? null
      } satisfies QueueServiceOptionView;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    queueRows,
    clientById,
    profileById,
    locationReferenceById,
    locationByReference,
    barberById,
    servicesById,
    membershipsByLocation,
    barberOptions,
    serviceOptions,
    appointmentReferenceById
  };
}

function buildQueueBarberCandidates(
  queueRow: QueueRow,
  dependencies: Awaited<ReturnType<typeof loadScopedQueueDependencies>>,
  shopReference: string
) {
  const location = dependencies.locationByReference.get(shopReference);
  if (!location) {
    return [] as QueueBarberCandidate[];
  }

  const eligibleBarbers = dependencies.membershipsByLocation.get(location.id) ?? [];
  const service = queueRow.service_id ? dependencies.servicesById.get(queueRow.service_id) : null;

  return eligibleBarbers.map((barber) => {
    const barberReference = barber.reference_code ?? barber.id;
    const option = dependencies.barberOptions.find((candidate) => candidate.id === barberReference);
    const supportsRequestedService = !service
      ? true
      : !service.barber_reference || service.barber_reference === barberReference || service.barber_reference === barber.id;

    return {
      barberId: barberReference,
      barberName: option?.name ?? barberReference,
      currentShopId: option?.currentShopId,
      liveStatus: option?.liveStatus ?? "offline",
      isOnline: option?.isOnline ?? false,
      acceptsWalkIns: option?.acceptsWalkIns ?? false,
      nextAvailableAt: option?.nextAvailableAt ?? null,
      supportsRequestedService,
      preferredMatch: Boolean(queueRow.barber_preference && queueRow.barber_preference === barber.id)
    } satisfies QueueBarberCandidate;
  });
}

function mapQueueRowToView(
  queueRow: QueueRow,
  dependencies: Awaited<ReturnType<typeof loadScopedQueueDependencies>>
): QueueEntryView {
  const client = dependencies.clientById.get(queueRow.client_id);
  const clientProfile = client ? dependencies.profileById.get(client.profile_id) : null;
  const service = queueRow.service_id ? dependencies.servicesById.get(queueRow.service_id) : null;
  const shopReference = dependencies.locationReferenceById.get(queueRow.shop_id ?? queueRow.location_id) ?? queueRow.shop_id ?? queueRow.location_id;
  const shop = dependencies.locationByReference.get(shopReference);
  const assignedBarberReference = queueRow.barber_id ? dependencies.barberById.get(queueRow.barber_id)?.reference_code ?? queueRow.barber_id : undefined;
  const preferredBarberReference = queueRow.barber_preference ? dependencies.barberById.get(queueRow.barber_preference)?.reference_code ?? queueRow.barber_preference : undefined;
  const bestAvailableBarber = pickBestQueueBarber(buildQueueBarberCandidates(queueRow, dependencies, shopReference));
  const ownership = resolveQueueAssignmentLock({
    entryType: queueRow.entry_type,
    paymentOwner: queueRow.payment_owner
  });

  return {
    id: queueRow.id,
    clientId: client?.reference_code ?? queueRow.client_id,
    clientName: clientProfile?.full_name ?? client?.reference_code ?? queueRow.client_id,
    clientPhone: clientProfile?.phone ?? "",
    clientEmail: clientProfile?.email ?? "",
    shopId: shopReference,
    shopLabel: shop ? formatShopLabel(shop) : shopReference,
    serviceId: service?.reference_code ?? service?.id ?? undefined,
    serviceName: service?.name ?? queueRow.source_service_name ?? "Service to be selected",
    preferredBarberId: preferredBarberReference,
    preferredBarberName: preferredBarberReference ? dependencies.barberOptions.find((barber) => barber.id === preferredBarberReference)?.name : undefined,
    assignedBarberId: assignedBarberReference,
    assignedBarberName: assignedBarberReference ? dependencies.barberOptions.find((barber) => barber.id === assignedBarberReference)?.name : undefined,
    bestAvailableBarber: bestAvailableBarber ? {
      barberId: bestAvailableBarber.barberId,
      barberName: bestAvailableBarber.barberName,
      nextAvailableAt: bestAvailableBarber.nextAvailableAt ?? null,
      liveStatusLabel: formatLiveStatusLabel(bestAvailableBarber.liveStatus)
    } : undefined,
    preferredDate: queueRow.preferred_date ?? undefined,
    preferredStartTime: queueRow.preferred_start_time ?? undefined,
    preferredEndTime: queueRow.preferred_end_time ?? undefined,
    flexibilityMinutes: queueRow.flexibility_minutes ?? 0,
    queueSource: queueRow.queue_source ?? "walk_in",
    entryType: queueRow.entry_type,
    sourceProvider: queueRow.source_provider,
    paymentOwner: queueRow.payment_owner,
    assignmentLocked: queueRow.assignment_locked,
    reassignable: ownership.reassignable,
    position: queueRow.canonical_position,
    estimatedWaitMinutes: queueRow.estimated_wait_minutes,
    waitReason: queueRow.wait_reason ?? undefined,
    waitVersion: queueRow.wait_version,
    publicState: queueRow.public_queue_state,
    readyGraceExpiresAt: queueRow.ready_grace_expires_at ?? undefined,
    lastSyncedAt: queueRow.last_synced_at,
    chairsyncAppointmentId: queueRow.chairsync_appointment_id ?? undefined,
    operationalSmsConsent: queueRow.operational_sms_consent,
    rejoinOfEntryId: queueRow.rejoin_of_entry_id ?? undefined,
    status: queueRow.status,
    statusLabel: getQueueStatusLabel(queueRow.status),
    statusReason: queueRow.status_reason ?? undefined,
    notes: queueRow.notes ?? undefined,
    createdAt: queueRow.created_at,
    calledAt: queueRow.called_at ?? undefined,
    assignedAt: queueRow.assigned_at ?? undefined,
    convertedAppointmentId: queueRow.converted_appointment_id ? dependencies.appointmentReferenceById.get(queueRow.converted_appointment_id) ?? queueRow.converted_appointment_id : undefined,
    waitMinutes: queueRow.estimated_wait_minutes ?? 0
  };
}

async function loadQueueRowOrThrow(supabase: SupabaseClient, entryId: string) {
  const result = await supabase
    .from("waitlist_entries")
    .select(QUEUE_ROW_SELECT)
    .eq("id", entryId)
    .maybeSingle();

  if (result.error) {
    throw new QueueServiceError("Unable to load the requested queue entry.", 500);
  }

  if (!result.data) {
    throw new QueueServiceError("Queue entry not found.", 404);
  }

  return result.data as QueueRow;
}

async function getQueuePayloadInternal(scope: QueueScopeContext, supabase: SupabaseClient): Promise<QueueWorkspacePayload> {
  if (!scope.scopedLocationIds.length) {
    return {
      summary: {
        activeCount: 0,
        calledCount: 0,
        assignedCount: 0,
        averageWaitMinutes: 0
      },
      shops: [],
      barbers: [],
      services: [],
      entries: [],
      recentResolvedEntries: []
    };
  }

  const dependencies = await loadScopedQueueDependencies(supabase, scope.scopedLocationIds);
  const entries = sortQueueEntries(
    dependencies.queueRows
      .filter((row) => row.status === "active" || row.status === "called" || row.status === "assigned")
      .map((row) => mapQueueRowToView(row, dependencies))
  );
  const recentResolvedEntries = [...dependencies.queueRows]
    .filter((row) => row.status === "converted" || row.status === "cancelled" || row.status === "expired" || row.status === "no_show")
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 10)
    .map((row) => mapQueueRowToView(row, dependencies));

  return {
    summary: {
      activeCount: entries.filter((entry) => entry.status === "active").length,
      calledCount: entries.filter((entry) => entry.status === "called").length,
      assignedCount: entries.filter((entry) => entry.status === "assigned").length,
      averageWaitMinutes: entries.length ? Math.round(entries.reduce((sum, entry) => sum + (entry.estimatedWaitMinutes ?? 0), 0) / entries.length) : 0
    },
    shops: scope.scopedLocations.map((location) => ({
      id: location.reference_code ?? location.id,
      label: formatShopLabel(location)
    })),
    barbers: dependencies.barberOptions.sort((left, right) => left.name.localeCompare(right.name)),
    services: dependencies.serviceOptions.filter((service) => !scope.scopedLocationReferences.length || scope.scopedLocationReferences.includes(service.shopId)),
    entries,
    recentResolvedEntries
  };
}

async function createQueueEntryInternal(
  supabase: SupabaseClient,
  scope: QueueScopeContext,
  normalized: ReturnType<typeof normalizeQueueCreateInput>,
  options: {
    requestedPreferredBarberId?: string;
    createdByProfileId?: string | null;
  } = {}
) {
  const location = await resolveLocationByReference(supabase, normalized.shopId);
  let service: ServiceRow | null = null;
  if (normalized.serviceId) {
    const resolvedService = await resolveServiceByReference(supabase, normalized.serviceId);
    const serviceShopReference = resolvedService.shop_reference
      ?? scope.scopedLocationReferences.find((reference) => canonicalLocationUuid(reference) === resolvedService.location_id)
      ?? normalized.shopId;
    if (resolvedService.location_id !== location.id && serviceShopReference !== normalized.shopId) {
      throw new QueueServiceError("The requested service is not available at this shop.", 409);
    }
    service = resolvedService;
  }

  let preferredBarber: BarberRow | null = null;
  if (options.requestedPreferredBarberId) {
    preferredBarber = await resolveBarberByReference(supabase, options.requestedPreferredBarberId);
    await assertBarberInShop(supabase, preferredBarber, location.id);
    if (service && service.barber_reference && service.barber_reference !== (preferredBarber.reference_code ?? preferredBarber.id) && service.barber_reference !== preferredBarber.id) {
      throw new QueueServiceError("The preferred barber is not eligible for the requested service.", 409);
    }
  }

  const idempotencyPayloadHash = normalized.idempotencyKey
    ? queueIdempotencyPayloadHash({
      locationId: location.id,
      clientPhone: normalized.clientPhone,
      serviceId: service?.id ?? null,
      preferredBarberId: preferredBarber?.id ?? null,
      entryType: normalized.entryType,
      sourceProvider: normalized.sourceProvider,
      paymentOwner: normalized.paymentOwner,
      chairsyncAppointmentId: normalized.chairsyncAppointmentId ?? null
    })
    : null;
  const publicQueueToken = normalized.idempotencyKey
    ? createHash("sha256").update(`${normalized.idempotencyKey}:public-queue-token`).digest("hex")
    : createHash("sha256").update(`${randomUUID()}:${Date.now()}`).digest("hex");
  const publicQueueTokenHash = createHash("sha256").update(publicQueueToken).digest("hex");

  if (normalized.idempotencyKey) {
    const existingIdempotencyResult = await supabase
      .from("waitlist_entries")
      .select("id, idempotency_payload_hash")
      .eq("location_id", location.id)
      .eq("idempotency_key", normalized.idempotencyKey)
      .maybeSingle();

    if (existingIdempotencyResult.error) {
      throw new QueueServiceError("Unable to verify this queue request safely.", 500);
    }
    if (existingIdempotencyResult.data) {
      if (existingIdempotencyResult.data.idempotency_payload_hash !== idempotencyPayloadHash) {
        throw new QueueServiceError("This queue request key was already used for a different entry.", 422);
      }
      const existingEntryId = existingIdempotencyResult.data.id;
      const payload = await getQueuePayloadInternal(scope, supabase);
      const entry = [...payload.entries, ...payload.recentResolvedEntries]
        .find((candidate) => candidate.id === existingEntryId);
      if (!entry) {
        throw new QueueServiceError("The existing queue entry could not be read back.", 500);
      }
      return { entry, duplicate: true, publicQueueToken };
    }
  }

  const client = await resolveOrCreateQueueClient(supabase, {
    clientName: normalized.clientName,
    clientPhone: normalized.clientPhone,
    clientEmail: normalized.clientEmail,
    preferredBarberId: preferredBarber?.reference_code ?? preferredBarber?.id
  });

  const existingLiveResult = await supabase
    .from("waitlist_entries")
    .select("id")
    .eq("location_id", location.id)
    .eq("client_id", client.clientId)
    .in("status", ["active", "called", "assigned"])
    .limit(1)
    .maybeSingle();
  if (existingLiveResult.error) {
    throw new QueueServiceError("Unable to verify whether this client is already in line.", 500);
  }
  if (existingLiveResult.data) {
    const existingEntryId = existingLiveResult.data.id;
    const payload = await getQueuePayloadInternal(scope, supabase);
    const entry = payload.entries.find((candidate) => candidate.id === existingEntryId);
    if (!entry) {
      throw new QueueServiceError("The existing live queue entry could not be read back.", 500);
    }
    return { entry, duplicate: true, publicQueueToken: null };
  }

  const now = new Date().toISOString();
  const insertResult = await supabase
    .from("waitlist_entries")
    .insert({
      location_id: location.id,
      shop_id: location.id,
      client_id: client.clientId,
      service_id: service?.id ?? null,
      barber_id: normalized.entryType === "booked" ? preferredBarber?.id ?? null : null,
      barber_preference: preferredBarber?.id ?? null,
      requested_date: normalized.preferredDate ?? now.slice(0, 10),
      preferred_date: normalized.preferredDate ?? now.slice(0, 10),
      preferred_start_time: normalized.preferredStartTime ?? null,
      preferred_end_time: normalized.preferredEndTime ?? null,
      flexibility_minutes: normalized.flexibilityMinutes,
      queue_source: normalized.queueSource,
      idempotency_key: normalized.idempotencyKey ?? null,
      idempotency_payload_hash: idempotencyPayloadHash,
      entry_type: normalized.entryType,
      source_provider: normalized.sourceProvider,
      payment_owner: normalized.paymentOwner,
      public_token_hash: publicQueueTokenHash,
      chairsync_appointment_id: normalized.chairsyncAppointmentId
        ? normalized.chairsyncAppointmentId
        : null,
      source_service_name: normalized.sourceServiceName ?? null,
      operational_sms_consent: normalized.operationalSmsConsent ?? false,
      rejoin_of_entry_id: normalized.rejoinOfEntryId ?? null,
      notes: normalized.notes ?? null,
      status_reason: null,
      status: normalized.entryType === "booked" && preferredBarber ? "assigned" : "active",
      assigned_at: normalized.entryType === "booked" && preferredBarber ? now : null,
      created_by: options.createdByProfileId ?? null,
      last_mutated_by: options.createdByProfileId ?? null,
      last_mutation_reason: normalized.rejoinOfEntryId
        ? "Client rejoined after a missed or canceled queue visit"
        : "Queue entry created after server confirmation",
      created_at: now,
      updated_at: now
    })
    .select("id")
    .single();

  if (insertResult.error) {
    throw new QueueServiceError("Unable to add the walk-in to the queue.", 500);
  }

  const payload = await getQueuePayloadInternal(scope, supabase);
  const entry = payload.entries.find((candidate) => candidate.id === insertResult.data.id);
  if (!entry) {
    throw new QueueServiceError("The queue entry was created but could not be read back.", 500);
  }

  return { entry, duplicate: false, publicQueueToken };
}

export async function getQueueWorkspacePayload(user: UserAccount) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertQueueManagerRole(actor.user);
  return getQueuePayloadInternal(actor, supabase);
}

export async function getQueueWorkspacePayloadForShops(shopIds: string[]) {
  const supabase = getSupabaseOrThrow();
  const scope = await resolveQueueScopeByShopReferences(supabase, shopIds);
  return getQueuePayloadInternal(scope, supabase);
}

export async function createQueueEntry(
  user: UserAccount,
  input: QueueCreateInput
) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  const normalized = normalizeQueueCreateInput(input);
  assertLocationScope(actor, normalized.shopId);

  const requestedPreferredBarberId = isBarberQueueOperator(actor.user.role)
    ? actor.user.barberId ?? normalized.preferredBarberId
    : normalized.preferredBarberId;

  if (
    isBarberQueueOperator(actor.user.role)
    && normalized.preferredBarberId
    && actor.user.barberId
    && normalized.preferredBarberId !== actor.user.barberId
  ) {
    throw new QueueServiceError("Barbers can only create walk-ins for their own chair.", 403);
  }

  return createQueueEntryInternal(supabase, actor, normalized, {
    requestedPreferredBarberId,
    createdByProfileId: actor.profile.id
  });
}

export async function createKioskQueueEntry(input: QueueCreateInput) {
  const supabase = getSupabaseOrThrow();
  const normalized = normalizeQueueCreateInput({
    ...input,
    queueSource: "kiosk"
  });
  const scope = await resolveQueueScopeByShopReferences(supabase, [normalized.shopId]);

  return createQueueEntryInternal(supabase, scope, normalized, {
    requestedPreferredBarberId: normalized.preferredBarberId,
    createdByProfileId: null
  });
}

export async function callQueueEntry(user: UserAccount, entryId: string) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertQueueManagerRole(actor.user);
  const entry = await loadQueueRowOrThrow(supabase, entryId);
  const scopedLocation = actor.scopedLocations.find((location) => location.id === (entry.shop_id ?? entry.location_id));
  if (scopedLocation) {
    assertLocationScope(actor, scopedLocation.reference_code ?? scopedLocation.id);
  }
  assertQueueStatusTransition(entry.status, "called");

  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("waitlist_entries")
    .update({
      status: "called",
      public_queue_state: "almost_ready",
      called_at: now,
      last_mutated_by: actor.profile.id,
      last_mutation_reason: "Client marked almost ready by the shop floor",
      updated_at: now
    })
    .eq("id", entryId);

  if (updateResult.error) {
    throw new QueueServiceError("Unable to mark the queue entry as called.", 500);
  }

  const payload = await getQueuePayloadInternal(actor, supabase);
  const updatedEntry = payload.entries.find((candidate) => candidate.id === entryId);
  if (!updatedEntry) {
    throw new QueueServiceError("The queue entry was updated but could not be read back.", 500);
  }

  return { entry: updatedEntry };
}

export async function assignQueueEntry(
  user: UserAccount,
  input: {
    entryId: string;
    barberId?: string;
  }
) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertQueueManagerRole(actor.user);
  const entry = await loadQueueRowOrThrow(supabase, input.entryId);
  const scopedLocation = actor.scopedLocations.find((location) => location.id === (entry.shop_id ?? entry.location_id));
  const shopReference = scopedLocation?.reference_code ?? scopedLocation?.id ?? actor.scopedLocationReferences[0];
  if (shopReference) {
    assertLocationScope(actor, shopReference);
  }
  assertQueueStatusTransition(entry.status, "assigned");

  const dependencies = await loadScopedQueueDependencies(supabase, actor.scopedLocationIds);
  const selectedBarberReference = input.barberId
    ?? pickBestQueueBarber(buildQueueBarberCandidates(entry, dependencies, shopReference))?.barberId;

  if (!selectedBarberReference) {
    throw new QueueServiceError("No eligible barber is available to take this queue entry yet.", 409);
  }

  const barber = await resolveBarberByReference(supabase, selectedBarberReference);
  await assertBarberInShop(supabase, barber, entry.shop_id ?? entry.location_id);

  const option = dependencies.barberOptions.find((candidate) => candidate.id === (barber.reference_code ?? barber.id));
  if (option && (!option.isOnline || option.liveStatus === "offline")) {
    throw new QueueServiceError("This barber is offline and cannot be assigned a live walk-in.", 409);
  }

  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("waitlist_entries")
    .update({
      barber_id: barber.id,
      status: "assigned",
      public_queue_state: "ready",
      ready_grace_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      assigned_at: now,
      last_mutated_by: actor.profile.id,
      last_mutation_reason: "Chair assigned and client marked ready",
      updated_at: now
    })
    .eq("id", input.entryId);

  if (updateResult.error) {
    throw new QueueServiceError("Unable to assign the queue entry to a barber.", 500);
  }

  const payload = await getQueuePayloadInternal(actor, supabase);
  const updatedEntry = payload.entries.find((candidate) => candidate.id === input.entryId);
  if (!updatedEntry) {
    throw new QueueServiceError("The queue assignment completed but could not be read back.", 500);
  }

  return { entry: updatedEntry };
}

export async function convertQueueEntry(
  user: UserAccount,
  input: {
    entryId: string;
    barberId?: string;
    serviceId?: string;
    appointmentTime?: string;
  }
) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  const queueRow = await loadQueueRowOrThrow(supabase, input.entryId);
  if (!["active", "called", "assigned"].includes(queueRow.status)) {
    throw new QueueServiceError("Only active, called, or assigned queue entries can convert into appointments.", 409);
  }

  const scopedLocation = actor.scopedLocations.find((location) => location.id === (queueRow.shop_id ?? queueRow.location_id));
  const shopReference = scopedLocation?.reference_code ?? scopedLocation?.id ?? actor.scopedLocationReferences[0];
  if (shopReference) {
    assertLocationScope(actor, shopReference);
  }

  const dependencies = await loadScopedQueueDependencies(supabase, actor.scopedLocationIds);
  const selectedServiceReference = input.serviceId
    ?? (queueRow.service_id ? dependencies.servicesById.get(queueRow.service_id)?.reference_code ?? queueRow.service_id : undefined);

  if (!selectedServiceReference) {
    throw new QueueServiceError("Choose a service before converting this queue entry into an appointment.", 409);
  }

  const service = await resolveServiceByReference(supabase, selectedServiceReference);
  if (
    isBarberQueueOperator(actor.user.role)
    && input.barberId
    && actor.user.barberId
    && input.barberId !== actor.user.barberId
  ) {
    throw new QueueServiceError("Barbers can only convert walk-ins into their own chair schedule.", 403);
  }

  const chosenBarberReference = isBarberQueueOperator(actor.user.role)
    ? actor.user.barberId
    : input.barberId
      ?? (queueRow.barber_id ? dependencies.barberById.get(queueRow.barber_id)?.reference_code ?? queueRow.barber_id : undefined)
      ?? pickBestQueueBarber(buildQueueBarberCandidates({ ...queueRow, service_id: service.id }, dependencies, shopReference))?.barberId;

  if (!chosenBarberReference) {
    throw new QueueServiceError("No eligible barber is currently ready to convert this walk-in into an appointment.", 409);
  }

  const barber = await resolveBarberByReference(supabase, chosenBarberReference);
  await assertBarberInShop(supabase, barber, queueRow.shop_id ?? queueRow.location_id);
  const client = dependencies.clientById.get(queueRow.client_id);
  const clientProfile = client ? dependencies.profileById.get(client.profile_id) : null;

  if (!client || !clientProfile) {
    throw new QueueServiceError("The queue entry is missing its client relationship.", 500);
  }

  const appointmentTime = input.appointmentTime ?? (
    await findCanonicalBookableSlot(supabase, barber.reference_code ?? barber.id, {
      serviceId: service.reference_code ?? service.id,
      preferredLocationId: shopReference,
      earliestAt: new Date().toISOString()
    })
  )?.slot.startsAt;

  if (!appointmentTime) {
    throw new QueueServiceError("No safe slot is available to convert this queue entry right now.", 409);
  }

  const liveProvider = await getLiveOperationsProvider();
  const actorRole = toLifecycleActorRole(actor.user.role);
  if (!actorRole) {
    throw new QueueServiceError("This account cannot perform queue conversions.", 403);
  }

  const bookingResult = await liveProvider.createBooking({
    locationId: shopReference,
    barberId: barber.reference_code ?? barber.id,
    serviceId: service.reference_code ?? service.id,
    addOnIds: [],
    appointmentTime,
    clientName: clientProfile.full_name ?? client.reference_code ?? queueRow.client_id,
    clientPhone: clientProfile.phone ?? "",
    clientId: client.reference_code ?? queueRow.client_id,
    actorRole,
    actorEmail: actor.user.email,
    bookingSource: "walk_in_queue",
    source: "walk_in",
    createdBy: actor.profile.id,
    internalNotes: queueRow.notes ?? undefined
  });

  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("waitlist_entries")
    .update({
      barber_id: barber.id,
      service_id: service.id,
      status: "converted",
      public_queue_state: "done",
      converted_appointment_id: canonicalAppointmentUuid(bookingResult.appointment.id),
      converted_at: now,
      completed_at: now,
      last_mutated_by: actor.profile.id,
      last_mutation_reason: "Queue visit converted into a canonical appointment",
      updated_at: now
    })
    .eq("id", input.entryId);

  if (updateResult.error) {
    throw new QueueServiceError("The appointment was created but the queue entry could not be marked as converted.", 500);
  }

  const payload = await getQueuePayloadInternal(actor, supabase);
  const updatedEntry = payload.recentResolvedEntries.find((candidate) => candidate.id === input.entryId);
  if (!updatedEntry) {
    throw new QueueServiceError("The queue conversion completed but could not be read back.", 500);
  }

  return {
    entry: updatedEntry,
    appointment: bookingResult.appointment
  };
}

export async function cancelQueueEntry(
  user: UserAccount,
  input: {
    entryId: string;
    reason?: string;
  }
) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertQueueManagerRole(actor.user);
  const entry = await loadQueueRowOrThrow(supabase, input.entryId);
  const scopedLocation = actor.scopedLocations.find((location) => location.id === (entry.shop_id ?? entry.location_id));
  if (scopedLocation) {
    assertLocationScope(actor, scopedLocation.reference_code ?? scopedLocation.id);
  }
  assertQueueStatusTransition(entry.status, "cancelled");

  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("waitlist_entries")
    .update({
      status: "cancelled",
      public_queue_state: "canceled",
      status_reason: input.reason?.trim() || null,
      cancelled_at: now,
      last_mutated_by: actor.profile.id,
      last_mutation_reason: input.reason?.trim() || "Queue visit canceled by the shop floor",
      updated_at: now
    })
    .eq("id", input.entryId);

  if (updateResult.error) {
    throw new QueueServiceError("Unable to cancel the queue entry.", 500);
  }

  const payload = await getQueuePayloadInternal(actor, supabase);
  const updatedEntry = payload.recentResolvedEntries.find((candidate) => candidate.id === input.entryId);
  if (!updatedEntry) {
    throw new QueueServiceError("The queue cancellation completed but could not be read back.", 500);
  }

  return { entry: updatedEntry };
}

export async function reassignQueueEntry(
  user: UserAccount,
  input: {
    entryId: string;
    barberId: string;
    reason: string;
  }
) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertQueueManagerRole(actor.user);
  const entry = await loadQueueRowOrThrow(supabase, input.entryId);
  const scopedLocation = actor.scopedLocations.find((location) => location.id === (entry.shop_id ?? entry.location_id));
  if (scopedLocation) {
    assertLocationScope(actor, scopedLocation.reference_code ?? scopedLocation.id);
  }
  if (entry.status !== "assigned" || !entry.barber_id) {
    throw new QueueServiceError("Only an assigned live queue entry can be reassigned.", 409);
  }

  const lock = resolveQueueAssignmentLock({
    entryType: entry.entry_type,
    paymentOwner: entry.payment_owner
  });
  if (!lock.reassignable) {
    throw new QueueServiceError(lock.reason ?? "This queue assignment is locked.", 409);
  }
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new QueueServiceError("Cash walk-in reassignment requires an audit reason.", 400);
  }

  const barber = await resolveBarberByReference(supabase, input.barberId);
  await assertBarberInShop(supabase, barber, entry.shop_id ?? entry.location_id);
  if (barber.id === entry.barber_id) {
    throw new QueueServiceError("Choose a different barber for reassignment.", 409);
  }

  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("waitlist_entries")
    .update({
      barber_id: barber.id,
      reassigned_barber_id: barber.id,
      public_queue_state: "reassigned",
      status_reason: reason,
      last_mutated_by: actor.profile.id,
      last_mutation_reason: reason,
      updated_at: now
    })
    .eq("id", input.entryId);

  if (updateResult.error) {
    const message = updateResult.error.message?.toLowerCase().includes("locked")
      ? "Booked or non-cash queue entries are locked to their barber."
      : "Unable to reassign this cash walk-in.";
    throw new QueueServiceError(message, updateResult.error.code === "23514" ? 409 : 500);
  }

  const payload = await getQueuePayloadInternal(actor, supabase);
  const updatedEntry = payload.entries.find((candidate) => candidate.id === input.entryId);
  if (!updatedEntry) {
    throw new QueueServiceError("The reassignment completed but could not be read back.", 500);
  }
  return { entry: updatedEntry };
}
