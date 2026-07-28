import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAccount } from "@/types/domain";

const {
  createSupabaseAdminClientMock,
  createSupabaseServerClientMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock
}));

import {
  getPublicQueueStatus,
  getRentWorkspacePayload,
  getShopSetupSnapshot,
  issueRentReleaseCertificate
} from "@/lib/rent/service";

const LOCATION_ID = "11111111-1111-4111-8111-111111111111";

function user(role: UserAccount["role"], overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    role,
    email: `${role}@example.test`,
    password: "",
    name: role,
    title: role,
    locationIds: [],
    ...overrides
  };
}

type QueryResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

function createSupabaseStub(results: Record<string, QueryResult>) {
  const selections: Array<{ table: string; columns: string }> = [];
  const filters: Array<{ table: string; method: string; column: string; value: unknown }> = [];

  return {
    selections,
    filters,
    from(table: string) {
      const result = results[table] ?? { data: [], error: null };
      const query: Record<string, unknown> = {};
      query.select = (columns: string) => {
        selections.push({ table, columns });
        return query;
      };
      query.order = () => query;
      query.limit = () => query;
      query.in = (column: string, value: unknown) => {
        filters.push({ table, method: "in", column, value });
        return query;
      };
      query.eq = (column: string, value: unknown) => {
        filters.push({ table, method: "eq", column, value });
        return query;
      };
      query.maybeSingle = async () => result;
      query.then = (
        onFulfilled: (value: QueryResult) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(onFulfilled, onRejected);
      return query;
    }
  };
}

describe("PR22 rent service boundaries", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    createSupabaseServerClientMock.mockReset();
  });

  it("returns an owner rent workspace without selecting earnings, tips, taxes, or service proceeds", async () => {
    const supabase = createSupabaseStub({
      shop_barber_relationships: { data: [], error: null },
      rent_agreements: { data: [], error: null },
      rent_obligations: { data: [], error: null },
      rent_contributions: { data: [], error: null },
      rent_actions_audit: { data: [], error: null }
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const payload = await getRentWorkspacePayload(user("shop_owner_user", {
      ownedShopId: "shop-ybor"
    }));

    expect(payload.viewer).toBe("owner");
    const contributionSelect = supabase.selections.find(
      (selection) => selection.table === "rent_contributions"
    )?.columns ?? "";
    expect(contributionSelect).toContain("applied_cents");
    expect(contributionSelect).not.toMatch(/eligible|service|tip|tax|earnings|gross/i);
    expect(supabase.filters).toContainEqual({
      table: "rent_contributions",
      method: "in",
      column: "shop_id",
      value: ["shop-ybor"]
    });
  });

  it("fails closed for a client before querying rent truth", async () => {
    await expect(getRentWorkspacePayload(user("client_user")))
      .rejects.toMatchObject({ status: 403 });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("resolves a canonical UUID location for an owner's textual shop reference", async () => {
    const supabase = createSupabaseStub({
      locations: { data: { id: LOCATION_ID }, error: null },
      shop_setup_gates: { data: [], error: null }
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase);

    const snapshot = await getShopSetupSnapshot(user("shop_owner_user", {
      ownedShopId: "shop-ybor",
      locationIds: ["shop-ybor"]
    }));

    expect(snapshot).toMatchObject({
      shopId: "shop-ybor",
      locationId: LOCATION_ID,
      requiredCount: 12,
      passedCount: 0,
      operational: false
    });
    expect(supabase.filters).toContainEqual({
      table: "locations",
      method: "eq",
      column: "reference_code",
      value: "shop-ybor"
    });
  });

  it("rejects malformed public queue tokens without touching Supabase", async () => {
    await expect(getPublicQueueStatus("guessable-token")).resolves.toBeNull();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects untraceable release evidence before touching Supabase", async () => {
    await expect(issueRentReleaseCertificate({
      commitSha: "short",
      deploymentId: "preview-url"
    })).rejects.toMatchObject({ status: 409 });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });
});
