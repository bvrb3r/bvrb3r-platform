import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Client, WalkInEntry } from "@/types/domain";
import type {
  CompensationSnapshotRecord,
  OwnerAnalyticsSnapshotRecord,
  WorkflowEventRecord
} from "@/lib/operations/persistence";
import type { LiveAppointmentRecord, LiveOperationsSnapshot } from "@/lib/operations/live-state";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type CanonicalClientProfile = {
  clientReference: string;
  fullName: string;
  phone: string;
  email: string;
  favoriteBarberReference?: string;
  loyaltyPoints: number;
  retentionTag: Client["retentionTag"];
  notes: string[];
};

type CanonicalWorkingHoursRow = {
  barber_reference: string;
  shop_reference: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type CanonicalAppointmentServiceSnapshotRow = {
  appointment_reference: string;
  service_reference: string;
  service_name: string;
  category: string;
  description: string | null;
  duration_min: number;
  buffer_min: number;
  price: number | string;
  deposit_amount: number | string;
  full_prepay_required: boolean;
  add_on_references: string[] | null;
};

type CanonicalReferenceRow = {
  id: string;
  reference_code: string | null;
};

type CanonicalServiceReferenceRow = CanonicalReferenceRow & {
  name: string;
};

type CanonicalProfileRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
};

type CanonicalClientRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
  favorite_barber_id: string | null;
  loyalty_points: number | null;
  retention_tag: string | null;
};

type CanonicalAppointmentRow = {
  id: string;
  reference_code: string | null;
  location_id: string;
  shop_id: string | null;
  barber_id: string;
  client_id: string;
  service_id: string;
  status: LiveAppointmentRecord["status"];
  source: LiveAppointmentRecord["source"];
  confirmation_code: string | null;
  membership_id: string | null;
  booking_source: string | null;
  starts_at: string;
  ends_at: string;
  checked_in_at: string | null;
  service_started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  chair_label: string | null;
  add_on_references: string[] | null;
  deposit_amount: number | string | null;
  service_total: number | string | null;
  add_on_total: number | string | null;
  subtotal: number | string | null;
  discount_total: number | string | null;
  tax_total: number | string | null;
  total_amount: number | string | null;
  grand_total: number | string | null;
  balance_due: number | string | null;
  tip_amount: number | string | null;
  client_note: string | null;
  notes: string | null;
  internal_notes: string | null;
  created_by: string | null;
  lifecycle_revision: number | null;
  last_actor_role: LiveAppointmentRecord["lastActorRole"] | null;
  last_event_type: LiveAppointmentRecord["lastEventType"] | null;
  checkout_reference: string | null;
  updated_at: string | null;
};

type CanonicalWalkInRow = {
  id: string;
  reference_code: string | null;
  location_id: string;
  client_id: string | null;
  client_name: string;
  requested_service: string;
  requested_at: string;
  status: WalkInEntry["status"];
  assigned_barber_id: string | null;
  position: number | null;
  wait_minutes: number | null;
  updated_at: string | null;
};

type CanonicalQueueRow = {
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
  queue_source: string | null;
  notes: string | null;
  status_reason: string | null;
  status: WalkInEntry["status"];
  created_at: string;
  called_at: string | null;
  assigned_at: string | null;
  converted_appointment_id: string | null;
  converted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string | null;
};

type WorkflowEventRow = {
  appointment_reference: string;
  location_reference: string;
  barber_reference: string;
  barber_user_reference: string;
  barber_email: string;
  client_reference: string;
  client_email: string;
  actor_role: string;
  event_type: WorkflowEventRecord["eventType"];
  title: string;
  detail: string;
  event_payload: WorkflowEventRecord["eventPayload"];
  created_at: string;
};

type CompensationSnapshotRow = {
  appointment_reference: string;
  location_reference: string;
  barber_reference: string;
  barber_user_reference: string;
  barber_email: string;
  client_reference: string;
  client_email: string;
  compensation_model: CompensationSnapshotRecord["compensationModel"];
  business_date: string;
  gross_service_amount: number | string;
  deposit_amount: number | string;
  collected_amount: number | string;
  tip_amount: number | string;
  commission_rate: number | string | null;
  commission_amount: number | string;
  booth_rent_amount: number | string | null;
  booth_rent_period_label: string | null;
  rent_coverage_amount: number | string | null;
  checkout_reference: string | null;
  captured_at: string;
};

type OwnerAnalyticsRow = {
  location_reference: string;
  business_date: string;
  booked_count: number;
  completed_services_count: number;
  paid_appointments_count: number;
  revenue_total: number | string;
  tip_total: number | string;
  outstanding_balance: number | string;
  updated_at: string;
};

