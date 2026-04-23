import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  getCurrentUserFromServerMock,
  resolvePostAuthDestinationMock,
  resolvePostAuthRecoveryDestinationMock
} = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  getCurrentUserFromServerMock: vi.fn(),
  resolvePostAuthDestinationMock: vi.fn(),
  resolvePostAuthRecoveryDestinationMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("next/dist/client/components/redirect-error", () => ({
  isRedirectError: (error: unknown) => error instanceof Error && error.message.startsWith("REDIRECT:")
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/onboarding/service", () => ({
  resolvePostAuthDestination: resolvePostAuthDestinationMock,
  resolvePostAuthRecoveryDestination: resolvePostAuthRecoveryDestinationMock
}));

import PostAuthPage from "@/app/post-auth/page";

describe("post-auth page", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getCurrentUserFromServerMock.mockReset();
    resolvePostAuthDestinationMock.mockReset();
    resolvePostAuthRecoveryDestinationMock.mockReset();
  });

  it("redirects missing sessions to /login", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
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

    await expect(PostAuthPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects authenticated users to the resolved destination", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: true,
      user: {
        id: "auth-client",
        role: "client",
        email: "client@bvrb3r.app",
        password: "",
        name: "Client User",
        title: "Client",
        locationIds: []
      }
    });
    resolvePostAuthDestinationMock.mockResolvedValue("/dashboard/client");

    await expect(PostAuthPage()).rejects.toThrow("REDIRECT:/dashboard/client");
  });

  it("uses the controlled recovery path when destination resolution fails", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: true,
      user: {
        id: "auth-owner",
        role: "owner",
        email: "owner@bvrb3r.app",
        password: "",
        name: "Owner User",
        title: "Owner",
        locationIds: []
      }
    });
    resolvePostAuthDestinationMock.mockRejectedValue(new Error("broken optional onboarding row"));
    resolvePostAuthRecoveryDestinationMock.mockReturnValue("/dashboard/owner");

    await expect(PostAuthPage()).rejects.toThrow("REDIRECT:/dashboard/owner");
    expect(resolvePostAuthRecoveryDestinationMock).toHaveBeenCalled();
  });

  it("fails closed to /login when session resolution throws", async () => {
    getCurrentUserFromServerMock.mockRejectedValue(new Error("session read failed"));

    await expect(PostAuthPage()).rejects.toThrow("REDIRECT:/login");
    expect(resolvePostAuthDestinationMock).not.toHaveBeenCalled();
  });
});
