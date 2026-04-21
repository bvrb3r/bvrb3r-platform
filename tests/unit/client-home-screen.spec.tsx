import { render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useClientHomeQueryMock,
  useClientBookingsQueryMock,
  useBarberProfileQueryMock,
  usePaymentMethodsQueryMock,
  useMarketplaceAnalyticsMutationMock
} = vi.hoisted(() => ({
  useClientHomeQueryMock: vi.fn(),
  useClientBookingsQueryMock: vi.fn(),
  useBarberProfileQueryMock: vi.fn(),
  usePaymentMethodsQueryMock: vi.fn(),
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
  useBarberProfileQuery: useBarberProfileQueryMock
}));

vi.mock("@/lib/payments/client", () => ({
  usePaymentMethodsQuery: usePaymentMethodsQueryMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceAnalyticsMutation: useMarketplaceAnalyticsMutationMock
}));

import { ClientHomeScreen } from "@/components/client-experience/client-home-screen";

describe("client home screen", () => {
  beforeEach(() => {
    useClientHomeQueryMock.mockReset();
    useClientBookingsQueryMock.mockReset();
    useBarberProfileQueryMock.mockReset();
    usePaymentMethodsQueryMock.mockReset();
    useMarketplaceAnalyticsMutationMock.mockReset();

    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis",
          favoriteBarberReference: "barber-wave"
        },
        locationId: "loc-ybor",
        trustedBarbers: [
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
        favoriteBarber: {
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
        },
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
          defaultPaymentMethod: {
            id: "pm-default",
            provider: "stripe",
            brand: "Visa",
            last4: "4242",
            expMonth: 12,
            expYear: 2029,
            isDefault: true,
            createdAt: "2026-04-01T00:00:00.000Z",
            label: "Visa ending in 4242"
          },
          latestBookingPayment: {
            id: "pay-1",
            appointmentId: "appt-next",
            amount: 55,
            currency: "usd",
            provider: "stripe",
            paymentStatus: "captured",
            paymentType: "booking",
            paidAt: "2026-04-20T00:00:00.000Z",
            createdAt: "2026-04-20T00:00:00.000Z"
          }
        },
        history: [
          {
            id: "appt-last",
            barberId: "barber-wave",
            serviceId: "srv-signature",
            locationId: "loc-ybor",
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

    usePaymentMethodsQueryMock.mockReturnValue({
      data: {
        methods: [
          {
            id: "pm-default",
            provider: "stripe",
            brand: "Visa",
            last4: "4242",
            expMonth: 12,
            expYear: 2029,
            isDefault: true,
            createdAt: "2026-04-01T00:00:00.000Z",
            label: "Visa ending in 4242"
          }
        ]
      },
      isLoading: false
    });

    useBarberProfileQueryMock.mockReturnValue({
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
    });
    useMarketplaceAnalyticsMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      mutate: vi.fn()
    });
  });

  it("renders the real rebook, upcoming, wallet, and history loop", () => {
    render(<ClientHomeScreen isSignedInClient displayName="Jordan Ellis" />);

    expect(screen.getByRole("link", { name: "Rebook" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book the next open chair" })).toBeInTheDocument();
    expect(screen.getByText("Upcoming appointment")).toBeInTheDocument();
    expect(screen.getAllByText("Signature Precision Cut").length).toBeGreaterThan(0);
    expect(screen.getByText("Wallet snapshot")).toBeInTheDocument();
    expect(screen.getByText("Visa ending in 4242")).toBeInTheDocument();
    expect(screen.getByText("Recent visits")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open full history" })).toBeInTheDocument();
  });

  it("shows clean empty states for a fresh client with no real history", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis",
          favoriteBarberReference: null
        },
        locationId: "loc-ybor",
        trustedBarbers: [],
        favoriteBarber: null,
        nextAvailableChair: null
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

    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false
    });

    useBarberProfileQueryMock.mockReturnValue({ data: null });

    render(<ClientHomeScreen isSignedInClient displayName="Jordan Ellis" />);

    expect(screen.getByText("Find your first barber, Jordan.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a barber" })).toBeInTheDocument();
    expect(screen.getByText("Nothing booked yet")).toBeInTheDocument();
    expect(screen.getByText("No barbers are accepting bookings here yet.")).toBeInTheDocument();
    expect(screen.getByText("No past appointments")).toBeInTheDocument();
  });
});
