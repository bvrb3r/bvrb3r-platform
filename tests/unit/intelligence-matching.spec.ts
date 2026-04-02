import { describe, expect, it } from "vitest";
import { getBestBarberForClient } from "@/lib/intelligence/matching";

describe("getBestBarberForClient", () => {
  it("prioritizes availability, loyalty, and rating while keeping a fallback result", () => {
    const matches = getBestBarberForClient({
      clientId: "client-jordan",
      lastServiceId: "srv-signature",
      lastBarberId: "barber-wave",
      favoriteBarber: {
        barberId: "barber-wave",
        username: "wave",
        barberName: "Wave Carter",
        rating: 4.9,
        reviewCount: 125,
        priceRange: [55, 70],
        nextAvailableAt: new Date(Date.now() + 25 * 60_000).toISOString(),
        distanceMiles: 1.2,
        specialties: ["Precision fades"],
        mostBookedServiceId: "srv-signature",
        badges: []
      },
      candidates: [
        {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          rating: 4.9,
          reviewCount: 125,
          priceRange: [55, 70],
          nextAvailableAt: new Date(Date.now() + 25 * 60_000).toISOString(),
          distanceMiles: 1.2,
          specialties: ["Precision fades"],
          mostBookedServiceId: "srv-signature",
          badges: []
        },
        {
          barberId: "barber-blaze",
          username: "blaze",
          barberName: "Blaze King",
          rating: 4.8,
          reviewCount: 98,
          priceRange: [50, 65],
          nextAvailableAt: new Date(Date.now() + 80 * 60_000).toISOString(),
          distanceMiles: 0.7,
          specialties: ["Executive cuts"],
          badges: []
        }
      ],
      nextAvailableChair: null
    });

    expect(matches[0]?.barberId).toBe("barber-wave");
    expect(matches[0]?.isAvailableNow).toBe(true);
    expect(matches).toHaveLength(2);
  });
});
