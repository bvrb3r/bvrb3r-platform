/* eslint-disable @typescript-eslint/no-explicit-any */
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { demoNotificationDeliveries } from "@/lib/data/activation";
import { demoNotificationDeliveryAttempts } from "@/lib/data/mobile";
import { toNotificationDeliveryRecord } from "@/lib/engagement/delivery";
import { executeNotificationAttempt } from "@/lib/engagement/live-delivery";
import { getMobileProvider } from "@/lib/mobile/provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NotificationDeliveryRecord } from "@/types/activation";
import type { EngagementNotificationRecord } from "@/types/engagement";
import type { NotificationDeliveryAttemptRecord } from "@/types/mobile";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export interface NotificationDeliveryProvider {
  kind: "demo" | "supabase";
  readDeliveries(filters?: { notificationIds?: string[] }): Promise<NotificationDeliveryRecord[]>;
  readAttempts(filters?: { notificationIds?: string[] }): Promise<NotificationDeliveryAttemptRecord[]>;
  syncNotifications(notifications: EngagementNotificationRecord[]): Promise<void>;
}

let demoDeliveries = [...demoNotificationDeliveries];
let demoAttempts = [...demoNotificationDeliveryAttempts];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toRow(record: NotificationDeliveryRecord) {
  return {
    id: record.id,
    notification_reference: record.notificationId,
    channel: record.channel,
    provider: record.provider,
    status: record.status,
    destination: record.destination,
    title: record.title,
    sent_at: record.sentAt ?? null,
    last_attempted_at: record.lastAttemptedAt ?? null,
    updated_at: record.updatedAt ?? record.sentAt ?? new Date().toISOString(),
    retry_count: record.retryCount ?? 0,
    provider_message_id: record.providerMessageId ?? null,
    error_message: record.errorMessage ?? null,
    metadata: record.metadata,
    created_at: record.updatedAt ?? record.sentAt ?? new Date().toISOString()
  };
}

function fromRow(row: any): NotificationDeliveryRecord {
  return {
    id: row.id,
    notificationId: row.notification_reference,
    channel: row.channel,
    provider: row.provider,
    status: row.status,
    destination: row.destination,
    title: row.title,
    sentAt: row.sent_at ?? undefined,
    lastAttemptedAt: row.last_attempted_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    retryCount: Number(row.retry_count ?? 0),
    providerMessageId: row.provider_message_id ?? undefined,
    errorMessage: row.error_message ?? undefined,
    metadata: row.metadata ?? {}
  };
}

function toAttemptRow(record: NotificationDeliveryAttemptRecord) {
  return {
    id: record.id,
    delivery_reference: record.deliveryId,
    notification_reference: record.notificationId,
    channel: record.channel,
    provider: record.provider,
    status: record.status,
    user_email: record.userEmail,
    destination: record.destination,
    attempt_number: record.attemptNumber,
    device_id: record.deviceId ?? null,
    push_subscription_reference: record.subscriptionId ?? null,
    deep_link_url: record.deepLinkUrl ?? null,
    error_message: record.errorMessage ?? null,
    provider_message_id: record.providerMessageId ?? null,
    provider_status_code: record.providerStatusCode ?? null,
    executed_at: record.executedAt ?? null,
    next_retry_at: record.nextRetryAt ?? null,
    metadata: record.metadata,
    provider_metadata: record.providerMetadata ?? {},
    created_at: record.createdAt,
    updated_at: record.updatedAt
  };
}

