import { describe, expect, it } from "vitest";
import { createInitialEngagementState } from "@/lib/engagement/engine";
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

describe("marketplace insights", () => {
  it("builds persisted proof signals for discovery ranking", () => {
    const state = visibleMarketplaceState();
    const engagementState = createInitialEngagementState();
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
      engagementState,
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
    const engagementState = createInitialEngagementState();
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
      engagementState,
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
