import type { PublicBarberProfileView } from "@/lib/marketplace/engine";
import { buildPublicTrustSignal, getVerificationGateDecision } from "@/lib/trust/engine";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import type {
  BarberActivationSummary,
  BoostCampaignRecord,
  CityRolloutRecord,
  FeaturedPlacementRecord,
  MarketplaceMonetizationEvent,
  MonetizationEligibility,
  NotificationDeliveryRecord,
  OwnerMarketplaceActivationSummary,
  VerificationUploadRecord
} from "@/types/activation";
import type { DiscoveryResult, MapDiscoveryMarker } from "@/types/domain";
import type { PublicTrustSignal, TrustState } from "@/types/trust";

export interface MarketplaceActivationState {
  verificationUploads: VerificationUploadRecord[];
  boostCampaigns: BoostCampaignRecord[];
  featuredPlacements: FeaturedPlacementRecord[];
  cityRollouts: CityRolloutRecord[];
  monetizationEvents: MarketplaceMonetizationEvent[];
}

export function createEmptyMarketplaceActivationState(): MarketplaceActivationState {
  return {
    verificationUploads: [],
    boostCampaigns: [],
    featuredPlacements: [],
    cityRollouts: [],
    monetizationEvents: []
  };
}

function isBetween(nowIso: string, startsAt: string, endsAt: string) {
  return nowIso >= startsAt && nowIso <= endsAt;
}

function getScopeCityRollout(cityRollouts: CityRolloutRecord[], citySlug?: string) {
  return citySlug ? cityRollouts.find((rollout) => rollout.citySlug === citySlug) : undefined;
}

function countByChannel(deliveries: NotificationDeliveryRecord[]) {
  return deliveries.reduce<Array<{ channel: NotificationDeliveryRecord["channel"]; count: number }>>((rows, delivery) => {
    const existing = rows.find((row) => row.channel === delivery.channel);
    if (existing) {
      existing.count += 1;
      return rows;
    }

    return [...rows, { channel: delivery.channel, count: 1 }];
  }, []);
}

export function getMonetizationEligibility(trustSignal?: PublicTrustSignal): MonetizationEligibility {
  const trustScore = trustSignal?.trustScore ?? 0;
  const discoveryGate = trustSignal?.verificationDecision
    ? getVerificationGateDecision(trustSignal.verificationDecision, "discovery")
    : { gate: "discovery" as const, allowed: true, codes: [], reasons: [], degraded: true };
  const badgeGate = trustSignal?.verificationDecision
    ? getVerificationGateDecision(trustSignal.verificationDecision, "badge")
    : { gate: "badge" as const, allowed: true, codes: [], reasons: [], degraded: true };
  const verifiedEnough = discoveryGate.allowed && badgeGate.allowed && Boolean(trustSignal?.verifiedBarber && trustSignal.verifiedLicense);
  const minimumTrustScoreMet = trustScore >= 84;
  const clearModeration = trustSignal?.moderationState !== "watch";
  const canBoostVisibility = minimumTrustScoreMet && verifiedEnough && clearModeration;
  const canUseFeaturedPlacement = trustScore >= 90 && verifiedEnough && (trustSignal?.completionRate ?? 0) >= 90 && clearModeration;
  const requiresVerification = !verifiedEnough;
  const reason = canUseFeaturedPlacement
    ? "Eligible for boost and featured placement because trust, verification, and reliability are all in a premium range."
    : canBoostVisibility
      ? "Eligible for boosted discovery. Featured placement unlocks after a slightly stronger trust and completion profile."
      : requiresVerification
        ? discoveryGate.reasons[0] ?? badgeGate.reasons[0] ?? "Complete identity and license verification before premium visibility is unlocked."
        : "Raise trust and completion reliability before premium placement can activate.";

  return {
    canBoostVisibility,
    canUseFeaturedPlacement,
    minimumTrustScoreMet,
    requiresVerification,
    reason
  };
}

export function getActiveBoostCampaigns(state: MarketplaceActivationState, scopeId?: string, nowIso = new Date().toISOString()) {
  return state.boostCampaigns.filter((campaign) => campaign.status === "active" && isBetween(nowIso, campaign.startsAt, campaign.endsAt) && (!scopeId || campaign.scopeId === scopeId));
}

