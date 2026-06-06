import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  getQueueWorkspacePayloadForShopsMock,
  readPlatformShopControlStateMock,
  readShopProfileMediaMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  getQueueWorkspacePayloadForShopsMock: vi.fn(),
  readPlatformShopControlStateMock: vi.fn(),
  readShopProfileMediaMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: () => true
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/platform-admin/service", () => ({
  readPlatformShopControlState: readPlatformShopControlStateMock
}));

vi.mock("@/lib/profile/service", () => ({
  readShopProfileMedia: readShopProfileMediaMock
}));

vi.mock("@/lib/queue/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queue/service")>("@/lib/queue/service");
  return {
    ...actual,
    getQueueWorkspacePayloadForShops: getQueueWorkspacePayloadForShopsMock
  };
});

const productionShop = {
  id: "shop-the-bvrb3r-shop-universi-a02c68",
  name: "The BVRB3R Shop (University Mall)",
  public_username: "thebvrb3rshopuniversitymall",
  owner_profile_id: "a02c6841-cfbc-4059-8564-96f052c16c26",
  neighborhood: null,
  city: "Tampa",
  state: "FL",
  address: "2172 University Square Mall",
  profile_photo_path: null,
  profile_photo_url: "https://cdn.example.com/shop.jpg",
  cover_photo_url: null,
  app_approval_status: "approved"
};

const shopSelects: string[] = [];
const shopFilters: string[] = [];

function createQuery(table: string) {
  return {
    select(columns: string) {
      if (table === "shops") {
        shopSelects.push(columns);
      }
      return this;
    },
    or(filter: string) {
      if (table === "shops") {
        shopFilters.push(filter);
      }
      return {
        maybeSingle: async () => {
          if (table === "shops") {
            const targetMatchesId = filter.includes(`id.eq.${productionShop.id}`);
            const targetMatchesUsername = filter.includes("public_username.ilike.thebvrb3rshopuniversitymall");
            return {
              data: targetMatchesId || targetMatchesUsername ? productionShop : null,
              error: null
            };
          }

          return { data: null, error: null };
        }
      };
    }
  };
}

function createSupabaseStub() {
  return {
    from: vi.fn((table: string) => createQuery(table))
  };
}

function mockQueuePayload() {
  getQueueWorkspacePayloadForShopsMock.mockResolvedValue({
    summary: {
      activeCount: 0,
      calledCount: 0,
      assignedCount: 0,
      averageWaitMinutes: 0
    },
    shops: [],
    barbers: [],
    services: [],
    entries: [],
    recentResolvedEntries: []
  });
}

describe("shop kiosk resolution", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    shopSelects.length = 0;
    shopFilters.length = 0;
    getQueueWorkspacePayloadForShopsMock.mockReset();
    readPlatformShopControlStateMock.mockReset();
    readShopProfileMediaMock.mockReset();
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub());
    readPlatformShopControlStateMock.mockResolvedValue({
      shopStatus: "active",
      kioskEnabled: true
    });
    readShopProfileMediaMock.mockResolvedValue({
      profilePhotoUrl: "https://cdn.example.com/shop.jpg"
    });
    mockQueuePayload();
  });

  it("resolves a production text shops.id without requiring a UUID", async () => {
    const { getKioskPayload } = await import("@/lib/kiosk/service");

    const payload = await getKioskPayload("shop-the-bvrb3r-shop-universi-a02c68");

    expect(payload.shop.shopId).toBe("shop-the-bvrb3r-shop-universi-a02c68");
    expect(payload.shop.shopName).toBe("The BVRB3R Shop (University Mall)");
    expect(payload.shop.locationLabel).toContain("2172 University Square Mall");
    expect(getQueueWorkspacePayloadForShopsMock).toHaveBeenCalledWith(["shop-the-bvrb3r-shop-universi-a02c68"]);
    expect(shopSelects.join(" ")).not.toContain("shop_username");
    expect(shopFilters.join(" ")).not.toContain("shop_username");
  });

  it("resolves a shop public username with or without @", async () => {
    const { getKioskPayload } = await import("@/lib/kiosk/service");

    await expect(getKioskPayload("thebvrb3rshopuniversitymall")).resolves.toMatchObject({
      shop: {
        shopId: "shop-the-bvrb3r-shop-universi-a02c68"
      }
    });
    await expect(getKioskPayload("@thebvrb3rshopuniversitymall")).resolves.toMatchObject({
      shop: {
        shopId: "shop-the-bvrb3r-shop-universi-a02c68"
      }
    });
  });
});
