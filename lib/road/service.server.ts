import "server-only";

import { productionSupabaseTruthError, shouldRequireProductionSupabaseTruth } from "@/lib/config/runtime";
import { getRoadDefinition, isRoadRole, type RoadRole } from "@/lib/road/catalog";
import {
  buildRoadSnapshot,
  type RoadBadgeRow,
  type RoadLeaderboardRow,
  type RoadProgressRow,
  type RoadReferralRow,
  type RoadSnapshot,
  type RoadStreakShield,
  type RoadStreakWindow
} from "@/lib/road/domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRoadSetupAchievementKeys, isRoadSetupStatus, type RoadSetupCheck } from "@/lib/road/setup";
import type { UserAccount } from "@/types/domain";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type RoadServiceDependencies = {
  supabase?: AdminClient | null;
};

type RoadPreferenceRow = {
  leaderboard_visible?: unknown;
  leaderboard_pushes_enabled?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RoadServiceError extends Error {
  constructor(message: string, readonly code: string, readonly status = 500) {
    super(message);
    this.name = "RoadServiceError";
  }
}

function requireRoadRole(user: Pick<UserAccount, "role">): RoadRole {
  if (!isRoadRole(user.role)) {
    throw new RoadServiceError("The Road is available only to canonical Client, Barber, and Shop Owner accounts.", "wrong_role", 403);
  }
  return user.role;
}

function requireUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new RoadServiceError(`${label} is invalid.`, "invalid_identifier", 400);
  }
  return value;
}

function requireAdminClient(dependencies?: RoadServiceDependencies) {
  const supabase = dependencies?.supabase ?? createSupabaseAdminClient();
  if (!supabase) {
    throw new RoadServiceError("The Road requires connected Supabase server truth.", "road_truth_unavailable", 503);
  }
  return supabase;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integerValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function objectRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    : [];
}

function mapProgressRows(value: unknown): RoadProgressRow[] {
  return objectRows(value).map((row) => ({
    achievementKey: stringValue(row.achievement_key),
    setIndex: integerValue(row.set_index),
    completedAt: stringValue(row.completed_at),
    sourceEventId: stringValue(row.source_event_id)
  })).filter((row) => row.achievementKey.length > 0 && row.completedAt.length > 0);
}

function mapBadgeRows(value: unknown): RoadBadgeRow[] {
  return objectRows(value).map((row) => ({
    id: stringValue(row.id),
    setIndex: integerValue(row.set_index),
    badgeKey: stringValue(row.badge_key),
    earnedAt: stringValue(row.earned_at),
    sharedAt: nullableString(row.shared_at),
    sharePostId: nullableString(row.share_post_id)
  })).filter((row) => row.id.length > 0 && row.badgeKey.length > 0 && row.earnedAt.length > 0);
}

function mapReferralRows(value: unknown): RoadReferralRow[] {
  return objectRows(value).map((row) => ({
    code: stringValue(row.code),
    referredUserId: nullableString(row.referred_user_id),
    countedAt: nullableString(row.counted_at)
  })).filter((row) => row.code.length > 0);
}

function mapLeaderboardRows(value: unknown, viewerUserId: string): RoadLeaderboardRow[] {
  return objectRows(value).map((row) => ({
    userId: stringValue(row.user_id),
    displayName: stringValue(row.display_name, "Road friend"),
    username: nullableString(row.username),
    completedAchievements: integerValue(row.completed_achievements),
    totalAchievements: integerValue(row.total_achievements),
    percent: integerValue(row.percent),
    earnedBadges: integerValue(row.earned_badges),
    currentSet: integerValue(row.current_set),
    isViewer: row.is_viewer === true || row.user_id === viewerUserId
  })).filter((row) => row.userId.length > 0);
}

function mapShieldRows(value: unknown): RoadStreakShield[] {
  return objectRows(value).map((row) => ({
    id: stringValue(row.id),
    earnedAt: stringValue(row.earned_at),
    spentAt: nullableString(row.spent_at)
  })).filter((row) => row.id.length > 0 && row.earnedAt.length > 0);
}

function mapWindowRows(value: unknown): RoadStreakWindow[] {
  return objectRows(value).flatMap<RoadStreakWindow>((row) => {
    const status = stringValue(row.status);
    if (status !== "completed" && status !== "protected" && status !== "missed") {
      return [];
    }
    return [{
      windowStart: stringValue(row.window_start),
      status
    }];
  }).filter((row) => row.windowStart.length > 0);
}

