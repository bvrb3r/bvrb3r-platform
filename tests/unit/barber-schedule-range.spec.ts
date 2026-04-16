import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => false
  };
});

import { getBarberSchedulePayload } from "@/lib/barber/service";
import { getLiveOperationsProvider, resetDemoLiveOperationsSnapshot } from "@/lib/operations/live-provider";

describe("barber schedule ranges", () => {
  beforeEach(() => {
    resetDemoLiveOperationsSnapshot();
  });

  it("does not synthesize demo bookings into barber schedule ranges when Supabase is disabled", async () => {
    const provider = await getLiveOperationsProvider();
    await expect(provider.createBooking({
      locationId: "loc-ybor",
      barberId: "barber-blaze",
      serviceId: "srv-signature",
      addOnIds: [],
      appointmentTime: "2026-03-12T14:00:00-05:00",
      clientName: "Jordan Ellis",
      clientPhone: "(813) 555-0190",
      clientId: "client-jordan",
      actorRole: "client",
      actorEmail: "client@bvrb3r.demo",
      bookingSource: "booking"
    })).rejects.toThrow(/Supabase server provider is not configured/i);
  });

  it("returns an empty schedule instead of fake appointments for demo barbers", async () => {
    const payload = await getBarberSchedulePayload({
      id: "user-blaze",
      role: "booth_rent_barber",
      email: "blaze@bvrb3r.demo",
      password: "DevOnly!123",
      name: "Blaze King",
      title: "Barber",
      locationIds: ["loc-ybor"],
      barberId: "barber-blaze"
    }, { viewMode: "week", anchorDate: "2026-03-12" });

    expect(payload.timeline.appointments).toEqual([]);
  });
});
