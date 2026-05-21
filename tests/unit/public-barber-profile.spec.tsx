import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  PublicBarberGrowthActions: ({ barberId }: { barberId: string }) => (
    <button type="button" data-barber-id={barberId}>Follow</button>
  )
}));

vi.mock("@/components/marketplace/public-barber-message-action", () => ({
  PublicBarberMessageAction: ({ barberProfileId }: { barberProfileId: string }) => (
    <button type="button" data-profile-id={barberProfileId}>Message</button>
  )
}));

import { PublicBarberProfile } from "@/components/marketplace/public-barber-profile";
import type { PublicBarberProfileView } from "@/lib/marketplace/engine";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public barber profile", () => {
  it("renders the client-facing IG-style header, actions, portfolio, and community reviews without the lower booking card", () => {
    render(
      <PublicBarberProfile
        profile={{
          barber: {
            id: "barber-wave",
            userId: "profile-wave",
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
            followCount: 18,
            bookingsCompleted: 3
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
              neighborhood: "Ybor City",
              address: "2172 University Square Mall",
              city: "Tampa",
              state: "FL",
              postalCode: "33612"
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
        } as unknown as PublicBarberProfileView}
      />
    );

    const header = screen.getByTestId("public-barber-profile-header");
    expect(within(header).getByText("Wave Carter")).toBeInTheDocument();
    expect(within(header).getByText("@wave")).toBeInTheDocument();
    expect(within(header).getByText("18")).toBeInTheDocument();
    expect(within(header).getByText("followers")).toBeInTheDocument();
    expect(within(header).getByText("3")).toBeInTheDocument();
    expect(within(header).getByText("bookings")).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Message" })).toHaveAttribute("data-profile-id", "profile-wave");
    expect(within(header).getByRole("button", { name: "Follow" })).toHaveAttribute("data-barber-id", "barber-wave");
    expect(within(screen.getByTestId("barber-profile-header-actions")).getAllByRole("link", { name: "Book" })).toHaveLength(1);
    expect(screen.getByText(/2172 University Square Mall, Tampa, FL 33612/)).toBeInTheDocument();
    expect(screen.queryByText("Verified license")).not.toBeInTheDocument();
    expect(screen.getAllByText("Verified identity").length).toBeGreaterThan(0);
    expect(screen.getByText("Verified shop")).toBeInTheDocument();
    expect(screen.queryByText("Book a service")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose your cut")).not.toBeInTheDocument();
    expect(screen.queryByText("Signature Precision Cut")).not.toBeInTheDocument();
    expect(screen.queryByText(/Deposits apply to select services starting at \$15/)).not.toBeInTheDocument();
    expect(screen.queryByText("Card on file is required when the selected service policy needs it.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Book" })).toHaveLength(1);
    expect(screen.getByText("No work posted yet.")).toBeInTheDocument();
    expect(screen.getAllByText("Reviews building.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Leave a Review" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Profile highlights")).not.toBeInTheDocument();
    expect(screen.queryByText(/shared service system/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/approved marketplace supply/i)).not.toBeInTheDocument();
  });

  it("renders a real profile photo and opens canonical portfolio media in a gallery", () => {
    render(
      <PublicBarberProfile
        profile={{
          barber: {
            id: "barber-wave",
            userId: "profile-wave",
            name: "Wave Carter",
            rating: 4.9
          },
          profile: {
            username: "wave",
            headline: "Precision fades that hold their shape.",
            profilePhotoUrl: "https://cdn.bvrb3r.app/barbers/wave/avatar.jpg",
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
        } as unknown as PublicBarberProfileView}
      />
    );

    expect(screen.getByTestId("barber-profile-photo")).toHaveAttribute("src", "https://cdn.bvrb3r.app/barbers/wave/avatar.jpg");
    expect(screen.getByRole("img", { name: /sharp taper finish/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("img", { name: /sharp taper finish/i }));
    expect(screen.getByTestId("portfolio-lightbox")).toBeInTheDocument();
    expect(screen.queryByText("No work posted yet.")).not.toBeInTheDocument();
  });

  it("posts a public barber review from the review modal and refreshes the community proof", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        review: {
          id: "review-new",
          rating: 5,
          message: "Loved the fade.",
          createdAt: "2026-05-20T12:00:00.000Z"
        }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        averageRating: 5,
        reviewCount: 1,
        reviews: [
          {
            id: "review-new",
            barberId: "barber-wave",
            clientId: "client-wave",
            locationId: "loc-ybor",
            rating: 5,
            sentiment: "great",
            message: "Loved the fade.",
            createdAt: "2026-05-20T12:00:00.000Z",
            reviewerName: "Jordan"
          }
        ]
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PublicBarberProfile
        viewerCanReview
        profile={{
          barber: {
            id: "barber-wave",
            userId: "profile-wave",
            name: "Wave Carter",
            rating: 5
          },
          profile: {
            username: "wave",
            headline: "Precision fades.",
            profilePhotoUrl: null,
            photoAccent: "#7cff00",
            specialties: ["Precision fades"],
            badges: []
          },
          proof: {
            reviewScore: 0,
            reviewCount: 0,
            verificationLabels: []
          },
          priceRange: [55, 70],
          nextAvailableAt: "2026-04-28T14:00:00.000Z",
          shopLocations: [],
          bookingCtaHref: "/booking/new?barberId=barber-wave",
          services: [],
          reviews: [],
          portfolio: []
        } as unknown as PublicBarberProfileView}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Leave a Review" }));
    fireEvent.change(screen.getByPlaceholderText("Share your experience"), {
      target: { value: "Loved the fade." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/barbers/barber-wave/reviews", expect.objectContaining({
        method: "POST"
      }));
    });
    expect(await screen.findByText("Review posted.")).toBeInTheDocument();
    expect(await screen.findByText("Loved the fade.")).toBeInTheDocument();
    expect(screen.getByText("Jordan")).toBeInTheDocument();
  });

  it("renders server review eligibility errors in the review modal", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      ok: false,
      error: "Complete an appointment before leaving a review."
    }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PublicBarberProfile
        viewerCanReview
        profile={{
          barber: {
            id: "barber-wave",
            userId: "profile-wave",
            name: "Wave Carter",
            rating: 5
          },
          profile: {
            username: "wave",
            headline: "Precision fades.",
            profilePhotoUrl: null,
            photoAccent: "#7cff00",
            specialties: ["Precision fades"],
            badges: []
          },
          proof: {
            reviewScore: 0,
            reviewCount: 0,
            verificationLabels: []
          },
          priceRange: [55, 70],
          nextAvailableAt: "2026-04-28T14:00:00.000Z",
          shopLocations: [],
          bookingCtaHref: "/booking/new?barberId=barber-wave",
          services: [],
          reviews: [],
          portfolio: []
        } as unknown as PublicBarberProfileView}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Leave a Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));

    expect(await screen.findByText("Complete an appointment before leaving a review.")).toBeInTheDocument();
  });
});
