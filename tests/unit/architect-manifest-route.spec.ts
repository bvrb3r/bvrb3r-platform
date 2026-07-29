import { beforeEach, describe, expect, it, vi } from "vitest";

const { accessMock } = vi.hoisted(() => ({
  accessMock: vi.fn()
}));

vi.mock("@/lib/architect/debug/guards", () => ({
  requireArchitectDebugAccess: accessMock
}));

import { GET } from "@/app/api/architect/manifest/route";

type ArchitectManifestRequestCannotBeUndefined =
  undefined extends Parameters<typeof GET>[0] ? never : true;
const ARCHITECT_MANIFEST_REQUEST_IS_REQUIRED: ArchitectManifestRequestCannotBeUndefined = true;

describe("Architect manifest route", () => {
  beforeEach(() => {
    accessMock.mockReset();
  });

  it("returns 404 to non-architect callers", async () => {
    accessMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 })
    });

    expect(ARCHITECT_MANIFEST_REQUEST_IS_REQUIRED).toBe(true);
    const response = await GET(new Request("https://example.test/api/architect/manifest"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found." });
  });
});
