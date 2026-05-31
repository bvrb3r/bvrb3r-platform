import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const { dashboardShellPropsMock, getAuthorizedUserMock, getStripeConnectEnvironmentMock } = vi.hoisted(() => ({
  dashboardShellPropsMock: vi.fn(),
  getAuthorizedUserMock: vi.fn(),
  getStripeConnectEnvironmentMock: vi.fn()
}));

vi.mock("@/lib/auth/guards", () => ({
  getAuthorizedUser: getAuthorizedUserMock
}));

vi.mock("@/components/dashboard/dashboard-shell", () => ({
  DashboardShell: ({
    children,
    hidePageHeader,
    headerNotificationItems
  }: {
    children: ReactNode;
    hidePageHeader?: boolean;
    headerNotificationItems?: unknown[];
  }) => {
    dashboardShellPropsMock({ hidePageHeader, headerNotificationItems });
    return <div>{children}</div>;
  }
}));

vi.mock("@/lib/stripe/connect", () => ({
  getStripeConnectEnvironment: getStripeConnectEnvironmentMock
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
    getStripeConnectEnvironmentMock.mockReturnValue({
      mode: "test",
      label: "Stripe test mode - not live payouts.",
      blocksLivePayouts: true
    });

    render(
      await BarberMorePage({
        searchParams: Promise.resolve({ stripe: "return" })
      })
    );

    expect(getAuthorizedUserMock).toHaveBeenCalledWith(["barber_user"]);
    expect(dashboardShellPropsMock).toHaveBeenCalledWith({
      hidePageHeader: true,
      headerNotificationItems: [
        expect.objectContaining({
          id: "stripe-test-mode-payouts",
          category: "PAYOUTS",
          severity: "warning",
          title: "Payout setup",
          body: "Stripe is in test mode. Live payouts are not active yet.",
          action: {
            label: "View payout setup",
            href: "/dashboard/barber/more#payouts"
          }
        })
      ]
    });
    expect(screen.getByTestId("barber-more-screen-stub")).toHaveTextContent("Blaze King|none|return");
  });
});
