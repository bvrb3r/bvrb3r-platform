import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const { getAuthorizedUserMock } = vi.hoisted(() => ({
  getAuthorizedUserMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getAuthorizedUser: getAuthorizedUserMock
}));

vi.mock("@/components/operations/owner-overview", () => ({
  OwnerOverview: () => <div data-testid="owner-overview-stub">Owner overview</div>
}));

vi.mock("@/components/operations/manager-overview", () => ({
  ManagerOverview: ({ locationIds }: { locationIds: string[] }) => <div data-testid="manager-overview-stub">{locationIds.join(",")}</div>
}));

vi.mock("@/components/operations/front-desk-workspace", () => ({
  FrontDeskWorkspace: ({ locationIds }: { locationIds?: string[] }) => <div data-testid="front-desk-workspace-stub">{locationIds?.join(",")}</div>
}));

vi.mock("@/components/operations/barber-workspace", () => ({
  BarberWorkspace: ({ barberName }: { barberName: string }) => <div data-testid="barber-workspace-stub">{barberName}</div>
}));

vi.mock("@/components/operations/barber-command-workspace", () => ({
  BarberCommandWorkspace: ({ barberName }: { barberName: string }) => <div data-testid="barber-command-workspace-stub">{barberName}</div>
}));

vi.mock("@/components/operations/client-workspace", () => ({
  ClientWorkspace: ({ clientId }: { clientId: string }) => <div data-testid="client-workspace-stub">{clientId}</div>
}));

import OwnerDashboardPage from "@/app/(platform)/dashboard/owner/page";
import ManagerDashboardPage from "@/app/(platform)/dashboard/manager/page";
import FrontDeskDashboardPage from "@/app/(platform)/dashboard/front-desk/page";
import BarberDashboardPage from "@/app/(platform)/dashboard/barber/page";
import BarberCommandPage from "@/app/(platform)/command/page";
import ClientDashboardPage from "@/app/(platform)/dashboard/client/page";

describe("dashboard role pages", () => {
  beforeEach(() => {
    getAuthorizedUserMock.mockReset();
  });

  it("renders the owner control center for the owner route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerDashboardPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["owner"]);
    expect(screen.getByText("Owner control center")).toBeInTheDocument();
    expect(screen.getByTestId("owner-overview-stub")).toBeInTheDocument();
  });

  it("renders the shop command center for the manager route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));

    render(await ManagerDashboardPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["manager"]);
    expect(screen.getByText("Shop command center")).toBeInTheDocument();
    expect(screen.getByTestId("manager-overview-stub")).toHaveTextContent("loc-ybor");
  });

  it("renders the barber-manager command center for the wave demo account", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("wave@bvrb3r.demo"));

    render(await ManagerDashboardPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["manager"]);
    expect(screen.getByText("Barber manager command center")).toBeInTheDocument();
    expect(screen.getByTestId("manager-overview-stub")).toHaveTextContent("loc-ybor");
  });

  it("renders the front desk board for the front desk route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("frontdesk@bvrb3r.demo"));

    render(await FrontDeskDashboardPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["front_desk"]);
    expect(screen.getByText("Front desk live board")).toBeInTheDocument();
    expect(screen.getByTestId("front-desk-workspace-stub")).toHaveTextContent("loc-ybor");
  });

  it("renders the dedicated barber workspace for barber routes", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    render(await BarberDashboardPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["commission_barber", "booth_rent_barber"]);
    expect(screen.getByRole("heading", { name: "Chair calendar" })).toBeInTheDocument();
    expect(screen.getByTestId("barber-workspace-stub")).toHaveTextContent("Blaze King");
    expect(screen.queryByText("Owner control center")).not.toBeInTheDocument();
  });

  it("renders the dedicated barber command workspace", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    render(await BarberCommandPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["commission_barber", "booth_rent_barber"]);
    expect(screen.getByText("Barber Command")).toBeInTheDocument();
    expect(screen.getByTestId("barber-command-workspace-stub")).toHaveTextContent("Blaze King");
  });

  it("renders the dedicated client workspace for client routes", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));

    render(await ClientDashboardPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["client"]);
    expect(screen.getByText("Your next visit, already in motion")).toBeInTheDocument();
    expect(screen.getByTestId("client-workspace-stub")).toHaveTextContent("client-jordan");
    expect(screen.queryByText("Owner control center")).not.toBeInTheDocument();
  });
});
