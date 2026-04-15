import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserFromServerMock,
  resolvePostAuthDestinationMock,
  getClientExperienceContextMock,
  replaceMock,
  redirectMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  resolvePostAuthDestinationMock: vi.fn(),
  getClientExperienceContextMock: vi.fn(),
  replaceMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  })
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({
    replace: replaceMock
  })
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
    replaceMock.mockReset();
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

    await expect(HomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/role-select");
    expect(resolvePostAuthDestinationMock).toHaveBeenCalled();
  });

  it("routes OAuth code returns on the public root into the canonical callback", async () => {
    await expect(
      HomePage({
        searchParams: Promise.resolve({
          code: "oauth-code"
        })
      })
    ).rejects.toThrow("REDIRECT:/auth/callback?code=oauth-code");
    expect(getCurrentUserFromServerMock).not.toHaveBeenCalled();
  });

  it("keeps the auth-first public front door available for unauthenticated visitors", async () => {
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

    render(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByLabelText("BVRB3R home")).toHaveTextContent("BVRB3R");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Run your chair, your shop, and your income — in one system."
    );
    expect(screen.getByLabelText("Mobile number, email, or username")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
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

    await expect(HomeRoutePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/verify-contact");
    expect(getClientExperienceContextMock).not.toHaveBeenCalled();
  });

  it("routes OAuth code returns on /home into the canonical callback", async () => {
    await expect(
      HomeRoutePage({
        searchParams: Promise.resolve({
          code: "home-oauth-code"
        })
      })
    ).rejects.toThrow("REDIRECT:/auth/callback?code=home-oauth-code");
    expect(getClientExperienceContextMock).not.toHaveBeenCalled();
  });
});
