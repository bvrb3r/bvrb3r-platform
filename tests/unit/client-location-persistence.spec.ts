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

import { saveClientLocation } from "@/lib/booking/platform-service";

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
      state: "FL"
    });
  });
});
