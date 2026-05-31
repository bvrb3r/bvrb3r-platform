import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  useFintechManagementQueryMock,
  useOwnerTeamInviteDirectoryQueryMock,
  useCreateOwnerTeamInviteMutationMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  useFintechManagementQueryMock: vi.fn(),
  useOwnerTeamInviteDirectoryQueryMock: vi.fn(),
  useCreateOwnerTeamInviteMutationMock: vi.fn()
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutation: useMutateProfileMediaMutationMock
}));

vi.mock("@/lib/fintech/client", () => ({
  useFintechManagementQuery: useFintechManagementQueryMock
}));

vi.mock("@/lib/operations/barber-client", () => ({
  useOwnerTeamInviteDirectoryQuery: useOwnerTeamInviteDirectoryQueryMock,
  useCreateOwnerTeamInviteMutation: useCreateOwnerTeamInviteMutationMock
}));

vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Log out</button>
}));

vi.mock("@/components/marketplace/service-catalog-workspace", () => ({
  ServiceCatalogWorkspace: () => <div data-testid="service-catalog-workspace-stub">Service catalog</div>
}));

import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { OwnerSettingsWorkspace } from "@/components/operations/owner-settings-workspace";

function makeShopAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acct-shop-1",
    subjectType: "shop",
    provider: "stripe_connect",
    operationalStatus: "payout_ready",
    providerAccountId: "acct_123",
    onboardingStatus: "verified",
    payoutReadinessStatus: "ready",
    legalReadinessStatus: "accepted",
    taxReadinessStatus: "verified",
    chargesEnabled: true,
    payoutsEnabled: true,
    requirementsCurrentlyDue: [],
    requirementsEventuallyDue: [],
    requirementsPastDue: [],
    missingAgreements: [],
    outdatedAgreements: [],
    missingSteps: [],
    disabledReason: null,
    lastCheckedAt: null,
    onboardingStartedAt: null,
    onboardingCompletedAt: null,
    processorLastSyncedAt: null,
    processorLastEventId: null,
    processorLastEventType: null,
    dashboardLastAccessedAt: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    displayName: "The BVRB3R Shop & Co",
    shopId: "loc-ybor",
    shopLabel: "The BVRB3R Shop & Co",
    barberId: null,
    barberName: null,
    ...overrides
  };
}

