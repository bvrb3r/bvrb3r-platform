import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/kiosk/rate-limit";

const { sessionMock, serverClientMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  serverClientMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUserFromServer: sessionMock }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: serverClientMock }));

import { POST } from "@/app/api/marketplace/locations/[shopId]/reverse-geocode/route";

const OWNER_ID = "00000000-0000-4000-8000-000000000039";

function request() {
  return new Request("https://bvrb3r.app/api/marketplace/locations/southside/reverse-geocode", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.139" }
  });
}

function reverseFeature() {
  return {
    type: "FeatureCollection",
    features: [{
      id: "dXJuOm1ieGFkZHI6cmV2ZXJzZS1jaGVjaw",
      geometry: { type: "Point", coordinates: [-82.4572, 27.9506] },
      properties: {
        mapbox_id: "dXJuOm1ieGFkZHI6cmV2ZXJzZS1jaGVjaw",
        feature_type: "address",
        full_address: "101 Verified Ave, Tampa, Florida 33602, United States",
        coordinates: { accuracy: "rooftop" },
        context: {
          place: { name: "Tampa" },
          region: { name: "Florida", region_code: "FL", region_code_full: "US-FL" },
          postcode: { name: "33602" },
          country: { name: "United States", country_code: "US" }
        }
      }
    }]
  };
}

function buildServerClient(visibility: "exact" | "approximate" = "exact") {
  const shopQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "southside" }, error: null })
  };
  shopQuery.select.mockReturnValue(shopQuery);
  shopQuery.eq.mockReturnValue(shopQuery);

  const locationQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        latitude: 27.9506,
        longitude: -82.4572,
        location_visibility: visibility,
        location_verified: true
      },
      error: null
    })
  };
  locationQuery.select.mockReturnValue(locationQuery);
  locationQuery.eq.mockReturnValue(locationQuery);

  return {
    from: vi.fn((table: string) => table === "shops" ? shopQuery : locationQuery)
  };
}

describe("POST /api/marketplace/locations/[shopId]/reverse-geocode", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.stubEnv("MAPBOX_SERVER_TOKEN", "server-map-token-for-reverse-tests");
    sessionMock.mockReset();
    serverClientMock.mockReset();
    sessionMock.mockResolvedValue({
      authenticated: true,
      user: { id: OWNER_ID, role: "shop_owner_user" }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reverse-checks only the owner's exact stored pin and does not persist the result", async () => {
    serverClientMock.mockResolvedValue(buildServerClient());
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(reverseFeature()),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));

    const response = await POST(request(), { params: Promise.resolve({ shopId: "southside" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({
      address: {
        formattedAddress: "101 Verified Ave, Tampa, Florida 33602, United States",
        city: "Tampa",
        region: "FL",
        postalCode: "33602"
      },
      persisted: false
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/search/geocode/v6/reverse");
    expect(url.searchParams.get("longitude")).toBe("-82.4572");
    expect(url.searchParams.get("latitude")).toBe("27.9506");
    expect(url.searchParams.has("permanent")).toBe(false);
  });

  it("does not reverse lookup an approximate public pin", async () => {
    serverClientMock.mockResolvedValue(buildServerClient("approximate"));
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(request(), { params: Promise.resolve({ shopId: "southside" }) });

    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not reveal or spend a lookup for a non-owner role", async () => {
    sessionMock.mockResolvedValue({ authenticated: true, user: { id: OWNER_ID, role: "client_user" } });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(request(), { params: Promise.resolve({ shopId: "southside" }) });

    expect(response.status).toBe(403);
    expect(serverClientMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
