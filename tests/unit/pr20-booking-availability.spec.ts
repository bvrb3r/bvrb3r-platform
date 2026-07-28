import { describe, expect, it } from "vitest";
import {
  buildBookingAvailability,
  mergeBusyRanges,
  reservedMinutesForService,
  resolveBookingPolicy,
  type BookableServiceShape,
  type BookingAvailabilityPolicy,
  type WorkingHoursRule
} from "@/lib/booking/engine/availability";
import { servicePriceCents, toBookableService } from "@/lib/booking/engine/service-catalog";

/**
 * Availability is the part of booking that is wrong most often and noticed
 * latest: a slot offered across a DST boundary, a slot that ignores the
 * barber's cleanup buffer, a slot someone else is already holding. Every one of
 * those produces a real person standing in a shop that is not expecting them.
 *
 * These run against the pure engine with an injected clock, which is what makes
 * the DST cases testable at all — nobody can wait for March to run a test.
 */

const NEW_YORK: BookingAvailabilityPolicy = {
  timezone: "America/New_York",
  leadTimeMinutes: 15,
  bookingHorizonDays: 60,
  slotIntervalMinutes: 15,
  acceptsOnlineBooking: true
};

const WEEKEND_HOURS: WorkingHoursRule[] = [
  { weekday: 0, startTime: "09:00", endTime: "17:00", sourceId: "sun" },
  { weekday: 6, startTime: "09:00", endTime: "17:00", sourceId: "sat" }
];

function service(overrides: Partial<BookableServiceShape> = {}): BookableServiceShape {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Signature cut",
    durationMin: 30,
    bufferMin: 0,
    priceCents: 4500,
    currency: "usd",
    active: true,
    bookable: true,
    ...overrides
  };
}

describe("timezone and DST boundaries", () => {
  // 2026-03-07 is the Saturday before US spring-forward; 2026-03-08 is the
  // Sunday it happens. 09:00 in the shop is 14:00Z on one and 13:00Z on the
  // other, and the shop does not experience that as a change.
  it("anchors the working day to shop-local time the day before spring-forward", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.slots[0].startsAt).toBe("2026-03-07T14:00:00.000Z");
  });

  it("anchors the working day to shop-local time on the spring-forward day itself", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-08",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    // One hour earlier in UTC than the previous day, because the clock moved.
    expect(result.slots[0].startsAt).toBe("2026-03-08T13:00:00.000Z");
  });

  it("anchors the working day correctly across fall-back", () => {
    const saturday = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-10-31",
      days: 1,
      now: new Date("2026-10-25T12:00:00.000Z")
    });
    const sunday = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-11-01",
      days: 1,
      now: new Date("2026-10-25T12:00:00.000Z")
    });

    expect(saturday.slots[0].startsAt).toBe("2026-10-31T13:00:00.000Z");
    expect(sunday.slots[0].startsAt).toBe("2026-11-01T14:00:00.000Z");
  });

  it("produces different instants for the same wall clock in a different zone", () => {
    const pacific = buildBookingAvailability({
      service: service(),
      policy: { ...NEW_YORK, timezone: "America/Los_Angeles" },
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(pacific.timezone).toBe("America/Los_Angeles");
    expect(pacific.slots[0].startsAt).toBe("2026-03-07T17:00:00.000Z");
  });

  it("falls back to the default zone rather than throwing on a junk timezone", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: { ...NEW_YORK, timezone: "Not/A_Zone" },
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.timezone).toBe("America/New_York");
    expect(result.slots.length).toBeGreaterThan(0);
  });
});

