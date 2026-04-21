import { render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useSearchParamsMock,
  usePwaMock,
  useClientBookingsQueryMock,
  useCancelBookingMutationMock,
  useClientPointsBalanceQueryMock,
  useSaveClientRoutineMutationMock,
  useSubmitClientReviewMutationMock,
  useCreateAppointmentPaymentMutationMock,
  usePointsHistoryQueryMock,
  useMarketplaceAnalyticsMutationMock
} = vi.hoisted(() => ({
  useSearchParamsMock: vi.fn(),
  usePwaMock: vi.fn(),
  useClientBookingsQueryMock: vi.fn(),
  useCancelBookingMutationMock: vi.fn(),
  useClientPointsBalanceQueryMock: vi.fn(),
  useSaveClientRoutineMutationMock: vi.fn(),
  useSubmitClientReviewMutationMock: vi.fn(),
  useCreateAppointmentPaymentMutationMock: vi.fn(),
  usePointsHistoryQueryMock: vi.fn(),
  useMarketplaceAnalyticsMutationMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useSearchParams: useSearchParamsMock
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

vi.mock("@/components/pwa/pwa-provider", () => ({
  usePwa: usePwaMock
}));

vi.mock("@/lib/booking/client", () => ({
  useClientBookingsQuery: useClientBookingsQueryMock,
  useCancelBookingMutation: useCancelBookingMutationMock,
  useClientPointsBalanceQuery: useClientPointsBalanceQueryMock,
  useSaveClientRoutineMutation: useSaveClientRoutineMutationMock,
  useSubmitClientReviewMutation: useSubmitClientReviewMutationMock
}));

vi.mock("@/lib/payments/client", () => ({
  useCreateAppointmentPaymentMutation: useCreateAppointmentPaymentMutationMock
}));

vi.mock("@/lib/points/client", () => ({
  usePointsHistoryQuery: usePointsHistoryQueryMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceAnalyticsMutation: useMarketplaceAnalyticsMutationMock
}));

import { ClientBookingsScreen } from "@/components/client-experience/client-bookings-screen";

describe("client bookings screen", () => {
  beforeEach(() => {
    useSearchParamsMock.mockReset();
    usePwaMock.mockReset();
    useClientBookingsQueryMock.mockReset();
    useCancelBookingMutationMock.mockReset();
    useClientPointsBalanceQueryMock.mockReset();
    useSaveClientRoutineMutationMock.mockReset();
    useSubmitClientReviewMutationMock.mockReset();
    useCreateAppointmentPaymentMutationMock.mockReset();
    usePointsHistoryQueryMock.mockReset();
    useMarketplaceAnalyticsMutationMock.mockReset();

    useSearchParamsMock.mockReturnValue({
      get: vi.fn((key: string) => (key === "intent" ? "cancel" : null))
    });
    usePwaMock.mockReturnValue({ isOnline: true });
    useClientBookingsQueryMock.mockReturnValue({
      data: {
        client: {
          favoriteBarberReference: "barber-wave"
        },
        favoriteBarber: {
          barber: { id: "barber-wave", name: "Wave Carter" },
          profile: {
            username: "wave",
            headline: "Precision fades that hold their shape.",
            specialties: ["Precision fades"]
          },
          proof: { reviewScore: 4.9 },
          shopLocations: [
            {
              id: "loc-ybor",
              name: "Centro Ybor Flagship",
              neighborhood: "Ybor City",
              city: "Tampa",
              state: "FL",
              address: "1600 7th Ave"
            }
          ],
          bookingCtaHref: "/booking/new?barberId=barber-wave&serviceId=srv-signature",
          mostBookedService: {
            service: { id: "srv-signature" }
          }
        },
        nextAppointment: {
          id: "appt-next",
          barberId: "barber-wave",
          serviceId: "srv-signature",
          locationId: "loc-ybor",
          revision: 3,
          start: "2026-04-28T14:00:00.000Z",
          totalAmount: 55,
          balanceDue: 45,
          depositAmount: 10,
          view: {
            barber: { name: "Wave Carter" },
            service: { name: "Signature Precision Cut" },
            location: {
              name: "Centro Ybor Flagship",
              neighborhood: "Ybor City",
              city: "Tampa",
              state: "FL",
              address: "1600 7th Ave"
            }
          }
        },
        nextAppointmentPayment: {
          latestBookingPayment: {
            paymentStatus: "captured"
          },
          defaultPaymentMethod: {
            id: "pm-default",
            label: "Visa ending in 4242"
          }
        },
        history: [
          {
            id: "appt-past",
            barberId: "barber-wave",
            serviceId: "srv-signature",
            locationId: "loc-ybor",
            start: "2026-04-18T14:00:00.000Z",
            totalAmount: 55,
            grandTotal: 55,
            balanceDue: 0,
            canReview: false,
            view: {
              barber: { name: "Wave Carter" },
              service: { name: "Signature Precision Cut" },
              location: { name: "Centro Ybor Flagship" }
            }
          }
        ],
        routine: null
      },
      isLoading: false,
      error: null
    });
    useClientPointsBalanceQueryMock.mockReturnValue({
      data: {
        unlockedPoints: 120,
        pendingPoints: 20,
        inAppValue: 12
      }
    });
    useSaveClientRoutineMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useCancelBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useSubmitClientReviewMutationMock.mockReturnValue({
      isPending: false,
      variables: null,
      mutateAsync: vi.fn()
    });
    useCreateAppointmentPaymentMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    usePointsHistoryQueryMock.mockReturnValue({
      data: {
        transactions: []
      }
    });
    useMarketplaceAnalyticsMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      mutate: vi.fn()
    });
  });

  it("renders the canonical upcoming booking and opens the reschedule-first cancel state", () => {
    render(<ClientBookingsScreen />);

    expect(screen.getByText("Your next appointment")).toBeInTheDocument();
    expect(screen.getAllByText("Signature Precision Cut").length).toBeGreaterThan(0);
    expect(screen.getByText("Would you like to reschedule instead?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a new slot" })).toBeInTheDocument();
  });

  it("shows clean empty states when no upcoming or past appointments exist", () => {
    useSearchParamsMock.mockReturnValue({
      get: vi.fn().mockReturnValue(null)
    });
    useClientBookingsQueryMock.mockReturnValue({
      data: {
        client: {
          favoriteBarberReference: null
        },
        favoriteBarber: null,
        nextAppointment: null,
        nextAppointmentPayment: null,
        history: [],
        routine: null
      },
      isLoading: false,
      error: null
    });

    render(<ClientBookingsScreen />);

    expect(screen.getByText("You do not have a next appointment on the calendar.")).toBeInTheDocument();
    expect(screen.getByText("No completed visits yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a barber" })).toBeInTheDocument();
  });
});
