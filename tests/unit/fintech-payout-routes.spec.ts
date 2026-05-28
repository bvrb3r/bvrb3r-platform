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
  getArchitectStripePlatformDiagnosticsMock,
  listArchitectFreelancePayoutQueueMock,
  validateFreelancePayoutReleaseEligibilityMock,
  approveFreelancePayoutReadinessForRoutingMock,
  releaseFreelanceRoutingPayoutMock,
  releaseReadyFreelancePayoutBatchMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  requireArchitectDebugAccessMock: vi.fn(),
  listFintechPayoutsMock: vi.fn(),
  getBarberPayoutsMock: vi.fn(),
  executeFintechPayoutsMock: vi.fn(),
  getArchitectStripePlatformDiagnosticsMock: vi.fn(),
  listArchitectFreelancePayoutQueueMock: vi.fn(),
  validateFreelancePayoutReleaseEligibilityMock: vi.fn(),
  approveFreelancePayoutReadinessForRoutingMock: vi.fn(),
  releaseFreelanceRoutingPayoutMock: vi.fn(),
  releaseReadyFreelancePayoutBatchMock: vi.fn()
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
    getArchitectStripePlatformDiagnostics: getArchitectStripePlatformDiagnosticsMock,
    listArchitectFreelancePayoutQueue: listArchitectFreelancePayoutQueueMock,
    validateFreelancePayoutReleaseEligibility: validateFreelancePayoutReleaseEligibilityMock,
    approveFreelancePayoutReadinessForRouting: approveFreelancePayoutReadinessForRoutingMock,
    releaseFreelanceRoutingPayout: releaseFreelanceRoutingPayoutMock,
    releaseReadyFreelancePayoutBatch: releaseReadyFreelancePayoutBatchMock
  };
});

import { GET as getManagementPayouts } from "@/app/api/operations/fintech/payouts/route";
import { POST as postExecutePayouts } from "@/app/api/operations/fintech/payouts/execute/route";
import { GET as getBarberPayoutsRoute } from "@/app/api/fintech/payouts/route";
import { GET as getArchitectPayoutQueue } from "@/app/api/architect/payouts/queue/route";
import { GET as getArchitectStripePlatformDiagnostics } from "@/app/api/architect/stripe/platform-diagnostics/route";
import { POST as postArchitectPayoutValidate } from "@/app/api/architect/payouts/validate/route";
import { POST as postArchitectPayoutApproveReadiness } from "@/app/api/architect/payouts/approve-readiness/route";
import { POST as postArchitectPayoutRelease } from "@/app/api/architect/payouts/release/route";
import { POST as postArchitectPayoutReleaseBatch } from "@/app/api/architect/payouts/release-batch/route";

