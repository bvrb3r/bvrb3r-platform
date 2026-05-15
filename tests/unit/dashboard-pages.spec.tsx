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

vi.mock("@/components/operations/owner-overview", () => ({
  OwnerOverview: () => (
    <div data-testid="owner-overview-stub">
      <h1>Overview</h1>
      Owner overview
    </div>
  )
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

vi.mock("@/components/operations/barber-schedule-workspace", () => ({
  BarberScheduleWorkspace: ({ barberName }: { barberName: string }) => <div data-testid="barber-schedule-workspace-stub">{barberName}</div>
}));

vi.mock("@/components/barber-experience/barber-checkout-screen", () => ({
  BarberCheckoutScreen: ({ barberName, initialSection }: { barberName: string; initialSection?: string }) => (
    <div data-testid="barber-checkout-screen-stub">{barberName}|{initialSection ?? "none"}</div>
  )
}));

vi.mock("@/components/barber-experience/barber-profile-screen", () => ({
  BarberProfileScreen: ({ user, initialSection }: { user: { name: string }; initialSection?: string }) => (
    <div data-testid="barber-profile-screen-stub">{user.name}|{initialSection ?? "none"}</div>
  )
}));

vi.mock("@/components/barber-experience/barber-settings-screen", () => ({
  BarberSettingsScreen: ({ user, initialSection }: { user: { name: string }; initialSection?: string }) => (
    <div data-testid="barber-more-screen-stub">{user.name}|{initialSection ?? "none"}</div>
  )
}));

vi.mock("@/components/messages/messaging-inbox-screen", () => ({
  MessagingInboxScreen: ({
    basePath,
    selectedThreadId,
    startSupportIntent,
    title
  }: {
    basePath: string;
    selectedThreadId?: string;
    startSupportIntent?: boolean;
    title?: string;
  }) => (
    <div data-testid="messages-screen-stub">
      <h1>{title}</h1>
      {basePath}|{selectedThreadId ?? "none"}|{String(Boolean(startSupportIntent))}
    </div>
  )
}));

vi.mock("@/components/operations/client-workspace", () => ({
  ClientWorkspace: ({ clientId }: { clientId: string }) => <div data-testid="client-workspace-stub">{clientId}</div>
}));

vi.mock("@/components/client-experience/client-app-shell", () => ({
  ClientAppShell: ({ children }: { children: ReactNode }) => <div data-testid="client-app-shell-stub">{children}</div>
}));

vi.mock("@/components/client-experience/client-home-screen", () => ({
  ClientHomeScreen: ({
    isSignedInClient,
    displayName
  }: {
    isSignedInClient: boolean;
    displayName: string;
  }) => (
    <div data-testid="client-home-screen-stub">
      {displayName}|{String(isSignedInClient)}
    </div>
  )
}));

vi.mock("@/components/auth/account-session-workspace", () => ({
  AccountSessionWorkspace: () => <div data-testid="account-session-workspace-stub">Account session</div>
}));

vi.mock("@/components/operations/owner-settings-workspace", () => ({
  OwnerSettingsWorkspace: () => <div data-testid="owner-settings-workspace-stub">Owner settings</div>
}));

import OwnerDashboardPage from "@/app/(platform)/dashboard/owner/page";
import OwnerSettingsPage from "@/app/(platform)/dashboard/owner/settings/page";
import ManagerDashboardPage from "@/app/(platform)/dashboard/manager/page";
import FrontDeskDashboardPage from "@/app/(platform)/dashboard/front-desk/page";
import BarberDashboardPage from "@/app/(platform)/dashboard/barber/page";
import BarberCalendarPage from "@/app/(platform)/dashboard/barber/calendar/page";
import BarberCheckoutPage from "@/app/(platform)/dashboard/barber/checkout/page";
import BarberMessagesPage from "@/app/(platform)/dashboard/barber/messages/page";
import BarberMorePage from "@/app/(platform)/dashboard/barber/more/page";
import BarberProfilePage from "@/app/(platform)/dashboard/barber/profile/page";
import BarberSettingsPage from "@/app/(platform)/dashboard/barber/settings/page";
import BarberCommandPage from "@/app/(platform)/command/page";
import ClientDashboardPage from "@/app/(platform)/dashboard/client/page";
import ClientMessagesDashboardPage from "@/app/(platform)/dashboard/client/messages/page";
import ClientMessageThreadDashboardPage from "@/app/(platform)/dashboard/client/messages/[threadId]/page";
import SettingsPage from "@/app/(platform)/settings/page";

describe("dashboard role pages", () => {
  beforeEach(() => {
    getAuthorizedUserMock.mockReset();
    redirectMock.mockClear();
  });

  it("renders the owner control center for the owner route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(await OwnerDashboardPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["shop_owner_user"]);
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
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

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["barber_user"]);
    expect(screen.getByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByTestId("barber-schedule-workspace-stub")).toHaveTextContent("Blaze King");
    expect(screen.getByTestId("shell-identity-name")).toHaveTextContent("Blaze King");
    expect(screen.queryByText("Owner control center")).not.toBeInTheDocument();
  });

  it("renders the barber calendar route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    render(await BarberCalendarPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["barber_user"]);
    expect(screen.getByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByTestId("barber-schedule-workspace-stub")).toHaveTextContent("Blaze King");
    expect(screen.getByTestId("shell-identity-name")).toHaveTextContent("Blaze King");
  });

  it("renders the barber checkout route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    render(
      await BarberCheckoutPage({
        searchParams: Promise.resolve({ section: "services" })
      })
    );

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["barber_user"]);
    expect(screen.getByRole("heading", { name: "Checkout" })).toBeInTheDocument();
    expect(screen.getByTestId("barber-checkout-screen-stub")).toHaveTextContent("Blaze King|services");
  });

  it("renders the barber profile route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    render(
      await BarberProfilePage({
        searchParams: Promise.resolve({ section: "reviews" })
      })
    );

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["barber_user"]);
    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByTestId("barber-profile-screen-stub")).toHaveTextContent("Blaze King|reviews");
  });

  it("renders the barber messages route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    render(await BarberMessagesPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["barber_user"]);
    expect(screen.getAllByRole("heading", { name: "Messages" }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("messages-screen-stub")).toHaveTextContent("/dashboard/barber/messages|none|false");
  });

  it("renders the barber more route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    render(
      await BarberMorePage({
        searchParams: Promise.resolve({ section: "payouts" })
      })
    );

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["barber_user"]);
    expect(screen.getByRole("heading", { name: "More" })).toBeInTheDocument();
    expect(screen.getByTestId("barber-more-screen-stub")).toHaveTextContent("Blaze King|payouts");
  });

  it("redirects the barber settings route into More", async () => {
    await expect(
      BarberSettingsPage({
        searchParams: Promise.resolve({ section: "payouts" })
      })
    ).rejects.toThrow("REDIRECT:/dashboard/barber/more?section=payouts");
  });

  it("redirects the legacy barber command entry into the barber calendar", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    await expect(BarberCommandPage()).rejects.toThrow("REDIRECT:/dashboard/barber");
  });

  it("renders the dedicated client workspace for client routes", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));

    render(await ClientDashboardPage());

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["client_user"]);
    expect(screen.getByTestId("client-app-shell-stub")).toBeInTheDocument();
    expect(screen.getByTestId("client-home-screen-stub")).toHaveTextContent("Jordan Ellis|true");
    expect(screen.queryByText("Owner control center")).not.toBeInTheDocument();
  });

  it("renders the client messages route and support intent", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));

    render(
      await ClientMessagesDashboardPage({
        searchParams: Promise.resolve({ thread: "support" })
      })
    );

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["client_user"]);
    expect(screen.getAllByRole("heading", { name: "Messages" }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("messages-screen-stub")).toHaveTextContent("/dashboard/client/messages|none|true");
  });

  it("renders the client message thread route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));

    render(
      await ClientMessageThreadDashboardPage({
        params: Promise.resolve({ threadId: "thread-support-1" })
      })
    );

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["client_user"]);
    expect(screen.getAllByRole("heading", { name: "Messages" }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("messages-screen-stub")).toHaveTextContent("/dashboard/client/messages|thread-support-1|false");
  });

  it("renders account settings and logout surface for the canonical owner settings tab", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    render(
      await OwnerSettingsPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["shop_owner_user"]);
    expect(screen.getByTestId("owner-settings-workspace-stub")).toBeInTheDocument();
  });

  it("redirects barber settings into the canonical barber profile settings route", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/dashboard/barber/more?section=settings");
  });
});
