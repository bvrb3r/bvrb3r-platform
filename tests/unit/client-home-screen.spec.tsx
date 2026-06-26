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
            badges: ["verified_identity"],
            galleryPreviewUrls: ["https://images.example.com/wave-cut.jpg"]
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

  it("renders fast booking, honest favorites, recommendations, culture entry, recent activity, and compact upcoming appointment", () => {
    render(<ClientHomeScreen isSignedInClient clientId="client-jordan" displayName="Jordan Ellis" />);

    expect(screen.getByRole("button", { name: "Get a Cut Now" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Find a Barber" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Find a Barber Shop" })).not.toBeInTheDocument();
    expect(screen.queryByText("Home focus")).not.toBeInTheDocument();
    expect(screen.queryByText("Fast booking, trusted favorites, and curated updates. Search owns broader browsing.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Messages" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Culture" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
    expect(screen.getByText("Upcoming Appointment")).toBeInTheDocument();
    expect(screen.getByText("Favorite Barbers")).toBeInTheDocument();
    expect(screen.getByText("Favorite Shops")).toBeInTheDocument();
    expect(screen.getByText("Recommended Barbers")).toBeInTheDocument();
    expect(screen.getByText("Culture Preview")).toBeInTheDocument();
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("Favorite Barbers").compareDocumentPosition(screen.getByText("Recommended Barbers"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("Recommended Barbers").compareDocumentPosition(screen.getByText("Culture Preview"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("Culture Preview").compareDocumentPosition(screen.getByText("Upcoming Appointment"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByRole("link", { name: "View barbers" })).not.toBeInTheDocument();
    expect(screen.getByText("No favorite barbers yet.")).toBeInTheDocument();
    expect(screen.getByText("Save barbers you trust. They'll show here for faster rebooking.")).toBeInTheDocument();
    expect(screen.getByText("No favorite shops yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book" })).toHaveAttribute("href", "/booking/new?barberId=barber-wave&barber=wave&locationId=loc-ybor&source=discovery&query=Signature+Precision+Cut");
    expect(screen.getAllByText("wave").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Wave Carter").length).toBeGreaterThan(0);
    expect(screen.getByText("Booked")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rebook from Search" })).toHaveAttribute("href", "/dashboard/client/search?type=barbers");
    expect(screen.queryByText("Search Availability")).not.toBeInTheDocument();
    expect(screen.queryByText("Explore Services")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Wallet and points snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Wallet")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Rewards")).not.toBeInTheDocument();
    expect(screen.queryByText("Add Card")).not.toBeInTheDocument();
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
    expect(screen.getByText("No cut booked yet.")).toBeInTheDocument();
    expect(screen.getByText("No past visits yet.")).toBeInTheDocument();
    expect(screen.getByText("Culture lives here - cuts, shops, style, and the BVRB3R community.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Find a Barber" })).not.toBeInTheDocument();
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
    expect(screen.getByText("No favorite barbers yet.")).toBeInTheDocument();
    expect(screen.getByText("No favorite shops yet.")).toBeInTheDocument();
    expect(screen.getByText("No barber recommendations yet.")).toBeInTheDocument();
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

  it("does not render raw UUIDs, backend references, or debug labels in the normal client home state", () => {
    render(<ClientHomeScreen isSignedInClient clientId="client-jordan" displayName="Jordan Ellis" />);

    expect(screen.queryByText("client-jordan")).not.toBeInTheDocument();
    expect(screen.queryByText("barber-wave")).not.toBeInTheDocument();
    expect(screen.queryByText("loc-ybor")).not.toBeInTheDocument();
    expect(screen.queryByText("srv-signature")).not.toBeInTheDocument();
    expect(screen.queryByText("available_now")).not.toBeInTheDocument();
    expect(screen.queryByText("pending_payment")).not.toBeInTheDocument();
  });

  it("renders designed loading and failed states without crashing", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null
    });
    useClientBookingsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null
    });

    const { rerender } = render(<ClientHomeScreen isSignedInClient displayName="" />);

    expect(screen.getByTestId("client-home-screen")).toBeInTheDocument();
    expect(screen.queryByText("Phillip")).not.toBeInTheDocument();

    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: null,
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
      error: new Error("Unable to load client home")
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

    rerender(<ClientHomeScreen isSignedInClient displayName="" />);

    expect(screen.getByText("Book your first cut, there.")).toBeInTheDocument();
    expect(screen.getByText("Unable to load client home")).toBeInTheDocument();
    expect(screen.getByText("No cut booked yet.")).toBeInTheDocument();
    expect(screen.getByText("No favorite barbers yet.")).toBeInTheDocument();
  });
});