describe("opening and closing edges", () => {
  it("offers a slot that starts exactly at opening", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.slots[0].startsAt).toBe("2026-03-07T14:00:00.000Z");
  });

  it("never offers a slot that would run past closing", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    const closing = new Date("2026-03-07T22:00:00.000Z").getTime();
    for (const slot of result.slots) {
      expect(new Date(slot.endsAt).getTime()).toBeLessThanOrEqual(closing);
    }
    expect(result.slots.at(-1)!.endsAt).toBe("2026-03-07T22:00:00.000Z");
  });

  it("reserves the cleanup buffer, so a service that no longer fits is not offered", () => {
    const withBuffer = buildBookingAvailability({
      service: service({ durationMin: 30, bufferMin: 15 }),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(withBuffer.reservedMinutes).toBe(45);
    // 45 minutes of reserved time cannot end after 17:00, so the last start is
    // 16:15 local rather than 16:30.
    expect(withBuffer.slots.at(-1)!.startsAt).toBe("2026-03-07T21:15:00.000Z");
    expect(withBuffer.slots.at(-1)!.endsAt).toBe("2026-03-07T22:00:00.000Z");
  });

  it("reports the reason when a service is longer than any open window", () => {
    const result = buildBookingAvailability({
      service: service({ durationMin: 600 }),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.slots).toEqual([]);
    // Not "fully blocked": the day is wide open, the service is simply longer
    // than the shift. Collapsing the two would send someone hunting for a
    // different day when no day would ever work.
    expect(result.unavailableReason).toBe("service_duration_exceeds_open_window");
  });
});

describe("lead time and horizon", () => {
  it("suppresses slots inside the lead time", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: { ...NEW_YORK, leadTimeMinutes: 120 },
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      // Mid-morning in the shop: 10:00 EST.
      now: new Date("2026-03-07T15:00:00.000Z")
    });

    const earliest = new Date(result.slots[0].startsAt).getTime();
    expect(earliest).toBeGreaterThanOrEqual(new Date("2026-03-07T17:00:00.000Z").getTime());
  });

  it("refuses a start date beyond the booking horizon", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: { ...NEW_YORK, bookingHorizonDays: 7 },
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-06-06",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.slots).toEqual([]);
    expect(result.unavailableReason).toBe("outside_booking_horizon");
  });

  it("stops generating days once the horizon is crossed", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: { ...NEW_YORK, bookingHorizonDays: 3 },
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-01",
      days: 30,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.days.length).toBeLessThanOrEqual(4);
  });

  it("resolves a past start date forward to today rather than erroring", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2020-01-01",
      days: 2,
      now: new Date("2026-03-07T12:00:00.000Z")
    });

    expect(result.days[0].date).toBe("2026-03-07");
  });
});

