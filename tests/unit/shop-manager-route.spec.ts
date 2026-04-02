import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  getSessionUserMock,
  getShopManagerPayloadMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getShopManagerPayloadMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/operations/shop-manager", () => ({
  getShopManagerPayload: getShopManagerPayloadMock
}));

import { GET } from "@/app/api/operations/shop-manager/route";

describe("shop manager route", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getShopManagerPayloadMock.mockReset();
  });

  it("rejects non-staff roles", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/owner, manager, or front desk/i);
  });

  it("returns canonical shop manager suggestions for staff", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    getShopManagerPayloadMock.mockResolvedValue({
      mode: "assist",
      autoModeAvailable: false,
      autoModeReason: "Assist mode only.",
      generatedAt: "2026-03-27T15:00:00.000Z",
      summary: {
        queueEntries: 2,
        openChairs: 1,
        recoveryOpportunities: 1
      },
      suggestions: []
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("assist");
    expect(body.summary.queueEntries).toBe(2);
  });
});
