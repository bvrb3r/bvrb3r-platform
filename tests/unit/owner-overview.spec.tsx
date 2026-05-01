import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useShopDashboardQueryMock,
  useFintechManagementQueryMock,
  useFinancialAnomalyQueueQueryMock
} = vi.hoisted(() => ({
  useShopDashboardQueryMock: vi.fn(),
  useFintechManagementQueryMock: vi.fn(),
  useFinancialAnomalyQueueQueryMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useShopDashboardQuery: useShopDashboardQueryMock
}));

vi.mock("@/lib/fintech/client", () => ({
  useFintechManagementQuery: useFintechManagementQueryMock,
  useFinancialAnomalyQueueQuery: useFinancialAnomalyQueueQueryMock
}));

vi.mock("@/components/dashboard/revenue-chart", () => ({
  RevenueChart: () => <div data-testid="revenue-chart-stub">Revenue chart</div>
}));

vi.mock("@/components/operations/shop-manager-panel", () => ({
  ShopManagerPanel: () => <div data-testid="shop-manager-panel-stub">Shop manager panel</div>
}));

import { OwnerOverview } from "@/components/operations/owner-overview";

function mockCanonicalOwnerData() {
  useShopDashboardQueryMock.mockReturnValue({
    isLoading: false,
    error: null,
    data: {
      summary: {
        businessDate: "2026-04-21",
        revenueToday: 180,
        completedServicesToday: 2,
        completedCount: 2,
        outstandingBalance: 15,
        bookedToday: 3,
        paidAppointmentsToday: 2,
        checkedInCount: 1,
        inServiceCount: 0,
        readyForCheckoutCount: 1,
        queueAverageMinutes: 8
      },
      barbers: [
        {
          id: "barber-maya",
          name: "Maya Cole",
          compensationModel: "commission",
          activeAppointmentCount: 1,
          liveAppointmentCount: 0,
          bookedCount: 2,
          completedCount: 1,
          utilization: 70,
          nextAppointmentStart: "2026-04-21T15:00:00.000Z"
        },
        {
          id: "barber-ren",
          name: "Ren Hale",
          compensationModel: "booth_rent",
          activeAppointmentCount: 0,
          liveAppointmentCount: 0,
          bookedCount: 1,
          completedCount: 1,
          utilization: 30,
          nextAppointmentStart: null
        }
      ],
      activeBarbers: [
        {
          id: "barber-maya",
          name: "Maya Cole",
          compensationModel: "commission",
          activeAppointmentCount: 1,
          liveAppointmentCount: 0,
          bookedCount: 2,
          completedCount: 1,
          utilization: 70,
          nextAppointmentStart: "2026-04-21T15:00:00.000Z"
        }
      ],
      appointments: [
        {
          id: "appt-1",
          barberId: "barber-maya",
          status: "completed",
          totalAmount: 100,
          tipAmount: 20,
          balanceDue: 0,
          start: "2026-04-21T10:00:00.000Z",
          end: "2026-04-21T10:45:00.000Z",
          completedAt: "2026-04-21T10:45:00.000Z",
          display: {
            clientName: "Jordan Ellis",
            barberName: "Maya Cole",
            serviceName: "Signature Cut",
            locationName: "Ybor",
            locationLabel: "Ybor",
            statusLabel: "Completed"
          }
        },
        {
          id: "appt-2",
          barberId: "barber-ren",
          status: "completed",
          totalAmount: 60,
          tipAmount: 0,
          balanceDue: 15,
          start: "2026-04-21T12:00:00.000Z",
          end: "2026-04-21T12:30:00.000Z",
          completedAt: "2026-04-21T12:35:00.000Z",
          display: {
            clientName: "Avery Fox",
            barberName: "Ren Hale",
            serviceName: "Buzz Cut",
            locationName: "Ybor",
            locationLabel: "Ybor",
            statusLabel: "Ready for checkout"
          }
        }
      ],
      ownerAnalytics: [
        { businessDate: "2026-04-20", revenueTotal: 120, tipTotal: 12, completedServicesCount: 1 },
        { businessDate: "2026-04-21", revenueTotal: 180, tipTotal: 20, completedServicesCount: 2 }
      ],
      walkIns: [],
      locations: [{ id: "shop-ybor", name: "BVRB3R Ybor", neighborhood: "Ybor", city: "Tampa", state: "FL", label: "BVRB3R Ybor" }],
      workflowEvents: [
        {
          appointmentReference: "appt-2",
          title: "Checkout waiting",
          detail: "One completed ticket is still waiting on front-desk handoff.",
          actorRole: "front_desk",
          createdAt: "2026-04-21T12:40:00.000Z"
        }
      ]
    }
  });

  useFintechManagementQueryMock.mockReturnValue({
    isLoading: false,
    error: null,
    data: {
      summary: {
        totalAccounts: 2,
        readyAccounts: 1,
        blockedAccounts: 0,
        needsAttentionAccounts: 1,
        notReadyAccounts: 0,
        blockedRoutingRecords: 1,
        readyForPayoutAmount: 95
      },
      shops: [],
      barbers: [],
      memberships: [],
      blockedPayments: []
    }
  });

  useFinancialAnomalyQueueQueryMock.mockReturnValue({
    isLoading: false,
    error: null,
    data: {
      items: [
        {
          id: "anomaly-1",
          status: "open",
          summary: "Blocked routing needs review",
          description: "One routing row is blocked",
          anomalyType: "routing_blocked"
        }
      ]
    }
  });
}

