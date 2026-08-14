import { describe, expect, it, vi } from "vitest";
import { resolveApprovedShopLocation } from "@/lib/marketplace/barber-shop-location";

function singleResultBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn()
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);
  return builder;
}

describe("Barber approved-shop location bridge", () => {
  it("resolves a public shops.id to the canonical locations.id UUID", async () => {
    const shop = singleResultBuilder({
      data: { id: "shop-account-id", app_approval_status: "approved" },
      error: null
    });
    const location = singleResultBuilder({
      data: { id: "c1e85baa-48dc-4dce-9468-0eaaacbd3882", reference_code: "shop-account-id" },
      error: null
    });
    const supabase = {
      from: vi.fn((table: string) => table === "shops" ? shop : location)
    };

    await expect(resolveApprovedShopLocation(
      supabase as never,
      "shop-account-id"
    )).resolves.toEqual({
      shopId: "shop-account-id",
      locationId: "c1e85baa-48dc-4dce-9468-0eaaacbd3882"
    });
    expect(shop.eq).toHaveBeenCalledWith("id", "shop-account-id");
    expect(location.eq).toHaveBeenCalledWith("reference_code", "shop-account-id");
  });

  it("fails closed before location lookup when the shop is not approved", async () => {
    const shop = singleResultBuilder({
      data: { id: "shop-account-id", app_approval_status: "pending" },
      error: null
    });
    const supabase = { from: vi.fn(() => shop) };

    await expect(resolveApprovedShopLocation(
      supabase as never,
      "shop-account-id"
    )).resolves.toBeNull();
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});
