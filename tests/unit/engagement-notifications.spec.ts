import { describe, expect, it } from "vitest";
import { appendEngagementNotification } from "@/lib/engagement/notifications";
import type { EngagementState } from "@/types/engagement";

function createState(): EngagementState {
  return {
    loyaltyAccounts: [],
    loyaltyTransactions: [],
    loyaltyRewardRules: [],
    referralCodes: [],
    referralEvents: [],
    barberFollows: [],
    engagementEvents: [],
    rebookingCycles: [],
    rebookingRecommendations: [],
    notificationPreferences: [],
    notifications: [],
    reputationScores: [],
    rankingSnapshots: [],
    growthRecommendations: []
  };
}

describe("engagement notifications", () => {
  it("reuses a stable notification id when the same automation dedupe seed is queued again", () => {
    const state = createState();
    const first = appendEngagementNotification(state, {
      role: "client",
      userEmail: "client@bvrb3r.demo",
      clientId: "client-jordan",
      type: "rebooking_reminder",
      title: "Time to rebook",
      body: "Lock your next cut.",
      channel: "in_app",
      dedupeSeed: "automation:run-1",
      createdAt: "2026-03-13T12:00:00.000Z"
    });
    const second = appendEngagementNotification(first.state, {
      role: "client",
      userEmail: "client@bvrb3r.demo",
      clientId: "client-jordan",
      type: "rebooking_reminder",
      title: "Time to rebook",
      body: "Lock your next cut.",
      channel: "in_app",
      dedupeSeed: "automation:run-1",
      createdAt: "2026-03-13T12:05:00.000Z"
    });

    expect(first.notifications[0]?.id).toBe(second.notifications[0]?.id);
    expect(second.state.notifications).toHaveLength(1);
  });
});
