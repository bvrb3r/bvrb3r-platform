import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
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

  it("keeps preview protected-route redirects on the preview origin", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const response = await middleware(new NextRequest("https://bvrb3r-preview.vercel.app/dashboard/barber"));

    expect(response.headers.get("location")).toBe("https://bvrb3r-preview.vercel.app/login?redirect=%2Fdashboard%2Fbarber");
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

  it("protects the private queue root without intercepting public token status URLs", () => {
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "https://bvrb3r.app/queue"
    })).toBe(true);
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "https://bvrb3r.app/queue/public-capability-token"
    })).toBe(false);
  });

  it("protects exact owner aliases while preserving public shop profile slugs", () => {
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "https://bvrb3r.app/shop/home"
    })).toBe(true);
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "https://bvrb3r.app/shop/phillips-barbershop"
    })).toBe(false);
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "https://bvrb3r.app/pro/rent"
    })).toBe(true);
  });

  it("keeps client activity private while leaving guest home and search public", () => {
    expect(unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url: "https://bvrb3r.app/activity"
    })).toBe(true);
    for (const url of ["https://bvrb3r.app/home", "https://bvrb3r.app/search?q=fade"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
    }
  });
});
