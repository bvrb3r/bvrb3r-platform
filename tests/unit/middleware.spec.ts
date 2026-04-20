import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClientMock, getUserMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getUserMock: vi.fn()
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock
}));

import { config, middleware } from "@/middleware";

describe("phase 0 auth middleware", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_AUTH_MODE = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    createServerClientMock.mockReset();
    getUserMock.mockReset();
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: getUserMock
      }
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("redirects unauthenticated private route access to login", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const response = await middleware(new NextRequest("https://bvrb3r.app/dashboard/client"));

    expect(response.headers.get("location")).toBe("https://bvrb3r.app/login?redirect=%2Fdashboard%2Fclient");
  });

  it("allows authenticated private route access through to server-side role guards", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1"
        }
      },
      error: null
    });

    const response = await middleware(new NextRequest("https://bvrb3r.app/dashboard/client"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps the hidden architect surface in the protected matcher set", () => {
    expect(config.matcher).toContain("/architect/:path*");
    expect(config.matcher).toContain("/dashboard/:path*");
    expect(config.matcher).toContain("/verify-contact/:path*");
  });
});
