import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserFromServerMock,
  resolvePostAuthDestinationMock,
  getClientExperienceContextMock,
  redirectMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  resolvePostAuthDestinationMock: vi.fn(),
  getClientExperienceContextMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  })
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/onboarding/service", () => ({
  resolvePostAuthDestination: resolvePostAuthDestinationMock
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/components/marketing/hero-section", () => ({
  HeroSection: () => <div data-testid="hero-section-stub">Hero</div>
}));

vi.mock("@/components/marketing/feature-grid", () => ({
  FeatureGrid: () => <div data-testid="feature-grid-stub">Features</div>
}));

vi.mock("@/components/client-experience/client-app-shell", () => ({
  ClientAppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="client-app-shell-stub">{children}</div>
}));

vi.mock("@/components/client-experience/client-home-screen", () => ({
  ClientHomeScreen: ({ displayName }: { displayName: string }) => <div data-testid="client-home-screen-stub">{displayName}</div>
}));

import HomePage from "@/app/page";
import HomeRoutePage from "@/app/home/page";

describe("public home routing", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    resolvePostAuthDestinationMock.mockReset();
    getClientExperienceContextMock.mockReset();
    redirectMock.mockClear();
  });

  it("redirects authenticated Supabase users away from the public root", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: true,
      user: {
        id: "auth-user-1",
        role: "client",
        email: "fresh@bvrb3r.app",
        password: "",
        name: "Fresh User",
        title: "Client",
        locationIds: [],
        accountStatus: "profile_only"
      }
    });
    resolvePostAuthDestinationMock.mockResolvedValue("/role-select");

    await expect(HomePage()).rejects.toThrow("REDIRECT:/role-select");
    expect(resolvePostAuthDestinationMock).toHaveBeenCalled();
  });

  it("keeps the marketing home available for unauthenticated visitors", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: {
        id: "guest-user",
        role: "client",
        email: "guest@bvrb3r.local",
        password: "",
        name: "Guest",
        title: "Guest",
        locationIds: []
      }
    });

    render(await HomePage());

    expect(screen.getByText("BVRB3R Platform")).toBeInTheDocument();
    expect(screen.getByTestId("hero-section-stub")).toBeInTheDocument();
  });

  it("redirects authenticated Supabase users away from the public client home shell", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: true,
      user: {
        id: "auth-user-2",
        role: "client",
        email: "fresh@bvrb3r.app",
        password: "",
        name: "Fresh User",
        title: "Client",
        locationIds: [],
        accountStatus: "profile_only"
      }
    });
    resolvePostAuthDestinationMock.mockResolvedValue("/verify-contact");

    await expect(HomeRoutePage()).rejects.toThrow("REDIRECT:/verify-contact");
    expect(getClientExperienceContextMock).not.toHaveBeenCalled();
  });
});
