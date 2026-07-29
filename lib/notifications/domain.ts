import type { Route } from "next";

export const notificationCategories = [
  "booking",
  "queue",
  "money",
  "culture",
  "team",
  "system"
] as const;

export const notificationChannels = ["push", "sms", "email"] as const;

export type NotificationCategory = (typeof notificationCategories)[number];
export type NotificationChannel = (typeof notificationChannels)[number];
export type NotificationChannelPreferences = Record<
  NotificationCategory,
  Record<NotificationChannel, boolean>
>;

export const defaultNotificationChannelPreferences: NotificationChannelPreferences = {
  booking: { push: true, sms: true, email: true },
  queue: { push: true, sms: true, email: false },
  money: { push: true, sms: false, email: true },
  culture: { push: false, sms: false, email: false },
  team: { push: true, sms: false, email: true },
  system: { push: true, sms: false, email: true }
};

const categoryAliases: Record<string, NotificationCategory> = {
  appointment: "booking",
  booking: "booking",
  booking_alert: "booking",
  cancellation: "booking",
  reminder: "booking",
  waitlist: "queue",
  queue: "queue",
  queue_alert: "queue",
  chair_ready: "queue",
  payment: "money",
  payment_alert: "money",
  payout: "money",
  receipt: "money",
  culture: "culture",
  creator: "culture",
  social: "culture",
  message: "team",
  team: "team",
  invite: "team",
  relationship: "team",
  account: "system",
  security: "system",
  system: "system"
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value)
    ? value
    : null;
}

function validatedNotificationRoute(value: string): Route {
  return value as Route;
}

export function notificationCategory(type: string | null | undefined): NotificationCategory {
  const normalized = (type ?? "system").trim().toLowerCase().replaceAll("-", "_");
  if (categoryAliases[normalized]) {
    return categoryAliases[normalized];
  }
  const prefix = normalized.split("_")[0];
  return categoryAliases[prefix] ?? "system";
}

export function normalizeNotificationChannelPreferences(
  value: unknown,
  fallback: NotificationChannelPreferences = defaultNotificationChannelPreferences
): NotificationChannelPreferences {
  const input = recordValue(value);
  return Object.fromEntries(
    notificationCategories.map((category) => {
      const categoryInput = recordValue(input?.[category]);
      return [
        category,
        Object.fromEntries(
          notificationChannels.map((channel) => [
            channel,
            typeof categoryInput?.[channel] === "boolean"
              ? categoryInput[channel]
              : fallback[category][channel]
          ])
        )
      ];
    })
  ) as NotificationChannelPreferences;
}

export function forceActiveQueueSms(
  preferences: NotificationChannelPreferences,
  activeQueueSmsLocked: boolean
) {
  if (!activeQueueSmsLocked || preferences.queue.sms) {
    return preferences;
  }
  return {
    ...preferences,
    queue: {
      ...preferences.queue,
      sms: true
    }
  };
}

export function safeNotificationDeepLink(
  explicitLink: unknown,
  metadataValue: unknown
): Route | null {
  if (
    typeof explicitLink === "string"
    && explicitLink.startsWith("/")
    && !explicitLink.startsWith("//")
    && explicitLink.length <= 500
  ) {
    return validatedNotificationRoute(explicitLink);
  }

  const metadata = recordValue(metadataValue);
  if (!metadata) {
    return null;
  }

  const metadataLink = metadata.deepLink ?? metadata.deep_link;
  if (
    typeof metadataLink === "string"
    && metadataLink.startsWith("/")
    && !metadataLink.startsWith("//")
    && metadataLink.length <= 500
  ) {
    return validatedNotificationRoute(metadataLink);
  }

  const appointmentId = safeId(metadata.appointmentId ?? metadata.appointment_id);
  if (appointmentId) {
    return validatedNotificationRoute(`/appointments/${appointmentId}`);
  }
  const threadId = safeId(metadata.threadId ?? metadata.thread_id);
  if (threadId) {
    return validatedNotificationRoute(`/messages/${threadId}`);
  }
  const payoutId = safeId(metadata.payoutId ?? metadata.payout_id);
  if (payoutId) {
    return validatedNotificationRoute(`/payouts/${payoutId}`);
  }
  const queueId = safeId(
    metadata.waitlistEntryId
    ?? metadata.waitlist_entry_id
    ?? metadata.queueId
    ?? metadata.queue_id
  );
  return queueId ? validatedNotificationRoute(`/queue/${queueId}`) : null;
}

export function groupNotificationDate(
  createdAt: string | null,
  now = new Date()
): "today" | "earlier" {
  if (!createdAt) {
    return "earlier";
  }
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return "earlier";
  }
  return created.getFullYear() === now.getFullYear()
    && created.getMonth() === now.getMonth()
    && created.getDate() === now.getDate()
    ? "today"
    : "earlier";
}
