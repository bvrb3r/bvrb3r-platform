import { describe, expect, it, vi } from "vitest";
import { calculateKioskWaitTime, formatKioskWaitLabel } from "@/lib/kiosk/wait-time";

describe("kiosk wait time engine", () => {
  it("formats human-readable wait labels without fake precision", () => {
    expect(formatKioskWaitLabel(0)).toBe("Ready now");
    expect(formatKioskWaitLabel(6)).toBe("About 5 min");
    expect(formatKioskWaitLabel(14)).toBe("About 15 min");
    expect(formatKioskWaitLabel(44)).toBe("About 45 min");
    expect(formatKioskWaitLabel(90)).toBe("Over 1 hour");
  });

  it("uses queue, service duration, buffer, and current service remaining", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T14:00:00.000Z"));

    const estimate = calculateKioskWaitTime({
      serviceDurationMinutes: 30,
      bufferMinutes: 5,
      queueDepth: 2,
      currentServiceRemainingMinutes: 10,
      barberStatus: "busy",
      acceptsWalkIns: true
    });

    expect(estimate.estimatedWaitMinutes).toBe(80);
    expect(estimate.waitDisplayLabel).toBe("Over 1 hour");

    vi.useRealTimers();
  });

  it("marks unavailable or schedule-ahead-only status correctly", () => {
    expect(calculateKioskWaitTime({ barberStatus: "not_taking_walk_ins", acceptsWalkIns: true })).toMatchObject({
      estimatedWaitMinutes: null,
      waitDisplayLabel: "Schedule Ahead Only"
    });
    expect(calculateKioskWaitTime({ barberStatus: "offline", acceptsWalkIns: true })).toMatchObject({
      estimatedWaitMinutes: null,
      waitDisplayLabel: "Not Available Today"
    });
  });
});
