import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createOwnerTeamInviteMock,
  respondOwnerJoinRequestMock,
  useCreateOwnerTeamInviteMutationMock,
  useOwnerTeamInviteDirectoryQueryMock,
  useRespondOwnerTeamJoinRequestMutationMock,
  useShopDashboardQueryMock,
  useFintechManagementQueryMock
} = vi.hoisted(() => ({
  createOwnerTeamInviteMock: vi.fn(),
  respondOwnerJoinRequestMock: vi.fn(),
  useCreateOwnerTeamInviteMutationMock: vi.fn(),
  useOwnerTeamInviteDirectoryQueryMock: vi.fn(),
  useRespondOwnerTeamJoinRequestMutationMock: vi.fn(),
  useShopDashboardQueryMock: vi.fn(),
  useFintechManagementQueryMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useCreateOwnerTeamInviteMutation: useCreateOwnerTeamInviteMutationMock,
  useOwnerTeamInviteDirectoryQuery: useOwnerTeamInviteDirectoryQueryMock,
  useRespondOwnerTeamJoinRequestMutation: useRespondOwnerTeamJoinRequestMutationMock,
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
    useOwnerTeamInviteDirectoryQueryMock.mockReset();
    useCreateOwnerTeamInviteMutationMock.mockReset();
    useRespondOwnerTeamJoinRequestMutationMock.mockReset();
    createOwnerTeamInviteMock.mockReset();
    respondOwnerJoinRequestMock.mockReset();

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

    useOwnerTeamInviteDirectoryQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        shop: {
          id: "shop-ybor",
          label: "BVRB3R Ybor"
        },
        barbers: [
          {
            inviteId: null,
            barberId: "barber-jordan",
            barberReference: "barber-jordan",
            profileId: "profile-jordan",
            name: "Jordan Fade",
            email: "jordan@example.com",
            username: "jordanfade",
            serviceAreaLabel: "Ybor City",
            compensationModel: "commission",
            appApprovalStatus: "approved",
            shopApprovalStatus: "approved",
            visibilityState: "public",
            acceptsInstantBookings: true,
            alreadyAssigned: false,
            inviteStatus: null,
            canInvite: true
          }
        ]
      }
    });
    createOwnerTeamInviteMock.mockResolvedValue({
      invite: {
        id: "invite-1",
        shopId: "shop-ybor",
        shopLabel: "BVRB3R Ybor",
        barberId: "barber-jordan",
        barberName: "Jordan Fade",
        barberEmail: "jordan@example.com",
        status: "pending",
        message: null,
        createdAt: "2026-04-27T09:00:00.000Z",
        respondedAt: null
      }
    });
    useCreateOwnerTeamInviteMutationMock.mockReturnValue({
      mutateAsync: createOwnerTeamInviteMock,
      isPending: false
    });
    respondOwnerJoinRequestMock.mockResolvedValue({
      invite: {
        id: "request-1",
        shopId: "shop-ybor",
        shopLabel: "BVRB3R Ybor",
        barberId: "barber-jordan",
        barberName: "Jordan Fade",
        barberEmail: "jordan@example.com",
        status: "active",
        message: null,
        createdAt: "2026-04-27T09:00:00.000Z",
        respondedAt: "2026-04-27T09:05:00.000Z"
      }
    });
    useRespondOwnerTeamJoinRequestMutationMock.mockReturnValue({
      mutateAsync: respondOwnerJoinRequestMock,
      isPending: false
    });
  });

  it("renders the owner team lane from scoped canonical barber and payout truth", () => {
    render(<OwnerTeamWorkspace />);

    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Manage your barbers & team performance")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Invite Barber/i }).length).toBeGreaterThan(0);
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
    expect(screen.getByText("Invite barbers to connect your shop team.")).toBeInTheDocument();
  });

  it("opens the real invite directory and sends a canonical shop invite", async () => {
    render(<OwnerTeamWorkspace />);

    fireEvent.click(screen.getAllByRole("button", { name: /Invite Barber/i })[0]);

    expect(screen.getByRole("dialog", { name: /Invite a barber/i })).toBeInTheDocument();
    expect(screen.getByText("Jordan Fade")).toBeInTheDocument();
    expect(screen.getByText("jordan@example.com")).toBeInTheDocument();
    expect(screen.getByText("Instant booking on")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Send Invite/i }));

    await waitFor(() => {
      expect(createOwnerTeamInviteMock).toHaveBeenCalledWith({
        barberId: "barber-jordan",
        shopId: "shop-ybor"
      });
    });
    expect(await screen.findByText(/Invite sent to Jordan Fade/i)).toBeInTheDocument();
  });

  it("lets owners accept incoming barber join requests from the relationship queue", async () => {
    useOwnerTeamInviteDirectoryQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        shop: {
          id: "shop-ybor",
          label: "BVRB3R Ybor"
        },
        barbers: [
          {
            inviteId: "request-1",
            barberId: "barber-jordan",
            barberReference: "barber-jordan",
            profileId: "profile-jordan",
            name: "Jordan Fade",
            email: "jordan@example.com",
            username: "jordanfade",
            serviceAreaLabel: "Ybor City",
            compensationModel: "commission",
            appApprovalStatus: "approved",
            shopApprovalStatus: "approved",
            visibilityState: "public",
            acceptsInstantBookings: true,
            alreadyAssigned: false,
            inviteStatus: "requested",
            canInvite: false
          }
        ]
      }
    });

    render(<OwnerTeamWorkspace />);

    expect(screen.getByText("Incoming requests")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(respondOwnerJoinRequestMock).toHaveBeenCalledWith({
        inviteId: "request-1",
        status: "accepted"
      });
    });
    expect(await screen.findByText(/Jordan Fade is now connected/i)).toBeInTheDocument();
  });
});
