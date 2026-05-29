const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

function makeBarberQuery() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: {
            id: "barber-real",
            reference_code: "barber-real-ref",
            profile_id: "profile-barber",
            compensation_model: "commission",
            commission_rate: null,
            booth_rent_amount: null,
            booth_rent_frequency: null,
            app_approval_status: "approved",
            shop_approval_status: "not_required",
            barber_subtype: "solo"
          },
          error: null
        }))
      }))
    }))
  };
}

function makeMissingInvitesQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({
      data: null,
      error: { code: "42P01", message: "relation shop_team_invites does not exist" }
    }))
  };
  return query;
}

function makeQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      const rows = Array.isArray(result.data) ? result.data : [];
      return { data: rows[0] ?? null, error: result.error };
    }),
    single: vi.fn(async () => {
      const rows = Array.isArray(result.data) ? result.data : [];
      return { data: rows[0] ?? result.data ?? null, error: result.error };
    }),
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
  };

  return query;
}

describe("shop team invite service", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("returns an empty barber invite state when the canonical invite relation is missing", async () => {
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "barbers") {
          return makeBarberQuery();
        }
        if (table === "shop_team_invites") {
          return makeMissingInvitesQuery();
        }
        throw new Error(`Unexpected table: ${table}`);
      })
    });

    const { listBarberTeamInvites } = await import("@/lib/operations/shop-team-invites");

    await expect(listBarberTeamInvites({
      id: "profile-barber",
      role: "commission_barber",
      email: "barber@example.com",
      password: "",
      name: "Real Barber",
      title: "Barber",
      locationIds: [],
      barberId: "barber-real-ref"
    })).resolves.toEqual({ invites: [] });
  });

  it("opens the owner invite directory from canonical shops when no location bridge exists", async () => {
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "shops") {
          return makeQuery({
            data: [{
              id: "shop-university",
              name: "The BVRB3R Shop",
              owner_profile_id: "profile-owner",
              neighborhood: "University Mall",
              city: "Tampa",
              state: "FL",
              address: "2200 E Fowler Ave",
              app_approval_status: "approved"
            }],
            error: null
          });
        }
        if (table === "locations") {
          return makeQuery({ data: [], error: null });
        }
        if (table === "barbers") {
          return makeQuery({ data: [], error: null });
        }
        return makeQuery({ data: [], error: null });
      })
    });

    const { listOwnerTeamInviteDirectory } = await import("@/lib/operations/shop-team-invites");

    await expect(listOwnerTeamInviteDirectory({
      id: "profile-owner",
      role: "shop_owner_user",
      email: "owner@example.com",
      password: "",
      name: "Owner",
      title: "Owner",
      locationIds: []
    })).resolves.toMatchObject({
      shop: {
        id: "shop-university",
        label: "The BVRB3R Shop | University Mall | Tampa",
        setupNote: expect.stringContaining("location bridge")
      },
      barbers: []
    });
  });
});