function fromAttemptRow(row: any): NotificationDeliveryAttemptRecord {
  return {
    id: row.id,
    deliveryId: row.delivery_reference,
    notificationId: row.notification_reference,
    channel: row.channel,
    provider: row.provider,
    status: row.status,
    userEmail: row.user_email,
    destination: row.destination,
    attemptNumber: Number(row.attempt_number ?? 1),
    deviceId: row.device_id ?? undefined,
    subscriptionId: row.push_subscription_reference ?? undefined,
    deepLinkUrl: row.deep_link_url ?? undefined,
    errorMessage: row.error_message ?? undefined,
    providerMessageId: row.provider_message_id ?? undefined,
    providerStatusCode: row.provider_status_code ?? undefined,
    executedAt: row.executed_at ?? undefined,
    nextRetryAt: row.next_retry_at ?? undefined,
    metadata: row.metadata ?? {},
    providerMetadata: row.provider_metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createAttemptId(deliveryId: string, suffix: string) {
  return `attempt-${deliveryId}-${suffix}`;
}

async function seedSupabase(supabase: SupabaseClient) {
  const result = await Promise.all([
    supabase.from("notification_deliveries").upsert(demoNotificationDeliveries.map(toRow), { onConflict: "id" }),
    supabase.from("notification_delivery_attempts").upsert(demoNotificationDeliveryAttempts.map(toAttemptRow), { onConflict: "id" })
  ]);
  for (const write of result) {
    if (write.error) {
      throw write.error;
    }
  }
}

async function buildAttempts(notifications: EngagementNotificationRecord[]) {
  const mobileProvider = await getMobileProvider();
  const attempts: NotificationDeliveryAttemptRecord[] = [];

  for (const notification of notifications) {
    const delivery = toNotificationDeliveryRecord(notification);
    const deepLinkUrl = typeof delivery.metadata.deepLinkUrl === "string" ? delivery.metadata.deepLinkUrl : undefined;

    if (notification.channel === "push") {
      const subscriptions = await mobileProvider.getActivePushSubscriptions(notification.userEmail);
      if (subscriptions.length) {
        subscriptions.forEach((subscription, index) => {
          attempts.push({
            id: createAttemptId(delivery.id, `${subscription.deviceId}-${index + 1}`),
            deliveryId: delivery.id,
            notificationId: notification.id,
            channel: "push",
            provider: subscription.provider,
            status: delivery.provider === "web_push" ? "queued" : "placeholder",
            userEmail: notification.userEmail,
            destination: subscription.endpoint,
            attemptNumber: index + 1,
            deviceId: subscription.deviceId,
            subscriptionId: subscription.id,
            deepLinkUrl,
            metadata: {
              type: notification.type,
              role: notification.role,
              runtimeMode: subscription.runtimeMode,
              platform: subscription.platform,
              appBundleId: subscription.appBundleId ?? null
            },
            createdAt: notification.createdAt,
            updatedAt: notification.createdAt
          });
        });
        continue;
      }

      attempts.push({
        id: createAttemptId(delivery.id, "no-subscription"),
        deliveryId: delivery.id,
        notificationId: notification.id,
        channel: "push",
        provider: "web_push_placeholder",
        status: "placeholder",
        userEmail: notification.userEmail,
        destination: notification.userEmail,
        attemptNumber: 1,
        deepLinkUrl,
        metadata: {
          type: notification.type,
          role: notification.role,
          reason: "no_active_subscription"
        },
        createdAt: notification.createdAt,
        updatedAt: notification.createdAt
      });
      continue;
    }

    attempts.push({
      id: createAttemptId(delivery.id, notification.channel),
      deliveryId: delivery.id,
      notificationId: notification.id,
      channel: notification.channel,
      provider: delivery.provider,
      status: delivery.status,
      userEmail: notification.userEmail,
      destination: delivery.destination,
      attemptNumber: 1,
      deepLinkUrl,
      metadata: {
        type: notification.type,
        role: notification.role
      },
      createdAt: notification.createdAt,
      updatedAt: notification.createdAt
    });
  }

  return attempts;
}

function mergeDelivery(existing: NotificationDeliveryRecord | undefined, base: NotificationDeliveryRecord, attempts: NotificationDeliveryAttemptRecord[]): NotificationDeliveryRecord {
  const deliveredAttempt = attempts.find((attempt) => attempt.status === "delivered");
  const retryingAttempt = attempts.find((attempt) => attempt.status === "retrying");
  const queuedAttempt = attempts.find((attempt) => attempt.status === "queued");
  const failedAttempt = attempts.find((attempt) => attempt.status === "failed");
  const placeholderAttempt = attempts.find((attempt) => attempt.status === "placeholder");
  const latestAttempt = [...attempts].sort((left, right) => (right.executedAt ?? right.updatedAt).localeCompare(left.executedAt ?? left.updatedAt))[0];

  const status = deliveredAttempt
    ? "delivered"
    : retryingAttempt
      ? "retrying"
      : queuedAttempt
        ? "queued"
        : failedAttempt
          ? "failed"
          : placeholderAttempt
            ? "placeholder"
            : base.status;

  return {
    ...existing,
    ...base,
    provider: deliveredAttempt?.provider ?? failedAttempt?.provider ?? retryingAttempt?.provider ?? placeholderAttempt?.provider ?? queuedAttempt?.provider ?? base.provider,
    status,
    sentAt: deliveredAttempt?.executedAt ?? existing?.sentAt,
    lastAttemptedAt: latestAttempt?.executedAt ?? latestAttempt?.updatedAt ?? existing?.lastAttemptedAt,
    updatedAt: latestAttempt?.updatedAt ?? existing?.updatedAt ?? base.updatedAt,
    retryCount: attempts.filter((attempt) => attempt.status === "failed" || attempt.status === "retrying").length,
    providerMessageId: deliveredAttempt?.providerMessageId ?? existing?.providerMessageId,
    errorMessage: failedAttempt?.errorMessage ?? retryingAttempt?.errorMessage ?? placeholderAttempt?.errorMessage ?? undefined,
    metadata: {
      ...existing?.metadata,
      ...base.metadata,
      lastChannelCount: attempts.length
    }
  };
}

function shouldSkipExecution(notification: EngagementNotificationRecord, existingAttempt?: NotificationDeliveryAttemptRecord) {
  const now = new Date().toISOString();

  if (notification.status === "scheduled" && notification.scheduledFor && notification.scheduledFor > now) {
    return true;
  }

  if (existingAttempt?.status === "delivered") {
    return true;
  }

  if ((existingAttempt?.status === "retrying" || existingAttempt?.status === "failed") && existingAttempt.nextRetryAt && existingAttempt.nextRetryAt > now) {
    return true;
  }

  return false;
}

async function processNotifications(
  existingDeliveries: NotificationDeliveryRecord[],
  existingAttempts: NotificationDeliveryAttemptRecord[],
  notifications: EngagementNotificationRecord[]
) {
  const deliveryMap = new Map(existingDeliveries.map((record) => [record.id, record]));
  const attemptMap = new Map(existingAttempts.map((record) => [record.id, record]));
  const baseAttempts = await buildAttempts(notifications);

  for (const notification of notifications) {
    const baseDelivery = toNotificationDeliveryRecord(notification);
    const existingDelivery = deliveryMap.get(baseDelivery.id);
    const notificationAttempts = baseAttempts.filter((attempt) => attempt.deliveryId === baseDelivery.id);
    const resolvedAttempts: NotificationDeliveryAttemptRecord[] = [];

    for (const baseAttempt of notificationAttempts) {
      const existingAttempt = attemptMap.get(baseAttempt.id);
      let resolvedAttempt = existingAttempt ? { ...existingAttempt, ...baseAttempt } : { ...baseAttempt };

      if (!shouldSkipExecution(notification, existingAttempt)) {
        const result = await executeNotificationAttempt({
          notification,
          delivery: { ...existingDelivery, ...baseDelivery },
          attempt: resolvedAttempt
        });
        const executedAt = result.executedAt ?? new Date().toISOString();
        const nextStatus = result.status === "failed" && result.nextRetryAt ? "retrying" : result.status;
        resolvedAttempt = {
          ...resolvedAttempt,
          provider: result.provider,
          status: nextStatus,
          errorMessage: result.errorMessage,
          providerMessageId: result.providerMessageId,
          providerStatusCode: result.providerStatusCode,
          executedAt,
          nextRetryAt: result.nextRetryAt,
          metadata: {
            ...resolvedAttempt.metadata,
            ...(result.metadata ?? {})
          },
          providerMetadata: {
            attemptedAt: executedAt,
            provider: result.provider,
            ...(result.metadata ?? {})
          },
          updatedAt: executedAt
        };
      }

      attemptMap.set(resolvedAttempt.id, resolvedAttempt);
      resolvedAttempts.push(resolvedAttempt);
    }

    const mergedDelivery = mergeDelivery(existingDelivery, baseDelivery, resolvedAttempts);
    deliveryMap.set(mergedDelivery.id, mergedDelivery);
  }

  const mergedDeliveries = [...deliveryMap.values()].sort((left, right) => (right.updatedAt ?? right.sentAt ?? "").localeCompare(left.updatedAt ?? left.sentAt ?? ""));
  const mergedAttempts = [...attemptMap.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    deliveries: mergedDeliveries,
    attempts: mergedAttempts
  };
}

function createDemoProvider(): NotificationDeliveryProvider {
  return {
    kind: "demo",
    async readDeliveries(filters) {
      const rows = clone(demoDeliveries);
      if (!filters?.notificationIds?.length) {
        return rows;
      }

      const ids = new Set(filters.notificationIds);
      return rows.filter((record) => ids.has(record.notificationId));
    },
    async readAttempts(filters) {
      const rows = clone(demoAttempts);
      if (!filters?.notificationIds?.length) {
        return rows;
      }

      const ids = new Set(filters.notificationIds);
      return rows.filter((record) => ids.has(record.notificationId));
    },
    async syncNotifications(notifications) {
      if (!notifications.length) {
        return;
      }

      const processed = await processNotifications(demoDeliveries, demoAttempts, notifications);
      demoDeliveries = processed.deliveries;
      demoAttempts = processed.attempts;
    }
  };
}

function createSupabaseProvider(supabase: SupabaseClient): NotificationDeliveryProvider {
  return {
    kind: "supabase",
    async readDeliveries(filters) {
      await seedSupabase(supabase);
      let query = supabase.from("notification_deliveries").select("*");
      if (filters?.notificationIds?.length) {
        query = query.in("notification_reference", filters.notificationIds);
      }
      const result = await query.order("updated_at", { ascending: false });
      if (result.error) {
        throw result.error;
      }

      return (result.data ?? []).map((row: any) => fromRow(row));
    },
    async readAttempts(filters) {
      await seedSupabase(supabase);
      let query = supabase.from("notification_delivery_attempts").select("*");
      if (filters?.notificationIds?.length) {
        query = query.in("notification_reference", filters.notificationIds);
      }
      const result = await query.order("updated_at", { ascending: false });
      if (result.error) {
        throw result.error;
      }

      return (result.data ?? []).map((row: any) => fromAttemptRow(row));
    },
    async syncNotifications(notifications) {
      if (!notifications.length) {
        return;
      }

      await seedSupabase(supabase);
      const [existingDeliveries, existingAttempts] = await Promise.all([
        this.readDeliveries(),
        this.readAttempts()
      ]);
      const processed = await processNotifications(existingDeliveries, existingAttempts, notifications);

      const deliveryResult = await supabase.from("notification_deliveries").upsert(processed.deliveries.map(toRow), { onConflict: "id" });
      if (deliveryResult.error) {
        throw deliveryResult.error;
      }

      const attemptResult = await supabase.from("notification_delivery_attempts").upsert(processed.attempts.map(toAttemptRow), { onConflict: "id" });
      if (attemptResult.error) {
        throw attemptResult.error;
      }
    }
  };
}

export async function getNotificationDeliveryProvider(): Promise<NotificationDeliveryProvider> {
  if (!isSupabaseEnabled()) {
    return createDemoProvider();
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return createDemoProvider();
  }

  return createSupabaseProvider(supabase);
}
