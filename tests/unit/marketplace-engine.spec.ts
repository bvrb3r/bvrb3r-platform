import { describe, expect, it } from "vitest";
import {
  MarketplacePermissionError,
  createServiceDefinition,
  getHaircutNowMatch,
  getPublicBarberProfileByUsername,
  searchMarketplace,
  updateServiceDefinition
} from "@/lib/marketplace/engine";
import { approvedMarketplaceTrustState, visibleMarketplaceState } from "@/tests/unit/marketplace-fixtures";

describe("marketplace engine", () => {
  it("lets the owner update a shop-owned commission service", () => {
    const state = visibleMarketplaceState();
    const result = updateServiceDefinition(state, { role: "shop_owner_user" }, "srv-shop-real", {
      price: 59,
      description: "Sharper premium cut experience."
    });

    expect(result.service.ownerType).toBe("shop");
    expect(result.service.price).toBe(59);
    expect(result.service.description).toContain("Sharper premium cut");
  });

  it("lets a booth-rent barber create and edit a self-owned service", () => {
    const state = visibleMarketplaceState();
    const created = createServiceDefinition(state, { role: "barber_user", barberSubtype: "booth_rent", barberId: "barber-real" }, {
      category: "Haircuts",
      name: "Late Night Detail",
      description: "After-hours premium cleanup.",
      durationMin: 45,
      bufferMin: 5,
      price: 72,
      deposit: 18,
      fullPrepay: false,
      styleTagIds: ["style-executive"]
    });
    const updated = updateServiceDefinition(created.state, { role: "barber_user", barberSubtype: "booth_rent", barberId: "barber-real" }, created.service.id, {
      price: 76,
      description: "After-hours premium cleanup with hot towel finish."
    });

    expect(created.service.ownerType).toBe("barber");
    expect(created.service.barberId).toBe("barber-real");
    expect(updated.service.price).toBe(76);
    expect(updated.service.description).toContain("hot towel");
  });

  it("persists active and bookable state on service create and update", () => {
    const state = visibleMarketplaceState();
    const created = createServiceDefinition(state, { role: "barber_user", barberSubtype: "booth_rent", barberId: "barber-real" }, {
      category: "Haircuts",
      name: "Private Lineup",
      description: "Internal-only service.",
      durationMin: 30,
      bufferMin: 0,
      price: 25,
      deposit: 0,
      fullPrepay: false,
      styleTagIds: [],
      active: true,
      bookable: false
    });
    const updated = updateServiceDefinition(created.state, { role: "barber_user", barberSubtype: "booth_rent", barberId: "barber-real" }, created.service.id, {
      active: false,
      bookable: true
    });

    expect(created.service.isActive).toBe(true);
    expect(created.service.isBookable).toBe(false);
    expect(updated.service.isActive).toBe(false);
    expect(updated.service.isBookable).toBe(false);
  });

  it("blocks commission barbers from creating services", () => {
    const state = visibleMarketplaceState();

    expect(() => createServiceDefinition(state, { role: "barber_user", barberSubtype: "commission", barberId: "barber-real" }, {
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
    const state = visibleMarketplaceState();

    expect(() => updateServiceDefinition(state, { role: "manager" }, "srv-shop-real", {
      price: 61
    })).toThrow(MarketplacePermissionError);
  });

  it("resolves the public barber profile with the most booked service", () => {
    const state = visibleMarketplaceState();
    const profile = getPublicBarberProfileByUsername(state, "realbarber", approvedMarketplaceTrustState());

    expect(profile).not.toBeNull();
    expect(profile?.barber.name).toBe("realbarber");
    expect(profile?.mostBookedService?.service.name).toBe("Real Cut");
  });

  it("excludes inactive or internal-only services from public profile and discovery", () => {
    const state = visibleMarketplaceState();
    state.services = state.services.map((service) =>
      service.id === "srv-real"
        ? { ...service, isActive: true, isBookable: false }
        : service.id === "srv-shop-real"
          ? { ...service, isActive: false, isBookable: true }
          : service
    );

    const profile = getPublicBarberProfileByUsername(state, "realbarber", approvedMarketplaceTrustState());
    const results = searchMarketplace(state, { query: "real cut" }, approvedMarketplaceTrustState());

    expect(profile).toBeNull();
    expect(results).toEqual([]);
  });

  it("uses persisted review data for barber profile ratings and review counts", () => {
    const state = visibleMarketplaceState();
    state.reviews.unshift(
      {
        id: "review-99",
        appointmentId: "appt-99",
        barberId: "barber-real",
        clientId: "client-real",
        locationId: "loc-real",
        rating: 4,
        sentiment: "good",
        message: "Strong detail work.",
        createdAt: "2026-03-24T10:00:00-04:00"
      },
      {
        id: "review-100",
        appointmentId: "appt-100",
        barberId: "barber-real",
        clientId: "client-omar",
        locationId: "loc-real",
        rating: 5,
        sentiment: "great",
        message: "Fast and clean.",
        createdAt: "2026-03-24T10:15:00-04:00"
      }
    );

    const profile = getPublicBarberProfileByUsername(state, "realbarber", approvedMarketplaceTrustState());

    expect(profile).not.toBeNull();
    expect(profile?.reviews.length).toBe(2);
    expect(profile?.barber.reviewCount).toBe(profile?.reviews.length);
    expect(profile?.barber.rating).toBeCloseTo(4.5, 1);
  });

  it("returns discovery results for service and location searches", () => {
    const state = visibleMarketplaceState();
    const results = searchMarketplace(state, {
      query: "real cut",
      locationId: "loc-real"
    }, approvedMarketplaceTrustState());

    expect(results.some((result) => result.username === "realbarber")).toBe(true);
  });

  it("supports canonical service-category filtering", () => {
    const state = visibleMarketplaceState();
    const trustState = approvedMarketplaceTrustState();

    expect(searchMarketplace(state, { category: "haircuts" }, trustState).map((result) => result.username)).toContain("realbarber");
    expect(searchMarketplace(state, { category: "products" }, trustState)).toEqual([]);
  });

  it("hides blocked barbers from discovery and keeps real canonical supply available without trust state", () => {
    const state = visibleMarketplaceState();
    const trustState = approvedMarketplaceTrustState();
    const profileId = trustState.barberVerifications.find((record) => record.barberId === "barber-real")?.verificationProfileId;
    trustState.verificationProfiles = (trustState.verificationProfiles ?? []).map((profile) =>
      profile.id === profileId
        ? {
          ...profile,
          overallStatus: "needs_update",
          publicVerified: false,
          canAcceptBookings: false,
          currentRequirements: ["Upload an updated barber license."]
        }
        : profile
    );

    const gatedResults = searchMarketplace(state, { locationId: "loc-real" }, trustState);
    const fallbackResults = searchMarketplace(state, { locationId: "loc-real" });

    expect(gatedResults).toEqual([]);
    expect(fallbackResults.map((result) => result.username)).toContain("realbarber");
  });

  it("hides barbers attached to a blocked shop from public profile entry", () => {
    const state = visibleMarketplaceState();
    const trustState = approvedMarketplaceTrustState();
    const shopProfileId = trustState.shopVerifications.find((record) => record.shopId === "shop-real")?.verificationProfileId;
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

    const profile = getPublicBarberProfileByUsername(state, "realbarber", trustState);

    expect(profile).toBeNull();
  });

  it("uses only eligible visible results for haircut now", () => {
    const state = visibleMarketplaceState();
    const match = getHaircutNowMatch(state, "client-real", "loc-real", approvedMarketplaceTrustState());

    expect(match).not.toBeNull();
    expect(match?.matchedFrom).toBe("favorite_shop");
    expect(match?.username).toBe("realbarber");
  });

  it("attaches canonical portfolio assets to the public barber profile", () => {
    const state = visibleMarketplaceState();
    const profile = getPublicBarberProfileByUsername(state, "realbarber", approvedMarketplaceTrustState());

    expect(profile).not.toBeNull();
    expect(profile?.portfolio).toHaveLength(1);
    expect(profile?.portfolio[0]?.imageUrl).toContain("look-1.jpg");
  });
});
