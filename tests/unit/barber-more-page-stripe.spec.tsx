import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const { dashboardShellPropsMock, getAuthorizedUserMock } = vi.hoisted(() => ({
  dashboardShellPropsMock: vi.fn(),
  getAuthorizedUserMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getAuthorizedUser: getAuthorizedUserMock
}));

vi.mock("@/components/dashboard/dashboard-shell", () => ({
  DashboardShell: ({
    children,
    hidePageHeader
  }: {
    children: ReactNode;
    hidePageHeader?: boolean;
  }) => {
    dashboardShellPropsMock({ hidePageHeader });
    return <div>{children}</div>;
  }
}));

vi.mock("@/components/barber-experience/barber-settings-screen", () => ({
  BarberSettingsScreen: ({
    user,
    initialSection,
    stripeReturnState
  }: {
    user: { name: string };
    initialSection?: string;
    stripeReturnState?: "return" | "refresh" | null;
  }) => (
    <div data-testid="barber-more-screen-stub">{user.name}|{initialSection ?? "none"}|{stripeReturnState ?? "none"}</div>
  )
}));

import BarberMorePage from "@/app/(platform)/dashboard/barber/more/page";

describe("barber More Stripe return routing", () => {
  it("passes Stripe return state into the Barber More screen", async () => {
    getAuthorizedUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));

    render(
      await BarberMorePage({
        searchParams: Promise.resolve({ stripe: "return" })
      })
    );

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["barber_user"]);
    expect(dashboardShellPropsMock).toHaveBeenCalledWith({ hidePageHeader: true });
    expect(screen.getByTestId("barber-more-screen-stub")).toHaveTextContent("Blaze King|none|return");
  });
});
