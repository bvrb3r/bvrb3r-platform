import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BarberScheduleWorkspace } from "@/components/operations/barber-schedule-workspace";

const {
  pushMock,
  useBarberLifecycleMutationMock,
  useBarberScheduleQueryMock,
  useCreateMessageThreadMutationMock,
  useUpdateBarberScheduleMutationMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useBarberLifecycleMutationMock: vi.fn(),
  useBarberScheduleQueryMock: vi.fn(),
  useCreateMessageThreadMutationMock: vi.fn(),
  useUpdateBarberScheduleMutationMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock
  })
}));

vi.mock("@/lib/operations/barber-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/operations/barber-client")>();
  return {
    ...actual,
    useBarberLifecycleMutation: useBarberLifecycleMutationMock,
    useBarberScheduleQuery: useBarberScheduleQueryMock,
    useUpdateBarberScheduleMutation: useUpdateBarberScheduleMutationMock
  };
});

vi.mock("@/lib/messages/client", () => ({
  useCreateMessageThreadMutation: useCreateMessageThreadMutationMock
}));

function buildSchedulePayload() {
  return {
    barberId: "barber-1",
    barberName: "Blaze King",
    businessDate: "2026-04-27",
    shops: [
      {
        id: "loc-ybor",
        label: "The BVRB3R Shop"
      }
    ],
    status: {
      barberId: "barber-1",
      currentShopId: "loc-ybor",
      currentShopLabel: "The BVRB3R Shop",
      liveStatus: "available",
      liveStatusLabel: "Available",
      isOnline: true,
      acceptsWalkIns: true,
      nextAvailableAt: null,
      lastSeenAt: null,
      updatedAt: null,
      note: ""
    },
    todayAppointments: [],
    upcomingAppointments: [],
    timeline: {
      viewMode: "day",
      anchorDate: "2026-04-27",
      rangeStart: "2026-04-27T00:00:00.000Z",
      rangeEnd: "2026-04-27T23:59:59.000Z",
      rangeLabel: "Apr 27",
      appointments: []
    },
    workingHours: [],
    blockedTimes: []
  };
}

function buildAppointment(status = "confirmed") {
  const payoutEligible = status === "completed";
  const statusLabel = status === "checked_in"
    ? "Checked in"
    : status === "completed"
      ? "Completed"
      : status === "no_show"
        ? "No-show"
        : status === "cancelled"
          ? "Canceled"
          : "Confirmed";
  return {
    id: "172b11d3-9319-536c-adb5-f548ae8fc775",
    locationId: "loc-ybor",
    barberId: "barber-1",
    clientId: "client-1",
    serviceId: "srv-test",
    status,
    source: "booking",
    bookingSource: "public_profile",
    start: "2026-04-27T14:00:00.000Z",
    end: "2026-04-27T14:15:00.000Z",
    chair: "Phils chair",
    addOnIds: [],
    depositAmount: 5,
    serviceTotal: 5,
    addOnTotal: 0,
    subtotal: 5,
    discountTotal: 0,
    taxTotal: 0,
    totalAmount: 5,
    grandTotal: 5,
    balanceDue: 0,
    tipAmount: 0,
    note: "",
    revision: status === "confirmed" ? 1 : 2,
    updatedAt: "2026-04-27T13:55:00.000Z",
    display: {
      clientName: "Phillip mcgee",
      clientProfilePhotoUrl: null,
      serviceName: "test cut",
      locationName: "Phils chair",
      locationLabel: "Phils chair",
      statusLabel,
      lifecycleDetail: "Ready"
    },
    serviceSnapshot: null,
    financial: {
      latestStatus: "captured",
      latestStatusLabel: "Paid in full",
      authorizedAmount: 0,
      capturedAmount: 5,
      refundedAmount: 0,
      tipAmount: 0,
      outstandingBalance: 0,
      paymentMethodBrand: "visa",
      paymentMethodLast4: "4242",
      receiptNumber: "Receipt 4242",
      paidAt: "2026-04-27T13:55:00.000Z",
      payoutReadinessStatus: payoutEligible ? "eligible" : "needs_attention",
      moneyRoutingStatus: "pending",
      eligibleAt: payoutEligible ? "2026-04-27T14:16:00.000Z" : null,
      releasedAt: null,
      barberPayoutAmount: payoutEligible ? 4.75 : null,
      platformFeeAmount: payoutEligible ? 0.25 : null,
      shopSplitAmount: 0
    }
  };
}

