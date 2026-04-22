import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/client-experience/marketplace-tracked-action-link", () => ({
  MarketplaceTrackedActionLink: ({
    children,
    href
  }: {
    children: ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>
}));

vi.mock("@/components/marketplace/public-barber-growth-actions", () => ({
  PublicBarberGrowthActions: () => <div data-testid="growth-actions">Growth actions</div>
}));

import { PublicBarberProfile } from "@/components/marketplace/public-barber-profile";

describe("public barber profile", () => {
  it("renders canonical trust, services, policies, and clean empty sections", () => {
    render(
      <PublicBarberProfile
        profile={{
          barber: {
            id: "barber-wave",
            name: "Wave Carter",
            rating: 4.9
          },
          profile: {
            username: "wave",
            headline: "Precision fades that hold their shape.",
            profilePhotoUrl: null,
            photoAccent: "#7cff00",
            specialties: ["Precision fades", "Beard detail"],
            badges: ["verified_identity"]
          },
          proof: {
            reviewScore: 4.9,
            reviewCount: 120,
            verificationLabels: ["Verified shop"],
            followCount: 18
          },
          priceRange: [55, 70],
          nextAvailableAt: "2026-04-28T14:00:00.000Z",
          shop: {
            name: "Centro Ybor Flagship"
          },
          shopLocations: [
            {
              id: "loc-ybor",
              name: "Centro Ybor Flagship",
              neighborhood: "Ybor City"
            }
          ],
          bookingCtaHref: "/booking/new?barberId=barber-wave",
          services: [
            {
              service: {
                id: "srv-signature",
                name: "Signature Precision Cut",
                description: "A premium cut.",
                durationMin: 45,
                price: 55,
                deposit: 15,
                fullPrepay: false
              }
            }
          ],
          reviews: [],
          portfolio: []
        } as any}
      />
    );

    expect(screen.getByText("Wave Carter")).toBeInTheDocument();
    expect(screen.queryByText("Verified license")).not.toBeInTheDocument();
    expect(screen.getByText("Verified identity")).toBeInTheDocument();
    expect(screen.getByText("Verified shop")).toBeInTheDocument();
    expect(screen.getByText("Service menu")).toBeInTheDocument();
    expect(screen.getByText("Signature Precision Cut")).toBeInTheDocument();
    expect(screen.getByText(/Deposits apply to select services starting at \$15/)).toBeInTheDocument();
    expect(screen.getByText("Card on file is required when the selected service policy needs it.")).toBeInTheDocument();
    expect(screen.getByText("No portfolio images yet.")).toBeInTheDocument();
    expect(screen.getByText("Reviews will appear here after completed appointments generate real client feedback.")).toBeInTheDocument();
  });

  it("renders canonical portfolio media when real assets exist", () => {
    render(
      <PublicBarberProfile
        profile={{
          barber: {
            id: "barber-wave",
            name: "Wave Carter",
            rating: 4.9
          },
          profile: {
            username: "wave",
            headline: "Precision fades that hold their shape.",
            profilePhotoUrl: null,
            photoAccent: "#7cff00",
            specialties: ["Precision fades"],
            badges: []
          },
          proof: {
            reviewScore: 4.9,
            reviewCount: 120,
            verificationLabels: []
          },
          priceRange: [55, 70],
          nextAvailableAt: "2026-04-28T14:00:00.000Z",
          shopLocations: [],
          bookingCtaHref: "/booking/new?barberId=barber-wave",
          services: [],
          reviews: [],
          portfolio: [
            {
              id: "asset-1",
              imageUrl: "https://cdn.bvrb3r.app/barbers/wave/look-1.jpg",
              caption: "Sharp taper finish."
            }
          ]
        } as any}
      />
    );

    expect(screen.getByRole("img", { name: /sharp taper finish/i })).toBeInTheDocument();
    expect(screen.queryByText("No portfolio images yet.")).not.toBeInTheDocument();
  });
});
