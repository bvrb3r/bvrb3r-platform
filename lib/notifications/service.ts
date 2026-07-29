import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  listNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferencesPayload
} from "@/lib/settings/service";
import {
  forceActiveQueueSms,
  normalizeNotificationChannelPreferences,
  notificationCategory,
  notificationCategories,
  notificationChannels,
  safeNotificationDeepLink
} from "@/lib/notifications/domain";
import type { UserAccount } from "@/types/domain";

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  notification_type: string | null;
  scheduled_for: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  deep_link: string | null;
};

type DeliveryRow = {
  id: string;
  channel: string;
  notification_kind: string;
  operational: boolean;
  status: string;
  attempt_count: number;
  scheduled_for: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  corrected_at: string | null;
  failure_code: string | null;
  escalation_kind: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationCenterPayload = {
  items: Array<{
    id: string;
    title: string;
    body: string;
    channel: string;
    status: string;
    type: string;
    category: ReturnType<typeof notificationCategory>;
    createdAt: string | null;
    scheduledFor: string | null;
    operational: boolean;
    readAt: string | null;
    unread: boolean;
    deepLink: string | null;
  }>;
  deliveries: Array<{
    id: string;
    channel: string;
    kind: string;
    operational: boolean;
    status: string;
    attemptCount: number;
    scheduledFor: string | null;
    deliveredAt: string | null;
    failedAt: string | null;
    correctedAt: string | null;
    failureCode: string | null;
    escalationKind: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  preferences: NotificationPreferencesPayload | null;
  activeQueueSmsLocked: boolean;
  generatedAt: string;
};

export class NotificationServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "NotificationServiceError";
    this.status = status;
  }
}

function assertSignedIn(user: UserAccount) {
  if (!user.id || user.id === "guest-user") {
    throw new NotificationServiceError("A signed-in account is required for notifications.", 401);
  }
}

async function hasActiveQueueSmsLock(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  user: UserAccount
) {
  const client = await supabase
    .from("clients")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (client.error) {
    throw new NotificationServiceError("Unable to verify active queue notification protection.", 500);
  }
  if (!client.data?.id) {
    return false;
  }
  const queue = await supabase
    .from("waitlist_entries")
    .select("id")
    .eq("client_id", client.data.id)
    .eq("operational_sms_consent", true)
    .in("public_queue_state", [
      "waiting",
      "almost_ready",
      "ready",
      "grace",
      "behind",
      "delayed",
      "reassigned",
      "rejoin"
    ])
    .limit(1);
  if (queue.error) {
    throw new NotificationServiceError("Unable to verify active queue notification protection.", 500);
  }
  return Boolean(queue.data?.length);
}

