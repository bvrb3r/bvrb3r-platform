import { render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useClientHomeQueryMock,
  useClientBookingsQueryMock,
  useClientPointsBalanceQueryMock,
  useBarberProfileQueryMock,
  useClientEngagementSummaryMock,
  useMarketplaceAnalyticsMutationMock
} = vi.hoisted(() => ({
  useClientHomeQueryMock: vi.fn(),
  useClientBookingsQueryMock: vi.fn(),
  useClientPointsBalanceQueryMock: vi.fn(),
  useBarberProfileQueryMock: vi.fn(),
  useClientEngagementSummaryMock: vi.fn(),
  useMarketplaceAnalyticsMutationMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    onClick,
    href,
    ...props
  }: ComponentProps<"a"> & {
    children?: ReactNode;
    onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      {...props}
      href={typeof href === "string" ? href : "#"}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  )
}));

vi.mock("@/lib/booking/client", () => ({
  useClientHomeQuery: useClientHomeQueryMock,
  useClientBookingsQuery: useClientBookingsQueryMock,
  useClientPointsBalanceQuery: useClientPointsBalanceQueryMock,
  useBarberProfileQuery: useBarberProfileQueryMock
}));

vi.mock("@/lib/engagement/client", () => ({
  useClientEngagementSummary: useClientEngagementSummaryMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceAnalyticsMutation: useMarketplaceAnalyticsMutationMock
}));

import { ClientHomeScreen } from "@/components/client-experience/client-home-screen";

