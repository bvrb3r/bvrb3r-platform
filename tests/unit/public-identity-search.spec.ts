import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  isSupabaseEnabledMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  isSupabaseEnabledMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: isSupabaseEnabledMock,
  runtimeConfig: { mediaBucket: "profile-media" }
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { searchPublicIdentities } from "@/lib/profile/public-identity-search";

function createSearchSupabaseMock() {
  const rows: Record<string, unknown[]> = {
    profiles: [
      {
        id: "client-profile-1",
        full_name: "Jordan Ellis",
        public_username: "jordan",
        public_city: "Tampa",
        public_state: "FL",
        profile_photo_url: "https://cdn.example.com/jordan.jpg"
      }
    ],
    barber_profiles: [
      {
        barber_reference: "barber-1",
        username: "phil",
        display_name: "Phillip McGee",
        public_address: "2200 E Fowler Ave",
        public_city: "Tampa",
        public_state: "FL",
        public_zip: "33612",
        profile_photo_url: "https://cdn.example.com/phil.jpg"
      }
    ],
    shops: [
      {
        id: "shop-1",
        name: "The BVRB3R Shop",
        public_username: "bvrb3rshop",
        address: "2172 University Square Mall",
        city: "Tampa",
        state: "FL",
        zip_code: "33612",
        profile_photo_url: "https://cdn.example.com/shop.jpg"
      }
    ]
  };

  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          limit: vi.fn(async () => ({
            data: rows[table] ?? [],
            error: null
          }))
        }))
      }))
    }))
  };
}

describe("searchPublicIdentities", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    isSupabaseEnabledMock.mockReset();
    isSupabaseEnabledMock.mockReturnValue(true);
    createSupabaseAdminClientMock.mockReturnValue(createSearchSupabaseMock());
  });

  it("returns public client, barber, and shop identity URLs by username", async () => {
    const results = await searchPublicIdentities("@jordan");

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ownerType: "client",
        username: "jordan",
        publicProfileUrl: "/client/jordan",
        city: "Tampa",
        state: "FL"
      }),
      expect.objectContaining({
        ownerType: "barber",
        username: "phil",
        publicProfileUrl: "/barber/phil",
        address: "2200 E Fowler Ave",
        city: "Tampa",
        state: "FL",
        zip: "33612",
        isLocationLocked: false,
        locationSource: "freelance"
      }),
      expect.objectContaining({
        ownerType: "shop",
        username: "bvrb3rshop",
        publicProfileUrl: "/shop/bvrb3rshop",
        address: "2172 University Square Mall",
        city: "Tampa",
        state: "FL",
        zip: "33612",
        locationSource: "shop"
      })
    ]));
  });
});
