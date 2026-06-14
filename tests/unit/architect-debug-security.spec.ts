import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";
import { createArchitectDebugTables, createSupabaseStub } from "@/tests/unit/architect-debug-test-utils";

const { getCurrentUserFromServerMock, createSupabaseAdminClientMock } = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

import { GET as getAppointmentDebug } from "@/app/api/architect/debug/appointment/route";
import { GET as getMissionControl } from "@/app/api/architect/mission-control/route";
import { POST as postRoutingRepair } from "@/app/api/architect/repairs/payment-routing/route";

describe("architect debug security", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("blocks anonymous appointment debug access", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: false,
      mode: "supabase",
      user: { id: "guest-user", role: "client_user", accountStatus: "profile_only" }
    });

    const response = await getAppointmentDebug(new NextRequest("https://bvrb3r.test/api/architect/debug/appointment?appointmentId=appt"));

    expect(response.status).toBe(401);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("blocks client users from repair actions", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: true,
      mode: "demo",
      user: resolveDemoUser("client@bvrb3r.demo")
    });

    const response = await postRoutingRepair(new NextRequest("https://bvrb3r.test/api/architect/repairs/payment-routing", {
      method: "POST",
      body: JSON.stringify({ appointmentId: "appt" })
    }));

    expect(response.status).toBe(403);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("blocks public roles from Mission Control", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: true,
      mode: "demo",
      user: resolveDemoUser("client@bvrb3r.demo")
    });

    const response = await getMissionControl();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/platform administrators/i);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("allows platform admin debug access", async () => {
    const tables = createArchitectDebugTables();
    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: true,
      mode: "demo",
      user: makePlatformAdminUser()
    });
    createSupabaseAdminClientMock.mockReturnValue(createSupabaseStub(tables));

    const response = await getAppointmentDebug(new NextRequest("https://bvrb3r.test/api/architect/debug/appointment?appointmentId=2090ae1e-3b7c-59d2-81ac-9f88908fd735"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.diagnosisCode).toBe("completed_but_routing_missing");
  });
});