describe("client home screen", () => {
  beforeEach(() => {
    useClientHomeQueryMock.mockReset();
    useClientBookingsQueryMock.mockReset();
    useClientPointsBalanceQueryMock.mockReset();
    useBarberProfileQueryMock.mockReset();
    useClientEngagementSummaryMock.mockReset();
    useMarketplaceAnalyticsMutationMock.mockReset();

    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis",
          phone: "8135550190",
          email: "client@bvrb3r.demo",
          favoriteBarberReference: "barber-wave",
          loyaltyPoints: 0,
          retentionTag: "repeat",
          notes: []
        },
        shops: [
          {
            id: "loc-ybor",
            name: "Centro Ybor Flagship",
            brandLine: "Trusted local shop",
            neighborhood: "Ybor City",
            city: "Tampa",
            state: "FL",
            phone: "(813) 555-0101",
            address: "1600 7th Ave",
            kind: "shop"
          }
        ],
        trustedBarbers: [
          {
            barberId: "barber-wave",
            username: "wave",
            barberName: "Wave Carter",
            rating: 4.9,
            reviewCount: 120,
            priceRange: [55, 70],
            priceRangeLabel: "$55 - $70",
            nextAvailableAt: "2026-03-27T15:00:00.000Z",
            availabilityLabel: "Today 3:00 PM",
            distanceMiles: 1.2,
            locationId: "loc-ybor",
            locationLabel: "Centro Ybor Flagship",
            shopName: "Centro Ybor Flagship",
            specialties: ["Precision fades"],
            mostBookedService: "Signature Precision Cut",
            mostBookedServiceId: "srv-signature",
            retentionScore: 92,
            activityScore: 128,
            badges: []
          }
        ],
        favoriteBarber: {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          rating: 4.9,
          reviewCount: 120,
          priceRange: [55, 70],
          priceRangeLabel: "$55 - $70",
          nextAvailableAt: "2026-03-27T15:00:00.000Z",
          availabilityLabel: "Today 3:00 PM",
          distanceMiles: 1.2,
          locationId: "loc-ybor",
          locationLabel: "Centro Ybor Flagship",
          shopName: "Centro Ybor Flagship",
          specialties: ["Precision fades"],
          mostBookedService: "Signature Precision Cut",
          mostBookedServiceId: "srv-signature",
          retentionScore: 92,
          activityScore: 128,
          badges: []
        },
        nextAvailableChair: {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          matchedFrom: "available_now",
          matchReason: "Fastest trusted chair near you.",
          appointmentTime: "2026-03-27T15:00:00.000Z",
          locationId: "loc-ybor",
          shopName: "Centro Ybor Flagship",
          priceFrom: 55,
          rating: 4.9
        },
        locationId: "loc-ybor"
      },
      isLoading: false,
      error: null
    });

    useClientBookingsQueryMock.mockReturnValue({
      data: {
        nextAppointment: {
          id: "appt-next",
          barberId: "barber-wave",
          serviceId: "srv-signature",
          locationId: "loc-ybor",
          status: "booked",
          start: "2026-03-28T14:00:00.000Z",
          view: {
            barber: { name: "Wave Carter" },
            service: { name: "Signature Precision Cut" },
            location: { name: "Centro Ybor Flagship" }
          }
        },
        history: [
          {
            id: "appt-last",
            barberId: "barber-wave",
            serviceId: "srv-signature",
            locationId: "loc-ybor",
            start: "2026-03-20T14:00:00.000Z",
            view: {
              service: { name: "Signature Precision Cut" }
            }
          }
        ]
      },
      isLoading: false,
      error: null
    });

    useClientPointsBalanceQueryMock.mockReturnValue({
      data: {
        unlockedPoints: 120,
        pendingPoints: 20,
        inAppValue: 12,
        explanation: {
          pointsToNextMilestone: 80,
          nextMilestoneInAppValue: 20,
          progressLabel: "80 pts until $20.00 in-app value."
        }
      },
      isLoading: false
    });

    useClientEngagementSummaryMock.mockReturnValue({
      data: {
        recentNotifications: []
      }
    });

    useMarketplaceAnalyticsMutationMock.mockReturnValue({
      mutateAsync: vi.fn()
    });

    useBarberProfileQueryMock.mockImplementation((barberId?: string) => {
      if (barberId === "barber-wave") {
        return {
          data: {
            barber: { id: "barber-wave", name: "Wave Carter" },
            profile: {
              username: "wave",
              headline: "Precision fades that hold their shape.",
              photoAccent: "#7cff00",
              specialties: ["Precision fades"]
            },
            proof: { reviewScore: 4.9 },
            shopLocations: [{ name: "Centro Ybor Flagship" }],
            bookingCtaHref: "/booking/new?barberId=barber-wave&serviceId=srv-signature"
          }
        };
      }

      return { data: null };
    });
  });

  it("shows the fast booking loop with points and the active booking card", () => {
    render(<ClientHomeScreen isSignedInClient displayName="Jordan Ellis" />);

    expect(screen.getByRole("link", { name: "Book Again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get a Haircut Now" })).toBeInTheDocument();
    expect(screen.getByText("Best Barber Near You")).toBeInTheDocument();
    expect(screen.getByText("Fastest, highest-rated match for your next cut.")).toBeInTheDocument();
    expect(screen.getByText("BVR Points")).toBeInTheDocument();
    expect(screen.getByText("120 pts")).toBeInTheDocument();
    expect(screen.getByText("You have $12 ready to use on your next booking.")).toBeInTheDocument();
    expect(screen.getByText("Active booking")).toBeInTheDocument();
    expect(screen.getByText("Signature Precision Cut")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Rewards" })).toBeInTheDocument();
  });

  it("uses a clearer primary CTA for new clients without repeat history", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis",
          phone: "8135550190",
          email: "client@bvrb3r.demo",
          favoriteBarberReference: null,
          loyaltyPoints: 0,
          retentionTag: "new",
          notes: []
        },
        shops: [
          {
            id: "loc-ybor",
            name: "Centro Ybor Flagship",
            brandLine: "Trusted local shop",
            neighborhood: "Ybor City",
            city: "Tampa",
            state: "FL",
            phone: "(813) 555-0101",
            address: "1600 7th Ave",
            kind: "shop"
          }
        ],
        trustedBarbers: [],
        favoriteBarber: null,
        nextAvailableChair: null,
        locationId: "loc-ybor"
      },
      isLoading: false,
      error: null
    });

    useClientBookingsQueryMock.mockReturnValue({
      data: {
        nextAppointment: null,
        history: []
      },
      isLoading: false,
      error: null
    });

    useClientPointsBalanceQueryMock.mockReturnValue({
      data: {
        unlockedPoints: 0,
        pendingPoints: 0,
        inAppValue: 0,
        explanation: {
          pointsToNextMilestone: 50,
          nextMilestoneInAppValue: 5,
          progressLabel: "50 pts until $5.00 in-app value."
        }
      },
      isLoading: false
    });

    render(<ClientHomeScreen isSignedInClient displayName="Jordan Ellis" />);

    expect(screen.getByRole("link", { name: "Find a Barber" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Book Again" })).not.toBeInTheDocument();
  });
});
