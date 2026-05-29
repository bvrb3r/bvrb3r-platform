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

vi.mock("@/components/marketplace/public-shop-favorite-action", () => ({
  PublicShopFavoriteAction: () => <button type="button">Favorite shop</button>
}));

import { PublicShopProfile } from "@/components/marketplace/public-shop-profile";
import type { PublicShopProfilePayload } from "@/lib/booking/platform-service";

describe("public shop profile", () => {
  it("renders shop hero and bookable barber roster", () => {
    render(
      <PublicShopProfile
        viewerCanFavorite
        payload={{
          shop: {
            id: "shop-tampa",
            name: "BVRB3R Tampa",
            brandLine: "Cuts in Tampa.",
            neighborhood: "Ybor",
            city: "Tampa",
            state: "FL",
            address: "1600 7th Ave, Tampa, FL",
            profilePhotoUrl: "https://cdn.example.com/shop-logo.png",
            gallery: [],
            activeBarbersCount: 1
          },
          barbers: [
            {
              barber: {
                id: "barber-phillip",
                name: "Phillip McGee",
                rating: 0
              },
              profile: {
                username: "philforsure",
                profilePhotoUrl: null,
                specialties: ["Haircut"]
              },
              proof: {
                reviewScore: 0
              },
              priceRange: [5, 5],
              services: [{ service: { id: "srv-test-cut" } }],
              bookingCtaHref: "/booking/new?barberId=barber-phillip&serviceId=srv-test-cut"
            }
          ],
          services: []
        } as unknown as PublicShopProfilePayload}
      />
    );

    expect(screen.getByTestId("public-shop-profile")).toBeInTheDocument();
    expect(screen.getByText("BVRB3R Tampa")).toBeInTheDocument();
    expect(screen.getByAltText("BVRB3R Tampa")).toHaveAttribute("src", "https://cdn.example.com/shop-logo.png");
    expect(screen.getByText("1600 7th Ave, Tampa, FL")).toBeInTheDocument();
    expect(screen.getByText("1 approved barber")).toBeInTheDocument();
    expect(screen.getByText("Active team")).toBeInTheDocument();
    expect(screen.getAllByText("philforsure").length).toBeGreaterThan(0);
    expect(screen.queryByText("Phillip McGee")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /philforsure/i }).some((link) => link.getAttribute("href") === "/barber/philforsure")).toBe(true);
    expect(screen.getByRole("link", { name: "View Profile" })).toHaveAttribute("href", "/barber/philforsure");
    expect(screen.getByRole("link", { name: "Book" })).toHaveAttribute("href", "/booking/new?barberId=barber-phillip&serviceId=srv-test-cut");
    expect(screen.queryByText(/approved marketplace supply/i)).not.toBeInTheDocument();
  });
});
