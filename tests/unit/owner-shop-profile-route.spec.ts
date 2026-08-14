import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  isSupabaseEnabledMock,
  createSupabaseAdminClientMock,
  createSupabaseServerClientMock,
  ensureCanonicalOwnerShopLocationMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  isSupabaseEnabledMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  ensureCanonicalOwnerShopLocationMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: isSupabaseEnabledMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock
}));

vi.mock("@/lib/marketplace/owner-shop-location", () => ({
  ensureCanonicalOwnerShopLocation: ensureCanonicalOwnerShopLocationMock
}));

import { GET, PATCH } from "@/app/api/owner/shop/profile/route";

function createRequest(payload: Record<string, unknown>) {
  return new Request("http://localhost/api/owner/shop/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function createShopProfileSupabaseMock(options: {
  profile?: Record<string, unknown> | null;
  scopedShop?: Record<string, unknown> | null;
  updatedShop?: Record<string, unknown> | null;
}) {
  const eqCalls: Array<[string, unknown]> = [];
  let updatePayload: Record<string, unknown> | null = null;

  const createSelectChain = (table: string) => ({
    eq(field: string, value: unknown) {
      eqCalls.push([field, value]);
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    maybeSingle: vi.fn(async () => ({
      data: table === "profiles" ? options.profile ?? { id: "owner-profile-1", email: "owner@example.com", role: "shop_owner_user" } : options.scopedShop ?? null,
      error: null
    }))
  });

  const createUpdateChain = (payload: Record<string, unknown>) => {
    updatePayload = payload;
    return {
      eq(field: string, value: unknown) {
        eqCalls.push([field, value]);
        return this;
      },
      select() {
        return this;
      },
      single: vi.fn(async () => ({
        data: options.updatedShop ?? null,
        error: null
      }))
    };
  };

  return {
    eqCalls,
    get updatePayload() {
      return updatePayload;
    },
    client: {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => createSelectChain(table)),
        update: vi.fn((payload: Record<string, unknown>) => createUpdateChain(payload))
      }))
    }
  };
}

describe("owner shop profile route", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    isSupabaseEnabledMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createSupabaseServerClientMock.mockReset();
    ensureCanonicalOwnerShopLocationMock.mockReset();
    ensureCanonicalOwnerShopLocationMock.mockResolvedValue({ id: "location-owned" });
    isSupabaseEnabledMock.mockReturnValue(true);
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "owner-profile-1", email: "owner@example.com" } },
          error: null
        }))
      }
    });
    getSessionUserMock.mockResolvedValue({
      id: "owner-profile-1",
      role: "shop_owner_user",
      locationIds: []
    });
  });

  it("lets an owner update their own canonical shop profile fields", async () => {
    const supabase = createShopProfileSupabaseMock({
      scopedShop: { id: "shop-owned", owner_profile_id: "owner-profile-1" },
      updatedShop: {
        id: "shop-owned",
        name: "The BVRB3R Shop",
        brand_line: "Campus cuts.",
        public_bio: "A public shop bio.",
        cover_photo_url: "https://cdn.example.com/cover.jpg",
        policies: "Arrive five minutes early.",
        shop_username: "bvrb3rshop",
        address: "2200 E Fowler Ave",
        city: "Tampa",
        state: "FL"
      }
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const response = await PATCH(createRequest({
      shopId: "shop-owned",
      name: "The BVRB3R Shop",
      brandLine: "Campus cuts.",
      publicBio: "A public shop bio.",
      coverPhotoUrl: "https://cdn.example.com/cover.jpg",
      policies: "Arrive five minutes early.",
      address: "2200 E Fowler Ave",
      city: "Tampa",
      state: "FL"
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shop.name).toBe("The BVRB3R Shop");
    expect(supabase.eqCalls).toContainEqual(["id", "shop-owned"]);
    expect(supabase.eqCalls).toContainEqual(["owner_profile_id", "owner-profile-1"]);
    expect(supabase.updatePayload).toMatchObject({
      name: "The BVRB3R Shop",
      brand_line: "Campus cuts.",
      public_bio: "A public shop bio.",
      cover_photo_url: "https://cdn.example.com/cover.jpg",
      policies: "Arrive five minutes early.",
      address: "2200 E Fowler Ave",
      city: "Tampa",
      state: "FL"
    });
    expect(ensureCanonicalOwnerShopLocationMock).toHaveBeenCalledWith(
      supabase.client,
      expect.objectContaining({ id: "shop-owned" })
    );
  });

  it("rejects policies that cannot satisfy public policy readiness", async () => {
    const response = await PATCH(createRequest({
      shopId: "shop-owned",
      policies: "Too short"
    }));

    expect(response.status).toBe(400);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "arbitrary public hours",
      payload: {
        shopId: "shop-owned",
        publicHours: { version: 1, weekly: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] }
      }
    },
    {
      label: "a direct public username",
      payload: { shopId: "shop-owned", shopUsername: "bypass-registry" }
    }
  ])("rejects $label so canonical setup routes cannot be bypassed", async ({ payload }) => {
    const response = await PATCH(createRequest(payload));

    expect(response.status).toBe(400);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("loads the owner canonical shop profile for the Team editor", async () => {
    const supabase = createShopProfileSupabaseMock({
      scopedShop: {
        id: "shop-owned",
        name: "The BVRB3R Shop",
        owner_profile_id: "owner-profile-1",
        public_bio: "Public team bio.",
        cover_photo_url: "https://cdn.example.com/cover.jpg",
        shop_username: "bvrb3rshop"
      }
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shop).toMatchObject({
      id: "shop-owned",
      name: "The BVRB3R Shop",
      public_bio: "Public team bio.",
      cover_photo_url: "https://cdn.example.com/cover.jpg",
      shop_username: "bvrb3rshop"
    });
    expect(supabase.eqCalls).toContainEqual(["owner_profile_id", "owner-profile-1"]);
  });

  it("does not allow updating another owner's shop", async () => {
    const supabase = createShopProfileSupabaseMock({
      scopedShop: null,
      updatedShop: null
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const response = await PATCH(createRequest({
      shopId: "shop-someone-else",
      name: "Not mine"
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Owner shop not found.");
    expect(supabase.updatePayload).toBeNull();
  });

  it("rejects non-owner roles", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "client-profile-1",
      role: "client_user",
      locationIds: []
    });

    const response = await PATCH(createRequest({
      name: "Client Shop"
    }));

    expect(response.status).toBe(403);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });
});