export async function getNotificationCenter(user: UserAccount): Promise<NotificationCenterPayload> {
  assertSignedIn(user);
  const supabase = createSupabaseAdminClient();
  const preferenceResult = await listNotificationPreferences(user);
  if (!supabase) {
    return {
      items: [],
      deliveries: [],
      preferences: preferenceResult.notificationPreferences,
      activeQueueSmsLocked: false,
      generatedAt: new Date().toISOString()
    };
  }

  const [profileItems, emailItems, profileDeliveries, emailDeliveries] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, channel, status, notification_type, scheduled_for, created_at, metadata, read_at, deep_link")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80),
    user.email
      ? supabase
        .from("notifications")
        .select("id, title, body, channel, status, notification_type, scheduled_for, created_at, metadata, read_at, deep_link")
        .eq("audience_email", user.email)
        .order("created_at", { ascending: false })
        .limit(80)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("notification_delivery_ledger")
      .select("id, channel, notification_kind, operational, status, attempt_count, scheduled_for, delivered_at, failed_at, corrected_at, failure_code, escalation_kind, created_at, updated_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(120),
    user.email
      ? supabase
        .from("notification_delivery_ledger")
        .select("id, channel, notification_kind, operational, status, attempt_count, scheduled_for, delivered_at, failed_at, corrected_at, failure_code, escalation_kind, created_at, updated_at")
        .eq("audience_email", user.email)
        .order("created_at", { ascending: false })
        .limit(120)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (profileItems.error || emailItems.error) {
    throw new NotificationServiceError("Unable to load the notification center.", 500);
  }
  if (profileDeliveries.error || emailDeliveries.error) {
    throw new NotificationServiceError("Unable to load notification delivery evidence.", 500);
  }

  const notificationRows = Array.from(
    new Map(
      [...(profileItems.data ?? []), ...(emailItems.data ?? [])]
        .map((row) => [row.id as string, row as NotificationRow])
    ).values()
  ).sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime());
  const deliveryRows = Array.from(
    new Map(
      [...(profileDeliveries.data ?? []), ...(emailDeliveries.data ?? [])]
        .map((row) => [row.id as string, row as DeliveryRow])
    ).values()
  ).sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  const activeQueueSmsLocked = await hasActiveQueueSmsLock(supabase, user);

  return {
    items: notificationRows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      channel: row.channel,
      status: row.status,
      type: row.notification_type ?? "system",
      category: notificationCategory(row.notification_type),
      createdAt: row.created_at,
      scheduledFor: row.scheduled_for,
      readAt: row.read_at,
      unread: row.read_at === null,
      deepLink: safeNotificationDeepLink(row.deep_link, row.metadata),
      operational: Boolean(row.metadata?.operational)
        || ["booking_alert", "queue_alert", "payment_alert"].includes(row.notification_type ?? "")
    })),
    deliveries: deliveryRows.map((row) => ({
      id: row.id,
      channel: row.channel,
      kind: row.notification_kind,
      operational: row.operational,
      status: row.status,
      attemptCount: row.attempt_count,
      scheduledFor: row.scheduled_for,
      deliveredAt: row.delivered_at,
      failedAt: row.failed_at,
      correctedAt: row.corrected_at,
      failureCode: row.failure_code,
      escalationKind: row.escalation_kind,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    preferences: preferenceResult.notificationPreferences
      ? {
        ...preferenceResult.notificationPreferences,
        channelPreferences: forceActiveQueueSms(
          preferenceResult.notificationPreferences.channelPreferences,
          activeQueueSmsLocked
        )
      }
      : null,
    activeQueueSmsLocked,
    generatedAt: new Date().toISOString()
  };
}

const preferenceEvidenceFields = [
  ["push_enabled", "push", "reminders"],
  ["sms_enabled", "sms", "reminders"],
  ["email_enabled", "email", "reminders"],
  ["message_alerts_enabled", "in_app", "messages"],
  ["rewards_alerts_enabled", "push", "rebooking"],
  ["creator_alerts_enabled", "push", "social"]
] as const;

export async function saveNotificationCenterPreferences(
  user: UserAccount,
  values: Record<string, string | boolean | number | string[] | Record<string, unknown> | null>
) {
  assertSignedIn(user);
  const supabase = createSupabaseAdminClient();
  const activeQueueSmsLocked = supabase
    ? await hasActiveQueueSmsLock(supabase, user)
    : false;
  const channelPreferences = forceActiveQueueSms(
    normalizeNotificationChannelPreferences(values.channel_preferences),
    activeQueueSmsLocked
  );
  const result = await updateNotificationPreferences(user, {
    ...values,
    channel_preferences: channelPreferences,
    // Operational booking and money truth cannot be muted. Marketing remains
    // separate and optional.
    booking_alerts_enabled: true,
    payout_alerts_enabled: true,
    sms_enabled: activeQueueSmsLocked ? true : values.sms_enabled
  });
  if (supabase) {
    const legacyEvidenceRows = preferenceEvidenceFields
      .filter(([field]) => typeof values[field] === "boolean")
      .map(([field, channel, category]) => ({
        profile_id: user.id,
        category,
        channel,
        enabled: Boolean(values[field]),
        evidence: {
          surface: "notification_center",
          field,
          userInitiated: true
        }
      }));
    const matrixEvidenceRows = values.channel_preferences
      ? notificationCategories.flatMap((category) => notificationChannels.map((channel) => ({
        profile_id: user.id,
        category,
        channel,
        enabled: channelPreferences[category][channel],
        evidence: {
          surface: "notification_center",
          matrix: true,
          activeQueueSmsLocked: category === "queue" && channel === "sms" && activeQueueSmsLocked,
          userInitiated: true
        }
      })))
      : [];
    const evidenceRows = [...legacyEvidenceRows, ...matrixEvidenceRows];
    if (evidenceRows.length) {
      const evidence = await supabase.from("notification_consent_events").insert(evidenceRows);
      if (evidence.error) {
        throw new NotificationServiceError("Preferences saved, but consent evidence could not be recorded.", 500);
      }
    }
  }
  return result.notificationPreferences;
}

export async function markNotificationsRead(
  user: UserAccount,
  notificationId?: string
) {
  assertSignedIn(user);
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return { updated: true };
  }

  const updateOwned = async (field: "profile_id" | "audience_email", value: string) => {
    let query = supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq(field, value)
      .is("read_at", null);
    if (notificationId) {
      query = query.eq("id", notificationId);
    }
    const result = await query;
    if (result.error) {
      throw new NotificationServiceError("Unable to update notification read state.", 500);
    }
  };

  await updateOwned("profile_id", user.id);
  if (user.email) {
    await updateOwned("audience_email", user.email);
  }
  return { updated: true };
}
