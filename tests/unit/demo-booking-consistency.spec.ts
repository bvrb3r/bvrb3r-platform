import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => false
  };
});

import { getLiveOperationsProvider, resetDemoLiveOperationsSnapshot } from "@/lib/operations/live-provider";

describe("pre-open booking supply consistency", () => {
  beforeEach(() => {
    resetDemoLiveOperationsSnapshot();
  });

  it("does not create or propagate fake demo bookings when Supabase is disabled", async () => {
    const provider = await getLiveOperationsProvider();
    expect(provider.kind).toBe("supabase");

    await expect(provider.createBooking({
      locationId: "loc-ybor",
      barberId: "barber-blaze",
      serviceId: "srv-signature",
      addOnIds: ["srv-beard"],
      appointmentTime: "2026-03-08T14:00:00-05:00",
      clientName: "Jordan Ellis",
      clientPhone: "(813) 555-0190",
      clientId: "client-jordan",
      actorRole: "client",
      actorEmail: "client@bvrb3r.demo",
      bookingSource: "booking"
    })).rejects.toThrow(/Supabase server provider is not configured/i);
  });
});
