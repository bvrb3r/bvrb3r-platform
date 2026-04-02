import { createHash } from "node:crypto";
import type { EngagementNotificationRecord, EngagementState, NotificationChannel, NotificationPreferenceRecord } from "@/types/engagement";
import type { Role } from "@/types/domain";

interface QueueNotificationInput {
  role: Role;
  userEmail: string;
  clientId?: string;
  barberId?: string;
  locationId?: string;
  type: EngagementNotificationRecord["type"];
  title: string;
  body: string;
  scheduledFor?: string;
  channel?: NotificationChannel;
  dedupeSeed?: string;
  createdAt?: string;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createStableId(prefix: string, seed: string) {
  return `${prefix}-${createHash("sha1").update(seed).digest("hex").slice(0, 16)}`;
}

export function getNotificationPreference(
  state: EngagementState,
  input: Pick<QueueNotificationInput, "userEmail" | "clientId" | "barberId" | "role">
) {
  return state.notificationPreferences.find((preference) => {
    if (preference.userEmail === input.userEmail) {
      return true;
    }

    if (input.clientId && preference.clientId === input.clientId) {
      return true;
    }

    if (input.barberId && preference.barberId === input.barberId) {
      return true;
    }

    return preference.role === input.role && preference.userEmail === input.userEmail;
  });
}

export function resolvePrimaryNotificationChannel(preference?: NotificationPreferenceRecord, fallback: NotificationChannel = "in_app") {
  if (!preference) {
    return fallback;
  }

  if (preference.pushEnabled) {
    return "push";
  }

  if (preference.inAppEnabled) {
    return "in_app";
  }

  if (preference.smsEnabled) {
    return "sms";
  }

  if (preference.emailEnabled) {
    return "email";
  }

  return fallback;
}

function createNotification(input: QueueNotificationInput, channel: NotificationChannel): EngagementNotificationRecord {
  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    id: input.dedupeSeed ? createStableId(`engage-note-${channel}`, `${input.dedupeSeed}:${channel}`) : createId(`engage-note-${channel}`),
    role: input.role,
    userEmail: input.userEmail,
    clientId: input.clientId,
    barberId: input.barberId,
    locationId: input.locationId,
    channel,
    type: input.type,
    title: input.title,
    body: input.body,
    status: input.scheduledFor ? "scheduled" : "queued",
    createdAt,
    scheduledFor: input.scheduledFor
  };
}

function mergeNotifications(existing: EngagementNotificationRecord[], incoming: EngagementNotificationRecord[]) {
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const notification of incoming) {
    byId.set(notification.id, notification);
  }

  return [...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function appendEngagementNotification(state: EngagementState, input: QueueNotificationInput) {
  const preference = getNotificationPreference(state, input);
  const primaryChannel = input.channel ?? resolvePrimaryNotificationChannel(preference);
  const notifications: EngagementNotificationRecord[] = [createNotification(input, primaryChannel)];

  if (preference?.pushEnabled && primaryChannel !== "push") {
    notifications.push(createNotification(input, "push"));
  }

  if (preference?.inAppEnabled && primaryChannel !== "in_app") {
    notifications.push(createNotification(input, "in_app"));
  }

  return {
    state: {
      ...state,
      notifications: mergeNotifications(state.notifications, notifications)
    },
    notification: notifications[0],
    notifications
  };
}
