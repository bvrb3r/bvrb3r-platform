import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  isSupabaseEnabledMock,
  createSupabaseAdminClientMock,
  ensureCanonicalOwnerShopLocationMock,
  publishShopMarketplaceReadinessMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  isSupabaseEnabledMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
  ensureCanonicalOwnerShopLocationMock: vi.fn(),
  publishShopMarketplaceReadinessMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/config/runtime", () => ({ isSupabaseEnabled: isSupabaseEnabledMock }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: createSupabaseAdminClientMock }));
vi.mock("@/lib/marketplace/owner-shop-location", () => ({
  ensureCanonicalOwnerShopLocation: ensureCanonicalOwnerShopLocationMock
}));
vi.mock("@/lib/marketplace/publishing", () => ({
  publishShopMarketplaceReadiness: publishShopMarketplaceReadinessMock
}));

import { POST } from "@/app/api/owner/activation/route";

function request(hours: Array<{ weekday: number; startTime: string; endTime: string }>) {
  return new Request("https://bvrb3r.app/api/owner/activation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update_shop_hours", shopId: "shop-owned", hours })
  });
}

function buildSupabase() {
  const updates: Array<{ table: string; payload: Record<string, unknown>; field: string; value: unknown }> = [];
  const rpcCalls: Array<{ functionName: string; args: Record<string, unknown> }> = [];
  const shopSelect = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: "shop-owned",
        owner_profile_id: "owner-profile",
        name: "The BVRB3R Shop",
        neighborhood: "University Square",
        city: "Tampa",
        state: "FL",
        zip_code: "33612",
        phone: "+18135550123",
        address: "2200 E Fowler Ave"
      },
      error: null
    }))
  };
  shopSelect.select.mockReturnValue(shopSelect);
  shopSelect.eq.mockReturnValue(shopSelect);

  const client = {
    rpc: vi.fn(async (functionName: string, args: Record<string, unknown>) => {
      rpcCalls.push({ functionName, args });
      return { data: { updated: true }, error: null };
    }),
    from: vi.fn((table: string) => ({
      ...(table === "shops" ? { select: shopSelect.select } : {}),
      update: vi.fn((payload: Record<string, unknown>) => ({
        eq: vi.fn(async (field: string, value: unknown) => {
          updates.push({ table, payload, field, value });
          return { error: null };
        })
      }))
    }))
  };

  return { client, rpcCalls, updates };
}

describe("owner activation route", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    isSupabaseEnabledMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    ensureCanonicalOwnerShopLocationMock.mockReset();
    publishShopMarketplaceReadinessMock.mockReset();
    getSessionUserMock.mockResolvedValue({
      id: "owner-profile",
      role: "shop_owner_user",
      ownedShopId: "shop-owned",
      locationIds: []
    });
    isSupabaseEnabledMock.mockReturnValue(true);
    ensureCanonicalOwnerShopLocationMock.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000222",
      reference_code: "shop-owned"
    });
  });

  it("writes one strict canonical weekly schedule to both shop and location truth", async () => {
    const supabase = buildSupabase();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const response = await POST(request([
      { weekday: 5, startTime: "10:00", endTime: "18:00" },
      { weekday: 1, startTime: "09:00", endTime: "17:00" }
    ]));

    expect(response.status).toBe(200);
    const canonical = {
      version: 1,
      source: "owner_settings",
      weekly: [
        { weekday: 1, startTime: "09:00", endTime: "17:00" },
        { weekday: 5, startTime: "10:00", endTime: "18:00" }
      ]
    };
    expect(supabase.rpcCalls).toEqual([{
      functionName: "pr40_update_owner_hours",
      args: {
        p_actor_profile_id: "owner-profile",
        p_shop_id: "shop-owned",
        p_location_id: "00000000-0000-4000-8000-000000000222",
        p_hours: canonical
      }
    }]);
    expect(supabase.updates).toEqual([]);
    expect(publishShopMarketplaceReadinessMock).toHaveBeenCalledWith({ shopId: "shop-owned" });
  });

  it.each([
    { label: "an empty schedule", hours: [] },
    {
      label: "duplicate weekdays",
      hours: [
        { weekday: 1, startTime: "09:00", endTime: "17:00" },
        { weekday: 1, startTime: "10:00", endTime: "18:00" }
      ]
    },
    { label: "an invalid time", hours: [{ weekday: 2, startTime: "29:00", endTime: "30:00" }] },
    { label: "a non-opening interval", hours: [{ weekday: 3, startTime: "17:00", endTime: "09:00" }] }
  ])("rejects $label before writing server truth", async ({ hours }) => {
    const response = await POST(request(hours));

    expect(response.status).toBe(400);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });
});
