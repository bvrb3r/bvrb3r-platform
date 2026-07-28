import type {
  DeepLinkRecord,
  DeviceRegistrationRecord,
  NativePushTokenRecord,
  NotificationDeliveryAttemptRecord,
  PushSubscriptionRecord
} from "@/types/mobile";

export const demoDeviceRegistrations: DeviceRegistrationRecord[] = [
  {
    id: "device-client-jordan-iphone",
    deviceId: "iphone-jordan-primary",
    userEmail: "client@bvrb3r.demo",
    role: "client",
    clientId: "client-jordan",
    platform: "ios",
    runtimeMode: "standalone",
    deviceLabel: "Jordan's iPhone",
    status: "active",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)",
    capabilities: {
      pushSupported: true,
      shareSupported: true,
      standaloneSupported: true,
      serviceWorkerSupported: true,
      notificationPermission: "granted"
    },
    createdAt: "2026-03-10T08:10:00-04:00",
    updatedAt: "2026-03-10T08:16:00-04:00",
    lastSeenAt: "2026-03-10T08:16:00-04:00"
  },
  {
    id: "device-wave-pwa",
    deviceId: "wave-pixel-pwa",
    userEmail: "wave@bvrb3r.demo",
    role: "barber_user",
    barberId: "barber-wave",
    platform: "android",
    runtimeMode: "standalone",
    deviceLabel: "Wave's Pixel",
    status: "active",
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
    capabilities: {
      pushSupported: true,
      shareSupported: true,
      standaloneSupported: true,
      serviceWorkerSupported: true,
      notificationPermission: "granted"
    },
    createdAt: "2026-03-10T07:48:00-04:00",
    updatedAt: "2026-03-10T08:05:00-04:00",
    lastSeenAt: "2026-03-10T08:05:00-04:00"
  },
  {
    id: "device-owner-ipad",
    deviceId: "owner-ipad-command",
    userEmail: "owner@bvrb3r.demo",
    role: "owner",
    platform: "ios",
    runtimeMode: "standalone",
    deviceLabel: "Owner iPad",
    status: "active",
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)",
    capabilities: {
      pushSupported: true,
      shareSupported: true,
      standaloneSupported: true,
      serviceWorkerSupported: true,
      notificationPermission: "granted"
    },
    createdAt: "2026-03-10T07:32:00-04:00",
    updatedAt: "2026-03-10T08:04:00-04:00",
    lastSeenAt: "2026-03-10T08:04:00-04:00"
  }
];

export const demoPushSubscriptions: PushSubscriptionRecord[] = [
  {
    id: "push-client-jordan-primary",
    deviceId: "iphone-jordan-primary",
    userEmail: "client@bvrb3r.demo",
    role: "client",
    clientId: "client-jordan",
    endpoint: "https://push.placeholder.bvrb3r/client-jordan-primary",
    provider: "web_push_placeholder",
    status: "active",
    p256dhKey: "demo-client-p256dh",
    authKey: "demo-client-auth",
    platform: "ios",
    runtimeMode: "standalone",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)",
    createdAt: "2026-03-10T08:10:00-04:00",
    updatedAt: "2026-03-10T08:16:00-04:00",
    lastSeenAt: "2026-03-10T08:16:00-04:00"
  },
  {
    id: "push-wave-primary",
    deviceId: "wave-pixel-pwa",
    userEmail: "wave@bvrb3r.demo",
    role: "barber_user",
    barberId: "barber-wave",
    endpoint: "https://push.placeholder.bvrb3r/wave-primary",
    provider: "web_push_placeholder",
    status: "active",
    p256dhKey: "demo-wave-p256dh",
    authKey: "demo-wave-auth",
    platform: "android",
    runtimeMode: "standalone",
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
    createdAt: "2026-03-10T07:48:00-04:00",
    updatedAt: "2026-03-10T08:05:00-04:00",
    lastSeenAt: "2026-03-10T08:05:00-04:00"
  },
  {
    id: "push-owner-primary",
    deviceId: "owner-ipad-command",
    userEmail: "owner@bvrb3r.demo",
    role: "owner",
    endpoint: "https://push.placeholder.bvrb3r/owner-primary",
    provider: "web_push_placeholder",
    status: "active",
    p256dhKey: "demo-owner-p256dh",
    authKey: "demo-owner-auth",
    platform: "ios",
    runtimeMode: "standalone",
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)",
    createdAt: "2026-03-10T07:32:00-04:00",
    updatedAt: "2026-03-10T08:04:00-04:00",
    lastSeenAt: "2026-03-10T08:04:00-04:00"
  }
];

