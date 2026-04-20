import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildPlatformEventIdempotencyKey,
  recordPlatformEvent,
  recordPlatformEvents,
  type PlatformEventInput,
  type PlatformEventSource,
  type PlatformEventType
} from "@/lib/core/platform-events";
import type { LiveActorRole } from "@/lib/operations/live-state";

type BookingEventAppointment = {
  id: string;
  clientId: string;
  barberId: string;
  locationId: string;
  serviceId: string;
  status: string;
  start?: string;
  end?: string;
  updatedAt?: string;
  revision?: number;
  lastEventType?: string;
};

type BookingEventInput = {
  appointment: BookingEventAppointment;
  actorId?: string | null;
  actorRole?: LiveActorRole | string | null;
  source: PlatformEventSource;
  route?: string;
  context?: Record<string, unknown>;
};

function buildBookingEvent(
  eventType: PlatformEventType,
  input: BookingEventInput
): PlatformEventInput {
  const appointment = input.appointment;
  const version = appointment.revision ?? appointment.updatedAt ?? new Date().toISOString();

  return {
    eventType,
    entityType: "appointment",
    entityId: appointment.id,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    source: input.source,
    relatedIds: {
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      barberId: appointment.barberId,
      locationId: appointment.locationId,
      serviceId: appointment.serviceId
    },
    payload: {
      status: appointment.status,
      start: appointment.start,
      end: appointment.end,
      revision: appointment.revision,
      lastEventType: appointment.lastEventType,
      route: input.route,
      ...(input.context ?? {})
    },
    idempotencyKey: buildPlatformEventIdempotencyKey(["booking", appointment.id, eventType, version]),
    occurredAt: appointment.updatedAt ?? null
  };
}

async function recordBookingEventInputs(inputs: PlatformEventInput[]) {
  const supabase = createSupabaseAdminClient();
  await recordPlatformEvents(supabase, inputs);
}

export function buildBookingCreatedPlatformEvent(input: BookingEventInput) {
  return buildBookingEvent("booking_created", input);
}

export function buildBookingUpdatedPlatformEvents(
  input: BookingEventInput & { lifecycleEvent?: "updated" | "canceled" | "completed" | "rescheduled" }
) {
  const events = [buildBookingEvent("booking_updated", input)];
  if (input.lifecycleEvent === "canceled") {
    events.push(buildBookingEvent("booking_canceled", input));
  }
  if (input.lifecycleEvent === "completed") {
    events.push(buildBookingEvent("booking_completed", input));
  }
  if (input.lifecycleEvent === "rescheduled") {
    events.push(buildBookingEvent("booking_rescheduled", input));
  }
  return events;
}

export async function recordBookingCreatedPlatformEvent(input: BookingEventInput) {
  const supabase = createSupabaseAdminClient();
  await recordPlatformEvent(supabase, buildBookingCreatedPlatformEvent(input));
}

export async function recordBookingUpdatedPlatformEvents(
  input: BookingEventInput & { lifecycleEvent?: "updated" | "canceled" | "completed" | "rescheduled" }
) {
  await recordBookingEventInputs(buildBookingUpdatedPlatformEvents(input));
}
