import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const { getAuthorizedUserMock, resolvePaywallMock } = vi.hoisted(() => ({
  getAuthorizedUserMock: vi.fn(),
  resolvePaywallMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getAuthorizedUser: getAuthorizedUserMock
}));

vi.mock("@/lib/entitlements/shop-owner-paywall", () => ({
  resolveShopOwnerPaywallSummaryForUser: resolvePaywallMock
}));

vi.mock("@/components/dashboard/dashboard-shell", () => ({
  DashboardShell: ({
    activeHref,
    children
  }: {
    activeHref: string;
    children: ReactNode;
  }) => <div data-testid="dashboard-shell" data-active-href={activeHref}>{children}</div>
}));

vi.mock("@/components/owner-experience/shop-owner-plan-access-card", () => ({
  ShopOwnerPlanAccessCard: () => <div data-testid="owner-plan-card" />
}));

vi.mock("@/components/operations/owner-schedule-workspace", () => ({
  OwnerScheduleWorkspace: () => <div data-testid="owner-schedule-workspace" />
}));

vi.mock("@/components/operations/owner-operations-workspace", () => ({
  OwnerOperationsWorkspace: ({
    embedded,
    initialTab
  }: {
    embedded?: boolean;
    initialTab?: string;
  }) => (
    <div
      data-testid="owner-operations-workspace"
      data-embedded={String(Boolean(embedded))}
      data-initial-tab={initialTab}
    />
  )
}));

import CanonicalOwnerAnalyticsPage from "@/app/shop/analytics/page";
import CanonicalOwnerChairsPage from "@/app/shop/chairs/page";
import CanonicalOwnerFloorPage from "@/app/shop/floor/page";
import CanonicalOwnerSchedulePage from "@/app/shop/schedule/page";

describe("canonical owner route behavior", () => {
  beforeEach(() => {
    getAuthorizedUserMock.mockReset();
    resolvePaywallMock.mockReset();
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    resolvePaywallMock.mockResolvedValue(null);
  });

  it("mounts the real owner schedule rather than duplicating Floor Day", async () => {
    render(await CanonicalOwnerSchedulePage());

    expect(screen.getByTestId("owner-schedule-workspace")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-operations-workspace")).not.toBeInTheDocument();
    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["shop_owner_user"]);
  });

  it("opens the shop-scoped chairs panel", async () => {
    render(await CanonicalOwnerChairsPage());

    expect(screen.getByTestId("owner-operations-workspace")).toHaveAttribute("data-initial-tab", "chairs");
    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["shop_owner_user"]);
  });

  it("opens canonical Floor Day inside the owner schedule shell", async () => {
    render(await CanonicalOwnerFloorPage());

    expect(screen.getByTestId("dashboard-shell")).toHaveAttribute(
      "data-active-href",
      "/dashboard/owner/schedule"
    );
    expect(screen.getByTestId("owner-operations-workspace")).toHaveAttribute(
      "data-initial-tab",
      "floor"
    );
    expect(screen.getByTestId("owner-operations-workspace")).toHaveAttribute(
      "data-embedded",
      "true"
    );
    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["shop_owner_user"]);
  });

  it("guards incomplete owner routes and labels them Needs Review", async () => {
    render(await CanonicalOwnerAnalyticsPage());

    expect(screen.getByText(/Needs Review/)).toBeInTheDocument();
    expect(screen.getByText("Analytics is not production-certified yet.")).toBeInTheDocument();
    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["shop_owner_user"]);
  });
});
