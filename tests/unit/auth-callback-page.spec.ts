import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  createSupabaseServerClientMock,
  authGetUserMock,
  buildRuntimeUserFromProductionAuthMock,
  ensureCanonicalProfileForAuthUserMock,
  applySignupRoleIntentForAuthUserMock,
  resolvePostAuthDestinationMock
} = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  createSupabaseServerClientMock: vi.fn(),
  authGetUserMock: vi.fn(),
  buildRuntimeUserFromProductionAuthMock: vi.fn(),
  ensureCanonicalProfileForAuthUserMock: vi.fn(),
  applySignupRoleIntentForAuthUserMock: vi.fn(),
  resolvePostAuthDestinationMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock
}));

vi.mock("@/lib/auth/production-identity", () => ({
  applySignupRoleIntentForAuthUser: applySignupRoleIntentForAuthUserMock,
  buildRuntimeUserFromProductionAuth: buildRuntimeUserFromProductionAuthMock,
  ensureCanonicalProfileForAuthUser: ensureCanonicalProfileForAuthUserMock
}));

vi.mock("@/lib/onboarding/service", () => ({
  resolvePostAuthDestination: resolvePostAuthDestinationMock
}));

import AuthCallbackPage from "@/app/auth/callback/page";

describe("auth callback page", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    createSupabaseServerClientMock.mockReset();
    authGetUserMock.mockReset();
    buildRuntimeUserFromProductionAuthMock.mockReset();
    ensureCanonicalProfileForAuthUserMock.mockReset();
    applySignupRoleIntentForAuthUserMock.mockReset();
    resolvePostAuthDestinationMock.mockReset();

    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock
      }
    });
    ensureCanonicalProfileForAuthUserMock.mockResolvedValue({
      id: "auth-user-1"
    });
    applySignupRoleIntentForAuthUserMock.mockResolvedValue({
      role: null,
      provisioned: false
    });
  });

  it("redirects code-based OAuth returns through the exchange route", async () => {
    await expect(
      AuthCallbackPage({
        searchParams: Promise.resolve({
          code: "oauth-code"
        })
      })
    ).rejects.toThrow("REDIRECT:/auth/callback/exchange?code=oauth-code");
  });

  it("routes recovery code returns to reset-password instead of post-auth", async () => {
    await expect(
      AuthCallbackPage({
        searchParams: Promise.resolve({
          code: "recovery-code",
          type: "recovery"
        })
      })
    ).rejects.toThrow("REDIRECT:/reset-password?code=recovery-code&type=recovery");
    expect(resolvePostAuthDestinationMock).not.toHaveBeenCalled();
  });

  it("renders a stable error state for invalid or expired email links", async () => {
    const result = await AuthCallbackPage({
      searchParams: Promise.resolve({
        error: "otp_expired",
        error_description: "Email link is invalid or has expired",
        error_code: "otp_expired"
      })
    });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("redirects to login when no authenticated session exists after callback", async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null } });

    const result = await AuthCallbackPage({
      searchParams: Promise.resolve({})
    });

    expect(result).toMatchObject({
      props: {
        mode: "callback"
      }
    });
  });

  it("routes a fresh authenticated user into role selection", async () => {
    authGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "fresh@bvrb3r.app",
          phone: null,
          email_confirmed_at: "2026-04-08T12:00:00.000Z",
          phone_confirmed_at: null,
          user_metadata: {
            full_name: "Fresh User"
          }
        }
      }
    });
    buildRuntimeUserFromProductionAuthMock.mockResolvedValue({
      id: "auth-user-1",
      role: "client",
      email: "fresh@bvrb3r.app",
      password: "",
      name: "Fresh User",
      title: "Client",
      locationIds: [],
      accountStatus: "profile_only"
    });
    resolvePostAuthDestinationMock.mockResolvedValue("/role-select");

    await expect(
      AuthCallbackPage({
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrow("REDIRECT:/role-select");
    expect(applySignupRoleIntentForAuthUserMock).toHaveBeenCalledWith(expect.objectContaining({ id: "auth-user-1" }));
  });
});