describe("phase 15 payout routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    requireArchitectDebugAccessMock.mockReset();
    listFintechPayoutsMock.mockReset();
    getBarberPayoutsMock.mockReset();
    executeFintechPayoutsMock.mockReset();
    getArchitectStripePlatformDiagnosticsMock.mockReset();
    listArchitectFreelancePayoutQueueMock.mockReset();
    validateFreelancePayoutReleaseEligibilityMock.mockReset();
    approveFreelancePayoutReadinessForRoutingMock.mockReset();
    releaseFreelanceRoutingPayoutMock.mockReset();
    releaseReadyFreelancePayoutBatchMock.mockReset();
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
      warnings: [],
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
        stripePayoutReadiness: {
          barberId: "barber-1",
          stripeConnectAccountId: "acct_barber",
          hasAccount: true,
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
          currentlyDue: [],
          eventuallyDue: [],
          pastDue: [],
          disabledReason: null,
          canReceivePayouts: true,
          requiresOnboarding: false,
          displayStatus: "ready",
          displayMessage: "Payout account ready."
        },
        existingExecutionId: null,
        existingExecutionStatus: null,
        ineligibleReasons: [],
        warnings: [],
        canValidate: true,
        canRelease: true,
        canApprovePayoutSetup: false,
        releaseBlockedReason: null,
        releaseActionLabel: "Release payout"
      }]
    });

    const response = await getArchitectPayoutQueue();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.readyAmount).toBe(8.55);
    expect(body.items[0].sourceLabel).toBe("POS Card-on-File");
  });

  it("returns Architect Stripe platform diagnostics without exposing secrets", async () => {
    getArchitectStripePlatformDiagnosticsMock.mockResolvedValue({
      ok: true,
      platformAccountId: "acct_1L0nesLDU3d4YToG",
      country: "US",
      defaultCurrency: "usd",
      chargesEnabled: true,
      payoutsEnabled: true,
      dashboardDisplayName: "BVRB3R Platform",
      livemode: false,
      availableBalances: [{ currency: "usd", amount: 100 }],
      pendingBalances: [{ currency: "usd", amount: 4.25 }],
      stripeKeyMode: "test",
      expectedPlatformAccountId: "acct_1L0nesLDU3d4YToG",
      accountMatchesExpected: true,
      mismatchWarning: null,
      warnings: [],
      checkedAt: "2026-05-26T15:00:00.000Z"
    });

    const response = await getArchitectStripePlatformDiagnostics();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.platformAccountId).toBe("acct_1L0nesLDU3d4YToG");
    expect(body.availableBalances).toEqual([{ currency: "usd", amount: 100 }]);
    expect(JSON.stringify(body)).not.toContain("sk_");
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
      stripePayoutReadiness: null,
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

  it("approves Architect payout readiness review requests", async () => {
    approveFreelancePayoutReadinessForRoutingMock.mockResolvedValue({
      ok: true,
      connectedAccountId: "connected-account-1",
      barberId: "barber-1",
      routingRecordId: "routing-9",
      previousPayoutReadinessStatus: "needs_attention",
      newPayoutReadinessStatus: "ready",
      previousLegalReadinessStatus: "pending",
      newLegalReadinessStatus: "accepted",
      blockers: [],
      message: "Payout setup approved. This barber can now receive BVRB3R payouts."
    });

    const response = await postArchitectPayoutApproveReadiness(new NextRequest("https://bvrb3r.demo/api/architect/payouts/approve-readiness", {
      method: "POST",
      body: JSON.stringify({ routingRecordId: "routing-9" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(approveFreelancePayoutReadinessForRoutingMock).toHaveBeenCalledWith({
      routingRecordId: "routing-9",
      approvedByProfileId: expect.any(String)
    });
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
      stripePayoutReadiness: null,
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

  it("returns structured Stripe transfer failures from Architect freelance payout release", async () => {
    releaseFreelanceRoutingPayoutMock.mockResolvedValue({
      ok: false,
      dryRun: false,
      eligibility: {
        eligible: true,
        reasons: [],
        routingRecordId: "routing-9",
        releaseAmount: 8.55,
        recipientType: "barber",
        barberId: "barber-1",
        stripeConnectAccountId: "acct_barber",
        stripePayoutReadiness: null,
        existingExecutionId: null,
        existingExecutionStatus: null,
        routingRecord: null
      },
      execution: null,
      routingRecord: null,
      message: "Release failed: insufficient available Stripe platform balance.",
      failedStep: "stripe_transfer",
      errorCode: "stripe_insufficient_funds",
      errorMessage: "Release failed: insufficient available Stripe platform balance.",
      payoutExecutionId: "execution-failed"
    });

    const response = await postArchitectPayoutRelease(new NextRequest("https://bvrb3r.demo/api/architect/payouts/release", {
      method: "POST",
      body: JSON.stringify({ routingRecordId: "routing-9" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.failedStep).toBe("stripe_transfer");
    expect(body.errorCode).toBe("stripe_insufficient_funds");
    expect(body.errorMessage).toBe("Release failed: insufficient available Stripe platform balance.");
    expect(body.payoutExecutionId).toBe("execution-failed");
  });

  it("returns safe payout execution insert diagnostics from Architect freelance payout release", async () => {
    releaseFreelanceRoutingPayoutMock.mockResolvedValue({
      ok: false,
      dryRun: false,
      eligibility: {
        eligible: true,
        reasons: [],
        routingRecordId: "routing-9",
        releaseAmount: 8.55,
        recipientType: "barber",
        barberId: "barber-1",
        stripeConnectAccountId: "acct_barber",
        stripePayoutReadiness: null,
        existingExecutionId: null,
        existingExecutionStatus: null,
        routingRecord: null
      },
      execution: null,
      routingRecord: null,
      message: "Unable to create the payout execution record.",
      failedStep: "create_payout_execution",
      errorCode: "payout_execution_insert_failed",
      errorMessage: "Unable to create the payout execution record.",
      debugSafeDetails: {
        table: "payout_executions",
        constraint: "payout_executions_idempotency_uidx",
        supabaseCode: "23505",
        supabaseMessage: "duplicate key value violates unique constraint \"payout_executions_idempotency_uidx\"",
        supabaseDetails: "Key (idempotency_key)=(freelance_payout_release:routing-9:attempt:7) already exists.",
        supabaseHint: null,
        attemptedIdempotencyKey: "freelance_payout_release:routing-9:attempt:7",
        attemptedAttemptCount: 7,
        nextAttemptNumber: 7,
        routingRecordId: "routing-9",
        paymentId: "payment-9",
        targetConnectedAccountId: "connected-9",
        targetProviderAccountId: "acct_barber",
        amount: 8.55,
        currency: "usd",
        executionStatus: "pending",
        executionType: "transfer",
        targetSubjectType: "barber"
      }
    });

    const response = await postArchitectPayoutRelease(new NextRequest("https://bvrb3r.demo/api/architect/payouts/release", {
      method: "POST",
      body: JSON.stringify({ routingRecordId: "routing-9" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.failedStep).toBe("create_payout_execution");
    expect(body.errorCode).toBe("payout_execution_insert_failed");
    expect(body.debugSafeDetails.supabaseCode).toBe("23505");
    expect(body.debugSafeDetails.supabaseMessage).toContain("duplicate key value");
    expect(body.debugSafeDetails.supabaseDetails).toContain("freelance_payout_release:routing-9:attempt:7");
    expect(body.debugSafeDetails.supabaseHint).toBeNull();
    expect(body.debugSafeDetails.attemptedIdempotencyKey).toBe("freelance_payout_release:routing-9:attempt:7");
    expect(body.debugSafeDetails.attemptedAttemptCount).toBe(7);
  });

  it("releases all ready Architect freelance payouts with the guarded actor id", async () => {
    releaseReadyFreelancePayoutBatchMock.mockResolvedValue({
      ok: true,
      attemptedCount: 3,
      releasedCount: 3,
      failedCount: 0,
      skippedCount: 0,
      totalReleasedAmount: 42.75,
      requiredAmount: 42.75,
      availableAmount: 96.8,
      results: [
        { routingRecordId: "routing-1", status: "released", amount: 8.55, processorTransferId: "tr_1", reason: null },
        { routingRecordId: "routing-2", status: "released", amount: 14.25, processorTransferId: "tr_2", reason: null },
        { routingRecordId: "routing-3", status: "released", amount: 19.95, processorTransferId: "tr_3", reason: null }
      ],
      message: "Released 3 payouts totaling $42.75."
    });

    const response = await postArchitectPayoutReleaseBatch(new NextRequest("https://bvrb3r.demo/api/architect/payouts/release-batch", {
      method: "POST",
      body: JSON.stringify({ scope: "freelance", mode: "ready_only" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.releasedCount).toBe(3);
    expect(body.totalReleasedAmount).toBe(42.75);
    expect(releaseReadyFreelancePayoutBatchMock).toHaveBeenCalledWith({
      requestedByProfileId: expect.any(String),
      scope: "freelance",
      mode: "ready_only"
    });
  });

  it("rejects unsupported Architect payout batch release scopes", async () => {
    const response = await postArchitectPayoutReleaseBatch(new NextRequest("https://bvrb3r.demo/api/architect/payouts/release-batch", {
      method: "POST",
      body: JSON.stringify({ scope: "all", mode: "ready_only" })
    }));

    expect(response.status).toBe(400);
    expect(releaseReadyFreelancePayoutBatchMock).not.toHaveBeenCalled();
  });

  it("returns structured insufficient platform balance responses from batch release", async () => {
    releaseReadyFreelancePayoutBatchMock.mockResolvedValue({
      ok: false,
      attemptedCount: 0,
      releasedCount: 0,
      failedCount: 0,
      skippedCount: 3,
      totalReleasedAmount: 0,
      requiredAmount: 42.75,
      availableAmount: 0,
      errorCode: "insufficient_platform_balance",
      errorMessage: "Release blocked: Stripe platform available balance is below required payout total.",
      results: [],
      message: "Release blocked: Stripe platform available balance is below required payout total."
    });

    const response = await postArchitectPayoutReleaseBatch(new NextRequest("https://bvrb3r.demo/api/architect/payouts/release-batch", {
      method: "POST",
      body: JSON.stringify({ scope: "freelance", mode: "ready_only" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe("insufficient_platform_balance");
    expect(body.errorMessage).toBe("Release blocked: Stripe platform available balance is below required payout total.");
    expect(body.requiredAmount).toBe(42.75);
    expect(body.availableAmount).toBe(0);
  });

  it("returns row-level failure reasons from Architect batch release", async () => {
    releaseReadyFreelancePayoutBatchMock.mockResolvedValue({
      ok: true,
      attemptedCount: 3,
      releasedCount: 1,
      failedCount: 2,
      skippedCount: 0,
      totalReleasedAmount: 8.55,
      requiredAmount: 18.05,
      availableAmount: 63.55,
      results: [
        {
          routingRecordId: "routing-pos",
          paymentId: "payment-pos",
          appointmentId: null,
          posSaleId: "sale-pos",
          status: "released",
          amount: 8.55,
          processorTransferId: "tr_pos",
          reason: null,
          errorCode: null,
          failedStep: null
        },
        {
          routingRecordId: "routing-appointment-1",
          paymentId: "payment-appointment-1",
          appointmentId: "appointment-1",
          posSaleId: null,
          status: "failed",
          amount: 4.75,
          processorTransferId: null,
          reason: "Payment has not been captured or paid.",
          errorCode: "appointment_payment_not_captured",
          failedStep: "validate_release"
        }
      ],
      message: "Released 1 payouts. 2 failed."
    });

    const response = await postArchitectPayoutReleaseBatch(new NextRequest("https://bvrb3r.demo/api/architect/payouts/release-batch", {
      method: "POST",
      body: JSON.stringify({ scope: "freelance", mode: "ready_only" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results[1]).toMatchObject({
      routingRecordId: "routing-appointment-1",
      paymentId: "payment-appointment-1",
      appointmentId: "appointment-1",
      status: "failed",
      amount: 4.75,
      reason: "Payment has not been captured or paid.",
      errorCode: "appointment_payment_not_captured",
      failedStep: "validate_release"
    });
  });
});
