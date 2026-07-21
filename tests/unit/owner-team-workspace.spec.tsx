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

const locationAssignMock = vi.fn();

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TEST_DATE_KEY = getLocalDateKey(new Date());
const TEST_MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric"
}).format(new Date(`${TEST_DATE_KEY}T12:00:00`));
const TEST_DAY_NUMBER = new Date(`${TEST_DATE_KEY}T12:00:00`).getDate().toString();

Object.defineProperty(window, "location", {
  configurable: true,
  value: {
    ...window.location,
    assign: locationAssignMock
  }
});

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
    locationAssignMock.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pinSet: true, enabled: true })
    }));

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
            openSlots: 6,
            bookedMinutes: 120,
            availableMinutes: 420,
            nextAppointmentStart: `${TEST_DATE_KEY}T15:00:00.000Z`
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
            openSlots: 8,
            bookedMinutes: 30,
            availableMinutes: 420,
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
            openSlots: 6,
            bookedMinutes: 120,
            availableMinutes: 420,
            nextAppointmentStart: `${TEST_DATE_KEY}T15:00:00.000Z`
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
            openSlots: 8,
            bookedMinutes: 30,
            availableMinutes: 420,
            nextAppointmentStart: null
          }
        ],
        appointments: [
          {
            id: "appt-1",
            barberId: "barber-maya",
            status: "completed",
            start: `${TEST_DATE_KEY}T15:00:00.000Z`,
            end: `${TEST_DATE_KEY}T15:30:00.000Z`,
            totalAmount: 90,
            tipAmount: 15,
            display: {
              barberName: "Maya Cole",
              clientName: "Taylor Reed",
              serviceName: "Precision fade",
              statusLabel: "Completed"
            }
          },
          {
            id: "appt-2",
            barberId: "barber-ren",
            status: "confirmed",
            start: `${TEST_DATE_KEY}T16:00:00.000Z`,
            end: `${TEST_DATE_KEY}T16:30:00.000Z`,
            totalAmount: 55,
            tipAmount: 0,
            display: {
              barberName: "Ren Hale",
              clientName: "Jordan Price",
              serviceName: "Cleanup",
              statusLabel: "Confirmed"
            }
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

  it("renders the owner home lane from scoped canonical barber and payout truth", async () => {
    render(<OwnerTeamWorkspace />);

    expect(screen.queryByText("Home")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage your shop, team, and public profile.")).not.toBeInTheDocument();
    expect(screen.queryByText("Invites, team status, schedule, money, and profile controls.")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage invites, join requests, active barbers, public team display, and shop presentation from one private owner surface.")).not.toBeInTheDocument();
    const commandCalendar = within(screen.getByTestId("shop-command-calendar"));
    const barbersSummary = within(screen.getByTestId("barbers-summary"));
    const ownerTimeline = within(screen.getByTestId("owner-daily-timeline"));
    expect(screen.getByTestId("shop-command-calendar")).toBeInTheDocument();
    expect(screen.getAllByText("Shop Command Calendar").length).toBeGreaterThan(0);
    expect(commandCalendar.getByText("Appointments Today")).toBeInTheDocument();
    expect(commandCalendar.getByText("Shop Production")).toBeInTheDocument();
    expect(commandCalendar.getByText("Open Slots")).toBeInTheDocument();
    expect(commandCalendar.getByText("Day Utilization")).toBeInTheDocument();
    expect(commandCalendar.getByText(TEST_MONTH_LABEL)).toBeInTheDocument();
    expect(commandCalendar.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(commandCalendar.getAllByText(TEST_DAY_NUMBER).length).toBeGreaterThan(0);
    expect(commandCalendar.getByRole("button", { name: "Day" })).toBeInTheDocument();
    expect(commandCalendar.getByRole("button", { name: "Week" })).toBeInTheDocument();
    expect(commandCalendar.getByRole("button", { name: "Previous" })).toBeInTheDocument();
    expect(commandCalendar.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(commandCalendar.getByText("Active Barbers")).toBeInTheDocument();
    expect(commandCalendar.getByText("Pending Invites")).toBeInTheDocument();
    expect(commandCalendar.getByText("Incoming Requests")).toBeInTheDocument();
    expect(commandCalendar.getAllByText("2").length).toBeGreaterThan(0);
    expect(commandCalendar.getByText("$160")).toBeInTheDocument();
    expect(commandCalendar.getAllByText("14").length).toBeGreaterThan(0);
    expect(commandCalendar.getByText("18%")).toBeInTheDocument();
    expect(commandCalendar.queryByText("29%")).not.toBeInTheDocument();
    const ownerOpenSchedule = screen.getByRole("link", { name: /Open Schedule/i });
    expect(ownerOpenSchedule).toHaveAttribute("href", "/dashboard/owner/schedule");
    expect(ownerOpenSchedule).toHaveClass("min-h-11");
    expect(ownerOpenSchedule).toHaveClass("w-full");
    expect(ownerOpenSchedule).toHaveClass("bg-[#C4F24E]");
    expect(ownerOpenSchedule).toHaveClass("text-[#050505]");
    const ownerOpenCulture = screen.getByRole("link", { name: /Open Culture/i });
    expect(ownerOpenCulture).toHaveAttribute("href", "/dashboard/owner/culture");
    const kioskModeAction = screen.getByRole("button", { name: "Kiosk Mode" });
    const ownerAddBarbers = screen.getByRole("button", { name: /Add Barbers/i });
    expect(ownerOpenSchedule.compareDocumentPosition(ownerOpenCulture) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ownerOpenCulture.compareDocumentPosition(kioskModeAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(kioskModeAction.compareDocumentPosition(ownerAddBarbers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(kioskModeAction).toHaveClass("rounded-[8px]");
    expect(kioskModeAction).toHaveClass("min-h-11");
    expect(kioskModeAction).toHaveClass("w-full");
    fireEvent.click(kioskModeAction);
    await waitFor(() => {
      expect(locationAssignMock).toHaveBeenCalledWith("/kiosk/shop-ybor");
    });
    expect(screen.queryByRole("dialog", { name: "Enter kiosk PIN" })).not.toBeInTheDocument();
    expect(screen.getByTestId("shop-command-calendar").compareDocumentPosition(screen.getByTestId("barbers-summary"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const shopIdentityCard = within(screen.getByTestId("owner-shop-identity-card"));
    expect(shopIdentityCard.getByText("Shop identity")).toBeInTheDocument();
    expect(shopIdentityCard.getByText("BVRB3R Ybor")).toBeInTheDocument();
    expect(shopIdentityCard.getByText("Shop status")).toBeInTheDocument();
    expect(shopIdentityCard.getByText("Shop connected")).toBeInTheDocument();
    expect(shopIdentityCard.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/dashboard/owner/more?section=profile");
    expect(screen.getByTestId("barbers-summary").compareDocumentPosition(screen.getByTestId("owner-daily-timeline"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByTestId("owner-home-culture-entry")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-relationship-queue")).not.toBeInTheDocument();
    expect(screen.queryByText("Public Shop Profile")).not.toBeInTheDocument();
    expect(screen.queryByText("Team Insights")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add Barbers/i }));
    expect(screen.getByRole("dialog", { name: "Add Barbers" })).toBeInTheDocument();
    expect(screen.getByTestId("team-relationship-queue")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search @barber username")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Invite Barber/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Add Barbers" }));
    expect(screen.queryByTestId("team-relationship-queue")).not.toBeInTheDocument();
    expect(screen.getAllByText("Maya Cole").length).toBeGreaterThan(0);
    expect(barbersSummary.getByText("Ren Hale")).toBeInTheDocument();
    expect(barbersSummary.getByText("Service: Commission")).toBeInTheDocument();
    expect(barbersSummary.getByText("Service: Booth rent")).toBeInTheDocument();
    expect(barbersSummary.getAllByText("Appointments").length).toBeGreaterThan(0);
    expect(barbersSummary.getAllByText("Day Utilization").length).toBeGreaterThan(0);
    expect(barbersSummary.getAllByText("Open Slots").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$160").length).toBeGreaterThan(0);
    expect(barbersSummary.getByText("Pending Verification")).toBeInTheDocument();
    expect(ownerTimeline.getByText("Daily Timeline")).toBeInTheDocument();
    expect(ownerTimeline.getByText("Precision fade")).toBeInTheDocument();
    expect(ownerTimeline.getByText("Maya Cole with Taylor Reed")).toBeInTheDocument();
    expect(ownerTimeline.getByText("Ren Hale with Jordan Price")).toBeInTheDocument();
    const ownerDetailLinks = ownerTimeline.getAllByRole("link", { name: "View Details" });
    expect(ownerDetailLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard/owner/schedule?appointmentId=appt-1",
      "/dashboard/owner/schedule?appointmentId=appt-2"
    ]);
    const ownerMessageLinks = ownerTimeline.getAllByRole("link", { name: /Message Barber/i });
    expect(ownerMessageLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard/owner/messages?threadWith=barber-maya",
      "/dashboard/owner/messages?threadWith=barber-ren"
    ]);
    expect(ownerTimeline.queryByRole("button", { name: /Complete Service/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Maya Cole/i }));
    expect(screen.getByText("Working or available in today's shop lane.")).toBeInTheDocument();
    expect(screen.getByText("Account health: Payout setup connected")).toBeInTheDocument();
    expect(screen.queryByText("Account health: payout ready")).not.toBeInTheDocument();
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
    expect(screen.getByText("Invite a barber to begin tracking team performance.")).toBeInTheDocument();
    expect(screen.getByTestId("owner-shop-identity-card")).toHaveTextContent("BVRB3R Ybor");
    expect(within(screen.getByTestId("shop-command-calendar")).getByRole("button", { name: /Add Barbers/i })).toBeInTheDocument();
  });

  it("shows shop setup-required state when no owner shop identity is connected", () => {
    useShopDashboardQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        barbers: [],
        appointments: [],
        locations: []
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
      data: undefined
    });

    render(<OwnerTeamWorkspace />);

    const shopIdentityCard = screen.getByTestId("owner-shop-identity-card");
    expect(shopIdentityCard).toHaveTextContent("Shop setup needed");
    expect(shopIdentityCard).toHaveTextContent("Finish shop setup to unlock team, schedule, and kiosk controls.");
    expect(within(shopIdentityCard).getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/dashboard/owner/more?section=profile");
  });

  it("counts accepted active shop relationships even when payout membership hydration is empty", () => {
    useShopDashboardQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        barbers: [
          {
            id: "barber-phillip",
            name: "Phillip Forsure",
            compensationModel: "commission",
            activeAppointmentCount: 0,
            liveAppointmentCount: 0,
            bookedCount: 0,
            completedCount: 0,
            utilization: 0,
            openSlots: 12,
            bookedMinutes: 0,
            availableMinutes: 420,
            nextAppointmentStart: null
          }
        ],
        activeBarbers: [
          {
            id: "barber-phillip",
            name: "Phillip Forsure",
            compensationModel: "commission",
            activeAppointmentCount: 0,
            liveAppointmentCount: 0,
            bookedCount: 0,
            completedCount: 0,
            utilization: 0,
            openSlots: 12,
            bookedMinutes: 0,
            availableMinutes: 420,
            nextAppointmentStart: null
          }
        ],
        appointments: [],
        locations: [],
        walkIns: [],
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

    render(<OwnerTeamWorkspace />);

    const commandCalendar = screen.getByTestId("shop-command-calendar");
    expect(within(commandCalendar).getByText("Active Barbers")).toBeInTheDocument();
    expect(within(commandCalendar).getByText("1 active barber on the shop floor")).toBeInTheDocument();
    expect(screen.getByTestId("barbers-summary")).toHaveTextContent("Phillip Forsure");
    expect(screen.queryByText("No active barbers yet.")).not.toBeInTheDocument();
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

    fireEvent.click(within(screen.getByTestId("shop-command-calendar")).getByRole("button", { name: /Add Barbers/i }));

    expect(screen.getAllByText("Sent invitations")).toHaveLength(1);
    expect(screen.getByText("Pending invitations are waiting for barber approval before they join the active summary.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Invite Barber/i })).not.toBeInTheDocument();
  });

  it("searches public barber usernames and sends a canonical shop invite after confirmation", async () => {
    render(<OwnerTeamWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: /Add Barbers/i }));
    fireEvent.change(screen.getByPlaceholderText("Search @barber username"), {
      target: { value: "@jordanfade" }
    });
    expect(screen.getByText("Jordan Fade")).toBeInTheDocument();
    expect(screen.getByText("@jordanfade")).toBeInTheDocument();
    expect(screen.getAllByText("Barber").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ybor City").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(screen.getByRole("dialog", { name: /Invite @jordanfade to your team/i })).toBeInTheDocument();
    expect(screen.getByText(/Choose the complete money agreement/i)).toBeInTheDocument();
    expect(screen.getByText(/Tips remain 100% barber/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "No, cancel" }));
    expect(createOwnerTeamInviteMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /Invite @jordanfade to your team/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, send invite" }));

    await waitFor(() => {
      expect(createOwnerTeamInviteMock).toHaveBeenCalledWith({
        barberId: "barber-jordan",
        shopId: "shop-ybor",
        proposal: {
          routingModel: "commission",
          barberPercent: 0.7,
          shopPercent: 0.3
        }
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

    fireEvent.click(screen.getByRole("button", { name: /Add Barbers/i }));
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

    fireEvent.click(screen.getByRole("button", { name: /Add Barbers/i }));
    fireEvent.change(screen.getByPlaceholderText("Search @barber username"), {
      target: { value: "jordanfade" }
    });

    expect(screen.getAllByText("Invite pending").length).toBeGreaterThan(0);
    expect(screen.getByText("Invite already pending.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite pending" })).toBeDisabled();
  });

  it("shows disabled invite reasons for barbers already active with another shop", () => {
    render(<OwnerTeamWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: /Add Barbers/i }));
    fireEvent.change(screen.getByPlaceholderText("Search @barber username"), {
      target: { value: "tiedbarber" }
    });

    expect(screen.getByText("Tied Barber")).toBeInTheDocument();
    expect(screen.getByText("This barber is already connected to another shop.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Already on team/i }).some((button) => button.hasAttribute("disabled"))).toBe(true);
  });

  it("keeps accepted operating terms immutable while allowing public visibility and release", async () => {
    render(<OwnerTeamWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: /Maya Cole/i }));
    expect(screen.queryByRole("button", { name: "Booth rent" })).not.toBeInTheDocument();
    expect(screen.getByText(/Accepted money terms are immutable/i)).toBeInTheDocument();

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

    fireEvent.click(screen.getByRole("button", { name: /Add Barbers/i }));
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
