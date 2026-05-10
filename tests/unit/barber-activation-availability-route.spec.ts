import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getMarketplaceStateMock,
  getSessionUserMock,
  markOnboardingStepCompleteMock,
  setMarketplaceStateMock
} = vi.hoisted(() => ({
  getMarketplaceStateMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  markOnboardingStepCompleteMock: vi.fn(),
  setMarketplaceStateMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: () => false
}));

vi.mock("@/lib/marketplace/state", () => ({
  getMarketplaceState: getMarketplaceStateMock,
  setMarketplaceState: setMarketplaceStateMock
}));

vi.mock("@/lib/onboarding/service", () => ({
  markOnboardingStepComplete: markOnboardingStepCompleteMock
}));

vi.mock("@/lib/operations/shop-team-invites", () => ({
  createBarberShopJoinRequest: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => null
}));

describe("barber activation availability route", () => {
  beforeEach(() => {
    getMarketplaceStateMock.mockReset();
    getSessionUserMock.mockReset();
    markOnboardingStepCompleteMock.mockReset();
    setMarketplaceStateMock.mockReset();

    getSessionUserMock.mockResolvedValue({
      id: "profile-barber",
      role: "booth_rent_barber",
      barberId: "barber-real",
      email: "barber@example.com"
    });
    getMarketplaceStateMock.mockReturnValue({
      barbers: [{
        id: "barber-real",
        locationIds: [],
        name: "Real Barber"
      }],
      barberProfiles: [{
        barberId: "barber-real",
        username: "realbarber",
        visibilityState: "public"
      }],
      visibilities: [],
      locations: []
    });
  });

  it("saves working hours without requiring a shop assignment", async () => {
    const { POST } = await import("@/app/api/barber/activation/route");

    const response = await POST(new Request("https://bvrb3r.test/api/barber/activation", {
      method: "POST",
      body: JSON.stringify({
        action: "save_availability",
        locationMode: "later",
        workingHours: [
          { weekday: 1, startTime: "12:00", endTime: "19:00" }
        ]
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasAvailabilityDraft).toBe(true);
    expect(body.hasServiceLocation).toBe(false);
    expect(markOnboardingStepCompleteMock).toHaveBeenCalledWith(
      expect.objectContaining({ barberId: "barber-real" }),
      "barber",
      "barber_availability",
      expect.objectContaining({
        serviceMode: "later",
        activationAvailability: expect.objectContaining({
          locationMode: "later"
        })
      })
    );
  });

  it("saves an independent service location as activation location truth", async () => {
    const { POST } = await import("@/app/api/barber/activation/route");

    const response = await POST(new Request("https://bvrb3r.test/api/barber/activation", {
      method: "POST",
      body: JSON.stringify({
        action: "save_availability",
        locationMode: "custom",
        serviceLocation: {
          name: "Phil Studio",
          address: "123 Main St",
          addressLine2: "Suite 4",
          city: "Charlotte",
          state: "NC",
          postalCode: "28202"
        },
        workingHours: [
          { weekday: 1, startTime: "12:00", endTime: "19:00" }
        ]
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasServiceLocation).toBe(true);
    expect(body.serviceLocationLabel).toContain("Phil Studio");
    expect(setMarketplaceStateMock).toHaveBeenCalledWith(expect.objectContaining({
      locations: [expect.objectContaining({
        id: "independent-barber-real",
        address: "123 Main St",
        addressLine2: "Suite 4",
        city: "Charlotte",
        postalCode: "28202"
      })]
    }));
  });

  it("saves a booking address that client booking can display", async () => {
    const { POST } = await import("@/app/api/barber/activation/route");

    const response = await POST(new Request("https://bvrb3r.test/api/barber/activation", {
      method: "POST",
      body: JSON.stringify({
        action: "save_booking_location",
        serviceLocation: {
          name: "Phils chair",
          address: "2172 University Square Mall",
          city: "Tampa",
          state: "FL",
          postalCode: "33612"
        }
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasServiceLocation).toBe(true);
    expect(body.serviceLocationLabel).toContain("Phils chair");
    expect(setMarketplaceStateMock).toHaveBeenCalledWith(expect.objectContaining({
      locations: [expect.objectContaining({
        id: "independent-barber-real",
        name: "Phils chair",
        address: "2172 University Square Mall",
        city: "Tampa",
        state: "FL",
        postalCode: "33612"
      })]
    }));
  });
});