export const demoNativePushTokens: NativePushTokenRecord[] = [
  {
    id: "native-token-client-jordan-ios",
    deviceId: "iphone-jordan-primary",
    userEmail: "client@bvrb3r.demo",
    role: "client",
    clientId: "client-jordan",
    provider: "apns",
    tokenHash: "sha256-demo-client-ios",
    tokenPreview: "...c9f1",
    status: "active",
    environment: "staging",
    bundleOrPackageId: "com.bvrb3r.platform.ios",
    appVersion: "1.0.0-rc1",
    runtimeMode: "native_ios",
    lastRegisteredAt: "2026-03-10T08:17:00-04:00",
    lastRefreshedAt: "2026-03-10T08:17:00-04:00",
    lastUsedAt: "2026-03-10T08:18:00-04:00",
    createdAt: "2026-03-10T08:17:00-04:00",
    updatedAt: "2026-03-10T08:18:00-04:00"
  },
  {
    id: "native-token-wave-android",
    deviceId: "wave-pixel-pwa",
    userEmail: "wave@bvrb3r.demo",
    role: "barber_user",
    barberId: "barber-wave",
    provider: "fcm",
    tokenHash: "sha256-demo-wave-fcm",
    tokenPreview: "...18ac",
    status: "pending",
    environment: "staging",
    bundleOrPackageId: "com.bvrb3r.platform",
    appVersion: "1.0.0-rc1",
    runtimeMode: "native_android",
    lastRegisteredAt: "2026-03-10T08:03:00-04:00",
    lastRefreshedAt: "2026-03-10T08:03:00-04:00",
    createdAt: "2026-03-10T08:03:00-04:00",
    updatedAt: "2026-03-10T08:03:00-04:00"
  }
];

export const demoNotificationDeliveryAttempts: NotificationDeliveryAttemptRecord[] = [
  {
    id: "attempt-client-rebook-push-1",
    deliveryId: "delivery-rebook-jordan-1",
    notificationId: "engage-note-1",
    channel: "push",
    provider: "web_push_placeholder",
    status: "queued",
    userEmail: "client@bvrb3r.demo",
    destination: "https://push.placeholder.bvrb3r/client-jordan-primary",
    attemptNumber: 1,
    deviceId: "iphone-jordan-primary",
    subscriptionId: "push-client-jordan-primary",
    deepLinkUrl: "bvrb3r://open?href=%2Fdashboard%2Fclient",
    metadata: {
      notificationType: "rebooking_reminder",
      role: "client"
    },
    createdAt: "2026-03-10T08:18:00-04:00",
    updatedAt: "2026-03-10T08:18:00-04:00"
  },
  {
    id: "attempt-wave-review-push-1",
    deliveryId: "delivery-follow-wave-1",
    notificationId: "engage-note-3",
    channel: "push",
    provider: "web_push_placeholder",
    status: "delivered",
    userEmail: "wave@bvrb3r.demo",
    destination: "https://push.placeholder.bvrb3r/wave-primary",
    attemptNumber: 1,
    deviceId: "wave-pixel-pwa",
    subscriptionId: "push-wave-primary",
    deepLinkUrl: "bvrb3r://open?href=%2Fdashboard%2Fbarber",
    metadata: {
      notificationType: "review_alert",
      role: "barber_user"
    },
    createdAt: "2026-03-10T08:06:00-04:00",
    updatedAt: "2026-03-10T08:06:00-04:00"
  },
  {
    id: "attempt-owner-ops-push-1",
    deliveryId: "delivery-verify-blaze-1",
    notificationId: "engage-note-5",
    channel: "push",
    provider: "web_push_placeholder",
    status: "placeholder",
    userEmail: "owner@bvrb3r.demo",
    destination: "https://push.placeholder.bvrb3r/owner-primary",
    attemptNumber: 1,
    deviceId: "owner-ipad-command",
    subscriptionId: "push-owner-primary",
    deepLinkUrl: "bvrb3r://open?href=%2Fdashboard%2Fowner",
    metadata: {
      notificationType: "instant_booking_alert",
      role: "owner"
    },
    createdAt: "2026-03-10T08:08:00-04:00",
    updatedAt: "2026-03-10T08:08:00-04:00"
  }
];

export const demoDeepLinks: DeepLinkRecord[] = [
  {
    id: "deep-link-client-booking",
    route: "/booking/new?barberId=barber-wave&source=public_profile",
    label: "Book Wave Carter",
    webUrl: "https://bvrb3r.app/booking/new?barberId=barber-wave&source=public_profile",
    appUrl: "bvrb3r://open?href=%2Fbooking%2Fnew%3FbarberId%3Dbarber-wave%26source%3Dpublic_profile",
    source: "share",
    userEmail: "client@bvrb3r.demo",
    role: "client",
    deviceId: "iphone-jordan-primary",
    createdAt: "2026-03-10T08:21:00-04:00",
    metadata: {
      label: "Wave profile booking"
    }
  },
  {
    id: "deep-link-barber-dashboard",
    route: "/dashboard/barber",
    label: "Barber dashboard",
    webUrl: "https://bvrb3r.app/dashboard/barber",
    appUrl: "bvrb3r://open?href=%2Fdashboard%2Fbarber",
    source: "push",
    userEmail: "wave@bvrb3r.demo",
    role: "barber_user",
    deviceId: "wave-pixel-pwa",
    createdAt: "2026-03-10T08:07:00-04:00",
    metadata: {
      label: "Review alert"
    }
  },
  {
    id: "deep-link-owner-summary",
    route: "/dashboard/owner",
    label: "Owner dashboard",
    webUrl: "https://bvrb3r.app/dashboard/owner",
    appUrl: "bvrb3r://open?href=%2Fdashboard%2Fowner",
    source: "push",
    userEmail: "owner@bvrb3r.demo",
    role: "owner",
    deviceId: "owner-ipad-command",
    createdAt: "2026-03-10T08:09:00-04:00",
    metadata: {
      label: "Owner activity summary"
    }
  }
];
