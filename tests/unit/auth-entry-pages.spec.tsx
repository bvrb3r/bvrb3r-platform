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
  redirect: redirectMock,
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/onboarding/service", () => ({
  resolvePostAuthDestination: resolvePostAuthDestinationMock
}));

vi.mock("@/components/auth/auth-entry-workspace", () => ({
  AuthEntryWorkspace: ({ mode }: { mode: string }) => <div data-testid={`auth-${mode}`} />
}));

import LoginPage from "@/app/(auth)/login/page";
import SignupPage from "@/app/(auth)/signup/page";

describe("auth entry page routing", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    resolvePostAuthDestinationMock.mockReset();
    redirectMock.mockClear();
  });

  it("does not process OAuth callback codes on /login", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: null
    });

    const result = await LoginPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("does not process password recovery codes on /login", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: null
    });

    const result = await LoginPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("does not send legacy email-link errors from /login back through the callback loop", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: null
    });

    const result = await LoginPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("does not process OAuth callback codes on /signup", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: null
    });

    const result = await SignupPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("redirects authenticated users away from /login", async () => {
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

    await expect(LoginPage()).rejects.toThrow("REDIRECT:/role-select");
  });
});
