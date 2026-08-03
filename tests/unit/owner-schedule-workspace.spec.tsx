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
    expect(screen.getByText("All chairs & bookings")).toBeInTheDocument();
    expect(screen.getByText("Bookings")).toBeInTheDocument();
    expect(screen.getByText("Open Slots")).toBeInTheDocument();
    expect(screen.getAllByText("Maya").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jordan Ellis").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/75 minutes/).length).toBeGreaterThan(0);

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

    expect(screen.getByText("Build your floor.")).toBeInTheDocument();
    expect(screen.getByText("Invite barbers to connect your shop team, then configure shop chairs to build the schedule.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Invite your first barber/ })).toHaveAttribute("href", "/dashboard/owner/team");
    expect(screen.queryByRole("link", { name: "Configure Shop Hours" })).not.toBeInTheDocument();
  });

  it("routes missing schedule-data actions to existing owner surfaces", () => {
    useShopDashboardQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        appointments: [],
        barbers: [
          {
            id: "barber-maya",
            name: "Maya Cole",
            completedCount: 0,
            bookedCount: 0,
            utilization: 0,
            liveAppointmentCount: 0,
            nextAppointmentStart: null
          }
        ]
      }
    });

    render(<OwnerScheduleWorkspace />);

    expect(screen.getByText("Your day is open.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Set shop hours/ })).toHaveAttribute("href", "/dashboard/owner/more?section=shop-hours");
    expect(screen.queryByRole("link", { name: "Review Team" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add Availability" })).not.toBeInTheDocument();
  });
});
