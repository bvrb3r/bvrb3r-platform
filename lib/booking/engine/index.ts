import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ArchitectRuntimeControlError,
  assertArchitectRuntimeControlAllows
} from "@/lib/architect/city-map/runtime-controls.server";
import { recordIdentityAuditEvent } from "@/lib/auth/identity-audit";
import { hasInternalAccess, isShopMemberOf, type PermissionActor } from "@/lib/auth/permissions";
import {
  buildBookingAvailability,
  mergeBusyRanges,
  resolveBookingPolicy,
  type BookingAvailabilityResult,
  type WorkingHoursRule
} from "@/lib/booking/engine/availability";
import {
  normalizeBookingAttribution,
  type BookingAttributionInput,
  type BookingSourceDoor
} from "@/lib/booking/engine/attribution";
import { BookingEngineError, unwrapEngineOutcome, type EngineOutcome } from "@/lib/booking/engine/errors";
import {
  hashHoldToken,
  isHoldTokenShaped,
  issueHoldToken,
  type BookingHold
} from "@/lib/booking/engine/holds";
import {
  computeRequestFingerprint,
  isValidIdempotencyKey,
  resolveIdempotencyActorKey
} from "@/lib/booking/engine/idempotency";
import {
  isExpectedRevision,
  normalizeCancellationReason,
  relationshipMayPerform,
  type BookingActorRelationship,
  type Pr20BookingAction
} from "@/lib/booking/engine/lifecycle";
import {
  SERVICE_CATALOG_COLUMNS,
  toBookableService,
  type ServiceCatalogRow
} from "@/lib/booking/engine/service-catalog";

/**
 * The booking engine's server contract.
 *
 * Seven bounded operations — availability, hold create/release, confirm,
 * reschedule, cancel, read — and nothing else reaches the booking tables. Three
 * properties hold across every one of them.
 *
 * **Every mutation is authorized before it is attempted.** Authority comes from
 * canonical relationships through the PR 19 predicates, never from a role claim
 * and never from anything on the request. The database re-proves the same
 * relationship as defence in depth; neither layer is trusted to be the only one.
 *
 * **The client is never believed about anything that matters.** Price, duration,
 * buffer, bookability, the barber↔service↔location relationship and the slot
 * itself are all read from canonical rows at the moment of the write. Those
 * fields are absent from every input type here, which is the strongest way to
 * say it: there is no field to send.
 *
 * **Nothing here takes or implies payment.** A confirmed booking records the
 * agreed price and owes it at the chair. PR 34 and PR 35 own money movement.
 */

export type BookingEngineActor = {
  /** Verified profile id, or null for a guest/kiosk booking session. */
  profileId: string | null;
  /** Opaque server-issued session key. Never a phone number or an email. */
  sessionKey: string | null;
  role: string | null;
  /** Verified account email, used only to match an existing client record. */
  email?: string | null;
  /** Populated for authenticated callers so PR 19 predicates can be reused. */
  permissionActor?: PermissionActor | null;
};

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function requireSupabase(): SupabaseAdmin {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    // Fail closed and say so. A booking surface that renders "no availability"
    // when the database is unreachable teaches people the barber is booked.
    throw new BookingEngineError("retry", "engine_unavailable");
  }

  return supabase;
}

function requireActorBinding(actor: BookingEngineActor) {
  const actorKey = resolveIdempotencyActorKey({ profileId: actor.profileId, sessionKey: actor.sessionKey });
  if (!actorKey) {
    throw new BookingEngineError("forbidden", "owner_binding_required");
  }

  return actorKey;
}

function normalizeIdempotencyKey(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isValidIdempotencyKey(value)) {
    throw new BookingEngineError("validation", "missing_required_input");
  }

  return value;
}

