import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/marketplace/visibility", async () => {
  const actual = await vi.importActual<typeof import("@/lib/marketplace/visibility")>("@/lib/marketplace/visibility");
  return {
    ...actual,
    isMarketplaceBarberTrustApproved: () => true,
    isMarketplaceShopTrustApproved: () => true
  };
});

import {
  buildCanonicalAvailabilityPayload,
  buildCanonicalBarberProfile,
  buildCanonicalDiscoveryResults,
  getMarketplaceEligibilityForBarber
} from "@/lib/booking/intelligence";

type QueryResult<T> = Promise<{ data: T[]; error: null }>;
type QueryErrorResult = Promise<{ data: null; error: { code: string; message: string } }>;

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
    then<TResult1 = { data: T[]; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return resolve().then(onfulfilled, onrejected);
    }
  };
}

function createErroredQuery(error: { code: string; message: string }) {
  const resolve = (): QueryErrorResult => Promise.resolve({ data: null, error });

  return {
    eq() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    then<TResult1 = { data: null; error: { code: string; message: string } }, TResult2 = never>(
      onfulfilled?: ((value: { data: null; error: { code: string; message: string } }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return resolve().then(onfulfilled, onrejected);
    }
  };
}

function createSupabaseMock(
  tables: Record<string, Array<Record<string, unknown>>>,
  options: { missingColumns?: Record<string, string[]> } = {}
) {
  return {
    from(table: string) {
      return {
        select(columns?: string) {
          const missingColumn = options.missingColumns?.[table]?.find((column) => columns?.split(",").map((entry) => entry.trim()).includes(column));
          if (missingColumn) {
            return createErroredQuery({
              code: "42703",
              message: `column ${missingColumn} does not exist`
            });
          }

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
        profile_photo_path: null,
        profile_photo_url: "https://example.com/phillip.jpg",
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
      barber_portfolios: [{
        id: "portfolio-1",
        barber_reference: "barber-live",
        storage_path: "portfolio/fallback.jpg",
        image_url: "https://example.com/cut.jpg",
        caption: "Low taper",
        style_tag_ids: [],
        featured: true,
        created_at: targetDay.toISOString()
      }],
      marketplace_visibility: [{
        barber_reference: "barber-live",
        visibility_state: "public",
        accepts_instant_bookings: true,
        featured_rank: 1
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

  it("builds client discovery cards with service, location, and time wired into booking hrefs", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(9, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(12, 0, 0, 0);

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
        profile_photo_path: null,
        profile_photo_url: "https://example.com/phillip.jpg",
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
      services: [{
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
        display_order: 1,
        created_at: targetDay.toISOString(),
        updated_at: targetDay.toISOString(),
        service_owner_type: "barber",
        barber_reference: "barber-live",
        shop_reference: "loc-live",
        booking_count: 3,
        popularity_rank: 1
      }],
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
      blocked_times: [],
      appointments: [],
      reviews: [],
      barber_portfolios: [{
        id: "portfolio-1",
        barber_reference: "barber-live",
        storage_path: "portfolio/fallback.jpg",
        image_url: "https://example.com/cut.jpg",
        caption: "Low taper",
        style_tag_ids: [],
        featured: true,
        created_at: targetDay.toISOString()
      }],
      marketplace_visibility: [{
        barber_reference: "barber-live",
        visibility_state: "public",
        accepts_instant_bookings: true,
        featured_rank: 1
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
    });

    const results = await buildCanonicalDiscoveryResults(supabase as never, {
      locationId: "loc-live"
    });

    expect(results).toHaveLength(1);
    expect(results[0].locationId).toBe("loc-live");
    expect(results[0].mostBookedServiceId).toBe("srv-cut");
    expect(results[0].profilePhotoUrl).toBe("https://example.com/phillip.jpg");
    expect(results[0].galleryPreviewUrls).toEqual(["https://example.com/cut.jpg"]);
    expect(results[0].bookingHref).toContain("barberId=barber-live");
    expect(results[0].bookingHref).toContain("locationId=loc-live");
    expect(results[0].bookingHref).toContain("serviceId=srv-cut");
    expect(results[0].bookingHref).toContain("appointmentTime=");
  });

  it("includes marketplace service catalog entries in canonical client discovery", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(12, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(15, 0, 0, 0);

    const supabase = createSupabaseMock({
      barbers: [{
        id: "barber-uuid",
        reference_code: "barber-live",
        profile_id: "profile-uuid",
        compensation_model: "booth_rent",
        app_approval_status: "approved",
        shop_approval_status: "approved",
        commission_rate: null,
        booth_rent_amount: 150,
        booth_rent_frequency: "weekly",
        bio: "Private studio cuts.",
        booking_slug: "barber-live"
      }],
      barber_profiles: [{
        barber_reference: "barber-live",
        username: "barber-live",
        display_name: "Phillip McGee",
        bio: "Private studio cuts.",
        years_experience: 7,
        shop_reference: "loc-live",
        profile_photo_path: null,
        profile_photo_url: null,
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
      services: [],
      marketplace_services: [{
        service_reference: "market-srv-cut",
        category: "Haircut",
        name: "Marketplace Precision Cut",
        description: "Full cut and finish",
        duration_min: 45,
        buffer_min: 15,
        price: 55,
        deposit_amount: 15,
        full_prepay_required: false,
        owner_type: "barber",
        barber_reference: "barber-live",
        shop_reference: null,
        style_tag_ids: [],
        created_at: targetDay.toISOString(),
        updated_at: targetDay.toISOString()
      }],
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
      blocked_times: [],
      appointments: [],
      reviews: [],
      barber_portfolios: [],
      marketplace_visibility: [{
        barber_reference: "barber-live",
        visibility_state: "public",
        accepts_instant_bookings: true,
        featured_rank: null
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
    });

    const results = await buildCanonicalDiscoveryResults(supabase as never, {
      locationId: "loc-live"
    });

    expect(results).toHaveLength(1);
    expect(results[0].mostBookedService).toBe("Marketplace Precision Cut");
    expect(results[0].mostBookedServiceId).toBe("market-srv-cut");
  });

  it("keeps direct client search working when optional marketplace columns are not in the schema cache", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(10, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(14, 0, 0, 0);
    const supabase = createSupabaseMock({
      barbers: [{
        id: "barber-uuid",
        reference_code: "barber-phillip",
        profile_id: "profile-uuid",
        compensation_model: "booth_rent",
        app_approval_status: "approved",
        shop_approval_status: "approved",
        commission_rate: null,
        booth_rent_amount: 150,
        booth_rent_frequency: "weekly",
        bio: "Independent Tampa barber.",
        booking_slug: null
      }],
      barber_profiles: [{
        barber_reference: "barber-phillip",
        username: null,
        display_name: "Phillip McGee",
        bio: "Independent Tampa barber.",
        years_experience: 7,
        shop_reference: "independent-barber-phillip",
        profile_photo_path: null,
        specialties: ["Fade"],
        badges: [],
        service_area_label: "Tampa",
        next_available_at: null,
        visibility_state: "public"
      }],
      profiles: [{
        id: "profile-uuid",
        full_name: "Phillip McGee",
        email: "phillip@example.test",
        phone: "8135550101",
        role: "booth_rent_barber"
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
        shop_reference: "independent-barber-phillip",
        booking_count: 0,
        popularity_rank: 1
      }],
      locations: [{
        id: "location-uuid",
        reference_code: "independent-barber-phillip",
        name: "Phil's Chair",
        neighborhood: "2172 University Square More",
        city: "Tampa",
        state: "FL",
        phone: "8135550101"
      }],
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
      barber_portfolios: [],
      marketplace_visibility: [{
        barber_reference: "barber-phillip",
        visibility_state: "public",
        accepts_instant_bookings: true,
        featured_rank: null
      }],
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
        charges_enabled: true,
        payouts_enabled: true,
        requirements_currently_due: [],
        requirements_past_due: [],
        disabled_reason: null
      }]
    }, {
      missingColumns: {
        barber_profiles: ["profile_photo_url"],
        locations: ["address", "latitude", "longitude"],
        profiles: ["primary_onboarding_role"]
      }
    });

    const results = await buildCanonicalDiscoveryResults(supabase as never, {
      locationId: "",
      query: "phillip"
    });

    expect(results).toHaveLength(1);
    expect(results[0].barberName).toBe("Phillip McGee");
    expect(results[0].locationId).toBe("independent-barber-phillip");
    expect(results[0].username).toBe("barber-phillip");
    expect(results[0].bookingHref).toContain("barber=barber-phillip");
  });

  it("discovers a live independent barber without requiring shop approval", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(12, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(18, 0, 0, 0);
    const tables = {
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
        booking_slug: null
      }],
      barber_profiles: [{
        barber_reference: "barber-phillip",
        username: null,
        display_name: "Phillip McGee",
        bio: "Independent Tampa barber.",
        years_experience: 7,
        shop_reference: "independent-barber-phillip",
        profile_photo_path: null,
        profile_photo_url: null,
        specialties: ["Fade"],
        badges: [],
        service_area_label: "Phil's Chair / 2172 University Square More / Tampa",
        next_available_at: null,
        visibility_state: "public"
      }],
      profiles: [{
        id: "profile-uuid",
        full_name: "Phillip McGee",
        email: "phillip@example.test",
        phone: "8135550101",
        role: "booth_rent_barber",
        primary_onboarding_role: "barber"
      }],
      services: [{
        id: "service-uuid",
        reference_code: "srv-phillip-cut",
        location_id: "independent-barber-phillip",
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
        shop_reference: "independent-barber-phillip",
        booking_count: 0,
        popularity_rank: 1
      }],
      locations: [],
      staff_locations: [],
      availability_rules: [{
        barber_id: "barber-uuid",
        location_id: "independent-barber-phillip",
        weekday: targetDay.getDay(),
        start_time: formatTime(targetDay),
        end_time: formatTime(targetEnd)
      }],
      blocked_times: [],
      appointments: [],
      reviews: [],
      barber_portfolios: [],
      marketplace_visibility: [{
        barber_reference: "barber-phillip",
        visibility_state: "public",
        accepts_instant_bookings: true,
        featured_rank: null
      }],
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
    };
    const supabase = createSupabaseMock(tables);

    const results = await buildCanonicalDiscoveryResults(supabase as never, {
      locationId: "",
      query: "mcgee"
    });
    const diagnostic = await getMarketplaceEligibilityForBarber(supabase as never, "barber-phillip", {
      directSearchQuery: "phillip"
    });

    expect(results).toHaveLength(1);
    expect(results[0].barberName).toBe("Phillip McGee");
    expect(results[0].locationId).toBe("independent-barber-phillip");
    expect(results[0].cityLabel).toBe("Tampa");
    expect(results[0].username).toBe("barber-phillip");
    expect(diagnostic.eligible).toBe(true);
    expect(diagnostic.includedInClientSearch).toBe(true);
    expect(diagnostic.publicProfileRoute).toBe("/barber/barber-phillip");
    expect(diagnostic.blockers).toEqual([]);
    expect(diagnostic.facts.independentLocationExists).toBe(true);
    expect(diagnostic.facts.approvalStatus).toBe("approved");
    expect(diagnostic.facts.payoutMode).toBe("test");
  });

  it("does not hide an eligible barber when no exact next slot can be materialized yet", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(12, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(13, 0, 0, 0);
    const supabase = createSupabaseMock({
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
        booking_slug: null
      }],
      barber_profiles: [{
        barber_reference: "barber-phillip",
        username: null,
        display_name: "Phillip McGee",
        bio: "Independent Tampa barber.",
        years_experience: 7,
        shop_reference: "independent-barber-phillip",
        profile_photo_path: null,
        profile_photo_url: null,
        specialties: ["Fade"],
        badges: [],
        service_area_label: "Phil's Chair / 2172 University Square More / Tampa",
        next_available_at: null,
        visibility_state: "public"
      }],
      profiles: [{
        id: "profile-uuid",
        full_name: "Phillip McGee",
        email: "phillip@example.test",
        phone: "8135550101",
        role: "booth_rent_barber",
        primary_onboarding_role: "barber"
      }],
      services: [{
        id: "service-uuid",
        reference_code: "srv-long-cut",
        location_id: "location-uuid",
        category: "Haircut",
        name: "Long Session Cut",
        description: "A service that needs manual time selection",
        duration_min: 120,
        buffer_min: 0,
        price: 80,
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
        shop_reference: "independent-barber-phillip",
        booking_count: 0,
        popularity_rank: 1
      }],
      locations: [{
        id: "location-uuid",
        reference_code: "independent-barber-phillip",
        name: "Phil's Chair",
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
      barber_portfolios: [],
      marketplace_visibility: [{
        barber_reference: "barber-phillip",
        visibility_state: "public",
        accepts_instant_bookings: true,
        featured_rank: null
      }],
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
    });

    const results = await buildCanonicalDiscoveryResults(supabase as never, {
      locationId: "",
      query: "phillip"
    });

    expect(results).toHaveLength(1);
    expect(results[0].availabilityLabel).toBe("Book appointment");
    expect(results[0].bookingHref).toContain("barberId=barber-phillip");
    expect(results[0].bookingHref).not.toContain("appointmentTime=");
  });

  it("uses a stable fallback public slug when an activated barber has not set a username", async () => {
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + 1);
    targetDay.setHours(10, 0, 0, 0);
    const targetEnd = new Date(targetDay);
    targetEnd.setHours(14, 0, 0, 0);
    const tables = {
      barbers: [{
        id: "barber-uuid",
        reference_code: "live-123",
        profile_id: "profile-uuid",
        compensation_model: "commission",
        app_approval_status: "approved",
        shop_approval_status: "approved",
        commission_rate: 0.5,
        booth_rent_amount: null,
        booth_rent_frequency: null,
        bio: "Independent cuts.",
        booking_slug: null
      }],
      barber_profiles: [{
        barber_reference: "live-123",
        username: null,
        display_name: "No Username Barber",
        bio: "Independent cuts.",
        years_experience: 4,
        shop_reference: "independent-live-123",
        profile_photo_path: null,
        profile_photo_url: null,
        specialties: ["Fade"],
        badges: [],
        service_area_label: "Charlotte",
        next_available_at: null,
        visibility_state: "public"
      }],
      profiles: [{
        id: "profile-uuid",
        full_name: "No Username Barber",
        email: "nobarber@example.test",
        phone: "7045550101",
        primary_onboarding_role: null,
        role: "booth_rent_barber"
      }],
      services: [{
        id: "service-uuid",
        reference_code: "srv-cut",
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
        barber_reference: "live-123",
        shop_reference: "independent-live-123",
        booking_count: 0,
        popularity_rank: 1
      }],
      locations: [{
        id: "location-uuid",
        reference_code: "independent-live-123",
        name: "Private Studio",
        neighborhood: "South End",
        city: "Charlotte",
        state: "NC",
        phone: "7045550101",
        address: "10 Studio Way",
        latitude: 35.227,
        longitude: -80.843
      }],
      availability_rules: [{
        barber_id: "barber-uuid",
        location_id: "independent-live-123",
        weekday: targetDay.getDay(),
        start_time: formatTime(targetDay),
        end_time: formatTime(targetEnd)
      }],
      blocked_times: [],
      appointments: [],
      reviews: [],
      barber_portfolios: [],
      barber_status: [{
        barber_reference: "live-123",
        status: "active",
        live_status: "live",
        accepting_bookings: true
      }],
      connected_accounts: [{
        subject_type: "barber",
        barber_id: "barber-uuid",
        payout_readiness_status: "ready",
        charges_enabled: true,
        payouts_enabled: true,
        requirements_currently_due: [],
        requirements_past_due: [],
        disabled_reason: null
      }]
    };
    const supabase = createSupabaseMock(tables);

    const results = await buildCanonicalDiscoveryResults(supabase as never, {
      locationId: "independent-live-123"
    });
    const publicProfile = await buildCanonicalBarberProfile(supabase as never, "barber-live-123");

    expect(results).toHaveLength(1);
    expect(results[0].username).toBe("barber-live-123");
    expect(results[0].bookingHref).toContain("barber=barber-live-123");
    expect(publicProfile?.profile.username).toBe("barber-live-123");
  });
});
