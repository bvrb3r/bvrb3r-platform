import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import {
  AuthorizationError,
  assertSelf,
  assertShopMember,
  assertShopOwner,
  canActOnSelf,
  hasBarberContext,
  hasInternalAccess,
  hasInternalAccessByProfileId,
  isBarberAtShop,
  isGuestActor,
  isShopMemberOf,
  isShopOwnerOf,
  lane,
  resolveBarberContext
} from "@/lib/auth/permissions";

/** Minimal stub of the query chain the predicates use. */
function stubSupabase(tables: Record<string, { data?: unknown; error?: unknown }>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null })
      };
      return chain;
    }
  };
}

const GUEST = { id: "guest-user", role: "client_user" as const, platformAdmin: false };
const CLIENT = { id: "client-1", role: "client_user" as const, platformAdmin: false };
const OTHER_CLIENT = { id: "client-2", role: "client_user" as const, platformAdmin: false };
const BARBER = { id: "barber-profile-1", role: "barber_user" as const, platformAdmin: false };
const OWNER = { id: "owner-1", role: "shop_owner_user" as const, platformAdmin: false };
const OTHER_OWNER = { id: "owner-2", role: "shop_owner_user" as const, platformAdmin: false };
const ARCHITECT = { id: "operator-1", role: "client_user" as const, platformAdmin: true };

describe("guest actors", () => {
  beforeEach(() => createSupabaseAdminClientMock.mockReset());

  it("recognises the unauthenticated sentinel and a missing actor", () => {
    expect(isGuestActor(GUEST)).toBe(true);
    expect(isGuestActor(null)).toBe(true);
    expect(isGuestActor(undefined)).toBe(true);
    expect(isGuestActor(CLIENT)).toBe(false);
  });

  it("denies a guest every predicate without ever querying", async () => {
    createSupabaseAdminClientMock.mockReturnValue(stubSupabase({}));

    expect(canActOnSelf(GUEST, "client-1")).toBe(false);
    expect(canActOnSelf(GUEST, "guest-user")).toBe(false);
    expect(hasInternalAccess(GUEST)).toBe(false);
    expect(await isShopOwnerOf(GUEST, "shop-1")).toBe(false);
    expect(await isShopMemberOf(GUEST, "shop-1")).toBe(false);
    expect(await hasBarberContext(GUEST)).toBe(false);
    expect(await isBarberAtShop(GUEST, "shop-1")).toBe(false);
    expect(lane.isClient(GUEST)).toBe(false);
  });
});

describe("self scope", () => {
  it("allows a user to act on their own record and no one else's", () => {
    expect(canActOnSelf(CLIENT, "client-1")).toBe(true);
    expect(canActOnSelf(CLIENT, "client-2")).toBe(false);
    expect(canActOnSelf(CLIENT, null)).toBe(false);
  });

  it("throws for another user's record and passes for internal access", async () => {
    await expect(assertSelf(CLIENT, "client-2")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(assertSelf(CLIENT, "client-1")).resolves.toBeUndefined();
    await expect(assertSelf(ARCHITECT, "client-1")).resolves.toBeUndefined();
  });
});

describe("shop ownership", () => {
  beforeEach(() => createSupabaseAdminClientMock.mockReset());

  it("allows the recorded owner of that shop", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({ shops: { data: { id: "shop-1", owner_profile_id: "owner-1" } } })
    );
    expect(await isShopOwnerOf(OWNER, "shop-1")).toBe(true);
  });

  it("denies an owner of a different shop", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({ shops: { data: { id: "shop-1", owner_profile_id: "owner-1" } } })
    );
    expect(await isShopOwnerOf(OTHER_OWNER, "shop-1")).toBe(false);
    await expect(assertShopOwner(OTHER_OWNER, "shop-1")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("does not treat the shop_owner lane as ownership of an arbitrary shop", async () => {
    // The lane says what kind of account this is; the row says which business.
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({ shops: { data: { id: "shop-9", owner_profile_id: null } } })
    );
    expect(lane.isShopOwner(OWNER)).toBe(true);
    expect(await isShopOwnerOf(OWNER, "shop-9")).toBe(false);
  });

  it("denies when the shop row is missing or the query errors", async () => {
    createSupabaseAdminClientMock.mockReturnValue(stubSupabase({ shops: { data: null } }));
    expect(await isShopOwnerOf(OWNER, "shop-missing")).toBe(false);

    createSupabaseAdminClientMock.mockReturnValue(stubSupabase({ shops: { error: { message: "boom" } } }));
    expect(await isShopOwnerOf(OWNER, "shop-1")).toBe(false);
  });

  it("fails closed when no Supabase client is available", async () => {
    createSupabaseAdminClientMock.mockReturnValue(null);
    expect(await isShopOwnerOf(OWNER, "shop-1")).toBe(false);
    expect(await isShopMemberOf(OWNER, "shop-1")).toBe(false);
    expect(await hasBarberContext(BARBER)).toBe(false);
  });
});