const LOCATION_ID_MAP: Record<string, string> = {
  "loc-ybor": "11111111-1111-1111-1111-111111111111",
  "loc-hyde": "22222222-2222-2222-2222-222222222222"
};

const SERVICE_ID_MAP: Record<string, string> = {
  "srv-signature": "33333333-3333-3333-3333-333333333331",
  "srv-razor": "33333333-3333-3333-3333-333333333332",
  "srv-color": "33333333-3333-3333-3333-333333333333"
};

function stableUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex");
  const base = hash.slice(0, 32).split("");
  base[12] = "5";
  base[16] = ((parseInt(base[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${base.slice(0, 8).join("")}-${base.slice(8, 12).join("")}-${base.slice(12, 16).join("")}-${base.slice(16, 20).join("")}-${base.slice(20, 32).join("")}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function canonicalLocationUuid(reference: string) {
  if (isUuid(reference)) {
    return reference;
  }

  return LOCATION_ID_MAP[reference] ?? stableUuid(`location:${reference}`);
}

export function canonicalServiceUuid(reference: string) {
  if (isUuid(reference)) {
    return reference;
  }

  return SERVICE_ID_MAP[reference] ?? stableUuid(`service:${reference}`);
}

export function canonicalBarberUuid(reference: string) {
  if (isUuid(reference)) {
    return reference;
  }

  return stableUuid(`barber:${reference}`);
}

export function canonicalClientUuid(reference: string) {
  if (isUuid(reference)) {
    return reference;
  }

  return stableUuid(`client:${reference}`);
}

export function canonicalProfileUuid(email: string) {
  return stableUuid(`profile:${email.toLowerCase()}`);
}

export function canonicalAppointmentUuid(reference: string) {
  return stableUuid(`appointment:${reference}`);
}

async function resolveCanonicalBarberId(supabase: SupabaseClient, barberReference: string) {
  if (isUuid(barberReference)) {
    return barberReference;
  }

  const result = await supabase
    .from("barbers")
    .select("id")
    .eq("reference_code", barberReference)
    .maybeSingle();

  if (!result.error && result.data?.id) {
    return result.data.id as string;
  }

  return canonicalBarberUuid(barberReference);
}

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function toRetentionTag(value: string | null | undefined): Client["retentionTag"] {
  return value === "vip" || value === "repeat" || value === "lapsed" ? value : "new";
}

declare global {
  var __bvrb3rCanonicalSeedPromise: Promise<void> | undefined;
}

export async function ensureCanonicalBookingData(supabase: SupabaseClient) {
  void supabase;
  globalThis.__bvrb3rCanonicalSeedPromise = Promise.resolve();
  return globalThis.__bvrb3rCanonicalSeedPromise;
}

export async function readCanonicalClientProfile(supabase: SupabaseClient, clientReference?: string) {
  if (!clientReference) {
    return undefined;
  }

  await ensureCanonicalBookingData(supabase);
  const canonicalClientId = canonicalClientUuid(clientReference);
  const clientResult = await supabase.from("clients").select("*").eq("id", canonicalClientId).maybeSingle();
  let clientRow = clientResult.data;
  let clientError = clientResult.error;

  if (!clientRow && !clientError) {
    const referenceResult = await supabase
      .from("clients")
      .select("*")
      .eq("reference_code", clientReference)
      .order("created_at", { ascending: true })
      .limit(1);

    clientRow = referenceResult.data?.[0] ?? null;
    clientError = referenceResult.error;
  }

  if (clientError || !clientRow) {
    return undefined;
  }

  const profileResult = await supabase.from("profiles").select("*").eq("id", clientRow.profile_id).maybeSingle();
  if (profileResult.error || !profileResult.data) {
    return undefined;
  }

  const favoriteResult = clientRow.favorite_barber_id
    ? await supabase.from("barbers").select("reference_code").eq("id", clientRow.favorite_barber_id).maybeSingle()
    : { data: null, error: null };

  return {
    clientReference: clientRow.reference_code ?? clientReference,
    fullName: profileResult.data.full_name,
    phone: profileResult.data.phone ?? "",
    email: profileResult.data.email ?? "",
    favoriteBarberReference: favoriteResult.data?.reference_code ?? undefined,
    loyaltyPoints: clientRow.loyalty_points ?? 0,
    retentionTag: toRetentionTag(clientRow.retention_tag),
    notes: []
  } satisfies CanonicalClientProfile;
}

export async function readCanonicalWorkingHours(supabase: SupabaseClient, barberReference: string, shopReference?: string) {
  await ensureCanonicalBookingData(supabase);
  const barberId = await resolveCanonicalBarberId(supabase, barberReference);
  const barberLookupValues = [...new Set([barberId, barberReference])];
  const shopLookupValues = shopReference
    ? [...new Set([canonicalLocationUuid(shopReference), shopReference])]
    : [];
  const readByBarberId = async (value: string) => {
    let query = supabase.from("availability_rules").select("*").eq("barber_id", value);
    if (shopLookupValues.length) {
      query = query.in("location_id", shopLookupValues);
    }
    return query.order("weekday");
  };

  let result = await readByBarberId(barberId);
  if (!result.error && !(result.data ?? []).length && barberReference !== barberId) {
    result = await readByBarberId(barberReference);
  }
  if (!result.error && (result.data ?? []).length) {
    return ((result.data ?? []) as Array<{ weekday: number; start_time: string; end_time: string }>).map((row) => ({
      barber_reference: barberReference,
      shop_reference: shopReference ?? "",
      weekday: row.weekday,
      start_time: row.start_time,
      end_time: row.end_time
    }));
  }

  let legacyQuery = supabase
    .from("barber_working_hours")
    .select("barber_reference, shop_reference, weekday, start_time, end_time")
    .in("barber_reference", barberLookupValues);
  if (shopLookupValues.length) {
    legacyQuery = legacyQuery.in("shop_reference", shopLookupValues);
  }
  const legacyResult = await legacyQuery.order("weekday");
  if (legacyResult.error) {
    return [] as CanonicalWorkingHoursRow[];
  }

  return ((legacyResult.data ?? []) as CanonicalWorkingHoursRow[]).map((row) => ({
    ...row,
    barber_reference: barberReference,
    shop_reference: shopReference ?? row.shop_reference
  }));
}

export async function readCanonicalAppointmentServiceSnapshots(supabase: SupabaseClient, appointmentReferences: string[]) {
  await ensureCanonicalBookingData(supabase);
  if (!appointmentReferences.length) {
    return new Map<string, CanonicalAppointmentServiceSnapshotRow>();
  }

  const appointmentIds = appointmentReferences.map((reference) => canonicalAppointmentUuid(reference));
  const result = await supabase.from("appointment_services").select("*").in("appointment_id", appointmentIds);
  if (result.error) {
    return new Map<string, CanonicalAppointmentServiceSnapshotRow>();
  }

  return new Map(
    ((result.data ?? []) as CanonicalAppointmentServiceSnapshotRow[]).map((row) => [row.appointment_reference, row])
  );
}

export async function readCanonicalOperationsSnapshot(supabase: SupabaseClient): Promise<LiveOperationsSnapshot> {
  await ensureCanonicalBookingData(supabase);

  const [
    appointmentsResult,
    clientsResult,
    barbersResult,
    locationsResult,
    servicesResult,
    profilesResult,
    queueEntriesResult,
    walkInsResult,
    eventsResult,
    compensationResult,
    analyticsResult
  ] = await Promise.all([
    supabase.from("appointments").select("*").order("starts_at", { ascending: true }),
    supabase.from("clients").select("*"),
    supabase.from("barbers").select("id, reference_code"),
    supabase.from("locations").select("id, reference_code"),
    supabase.from("services").select("id, reference_code, name"),
    supabase.from("profiles").select("id, full_name, email, phone"),
    supabase
      .from("waitlist_entries")
      .select("id, location_id, shop_id, client_id, service_id, barber_id, barber_preference, preferred_date, preferred_start_time, preferred_end_time, flexibility_minutes, queue_source, notes, status_reason, status, created_at, called_at, assigned_at, converted_appointment_id, converted_at, completed_at, cancelled_at, updated_at")
      .in("status", ["active", "called", "assigned"])
      .in("queue_source", ["walk_in", "manual", "cancellation_fill"])
      .order("created_at", { ascending: true }),
    supabase.from("walk_in_queue").select("*").order("position", { ascending: true }),
    supabase.from("workflow_events").select("*").order("created_at", { ascending: false }).limit(40),
    supabase.from("compensation_snapshots").select("*").order("captured_at", { ascending: false }),
    supabase.from("owner_daily_analytics").select("*").order("business_date", { ascending: false })
  ]);

  for (const result of [
    appointmentsResult,
    clientsResult,
    barbersResult,
    locationsResult,
    servicesResult,
    profilesResult,
    walkInsResult,
    eventsResult,
    compensationResult,
    analyticsResult
  ]) {
    if (result.error) {
      throw result.error;
    }
  }

  const locationsById = new Map(((locationsResult.data ?? []) as CanonicalReferenceRow[]).map((row) => [row.id, row.reference_code ?? row.id]));
  const barbersById = new Map(((barbersResult.data ?? []) as CanonicalReferenceRow[]).map((row) => [row.id, row.reference_code ?? row.id]));
  const servicesById = new Map(((servicesResult.data ?? []) as CanonicalServiceReferenceRow[]).map((row) => [row.id, row.reference_code ?? row.id]));
  const serviceNamesById = new Map(((servicesResult.data ?? []) as CanonicalServiceReferenceRow[]).map((row) => [row.id, row.name]));
  const profilesById = new Map(((profilesResult.data ?? []) as CanonicalProfileRow[]).map((row) => [row.id, row]));
  const clientsById = new Map(((clientsResult.data ?? []) as CanonicalClientRow[]).map((row) => [row.id, row]));

  const clientRows = (clientsResult.data ?? []) as CanonicalClientRow[];
  const clients = clientRows.map((row) => {
    const profile = profilesById.get(row.profile_id);
    const favoriteBarberReference = row.favorite_barber_id ? barbersById.get(row.favorite_barber_id) : undefined;
    return {
      id: row.reference_code ?? row.id,
      name: profile?.full_name ?? row.reference_code ?? row.id,
      phone: profile?.phone ?? "",
      email: profile?.email ?? "",
      favoriteBarberId: favoriteBarberReference,
      loyaltyPoints: row.loyalty_points ?? 0,
      retentionTag: toRetentionTag(row.retention_tag),
      notes: []
    } satisfies Client;
  });

  const appointments = ((appointmentsResult.data ?? []) as CanonicalAppointmentRow[]).map((row) => ({
    id: row.reference_code ?? row.id,
    locationId: locationsById.get(row.location_id) ?? row.location_id,
    shopId: locationsById.get(row.shop_id ?? row.location_id) ?? row.shop_id ?? row.location_id,
    barberId: barbersById.get(row.barber_id) ?? row.barber_id,
    clientId: clientsById.get(row.client_id)?.reference_code ?? row.client_id,
    serviceId: servicesById.get(row.service_id) ?? row.service_id,
    status: row.status,
    confirmationCode: row.confirmation_code ?? undefined,
    source: row.source,
    bookingSource: row.booking_source ?? row.source,
    start: row.starts_at,
    end: row.ends_at,
    checkedInAt: row.checked_in_at ?? undefined,
    serviceStartedAt: row.service_started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    chair: row.chair_label ?? "Front desk assign",
    addOnIds: row.add_on_references ?? [],
    depositAmount: numeric(row.deposit_amount),
    serviceTotal: numeric(row.service_total),
    addOnTotal: numeric(row.add_on_total),
    subtotal: numeric(row.subtotal),
    discountTotal: numeric(row.discount_total),
    taxTotal: numeric(row.tax_total),
    totalAmount: numeric(row.total_amount),
    grandTotal: numeric(row.grand_total),
    balanceDue: numeric(row.balance_due),
    tipAmount: numeric(row.tip_amount),
    note: row.notes ?? row.client_note ?? "",
    internalNotes: row.internal_notes ?? undefined,
    membershipId: row.membership_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    revision: row.lifecycle_revision ?? 1,
    updatedAt: row.updated_at ?? row.starts_at,
    lastActorRole: row.last_actor_role ?? undefined,
    lastEventType: row.last_event_type ?? undefined,
    checkoutReference: row.checkout_reference ?? undefined
  })) as LiveAppointmentRecord[];

  const queueRows = !queueEntriesResult.error ? ((queueEntriesResult.data ?? []) as CanonicalQueueRow[]) : [];
  const walkIns = queueRows.length
    ? queueRows.map((row) => {
        const clientRow = clientsById.get(row.client_id);
        const clientProfile = clientRow ? profilesById.get(clientRow.profile_id) : undefined;
        const requestedAt = row.created_at;
        const waitMinutes = Math.max(0, Math.round((Date.now() - new Date(requestedAt).getTime()) / 60_000));

        return {
          id: row.id,
          locationId: locationsById.get(row.location_id) ?? row.location_id,
          shopId: row.shop_id ? locationsById.get(row.shop_id) ?? row.shop_id : locationsById.get(row.location_id) ?? row.location_id,
          clientId: clientRow?.reference_code ?? row.client_id,
          clientName: clientProfile?.full_name ?? clientRow?.reference_code ?? row.client_id,
          serviceId: row.service_id ? servicesById.get(row.service_id) ?? row.service_id : undefined,
          requestedService: row.service_id ? serviceNamesById.get(row.service_id) ?? servicesById.get(row.service_id) ?? "Service to be selected" : "Service to be selected",
          requestedAt,
          status: row.status,
          assignedBarberId: row.barber_id ? barbersById.get(row.barber_id) ?? undefined : undefined,
          preferredBarberId: row.barber_preference ? barbersById.get(row.barber_preference) ?? undefined : undefined,
          waitMinutes,
          flexibilityMinutes: row.flexibility_minutes ?? 0,
          queueSource: (row.queue_source as WalkInEntry["queueSource"]) ?? "walk_in",
          calledAt: row.called_at ?? undefined,
          assignedAt: row.assigned_at ?? undefined,
          convertedAppointmentId: row.converted_appointment_id ? row.converted_appointment_id : undefined,
          notes: row.notes ?? undefined
        } satisfies WalkInEntry;
      })
    : ((walkInsResult.data ?? []) as CanonicalWalkInRow[]).map((row) => {
        const clientRow = row.client_id ? clientsById.get(row.client_id) : undefined;
        const clientProfile = clientRow ? profilesById.get(clientRow.profile_id) : undefined;

        return {
          id: row.reference_code ?? row.id,
          locationId: locationsById.get(row.location_id) ?? row.location_id,
          shopId: locationsById.get(row.location_id) ?? row.location_id,
          clientId: clientRow?.reference_code ?? undefined,
          clientName: clientProfile?.full_name ?? row.client_name,
          requestedService: row.requested_service,
          requestedAt: row.requested_at,
          status: row.status,
          assignedBarberId: row.assigned_barber_id ? barbersById.get(row.assigned_barber_id) ?? undefined : undefined,
          waitMinutes: row.wait_minutes ?? 0,
          queueSource: "walk_in"
        } satisfies WalkInEntry;
      });

  return {
    mode: "supabase",
    fetchedAt: new Date().toISOString(),
    appointments,
    clients,
    walkIns,
    workflowEvents: ((eventsResult.data ?? []) as WorkflowEventRow[]).map((row) => ({
      appointmentReference: row.appointment_reference,
      locationReference: row.location_reference,
      barberReference: row.barber_reference,
      barberUserReference: row.barber_user_reference,
      barberEmail: row.barber_email,
      clientReference: row.client_reference,
      clientEmail: row.client_email,
      actorRole: row.actor_role,
      eventType: row.event_type,
      title: row.title,
      detail: row.detail,
      eventPayload: row.event_payload,
      createdAt: row.created_at
    } as WorkflowEventRecord)),
    compensationSnapshots: ((compensationResult.data ?? []) as CompensationSnapshotRow[]).map((row) => ({
      appointmentReference: row.appointment_reference,
      locationReference: row.location_reference,
      barberReference: row.barber_reference,
      barberUserReference: row.barber_user_reference,
      barberEmail: row.barber_email,
      clientReference: row.client_reference,
      clientEmail: row.client_email,
      compensationModel: row.compensation_model,
      businessDate: row.business_date,
      grossServiceAmount: numeric(row.gross_service_amount),
      depositAmount: numeric(row.deposit_amount),
      collectedAmount: numeric(row.collected_amount),
      tipAmount: numeric(row.tip_amount),
      commissionRate: row.commission_rate === null ? null : numeric(row.commission_rate),
      commissionAmount: numeric(row.commission_amount),
      boothRentAmount: row.booth_rent_amount === null ? null : numeric(row.booth_rent_amount),
      boothRentPeriodLabel: row.booth_rent_period_label,
      rentCoverageAmount: row.rent_coverage_amount === null ? null : numeric(row.rent_coverage_amount),
      checkoutReference: row.checkout_reference,
      capturedAt: row.captured_at
    } as CompensationSnapshotRecord)),
    ownerAnalytics: ((analyticsResult.data ?? []) as OwnerAnalyticsRow[]).map((row) => ({
      locationReference: row.location_reference,
      businessDate: row.business_date,
      bookedCount: row.booked_count,
      completedServicesCount: row.completed_services_count,
      paidAppointmentsCount: row.paid_appointments_count,
      revenueTotal: numeric(row.revenue_total),
      tipTotal: numeric(row.tip_total),
      outstandingBalance: numeric(row.outstanding_balance),
      updatedAt: row.updated_at
    } as OwnerAnalyticsSnapshotRecord))
  };
}
