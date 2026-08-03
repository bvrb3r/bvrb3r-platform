import { beforeEach, describe, expect, it, vi } from "vitest";

const { accessMock } = vi.hoisted(() => ({
  accessMock: vi.fn()
}));

vi.mock("@/lib/architect/debug/guards", () => ({
  requireArchitectDebugAccess: accessMock
}));

import { GET, POST } from "@/app/api/architect/operations/route";

describe("Architect operations route", () => {
  beforeEach(() => {
    accessMock.mockReset();
  });

  it("returns 404 to non-architect readers and writers", async () => {
    accessMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 })
    });

    const getResponse = await GET();
    const postResponse = await POST(new Request("https://bvrb3r.test/api/architect/operations", {
      method: "POST",
      body: JSON.stringify({})
    }));

    if (!getResponse || !postResponse) throw new Error("The Architect operations route did not return a response.");
    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(await getResponse.json()).toEqual({ error: "Not found." });
    expect(await postResponse.json()).toEqual({ error: "Not found." });
  });
});
