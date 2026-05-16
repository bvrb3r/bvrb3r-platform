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
      statusLabel: status === "checked_in" ? "Checked in" : "Confirmed",
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
      outstandingBalance: 0
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

  it("updates the calendar action after a successful check-in", async () => {
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
          appointments: [buildAppointment("checked_in")]
        }
      };
      return { data: payload };
    });
    const mutateAsync = vi.fn(async () => {
      payload = {
        ...buildSchedulePayload(),
        timeline: {
          ...buildSchedulePayload().timeline,
          appointments: [buildAppointment("checked_in")]
        }
      };
      return { ok: true, appointment: buildAppointment("checked_in") };
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

    fireEvent.click(screen.getByRole("button", { name: /Check in/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      appointmentId: "172b11d3-9319-536c-adb5-f548ae8fc775",
      expectedRevision: 1,
      action: "check_in"
    }));
    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: /Start service/i })).toBeInTheDocument();
  });

  it("shows a visible error when check-in fails", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: /Check in/i }));

    expect(await screen.findByText("Check-in could not be completed. Refresh and try again.")).toBeInTheDocument();
  });
});
