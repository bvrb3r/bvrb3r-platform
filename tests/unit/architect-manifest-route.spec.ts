import { beforeEach, describe, expect, it, vi } from "vitest";

const { accessMock } = vi.hoisted(() => ({
  accessMock: vi.fn()
}));

vi.mock("@/lib/architect/debug/guards", () => ({
  requireArchitectDebugAccess: accessMock
}));

import { GET } from "@/app/api/architect/manifest/route";

describe("Architect manifest route", () => {
  beforeEach(() => {
    accessMock.mockReset();
  });

  it("returns 404 to non-architect callers", async () => {
    accessMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 })
    });

    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found." });
  });
});
