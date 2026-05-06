import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getCurrentUserFromServerMock,
  searchBarbersAndShopsPayloadMock,
  recordDiscoveryImpressionMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  searchBarbersAndShopsPayloadMock: vi.fn(),
  recordDiscoveryImpressionMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/booking/platform-service", () => ({
  searchBarbersAndShopsPayload: searchBarbersAndShopsPayloadMock
}));

vi.mock("@/lib/marketplace/provider", () => ({
  getMarketplaceProvider: async () => ({
    recordDiscoveryImpression: recordDiscoveryImpressionMock
  })
}));

describe("marketplace discover route", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    searchBarbersAndShopsPayloadMock.mockReset();
    recordDiscoveryImpressionMock.mockReset();
    getCurrentUserFromServerMock.mockResolvedValue({
      user: {
        role: "client",
        clientId: "client-1"
      }
    });
    searchBarbersAndShopsPayloadMock.mockResolvedValue({
      barbers: [{
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
      }],
      shops: []
    });
  });

  it("uses the canonical client marketplace supply source for search results", async () => {
    const { GET } = await import("@/app/api/marketplace/discover/route");

    const response = await GET(new NextRequest("https://bvrb3r.test/api/marketplace/discover?query=phil&category=haircuts&availability=today&locationId=loc-live"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(searchBarbersAndShopsPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      query: "phil",
      category: "haircuts",
      availability: "today",
      locationId: "loc-live",
      clientId: "client-1"
    }));
    expect(body.results).toHaveLength(1);
    expect(body.results[0].galleryPreviewUrls).toEqual(["https://example.com/cut.jpg"]);
    expect(recordDiscoveryImpressionMock).toHaveBeenCalledWith(expect.objectContaining({
      clientId: "client-1",
      results: body.results
    }));
  });

  it("returns a specific discovery error reference when canonical supply loading fails", async () => {
    searchBarbersAndShopsPayloadMock.mockRejectedValue(new Error("availability_rules location_id query failed"));
    const { GET } = await import("@/app/api/marketplace/discover/route");

    const response = await GET(new NextRequest("https://bvrb3r.test/api/marketplace/discover?query=phillip"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Marketplace discovery failed. Reference client_discovery_failed.");
    expect(body.code).toBe("client_discovery_failed");
  });
});
