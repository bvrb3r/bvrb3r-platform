import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  createServerClientMock,
  exchangeCodeForSessionMock,
  getUserMock,
  buildRuntimeUserFromProductionAuthMock,
  ensureCanonicalProfileForAuthUserMock,
  applySignupRoleIntentForAuthUserMock,
  resolvePostAuthDestinationMock
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  createServerClientMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn(),
  getUserMock: vi.fn(),
  buildRuntimeUserFromProductionAuthMock: vi.fn(),
  ensureCanonicalProfileForAuthUserMock: vi.fn(),
  applySignupRoleIntentForAuthUserMock: vi.fn(),
  resolvePostAuthDestinationMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock
}));

vi.mock("@/lib/auth/production-identity", () => ({
  applySignupRoleIntentForAuthUser: applySignupRoleIntentForAuthUserMock,
  buildRuntimeUserFromProductionAuth: buildRuntimeUserFromProductionAuthMock,
  ensureCanonicalProfileForAuthUser: ensureCanonicalProfileForAuthUserMock
}));

vi.mock("@/lib/onboarding/service", () => ({
  resolvePostAuthDestination: resolvePostAuthDestinationMock
}));

import { GET as getAuthCallbackExchange } from "@/app/auth/callback/exchange/route";

describe("auth callback exchange route", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    createServerClientMock.mockReset();
    exchangeCodeForSessionMock.mockReset();
    getUserMock.mockReset();
    buildRuntimeUserFromProductionAuthMock.mockReset();
    ensureCanonicalProfileForAuthUserMock.mockReset();
    applySignupRoleIntentForAuthUserMock.mockReset();
    resolvePostAuthDestinationMock.mockReset();

    cookiesMock.mockResolvedValue({
      getAll: vi.fn(() => []),
      get: vi.fn(() => undefined),
      set: vi.fn()
    });

    createServerClientMock.mockReturnValue({
      auth: {
        exchangeCodeForSession: exchangeCodeForSessionMock,
        getUser: getUserMock
      }
    });

    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "fresh@bvrb3r.app",
          phone: null,
          email_confirmed_at: "2026-04-13T12:00:00.000Z",
          phone_confirmed_at: null,
          user_metadata: {
            full_name: "Fresh User"
          }
        }
      },
      error: null
    });
    ensureCanonicalProfileForAuthUserMock.mockResolvedValue({ id: "auth-user-1" });
    applySignupRoleIntentForAuthUserMock.mockResolvedValue({ role: null, provisioned: false });
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
    resolvePostAuthDestinationMock.mockResolvedValue("/verify-contact");

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("exchanges the OAuth code, establishes the session, and redirects to the resolved onboarding path", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const response = await getAuthCallbackExchange(new Request("https://bvrb3r.app/auth/callback/exchange?code=oauth-code"));

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("oauth-code");
    expect(getUserMock).toHaveBeenCalled();
    expect(ensureCanonicalProfileForAuthUserMock).toHaveBeenCalledWith(expect.objectContaining({ id: "auth-user-1" }));
    expect(applySignupRoleIntentForAuthUserMock).toHaveBeenCalledWith(expect.objectContaining({ id: "auth-user-1" }), undefined);
    expect(resolvePostAuthDestinationMock).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://bvrb3r.app/verify-contact");
  });

  it("returns a barber OAuth login to the preview barber dashboard when the preserved next path is role-allowed", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    buildRuntimeUserFromProductionAuthMock.mockResolvedValue({
      id: "auth-user-1",
      role: "barber_user",
      email: "fresh@bvrb3r.app",
      password: "",
      name: "Fresh Barber",
      title: "Barber",
      phone: "+18135550155",
      locationIds: [],
      accountStatus: "active",
      barberId: "barber-fresh",
      emailVerified: true,
      phoneVerified: true
    });
    resolvePostAuthDestinationMock.mockResolvedValue("/dashboard/barber");

    const response = await getAuthCallbackExchange(
      new Request("https://bvrb3r-platform-preview.vercel.app/auth/callback/exchange?code=oauth-code&next=%2Fdashboard%2Fbarber")
    );

    expect(resolvePostAuthDestinationMock).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://bvrb3r-platform-preview.vercel.app/dashboard/barber");
  });

  it("ignores a preserved barber next path when the resolved user is a client", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    buildRuntimeUserFromProductionAuthMock.mockResolvedValue({
      id: "auth-user-1",
      role: "client_user",
      email: "fresh@bvrb3r.app",
      password: "",
      name: "Fresh Client",
      title: "Client",
      phone: "+18135550155",
      locationIds: [],
      accountStatus: "active",
      clientId: "client-fresh",
      emailVerified: true,
      phoneVerified: true
    });
    resolvePostAuthDestinationMock.mockResolvedValue("/dashboard/client");

    const response = await getAuthCallbackExchange(
      new Request("https://bvrb3r-platform-preview.vercel.app/auth/callback/exchange?code=oauth-code&next=%2Fdashboard%2Fbarber")
    );

    expect(response.headers.get("location")).toBe("https://bvrb3r-platform-preview.vercel.app/dashboard/client");
  });

  it("applies a preserved signup role intent cookie before post-auth routing", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    cookiesMock.mockResolvedValue({
      getAll: vi.fn(() => []),
      get: vi.fn((name: string) => name === "bvrb3r-signup-role-intent" ? { value: "barber" } : undefined),
      set: vi.fn()
    });

    const response = await getAuthCallbackExchange(new Request("https://bvrb3r.app/auth/callback/exchange?code=oauth-code"));

    expect(applySignupRoleIntentForAuthUserMock).toHaveBeenCalledWith(expect.objectContaining({ id: "auth-user-1" }), "barber");
    expect(response.cookies.get("bvrb3r-signup-role-intent")?.value).toBe("");
    expect(response.headers.get("location")).toBe("https://bvrb3r.app/verify-contact");
  });

  it("exchanges recovery codes and redirects to reset-password before role routing", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    resolvePostAuthDestinationMock.mockResolvedValue("/architect");

    const response = await getAuthCallbackExchange(
      new Request("https://bvrb3r.app/auth/callback/exchange?code=recovery-code&type=recovery")
    );

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("recovery-code");
    expect(getUserMock).toHaveBeenCalled();
    expect(resolvePostAuthDestinationMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://bvrb3r.app/reset-password?recovery=1");
  });

  it("redirects to login when the code is missing", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const response = await getAuthCallbackExchange(new Request("https://bvrb3r.app/auth/callback/exchange"));

    expect(response.headers.get("location")).toBe("https://bvrb3r.app/login?error=Missing+OAuth+callback+code.");
  });

  it("redirects back to login when code exchange fails", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: { message: "OAuth exchange failed" } });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await getAuthCallbackExchange(new Request("https://bvrb3r.app/auth/callback/exchange?code=oauth-code"));

    expect(response.headers.get("location")).toBe("https://bvrb3r.app/login?error=OAuth+exchange+failed");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("redirects to login when the exchange succeeds but no server user is available", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "Auth session missing" } });

    const response = await getAuthCallbackExchange(new Request("https://bvrb3r.app/auth/callback/exchange?code=oauth-code"));

    expect(response.headers.get("location")).toBe(
      "https://bvrb3r.app/login?error=OAuth+succeeded+but+the+server+session+could+not+be+established."
    );
  });
});
