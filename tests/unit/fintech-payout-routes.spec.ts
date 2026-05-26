import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { FintechServiceError } from "@/lib/fintech/service";

const {
  getSessionUserMock,
  requireArchitectDebugAccessMock,
  listFintechPayoutsMock,
  getBarberPayoutsMock,
  executeFintechPayoutsMock,
  listArchitectFreelancePayoutQueueMock,
  validateFreelancePayoutReleaseEligibilityMock,
  releaseFreelanceRoutingPayoutMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  requireArchitectDebugAccessMock: vi.fn(),
  listFintechPayoutsMock: vi.fn(),
  getBarberPayoutsMock: vi.fn(),
  executeFintechPayoutsMock: vi.fn(),
  listArchitectFreelancePayoutQueueMock: vi.fn(),
  validateFreelancePayoutReleaseEligibilityMock: vi.fn(),
  releaseFreelanceRoutingPayoutMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/architect/debug/guards", () => ({
  requireArchitectDebugAccess: requireArchitectDebugAccessMock
}));

vi.mock("@/lib/fintech/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fintech/service")>("@/lib/fintech/service");
  return {
    ...actual,
    listFintechPayouts: listFintechPayoutsMock,
    getBarberPayouts: getBarberPayoutsMock,
    executeFintechPayouts: executeFintechPayoutsMock,
    listArchitectFreelancePayoutQueue: listArchitectFreelancePayoutQueueMock,
    validateFreelancePayoutReleaseEligibility: validateFreelancePayoutReleaseEligibilityMock,
    releaseFreelanceRoutingPayout: releaseFreelanceRoutingPayoutMock
  };
});

import { GET as getManagementPayouts } from "@/app/api/operations/fintech/payouts/route";
import { POST as postExecutePayouts } from "@/app/api/operations/fintech/payouts/execute/route";
import { GET as getBarberPayoutsRoute } from "@/app/api/fintech/payouts/route";
import { GET as getArchitectPayoutQueue } from "@/app/api/architect/payouts/queue/route";
import { POST as postArchitectPayoutValidate } from "@/app/api/architect/payouts/validate/route";
import { POST as postArchitectPayoutRelease } from "@/app/api/architect/payouts/release/route";

describe("phase 15 payout routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    requireArchitectDebugAccessMock.mockReset();
    listFintechPayoutsMock.mockReset();
    getBarberPayoutsMock.mockReset();
    executeFintechPayoutsMock.mockReset();
    listArchitectFreelancePayoutQueueMock.mockReset();
    validateFreelancePayoutReleaseEligibilityMock.mockReset();
    releaseFreelanceRoutingPayoutMock.mockReset();
    requireArchitectDebugAccessMock.mockResolvedValue({
      ok: true,
      actor: resolveDemoUser("architect@bvrb3r.demo")
    });
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

  it("returns Architect freelance payout queue visibility", async () => {
    listArchitectFreelancePayoutQueueMock.mockResolvedValue({
      summary: {
        readyCount: 1,
        readyAmount: 8.55,
        blockedCount: 0,
        releasedCount: 0
      },
      items: [{
        routingRecordId: "routing-9",
        paymentId: "payment-9",
        appointmentId: null,
        posSaleId: "sale-9",
        barberId: "barber-1",
        barberName: "Phillip mcgee",
        sourceLabel: "POS Card-on-File",
        providerGrossAmount: 9,
        platformFeeAmount: 0.45,
        barberPayoutAmount: 8.55,
        shopSplitAmount: 0,
        payoutReadinessStatus: "ready",
        moneyRoutingStatus: "pending",
        eligibleAt: "2026-05-26T12:00:00.000Z",
        releasedAt: null,
        stripeConnectAccountId: "acct_barber",
        existingExecutionId: null,
        existingExecutionStatus: null,
        ineligibleReasons: [],
        canRelease: true
      }]
    });

    const response = await getArchitectPayoutQueue();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.readyAmount).toBe(8.55);
    expect(body.items[0].sourceLabel).toBe("POS Card-on-File");
  });

  it("validates Architect freelance payout release requests", async () => {
    validateFreelancePayoutReleaseEligibilityMock.mockResolvedValue({
      eligible: true,
      reasons: [],
      routingRecordId: "routing-9",
      releaseAmount: 8.55,
      recipientType: "barber",
      barberId: "barber-1",
      stripeConnectAccountId: "acct_barber",
      existingExecutionId: null,
      existingExecutionStatus: null,
      routingRecord: null
    });

    const response = await postArchitectPayoutValidate(new NextRequest("https://bvrb3r.demo/api/architect/payouts/validate", {
      method: "POST",
      body: JSON.stringify({ routingRecordId: "routing-9" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.eligible).toBe(true);
    expect(validateFreelancePayoutReleaseEligibilityMock).toHaveBeenCalledWith("routing-9");
  });

  it("releases Architect freelance payout requests with the guarded actor id", async () => {
    releaseFreelanceRoutingPayoutMock.mockResolvedValue({
      ok: true,
      dryRun: false,
      eligibility: {
        eligible: true,
        reasons: [],
        routingRecordId: "routing-9",
        releaseAmount: 8.55,
        recipientType: "barber",
        barberId: "barber-1",
        stripeConnectAccountId: "acct_barber",
        existingExecutionId: null,
        existingExecutionStatus: null,
        routingRecord: null
      },
      execution: null,
      routingRecord: null,
      message: "Payout released to the barber payout account."
    });

    const response = await postArchitectPayoutRelease(new NextRequest("https://bvrb3r.demo/api/architect/payouts/release", {
      method: "POST",
      body: JSON.stringify({ routingRecordId: "routing-9" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(releaseFreelanceRoutingPayoutMock).toHaveBeenCalledWith({
      routingRecordId: "routing-9",
      requestedByProfileId: expect.any(String),
      dryRun: false
    });
  });
});
