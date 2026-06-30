import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import type { UserAccount } from "@/types/domain";

const { getCurrentUserFromServerMock, redirectMock } = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  })
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  usePathname: () => "/architect"
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>
      {children}
    </a>
  )
}));

vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: ({ className }: { className?: string }) => (
    <div className={className} data-testid="architect-logout-control">
      Log out
    </div>
  )
}));

vi.mock("@/components/architect/mission-control/mission-control", () => ({
  ArchitectMissionControl: ({ laneId }: { laneId?: string }) => (
    <div data-lane-id={laneId} data-testid="architect-mission-control">
      Mission Control
    </div>
  )
}));

import ArchitectLayout from "@/app/(platform)/architect/layout";
import ArchitectPage from "@/app/(platform)/architect/page";
import ArchitectCeoPage from "@/app/(platform)/architect/ceo/page";

function makeCanonicalArchitect(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    ...resolveDemoUser("client@bvrb3r.demo"),
    id: "canonical-architect",
    email: "canonical-architect@bvrb3r.app",
    accountStatus: "active",
    appMetadata: {
      bvrb3r_access: "architect"
    },
    ...overrides
  };
}

describe("architect server-side access guard wiring", () => {
  beforeEach(() => {
    cleanup();
    getCurrentUserFromServerMock.mockReset();
    redirectMock.mockClear();
  });

  it("blocks a non-Architect before the Mission Control home route renders content", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "demo",
      authenticated: true,
      user: resolveDemoUser("client@bvrb3r.demo")
    });

    await expect(ArchitectPage()).rejects.toThrow("REDIRECT:/dashboard/client");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/client");
    expect(screen.queryByTestId("architect-mission-control-home")).not.toBeInTheDocument();
  });

  it("blocks a non-Architect through the actual Architect layout server guard", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "demo",
      authenticated: true,
      user: resolveDemoUser("client@bvrb3r.demo")
    });

    await expect(ArchitectLayout({
      children: <div data-testid="architect-layout-child">Architect child</div>
    })).rejects.toThrow("REDIRECT:/dashboard/client");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/client");
    expect(screen.queryByTestId("architect-layout-child")).not.toBeInTheDocument();
  });

  it("blocks unauthenticated sessions before Architect content renders", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: {
        id: "guest-user",
        role: "client_user",
        email: "guest@bvrb3r.local",
        password: "",
        name: "Guest",
        title: "Guest",
        locationIds: [],
        accountStatus: "profile_only"
      }
    });

    await expect(ArchitectPage()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(screen.queryByTestId("architect-mission-control-home")).not.toBeInTheDocument();
  });

  it("renders /architect as Mission Control Home for an active canonical Architect", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: true,
      user: makeCanonicalArchitect()
    });

    render(await ArchitectPage());

    expect(screen.getByTestId("architect-mission-control-home")).toHaveTextContent("BVRB3R Mission Control");
    expect(screen.getByTestId("architect-mission-control-home")).toHaveTextContent("Architect Operating System");
    expect(screen.queryByTestId("architect-mission-control")).not.toBeInTheDocument();
  });

  it("renders /architect/ceo as the CEO lane for an active canonical Architect", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: true,
      user: makeCanonicalArchitect()
    });

    render(await ArchitectCeoPage());

    expect(screen.getByTestId("architect-mission-control")).toHaveAttribute("data-lane-id", "ceo");
    expect(screen.queryByTestId("architect-mission-control-home")).not.toBeInTheDocument();
  });
});
