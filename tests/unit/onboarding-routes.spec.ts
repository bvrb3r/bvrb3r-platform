import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  getOnboardingSessionUserMock,
  getOnboardingStateMock,
  initializeUserRoleMock,
  getActivationStatusForUserMock
} = vi.hoisted(() => ({
  getOnboardingSessionUserMock: vi.fn(),
  getOnboardingStateMock: vi.fn(),
  initializeUserRoleMock: vi.fn(),
  getActivationStatusForUserMock: vi.fn()
}));

vi.mock("@/app/api/onboarding/_shared", () => ({
  onboardingRoleSchema: { safeParse: (value: unknown) => typeof value === "string" ? { success: true, data: value } : { success: false } },
  getOnboardingSessionUser: getOnboardingSessionUserMock,
  toOnboardingErrorResponse: (error: unknown) => new Response(JSON.stringify({ error: error instanceof Error ? error.message : "error" }), { status: 500 }),
  roleToRuntimeRole: vi.fn()
}));

vi.mock("@/lib/onboarding/service", () => ({
  getOnboardingState: getOnboardingStateMock,
  initializeUserRole: initializeUserRoleMock,
  getActivationStatusForUser: getActivationStatusForUserMock,
  resolvePostAuthDestination: vi.fn().mockResolvedValue("/onboarding/client/profile")
}));

import { GET as getOnboardingMe } from "@/app/api/onboarding/me/route";
import { POST as postOnboardingRole } from "@/app/api/onboarding/role/route";
import { GET as getActivationStatus } from "@/app/api/activation-status/route";

describe("onboarding routes", () => {
  beforeEach(() => {
    getOnboardingSessionUserMock.mockReset();
    getOnboardingStateMock.mockReset();
    initializeUserRoleMock.mockReset();
    getActivationStatusForUserMock.mockReset();
  });

  it("returns onboarding state for the signed-in user", async () => {
    getOnboardingSessionUserMock.mockResolvedValue(resolveDemoUser("client@bvrb3r.demo"));
    getOnboardingStateMock.mockResolvedValue({ lanes: [], selectedRole: null, nextPath: "/role-select", warnings: [] });

    const response = await getOnboardingMe();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nextPath).toBe("/role-select");
  });

  it("initializes a selected role", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    getOnboardingSessionUserMock.mockResolvedValue(client);
    initializeUserRoleMock.mockResolvedValue({
      state: { id: "lane-1", role: "client", currentStep: "client_profile", completedSteps: [], profileData: {}, status: "in_progress" },
      degraded: false
    });

    const response = await postOnboardingRole(new NextRequest("https://bvrb3r.demo/api/onboarding/role", {
      method: "POST",
      body: JSON.stringify({ role: "client" })
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.lane.role).toBe("client");
  });

  it("returns activation status without leaking internal transport details", async () => {
    getOnboardingSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    getActivationStatusForUserMock.mockResolvedValue({
      selectedRole: "shop_owner",
      nextPath: "/activation-status",
      warnings: [],
      lanes: [
        {
          role: "shop_owner",
          activationState: "verification",
          isActive: false,
          requirements: ["Connect payouts"],
          verificationProfile: undefined,
          resumePath: "/onboarding/owner/verification",
          dashboardPath: "/dashboard/owner"
        }
      ]
    });

    const response = await getActivationStatus();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lanes[0].requirements).toEqual(["Connect payouts"]);
  });
});
