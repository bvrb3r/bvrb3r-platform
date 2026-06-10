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
    expect(screen.getByRole("button", { name: "Manage Payment Method" })).toBeInTheDocument();
    expect(screen.getByText("Payout Method")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Payout Method" })).toBeInTheDocument();
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
    expect(screen.getByText("BVRB3R App Settings")).toBeInTheDocument();
    expect(screen.getByText("Notifications & Alerts")).toBeInTheDocument();
    expect(screen.getByText("Messages, reminders, shop alerts, payout alerts, and business alerts")).toBeInTheDocument();
    expect(screen.getByText("SHOP BUSINESS SETTINGS")).toBeInTheDocument();
    expect(screen.getByText("Manage the tools that control your shop profile, team, services, hours, policies, kiosk, and operating model.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Shop Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Business Setup" })).not.toBeInTheDocument();
    ["Booth Rent, Commission & Fees", "Shop Hours", "Shop Policies", "Team & Roles", "Kiosk Settings", "Performance"].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Shop Information")).not.toBeInTheDocument();
    expect(screen.queryByText("Branding")).not.toBeInTheDocument();
    expect(screen.queryByText("Services")).not.toBeInTheDocument();
    expect(screen.queryByText("Alerts")).not.toBeInTheDocument();
    expect(screen.getAllByText("Kiosk Settings").length).toBeGreaterThan(0);
    expect(screen.getByText("4-digit PIN, shop kiosk mode, walk-in routing, and eligible active barbers")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payments & Banking" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wallet \/ Billing Default payment method/ })).toHaveAttribute("href", "/dashboard/owner/money?section=wallet");
    expect(screen.getByRole("heading", { name: "Compliance & Security" })).toBeInTheDocument();
    expect(screen.getByText("Identity Verification")).toBeInTheDocument();
    expect(screen.getByText("Government ID or driver license proving who owns the owner account")).toBeInTheDocument();
    expect(screen.getByText("Business Verification")).toBeInTheDocument();
    expect(screen.getByText("Barber shop license, LLC/business document, EIN/tax details, and required uploads")).toBeInTheDocument();
    expect(screen.getByText("Password & Login")).toBeInTheDocument();
    expect(screen.getByText("Account Security")).toBeInTheDocument();
    expect(screen.queryByText("Verification Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Business Documents")).not.toBeInTheDocument();
    expect(screen.queryByText("Security & Access")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument();
    expect(screen.getByText("Stripe Connect")).toBeInTheDocument();
    expect(screen.getByText("Owner Payouts")).toBeInTheDocument();
    expect(screen.getByText("Shop payout schedule, commission payouts, payout status, release timing, and payout history")).toBeInTheDocument();
    expect(screen.getByText("Rewards")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText("Shop sales, receipts, spending, subscriptions, refunds, failed payments, credits, and payout movement")).toBeInTheDocument();
    expect(screen.queryByText("Payout Schedule")).not.toBeInTheDocument();
    expect(screen.queryByText("Payout Setup")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Account Owner name/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Public Profile Owner\/shop/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Help Support resources/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Help Center Guides/ })).toHaveAttribute("href", "/contact");
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
            city: "Tampa",
            state: "FL",
            zipCode: "33612",
            address: "2172 University Square Mall",
            phone: "+18136250040",
            businessEmail: "bvrb3r@gmail.com",
            gallery: []
          }
        ]
      }
    });

    render(<OwnerSettingsWorkspace user={{ ...resolveDemoUser("owner@bvrb3r.demo"), name: "BVRB3R Owner" }} />);

    const ownerAccountCard = screen.getByTestId("owner-more-identity-card");
    expect(within(ownerAccountCard).getByAltText("BVRB3R Owner profile photo")).toHaveAttribute("src", "https://cdn.example.com/shop-logo.png");
    expect(screen.getAllByTestId("owner-more-identity-card")).toHaveLength(1);
    expect(within(ownerAccountCard).getByText("@thebvrb3rshopuniversitymall")).toBeInTheDocument();
    expect(within(ownerAccountCard).getByText("+18136250040")).toBeInTheDocument();
    expect(within(ownerAccountCard).getByText("bvrb3r@gmail.com")).toBeInTheDocument();
    expect(within(ownerAccountCard).getByText("2172 University Square Mall - Tampa, FL 33612")).toBeInTheDocument();
    expect(within(ownerAccountCard).queryByText("Owner username not set")).not.toBeInTheDocument();
    expect(within(ownerAccountCard).queryByText("Owner location not set")).not.toBeInTheDocument();
    expect(screen.queryByTestId("owner-public-shop-identity-section")).not.toBeInTheDocument();
    expect(screen.queryByText(/Public shop identity/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Preview Public Profile" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Account" }));
    expect(screen.getByLabelText("BVRB3R Username")).toHaveValue("thebvrb3rshopuniversitymall");
    expect(screen.queryByText(/Pending - Pending, Pending/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to resolve the signed-in profile.")).not.toBeInTheDocument();
    expect(screen.queryByText("Unable to load shop profile media.")).not.toBeInTheDocument();
  });

  it("opens focused More modals for owner rows and account session logout", () => {
    render(<OwnerSettingsWorkspace user={resolveDemoUser("owner@bvrb3r.demo")} />);

    fireEvent.click(screen.getByRole("link", { name: /Wallet \/ Billing Default payment method/ }));
    let dialog = screen.getByRole("dialog", { name: "Wallet / Billing" });
    expect(within(dialog).getByLabelText("Close setting modal")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save Changes" })).toBeDisabled();
    expect(within(dialog).getByRole("link", { name: "Open attached destination" })).toHaveAttribute("href", "/dashboard/owner/money?section=wallet");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("link", { name: /Business Verification Barber shop license, LLC\/business document/ }));
    dialog = screen.getByRole("dialog", { name: "Business Verification" });
    expect(within(dialog).getByText("Shop license")).toBeInTheDocument();
    expect(within(dialog).getByText("LLC or business document")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText("Close setting modal"));

    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    dialog = screen.getByRole("dialog", { name: "Log Out" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Log out" })).toBeInTheDocument();
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
    expect(within(ownerAccountCard).getByText("@thebvrb3rshopuniversitymall")).toBeInTheDocument();
    expect(within(ownerAccountCard).getByText("2200 E Fowler Ave - Tampa, FL 33612")).toBeInTheDocument();
    expect(within(ownerAccountCard).queryByText("Do not show me")).not.toBeInTheDocument();
    expect(within(ownerAccountCard).getByText("Payouts connected")).toBeInTheDocument();
    expect(screen.getAllByTestId("owner-more-identity-card")).toHaveLength(1);
    expect(screen.queryByTestId("owner-public-shop-identity-section")).not.toBeInTheDocument();
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
