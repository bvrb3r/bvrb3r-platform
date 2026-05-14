import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => true
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/trust/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trust/engine")>("@/lib/trust/engine");
  return {
    getTrustProvider: async () => ({
      readState: async () => actual.createEmptyTrustState()
    })
  };
});

import { searchBarbersAndShopsPayload } from "@/lib/booking/platform-service";

type QueryResult<T> = Promise<{ data: T[]; error: null }>;

function createQuery<T extends Record<string, unknown>>(rows: T[], filters: Array<(row: T) => boolean> = []) {
  const resolve = (): QueryResult<T> => Promise.resolve({
    data: rows.filter((row) => filters.every((filter) => filter(row))),
    error: null
  });

  return {
    eq(field: string, value: unknown) {
      return createQuery(rows, [...filters, (row) => row[field] === value]);
    },
    order() {
      return createQuery(rows, filters);
    },
    limit() {
      return createQuery(rows, filters);
    },
    async maybeSingle() {
      const result = await resolve();
      return { data: result.data[0] ?? null, error: null };
    },
    async single() {
      const result = await resolve();
      return { data: result.data[0] ?? null, error: null };
    },
    then<TResult1 = { data: T[]; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return resolve().then(onfulfilled, onrejected);
    }
  };
}

function createSupabaseMock(tables: Record<string, Array<Record<string, unknown>>>) {
  function upsertRows(table: string, payload: Record<string, unknown> | Array<Record<string, unknown>>, conflictField = "id") {
    tables[table] ??= [];
    const entries = Array.isArray(payload) ? payload : [payload];
    for (const entry of entries) {
      const existing = tables[table].find((row) => row[conflictField] === entry[conflictField]);
      if (existing) {
        Object.assign(existing, entry);
      } else {
        tables[table].push(entry);
      }
    }
    return { data: entries, error: null };
  }

  return {
    from(table: string) {
      return {
        select() {
          return createQuery(tables[table] ?? []);
        },
        insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
          const entries = Array.isArray(payload) ? payload : [payload];
          const builder = {
            select() {
              return builder;
            },
            async single() {
              tables[table] ??= [];
              tables[table].push(...entries);
              return { data: entries[0] ?? null, error: null };
            },
            then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
              onfulfilled?: ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
            ) {
              tables[table] ??= [];
              tables[table].push(...entries);
              return Promise.resolve({ data: entries, error: null }).then(onfulfilled, onrejected);
            }
          };
          return builder;
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(field: string, value: unknown) {
              tables[table] ??= [];
              const updated = tables[table].filter((row) => row[field] === value);
              for (const row of updated) {
                Object.assign(row, payload);
              }
              return Promise.resolve({ data: updated, error: null });
            }
          };
        },
        upsert(payload: Record<string, unknown> | Array<Record<string, unknown>>, options?: { onConflict?: string }) {
          return Promise.resolve(upsertRows(table, payload, options?.onConflict));
        }
      };
    }
  };
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}

