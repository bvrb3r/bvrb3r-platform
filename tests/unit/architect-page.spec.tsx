import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

const {
  getPlatformAdminUserMock,
  getArchitectDashboardPayloadMock
} = vi.hoisted(() => ({
  getPlatformAdminUserMock: vi.fn(),
  getArchitectDashboardPayloadMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getPlatformAdminUser: getPlatformAdminUserMock
}));

vi.mock("@/lib/platform-admin/accounts-service", () => ({
  getArchitectDashboardPayload: getArchitectDashboardPayloadMock
}));

vi.mock("@/components/operations/architect-dashboard", () => ({
  ArchitectDashboard: ({ initialData }: { initialData: { actorName: string; warnings?: string[]; counts: { totalAccounts: number } } }) => (
    <div data-testid="architect-dashboard-stub">
      <span>{initialData.actorName}</span>
      <span data-testid="architect-total-accounts">{initialData.counts.totalAccounts}</span>
      <span data-testid="architect-warning-count">{initialData.warnings?.length ?? 0}</span>
    </div>
  )
}));

import ArchitectPage from "@/app/(platform)/architect/page";

describe("architect page", () => {
  beforeEach(() => {
    getPlatformAdminUserMock.mockReset();
    getArchitectDashboardPayloadMock.mockReset();
  });

  it("renders the real founder dashboard with server-loaded counts", async () => {
    getPlatformAdminUserMock.mockResolvedValue(makePlatformAdminUser());
    getArchitectDashboardPayloadMock.mockResolvedValue({
      actorName: "Architect",
      counts: {
        totalAccounts: 3,
        totalClients: 0,
        totalBarbers: 1,
        totalShopOwners: 1,
        totalPlatformAdmins: 1,
        pendingBarberApprovals: 1,
        pendingShopOwnerApprovals: 1,
        approvedBarbers: 0,
        approvedShops: 0,
        suspendedAccounts: 0,
        bannedAccounts: 0
      },
      recentSignups: [],
      recentApprovalActions: [],
      warnings: []
    });

    render(await ArchitectPage());

    expect(screen.getByTestId("architect-dashboard-stub")).toHaveTextContent("Architect");
    expect(screen.getByTestId("architect-total-accounts")).toHaveTextContent("3");
    expect(screen.getByTestId("architect-warning-count")).toHaveTextContent("0");
  });

  it("falls back to true zero counts when the dashboard payload is invalid", async () => {
    const founder = makePlatformAdminUser();
    getPlatformAdminUserMock.mockResolvedValue(founder);
    getArchitectDashboardPayloadMock.mockResolvedValue(null);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(await ArchitectPage());

    expect(screen.getByTestId("architect-dashboard-stub")).toHaveTextContent(founder.name);
    expect(screen.getByTestId("architect-total-accounts")).toHaveTextContent("0");
    expect(screen.getByTestId("architect-warning-count")).toHaveTextContent("0");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("renders a degraded founder payload instead of crashing on account-source errors", async () => {
    const founder = makePlatformAdminUser();
    getPlatformAdminUserMock.mockResolvedValue(founder);
    getArchitectDashboardPayloadMock.mockRejectedValue({
      code: "42P01",
      details: null,
      hint: null,
      message: "relation \"profiles\" does not exist"
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(await ArchitectPage());

    expect(screen.getByTestId("architect-dashboard-stub")).toHaveTextContent(founder.name);
    expect(screen.getByTestId("architect-total-accounts")).toHaveTextContent("0");
    expect(screen.getByTestId("architect-warning-count")).toHaveTextContent("1");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
