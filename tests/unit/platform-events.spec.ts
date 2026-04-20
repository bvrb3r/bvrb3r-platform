import { describe, expect, it, vi } from "vitest";
import {
  buildBookingCreatedPlatformEvent,
  buildBookingUpdatedPlatformEvents
} from "@/lib/core/booking-events";
import {
  PLATFORM_EVENT_TYPES,
  buildPlatformEventIdempotencyKey,
  buildPlatformEventRow,
  queryPlatformEventsByEntity,
  recordPlatformEvent,
  type PlatformEventInput
} from "@/lib/core/platform-events";

function makeSupabaseMock() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const order = vi.fn().mockResolvedValue({ data: [], error: null });
  const eqSecond = vi.fn(() => ({ order }));
  const eqFirst = vi.fn(() => ({ eq: eqSecond }));
  const select = vi.fn(() => ({ eq: eqFirst }));
  const from = vi.fn(() => ({ insert, upsert, select }));

  return {
    supabase: { from } as never,
    from,
    insert,
    upsert,
    select,
    eqFirst,
    eqSecond,
    order
  };
}

const baseEvent: PlatformEventInput = {
  eventType: "booking_created",
  entityType: "appointment",
  entityId: "appt-live-1",
  actorId: "profile-client",
  actorRole: "client",
  source: "api",
  relatedIds: {
    appointmentId: "appt-live-1",
    barberId: "barber-live-1",
    ignored: undefined
  },
  payload: {
    status: "booked",
    ignored: undefined
  },
  idempotencyKey: "booking:appt-live-1:created",
  occurredAt: "2026-04-20T10:00:00.000Z"
};

describe("platform events core", () => {
  it("defines every Phase 1 transition event required for AI and audit", () => {
    expect(PLATFORM_EVENT_TYPES).toEqual(expect.arrayContaining([
      "booking_created",
      "booking_updated",
      "payment_succeeded",
      "payment_failed",
      "payout_released",
      "dispute_created",
      "verification_updated",
      "booking_canceled",
      "booking_rescheduled",
      "booking_completed",
      "points_earned",
      "points_redeemed",
      "verification_approved",
      "verification_rejected"
    ]));
  });

  it("normalizes structured event rows without leaking undefined fields", () => {
    const row = buildPlatformEventRow(baseEvent);

    expect(row).toMatchObject({
      event_type: "booking_created",
      entity_type: "appointment",
      entity_id: "appt-live-1",
      actor_id: "profile-client",
      actor_role: "client",
      source: "api",
      idempotency_key: "booking:appt-live-1:created",
      occurred_at: "2026-04-20T10:00:00.000Z"
    });
    expect(row.related_ids).toEqual({
      appointmentId: "appt-live-1",
      barberId: "barber-live-1"
    });
    expect(row.payload).toEqual({ status: "booked" });
  });

  it("uses idempotent upserts when an idempotency key is present", async () => {
    const mock = makeSupabaseMock();

    const result = await recordPlatformEvent(mock.supabase, baseEvent);

    expect(result.ok).toBe(true);
    expect(mock.from).toHaveBeenCalledWith("platform_events");
    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: "booking:appt-live-1:created" }),
      { onConflict: "idempotency_key", ignoreDuplicates: true }
    );
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("inserts non-idempotent events and supports entity queries", async () => {
    const mock = makeSupabaseMock();

    await recordPlatformEvent(mock.supabase, {
      ...baseEvent,
      idempotencyKey: null
    });
    await queryPlatformEventsByEntity(mock.supabase, "appointment", "appt-live-1");

    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ idempotency_key: null }));
    expect(mock.select).toHaveBeenCalledWith("*");
    expect(mock.eqFirst).toHaveBeenCalledWith("entity_type", "appointment");
    expect(mock.eqSecond).toHaveBeenCalledWith("entity_id", "appt-live-1");
    expect(mock.order).toHaveBeenCalledWith("occurred_at", { ascending: false });
  });

  it("builds booking lifecycle events from the canonical appointment mutation result", () => {
    const appointment = {
      id: "appt-live-2",
      clientId: "client-live",
      barberId: "barber-live",
      locationId: "loc-live",
      serviceId: "svc-live",
      status: "completed",
      start: "2026-04-20T16:00:00.000Z",
      end: "2026-04-20T16:45:00.000Z",
      updatedAt: "2026-04-20T16:45:00.000Z",
      revision: 4,
      lastEventType: "service_complete"
    };

    const created = buildBookingCreatedPlatformEvent({
      appointment,
      actorId: "profile-client",
      actorRole: "client",
      source: "api",
      route: "/api/bookings"
    });
    const completed = buildBookingUpdatedPlatformEvents({
      appointment,
      actorId: "profile-barber",
      actorRole: "barber",
      source: "api",
      route: "/api/barber/appointments/[id]/complete",
      lifecycleEvent: "completed"
    });

    expect(created.eventType).toBe("booking_created");
    expect(created.relatedIds).toMatchObject({
      appointmentId: "appt-live-2",
      clientId: "client-live",
      barberId: "barber-live"
    });
    expect(completed.map((event) => event.eventType)).toEqual(["booking_updated", "booking_completed"]);
    expect(completed[0]?.idempotencyKey).toBe(buildPlatformEventIdempotencyKey([
      "booking",
      "appt-live-2",
      "booking_updated",
      4
    ]));
  });
});
