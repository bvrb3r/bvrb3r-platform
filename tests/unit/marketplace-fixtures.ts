import { createEmptyMarketplaceState, type MarketplaceState } from "@/lib/marketplace/engine";
import { createEmptyTrustState } from "@/lib/trust/engine";
import type { BarberRankingInput, MarketplaceConversionEvent } from "@/types/domain";
import type { TrustState } from "@/types/trust";

export function futureIso() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
}

export function approvedMarketplaceTrustState(barberId = "barber-real", shopId = "shop-real"): TrustState {
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

export function visibleMarketplaceState(): MarketplaceState {
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
    rating: 4.8,
    reviewCount: 12,
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
  state.services.push(
    {
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
    },
    {
      id: "srv-shop-real",
      category: "Haircuts",
      name: "Real Shop Cut",
      description: "A real shop-owned haircut.",
      durationMin: 45,
      bufferMin: 5,
      price: 55,
      deposit: 10,
      fullPrepay: false,
      addOnIds: [],
      ownerType: "shop",
      shopId: "shop-real",
      styleTagIds: []
    }
  );
  state.clientPreferences.push({
    clientId: "client-real",
    favoriteShopId: "shop-real",
    preferredLocationId: "loc-real",
    preferredStyleTagIds: [],
    prefersInstantBooking: true
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

export function realBarberRankingInput(): BarberRankingInput {
  return {
    barberId: "barber-real",
    distanceScore: 10,
    averageRatingScore: 9,
    reviewVolumeScore: 7,
    retentionScore: 8,
    availabilityScore: 12,
    portfolioEngagementScore: 6,
    followCount: 4,
    reputationScore: 88,
    servicePopularityScore: 40,
    rebookingScore: 9,
    conversionScore: 12,
    visibilityScore: 10,
    rankingScore: 85,
    label: "Verified early supply"
  };
}

export function realBarberConversionEvents(): MarketplaceConversionEvent[] {
  const now = new Date().toISOString();
  return [
    "discovery_impression",
    "profile_view",
    "booking_cta_clicked",
    "booking_created",
    "booking_completed"
  ].map((eventType, index) => ({
    id: `conv-real-${index}`,
    eventType: eventType as MarketplaceConversionEvent["eventType"],
    barberId: "barber-real",
    username: "realbarber",
    clientId: "client-real",
    locationId: "loc-real",
    sourceKind: "discovery",
    metadata: {},
    createdAt: now
  }));
}
