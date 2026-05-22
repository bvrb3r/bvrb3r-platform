import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  readCanonicalClientProfileMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  readCanonicalClientProfileMock: vi.fn()
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

vi.mock("@/lib/booking/canonical-booking", () => ({
  canonicalAppointmentUuid: (value: string) => value,
  canonicalBarberUuid: (value: string) => value,
  canonicalClientUuid: (value: string) => value,
  canonicalLocationUuid: (value: string) => value,
  readCanonicalAppointmentServiceSnapshots: vi.fn(),
  readCanonicalClientProfile: readCanonicalClientProfileMock
}));

import { ensureClientProfileForUser, saveClientLocation } from "@/lib/booking/platform-service";

const missingPreferredCityColumn = {
  code: "42703",
  message: "column client_preferences.preferred_city does not exist"
};

function createClientPreferenceSupabaseMock() {
  let savedPreference: Record<string, unknown> | null = null;
  const writes: Array<Record<string, unknown>> = [];

  return {
    writes,
    supabase: {
      from(table: string) {
        if (table !== "client_preferences") {
          return {
            select() {
              return {
                eq() {
                  return this;
                },
                order() {
                  return this;
                },
                limit() {
                  return Promise.resolve({ data: [], error: null });
                }
              };
            }
          };
        }

        return {
          select(columns: string) {
            const query = {
              eq() {
                return query;
              },
              order() {
                return query;
              },
              limit() {
                if (columns.includes("preferred_city")) {
                  return Promise.resolve({ data: null, error: missingPreferredCityColumn });
                }

                if (columns === "client_reference") {
                  return Promise.resolve({
                    data: savedPreference ? [{ client_reference: savedPreference.client_reference }] : [],
                    error: null
                  });
                }

                return Promise.resolve({
                  data: savedPreference ? [savedPreference] : [],
                  error: null
                });
              }
            };

            return query;
          },
          insert(payload: Record<string, unknown>) {
            writes.push(payload);
            if ("preferred_city" in payload) {
              return Promise.resolve({ data: null, error: missingPreferredCityColumn });
            }

            savedPreference = payload;
            return Promise.resolve({ data: null, error: null });
          },
          update(payload: Record<string, unknown>) {
            const query = {
              eq() {
                writes.push(payload);
                savedPreference = {
                  ...(savedPreference ?? {}),
                  ...payload
                };
                return Promise.resolve({ data: null, error: null });
              }
            };

            return query;
          }
        };
      }
    }
  };
}

function createClientProfileRepairSupabaseMock(seed?: {
  profiles?: Array<Record<string, unknown>>;
  clients?: Array<Record<string, unknown>>;
  clientPreferences?: Array<Record<string, unknown>>;
}) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    profiles: [...(seed?.profiles ?? [])],
    clients: [...(seed?.clients ?? [])],
    client_preferences: [...(seed?.clientPreferences ?? [])],
    client_profiles: []
  };
  const writes: Array<{ table: string; type: string; payload: Record<string, unknown> }> = [];

  function rowsFor(table: string, filters: Array<{ column: string; value: unknown }>) {
    return (tables[table] ?? []).filter((row) =>
      filters.every((filter) => row[filter.column] === filter.value)
    );
  }

  return {
    tables,
    writes,
    supabase: {
      from(table: string) {
        return {
          select() {
            const filters: Array<{ column: string; value: unknown }> = [];
            const query = {
              eq(column: string, value: unknown) {
                filters.push({ column, value });
                return query;
              },
              order() {
                return query;
              },
              limit(count: number) {
                return Promise.resolve({ data: rowsFor(table, filters).slice(0, count), error: null });
              },
              maybeSingle() {
                return Promise.resolve({ data: rowsFor(table, filters)[0] ?? null, error: null });
              }
            };
            return query;
          },
          upsert(payload: Record<string, unknown>, options?: { onConflict?: string }) {
            writes.push({ table, type: "upsert", payload });
            const conflictColumn = options?.onConflict ?? "id";
            const existingIndex = (tables[table] ?? []).findIndex((row) => row[conflictColumn] === payload[conflictColumn]);
            if (existingIndex >= 0) {
              tables[table][existingIndex] = {
                ...tables[table][existingIndex],
                ...payload
              };
            } else {
              tables[table] = [...(tables[table] ?? []), payload];
            }
            return Promise.resolve({ data: null, error: null });
          },
          insert(payload: Record<string, unknown>) {
            writes.push({ table, type: "insert", payload });
            tables[table] = [...(tables[table] ?? []), payload];
            return Promise.resolve({ data: null, error: null });
          },
          update(payload: Record<string, unknown>) {
            const filters: Array<{ column: string; value: unknown }> = [];
            const query = {
              eq(column: string, value: unknown) {
                filters.push({ column, value });
                tables[table] = (tables[table] ?? []).map((row) =>
                  filters.every((filter) => row[filter.column] === filter.value)
                    ? { ...row, ...payload }
                    : row
                );
                writes.push({ table, type: "update", payload });
                return Promise.resolve({ data: null, error: null });
              }
            };
            return query;
          }
        };
      }
    }
  };
}

