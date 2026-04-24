import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useShopDashboardQueryMock,
  useFintechManagementQueryMock,
  useFintechPayoutsQueryMock,
  useFinancialAnomalyQueueQueryMock
} = vi.hoisted(() => ({
  useShopDashboardQueryMock: vi.fn(),
  useFintechManagementQueryMock: vi.fn(),
  useFintechPayoutsQueryMock: vi.fn(),
  useFinancialAnomalyQueueQueryMock: vi.fn()
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useShopDashboardQuery: useShopDashboardQueryMock
}));

vi.mock("@/lib/fintech/client", () => ({
  useFintechManagementQuery: useFintechManagementQueryMock,
  useFintechPayoutsQuery: useFintechPayoutsQueryMock,
  useFinancialAnomalyQueueQuery: useFinancialAnomalyQueueQueryMock
}));

import { OwnerMoneyWorkspace } from "@/components/operations/owner-money-workspace";

describe("owner money workspace", () => {
  beforeEach(() => {
    useShopDashboardQueryMock.mockReset();
    useFintechManagementQueryMock.mockReset();
    useFintechPayoutsQueryMock.mockReset();
    useFinancialAnomalyQueueQueryMock.mockReset();

    useShopDashboardQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        summary: {
          businessDate: "2026-04-21",
          revenueToday: 180,
          completedCount: 2
        },
        ownerAnalytics: [
          { businessDate: "2026-04-18", revenueTotal: 80, tipTotal: 5, completedServicesCount: 1 },
          { businessDate: "2026-04-20", revenueTotal: 120, tipTotal: 12, completedServicesCount: 2 },
          { businessDate: "2026-04-21", revenueTotal: 180, tipTotal: 20, completedServicesCount: 2 }
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
              serviceName: "Signature Cut"
            }
          }
        ],
        barbers: [
          {
            id: "barber-maya",
            name: "Maya Cole",
            utilization: 70
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
        blockedPayments: [
          {
            id: "routing-1",
            platformFeeAmount: 9,
            barberPayoutAmount: 60,
            shopSplitAmount: 31
          }
        ]
      }
    });

    useFintechPayoutsQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        summary: {
          executableRoutingRecords: 1,
          readyForPayoutAmount: 95,
          blockedExecutionRecords: 1,
          failedExecutionRecords: 0,
          executedTransferCount: 1,
          reversedExecutionCount: 0,
          executedAmount: 120,
          reversedAmount: 0,
          processorFeeTracked: 4
        },
        readyRouting: [
          {
            id: "routing-2",
            platformFeeAmount: 6,
            barberPayoutAmount: 45,
            shopSplitAmount: 24
          }
        ],
        recentExecutions: [
          {
            id: "payout-1",
            targetDisplayName: "Maya Cole",
            barberName: "Maya Cole",
            shopLabel: "BVRB3R Ybor",
            executionStatus: "executed",
            executionType: "transfer",
            amount: 120,
            blockedReason: null,
            failureReason: null,
            payoutSpeed: "standard",
            providerFeeAmount: 0
          }
        ]
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
            summary: "Routing blocked on one payment",
            description: "One payment is waiting on routing cleanup",
            anomalyType: "routing_blocked"
          }
        ]
      }
    });
  });

  it("renders revenue, routing, payout, and anomaly truth from canonical money systems", () => {
    render(<OwnerMoneyWorkspace />);

    expect(screen.getByText("Money")).toBeInTheDocument();
    expect(screen.getAllByText("$180").length).toBeGreaterThan(0);
    expect(screen.getByText("Open platform fees")).toBeInTheDocument();
    expect(screen.getByText("Recent revenue")).toBeInTheDocument();
    expect(screen.getByText("Maya Cole")).toBeInTheDocument();
    expect(screen.getByText("Routing blocked on one payment")).toBeInTheDocument();
  });

  it("shows clean empty states when no revenue or payouts exist yet", () => {
    useShopDashboardQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        summary: {
          businessDate: "2026-04-21",
          revenueToday: 0,
          completedCount: 0
        },
        ownerAnalytics: [],
        appointments: [],
        barbers: []
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
    useFintechPayoutsQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        summary: {
          executableRoutingRecords: 0,
          readyForPayoutAmount: 0,
          blockedExecutionRecords: 0,
          failedExecutionRecords: 0,
          executedTransferCount: 0,
          reversedExecutionCount: 0,
          executedAmount: 0,
          reversedAmount: 0,
          processorFeeTracked: 0
        },
        readyRouting: [],
        recentExecutions: []
      }
    });
    useFinancialAnomalyQueueQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: { items: [] }
    });

    render(<OwnerMoneyWorkspace />);

    expect(screen.getByText("No payout executions are recorded yet for this owner scope.")).toBeInTheDocument();
    expect(screen.getByText("No financial anomalies are open in this owner scope right now.")).toBeInTheDocument();
    expect(screen.getByText("Revenue activity will appear here once the first completed appointments post.")).toBeInTheDocument();
  });
});
