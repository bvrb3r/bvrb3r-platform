import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const { getAuthorizedUserMock, redirectMock } = vi.hoisted(() => ({
  getAuthorizedUserMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  })
}));

vi.mock("@/lib/auth/guards", () => ({
  getAuthorizedUser: getAuthorizedUserMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/components/dashboard/dashboard-shell", () => ({
  DashboardShell: ({
    children,
    title
  }: {
    children?: ReactNode;
    title: string;
  }) => (
    <div data-testid="dashboard-shell-stub">
      <h1>{title}</h1>
      {children}
    </div>
  )
}));

vi.mock("@/components/operations/barber-schedule-workspace", () => ({
  BarberScheduleWorkspace: ({ barberName }: { barberName: string }) => (
    <div data-testid="barber-schedule-workspace-stub">{barberName}</div>
  )
}));

vi.mock("@/components/operations/owner-schedule-workspace", () => ({
  OwnerScheduleWorkspace: () => <div data-testid="owner-schedule-workspace-stub">Owner schedule</div>
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children?: ReactNode }) => <div data-testid="card-stub">{children}</div>
}));

vi.mock("@/components/operations/owner-team-workspace", () => ({
  OwnerTeamWorkspace: () => <div data-testid="owner-team-workspace-stub">Owner team</div>
}));

vi.mock("@/components/operations/team-workspace", () => ({
  TeamWorkspace: ({
    viewerRole,
    locationIds
  }: {
    viewerRole: "manager" | "front_desk";
    locationIds: string[];
  }) => (
    <div data-testid="team-workspace-stub">
      {viewerRole}:{locationIds.join(",")}
    </div>
  )
}));

import AppointmentsPage from "@/app/(platform)/appointments/page";
import TeamPage from "@/app/(platform)/team/page";

describe("role completion round 1 shared role pages", () => {
  beforeEach(() => {
    getAuthorizedUserMock.mockReset();
    redirectMock.mockClear();
  });

  it("keeps the appointments route barber-scoped for barber roles", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    await expect(AppointmentsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/dashboard/barber");

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["shop_owner_user", "manager", "front_desk", "barber_user"]);
  });

  it("keeps the appointments route owner-scoped for owner roles", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    await expect(AppointmentsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/dashboard/owner/schedule");
    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["shop_owner_user", "manager", "front_desk", "barber_user"]);
  });

  it("routes owners into the owner team lane only", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    await expect(TeamPage()).rejects.toThrow("REDIRECT:/dashboard/owner/team");
    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["shop_owner_user", "manager", "front_desk"]);
  });

  it("keeps manager and front desk views scoped to the shared team coverage lane", async () => {
    getAuthorizedUserMock.mockResolvedValueOnce(resolveDemoUser("manager@bvrb3r.demo"));
    render(await TeamPage());

    expect(screen.getByText("Team coverage and chair readiness")).toBeInTheDocument();
    expect(screen.getByTestId("team-workspace-stub")).toHaveTextContent("manager:loc-ybor");
    expect(screen.queryByTestId("owner-team-workspace-stub")).not.toBeInTheDocument();

    getAuthorizedUserMock.mockResolvedValueOnce(resolveDemoUser("frontdesk@bvrb3r.demo"));
    render(await TeamPage());

    expect(screen.getByText("Barber coverage and desk visibility")).toBeInTheDocument();
    expect(screen.getAllByTestId("team-workspace-stub").at(-1)).toHaveTextContent("front_desk:loc-ybor");
  });
});
