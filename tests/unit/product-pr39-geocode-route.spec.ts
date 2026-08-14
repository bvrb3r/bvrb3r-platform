import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/kiosk/rate-limit";

const {
  sessionMock,
  serverClientMock,
  adminClientMock,
  ensureCanonicalOwnerShopLocationMock
} = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  serverClientMock: vi.fn(),
  adminClientMock: vi.fn(),
  ensureCanonicalOwnerShopLocationMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUserFromServer: sessionMock }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: serverClientMock }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: adminClientMock }));
vi.mock("@/lib/marketplace/owner-shop-location", () => ({
  ensureCanonicalOwnerShopLocation: ensureCanonicalOwnerShopLocationMock
}));

import { POST } from "@/app/api/marketplace/locations/[shopId]/geocode/route";

const OWNER_ID = "00000000-0000-4000-8000-000000000039";
const LOCATION_ID = "00000000-0000-4000-8000-000000000139";
const MAPBOX_ID = "dXJuOm1ieGFkZHI6cHJvZHVjdC1wcjM5";

function request() {
  return new Request("https://bvrb3r.app/api/marketplace/locations/southside/geocode", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "198.51.100.39"
    },
    body: JSON.stringify({
      address: "101 Verified Ave, Tampa, FL 33602",
      mapboxId: MAPBOX_ID,
      visibility: "exact"
    })
  });
}

function permanentFeature(countryCode = "US") {
  return {
    type: "FeatureCollection",
    features: [{
      id: MAPBOX_ID,
      geometry: { type: "Point", coordinates: [-82.4572, 27.9506] },
      properties: {
        mapbox_id: MAPBOX_ID,
        feature_type: "address",
        full_address: "101 Verified Ave, Tampa, Florida 33602, United States",
        coordinates: { accuracy: "rooftop" },
        context: {
          place: { name: "Tampa" },
          region: { name: "Florida", region_code: "FL", region_code_full: "US-FL" },
          postcode: { name: "33602" },
          country: { name: "United States", country_code: countryCode }
        }
      }
    }]
  };
}

function buildServerClient(appApprovalStatus = "pending") {
  const shopQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "southside",
        owner_profile_id: OWNER_ID,
        name: "Southside Cuts",
        neighborhood: "Southside",
        city: "Tampa",
        state: "FL",
        zip_code: "33602",
        phone: "+18135550123",
        address: "101 Verified Ave",
        app_approval_status: appApprovalStatus
      },
      error: null
    })
  };
  shopQuery.select.mockReturnValue(shopQuery);
  shopQuery.eq.mockReturnValue(shopQuery);

  const locationQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: LOCATION_ID }, error: null })
  };
  locationQuery.select.mockReturnValue(locationQuery);
  locationQuery.eq.mockReturnValue(locationQuery);

  const from = vi.fn((table: string) => table === "shops" ? shopQuery : locationQuery);
  return { client: { from }, from };
}

function buildAdminClient() {
  const single = vi.fn().mockResolvedValue({
    data: {
      location_visibility: "exact",
      location_verified: true,
      geocoded_at: "2026-08-03T06:50:00.000Z"
    },
    error: null
  });
  const rpc = vi.fn(() => ({ single }));
  return { client: { rpc }, rpc, single };
}

describe("POST /api/marketplace/locations/[shopId]/geocode", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.stubEnv("MAPBOX_SERVER_TOKEN", "server-map-token-for-route-tests");
    sessionMock.mockReset();
    serverClientMock.mockReset();
    adminClientMock.mockReset();
    ensureCanonicalOwnerShopLocationMock.mockReset();
    ensureCanonicalOwnerShopLocationMock.mockResolvedValue({ id: LOCATION_ID, reference_code: "southside" });
    sessionMock.mockResolvedValue({
      authenticated: true,
      user: { id: OWNER_ID, role: "shop_owner_user" }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("permanently geocodes after owner verification and writes through service role", async () => {
    const server = buildServerClient();
    const admin = buildAdminClient();
    serverClientMock.mockResolvedValue(server.client);
    adminClientMock.mockReturnValue(admin.client);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(permanentFeature()),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));

    const response = await POST(request(), { params: Promise.resolve({ shopId: "southside" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.location).toMatchObject({
      id: LOCATION_ID,
      verified: true,
      visibility: "exact",
      publicationStatus: "pending_review"
    });
    expect(ensureCanonicalOwnerShopLocationMock).toHaveBeenCalledWith(
      admin.client,
      expect.objectContaining({ id: "southside", owner_profile_id: OWNER_ID })
    );
    expect(admin.rpc).toHaveBeenCalledWith("pr39_save_verified_shop_location", expect.objectContaining({
      p_location_id: LOCATION_ID,
      p_owner_profile_id: OWNER_ID,
      p_provider_reference: MAPBOX_ID,
      p_longitude: -82.4572,
      p_latitude: 27.9506
    }));

    const mapboxUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(mapboxUrl.pathname).toBe("/search/geocode/v6/forward");
    expect(mapboxUrl.searchParams.get("permanent")).toBe("true");
    expect(mapboxUrl.searchParams.get("autocomplete")).toBe("false");
    expect(mapboxUrl.searchParams.get("country")).toBe("us");
  });

  it("rejects a non-US permanent result before the service-role write", async () => {
    const server = buildServerClient();
    const admin = buildAdminClient();
    serverClientMock.mockResolvedValue(server.client);
    adminClientMock.mockReturnValue(admin.client);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(permanentFeature("CA")),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));

    const response = await POST(request(), { params: Promise.resolve({ shopId: "southside" }) });

    expect(response.status).toBe(422);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("does not spend a geocoding request for a non-owner", async () => {
    sessionMock.mockResolvedValue({ authenticated: true, user: { id: OWNER_ID, role: "client_user" } });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(request(), { params: Promise.resolve({ shopId: "southside" }) });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it("blocks a rejected shop before creating a location or spending a geocode", async () => {
    const server = buildServerClient("rejected");
    serverClientMock.mockResolvedValue(server.client);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(request(), { params: Promise.resolve({ shopId: "southside" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("approval status");
    expect(ensureCanonicalOwnerShopLocationMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adminClientMock).not.toHaveBeenCalled();
  });
});
