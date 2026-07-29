import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MASTER_TRUTH_ACCOUNT_ROLES } from "@/lib/auth/roles";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

const { getPlatformAdminUserMock } = vi.hoisted(() => ({
  getPlatformAdminUserMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getPlatformAdminUser: getPlatformAdminUserMock
}));

vi.mock("@/components/architect/mission-control/mission-control", () => ({
  ArchitectMissionControl: ({ laneId }: { laneId?: string }) => <div data-lane-id={laneId} data-testid="architect-mission-control">Mission Control</div>
}));

import ArchitectPage from "@/app/(platform)/architect/page";
import ArchitectCeoPage from "@/app/(platform)/architect/ceo/page";
import ArchitectProductPage from "@/app/(platform)/architect/product/page";
import ArchitectTechnologyPage from "@/app/(platform)/architect/technology/page";
import ArchitectOperationsPage from "@/app/(platform)/architect/operations/page";
import ArchitectFinancePage from "@/app/(platform)/architect/finance/page";
import ArchitectMarketingPage from "@/app/(platform)/architect/marketing/page";
import ArchitectCompliancePage from "@/app/(platform)/architect/compliance/page";
import ArchitectSecurityPage from "@/app/(platform)/architect/security/page";
import ArchitectContentCommunityPage from "@/app/(platform)/architect/content-community/page";

describe("architect page", () => {
  beforeEach(() => {
    getPlatformAdminUserMock.mockReset();
  });

  it("renders the honest Architect City Map when production evidence is unavailable", async () => {
    getPlatformAdminUserMock.mockResolvedValue(makePlatformAdminUser());

    render(await ArchitectPage());

    expect(getPlatformAdminUserMock).toHaveBeenCalled();
    expect(screen.getByTestId("architect-city-map")).toHaveTextContent("Architect · the city, mapped");
    expect(screen.getByTestId("architect-city-map")).toHaveTextContent("Needs review");
    expect(screen.getByTestId("architect-city-map")).toHaveTextContent("Select a route checkpoint to inspect its production evidence");
    expect(screen.getByTestId("architect-system-ledger")).toHaveTextContent("No real records match");
    expect(screen.getAllByText(/Needs review/i).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("architect-mission-control")).not.toBeInTheDocument();
  });

  it("renders routed Mission Control lane pages for platform admins", async () => {
    getPlatformAdminUserMock.mockResolvedValue(makePlatformAdminUser());
    const pages = [
      [ArchitectCeoPage, "ceo"],
      [ArchitectProductPage, "product"],
      [ArchitectTechnologyPage, "technology"],
      [ArchitectOperationsPage, "operations"],
      [ArchitectFinancePage, "finance"],
      [ArchitectMarketingPage, "marketing"],
      [ArchitectCompliancePage, "compliance"],
      [ArchitectSecurityPage, "security"],
      [ArchitectContentCommunityPage, "content_community"]
    ] as const;

    for (const [Page, laneId] of pages) {
      const { unmount } = render(await Page());
      expect(screen.getByTestId("architect-mission-control")).toHaveAttribute("data-lane-id", laneId);
      unmount();
    }
  });

  it("keeps the CEO lane separate from the City Map home", async () => {
    getPlatformAdminUserMock.mockResolvedValue(makePlatformAdminUser());

    const home = render(await ArchitectPage());
    expect(screen.getByTestId("architect-city-map")).toBeInTheDocument();
    expect(screen.queryByTestId("architect-mission-control")).not.toBeInTheDocument();
    home.unmount();

    render(await ArchitectCeoPage());
    expect(screen.getByTestId("architect-mission-control")).toHaveAttribute("data-lane-id", "ceo");
    expect(screen.queryByTestId("architect-city-map")).not.toBeInTheDocument();
  });

  it("keeps public account roles scoped to V1 user roles", () => {
    expect([...MASTER_TRUTH_ACCOUNT_ROLES]).toEqual(["client_user", "barber_user", "shop_owner_user"]);
    expect([...MASTER_TRUTH_ACCOUNT_ROLES]).not.toContain("architect_user");
  });
});
