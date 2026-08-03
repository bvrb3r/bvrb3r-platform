import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/kiosk/rate-limit";

const { postgisRowsMock } = vi.hoisted(() => ({ postgisRowsMock: vi.fn() }));

vi.mock("@/lib/marketplace/postgis-map", () => {
  class PostgisMarketplaceError extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  }
  return {
    PostgisMarketplaceError,
    readPostgisMarketplaceRows: postgisRowsMock,
    postgisMarketplaceMarkerId: (row: { listing_type: string; listing_reference: string; location_id: string }) =>
      row.listing_type === "barber" ? `barber-${row.listing_reference}` : `shop-${row.location_id}`
  };
});

import { POST } from "@/app/api/marketplace/directions/route";
import {
  getMapboxDirectionsPreview,
  greatCircleMiles,
  isPrivacyCoarsenedOrigin,
  parseMapboxDirectionsPreview
} from "@/lib/marketplace/mapbox-directions";

const origin = { latitude: 27.951, longitude: -82.457 };
const destination = { latitude: 27.961, longitude: -82.447 };

function routeRequest(input: unknown) {
  return new Request("https://bvrb3r.app/api/marketplace/directions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "198.51.100.239"
    },
    body: JSON.stringify(input)
  });
}

function directionsPayload() {
  return {
    code: "Ok",
    routes: [{
      duration: 601,
      distance: 3218.688,
      geometry: {
        type: "LineString",
        coordinates: [
          [origin.longitude, origin.latitude],
          [destination.longitude, destination.latitude]
        ]
      }
    }]
  };
}

describe("Product PR39 bounded Directions preview", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.stubEnv("MAPBOX_SERVER_TOKEN", "server-map-token-for-directions-tests");
    postgisRowsMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("accepts only three-decimal browser origins", () => {
    expect(isPrivacyCoarsenedOrigin(origin)).toBe(true);
    expect(isPrivacyCoarsenedOrigin({ latitude: 27.9506123, longitude: -82.4572987 })).toBe(false);
    expect(greatCircleMiles(origin, destination)).toBeLessThan(2);
  });

  it("parses only bounded simplified route geometry", () => {
    expect(parseMapboxDirectionsPreview(directionsPayload())).toEqual({
      durationMinutes: 11,
      distanceMiles: 2,
      geometry: directionsPayload().routes[0].geometry
    });
    expect(parseMapboxDirectionsPreview({
      ...directionsPayload(),
      routes: [{ ...directionsPayload().routes[0], distance: 101 * 1609.344 }]
    })).toBeNull();
  });

  it("requests an overview only and never requests turn-by-turn steps", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(directionsPayload()),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));

    await expect(getMapboxDirectionsPreview({ origin, destination })).resolves.toMatchObject({
      durationMinutes: 11,
      distanceMiles: 2
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toContain("/directions/v5/mapbox/driving/");
    expect(url.searchParams.get("steps")).toBe("false");
    expect(url.searchParams.get("overview")).toBe("simplified");
    expect(url.searchParams.get("geometries")).toBe("geojson");
    expect(url.pathname.split(";")).toHaveLength(2);
  });

  it("resolves the selected destination from PostGIS before calling Mapbox", async () => {
    postgisRowsMock.mockResolvedValue([{
      listing_type: "barber",
      listing_reference: "verified-one",
      location_id: "location-one",
      latitude: destination.latitude,
      longitude: destination.longitude
    }]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(directionsPayload()),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));

    const response = await POST(routeRequest({ markerId: "barber-verified-one", origin }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.preview).toMatchObject({ durationMinutes: 11, distanceMiles: 2 });
    expect(postgisRowsMock).toHaveBeenCalledWith(expect.objectContaining({ radiusMiles: 50, ...origin }));
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(decodeURIComponent(url.pathname)).toContain(`${destination.longitude},${destination.latitude}`);
  });

  it("rejects precise origins and unknown destinations without spending a Directions request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const preciseResponse = await POST(routeRequest({
      markerId: "barber-verified-one",
      origin: { latitude: 27.9506123, longitude: -82.4572987 }
    }));
    expect(preciseResponse.status).toBe(400);
    expect(postgisRowsMock).not.toHaveBeenCalled();

    postgisRowsMock.mockResolvedValue([]);
    const missingResponse = await POST(routeRequest({ markerId: "barber-not-visible", origin }));
    expect(missingResponse.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
