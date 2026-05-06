import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  useClientHomeQueryMock,
  useMarketplaceDiscoveryMock
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  useClientHomeQueryMock: vi.fn(),
  useMarketplaceDiscoveryMock: vi.fn()
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

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceDiscovery: useMarketplaceDiscoveryMock
}));

vi.mock("@/components/client-experience/marketplace-tracked-action-link", () => ({
  MarketplaceTrackedActionLink: ({
    children,
    href
  }: {
    children?: ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>
}));

import { ClientSearchScreen } from "@/components/client-experience/client-search-screen";

describe("client search screen", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useClientHomeQueryMock.mockReset();
    useMarketplaceDiscoveryMock.mockReset();

    useClientHomeQueryMock.mockReturnValue({
      data: {
        locationId: "loc-ybor",
        recommendedBarbers: [
          {
            barberId: "barber-wave",
            username: "wave",
            barberName: "Wave Carter",
            rating: 4.9,
            reviewCount: 180,
            priceRange: [55, 78],
            priceRangeLabel: "$55 - $78",
            nextAvailableAt: "2026-04-24T10:30:00-04:00",
            availabilityLabel: "Today 10:30 AM",
            distanceMiles: 2.4,
            locationId: "loc-ybor",
            locationLabel: "Centro Ybor Flagship",
            cityLabel: "Tampa",
            shopName: "Centro Ybor Flagship",
            specialties: ["precision fades"],
            mostBookedService: "Premium Cut + Beard Sculpt",
            mostBookedServiceId: "srv-premium",
            retentionScore: 71,
            activityScore: 96,
            badges: ["verified_identity"],
            galleryPreviewUrls: ["https://example.com/wave.jpg"]
          }
        ],
        recommendedShops: [
          {
            id: "loc-ybor",
            name: "Centro Ybor Flagship",
            brandLine: "Trusted local shop",
            neighborhood: "Ybor City",
            city: "Tampa",
            state: "FL",
            address: "1600 7th Ave, Tampa, FL",
            kind: "shop",
            activeBarbersCount: 6,
            rating: 4.8,
            reviewCount: 44,
            verifiedLabel: "Verified",
            nextAvailableLabel: "Today 11:15 AM",
            viewHref: "/dashboard/client/search?type=shops&q=Centro%20Ybor%20Flagship&locationId=loc-ybor"
          }
        ],
        shops: [
          {
            id: "loc-ybor",
            name: "Centro Ybor Flagship",
            brandLine: "Trusted local shop",
            neighborhood: "Ybor City",
            city: "Tampa",
            state: "FL",
            phone: "(813) 555-0101",
            address: "1600 7th Ave, Tampa, FL",
            kind: "shop"
          }
        ]
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
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
          cityLabel: "Tampa",
          shopName: "Centro Ybor Flagship",
          specialties: ["executive grooming"],
          mostBookedService: "Signature Precision Cut",
          mostBookedServiceId: "srv-signature",
          retentionScore: 92,
          activityScore: 128,
          badges: [],
          galleryPreviewUrls: ["https://example.com/blaze.jpg"]
        }
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
  });

  it("renders the refined search header, compact filters, and discovery sections", () => {
    render(<ClientSearchScreen clientId="client-jordan" routeBase="/dashboard/client/search" />);

    expect(screen.getByText("Find the right barber.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search barber or shop name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Haircuts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Available Now" })).toBeInTheDocument();
    expect(screen.getByText("Barbers near you")).toBeInTheDocument();
    expect(screen.getByText("Shops near you")).toBeInTheDocument();
    expect(screen.getByText("Marketplace Feed")).toBeInTheDocument();
    expect(screen.queryByText(/Marketplace Zone Status/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Smart ranking/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Get a Haircut Now/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No Instant Chair/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Shop/i })).toHaveAttribute("href", "/shop/loc-ybor");
  });

  it("keeps the shop type in route updates when shop-led discovery is active", async () => {
    render(<ClientSearchScreen clientId="client-jordan" initialType="shops" routeBase="/dashboard/client/search" />);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining("type=shops"));
      expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining("availability=today"));
    });
  });

  it("passes the selected service category into canonical marketplace discovery", async () => {
    render(<ClientSearchScreen clientId="client-jordan" routeBase="/dashboard/client/search" />);

    fireEvent.click(screen.getByRole("button", { name: "Haircuts" }));

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

  it("uses accurate live-supply empty states when no bookable barbers or shops exist", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: {
        locationId: "",
        recommendedBarbers: [],
        recommendedShops: [],
        shops: []
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useMarketplaceDiscoveryMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<ClientSearchScreen clientId="client-jordan" routeBase="/dashboard/client/search" />);

    expect(screen.getByText("No live barbers yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Approved barbers appear here after services, hours, location/shop, booking, and payout setup are complete."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("No live shops yet.")).toBeInTheDocument();
    expect(screen.getByText("Approved shops appear here after the shop is set up and at least one approved barber is bookable.")).toBeInTheDocument();
    expect(screen.queryByText(/We're expanding in your area/i)).not.toBeInTheDocument();
  });

  it("keeps discovery platform-wide when the client has no saved location", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: {
        locationId: "loc-ybor",
        hasResolvedLocation: false,
        recommendedBarbers: [],
        recommendedShops: [],
        shops: [
          {
            id: "loc-ybor",
            name: "Centro Ybor Flagship",
            brandLine: "Trusted local shop",
            neighborhood: "Ybor City",
            city: "Tampa",
            state: "FL",
            phone: "(813) 555-0101",
            address: "1600 7th Ave, Tampa, FL",
            kind: "shop"
          }
        ]
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useMarketplaceDiscoveryMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<ClientSearchScreen clientId="client-jordan" routeBase="/dashboard/client/search" />);

    expect(useMarketplaceDiscoveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: undefined,
        maxDistanceMiles: 20
      }),
      "client-jordan"
    );
    expect(screen.getByText("Set your city to prioritize nearby barbers. Search still shows live BVRB3R barbers across the platform.")).toBeInTheDocument();
    expect(screen.getByTestId("client-search-debug")).toHaveTextContent("Barber count");
  });

  it("shows a specific discovery failure instead of the generic action error", () => {
    useMarketplaceDiscoveryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Marketplace discovery failed. Reference client_search_load_failed."),
      refetch: vi.fn()
    });

    render(<ClientSearchScreen clientId="client-jordan" routeBase="/dashboard/client/search" />);

    expect(screen.getAllByText("Marketplace discovery failed. Reference client_search_load_failed.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Something went wrong while processing this action. Please try again.")).not.toBeInTheDocument();
  });

  it("keeps search usable when client home has a stale marketplace failure", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Client home could not load marketplace data. Reference client_home_load_failed."),
      refetch: vi.fn()
    });
    useMarketplaceDiscoveryMock.mockReturnValue({
      data: [
        {
          barberId: "barber-phillip",
          username: "independent-barber-43b3cda2",
          barberName: "Phillip McGee",
          rating: 5,
          reviewCount: 1,
          priceRange: [55, 55],
          priceRangeLabel: "$55",
          nextAvailableAt: "2026-05-06T16:00:00.000Z",
          availabilityLabel: "Today 4:00 PM",
          distanceMiles: 0,
          locationId: "independent-barber-43b3cda2",
          locationLabel: "Phils chair",
          cityLabel: "Tampa",
          shopName: undefined,
          specialties: ["Haircut"],
          mostBookedService: "Haircut",
          mostBookedServiceId: "srv-haircut",
          retentionScore: 0,
          activityScore: 0,
          badges: ["verified_identity"],
          galleryPreviewUrls: []
        }
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<ClientSearchScreen clientId="client-jordan" initialQuery="Phillip" routeBase="/dashboard/client/search" />);

    expect(screen.getByText("Phillip McGee")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Barber" })).toHaveAttribute("href", "/barber/independent-barber-43b3cda2");
    expect(screen.queryByText(/client_home_load_failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Something went wrong while processing this action. Please try again.")).not.toBeInTheDocument();
    expect(screen.getByTestId("client-search-debug")).toHaveTextContent("Phillip McGee (barber-phillip)");
  });
});