describe("owner overview", () => {
  beforeEach(() => {
    useShopDashboardQueryMock.mockReset();
    useFintechManagementQueryMock.mockReset();
    useFinancialAnomalyQueueQueryMock.mockReset();
    mockCanonicalOwnerData();
  });

  it("renders the owner overview from canonical revenue, booking, and team truth", () => {
    render(<OwnerOverview />);

    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Live performance & insights")).toBeInTheDocument();
    expect(screen.getByText("Today Revenue")).toBeInTheDocument();
    expect(screen.getAllByText("$180").length).toBeGreaterThan(0);
    expect(screen.getByText("Projected unavailable")).toBeInTheDocument();
    expect(screen.getByText("Shop Share")).toBeInTheDocument();
    expect(screen.getAllByText("Utilization").length).toBeGreaterThan(0);
    expect(screen.getByText("Chairs Used")).toBeInTheDocument();
    expect(screen.getByText("Team Snapshot")).toBeInTheDocument();
    expect(screen.getByText("Maya")).toBeInTheDocument();
    expect(screen.getByText("$120")).toBeInTheDocument();
    expect(screen.getByText(/financial anomal/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^View all$/i })).toHaveAttribute("href", "/dashboard/owner/team");
    expect(screen.getByRole("link", { name: /Assign Walk-in/i })).toHaveAttribute("href", "/dashboard/owner/schedule?action=assign-walkin");
    expect(screen.queryByTestId("shop-manager-panel-stub")).not.toBeInTheDocument();
    expect(screen.queryByText("Quick insights")).not.toBeInTheDocument();
    expect(screen.queryByText("Walk-in queue")).not.toBeInTheDocument();
  });

  it("shows a clean no-demo empty state for a fresh owner lane", () => {
    useShopDashboardQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        summary: { businessDate: "2026-04-21", revenueToday: 0, completedCount: 0, outstandingBalance: 0, bookedToday: 0, paidAppointmentsToday: 0, queueAverageMinutes: 0 },
        barbers: [],
        activeBarbers: [],
        appointments: [],
        ownerAnalytics: [],
        walkIns: [],
        locations: [],
        workflowEvents: []
      }
    });
    useFintechManagementQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        summary: {
          totalAccounts: 0,
          readyAccounts: 0,
          blockedAccounts: 0,
          needsAttentionAccounts: 0,
          notReadyAccounts: 0,
          blockedRoutingRecords: 0,
          readyForPayoutAmount: 0
        },
        shops: [],
        barbers: [],
        memberships: [],
        blockedPayments: []
      }
    });
    useFinancialAnomalyQueueQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: { items: [] }
    });

    render(<OwnerOverview />);

    expect(screen.getByText("No active team members yet.")).toBeInTheDocument();
    expect(screen.getByText("Invite barbers to start tracking performance.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Invite Barber/i })).toHaveAttribute("href", "/dashboard/owner/team");
    expect(screen.getByText("No urgent alerts right now.")).toBeInTheDocument();
    expect(screen.getByText("Your shop is operating normally.")).toBeInTheDocument();
    expect(screen.queryByText("Fresh owner setup")).not.toBeInTheDocument();
  });
});
