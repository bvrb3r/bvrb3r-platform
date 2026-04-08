import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserFromServerMock,
  resolvePostAuthDestinationMock,
  redirectMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  resolvePostAuthDestinationMock: vi.fn(),
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

import MarketingLayout from "@/app/(marketing)/layout";

describe("marketing layout", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    resolvePostAuthDestinationMock.mockReset();
    redirectMock.mockClear();
  });

  it("redirects authenticated Supabase users away from marketing surfaces", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: true,
      user: {
        id: "auth-owner-1",
        role: "owner",
        email: "owner@bvrb3r.app",
        password: "",
        name: "Owner User",
        title: "Shop Owner",
        locationIds: [],
        accountStatus: "active"
      }
    });
    resolvePostAuthDestinationMock.mockResolvedValue("/dashboard/owner");

    await expect(
      MarketingLayout({
        children: <div>Marketing content</div>
      })
    ).rejects.toThrow("REDIRECT:/dashboard/owner");
  });

  it("renders marketing chrome for unauthenticated visitors", async () => {
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

    render(await MarketingLayout({
      children: <div>Marketing content</div>
    }));

    expect(screen.getByText("BVRB3R Platform")).toBeInTheDocument();
    expect(screen.getByText("Marketing content")).toBeInTheDocument();
  });
});
