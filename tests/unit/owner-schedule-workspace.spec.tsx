import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useShopDashboardQueryMock } = vi.hoisted(() => ({
  useShopDashboardQueryMock: vi.fn()
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useShopDashboardQuery: useShopDashboardQueryMock
}));

import { OwnerScheduleWorkspace } from "@/components/operations/owner-schedule-workspace";

describe("owner schedule workspace", () => {
  beforeEach(() => {
    useShopDashboardQueryMock.mockReset();
    useShopDashboardQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        appointments: [
          {
            id: "appt-1",
            barberId: "barber-maya",
            status: "confirmed",
            totalAmount: 65,
            balanceDue: 65,
            tipAmount: 0,
            note: "Leave more texture on top.",
            start: "2026-04-21T10:00:00.000Z",
            end: "2026-04-21T10:45:00.000Z",
            chair: "Chair 1",
            display: {
              clientName: "Jordan Ellis",
              barberName: "Maya Cole",
              serviceName: "Signature Cut",
              locationLabel: "BVRB3R Ybor",
              statusLabel: "Confirmed"
            }
          },
          {
            id: "appt-2",
            barberId: "barber-maya",
            status: "completed",
            totalAmount: 45,
            balanceDue: 0,
            tipAmount: 10,
            note: "",
            start: "2026-04-21T12:00:00.000Z",
            end: "2026-04-21T12:30:00.000Z",
            completedAt: "2026-04-21T12:35:00.000Z",
            chair: "Chair 1",
            display: {
              clientName: "Avery Fox",
              barberName: "Maya Cole",
              serviceName: "Buzz Cut",
              locationLabel: "BVRB3R Ybor",
              statusLabel: "Completed"
            }
          }
        ],
        barbers: [
          {
            id: "barber-maya",
            name: "Maya Cole",
            completedCount: 1,
            bookedCount: 1,
            utilization: 80,
            liveAppointmentCount: 0,
            nextAppointmentStart: "2026-04-21T10:00:00.000Z"
          }
        ]
      }
    });
  });

  it("renders the shop schedule from canonical appointments and gap truth", () => {
    render(<OwnerScheduleWorkspace />);

    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText("Maya Cole").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jordan Ellis").length).toBeGreaterThan(0);
    expect(screen.getByText("75 min open")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Jordan Ellis/i }));
    expect(screen.getByText("Leave more texture on top.")).toBeInTheDocument();
  });

  it("shows a clean empty state when the shop schedule has no appointments", () => {
    useShopDashboardQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        appointments: [],
        barbers: []
      }
    });

    render(<OwnerScheduleWorkspace />);

    expect(screen.getByText("Appointment details appear here once bookings exist in the current shop scope.")).toBeInTheDocument();
    expect(screen.getByText("The shop schedule will appear here once the first bookings are attached to this owner scope.")).toBeInTheDocument();
  });
});
