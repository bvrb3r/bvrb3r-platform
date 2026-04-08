import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  createServerClientMock,
  exchangeCodeForSessionMock
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  createServerClientMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock
}));

import { GET as getAuthCallbackExchange } from "@/app/auth/callback/exchange/route";

describe("auth callback exchange route", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    createServerClientMock.mockReset();
    exchangeCodeForSessionMock.mockReset();

    cookiesMock.mockResolvedValue({
      getAll: vi.fn(() => []),
      set: vi.fn()
    });

    createServerClientMock.mockReturnValue({
      auth: {
        exchangeCodeForSession: exchangeCodeForSessionMock
      }
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("exchanges the OAuth code and redirects to /post-auth by default", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const response = await getAuthCallbackExchange(new Request("https://bvrb3r.app/auth/callback/exchange?code=oauth-code"));

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("oauth-code");
    expect(response.headers.get("location")).toBe("https://bvrb3r.app/auth/callback");
  });

  it("falls back to the callback page when the code is missing", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const response = await getAuthCallbackExchange(new Request("https://bvrb3r.app/auth/callback/exchange"));

    expect(response.headers.get("location")).toBe("https://bvrb3r.app/auth/callback");
  });

  it("redirects back to login when code exchange fails", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: { message: "OAuth exchange failed" } });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await getAuthCallbackExchange(new Request("https://bvrb3r.app/auth/callback/exchange?code=oauth-code"));

    expect(response.headers.get("location")).toBe("https://bvrb3r.app/login?error=OAuth+exchange+failed");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
