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
  OwnerSettingsWorkspace: () => <div data-testid="owner-settings-workspace-stub">Owner settings workspace</div>
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

import TeamPage from "@/app/(platform)/team/page";
import AppointmentsPage from "@/app/(platform)/appointments/page";
import SettingsPage from "@/app/(platform)/settings/page";
import ReportsPage from "@/app/(platform)/reports/page";

describe("owner route polish", () => {
  beforeEach(() => {
    getAuthorizedUserMock.mockReset();
  });

  it("renders the owner team workspace on the team route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await TeamPage());

    expect(screen.getByText("Team performance and staffing")).toBeInTheDocument();
    expect(screen.getByTestId("owner-team-workspace-stub")).toBeInTheDocument();
  });

  it("renders the owner schedule workspace on the appointments route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await AppointmentsPage());

    expect(screen.getByText("Shop schedule")).toBeInTheDocument();
    expect(screen.getByTestId("owner-schedule-workspace-stub")).toBeInTheDocument();
  });

  it("renders the owner settings workspace on the settings route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await SettingsPage());

    expect(screen.getByText("Settings and shop posture")).toBeInTheDocument();
    expect(screen.getByTestId("owner-settings-workspace-stub")).toBeInTheDocument();
  });

  it("renders the money view on reports when requested", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await ReportsPage({ searchParams: Promise.resolve({ view: "money" }) }));

    expect(screen.getByText("Money command")).toBeInTheDocument();
    expect(screen.getByTestId("owner-money-workspace-stub")).toBeInTheDocument();
    expect(screen.getByTestId("fintech-workspace-stub")).toHaveTextContent("loc-ybor,loc-hyde");
  });

  it("parks the growth view honestly and keeps the owner on canonical money surfaces", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await ReportsPage({ searchParams: Promise.resolve({ view: "growth" }) }));

    expect(screen.getByText("Growth parked")).toBeInTheDocument();
    expect(screen.getByText(/Growth tools are parked until the canonical growth phase is built/i)).toBeInTheDocument();
    expect(screen.getByTestId("owner-money-workspace-stub")).toBeInTheDocument();
    expect(screen.getByTestId("fintech-workspace-stub")).toHaveTextContent("loc-ybor,loc-hyde");
  });
});
