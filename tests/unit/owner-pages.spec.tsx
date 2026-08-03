import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const { getAuthorizedUserMock } = vi.hoisted(() => ({
  getAuthorizedUserMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getAuthorizedUser: getAuthorizedUserMock
}));

vi.mock("@/components/operations/owner-team-workspace", () => ({
  OwnerTeamWorkspace: () => <div data-testid="owner-team-workspace-stub">Owner team workspace</div>
}));

vi.mock("@/components/operations/owner-overview", () => ({
  OwnerOverview: () => <div data-testid="owner-overview-stub">Owner overview workspace</div>
}));

vi.mock("@/components/operations/owner-operations-workspace", () => ({
  OwnerOperationsWorkspace: ({
    shopIds,
    initialTab
  }: {
    shopIds: string[];
    initialTab?: string;
  }) => (
    <div
      data-testid="owner-operations-workspace-stub"
      data-shop-ids={shopIds.filter(Boolean).join(",")}
      data-initial-tab={initialTab ?? "home"}
    >
      Owner operations workspace
    </div>
  )
}));

vi.mock("@/components/messages/messaging-inbox-screen", () => ({
  MessagingInboxScreen: ({ surface }: { surface: string }) => <div data-testid="messaging-inbox-stub">{surface}</div>
}));

vi.mock("@/components/operations/owner-schedule-workspace", () => ({
  OwnerScheduleWorkspace: () => <div data-testid="owner-schedule-workspace-stub">Owner schedule workspace</div>
}));

vi.mock("@/components/operations/owner-settings-workspace", () => ({
  OwnerSettingsWorkspace: ({ initialSection }: { initialSection?: string }) => (
    <div data-testid="owner-settings-workspace-stub">{initialSection ?? "none"}</div>
  )
}));

vi.mock("@/components/auth/account-session-workspace", () => ({
  AccountSessionWorkspace: () => <div data-testid="account-session-workspace-stub">Account session workspace</div>
}));

vi.mock("@/components/operations/owner-money-workspace", () => ({
  OwnerMoneyWorkspace: () => <div data-testid="owner-money-workspace-stub">Owner money workspace</div>
}));

vi.mock("@/components/operations/fintech-workspace", () => ({
  FintechWorkspace: ({ locationIds }: { locationIds: string[] }) => <div data-testid="fintech-workspace-stub">{locationIds.join(",")}</div>
}));

import OwnerTeamPage from "@/app/(platform)/dashboard/owner/team/page";
import OwnerDashboardPage from "@/app/(platform)/dashboard/owner/page";
import OwnerOverviewPage from "@/app/(platform)/dashboard/owner/overview/page";
import OwnerSchedulePage from "@/app/(platform)/dashboard/owner/schedule/page";
import OwnerMoneyPage from "@/app/(platform)/dashboard/owner/money/page";
import OwnerMessagesPage from "@/app/(platform)/dashboard/owner/messages/page";
import OwnerMorePage from "@/app/(platform)/dashboard/owner/more/page";
import OwnerSettingsPage from "@/app/(platform)/dashboard/owner/settings/page";

describe("owner dashboard tab pages", () => {
  beforeEach(() => {
    getAuthorizedUserMock.mockReset();
  });

  it("renders shop-scoped owner operations on the canonical home tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerDashboardPage());

    expect(screen.getByTestId("owner-operations-workspace-stub")).toHaveAttribute("data-initial-tab", "home");
  });

  it("keeps the team route on the privacy-safe team view", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerTeamPage());

    expect(screen.getByTestId("owner-team-workspace-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-operations-workspace-stub")).not.toBeInTheDocument();
  });

  it("routes the old overview alias to canonical Owner Home", () => {
    expect(() => OwnerOverviewPage()).toThrow("NEXT_REDIRECT");
  });

  it("renders Floor Day on the canonical schedule tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerSchedulePage());

    expect(screen.getByTestId("owner-schedule-workspace-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-operations-workspace-stub")).not.toBeInTheDocument();
  });

  it("keeps the canonical money tab limited to owner plan and booth rent", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerMoneyPage({
        searchParams: Promise.resolve({ view: "money" })
      })
    );

    expect(screen.getByRole("link", { name: "Open booth rent" })).toHaveAttribute("href", "/dashboard/owner/rent");
    expect(screen.queryByTestId("owner-operations-workspace-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fintech-workspace-stub")).not.toBeInTheDocument();
  });

  it("renders the owner messages tab on the shared shop messaging surface", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerMessagesPage());

    expect(screen.getByTestId("messaging-inbox-stub")).toHaveTextContent("shop");
    expect(screen.queryByTestId("owner-team-workspace-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("owner-overview-stub")).not.toBeInTheDocument();
  });

  it("keeps the growth placeholder available on the owner money tab when requested", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerMoneyPage({
        searchParams: Promise.resolve({ view: "growth" })
      })
    );

    expect(screen.getByText("Growth parked")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-operations-workspace-stub")).not.toBeInTheDocument();
  });

  it("keeps detailed owner fintech closed to protect barber money", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerMoneyPage({
        searchParams: Promise.resolve({ view: "fintech" })
      })
    );

    expect(screen.queryByTestId("owner-operations-workspace-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fintech-workspace-stub")).not.toBeInTheDocument();
    expect(screen.getByText("Detailed finance closed")).toBeInTheDocument();
  });

  it("renders the owner More workspace on the canonical More tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerMorePage({
        searchParams: Promise.resolve({ section: "services" })
      })
    );

    expect(screen.getByTestId("owner-settings-workspace-stub")).toHaveTextContent("services");
    expect(screen.queryByTestId("account-session-workspace-stub")).not.toBeInTheDocument();
  });

  it("keeps the legacy owner settings route as a More alias", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerSettingsPage({
        searchParams: Promise.resolve({ section: "services" })
      })
    );

    expect(screen.getByTestId("owner-settings-workspace-stub")).toHaveTextContent("services");
    expect(screen.queryByTestId("owner-team-workspace-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("owner-overview-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-session-workspace-stub")).not.toBeInTheDocument();
  });
});
