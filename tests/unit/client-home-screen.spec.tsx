import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useClientHomeQueryMock,
  useClientBookingsQueryMock,
  useSaveFavoriteBarberMutationMock,
  useSaveFavoriteShopMutationMock
} = vi.hoisted(() => ({
  useClientHomeQueryMock: vi.fn(),
  useClientBookingsQueryMock: vi.fn(),
  useSaveFavoriteBarberMutationMock: vi.fn(),
  useSaveFavoriteShopMutationMock: vi.fn()
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
  useSaveFavoriteBarberMutation: useSaveFavoriteBarberMutationMock,
  useSaveFavoriteShopMutation: useSaveFavoriteShopMutationMock
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

import { ClientHomeScreen } from "@/components/client-experience/client-home-screen";

describe("client home screen", () => {
  beforeEach(() => {
    useClientHomeQueryMock.mockReset();
    useClientBookingsQueryMock.mockReset();
    useSaveFavoriteBarberMutationMock.mockReset();
    useSaveFavoriteShopMutationMock.mockReset();
    useSaveFavoriteBarberMutationMock.mockReturnValue({
      isPending: false,
      isSuccess: false,
      mutateAsync: vi.fn()
    });
    useSaveFavoriteShopMutationMock.mockReturnValue({
      isPending: false,
      isSuccess: false,
      mutateAsync: vi.fn()
    });

    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis",
          favoriteBarberReference: "barber-wave"
        },
        locationId: "loc-ybor",
        hasResolvedLocation: true,
        shops: [
          {
            id: "loc-ybor",
            name: "Centro Ybor Flagship",
            brandLine: "Trusted local shop",
            neighborhood: "Ybor City",
            city: "Tampa",
            state: "FL",
            phone: "(813) 555-0101",
            address: "Centro Ybor Flagship, Ybor City, Tampa, FL",
            kind: "shop"
          }
        ],
        trustedBarbers: [],
        recommendedBarbers: [
          {
            barberId: "barber-wave",
            username: "wave",
            barberName: "Wave Carter",
            rating: 4.9,
            reviewCount: 120,
            priceRange: [55, 70],
            priceRangeLabel: "$55 - $70",
            nextAvailableAt: "2026-04-24T15:00:00.000Z",
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
            badges: ["verified_identity"]
          }
        ],
        recommendedShops: [
          {
            id: "loc-ybor",
            name: "Centro Ybor Flagship",
            brandLine: "Trusted local studio",
            neighborhood: "Ybor City",
            city: "Tampa",
            state: "FL",
            address: "Centro Ybor Flagship, Ybor City, Tampa, FL",
            kind: "shop",
            activeBarbersCount: 3,
            nextAvailableAt: "2026-04-24T15:00:00.000Z",
            nextAvailableLabel: "Today 3:00 PM",
            bookHref: "/booking/new?barberId=barber-wave&locationId=loc-ybor"
          }
        ],
        favoriteBarber: null,
        nextAvailableChair: {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          matchedFrom: "available_now",
          matchReason: "Fastest trusted chair near you.",
          appointmentTime: "2026-04-24T15:00:00.000Z",
          locationId: "loc-ybor",
          shopName: "Centro Ybor Flagship",
          priceFrom: 55,
          rating: 4.9
        },
        defaultPaymentMethod: {
          id: "pm-default",
          label: "Visa ending in 4242",
          isDefault: true
        }
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
          status: "confirmed",
          start: "2026-04-28T14:00:00.000Z",
          depositAmount: 10,
          balanceDue: 45,
          view: {
            barber: { name: "Wave Carter" },
            service: { name: "Signature Precision Cut" },
            location: { name: "Centro Ybor Flagship" }
          }
        },
        nextAppointmentPayment: {
          outstandingBalance: 45,
          latestBookingPayment: {
            paymentStatus: "captured"
          }
        },
        history: [
          {
            id: "appt-last",
            barberId: "barber-wave",
            serviceId: "srv-signature",
            locationId: "loc-ybor",
            status: "completed",
            start: "2026-04-20T14:00:00.000Z",
            totalAmount: 55,
            grandTotal: 55,
            view: {
              barber: { name: "Wave Carter" },
              service: { name: "Signature Precision Cut" },
              location: { name: "Centro Ybor Flagship" }
            }
          }
        ]
      },
      isLoading: false,
      error: null
    });
  });

  it("renders the refined hero, upcoming appointment, barber recommendations, and shop recommendations", () => {
    render(<ClientHomeScreen isSignedInClient displayName="Jordan Ellis" />);

    expect(screen.getByRole("link", { name: "Find a Barber" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get a Cut Now" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a Barber Shop" })).toBeInTheDocument();
    expect(screen.getByText("Upcoming Appointment")).toBeInTheDocument();
    expect(screen.getByText("Recommended Barbers")).toBeInTheDocument();
    expect(screen.getByText("Recommended Barber Shops")).toBeInTheDocument();
    expect(screen.queryByText("Search Availability")).not.toBeInTheDocument();
    expect(screen.queryByText("Explore Services")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Wallet and points snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Wallet")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Rewards")).not.toBeInTheDocument();
    expect(screen.queryByText("Add Card")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Find a Barber" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Add Location" })).not.toBeInTheDocument();
  });

  it("guards get a cut now with add-location guidance when no saved location exists", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis"
        },
        locationId: "",
        hasResolvedLocation: false,
        shops: [],
        trustedBarbers: [],
        recommendedBarbers: [],
        recommendedShops: [],
        favoriteBarber: null,
        nextAvailableChair: null,
        defaultPaymentMethod: null
      },
      isLoading: false,
      error: null
    });
    useClientBookingsQueryMock.mockReturnValue({
      data: {
        nextAppointment: null,
        nextAppointmentPayment: null,
        history: []
      },
      isLoading: false,
      error: null
    });

    render(<ClientHomeScreen isSignedInClient displayName="Jordan Ellis" />);

    fireEvent.click(screen.getByRole("button", { name: "Get a Cut Now" }));

    expect(screen.getByText("Add your location to find the next available barber near you.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add Location" })).toBeInTheDocument();
    expect(screen.getByText("No upcoming appointment yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Find a Barber" })).toBeInTheDocument();
  });

  it("falls back to search barbers when location exists but no next-available candidate is live", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis",
          favoriteShopReference: "loc-ybor"
        },
        locationId: "loc-ybor",
        hasResolvedLocation: true,
        shops: [],
        trustedBarbers: [],
        recommendedBarbers: [],
        recommendedShops: [],
        favoriteBarber: null,
        nextAvailableChair: null,
        defaultPaymentMethod: null
      },
      isLoading: false,
      error: null
    });
    useClientBookingsQueryMock.mockReturnValue({
      data: {
        nextAppointment: null,
        nextAppointmentPayment: null,
        history: []
      },
      isLoading: false,
      error: null
    });

    render(<ClientHomeScreen isSignedInClient displayName="Jordan Ellis" />);

    fireEvent.click(screen.getByRole("button", { name: "Get a Cut Now" }));

    expect(screen.getByText("No available barber near you right now.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search Barbers" })).toBeInTheDocument();
    expect(screen.getAllByText("Explore top barbers on BVRB3R.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Explore barber shops on BVRB3R.").length).toBeGreaterThan(0);
  });

  it("shows payment setup guidance before continuing a get-a-cut-now booking", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis",
          favoriteShopReference: "loc-ybor"
        },
        locationId: "loc-ybor",
        hasResolvedLocation: true,
        shops: [],
        trustedBarbers: [],
        recommendedBarbers: [],
        recommendedShops: [],
        favoriteBarber: null,
        nextAvailableChair: {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          matchedFrom: "available_now",
          matchReason: "Fastest trusted chair near you.",
          appointmentTime: "2026-04-24T15:00:00.000Z",
          locationId: "loc-ybor",
          shopName: "Centro Ybor Flagship",
          priceFrom: 55,
          rating: 4.9
        },
        defaultPaymentMethod: null
      },
      isLoading: false,
      error: null
    });
    useClientBookingsQueryMock.mockReturnValue({
      data: {
        nextAppointment: null,
        nextAppointmentPayment: null,
        history: []
      },
      isLoading: false,
      error: null
    });

    render(<ClientHomeScreen isSignedInClient displayName="Jordan Ellis" />);

    fireEvent.click(screen.getByRole("button", { name: "Get a Cut Now" }));

    expect(screen.getByText("Add a payment method to confirm this booking.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add Payment Method" })).toHaveAttribute("href", "/dashboard/client/profile?section=wallet");
  });
});
