import { describe, expect, it } from "vitest";
import { transitionCashoutRequestInState } from "@/lib/points/cashout-review";
import type { PointsState } from "@/types/points";

function createBaseState(): PointsState {
  return {
    balances: [],
    transactions: [
      {
        id: "txn-earned-1",
        userId: "user-barber",
        role: "barber",
        pointClass: "earned",
        eventType: "booking",
        sourceType: "appointment",
        sourceId: "appt-1",
        pointsDelta: 100,
        inAppValue: 10,
        cashValue: 7,
        status: "unlocked",
        createdAt: "2026-03-26T09:00:00.000Z",
        metadata: {}
      }
    ],
    programRules: [],
    campaigns: [],
    eligibilitySnapshots: [],
    cashoutRequests: [
      {
        id: "cashout-1",
        userId: "user-barber",
        role: "barber",
        pointsRequested: 50,
        cashValue: 3.5,
        status: "approved",
        createdAt: "2026-03-26T10:00:00.000Z",
        metadata: {}
      }
    ]
  };
}

describe("points cashout review lifecycle", () => {
  it("moves approved requests to paid and then back to unlocked points on reversal", () => {
    const paidState = transitionCashoutRequestInState(createBaseState(), {
      requestId: "cashout-1",
      nextStatus: "paid",
      actorUserId: "user-owner",
      actorRole: "owner",
      note: "Paid through payout rails.",
      payoutReference: "manual-cashout-1"
    });

    expect(paidState.cashoutRequests[0].status).toBe("paid");
    expect(paidState.transactions.some((transaction) =>
      transaction.sourceType === "cashout_request"
      && transaction.sourceId === "cashout-1"
      && transaction.status === "cashed_out"
      && transaction.pointsDelta === -50
    )).toBe(true);
    expect(paidState.balances[0]?.totalPoints).toBe(50);

    const reversedState = transitionCashoutRequestInState(paidState, {
      requestId: "cashout-1",
      nextStatus: "reversed",
      actorUserId: "user-owner",
      actorRole: "owner",
      note: "Reversed after manual finance correction.",
      payoutReference: "manual-cashout-1"
    });

    expect(reversedState.cashoutRequests[0].status).toBe("reversed");
    expect(reversedState.transactions.some((transaction) =>
      transaction.sourceId === "cashout-1"
      && transaction.status === "reversed"
    )).toBe(true);
    expect(reversedState.transactions.some((transaction) =>
      transaction.sourceId === "cashout-1:reversal"
      && transaction.pointsDelta === 50
      && transaction.status === "reversed"
    )).toBe(true);
    expect(reversedState.balances[0]?.totalPoints).toBe(100);
  });

  it("blocks approval when unresolved fraud flags remain on the request", () => {
    const state = createBaseState();
    state.cashoutRequests[0] = {
      ...state.cashoutRequests[0],
      status: "under_review",
      metadata: {
        fraudFlags: ["duplicate_pattern"]
      }
    };

    expect(() => transitionCashoutRequestInState(state, {
      requestId: "cashout-1",
      nextStatus: "approved",
      actorUserId: "user-owner",
      actorRole: "owner",
      note: "Attempted approval."
    })).toThrow(/fraud flags/i);
  });

  it("preserves reserved eligibility on failed payout and allows a later paid completion", () => {
    const failedState = transitionCashoutRequestInState(createBaseState(), {
      requestId: "cashout-1",
      nextStatus: "failed",
      actorUserId: "user-manager",
      actorRole: "manager",
      note: "Bank payout rails returned a temporary failure."
    });

    expect(failedState.cashoutRequests[0].status).toBe("failed");
    expect(failedState.transactions.some((transaction) => transaction.sourceId === "cashout-1")).toBe(false);
    expect(failedState.balances[0]?.totalPoints).toBe(100);

    const paidState = transitionCashoutRequestInState(failedState, {
      requestId: "cashout-1",
      nextStatus: "paid",
      actorUserId: "user-owner",
      actorRole: "owner",
      note: "Retry succeeded.",
      payoutReference: "stripe-cashout-1"
    });

    expect(paidState.cashoutRequests[0].status).toBe("paid");
    expect(paidState.transactions.filter((transaction) => transaction.sourceId === "cashout-1" && transaction.status === "cashed_out")).toHaveLength(1);
    expect(paidState.balances[0]?.totalPoints).toBe(50);
  });
});
