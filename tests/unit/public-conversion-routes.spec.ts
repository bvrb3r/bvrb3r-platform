import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  readPublicBarberProfileMock,
  getCurrentUserFromServerMock,
  readRuntimeMock,
  readTrustStateMock,
  recordHaircutNowImpressionMock,
  buildHaircutNowPayloadMock
} = vi.hoisted(() => ({
  readPublicBarberProfileMock: vi.fn(),
  getCurrentUserFromServerMock: vi.fn(),
  readRuntimeMock: vi.fn(),
  readTrustStateMock: vi.fn(),
  recordHaircutNowImpressionMock: vi.fn(),
  buildHaircutNowPayloadMock: vi.fn()
}));

vi.mock("@/lib/marketplace/public-read-service", () => ({
  readPublicBarberProfile: readPublicBarberProfileMock
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/marketplace/provider", () => ({
  getMarketplaceProvider: async () => ({
    readRuntime: readRuntimeMock,
    recordHaircutNowImpression: recordHaircutNowImpressionMock
  }),
  buildHaircutNowPayload: buildHaircutNowPayloadMock
}));

vi.mock("@/lib/trust/provider", () => ({
  getTrustProvider: async () => ({ readState: readTrustStateMock })
}));

describe("public conversion route boundaries", () => {
  beforeEach(() => {
    readPublicBarberProfileMock.mockReset();
    getCurrentUserFromServerMock.mockReset();
    readRuntimeMock.mockReset().mockResolvedValue({ barbers: [] });
    readTrustStateMock.mockReset().mockResolvedValue({});
    recordHaircutNowImpressionMock.mockReset().mockResolvedValue(undefined);
    buildHaircutNowPayloadMock.mockReset().mockReturnValue({ barberId: "barber-live" });
  });

  it("loads a Barber profile through the dedicated read-only query", async () => {
    readPublicBarberProfileMock.mockResolvedValue({ barber: { id: "barber-live" } });
    const { GET } = await import("@/app/api/barbers/[id]/route");

    const response = await GET(new Request("https://bvrb3r.test/api/barbers/barber-live"), {
      params: Promise.resolve({ id: "barber-live" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(readPublicBarberProfileMock).toHaveBeenCalledWith("barber-live");
    expect(body.barber.id).toBe("barber-live");
    expect(getCurrentUserFromServerMock).not.toHaveBeenCalled();
  });

  it("returns a stable 404 without invoking a repair workflow", async () => {
    readPublicBarberProfileMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/barbers/[id]/route");

    const response = await GET(new Request("https://bvrb3r.test/api/barbers/missing"), {
      params: Promise.resolve({ id: "missing" })
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("barber_profile_not_found");
    expect(getCurrentUserFromServerMock).not.toHaveBeenCalled();
  });

  it("ignores a forged Haircut Now clientId and uses server session identity", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      user: { role: "client_user", clientId: "client-session" }
    });
    const { GET } = await import("@/app/api/marketplace/haircut-now/route");

    const response = await GET(new NextRequest(
      "https://bvrb3r.test/api/marketplace/haircut-now?clientId=client-forged&locationId=location-live"
    ));

    expect(response.status).toBe(200);
    expect(buildHaircutNowPayloadMock).toHaveBeenCalledWith(
      expect.anything(),
      "client-session",
      "location-live",
      expect.anything()
    );
    expect(buildHaircutNowPayloadMock.mock.calls[0]).not.toContain("client-forged");
  });

  it("keeps Haircut Now guest-safe and analytics fail-open", async () => {
    getCurrentUserFromServerMock.mockRejectedValue(new Error("No session"));
    recordHaircutNowImpressionMock.mockRejectedValue(new Error("Analytics unavailable"));
    const { GET } = await import("@/app/api/marketplace/haircut-now/route");

    const response = await GET(new NextRequest("https://bvrb3r.test/api/marketplace/haircut-now"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.match.barberId).toBe("barber-live");
    expect(buildHaircutNowPayloadMock).toHaveBeenCalledWith(expect.anything(), undefined, undefined, expect.anything());
  });
});
