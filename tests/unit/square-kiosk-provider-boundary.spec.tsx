import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { pathname } = vi.hoisted(() => ({ pathname: vi.fn(() => "/kiosk") }));
vi.mock("next/navigation", () => ({ usePathname: pathname }));
vi.mock("@/components/auth/password-reset-workspace", () => ({
  PasswordRecoveryRedirectGuard: () => <div>Account recovery mounted</div>
}));
vi.mock("@/components/providers/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock("@/components/pwa/pwa-provider", () => ({
  PwaProvider: ({ children }: { children: React.ReactNode }) => <><div>Device sync mounted</div>{children}</>
}));
vi.mock("@/components/providers/runtime-resilience-provider", () => ({
  RuntimeResilienceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

import { AppProviders } from "@/components/providers/app-providers";

describe("Square kiosk provider isolation", () => {
  it("keeps platform account recovery and device sync off the shared welcome screen", () => {
    pathname.mockReturnValue("/kiosk");
    render(<AppProviders><div>Welcome</div></AppProviders>);
    expect(screen.getByText("Welcome")).toBeVisible();
    expect(screen.queryByText("Account recovery mounted")).not.toBeInTheDocument();
    expect(screen.queryByText("Device sync mounted")).not.toBeInTheDocument();
  });

  it.each(["/kiosk/shop/shop-123", "/kiosk/barber/barber-123", "/dashboard/owner"])(
    "preserves platform providers on %s",
    (path) => {
      pathname.mockReturnValue(path);
      render(<AppProviders><div>Existing workflow</div></AppProviders>);
      expect(screen.getByText("Account recovery mounted")).toBeVisible();
      expect(screen.getByText("Device sync mounted")).toBeVisible();
    }
  );
});
