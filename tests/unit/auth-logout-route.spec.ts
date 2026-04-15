import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, signOutMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  signOutMock: vi.fn()
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock
}));

import { POST as postLogout } from "@/app/api/auth/logout/route";
import { DEMO_SESSION_COOKIE } from "@/lib/auth/demo-auth";

describe("auth logout route", () => {
  beforeEach(() => {
    createServerClientMock.mockReset();
    signOutMock.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    createServerClientMock.mockImplementation((
      _url: string,
      _key: string,
      options: { cookies: { setAll: (cookies: Array<{ name: string; value: string; options: { path: string; maxAge: number } }>) => void } }
    ) => {
      options.cookies.setAll([
        { name: "sb-access-token", value: "", options: { path: "/", maxAge: 0 } }
      ]);
      return {
        auth: {
          signOut: signOutMock
        }
      };
    });
    signOutMock.mockResolvedValue({ error: null });
  });

  it("signs out through Supabase and expires auth cookies", async () => {
    const response = await postLogout(new NextRequest("https://bvrb3r.app/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: "sb-access-token=abc; sb-project-auth-token.0=chunk; bvrb3r-demo-email=owner%40bvrb3r.demo; bvrb3r-kiosk-device=device"
      }
    }));

    expect(signOutMock).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toContain("sb-access-token=");
    expect(response.headers.get("set-cookie")).toContain("sb-project-auth-token.0=");
    expect(response.headers.get("set-cookie")).toContain(`${DEMO_SESSION_COOKIE}=`);
    expect(response.headers.get("set-cookie")).toContain("bvrb3r-kiosk-device=");
  });

  it("is idempotent when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await postLogout(new NextRequest("https://bvrb3r.app/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(signOutMock).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain(`${DEMO_SESSION_COOKIE}=`);
  });
});
