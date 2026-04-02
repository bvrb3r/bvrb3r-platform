import { describe, expect, it } from "vitest";
import { demoMarketplaceConversionEvents } from "@/lib/data/marketplace-analytics";
import { createInitialEngagementState } from "@/lib/engagement/engine";
import {
  createInitialMarketplaceState,
  getPublicBarberProfileByUsername,
  getServicePopularity,
  searchMarketplace
} from "@/lib/marketplace/engine";
import { buildBarberProofSignals, enrichPublicProfileWithProof, rankDiscoveryResults } from "@/lib/marketplace/insights";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { createInitialTrustState } from "@/lib/trust/engine";

describe("marketplace insights", () => {
  it("builds persisted proof signals for discovery ranking", () => {
    const state = createInitialMarketplaceState();
    const engagementState = createInitialEngagementState();
    const trustState = createInitialTrustState();
    const discoveryResults = searchMarketplace(state, { locationId: "loc-ybor" });
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
      rankingInputs: [],
      servicePopularity,
      conversionEvents: demoMarketplaceConversionEvents,
      serviceIdsByBarber,
      trustState
    });
    const ranked = rankDiscoveryResults(discoveryResults, proofSignals);
    const wave = ranked.find((result) => result.username === "wave");

    expect(wave).toBeDefined();
    expect(wave?.followCount).toBeGreaterThan(0);
    expect(wave?.profileViews).toBeGreaterThan(0);
    expect(wave?.rankingLabel).toBeTruthy();
    expect(wave?.trustScore).toBeGreaterThan(0);
    expect(wave?.trustLabel).toBeTruthy();
    expect(wave?.retentionScore).toBeGreaterThanOrEqual(0);
    expect(wave?.activityScore).toBeGreaterThan(0);
  });

  it("enriches public profiles with proof, trust, and booking CTA data", () => {
    const state = createInitialMarketplaceState();
    const engagementState = createInitialEngagementState();
    const trustState = createInitialTrustState();
    const discoveryResults = searchMarketplace(state, {});
    const servicePopularity = Array.from(getServicePopularity(state).entries()).map(([serviceId, metrics]) => ({ serviceId, metrics }));
    const serviceIdsByBarber = new Map<string, string[]>();

    state.services.forEach((service) => {
      if (!service.barberId) {
        return;
      }

      serviceIdsByBarber.set(service.barberId, [...(serviceIdsByBarber.get(service.barberId) ?? []), service.id]);
    });

    const profile = getPublicBarberProfileByUsername(state, "wave");
    expect(profile).not.toBeNull();

    const proofSignals = buildBarberProofSignals({
      discoveryResults,
      engagementState,
      rankingInputs: [],
      servicePopularity,
      conversionEvents: demoMarketplaceConversionEvents,
      serviceIdsByBarber,
      trustState
    });

    const enriched = enrichPublicProfileWithProof(profile!, proofSignals);

    expect(enriched.proof?.reviewCount).toBeGreaterThan(0);
    expect(enriched.proof?.bookingClicks).toBeGreaterThan(0);
    expect(enriched.proof?.trustScore).toBeGreaterThan(0);
    expect(enriched.proof?.verificationLabels.length).toBeGreaterThan(0);
    expect(enriched.bookingCtaHref).toContain("/booking/new");
    expect(enriched.bookingCtaHref).toContain("barberId=barber-wave");
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
