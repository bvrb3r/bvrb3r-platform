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
  it("returns no marketplace inventory when Supabase is disabled", async () => {
    const payload = await searchBarbersAndShopsPayload({ clientId: "client-jordan" });

    expect(payload.barbers).toEqual([]);
    expect(payload.shops).toEqual([]);
  });

  it("does not synthesize availability for a non-visible demo barber", async () => {
    const payload = await getBarberAvailabilityPayload("barber-blaze", {
      locationId: "loc-ybor",
      serviceId: "srv-signature"
    });

    expect(payload.barberId).toBe("barber-blaze");
    expect(payload.locationId).toBe("loc-ybor");
    expect(payload.service).toBeNull();
    expect(payload.slots).toEqual([]);
    expect(payload.gating?.allowed).toBe(false);
  });
});
