import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, isDemoModeMock, createSupabaseServerClientMock, authGetUserMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  isDemoModeMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  authGetUserMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

vi.mock("@/lib/config/runtime", () => ({
  isDemoMode: isDemoModeMock,
  runtimeConfig: {
    demoEmail: "owner@bvrb3r.demo"
  }
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock
}));

import { readSessionHealthFromServer } from "@/lib/auth/health";

describe("server session health", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    isDemoModeMock.mockReset();
    createSupabaseServerClientMock.mockReset();
    authGetUserMock.mockReset();
  });

  it("treats a selected demo cookie as authenticated in supabase mode when the auth user is unavailable", async () => {
    isDemoModeMock.mockReturnValue(false);
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({ value: "client%40bvrb3r.demo" }))
    });
    authGetUserMock.mockResolvedValue({ data: { user: null } });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock
      }
    });

    const result = await readSessionHealthFromServer();

    expect(result.mode).toBe("supabase");
    expect(result.authenticated).toBe(true);
    expect(result.email).toBe("client@bvrb3r.demo");
    expect(result.role).toBe("client");
    expect(result.reason).toBe("authenticated");
  });

  it("reports missing_session only when neither supabase auth nor a selected demo session exists", async () => {
    isDemoModeMock.mockReturnValue(false);
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined)
    });
    authGetUserMock.mockResolvedValue({ data: { user: null } });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock
      }
    });

    const result = await readSessionHealthFromServer();

    expect(result.mode).toBe("supabase");
    expect(result.authenticated).toBe(false);
    expect(result.reason).toBe("missing_session");
  });

  it("prefers the authenticated supabase user over the selected demo cookie", async () => {
    isDemoModeMock.mockReturnValue(false);
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({ value: "owner%40bvrb3r.demo" }))
    });
    authGetUserMock.mockResolvedValue({ data: { user: { email: "wave@bvrb3r.demo" } } });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock
      }
    });

    const result = await readSessionHealthFromServer();

    expect(result.mode).toBe("supabase");
    expect(result.authenticated).toBe(true);
    expect(result.email).toBe("wave@bvrb3r.demo");
    expect(result.role).toBe("manager");
    expect(result.reason).toBe("authenticated");
  });
});
