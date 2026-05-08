import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn()
}));

import { publishBarberMarketplaceReadiness } from "@/lib/marketplace/publishing";
import { revalidatePath } from "next/cache";

type Row = Record<string, unknown>;

function createSupabaseMock(initialTables: Record<string, Row[]>) {
  const tables = new Map(Object.entries(initialTables).map(([table, rows]) => [table, [...rows]]));

  function rowsFor(table: string) {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  }

  function createQuery(table: string, filters: Array<(row: Row) => boolean> = [], rowLimit?: number) {
    const resolveRows = () => {
      const rows = rowsFor(table).filter((row) => filters.every((filter) => filter(row)));
      return typeof rowLimit === "number" ? rows.slice(0, rowLimit) : rows;
    };

    return {
      select() {
        return createQuery(table, filters, rowLimit);
      },
      eq(field: string, value: unknown) {
        return createQuery(table, [...filters, (row) => row[field] === value], rowLimit);
      },
      limit(limit: number) {
        return createQuery(table, filters, limit);
      },
      order() {
        return createQuery(table, filters, rowLimit);
      },
      maybeSingle() {
        return Promise.resolve({ data: resolveRows()[0] ?? null, error: null });
      },
      then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        return Promise.resolve({ data: resolveRows(), error: null }).then(onfulfilled, onrejected);
      }
    };
  }

  return {
    tables,
    from(table: string) {
      return {
        select() {
          return createQuery(table);
        },
        upsert(row: Row) {
          const rows = rowsFor(table);
          const key = table === "marketplace_visibility" ? "barber_reference" : "id";
          const existingIndex = rows.findIndex((entry) => entry[key] === row[key]);
          if (existingIndex >= 0) {
            rows[existingIndex] = { ...rows[existingIndex], ...row };
          } else {
            rows.push(row);
          }
          return Promise.resolve({ data: null, error: null });
        }
      };
    }
  };
}

function createReadyTables(overrides: Record<string, Row[]> = {}) {
  return {
    barbers: [{
      id: "barber-uuid",
      reference_code: "barber-live",
      profile_id: "profile-uuid",
      compensation_model: "booth_rent",
      app_approval_status: "approved",
      shop_approval_status: "not_required",
      commission_rate: null,
      booth_rent_amount: null,
      booth_rent_frequency: null,
      bio: "Precision cuts.",
      booking_slug: "barber-live"
    }],
    barber_profiles: [{
      barber_reference: "barber-live",
      username: "phillip",
      display_name: "Phillip McGee",
      bio: "Precision cuts.",
      years_experience: 5,
      shop_reference: "loc-live",
      profile_photo_path: null,
      profile_photo_url: null,
      specialties: ["Haircut"],
      badges: [],
      service_area_label: "BVRB3R Ybor / Tampa, FL",
      next_available_at: null,
      visibility_state: "public"
    }],
    profiles: [{
      id: "profile-uuid",
      role: "booth_rent_barber",
      full_name: "Phillip McGee",
      email: "phillip@example.test",
      phone: "8135550101",
      primary_onboarding_role: "barber"
    }],
    barber_status: [{
      barber_reference: "barber-live",
      status: "available",
      live_status: "available",
      accepting_bookings: true
    }],
    marketplace_visibility: [],
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
    staff_locations: [{
      profile_id: "profile-uuid",
      location_id: "location-uuid"
    }],
    locations: [{
      id: "location-uuid",
      reference_code: "loc-live",
      name: "BVRB3R Ybor",
      neighborhood: "Ybor",
      city: "Tampa",
      state: "FL",
      phone: "8135550101",
      address: "1 Barber Way",
      latitude: null,
      longitude: null
    }],
    availability_rules: [{
      id: "availability-1",
      barber_id: "barber-uuid",
      location_id: "location-uuid",
      weekday: new Date().getDay(),
      start_time: "12:00",
      end_time: "19:00"
    }],
    blocked_times: [],
    appointments: [],
    reviews: [],
    barber_portfolios: [],
    marketplace_services: [],
    services: [{
      id: "service-uuid",
      reference_code: "srv-live-cut",
      location_id: "location-uuid",
      category: "Haircut",
      description: "A precise cut.",
      buffer_min: 0,
      currency: "usd",
      deposit_amount: 0,
      full_prepay_required: false,
      display_order: 0,
      created_at: null,
      updated_at: null,
      service_owner_type: "barber",
      barber_reference: "barber-live",
      shop_reference: null,
      active: true,
      is_bookable: true,
      price: 55,
      duration_min: 45,
      name: "Precision Cut",
      booking_count: null,
      popularity_rank: null
    }],
    ...overrides
  };
}

describe("marketplace publishing", () => {
  it("publishes a fully activated barber into marketplace visibility", async () => {
    const supabase = createSupabaseMock(createReadyTables());

    const result = await publishBarberMarketplaceReadiness(supabase as never, "barber-live");

    expect(result.published).toBe(true);
    expect(supabase.tables.get("marketplace_visibility")).toContainEqual(expect.objectContaining({
      barber_reference: "barber-live",
      visibility_state: "public",
      accepts_instant_bookings: true
    }));
  });

  it("uses canonical eligibility instead of a stale hidden marketplace visibility row", async () => {
    const supabase = createSupabaseMock(createReadyTables({
      marketplace_visibility: [{
        barber_reference: "barber-live",
        visibility_state: "hidden",
        accepts_instant_bookings: false
      }]
    }));

    const result = await publishBarberMarketplaceReadiness(supabase as never, "barber-live");

    expect(result.published).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(supabase.tables.get("marketplace_visibility")).toContainEqual(expect.objectContaining({
      barber_reference: "barber-live",
      visibility_state: "public",
      accepts_instant_bookings: true
    }));
  });

  it("does not publish when the final payout readiness blocker is missing", async () => {
    const supabase = createSupabaseMock(createReadyTables({
      connected_accounts: [{
        subject_type: "barber",
        barber_id: "barber-uuid",
        payout_readiness_status: "not_ready",
        charges_enabled: true,
        payouts_enabled: true,
        requirements_currently_due: ["individual.verification.document"],
        requirements_past_due: [],
        disabled_reason: null
      }]
    }));

    const result = await publishBarberMarketplaceReadiness(supabase as never, "barber-live");

    expect(result.published).toBe(false);
    expect(result.blockers).toContain("Payout setup incomplete");
    expect(supabase.tables.get("marketplace_visibility")).toContainEqual(expect.objectContaining({
      barber_reference: "barber-live",
      accepts_instant_bookings: false
    }));
  });

  it("revalidates a fallback public barber route when username is missing", async () => {
    const supabase = createSupabaseMock(createReadyTables({
      barber_profiles: [{
        barber_reference: "barber-live",
        username: null,
        visibility_state: "public"
      }]
    }));

    await publishBarberMarketplaceReadiness(supabase as never, "barber-live");

    expect(revalidatePath).toHaveBeenCalledWith("/barber/barber-live");
  });
});
