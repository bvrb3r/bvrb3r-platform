import type { EngagementState } from "@/types/engagement";
import type { BarberRankingInput, DiscoveryResult, MarketplaceConversionEvent, PersistedServicePopularityRow, ServicePopularityMetrics } from "@/types/domain";
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
  trustLabel?: string;
  reviewIntegrityLabel?: string;
  verificationLabels: string[];
}
const round = (value: number) => Math.round(value * 100) / 100;
function sumServicePopularity(servicePopularity: PersistedServicePopularityRow[], serviceIds: string[]) { const set = new Set(serviceIds); const rows = servicePopularity.filter((row) => set.has(row.serviceId)); if (!rows.length) return 0; const score = rows.reduce((sum, row) => sum + Math.max(0, 100 - row.metrics.popularityRank * 6) + row.metrics.bookingCount * 1.8 + row.metrics.repeatRate * 0.6, 0); return round(score / rows.length); }
const countEvents = (events: MarketplaceConversionEvent[], barberId: string, eventType: MarketplaceConversionEvent["eventType"]) => events.filter((event) => event.barberId === barberId && event.eventType === eventType).length;
const normalizeReviewScore = (value: number | undefined, fallback: number) => value === undefined ? fallback : value > 5 ? round(value / 20) : round(value);

export function buildBarberProofSignals(args: { discoveryResults: DiscoveryResult[]; engagementState: EngagementState; rankingInputs: BarberRankingInput[]; servicePopularity: PersistedServicePopularityRow[]; conversionEvents: MarketplaceConversionEvent[]; serviceIdsByBarber: Map<string, string[]>; trustState?: TrustState; }) {
  const rankingMap = new Map(args.rankingInputs.map((row) => [row.barberId, row]));
  const reputationMap = new Map(args.engagementState.reputationScores.map((row) => [row.barberId, row]));
  const rankingSnapshotMap = new Map<string, string>();
  args.engagementState.rankingSnapshots.slice().sort((left, right) => left.rankPosition - right.rankPosition || left.label.localeCompare(right.label)).forEach((snapshot) => { if (!rankingSnapshotMap.has(snapshot.barberId)) rankingSnapshotMap.set(snapshot.barberId, snapshot.label); });
  const followCounts = new Map<string, number>();
  args.engagementState.barberFollows.forEach((follow) => followCounts.set(follow.barberId, (followCounts.get(follow.barberId) ?? 0) + 1));
  return new Map(args.discoveryResults.map((result) => {
    const ranking = rankingMap.get(result.barberId); const reputation = reputationMap.get(result.barberId);
    const servicePopularityScore = ranking?.servicePopularityScore ?? sumServicePopularity(args.servicePopularity, args.serviceIdsByBarber.get(result.barberId) ?? []);
    const bookingClicks = countEvents(args.conversionEvents, result.barberId, "booking_cta_clicked"); const bookingsCreated = countEvents(args.conversionEvents, result.barberId, "booking_created");
    const publicTrust = args.trustState ? buildPublicTrustSignal(args.trustState, result.barberId) : undefined;
    const bookingsCompleted = countEvents(args.conversionEvents, result.barberId, "booking_completed");
    const discoveryImpressions = countEvents(args.conversionEvents, result.barberId, "discovery_impression");
    const retentionScore = round((ranking?.retentionScore ?? 0) + servicePopularityScore * 0.35 + bookingsCompleted * 1.8);
    const activityScore = round(
      bookingsCreated * 4
      + bookingsCompleted * 6
      + discoveryImpressions * 0.2
      + bookingClicks * 0.8
      + (ranking?.availabilityScore ?? 0)
      + servicePopularityScore * 0.45
    );
    const proof: BarberProofSignal = {
      followCount: ranking?.followCount ?? followCounts.get(result.barberId) ?? 0,
      reputationScore: ranking?.reputationScore ?? reputation?.overallScore ?? 0,
      reputationTier: reputation?.tier,
      rankingLabel: ranking?.label ?? rankingSnapshotMap.get(result.barberId),
      rankingScore: (ranking?.rankingScore ?? 0) + ((publicTrust?.trustScore ?? 0) * 0.35) + ((publicTrust?.completionRate ?? 0) * 0.12),
      profileViews: countEvents(args.conversionEvents, result.barberId, "profile_view"),
      bookingClicks,
      bookingsCreated,
      bookingsCompleted,
      discoveryImpressions,
      servicePopularityScore,
      reviewScore: normalizeReviewScore(reputation?.reviewScore, result.rating),
      retentionScore,
      activityScore,
      conversionRate: bookingClicks ? round((bookingsCreated / bookingClicks) * 100) : 0,
      trustScore: publicTrust?.trustScore ?? 0,
      completionRate: publicTrust?.completionRate ?? 0,
      trustLabel: publicTrust?.trustLabel,
      reviewIntegrityLabel: publicTrust?.reviewIntegrityLabel,
      verificationLabels: publicTrust?.publicBadgeLabels ?? []
    };
    return [result.barberId, proof] as const;
  }));
}