describe("owner More workspace", () => {
  beforeEach(() => {
    useProfileMediaWorkspaceQueryMock.mockReset();
    useMutateProfileMediaMutationMock.mockReset();
    useFintechManagementQueryMock.mockReset();
    useOwnerTeamInviteDirectoryQueryMock.mockReset();
    useCreateOwnerTeamInviteMutationMock.mockReset();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    })) as unknown as typeof fetch;

    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      error: null,
      mutateAsync: vi.fn()
    });

    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        viewer: {
          notificationPreference: {
            inAppEnabled: true,
            emailEnabled: true,
            smsEnabled: false,
            pushEnabled: true
          }
        },
        shops: []
      }
    });

    useFintechManagementQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: {
        summary: {
          totalAccounts: 1,
          readyAccounts: 1,
          blockedAccounts: 0,
          needsAttentionAccounts: 0,
          notReadyAccounts: 0,
          blockedRoutingRecords: 0,
          readyForPayoutAmount: 95
        },
        shops: [makeShopAccount()],
        barbers: [],
        memberships: []
      }
    });
    useOwnerTeamInviteDirectoryQueryMock.mockReturnValue({
      isLoading: false,
      data: {
        shop: { id: "loc-ybor", label: "The BVRB3R Shop & Co" },
        barbers: []
      }
    });
    useCreateOwnerTeamInviteMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("renders the owner More control center from canonical profile and fintech posture", () => {
    render(<OwnerSettingsWorkspace user={resolveDemoUser("owner@bvrb3r.demo")} />);

    expect(screen.getByRole("heading", { name: "More" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "More" })).toHaveLength(1);
    expect(screen.getByText("Manage your account, shop setup, payments, policies, and settings.")).toBeInTheDocument();
    expect(screen.getByTestId("owner-more-identity-card")).toBeInTheDocument();
    expect(screen.getByText("Shop owner account")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Account" })).toHaveAttribute("href", "/verify-contact");
    expect(screen.getByTestId("owner-public-shop-profile-card")).toBeInTheDocument();
    expect(screen.getAllByText("Public Shop Profile").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Finish shop profile").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Edit Shop Profile" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Unable to load shop profile")).not.toBeInTheDocument();
    expect(screen.getByText("Your shop setup")).toBeInTheDocument();
    expect(screen.getByText("Business Control Hub")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shop Profile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Business Setup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payments & Banking" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Compliance & Security" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument();
    expect(screen.getByText("Ready amount $95")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("opens existing service management inside business setup when requested", () => {
    render(<OwnerSettingsWorkspace user={resolveDemoUser("owner@bvrb3r.demo")} initialSection="services" />);

    expect(screen.getByTestId("service-catalog-workspace-stub")).toBeInTheDocument();
  });

  it("shows verified status when owner and shop approvals are clear", () => {
    useFintechManagementQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: {
        summary: {
          totalAccounts: 2,
          readyAccounts: 2,
          blockedAccounts: 0,
          needsAttentionAccounts: 0,
          notReadyAccounts: 0,
          blockedRoutingRecords: 0,
          readyForPayoutAmount: 210
        },
        shops: [makeShopAccount()],
        barbers: [],
        memberships: []
      }
    });

    render(<OwnerSettingsWorkspace user={{
      ...resolveDemoUser("owner@bvrb3r.demo"),
      appApprovalStatus: "approved",
      shopApprovalStatus: "approved"
    }} />);

    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    expect(screen.getByText("Ready amount $210")).toBeInTheDocument();
  });

  it("opens quick shop profile setup and saves through the owner shop profile API", async () => {
    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: {
        viewer: {
          notificationPreference: {
            inAppEnabled: true,
            emailEnabled: true,
            smsEnabled: false,
            pushEnabled: true
          }
        },
        shops: []
      }
    });

    render(<OwnerSettingsWorkspace user={{ ...resolveDemoUser("owner@bvrb3r.demo"), appApprovalStatus: "approved", shopApprovalStatus: "approved" }} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Edit Shop Profile/i })[0]);
    expect(screen.getByRole("heading", { name: "Edit shop profile" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Shop name/i), { target: { value: "BVRB3R North" } });
    fireEvent.change(screen.getByLabelText(/Brand line/i), { target: { value: "Sharp cuts near campus." } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "Tampa" } });
    fireEvent.change(screen.getByLabelText(/State/i), { target: { value: "FL" } });
    fireEvent.click(screen.getByRole("button", { name: /Save profile/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/owner/shop/profile", expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("Sharp cuts near campus.")
      }));
    });
  });

  it("opens the invite barber directory from the activation gate without routing back to overview", () => {
    useOwnerTeamInviteDirectoryQueryMock.mockReturnValue({
      isLoading: false,
      data: {
        shop: { id: "loc-ybor", label: "The BVRB3R Shop & Co" },
        barbers: [
          {
            barberId: "barber-wave",
            barberReference: "barber-wave",
            profileId: "profile-wave",
            name: "Wave Carter",
            email: "wave@bvrb3r.app",
            username: "wavecarter",
            serviceAreaLabel: "Tampa",
            compensationModel: "booth_rent",
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

    render(<OwnerSettingsWorkspace user={{ ...resolveDemoUser("owner@bvrb3r.demo"), appApprovalStatus: "approved", shopApprovalStatus: "approved" }} />);

    fireEvent.click(screen.getByRole("button", { name: /Invite barber/i }));

    expect(screen.getByRole("heading", { name: "Invite barber" })).toBeInTheDocument();
    expect(screen.getByText("Wave Carter")).toBeInTheDocument();
  });
});
