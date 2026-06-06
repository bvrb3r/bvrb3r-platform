import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createOwnerTeamInviteMock,
  respondOwnerJoinRequestMock,
  updateOwnerRelationshipMock,
  releaseOwnerRelationshipMock,
  useCreateOwnerTeamInviteMutationMock,
  useOwnerTeamInviteDirectoryQueryMock,
  useOwnerShopProfileQueryMock,
  useUpdateOwnerShopProfileMutationMock,
  useReleaseOwnerTeamRelationshipMutationMock,
  useRespondOwnerTeamJoinRequestMutationMock,
  useUpdateOwnerTeamRelationshipMutationMock,
  useShopDashboardQueryMock,
  updateOwnerShopProfileMock,
  useFintechManagementQueryMock
} = vi.hoisted(() => ({
  createOwnerTeamInviteMock: vi.fn(),
  respondOwnerJoinRequestMock: vi.fn(),
  updateOwnerRelationshipMock: vi.fn(),
  releaseOwnerRelationshipMock: vi.fn(),
  useCreateOwnerTeamInviteMutationMock: vi.fn(),
  useOwnerTeamInviteDirectoryQueryMock: vi.fn(),
  useOwnerShopProfileQueryMock: vi.fn(),
  useUpdateOwnerShopProfileMutationMock: vi.fn(),
  useReleaseOwnerTeamRelationshipMutationMock: vi.fn(),
  useRespondOwnerTeamJoinRequestMutationMock: vi.fn(),
  useUpdateOwnerTeamRelationshipMutationMock: vi.fn(),
  useShopDashboardQueryMock: vi.fn(),
  updateOwnerShopProfileMock: vi.fn(),
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
  useOwnerShopProfileQuery: useOwnerShopProfileQueryMock,
  useUpdateOwnerShopProfileMutation: useUpdateOwnerShopProfileMutationMock,
  useReleaseOwnerTeamRelationshipMutation: useReleaseOwnerTeamRelationshipMutationMock,
  useRespondOwnerTeamJoinRequestMutation: useRespondOwnerTeamJoinRequestMutationMock,
  useUpdateOwnerTeamRelationshipMutation: useUpdateOwnerTeamRelationshipMutationMock,
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
    useOwnerShopProfileQueryMock.mockReset();
    useUpdateOwnerShopProfileMutationMock.mockReset();
    useCreateOwnerTeamInviteMutationMock.mockReset();
    useRespondOwnerTeamJoinRequestMutationMock.mockReset();
    createOwnerTeamInviteMock.mockReset();
    respondOwnerJoinRequestMock.mockReset();
    updateOwnerRelationshipMock.mockReset();
    releaseOwnerRelationshipMock.mockReset();
    updateOwnerShopProfileMock.mockReset();

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
            publicTeamVisible: true,
            featuredOnShopProfile: false,
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
            publicTeamVisible: true,
            featuredOnShopProfile: false,
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

    useOwnerShopProfileQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        shop: {
          id: "shop-ybor",
          name: "BVRB3R Ybor",
          shop_username: "bvrb3rybor",
          brand_line: "Chair-first cuts.",
          public_bio: "Ybor cuts with a verified shop team.",
          cover_photo_url: "https://cdn.example.com/ybor-cover.jpg",
          profile_photo_url: "https://cdn.example.com/ybor-logo.jpg",
          address: "1600 E 7th Ave",
          city: "Tampa",
          state: "FL",
          neighborhood: "Ybor City",
          phone: "813-555-0101",
          public_hours: "Mon-Fri 9-5",
          policies: "Arrive five minutes early.",
          app_approval_status: "approved"
        }
      }
    });
    updateOwnerShopProfileMock.mockResolvedValue({ shop: { id: "shop-ybor", name: "BVRB3R Ybor Lab" } });
    useUpdateOwnerShopProfileMutationMock.mockReturnValue({
      mutateAsync: updateOwnerShopProfileMock,
      isPending: false
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
          },
          {
            inviteId: null,
            barberId: "barber-tied",
            barberReference: "barber-tied",
            profileId: "profile-tied",
            name: "Tied Barber",
            email: "tied@example.com",
            username: "tiedbarber",
            serviceAreaLabel: "Tampa",
            compensationModel: "commission",
            appApprovalStatus: "approved",
            shopApprovalStatus: "approved",
            visibilityState: "public",
            acceptsInstantBookings: true,
            alreadyAssigned: true,
            inviteStatus: "active",
            inviteDisabledReason: "This barber is already connected to another shop.",
            canInvite: false
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
    updateOwnerRelationshipMock.mockResolvedValue({ relationship: { id: "membership-maya", routing_model: "booth_rent" } });
    useUpdateOwnerTeamRelationshipMutationMock.mockReturnValue({
      mutateAsync: updateOwnerRelationshipMock,
      isPending: false
    });
    releaseOwnerRelationshipMock.mockResolvedValue({ relationshipId: "membership-maya", effectiveRoutingModel: "freelance" });
    useReleaseOwnerTeamRelationshipMutationMock.mockReturnValue({
      mutateAsync: releaseOwnerRelationshipMock,
      isPending: false
    });
  });

  it("renders the owner home lane from scoped canonical barber and payout truth", () => {
    render(<OwnerTeamWorkspace />);

    expect(screen.queryByText("Home")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage your shop, team, and public profile.")).not.toBeInTheDocument();
    expect(screen.queryByText("Invites, team status, schedule, money, and profile controls.")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage invites, join requests, active barbers, public team display, and shop presentation from one private owner surface.")).not.toBeInTheDocument();
    const snapshot = within(screen.getByTestId("today-shop-snapshot"));
    const barbersSummary = within(screen.getByTestId("barbers-summary"));
    expect(screen.getByTestId("today-shop-snapshot")).toBeInTheDocument();
    expect(screen.getByText("Today Shop Snapshot")).toBeInTheDocument();
    expect(snapshot.getByText("Today Revenue")).toBeInTheDocument();
    expect(snapshot.getByText("Appointments Today")).toBeInTheDocument();
    expect(snapshot.getByText("Active Barbers")).toBeInTheDocument();
    expect(snapshot.getByText("Open Chair Capacity")).toBeInTheDocument();
    expect(snapshot.getByText("Pending Actions")).toBeInTheDocument();
    const openScheduleLink = screen.getByRole("link", { name: "Open Schedule" });
    expect(openScheduleLink).toHaveAttribute("href", "/dashboard/owner/schedule");
    expect(openScheduleLink).toHaveClass("rounded-full");
    expect(openScheduleLink).toHaveClass("border-[#A3FF12]/30");
    expect(screen.getByText("Today Shop Snapshot").compareDocumentPosition(screen.getByText("Barbers Summary"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("Barbers Summary").compareDocumentPosition(screen.getByText("Team relationship queue"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByText("Public Shop Profile")).not.toBeInTheDocument();
    expect(screen.queryByText("Team Insights")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search @barber username")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Invite Barber/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("Maya Cole").length).toBeGreaterThan(0);
    expect(barbersSummary.getByText("Service: Commission")).toBeInTheDocument();
    expect(barbersSummary.getAllByText("Appointments").length).toBeGreaterThan(0);
    expect(barbersSummary.getAllByText("Performance").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
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

    expect(screen.getByText("No active barbers yet.")).toBeInTheDocument();
    expect(screen.getByText("Invite or approve a barber to build your shop team.")).toBeInTheDocument();
  });

  it("shows pending invitations once without repeating the invite CTA", () => {
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
            inviteId: "invite-pending",
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
            inviteStatus: "invited",
            canInvite: false
          }
        ]
      }
    });

    render(<OwnerTeamWorkspace />);

    expect(screen.getAllByText("Sent invitations")).toHaveLength(1);
    expect(screen.getByText("Pending invitations are waiting for barber approval before they join the active summary.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Invite Barber/i })).not.toBeInTheDocument();
  });

  it("searches public barber usernames and sends a canonical shop invite after confirmation", async () => {
    render(<OwnerTeamWorkspace />);

    fireEvent.change(screen.getByPlaceholderText("Search @barber username"), {
      target: { value: "@jordanfade" }
    });
    expect(screen.getByText("Jordan Fade")).toBeInTheDocument();
    expect(screen.getByText("@jordanfade")).toBeInTheDocument();
    expect(screen.getAllByText("Barber").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ybor City").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(screen.getByRole("dialog", { name: /Invite @jordanfade to your team/i })).toBeInTheDocument();
    expect(screen.getByText("This sends a team invitation for the barber to approve.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "No, cancel" }));
    expect(createOwnerTeamInviteMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /Invite @jordanfade to your team/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, send invite" }));

    await waitFor(() => {
      expect(createOwnerTeamInviteMock).toHaveBeenCalledWith({
        barberId: "barber-jordan",
        shopId: "shop-ybor"
      });
    });
    expect(await screen.findByText("Invite sent to @jordanfade.")).toBeInTheDocument();
  });

  it("does not show clients as inviteable team search results", () => {
    useOwnerTeamInviteDirectoryQueryMock.mockImplementation((search?: string) => ({
      isLoading: false,
      error: null,
      data: {
        shop: {
          id: "shop-ybor",
          label: "BVRB3R Ybor"
        },
        barbers: search === "clientusername" ? [] : [
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
            marketplaceStatusLabel: "Approved barber",
            readinessLabels: [],
            canInvite: true,
            inviteDisabledReason: null
          }
        ]
      }
    }));

    render(<OwnerTeamWorkspace />);

    fireEvent.change(screen.getByPlaceholderText("Search @barber username"), {
      target: { value: "@clientusername" }
    });

    expect(screen.getByText("No inviteable barber found.")).toBeInTheDocument();
    expect(screen.queryByText("@clientusername")).not.toBeInTheDocument();
  });

  it("prevents duplicate pending team invitations from username search", () => {
    useOwnerTeamInviteDirectoryQueryMock.mockImplementation(() => ({
      isLoading: false,
      error: null,
      data: {
        shop: {
          id: "shop-ybor",
          label: "BVRB3R Ybor"
        },
        barbers: [
          {
            inviteId: "invite-pending",
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
            inviteStatus: "invited",
            marketplaceStatusLabel: "Approved barber",
            readinessLabels: [],
            canInvite: false,
            inviteDisabledReason: "Invite already pending."
          }
        ]
      }
    }));

    render(<OwnerTeamWorkspace />);

    fireEvent.change(screen.getByPlaceholderText("Search @barber username"), {
      target: { value: "jordanfade" }
    });

    expect(screen.getAllByText("Invite pending").length).toBeGreaterThan(0);
    expect(screen.getByText("Invite already pending.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite pending" })).toBeDisabled();
  });

  it("shows disabled invite reasons for barbers already active with another shop", () => {
    render(<OwnerTeamWorkspace />);

    fireEvent.change(screen.getByPlaceholderText("Search @barber username"), {
      target: { value: "tiedbarber" }
    });

    expect(screen.getByText("Tied Barber")).toBeInTheDocument();
    expect(screen.getByText("This barber is already connected to another shop.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Already on team/i }).some((button) => button.hasAttribute("disabled"))).toBe(true);
  });

  it("lets owners set operating model, public visibility, and release an active barber", async () => {
    render(<OwnerTeamWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: /Maya Cole/i }));
    fireEvent.click(screen.getByRole("button", { name: "Booth rent" }));

    await waitFor(() => {
      expect(updateOwnerRelationshipMock).toHaveBeenCalledWith(expect.objectContaining({
        relationshipId: "membership-maya",
        routingModel: "booth_rent",
        boothRentAmount: 250,
        boothRentFrequency: "weekly"
      }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Hide publicly" }));
    await waitFor(() => {
      expect(updateOwnerRelationshipMock).toHaveBeenCalledWith(expect.objectContaining({
        relationshipId: "membership-maya",
        publicTeamVisible: false
      }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Release barber" }));
    await waitFor(() => {
      expect(releaseOwnerRelationshipMock).toHaveBeenCalledWith({
        relationshipId: "membership-maya",
        reason: "Owner released barber from team."
      });
    });
  });

  it("lets owners change public team featured status and display order", async () => {
    render(<OwnerTeamWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: /Maya Cole/i }));
    fireEvent.click(screen.getByRole("button", { name: "Feature" }));
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));

    await waitFor(() => {
      expect(updateOwnerRelationshipMock).toHaveBeenCalledWith(expect.objectContaining({
        relationshipId: "membership-maya",
        featuredOnShopProfile: true
      }));
      expect(updateOwnerRelationshipMock).toHaveBeenCalledWith(expect.objectContaining({
        relationshipId: "membership-maya",
        publicTeamOrder: 1
      }));
    });
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
