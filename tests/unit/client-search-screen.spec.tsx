import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  useClientHomeQueryMock,
  useClientReferralSummaryMock,
  useMarketplaceDiscoveryMock,
  useHaircutNowMatchMock,
  mutateAnalyticsMock,
  mutateAnalyticsAsyncMock,
  useMarketplaceAnalyticsMutationMock
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  useClientHomeQueryMock: vi.fn(),
  useClientReferralSummaryMock: vi.fn(),
  useMarketplaceDiscoveryMock: vi.fn(),
  useHaircutNowMatchMock: vi.fn(),
  mutateAnalyticsMock: vi.fn(),
  mutateAnalyticsAsyncMock: vi.fn(),
  useMarketplaceAnalyticsMutationMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock
  })
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
  useClientHomeQuery: useClientHomeQueryMock
}));

vi.mock("@/lib/engagement/client", () => ({
  useClientReferralSummary: useClientReferralSummaryMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceDiscovery: useMarketplaceDiscoveryMock,
  useHaircutNowMatch: useHaircutNowMatchMock,
  useMarketplaceAnalyticsMutation: useMarketplaceAnalyticsMutationMock
}));

import { ClientSearchScreen } from "@/components/client-experience/client-search-screen";

describe("client search screen", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useClientHomeQueryMock.mockReset();
    useClientReferralSummaryMock.mockReset();
    useMarketplaceDiscoveryMock.mockReset();
    useHaircutNowMatchMock.mockReset();
    mutateAnalyticsMock.mockReset();
    mutateAnalyticsAsyncMock.mockReset();
    useMarketplaceAnalyticsMutationMock.mockReset();

    useClientHomeQueryMock.mockReturnValue({
      data: {
        locationId: "loc-ybor",
        shops: [
          {
            id: "loc-ybor",
            name: "Centro Ybor Flagship",
            brandLine: "Trusted local shop",
            neighborhood: "Ybor City",
            city: "Tampa",
            state: "FL",
            phone: "(813) 555-0101",
            address: "Ybor City",
            kind: "shop"
          },
          {
            id: "loc-hyde-park",
            name: "Hyde Park Atelier",
            brandLine: "Luxury studio",
            neighborhood: "Hyde Park",
            city: "Tampa",
            state: "FL",
            phone: "(813) 555-0111",
            address: "Hyde Park",
            kind: "shop"
          }
        ]
      },
      isLoading: false
    });
    useClientReferralSummaryMock.mockReturnValue({
      data: {
        clientId: "client-jordan",
        referralCode: {
          id: "ref-1",
          clientId: "client-jordan",
          code: "JORDAN",
          rewardPoints: 25,
          active: true,
          createdAt: "2026-03-01T09:00:00-05:00"
        },
        inviteLink: "https://bvrb3r.test/ref/JORDAN",
        shareMessage: "Invite a friend into BVRB3R.",
        totals: {
          invited: 3,
          signedUp: 2,
          booked: 2,
          completed: 2,
          credited: 2,
          rewardPointsEarned: 50
        },
        recentReferrals: []
      }
    });
    useMarketplaceDiscoveryMock.mockReturnValue({
      data: [
        {
          barberId: "barber-blaze",
          username: "blaze",
          barberName: "Blaze King",
          rating: 5,
          reviewCount: 98,
          priceRange: [55, 78],
          priceRangeLabel: "$55 - $78",
          nextAvailableAt: "2026-03-24T11:15:00-04:00",
          availabilityLabel: "Available at 11:15 AM",
          distanceMiles: 1.2,
          locationId: "loc-ybor",
          locationLabel: "Centro Ybor Flagship",
          shopName: "Centro Ybor Flagship",
          specialties: ["executive grooming"],
          mostBookedService: "Signature Precision Cut",
          mostBookedServiceId: "srv-signature",
          retentionScore: 92,
          activityScore: 128,
          badges: []
        },
        {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          rating: 4.9,
          reviewCount: 180,
          priceRange: [55, 78],
          priceRangeLabel: "$55 - $78",
          nextAvailableAt: "2026-03-24T10:30:00-04:00",
          availabilityLabel: "Available at 10:30 AM",
          distanceMiles: 2.4,
          locationId: "loc-hyde-park",
          locationLabel: "Hyde Park Atelier",
          shopName: "Centro Ybor Flagship",
          specialties: ["precision fades"],
          mostBookedService: "Premium Cut + Beard Sculpt",
          mostBookedServiceId: "srv-premium",
          retentionScore: 71,
          activityScore: 96,
          badges: ["top_barber"]
        }
      ],
      isLoading: false,
      error: null
    });
    useHaircutNowMatchMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        username: "blaze",
        barberName: "Blaze King",
        matchedFrom: "available_now",
        matchReason: "Fastest chair in the area.",
        appointmentTime: "2026-03-24T11:15:00-04:00",
        locationId: "loc-ybor",
        shopName: "Centro Ybor Flagship",
        priceFrom: 55,
        rating: 5
      },
      isLoading: false
    });
    useMarketplaceAnalyticsMutationMock.mockReturnValue({
      mutate: mutateAnalyticsMock,
      mutateAsync: mutateAnalyticsAsyncMock
    });
  });

  it("renders the ranked discovery marketplace with available-now booking", () => {
    render(<ClientSearchScreen clientId="client-jordan" routeBase="/discover" />);

    expect(screen.getByText(/Discover barbers worth booking/i)).toBeInTheDocument();
    expect(screen.getByText(/Get a haircut now/i)).toBeInTheDocument();
    expect(screen.getByText(/Top matches/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Blaze King/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Book This Chair/i })).toHaveAttribute(
      "href",
      expect.stringContaining("source=haircut_now")
    );
    expect(screen.getByRole("link", { name: /Open referrals/i })).toBeInTheDocument();
  });

  it("records a referral activation click from the discovery surface", async () => {
    render(<ClientSearchScreen clientId="client-jordan" routeBase="/discover" />);

    fireEvent.click(screen.getByRole("link", { name: /Open referrals/i }));

    await waitFor(() => {
      expect(mutateAnalyticsAsyncMock).toHaveBeenCalledWith({
        eventType: "referral_shared",
        sourceKind: "discovery",
        sourceReference: "JORDAN",
        metadata: {
          interaction: "cta_click",
          surface: "/discover"
        }
      });
    });
  });

  it("supports location-aware marketplace filtering", async () => {
    render(<ClientSearchScreen clientId="client-jordan" routeBase="/discover" />);

    fireEvent.change(screen.getByLabelText(/Filter by location/i), {
      target: { value: "loc-hyde-park" }
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining("locationId=loc-hyde-park"));
    });
  });
});
