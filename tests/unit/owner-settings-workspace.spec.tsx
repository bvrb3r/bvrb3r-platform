import { fireEvent, render, screen, within } from "@testing-library/react";
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
    const ownerIdentityCard = screen.getByTestId("owner-more-identity-card");
    expect(ownerIdentityCard).toBeInTheDocument();
    expect(screen.getByText("SHOP OWNER ACCOUNT")).toBeInTheDocument();
    expect(within(ownerIdentityCard).getAllByText("owner@bvrb3r.demo")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Edit Account" }));
    expect(screen.getByRole("dialog", { name: "Edit Account" })).toBeInTheDocument();
    expect(screen.getByLabelText("BVRB3R Username")).toBeInTheDocument();
    expect(screen.queryByLabelText("Public display name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone Number")).toBeInTheDocument();
    expect(screen.getByText("Default Payment Method")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Click here" })).toBeInTheDocument();
    expect(screen.getByLabelText("Location")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getAllByText("Needs setup").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("owner-public-shop-identity-section")).not.toBeInTheDocument();
    expect(screen.queryByText("Public Shop Profile")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quick edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Preview Public Profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Public Profile" })).toHaveAttribute(
      "href",
      "/dashboard/owner/public-profile",
    );
    expect(screen.queryByText("Unable to load shop profile")).not.toBeInTheDocument();
    expect(screen.queryByText("Your shop setup")).not.toBeInTheDocument();
    expect(screen.queryByText("Business Control Hub")).not.toBeInTheDocument();
    expect(screen.getByText("Your BVRB3R Settings")).toBeInTheDocument();
    expect(screen.getByText("Shop Business Settings")).toBeInTheDocument();
    expect(screen.getByText("Shop profile, team, services, payouts, policies, and compliance controls.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Shop Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Business Setup" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Kiosk Settings").length).toBeGreaterThan(0);
    expect(screen.getByText("4-digit PIN, shop kiosk mode, and eligible active barbers")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Payments & Banking" })).not.toBeInTheDocument();
    expect(screen.getByText("Verification Status")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument();
    expect(screen.getByText("Payout Setup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("uses the public shop profile image in the single owner account identity card", () => {
    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      isLoading: false,
      error: new Error("Unable to load shop profile media."),
      refetch: vi.fn(),
      data: {
        viewer: {
          profilePhotoUrl: null,
          profilePhotoPath: null,
          notificationPreference: {
            inAppEnabled: true,
            emailEnabled: true,
            smsEnabled: false,
            pushEnabled: true
          }
        },
        shops: [
          {
            shopId: "shop-the-bvrb3r-shop-universi-a02c68",
            name: "The BVRB3R™ Shop (University Mall)",
            label: "The BVRB3R™ Shop (University Mall)",
            brandLine: "University Mall cuts.",
            publicUsername: "thebvrb3rshopuniversitymall",
            profilePhotoUrl: "https://cdn.example.com/shop-logo.png",
            profilePhotoPath: "profiles/shops/shop-the-bvrb3r-shop-universi-a02c68/profile/logo.png",
            city: "Pending",
            state: "Pending",
            address: null,
            gallery: []
          }
        ]
      }
    });

    render(<OwnerSettingsWorkspace user={{ ...resolveDemoUser("owner@bvrb3r.demo"), name: "BVRB3R Owner" }} />);

    const ownerAccountCard = screen.getByTestId("owner-more-identity-card");
    expect(within(ownerAccountCard).queryByAltText("BVRB3R Owner profile photo")).not.toBeInTheDocument();
    expect(within(ownerAccountCard).getByText("BO")).toBeInTheDocument();
    expect(screen.getAllByTestId("owner-more-identity-card")).toHaveLength(1);
    expect(within(ownerAccountCard).queryByText("@thebvrb3rshopuniversitymall")).not.toBeInTheDocument();

    const shopIdentity = screen.getByTestId("owner-public-shop-identity-section");
    expect(within(shopIdentity).getByText("@thebvrb3rshopuniversitymall")).toBeInTheDocument();
    expect(within(shopIdentity).getByRole("img")).toHaveAttribute("src", "https://cdn.example.com/shop-logo.png");
    expect(within(shopIdentity).getByRole("heading", { name: /Shop \(University Mall\)/i })).toBeInTheDocument();
    expect(screen.queryByText(/Pending - Pending, Pending/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to resolve the signed-in profile.")).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to load shop profile media.")).not.toBeInTheDocument();
  });

  it("falls back to the owner viewer photo when no shop profile image exists", () => {
    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      data: {
        viewer: {
          profilePhotoUrl: "https://cdn.example.com/owner-human.jpg",
          profilePhotoPath: "profiles/owners/owner-profile/photo.jpg",
          notificationPreference: {
            inAppEnabled: true,
            emailEnabled: true,
            smsEnabled: false,
            pushEnabled: true
          }
        },
        shops: [
          {
            shopId: "shop-the-bvrb3r-shop-universi-a02c68",
            name: "The BVRB3Râ„¢ Shop (University Mall)",
            label: "The BVRB3Râ„¢ Shop (University Mall)",
            brandLine: "University Mall cuts.",
            publicUsername: "thebvrb3rshopuniversitymall",
            profilePhotoUrl: null,
            profilePhotoPath: null,
            city: "Tampa",
            state: "FL",
            zipCode: "33612",
            address: "2200 E Fowler Ave",
            neighborhood: "Do not show me",
            gallery: []
          }
        ]
      }
    });

    render(<OwnerSettingsWorkspace user={{ ...resolveDemoUser("owner@bvrb3r.demo"), name: "BVRB3R Owner" }} />);

    const ownerAccountCard = screen.getByTestId("owner-more-identity-card");
    expect(within(ownerAccountCard).getByAltText("BVRB3R Owner profile photo")).toHaveAttribute("src", "https://cdn.example.com/owner-human.jpg");
    expect(within(ownerAccountCard).getByRole("heading", { name: "BVRB3R Owner" })).toBeInTheDocument();
    expect(within(ownerAccountCard).getByText("SHOP OWNER ACCOUNT")).toBeInTheDocument();
    expect(within(ownerAccountCard).getAllByText("owner@bvrb3r.demo").length).toBeGreaterThan(0);
    expect(within(ownerAccountCard).queryByText("@thebvrb3rshopuniversitymall")).not.toBeInTheDocument();
    expect(within(ownerAccountCard).queryByText("2200 E Fowler Ave - Tampa, FL 33612")).not.toBeInTheDocument();
    expect(within(ownerAccountCard).queryByText("Do not show me")).not.toBeInTheDocument();
    expect(within(ownerAccountCard).getByText("Payouts connected")).toBeInTheDocument();
    expect(screen.getAllByTestId("owner-more-identity-card")).toHaveLength(1);
    const shopIdentity = screen.getByTestId("owner-public-shop-identity-section");
    expect(within(shopIdentity).getByText("@thebvrb3rshopuniversitymall")).toBeInTheDocument();
    expect(within(shopIdentity).getByText("2200 E Fowler Ave - Tampa, FL 33612")).toBeInTheDocument();
  });

  it("falls back to owner initials when neither shop nor viewer image exists", () => {
    render(<OwnerSettingsWorkspace user={{ ...resolveDemoUser("owner@bvrb3r.demo"), name: "BVRB3R Owner" }} />);

    const ownerAccountCard = screen.getByTestId("owner-more-identity-card");
    expect(within(ownerAccountCard).getByText("BO")).toBeInTheDocument();
    expect(within(ownerAccountCard).queryByAltText("BVRB3R Owner profile photo")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("owner-more-identity-card")).toHaveLength(1);
    expect(screen.queryByTestId("owner-public-shop-profile-card")).not.toBeInTheDocument();
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
    expect(screen.getByText("Payouts connected")).toBeInTheDocument();
  });

  it("keeps team relationship controls as a settings row", () => {
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

    expect(screen.getByText("Team & Roles")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Team & Roles/ })).toHaveAttribute("href", "/onboarding/owner/team");
    expect(screen.queryByRole("heading", { name: "Invite barber" })).not.toBeInTheDocument();
  });
});
