import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/marketplace/visibility", async () => {
  const actual = await vi.importActual<typeof import("@/lib/marketplace/visibility")>("@/lib/marketplace/visibility");
  return {
    ...actual,
    isMarketplaceBarberTrustApproved: () => true,
    isMarketplaceShopTrustApproved: () => true
  };
});

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

function formatTime(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}:00`;
}

describe("canonical availability intelligence", () => {
  it("uses only active bookable canonical services and real slot constraints", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(9, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(13, 0, 0, 0);
    const bookedStart = new Date(targetDay);
    const bookedEnd = new Date(targetDay);
    bookedEnd.setHours(10, 0, 0, 0);
    const blockedStart = new Date(targetDay);
    blockedStart.setHours(10, 0, 0, 0);
    const blockedEnd = new Date(targetDay);
    blockedEnd.setHours(11, 0, 0, 0);
    const expectedFirstSlot = new Date(targetDay);
    expectedFirstSlot.setHours(11, 0, 0, 0);

    const supabase = createSupabaseMock({
      barbers: [{
        id: "barber-uuid",
        reference_code: "barber-live",
        profile_id: "profile-uuid",
        compensation_model: "commission",
        app_approval_status: "approved",
        shop_approval_status: "approved",
        commission_rate: 0.5,
        booth_rent_amount: null,
        booth_rent_frequency: null,
        bio: "Sharp fades and clean lineups.",
        booking_slug: "barber-live"
      }],
      barber_profiles: [{
        barber_reference: "barber-live",
        username: "barber-live",
        display_name: "Phillip McGee",
        bio: "Sharp fades and clean lineups.",
        years_experience: 7,
        shop_reference: "loc-live",
        specialties: ["Fade"],
        badges: [],
        service_area_label: "Ybor",
        next_available_at: null,
        visibility_state: "public"
      }],
      profiles: [{
        id: "profile-uuid",
        full_name: "Phillip McGee",
        email: "phillipmcgee813@gmail.com",
        phone: "8135550101",
        primary_onboarding_role: "barber"
      }],
      services: [
        {
          id: "service-uuid",
          reference_code: "srv-cut",
          location_id: "location-uuid",
          category: "Haircut",
          name: "Precision Cut",
          description: "Full cut and finish",
          duration_min: 45,
          buffer_min: 15,
          price: 55,
          currency: "usd",
          deposit_amount: 15,
          full_prepay_required: false,
          active: true,
          is_bookable: true,
          display_order: 2,
          created_at: targetDay.toISOString(),
          updated_at: targetDay.toISOString(),
          service_owner_type: "barber",
          barber_reference: "barber-live",
          shop_reference: "loc-live",
          booking_count: 3,
          popularity_rank: 2
        },
        {
          id: "service-hidden-uuid",
          reference_code: "srv-hidden",
          location_id: "location-uuid",
          category: "Haircut",
          name: "Hidden Cut",
          description: "Should never list",
          duration_min: 30,
          buffer_min: 0,
          price: 40,
          currency: "usd",
          deposit_amount: 0,
          full_prepay_required: false,
          active: true,
          is_bookable: false,
          display_order: 1,
          created_at: targetDay.toISOString(),
          updated_at: targetDay.toISOString(),
          service_owner_type: "barber",
          barber_reference: "barber-live",
          shop_reference: "loc-live",
          booking_count: 0,
          popularity_rank: 1
        }
      ],
      locations: [{
        id: "location-uuid",
        reference_code: "loc-live",
        name: "BVRB3R Ybor",
        neighborhood: "Ybor",
        city: "Tampa",
        state: "FL",
        phone: "8135550000",
        address: "1 Barber Way",
        latitude: 27.960,
        longitude: -82.440
      }],
      availability_rules: [{
        barber_id: "barber-uuid",
        location_id: "location-uuid",
        weekday: targetDay.getDay(),
        start_time: formatTime(targetDay),
        end_time: formatTime(targetEnd)
      }],
      blocked_times: [{
        barber_id: "barber-uuid",
        starts_at: blockedStart.toISOString(),
        ends_at: blockedEnd.toISOString(),
        reason: "Lunch"
      }],
      appointments: [{
        id: "appointment-uuid",
        reference_code: "appt-existing",
        barber_id: "barber-uuid",
        client_id: "client-uuid",
        service_id: "service-uuid",
        location_id: "location-uuid",
        status: "confirmed",
        starts_at: bookedStart.toISOString(),
        ends_at: bookedEnd.toISOString(),
        total_amount: 55
      }],
      reviews: [],
      marketplace_visibility: [{
        barber_reference: "barber-live",
        visibility_state: "public",
        accepts_instant_bookings: true,
        featured_rank: 1
      }]
    });

    const payload = await buildCanonicalAvailabilityPayload(supabase as never, "barber-live", {
      serviceId: "srv-hidden",
      locationId: "loc-live",
      days: 3,
      earliestAt: targetDay.toISOString()
    });

    expect(payload).not.toBeNull();
    expect(payload?.service?.id).toBe("srv-cut");
    expect(payload?.slots.length).toBeGreaterThan(0);
    expect(payload?.slots[0]?.startsAt).toBe(expectedFirstSlot.toISOString());
    expect(payload?.slots.every((slot) => slot.locationId === "loc-live")).toBe(true);
    expect(payload?.slots.some((slot) => slot.startsAt === bookedStart.toISOString())).toBe(false);
    expect(payload?.slots.some((slot) => slot.startsAt === blockedStart.toISOString())).toBe(false);
    expect(payload?.gating).toBeNull();
  });
});
