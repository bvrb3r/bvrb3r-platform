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

  it("hydrates barber invites for text shop ids without querying locations.id", async () => {
    const locationsIdQueryMock = vi.fn();
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "barbers") {
          return makeBarberQuery();
        }
        if (table === "shop_team_invites") {
          return makeQuery({
            data: [{
              id: "invite-text-shop",
              shop_id: "shop-the-bvrb3r-shop-universi-a02c68",
              barber_id: "barber-real",
              barber_profile_id: "profile-barber",
              invited_by_profile_id: "profile-owner",
              requested_by_profile_id: null,
              status: "invited",
              message: null,
              created_at: "2026-05-30T10:00:00.000Z",
              updated_at: "2026-05-30T10:00:00.000Z",
              responded_at: null,
              routing_model: "booth_rent"
            }],
            error: null
          });
        }
        if (table === "shops") {
          return makeQuery({
            data: [{
              id: "shop-the-bvrb3r-shop-universi-a02c68",
              name: "The BVRB3R™ Shop",
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
          const query = makeQuery({ data: [], error: null }) as Record<string, unknown>;
          query.in = vi.fn((column: string, values: string[]) => {
            if (column === "id") {
              locationsIdQueryMock(values);
            }
            return query;
          });
          return query;
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
        throw new Error(`Unexpected table: ${table}`);
      })
    });

    const { listBarberTeamInvites } = await import("@/lib/operations/shop-team-invites");

    await expect(listBarberTeamInvites({
      id: "profile-barber",
      role: "barber_user",
      email: "barber@example.com",
      password: "",
      name: "Real Barber",
      title: "Barber",
      locationIds: [],
      barberId: "barber-real-ref"
    })).resolves.toMatchObject({
      invites: [{
        id: "invite-text-shop",
        shopId: "shop-the-bvrb3r-shop-universi-a02c68",
        shopLabel: "The BVRB3R™ Shop | University Mall | Tampa",
        status: "invited",
        operatingModel: "booth_rent"
      }]
    });
    expect(locationsIdQueryMock).not.toHaveBeenCalled();
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

  it("accepts a shop invitation by ending the independent chair and activating the canonical shop relationship", async () => {
    const staffLocationUpdates: unknown[] = [];
    const staffLocationInserts: unknown[] = [];
    const inviteUpdates: unknown[] = [];
    const profilesTableCalls: string[] = [];
    const pendingInvite = {
      id: "invite-shop",
      shop_id: "shop-university",
      barber_id: "barber-real",
      barber_profile_id: "profile-barber",
      invited_by_profile_id: "profile-owner",
      requested_by_profile_id: null,
      status: "invited",
      message: null,
      created_at: "2026-06-14T10:00:00.000Z",
      updated_at: "2026-06-14T10:00:00.000Z",
      responded_at: null,
      approved_by_owner_at: "2026-06-14T10:00:00.000Z",
      approved_by_barber_at: null,
      routing_model: "booth_rent",
      booth_rent_amount: 250,
      booth_rent_frequency: "weekly",
      barber_percent: null,
      shop_percent: null,
      commission_cap_amount: null,
      commission_cap_frequency: null
    };
    const updatedInvite = {
      ...pendingInvite,
      status: "active",
      responded_at: "2026-06-14T10:05:00.000Z",
      approved_by_barber_at: "2026-06-14T10:05:00.000Z"
    };

    const makeScriptedQuery = (result: { data: unknown; error: unknown }) => {
      const query: Record<string, unknown> = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
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
    };

    const makeStaffLocationsQuery = () => {
      const result = {
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
      };
      const query = makeScriptedQuery(result);
      query.update = vi.fn((payload: unknown) => {
        staffLocationUpdates.push(payload);
        return query;
      });
      query.insert = vi.fn((payload: unknown) => {
        staffLocationInserts.push(payload);
        return query;
      });
      return query;
    };

    const makeInviteQuery = () => {
      let terminalResult = { data: [pendingInvite], error: null };
      const query = makeScriptedQuery(terminalResult);
      query.in = vi.fn((column: string) => {
        if (column === "status") {
          terminalResult = { data: [], error: null };
        }
        return query;
      });
      query.update = vi.fn((payload: unknown) => {
        inviteUpdates.push(payload);
        return query;
      });
      query.single = vi.fn(async () => ({ data: updatedInvite, error: null }));
      query.then = (resolve: (value: typeof terminalResult) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(terminalResult).then(resolve, reject);
      return query;
    };

    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "barbers") {
          return makeBarberQuery();
        }
        if (table === "shop_team_invites") {
          return makeInviteQuery();
        }
        if (table === "staff_locations") {
          return makeStaffLocationsQuery();
        }
        if (table === "locations") {
          return makeScriptedQuery({
            data: [
              {
                id: "loc-independent",
                reference_code: "independent-barber-profile-barber",
                name: "Phil's chair",
                neighborhood: "Tampa",
                city: "Tampa",
                state: "FL"
              }
            ],
            error: null
          });
        }
        if (table === "shops") {
          return makeScriptedQuery({
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
        if (table === "profiles") {
          profilesTableCalls.push(table);
          return makeScriptedQuery({
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
        throw new Error(`Unexpected table: ${table}`);
      })
    });

    const { respondToBarberTeamInvite } = await import("@/lib/operations/shop-team-invites");

    await expect(respondToBarberTeamInvite({
      id: "profile-barber",
      role: "barber_user",
      email: "barber@example.com",
      password: "",
      name: "Real Barber",
      title: "Barber",
      locationIds: [],
      barberId: "barber-real-ref"
    }, { inviteId: "invite-shop", status: "accepted" })).resolves.toMatchObject({
      invite: {
        id: "invite-shop",
        status: "active",
        shopLabel: "The BVRB3R Shop | University Mall | Tampa",
        operatingModel: "booth_rent"
      }
    });

    expect(staffLocationUpdates).toEqual([
      expect.objectContaining({
        relationship_status: "ended",
        ended_by_profile_id: "profile-barber",
        ended_by_role: "barber"
      })
    ]);
    expect(staffLocationInserts).toEqual([
      expect.objectContaining({
        profile_id: "profile-barber",
        shop_id: "shop-university",
        location_id: null,
        relationship_status: "active",
        invited_by_profile_id: "profile-owner",
        approved_by_owner_at: expect.any(String),
        approved_by_barber_at: expect.any(String),
        routing_model: "booth_rent",
        booth_rent_amount: 250,
        booth_rent_frequency: "weekly"
      })
    ]);
    expect(inviteUpdates).toEqual([
      expect.objectContaining({
        status: "active",
        approved_by_barber_at: expect.any(String),
        approved_by_owner_at: expect.any(String)
      })
    ]);
    expect(profilesTableCalls).toEqual(["profiles"]);
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
