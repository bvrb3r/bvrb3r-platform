import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { ensureRecurringBooking } from "@/lib/booking/recurring";
import {
  type AppointmentCheckInEventType,
  type BookableServiceSnapshot,
  calculateAppointmentQuote,
  generateAppointmentConfirmationCode
} from "@/lib/appointments/domain";
import {
  canonicalAppointmentUuid,
  canonicalBarberUuid,
  canonicalClientUuid,
  canonicalLocationUuid,
  canonicalProfileUuid,
  canonicalServiceUuid,
  ensureCanonicalBookingData,
  readCanonicalOperationsSnapshot
} from "@/lib/booking/canonical-booking";
import {
  createCapturedStripePaymentRecord,
  createTipLedgerEntry,
  PaymentServiceError
} from "@/lib/payments/service";
import { syncPaymentRoutingRecord } from "@/lib/fintech/service";
import {
  applyMembershipPricingAdjustmentToQuote,
  buildMembershipPricingAdjustment
} from "@/lib/monetization/membership";
import { readActiveClientMembershipSubscription } from "@/lib/monetization/service";
import {
  commitPointsRedemption,
  previewPointsQuoteAdjustment
} from "@/lib/points/engine";
import {
  completePromotionRedemptionsForAppointment,
  createPromotionRedemptionForAppointment,
  preparePromotionForBooking,
  voidPromotionRedemptionsForAppointment
} from "@/lib/promotions/service";
import {
  AppointmentLifecycleMutationInput,
  BookingMutationInput,
  CancelAppointmentMutationInput,
  CheckoutMutationInput,
  LiveMutationSuccess,
  LiveOperationConflictError,
  LiveOperationValidationError,
  LiveOperationsSnapshot,
  LiveOperationsViewer,
  LiveAppointmentRecord,
  createEmptyLiveOperationsSnapshot,
  bookAppointmentInSnapshot,
  cancelAppointmentInSnapshot,
  checkoutAppointmentInSnapshot,
  createInitialLiveOperationsSnapshot,
  scopeLiveOperationsSnapshot,
  transitionAppointmentInSnapshot
} from "@/lib/operations/live-state";
import { computeShopVerificationDecision, getVerificationGateDecision, buildPublicTrustSignal } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import { Client } from "@/types/domain";
import type { TrustState } from "@/types/trust";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type AppointmentConflictRow = {
  reference_code: string;
  status: LiveAppointmentRecord["status"];
};

type CanonicalLocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  tax_rate: number | string;
};

type CanonicalBarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
};

type CanonicalClientRow = {
  id: string;
  reference_code: string | null;
  profile_id: string | null;
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
  deposit_amount: number | string;
  full_prepay_required: boolean;
  active: boolean;
};