function mapSetupChecks(value: unknown): RoadSetupCheck[] {
  return objectRows(value).flatMap<RoadSetupCheck>((row) => {
    const achievementKey = stringValue(row.achievementKey ?? row.achievement_key);
    const status = row.status;
    if (achievementKey.length === 0 || !isRoadSetupStatus(status)) {
      return [];
    }
    return [{
      achievementKey,
      status,
      reason: stringValue(row.reason, status === "complete" ? "Verified from current account records." : "Finish this account requirement."),
      observedAt: nullableString(row.observedAt ?? row.observed_at)
    }];
  });
}

function emptyRoadSnapshot(role: RoadRole): RoadSnapshot {
  return buildRoadSnapshot({ role, serverTruth: "unavailable" });
}

export async function loadRoadSnapshot(
  user: Pick<UserAccount, "id" | "role">,
  dependencies?: RoadServiceDependencies
): Promise<RoadSnapshot> {
  const role = requireRoadRole(user);
  const supabase = dependencies?.supabase ?? createSupabaseAdminClient();
  if (!supabase) {
    if (shouldRequireProductionSupabaseTruth()) {
      throw productionSupabaseTruthError("PR32 Road progression");
    }
    return emptyRoadSnapshot(role);
  }

  const userId = requireUuid(user.id, "Road account");
  const reconcileResult = await supabase.rpc("pr32_reconcile_road_setup", {
    p_user_id: userId,
    p_role: role
  });
  if (reconcileResult.error) {
    throw new RoadServiceError("Your account setup could not be verified against current canonical server records.", "road_setup_reconcile_failed", 503);
  }
  const reconcilePayload = reconcileResult.data && typeof reconcileResult.data === "object"
    ? reconcileResult.data as Record<string, unknown>
    : {};
  const setupChecks = mapSetupChecks(reconcilePayload.checks);
  const expectedSetupKeys = getRoadSetupAchievementKeys(role);
  if (
    setupChecks.length !== expectedSetupKeys.length
    || expectedSetupKeys.some((key) => !setupChecks.some((check) => check.achievementKey === key))
  ) {
    throw new RoadServiceError("Account setup verification returned incomplete evidence.", "road_setup_evidence_incomplete", 503);
  }

  const codeResult = await supabase.rpc("pr32_ensure_referral_code", {
    p_user_id: userId,
    p_role: role
  });
  if (codeResult.error) {
    throw new RoadServiceError("Your Road referral code could not be loaded.", "referral_code_failed");
  }

  const [progressResult, badgeResult, referralResult, preferenceResult, leaderboardResult, shieldResult, windowResult] = await Promise.all([
    supabase
      .from("road_progress")
      .select("achievement_key, set_index, completed_at, source_event_id")
      .eq("user_id", userId)
      .eq("role", role)
      .order("completed_at", { ascending: true }),
    supabase
      .from("badges")
      .select("id, set_index, badge_key, earned_at, shared_at, share_post_id")
      .eq("user_id", userId)
      .eq("role", role)
      .order("earned_at", { ascending: true }),
    supabase
      .from("referrals")
      .select("code, referred_user_id, counted_at")
      .eq("referrer_user_id", userId)
      .eq("referrer_role", role)
      .order("created_at", { ascending: true }),
    supabase
      .from("road_preferences")
      .select("leaderboard_visible, leaderboard_pushes_enabled")
      .eq("user_id", userId)
      .eq("role", role)
      .maybeSingle(),
    supabase.rpc("pr32_get_friend_leaderboard", {
      p_viewer_user_id: userId,
      p_role: role
    }),
    role === "client_user"
      ? supabase
          .from("road_streak_shields")
          .select("id, earned_at, spent_at")
          .eq("user_id", userId)
          .order("earned_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    role === "client_user"
      ? supabase
          .from("road_streak_windows")
          .select("window_start, status")
          .eq("user_id", userId)
          .order("window_start", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null })
  ]);

  const failedResult = [
    progressResult,
    badgeResult,
    referralResult,
    preferenceResult,
    leaderboardResult,
    shieldResult,
    windowResult
  ].find((result) => Boolean(result.error));
  if (failedResult?.error) {
    throw new RoadServiceError("The Road could not load its server-owned progress.", "road_snapshot_failed");
  }

  const preference = (preferenceResult.data ?? {}) as RoadPreferenceRow;
  return buildRoadSnapshot({
    role,
    serverTruth: "connected",
    progress: mapProgressRows(progressResult.data),
    badges: mapBadgeRows(badgeResult.data),
    referrals: mapReferralRows(referralResult.data),
    leaderboardOptedIn: preference.leaderboard_visible === true,
    leaderboardPushesEnabled: preference.leaderboard_pushes_enabled === true,
    leaderboardRows: mapLeaderboardRows(leaderboardResult.data, userId),
    streakShields: mapShieldRows(shieldResult.data),
    streakWindows: mapWindowRows(windowResult.data),
    setupChecks
  });
}

