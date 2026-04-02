import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useProfileMediaWorkspaceQueryMock,
  useFintechManagementQueryMock,
  useOwnerEngagementIntelligenceMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useFintechManagementQueryMock: vi.fn(),
  useOwnerEngagementIntelligenceMock: vi.fn()
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock
}));

vi.mock("@/lib/fintech/client", () => ({
  useFintechManagementQuery: useFintechManagementQueryMock
}));

vi.mock("@/lib/engagement/client", () => ({
  useOwnerEngagementIntelligence: useOwnerEngagementIntelligenceMock
}));

vi.mock("@/components/operations/kiosk-control-panel", () => ({
  KioskControlPanel: () => <div data-testid="kiosk-control-panel-stub">Kiosk control panel</div>
}));

import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { OwnerSettingsWorkspace } from "@/components/operations/owner-settings-workspace";

describe("owner settings workspace", () => {
  beforeEach(() => {
    useProfileMediaWorkspaceQueryMock.mockReset();
    useFintechManagementQueryMock.mockReset();
    useOwnerEngagementIntelligenceMock.mockReset();

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
          readyAccounts: 1
        },
        memberships: []
      }
    });

    useOwnerEngagementIntelligenceMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        trust: {
          shopStatuses: [],
          shopTrustBadges: [],
          openReports: 0,
          openDisputes: 0
        },
        monetization: {
          subscriptions: {
            active: 0,
            billingAttention: 0,
            subscriptionRevenue: 0
          }
        },
        recentNotifications: []
      }
    });
  });

  it("does not overstate verification when trust status is missing", () => {
    render(<OwnerSettingsWorkspace user={resolveDemoUser("owner@bvrb3r.demo")} />);

    expect(screen.getByText("Verification still needs attention")).toBeInTheDocument();
    expect(screen.getAllByText("Trust badges will appear here as verification clears.").length).toBeGreaterThan(0);
    expect(screen.getByTestId("kiosk-control-panel-stub")).toBeInTheDocument();
  });

  it("shows canonical shop activation blockers when the owner lane is not eligible", () => {
    useOwnerEngagementIntelligenceMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        trust: {
          shopStatuses: [{
            shopId: "shop-bvrb3r",
            shopName: "BVRB3R Ybor",
            status: "pending",
            badgeLabel: "Verification in motion",
            verifiedCategories: [],
            verificationDecision: {
              canonicalOverallStatus: "needs_update",
              gates: {
                shop_activation: {
                  gate: "shop_activation",
                  allowed: false,
                  codes: ["business_verification_required"],
                  reasons: ["Business verification must be approved for this shop lane."],
                  degraded: false
                },
                payout: {
                  gate: "payout",
                  allowed: false,
                  codes: ["payout_verification_required"],
                  reasons: ["Payout verification must be approved for this shop lane."],
                  degraded: false
                }
              }
            }
          }],
          shopTrustBadges: [],
          openReports: 0,
          openDisputes: 0
        },
        monetization: {
          subscriptions: {
            active: 0,
            billingAttention: 0,
            subscriptionRevenue: 0
          }
        },
        recentNotifications: []
      }
    });

    render(<OwnerSettingsWorkspace user={resolveDemoUser("owner@bvrb3r.demo")} />);

    expect(screen.getByText("Verification still needs attention")).toBeInTheDocument();
    expect(screen.getByText("Business verification must be approved for this shop lane.")).toBeInTheDocument();
  });
});
