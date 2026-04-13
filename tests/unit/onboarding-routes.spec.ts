import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  getOnboardingSessionUserMock,
  getOnboardingStateMock,
  initializeSelectedUserLaneMock,
  getActivationStatusForUserMock,
  resolvePostAuthDestinationMock
} = vi.hoisted(() => ({
  getOnboardingSessionUserMock: vi.fn(),
  getOnboardingStateMock: vi.fn(),
  initializeSelectedUserLaneMock: vi.fn(),
  getActivationStatusForUserMock: vi.fn(),
  resolvePostAuthDestinationMock: vi.fn()
}));

vi.mock("@/app/api/onboarding/_shared", () => ({
  onboardingRoleSchema: { safeParse: (value: unknown) => typeof value === "string" ? { success: true, data: value } : { success: false } },
  getOnboardingSessionUser: getOnboardingSessionUserMock,
  toOnboardingErrorResponse: (error: unknown) => new Response(JSON.stringify({ error: error instanceof Error ? error.message : "error" }), { status: 500 }),
  roleToRuntimeRole: vi.fn()
}));

vi.mock("@/lib/onboarding/service", () => ({
  getOnboardingState: getOnboardingStateMock,
  initializeSelectedUserLane: initializeSelectedUserLaneMock,
  getActivationStatusForUser: getActivationStatusForUserMock,
  resolvePostAuthDestination: resolvePostAuthDestinationMock
}));

import { GET as getOnboardingMe } from "@/app/api/onboarding/me/route";
import { POST as postOnboardingRole } from "@/app/api/onboarding/role/route";
import { GET as getActivationStatus } from "@/app/api/activation-status/route";

describe("onboarding routes", () => {
  beforeEach(() => {
    getOnboardingSessionUserMock.mockReset();
    getOnboardingStateMock.mockReset();
    initializeSelectedUserLaneMock.mockReset();
    getActivationStatusForUserMock.mockReset();
    resolvePostAuthDestinationMock.mockReset();
    resolvePostAuthDestinationMock.mockResolvedValue("/dashboard/client");
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
    initializeSelectedUserLaneMock.mockResolvedValue({
      user: client,
      state: { id: "lane-1", role: "client", currentStep: "client_preferences", completedSteps: ["client_profile", "client_preferences"], profileData: {}, status: "completed" },
      degraded: false
    });

    const response = await postOnboardingRole(new NextRequest("https://bvrb3r.demo/api/onboarding/role", {
      method: "POST",
      body: JSON.stringify({ role: "client" })
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.lane.role).toBe("client");
    expect(body.nextPath).toBe("/dashboard/client");
  });

  it("routes barber role selection into the subtype step when subtype is still missing", async () => {
    const barber = resolveDemoUser("lux@bvrb3r.demo");
    getOnboardingSessionUserMock.mockResolvedValue(barber);
    initializeSelectedUserLaneMock.mockResolvedValue({
      user: barber,
      state: { id: "lane-2", role: "barber", currentStep: "barber_profile", completedSteps: [], profileData: {}, status: "in_progress" },
      degraded: false
    });

    resolvePostAuthDestinationMock.mockResolvedValueOnce("/onboarding/barber-type");

    const response = await postOnboardingRole(new NextRequest("https://bvrb3r.demo/api/onboarding/role", {
      method: "POST",
      body: JSON.stringify({ role: "barber" })
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.nextPath).toBe("/onboarding/barber-type");
  });

  it("normalizes shop_name payloads and routes owner role selection to the owner dashboard", async () => {
    const owner = resolveDemoUser("owner@bvrb3r.demo");
    getOnboardingSessionUserMock.mockResolvedValue(owner);
    initializeSelectedUserLaneMock.mockResolvedValue({
      user: owner,
      state: {
        id: "lane-3",
        role: "shop_owner",
        currentStep: "owner_shop",
        completedSteps: ["owner_shop"],
        profileData: { shopName: "Preview Shop" },
        status: "completed"
      },
      degraded: false
    });

    resolvePostAuthDestinationMock.mockResolvedValueOnce("/dashboard/owner");

    const response = await postOnboardingRole(new NextRequest("https://bvrb3r.demo/api/onboarding/role", {
      method: "POST",
      body: JSON.stringify({ role: "shop_owner", shop_name: "Preview Shop" })
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(initializeSelectedUserLaneMock).toHaveBeenCalledWith(owner, {
      role: "shop_owner",
      shopName: "Preview Shop"
    });
    expect(body.nextPath).toBe("/dashboard/owner");
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
