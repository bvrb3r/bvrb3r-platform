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
});
