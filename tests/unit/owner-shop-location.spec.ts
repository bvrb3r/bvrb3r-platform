import { describe, expect, it, vi } from "vitest";
import { ensureCanonicalOwnerShopLocation } from "@/lib/marketplace/owner-shop-location";

const shop = {
  id: "shop-owned",
  owner_profile_id: "owner-profile",
  name: "The BVRB3R Shop",
  neighborhood: "University Square",
  city: "Tampa",
  state: "FL",
  zip_code: "33612",
  phone: "+18135550123",
  address: "2200 E Fowler Ave"
};

function createClient(options: {
  existing?: { id: string; reference_code: string } | null;
  insertResult?: { data: { id: string; reference_code: string } | null; error: unknown };
  raceWinner?: { id: string; reference_code: string } | null;
}) {
  const insert = vi.fn();
  const maybeSingle = vi.fn()
    .mockResolvedValueOnce({ data: options.existing ?? null, error: null })
    .mockResolvedValue({ data: options.raceWinner ?? null, error: null });
  const selectRead = vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle }))
  }));
  const single = vi.fn(async () => options.insertResult ?? {
    data: { id: "location-new", reference_code: shop.id },
    error: null
  });
  insert.mockImplementation((payload: Record<string, unknown>) => ({
    select: vi.fn(() => ({ single })),
    payload
  }));

  return {
    insert,
    maybeSingle,
    client: {
      from: vi.fn(() => ({ select: selectRead, insert }))
    }
  };
}

describe("canonical owner shop location", () => {
  it("reuses the canonical location already linked by shop reference", async () => {
    const mock = createClient({ existing: { id: "location-existing", reference_code: shop.id } });

    const result = await ensureCanonicalOwnerShopLocation(mock.client as never, shop);

    expect(result).toEqual({ id: "location-existing", reference_code: shop.id });
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("creates a hidden, unverified canonical location without faking map readiness", async () => {
    const mock = createClient({ existing: null });

    const result = await ensureCanonicalOwnerShopLocation(mock.client as never, shop);

    expect(result).toEqual({ id: "location-new", reference_code: shop.id });
    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({
      reference_code: shop.id,
      name: shop.name,
      address: shop.address,
      city: shop.city,
      state: shop.state,
      postal_code: shop.zip_code,
      location_active: true,
      location_visibility: "hidden",
      location_verified: false
    }));
  });

  it("reuses a legacy location whose UUID is the shop UUID instead of creating a duplicate", async () => {
    const legacyShop = {
      ...shop,
      id: "00000000-0000-4000-8000-000000000222"
    };
    const insert = vi.fn();
    const eqFields: string[] = [];
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn((field: string) => {
            eqFields.push(field);
            return {
              maybeSingle: vi.fn(async () => field === "id"
                ? { data: { id: legacyShop.id, reference_code: null }, error: null }
                : { data: null, error: null })
            };
          })
        })),
        insert
      }))
    };

    const result = await ensureCanonicalOwnerShopLocation(client as never, legacyShop);

    expect(result).toEqual({ id: legacyShop.id, reference_code: null });
    expect(eqFields).toEqual(["reference_code", "id"]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("reselects the winning location after a concurrent unique-reference insert", async () => {
    const mock = createClient({
      existing: null,
      insertResult: { data: null, error: { code: "23505" } },
      raceWinner: { id: "location-winner", reference_code: shop.id }
    });

    const result = await ensureCanonicalOwnerShopLocation(mock.client as never, shop);

    expect(result).toEqual({ id: "location-winner", reference_code: shop.id });
    expect(mock.maybeSingle).toHaveBeenCalledTimes(2);
  });
});
