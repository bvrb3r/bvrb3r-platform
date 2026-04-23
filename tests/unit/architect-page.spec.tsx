import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

const {
  getPlatformAdminUserMock,
  getPlatformAdminConsolePayloadMock
} = vi.hoisted(() => ({
  getPlatformAdminUserMock: vi.fn(),
  getPlatformAdminConsolePayloadMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getPlatformAdminUser: getPlatformAdminUserMock
}));

vi.mock("@/lib/platform-admin/service", () => ({
  getPlatformAdminConsolePayload: getPlatformAdminConsolePayloadMock
}));

vi.mock("@/components/operations/architect-console", () => ({
  ArchitectConsole: ({ initialData }: { initialData: { actorName: string; warnings?: string[]; overview: { totalUsers: number } } }) => (
    <div data-testid="architect-console-stub">
      <span>{initialData.actorName}</span>
      <span data-testid="architect-total-users">{initialData.overview.totalUsers}</span>
      <span data-testid="architect-warning-count">{initialData.warnings?.length ?? 0}</span>
    </div>
  )
}));

import ArchitectPage from "@/app/(platform)/architect/page";

describe("architect page", () => {
  beforeEach(() => {
    getPlatformAdminUserMock.mockReset();
    getPlatformAdminConsolePayloadMock.mockReset();
  });

  it("renders the real architect console with server-loaded platform metrics", async () => {
    getPlatformAdminUserMock.mockResolvedValue(makePlatformAdminUser());
    getPlatformAdminConsolePayloadMock.mockResolvedValue({
      actorName: "Architect",
      overview: {
        totalUsers: 3,
        activeClients: 0,
        activeBarbers: 1,
        activeShops: 1,
        bookingsToday: 2,
        revenueToday: 125,
        payoutIssues: 1,
        billingIssues: 0,
        fraudFlags: 0,
        kioskActiveCount: 1,
        aiManagerActiveCount: 1,
        releaseReadyCount: 4,
        releaseAttentionCount: 1
      },
      users: [],
      shops: [],
      moneyRisk: {
        openAnomalies: 1,
        criticalAnomalies: 0,
        billingFailures: 0,
        disputesOpen: 0,
        pointsLiabilityValue: 0,
        fraudReviewRate: 0,
        reversalRate: 0,
        overdueBoothRent: 0,
        recentAnomalies: [],
        recentCashouts: [],
        recentDisputes: []
      },
      support: [],
      controls: {
        shops: [],
        release: {
          readyCount: 4,
          attentionCount: 1
        }
      },
      auditLog: [],
      warnings: []
    });

    render(await ArchitectPage());

    expect(screen.getByTestId("architect-console-stub")).toHaveTextContent("Architect");
    expect(screen.getByTestId("architect-total-users")).toHaveTextContent("3");
    expect(screen.getByTestId("architect-warning-count")).toHaveTextContent("0");
  });

  it("falls back to true zero counts when the console payload is invalid", async () => {
    const founder = makePlatformAdminUser();
    getPlatformAdminUserMock.mockResolvedValue(founder);
    getPlatformAdminConsolePayloadMock.mockResolvedValue(null);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(await ArchitectPage());

    expect(screen.getByTestId("architect-console-stub")).toHaveTextContent(founder.name);
    expect(screen.getByTestId("architect-total-users")).toHaveTextContent("0");
    expect(screen.getByTestId("architect-warning-count")).toHaveTextContent("0");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("renders a degraded architect payload instead of crashing on platform-source errors", async () => {
    const founder = makePlatformAdminUser();
    getPlatformAdminUserMock.mockResolvedValue(founder);
    getPlatformAdminConsolePayloadMock.mockRejectedValue({
      code: "42P01",
      details: null,
      hint: null,
      message: "relation \"platform_admin_controls\" does not exist"
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(await ArchitectPage());

    expect(screen.getByTestId("architect-console-stub")).toHaveTextContent(founder.name);
    expect(screen.getByTestId("architect-total-users")).toHaveTextContent("0");
    expect(screen.getByTestId("architect-warning-count")).toHaveTextContent("1");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
