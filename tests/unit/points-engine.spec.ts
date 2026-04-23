import { describe, expect, it } from "vitest";
import {
  awardPointsForEventInState,
  buildOwnerPointsAnalyticsSummary,
  buildPointsBalanceFromState,
  buildSyntheticPointsState,
  commitPointsRedemptionInState,
  createCashoutRequestInState,
  reversePointsForAppointmentInState,
  syncPointsStateLifecycle
} from "@/lib/points/engine";

describe("points engine", () => {
  it("blocks rewards when the payment is not settled", () => {
    const result = awardPointsForEventInState(buildSyntheticPointsState(), {
      userId: "user-client",
      role: "client",
      eventType: "booking",
      sourceType: "appointment",
      sourceId: "appt-pending-payment",
      basePoints: 8,
      orderTotal: 60,
      platformFeeAmount: 8,
      paymentSettled: false,
      serviceCompleted: true,
      refundState: "clean",
      phoneValidated: true
    });

    expect(result.transaction).toBeNull();
    expect(result.snapshot.eligibilityStatus).toBe("blocked");
    expect(result.snapshot.validationFlags.paymentSettled).toBe(false);
  });

  it("blocks rewards when the completed appointment is disputed or refunded", () => {
    const result = awardPointsForEventInState(buildSyntheticPointsState(), {
      userId: "user-client",
      role: "client",
      eventType: "booking",
      sourceType: "appointment",
      sourceId: "appt-disputed",
      basePoints: 8,
      orderTotal: 60,
      platformFeeAmount: 8,
      paymentSettled: true,
      serviceCompleted: true,
      refundState: "chargeback",
      phoneValidated: true
    });

    expect(result.transaction).toBeNull();
    expect(result.snapshot.eligibilityStatus).toBe("blocked");
    expect(result.snapshot.validationFlags.refundClear).toBe(false);
  });

  it("moves pending rewards to unlocked after the delay window", () => {
    const reward = awardPointsForEventInState(buildSyntheticPointsState(), {
      userId: "user-client",
      role: "client",
      eventType: "booking",
      sourceType: "appointment",
      sourceId: "appt-unlock-window",
      basePoints: 8,
      orderTotal: 70,
      platformFeeAmount: 9,
      paymentSettled: true,
      serviceCompleted: true,
      refundState: "clean",
      phoneValidated: true
    });

    expect(reward.transaction?.status).toBe("pending");

    const unlockedAt = new Date(reward.transaction?.unlockedAt ?? new Date().toISOString());
    unlockedAt.setMinutes(unlockedAt.getMinutes() + 1);
    const nextState = syncPointsStateLifecycle(reward.state, unlockedAt.toISOString());
    const nextBalance = buildPointsBalanceFromState(nextState, {
      userId: "user-client",
      role: "client"
    });

    expect(nextState.transactions.find((transaction) => transaction.id === reward.transaction?.id)?.status).toBe("unlocked");
    expect(nextBalance.pendingPoints).toBe(0);
    expect(nextBalance.unlockedPoints).toBeGreaterThan(0);
  });

  it("prevents duplicate referral credit for the same referred lifecycle", () => {
    const firstAward = awardPointsForEventInState(buildSyntheticPointsState(), {
      userId: "user-client",
      role: "client",
      eventType: "referral",
      sourceType: "referral_event",
      sourceId: "referral-loop-client",
      referralId: "referral-loop",
      basePoints: 10,
      orderTotal: 90,
      platformFeeAmount: 12,
      paymentSettled: true,
      serviceCompleted: true,
      refundState: "clean",
      phoneValidated: true
    });
    const duplicateAward = awardPointsForEventInState(firstAward.state, {
      userId: "user-client",
      role: "client",
      eventType: "referral",
      sourceType: "referral_event",
      sourceId: "referral-loop-client",
      referralId: "referral-loop",
      basePoints: 10,
      orderTotal: 90,
      platformFeeAmount: 12,
      paymentSettled: true,
      serviceCompleted: true,
      refundState: "clean",
      phoneValidated: true
    });

    expect(firstAward.transaction).not.toBeNull();
    expect(duplicateAward.transaction).toBeNull();
    expect(duplicateAward.snapshot.eligibilityStatus).toBe("blocked");
    expect(duplicateAward.snapshot.validationFlags.referralUnique).toBe(false);
  });

  it("flags suspicious rewards for review instead of issuing them immediately", () => {
    const result = awardPointsForEventInState(buildSyntheticPointsState(), {
      userId: "user-client",
      role: "client",
      eventType: "retention",
      sourceType: "manual",
      sourceId: "retention-risk-window",
      basePoints: 12,
      orderTotal: 40,
      platformFeeAmount: 8,
      paymentSettled: true,
      serviceCompleted: true,
      refundState: "clean",
      phoneValidated: true,
      anomalyScore: 0.95,
      fraudFlags: ["velocity_spike"]
    });

    expect(result.transaction).toBeNull();
    expect(result.snapshot.eligibilityStatus).toBe("pending_review");
    expect(result.snapshot.validationFlags.fraudClear).toBe(false);
  });

  it("awards qualified tip points within the configured event cap", () => {
    const result = awardPointsForEventInState(buildSyntheticPointsState(), {
      userId: "user-client",
      role: "client",
      eventType: "tip",
      sourceType: "appointment",
      sourceId: "appt-tip-qualified",
      basePoints: 6,
      orderTotal: 78,
      platformFeeAmount: 4,
      paymentSettled: true,
      serviceCompleted: true,
      refundState: "clean",
      phoneValidated: true,
      metadata: {
        appointmentId: "appt-tip-qualified",
        tipAmount: 9
      }
    });

    expect(result.transaction).not.toBeNull();
    expect(result.transaction?.eventType).toBe("tip");
    expect(result.transaction?.pointsDelta).toBe(6);
    expect(result.snapshot.eligibilityStatus).toBe("eligible");
  });

  it("redeems promo points before earned points and records both ledger rows", () => {
    const seededState = syncPointsStateLifecycle(buildSyntheticPointsState());
    const openingBalance = buildPointsBalanceFromState(seededState, {
      userId: "user-client",
      role: "client"
    });
    const result = commitPointsRedemptionInState(seededState, {
      userId: "user-client",
      role: "client",
      purpose: "booking_discount",
      requestedPoints: 30,
      orderTotal: 100,
      sourceId: "appt-redeem-bvr",
      locationId: "loc-ybor"
    });

    expect(result.preview.approvedPoints).toBe(30);
    expect(result.preview.promoPointsUsed).toBe(20);
    expect(result.preview.earnedPointsUsed).toBe(10);
    expect(result.transactions).toHaveLength(2);
    expect(result.balance.unlockedPoints).toBe(openingBalance.unlockedPoints - result.preview.approvedPoints);
  });

  it("creates a cash-out request only from eligible earned points and reserves the request", () => {
    const seededState = buildSyntheticPointsState();
    seededState.transactions.unshift({
      id: "pts-txn-barber-bonus",
      userId: "user-barber-hardening",
      role: "barber",
      pointClass: "earned",
      eventType: "campaign",
      sourceType: "campaign_credit",
      sourceId: "campaign-barber-bonus",
      pointsDelta: 120,
      inAppValue: 12,
      cashValue: 8.4,
      status: "unlocked",
      createdAt: "2026-03-24T12:00:00-04:00",
      unlockedAt: "2026-03-24T12:00:00-04:00",
      expiresAt: null,
      reversedAt: null,
      metadata: {
        campaignId: "campaign-retention-streak",
        locationId: "loc-ybor"
      }
    });

    const result = createCashoutRequestInState(seededState, {
      userId: "user-barber-hardening",
      role: "barber",
      requestedPoints: 100
    });

    expect(result.request.status).toBe("requested");
    expect(result.preview.approvedPoints).toBe(100);
    expect(result.preview.cashValue).toBe(7);
    expect(result.balance.reservedCashoutPoints).toBe(100);
    expect(result.balance.cashoutEligiblePoints).toBe(20);
  });

  it("blocks duplicate open cash-out requests for the same user scope", () => {
    const seededState = buildSyntheticPointsState();
    seededState.transactions.unshift({
      id: "pts-txn-owner-bonus",
      userId: "user-owner",
      role: "owner",
      pointClass: "earned",
      eventType: "campaign",
      sourceType: "campaign_credit",
      sourceId: "campaign-owner-bonus",
      pointsDelta: 80,
      inAppValue: 8,
      cashValue: 5.6,
      status: "unlocked",
      createdAt: "2026-03-24T12:00:00-04:00",
      unlockedAt: "2026-03-24T12:00:00-04:00",
      expiresAt: null,
      reversedAt: null,
      metadata: {
        campaignId: "campaign-owner-bonus",
        locationId: "loc-ybor"
      }
    });

    const firstRequest = createCashoutRequestInState(seededState, {
      userId: "user-owner",
      role: "owner",
      requestedPoints: 100
    });

    expect(() => createCashoutRequestInState(firstRequest.state, {
      userId: "user-owner",
      role: "owner",
      requestedPoints: 50
    })).toThrow(/open BVR Points cash-out request/i);
  });

  it("reverses previously issued points when an appointment is cancelled or refunded", () => {
    const awarded = awardPointsForEventInState(buildSyntheticPointsState(), {
      userId: "user-client",
      role: "client",
      eventType: "booking",
      sourceType: "appointment",
      sourceId: "appt-points-reversal",
      basePoints: 8,
      orderTotal: 75,
      platformFeeAmount: 10,
      paymentSettled: true,
      serviceCompleted: true,
      refundState: "clean",
      phoneValidated: true,
      metadata: {
        appointmentId: "appt-points-reversal"
      }
    });
    const reversed = reversePointsForAppointmentInState(awarded.state, {
      appointmentId: "appt-points-reversal",
      reason: "payment_refund"
    });

    const original = reversed.transactions.find((transaction) => transaction.id === awarded.transaction?.id);
    const reversal = reversed.transactions.find((transaction) => transaction.sourceType === "refund" && transaction.metadata.reason === "payment_refund");

    expect(original?.status).toBe("reversed");
    expect(reversal?.pointsDelta).toBeLessThan(0);
  });

  it("builds owner analytics with event mix, liability, and reversal visibility", async () => {
    const summary = await buildOwnerPointsAnalyticsSummary({
      grossRevenue: 1200,
      referralCompleted: 4,
      referralCredited: 2
    });

    expect(summary.pointLiabilityPoints).toBeGreaterThan(0);
    expect(summary.pointLiabilityValue).toBeGreaterThan(0);
    expect(summary.issuanceByEventType.some((entry) => entry.eventType === "referral")).toBe(true);
    expect(summary.fraudReviewRate).toBeGreaterThanOrEqual(0);
    expect(summary.reversalRate).toBeGreaterThanOrEqual(0);
  });
});