type StaffMembershipRow = {
  id: string;
  location_id: string;
  profile_id: string;
};

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function matchesReference(value: string, row: { id: string; reference_code: string | null }) {
  return row.id === value || row.reference_code === value;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

async function readTrustStateSafe() {
  try {
    const trustProvider = await getTrustProvider();
    return await trustProvider.readState();
  } catch (error) {
    console.warn("[live-provider] verification trust state unavailable during booking gate check", {
      message: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
}

function createVerificationBlockedError(input: {
  gate: "booking" | "shop_activation";
  barberId: string;
  locationId: string;
  codes: string[];
  reasons: string[];
  degraded: boolean;
}) {
  return new LiveOperationValidationError(
    input.reasons[0] ?? "This booking lane is not currently eligible for verification-gated booking.",
    "verification_blocked",
    {
      gate: input.gate,
      barberId: input.barberId,
      locationId: input.locationId,
      codes: input.codes,
      reasons: input.reasons,
      degraded: input.degraded
    }
  );
}

function assertBookableBarberLane(barberId: string, locationId: string, trustState?: TrustState) {
  if (!trustState) {
    return;
  }

  const bookingGate = getVerificationGateDecision(buildPublicTrustSignal(trustState, barberId, locationId).verificationDecision, "booking");
  if (!bookingGate.allowed) {
    console.warn("[live-provider] booking blocked by barber verification gate", {
      barberId,
      locationId,
      codes: bookingGate.codes,
      reasons: bookingGate.reasons
    });
    throw createVerificationBlockedError({
      gate: "booking",
      barberId,
      locationId,
      codes: bookingGate.codes,
      reasons: bookingGate.reasons,
      degraded: bookingGate.degraded
    });
  }

  const shopGate = getVerificationGateDecision(computeShopVerificationDecision(trustState, locationId), "shop_activation");
  if (!shopGate.allowed) {
    console.warn("[live-provider] booking blocked by shop activation gate", {
      barberId,
      locationId,
      codes: shopGate.codes,
      reasons: shopGate.reasons
    });
    throw createVerificationBlockedError({
      gate: "shop_activation",
      barberId,
      locationId,
      codes: shopGate.codes,
      reasons: shopGate.reasons,
      degraded: shopGate.degraded
    });
  }
}

interface LiveOperationsProvider {
  kind: "demo" | "supabase";
  readSnapshot(viewer: LiveOperationsViewer): Promise<LiveOperationsSnapshot>;
  createBooking(input: BookingMutationInput): Promise<LiveMutationSuccess>;
  cancelAppointment(input: CancelAppointmentMutationInput): Promise<LiveMutationSuccess>;
  transitionAppointment(input: AppointmentLifecycleMutationInput): Promise<LiveMutationSuccess>;
  checkoutAppointment(input: CheckoutMutationInput): Promise<LiveMutationSuccess>;
}

function toBookableServiceSnapshot(row: CanonicalServiceRow): BookableServiceSnapshot {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    name: row.name,
    durationMinutes: row.duration_min,
    bufferMinutes: row.buffer_min,
    unitPrice: numeric(row.price),
    depositAmount: numeric(row.deposit_amount),
    fullPrepayRequired: row.full_prepay_required
  };
}

async function resolveProfileIdByEmail(supabase: SupabaseClient, email?: string) {
  if (!email) {
    return null;
  }

  const result = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return result.data?.id ?? null;
}

async function generateUniqueConfirmationCode(supabase: SupabaseClient, seed: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateAppointmentConfirmationCode(`${seed}:${attempt}`);
    const existing = await supabase
      .from("appointments")
      .select("id")
      .eq("confirmation_code", code)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (!existing.data) {
      return code;
    }
  }

  throw new Error("Could not generate a unique appointment confirmation code.");
}

async function loadCanonicalServicesByReference(
  supabase: SupabaseClient,
  serviceReferences: string[]
) {
  const ids = [...new Set(serviceReferences.map((reference) => canonicalServiceUuid(reference)))];
  if (!ids.length) {
    return [] as CanonicalServiceRow[];
  }

  const result = await supabase
    .from("services")
    .select("id, reference_code, location_id, category, name, description, duration_min, buffer_min, price, deposit_amount, full_prepay_required, active")
    .in("id", ids);

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? []) as CanonicalServiceRow[];
}

async function syncAppointmentLineItems(supabase: SupabaseClient, appointment: LiveAppointmentRecord) {
  const serviceRows = await loadCanonicalServicesByReference(supabase, [appointment.serviceId, ...appointment.addOnIds]);
  const primaryService = serviceRows.find((row) => matchesReference(appointment.serviceId, row));

  if (!primaryService) {
    throw new Error(`Canonical service ${appointment.serviceId} was not found for appointment ${appointment.id}.`);
  }

  const primaryRow = {
    appointment_id: canonicalAppointmentUuid(appointment.id),
    appointment_reference: appointment.id,
    service_id: primaryService.id,
    service_reference: primaryService.reference_code ?? primaryService.id,
    service_name: primaryService.name,
    category: primaryService.category,
    description: primaryService.description,
    duration_min: primaryService.duration_min,
    buffer_min: primaryService.buffer_min,
    price: numeric(primaryService.price),
    deposit_amount: numeric(primaryService.deposit_amount),
    full_prepay_required: primaryService.full_prepay_required,
    add_on_references: appointment.addOnIds,
    snapshot_payload: {
      serviceReference: primaryService.reference_code ?? primaryService.id,
      addOnReferences: appointment.addOnIds,
      capturedAt: appointment.updatedAt,
      serviceTotal: appointment.serviceTotal ?? appointment.totalAmount,
      addOnTotal: appointment.addOnTotal ?? 0,
      grandTotal: appointment.grandTotal ?? appointment.totalAmount
    },
    service_name_snapshot: primaryService.name,
    duration_minutes_snapshot: primaryService.duration_min,
    unit_price_snapshot: numeric(primaryService.price),
    quantity: 1,
    line_total: appointment.serviceTotal ?? numeric(primaryService.price),
    updated_at: appointment.updatedAt
  };

  const existing = await supabase
    .from("appointment_services")
    .select("id")
    .eq("appointment_id", primaryRow.appointment_id)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const primaryResult = existing.data
    ? await supabase.from("appointment_services").update(primaryRow).eq("id", existing.data.id)
    : await supabase.from("appointment_services").insert(primaryRow);

  if (primaryResult.error) {
    throw primaryResult.error;
  }

  const appointmentId = canonicalAppointmentUuid(appointment.id);
  const deleteResult = await supabase
    .from("appointment_add_ons")
    .delete()
    .eq("appointment_id", appointmentId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  const addOnRows = serviceRows
    .filter((row) => appointment.addOnIds.some((addOnId) => matchesReference(addOnId, row)))
    .map((row) => ({
      appointment_id: appointmentId,
      add_on_service_id: row.id,
      add_on_reference: row.reference_code ?? row.id,
      add_on_name_snapshot: row.name,
      unit_price_snapshot: numeric(row.price),
      quantity: 1,
      line_total: numeric(row.price),
      updated_at: appointment.updatedAt
    }));

  if (addOnRows.length) {
    const addOnInsert = await supabase.from("appointment_add_ons").insert(addOnRows);
    if (addOnInsert.error) {
      throw addOnInsert.error;
    }
  }
}

function buildNotificationInserts(appointment: LiveAppointmentRecord, kind: "booking" | "cancel" | "checkout") {
  if (kind === "booking") {
    return [
      {
        channel: "sms",
        title: "Appointment confirmed",
        body: `Your appointment ${appointment.id} is confirmed for ${appointment.start}.`,
        status: "scheduled",
        scheduled_for: appointment.updatedAt,
        appointment_reference: appointment.id,
        client_reference: appointment.clientId,
        barber_reference: appointment.barberId,
        location_reference: appointment.locationId,
        metadata: { audience: "client", eventType: "booking" },
        created_at: appointment.updatedAt,
        updated_at: appointment.updatedAt
      },
      {
        channel: "in_app",
        title: "New booking added",
        body: `Appointment ${appointment.id} is now on the barber schedule.`,
        status: "scheduled",
        scheduled_for: appointment.updatedAt,
        appointment_reference: appointment.id,
        client_reference: appointment.clientId,
        barber_reference: appointment.barberId,
        location_reference: appointment.locationId,
        metadata: { audience: "barber", eventType: "booking" },
        created_at: appointment.updatedAt,
        updated_at: appointment.updatedAt
      }
    ];
  }

  if (kind === "cancel") {
    return [
      {
        channel: "in_app",
        title: "Appointment cancelled",
        body: `Appointment ${appointment.id} has been cancelled.`,
        status: "scheduled",
        scheduled_for: appointment.updatedAt,
        appointment_reference: appointment.id,
        client_reference: appointment.clientId,
        barber_reference: appointment.barberId,
        location_reference: appointment.locationId,
        metadata: { audience: "client", eventType: "cancel" },
        created_at: appointment.updatedAt,
        updated_at: appointment.updatedAt
      }
    ];
  }

  return [
    {
      channel: "sms",
      title: "Visit completed",
      body: `Appointment ${appointment.id} is complete and ready for follow-up.`,
      status: "scheduled",
      scheduled_for: appointment.updatedAt,
      appointment_reference: appointment.id,
      client_reference: appointment.clientId,
      barber_reference: appointment.barberId,
      location_reference: appointment.locationId,
      metadata: { audience: "client", eventType: "checkout" },
      created_at: appointment.updatedAt,
      updated_at: appointment.updatedAt
    }
  ];
}

function buildBarberStatusInsert(snapshot: LiveOperationsSnapshot, barberId: string) {
  const relevantAppointments = snapshot.appointments
    .filter((entry) => entry.barberId === barberId && entry.status !== "cancelled" && entry.status !== "no_show")
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
  const activeAppointment = relevantAppointments.find((entry) => entry.status === "checked_in" || entry.status === "in_service");
  const nextAppointment = relevantAppointments.find((entry) => new Date(entry.end).getTime() >= Date.now());
  const liveStatus = activeAppointment ? "busy" : "available";
  const shopReference = nextAppointment?.locationId ?? relevantAppointments[0]?.locationId ?? null;

  return {
    barber_reference: barberId,
    barber_id: canonicalBarberUuid(barberId),
    shop_reference: shopReference,
    current_shop_id: shopReference ? canonicalLocationUuid(shopReference) : null,
    status: activeAppointment ? "busy" : "available",
    live_status: liveStatus,
    is_online: true,
    accepts_walk_ins: !activeAppointment,
    next_available_at: nextAppointment?.start ?? null,
    accepting_bookings: true,
    availability_note: activeAppointment ? "Chair is currently active." : "Ready for the next appointment.",
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}


async function syncAppointmentStatusHistory(
  supabase: SupabaseClient,
  appointment: LiveAppointmentRecord,
  params?: {
    previousStatus?: LiveAppointmentRecord["status"];
    actorProfileId?: string | null;
    reason?: string | null;
  }
) {
  const existing = await supabase
    .from("appointment_status_history")
    .select("id")
    .eq("appointment_id", canonicalAppointmentUuid(appointment.id))
    .eq("new_status", appointment.status)
    .eq("changed_at", appointment.updatedAt)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }
  if (existing.data) {
    return;
  }

  const result = await supabase.from("appointment_status_history").insert({
    appointment_id: canonicalAppointmentUuid(appointment.id),
    status: appointment.status,
    old_status: params?.previousStatus ?? null,
    new_status: appointment.status,
    changed_by: params?.actorProfileId ?? null,
    change_reason: params?.reason ?? null,
    changed_at: appointment.updatedAt
  });
  if (result.error) {
    throw result.error;
  }
}

async function insertAppointmentCheckInEvent(
  supabase: SupabaseClient,
  appointment: LiveAppointmentRecord,
  eventType: AppointmentCheckInEventType,
  actorProfileId?: string | null,
  eventNotes?: string
) {
  const result = await supabase.from("appointment_check_in_events").insert({
    appointment_id: canonicalAppointmentUuid(appointment.id),
    event_type: eventType,
    recorded_by: actorProfileId ?? null,
    event_notes: eventNotes ?? null,
    recorded_at: appointment.updatedAt
  });

  if (result.error) {
    throw result.error;
  }
}

async function insertPaymentRecord(
  supabase: SupabaseClient,
  appointment: LiveAppointmentRecord,
  amount: number,
  type: string,
  status: string,
  metadata: Record<string, string | number | boolean | null>,
  createdAt = appointment.updatedAt
) {
  const existing = await supabase
    .from("payments")
    .select("id")
    .eq("appointment_id", canonicalAppointmentUuid(appointment.id))
    .eq("payment_type", "booking")
    .eq("payment_status", status)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }
  if (existing.data) {
    return null;
  }

  return createCapturedStripePaymentRecord(supabase, {
    appointmentId: canonicalAppointmentUuid(appointment.id),
    clientId: canonicalClientUuid(appointment.clientId),
    shopId: canonicalLocationUuid(appointment.shopId ?? appointment.locationId),
    barberId: canonicalBarberUuid(appointment.barberId),
    amount,
    paymentType: "booking",
    legacyType: type,
    legacyStatus: "captured",
    idempotencyKey: `booking:${appointment.id}:${type}:${amount.toFixed(2)}`,
    description: `BVRB3R booking ${appointment.id}`,
    metadata: {
      ...metadata,
      appointmentReference: appointment.id,
      clientReference: appointment.clientId,
      barberReference: appointment.barberId,
      locationReference: appointment.locationId
    },
    createdAt
  });
}

async function insertNotificationRecords(supabase: SupabaseClient, appointment: LiveAppointmentRecord, kind: "booking" | "cancel" | "checkout") {
  const rows = buildNotificationInserts(appointment, kind);
  if (!rows.length) {
    return;
  }

  const result = await supabase.from("notifications").insert(rows);
  if (result.error) {
    throw result.error;
  }
}

async function syncBarberStatus(supabase: SupabaseClient, snapshot: LiveOperationsSnapshot, barberId: string) {
  const result = await supabase
    .from("barber_status")
    .upsert(buildBarberStatusInsert(snapshot, barberId), { onConflict: "barber_reference" });

  if (result.error) {
    throw result.error;
  }
}

declare global {
  var __bvrb3rLiveSnapshot: LiveOperationsSnapshot | undefined;
}

function getDemoSnapshot() {
  if (!globalThis.__bvrb3rLiveSnapshot) {
    globalThis.__bvrb3rLiveSnapshot = createInitialLiveOperationsSnapshot("demo");
  }

  return globalThis.__bvrb3rLiveSnapshot;
}

function setDemoSnapshot(snapshot: LiveOperationsSnapshot) {
  globalThis.__bvrb3rLiveSnapshot = snapshot;
}

export function resetDemoLiveOperationsSnapshot() {
  setDemoSnapshot(createInitialLiveOperationsSnapshot("demo"));
}

function createDemoProvider(): LiveOperationsProvider {
  return {
    kind: "demo",
    async readSnapshot(viewer) {
      return scopeLiveOperationsSnapshot(getDemoSnapshot(), viewer);
    },
    async createBooking(input) {
      const trustState = await readTrustStateSafe();
      assertBookableBarberLane(input.barberId, input.locationId, trustState);
      const result = bookAppointmentInSnapshot(getDemoSnapshot(), input);
      setDemoSnapshot(result.snapshot);
      return result;
    },
    async cancelAppointment(input) {
      const result = cancelAppointmentInSnapshot(getDemoSnapshot(), input);
      setDemoSnapshot(result.snapshot);
      return result;
    },
    async transitionAppointment(input) {
      const result = transitionAppointmentInSnapshot(getDemoSnapshot(), input);
      setDemoSnapshot(result.snapshot);
      return result;
    },
    async checkoutAppointment(input) {
      const result = checkoutAppointmentInSnapshot(getDemoSnapshot(), input);
      setDemoSnapshot(result.snapshot);
      return result;
    }
  };
}

function createUnavailableSupabaseProvider(): LiveOperationsProvider {
  const readEmptySnapshot = (viewer: LiveOperationsViewer) =>
    scopeLiveOperationsSnapshot(createEmptyLiveOperationsSnapshot("supabase"), viewer);
  const unavailable = (): never => {
    throw new LiveOperationValidationError(
      "Live operations are unavailable because the Supabase server provider is not configured.",
      "invalid_resource_reference"
    );
  };

  return {
    kind: "supabase",
    async readSnapshot(viewer) {
      return readEmptySnapshot(viewer);
    },
    async createBooking() {
      return unavailable();
    },
    async cancelAppointment() {
      return unavailable();
    },
    async transitionAppointment() {
      return unavailable();
    },
    async checkoutAppointment() {
      return unavailable();
    }
  };
}

async function readFullSupabaseSnapshot(supabase: SupabaseClient): Promise<LiveOperationsSnapshot> {
  await ensureCanonicalBookingData(supabase);
  return readCanonicalOperationsSnapshot(supabase);
}

async function persistArtifactsForAppointment(
  supabase: SupabaseClient,
  snapshot: LiveOperationsSnapshot,
  appointment: LiveAppointmentRecord
) {
  const workflowEvent = snapshot.workflowEvents.find((entry) => entry.appointmentReference === appointment.id);
  const compensationSnapshot = snapshot.compensationSnapshots.find((entry) => entry.appointmentReference === appointment.id);
  const ownerAnalytics = snapshot.ownerAnalytics.find((entry) => entry.locationReference === appointment.locationId);

  if (workflowEvent) {
    const workflowResult = await supabase.from("workflow_events").insert({
      appointment_reference: workflowEvent.appointmentReference,
      location_reference: workflowEvent.locationReference,
      barber_reference: workflowEvent.barberReference,
      barber_user_reference: workflowEvent.barberUserReference,
      barber_email: workflowEvent.barberEmail,
      client_reference: workflowEvent.clientReference,
      client_email: workflowEvent.clientEmail,
      actor_role: workflowEvent.actorRole,
      event_type: workflowEvent.eventType,
      title: workflowEvent.title,
      detail: workflowEvent.detail,
      event_payload: workflowEvent.eventPayload,
      created_at: workflowEvent.createdAt
    });
    if (workflowResult.error) {
      throw workflowResult.error;
    }

    const eventLogResult = await supabase.from("event_log").upsert({
      appointment_reference: workflowEvent.appointmentReference,
      location_reference: workflowEvent.locationReference,
      barber_reference: workflowEvent.barberReference,
      client_reference: workflowEvent.clientReference,
      actor_role: workflowEvent.actorRole,
      event_type: workflowEvent.eventType,
      title: workflowEvent.title,
      detail: workflowEvent.detail,
      payload: workflowEvent.eventPayload,
      created_at: workflowEvent.createdAt
    }, { onConflict: "appointment_reference,event_type,created_at" });
    if (eventLogResult.error) {
      throw eventLogResult.error;
    }
  }

  if (compensationSnapshot) {
    const compensationResult = await supabase
      .from("compensation_snapshots")
      .upsert({
        appointment_reference: compensationSnapshot.appointmentReference,
        location_reference: compensationSnapshot.locationReference,
        barber_reference: compensationSnapshot.barberReference,
        barber_user_reference: compensationSnapshot.barberUserReference,
        barber_email: compensationSnapshot.barberEmail,
        client_reference: compensationSnapshot.clientReference,
        client_email: compensationSnapshot.clientEmail,
        compensation_model: compensationSnapshot.compensationModel,
        business_date: compensationSnapshot.businessDate,
        gross_service_amount: compensationSnapshot.grossServiceAmount,
        deposit_amount: compensationSnapshot.depositAmount,
        collected_amount: compensationSnapshot.collectedAmount,
        tip_amount: compensationSnapshot.tipAmount,
        commission_rate: compensationSnapshot.commissionRate,
        commission_amount: compensationSnapshot.commissionAmount,
        booth_rent_amount: compensationSnapshot.boothRentAmount,
        booth_rent_period_label: compensationSnapshot.boothRentPeriodLabel,
        rent_coverage_amount: compensationSnapshot.rentCoverageAmount,
        checkout_reference: compensationSnapshot.checkoutReference,
        captured_at: compensationSnapshot.capturedAt,
        updated_at: new Date().toISOString()
      }, { onConflict: "appointment_reference" });

    if (compensationResult.error) {
      throw compensationResult.error;
    }
  }

  if (ownerAnalytics) {
    const analyticsResult = await supabase
      .from("owner_daily_analytics")
      .upsert({
        location_reference: ownerAnalytics.locationReference,
        business_date: ownerAnalytics.businessDate,
        booked_count: ownerAnalytics.bookedCount,
        completed_services_count: ownerAnalytics.completedServicesCount,
        paid_appointments_count: ownerAnalytics.paidAppointmentsCount,
        revenue_total: ownerAnalytics.revenueTotal,
        tip_total: ownerAnalytics.tipTotal,
        outstanding_balance: ownerAnalytics.outstandingBalance,
        updated_at: ownerAnalytics.updatedAt
      }, { onConflict: "location_reference,business_date" });

    if (analyticsResult.error) {
      throw analyticsResult.error;
    }
  }

  await syncBarberStatus(supabase, snapshot, appointment.barberId);
}

async function getLatestAppointmentOrThrow(supabase: SupabaseClient, appointmentId: string) {
  const snapshot = await readCanonicalOperationsSnapshot(supabase);
  const appointment = snapshot.appointments.find((entry) => entry.id === appointmentId);
  if (!appointment) {
    throw new Error(`Appointment ${appointmentId} was not found.`);
  }

  return appointment;
}

async function upsertCanonicalClient(supabase: SupabaseClient, client: Client) {
  const existingProfileResult = await supabase
    .from("profiles")
    .select("id")
    .eq("email", client.email)
    .maybeSingle();
  if (existingProfileResult.error) {
    throw existingProfileResult.error;
  }

  const profileId = existingProfileResult.data?.id ?? canonicalProfileUuid(client.email);
  const profileResult = await supabase.from("profiles").upsert({
    id: profileId,
    role: "client",
    full_name: client.name,
    email: client.email,
    phone: client.phone
  }, { onConflict: "id" });
  if (profileResult.error) {
    throw profileResult.error;
  }

  const clientResult = await supabase.from("clients").upsert({
    id: canonicalClientUuid(client.id),
    reference_code: client.id,
    profile_id: profileId,
    favorite_barber_id: client.favoriteBarberId ? canonicalBarberUuid(client.favoriteBarberId) : null,
    loyalty_points: client.loyaltyPoints,
    retention_tag: client.retentionTag
  }, { onConflict: "id" });
  if (clientResult.error) {
    throw clientResult.error;
  }
}

async function resolveCanonicalBookingContext(
  supabase: SupabaseClient,
  snapshot: LiveOperationsSnapshot,
  input: BookingMutationInput
) {
  const locationId = canonicalLocationUuid(input.locationId);
  const barberId = canonicalBarberUuid(input.barberId);
  const clientId = input.clientId ? canonicalClientUuid(input.clientId) : null;
  const serviceRows = await loadCanonicalServicesByReference(supabase, [input.serviceId, ...input.addOnIds]);
  const [locationResult, barberResult, clientResult] = await Promise.all([
    supabase.from("locations").select("id, reference_code, name, tax_rate").eq("id", locationId).maybeSingle(),
    supabase.from("barbers").select("id, reference_code, profile_id").eq("id", barberId).maybeSingle(),
    clientId
      ? supabase.from("clients").select("id, reference_code, profile_id").eq("id", clientId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (locationResult.error) {
    throw locationResult.error;
  }
  if (!locationResult.data) {
    throw new LiveOperationValidationError(`Shop ${input.locationId} was not found.`, "invalid_resource_reference");
  }
  if (barberResult.error) {
    throw barberResult.error;
  }
  if (!barberResult.data) {
    throw new LiveOperationValidationError(`Barber ${input.barberId} was not found.`, "invalid_resource_reference");
  }
  if (clientResult.error) {
    throw clientResult.error;
  }
  if (input.clientId && !clientResult.data) {
    throw new LiveOperationValidationError(`Client ${input.clientId} was not found.`, "invalid_resource_reference");
  }

  const locationRow = locationResult.data as CanonicalLocationRow;
  const barberRow = barberResult.data as CanonicalBarberRow;

  const primaryService = serviceRows.find((row) => matchesReference(input.serviceId, row));
  if (!primaryService || !primaryService.active) {
    throw new LiveOperationValidationError(`Service ${input.serviceId} is not available for booking.`);
  }
  if (primaryService.location_id !== locationRow.id) {
    throw new LiveOperationValidationError(`Service ${input.serviceId} is not bookable at ${input.locationId}.`);
  }

  const addOnServices = input.addOnIds.map((addOnId) => {
    const match = serviceRows.find((row) => matchesReference(addOnId, row));
    if (!match || !match.active) {
      throw new LiveOperationValidationError(`Add-on ${addOnId} is not available for booking.`);
    }
    if (match.location_id !== locationRow.id) {
      throw new LiveOperationValidationError(`Add-on ${addOnId} is not bookable at ${input.locationId}.`);
    }
    return match;
  });

  const membershipResult = await supabase
    .from("staff_locations")
    .select("id, location_id, profile_id")
    .eq("profile_id", barberRow.profile_id)
    .eq("location_id", locationRow.id)
    .maybeSingle();

  if (membershipResult.error) {
    throw membershipResult.error;
  }
  if (!membershipResult.data) {
    throw new LiveOperationValidationError(`Barber ${input.barberId} is not assigned to shop ${input.locationId}.`);
  }

  const quote = calculateAppointmentQuote(
    toBookableServiceSnapshot(primaryService),
    addOnServices.map(toBookableServiceSnapshot),
    numeric(locationRow.tax_rate)
  );

  const matchedClient = snapshot.clients.find(
    (client) =>
      normalizePhone(client.phone) === normalizePhone(input.clientPhone)
      || client.name.toLowerCase() === input.clientName.toLowerCase()
  );
  const actorProfileId = input.createdBy ?? await resolveProfileIdByEmail(supabase, input.actorEmail);
  const appliedPromotion = await preparePromotionForBooking(supabase, {
    clientId: input.clientId ?? (clientResult.data as CanonicalClientRow | null)?.reference_code ?? matchedClient?.id,
    shopId: input.locationId,
    serviceId: input.serviceId,
    addOnIds: input.addOnIds,
    barberId: input.barberId,
    appointmentTime: input.appointmentTime,
    promotionId: input.promotionId,
    promotionCode: input.promotionCode
  });
  const promotedQuote = appliedPromotion
    ? {
        ...quote,
        discountTotal: appliedPromotion.quote.discountTotal,
        taxTotal: appliedPromotion.quote.taxTotal,
        grandTotal: appliedPromotion.quote.grandTotal,
        depositDue: appliedPromotion.quote.depositDue,
        balanceDue: appliedPromotion.quote.balanceDue
      }
    : quote;
  const clientMembershipSubscription = input.clientId
    ? await readActiveClientMembershipSubscription(input.clientId, supabase)
    : null;
  const membershipPricingAdjustment = buildMembershipPricingAdjustment(clientMembershipSubscription, promotedQuote.subtotal);
  const quoteAfterMembership = applyMembershipPricingAdjustmentToQuote(promotedQuote, membershipPricingAdjustment);
  const pointsRole = input.actorRole === "client" ? "client" : null;
  const pointsRedemptionPreview = input.pointsUserId && pointsRole && (input.pointsToRedeem ?? 0) > 0
    ? await previewPointsQuoteAdjustment({
        userId: input.pointsUserId,
        role: pointsRole,
        requestedPoints: input.pointsToRedeem ?? 0,
        quote: quoteAfterMembership
      })
    : null;
  const finalQuote = pointsRedemptionPreview?.quote ?? quoteAfterMembership;

  return {
    location: locationRow,
    barber: barberRow,
    client: (clientResult.data as CanonicalClientRow | null) ?? null,
    membership: membershipResult.data as StaffMembershipRow,
    primaryService,
    addOnServices,
    quote: finalQuote,
    quoteBeforePoints: quoteAfterMembership,
    appliedPromotion,
    promotionDiscountTotal: appliedPromotion?.quote.discountTotal ?? 0,
    membershipPricingAdjustment,
    pointsRedemptionPreview: pointsRedemptionPreview?.preview ?? null,
    matchedClient,
    actorProfileId
  };
}

function appointmentUpsertRow(appointment: LiveAppointmentRecord) {
  return {
    id: canonicalAppointmentUuid(appointment.id),
    reference_code: appointment.id,
    location_id: canonicalLocationUuid(appointment.locationId),
    shop_id: canonicalLocationUuid(appointment.shopId ?? appointment.locationId),
    barber_id: canonicalBarberUuid(appointment.barberId),
    client_id: canonicalClientUuid(appointment.clientId),
    service_id: canonicalServiceUuid(appointment.serviceId),
    confirmation_code: appointment.confirmationCode ?? generateAppointmentConfirmationCode(appointment.id),
    membership_id: appointment.membershipId ?? null,
    status: appointment.status,
    source: appointment.source,
    booking_source: appointment.bookingSource ?? appointment.source,
    starts_at: appointment.start,
    ends_at: appointment.end,
    checked_in_at: appointment.checkedInAt ?? null,
    service_started_at: appointment.serviceStartedAt ?? null,
    completed_at: appointment.completedAt ?? null,
    cancelled_at: appointment.cancelledAt ?? null,
    cancellation_reason: appointment.cancellationReason ?? null,
    chair_label: appointment.chair,
    add_on_references: appointment.addOnIds,
    deposit_amount: appointment.depositAmount,
    service_total: appointment.serviceTotal ?? appointment.totalAmount,
    add_on_total: appointment.addOnTotal ?? 0,
    subtotal: appointment.subtotal ?? appointment.totalAmount,
    discount_total: appointment.discountTotal ?? 0,
    tax_total: appointment.taxTotal ?? 0,
    total_amount: appointment.totalAmount,
    grand_total: appointment.grandTotal ?? appointment.totalAmount + appointment.tipAmount,
    balance_due: appointment.balanceDue,
    tip_amount: appointment.tipAmount,
    client_note: appointment.note,
    notes: appointment.note,
    internal_notes: appointment.internalNotes ?? null,
    created_by: appointment.createdBy ?? null,
    lifecycle_revision: appointment.revision,
    last_actor_role: appointment.lastActorRole ?? null,
    last_event_type: appointment.lastEventType ?? null,
    checkout_reference: appointment.checkoutReference ?? null,
    updated_at: appointment.updatedAt
  };
}

function withCapturedBookingSettlement(appointment: LiveAppointmentRecord) {
  const capturedAmount = Math.max(appointment.grandTotal ?? appointment.totalAmount, 0);
  return {
    ...appointment,
    depositAmount: capturedAmount,
    balanceDue: 0
  } satisfies LiveAppointmentRecord;
}

function replaceAppointmentInSnapshot(
  snapshot: LiveOperationsSnapshot,
  appointment: LiveAppointmentRecord
) {
  return {
    ...snapshot,
    fetchedAt: appointment.updatedAt,
    appointments: [...snapshot.appointments.map((entry) => (entry.id === appointment.id ? appointment : entry))]
      .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
  } satisfies LiveOperationsSnapshot;
}
function createSupabaseProvider(supabase: SupabaseClient): LiveOperationsProvider {
  return {
    kind: "supabase",
    async readSnapshot(viewer) {
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      return scopeLiveOperationsSnapshot(fullSnapshot, viewer);
    },
    async createBooking(input) {
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      const trustState = await readTrustStateSafe();
      assertBookableBarberLane(input.barberId, input.locationId, trustState);
      const context = await resolveCanonicalBookingContext(supabase, fullSnapshot, input);
      const confirmationCode = await generateUniqueConfirmationCode(
        supabase,
        `${input.locationId}:${input.barberId}:${input.serviceId}:${input.appointmentTime}:${input.clientPhone}`
      );
      const result = bookAppointmentInSnapshot(fullSnapshot, {
        ...input,
        clientId: input.clientId ?? context.client?.reference_code ?? context.matchedClient?.id,
        confirmationCode,
        membershipId: context.membership.id,
        bookingSource: input.bookingSource ?? "booking",
        createdBy: context.actorProfileId ?? undefined,
        pricingSnapshot: context.quote
      });
      const client = result.snapshot.clients.find((entry) => entry.id === result.appointment.clientId);

      const blockedResult = await supabase
        .from("blocked_times")
        .select("id")
        .eq("barber_id", context.barber.id)
        .lt("starts_at", result.appointment.end)
        .gt("ends_at", result.appointment.start)
        .limit(1)
        .maybeSingle();

      if (blockedResult.error) {
        throw blockedResult.error;
      }
      if (blockedResult.data) {
        throw new LiveOperationConflictError(
          "The selected time falls into blocked or unavailable chair time.",
          result.appointment,
          "schedule_conflict"
        );
      }

      const overlappingResult = await supabase
        .from("appointments")
        .select("reference_code, status")
        .eq("barber_id", context.barber.id)
        .lt("starts_at", result.appointment.end)
        .gt("ends_at", result.appointment.start);

      if (overlappingResult.error) {
        throw overlappingResult.error;
      }

      const conflictingAppointment = ((overlappingResult.data ?? []) as AppointmentConflictRow[]).find((appointment) => appointment.status !== "cancelled" && appointment.status !== "no_show");
      if (conflictingAppointment) {
        throw new LiveOperationConflictError(
          "The selected time is no longer available with this barber.",
          await getLatestAppointmentOrThrow(supabase, conflictingAppointment.reference_code),
          "schedule_conflict"
        );
      }

      if (!client) {
        throw new Error(`Client ${result.appointment.clientId} was not found.`);
      }

      const bookingPaymentAmount = Math.max(result.appointment.grandTotal ?? result.appointment.totalAmount, 0);
      const appointmentForPayment = bookingPaymentAmount > 0
        ? withCapturedBookingSettlement(result.appointment)
        : result.appointment;
      const snapshotForPayment = appointmentForPayment.id === result.appointment.id
        ? replaceAppointmentInSnapshot(result.snapshot, appointmentForPayment)
        : result.snapshot;

      await upsertCanonicalClient(supabase, client);

      const appointmentRow = appointmentUpsertRow(appointmentForPayment);
      const existingAppointment = await supabase
        .from("appointments")
        .select("id")
        .eq("reference_code", appointmentForPayment.id)
        .maybeSingle();
      if (existingAppointment.error) {
        throw existingAppointment.error;
      }

      const appointmentResult = existingAppointment.data
        ? await supabase.from("appointments").update(appointmentRow).eq("id", existingAppointment.data.id)
        : await supabase.from("appointments").insert(appointmentRow);
      if (appointmentResult.error) {
        throw appointmentResult.error;
      }

      try {
        if (bookingPaymentAmount > 0) {
          await insertPaymentRecord(
            supabase,
            appointmentForPayment,
            bookingPaymentAmount,
            "booking",
            "captured",
            {
              source: appointmentForPayment.source,
              serviceReference: appointmentForPayment.serviceId,
              fullPrepay: true
            }
          );
        }
      } catch (error) {
        await supabase.from("appointments").delete().eq("reference_code", appointmentForPayment.id);
        if (error instanceof PaymentServiceError) {
          throw new LiveOperationValidationError(error.message, "invalid_booking_selection");
        }
        throw error;
      }

      await syncAppointmentStatusHistory(supabase, appointmentForPayment, {
        previousStatus: undefined,
        actorProfileId: context.actorProfileId,
        reason: "appointment_booked"
      });
      await syncAppointmentLineItems(supabase, appointmentForPayment);
      if (context.appliedPromotion && context.promotionDiscountTotal && appointmentForPayment.clientId) {
        await createPromotionRedemptionForAppointment(supabase, {
          promotionId: context.appliedPromotion.promotionId,
          clientReference: appointmentForPayment.clientId,
          appointmentReference: appointmentForPayment.id,
          discountAmount: context.promotionDiscountTotal,
          redeemedAt: appointmentForPayment.updatedAt
        });
      }
      if (input.pointsUserId && (input.pointsToRedeem ?? 0) > 0) {
        await commitPointsRedemption({
          userId: input.pointsUserId,
          role: "client",
          purpose: "booking_discount",
          requestedPoints: input.pointsToRedeem ?? 0,
          orderTotal: context.quoteBeforePoints.grandTotal,
          sourceId: appointmentForPayment.id,
          locationId: appointmentForPayment.locationId,
          metadata: {
            appointmentId: appointmentForPayment.id,
            clientId: appointmentForPayment.clientId,
            barberId: appointmentForPayment.barberId,
            promotionId: context.appliedPromotion?.promotionId ?? null,
            bookingSource: appointmentForPayment.bookingSource ?? null
          }
        });
      }
      await insertNotificationRecords(supabase, appointmentForPayment, "booking");
      await persistArtifactsForAppointment(supabase, snapshotForPayment, appointmentForPayment);
      return {
        appointment: appointmentForPayment,
        snapshot: snapshotForPayment
      };
    },
    async cancelAppointment(input) {
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      const previousAppointment = fullSnapshot.appointments.find((entry) => entry.id === input.appointmentId);
      const result = cancelAppointmentInSnapshot(fullSnapshot, input);
      const updateResult = await supabase
        .from("appointments")
        .update(appointmentUpsertRow(result.appointment))
        .eq("reference_code", input.appointmentId)
        .eq("lifecycle_revision", input.expectedRevision)
        .select("reference_code")
        .maybeSingle();

      if (updateResult.error) {
        throw updateResult.error;
      }
      if (!updateResult.data) {
        throw new LiveOperationConflictError(
          `Appointment ${input.appointmentId} changed before cancellation completed.`,
          await getLatestAppointmentOrThrow(supabase, input.appointmentId),
          "stale_revision"
        );
      }

      const actorProfileId = await resolveProfileIdByEmail(supabase, input.actorEmail);
      await syncAppointmentStatusHistory(supabase, result.appointment, {
        previousStatus: previousAppointment?.status,
        actorProfileId,
        reason: input.reason ?? "appointment_cancelled"
      });

      const paymentUpdate = await supabase
        .from("payments")
        .update({ status: "voided", payment_status: "voided", updated_at: result.appointment.updatedAt })
        .eq("appointment_id", canonicalAppointmentUuid(input.appointmentId))
        .eq("payment_status", "authorized");
      if (paymentUpdate.error) {
        throw paymentUpdate.error;
      }

      await insertNotificationRecords(supabase, result.appointment, "cancel");
      await voidPromotionRedemptionsForAppointment(supabase, result.appointment.id, result.appointment.updatedAt);
      await persistArtifactsForAppointment(supabase, result.snapshot, result.appointment);
      return result;
    },
    async transitionAppointment(input) {
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      const previousAppointment = fullSnapshot.appointments.find((entry) => entry.id === input.appointmentId);
      const result = transitionAppointmentInSnapshot(fullSnapshot, input);
      const updateResult = await supabase
        .from("appointments")
        .update(appointmentUpsertRow(result.appointment))
        .eq("reference_code", input.appointmentId)
        .eq("lifecycle_revision", input.expectedRevision)
        .select("reference_code")
        .maybeSingle();

      if (updateResult.error) {
        throw updateResult.error;
      }
      if (!updateResult.data) {
        throw new LiveOperationConflictError(
          `Appointment ${input.appointmentId} changed before your update completed.`,
          await getLatestAppointmentOrThrow(supabase, input.appointmentId),
          "stale_revision"
        );
      }

      const actorProfileId = await resolveProfileIdByEmail(supabase, input.actorEmail);
      await syncAppointmentStatusHistory(supabase, result.appointment, {
        previousStatus: previousAppointment?.status,
        actorProfileId,
        reason:
          input.action === "check_in"
            ? "appointment_checked_in"
            : input.action === "service_start"
              ? "service_started"
              : "service_completed"
      });
      await insertAppointmentCheckInEvent(
        supabase,
        result.appointment,
        input.action === "check_in"
          ? "checked_in"
          : input.action === "service_start"
            ? "started"
            : "completed",
        actorProfileId,
        result.appointment.note
      );
      if (input.action === "service_complete") {
        await completePromotionRedemptionsForAppointment(supabase, result.appointment.id, result.appointment.updatedAt);
      }
      await persistArtifactsForAppointment(supabase, result.snapshot, result.appointment);
      if (input.action === "service_complete") {
        try {
          await ensureRecurringBooking(supabase, {
            clientId: result.appointment.clientId,
            trigger: "appointment_completed",
            completedAppointment: {
              appointmentId: result.appointment.id,
              barberReference: result.appointment.barberId,
              serviceReference: result.appointment.serviceId,
              locationReference: result.appointment.locationId,
              completedAt: result.appointment.updatedAt
            }
          });
        } catch {}
      }
      return result;
    },
    async checkoutAppointment(input) {
      const fullSnapshot = await readFullSupabaseSnapshot(supabase);
      const result = checkoutAppointmentInSnapshot(fullSnapshot, input);
      const updateResult = await supabase
        .from("appointments")
        .update(appointmentUpsertRow(result.appointment))
        .eq("reference_code", input.appointmentId)
        .eq("lifecycle_revision", input.expectedRevision)
        .select("reference_code")
        .maybeSingle();

      if (updateResult.error) {
        throw updateResult.error;
      }
      if (!updateResult.data) {
        throw new LiveOperationConflictError(
          `Appointment ${input.appointmentId} changed before checkout completed.`,
          await getLatestAppointmentOrThrow(supabase, input.appointmentId),
          "stale_revision"
        );
      }

      const remainingBalance = Math.max(result.appointment.totalAmount - result.appointment.depositAmount, 0);
      const checkoutPayment = remainingBalance > 0
        ? await insertPaymentRecord(
          supabase,
          result.appointment,
          remainingBalance,
          "checkout",
          "captured",
          {
            paymentMethod: input.paymentMethod,
            tipAmount: result.appointment.tipAmount,
            checkoutReference: result.appointment.checkoutReference ?? null
          },
          result.appointment.updatedAt
        )
        : null;
      if (result.appointment.tipAmount > 0) {
        await createTipLedgerEntry(supabase, {
          appointmentId: canonicalAppointmentUuid(result.appointment.id),
          paymentId: checkoutPayment?.id ?? null,
          clientId: canonicalClientUuid(result.appointment.clientId),
          barberId: canonicalBarberUuid(result.appointment.barberId),
          amount: result.appointment.tipAmount,
          createdAt: result.appointment.updatedAt
        });
      }
      const paymentRowsResult = await supabase
        .from("payments")
        .select("id")
        .eq("appointment_id", canonicalAppointmentUuid(result.appointment.id));
      if (paymentRowsResult.error) {
        throw paymentRowsResult.error;
      }
      for (const paymentRow of (paymentRowsResult.data ?? []) as Array<{ id: string }>) {
        await syncPaymentRoutingRecord(supabase, paymentRow.id);
      }
      await insertNotificationRecords(supabase, result.appointment, "checkout");
      await persistArtifactsForAppointment(supabase, result.snapshot, result.appointment);
      return result;
    }
  };
}

export async function getLiveOperationsProvider(): Promise<LiveOperationsProvider> {
  if (!isSupabaseEnabled()) {
    return createDemoProvider();
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error("[live-provider] Supabase is enabled but the admin client is unavailable; returning an empty live snapshot instead of demo data.");
    return createUnavailableSupabaseProvider();
  }

  return createSupabaseProvider(supabase);
}







