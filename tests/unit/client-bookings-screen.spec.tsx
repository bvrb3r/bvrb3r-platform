import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        },
        defaultPaymentMethod: {
          id: "pm-default",
          label: "Visa ending in 4242",
          isDefault: true
        },
        recommendedBarbers: [
          {
            barberId: "barber-wave",
            username: "wave",
            barberName: "Wave Carter"
          }
        ],
        trustedBarbers: []
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
    expect(screen.getAllByText("wave").length).toBeGreaterThan(0);
    expect(screen.queryByText("Wave Carter")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Message Barber" })).toHaveAttribute("href", "/dashboard/client/messages");
    expect(screen.getByRole("button", { name: "View Receipt" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book Again" })).toBeInTheDocument();
    expect(screen.queryByText("Choose your go-to barber")).not.toBeInTheDocument();
  });

  it("shows clean empty states when no upcoming or past appointments exist", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: {
        hasResolvedLocation: false,
        nextAvailableChair: null,
        defaultPaymentMethod: null
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
    expect(screen.getByRole("button", { name: "Get a Cut Now" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add Location" })).not.toBeInTheDocument();
    expect(screen.getByText("No past visits yet.")).toBeInTheDocument();
  });

  it("confirms cancellation, hides the upcoming appointment, and shows success", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      ok: true,
      refund_status: "not_applied",
      appointment: {
        id: "appt-next",
        revision: 4,
        status: "cancelled",
        cancelledAt: "2026-04-28T13:30:00.000Z",
        updatedAt: "2026-04-28T13:30:00.000Z"
      }
    });
    useCancelBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });

    render(<ClientBookingsScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Cancel this appointment?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Cancel" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        appointmentId: "appt-next",
        expectedRevision: 3
      });
    });
    await waitFor(() => expect(screen.getByText("Appointment cancelled.")).toBeInTheDocument());
    expect(screen.queryByText("Appointment could not be cancelled. Refresh and try again.")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel this appointment?")).not.toBeInTheDocument();
    expect(screen.getByText("No upcoming appointments")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();
  });

  it("does not show a false cancellation error when the latest appointment is already cancelled", async () => {
    const cancellationError = Object.assign(new Error("background refetch failed"), {
      latestAppointment: {
        id: "appt-next",
        revision: 4,
        status: "cancelled",
        cancelledAt: "2026-04-28T13:30:00.000Z",
        updatedAt: "2026-04-28T13:30:00.000Z"
      }
    });
    const mutateAsync = vi.fn().mockRejectedValue(cancellationError);
    useCancelBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });

    render(<ClientBookingsScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Cancel" }));

    await waitFor(() => expect(screen.getByText("Appointment cancelled.")).toBeInTheDocument());
    expect(screen.queryByText("Appointment could not be cancelled. Refresh and try again.")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel this appointment?")).not.toBeInTheDocument();
    expect(screen.getByText("No upcoming appointments")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();
  });

  it("keeps the confirmation panel open and shows a visible error when cancellation fails", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("database exploded"));
    useCancelBookingMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });

    render(<ClientBookingsScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Cancel" }));

    await waitFor(() => {
      expect(screen.getByText("Appointment could not be cancelled. Refresh and try again.")).toBeInTheDocument();
    });
    expect(screen.getByText("Cancel this appointment?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Cancel" })).toBeInTheDocument();
  });
});
