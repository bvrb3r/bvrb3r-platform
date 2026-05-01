import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useShopDashboardQueryMock,
  useFintechManagementQueryMock
} = vi.hoisted(() => ({
  useShopDashboardQueryMock: vi.fn(),
  useFintechManagementQueryMock: vi.fn()
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
  useFintechManagementQuery: useFintechManagementQueryMock
}));

import { OwnerTeamWorkspace } from "@/components/operations/owner-team-workspace";

describe("owner team workspace", () => {
  beforeEach(() => {
    useShopDashboardQueryMock.mockReset();
    useFintechManagementQueryMock.mockReset();

    useShopDashboardQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
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
            completedCount: 0,
            utilization: 30,
            nextAppointmentStart: null
          }
        ],
        appointments: [
          {
            id: "appt-1",
            barberId: "barber-maya",
            status: "completed",
            totalAmount: 90,
            tipAmount: 15
          },
          {
            id: "appt-2",
            barberId: "barber-ren",
            status: "confirmed",
            totalAmount: 55,
            tipAmount: 0
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
          blockedRoutingRecords: 0,
          readyForPayoutAmount: 95
        },
        shops: [],
        barbers: [
          {
            id: "acct-maya",
            barberId: "barber-maya",
            shopLabel: "BVRB3R Ybor",
            operationalStatus: "payout_ready",
            payoutReadinessStatus: "ready",
            missingSteps: [],
            disabledReason: null
          },
          {
            id: "acct-ren",
            barberId: "barber-ren",
            shopLabel: "BVRB3R Ybor",
            operationalStatus: "needs_attention",
            payoutReadinessStatus: "blocked",
            missingSteps: ["Submit payout verification"],
            disabledReason: null
          }
        ],
        memberships: [
          {
            id: "membership-maya",
            barberId: "barber-maya",
            barberName: "Maya Cole",
            shopId: "shop-ybor",
            shopLabel: "BVRB3R Ybor",
            routingModel: "commission",
            commissionRate: 0.6,
            boothRentAmount: null,
            boothRentFrequency: null,
            payoutBlockReason: null
          },
          {
            id: "membership-ren",
            barberId: "barber-ren",
            barberName: "Ren Hale",
            shopId: "shop-ybor",
            shopLabel: "BVRB3R Ybor",
            routingModel: "booth_rent",
            commissionRate: null,
            boothRentAmount: 250,
            boothRentFrequency: "weekly",
            payoutBlockReason: "Submit payout verification"
          }
        ],
        blockedPayments: []
      }
    });
  });

  it("renders the owner team lane from scoped canonical barber and payout truth", () => {
    render(<OwnerTeamWorkspace />);

    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Manage your barbers & team performance")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Invite Barber/i })).toHaveAttribute("href", "/onboarding/owner/team");
    expect(screen.getByPlaceholderText("Search barbers...")).toBeInTheDocument();
    expect(screen.getAllByText("Maya Cole").length).toBeGreaterThan(0);
    expect(screen.getByText("Total Barbers")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Idle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Offline").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$105").length).toBeGreaterThan(0);
    expect(screen.getByText("Pending Verification")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ren Hale/i }));
    expect(screen.getAllByText("Submit payout verification").length).toBeGreaterThan(0);
    expect(screen.getByText("Account health: needs attention")).toBeInTheDocument();
  });

  it("shows a clean empty state when no barbers are attached to the owner scope", () => {
    useShopDashboardQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        barbers: [],
        appointments: []
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

    render(<OwnerTeamWorkspace />);

    expect(screen.getByText("No barbers assigned yet.")).toBeInTheDocument();
    expect(screen.getByText("Invite your first barber to start managing your shop team.")).toBeInTheDocument();
  });
});
