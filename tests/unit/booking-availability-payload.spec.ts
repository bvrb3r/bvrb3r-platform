import { describe, expect, it, vi } from "vitest";
import { buildCanonicalAvailabilityPayload } from "@/lib/booking/intelligence";

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
        }
      };
    }
  };
}

function baseTables(overrides: Record<string, Array<Record<string, unknown>>> = {}) {
  return {
    barbers: [{
      id: "barber-uuid",
      reference_code: "barber-live",
      profile_id: "profile-uuid",
      booking_slug: "barber-live",
      barber_subtype: "freelance",
      app_approval_status: "approved",
      shop_approval_status: "approved",
      status: "active",
      is_bookable: true,
      is_discoverable: true
    }],
    barber_profiles: [{
      barber_reference: "barber-live",
      username: "barber-live",
      display_name: "Phillip McGee",
      bio: "Sharp fades.",
      years_experience: 7,
      shop_reference: "loc-live",
      profile_photo_path: null,
      profile_photo_url: "https://example.com/phillip.jpg",
      specialties: ["Fade"],
      badges: [],
      service_area_label: "Tampa",
      next_available_at: null,
      visibility_state: "public"
    }],
    profiles: [{
      id: "profile-uuid",
      role: "barber_user",
      full_name: "Phillip McGee",
      email: "phillip@example.com",
      phone: "8135550101",
      primary_onboarding_role: "barber",
      onboarding_state: "completed"
    }],
    services: [{
      id: "service-uuid",
      reference_code: "srv-cut",
      location_id: "location-uuid",
      category: "Haircut",
      name: "Fresh Cut",
      description: "Clean finish",
      duration_min: 30,
      buffer_min: 0,
      price: 55,
      currency: "usd",
      deposit_amount: 15,
      full_prepay_required: false,
      active: true,
      is_bookable: true,
      display_order: 1,
      created_at: "2026-06-01T12:00:00.000Z",
      updated_at: "2026-06-01T12:00:00.000Z",
      service_owner: "barber",
      service_owner_type: "barber",
      barber_reference: "barber-live",
      shop_reference: "loc-live"
    }],
    marketplace_services: [],
    locations: [{
      id: "location-uuid",
      reference_code: "loc-live",
      name: "BVRB3R Tampa",
      neighborhood: "Tampa",
      city: "Tampa",
      state: "FL",
      phone: "8135550000",
      address: "1 Barber Way",
      latitude: 27.95,
      longitude: -82.45
    }],
    staff_locations: [{
      profile_id: "profile-uuid",
      location_id: "location-uuid"
    }],
    availability_rules: [{
      barber_id: "barber-uuid",
      location_id: "location-uuid",
      weekday: 0,
      start_time: "12:00",
      end_time: "19:00"
    }],
    barber_working_hours: [],
    blocked_times: [],
    appointments: [],
    reviews: [],
    marketplace_visibility: [{
      barber_reference: "barber-live",
      visibility_state: "public",
      accepts_instant_bookings: true,
      featured_rank: 1
    }],
    barber_status: [{
      barber_reference: "barber-live",
      status: "available",
      live_status: "available",
      accepting_bookings: true
    }],
    connected_accounts: [],
    barber_portfolios: [],
    ...overrides
  };
}

describe("canonical booking availability payload", () => {
  it("returns client booking slots for the production-shaped Sunday open window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T15:30:00.000Z"));

    try {
      const payload = await buildCanonicalAvailabilityPayload(createSupabaseMock(baseTables()) as never, "barber-live", {
        serviceId: "srv-cut",
        locationId: "loc-live",
        startDate: "2026-06-14",
        days: 1,
        timeZone: "America/New_York"
      });

      expect(payload?.timezone).toBe("America/New_York");
      expect(payload?.slots).toHaveLength(14);
      expect(payload?.slots[0]).toMatchObject({
        startsAt: "2026-06-14T16:00:00.000Z",
        endsAt: "2026-06-14T16:30:00.000Z",
        locationId: "loc-live",
        barberId: "barber-live",
        serviceId: "srv-cut"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns no slots for a selected date without a working window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T15:30:00.000Z"));

    try {
      const payload = await buildCanonicalAvailabilityPayload(createSupabaseMock(baseTables()) as never, "barber-live", {
        serviceId: "srv-cut",
        locationId: "loc-live",
        startDate: "2026-06-17",
        days: 1,
        timeZone: "America/New_York"
      });

      expect(payload?.slots).toEqual([]);
      expect(payload?.service?.id).toBe("srv-cut");
    } finally {
      vi.useRealTimers();
    }
  });
});
