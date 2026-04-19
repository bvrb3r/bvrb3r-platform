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

  it("routes OAuth code returns on /login into the canonical callback", async () => {
    await expect(
      LoginPage({
        searchParams: Promise.resolve({
          code: "login-oauth-code"
        })
      })
    ).rejects.toThrow("REDIRECT:/auth/callback?code=login-oauth-code");
    expect(getCurrentUserFromServerMock).not.toHaveBeenCalled();
  });

  it("routes password recovery code returns on /login into reset-password", async () => {
    await expect(
      LoginPage({
        searchParams: Promise.resolve({
          code: "login-recovery-code",
          type: "recovery"
        })
      })
    ).rejects.toThrow("REDIRECT:/reset-password?code=login-recovery-code&type=recovery");
    expect(getCurrentUserFromServerMock).not.toHaveBeenCalled();
  });

  it("does not send legacy email-link errors from /login back through the callback loop", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: false,
      user: null
    });

    const result = await LoginPage({
      searchParams: Promise.resolve({
        error: "Email link is invalid or has expired",
        error_code: "otp_expired"
      })
    });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("routes OAuth code returns on /signup into the canonical callback", async () => {
    await expect(
      SignupPage({
        searchParams: Promise.resolve({
          code: "signup-oauth-code"
        })
      })
    ).rejects.toThrow("REDIRECT:/auth/callback?code=signup-oauth-code");
    expect(getCurrentUserFromServerMock).not.toHaveBeenCalled();
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

    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/role-select");
  });
});
