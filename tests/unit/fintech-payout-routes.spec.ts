import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { FintechServiceError } from "@/lib/fintech/service";

const {
  getSessionUserMock,
  listFintechPayoutsMock,
  getBarberPayoutsMock,
  executeFintechPayoutsMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  listFintechPayoutsMock: vi.fn(),
  getBarberPayoutsMock: vi.fn(),
  executeFintechPayoutsMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/fintech/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fintech/service")>("@/lib/fintech/service");
  return {
    ...actual,
    listFintechPayouts: listFintechPayoutsMock,
    getBarberPayouts: getBarberPayoutsMock,
    executeFintechPayouts: executeFintechPayoutsMock
  };
});

import { GET as getManagementPayouts } from "@/app/api/operations/fintech/payouts/route";
import { POST as postExecutePayouts } from "@/app/api/operations/fintech/payouts/execute/route";
import { GET as getBarberPayoutsRoute } from "@/app/api/fintech/payouts/route";

describe("phase 15 payout routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    listFintechPayoutsMock.mockReset();
    getBarberPayoutsMock.mockReset();
    executeFintechPayoutsMock.mockReset();
  });

  it("returns payout execution visibility for management", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    listFintechPayoutsMock.mockResolvedValue({
      summary: {
        executableRoutingRecords: 2,
        readyForPayoutAmount: 110,
        blockedExecutionRecords: 1,
        failedExecutionRecords: 0,
        executedTransferCount: 2,
        reversedExecutionCount: 0,
        executedAmount: 110,
        reversedAmount: 0,
        processorFeeTracked: 3.2
      },
      readyRouting: [],
      recentExecutions: []
    });

    const response = await getManagementPayouts();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.executableRoutingRecords).toBe(2);
    expect(body.summary.executedAmount).toBe(110);
  });

  it("returns barber-only payout execution visibility", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    getBarberPayoutsMock.mockResolvedValue({
      summary: {
        executableRoutingRecords: 1,
        readyForPayoutAmount: 55,
        blockedExecutionRecords: 0,
        failedExecutionRecords: 0,
        executedTransferCount: 1,
        reversedExecutionCount: 0,
        executedAmount: 55,
        reversedAmount: 0
      },
      recentExecutions: []
    });

    const response = await getBarberPayoutsRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.executedTransferCount).toBe(1);
  });

  it("rejects invalid payout execution modes", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    const response = await postExecutePayouts(new NextRequest("https://bvrb3r.demo/api/operations/fintech/payouts/execute", {
      method: "POST",
      body: JSON.stringify({ mode: "run_all" })
    }));

    expect(response.status).toBe(400);
  });

  it("executes ready payouts with a stable response shape", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    executeFintechPayoutsMock.mockResolvedValue({
      summary: {
        executed: 2,
        blocked: 1,
        failed: 0,
        skipped: 0,
        reversed: 0
      },
      recentExecutions: []
    });

    const response = await postExecutePayouts(new NextRequest("https://bvrb3r.demo/api/operations/fintech/payouts/execute", {
      method: "POST",
      body: JSON.stringify({ mode: "ready" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.executed).toBe(2);
    expect(executeFintechPayoutsMock).toHaveBeenCalledWith(expect.anything(), { mode: "ready", speed: "standard" });
  });

  it("forwards instant payout execution requests with explicit payout speed", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    executeFintechPayoutsMock.mockResolvedValue({
      summary: {
        executed: 1,
        blocked: 0,
        failed: 0,
        skipped: 0,
        reversed: 0
      },
      recentExecutions: []
    });

    const response = await postExecutePayouts(new NextRequest("https://bvrb3r.demo/api/operations/fintech/payouts/execute", {
      method: "POST",
      body: JSON.stringify({ mode: "ready", speed: "instant" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.executed).toBe(1);
    expect(executeFintechPayoutsMock).toHaveBeenCalledWith(expect.anything(), { mode: "ready", speed: "instant" });
  });

  it("rejects invalid payout execution speeds", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    const response = await postExecutePayouts(new NextRequest("https://bvrb3r.demo/api/operations/fintech/payouts/execute", {
      method: "POST",
      body: JSON.stringify({ mode: "ready", speed: "rush" })
    }));

    expect(response.status).toBe(400);
  });

  it("propagates scoped payout execution errors", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    executeFintechPayoutsMock.mockRejectedValue(new FintechServiceError("This payout scope is outside the viewer's shop scope.", 403));

    const response = await postExecutePayouts(new NextRequest("https://bvrb3r.demo/api/operations/fintech/payouts/execute", {
      method: "POST",
      body: JSON.stringify({ mode: "retry_failed" })
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/shop scope/i);
  });
});
