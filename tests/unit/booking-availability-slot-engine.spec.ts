import { describe, expect, it } from "vitest";
import { buildCanonicalDateAvailability } from "@/lib/booking/availability-slot-engine";

const timezone = "America/New_York";
const productionSunday = "2026-06-14";

function buildAvailability(overrides: Partial<Parameters<typeof buildCanonicalDateAvailability>[0]> = {}) {
  return buildCanonicalDateAvailability({
    date: productionSunday,
    timezone,
    workingWindows: [{
      startTime: "12:00",
      endTime: "19:00",
      sourceId: "dashboard-open-window"
    }],
    busyRanges: [],
    serviceDurationMinutes: 30,
    slotIntervalMinutes: 30,
    currentTime: new Date("2026-06-14T15:30:00.000Z"),
    ...overrides
  });
}

describe("canonical booking availability slot engine", () => {
  it("uses the same open window to expose dashboard windows and client bookable slots", () => {
    const availability = buildAvailability();

    expect(availability.timezone).toBe(timezone);
    expect(availability.openWindows).toHaveLength(1);
    expect(availability.openWindows[0]).toMatchObject({
      startsAt: "2026-06-14T16:00:00.000Z",
      endsAt: "2026-06-14T23:00:00.000Z",
      durationMinutes: 420
    });
    expect(availability.bookableSlots).toHaveLength(14);
    expect(availability.bookableSlots[0]).toMatchObject({
      startsAt: "2026-06-14T16:00:00.000Z",
      endsAt: "2026-06-14T16:30:00.000Z"
    });
    expect(availability.bookableSlots[availability.bookableSlots.length - 1]).toMatchObject({
      startsAt: "2026-06-14T22:30:00.000Z",
      endsAt: "2026-06-14T23:00:00.000Z"
    });
  });

  it("removes slots that overlap existing appointments", () => {
    const availability = buildAvailability({
      busyRanges: [{
        startsAt: "2026-06-14T17:00:00.000Z",
        endsAt: "2026-06-14T17:30:00.000Z"
      }]
    });

    expect(availability.bookableSlots.map((slot) => slot.startsAt)).not.toContain("2026-06-14T17:00:00.000Z");
    expect(availability.bookableSlots.map((slot) => slot.startsAt)).toContain("2026-06-14T16:30:00.000Z");
    expect(availability.bookableSlots.map((slot) => slot.startsAt)).toContain("2026-06-14T17:30:00.000Z");
  });

  it("removes slots that overlap blocked time", () => {
    const availability = buildAvailability({
      busyRanges: [{
        startsAt: "2026-06-14T18:00:00.000Z",
        endsAt: "2026-06-14T19:00:00.000Z"
      }]
    });

    const slotStarts = availability.bookableSlots.map((slot) => slot.startsAt);
    expect(slotStarts).not.toContain("2026-06-14T18:00:00.000Z");
    expect(slotStarts).not.toContain("2026-06-14T18:30:00.000Z");
    expect(slotStarts).toContain("2026-06-14T19:00:00.000Z");
  });

  it("hides past same-day slots while keeping future same-day slots", () => {
    const availability = buildAvailability({
      currentTime: new Date("2026-06-14T18:10:00.000Z")
    });

    expect(availability.bookableSlots[0]?.startsAt).toBe("2026-06-14T18:30:00.000Z");
    expect(availability.bookableSlots.map((slot) => slot.startsAt)).not.toContain("2026-06-14T18:00:00.000Z");
  });

  it("returns a clear no-window state for dates without working hours", () => {
    const availability = buildAvailability({
      date: "2026-06-17",
      workingWindows: []
    });

    expect(availability.openWindows).toEqual([]);
    expect(availability.bookableSlots).toEqual([]);
    expect(availability.unavailableReason).toBe("no_working_window");
  });
});