describe("live client discovery smoke test", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("returns Phillip from the same server discovery function used by Client Search", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(12, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(19, 0, 0, 0);
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      shops: [],
      barbers: [{
        id: "barber-uuid",
        reference_code: "barber-phillip",
        profile_id: "profile-uuid",
        compensation_model: "booth_rent",
        app_approval_status: "approved",
        shop_approval_status: "pending",
        commission_rate: null,
        booth_rent_amount: 150,
        booth_rent_frequency: "weekly",
        bio: "Independent Tampa barber.",
        booking_slug: "phillipmcgee"
      }],
      barber_profiles: [{
        barber_reference: "barber-phillip",
        username: "phillipmcgee",
        display_name: "Phillip mcgee",
        bio: "Independent Tampa barber.",
        years_experience: 7,
        shop_reference: "independent-barber-43b3cda2",
        profile_photo_path: null,
        profile_photo_url: null,
        specialties: ["Haircut"],
        badges: [],
        service_area_label: "Phils chair / 2172 University Square More / Tampa",
        next_available_at: null,
        visibility_state: "public"
      }],
      profiles: [{
        id: "profile-uuid",
        full_name: "Phillip mcgee",
        email: "phillip@example.test",
        phone: "8135550101",
        role: "booth_rent_barber",
        primary_onboarding_role: "barber"
      }],
      services: [{
        id: "service-uuid",
        reference_code: "srv-phillip-cut",
        location_id: "location-uuid",
        category: "Haircut",
        name: "Independent Cut",
        description: "Cut and finish",
        duration_min: 45,
        buffer_min: 0,
        price: 55,
        currency: "usd",
        deposit_amount: 0,
        full_prepay_required: false,
        active: true,
        is_bookable: true,
        display_order: 1,
        created_at: targetDay.toISOString(),
        updated_at: targetDay.toISOString(),
        service_owner_type: "barber",
        barber_reference: "barber-phillip",
        shop_reference: "independent-barber-43b3cda2",
        booking_count: 0,
        popularity_rank: 1
      }],
      marketplace_services: [],
      locations: [{
        id: "location-uuid",
        reference_code: "independent-barber-43b3cda2",
        name: "Phils chair",
        neighborhood: "2172 University Square More",
        city: "Tampa",
        state: "FL",
        phone: "8135550101",
        address: "2172 University Square More",
        latitude: null,
        longitude: null
      }],
      staff_locations: [],
      availability_rules: [{
        barber_id: "barber-uuid",
        location_id: "location-uuid",
        weekday: targetDay.getDay(),
        start_time: formatTime(targetDay),
        end_time: formatTime(targetEnd)
      }],
      blocked_times: [],
      appointments: [],
      reviews: [],
      marketplace_visibility: [{
        barber_reference: "barber-phillip",
        visibility_state: "public",
        accepts_instant_bookings: true,
        featured_rank: null
      }],
      barber_portfolios: [],
      barber_status: [{
        barber_reference: "barber-phillip",
        status: "active",
        live_status: "live",
        accepting_bookings: true
      }],
      connected_accounts: [{
        subject_type: "barber",
        barber_id: "barber-uuid",
        payout_readiness_status: "ready",
        livemode: false,
        charges_enabled: true,
        payouts_enabled: true,
        requirements_currently_due: [],
        requirements_past_due: [],
        disabled_reason: null
      }]
    }));

    const payload = await searchBarbersAndShopsPayload({ query: "phillip" });

    expect(payload.barbers.length).toBeGreaterThanOrEqual(1);
    expect(payload.barbers[0].barberName.toLowerCase()).toContain("phillip");
    expect(payload.barbers[0].username).toBe("phillipmcgee");
    expect(payload.barbers[0].locationId).toBe("independent-barber-43b3cda2");
    expect(payload.barbers[0].bookingHref).toContain("barberId=barber-phillip");
    expect(payload.barbers[0].bookingHref).toContain("serviceId=srv-phillip-cut");
    expect(payload.barbers[0].bookingHref).toContain("locationId=independent-barber-43b3cda2");
  });

  it("keeps a freelance Phillip visible without shop assignment or payout setup", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(12, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(19, 0, 0, 0);
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock({
      shops: [],
      barbers: [{
        id: "barber-uuid",
        reference_code: "barber-phillip",
        profile_id: "profile-uuid",
        compensation_model: "commission",
        app_approval_status: "approved",
        shop_approval_status: "pending",
        commission_rate: null,
        booth_rent_amount: null,
        booth_rent_frequency: null,
        bio: "Freelance Tampa barber.",
        booking_slug: "philforsure"
      }],
      barber_profiles: [{
        barber_reference: "barber-phillip",
        username: "philforsure",
        display_name: "Phillip mcgee",
        bio: "Freelance Tampa barber.",
        years_experience: 7,
        shop_reference: "independent-barber-43b3cda2",
        profile_photo_path: null,
        profile_photo_url: null,
        specialties: ["Haircut"],
        badges: [],
        service_area_label: "Phils chair / 2172 University Square More / Tampa, FL",
        next_available_at: null,
        visibility_state: "public"
      }],
      profiles: [{
        id: "profile-uuid",
        full_name: "Phillip mcgee",
        email: "phillip@example.test",
        phone: "8135550101",
        role: "commission_barber",
        primary_onboarding_role: "barber"
      }],
      services: [{
        id: "service-uuid",
        reference_code: "srv-test-cut",
        location_id: "location-uuid",
        category: "Haircut",
        name: "test cut",
        description: "Cut",
        duration_min: 15,
        buffer_min: 0,
        price: 5,
        currency: "usd",
        deposit_amount: 0,
        full_prepay_required: true,
        active: true,
        is_bookable: true,
        display_order: 1,
        created_at: targetDay.toISOString(),
        updated_at: targetDay.toISOString(),
        service_owner_type: "barber",
        barber_reference: "barber-phillip",
        shop_reference: "independent-barber-43b3cda2",
        booking_count: 0,
        popularity_rank: 1
      }],
      marketplace_services: [],
      locations: [{
        id: "location-uuid",
        reference_code: "independent-barber-43b3cda2",
        name: "Phils chair",
        neighborhood: "2172 University Square More",
        city: "Tampa",
        state: "FL",
        phone: "8135550101",
        address: "2172 University Square More",
        latitude: null,
        longitude: null
      }],
      staff_locations: [],
      availability_rules: [{
        barber_id: "barber-uuid",
        location_id: "location-uuid",
        weekday: targetDay.getDay(),
        start_time: formatTime(targetDay),
        end_time: formatTime(targetEnd)
      }],
      blocked_times: [],
      appointments: [],
      reviews: [],
      marketplace_visibility: [{
        barber_reference: "barber-phillip",
        visibility_state: "hidden",
        accepts_instant_bookings: false,
        featured_rank: null
      }],
      barber_portfolios: [],
      barber_status: [{
        barber_reference: "barber-phillip",
        status: "available",
        live_status: "available",
        accepting_bookings: true
      }],
      connected_accounts: []
    }));

    const payload = await searchBarbersAndShopsPayload({ query: "philforsure" });

    expect(payload.barbers).toHaveLength(1);
    expect(payload.barbers[0]).toMatchObject({
      barberId: "barber-phillip",
      username: "philforsure",
      mostBookedService: "test cut",
      locationId: "independent-barber-43b3cda2"
    });
    expect(payload.barbers[0].bookingHref).toContain("barberId=barber-phillip");
    expect(payload.barbers[0].bookingHref).toContain("serviceId=srv-test-cut");
  });

  it("repairs a missing canonical barber profile row before returning Phillip", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(12, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(19, 0, 0, 0);
    const tables: Record<string, Array<Record<string, unknown>>> = {
      shops: [],
      barbers: [{
        id: "barber-uuid",
        reference_code: "barber-phillip",
        profile_id: "profile-uuid",
        compensation_model: "booth_rent",
        app_approval_status: "approved",
        shop_approval_status: "pending",
        commission_rate: null,
        booth_rent_amount: 150,
        booth_rent_frequency: "weekly",
        bio: "Independent Tampa barber.",
        booking_slug: "philforsure"
      }],
      barber_profiles: [],
      profiles: [{
        id: "profile-uuid",
        full_name: "Phillip mcgee",
        email: "phillip@example.test",
        phone: "8135550101",
        role: "booth_rent_barber",
        primary_onboarding_role: "barber"
      }],
      services: [{
        id: "service-uuid",
        reference_code: "srv-phillip-cut",
        location_id: "location-uuid",
        category: "Haircut",
        name: "Independent Cut",
        description: "Cut and finish",
        duration_min: 45,
        buffer_min: 0,
        price: 55,
        currency: "usd",
        deposit_amount: 0,
        full_prepay_required: false,
        active: true,
        is_bookable: true,
        display_order: 1,
        created_at: targetDay.toISOString(),
        updated_at: targetDay.toISOString(),
        service_owner_type: "barber",
        barber_reference: "barber-phillip",
        shop_reference: "independent-barber-43b3cda2",
        booking_count: 0,
        popularity_rank: 1
      }],
      marketplace_services: [],
      locations: [{
        id: "location-uuid",
        reference_code: "independent-barber-43b3cda2",
        name: "Phils chair",
        neighborhood: "2172 University Square More",
        city: "Tampa",
        state: "FL",
        phone: "8135550101",
        address: "2172 University Square More",
        latitude: null,
        longitude: null
      }],
      staff_locations: [],
      availability_rules: [{
        barber_id: "barber-uuid",
        location_id: "location-uuid",
        weekday: targetDay.getDay(),
        start_time: formatTime(targetDay),
        end_time: formatTime(targetEnd)
      }],
      blocked_times: [],
      appointments: [],
      reviews: [],
      marketplace_visibility: [{
        barber_reference: "barber-phillip",
        visibility_state: "public",
        accepts_instant_bookings: true,
        featured_rank: null
      }],
      barber_portfolios: [],
      barber_status: [{
        barber_reference: "barber-phillip",
        status: "active",
        live_status: "live",
        accepting_bookings: true
      }],
      connected_accounts: [{
        subject_type: "barber",
        barber_id: "barber-uuid",
        payout_readiness_status: "ready",
        livemode: false,
        charges_enabled: true,
        payouts_enabled: true,
        requirements_currently_due: [],
        requirements_past_due: [],
        disabled_reason: null
      }],
      user_roles: [],
      verification_profiles: [{
        user_id: "profile-uuid",
        overall_status: "approved",
        public_verified: true,
        can_accept_bookings: true,
        can_receive_payouts: true
      }]
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const payload = await searchBarbersAndShopsPayload({ query: "philforsure" });
    const routePayload = await searchBarbersAndShopsPayload({ query: "/barber/philforsure" });

    expect(tables.barber_profiles[0]).toMatchObject({
      barber_reference: "barber-phillip",
      username: "philforsure"
    });
    expect(payload.barbers.length).toBeGreaterThanOrEqual(1);
    expect(payload.barbers[0].barberName.toLowerCase()).toContain("philforsure");
    expect(payload.barbers[0].username).toBe("philforsure");
    expect(routePayload.barbers.length).toBeGreaterThanOrEqual(1);
    expect(routePayload.barbers[0].username).toBe("philforsure");
  });

  it("promotes real onboarding services before client discovery checks the service gate", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(12, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(19, 0, 0, 0);
    const tables: Record<string, Array<Record<string, unknown>>> = {
      shops: [],
      barbers: [{
        id: "barber-uuid",
        reference_code: "barber-phillip",
        profile_id: "profile-uuid",
        compensation_model: "booth_rent",
        app_approval_status: "approved",
        shop_approval_status: "pending",
        commission_rate: null,
        booth_rent_amount: 150,
        booth_rent_frequency: "weekly",
        bio: "Independent Tampa barber.",
        booking_slug: "philforsure"
      }],
      barber_profiles: [{
        barber_reference: "barber-phillip",
        username: "philforsure",
        display_name: "Phillip mcgee",
        bio: "Independent Tampa barber.",
        years_experience: 7,
        shop_reference: "independent-barber-43b3cda2",
        profile_photo_path: null,
        profile_photo_url: null,
        specialties: ["Haircut"],
        badges: [],
        service_area_label: "Phils chair / 2172 University Square More / Tampa",
        next_available_at: null,
        visibility_state: "public"
      }],
      profiles: [{
        id: "profile-uuid",
        full_name: "Phillip mcgee",
        email: "phillip@example.test",
        phone: "8135550101",
        role: "booth_rent_barber",
        primary_onboarding_role: "barber"
      }],
      services: [],
      marketplace_services: [],
      user_onboarding_states: [{
        user_id: "profile-uuid",
        role: "barber",
        profile_data: {
          primaryServices: "Haircut + Beard",
          startingPrice: "65",
          averageDuration: "60 min"
        }
      }],
      locations: [{
        id: "location-uuid",
        reference_code: "independent-barber-43b3cda2",
        name: "Phils chair",
        neighborhood: "2172 University Square More",
        city: "Tampa",
        state: "FL",
        phone: "8135550101",
        address: "2172 University Square More",
        latitude: null,
        longitude: null
      }],
      staff_locations: [],
      availability_rules: [{
        barber_id: "barber-uuid",
        location_id: "location-uuid",
        weekday: targetDay.getDay(),
        start_time: formatTime(targetDay),
        end_time: formatTime(targetEnd)
      }],
      blocked_times: [],
      appointments: [],
      reviews: [],
      marketplace_visibility: [{
        barber_reference: "barber-phillip",
        visibility_state: "public",
        accepts_instant_bookings: true,
        featured_rank: null
      }],
      barber_portfolios: [],
      barber_status: [{
        barber_reference: "barber-phillip",
        status: "active",
        live_status: "live",
        accepting_bookings: true
      }],
      connected_accounts: [{
        subject_type: "barber",
        barber_id: "barber-uuid",
        payout_readiness_status: "ready",
        livemode: false,
        charges_enabled: true,
        payouts_enabled: true,
        requirements_currently_due: [],
        requirements_past_due: [],
        disabled_reason: null
      }],
      user_roles: [],
      platform_events: [],
      barber_profile_redirects: [],
      barber_working_hours: [],
      clients: [],
      client_preferences: [],
      barber_shop_memberships: [],
      shop_media_assets: []
    };
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseMock(tables));

    const payload = await searchBarbersAndShopsPayload({ query: "philforsure" });

    expect(tables.services).toHaveLength(1);
    expect(tables.marketplace_services).toHaveLength(1);
    expect(payload.barbers.length).toBeGreaterThanOrEqual(1);
    expect(payload.barbers[0].barberName.toLowerCase()).toContain("philforsure");
    expect(payload.barbers[0].mostBookedService).toBe("Haircut + Beard");
    expect(payload.barbers[0].bookingHref).toContain("serviceId=");
  });
});
