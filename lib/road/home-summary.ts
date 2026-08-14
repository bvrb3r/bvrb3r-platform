import type { RoadSnapshot } from "@/lib/road/domain";
import type { RoadSetupStatus } from "@/lib/road/setup";

export const ROAD_HOME_SET_COMPLETE_HIDE_MS = 24 * 60 * 60 * 1000;

export type RoadHomeSummary = {
  role: RoadSnapshot["role"];
  serverTruth: RoadSnapshot["serverTruth"];
  currentSet: {
    index: number;
    code: string;
    name: string;
    completedAchievements: number;
    totalAchievements: number;
  };
  nextAchievement: string | null;
  setupReady: boolean;
  currentAttention: {
    label: string;
    status: RoadSetupStatus;
    reason: string | null;
  } | null;
  completedAchievements: number;
  totalAchievements: number;
  percent: number;
  summit: string;
  hidden: boolean;
  hiddenUntil: string | null;
};

export function buildRoadHomeSummary(
  snapshot: RoadSnapshot,
  now = new Date()
): RoadHomeSummary {
  const current = snapshot.sets[snapshot.currentSet] ?? snapshot.sets[0];
  const attention = current?.achievements.find((achievement) => (
    achievement.setupStatus === "action_required" || achievement.setupStatus === "pending_review"
  )) ?? null;
  const nextAchievement = attention?.label
    ?? current?.achievements.find((achievement) => !achievement.complete)?.label
    ?? null;
  const earnedAt = snapshot.latestBadge ? new Date(snapshot.latestBadge.earnedAt).getTime() : Number.NaN;
  const nowTime = now.getTime();
  const hidden = !attention
    && Number.isFinite(earnedAt)
    && earnedAt <= nowTime
    && nowTime - earnedAt < ROAD_HOME_SET_COMPLETE_HIDE_MS;
  const hiddenUntil = hidden
    ? new Date(earnedAt + ROAD_HOME_SET_COMPLETE_HIDE_MS).toISOString()
    : null;

  return {
    role: snapshot.role,
    serverTruth: snapshot.serverTruth,
    currentSet: {
      index: current?.index ?? 0,
      code: current?.code ?? "SET 0",
      name: current?.name ?? "The Road",
      completedAchievements: current?.completedCount ?? 0,
      totalAchievements: current?.totalCount ?? 0
    },
    nextAchievement,
    setupReady: !attention,
    currentAttention: attention && attention.setupStatus
      ? {
          label: attention.label,
          status: attention.setupStatus,
          reason: attention.statusReason
        }
      : null,
    completedAchievements: snapshot.completedAchievements,
    totalAchievements: snapshot.totalAchievements,
    percent: snapshot.percent,
    summit: snapshot.summit,
    hidden,
    hiddenUntil
  };
}
