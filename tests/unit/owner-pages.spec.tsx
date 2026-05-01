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
import OwnerSchedulePage from "@/app/(platform)/dashboard/owner/schedule/page";
import OwnerMoneyPage from "@/app/(platform)/dashboard/owner/money/page";
import OwnerSettingsPage from "@/app/(platform)/dashboard/owner/settings/page";

describe("owner dashboard tab pages", () => {
  beforeEach(() => {
    getAuthorizedUserMock.mockReset();
  });

  it("renders the owner team workspace on the canonical team tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerTeamPage());

    expect(screen.getByTestId("owner-team-workspace-stub")).toBeInTheDocument();
  });

  it("renders the owner schedule workspace on the canonical schedule tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerSchedulePage());

    expect(screen.getByRole("heading", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByTestId("owner-schedule-workspace-stub")).toBeInTheDocument();
  });

  it("renders the owner money workspace on the canonical money tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerMoneyPage({
        searchParams: Promise.resolve({ view: "money" })
      })
    );

    expect(screen.getByRole("heading", { name: "Money" })).toBeInTheDocument();
    expect(screen.getByTestId("owner-money-workspace-stub")).toBeInTheDocument();
    expect(screen.getByTestId("fintech-workspace-stub")).toHaveTextContent("loc-ybor,loc-hyde");
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

  it("renders the owner settings workspace on the canonical settings tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerSettingsPage({
        searchParams: Promise.resolve({ section: "services" })
      })
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getAllByTestId("account-session-workspace-stub").length).toBeGreaterThan(0);
    expect(screen.getByTestId("owner-settings-workspace-stub")).toHaveTextContent("services");
  });
});
