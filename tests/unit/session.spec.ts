import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, isDemoModeMock, isSupabaseEnabledMock, createSupabaseServerClientMock, authGetUserMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  isDemoModeMock: vi.fn(),
  isSupabaseEnabledMock: vi.fn(() => false),
  createSupabaseServerClientMock: vi.fn(),
  authGetUserMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

vi.mock("@/lib/config/runtime", () => ({
  isDemoMode: isDemoModeMock,
  isSupabaseEnabled: isSupabaseEnabledMock,
  runtimeConfig: {
    demoEmail: "owner@bvrb3r.demo"
  }
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock
}));

import { getCurrentUserFromServer } from "@/lib/auth/session";

describe("server session resolution", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    isDemoModeMock.mockReset();
    isSupabaseEnabledMock.mockReset();
    createSupabaseServerClientMock.mockReset();
    authGetUserMock.mockReset();
  });

  it("uses the selected demo cookie in demo mode", async () => {
    isDemoModeMock.mockReturnValue(true);
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({ value: "wave%40bvrb3r.demo" }))
    });

    const result = await getCurrentUserFromServer();

    expect(result.mode).toBe("demo");
    expect(result.user.email).toBe("wave@bvrb3r.demo");
  });

  it("returns an unauthenticated production guest when no supabase user exists", async () => {
    isDemoModeMock.mockReturnValue(false);
    isSupabaseEnabledMock.mockReturnValue(false);
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({ value: "manager%40bvrb3r.demo" }))
    });
    authGetUserMock.mockResolvedValue({ data: { user: null } });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock
      }
    });

    const result = await getCurrentUserFromServer();

    expect(result.mode).toBe("supabase");
    expect(result.authenticated).toBe(false);
    expect(result.user.email).toBe("guest@bvrb3r.local");
  });

  it("prefers the authenticated supabase user over the demo cookie", async () => {
    isDemoModeMock.mockReturnValue(false);
    isSupabaseEnabledMock.mockReturnValue(false);
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({ value: "owner%40bvrb3r.demo" }))
    });
    authGetUserMock.mockResolvedValue({ data: { user: { email: "client@bvrb3r.demo" } } });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock
      }
    });

    const result = await getCurrentUserFromServer();

    expect(result.mode).toBe("supabase");
    expect(result.user.email).toBe("client@bvrb3r.demo");
  });
});
