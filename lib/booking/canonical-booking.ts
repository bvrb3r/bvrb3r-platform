import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  demoAppointments,
  demoBarbers,
  demoClients,
  demoLocations,
  demoReviews,
  demoServices,
  demoUsers,
  demoWaitlist,
  demoWalkIns
} from "@/lib/data/demo";
import type { Client, WalkInEntry } from "@/types/domain";
import type { CompensationSnapshotRecord, OwnerAnalyticsSnapshotRecord, WorkflowEventRecord } from "@/lib/operations/persistence";
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


type LegacyClientSeedRow = {
  client_reference: string;
  full_name: string;
  phone: string;
  email: string;
  favorite_barber_reference: string | null;
  loyalty_points: number | null;
  retention_tag: string | null;
  notes: string[] | null;
};

type LegacyAppointmentSeedRow = {
  appointment_reference: string;
  location_reference: string;
  barber_reference: string;
  client_reference: string;
  service_reference: string;
  status: LiveAppointmentRecord["status"];
  source: LiveAppointmentRecord["source"];
  starts_at: string;
  ends_at: string;
  chair_label: string;
  add_on_references: string[] | null;
  deposit_amount: number | string | null;
  total_amount: number | string | null;
  balance_due: number | string | null;
  tip_amount: number | string | null;
  client_note: string | null;
  lifecycle_revision: number | null;
  last_actor_role: LiveAppointmentRecord["lastActorRole"] | null;
  last_event_type: LiveAppointmentRecord["lastEventType"] | null;
  checkout_reference: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type LegacyWalkInSeedRow = {
  queue_reference: string;
  location_reference: string;
  client_name: string;
  requested_service: string;
  requested_at: string;
  status: WalkInEntry["status"];
  assigned_barber_reference: string | null;
  wait_minutes: number | null;
  position: number | null;
  updated_at: string | null;
};

type PaymentReferenceRow = {
  id: string;
  appointment_reference: string | null;
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

export function canonicalLocationUuid(reference: string) {
  return LOCATION_ID_MAP[reference] ?? stableUuid(`location:${reference}`);
}

export function canonicalServiceUuid(reference: string) {
  return SERVICE_ID_MAP[reference] ?? stableUuid(`service:${reference}`);
}

export function canonicalBarberUuid(reference: string) {
  return stableUuid(`barber:${reference}`);
}

export function canonicalClientUuid(reference: string) {
  return stableUuid(`client:${reference}`);
}

export function canonicalProfileUuid(email: string) {
  return stableUuid(`profile:${email.toLowerCase()}`);
}

export function canonicalAppointmentUuid(reference: string) {
  return stableUuid(`appointment:${reference}`);
}

function canonicalWaitlistUuid(reference: string) {
  return stableUuid(`waitlist:${reference}`);
}

function canonicalWalkInUuid(reference: string) {
  return stableUuid(`walkin:${reference}`);
}

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}


function toRetentionTag(value: string | null | undefined): Client["retentionTag"] {
  return value === "vip" || value === "repeat" || value === "lapsed" ? value : "new";
}

function defaultServiceLocationId(serviceId: string) {
  const locationReference = demoAppointments.find((appointment) => appointment.serviceId === serviceId)?.locationId;
  return canonicalLocationUuid(locationReference ?? "loc-ybor");
}


function barberUser(barberId: string) {
  return demoUsers.find((entry) => entry.barberId === barberId);
}

function clientEmailForReference(reference: string) {
  return demoClients.find((entry) => entry.id === reference)?.email ?? `${reference}@guest.bvrb3r.local`;
}

function appointmentSourceRows(legacyAppointments: LegacyAppointmentSeedRow[] | null | undefined) {
  if (legacyAppointments && legacyAppointments.length > 0) {
    return legacyAppointments.map((row) => ({
      reference: row.appointment_reference,
      locationReference: row.location_reference,
      barberReference: row.barber_reference,
      clientReference: row.client_reference,
      serviceReference: row.service_reference,
      status: row.status,
      source: row.source,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      chairLabel: row.chair_label,
      addOnReferences: row.add_on_references ?? [],
      depositAmount: numeric(row.deposit_amount),
      totalAmount: numeric(row.total_amount),
      balanceDue: numeric(row.balance_due),
      tipAmount: numeric(row.tip_amount),
      clientNote: row.client_note ?? "",
      lifecycleRevision: row.lifecycle_revision ?? 1,
      lastActorRole: row.last_actor_role ?? null,
      lastEventType: row.last_event_type ?? null,
      checkoutReference: row.checkout_reference ?? null,
      updatedAt: row.updated_at ?? row.starts_at,
      createdAt: row.created_at ?? row.starts_at
    }));
  }

  return demoAppointments.map((appointment) => ({
    reference: appointment.id,
    locationReference: appointment.locationId,
    barberReference: appointment.barberId,
    clientReference: appointment.clientId,
    serviceReference: appointment.serviceId,
    status: appointment.status,
    source: appointment.source,
    startsAt: appointment.start,
    endsAt: appointment.end,
    chairLabel: appointment.chair,
    addOnReferences: appointment.addOnIds,
    depositAmount: appointment.depositAmount,
    totalAmount: appointment.totalAmount,
    balanceDue: appointment.balanceDue,
    tipAmount: appointment.tipAmount,
    clientNote: appointment.note,
    lifecycleRevision: appointment.status === "checked_in" ? 2 : appointment.status === "in_service" ? 3 : appointment.status === "completed" ? 4 : 1,
    lastActorRole: appointment.status === "checked_in" ? "front_desk" : appointment.status === "in_service" ? "barber" : appointment.status === "completed" ? "front_desk" : "client",
    lastEventType: appointment.status === "checked_in" ? "check_in" : appointment.status === "in_service" ? "service_start" : appointment.status === "completed" ? "checkout" : "booking",
    checkoutReference: appointment.status === "completed" && appointment.balanceDue === 0 ? `checkout-${appointment.id}` : null,
    updatedAt: appointment.status === "completed" ? appointment.end : appointment.start,
    createdAt: appointment.start
  }));
}

function mergeLegacyClients(legacyClients: LegacyClientSeedRow[] | null | undefined): CanonicalClientProfile[] {
  const byReference = new Map<string, CanonicalClientProfile>();

  for (const client of demoClients) {
    byReference.set(client.id, {
      clientReference: client.id,
      fullName: client.name,
      phone: client.phone,
      email: client.email,
      favoriteBarberReference: client.favoriteBarberId,
      loyaltyPoints: client.loyaltyPoints,
      retentionTag: client.retentionTag,
      notes: [...client.notes]
    });
  }

  for (const row of legacyClients ?? []) {
    byReference.set(row.client_reference, {
      clientReference: row.client_reference,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      favoriteBarberReference: row.favorite_barber_reference ?? undefined,
      loyaltyPoints: row.loyalty_points ?? 0,
      retentionTag: toRetentionTag(row.retention_tag),
      notes: row.notes ?? []
    });
  }

  return [...byReference.values()];
}

function buildProfileRows(clients: CanonicalClientProfile[]) {
  const seen = new Map<string, { id: string; role: string; full_name: string; email: string; phone: string | null }>();

  for (const user of demoUsers) {
    seen.set(user.email, {
      id: canonicalProfileUuid(user.email),
      role: user.role,
      full_name: user.name,
      email: user.email,
      phone: demoClients.find((entry) => entry.email === user.email)?.phone ?? null
    });
  }

  for (const client of clients) {
    seen.set(client.email, {
      id: canonicalProfileUuid(client.email),
      role: "client",
      full_name: client.fullName,
      email: client.email,
      phone: client.phone
    });
  }

  return [...seen.values()];
}

async function seedCanonicalDataInternal(supabase: SupabaseClient) {
  const [
    existingLocationsResult,
    existingBarbersResult,
    existingClientsResult,
    existingServicesResult,
    existingPaymentsResult,
    legacyClientsResult,
    legacyAppointmentsResult,
    legacyWalkInsResult,
    legacyHoursResult
  ] = await Promise.all([
    supabase.from("locations").select("id").limit(1),
    supabase.from("barbers").select("id").limit(1),
    supabase.from("clients").select("id").limit(1),
    supabase.from("services").select("id").limit(1),
    supabase.from("payments").select("id, appointment_reference"),
    supabase.from("live_clients").select("*"),
    supabase.from("live_appointments").select("*"),
    supabase.from("live_walk_in_queue").select("*"),
    supabase.from("barber_working_hours").select("*")
  ]);

  const paymentUpdates = (existingPaymentsResult.error ? [] : ((existingPaymentsResult.data ?? []) as PaymentReferenceRow[]))
    .filter((payment): payment is PaymentReferenceRow & { appointment_reference: string } => Boolean(payment.appointment_reference))
    .map((payment) => ({
      id: payment.id,
      appointment_id: canonicalAppointmentUuid(payment.appointment_reference)
    }));

  const hasCanonicalCore = [existingLocationsResult, existingBarbersResult, existingClientsResult, existingServicesResult]
    .every((result) => !result.error && (result.data ?? []).length > 0);

  if (hasCanonicalCore) {
    for (const payment of paymentUpdates) {
      const result = await supabase.from("payments").update({ appointment_id: payment.appointment_id }).eq("id", payment.id);
      if (result.error) {
        throw result.error;
      }
    }

    return;
  }

  const clients = mergeLegacyClients(legacyClientsResult.error ? [] : (legacyClientsResult.data as LegacyClientSeedRow[] | null));
  const appointments = appointmentSourceRows(legacyAppointmentsResult.error ? [] : (legacyAppointmentsResult.data as LegacyAppointmentSeedRow[] | null));
  const legacyWalkIns = legacyWalkInsResult.error ? [] : ((legacyWalkInsResult.data ?? []) as LegacyWalkInSeedRow[]);
  const workingHours = legacyHoursResult.error ? [] : (legacyHoursResult.data ?? []);

  await supabase.from("locations").upsert(
    demoLocations.map((location) => ({
      id: canonicalLocationUuid(location.id),
      reference_code: location.id,
      name: location.name,
      neighborhood: location.neighborhood,
      city: location.city,
      state: location.state,
      phone: location.phone,
      hours: { summary: location.hours },
      tax_rate: location.taxRate
    })),
    { onConflict: "id" }
  );

  const existingProfilesResult = await supabase.from("profiles").select("id, email");
  const existingProfileIdsByEmail = new Map(
    ((existingProfilesResult.error ? [] : (existingProfilesResult.data ?? [])) as Array<{ id: string; email: string }>)
      .map((row) => [row.email.toLowerCase(), row.id])
  );

  const resolveProfileId = (email: string) => existingProfileIdsByEmail.get(email.toLowerCase()) ?? canonicalProfileUuid(email);

  await supabase.from("profiles").upsert(
    buildProfileRows(clients).map((profile) => ({
      ...profile,
      id: resolveProfileId(profile.email)
    })),
    { onConflict: "id" }
  );

  await supabase.from("barbers").upsert(
    demoBarbers.map((barber) => ({
      id: canonicalBarberUuid(barber.id),
      reference_code: barber.id,
      profile_id: resolveProfileId(barberUser(barber.id)?.email ?? `${barber.id}@bvrb3r.demo`),
      compensation_model: barber.compensationModel,
      commission_rate: barber.commissionRate ?? null,
      booth_rent_amount: barber.boothRentAmount ?? null,
      booth_rent_frequency: barber.boothRentFrequency ?? null,
      bio: barber.bio,
      booking_slug: barber.bookingLink.split("/").pop() ?? barber.id
    })),
    { onConflict: "id" }
  );

  await supabase.from("clients").upsert(
    clients.map((client) => ({
      id: canonicalClientUuid(client.clientReference),
      reference_code: client.clientReference,
      profile_id: resolveProfileId(client.email),
      favorite_barber_id: client.favoriteBarberReference ? canonicalBarberUuid(client.favoriteBarberReference) : null,
      loyalty_points: client.loyaltyPoints,
      retention_tag: client.retentionTag
    })),
    { onConflict: "id" }
  );

  await supabase.from("services").upsert(
    demoServices.map((service) => ({
      id: canonicalServiceUuid(service.id),
      reference_code: service.id,
      location_id: defaultServiceLocationId(service.id),
      category: service.category,
      name: service.name,
      description: service.description,
      duration_min: service.durationMin,
      buffer_min: service.bufferMin,
      price: service.price,
      deposit_amount: service.deposit,
      full_prepay_required: service.fullPrepay,
      active: true
    })),
    { onConflict: "id" }
  );

  const existingAvailability = await supabase.from("availability_rules").select("id").limit(1);
  if (!existingAvailability.error && !(existingAvailability.data ?? []).length) {
    const availabilityRows = (workingHours.length ? workingHours : demoBarbers.flatMap((barber) => {
      const locationReference = barber.locationIds[0] ?? "loc-ybor";
      return [1, 2, 3, 4, 5].map((weekday) => ({
        barber_reference: barber.id,
        shop_reference: locationReference,
        weekday,
        start_time: locationReference === "loc-hyde" ? "10:00" : "09:00",
        end_time: locationReference === "loc-hyde" ? "18:00" : "19:00"
      }));
    })) as CanonicalWorkingHoursRow[];

    await supabase.from("availability_rules").insert(
      availabilityRows.map((row) => ({
        id: stableUuid(`availability:${row.barber_reference}:${row.shop_reference}:${row.weekday}:${row.start_time}:${row.end_time}`),
        barber_id: canonicalBarberUuid(row.barber_reference),
        location_id: canonicalLocationUuid(row.shop_reference),
        weekday: row.weekday,
        start_time: row.start_time,
        end_time: row.end_time
      }))
    );
  }

  await supabase.from("appointments").upsert(
    appointments.map((appointment) => ({
      id: canonicalAppointmentUuid(appointment.reference),
      reference_code: appointment.reference,
      location_id: canonicalLocationUuid(appointment.locationReference),
      barber_id: canonicalBarberUuid(appointment.barberReference),
      client_id: canonicalClientUuid(appointment.clientReference),
      service_id: canonicalServiceUuid(appointment.serviceReference),
      status: appointment.status,
      source: appointment.source,
      starts_at: appointment.startsAt,
      ends_at: appointment.endsAt,
      chair_label: appointment.chairLabel,
      add_on_references: appointment.addOnReferences,
      deposit_amount: appointment.depositAmount,
      total_amount: appointment.totalAmount,
      balance_due: appointment.balanceDue,
      tip_amount: appointment.tipAmount,
      client_note: appointment.clientNote,
      lifecycle_revision: appointment.lifecycleRevision,
      last_actor_role: appointment.lastActorRole,
      last_event_type: appointment.lastEventType,
      checkout_reference: appointment.checkoutReference,
      updated_at: appointment.updatedAt,
      created_at: appointment.createdAt
    })),
    { onConflict: "reference_code" }
  );

  await supabase.from("appointment_services").upsert(
    appointments.map((appointment) => {
      const service = demoServices.find((entry) => entry.id === appointment.serviceReference);
      return {
        appointment_id: canonicalAppointmentUuid(appointment.reference),
        appointment_reference: appointment.reference,
        service_reference: appointment.serviceReference,
        service_name: service?.name ?? appointment.serviceReference,
        category: service?.category ?? "Service",
        description: service?.description ?? null,
        duration_min: service?.durationMin ?? Math.max(Math.round((new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60000), 0),
        buffer_min: service?.bufferMin ?? 0,
        price: appointment.totalAmount,
        deposit_amount: appointment.depositAmount,
        full_prepay_required: service?.fullPrepay ?? false,
        add_on_references: appointment.addOnReferences,
        snapshot_payload: {
          serviceReference: appointment.serviceReference,
          addOnReferences: appointment.addOnReferences,
          capturedAt: appointment.updatedAt,
          totalAmount: appointment.totalAmount,
          depositAmount: appointment.depositAmount
        },
        updated_at: appointment.updatedAt
      };
    }),
    { onConflict: "appointment_id" }
  );

  const existingWaitlist = await supabase.from("waitlist_entries").select("id").limit(1);
  if (!existingWaitlist.error && !(existingWaitlist.data ?? []).length) {
    await supabase.from("waitlist_entries").insert(
      demoWaitlist.map((entry) => {
        const requestedDate = entry.requestedDate ?? new Date().toISOString().slice(0, 10);
        const serviceReference = entry.serviceId ?? "srv-signature";
        return {
          id: canonicalWaitlistUuid(entry.id),
          location_id: canonicalLocationUuid(entry.locationId),
          shop_id: canonicalLocationUuid(entry.locationId),
          client_id: canonicalClientUuid(entry.clientId),
          service_id: canonicalServiceUuid(serviceReference),
          preferred_window: entry.preferredWindow ?? "open",
          requested_date: requestedDate,
          preferred_date: requestedDate,
          flexibility_minutes: 0,
          queue_source: "app",
          notes: "Legacy app waitlist request",
          barber_preference: entry.barberPreference ? canonicalBarberUuid(entry.barberPreference) : null,
          status: "active",
          updated_at: new Date(`${requestedDate}T12:00:00.000Z`).toISOString()
        };
      })
    );
  }

  await supabase.from("walk_in_queue").upsert(
    (legacyWalkIns.length ? legacyWalkIns : demoWalkIns.map((entry, index) => ({
      queue_reference: entry.id,
      location_reference: entry.locationId,
      client_name: entry.clientName,
      requested_service: entry.requestedService,
      requested_at: entry.requestedAt,
      status: entry.status,
      assigned_barber_reference: entry.assignedBarberId ?? null,
      wait_minutes: entry.waitMinutes,
      position: index + 1,
      updated_at: entry.requestedAt
    }))).map((entry: LegacyWalkInSeedRow, index: number) => ({
      id: canonicalWalkInUuid(entry.queue_reference),
      reference_code: entry.queue_reference,
      location_id: canonicalLocationUuid(entry.location_reference),
      client_id: clients.find((client) => client.fullName.toLowerCase() === String(entry.client_name).toLowerCase())
        ? canonicalClientUuid(clients.find((client) => client.fullName.toLowerCase() === String(entry.client_name).toLowerCase())!.clientReference)
        : null,
      client_name: entry.client_name,
      requested_service: entry.requested_service,
      requested_at: entry.requested_at,
      status: entry.status,
      assigned_barber_id: entry.assigned_barber_reference ? canonicalBarberUuid(entry.assigned_barber_reference) : null,
      position: entry.position ?? index + 1,
      wait_minutes: entry.wait_minutes ?? 0,
      updated_at: entry.updated_at ?? entry.requested_at
    })),
    { onConflict: "reference_code" }
  );

  const reviewsExist = await supabase.from("reviews").select("id").limit(1);
  if (!reviewsExist.error && !(reviewsExist.data ?? []).length) {
    await supabase.from("reviews").insert(
      demoReviews.map((review) => ({
        id: stableUuid(`review:${review.id}`),
        appointment_id: review.id === "review-2"
          ? canonicalAppointmentUuid("appt-4")
          : review.id === "review-3"
            ? canonicalAppointmentUuid("appt-5")
            : review.id === "review-4"
              ? canonicalAppointmentUuid("appt-7")
              : canonicalAppointmentUuid("appt-1"),
        barber_id: canonicalBarberUuid(review.barberId),
        client_id: canonicalClientUuid(review.clientId),
        location_id: canonicalLocationUuid(review.locationId),
        rating: review.rating,
        message: review.message,
        created_at: review.createdAt
      }))
    );
  }

  const depositExists = await supabase.from("deposits").select("id").limit(1);
  if (!depositExists.error && !(depositExists.data ?? []).length) {
    await supabase.from("deposits").insert(
      appointments
        .filter((appointment) => appointment.depositAmount > 0)
        .map((appointment) => ({
          id: stableUuid(`deposit:${appointment.reference}`),
          appointment_id: canonicalAppointmentUuid(appointment.reference),
          amount: appointment.depositAmount,
          retained: appointment.status === "no_show"
        }))
    );
  }

  for (const payment of paymentUpdates) {
    const result = await supabase.from("payments").update({ appointment_id: payment.appointment_id }).eq("id", payment.id);
    if (result.error) {
      throw result.error;
    }
  }
}

declare global {
  var __bvrb3rCanonicalSeedPromise: Promise<void> | undefined;
}

export async function ensureCanonicalBookingData(supabase: SupabaseClient) {
  if (!globalThis.__bvrb3rCanonicalSeedPromise) {
    globalThis.__bvrb3rCanonicalSeedPromise = seedCanonicalDataInternal(supabase).catch((error) => {
      globalThis.__bvrb3rCanonicalSeedPromise = undefined;
      throw error;
    });
  }

  return globalThis.__bvrb3rCanonicalSeedPromise;
}

export async function readCanonicalClientProfile(supabase: SupabaseClient, clientReference?: string) {
  if (!clientReference) {
    return undefined;
  }

  await ensureCanonicalBookingData(supabase);
  const clientResult = await supabase.from("clients").select("*").eq("id", canonicalClientUuid(clientReference)).maybeSingle();
  if (clientResult.error || !clientResult.data) {
    return undefined;
  }

  const profileResult = await supabase.from("profiles").select("*").eq("id", clientResult.data.profile_id).maybeSingle();
  if (profileResult.error || !profileResult.data) {
    return undefined;
  }

  const favoriteResult = clientResult.data.favorite_barber_id
    ? await supabase.from("barbers").select("reference_code").eq("id", clientResult.data.favorite_barber_id).maybeSingle()
    : { data: null, error: null };

  return {
    clientReference: clientResult.data.reference_code ?? clientReference,
    fullName: profileResult.data.full_name,
    phone: profileResult.data.phone ?? "",
    email: profileResult.data.email,
    favoriteBarberReference: favoriteResult.data?.reference_code ?? undefined,
    loyaltyPoints: clientResult.data.loyalty_points ?? 0,
    retentionTag: toRetentionTag(clientResult.data.retention_tag),
    notes: []
  };
}

export async function readCanonicalWorkingHours(supabase: SupabaseClient, barberReference: string, shopReference?: string) {
  await ensureCanonicalBookingData(supabase);
  let query = supabase.from("availability_rules").select("*").eq("barber_id", canonicalBarberUuid(barberReference));
  if (shopReference) {
    query = query.eq("location_id", canonicalLocationUuid(shopReference));
  }

  const result = await query.order("weekday");
  if (result.error) {
    return [] as CanonicalWorkingHoursRow[];
  }

  return ((result.data ?? []) as Array<{ weekday: number; start_time: string; end_time: string }>).map((row) => ({
    barber_reference: barberReference,
    shop_reference: shopReference ?? demoBarbers.find((entry) => entry.id === barberReference)?.locationIds[0] ?? "loc-ybor",
    weekday: row.weekday,
    start_time: row.start_time,
    end_time: row.end_time
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

  const [appointmentsResult, clientsResult, barbersResult, locationsResult, servicesResult, profilesResult, queueEntriesResult, walkInsResult, eventsResult, compensationResult, analyticsResult] = await Promise.all([
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

  for (const result of [appointmentsResult, clientsResult, barbersResult, locationsResult, servicesResult, profilesResult, walkInsResult, eventsResult, compensationResult, analyticsResult]) {
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
      email: profile?.email ?? clientEmailForReference(row.reference_code ?? row.id),
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
      const waitMinutes = Math.max(
        0,
        Math.round((Date.now() - new Date(requestedAt).getTime()) / 60_000)
      );

      return {
        id: row.id,
        locationId: locationsById.get(row.location_id) ?? row.location_id,
        shopId: row.shop_id ? locationsById.get(row.shop_id) ?? row.shop_id : locationsById.get(row.location_id) ?? row.location_id,
        clientId: clientRow?.reference_code ?? row.client_id,
        clientName: clientProfile?.full_name ?? clientEmailForReference(clientRow?.reference_code ?? row.client_id),
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