async function callEngine<T extends EngineOutcome>(
  supabase: SupabaseAdmin,
  fn: string,
  args: Record<string, unknown>,
  successOutcomes: string[]
): Promise<T> {
  const result = await supabase.rpc(fn, args);
  if (result.error) {
    console.warn("[booking-engine] rpc_failed", { fn, message: result.error.message });
    throw new BookingEngineError("retry", "engine_unavailable");
  }

  return unwrapEngineOutcome(result.data as T, successOutcomes);
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export type ReadAvailabilityInput = {
  barberId: string;
  serviceId: string;
  startDate?: string | null;
  days?: number;
  now?: Date;
};

/**
 * Availability is a public read: a client comparing barbers has not signed in
 * yet. It still runs server-side on the service-role client, because the
 * underlying tables are deny-by-default and because a slot list assembled in the
 * browser could be assembled differently in the browser.
 */
export async function readBookingAvailability(input: ReadAvailabilityInput): Promise<BookingAvailabilityResult> {
  const supabase = requireSupabase();
  const now = input.now ?? new Date();

  const serviceResult = await supabase
    .from("services")
    .select(SERVICE_CATALOG_COLUMNS)
    .eq("id", input.serviceId)
    .maybeSingle();

  if (serviceResult.error || !serviceResult.data) {
    throw new BookingEngineError("not_found", "service_not_found");
  }

  const service = toBookableService(serviceResult.data as ServiceCatalogRow);

  const barberResult = await supabase.from("barbers").select("id").eq("id", input.barberId).maybeSingle();
  if (barberResult.error || !barberResult.data) {
    throw new BookingEngineError("not_found", "barber_not_found");
  }

  const [policyResult, rulesResult] = await Promise.all([
    supabase
      .from("barber_booking_policies")
      .select("booking_timezone, lead_time_minutes, booking_horizon_days, slot_interval_minutes, accepts_online_booking")
      .eq("barber_id", input.barberId)
      .maybeSingle(),
    supabase
      .from("availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("barber_id", input.barberId)
  ]);

  const policy = resolveBookingPolicy(policyResult.data ?? null);

  // Read a generous window and let the pure engine bound it. Fetching exactly
  // the requested range would miss an appointment that starts before the window
  // and runs into it.
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + (policy.bookingHorizonDays + 1) * 24 * 60 * 60 * 1000).toISOString();

  const [appointmentsResult, holdsResult, blockedResult, squareResult, calendarBusyResult] = await Promise.all([
    supabase
      .from("appointments")
      .select("starts_at, ends_at, status")
      .eq("barber_id", input.barberId)
      .gte("ends_at", windowStart)
      .lte("starts_at", windowEnd),
    supabase
      .from("booking_slot_holds")
      .select("starts_at, ends_at, status, expires_at")
      .eq("barber_id", input.barberId)
      .eq("status", "active")
      .gt("expires_at", now.toISOString()),
    supabase
      .from("blocked_times")
      .select("starts_at, ends_at")
      .eq("barber_id", input.barberId)
      .gte("ends_at", windowStart)
      .lte("starts_at", windowEnd),
    supabase
      .from("chairsync_appointments")
      .select("starts_at, ends_at, status")
      .eq("barber_id", input.barberId)
      .eq("provider", "square")
      .gte("ends_at", windowStart)
      .lte("starts_at", windowEnd),
    supabase
      .from("calendar_busy_blocks")
      .select("starts_at, ends_at")
      .eq("barber_id", input.barberId)
      .gte("ends_at", windowStart)
      .lte("starts_at", windowEnd)
  ]);

  if (squareResult.error || calendarBusyResult.error) {
    // External calendar truth is availability-blocking. Treating a failed read
    // as an empty calendar would manufacture an open slot and permit a double
    // booking, so the booking decision must fail closed and be retried.
    throw new BookingEngineError("retry", "engine_unavailable");
  }

  const workingHours: WorkingHoursRule[] = ((rulesResult.data ?? []) as Array<{
    id: string;
    weekday: number;
    start_time: string;
    end_time: string;
  }>).map((rule) => ({
    weekday: rule.weekday,
    startTime: rule.start_time,
    endTime: rule.end_time,
    sourceId: rule.id
  }));

  return buildBookingAvailability({
    service,
    policy,
    workingHours,
    busyRanges: mergeBusyRanges({
      appointments: (appointmentsResult.data ?? []) as Array<{ starts_at: string; ends_at: string; status: string }>,
      holds: (holdsResult.data ?? []) as Array<{
        starts_at: string;
        ends_at: string;
        status: string;
        expires_at: string;
      }>,
      blockedTimes: [
        ...((blockedResult.data ?? []) as Array<{ starts_at: string; ends_at: string }>),
        ...((squareResult.data ?? []) as Array<{ starts_at: string; ends_at: string; status: string }>)
          .filter((appointment) => ["booked", "confirmed", "checked_in"].includes(appointment.status)),
        ...((calendarBusyResult.data ?? []) as Array<{ starts_at: string; ends_at: string }>)
      ],
      now
    }),
    startDate: input.startDate,
    days: input.days,
    now
  });
}

// ---------------------------------------------------------------------------
// Holds
// ---------------------------------------------------------------------------

export type CreateHoldInput = {
  actor: BookingEngineActor;
  barberId: string;
  serviceId: string;
  locationId?: string | null;
  startsAt: string;
  attribution: BookingAttributionInput;
  allowedDoors: readonly BookingSourceDoor[];
  fallbackDoor: BookingSourceDoor;
  idempotencyKey?: string | null;
};

export type CreateHoldResult = {
  /** Returned to the caller exactly once. Never persisted or logged. */
  holdToken: string;
  hold: BookingHold;
};

export async function createBookingHold(input: CreateHoldInput): Promise<CreateHoldResult> {
  const supabase = requireSupabase();
  const actorKey = requireActorBinding(input.actor);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

  const startsAt = new Date(input.startsAt);
  if (!Number.isFinite(startsAt.getTime())) {
    throw new BookingEngineError("validation", "missing_required_input");
  }

  const attribution = normalizeBookingAttribution(input.attribution, input.allowedDoors, input.fallbackDoor);
  const { token, tokenHash } = issueHoldToken();

  // The fingerprint covers what the request asked for, not the token: a retry
  // mints a fresh token, and it must still be recognized as the same request.
  const fingerprint = computeRequestFingerprint({
    barberId: input.barberId,
    serviceId: input.serviceId,
    locationId: input.locationId ?? null,
    startsAt: startsAt.toISOString(),
    sourceDoor: attribution.sourceDoor
  });

  const payload = await callEngine<EngineOutcome & BookingHold>(
    supabase,
    "pr20_create_slot_hold",
    {
      p_barber_id: input.barberId,
      p_service_id: input.serviceId,
      p_location_id: input.locationId ?? null,
      p_starts_at: startsAt.toISOString(),
      p_token_hash: tokenHash,
      p_owner_profile_id: input.actor.profileId,
      p_owner_session_key: input.actor.sessionKey,
      p_source_door: attribution.sourceDoor,
      p_source_surface: attribution.sourceSurface,
      p_campaign_id: attribution.campaignId,
      p_referral_code: attribution.referralCode,
      p_correlation_id: attribution.correlationId,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_actor_key: actorKey
    },
    ["created"]
  );

  await auditBooking(input.actor, "hold_create", "succeeded", {
    holdId: payload.holdId,
    barberId: input.barberId,
    serviceId: input.serviceId,
    sourceDoor: attribution.sourceDoor
  });

  return {
    holdToken: token,
    hold: {
      holdId: payload.holdId,
      barberId: payload.barberId,
      locationId: payload.locationId ?? null,
      serviceId: payload.serviceId,
      serviceName: payload.serviceName,
      serviceDurationMin: payload.serviceDurationMin,
      serviceBufferMin: payload.serviceBufferMin,
      servicePriceCents: payload.servicePriceCents,
      serviceCurrency: payload.serviceCurrency,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      expiresAt: payload.expiresAt,
      sourceDoor: payload.sourceDoor
    }
  };
}

export type ReleaseHoldInput = {
  actor: BookingEngineActor;
  holdToken: string;
};

export async function releaseBookingHold(input: ReleaseHoldInput) {
  const supabase = requireSupabase();
  requireActorBinding(input.actor);

  if (!isHoldTokenShaped(input.holdToken)) {
    throw new BookingEngineError("not_found", "hold_not_found");
  }

  const payload = await callEngine<EngineOutcome & { holdId: string; alreadyReleased: boolean }>(
    supabase,
    "pr20_release_slot_hold",
    {
      p_token_hash: hashHoldToken(input.holdToken),
      p_owner_profile_id: input.actor.profileId,
      p_owner_session_key: input.actor.sessionKey
    },
    ["released"]
  );

  return { holdId: payload.holdId, alreadyReleased: Boolean(payload.alreadyReleased) };
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

export type ConfirmBookingInput = {
  actor: BookingEngineActor;
  holdToken: string;
  clientId: string;
  clientNote?: string | null;
  idempotencyKey?: string | null;
};

export type ConfirmedBooking = {
  appointmentId: string;
  holdId: string;
  barberId: string;
  clientId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  revision: number;
  servicePriceCents: number;
  sourceDoor: string;
};

/**
 * Confirms a held slot into an appointment.
 *
 * This is the only way an appointment is created by this engine, and it requires
 * a live hold the caller owns. There is no path that books straight from a slot
 * list: an explicit confirmation is what turns a person looking at times into a
 * person with an appointment.
 */
export async function confirmBooking(input: ConfirmBookingInput): Promise<ConfirmedBooking> {
  const supabase = requireSupabase();
  try {
    await assertArchitectRuntimeControlAllows(supabase, "bookings");
  } catch (error) {
    if (error instanceof ArchitectRuntimeControlError) {
      throw new BookingEngineError("retry", "bookings_paused", error.message, {
        controlKey: error.controlKey
      });
    }
    throw error;
  }
  const actorKey = requireActorBinding(input.actor);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

  if (!isHoldTokenShaped(input.holdToken)) {
    throw new BookingEngineError("not_found", "hold_not_found");
  }

  const tokenHash = hashHoldToken(input.holdToken);
  const fingerprint = computeRequestFingerprint({
    tokenHash,
    clientId: input.clientId,
    clientNote: input.clientNote ?? null
  });

  const payload = await callEngine<EngineOutcome & ConfirmedBooking>(
    supabase,
    "pr20_confirm_booking",
    {
      p_token_hash: tokenHash,
      p_owner_profile_id: input.actor.profileId,
      p_owner_session_key: input.actor.sessionKey,
      p_client_id: input.clientId,
      p_actor_profile_id: input.actor.profileId,
      p_actor_role: input.actor.role,
      p_client_note: input.clientNote ?? null,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_actor_key: actorKey
    },
    ["confirmed"]
  );

  await auditBooking(input.actor, "booking_confirm", "succeeded", {
    appointmentId: payload.appointmentId,
    barberId: payload.barberId,
    sourceDoor: payload.sourceDoor
  });

  return {
    appointmentId: payload.appointmentId,
    holdId: payload.holdId,
    barberId: payload.barberId,
    clientId: payload.clientId,
    serviceId: payload.serviceId,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
    status: payload.status,
    revision: payload.revision,
    servicePriceCents: payload.servicePriceCents,
    sourceDoor: payload.sourceDoor
  };
}

// ---------------------------------------------------------------------------
// Reschedule and cancel
// ---------------------------------------------------------------------------

export type RescheduleBookingInput = {
  actor: BookingEngineActor;
  appointmentId: string;
  expectedRevision: number;
  holdToken: string;
  reason?: string | null;
  idempotencyKey?: string | null;
};

export async function rescheduleBooking(input: RescheduleBookingInput) {
  const supabase = requireSupabase();
  const actorKey = requireActorBinding(input.actor);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

  if (!isExpectedRevision(input.expectedRevision)) {
    throw new BookingEngineError("validation", "missing_required_input");
  }

  if (!isHoldTokenShaped(input.holdToken)) {
    throw new BookingEngineError("not_found", "hold_not_found");
  }

  await assertBookingAction(supabase, input.actor, input.appointmentId, "reschedule");

  const tokenHash = hashHoldToken(input.holdToken);
  const fingerprint = computeRequestFingerprint({
    appointmentId: input.appointmentId,
    expectedRevision: input.expectedRevision,
    tokenHash
  });

  const payload = await callEngine<EngineOutcome & {
    appointmentId: string;
    holdId: string;
    startsAt: string;
    endsAt: string;
    previousStartsAt: string;
    revision: number;
  }>(
    supabase,
    "pr20_reschedule_booking",
    {
      p_appointment_id: input.appointmentId,
      p_expected_revision: input.expectedRevision,
      p_token_hash: tokenHash,
      p_actor_profile_id: input.actor.profileId,
      p_actor_role: input.actor.role,
      p_reason: normalizeCancellationReason(input.reason),
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_actor_key: actorKey
    },
    ["rescheduled"]
  );

  await auditBooking(input.actor, "booking_reschedule", "succeeded", {
    appointmentId: payload.appointmentId,
    revision: payload.revision
  });

  return {
    appointmentId: payload.appointmentId,
    holdId: payload.holdId,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
    previousStartsAt: payload.previousStartsAt,
    revision: payload.revision
  };
}

export type CancelBookingInput = {
  actor: BookingEngineActor;
  appointmentId: string;
  expectedRevision: number;
  reason?: string | null;
  idempotencyKey?: string | null;
};

export async function cancelBooking(input: CancelBookingInput) {
  const supabase = requireSupabase();
  const actorKey = requireActorBinding(input.actor);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);

  if (!isExpectedRevision(input.expectedRevision)) {
    throw new BookingEngineError("validation", "missing_required_input");
  }

  await assertBookingAction(supabase, input.actor, input.appointmentId, "cancel");

  const reason = normalizeCancellationReason(input.reason);
  const fingerprint = computeRequestFingerprint({
    appointmentId: input.appointmentId,
    expectedRevision: input.expectedRevision,
    reason
  });

  const payload = await callEngine<EngineOutcome & {
    appointmentId: string;
    alreadyCancelled: boolean;
    revision: number;
  }>(
    supabase,
    "pr20_cancel_booking",
    {
      p_appointment_id: input.appointmentId,
      p_expected_revision: input.expectedRevision,
      p_actor_profile_id: input.actor.profileId,
      p_actor_role: input.actor.role,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_actor_key: actorKey
    },
    ["cancelled"]
  );

  await auditBooking(input.actor, "booking_cancel", "succeeded", {
    appointmentId: payload.appointmentId,
    revision: payload.revision
  });

  return {
    appointmentId: payload.appointmentId,
    alreadyCancelled: Boolean(payload.alreadyCancelled),
    revision: payload.revision
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type BookingAppointmentView = {
  appointmentId: string;
  barberId: string;
  clientId: string;
  serviceId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  revision: number;
  cancellationReason: string | null;
  service: {
    name: string;
    durationMin: number;
    bufferMin: number;
    priceCents: number;
    currency: string;
  } | null;
  attribution: {
    sourceDoor: string;
    campaignId: string | null;
    referralCode: string | null;
  } | null;
};

export async function readBookingAppointment(actor: BookingEngineActor, appointmentId: string) {
  const supabase = requireSupabase();
  const relationship = await resolveBookingRelationship(supabase, actor, appointmentId);
  if (!relationship) {
    // Not-found rather than forbidden: telling a stranger that an appointment
    // exists is itself a disclosure.
    throw new BookingEngineError("not_found", "appointment_not_found");
  }

  const result = await supabase
    .from("appointments")
    .select("id, barber_id, client_id, service_id, status, starts_at, ends_at, lifecycle_revision, cancellation_reason")
    .eq("id", appointmentId)
    .maybeSingle();

  if (result.error || !result.data) {
    throw new BookingEngineError("not_found", "appointment_not_found");
  }

  const row = result.data as {
    id: string;
    barber_id: string;
    client_id: string;
    service_id: string;
    status: string;
    starts_at: string;
    ends_at: string;
    lifecycle_revision: number | null;
    cancellation_reason: string | null;
  };

  const [snapshotResult, attributionResult] = await Promise.all([
    supabase
      .from("appointment_service_snapshots")
      .select("service_name, duration_min, buffer_min, price_cents, currency")
      .eq("appointment_id", appointmentId)
      .maybeSingle(),
    supabase
      .from("booking_attributions")
      .select("original_source_door, campaign_id, referral_code")
      .eq("appointment_id", appointmentId)
      .maybeSingle()
  ]);

  const snapshot = snapshotResult.data as {
    service_name: string;
    duration_min: number;
    buffer_min: number;
    price_cents: number;
    currency: string;
  } | null;

  const attribution = attributionResult.data as {
    original_source_door: string;
    campaign_id: string | null;
    referral_code: string | null;
  } | null;

  return {
    appointmentId: row.id,
    barberId: row.barber_id,
    clientId: row.client_id,
    serviceId: row.service_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    revision: row.lifecycle_revision ?? 1,
    cancellationReason: row.cancellation_reason,
    service: snapshot
      ? {
          name: snapshot.service_name,
          durationMin: snapshot.duration_min,
          bufferMin: snapshot.buffer_min,
          priceCents: snapshot.price_cents,
          currency: snapshot.currency
        }
      : null,
    attribution: attribution
      ? {
          sourceDoor: attribution.original_source_door,
          campaignId: attribution.campaign_id,
          referralCode: attribution.referral_code
        }
      : null
  } satisfies BookingAppointmentView;
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/**
 * Resolves what this actor *is* to this booking, from canonical rows.
 *
 * Returning null means "no relationship", which callers translate into
 * not-found rather than forbidden. A guest booking session has no profile and
 * therefore no relationship: guests may hold and confirm through a
 * server-controlled action, but changing an existing booking requires an
 * account. Guest-to-account conversion is PR 23.
 */
async function resolveBookingRelationship(
  supabase: SupabaseAdmin,
  actor: BookingEngineActor,
  appointmentId: string
): Promise<BookingActorRelationship | null> {
  if (!actor.profileId) {
    return null;
  }

  const appointmentResult = await supabase
    .from("appointments")
    .select("id, barber_id, client_id, location_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (appointmentResult.error || !appointmentResult.data) {
    return null;
  }

  const appointment = appointmentResult.data as {
    barber_id: string;
    client_id: string;
    location_id: string;
  };

  const [clientResult, barberResult] = await Promise.all([
    supabase.from("clients").select("profile_id").eq("id", appointment.client_id).maybeSingle(),
    supabase.from("barbers").select("profile_id").eq("id", appointment.barber_id).maybeSingle()
  ]);

  if ((clientResult.data as { profile_id: string | null } | null)?.profile_id === actor.profileId) {
    return "client_of_record";
  }

  if ((barberResult.data as { profile_id: string | null } | null)?.profile_id === actor.profileId) {
    return "barber_of_record";
  }

  const permissionActor = actor.permissionActor;
  if (permissionActor && hasInternalAccess(permissionActor)) {
    return "internal_operator";
  }

  const operatorResult = await supabase
    .from("shop_operator_access")
    .select("shop_id, location_id, status")
    .eq("profile_id", actor.profileId)
    .eq("status", "active");

  const operatorRows = (operatorResult.data ?? []) as Array<{ shop_id: string; location_id: string | null }>;
  if (operatorRows.some((row) => row.location_id === appointment.location_id)) {
    return "shop_operator";
  }

  // A shop operator recorded against the shop rather than a specific location
  // still acts inside that business; PR 19 owns that predicate.
  if (permissionActor) {
    for (const row of operatorRows) {
      if (await isShopMemberOf(permissionActor, row.shop_id)) {
        return "shop_operator";
      }
    }
  }

  return null;
}

async function assertBookingAction(
  supabase: SupabaseAdmin,
  actor: BookingEngineActor,
  appointmentId: string,
  action: Pr20BookingAction
) {
  const relationship = await resolveBookingRelationship(supabase, actor, appointmentId);

  if (!relationship) {
    await auditBooking(actor, `booking_${action}`, "denied", { appointmentId, reason: "no_relationship" });
    throw new BookingEngineError("not_found", "appointment_not_found");
  }

  if (!relationshipMayPerform(relationship, action)) {
    await auditBooking(actor, `booking_${action}`, "denied", { appointmentId, relationship });
    throw new BookingEngineError("forbidden", "actor_not_permitted");
  }

  return relationship;
}

/**
 * Booking decisions are mirrored into the PR 19 identity audit, which redacts
 * credential-shaped values before writing and is append-only in the database.
 * Only identifiers go in — never a hold token, an idempotency key, or a name.
 */
async function auditBooking(
  actor: BookingEngineActor,
  action: string,
  outcome: "succeeded" | "denied" | "failed",
  metadata: Record<string, unknown>
) {
  await recordIdentityAuditEvent({
    actor: actor.permissionActor
      ? {
          id: actor.permissionActor.id,
          role: actor.permissionActor.role,
          platformAdmin: actor.permissionActor.platformAdmin
        }
      : null,
    source: "booking_engine",
    entityType: "booking",
    entityId: typeof metadata.appointmentId === "string" ? metadata.appointmentId : null,
    action,
    outcome,
    metadata
  });
}
