import { fireEvent, render, screen } from "@testing-library/react";
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

describe("BarberScheduleWorkspace", () => {
  beforeEach(() => {
    useBarberScheduleQueryMock.mockReturnValue({
      data: buildSchedulePayload(),
      isLoading: false,
      error: null
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
      error: null
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
});
