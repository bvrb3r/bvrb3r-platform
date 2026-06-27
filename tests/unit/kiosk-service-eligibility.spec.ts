import { describe, expect, it } from "vitest";
import { isEligibleWalkInBarber } from "@/lib/kiosk/service";

const baseBarber = {
  id: "barber-live",
  name: "Live Barber",
  currentShopId: "shop-ybor",
  currentShopLabel: "BVRB3R Ybor",
  liveStatus: "available" as const,
  liveStatusLabel: "Available",
  isOnline: true,
  acceptsWalkIns: true,
  nextAvailableAt: "2026-03-27T15:00:00.000Z"
};

describe("kiosk service eligibility", () => {
  it("allows only online walk-in eligible barbers for Next Available routing", () => {
    expect(isEligibleWalkInBarber(baseBarber)).toBe(true);
    expect(isEligibleWalkInBarber({ ...baseBarber, isOnline: false })).toBe(false);
    expect(isEligibleWalkInBarber({ ...baseBarber, acceptsWalkIns: false })).toBe(false);
    expect(isEligibleWalkInBarber({ ...baseBarber, liveStatus: "offline", liveStatusLabel: "Offline" })).toBe(false);
    expect(isEligibleWalkInBarber({ ...baseBarber, liveStatus: "on_break", liveStatusLabel: "On break" })).toBe(false);
    expect(isEligibleWalkInBarber({ ...baseBarber, liveStatus: "away", liveStatusLabel: "Away" })).toBe(false);
  });
});
