import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useShopDashboardQueryMock } = vi.hoisted(() => ({
  useShopDashboardQueryMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children?: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useShopDashboardQuery: useShopDashboardQueryMock
}));

import { TeamWorkspace } from "@/components/operations/team-workspace";

describe("team workspace", () => {
  beforeEach(() => {
    useShopDashboardQueryMock.mockReset();
  });

  it("renders canonical barber coverage and revenue from the live shop dashboard", () => {
    useShopDashboardQueryMock.mockReturnValue({
      data: {
        summary: {
          latestDate: "2026-04-22",
          revenueToday: 55,
          completedCount: 1,
          bookedToday: 1,
          checkedInCount: 0,
          inServiceCount: 0,
          readyForCheckoutCount: 0
        },
        barbers: [
          {
            id: "barber-wave",
            name: "Wave Carter",
            compensationModel: "commission",
            activeAppointmentCount: 1,
            liveAppointmentCount: 0,
            bookedCount: 1,
            completedCount: 1,
            utilization: 50,
            nextAppointmentStart: "2026-04-22T15:00:00.000Z"
          },
          {
            id: "barber-blaze",
            name: "Blaze King",
            compensationModel: "booth_rent",
            activeAppointmentCount: 0,
            liveAppointmentCount: 0,
            bookedCount: 0,
            completedCount: 0,
            utilization: 0,
            nextAppointmentStart: null
          }
        ],
        appointments: [
          {
            id: "appt-1",
            start: "2026-04-22T12:00:00.000Z",
            status: "completed",
            grandTotal: 55,
            totalAmount: 55,
            balanceDue: 0
          }
        ],
        walkIns: [],
        workflowEvents: [],
        locations: [
          {
            id: "loc-ybor",
            name: "Centro Ybor",
            neighborhood: "Ybor City",
            city: "Tampa",
            state: "FL",
            label: "Centro Ybor"
          }
        ]
      },
      isLoading: false,
      error: null
    });

    render(<TeamWorkspace viewerRole="manager" locationIds={["loc-ybor"]} />);

    expect(screen.getByText("Barbers, coverage, and floor pressure in one lane.")).toBeInTheDocument();
    expect(screen.getByText(/\$55(?:\.00)?/)).toBeInTheDocument();
    expect(screen.getByText("Wave Carter")).toBeInTheDocument();
    expect(screen.getByText("Blaze King")).toBeInTheDocument();
    expect(screen.getAllByText("Open chair").length).toBeGreaterThan(0);
  });

  it("shows honest empty states when no real barber roster exists", () => {
    useShopDashboardQueryMock.mockReturnValue({
      data: {
        summary: {
          latestDate: "2026-04-22",
          revenueToday: 0,
          completedCount: 0,
          bookedToday: 0,
          checkedInCount: 0,
          inServiceCount: 0,
          readyForCheckoutCount: 0
        },
        barbers: [],
        appointments: [],
        walkIns: [],
        workflowEvents: [],
        locations: []
      },
      isLoading: false,
      error: null
    });

    render(<TeamWorkspace viewerRole="front_desk" locationIds={[]} />);

    expect(screen.getByText("No real barbers are linked to this shop scope yet.")).toBeInTheDocument();
    expect(screen.getByText("No live team issues are waiting right now.")).toBeInTheDocument();
  });
});
