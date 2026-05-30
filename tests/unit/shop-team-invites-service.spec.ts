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
    vi.resetModules();
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

  it("does not block owner invites for an active independent freelance chair", async () => {
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
          return makeQuery({
            data: [{
              id: "loc-independent",
              reference_code: "independent-barber-profile-barber",
              name: "Phil's chair",
              neighborhood: "Tampa",
              city: "Tampa",
              state: "FL"
            }],
            error: null
          });
        }
        if (table === "barbers") {
          return makeQuery({
            data: [{
              id: "barber-real",
              reference_code: "barber-real-ref",
              profile_id: "profile-barber",
              compensation_model: "commission",
              commission_rate: null,
              booth_rent_amount: null,
              booth_rent_frequency: null,
              app_approval_status: "approved",
              shop_approval_status: "approved",
              barber_subtype: "solo"
            }],
            error: null
          });
        }
        if (table === "profiles") {
          return makeQuery({
            data: [{
              id: "profile-barber",
              full_name: "Phillip McGee",
              email: "phillip@example.com",
              phone: null,
              role: "barber_user",
              primary_onboarding_role: "barber"
            }],
            error: null
          });
        }
        if (table === "barber_profiles") {
          return makeQuery({
            data: [{
              barber_reference: "barber-real-ref",
              username: "philforsure",
              display_name: "Phillip McGee",
              service_area_label: "Tampa"
            }],
            error: null
          });
        }
        if (table === "marketplace_visibility") {
          return makeQuery({
            data: [{ barber_reference: "barber-real-ref", visibility_state: "public", accepts_instant_bookings: true }],
            error: null
          });
        }
        if (table === "staff_locations") {
          return makeQuery({
            data: [{
              id: "membership-independent",
              profile_id: "profile-barber",
              shop_id: "independent-barber-profile-barber",
              location_id: "loc-independent",
              relationship_status: "active",
              routing_model: "freelance",
              ended_at: null
            }],
            error: null
          });
        }
        if (table === "marketplace_services" || table === "services") {
          return makeQuery({
            data: [{ barber_reference: "barber-real-ref", price: 35, duration_min: 45, name: "Fade", active: true }],
            error: null
          });
        }
        if (table === "availability_rules") {
          return makeQuery({ data: [{ barber_id: "barber-real" }], error: null });
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
      barbers: [{
        name: "Phillip McGee",
        alreadyAssigned: false,
        inviteStatus: null,
        canInvite: true,
        inviteDisabledReason: null,
        readinessLabels: expect.arrayContaining(["Independent location"])
      }]
    });
  });

  it("blocks owner invites for an active real shop relationship", async () => {
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "shops") {
          return makeQuery({
            data: [
              {
                id: "shop-university",
                name: "The BVRB3R Shop",
                owner_profile_id: "profile-owner",
                neighborhood: "University Mall",
                city: "Tampa",
                state: "FL",
                address: "2200 E Fowler Ave",
                app_approval_status: "approved"
              },
              {
                id: "shop-other",
                name: "Other Shop",
                owner_profile_id: "profile-other-owner",
                neighborhood: "Ybor",
                city: "Tampa",
                state: "FL",
                address: "7th Ave",
                app_approval_status: "approved"
              }
            ],
            error: null
          });
        }
        if (table === "locations") {
          return makeQuery({
            data: [{
              id: "loc-other",
              reference_code: "shop-other",
              name: "Other Shop",
              neighborhood: "Ybor",
              city: "Tampa",
              state: "FL"
            }],
            error: null
          });
        }
        if (table === "barbers") {
          return makeQuery({
            data: [{
              id: "barber-real",
              reference_code: "barber-real-ref",
              profile_id: "profile-barber",
              compensation_model: "commission",
              commission_rate: null,
              booth_rent_amount: null,
              booth_rent_frequency: null,
              app_approval_status: "approved",
              shop_approval_status: "approved",
              barber_subtype: "solo"
            }],
            error: null
          });
        }
        if (table === "profiles") {
          return makeQuery({
            data: [{
              id: "profile-barber",
              full_name: "Phillip McGee",
              email: "phillip@example.com",
              phone: null,
              role: "barber_user",
              primary_onboarding_role: "barber"
            }],
            error: null
          });
        }
        if (table === "barber_profiles") {
          return makeQuery({
            data: [{
              barber_reference: "barber-real-ref",
              username: "philforsure",
              display_name: "Phillip McGee",
              service_area_label: "Tampa"
            }],
            error: null
          });
        }
        if (table === "marketplace_visibility") {
          return makeQuery({
            data: [{ barber_reference: "barber-real-ref", visibility_state: "public", accepts_instant_bookings: true }],
            error: null
          });
        }
        if (table === "staff_locations") {
          return makeQuery({
            data: [{
              id: "membership-real-shop",
              profile_id: "profile-barber",
              shop_id: "shop-other",
              location_id: "loc-other",
              relationship_status: "active",
              routing_model: "commission",
              ended_at: null
            }],
            error: null
          });
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
      barbers: [{
        name: "Phillip McGee",
        alreadyAssigned: true,
        inviteStatus: "active",
        canInvite: false,
        inviteDisabledReason: "This barber is already connected to another shop."
      }]
    });
  });

  it("lets a barber with only an independent freelance chair request to join an approved shop", async () => {
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "barbers") {
          return makeQuery({
            data: [{
              id: "barber-real",
              reference_code: "barber-real-ref",
              profile_id: "profile-barber",
              compensation_model: "commission",
              commission_rate: null,
              booth_rent_amount: null,
              booth_rent_frequency: null,
              app_approval_status: "approved",
              shop_approval_status: "approved",
              barber_subtype: "solo"
            }],
            error: null
          });
        }
        if (table === "staff_locations") {
          return makeQuery({
            data: [{
              id: "membership-independent",
              profile_id: "profile-barber",
              shop_id: "independent-barber-profile-barber",
              location_id: "loc-independent",
              relationship_status: "active",
              routing_model: "freelance",
              ended_at: null
            }],
            error: null
          });
        }
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
          return makeQuery({
            data: [{
              id: "loc-independent",
              reference_code: "independent-barber-profile-barber",
              name: "Phil's chair",
              neighborhood: "Tampa",
              city: "Tampa",
              state: "FL"
            }],
            error: null
          });
        }
        return makeQuery({ data: [], error: null });
      })
    });

    const { listBarberJoinableShops } = await import("@/lib/operations/shop-team-invites");

    await expect(listBarberJoinableShops({
      id: "profile-barber",
      role: "barber_user",
      email: "phillip@example.com",
      password: "",
      name: "Phillip",
      title: "Barber",
      locationIds: [],
      barberId: "barber-real-ref"
    }, "bvrb3r")).resolves.toMatchObject({
      shops: [{
        shopId: "shop-university",
        alreadyAssigned: false,
        canRequest: true,
        readinessLabels: expect.arrayContaining(["Freelance chair active"])
      }]
    });
  });
});
