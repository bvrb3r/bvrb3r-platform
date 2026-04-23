"use server";

import { isSupabaseEnabled } from "@/lib/config/runtime";
import { getNotificationDeliveryProvider } from "@/lib/engagement/delivery-provider";
import { appendEngagementNotification } from "@/lib/engagement/notifications";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { setEngagementState } from "@/lib/engagement/state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { EngagementNotificationRecord, EngagementState } from "@/types/engagement";

function diffNotifications(previous: EngagementNotificationRecord[], next: EngagementNotificationRecord[]) {
  const previousIds = new Set(previous.map((record) => record.id));
  return next.filter((record) => !previousIds.has(record.id));
}

function resolveClientEmail(state: EngagementState, clientId: string) {
  const preferenceMatch = state.notificationPreferences.find((preference) => preference.clientId === clientId)?.userEmail;
  if (preferenceMatch) {
    return preferenceMatch;
  }

  const notificationMatch = state.notifications.find((notification) => notification.clientId === clientId)?.userEmail;
  if (notificationMatch) {
    return notificationMatch;
  }

  return null;
}

function formatSlotLabel(startsAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(startsAt));
}

function resolveLocationLabel(locationId?: string | null, locationLabel?: string | null) {
  if (locationLabel?.trim()) {
    return locationLabel.trim();
  }

  return locationId ?? null;
}

function toNotificationRows(records: EngagementNotificationRecord[]) {
  return records.map((record) => ({
    audience_role: record.role,
    audience_email: record.userEmail,
    client_reference: record.clientId ?? null,
    client_email: record.userEmail ?? null,
    barber_reference: record.barberId ?? null,
    barber_email: null,
    location_reference: record.locationId ?? null,
    channel: record.channel,
    notification_type: record.type,
    title: record.title,
    body: record.body,
    status: record.status,
    metadata: { source: "barber_open_slot" },
    created_at: record.createdAt,
    scheduled_for: record.scheduledFor ?? null,
    dedupe_key: record.id
  }));
}

export async function queueBarberOpenSlotNotifications(input: {
  barberId: string;
  barberName: string;
  startsAt: string;
  locationId?: string | null;
  locationLabel?: string | null;
}) {
  const provider = await getEngagementProvider();
  const state = await provider.readState();
  const eligibleFollows = state.barberFollows.filter((follow) => follow.barberId === input.barberId && follow.notifyOnAvailability);

  if (!eligibleFollows.length) {
    return {
      notificationsQueued: 0,
      audienceCount: 0,
      slotStartsAt: input.startsAt
    };
  }

  const slotLabel = formatSlotLabel(input.startsAt);
  const resolvedLocationLabel = resolveLocationLabel(input.locationId, input.locationLabel);
  const title = `${input.barberName} has an opening`;
  const body = `${input.barberName} just opened ${slotLabel}${resolvedLocationLabel ? ` at ${resolvedLocationLabel}` : ""}. Book before the chair fills again.`;

  let nextState = state;
  let deliverableAudienceCount = 0;
  for (const follow of eligibleFollows) {
    const userEmail = resolveClientEmail(nextState, follow.clientId);
    if (!userEmail) {
      continue;
    }

    deliverableAudienceCount += 1;
    nextState = appendEngagementNotification(nextState, {
      role: "client",
      clientId: follow.clientId,
      userEmail,
      barberId: input.barberId,
      locationId: input.locationId ?? undefined,
      type: "instant_booking_alert",
      title,
      body,
      dedupeSeed: `open-slot:${input.barberId}:${follow.clientId}:${input.startsAt}`
    }).state;
  }

  const newNotifications = diffNotifications(state.notifications, nextState.notifications);
  if (!newNotifications.length) {
    return {
      notificationsQueued: 0,
      audienceCount: deliverableAudienceCount,
      slotStartsAt: input.startsAt
    };
  }

  if (!isSupabaseEnabled()) {
    setEngagementState(nextState);
    await (await getNotificationDeliveryProvider()).syncNotifications(newNotifications);
    return {
      notificationsQueued: newNotifications.length,
      audienceCount: deliverableAudienceCount,
      slotStartsAt: input.startsAt
    };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    setEngagementState(nextState);
    await (await getNotificationDeliveryProvider()).syncNotifications(newNotifications);
    return {
      notificationsQueued: newNotifications.length,
      audienceCount: deliverableAudienceCount,
      slotStartsAt: input.startsAt
    };
  }

  const write = await supabase.from("notifications").upsert(toNotificationRows(newNotifications), {
    onConflict: "dedupe_key"
  });
  if (write.error) {
    throw write.error;
  }

  await (await getNotificationDeliveryProvider()).syncNotifications(newNotifications);

  return {
    notificationsQueued: newNotifications.length,
    audienceCount: deliverableAudienceCount,
    slotStartsAt: input.startsAt
  };
}
