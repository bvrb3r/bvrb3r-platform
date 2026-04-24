import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useProfileMediaWorkspaceQueryMock,
  useFintechManagementQueryMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useFintechManagementQueryMock: vi.fn()
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock
}));

vi.mock("@/lib/fintech/client", () => ({
  useFintechManagementQuery: useFintechManagementQueryMock
}));

vi.mock("@/components/operations/kiosk-control-panel", () => ({
  KioskControlPanel: () => <div data-testid="kiosk-control-panel-stub">Kiosk control panel</div>
}));

vi.mock("@/components/marketplace/service-catalog-workspace", () => ({
  ServiceCatalogWorkspace: () => <div data-testid="service-catalog-workspace-stub">Service catalog</div>
}));

import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { OwnerSettingsWorkspace } from "@/components/operations/owner-settings-workspace";

describe("owner settings workspace", () => {
  beforeEach(() => {
    useProfileMediaWorkspaceQueryMock.mockReset();
    useFintechManagementQueryMock.mockReset();

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
          readyAccounts: 1,
          needsAttentionAccounts: 0,
          blockedRoutingRecords: 0,
          readyForPayoutAmount: 95
        },
        memberships: []
      }
    });
  });

  it("renders the owner settings lane from canonical profile and fintech posture", () => {
    render(<OwnerSettingsWorkspace user={resolveDemoUser("owner@bvrb3r.demo")} />);

    expect(screen.getByText("Owner approval still needs attention")).toBeInTheDocument();
    expect(screen.getByText(/Current status:/i)).toBeInTheDocument();
    expect(screen.getByText("$95 is currently ready for payout in the owner scope.")).toBeInTheDocument();
    expect(screen.getByTestId("kiosk-control-panel-stub")).toBeInTheDocument();
    expect(screen.getByTestId("service-catalog-workspace-stub")).toBeInTheDocument();
  });

  it("shows a verified posture when owner and shop approvals are clear", () => {
    useFintechManagementQueryMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        summary: {
          readyAccounts: 2,
          needsAttentionAccounts: 0,
          blockedRoutingRecords: 0,
          readyForPayoutAmount: 210
        },
        memberships: []
      }
    });

    render(<OwnerSettingsWorkspace user={{
      ...resolveDemoUser("owner@bvrb3r.demo"),
      appApprovalStatus: "approved",
      shopApprovalStatus: "approved"
    }} />);

    expect(screen.getByText("Verified and payout-ready posture")).toBeInTheDocument();
    expect(screen.getByText("Current status: Approved • Shop approval Approved")).toBeInTheDocument();
  });
});