export async function updateRoadLeaderboardPrivacy(
  user: Pick<UserAccount, "id" | "role">,
  input: { visible: boolean; pushesEnabled: boolean },
  dependencies?: RoadServiceDependencies
) {
  const role = requireRoadRole(user);
  const userId = requireUuid(user.id, "Road account");
  const supabase = requireAdminClient(dependencies);
  const visible = input.visible === true;
  const result = await supabase.from("road_preferences").upsert({
    user_id: userId,
    role,
    leaderboard_visible: visible,
    leaderboard_pushes_enabled: visible && input.pushesEnabled === true,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id,role" });
  if (result.error) {
    throw new RoadServiceError("Leaderboard privacy could not be saved.", "leaderboard_privacy_failed");
  }
}

export async function recordRoadPlatformEvent(
  input: { userId: string; role: RoadRole; platformEventId: string },
  dependencies?: RoadServiceDependencies
) {
  const supabase = requireAdminClient(dependencies);
  const result = await supabase.rpc("pr32_record_road_event", {
    p_user_id: requireUuid(input.userId, "Road account"),
    p_role: input.role,
    p_event_id: requireUuid(input.platformEventId, "Platform event")
  });
  if (result.error) {
    throw new RoadServiceError("Road event evidence could not be recorded.", "road_event_failed");
  }
  return result.data;
}

export async function shareRoadBadgeToCulture(
  user: Pick<UserAccount, "id" | "role">,
  input: { badgeId: string; caption: string },
  dependencies?: RoadServiceDependencies
) {
  requireRoadRole(user);
  const userId = requireUuid(user.id, "Road account");
  const badgeId = requireUuid(input.badgeId, "Badge");
  const caption = input.caption.trim();
  if (caption.length < 1 || caption.length > 2200) {
    throw new RoadServiceError("Badge caption must be between 1 and 2,200 characters.", "invalid_badge_caption", 400);
  }

  const supabase = requireAdminClient(dependencies);
  const result = await supabase.rpc("pr32_share_badge_to_culture", {
    p_user_id: userId,
    p_badge_id: badgeId,
    p_caption: caption,
    p_media_url: `/api/road/badges/${badgeId}/share-card`
  });
  if (result.error) {
    const alreadyShared = result.error.message.toLowerCase().includes("already shared");
    throw new RoadServiceError(
      alreadyShared ? "This badge has already been shared to Culture." : "The badge could not be shared to Culture.",
      alreadyShared ? "badge_already_shared" : "badge_share_failed",
      alreadyShared ? 409 : 500
    );
  }
  return stringValue(result.data);
}

export async function loadPublicRoadBadgeCard(
  badgeId: string,
  dependencies?: RoadServiceDependencies
) {
  const supabase = requireAdminClient(dependencies);
  const normalizedBadgeId = requireUuid(badgeId, "Badge");
  const badgeResult = await supabase
    .from("badges")
    .select("id, user_id, role, set_index, badge_key, earned_at")
    .eq("id", normalizedBadgeId)
    // The share-card route is public by design, so an earned badge stays
    // private until its owner explicitly completes the one-time Culture share.
    .not("shared_at", "is", null)
    .maybeSingle();
  if (badgeResult.error) {
    throw new RoadServiceError("Badge card could not be loaded.", "badge_card_failed");
  }
  if (!badgeResult.data) {
    return null;
  }

  const badge = badgeResult.data as Record<string, unknown>;
  const role = stringValue(badge.role);
  if (!isRoadRole(role)) {
    return null;
  }
  const setIndex = integerValue(badge.set_index, -1);
  const set = getRoadDefinition(role).sets.find((entry) => entry.index === setIndex);
  if (!set || set.badgeName.length === 0) {
    return null;
  }

  const profileResult = await supabase
    .from("profiles")
    .select("full_name, public_username")
    .eq("id", stringValue(badge.user_id))
    .maybeSingle();
  if (profileResult.error) {
    throw new RoadServiceError("Badge owner could not be loaded.", "badge_owner_failed");
  }
  const profile = (profileResult.data ?? {}) as Record<string, unknown>;
  return {
    badgeId: normalizedBadgeId,
    badgeName: set.badgeName,
    badgeReward: set.badgeReward,
    setCode: set.code,
    roadTitle: getRoadDefinition(role).title,
    displayName: stringValue(profile.full_name, "BVRB3R member"),
    username: nullableString(profile.public_username),
    earnedAt: stringValue(badge.earned_at),
    legendary: set.index === 4
  };
}
