import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";

const {
  getCurrentUserFromServerMock,
  getPlatformAdminConsolePayloadMock,
  applyPlatformAdminActionMock,
  getArchitectAccountDirectoryPayloadMock,
  getArchitectAccountDetailPayloadMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  getPlatformAdminConsolePayloadMock: vi.fn(),
  applyPlatformAdminActionMock: vi.fn(),
  getArchitectAccountDirectoryPayloadMock: vi.fn(),
  getArchitectAccountDetailPayloadMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/platform-admin/service", () => ({
  getPlatformAdminConsolePayload: getPlatformAdminConsolePayloadMock,
  applyPlatformAdminAction: applyPlatformAdminActionMock
}));

vi.mock("@/lib/platform-admin/accounts-service", () => ({
  getArchitectAccountDirectoryPayload: getArchitectAccountDirectoryPayloadMock,
  getArchitectAccountDetailPayload: getArchitectAccountDetailPayloadMock,
  normalizeArchitectAccountDirectoryFilters: (filters: { search?: string; role?: string; status?: string; onboarding?: string } = {}) => ({
    search: filters.search ?? "",
    role: filters.role ?? "all",
    status: filters.status ?? "all",
    onboarding: filters.onboarding ?? "all"
  })
}));

import { GET as getArchitectConsole } from "@/app/api/architect/console/route";
import { POST } from "@/app/api/architect/actions/route";
import { GET as getArchitectAccounts } from "@/app/api/architect/accounts/route";
import { GET as getArchitectAccountDetail } from "@/app/api/architect/accounts/[profileId]/route";

describe("architect console routes", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    getPlatformAdminConsolePayloadMock.mockReset();
    applyPlatformAdminActionMock.mockReset();
    getArchitectAccountDirectoryPayloadMock.mockReset();
    getArchitectAccountDetailPayloadMock.mockReset();
  });

  it("rejects non-founder access to the architect console API", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    const response = await getArchitectConsole();
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

    const response = await getArchitectConsole();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actorName).toBe("Architect");
    expect(getPlatformAdminConsolePayloadMock).toHaveBeenCalledWith(founder);
  });

  it("returns a safe degraded payload when the founder console payload is null", async () => {
    const founder = makePlatformAdminUser();
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    getPlatformAdminConsolePayloadMock.mockResolvedValue(null);

    const response = await getArchitectConsole();
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

    const response = await getArchitectConsole();
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

  it("allows banned account status actions through the validated Architect action schema", async () => {
    const founder = makePlatformAdminUser();
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    applyPlatformAdminActionMock.mockResolvedValue({ ok: true });

    const response = await POST(new NextRequest("https://bvrb3r.demo/api/architect/actions", {
      method: "POST",
      body: JSON.stringify({
        type: "set_user_status",
        userId: "profile-barber",
        nextStatus: "banned",
        note: "Confirmed abusive account."
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(applyPlatformAdminActionMock).toHaveBeenCalledWith(founder, {
      type: "set_user_status",
      userId: "profile-barber",
      nextStatus: "banned",
      note: "Confirmed abusive account."
    });
  });

  it("rejects non-founder access to the all-account directory API", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    const response = await getArchitectAccounts(new NextRequest("https://bvrb3r.demo/api/architect/accounts"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/restricted to the platform admin/i);
    expect(getArchitectAccountDirectoryPayloadMock).not.toHaveBeenCalled();
  });

  it("returns the real account directory payload for the founder", async () => {
    const founder = makePlatformAdminUser();
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    getArchitectAccountDirectoryPayloadMock.mockResolvedValue({
      accounts: [],
      counts: {
        totalAccounts: 0,
        totalClients: 0,
        totalBarbers: 0,
        totalShopOwners: 0,
        totalPlatformAdmins: 0,
        pendingBarberApprovals: 0,
        pendingShopOwnerApprovals: 0,
        approvedBarbers: 0,
        approvedShops: 0,
        suspendedAccounts: 0,
        bannedAccounts: 0
      },
      filters: { search: "phillip", role: "barber", status: "pending_review", onboarding: "role_selected" },
      warnings: []
    });

    const response = await getArchitectAccounts(new NextRequest("https://bvrb3r.demo/api/architect/accounts?search=phillip&role=barber&status=pending_review&onboarding=role_selected"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accounts).toEqual([]);
    expect(getArchitectAccountDirectoryPayloadMock).toHaveBeenCalledWith(founder, {
      search: "phillip",
      role: "barber",
      status: "pending_review",
      onboarding: "role_selected"
    });
  });

  it("returns account detail payloads through the platform admin guard", async () => {
    const founder = makePlatformAdminUser();
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    getArchitectAccountDetailPayloadMock.mockResolvedValue({
      account: null,
      warnings: []
    });

    const response = await getArchitectAccountDetail(
      new NextRequest("https://bvrb3r.demo/api/architect/accounts/profile-barber"),
      { params: Promise.resolve({ profileId: "profile-barber" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.account).toBeNull();
    expect(getArchitectAccountDetailPayloadMock).toHaveBeenCalledWith(founder, "profile-barber");
  });
});
