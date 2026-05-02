import { describe, expect, it } from "vitest";
import {
  createInitialMarketplaceState,
  createEmptyMarketplaceState,
  filterVisibleMarketplaceBarbers,
  filterVisibleMarketplaceShops,
  getMapDiscoveryMarkers,
  getPublicBarberProfileByUsername,
  searchMarketplace,
  type MarketplaceState
} from "@/lib/marketplace/engine";
import { createEmptyTrustState } from "@/lib/trust/engine";
import type { TrustState } from "@/types/trust";

function futureIso() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
}

function approvedTrustState(barberId = "barber-real", shopId = "shop-real"): TrustState {
  const now = new Date().toISOString();
  return {
    ...createEmptyTrustState(),
    verificationProfiles: [
      {
        id: "vp-barber-real",
        userId: "profile-barber-real",
        role: "barber",
        overallStatus: "approved",
        identityStatus: "approved",
        licenseStatus: "approved",
        businessStatus: "not_started",
        payoutStatus: "approved",
        complianceStatus: "approved",
        publicVerified: true,
        canAcceptBookings: true,
        canReceivePayouts: true,
        canCreateShopListing: false,
        currentRequirements: [],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "vp-shop-real",
        userId: "profile-owner-real",
        role: "shop_owner",
        overallStatus: "approved",
        identityStatus: "not_started",
        licenseStatus: "not_started",
        businessStatus: "approved",
        payoutStatus: "approved",
        complianceStatus: "approved",
        publicVerified: true,
        canAcceptBookings: false,
        canReceivePayouts: true,
        canCreateShopListing: true,
        currentRequirements: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    barberVerifications: [
      {
        id: "bv-identity",
        barberId,
        category: "identity_verification",
        legalName: "Real Barber",
        verificationProfileId: "vp-barber-real",
        verificationStatus: "approved",
        updatedAt: now
      },
      {
        id: "bv-license",
        barberId,
        category: "license_verification",
        legalName: "Real Barber",
        verificationProfileId: "vp-barber-real",
        verificationStatus: "approved",
        updatedAt: now
      },
      {
        id: "bv-payout",
        barberId,
        category: "payout_verification",
        legalName: "Real Barber",
        verificationProfileId: "vp-barber-real",
        verificationStatus: "approved",
        updatedAt: now
      }
    ],
    shopVerifications: [
      {
        id: "sv-business",
        shopId,
        category: "business_verification",
        businessName: "Real Shop",
        verificationProfileId: "vp-shop-real",
        verificationStatus: "approved",
        updatedAt: now
      },
      {
        id: "sv-ownership",
        shopId,
        category: "ownership_verification",
        businessName: "Real Shop",
        verificationProfileId: "vp-shop-real",
        verificationStatus: "approved",
        updatedAt: now
      }
    ]
  };
}

function visibleMarketplaceState(): MarketplaceState {
  const state = createEmptyMarketplaceState();
  state.locations.push({
    id: "loc-real",
    name: "Real Shop",
    neighborhood: "Downtown",
    city: "Tampa",
    state: "FL",
    phone: "8135550100",
    hours: "Mon-Fri 9-6",
    chairs: 1,
    taxRate: 0.07
  });
  state.shops.push({
    id: "shop-real",
    name: "Real Shop",
    brandLine: "Real cuts only",
    phone: "8135550100",
    locationIds: ["loc-real"],
    type: "shop",
    appApprovalStatus: "approved"
  });
  state.barbers.push({
    id: "barber-real",
    userId: "profile-barber-real",
    name: "Real Barber",
    role: "booth_rent_barber",
    appApprovalStatus: "approved",
    shopApprovalStatus: "not_required",
    locationIds: ["loc-real"],
    specialties: ["Fades"],
    rating: 0,
    reviewCount: 0,
    compensationModel: "booth_rent",
    todayEarnings: 0,
    upcomingPayout: 0,
    availabilityLabel: "Available today",
    bio: "A real active barber accepting bookings.",
    bookingLink: "/book/realbarber"
  });
  state.barberProfiles.push({
    id: "profile-real",
    barberId: "barber-real",
    username: "realbarber",
    photoAccent: "#7cff00",
    yearsExperience: 5,
    shopId: "shop-real",
    headline: "Clean real-world cuts.",
    specialties: ["Fades"],
    badges: [],
    nextAvailableAt: futureIso(),
    serviceAreaLabel: "Tampa",
    visibilityState: "public"
  });
  state.visibilities.push({
    barberId: "barber-real",
    visibilityState: "public",
    acceptsInstantBookings: true
  });
  state.services.push({
    id: "srv-real",
    category: "Haircuts",
    name: "Real Cut",
    description: "A real bookable haircut.",
    durationMin: 45,
    bufferMin: 5,
    price: 45,
    deposit: 10,
    fullPrepay: false,
    addOnIds: [],
    ownerType: "barber",
    barberId: "barber-real",
    styleTagIds: []
  });
  state.locationSearchIndex.push(
    {
      id: "idx-shop-real",
      locationId: "loc-real",
      shopId: "shop-real",
      latitude: 27.9506,
      longitude: -82.4572,
      distanceMiles: 0.2
    },
    {
      id: "idx-barber-real",
      locationId: "loc-real",
      shopId: "shop-real",
      barberId: "barber-real",
      latitude: 27.9506,
      longitude: -82.4572,
      distanceMiles: 0.2
    }
  );

  return state;
}

describe("marketplace visibility", () => {
  it("starts pre-open marketplace runtime with no seeded demo inventory", () => {
    const state = createInitialMarketplaceState();

    expect(state.barbers).toEqual([]);
    expect(state.shops).toEqual([]);
    expect(state.services).toEqual([]);
    expect(searchMarketplace(state, {}, approvedTrustState())).toEqual([]);
    expect(filterVisibleMarketplaceShops(state, approvedTrustState())).toEqual([]);
  });

  it("shows a barber and shop only when they are real, active, approved, and bookable", () => {
    const state = visibleMarketplaceState();
    const trustState = approvedTrustState();

    expect(searchMarketplace(state, {}, trustState).map((result) => result.username)).toEqual(["realbarber"]);
    expect(getPublicBarberProfileByUsername(state, "realbarber", trustState)?.barber.id).toBe("barber-real");
    expect(filterVisibleMarketplaceShops(state, trustState).map((shop) => shop.id)).toEqual(["shop-real"]);
    expect(getMapDiscoveryMarkers(state, {}, trustState).map((marker) => marker.kind).sort()).toEqual(["barber", "shop"]);
  });

  it("uses the same eligible barber rule for guest and client discovery", () => {
    const state = visibleMarketplaceState();
    const trustState = approvedTrustState();

    const guestResults = searchMarketplace(state, { availability: "any" }, trustState);
    const clientResults = searchMarketplace(state, { availability: "any" }, trustState);

    expect(guestResults.map((result) => result.barberId)).toEqual(["barber-real"]);
    expect(clientResults).toEqual(guestResults);
    expect(filterVisibleMarketplaceBarbers(state, trustState).map(({ barber }) => barber.id)).toEqual(["barber-real"]);
  });

  it("hides incomplete barbers with no real services", () => {
    const state = visibleMarketplaceState();
    state.services = [];

    expect(searchMarketplace(state, {}, approvedTrustState())).toEqual([]);
    expect(filterVisibleMarketplaceShops(state, approvedTrustState())).toEqual([]);
  });

  it("hides barbers with no future bookable availability", () => {
    const state = visibleMarketplaceState();
    state.barberProfiles[0] = {
      ...state.barberProfiles[0],
      nextAvailableAt: new Date(Date.now() - 60_000).toISOString()
    };

    expect(searchMarketplace(state, {}, approvedTrustState())).toEqual([]);
    expect(getPublicBarberProfileByUsername(state, "realbarber", approvedTrustState())).toBeNull();
  });

  it("hides barbers that are not explicitly accepting marketplace bookings", () => {
    const state = visibleMarketplaceState();
    state.visibilities[0] = {
      ...state.visibilities[0],
      acceptsInstantBookings: false
    };

    expect(searchMarketplace(state, {}, approvedTrustState())).toEqual([]);
  });

  it("hides barbers and public profile entry when profile visibility is hidden", () => {
    const state = visibleMarketplaceState();
    state.barberProfiles[0] = {
      ...state.barberProfiles[0],
      visibilityState: "hidden"
    };

    expect(searchMarketplace(state, {}, approvedTrustState())).toEqual([]);
    expect(getPublicBarberProfileByUsername(state, "realbarber", approvedTrustState())).toBeNull();
    expect(filterVisibleMarketplaceShops(state, approvedTrustState())).toEqual([]);
  });

  it("hides shops that are incomplete or have no active bookable barber attached", () => {
    const state = visibleMarketplaceState();
    state.shops[0] = {
      ...state.shops[0],
      locationIds: []
    };

    expect(searchMarketplace(state, {}, approvedTrustState())).toEqual([]);
    expect(filterVisibleMarketplaceShops(state, approvedTrustState())).toEqual([]);
  });

  it("hides approved-looking rows when trust approval is missing", () => {
    const state = visibleMarketplaceState();

    expect(searchMarketplace(state, {}, createEmptyTrustState())).toEqual([]);
    expect(getMapDiscoveryMarkers(state, {}, createEmptyTrustState())).toEqual([]);
  });

  it("hides barbers until the canonical platform approval status is approved", () => {
    const state = visibleMarketplaceState();
    state.barbers[0] = {
      ...state.barbers[0],
      appApprovalStatus: "pending"
    };

    expect(searchMarketplace(state, {}, approvedTrustState())).toEqual([]);
    expect(filterVisibleMarketplaceBarbers(state, approvedTrustState())).toEqual([]);
  });

  it("hides suspended barbers from discovery and public profile routes", () => {
    const state = visibleMarketplaceState();
    const trustState = approvedTrustState();
    trustState.verificationProfiles![0] = {
      ...trustState.verificationProfiles![0],
      overallStatus: "suspended",
      publicVerified: false,
      canAcceptBookings: false
    };

    expect(searchMarketplace(state, {}, trustState)).toEqual([]);
    expect(filterVisibleMarketplaceBarbers(state, trustState)).toEqual([]);
    expect(getPublicBarberProfileByUsername(state, "realbarber", trustState)).toBeNull();
  });

  it("hides shops until the canonical shop approval status is approved", () => {
    const state = visibleMarketplaceState();
    state.shops[0] = {
      ...state.shops[0],
      appApprovalStatus: "under_review"
    };

    expect(searchMarketplace(state, {}, approvedTrustState())).toEqual([]);
    expect(filterVisibleMarketplaceShops(state, approvedTrustState())).toEqual([]);
    expect(getMapDiscoveryMarkers(state, {}, approvedTrustState())).toEqual([]);
  });

  it("hides suspended shops from discovery and map markers", () => {
    const state = visibleMarketplaceState();
    const trustState = approvedTrustState();
    trustState.verificationProfiles![1] = {
      ...trustState.verificationProfiles![1],
      overallStatus: "suspended",
      publicVerified: false,
      canCreateShopListing: false
    };

    expect(searchMarketplace(state, {}, trustState)).toEqual([]);
    expect(filterVisibleMarketplaceShops(state, trustState)).toEqual([]);
    expect(getMapDiscoveryMarkers(state, {}, trustState)).toEqual([]);
  });

  it("does not allow known demo or seeded barber references into production discovery", () => {
    const state = visibleMarketplaceState();
    state.barbers[0] = {
      ...state.barbers[0],
      id: "barber-wave",
      userId: "user-wave"
    };
    state.barberProfiles[0] = {
      ...state.barberProfiles[0],
      barberId: "barber-wave"
    };
    state.visibilities[0] = {
      ...state.visibilities[0],
      barberId: "barber-wave"
    };
    state.services[0] = {
      ...state.services[0],
      barberId: "barber-wave"
    };
    state.locationSearchIndex[1] = {
      ...state.locationSearchIndex[1],
      barberId: "barber-wave"
    };

    expect(searchMarketplace(state, {}, approvedTrustState("barber-wave"))).toEqual([]);
    expect(getPublicBarberProfileByUsername(state, "realbarber", approvedTrustState("barber-wave"))).toBeNull();
  });
});
