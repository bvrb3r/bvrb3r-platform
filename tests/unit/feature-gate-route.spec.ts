import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { GET } from "@/app/api/feature-gates/route";

describe("GET /api/feature-gates", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("fails closed to the registry when Supabase is unavailable", async () => {
    createSupabaseAdminClientMock.mockReturnValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(body.source).toBe("registry");
    expect(body.gates["client.home.group_booking"]).toMatchObject({
      reason: "building",
      enabled: false
    });
  });

  it("opens a registered door from a runtime flag without adding unknown keys", async () => {
    const inFilter = vi.fn().mockResolvedValue({
      data: [
        {
          key: "owner.analytics.forecasting",
          reason: "staged",
          enabled: true,
          plan_required: "pro"
        },
        {
          key: "not.registered",
          reason: "debug",
          enabled: true,
          plan_required: null
        }
      ],
      error: null
    });
    const select = vi.fn(() => ({ in: inFilter }));
    const from = vi.fn(() => ({ select }));
    createSupabaseAdminClientMock.mockReturnValue({ from });

    const response = await GET();
    const body = await response.json();

    expect(from).toHaveBeenCalledWith("feature_flags");
    expect(body.source).toBe("supabase");
    expect(body.gates["owner.analytics.forecasting"]).toMatchObject({
      reason: "staged",
      enabled: true,
      planRequired: "pro"
    });
    expect(body.gates["not.registered"]).toBeUndefined();
  });

  it("stays fail-closed when the runtime query fails", async () => {
    const inFilter = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "feature_flags unavailable" }
    });
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ in: inFilter }))
      }))
    });

    const response = await GET();
    const body = await response.json();

    expect(body.source).toBe("registry");
    expect(
      Object.values(body.gates as Record<string, { enabled: boolean }>)
        .every((gate) => gate.enabled === false)
    ).toBe(true);
  });
});
