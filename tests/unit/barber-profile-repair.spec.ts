import { describe, expect, it } from "vitest";
import {
  BarberProfileRepairError,
  ensureBarberProfileForIdentifier,
  ensureBarberProfileForUser,
  ensureMarketplaceBarberProfileRows
} from "@/lib/barber/profile-repair";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function createMutableSupabaseMock(tables: Tables, options: {
  unsupportedPayloadFields?: Record<string, string[]>;
  operationErrors?: Record<string, { code: string; message: string; details?: string; hint?: string }>;
} = {}) {
  function ensureTable(table: string) {
    tables[table] ??= [];
    return tables[table];
  }

  function createBuilder(table: string, operation: "select" | "insert" | "update" | "upsert", payload?: Row | Row[], conflictField?: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let limitCount: number | null = null;
    const builder = {
      select() {
        return builder;
      },
      eq(field: string, value: unknown) {
        filters.push((row) => row[field] === value);
        return builder;
      },
      order() {
        return builder;
      },
      limit(count: number) {
        limitCount = count;
        return builder;
      },
      async maybeSingle() {
        const result = await commit();
        return { data: result.data[0] ?? null, error: null };
      },
      async single() {
        const result = await commit();
        return { data: result.data[0] ?? null, error: null };
      },
      then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: Row[]; error: { code: string; message: string; details?: string; hint?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        return commit().then(onfulfilled, onrejected);
      }
    };

    async function commit() {
      const rows = ensureTable(table);
      const operationError = options.operationErrors?.[`${table}:${operation}`];
      if (operationError) {
        return { data: [], error: operationError };
      }

      const unsupportedFields = new Set(options.unsupportedPayloadFields?.[table] ?? []);
      const entriesForFieldCheck = (Array.isArray(payload) ? payload : [payload]).filter((entry): entry is Row => Boolean(entry));
      const unsupportedField = entriesForFieldCheck
        .flatMap((entry) => Object.keys(entry))
        .find((field) => unsupportedFields.has(field));
      if (unsupportedField) {
        return {
          data: [],
          error: {
            code: "PGRST204",
            message: `Could not find the '${unsupportedField}' column of '${table}' in the schema cache`
          }
        };
      }

      if (operation === "insert") {
        const inserted = (Array.isArray(payload) ? payload : [payload]).filter((entry): entry is Row => Boolean(entry));
        rows.push(...inserted);
        return { data: inserted, error: null };
      }

      if (operation === "update") {
        const updated: Row[] = [];
        for (const row of rows) {
          if (filters.every((filter) => filter(row))) {
            Object.assign(row, payload);
            updated.push(row);
          }
        }
        return { data: updated, error: null };
      }

      if (operation === "upsert") {
        const entries = (Array.isArray(payload) ? payload : [payload]).filter((entry): entry is Row => Boolean(entry));
        const upserted: Row[] = [];
        for (const entry of entries) {
          const field = conflictField ?? "id";
          const existing = rows.find((row) => row[field] === entry[field]);
          if (existing) {
            Object.assign(existing, entry);
            upserted.push(existing);
          } else {
            rows.push(entry);
            upserted.push(entry);
          }
        }
        return { data: upserted, error: null };
      }

      let selected = rows.filter((row) => filters.every((filter) => filter(row)));
      if (typeof limitCount === "number") {
        selected = selected.slice(0, limitCount);
      }
      return { data: selected, error: null };
    }

    return builder;
  }

  return {
    from(table: string) {
      return {
        select() {
          return createBuilder(table, "select");
        },
        insert(payload: Row | Row[]) {
          return createBuilder(table, "insert", payload);
        },
        update(payload: Row) {
          return createBuilder(table, "update", payload);
        },
        upsert(payload: Row | Row[], options?: { onConflict?: string }) {
          return createBuilder(table, "upsert", payload, options?.onConflict);
        }
      };
    }
  };
}