export function rankDiscoveryResults(results: DiscoveryResult[], proofSignals: Map<string, BarberProofSignal>) {
  return results
    .map((result) => {
      const proof = proofSignals.get(result.barberId);
      const reviewSignal = (proof?.reviewScore ?? result.rating) * 6 + result.reviewCount * 0.14;
      const retentionSignal = (proof?.retentionScore ?? 0) * 0.55;
      const activitySignal = (proof?.activityScore ?? 0) * 0.35;
      const distanceSignal = Math.max(0, 8 - result.distanceMiles * 1.6);
      const sortKey = (proof?.rankingScore ?? 0) + reviewSignal + retentionSignal + activitySignal + distanceSignal;

      return {
        result: {
          ...result,
          followCount: proof?.followCount ?? 0,
          reputationScore: proof?.reputationScore ?? 0,
          reputationTier: proof?.reputationTier,
          rankingLabel: proof?.rankingLabel,
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
    .sort((left, right) => right.sortKey - left.sortKey || right.result.rating - left.result.rating)
    .map(({ result }) => result);
}

export function enrichPublicProfileWithProof(profile: PublicBarberProfileView, proofSignals: Map<string, BarberProofSignal>) {
  const proof = proofSignals.get(profile.barber.id);
  return { ...profile, bookingCtaHref: buildMarketplaceBookingHref({ barberId: profile.barber.id, username: profile.profile.username, locationId: profile.shopLocations[0]?.id, sourceKind: "public_profile" }), proof: { reviewScore: normalizeReviewScore(proof?.reviewScore, profile.barber.rating), reviewCount: profile.reviews.length || profile.barber.reviewCount, followCount: proof?.followCount ?? 0, reputationScore: round(proof?.reputationScore ?? 0), reputationTier: proof?.reputationTier, rankingLabel: proof?.rankingLabel, profileViews: proof?.profileViews ?? 0, bookingClicks: proof?.bookingClicks ?? 0, bookingsCreated: proof?.bookingsCreated ?? 0, bookingsCompleted: proof?.bookingsCompleted ?? 0, conversionRate: proof?.conversionRate ?? 0, trustScore: proof?.trustScore ?? 0, completionRate: proof?.completionRate ?? 0, trustLabel: proof?.trustLabel, reviewIntegrityLabel: proof?.reviewIntegrityLabel, verificationLabels: proof?.verificationLabels ?? [] } };
}

export function replaceServicePopularity<T extends { service: { id: string }; popularity: ServicePopularityMetrics }>(rows: T[], servicePopularity: PersistedServicePopularityRow[]) { const map = new Map(servicePopularity.map((row) => [row.serviceId, row.metrics])); return rows.map((row) => ({ ...row, popularity: map.get(row.service.id) ?? row.popularity })); }
