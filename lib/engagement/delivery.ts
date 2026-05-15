import { hasEmailDeliveryConfig, hasTwilioDeliveryConfig, runtimeConfig } from "@/lib/config/runtime";
import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import { buildMobileActivationLink } from "@/lib/mobile/links";
import { resolveNotificationDestination } from "@/lib/engagement/live-delivery";
import type { NotificationDeliveryRecord } from "@/types/activation";
import type { EngagementNotificationRecord } from "@/types/engagement";
import type { Role } from "@/types/domain";

function createDeliveryId(notificationId: string, channel: NotificationDeliveryRecord["channel"]) {
  return `delivery-${notificationId}-${channel}`;
}

function getProvider(channel: NotificationDeliveryRecord["channel"]): NotificationDeliveryRecord["provider"] {
  if (channel === "in_app") {
    return "in_app";
  }

  if (channel === "sms") {
    return hasTwilioDeliveryConfig() ? "twilio" : "twilio_placeholder";
  }

  if (channel === "email") {
    return hasEmailDeliveryConfig() ? "resend" : "resend_placeholder";
  }

  return runtimeConfig.webPushPublicKey ? "web_push" : "web_push_placeholder";
}

function getStatus(channel: NotificationDeliveryRecord["channel"]): NotificationDeliveryRecord["status"] {
  if (channel === "in_app") {
    return "delivered";
  }

  if (channel === "push") {
    return "queued";
  }

  return "queued";
}

function roleHomeRoute(role: Role) {
  if (isShopOwnerRole(role)) {
    return "/dashboard/owner";
  }
  if (isBarberAccountRole(role)) {
    return "/dashboard/barber";
  }
  if (role === "manager") {
    return "/dashboard/manager";
  }
  if (role === "front_desk") {
    return "/dashboard/front-desk";
  }
  if (isClientRole(role)) {
    return "/dashboard/client";
  }
  return "/dashboard/client";
}

function resolveNotificationRoute(notification: EngagementNotificationRecord) {
  switch (notification.type) {
    case "instant_booking_alert":
    case "barber_opportunity":
      return "/discover";
    case "waitlist_opening":
    case "rebooking_reminder":
    case "referral_reward":
      return "/booking/new";
    case "boost_update":
    case "featured_placement_update":
      return isShopOwnerRole(notification.role) ? "/dashboard/owner" : "/dashboard/barber";
    default:
      return roleHomeRoute(notification.role);
  }
}

export function toNotificationDeliveryRecord(notification: EngagementNotificationRecord): NotificationDeliveryRecord {
  const deepLink = buildMobileActivationLink(resolveNotificationRoute(notification), notification.title);
  const destination = resolveNotificationDestination(notification, notification.channel);

  return {
    id: createDeliveryId(notification.id, notification.channel),
    notificationId: notification.id,
    channel: notification.channel,
    provider: getProvider(notification.channel),
    status: getStatus(notification.channel),
    destination,
    title: notification.title,
    sentAt: notification.channel === "in_app" ? notification.createdAt : undefined,
    lastAttemptedAt: notification.channel === "in_app" ? notification.createdAt : undefined,
    updatedAt: notification.createdAt,
    retryCount: 0,
    metadata: {
      type: notification.type,
      role: notification.role,
      userEmail: notification.userEmail,
      clientId: notification.clientId ?? null,
      barberId: notification.barberId ?? null,
      locationId: notification.locationId ?? null,
      scheduledFor: notification.scheduledFor ?? null,
      deepLinkUrl: deepLink.appUrl,
      webUrl: deepLink.webUrl,
      webProtocolUrl: deepLink.webProtocolUrl ?? null,
      universalUrl: deepLink.universalUrl ?? null
    }
  };
}
