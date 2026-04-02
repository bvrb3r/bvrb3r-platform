import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>
}));

vi.mock("@/components/pwa/pwa-provider", () => ({
  usePwa: () => ({
    isOnline: true,
    isStandalone: false,
    runtimeMode: "browser",
    deviceId: null,
    pushSupported: false,
    pushPermission: "default",
    pushEnabled: false,
    enablePush: vi.fn(),
    disablePush: vi.fn()
  })
}));

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDefaultRouteForUser, resolveDemoUser } from "@/lib/auth/demo-auth";
import { RuntimeResilienceProvider } from "@/components/providers/runtime-resilience-provider";

describe("runtime resilience provider", () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue("/dashboard/client");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        health: {
          authenticated: false,
          loginPath: "/login",
          reason: "missing_session"
        }
      })
    }) as unknown as typeof fetch;
  });

  it("shows a recovery banner when a protected route resumes without an authenticated session", async () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <RuntimeResilienceProvider>
          <div>protected child</div>
        </RuntimeResilienceProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Session needs attention/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Sign back in to keep booking, finance, and dashboard actions safe/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/session/health", expect.objectContaining({
      method: "GET"
    }));
  });

  it.each([
    ["client@bvrb3r.demo", "/dashboard/client", "Home"],
    ["blaze@bvrb3r.demo", "/dashboard/barber", "Earnings"],
    ["owner@bvrb3r.demo", "/dashboard/owner", "Money"]
  ])("keeps the role shell visible for healthy %s sessions", async (email, pathname, navLabel) => {
    usePathnameMock.mockReturnValue(pathname);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        health: {
          authenticated: true,
          loginPath: "/login",
          reason: "authenticated"
        }
      })
    }) as unknown as typeof fetch;

    const user = resolveDemoUser(email);
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <RuntimeResilienceProvider>
          <DashboardShell user={user} activeHref={getDefaultRouteForUser(user)} title="Workspace" subtitle="Healthy shell.">
            <div>protected child</div>
          </DashboardShell>
        </RuntimeResilienceProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/session/health", expect.objectContaining({
        method: "GET"
      }));
    });

    expect(screen.queryByText(/Session needs attention/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(navLabel, "i") })).toBeInTheDocument();
    expect(screen.getByTestId("shell-identity-role")).toBeInTheDocument();
  });
});
