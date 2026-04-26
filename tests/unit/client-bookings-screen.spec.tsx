import { render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useSearchParamsMock,
  usePwaMock,
  useClientHomeQueryMock,
  useClientBookingsQueryMock,
  useCancelBookingMutationMock,
  useSubmitClientReviewMutationMock,
  useCreateAppointmentPaymentMutationMock
} = vi.hoisted(() => ({
  useSearchParamsMock: vi.fn(),
  usePwaMock: vi.fn(),
  useClientHomeQueryMock: vi.fn(),
  useClientBookingsQueryMock: vi.fn(),
  useCancelBookingMutationMock: vi.fn(),
  useSubmitClientReviewMutationMock: vi.fn(),
  useCreateAppointmentPaymentMutationMock: vi.fn()
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
  useClientHomeQuery: useClientHomeQueryMock,
  useClientBookingsQuery: useClientBookingsQueryMock,
  useCancelBookingMutation: useCancelBookingMutationMock,
  useSubmitClientReviewMutation: useSubmitClientReviewMutationMock
}));

vi.mock("@/lib/payments/client", () => ({
  useCreateAppointmentPaymentMutation: useCreateAppointmentPaymentMutationMock
}));

import { ClientBookingsScreen } from "@/components/client-experience/client-bookings-screen";

describe("client bookings screen", () => {
  beforeEach(() => {
    useSearchParamsMock.mockReset();
    usePwaMock.mockReset();
    useClientHomeQueryMock.mockReset();
    useClientBookingsQueryMock.mockReset();
    useCancelBookingMutationMock.mockReset();
    useSubmitClientReviewMutationMock.mockReset();
    useCreateAppointmentPaymentMutationMock.mockReset();

    useSearchParamsMock.mockReturnValue({
      get: vi.fn().mockReturnValue(null)
    });
    usePwaMock.mockReturnValue({ isOnline: true });
    useClientHomeQueryMock.mockReturnValue({
      data: {
        hasResolvedLocation: true,
        nextAvailableChair: {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          matchedFrom: "available_now",
          appointmentTime: "2026-04-28T15:00:00.000Z",
          locationId: "loc-ybor"
        }
      }
    });
    useClientBookingsQueryMock.mockReturnValue({
      data: {
        favoriteBarber: {
          barber: { id: "barber-wave", name: "Wave Carter" },
          profile: {
            username: "wave",
            profilePhotoUrl: "https://example.com/wave.jpg"
          }
        },
        upcoming: [
          {
            id: "appt-next",
            barberId: "barber-wave",
            serviceId: "srv-signature",
            locationId: "loc-ybor",
            revision: 3,
            status: "confirmed",
            start: "2026-04-28T14:00:00.000Z",
            totalAmount: 55,
            grandTotal: 55,
            balanceDue: 45,
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
          }
        ],
        nextAppointment: {
          id: "appt-next",
          barberId: "barber-wave",
          serviceId: "srv-signature",
          locationId: "loc-ybor",
          revision: 3,
          status: "confirmed",
          start: "2026-04-28T14:00:00.000Z",
          totalAmount: 55,
          grandTotal: 55,
          balanceDue: 45,
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
          outstandingBalance: 45,
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
            status: "completed",
            start: "2026-04-18T14:00:00.000Z",
            totalAmount: 55,
            grandTotal: 65,
            balanceDue: 0,
            canReview: true,
            review: null,
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
            },
            receipt: {
              paymentMethodLabel: "Visa ending in 4242",
              lines: [],
              totals: {
                gross: 55,
                tax: 5,
                tip: 5,
                total: 65
              }
            },
            breakdown: {
              gross: 55,
              tax: 5,
              tip: 5,
              total: 65,
              platformFee: 3,
              payoutStatus: "released"
            },
            moneyTimeline: {
              paymentStatus: "captured"
            }
          }
        ]
      },
      isLoading: false,
      error: null
    });
    useCancelBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useSubmitClientReviewMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
    useCreateAppointmentPaymentMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("renders upcoming appointments and past appointments with receipt actions", () => {
    render(<ClientBookingsScreen />);

    expect(screen.getByText("Upcoming Appointments")).toBeInTheDocument();
    expect(screen.getByText("Past Appointments / Receipts")).toBeInTheDocument();
    expect(screen.getAllByText("Wave Carter").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Message Barber" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Receipt" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book Again" })).toBeInTheDocument();
    expect(screen.queryByText("Choose your go-to barber")).not.toBeInTheDocument();
  });

  it("shows clean empty states when no upcoming or past appointments exist", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: {
        hasResolvedLocation: false,
        nextAvailableChair: null
      }
    });
    useClientBookingsQueryMock.mockReturnValue({
      data: {
        favoriteBarber: null,
        upcoming: [],
        nextAppointment: null,
        nextAppointmentPayment: null,
        history: []
      },
      isLoading: false,
      error: null
    });

    render(<ClientBookingsScreen />);

    expect(screen.getByText("No upcoming appointments")).toBeInTheDocument();
    expect(screen.getByText("Book your next cut.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a Barber" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add Location" })).toBeInTheDocument();
    expect(screen.getByText("No past visits yet.")).toBeInTheDocument();
  });
});
