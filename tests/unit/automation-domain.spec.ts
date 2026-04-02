import { describe, expect, it } from "vitest";
import { buildClientAutomationPlan, buildOwnerAutomationSummary, resolveAutomationExecutionResolution } from "@/lib/automation/domain";
import type { AutomationRunRecord, ClientIntelligenceSnapshotRecord, ClientRewardOption } from "@/types/engagement";

function createRewards(pointsBalance: number): ClientRewardOption[] {
  return [
    { id: "reward-add-on", title: "Premium add-on credit", pointsRequired: 120, unlocked: pointsBalance >= 120 },
    { id: "reward-discount", title: "15 dollars off your next visit", pointsRequired: 180, unlocked: pointsBalance >= 180 },
    { id: "reward-vip", title: "VIP early-booking access", pointsRequired: 260, unlocked: pointsBalance >= 260 }
  ];
}

function baseIntelligence(overrides: Partial<ClientIntelligenceSnapshotRecord> = {}): ClientIntelligenceSnapshotRecord {
  return {
    clientId: "client-jordan",
    favoriteBarberId: "barber-wave",
    favoriteLocationId: "loc-ybor",
    primaryServiceId: "srv-signature",
    lastCompletedAt: "2026-03-01T15:00:00.000Z",
    nextDueAt: "2026-03-15T15:00:00.000Z",
    averageCycleDays: 14,
    completedVisitCount: 4,
    repeatVisitCount: 3,
    activeAppointmentCount: 0,
    rebookingWindow: "due_soon",
    churnRisk: "medium",
    churnScore: 58,
    reengagementEligible: true,
    loyaltySegment: "loyal",
    nextBestAction: "Reserve your next chair in the next few days.",
    explanation: "Cadence and loyalty history say the next visit window is opening.",
    recommendationReasons: ["Cadence signal", "Preferred barber"],
    recommendedBarberId: "barber-wave",
    recommendedLocationId: "loc-ybor",
    recommendedServiceId: "srv-signature",
    updatedAt: "2026-03-13T12:00:00.000Z",
    ...overrides
  };
}