function createBaseTables(overrides: Partial<Tables> = {}): Tables {
  return {
    profiles: [{
      id: "profile-phillip",
      role: "booth_rent_barber",
      primary_onboarding_role: "barber",
      full_name: "Phillip mcgee",
      email: "phillip@example.test",
      phone: "8135550101"
    }],
    barbers: [{
      id: "barber-uuid",
      reference_code: "barber-phillip",
      profile_id: "profile-phillip",
      compensation_model: "booth_rent",
      barber_subtype: "freelance",
      app_approval_status: "approved",
      shop_approval_status: "not_required",
      bio: "Independent Tampa barber.",
      booking_slug: "philforsure"
    }],
    barber_profiles: [],
    barber_status: [],
    marketplace_visibility: [],
    user_roles: [],
    verification_profiles: [{
      user_id: "profile-phillip",
      overall_status: "approved",
      public_verified: true,
      can_accept_bookings: true,
      can_receive_payouts: true
    }],
    ...overrides
  };
}

describe("canonical barber profile repair", () => {
  it("creates the missing public barber profile row for an approved barber user", async () => {
    const tables = createBaseTables();
    const supabase = createMutableSupabaseMock(tables);

    const result = await ensureBarberProfileForUser({
      userId: "profile-phillip",
      barberId: "barber-phillip",
      role: "booth_rent_barber",
      email: "phillip@example.test",
      fullName: "Phillip mcgee",
      preferredUsername: "philforsure"
    }, supabase as never);

    expect(result.repaired).toBe(true);
    expect(result.success).toBe(true);
    expect(result.createdProfile).toBe(true);
    expect(result.barberReference).toBe("barber-phillip");
    expect(result.barberProfile).toMatchObject({ barber_reference: "barber-phillip" });
    expect(result.readChecks).toMatchObject({
      byReference: true,
      byBarberId: false,
      byProfileUser: false
    });
    expect(tables.barber_profiles).toHaveLength(1);
    expect(tables.barber_profiles[0]).toMatchObject({
      barber_reference: "barber-phillip",
      username: "philforsure",
      display_name: "Phillip mcgee",
      visibility_state: "public"
    });
    expect(tables.barber_status[0]).toMatchObject({
      barber_reference: "barber-phillip"
    });
  });

  it("links a legacy barber_profiles row keyed by UUID instead of duplicating it", async () => {
    const tables = createBaseTables({
      barber_profiles: [{
        barber_reference: "barber-uuid",
        username: "philforsure",
        display_name: "Phillip mcgee",
        bio: "Existing profile.",
        visibility_state: "public"
      }]
    });
    const supabase = createMutableSupabaseMock(tables);

    const result = await ensureBarberProfileForUser({
      userId: "profile-phillip",
      barberId: "barber-phillip",
      role: "booth_rent_barber"
    }, supabase as never);

    expect(result.linkedLegacyProfile).toBe(true);
    expect(result.success).toBe(true);
    expect(tables.barber_profiles).toHaveLength(1);
    expect(tables.barber_profiles[0]).toMatchObject({
      barber_reference: "barber-phillip",
      username: "philforsure",
      bio: "Existing profile."
    });
  });

  it("normalizes a legacy barber_profiles row found by barber_id before final read", async () => {
    const tables = createBaseTables({
      barber_profiles: [{
        barber_reference: "legacy-profile-key",
        barber_id: "barber-uuid",
        profile_id: "profile-phillip",
        username: "philforsure",
        display_name: "Phillip mcgee",
        bio: "Legacy keyed profile.",
        visibility_state: "public"
      }]
    });
    const supabase = createMutableSupabaseMock(tables);

    const result = await ensureBarberProfileForUser({
      userId: "profile-phillip",
      barberId: "barber-phillip",
      role: "booth_rent_barber"
    }, supabase as never);

    expect(result.success).toBe(true);
    expect(result.barberProfile).toMatchObject({
      barber_reference: "barber-phillip",
      barber_id: "barber-uuid",
      profile_id: "profile-phillip"
    });
    expect(result.readChecks).toMatchObject({
      byReference: true,
      byBarberId: true,
      byProfileUser: true
    });
    expect(tables.barber_profiles).toHaveLength(1);
    expect(tables.barber_profiles[0]).toMatchObject({
      barber_reference: "barber-phillip"
    });
  });

  it("writes only the migration-backed barber_profiles columns during repair", async () => {
    const tables = createBaseTables();
    const supabase = createMutableSupabaseMock(tables, {
      unsupportedPayloadFields: {
        barber_profiles: ["barber_id", "profile_id", "user_id"]
      }
    });

    const result = await ensureBarberProfileForUser({
      userId: "profile-phillip",
      barberId: "barber-phillip",
      role: "booth_rent_barber",
      email: "phillip@example.test",
      fullName: "Phillip mcgee",
      preferredUsername: "philforsure"
    }, supabase as never);

    expect(result.success).toBe(true);
    expect(tables.barber_profiles[0]).not.toHaveProperty("barber_id");
    expect(tables.barber_profiles[0]).not.toHaveProperty("profile_id");
    expect(tables.barber_profiles[0]).not.toHaveProperty("user_id");
    expect(tables.barber_profiles[0]).toMatchObject({
      barber_reference: "barber-phillip",
      username: "philforsure",
      display_name: "Phillip mcgee"
    });
  });

  it("surfaces exact Supabase write reason when the barber_profiles insert fails", async () => {
    const tables = createBaseTables();
    const supabase = createMutableSupabaseMock(tables, {
      operationErrors: {
        "barber_profiles:insert": {
          code: "23502",
          message: "null value in column \"display_name\" violates not-null constraint",
          details: "Failing row contains a null display_name."
        }
      }
    });

    await expect(ensureBarberProfileForUser({
      userId: "profile-phillip",
      barberId: "barber-phillip",
      role: "booth_rent_barber",
      email: "phillip@example.test",
      fullName: "Phillip mcgee",
      preferredUsername: "philforsure"
    }, supabase as never)).rejects.toMatchObject({
      reason: "not_null_violation",
      details: expect.objectContaining({
        table: "barber_profiles",
        operation: "insert",
        code: "23502"
      })
    } satisfies Partial<BarberProfileRepairError>);
  });

  it("repairs by public handle/booking slug so /barber/philforsure can resolve", async () => {
    const tables = createBaseTables();
    const supabase = createMutableSupabaseMock(tables);

    const result = await ensureBarberProfileForIdentifier("philforsure", supabase as never);

    expect(result?.barberReference).toBe("barber-phillip");
    expect(tables.barber_profiles[0]?.username).toBe("philforsure");
  });

  it("repairs marketplace barber rows before discovery reads canonical profiles", async () => {
    const tables = createBaseTables();
    const supabase = createMutableSupabaseMock(tables);

    const result = await ensureMarketplaceBarberProfileRows(supabase as never);

    expect(result.repaired).toBe(1);
    expect(tables.barber_profiles[0]).toMatchObject({
      barber_reference: "barber-phillip",
      username: "philforsure"
    });
  });

  it("does not create barber rows for non-barber accounts", async () => {
    const tables = createBaseTables({
      profiles: [{
        id: "profile-client",
        role: "client",
        primary_onboarding_role: "client",
        full_name: "Client Person",
        email: "client@example.test"
      }],
      barbers: []
    });
    const supabase = createMutableSupabaseMock(tables);

    await expect(ensureBarberProfileForUser({
      userId: "profile-client",
      role: "client",
      email: "client@example.test"
    }, supabase as never)).rejects.toMatchObject({
      reason: "role_not_barber"
    } satisfies Partial<BarberProfileRepairError>);

    expect(tables.barbers).toHaveLength(0);
  });
});
