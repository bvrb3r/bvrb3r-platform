import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

const {
  getCurrentUserFromServerMock,
  getPlatformAdminConsolePayloadMock,
  applyPlatformAdminActionMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  getPlatformAdminConsolePayloadMock: vi.fn(),
  applyPlatformAdminActionMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/platform-admin/service", () => ({
  getPlatformAdminConsolePayload: getPlatformAdminConsolePayloadMock,
  applyPlatformAdminAction: applyPlatformAdminActionMock
}));

import { GET } from "@/app/api/architect/console/route";
import { POST } from "@/app/api/architect/actions/route";

describe("architect console routes", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    getPlatformAdminConsolePayloadMock.mockReset();
    applyPlatformAdminActionMock.mockReset();
  });

  it("rejects non-founder access to the architect console API", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/restricted to the platform admin/i);
  });

  it("returns the architect console payload for the founder", async () => {
    const founder = makePlatformAdminUser();
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    getPlatformAdminConsolePayloadMock.mockResolvedValue({
      actorName: "Architect",
      overview: { totalUsers: 10, activeClients: 4, activeBarbers: 3, activeShops: 2, bookingsToday: 8, revenueToday: 420, payoutIssues: 1, billingIssues: 1, fraudFlags: 0, kioskActiveCount: 1, aiManagerActiveCount: 1, releaseReadyCount: 6, releaseAttentionCount: 2 },
      users: [],
      shops: [],
      moneyRisk: { openAnomalies: 1, criticalAnomalies: 0, billingFailures: 0, disputesOpen: 0, pointsLiabilityValue: 12, fraudReviewRate: 0, reversalRate: 0, overdueBoothRent: 0, recentAnomalies: [], recentCashouts: [], recentDisputes: [] },
      support: [],
      controls: { shops: [], release: { readyCount: 6, attentionCount: 2 } },
      auditLog: [],
      warnings: []
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actorName).toBe("Architect");
    expect(getPlatformAdminConsolePayloadMock).toHaveBeenCalledWith(founder);
  });

  it("returns a safe degraded payload when the founder console payload is null", async () => {
    const founder = makePlatformAdminUser();
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    getPlatformAdminConsolePayloadMock.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actorName).toBe(founder.name);
    expect(body.warnings).toContain("Architect data is partially unavailable. Core access is still active.");
  });

  it("returns a safe degraded payload when architect tables are missing", async () => {
    const founder = makePlatformAdminUser();
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    getPlatformAdminConsolePayloadMock.mockRejectedValue({
      code: "42P01",
      details: null,
      hint: null,
      message: "relation \"platform_admin_controls\" does not exist"
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actorName).toBe(founder.name);
    expect(body.warnings).toContain("Architect data is partially unavailable. Core access is still active.");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("validates architect action payloads", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: makePlatformAdminUser() });

    const response = await POST(new NextRequest("https://bvrb3r.demo/api/architect/actions", {
      method: "POST",
      body: JSON.stringify({ type: "set_user_status", userId: "", nextStatus: "active" })
    }));

    expect(response.status).toBe(400);
  });

  it("applies founder actions through the canonical admin service", async () => {
    const founder = makePlatformAdminUser();
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    applyPlatformAdminActionMock.mockResolvedValue({ ok: true });

    const response = await POST(new NextRequest("https://bvrb3r.demo/api/architect/actions", {
      method: "POST",
      body: JSON.stringify({
        type: "set_shop_control",
        shopId: "shop-1",
        controlKey: "kiosk_enabled",
        enabled: false,
        note: "Temporarily disabled during onsite support."
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(applyPlatformAdminActionMock).toHaveBeenCalledWith(founder, {
      type: "set_shop_control",
      shopId: "shop-1",
      controlKey: "kiosk_enabled",
      enabled: false,
      note: "Temporarily disabled during onsite support."
    });
  });
});
