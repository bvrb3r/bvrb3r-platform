import { describe, expect, it } from "vitest";
import {
  buildBarberScheduleRange,
  normalizeBarberStatusInput,
  normalizeWorkingHoursRows,
  shiftBarberScheduleAnchorDate
} from "@/lib/barber/domain";

describe("phase 10 barber tools domain", () => {
  it("forces offline status to disable online visibility and walk-ins", () => {
    const normalized = normalizeBarberStatusInput({
      liveStatus: "offline",
      isOnline: true,
      acceptsWalkIns: true,
      currentShopId: "loc-ybor"
    });

    expect(normalized.liveStatus).toBe("offline");
    expect(normalized.isOnline).toBe(false);
    expect(normalized.acceptsWalkIns).toBe(false);
    expect(normalized.currentShopId).toBe("loc-ybor");
  });

  it("keeps available online status intact when the barber is active", () => {
    const normalized = normalizeBarberStatusInput({
      liveStatus: "available",
      isOnline: true,
      acceptsWalkIns: true
    });

    expect(normalized.liveStatus).toBe("available");
    expect(normalized.isOnline).toBe(true);
    expect(normalized.acceptsWalkIns).toBe(true);
  });

  it("rejects overlapping working hours on the same day", () => {
    expect(() =>
      normalizeWorkingHoursRows([
        { weekday: 2, startTime: "09:00", endTime: "12:00" },
        { weekday: 2, startTime: "11:30", endTime: "15:00" }
      ])
    ).toThrow(/cannot overlap/i);
  });

  it("accepts valid working hours and sorts them safely", () => {
    const normalized = normalizeWorkingHoursRows([
      { weekday: 5, startTime: "13:00", endTime: "18:00" },
      { weekday: 1, startTime: "09:00", endTime: "17:00" },
      { weekday: 5, startTime: "09:00", endTime: "12:00" }
    ]);

    expect(normalized).toEqual([
      { weekday: 1, startTime: "09:00", endTime: "17:00" },
      { weekday: 5, startTime: "09:00", endTime: "12:00" },
      { weekday: 5, startTime: "13:00", endTime: "18:00" }
    ]);
  });

  it("builds a day range from the selected anchor date", () => {
    const range = buildBarberScheduleRange("day", "2026-03-12");

    expect(range.rangeStart).toBe("2026-03-12");
    expect(range.rangeEnd).toBe("2026-03-12");
  });

  it("builds a full week range around the selected anchor date", () => {
    const range = buildBarberScheduleRange("week", "2026-03-25");

    expect(range.rangeStart).toBe("2026-03-22");
    expect(range.rangeEnd).toBe("2026-03-28");
  });

  it("builds a month range and shifts it cleanly for navigation", () => {
    const range = buildBarberScheduleRange("month", "2026-03-25");

    expect(range.rangeStart).toBe("2026-03-01");
    expect(range.rangeEnd).toBe("2026-03-31");
    expect(shiftBarberScheduleAnchorDate("month", "2026-03-25", 1)).toBe("2026-04-25");
  });
});
