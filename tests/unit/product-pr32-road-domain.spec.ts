import { describe, expect, it } from "vitest";
import { ROAD_DEFINITIONS } from "@/lib/road/catalog";
import { buildRoadSnapshot, type RoadBadgeRow } from "@/lib/road/domain";

const badge = (setIndex: number): RoadBadgeRow => ({
  id: `00000000-0000-4000-8000-00000000000${setIndex}`,
  setIndex,
  badgeKey: `client.set_${setIndex}`,
  earnedAt: `2026-08-0${setIndex + 1}T12:00:00.000Z`,
  sharedAt: null,
  sharePostId: null
});

describe("Product PR32 Road domain", () => {
  it("keeps every role on the five-set canonical road without placeholder progress", () => {
    expect(ROAD_DEFINITIONS.client_user.sets).toHaveLength(5);
    expect(ROAD_DEFINITIONS.barber_user.sets).toHaveLength(5);
    expect(ROAD_DEFINITIONS.shop_owner_user.sets).toHaveLength(5);

    const client = buildRoadSnapshot({ role: "client_user", serverTruth: "unavailable" });
    const barber = buildRoadSnapshot({ role: "barber_user", serverTruth: "unavailable" });
    const owner = buildRoadSnapshot({ role: "shop_owner_user", serverTruth: "unavailable" });

    expect(client.totalAchievements).toBe(25);
    expect(barber.totalAchievements).toBe(24);
    expect(owner.totalAchievements).toBe(21);
    expect(client.completedAchievements).toBe(0);
    expect(client.percent).toBe(0);
    expect(client.sets[1].locked).toBe(true);
  });

  it("opens set N only from the immutable badge for set N-1", () => {
    const withoutBadge = buildRoadSnapshot({
      role: "client_user",
      serverTruth: "connected",
      progress: [{
        achievementKey: "client.profile_completed",
        setIndex: 1,
        completedAt: "2026-08-03T12:00:00.000Z",
        sourceEventId: "00000000-0000-4000-8000-000000000099"
      }]
    });
    expect(withoutBadge.sets[1].locked).toBe(true);

    const withBadge = buildRoadSnapshot({
      role: "client_user",
      serverTruth: "connected",
      badges: [badge(0)]
    });
    expect(withBadge.currentSet).toBe(1);
    expect(withBadge.sets[1].locked).toBe(false);
    expect(withBadge.sets[1].active).toBe(true);
    expect(withBadge.sets[2].locked).toBe(true);
  });

  it("counts referrals only when counted_at exists and keeps rewards platform-funded", () => {
    const snapshot = buildRoadSnapshot({
      role: "barber_user",
      serverTruth: "connected",
      referrals: [
        { code: "BVR-0123456789AB", referredUserId: null, countedAt: null },
        { code: "BVR-0123456789AB", referredUserId: "friend-1", countedAt: null },
        { code: "BVR-0123456789AB", referredUserId: "friend-2", countedAt: "2026-08-03T12:00:00.000Z" }
      ]
    });

    expect(snapshot.referral.code).toBe("BVR-0123456789AB");
    expect(snapshot.referral.counted).toBe(1);
    expect(snapshot.referral.ladder[0].reward).toContain("platform-funded");
  });

  it("keeps the friends leaderboard and leaderboard pushes off by default", () => {
    const hidden = buildRoadSnapshot({
      role: "shop_owner_user",
      serverTruth: "connected",
      leaderboardRows: [{
        userId: "viewer",
        displayName: "Viewer",
        username: null,
        completedAchievements: 3,
        totalAchievements: 21,
        percent: 14,
        earnedBadges: 1,
        currentSet: 1,
        isViewer: true
      }]
    });
    expect(hidden.leaderboard.optedIn).toBe(false);
    expect(hidden.leaderboard.pushesEnabled).toBe(false);
    expect(hidden.leaderboard.rows).toEqual([]);

    const visible = buildRoadSnapshot({
      role: "shop_owner_user",
      serverTruth: "connected",
      leaderboardOptedIn: true,
      leaderboardRows: [{
        userId: "viewer",
        displayName: "Viewer",
        username: null,
        completedAchievements: 3,
        totalAchievements: 21,
        percent: 14,
        earnedBadges: 1,
        currentSet: 1,
        isViewer: true
      }]
    });
    expect(visible.leaderboard.rows).toHaveLength(1);
  });

  it("shows client-only shield truth without inventing a timeline", () => {
    const client = buildRoadSnapshot({
      role: "client_user",
      serverTruth: "connected",
      streakShields: [
        { id: "shield-1", earnedAt: "2026-07-01T00:00:00.000Z", spentAt: null },
        { id: "shield-2", earnedAt: "2026-07-08T00:00:00.000Z", spentAt: "2026-07-22T00:00:00.000Z" }
      ],
      streakWindows: [{ windowStart: "2026-07-21", status: "protected" }]
    });
    expect(client.streak?.availableShields).toBe(1);
    expect(client.streak?.windows).toEqual([{ windowStart: "2026-07-21", status: "protected" }]);

    const barber = buildRoadSnapshot({ role: "barber_user", serverTruth: "connected" });
    expect(barber.streak).toBeNull();
  });
});
