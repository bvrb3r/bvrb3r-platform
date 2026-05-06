import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn()
}));

import { publishBarberMarketplaceReadiness } from "@/lib/marketplace/publishing";

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
      profile_id: "profile-uuid"
    }],
    barber_profiles: [{
      barber_reference: "barber-live",
      username: "phillip",
      visibility_state: "public"
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
    availability_rules: [{
      id: "availability-1",
      barber_id: "barber-uuid",
      location_id: "location-uuid"
    }],
    services: [{
      id: "service-uuid",
      location_id: "location-uuid",
      service_owner_type: "barber",
      barber_reference: "barber-live",
      shop_reference: null,
      active: true,
      is_bookable: true,
      price: 55,
      duration_min: 45,
      name: "Precision Cut"
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
});