describe("phase 17 automation domain", () => {
  it("derives rebooking, promotion, and reward drafts from deterministic client signals", () => {
    const plan = buildClientAutomationPlan({
      clientId: "client-jordan",
      clientEmail: "client@bvrb3r.demo",
      locationId: "loc-ybor",
      barberId: "barber-wave",
      intelligence: baseIntelligence(),
      rebookingRecommendation: {
        id: "recommendation-1",
        clientId: "client-jordan",
        barberId: "barber-wave",
        serviceId: "srv-signature",
        message: "Wave still has a clean opening this week.",
        remindAt: "2026-03-14T09:00:00.000Z",
        status: "queued",
        reason: "High-confidence cadence",
        createdAt: "2026-03-13T08:00:00.000Z"
      },
      pointsBalance: 168,
      rewards: createRewards(168),
      recommendedPromotion: {
        id: "promotion-1",
        name: "Spring refresh",
        code: "SPRING15",
        shopId: "loc-ybor",
        serviceId: "srv-signature",
        barberId: "barber-wave",
        discountLabel: "15% off"
      }
    });

    expect(plan.trigger.rebookingReminderEligible).toBe(true);
    expect(plan.trigger.promotionFollowUpEligible).toBe(true);
    expect(plan.trigger.rewardFollowUpEligible).toBe(true);
    expect(plan.drafts.map((draft) => draft.automationType)).toEqual(
      expect.arrayContaining([
        "promotion_follow_up",
        "rebooking_reminder",
        "reward_follow_up"
      ])
    );
  });

  it("suppresses client-facing automation drafts when an active appointment already exists", () => {
    const plan = buildClientAutomationPlan({
      clientId: "client-jordan",
      clientEmail: "client@bvrb3r.demo",
      locationId: "loc-ybor",
      barberId: "barber-wave",
      intelligence: baseIntelligence({
        activeAppointmentCount: 1,
        rebookingWindow: "scheduled",
        reengagementEligible: false
      }),
      rebookingRecommendation: null,
      pointsBalance: 260,
      rewards: createRewards(260),
      recommendedPromotion: null
    });

    expect(plan.trigger.rebookingReminderEligible).toBe(false);
    expect(plan.trigger.reengagementNudgeEligible).toBe(false);
    expect(plan.trigger.rewardFollowUpEligible).toBe(false);
    expect(plan.drafts).toHaveLength(0);
  });

  it("builds owner automation visibility with due, failed, and eligible counts", () => {
    const now = "2026-03-13T12:00:00.000Z";
    const runs: AutomationRunRecord[] = [
      {
        id: "run-1",
        automationType: "rebooking_reminder",
        status: "pending",
        clientId: "client-jordan",
        clientEmail: "client@bvrb3r.demo",
        locationId: "loc-ybor",
        barberId: "barber-wave",
        title: "Rebook now",
        body: "Lock your next cut.",
        channel: "in_app",
        dueAt: "2026-03-10T12:00:00.000Z",
        dedupeKey: "rebooking:1",
        payload: {},
        attemptCount: 0,
        maxAttempts: 3,
        retryEligible: false,
        terminalFailure: false,
        notificationIds: [],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "run-2",
        automationType: "promotion_follow_up",
        status: "failed",
        clientId: "client-ava",
        clientEmail: "ava@example.com",
        locationId: "loc-hyde",
        barberId: "barber-luxe",
        promotionId: "promotion-1",
        title: "Use your offer",
        body: "A valid offer is live.",
        channel: "in_app",
        dueAt: "2026-03-12T12:00:00.000Z",
        dedupeKey: "promotion:1",
        payload: {},
        attemptCount: 1,
        maxAttempts: 3,
        retryEligible: false,
        terminalFailure: true,
        notificationIds: [],
        createdAt: now,
        updatedAt: now,
        failedAt: now,
        errorMessage: "Delivery provider unavailable."
      }
    ];

    const summary = buildOwnerAutomationSummary([
      {
        clientId: "client-jordan",
        clientEmail: "client@bvrb3r.demo",
        locationId: "loc-ybor",
        barberId: "barber-wave",
        rebookingWindow: "due_now",
        churnRisk: "medium",
        churnScore: 55,
        reengagementEligible: true,
        loyaltySegment: "loyal",
        activeAppointmentCount: 0,
        nextDueAt: now,
        rebookingReminderEligible: true,
        reengagementNudgeEligible: true,
        promotionFollowUpEligible: false,
        rewardFollowUpEligible: true,
        nextAutomationDueAt: now,
        automationReasons: {},
        updatedAt: now
      }
    ], runs);

    expect(summary.pendingRuns).toBe(1);
    expect(summary.failedRuns).toBe(1);
    expect(summary.retryScheduledRuns).toBe(0);
    expect(summary.blockedRuns).toBe(0);
    expect(summary.rebookingReminderEligible).toBe(1);
    expect(summary.rewardEligible).toBe(1);
    expect(summary.topPendingClients[0]?.clientId).toBe("client-jordan");
  });

  it("classifies retryable delivery outcomes without marking them terminal", () => {
    const resolution = resolveAutomationExecutionResolution({
      now: "2026-03-13T12:00:00.000Z",
      attemptCount: 1,
      maxAttempts: 3,
      triggerSource: "background",
      primaryDeliveryStatus: "failed",
      errorMessage: "Provider timeout."
    });

    expect(resolution.status).toBe("retry_scheduled");
    expect(resolution.retryEligible).toBe(true);
    expect(resolution.terminalFailure).toBe(false);
    expect(resolution.lastFailureKind).toBe("transient");
  });

  it("classifies placeholder delivery outcomes as blocked instead of terminal failure", () => {
    const resolution = resolveAutomationExecutionResolution({
      now: "2026-03-13T12:00:00.000Z",
      attemptCount: 1,
      maxAttempts: 3,
      triggerSource: "manual",
      primaryDeliveryStatus: "placeholder",
      blockedReason: "Push bridge is not configured."
    });

    expect(resolution.status).toBe("blocked");
    expect(resolution.retryEligible).toBe(false);
    expect(resolution.blockedReason).toContain("Push bridge");
    expect(resolution.lastFailureKind).toBe("blocked");
  });
});