export function getActiveFeaturedPlacements(state: MarketplaceActivationState, scopeId?: string, nowIso = new Date().toISOString()) {
  return state.featuredPlacements.filter((placement) => placement.status === "active" && isBetween(nowIso, placement.startsAt, placement.endsAt) && (!scopeId || placement.scopeId === scopeId));
}

function getResultCitySlug(result: DiscoveryResult) {
  return result.cityLabel?.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function decorateDiscoveryWithActivation(results: DiscoveryResult[], state: MarketplaceActivationState, trustState?: TrustState, nowIso = new Date().toISOString()) {
  return results
    .map((result) => {
      const trustSignal = trustState ? buildPublicTrustSignal(trustState, result.barberId, undefined) : undefined;
      const eligibility = getMonetizationEligibility(trustSignal);
      const activeBoost = getActiveBoostCampaigns(state, result.barberId, nowIso)[0];
      const activePlacement = getActiveFeaturedPlacements(state, result.barberId, nowIso)[0];
      const cityRollout = getScopeCityRollout(state.cityRollouts, activeBoost?.citySlug ?? activePlacement?.citySlug ?? getResultCitySlug(result));

      return {
        ...result,
        featuredLabel: activePlacement?.label,
        boostedLabel: activeBoost?.placementLabel,
        cityLabel: cityRollout?.cityLabel,
        monetizationEligible: eligibility.canBoostVisibility,
        bookingHref: buildMarketplaceBookingHref({
          barberId: result.barberId,
          username: result.username,
          sourceKind: "discovery",
          query: result.mostBookedService ?? result.barberName
        })
      };
    })
    .sort((left, right) => {
      const leftBoost = left.featuredLabel ? 28 : left.boostedLabel ? 16 : 0;
      const rightBoost = right.featuredLabel ? 28 : right.boostedLabel ? 16 : 0;
      return rightBoost - leftBoost;
    });
}

export function decorateMapMarkers(markers: MapDiscoveryMarker[], results: DiscoveryResult[]) {
  return markers.map((marker) => {
    const result = results.find((entry) => entry.barberId === marker.barberId || entry.barberName === marker.label);
    return {
      ...marker,
      username: result?.username,
      barberId: result?.barberId,
      distanceMiles: result?.distanceMiles,
      trustLabel: result?.trustLabel,
      featuredLabel: result?.featuredLabel,
      cityLabel: result?.cityLabel,
      bookingHref: result?.bookingHref
    };
  });
}

export function getMonetizationAttribution(state: MarketplaceActivationState, barberId?: string, nowIso = new Date().toISOString()) {
  if (!barberId) {
    return { campaignId: undefined, placementId: undefined, citySlug: undefined };
  }

  const campaign = getActiveBoostCampaigns(state, barberId, nowIso)[0];
  const placement = getActiveFeaturedPlacements(state, barberId, nowIso)[0];
  return {
    campaignId: campaign?.id,
    placementId: placement?.id,
    citySlug: campaign?.citySlug ?? placement?.citySlug
  };
}

export function buildBarberActivationSummary(args: {
  activationState: MarketplaceActivationState;
  deliveries: NotificationDeliveryRecord[];
  trustState?: TrustState;
  barberId: string;
  shopId?: string;
  nowIso?: string;
}): BarberActivationSummary {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const trustSignal = args.trustState ? buildPublicTrustSignal(args.trustState, args.barberId, args.shopId) : undefined;
  const scopedDeliveries = args.deliveries.filter((delivery) => delivery.destination.includes(args.barberId));

  return {
    verificationUploads: args.activationState.verificationUploads.filter((upload) => upload.ownerType === "barber" && upload.ownerId === args.barberId),
    monetizationEligibility: getMonetizationEligibility(trustSignal),
    activeBoosts: getActiveBoostCampaigns(args.activationState, args.barberId, nowIso),
    activePlacements: getActiveFeaturedPlacements(args.activationState, args.barberId, nowIso),
    deliverySummary: {
      delivered: scopedDeliveries.filter((delivery) => delivery.status === "delivered").length,
      queued: scopedDeliveries.filter((delivery) => delivery.status === "queued").length,
      placeholder: scopedDeliveries.filter((delivery) => delivery.status === "placeholder").length,
      channels: countByChannel(scopedDeliveries)
    }
  };
}

export function buildOwnerMarketplaceActivationSummary(args: {
  activationState: MarketplaceActivationState;
  deliveries: NotificationDeliveryRecord[];
}): OwnerMarketplaceActivationSummary {
  const monetizationTotals = args.activationState.monetizationEvents.reduce(
    (totals, event) => {
      if (event.eventType === "boost_impression") totals.boostImpressions += 1;
      if (event.eventType === "boost_click") totals.boostClicks += 1;
      if (event.eventType === "boost_booking") totals.boostBookings += 1;
      if (event.eventType === "featured_impression") totals.featuredImpressions += 1;
      if (event.eventType === "featured_click") totals.featuredClicks += 1;
      if (event.eventType === "featured_booking") totals.featuredBookings += 1;
      return totals;
    },
    {
      boostImpressions: 0,
      boostClicks: 0,
      boostBookings: 0,
      featuredImpressions: 0,
      featuredClicks: 0,
      featuredBookings: 0
    }
  );

  return {
    boostCampaigns: args.activationState.boostCampaigns,
    featuredPlacements: args.activationState.featuredPlacements,
    cityRollouts: args.activationState.cityRollouts,
    monetizationTotals,
    topMarkets: [...args.activationState.cityRollouts]
      .sort((left, right) => right.densityScore - left.densityScore)
      .slice(0, 4)
      .map((rollout) => ({
        citySlug: rollout.citySlug,
        cityLabel: rollout.cityLabel,
        densityScore: rollout.densityScore,
        activationState: rollout.activationState
      })),
    deliverySummary: {
      delivered: args.deliveries.filter((delivery) => delivery.status === "delivered").length,
      queued: args.deliveries.filter((delivery) => delivery.status === "queued").length,
      placeholder: args.deliveries.filter((delivery) => delivery.status === "placeholder").length
    }
  };
}

export function decoratePublicProfileWithActivation(profile: PublicBarberProfileView, state: MarketplaceActivationState, nowIso = new Date().toISOString()): PublicBarberProfileView {
  const activeBoost = getActiveBoostCampaigns(state, profile.barber.id, nowIso)[0];
  const activePlacement = getActiveFeaturedPlacements(state, profile.barber.id, nowIso)[0];
  const citySlug = activeBoost?.citySlug ?? activePlacement?.citySlug;
  const cityRollout = getScopeCityRollout(state.cityRollouts, citySlug);

  return {
    ...profile,
    proof: {
      ...(profile.proof ?? {
        reviewScore: 0,
        reviewCount: 0,
        followCount: 0,
        reputationScore: 0,
        profileViews: 0,
        bookingClicks: 0,
        bookingsCreated: 0,
        bookingsCompleted: 0,
        conversionRate: 0,
        trustScore: 0,
        completionRate: 0,
        verificationLabels: []
      }),
      boostedLabel: activeBoost?.placementLabel,
      featuredLabel: activePlacement?.label,
      cityLabel: cityRollout?.cityLabel,
      activeBoostCount: getActiveBoostCampaigns(state, profile.barber.id, nowIso).length,
      activePlacementCount: getActiveFeaturedPlacements(state, profile.barber.id, nowIso).length
    }
  };
}

export function buildMonetizationAnalytics(state: MarketplaceActivationState) {
  const byCity = state.cityRollouts.map((rollout) => {
    const events = state.monetizationEvents.filter((event) => event.citySlug === rollout.citySlug);
    return {
      citySlug: rollout.citySlug,
      cityLabel: rollout.cityLabel,
      activationState: rollout.activationState,
      densityScore: rollout.densityScore,
      boostImpressions: events.filter((event) => event.eventType === "boost_impression").length,
      featuredBookings: events.filter((event) => event.eventType === "featured_booking").length
    };
  });

  return {
    byCity,
    trustAwareRules: [
      "Verified barbers with strong trust scores can unlock boosted discovery.",
      "Featured placement requires premium trust and completion reliability.",
      "Safety-watch profiles are excluded from paid visibility until trust health recovers."
    ]
  };
}




