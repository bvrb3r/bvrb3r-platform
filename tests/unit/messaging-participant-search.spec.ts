import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { searchMessagingParticipants } from "@/lib/messages/service";

type TableName =
  | "profiles"
  | "clients"
  | "thread_participants"
  | "public_usernames"
  | "barber_profiles"
  | "barbers"
  | "shops"
  | "staff_locations";

type SupabaseMockOptions = {
  registryUnavailable?: boolean;
  directShopSearchReturnsShop?: boolean;
  actorKind?: "client" | "shop";
};

const shopRow = {
  id: "shop-the-bvrb3r-shop",
  name: "The BVRB3R Shop (University Mall)",
  public_username: "thebvrb3rshopuniversitymall",
  profile_photo_path: null,
  profile_photo_url: "https://cdn.bvrb3r.test/shop-logo.jpg",
  address: "2172 University Square Mall",
  city: "Tampa",
  state: "FL",
  zip_code: "33612",
  owner_profile_id: "profile-owner"
};

function createResult(data: unknown[] | null, error: unknown = null) {
  return Promise.resolve({ data, error });
}

function createMaybeSingleResult(data: unknown | null, error: unknown = null) {
  return Promise.resolve({ data, error });
}

function createParticipantSearchSupabaseMock(options: SupabaseMockOptions = {}) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const actorProfile = options.actorKind === "shop"
    ? {
        id: "profile-owner",
        full_name: "Phillip mcgee",
        email: "owner@bvrb3r.test",
        role: "owner",
        public_username: null,
        profile_photo_path: null,
        profile_photo_url: null,
        public_city: null,
        public_state: null
      }
    : {
        id: "profile-client",
        full_name: "Private Client",
        email: "client@bvrb3r.test",
        role: "client",
        public_username: "phillipmcgee",
        profile_photo_path: null,
        profile_photo_url: null,
        public_city: "Tampa",
        public_state: "FL"
      };

  class QueryBuilder {
    private filters = new Map<string, unknown>();
    private inFilter: { column: string; values: unknown[] } | null = null;
    private usesOr = false;

    constructor(private readonly table: TableName) {}

    select(...args: unknown[]) {
      calls.push({ table: this.table, method: "select", args });
      return this;
    }

    eq(column: string, value: unknown) {
      calls.push({ table: this.table, method: "eq", args: [column, value] });
      this.filters.set(column, value);
      return this;
    }

    ilike(column: string, value: unknown) {
      calls.push({ table: this.table, method: "ilike", args: [column, value] });
      return this;
    }

    or(value: unknown) {
      calls.push({ table: this.table, method: "or", args: [value] });
      this.usesOr = true;
      return this;
    }

    in(column: string, values: unknown[]) {
      calls.push({ table: this.table, method: "in", args: [column, values] });
      this.inFilter = { column, values };
      return this;
    }

    limit(value: number) {
      calls.push({ table: this.table, method: "limit", args: [value] });
      return this;
    }

    maybeSingle() {
      if (this.table === "profiles") {
        return createMaybeSingleResult(actorProfile);
      }

      if (this.table === "clients") {
        return createMaybeSingleResult(options.actorKind === "shop" ? null : { id: "client-1", profile_id: "profile-client" });
      }

      return createMaybeSingleResult(null);
    }

    then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
      return this.resolve().then(resolve, reject);
    }

    private resolve() {
      if (this.table === "thread_participants") {
        return createResult([]);
      }

      if (this.table === "public_usernames") {
        if (options.registryUnavailable) {
          return createResult(null, { code: "42P01", message: "relation public_usernames does not exist" });
        }

        return createResult([
          {
            owner_type: "shop",
            owner_id: "shop-the-bvrb3r-shop",
            username: "thebvrb3rshopuniversitymall"
          }
        ]);
      }

      if (this.table === "barber_profiles" || this.table === "barbers") {
        return createResult([]);
      }

      if (this.table === "profiles") {
        if (this.inFilter?.column === "id") {
          return createResult(this.inFilter.values.includes(actorProfile.id) ? [actorProfile] : []);
        }

        return createResult([]);
      }

      if (this.table === "clients") {
        return createResult([]);
      }

      if (this.table === "shops") {
        if (this.inFilter?.column === "id") {
          return createResult(this.inFilter.values.includes(shopRow.id) ? [shopRow] : []);
        }

        return createResult(options.directShopSearchReturnsShop && this.usesOr ? [shopRow] : []);
      }

      if (this.table === "staff_locations") {
        return createResult([]);
      }

      return createResult([]);
    }
  }

  return {
    calls,
    client: {
      from: vi.fn((table: TableName) => new QueryBuilder(table))
    }
  };
}

describe("messaging participant public username search", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("hydrates shop public username results from the global registry even when staff lookup is empty", async () => {
    const supabase = createParticipantSearchSupabaseMock();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await searchMessagingParticipants({
      role: "client",
      email: "client@bvrb3r.test"
    } as never, "@thebvrb");

    expect(supabase.calls.some((call) => call.table === "public_usernames")).toBe(true);
    expect(payload.results).toEqual([
      expect.objectContaining({
        resultType: "shop",
        displayName: "@thebvrb3rshopuniversitymall",
        publicUsername: "thebvrb3rshopuniversitymall",
        publicContextLine: "2172 University Square Mall - Tampa, FL 33612",
        publicProfileHref: "/shop/thebvrb3rshopuniversitymall",
        createThreadInput: {
          threadType: "client_shop",
          profileId: "profile-owner",
          locationId: "shop-the-bvrb3r-shop"
        }
      })
    ]);
  });

  it("falls back to direct shops.public_username search when the registry is unavailable", async () => {
    const supabase = createParticipantSearchSupabaseMock({
      registryUnavailable: true,
      directShopSearchReturnsShop: true
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await searchMessagingParticipants({
      role: "client",
      email: "client@bvrb3r.test"
    } as never, "THE BVRB");

    expect(payload.results[0]).toEqual(expect.objectContaining({
      resultType: "shop",
      publicUsername: "thebvrb3rshopuniversitymall",
      publicProfileHref: "/shop/thebvrb3rshopuniversitymall"
    }));
  });

  it("keeps the owner's own shop visible with a disabled self message state", async () => {
    const supabase = createParticipantSearchSupabaseMock({ actorKind: "shop" });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const payload = await searchMessagingParticipants({
      role: "owner",
      email: "owner@bvrb3r.test",
      locationIds: ["shop-the-bvrb3r-shop"]
    } as never, "@thebvrb3rshopuniversitymall");

    const shopResult = payload.results.find((result) => result.resultType === "shop");

    expect(shopResult).toEqual(expect.objectContaining({
      resultType: "shop",
      publicUsername: "thebvrb3rshopuniversitymall",
      createThreadInput: null,
      messageDisabledReason: "This is your shop."
    }));
  });
});