describe("client location canonical persistence", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    readCanonicalClientProfileMock.mockReset();
    readCanonicalClientProfileMock.mockResolvedValue({
      clientReference: "client-jordan",
      fullName: "Jordan Ellis",
      phone: "8135550190",
      email: "jordan@bvrb3r.app",
      favoriteBarberReference: undefined,
      favoriteShopReference: undefined,
      loyaltyPoints: 0,
      retentionTag: "new",
      notes: []
    });
  });

  it("falls back to preferred_location_reference when location columns are not deployed yet", async () => {
    const clientPreferences = createClientPreferenceSupabaseMock();
    createSupabaseAdminClientMock.mockReturnValue(clientPreferences.supabase);

    const result = await saveClientLocation({
      clientId: "client-jordan",
      city: "Tampa",
      state: "FL"
    });

    expect(clientPreferences.writes).toHaveLength(2);
    expect(clientPreferences.writes[0]).toMatchObject({
      preferred_city: "Tampa",
      preferred_state: "FL"
    });
    expect(clientPreferences.writes[1]).toMatchObject({
      preferred_location_reference: "client-location:Tampa:FL:",
      favorite_shop_reference: null
    });
    expect(result.client?.preferredLocation).toEqual({
      city: "Tampa",
      state: "FL",
      display: "Tampa, FL"
    });
  });

  it("creates the missing canonical client rows before location can be saved", async () => {
    const repairSupabase = createClientProfileRepairSupabaseMock();
    createSupabaseAdminClientMock.mockReturnValue(repairSupabase.supabase);

    const repair = await ensureClientProfileForUser({
      userId: "profile-client",
      clientId: undefined,
      email: "jordan@bvrb3r.app",
      fullName: "Jordan Ellis",
      phone: "8135550190",
      role: "client"
    });

    expect(repair).toMatchObject({
      authUserExists: true,
      clientProfileRowExists: true,
      clientPreferencesRowExists: true,
      repaired: true,
      clientId: "client-profile-"
    });
    expect(repairSupabase.tables.profiles).toHaveLength(1);
    expect(repairSupabase.tables.clients).toHaveLength(1);
    expect(repairSupabase.tables.client_preferences).toHaveLength(1);
    expect(repairSupabase.tables.clients[0]).toMatchObject({
      profile_id: "profile-client",
      reference_code: "client-profile-"
    });

    const result = await saveClientLocation({
      clientId: repair.clientId,
      city: "Tampa",
      state: "FL"
    });

    expect(result.location).toEqual({
      city: "Tampa",
      state: "FL",
      display: "Tampa, FL"
    });
    expect(repairSupabase.tables.client_preferences[0]).toMatchObject({
      client_reference: "client-profile-",
      preferred_city: "Tampa",
      preferred_state: "FL"
    });
  });

  it("repairs missing client rows for canonical client_user accounts", async () => {
    const repairSupabase = createClientProfileRepairSupabaseMock();
    createSupabaseAdminClientMock.mockReturnValue(repairSupabase.supabase);

    const repair = await ensureClientProfileForUser({
      userId: "profile-client",
      clientId: undefined,
      email: "jordan@bvrb3r.app",
      fullName: "Jordan Ellis",
      phone: "8135550190",
      role: "client_user"
    });

    expect(repair.clientProfileRowExists).toBe(true);
    expect(repair.repaired).toBe(true);
    expect(repairSupabase.tables.profiles[0]).toMatchObject({
      id: "profile-client",
      role: "client_user"
    });
    expect(repairSupabase.tables.clients[0]).toMatchObject({
      profile_id: "profile-client"
    });
  });

  it("does not duplicate an existing client profile row", async () => {
    const repairSupabase = createClientProfileRepairSupabaseMock({
      profiles: [{
        id: "profile-client",
        role: "client",
        full_name: "Jordan Ellis",
        email: "jordan@bvrb3r.app",
        phone: "8135550190"
      }],
      clients: [{
        id: "existing-client-row",
        profile_id: "profile-client",
        reference_code: "client-profile",
        loyalty_points: 10,
        retention_tag: "repeat",
        created_at: "2026-05-01T12:00:00.000Z"
      }],
      clientPreferences: [{
        client_reference: "client-profile",
        client_email: "jordan@bvrb3r.app",
        favorite_shop_reference: null,
        preferred_location_reference: null,
        prefers_instant_booking: false
      }]
    });
    createSupabaseAdminClientMock.mockReturnValue(repairSupabase.supabase);

    const repair = await ensureClientProfileForUser({
      userId: "profile-client",
      clientId: "client-profile",
      email: "jordan@bvrb3r.app",
      fullName: "Jordan Ellis",
      phone: "8135550190",
      role: "client"
    });

    expect(repair.repairStatus).toBe("already_ready");
    expect(repairSupabase.tables.clients).toHaveLength(1);
    expect(repairSupabase.writes.filter((write) => write.table === "clients" && write.type === "insert")).toHaveLength(0);
  });

  it("blocks non-client users from creating client profile rows", async () => {
    const repairSupabase = createClientProfileRepairSupabaseMock();
    createSupabaseAdminClientMock.mockReturnValue(repairSupabase.supabase);

    await expect(ensureClientProfileForUser({
      userId: "profile-barber",
      clientId: undefined,
      email: "barber@bvrb3r.app",
      fullName: "Barber User",
      phone: null,
      role: "barber"
    })).rejects.toThrow("Only client accounts can repair client profile rows.");

    expect(repairSupabase.tables.clients).toHaveLength(0);
  });
});
