import { describe, expect, it } from "vitest";
import {
  getPublicBarberProfileByUsername,
  getServicePopularity,
  searchMarketplace
} from "@/lib/marketplace/engine";
import { buildBarberProofSignals, enrichPublicProfileWithProof, rankDiscoveryResults } from "@/lib/marketplace/insights";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import {
  approvedMarketplaceTrustState,
  realBarberConversionEvents,
  realBarberRankingInput,
  visibleMarketplaceState
} from "@/tests/unit/marketplace-fixtures";
import type { DiscoveryResult } from "@/types/domain";

describe("marketplace insights", () => {
  it("builds persisted proof signals for discovery ranking", () => {
    const state = visibleMarketplaceState();
    const trustState = approvedMarketplaceTrustState();
    const discoveryResults = searchMarketplace(state, { locationId: "loc-real" }, trustState);
    const servicePopularity = Array.from(getServicePopularity(state).entries()).map(([serviceId, metrics]) => ({ serviceId, metrics }));
    const serviceIdsByBarber = new Map<string, string[]>();

    state.services.forEach((service) => {
      if (!service.barberId) {
        return;
      }

      serviceIdsByBarber.set(service.barberId, [...(serviceIdsByBarber.get(service.barberId) ?? []), service.id]);
    });

    const proofSignals = buildBarberProofSignals({
      discoveryResults,
      rankingInputs: [realBarberRankingInput()],
      servicePopularity,
      conversionEvents: realBarberConversionEvents(),
      serviceIdsByBarber,
      trustState
    });
    const ranked = rankDiscoveryResults(discoveryResults, proofSignals);
    const realBarber = ranked.find((result) => result.username === "realbarber");

    expect(realBarber).toBeDefined();
    expect(realBarber?.followCount).toBeGreaterThan(0);
    expect(realBarber?.profileViews).toBeGreaterThan(0);
    expect(realBarber?.rankingLabel).toBeTruthy();
    expect(realBarber?.trustScore).toBeGreaterThan(0);
    expect(realBarber?.trustLabel).toBeTruthy();
    expect(realBarber?.retentionScore).toBeGreaterThanOrEqual(0);
    expect(realBarber?.activityScore).toBeGreaterThan(0);
  });

  it("enriches public profiles with proof, trust, and booking CTA data", () => {
    const state = visibleMarketplaceState();
    const trustState = approvedMarketplaceTrustState();
    const discoveryResults = searchMarketplace(state, {}, trustState);
    const servicePopularity = Array.from(getServicePopularity(state).entries()).map(([serviceId, metrics]) => ({ serviceId, metrics }));
    const serviceIdsByBarber = new Map<string, string[]>();

    state.services.forEach((service) => {
      if (!service.barberId) {
        return;
      }

      serviceIdsByBarber.set(service.barberId, [...(serviceIdsByBarber.get(service.barberId) ?? []), service.id]);
    });

    const profile = getPublicBarberProfileByUsername(state, "realbarber", trustState);
    expect(profile).not.toBeNull();

    const proofSignals = buildBarberProofSignals({
      discoveryResults,
      rankingInputs: [realBarberRankingInput()],
      servicePopularity,
      conversionEvents: realBarberConversionEvents(),
      serviceIdsByBarber,
      trustState
    });

    const enriched = enrichPublicProfileWithProof(profile!, proofSignals);

    expect(enriched.proof?.reviewCount).toBeGreaterThan(0);
    expect(enriched.proof?.bookingClicks).toBeGreaterThan(0);
    expect(enriched.proof?.trustScore).toBeGreaterThan(0);
    expect(enriched.proof?.verificationLabels.length).toBeGreaterThan(0);
    expect(enriched.bookingCtaHref).toContain("/booking/new");
    expect(enriched.bookingCtaHref).toContain("barberId=barber-real");
    expect(enriched.bookingCtaHref).toContain("source=public_profile");
  });

  it("ranks stronger barbers higher when completion, cancellation, recency, and availability all improve", () => {
    const discoveryResults: DiscoveryResult[] = [
      {
        barberId: "barber-strong",
        username: "strong",
        barberName: "Strong Barber",
        rating: 4.8,
        reviewCount: 16,
        priceRange: [45, 60] as [number, number],
        priceRangeLabel: "$45 - $60",
        nextAvailableAt: "2026-04-23T10:00:00.000Z",
        availabilityLabel: "Open today",
        distanceMiles: 1,
        specialties: ["Fades"],
        badges: ["verified_identity"]
      },
      {
        barberId: "barber-weak",
        username: "weak",
        barberName: "Weak Barber",
        rating: 4.8,
        reviewCount: 16,
        priceRange: [45, 60] as [number, number],
        priceRangeLabel: "$45 - $60",
        nextAvailableAt: "2026-04-23T10:00:00.000Z",
        availabilityLabel: "Open today",
        distanceMiles: 1,
        specialties: ["Fades"],
        badges: ["verified_identity"]
      }
    ];

    const proofSignals = buildBarberProofSignals({
      discoveryResults,
      rankingInputs: [
        realBarberRankingInput({
          barberId: "barber-strong",
          completionRate: 98,
          cancellationRate: 1,
          activityRecencyScore: 94,
          availabilityScore: 16,
          rankingScore: 132
        }),
        realBarberRankingInput({
          barberId: "barber-weak",
          completionRate: 78,
          cancellationRate: 14,
          activityRecencyScore: 28,
          availabilityScore: 6,
          rankingScore: 74
        })
      ],
      servicePopularity: [],
      conversionEvents: [],
      serviceIdsByBarber: new Map(),
      trustState: approvedMarketplaceTrustState()
    });

    const ranked = rankDiscoveryResults(discoveryResults, proofSignals);

    expect(ranked[0]?.barberId).toBe("barber-strong");
    expect(ranked[0]?.completionRate).toBe(98);
    expect(ranked[0]?.activityScore).toBeGreaterThan(ranked[1]?.activityScore ?? 0);
  });

  it("builds marketplace booking links with attribution context", () => {
    const href = buildMarketplaceBookingHref({
      barberId: "barber-blaze",
      username: "blaze",
      locationId: "loc-ybor",
      sourceKind: "haircut_now",
      matchedFrom: "favorite_shop",
      query: "executive grooming"
    });

    expect(href).toBe("/booking/new?barberId=barber-blaze&barber=blaze&locationId=loc-ybor&source=haircut_now&matchedFrom=favorite_shop&query=executive+grooming");
  });
});
