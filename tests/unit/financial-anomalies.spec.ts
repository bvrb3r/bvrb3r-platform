import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listPayoutQueueMock,
  readCashoutReviewQueueMock,
  readPointsStateSnapshotMock
} = vi.hoisted(() => ({
  listPayoutQueueMock: vi.fn(),
  readCashoutReviewQueueMock: vi.fn(),
  readPointsStateSnapshotMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: () => false
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => null
}));

vi.mock("@/lib/payments/service", () => ({
  listPayoutQueue: listPayoutQueueMock
}));

vi.mock("@/lib/points/cashout-review", () => ({
  readCashoutReviewQueue: readCashoutReviewQueueMock
}));

vi.mock("@/lib/points/engine", () => ({
  readPointsStateSnapshot: readPointsStateSnapshotMock
}));

import {
  dismissFinancialAnomaly,
  readFinancialAnomalyQueue,
  resetFinancialAnomaliesForTests,
  resolveFinancialAnomaly,
  syncFinancialAnomalies
} from "@/lib/fintech/anomalies";

describe("financial anomalies", () => {
  beforeEach(() => {
    resetFinancialAnomaliesForTests();
    listPayoutQueueMock.mockReset();
    readCashoutReviewQueueMock.mockReset();
    readPointsStateSnapshotMock.mockReset();
  });

  it("persists payout and cash-out anomalies from canonical inputs without duplicating them across repeated runs", async () => {
    listPayoutQueueMock.mockResolvedValue([
      {
        appointmentId: "appt-1",
        paymentId: "pay-1",
        routingRecordId: "route-1",
        status: "failed",
        eligibleAmount: 33,
        thresholdAmount: 25,
        thresholdRemaining: 0,
        minimumThresholdMet: true,
        blockedReasons: ["manual_review"],
        stripeReady: true,
        disputeHold: false,
        refundHold: false,
        nextAction: "Retry payout",
        executionCount: 1,
        lastUpdatedAt: "2026-03-20T09:00:00.000Z"
      },
      {
        appointmentId: "appt-2",
        paymentId: "pay-2",
        routingRecordId: "route-2",
        status: "pending",
        eligibleAmount: 40,
        thresholdAmount: 25,
        thresholdRemaining: 0,
        minimumThresholdMet: true,
        blockedReasons: [],
        stripeReady: true,
        disputeHold: false,
        refundHold: false,
        nextAction: "Ready",
        executionCount: 0,
        lastUpdatedAt: "2026-03-21T09:00:00.000Z"
      }
    ]);
    readCashoutReviewQueueMock.mockResolvedValue({
      summary: {
        requested: 0,
        underReview: 0,
        approved: 1,
        paid: 0,
        failed: 1,
        rejected: 0,
        reversed: 0
      },
      requests: [
        {
          requestId: "cashout-1",
          userId: "user-blaze",
          role: "barber",
          userLabel: "Blaze",
          pointsRequested: 40,
          cashValue: 2.8,
          status: "approved",
          createdAt: "2026-03-20T09:00:00.000Z",
          processedAt: "2026-03-20T09:00:00.000Z",
          fraudFlags: [],
          reviewNote: "Approved",
          payoutReference: null,
          failureReason: null,
          auditLog: [],
          canReview: false,
          canApprove: false,
          canReject: true,
          canMarkPaid: true,
          canMarkFailed: true,
          canReverse: true
        },
        {
          requestId: "cashout-2",
          userId: "user-wave",
          role: "owner",
          userLabel: "Wave",
          pointsRequested: 50,
          cashValue: 3.5,
          status: "failed",
          createdAt: "2026-03-19T09:00:00.000Z",
          processedAt: "2026-03-19T09:00:00.000Z",
          fraudFlags: [],
          reviewNote: "Failed",
          payoutReference: null,
          failureReason: "Transfer failed",
          auditLog: [],
          canReview: false,
          canApprove: false,
          canReject: false,
          canMarkPaid: true,
          canMarkFailed: false,
          canReverse: true
        }
      ]
    });
    readPointsStateSnapshotMock.mockResolvedValue({
      balances: [],
      transactions: [
        {
          id: "txn-1",
          userId: "user-owner",
          role: "owner",
          pointClass: "promo",
          eventType: "campaign",
          sourceType: "campaign_credit",
          sourceId: "campaign-1",
          pointsDelta: 1200,
          inAppValue: 120,
          cashValue: 0,
          status: "unlocked",
          createdAt: "2026-03-20T09:00:00.000Z",
          metadata: {}
        }
      ],
      programRules: [],
      campaigns: [],
      eligibilitySnapshots: [],
      cashoutRequests: []
    });

    const firstQueue = await syncFinancialAnomalies({ now: "2026-03-26T09:00:00.000Z" });
    const secondQueue = await syncFinancialAnomalies({ now: "2026-03-26T09:00:00.000Z" });

    expect(firstQueue.summary.open).toBeGreaterThanOrEqual(4);
    expect(secondQueue.items).toHaveLength(firstQueue.items.length);
    expect(secondQueue.items.some((item) => item.anomalyType === "payout_failure")).toBe(true);
    expect(secondQueue.items.some((item) => item.anomalyType === "cashout_failure")).toBe(true);
    expect(secondQueue.items.some((item) => item.anomalyType === "points_liability_spike")).toBe(true);
  });

  it("supports operator resolution and dismissal on persisted anomalies", async () => {
    listPayoutQueueMock.mockResolvedValue([]);
    readCashoutReviewQueueMock.mockResolvedValue({
      summary: {
        requested: 0,
        underReview: 0,
        approved: 0,
        paid: 0,
        failed: 0,
        rejected: 0,
        reversed: 0
      },
      requests: []
    });
    readPointsStateSnapshotMock.mockResolvedValue({
      balances: [],
      transactions: [],
      programRules: [],
      campaigns: [],
      eligibilitySnapshots: [],
      cashoutRequests: []
    });

    await syncFinancialAnomalies({ now: "2026-03-26T09:00:00.000Z" });
    resetFinancialAnomaliesForTests();
    await syncFinancialAnomalies({
      now: "2026-03-26T09:00:00.000Z"
    });

    const queue = await readFinancialAnomalyQueue();
    if (!queue.items.length) {
      listPayoutQueueMock.mockResolvedValue([
        {
          appointmentId: "appt-3",
          paymentId: "pay-3",
          routingRecordId: "route-3",
          status: "failed",
          eligibleAmount: 22,
          thresholdAmount: 25,
          thresholdRemaining: 3,
          minimumThresholdMet: false,
          blockedReasons: ["manual_review"],
          stripeReady: false,
          disputeHold: false,
          refundHold: false,
          nextAction: "Review",
          executionCount: 1,
          lastUpdatedAt: "2026-03-20T09:00:00.000Z"
        }
      ]);
      await syncFinancialAnomalies({ now: "2026-03-26T09:00:00.000Z" });
    }

    const freshQueue = await readFinancialAnomalyQueue();
    const anomalyId = freshQueue.items[0]?.id;
    expect(anomalyId).toBeTruthy();

    const resolved = await resolveFinancialAnomaly({
      id: anomalyId!,
      actorUserId: "user-owner",
      actorRole: "owner",
      note: "Resolved after payout review."
    });
    expect(resolved.status).toBe("resolved");

    const dismissed = await dismissFinancialAnomaly({
      id: anomalyId!,
      actorUserId: "user-owner",
      actorRole: "owner",
      note: "Dismissed after confirming no issue."
    });
    expect(dismissed.status).toBe("dismissed");
  });
});
