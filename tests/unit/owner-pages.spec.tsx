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
import OwnerSettingsPage from "@/app/(platform)/dashboard/owner/settings/page";

describe("owner dashboard tab pages", () => {
  beforeEach(() => {
    getAuthorizedUserMock.mockReset();
  });

  it("renders the owner team workspace on the canonical home tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerDashboardPage());

    expect(screen.getByTestId("owner-team-workspace-stub")).toBeInTheDocument();
  });

  it("keeps the legacy team route as an alias to owner home controls", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerTeamPage());

    expect(screen.getByTestId("owner-team-workspace-stub")).toBeInTheDocument();
  });

  it("keeps the old owner overview screen reachable", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerOverviewPage());

    expect(screen.getByTestId("owner-overview-stub")).toBeInTheDocument();
  });

  it("renders the owner schedule workspace on the canonical schedule tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerSchedulePage());

    expect(screen.getByTestId("owner-schedule-workspace-stub")).toBeInTheDocument();
  });

  it("renders the owner money workspace on the canonical money tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerMoneyPage({
        searchParams: Promise.resolve({ view: "money" })
      })
    );

    expect(screen.getByTestId("owner-money-workspace-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("fintech-workspace-stub")).not.toBeInTheDocument();
  });

  it("renders the owner messages tab on the shared shop messaging surface", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerMessagesPage());

    expect(screen.getByTestId("messaging-inbox-stub")).toHaveTextContent("shop");
  });

  it("keeps the growth placeholder available on the owner money tab when requested", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerMoneyPage({
        searchParams: Promise.resolve({ view: "growth" })
      })
    );

    expect(screen.getByText("Growth parked")).toBeInTheDocument();
    expect(screen.getByTestId("owner-money-workspace-stub")).toBeInTheDocument();
  });

  it("keeps fintech operations reachable from the owner money tab when requested", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerMoneyPage({
        searchParams: Promise.resolve({ view: "fintech" })
      })
    );

    expect(screen.getByTestId("owner-money-workspace-stub")).toBeInTheDocument();
    expect(screen.getByTestId("fintech-workspace-stub")).toHaveTextContent("loc-ybor,loc-hyde");
  });

  it("renders the owner settings workspace on the canonical settings tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerSettingsPage({
        searchParams: Promise.resolve({ section: "services" })
      })
    );

    expect(screen.getByTestId("owner-settings-workspace-stub")).toHaveTextContent("services");
    expect(screen.queryByTestId("account-session-workspace-stub")).not.toBeInTheDocument();
  });
});
