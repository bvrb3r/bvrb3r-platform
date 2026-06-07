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
  PublicShopFavoriteAction: () => <button type="button">Save</button>
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
            publicBio: "A public shop profile for Tampa.",
            shopUsername: "bvrb3rtampa",
            coverPhotoUrl: "https://cdn.example.com/shop-cover.jpg",
            publicHours: "Mon-Fri 9-5",
            policies: "Arrive five minutes early.",
            neighborhood: "Ybor",
            city: "Tampa",
            state: "FL",
            zipCode: "33612",
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
    expect(screen.getByText("@bvrb3rtampa")).toBeInTheDocument();
    expect(screen.getByText("A public shop profile for Tampa.")).toBeInTheDocument();
    expect(screen.getByAltText("BVRB3R Tampa cover")).toHaveAttribute("src", "https://cdn.example.com/shop-cover.jpg");
    expect(screen.getByAltText("BVRB3R Tampa")).toHaveAttribute("src", "https://cdn.example.com/shop-logo.png");
    expect(screen.getByText("1600 7th Ave, Tampa, FL 33612")).toBeInTheDocument();
    expect(screen.getByText("1 approved barber")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Book" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Message" })).toHaveAttribute("href", "/workspace/messages?shop=shop-tampa");
    expect(screen.getByRole("button", { name: "Following" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByText("Active team")).toBeInTheDocument();
    expect(screen.getAllByText("philforsure").length).toBeGreaterThan(0);
    expect(screen.queryByText("Phillip McGee")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /philforsure/i }).some((link) => link.getAttribute("href") === "/barber/philforsure")).toBe(true);
    expect(screen.getByRole("link", { name: "View Profile" })).toHaveAttribute("href", "/barber/philforsure");
    expect(screen.getAllByRole("link", { name: "Book" }).some((link) => link.getAttribute("href") === "/booking/new?barberId=barber-phillip&serviceId=srv-test-cut")).toBe(true);
    expect(screen.getByText("Mon-Fri 9-5")).toBeInTheDocument();
    expect(screen.getByText("Arrive five minutes early.")).toBeInTheDocument();
    expect(screen.queryByText(/approved marketplace supply/i)).not.toBeInTheDocument();
  });
});
