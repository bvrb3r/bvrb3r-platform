import { beforeEach, describe, expect, it, vi } from "vitest";

const { readSessionHealthFromServerMock } = vi.hoisted(() => ({
  readSessionHealthFromServerMock: vi.fn()
}));

vi.mock("@/lib/auth/health", () => ({
  readSessionHealthFromServer: readSessionHealthFromServerMock
}));

import { GET } from "@/app/api/session/health/route";

describe("session health route", () => {
  beforeEach(() => {
    readSessionHealthFromServerMock.mockReset();
  });

  it("returns the canonical session health payload", async () => {
    readSessionHealthFromServerMock.mockResolvedValue({
      mode: "supabase",
      authenticated: true,
      email: "client@bvrb3r.demo",
      role: "client",
      loginPath: "/login"
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.health.authenticated).toBe(true);
    expect(body.health.role).toBe("client");
  });
});
