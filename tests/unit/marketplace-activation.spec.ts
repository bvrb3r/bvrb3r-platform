import { describe, expect, it } from "vitest";
import { decorateDiscoveryWithActivation, getMonetizationEligibility, type MarketplaceActivationState } from "@/lib/marketplace/activation";
import type { DiscoveryResult } from "@/types/domain";
import type { PublicTrustSignal } from "@/types/trust";

function makeTrustSignal(overrides: Partial<PublicTrustSignal> = {}): PublicTrustSignal {
  return {
    barberId: "barber-wave",
    shopId: "shop-bvrb3r",
    trustScore: 92,
    completionRate: 96,
    reviewIntegrityScore: 95,
    verifiedBarber: true,
    verifiedLicense: true,
    verifiedShop: true,
    trustLabel: "Trusted Pro",
    publicBadgeLabels: ["Verified barber", "Verified license"],
    reliabilityLabel: "High booking reliability",
    reviewIntegrityLabel: "Verified review integrity",
    moderationState: "clear",
    ...overrides
  };
}

function makeState(): MarketplaceActivationState {
  return {
    verificationUploads: [],
    boostCampaigns: [
      {
        id: "boost-1",
        scopeType: "barber",
        scopeId: "barber-wave",
        status: "active",
        placementLabel: "Boosted in Tampa discovery",
        placementScope: "discover_city",
        citySlug: "tampa-bay",
        trustEligible: true,
        trustReason: "Eligible",
        spendCents: 18000,
        dailyBudgetCents: 4500,
        startsAt: "2026-03-01T00:00:00.000Z",
        endsAt: "2026-03-30T00:00:00.000Z",
        createdByRole: "barber_user",
        createdById: "barber-wave",
        createdAt: "2026-03-01T00:00:00.000Z"
      }
    ],
    featuredPlacements: [
      {
        id: "featured-1",
        scopeType: "barber",
        scopeId: "barber-wave",
        label: "Featured barber in Tampa Bay",
        placementScope: "discover_hero",
        citySlug: "tampa-bay",
        status: "active",
        trustEligible: true,
        startsAt: "2026-03-01T00:00:00.000Z",
        endsAt: "2026-03-30T00:00:00.000Z",
        priority: 1,
        createdByRole: "owner",
        createdById: "owner@bvrb3r.demo",
        createdAt: "2026-03-01T00:00:00.000Z"
      }
    ],
    cityRollouts: [
      {
        id: "city-1",
        citySlug: "tampa-bay",
        cityLabel: "Tampa Bay",
        stateCode: "FL",
        activationState: "live",
        densityScore: 88,
        launchVisible: true,
        featuredBarberIds: ["barber-wave"],
        featuredShopIds: ["shop-bvrb3r"],
        marketNotes: "Flagship market",
        updatedAt: "2026-03-01T00:00:00.000Z"
      }
    ],
    monetizationEvents: []
  };
}

describe("marketplace activation", () => {
  it("enforces trust-aware monetization thresholds", () => {
    expect(getMonetizationEligibility(makeTrustSignal())).toEqual(
      expect.objectContaining({
        canBoostVisibility: true,
        canUseFeaturedPlacement: true,
        requiresVerification: false
      })
    );

    expect(getMonetizationEligibility(makeTrustSignal({ verifiedLicense: false }))).toEqual(
      expect.objectContaining({
        canBoostVisibility: false,
        canUseFeaturedPlacement: false,
        requiresVerification: true
      })
    );

    expect(getMonetizationEligibility(makeTrustSignal({ trustScore: 86, completionRate: 88 }))).toEqual(
      expect.objectContaining({
        canBoostVisibility: true,
        canUseFeaturedPlacement: false
      })
    );
  });

  it("decorates discovery results with activation proof and booking links", () => {
    const results: DiscoveryResult[] = [
      {
        barberId: "barber-wave",
        username: "wave",
        barberName: "Wave Carter",
        rating: 4.9,
        reviewCount: 188,
        priceRange: [45, 95],
        nextAvailableAt: "2026-03-10T15:00:00.000Z",
        distanceMiles: 2.4,
        shopName: "The BVRB3R Shop - Ybor",
        specialties: ["precision fades"],
        mostBookedService: "Signature Fade",
        badges: ["verified_license", "top_barber"],
        trustLabel: "Trusted Pro"
      }
    ];

    const decorated = decorateDiscoveryWithActivation(results, makeState(), undefined, "2026-03-10T12:00:00.000Z");

    expect(decorated[0]).toEqual(
      expect.objectContaining({
        featuredLabel: "Featured barber in Tampa Bay",
        boostedLabel: "Boosted in Tampa discovery",
        cityLabel: "Tampa Bay",
        monetizationEligible: false
      })
    );
    expect(decorated[0].bookingHref).toContain("/booking/new");
    expect(decorated[0].bookingHref).toContain("barberId=barber-wave");
  });
});

