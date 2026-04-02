import type { DiscoveryResult } from "@/types/domain";

export interface ClientDiscoverySection {
  id: string;
  title: string;
  description: string;
  badge: string;
  items: DiscoveryResult[];
}

function sortByAvailability(left: DiscoveryResult, right: DiscoveryResult) {
  return new Date(left.nextAvailableAt).getTime() - new Date(right.nextAvailableAt).getTime()
    || right.rating - left.rating
    || left.distanceMiles - right.distanceMiles;
}

function sortByRating(left: DiscoveryResult, right: DiscoveryResult) {
  return right.rating - left.rating
    || right.reviewCount - left.reviewCount
    || new Date(left.nextAvailableAt).getTime() - new Date(right.nextAvailableAt).getTime();
}

function sortByNearby(left: DiscoveryResult, right: DiscoveryResult) {
  return left.distanceMiles - right.distanceMiles
    || right.rating - left.rating
    || new Date(left.nextAvailableAt).getTime() - new Date(right.nextAvailableAt).getTime();
}

export function buildClientDiscoverySections(results: DiscoveryResult[]) {
  const matches = results.slice(0, 6);
  const availableSoon = [...results].sort(sortByAvailability).slice(0, 4);
  const topRated = [...results].sort(sortByRating).slice(0, 4);
  const nearby = [...results].sort(sortByNearby).slice(0, 4);

  const sections: ClientDiscoverySection[] = [
    {
      id: "top-matches",
      title: "Top matches",
      description: "The strongest ranked chairs for booking right now.",
      badge: `${matches.length} ranked`,
      items: matches
    },
    {
      id: "available-soon",
      title: "Available soon",
      description: "The fastest credible chairs if you want to move now.",
      badge: "Fastest openings",
      items: availableSoon
    },
    {
      id: "top-rated",
      title: "Top rated",
      description: "Review-backed barbers with strong trust and booking proof.",
      badge: "Review trust",
      items: topRated
    },
    {
      id: "nearby",
      title: "Nearby barbers",
      description: "Closest strong options around your preferred area.",
      badge: "Close to you",
      items: nearby
    }
  ];

  return sections.filter((section) => section.items.length > 0);
}
