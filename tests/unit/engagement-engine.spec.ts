import { describe, expect, it } from "vitest";
import {
  EngagementPermissionError,
  createInitialEngagementState,
  followBarber,
  getBarberEngagementSummary,
  getClientEngagementSummary,
  getOwnerIntelligenceSummary,
  processCompletedBookingGrowth,
  recordEngagementEvent,
  recordReferralBooking,
  syncReferralAttribution
} from "@/lib/engagement/engine";
import { createInitialLiveOperationsSnapshot } from "@/lib/operations/live-state";

describe("engagement engine", () => {
  it("creates barber follows and queues a notification hook", () => {
    const state = createInitialEngagementState();
    const result = followBarber(state, {
      role: "client",
      clientId: "client-jordan",
      userEmail: "client@bvrb3r.demo",
      locationIds: ["loc-ybor"]
    }, {
      barberId: "barber-fade",
      notifyOnAvailability: true,
      notifyOnPortfolio: true
    });

    expect(result.follow.barberId).toBe("barber-fade");
    expect(result.state.barberFollows.some((follow) => follow.clientId === "client-jordan" && follow.barberId === "barber-fade")).toBe(true);
    expect(result.notification.type).toBe("new_follower");
  });

  it("allows a validated production public barber reference to be followed", () => {
    const state = createInitialEngagementState();
    const result = followBarber(state, {
      role: "client_user",
      clientId: "client-jordan",
      userEmail: "client@bvrb3r.demo",
      locationIds: []
    }, {
      barberId: "barber-43b3cda2",
      notifyOnAvailability: true,
      notifyOnPortfolio: true
    });

    expect(result.follow.barberId).toBe("barber-43b3cda2");
    expect(result.state.barberFollows.some((follow) => follow.clientId === "client-jordan" && follow.barberId === "barber-43b3cda2")).toBe(true);
    expect(result.notification.type).toBe("new_follower");
  });

  it("awards loyalty points for a barber review event", () => {
    const state = createInitialEngagementState();
    const result = recordEngagementEvent(state, {
      role: "client",
      clientId: "client-jordan",
      userEmail: "client@bvrb3r.demo",
      locationIds: ["loc-ybor"]
    }, {
      eventType: "barber_reviewed",
      targetType: "barber",
      targetId: "barber-wave",
      metadata: { rating: 5 }
    });

    const account = result.state.loyaltyAccounts.find((entry) => entry.clientId === "client-jordan");
    expect(account?.pointsBalance).toBeGreaterThan(state.loyaltyAccounts.find((entry) => entry.clientId === "client-jordan")?.pointsBalance ?? 0);
    expect(result.state.notifications.some((notification) => notification.type === "review_alert" && notification.barberId === "barber-wave")).toBe(true);
  });

  it("redeems the selected reward using its actual point requirement", () => {
    const state = createInitialEngagementState();
    const before = state.loyaltyAccounts.find((entry) => entry.clientId === "client-jordan")?.pointsBalance ?? 0;

    const result = recordEngagementEvent(state, {
      role: "client",
      clientId: "client-jordan",
      userEmail: "client@bvrb3r.demo",
      locationIds: ["loc-ybor"]
    }, {
      eventType: "reward_redeemed",
      targetType: "client",
      targetId: "client-jordan",
      metadata: {
        rewardId: "reward-add-on"
      }
    });

    const account = result.state.loyaltyAccounts.find((entry) => entry.clientId === "client-jordan");
    expect(account?.pointsBalance).toBe(before - 120);
    expect(result.state.notifications.some((notification) => notification.type === "reward_follow_up")).toBe(true);
  });

  it("blocks reward redemption when the client has not earned enough points", () => {
    const state = createInitialEngagementState();
    state.loyaltyAccounts = state.loyaltyAccounts.map((account) =>
      account.clientId === "client-jordan"
        ? { ...account, pointsBalance: 20 }
        : account
    );

    expect(() => recordEngagementEvent(state, {
      role: "client",
      clientId: "client-jordan",
      userEmail: "client@bvrb3r.demo",
      locationIds: ["loc-ybor"]
    }, {
      eventType: "reward_redeemed",
      targetType: "client",
      targetId: "client-jordan",
      metadata: {
        rewardId: "reward-add-on"
      }
    })).toThrow(/enough points/i);
  });

  it("blocks disallowed engagement events by role", () => {
    const state = createInitialEngagementState();

    expect(() => recordEngagementEvent(state, {
      role: "client",
      clientId: "client-jordan",
      userEmail: "client@bvrb3r.demo"
    }, {
      eventType: "payout_released",
      targetType: "barber",
      targetId: "barber-wave"
    })).toThrow(EngagementPermissionError);
  });

  it("builds the client engagement summary with rebooking and rewards", () => {
    const snapshot = createInitialLiveOperationsSnapshot();
    const summary = getClientEngagementSummary(createInitialEngagementState(), snapshot, "client-jordan");

    expect(summary.rebookingRecommendation).not.toBeNull();
    expect(summary.intelligence.rebookingWindow).toBeDefined();
    expect(summary.recommendedBarbers.length).toBeGreaterThan(0);
    expect(summary.followedBarbers.length).toBeGreaterThan(0);
    expect(summary.rewards.some((reward) => reward.unlocked)).toBe(true);
  });

  it("builds the barber engagement summary with earnings and growth recommendations", () => {
    const snapshot = createInitialLiveOperationsSnapshot();
    const summary = getBarberEngagementSummary(createInitialEngagementState(), snapshot, "barber-wave");

    expect(summary.earnings.today).toBeGreaterThanOrEqual(0);
    expect(summary.clientInsights.topReturningClients).toBeDefined();
    expect(summary.clientInsights.returningClientsNeedingAttention).toBeGreaterThanOrEqual(0);
    expect(summary.rankings.length).toBeGreaterThan(0);
    expect(summary.growthRecommendations.length).toBeGreaterThan(0);
  });

  it("builds owner intelligence with loyalty and referral signals", () => {
    const snapshot = createInitialLiveOperationsSnapshot();
    const summary = getOwnerIntelligenceSummary(createInitialEngagementState(), snapshot, ["loc-ybor", "loc-hyde"]);

    expect(summary.retention.loyaltyParticipants).toBeGreaterThan(0);
    expect(summary.retention.rebookingOpportunities).toBeGreaterThanOrEqual(0);
    expect(summary.topReturningClients.length).toBeGreaterThan(0);
    expect(summary.retention.referralConversions).toBeGreaterThan(0);
    expect(summary.topBarbers.length).toBeGreaterThan(0);
  });

  it("advances referral attribution through sign-up, booking, completion, and credit without duplicate rewards", () => {
    const initial = createInitialEngagementState();
    const signedUp = syncReferralAttribution(initial, {
      referralCode: "JORDANVIP",
      referredClientId: "client-phase23-referral",
      referredClientEmail: "phase23-referral@example.com"
    });

    expect(signedUp.referralEvent?.status).toBe("signed_up");

    const booked = recordReferralBooking(signedUp.state, {
      clientId: "client-phase23-referral",
      appointmentId: "appt-phase23-referral"
    });

    expect(booked.referralEvent?.status).toBe("booked");

    const completed = processCompletedBookingGrowth(booked.state, {
      clientId: "client-phase23-referral",
      appointmentId: "appt-phase23-referral",
      completedAt: "2026-03-25T10:00:00-04:00",
      completedBookingHistory: [
        {
          appointmentId: "appt-phase23-referral",
          completedAt: "2026-03-25T10:00:00-04:00"
        }
      ],
      activeMembership: false
    });

    const creditedEvent = completed.state.referralEvents.find((event) => event.referredClientId === "client-phase23-referral");
    const creditReference = creditedEvent ? `referral-credit:${creditedEvent.id}` : "";
    const referralCredits = completed.state.loyaltyTransactions.filter((transaction) => transaction.referenceId === creditReference);

    expect(creditedEvent?.status).toBe("credited");
    expect(creditedEvent?.creditedTransactionId).toBeTruthy();
    expect(referralCredits).toHaveLength(1);
    expect(referralCredits[0]?.clientId).toBe("client-jordan");
    expect(completed.state.notifications.some((notification) => notification.type === "referral_reward" && notification.clientId === "client-jordan")).toBe(true);
    expect(completed.state.notifications.some((notification) => notification.type === "referral_prompt" && notification.clientId === "client-phase23-referral")).toBe(true);

    const repeated = processCompletedBookingGrowth(completed.state, {
      clientId: "client-phase23-referral",
      appointmentId: "appt-phase23-referral",
      completedAt: "2026-03-25T10:00:00-04:00",
      completedBookingHistory: [
        {
          appointmentId: "appt-phase23-referral",
          completedAt: "2026-03-25T10:00:00-04:00"
        }
      ],
      activeMembership: false
    });

    expect(repeated.state.loyaltyTransactions.filter((transaction) => transaction.referenceId === creditReference)).toHaveLength(1);
  });

  it("issues behavior-based loyalty bonuses for repeat, comeback, and active-member completions", () => {
    const initial = createInitialEngagementState();
    const beforeBalance = initial.loyaltyAccounts.find((entry) => entry.clientId === "client-jordan")?.pointsBalance ?? 0;

    const completed = processCompletedBookingGrowth(initial, {
      clientId: "client-jordan",
      appointmentId: "appt-phase23-member",
      completedAt: "2026-03-25T10:00:00-04:00",
      completedBookingHistory: [
        {
          appointmentId: "appt-older-1",
          completedAt: "2026-01-05T10:00:00-05:00"
        },
        {
          appointmentId: "appt-older-2",
          completedAt: "2026-02-01T10:00:00-05:00"
        },
        {
          appointmentId: "appt-phase23-member",
          completedAt: "2026-03-25T10:00:00-04:00"
        }
      ],
      activeMembership: true
    });

    const afterBalance = completed.state.loyaltyAccounts.find((entry) => entry.clientId === "client-jordan")?.pointsBalance ?? 0;
    const ruleReferences = completed.state.loyaltyTransactions
      .filter((transaction) =>
        transaction.referenceId === "appt-phase23-member:repeat_third_visit_bonus"
        || transaction.referenceId === "appt-phase23-member:comeback_bonus"
        || transaction.referenceId === "appt-phase23-member:member_completion_bonus"
      );

    expect(afterBalance - beforeBalance).toBe(110);
    expect(ruleReferences).toHaveLength(3);
    expect(ruleReferences.every((transaction) => transaction.reason === "behavior_reward")).toBe(true);
    expect(completed.state.notifications.filter((notification) => notification.type === "loyalty_milestone" && notification.clientId === "client-jordan").length).toBeGreaterThan(0);
  });
});
