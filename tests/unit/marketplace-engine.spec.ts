import { describe, expect, it } from "vitest";
import {
  MarketplacePermissionError,
  createInitialMarketplaceState,
  createServiceDefinition,
  getHaircutNowMatch,
  getPublicBarberProfileByUsername,
  searchMarketplace,
  updateServiceDefinition
} from "@/lib/marketplace/engine";
import { createInitialTrustState } from "@/lib/trust/engine";

describe("marketplace engine", () => {
  it("lets the owner update a shop-owned commission service", () => {
    const state = createInitialMarketplaceState();
    const result = updateServiceDefinition(state, { role: "owner" }, "srv-signature", {
      price: 59,
      description: "Sharper premium cut experience."
    });

    expect(result.service.ownerType).toBe("shop");
    expect(result.service.price).toBe(59);
    expect(result.service.description).toContain("Sharper premium cut");
  });

  it("lets a booth-rent barber create and edit a self-owned service", () => {
    const state = createInitialMarketplaceState();
    const created = createServiceDefinition(state, { role: "booth_rent_barber", barberId: "barber-blaze" }, {
      category: "Haircuts",
      name: "Blaze Late Night Detail",
      description: "After-hours premium cleanup.",
      durationMin: 45,
      bufferMin: 5,
      price: 72,
      deposit: 18,
      fullPrepay: false,
      styleTagIds: ["style-executive"]
    });
    const updated = updateServiceDefinition(created.state, { role: "booth_rent_barber", barberId: "barber-blaze" }, created.service.id, {
      price: 76,
      description: "After-hours premium cleanup with hot towel finish."
    });

    expect(created.service.ownerType).toBe("barber");
    expect(created.service.barberId).toBe("barber-blaze");
    expect(updated.service.price).toBe(76);
    expect(updated.service.description).toContain("hot towel");
  });

  it("blocks commission barbers from creating services", () => {
    const state = createInitialMarketplaceState();

    expect(() => createServiceDefinition(state, { role: "commission_barber", barberId: "barber-wave" }, {
      category: "Haircuts",
      name: "Unauthorized Service",
      description: "Should not be allowed.",
      durationMin: 45,
      bufferMin: 5,
      price: 65,
      deposit: 15,
      fullPrepay: false,
      styleTagIds: []
    })).toThrow(MarketplacePermissionError);
  });

  it("blocks managers from editing service definitions", () => {
    const state = createInitialMarketplaceState();

    expect(() => updateServiceDefinition(state, { role: "manager" }, "srv-signature", {
      price: 61
    })).toThrow(MarketplacePermissionError);
  });

  it("resolves the public barber profile with the most booked service", () => {
    const state = createInitialMarketplaceState();
    const profile = getPublicBarberProfileByUsername(state, "wave");

    expect(profile).not.toBeNull();
    expect(profile?.barber.name).toBe("Wave Carter");
    expect(profile?.mostBookedService?.service.name).toBe("Signature Precision Cut");
  });

  it("uses persisted review data for barber profile ratings and review counts", () => {
    const state = createInitialMarketplaceState();
    state.reviews.unshift(
      {
        id: "review-99",
        appointmentId: "appt-99",
        barberId: "barber-blaze",
        clientId: "client-jordan",
        locationId: "loc-ybor",
        rating: 4,
        sentiment: "good",
        message: "Strong detail work.",
        createdAt: "2026-03-24T10:00:00-04:00"
      },
      {
        id: "review-100",
        appointmentId: "appt-100",
        barberId: "barber-blaze",
        clientId: "client-omar",
        locationId: "loc-ybor",
        rating: 5,
        sentiment: "great",
        message: "Fast and clean.",
        createdAt: "2026-03-24T10:15:00-04:00"
      }
    );

    const profile = getPublicBarberProfileByUsername(state, "blaze");

    expect(profile).not.toBeNull();
    expect(profile?.reviews.length).toBeGreaterThanOrEqual(3);
    expect(profile?.barber.reviewCount).toBe(profile?.reviews.length);
    expect(profile?.barber.rating).toBeCloseTo(4.67, 1);
  });

  it("returns discovery results for service and location searches", () => {
    const state = createInitialMarketplaceState();
    const results = searchMarketplace(state, {
      query: "kids haircut",
      locationId: "loc-hyde"
    });

    expect(results.some((result) => result.username === "fade")).toBe(true);
  });

  it("hides blocked barbers from discovery while keeping fallback behavior safe without trust state", () => {
    const state = createInitialMarketplaceState();
    const trustState = createInitialTrustState();
    const fadeProfileId = trustState.barberVerifications.find((record) => record.barberId === "barber-fade")?.verificationProfileId;
    trustState.verificationProfiles = (trustState.verificationProfiles ?? []).map((profile) =>
      profile.id === fadeProfileId
        ? {
          ...profile,
          overallStatus: "needs_update",
          publicVerified: false,
          canAcceptBookings: false,
          currentRequirements: ["Upload an updated barber license."]
        }
        : profile
    );

    const gatedResults = searchMarketplace(state, { locationId: "loc-hyde" }, trustState);
    const fallbackResults = searchMarketplace(state, { locationId: "loc-hyde" });

    expect(gatedResults.some((result) => result.username === "fade")).toBe(false);
    expect(fallbackResults.some((result) => result.username === "fade")).toBe(true);
  });

  it("hides blocked shops from the public barber profile while keeping the barber lane visible", () => {
    const state = createInitialMarketplaceState();
    const trustState = createInitialTrustState();
    const shopProfileId = trustState.shopVerifications.find((record) => record.shopId === "shop-bvrb3r")?.verificationProfileId;
    trustState.verificationProfiles = (trustState.verificationProfiles ?? []).map((profile) =>
      profile.id === shopProfileId
        ? {
          ...profile,
          overallStatus: "needs_update",
          publicVerified: false,
          canCreateShopListing: false,
          currentRequirements: ["Complete the updated business verification review."]
        }
        : profile
    );

    const profile = getPublicBarberProfileByUsername(state, "wave", trustState);

    expect(profile).not.toBeNull();
    expect(profile?.shop).toBeUndefined();
  });

  it("prioritizes the favorite barber for haircut now", () => {
    const state = createInitialMarketplaceState();
    const match = getHaircutNowMatch(state, "client-jordan", "loc-ybor");

    expect(match).not.toBeNull();
    expect(match?.matchedFrom).toBe("favorite_barber");
    expect(match?.username).toBe("wave");
  });
});