describe("BarberScheduleWorkspace", () => {
  beforeEach(() => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: buildSchedulePayload(),
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useUpdateBarberScheduleMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
    useCreateMessageThreadMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });
  });

  it("renders a full 24-hour calendar timeline without availability controls", () => {
    render(
      <BarberScheduleWorkspace
        barberName="Blaze King"
        surface="calendar"
      />
    );

    expect(screen.getByText("12 AM")).toBeInTheDocument();
    expect(screen.getByText("11 PM")).toBeInTheDocument();
    expect(screen.queryByText("Working hours and blocked time")).not.toBeInTheDocument();
    expect(screen.queryByText("Availability control")).not.toBeInTheDocument();
  });

  it("renders availability controls only on the More surface", () => {
    render(
      <BarberScheduleWorkspace
        barberName="Blaze King"
        surface="availability"
      />
    );

    expect(screen.getByText("Working hours and blocked time")).toBeInTheDocument();
    expect(screen.queryByText("Hour-by-hour chair control")).not.toBeInTheDocument();
  });

  it("routes open slot booking through the canonical booking flow", () => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: {
        ...buildSchedulePayload(),
        workingHours: [
          {
            locationId: "loc-ybor",
            locationLabel: "The BVRB3R Shop",
            weekday: 1,
            startTime: "09:00",
            endTime: "10:00"
          }
        ]
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(
      <BarberScheduleWorkspace
        barberName="Blaze King"
        surface="calendar"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Book this slot/i }));

    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("/booking/new?"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("barberId=barber-1"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("locationId=loc-ybor"));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("appointmentTime="));
  });

  it("keeps cancelled appointments visible while releasing their calendar slot", () => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: {
        ...buildSchedulePayload(),
        workingHours: [
          {
            locationId: "loc-ybor",
            locationLabel: "The BVRB3R Shop",
            weekday: 1,
            startTime: "10:00",
            endTime: "10:15"
          }
        ],
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [buildAppointment("cancelled")]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(
      <BarberScheduleWorkspace
        barberName="Blaze King"
        surface="calendar"
      />
    );

    expect(screen.getByText("Canceled")).toBeInTheDocument();
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Book this slot/i })).toBeInTheDocument();
    expect(screen.getAllByText("10:00 AM - 10:15 AM")).toHaveLength(2);
  });

  it("opens appointment details from the calendar card", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    expect(screen.queryByRole("button", { name: /Check in/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));

    expect(await screen.findByText("Appointment Details")).toBeInTheDocument();
    expect(screen.getAllByText("Phillip mcgee")[0]).toBeInTheDocument();
    expect(screen.getAllByText("test cut")[0]).toBeInTheDocument();
    expect(screen.getByText("Visa 4242")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View Transaction/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Complete Service/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel Appointment/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mark as No-Show/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Book Next/i })).toBeInTheDocument();
  });

  it("completes service directly from a confirmed appointment", async () => {
    let payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    const refetchMock = vi.fn(async () => {
      payload = {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [buildAppointment("completed")]
        }
      };
      return { data: payload };
    });
    const mutateAsync = vi.fn(async () => {
      payload = {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [buildAppointment("completed")]
        }
      };
      return {
        ok: true,
        appointment: buildAppointment("completed"),
        routing: {
          status: "eligible",
          payoutReadinessStatus: "eligible",
          moneyRoutingStatus: "pending",
          eligibleAt: "2026-04-27T14:16:00.000Z",
          releasedAt: null,
          barberAmountCents: 475,
          platformAmountCents: 25,
          shopAmountCents: 0,
          barberPayoutAmount: 4.75,
          platformFeeAmount: 0.25,
          shopSplitAmount: 0
        }
      };
    });
    useBarberScheduleQueryMock.mockImplementation(() => ({
      data: payload,
      isLoading: false,
      error: null,
      refetch: refetchMock
    }));
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Complete Service/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      appointmentId: "172b11d3-9319-536c-adb5-f548ae8fc775",
      expectedRevision: 1,
      action: "service_complete",
      reason: undefined
    }));
    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Appointment Details")).not.toBeInTheDocument());
    expect(await screen.findByText("Service completed. Payout is now eligible.")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Payout eligible")).toBeInTheDocument();
  });

  it("closes details and shows a routing review warning when completion needs repair", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    const refetchMock = vi.fn(async () => ({ data: payload }));
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: refetchMock
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync: vi.fn(async () => ({
        ok: true,
        warning: "Service completed. Payout routing requires review.",
        appointment: buildAppointment("completed"),
        routing: {
          status: "repair_required",
          payoutReadinessStatus: "repair_required",
          moneyRoutingStatus: "manual_review",
          eligibleAt: null,
          releasedAt: null,
          barberAmountCents: 0,
          platformAmountCents: 0,
          shopAmountCents: 0
        }
      })),
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Complete Service/i }));

    await waitFor(() => expect(screen.queryByText("Appointment Details")).not.toBeInTheDocument());
    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
    expect(await screen.findByText("Service completed. Payout routing requires review.")).toBeInTheDocument();
  });

  it("shows a visible error when a details action fails", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Check-in could not be completed. Refresh and try again.")),
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Complete Service/i }));

    expect(await screen.findByText("Service could not be completed. Refresh and try again.")).toBeInTheDocument();
    expect(screen.getByText("Appointment Details")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Complete Service/i })).toBeInTheDocument();
  });

  it("hides Complete Service and shows payout state for completed details", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("completed")]
      }
    };
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    expect(screen.getByText("Payout eligible")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));

    expect(await screen.findByText("Service complete")).toBeInTheDocument();
    expect(screen.getByText("Payout eligible - Expected payout $4.75")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Complete Service/i })).not.toBeInTheDocument();
  });

  it("opens transaction details with safe receipt and refund placeholders", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(await screen.findByRole("button", { name: /View Transaction/i }));

    expect(await screen.findByText("Transaction Details")).toBeInTheDocument();
    expect(screen.getByText("Card Payment")).toBeInTheDocument();
    expect(screen.getByText(/Visa 4242/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New Receipt/i }));
    expect(await screen.findByText("Receipt resend is coming soon.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Issue Refund/i }));
    expect(await screen.findByText("Refunds are not available from this screen yet.")).toBeInTheDocument();
  });

  it("confirms cancel from details", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    const mutateAsync = vi.fn(async (input: { action: string }) => ({ ok: true, appointment: buildAppointment(input.action === "cancel" ? "cancelled" : "no_show") }));
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Cancel Appointment/i }));
    const cancelButtons = screen.getAllByRole("button", { name: /^Cancel appointment$/i });
    fireEvent.click(cancelButtons[0]);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      action: "cancel",
      reason: "Canceled by barber"
    })));
  });

  it("confirms no-show from details", async () => {
    const payload = {
      ...buildSchedulePayload(),
      timeline: {
        ...buildSchedulePayload().timeline,
        appointments: [buildAppointment("confirmed")]
      }
    };
    const mutateAsync = vi.fn(async () => ({ ok: true, appointment: buildAppointment("no_show") }));
    useBarberScheduleQueryMock.mockReturnValue({
      data: payload,
      isLoading: false,
      error: null,
      refetch: vi.fn()
    });
    useBarberLifecycleMutationMock.mockReturnValue({
      mutateAsync,
      isPending: false
    });

    render(<BarberScheduleWorkspace barberName="Blaze King" surface="calendar" />);

    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Mark as No-Show/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Mark no-show$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      action: "no_show",
      reason: "Marked no-show by barber"
    })));
  });
});
