import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getCurrentUserFromServerMock,
  readPublicDiscoveryMock,
  recordDiscoveryImpressionMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  readPublicDiscoveryMock: vi.fn(),
  recordDiscoveryImpressionMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/marketplace/public-read-service", () => ({
  readPublicDiscovery: readPublicDiscoveryMock
}));

vi.mock("@/lib/marketplace/provider", () => ({
  getMarketplaceProvider: async () => ({
    recordDiscoveryImpression: recordDiscoveryImpressionMock
  })
}));

const result = {
  barberId: "barber-live",
  username: "phillip",
  barberName: "Phillip McGee",
  rating: 5,
  reviewCount: 1,
  priceRange: [55, 55],
  nextAvailableAt: "2026-05-06T16:00:00.000Z",
  distanceMiles: 1,
  specialties: ["Fade"],
  badges: [],
  galleryPreviewUrls: ["https://example.com/cut.jpg"]
};

describe("marketplace discover route", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    readPublicDiscoveryMock.mockReset();
    recordDiscoveryImpressionMock.mockReset();
    getCurrentUserFromServerMock.mockResolvedValue({
      user: { role: "client_user", clientId: "client-1" }
    });
    readPublicDiscoveryMock.mockResolvedValue([result]);
  });

  it("uses a read-only query and ignores caller-controlled client identity", async () => {
    const { GET } = await import("@/app/api/marketplace/discover/route");
    const response = await GET(new NextRequest(
      "https://bvrb3r.test/api/marketplace/discover?query=phil&category=haircuts&availability=today&locationId=loc-live&clientId=forged-client"
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(readPublicDiscoveryMock).toHaveBeenCalledWith(expect.objectContaining({
      query: "phil",
      category: "haircuts",
      availability: "today",
      locationId: "loc-live"
    }));
    expect(readPublicDiscoveryMock.mock.calls[0][0]).not.toHaveProperty("clientId");
    expect(body.degraded).toBe(false);
    expect(body.results).toHaveLength(1);
    await vi.waitFor(() => {
      expect(recordDiscoveryImpressionMock).toHaveBeenCalledWith(expect.objectContaining({
        clientId: "client-1",
        results: body.results
      }));
    });
  });

  it("allows guest discovery when no authenticated session exists", async () => {
    getCurrentUserFromServerMock.mockRejectedValue(new Error("No active session"));
    const { GET } = await import("@/app/api/marketplace/discover/route");
    const response = await GET(new NextRequest("https://bvrb3r.test/api/marketplace/discover?query=phillip"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(readPublicDiscoveryMock).toHaveBeenCalledWith(expect.objectContaining({ query: "phillip" }));
    expect(body.results).toHaveLength(1);
  });

  it("fails open when noncritical impression logging is unavailable", async () => {
    recordDiscoveryImpressionMock.mockRejectedValue(new Error("analytics unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { GET } = await import("@/app/api/marketplace/discover/route");
    const response = await GET(new NextRequest("https://bvrb3r.test/api/marketplace/discover?query=phillip"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        "[marketplace/discover] impression unavailable",
        expect.objectContaining({
          reference: "client_search_impression_failed",
          resultCount: 1,
          authenticatedClient: true
        })
      );
    });
    const logged = warn.mock.calls.flatMap((call) => call).join(" ");
    expect(logged).not.toContain("client-1");
    warn.mockRestore();
  });

  it("returns a stable error without exposing database or request details", async () => {
    readPublicDiscoveryMock.mockRejectedValue(new Error("availability_rules location_id query failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await import("@/app/api/marketplace/discover/route");
    const response = await GET(new NextRequest("https://bvrb3r.test/api/marketplace/discover?query=private-search"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Marketplace discovery is temporarily unavailable.");
    expect(body.code).toBe("client_search_load_failed");
    const logged = error.mock.calls.flatMap((call) => call).join(" ");
    expect(logged).not.toContain("private-search");
    expect(logged).not.toContain("availability_rules");
    expect(logged).not.toContain("client-1");
    error.mockRestore();
  });
});
