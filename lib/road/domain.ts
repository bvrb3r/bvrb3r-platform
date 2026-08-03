import {
  getRoadDefinition,
  ROAD_PUSH_PREVIEWS,
  ROAD_REFERRAL_LADDERS,
  type RoadRole
} from "@/lib/road/catalog";

export type RoadProgressRow = {
  achievementKey: string;
  setIndex: number;
  completedAt: string;
  sourceEventId: string;
};

export type RoadBadgeRow = {
  id: string;
  setIndex: number;
  badgeKey: string;
  earnedAt: string;
  sharedAt: string | null;
  sharePostId: string | null;
};

export type RoadReferralRow = {
  code: string;
  referredUserId: string | null;
  countedAt: string | null;
};

export type RoadLeaderboardRow = {
  userId: string;
  displayName: string;
  username: string | null;
  completedAchievements: number;
  totalAchievements: number;
  percent: number;
  earnedBadges: number;
  currentSet: number;
  isViewer: boolean;
};

export type RoadStreakShield = {
  id: string;
  earnedAt: string;
  spentAt: string | null;
};

export type RoadStreakWindow = {
  windowStart: string;
  status: "completed" | "protected" | "missed";
};

export type RoadSetSnapshot = {
  index: number;
  code: string;
  name: string;
  subtitle: string;
  unlocks: string;
  badgeName: string;
  badgeReward: string;
  locked: boolean;
  complete: boolean;
  active: boolean;
  completedCount: number;
  totalCount: number;
  achievements: Array<{
    key: string;
    label: string;
    detail: string;
    complete: boolean;
    completedAt: string | null;
    sourceEventId: string | null;
  }>;
  badge: RoadBadgeRow | null;
};

export type RoadSnapshot = {
  role: RoadRole;
  title: string;
  subtitle: string;
  summit: string;
  serverTruth: "connected" | "unavailable";
  currentSet: number;
  completedAchievements: number;
  totalAchievements: number;
  percent: number;
  sets: RoadSetSnapshot[];
  latestBadge: RoadBadgeRow | null;
  referral: {
    code: string | null;
    counted: number;
    trigger: string;
    ladder: readonly { count: number; reward: string }[];
  };
  leaderboard: {
    optedIn: boolean;
    pushesEnabled: boolean;
    rows: RoadLeaderboardRow[];
  };
  streak: {
    availableShields: number;
    shields: RoadStreakShield[];
    windows: RoadStreakWindow[];
  } | null;
  pushes: readonly { key: string; title: string; body: string; rule: string }[];
};

type BuildRoadSnapshotInput = {
  role: RoadRole;
  serverTruth: RoadSnapshot["serverTruth"];
  progress?: RoadProgressRow[];
  badges?: RoadBadgeRow[];
  referrals?: RoadReferralRow[];
  leaderboardOptedIn?: boolean;
  leaderboardPushesEnabled?: boolean;
  leaderboardRows?: RoadLeaderboardRow[];
  streakShields?: RoadStreakShield[];
  streakWindows?: RoadStreakWindow[];
};

function referralTrigger(role: RoadRole) {
  if (role === "client_user") {
    return "They join with your code and finish SET 1 · First Cut — that’s when it counts.";
  }
  if (role === "barber_user") {
    return "They join with your code and finish SET 1 · Verified — that’s when it counts.";
  }
  return "Their shop joins with your code and finishes SET 1 · Verified Shop — that’s when it counts.";
}

export function buildRoadSnapshot(input: BuildRoadSnapshotInput): RoadSnapshot {
  const definition = getRoadDefinition(input.role);
  const progressByKey = new Map((input.progress ?? []).map((row) => [row.achievementKey, row]));
  const badgeBySet = new Map((input.badges ?? []).map((row) => [row.setIndex, row]));

  const firstIncompleteIndex = definition.sets.findIndex((set) => !badgeBySet.has(set.index));
  const currentSet = firstIncompleteIndex === -1 ? definition.sets.length - 1 : firstIncompleteIndex;

  let completedAchievements = 0;
  let totalAchievements = 0;
  const sets = definition.sets.map((set) => {
    const badge = badgeBySet.get(set.index) ?? null;
    const locked = set.index > 0 && !badgeBySet.has(set.index - 1);
    const achievements = set.achievements.map((entry) => {
      const completion = progressByKey.get(entry.key) ?? null;
      totalAchievements += 1;
      if (completion) {
        completedAchievements += 1;
      }
      return {
        ...entry,
        complete: Boolean(completion),
        completedAt: completion?.completedAt ?? null,
        sourceEventId: completion?.sourceEventId ?? null
      };
    });

    return {
      ...set,
      locked,
      complete: Boolean(badge),
      active: set.index === currentSet,
      completedCount: achievements.filter((entry) => entry.complete).length,
      totalCount: achievements.length,
      achievements,
      badge
    };
  });

  const badges = input.badges ?? [];
  const latestBadge = badges.reduce<RoadBadgeRow | null>((latest, badge) => {
    if (!latest || new Date(badge.earnedAt).getTime() > new Date(latest.earnedAt).getTime()) {
      return badge;
    }
    return latest;
  }, null);
  const referrals = input.referrals ?? [];
  const code = referrals.find((row) => row.code.trim().length > 0)?.code ?? null;

  return {
    role: input.role,
    title: definition.title,
    subtitle: definition.subtitle,
    summit: definition.summit,
    serverTruth: input.serverTruth,
    currentSet,
    completedAchievements,
    totalAchievements,
    percent: totalAchievements === 0 ? 0 : Math.round((completedAchievements / totalAchievements) * 100),
    sets,
    latestBadge,
    referral: {
      code,
      counted: referrals.filter((row) => Boolean(row.countedAt)).length,
      trigger: referralTrigger(input.role),
      ladder: ROAD_REFERRAL_LADDERS[input.role]
    },
    leaderboard: {
      optedIn: input.leaderboardOptedIn === true,
      pushesEnabled: input.leaderboardPushesEnabled === true,
      rows: input.leaderboardOptedIn === true ? (input.leaderboardRows ?? []) : []
    },
    streak: input.role === "client_user"
      ? {
          availableShields: (input.streakShields ?? []).filter((shield) => !shield.spentAt).length,
          shields: input.streakShields ?? [],
          windows: input.streakWindows ?? []
        }
      : null,
    pushes: ROAD_PUSH_PREVIEWS[input.role]
  };
}
