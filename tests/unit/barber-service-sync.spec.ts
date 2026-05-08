import { describe, expect, it } from "vitest";
import { syncOnboardingBarberService } from "@/lib/marketplace/service-sync";

function createQuery<T extends Record<string, unknown>>(rows: T[], filters: Array<(row: T) => boolean> = []) {
  const resolve = () => Promise.resolve({
    data: rows.filter((row) => filters.every((filter) => filter(row))),
    error: null
  });

  return {
    eq(field: string, value: unknown) {
      return createQuery(rows, [...filters, (row) => row[field] === value]);
    },
    async maybeSingle() {
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
  return {
    from(table: string) {
      return {
        select() {
          return createQuery(tables[table] ?? []);
        },
        upsert(payload: Record<string, unknown>, options?: { onConflict?: string }) {
          tables[table] ??= [];
          const conflictField = options?.onConflict ?? "id";
          const existing = tables[table].find((row) => row[conflictField] === payload[conflictField]);
          if (existing) {
            Object.assign(existing, payload);
          } else {
            tables[table].push(payload);
          }
          return Promise.resolve({ data: [payload], error: null });
        }
      };
    }
  };
}

describe("barber service sync", () => {
  it("promotes real onboarding barber service data into marketplace and canonical booking services", async () => {
    const tables: Record<string, Array<Record<string, unknown>>> = {
      barbers: [{
        id: "barber-uuid",
        reference_code: "barber-phillip",
        profile_id: "profile-uuid"
      }],
      staff_locations: [],
      availability_rules: [{
        id: "availability-1",
        barber_id: "barber-uuid",
        location_id: "location-uuid"
      }],
      locations: [{
        id: "location-uuid",
        reference_code: "independent-barber-43b3cda2"
      }],
      marketplace_services: [],
      services: []
    };

    const result = await syncOnboardingBarberService(createSupabaseMock(tables) as never, {
      userId: "profile-uuid",
      profileData: {
        primaryServices: "Haircut + Beard",
        startingPrice: "65",
        averageDuration: "60 min"
      }
    });

    expect(result).toMatchObject({
      synced: true,
      barberReference: "barber-phillip",
      marketplaceSynced: true,
      canonicalServiceSynced: true
    });
    expect(tables.marketplace_services).toHaveLength(1);
    expect(tables.marketplace_services[0]).toMatchObject({
      owner_type: "barber",
      barber_reference: "barber-phillip",
      name: "Haircut + Beard",
      price: 65,
      duration_min: 60
    });
    expect(tables.services).toHaveLength(1);
    expect(tables.services[0]).toMatchObject({
      reference_code: (result as { serviceReference: string }).serviceReference,
      location_id: "location-uuid",
      service_owner_type: "barber",
      barber_reference: "barber-phillip",
      shop_reference: "independent-barber-43b3cda2",
      active: true,
      is_bookable: true
    });
  });

  it("does not create a service when onboarding never captured real price or duration", async () => {
    const tables: Record<string, Array<Record<string, unknown>>> = {
      barbers: [{ id: "barber-uuid", reference_code: "barber-phillip", profile_id: "profile-uuid" }],
      user_onboarding_states: []
    };

    const result = await syncOnboardingBarberService(createSupabaseMock(tables) as never, {
      userId: "profile-uuid",
      profileData: {
        primaryServices: "Haircuts",
        startingPrice: "",
        averageDuration: ""
      }
    });

    expect(result).toEqual({ synced: false, reason: "no_onboarding_service_payload" });
    expect(tables.marketplace_services).toBeUndefined();
    expect(tables.services).toBeUndefined();
  });
});
