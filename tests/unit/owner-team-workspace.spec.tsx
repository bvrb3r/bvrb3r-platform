import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Team command center and public shop profile controls.")).toBeInTheDocument();
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
    expect(screen.getAllByText("Instant booking on").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Send Invite/i }));

    await waitFor(() => {
      expect(createOwnerTeamInviteMock).toHaveBeenCalledWith({
        barberId: "barber-jordan",
        shopId: "shop-ybor"
      });
    });
    expect(await screen.findByText(/Invite sent to Jordan Fade/i)).toBeInTheDocument();
  });

  it("shows disabled invite reasons for barbers already active with another shop", () => {
    render(<OwnerTeamWorkspace />);

    fireEvent.click(screen.getAllByRole("button", { name: /Invite Barber/i })[0]);

    expect(screen.getByText("Tied Barber")).toBeInTheDocument();
    expect(screen.getByText("This barber is already connected to another shop.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Assigned/i }).some((button) => button.hasAttribute("disabled"))).toBe(true);
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

  it("lets owners edit the public shop profile from Home", async () => {
    render(<OwnerTeamWorkspace />);

    expect(screen.getByText("Public Shop Profile")).toBeInTheDocument();
    expect(screen.getByText("@bvrb3rybor")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit shop profile" }));
    fireEvent.change(screen.getByLabelText("Shop name"), {
      target: { value: "BVRB3R Ybor Lab" }
    });
    fireEvent.change(screen.getByLabelText("Public bio"), {
      target: { value: "A sharper public team profile." }
    });
    fireEvent.change(screen.getByLabelText("Policies"), {
      target: { value: "Deposits may apply." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save public profile" }));

    await waitFor(() => {
      expect(updateOwnerShopProfileMock).toHaveBeenCalledWith(expect.objectContaining({
        shopId: "shop-ybor",
        name: "BVRB3R Ybor Lab",
        publicBio: "A sharper public team profile.",
        policies: "Deposits may apply."
      }));
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
