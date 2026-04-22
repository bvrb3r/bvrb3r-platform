import type {
  BarberRankingInput,
  DiscoveryResult,
  MarketplaceConversionEvent,
  PersistedServicePopularityRow,
  ServicePopularityMetrics
} from "@/types/domain";
import type { TrustState } from "@/types/trust";
import type { PublicBarberProfileView } from "@/lib/marketplace/engine";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { buildPublicTrustSignal } from "@/lib/trust/engine";

interface BarberProofSignal {
  followCount: number;
  reputationScore: number;
  reputationTier?: string;
  rankingLabel?: string;
  rankingScore: number;
  profileViews: number;
  bookingClicks: number;
  bookingsCreated: number;
  bookingsCompleted: number;
  discoveryImpressions: number;
  servicePopularityScore: number;
  reviewScore: number;
  retentionScore: number;
  activityScore: number;
  conversionRate: number;
  trustScore: number;
  completionRate: number;
  cancellationRate: number;
  activityRecencyScore: number;
  trustLabel?: string;
  reviewIntegrityLabel?: string;
  verificationLabels: string[];
}

const round = (value: number) => Math.round(value * 100) / 100;

function sumServicePopularity(servicePopularity: PersistedServicePopularityRow[], serviceIds: string[]) {
  const set = new Set(serviceIds);
  const rows = servicePopularity.filter((row) => set.has(row.serviceId));
  if (!rows.length) {
    return 0;
  }

  const score = rows.reduce(
    (sum, row) =>
      sum
      + Math.max(0, 100 - row.metrics.popularityRank * 6)
      + row.metrics.bookingCount * 1.8
      + row.metrics.repeatRate * 0.6,
    0
  );

  return round(score / rows.length);
}

function countEvents(
  events: MarketplaceConversionEvent[],
  barberId: string,
  eventType: MarketplaceConversionEvent["eventType"]
) {
  return events.filter(
    (event) => event.barberId === barberId && event.eventType === eventType
  ).length;
}

function normalizeReviewScore(value: number | undefined, fallback: number) {
  if (value === undefined) {
    return fallback;
  }

  return value > 5 ? round(value / 20) : round(value);
}

function deriveReputationTier({
  rankingScore,
  reviewScore,
  reviewCount,
  completionRate,
  activityRecencyScore
}: {
  rankingScore: number;
  reviewScore: number;
  reviewCount: number;
  completionRate: number;
  activityRecencyScore: number;
}) {
  if (reviewScore >= 4.8 && reviewCount >= 8 && completionRate >= 92) {
    return "Trusted";
  }

  if (rankingScore >= 140 || (reviewScore >= 4.6 && reviewCount >= 3 && activityRecencyScore >= 30)) {
    return "Rising";
  }

  return undefined;
}

export function buildBarberProofSignals(args: {
  discoveryResults: DiscoveryResult[];
  rankingInputs: BarberRankingInput[];
  servicePopularity: PersistedServicePopularityRow[];
  conversionEvents: MarketplaceConversionEvent[];
  serviceIdsByBarber: Map<string, string[]>;
  trustState?: TrustState;
}) {
  const rankingMap = new Map(args.rankingInputs.map((row) => [row.barberId, row]));

  return new Map(
    args.discoveryResults.map((result) => {
      const ranking = rankingMap.get(result.barberId);
      const servicePopularityScore =
        ranking?.servicePopularityScore
        ?? sumServicePopularity(
          args.servicePopularity,
          args.serviceIdsByBarber.get(result.barberId) ?? []
        );
      const bookingClicks = countEvents(
        args.conversionEvents,
        result.barberId,
        "booking_cta_clicked"
      );
      const bookingsCreated = countEvents(
        args.conversionEvents,
        result.barberId,
        "booking_created"
      );
      const bookingsCompleted = countEvents(
        args.conversionEvents,
        result.barberId,
        "booking_completed"
      );
      const discoveryImpressions = countEvents(
        args.conversionEvents,
        result.barberId,
        "discovery_impression"
      );
      const profileViews = countEvents(
        args.conversionEvents,
        result.barberId,
        "profile_view"
      );
      const publicTrust = args.trustState
        ? buildPublicTrustSignal(args.trustState, result.barberId)
        : undefined;
      const completionRate =
        ranking?.completionRate
        ?? (bookingsCreated ? round((bookingsCompleted / bookingsCreated) * 100) : 0);
      const cancellationRate =
        ranking?.cancellationRate
        ?? Math.max(0, round(100 - completionRate));
      const activityRecencyScore = round(ranking?.activityRecencyScore ?? 0);
      const retentionScore = round(
        (ranking?.rebookingScore ?? ranking?.retentionScore ?? 0)
        + completionRate * 0.18
      );
      const activityScore = round(
        activityRecencyScore
        + bookingsCreated * 4
        + bookingsCompleted * 6
        + discoveryImpressions * 0.2
        + bookingClicks * 0.8
        + (ranking?.availabilityScore ?? 0)
        + servicePopularityScore * 0.35
      );
      const rankingScore = round(
        (ranking?.rankingScore ?? 0)
        + completionRate * 0.32
        - cancellationRate * 0.26
        + activityRecencyScore * 0.28
        + (publicTrust?.trustScore ?? 0) * 0.18
      );
      const reviewScore = normalizeReviewScore(
        ranking?.averageRatingScore,
        result.rating
      );
      const proof: BarberProofSignal = {
        followCount: ranking?.followCount ?? 0,
        reputationScore: round(
          ranking?.reputationScore
          ?? Math.max(
            0,
            Math.min(
              100,
              reviewScore * 16
              + completionRate * 0.42
              - cancellationRate * 0.35
              + Math.min(result.reviewCount, 50) * 0.35
            )
          )
        ),
        reputationTier: deriveReputationTier({
          rankingScore,
          reviewScore,
          reviewCount: result.reviewCount,
          completionRate,
          activityRecencyScore
        }),
        rankingLabel: ranking?.label ?? result.rankingLabel,
        rankingScore,
        profileViews,
        bookingClicks,
        bookingsCreated,
        bookingsCompleted,
        discoveryImpressions,
        servicePopularityScore,
        reviewScore,
        retentionScore,
        activityScore,
        conversionRate: bookingClicks
          ? round((bookingsCreated / bookingClicks) * 100)
          : 0,
        trustScore: publicTrust?.trustScore ?? 0,
        completionRate,
        cancellationRate,
        activityRecencyScore,
        trustLabel: publicTrust?.trustLabel,
        reviewIntegrityLabel:
          publicTrust?.reviewIntegrityLabel
          ?? (result.reviewCount
            ? "Completed-appointment reviews"
            : undefined),
        verificationLabels: publicTrust?.publicBadgeLabels ?? []
      };

      return [result.barberId, proof] as const;
    })
  );
}

