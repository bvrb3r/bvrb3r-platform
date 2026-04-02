import { describe, expect, it } from "vitest";
import { buildClientDiscoverySections } from "@/lib/client-experience/discovery";
import type { DiscoveryResult } from "@/types/domain";

const results: DiscoveryResult[] = [
  {
    barberId: "barber-blaze",
    username: "blaze",
    barberName: "Blaze King",
    rating: 5,
    reviewCount: 98,
    priceRange: [55, 78],
    nextAvailableAt: "2026-03-24T11:15:00-04:00",
    distanceMiles: 1.2,
    shopName: "Centro Ybor",
    specialties: ["executive grooming"],
    mostBookedService: "Signature Precision Cut",
    badges: []
  },
  {
    barberId: "barber-wave",
    username: "wave",
    barberName: "Wave Carter",
    rating: 4.9,
    reviewCount: 180,
    priceRange: [55, 78],
    nextAvailableAt: "2026-03-24T10:30:00-04:00",
    distanceMiles: 2.4,
    shopName: "Centro Ybor",
    specialties: ["precision fades"],
    mostBookedService: "Premium Cut + Beard Sculpt",
    badges: ["top_barber"]
  },
  {
    barberId: "barber-fade",
    username: "fade",
    barberName: "Fade Monroe",
    rating: 4.8,
    reviewCount: 126,
    priceRange: [32, 52],
    nextAvailableAt: "2026-03-24T14:00:00-04:00",
    distanceMiles: 4.8,
    shopName: "Hyde Park Studio",
    specialties: ["kids cuts"],
    mostBookedService: "Texture + Design Session",
    badges: []
  }
];

describe("client discovery feed helpers", () => {
  it("builds deterministic marketplace sections from ranked results", () => {
    const sections = buildClientDiscoverySections(results);

    expect(sections.map((section) => section.id)).toEqual([
      "top-matches",
      "available-soon",
      "top-rated",
      "nearby"
    ]);
    expect(sections[0]?.items[0]?.barberId).toBe("barber-blaze");
    expect(sections[1]?.items[0]?.barberId).toBe("barber-wave");
    expect(sections[2]?.items[0]?.barberId).toBe("barber-blaze");
    expect(sections[3]?.items[0]?.barberId).toBe("barber-blaze");
  });
});