describe("what counts as busy", () => {
  const holdWindow = { starts_at: "2026-03-07T14:00:00.000Z", ends_at: "2026-03-07T14:30:00.000Z" };

  it("treats a live hold as busy", () => {
    const busy = mergeBusyRanges({
      appointments: [],
      holds: [{ ...holdWindow, status: "active", expires_at: "2026-03-01T12:05:00.000Z" }],
      blockedTimes: [],
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(busy).toHaveLength(1);

    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: busy,
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.slots[0].startsAt).toBe("2026-03-07T14:30:00.000Z");
  });

  it("stops treating a hold as busy once it has expired, with no cleanup step", () => {
    const busy = mergeBusyRanges({
      appointments: [],
      holds: [{ ...holdWindow, status: "active", expires_at: "2026-03-01T11:59:00.000Z" }],
      blockedTimes: [],
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(busy).toEqual([]);

    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: busy,
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.slots[0].startsAt).toBe("2026-03-07T14:00:00.000Z");
  });

  it("ignores a released or consumed hold", () => {
    const busy = mergeBusyRanges({
      appointments: [],
      holds: [
        { ...holdWindow, status: "released", expires_at: "2026-03-01T12:05:00.000Z" },
        { ...holdWindow, status: "consumed", expires_at: "2026-03-01T12:05:00.000Z" }
      ],
      blockedTimes: [],
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(busy).toEqual([]);
  });

  it("treats a confirmed appointment as busy and a cancelled one as free", () => {
    const busy = mergeBusyRanges({
      appointments: [
        { ...holdWindow, status: "confirmed" },
        { starts_at: "2026-03-07T15:00:00.000Z", ends_at: "2026-03-07T15:30:00.000Z", status: "cancelled" },
        { starts_at: "2026-03-07T16:00:00.000Z", ends_at: "2026-03-07T16:30:00.000Z", status: "no_show" }
      ],
      holds: [],
      blockedTimes: [],
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(busy).toEqual([{ startsAt: holdWindow.starts_at, endsAt: holdWindow.ends_at }]);
  });

  it("treats blocked time as busy", () => {
    const busy = mergeBusyRanges({
      appointments: [],
      holds: [],
      blockedTimes: [{ starts_at: "2026-03-07T14:00:00.000Z", ends_at: "2026-03-07T18:00:00.000Z" }],
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: busy,
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.slots[0].startsAt).toBe("2026-03-07T18:00:00.000Z");
  });

  it("reports a specific reason when the whole day is blocked", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: WEEKEND_HOURS,
      busyRanges: [{ startsAt: "2026-03-07T13:00:00.000Z", endsAt: "2026-03-07T23:00:00.000Z" }],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.slots).toEqual([]);
    expect(result.unavailableReason).toBe("fully_blocked_or_past");
  });
});

describe("closed doors are stated, not implied by an empty list", () => {
  it("says the barber is not taking online bookings", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: { ...NEW_YORK, acceptsOnlineBooking: false },
      workingHours: WEEKEND_HOURS,
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.unavailableReason).toBe("barber_not_accepting_bookings");
    expect(result.slots).toEqual([]);
  });

  it("says an inactive service is not bookable", () => {
    for (const overrides of [{ active: false }, { bookable: false }, { durationMin: 0, bufferMin: 0 }]) {
      const result = buildBookingAvailability({
        service: service(overrides),
        policy: NEW_YORK,
        workingHours: WEEKEND_HOURS,
        busyRanges: [],
        startDate: "2026-03-07",
        days: 1,
        now: new Date("2026-03-01T12:00:00.000Z")
      });

      expect(result.unavailableReason).toBe("service_not_bookable");
    }
  });

  it("says there is no working window on a day the barber does not work", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.unavailableReason).toBe("no_working_window");
    expect(result.days[0].unavailableReason).toBe("no_working_window");
  });

  it("ignores a working-hours row with an impossible weekday rather than shifting the week", () => {
    const result = buildBookingAvailability({
      service: service(),
      policy: NEW_YORK,
      workingHours: [
        { weekday: 9, startTime: "09:00", endTime: "17:00" },
        ...WEEKEND_HOURS
      ],
      busyRanges: [],
      startDate: "2026-03-07",
      days: 1,
      now: new Date("2026-03-01T12:00:00.000Z")
    });

    expect(result.slots[0].startsAt).toBe("2026-03-07T14:00:00.000Z");
  });
});

describe("policy resolution", () => {
  it("falls back to defaults when a barber has no policy row", () => {
    expect(resolveBookingPolicy(null)).toEqual({
      timezone: "America/New_York",
      leadTimeMinutes: 15,
      bookingHorizonDays: 60,
      slotIntervalMinutes: 15,
      acceptsOnlineBooking: true
    });
  });

  it("clamps stored values rather than refusing to show any availability", () => {
    const policy = resolveBookingPolicy({
      booking_timezone: "America/Chicago",
      lead_time_minutes: -50,
      booking_horizon_days: 9999,
      slot_interval_minutes: 1,
      accepts_online_booking: false
    });

    expect(policy).toEqual({
      timezone: "America/Chicago",
      leadTimeMinutes: 0,
      bookingHorizonDays: 365,
      slotIntervalMinutes: 5,
      acceptsOnlineBooking: false
    });
  });
});

describe("service catalog projection", () => {
  it("reads integer cents from the generated column", () => {
    expect(servicePriceCents({ price_cents: 4500, price: 45 })).toBe(4500);
  });

  it("rounds once at the boundary when only the legacy price exists", () => {
    expect(servicePriceCents({ price_cents: null, price: "45.55" })).toBe(4555);
    expect(servicePriceCents({ price_cents: undefined, price: 0 })).toBe(0);
  });

  it("marks a service unbookable when the catalog says so", () => {
    const projected = toBookableService({
      id: "s1",
      name: "Fade",
      duration_min: 30,
      buffer_min: 10,
      price: 40,
      price_cents: 4000,
      currency: "USD",
      active: true,
      is_bookable: false
    });

    expect(projected.bookable).toBe(false);
    expect(projected.currency).toBe("usd");
    expect(reservedMinutesForService(projected)).toBe(40);
  });
});