export function rankDiscoveryResults(
  results: DiscoveryResult[],
  proofSignals: Map<string, BarberProofSignal>
) {
  return results
    .map((result) => {
      const proof = proofSignals.get(result.barberId);
      const distanceSignal = Math.max(0, 8 - result.distanceMiles * 1.6);
      const sortKey =
        (proof?.rankingScore ?? 0)
        + (proof?.completionRate ?? 0) * 0.35
        - (proof?.cancellationRate ?? 0) * 0.25
        + (proof?.activityRecencyScore ?? 0) * 0.4
        + distanceSignal;

      return {
        result: {
          ...result,
          followCount: proof?.followCount ?? 0,
          reputationScore: proof?.reputationScore ?? 0,
          reputationTier: proof?.reputationTier,
          rankingLabel: proof?.rankingLabel ?? result.rankingLabel,
          profileViews: proof?.profileViews ?? 0,
          retentionScore: proof?.retentionScore ?? 0,
          activityScore: proof?.activityScore ?? 0,
          conversionRate: proof?.conversionRate ?? 0,
          trustScore: proof?.trustScore ?? 0,
          completionRate: proof?.completionRate ?? 0,
          trustLabel: proof?.trustLabel,
          reviewIntegrityLabel: proof?.reviewIntegrityLabel
        },
        sortKey
      };
    })
    .sort(
      (left, right) =>
        right.sortKey - left.sortKey
        || right.result.rating - left.result.rating
        || right.result.reviewCount - left.result.reviewCount
        || new Date(left.result.nextAvailableAt).getTime()
          - new Date(right.result.nextAvailableAt).getTime()
    )
    .map(({ result }) => result);
}

export function enrichPublicProfileWithProof(
  profile: PublicBarberProfileView,
  proofSignals: Map<string, BarberProofSignal>
) {
  const proof = proofSignals.get(profile.barber.id);

  return {
    ...profile,
    bookingCtaHref: buildMarketplaceBookingHref({
      barberId: profile.barber.id,
      username: profile.profile.username,
      locationId: profile.shopLocations[0]?.id,
      sourceKind: "public_profile"
    }),
    proof: {
      reviewScore: normalizeReviewScore(
        proof?.reviewScore,
        profile.barber.rating
      ),
      reviewCount: profile.reviews.length || profile.barber.reviewCount,
      followCount: proof?.followCount ?? 0,
      reputationScore: round(proof?.reputationScore ?? 0),
      reputationTier: proof?.reputationTier,
      rankingLabel: proof?.rankingLabel,
      profileViews: proof?.profileViews ?? 0,
      bookingClicks: proof?.bookingClicks ?? 0,
      bookingsCreated: proof?.bookingsCreated ?? 0,
      bookingsCompleted: proof?.bookingsCompleted ?? 0,
      conversionRate: proof?.conversionRate ?? 0,
      trustScore: proof?.trustScore ?? 0,
      completionRate: proof?.completionRate ?? 0,
      trustLabel: proof?.trustLabel,
      reviewIntegrityLabel: proof?.reviewIntegrityLabel,
      verificationLabels: proof?.verificationLabels ?? []
    }
  };
}

export function replaceServicePopularity<
  T extends { service: { id: string }; popularity: ServicePopularityMetrics }
>(rows: T[], servicePopularity: PersistedServicePopularityRow[]) {
  const map = new Map(
    servicePopularity.map((row) => [row.serviceId, row.metrics])
  );

  return rows.map((row) => ({
    ...row,
    popularity: map.get(row.service.id) ?? row.popularity
  }));
}
