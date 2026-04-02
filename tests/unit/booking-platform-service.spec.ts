import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => false
  };
});

import { getBarberAvailabilityPayload, searchBarbersAndShopsPayload } from "@/lib/booking/platform-service";

describe("client booking discovery payloads", () => {
  it("returns multiple bookable barbers for the client booking flow", async () => {
    const payload = await searchBarbersAndShopsPayload({ clientId: "client-jordan" });
    const barberIds = payload.barbers.map((entry) => entry.barberId);

    expect(payload.barbers.length).toBeGreaterThan(1);
    expect(barberIds).toEqual(expect.arrayContaining(["barber-wave", "barber-blaze"]));
  });

  it("returns a stable Blaze booking context for the valid service and location combination", async () => {
    const payload = await getBarberAvailabilityPayload("barber-blaze", {
      locationId: "loc-ybor",
      serviceId: "srv-signature"
    });

    expect(payload.barberId).toBe("barber-blaze");
    expect(payload.locationId).toBe("loc-ybor");
    expect(payload.service?.id).toBe("srv-signature");
    expect(Array.isArray(payload.slots)).toBe(true);
  });
});
