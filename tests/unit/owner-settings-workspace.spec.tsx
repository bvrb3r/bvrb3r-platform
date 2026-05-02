import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  useFintechManagementQueryMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  useFintechManagementQueryMock: vi.fn()
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutation: useMutateProfileMediaMutationMock
}));

vi.mock("@/lib/fintech/client", () => ({
  useFintechManagementQuery: useFintechManagementQueryMock
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

describe("owner settings workspace", () => {
  beforeEach(() => {
    useProfileMediaWorkspaceQueryMock.mockReset();
    useMutateProfileMediaMutationMock.mockReset();
    useFintechManagementQueryMock.mockReset();

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
  });

  it("renders the owner settings control center from canonical profile and fintech posture", () => {
    render(<OwnerSettingsWorkspace user={resolveDemoUser("owner@bvrb3r.demo")} />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Manage your shop & business controls")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shop Profile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Business Setup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payments & Banking" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Compliance & Security" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument();
    expect(screen.getByText("$95")).toBeInTheDocument();
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
    expect(screen.getByText("$210")).toBeInTheDocument();
  });
});
