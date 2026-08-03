import { describe, expect, it } from "vitest";
import { buildRoadSnapshot, type RoadBadgeRow } from "@/lib/road/domain";
import {
  buildRoadHomeSummary,
  ROAD_HOME_SET_COMPLETE_HIDE_MS
} from "@/lib/road/home-summary";

const earnedBadge = (earnedAt: string): RoadBadgeRow => ({
  id: "00000000-0000-4000-8000-000000000032",
  setIndex: 0,
  badgeKey: "client.set_0",
  earnedAt,
  sharedAt: null,
  sharePostId: null
});

describe("Product PR32 Road home summary", () => {
  it("derives the current set and counts only server-owned progress", () => {
    const snapshot = buildRoadSnapshot({
      role: "client_user",
      serverTruth: "connected",
      progress: [{
        achievementKey: "client.account_created",
        setIndex: 0,
        completedAt: "2026-08-03T12:00:00.000Z",
        sourceEventId: "00000000-0000-4000-8000-000000000033"
      }]
    });

    const summary = buildRoadHomeSummary(snapshot, new Date("2026-08-03T13:00:00.000Z"));

    expect(summary.currentSet).toMatchObject({
      index: 0,
      code: "SET 0",
      name: "The Door",
      completedAchievements: 1,
      totalAchievements: 4
    });
    expect(summary.completedAchievements).toBe(1);
    expect(summary.totalAchievements).toBe(25);
    expect(summary.percent).toBe(4);
    expect(summary.nextAchievement).toBe("Verify contact");
    expect(summary.hidden).toBe(false);
  });

  it("hides for exactly the first 24 hours after a verified set badge", () => {
    const earnedAt = "2026-08-03T12:00:00.000Z";
    const snapshot = buildRoadSnapshot({
      role: "client_user",
      serverTruth: "connected",
      badges: [earnedBadge(earnedAt)]
    });

    const justBefore = buildRoadHomeSummary(
      snapshot,
      new Date(new Date(earnedAt).getTime() + ROAD_HOME_SET_COMPLETE_HIDE_MS - 1)
    );
    const atBoundary = buildRoadHomeSummary(
      snapshot,
      new Date(new Date(earnedAt).getTime() + ROAD_HOME_SET_COMPLETE_HIDE_MS)
    );

    expect(justBefore.hidden).toBe(true);
    expect(justBefore.hiddenUntil).toBe("2026-08-04T12:00:00.000Z");
    expect(atBoundary.hidden).toBe(false);
    expect(atBoundary.hiddenUntil).toBeNull();
    expect(atBoundary.currentSet.name).toBe("First Cut");
  });

  it("never hides for invalid or future badge timestamps", () => {
    const invalid = buildRoadSnapshot({
      role: "client_user",
      serverTruth: "connected",
      badges: [earnedBadge("not-a-time")]
    });
    const future = buildRoadSnapshot({
      role: "client_user",
      serverTruth: "connected",
      badges: [earnedBadge("2026-08-05T12:00:00.000Z")]
    });

    expect(buildRoadHomeSummary(invalid, new Date("2026-08-03T12:00:00.000Z")).hidden).toBe(false);
    expect(buildRoadHomeSummary(future, new Date("2026-08-03T12:00:00.000Z")).hidden).toBe(false);
  });
});
