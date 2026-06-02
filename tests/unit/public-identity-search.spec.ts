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
        profile_photo_url: "https://cdn.example.com/jordan.jpg"
      }
    ],
    barber_profiles: [
      {
        barber_reference: "barber-1",
        username: "phil",
        display_name: "Phillip McGee",
        profile_photo_url: "https://cdn.example.com/phil.jpg"
      }
    ],
    shops: [
      {
        id: "shop-1",
        name: "The BVRB3R Shop",
        public_username: "bvrb3rshop",
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
        publicProfileUrl: "/client/jordan"
      }),
      expect.objectContaining({
        ownerType: "barber",
        username: "phil",
        publicProfileUrl: "/barber/phil"
      }),
      expect.objectContaining({
        ownerType: "shop",
        username: "bvrb3rshop",
        publicProfileUrl: "/shop/bvrb3rshop"
      })
    ]));
  });
});
