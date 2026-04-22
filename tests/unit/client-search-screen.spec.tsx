import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  useClientHomeQueryMock,
  useClientReferralSummaryMock,
  useMarketplaceDiscoveryMock,
  useHaircutNowMatchMock,
  mutateAnalyticsAsyncMock,
  useMarketplaceAnalyticsMutationMock
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  useClientHomeQueryMock: vi.fn(),
  useClientReferralSummaryMock: vi.fn(),
  useMarketplaceDiscoveryMock: vi.fn(),
  useHaircutNowMatchMock: vi.fn(),
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
        referralCode: {
          code: "JORDAN",
          rewardPoints: 25
        },
        shareMessage: "Invite a friend into BVRB3R.",
        totals: {
          completed: 2
        }
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
          nextAvailableAt: "2026-04-24T11:15:00-04:00",
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
          nextAvailableAt: "2026-04-24T10:30:00-04:00",
          availabilityLabel: "Available at 10:30 AM",
          distanceMiles: 2.4,
          locationId: "loc-hyde-park",
          locationLabel: "Hyde Park Atelier",
          shopName: "Hyde Park Atelier",
          specialties: ["precision fades"],
          mostBookedService: "Premium Cut + Beard Sculpt",
          mostBookedServiceId: "srv-premium",
          retentionScore: 71,
          activityScore: 96,
          badges: ["verified_identity", "top_barber"]
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
        appointmentTime: "2026-04-24T11:15:00-04:00",
        locationId: "loc-ybor",
        shopName: "Centro Ybor Flagship",
        priceFrom: 55,
        rating: 5
      },
      isLoading: false
    });

    useMarketplaceAnalyticsMutationMock.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: mutateAnalyticsAsyncMock
    });
  });

  it("renders live discovery, available-now booking, and referral entry", () => {
    render(<ClientSearchScreen clientId="client-jordan" routeBase="/discover" />);

    expect(screen.getByText(/Discover barbers worth booking/i)).toBeInTheDocument();
    expect(screen.getByText(/Get a haircut now/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Blaze King/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Book This Chair/i })).toHaveAttribute(
      "href",
      expect.stringContaining("source=haircut_now")
    );
    expect(screen.getByRole("link", { name: /Open referrals/i })).toBeInTheDocument();
  });

  it("supports location-aware filtering", async () => {
    render(<ClientSearchScreen clientId="client-jordan" routeBase="/discover" />);

    fireEvent.change(screen.getByLabelText(/Filter by location/i), {
      target: { value: "loc-hyde-park" }
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining("locationId=loc-hyde-park"));
    });
  });

  it("applies specialty and verified filters through the canonical route state", async () => {
    render(<ClientSearchScreen clientId="client-jordan" routeBase="/discover" />);

    fireEvent.change(screen.getByLabelText(/Filter by specialty/i), {
      target: { value: "beard work" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply specialty/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining("specialty=beard+work"));
    });

    fireEvent.click(screen.getByRole("button", { name: /Verified only/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining("verified=1"));
    });
  });

  it("passes the selected service category into canonical marketplace discovery", async () => {
    render(<ClientSearchScreen clientId="client-jordan" routeBase="/discover" />);

    fireEvent.click(screen.getByRole("button", { name: /Haircuts/i }));

    await waitFor(() => {
      expect(useMarketplaceDiscoveryMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          category: "haircuts",
          query: undefined
        }),
        "client-jordan"
      );
    });
  });
});