describe("shop membership", () => {
  beforeEach(() => createSupabaseAdminClientMock.mockReset());

  it("allows an active operator-access member who is not the owner", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({
        shops: { data: { id: "shop-1", owner_profile_id: "owner-1" } },
        shop_operator_access: { data: { profile_id: "client-1", shop_id: "shop-1", status: "active" } }
      })
    );
    expect(await isShopMemberOf(CLIENT, "shop-1")).toBe(true);
  });

  it("denies a non-member", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({
        shops: { data: { id: "shop-1", owner_profile_id: "owner-1" } },
        shop_operator_access: { data: null }
      })
    );
    expect(await isShopMemberOf(OTHER_CLIENT, "shop-1")).toBe(false);
    await expect(assertShopMember(OTHER_CLIENT, "shop-1")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("counts the owner as a member", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({ shops: { data: { id: "shop-1", owner_profile_id: "owner-1" } } })
    );
    expect(await isShopMemberOf(OWNER, "shop-1")).toBe(true);
  });

  it("lets internal access pass the assertions", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({ shops: { data: { id: "shop-1", owner_profile_id: "owner-1" } } })
    );
    await expect(assertShopMember(ARCHITECT, "shop-1")).resolves.toBeUndefined();
    await expect(assertShopOwner(ARCHITECT, "shop-1")).resolves.toBeUndefined();
  });
});

describe("barber context", () => {
  beforeEach(() => createSupabaseAdminClientMock.mockReset());

  it("resolves the barber reference from the canonical barbers row", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({ barbers: { data: { id: "b-uuid", reference_code: "barber-blaze", profile_id: "barber-profile-1" } } })
    );
    expect(await resolveBarberContext(BARBER)).toEqual({ barberId: "b-uuid", barberReference: "barber-blaze" });
  });

  it("treats a barber-lane account with no barbers row as having no context", async () => {
    createSupabaseAdminClientMock.mockReturnValue(stubSupabase({ barbers: { data: null } }));
    expect(lane.isBarber(BARBER)).toBe(true);
    expect(await hasBarberContext(BARBER)).toBe(false);
  });

  it("allows a barber with an active membership at that shop", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({
        barbers: { data: { id: "b-uuid", reference_code: "barber-blaze", profile_id: "barber-profile-1" } },
        barber_shop_memberships: { data: { barber_reference: "barber-blaze", shop_reference: "shop-1", active: true } }
      })
    );
    expect(await isBarberAtShop(BARBER, "shop-1")).toBe(true);
  });

  it("denies a barber with no membership at that shop", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({
        barbers: { data: { id: "b-uuid", reference_code: "barber-blaze", profile_id: "barber-profile-1" } },
        barber_shop_memberships: { data: null }
      })
    );
    expect(await isBarberAtShop(BARBER, "shop-2")).toBe(false);
  });
});

describe("internal (Architect) access", () => {
  beforeEach(() => createSupabaseAdminClientMock.mockReset());

  it("is never granted by a public role", () => {
    expect(hasInternalAccess(CLIENT)).toBe(false);
    expect(hasInternalAccess(OWNER)).toBe(false);
    expect(hasInternalAccess(BARBER)).toBe(false);
    expect(hasInternalAccess(ARCHITECT)).toBe(true);
  });

  it("reads the canonical access table, requiring an active privileged level", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({ internal_operator_access: { data: { access_level: "architect_prime", status: "active" } } })
    );
    expect(await hasInternalAccessByProfileId("operator-1")).toBe(true);

    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({ internal_operator_access: { data: { access_level: "architect_prime", status: "revoked" } } })
    );
    expect(await hasInternalAccessByProfileId("operator-1")).toBe(false);

    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({ internal_operator_access: { data: { access_level: "viewer", status: "active" } } })
    );
    expect(await hasInternalAccessByProfileId("operator-1")).toBe(false);
  });

  it("fails closed for an unknown profile, an error, or no client", async () => {
    createSupabaseAdminClientMock.mockReturnValue(stubSupabase({ internal_operator_access: { data: null } }));
    expect(await hasInternalAccessByProfileId("nobody")).toBe(false);

    createSupabaseAdminClientMock.mockReturnValue(
      stubSupabase({ internal_operator_access: { error: { message: "boom" } } })
    );
    expect(await hasInternalAccessByProfileId("operator-1")).toBe(false);

    createSupabaseAdminClientMock.mockReturnValue(null);
    expect(await hasInternalAccessByProfileId("operator-1")).toBe(false);
    expect(await hasInternalAccessByProfileId(null)).toBe(false);
  });
});

describe("AuthorizationError carries an actionable status", () => {
  it("uses 403 for a scope failure", async () => {
    await assertSelf(CLIENT, "client-2").catch((error: AuthorizationError) => {
      expect(error.status).toBe(403);
      expect(error.code).toBe("self_scope_required");
    });
    expect.assertions(2);
  });
});
