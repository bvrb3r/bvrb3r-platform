import type { DiscoveryResult, HaircutNowMatch } from "@/types/domain";

export interface BestBarberMatch extends DiscoveryResult {
  score: number;
  isAvailableNow: boolean;
  matchReason: string;
}

interface GetBestBarberForClientInput {
  clientId?: string;
  candidates: DiscoveryResult[];
  favoriteBarber?: DiscoveryResult | null;
  nextAvailableChair?: HaircutNowMatch | null;
  lastServiceId?: string;
  lastBarberId?: string;
}

function minutesUntil(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 60_000;
  if (Number.isNaN(diff)) {
    return 180;
  }

  return Math.max(diff, 0);
}

function toFallbackCandidate(match: HaircutNowMatch): DiscoveryResult {
  return {
    barberId: match.barberId,
    username: match.username,
    barberName: match.barberName,
    locationId: match.locationId,
    locationLabel: match.shopName,
    rating: match.rating,
    reviewCount: 0,
    priceRange: [match.priceFrom, match.priceFrom],
    priceRangeLabel: `$${match.priceFrom}`,
    nextAvailableAt: match.appointmentTime,
    availabilityLabel: match.matchedFrom === "available_now" ? "Available now" : "Next available",
    distanceMiles: 0,
    shopName: match.shopName,
    specialties: [],
    badges: [],
    activityScore: 0,
    retentionScore: 0
  };
}

function buildMatchReason(input: {
  isAvailableNow: boolean;
  loyaltyScore: number;
  serviceScore: number;
  distanceMiles: number;
}) {
  if (input.isAvailableNow) {
    return "Available now and ready for the fastest chair.";
  }

  if (input.loyaltyScore >= 18) {
    return "Strong rebooking fit based on your past visits.";
  }

  if (input.serviceScore >= 18) {
    return "Best match for the service pattern you book most.";
  }

  if (input.distanceMiles <= 2) {
    return "Closest high-trust barber with strong availability.";
  }

  return "High-rated local match with strong availability.";
}

export function getBestBarberForClient(input: GetBestBarberForClientInput): BestBarberMatch[] {
  const deduped = new Map<string, DiscoveryResult>();

  for (const candidate of [input.favoriteBarber ?? null, ...input.candidates]) {
    if (!candidate || deduped.has(candidate.barberId)) {
      continue;
    }

    deduped.set(candidate.barberId, candidate);
  }

  if (!deduped.size && input.nextAvailableChair) {
    const fallback = toFallbackCandidate(input.nextAvailableChair);
    deduped.set(fallback.barberId, fallback);
  }

  return Array.from(deduped.values())
    .map((candidate) => {
      const availableInMinutes = minutesUntil(candidate.nextAvailableAt);
      const isAvailableNow = availableInMinutes <= 45;
      const availabilityScore = Math.max(0, 100 - Math.min(availableInMinutes, 240) / 2.4);
      const ratingScore = Math.min(candidate.rating, 5) * 20;
      const proximityScore = Math.max(0, 100 - Math.min(candidate.distanceMiles, 20) * 8);
      const serviceScore = candidate.mostBookedServiceId && input.lastServiceId && candidate.mostBookedServiceId === input.lastServiceId ? 24 : 8;
      const loyaltyScore = candidate.barberId === input.favoriteBarber?.barberId
        ? 24
        : candidate.barberId === input.lastBarberId
          ? 18
          : Math.min(candidate.retentionScore ?? 0, 100) * 0.16;

      const score = Number((
        availabilityScore * 0.34
        + ratingScore * 0.24
        + proximityScore * 0.16
        + serviceScore * 0.14
        + loyaltyScore * 0.12
      ).toFixed(2));

      return {
        ...candidate,
        score,
        isAvailableNow,
        matchReason: buildMatchReason({
          isAvailableNow,
          loyaltyScore,
          serviceScore,
          distanceMiles: candidate.distanceMiles
        })
      } satisfies BestBarberMatch;
    })
    .sort((left, right) => right.score - left.score || left.distanceMiles - right.distanceMiles || new Date(left.nextAvailableAt).getTime() - new Date(right.nextAvailableAt).getTime())
    .slice(0, 3);
}
