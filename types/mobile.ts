import type { NotificationDeliveryProvider, NotificationDeliveryStatus } from "@/types/activation";
import type { Role } from "@/types/domain";

export type AppRuntimeMode = "browser" | "standalone" | "native_wrap_ready" | "native_ios" | "native_android";
export type MobilePlatformKind = "ios" | "android" | "windows" | "macos" | "linux" | "unknown";
export type DeviceRegistrationStatus = "active" | "revoked";
export type PushSubscriptionStatus = "active" | "revoked" | "pending";
export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";
export type PushProviderKind = "web_push" | "web_push_placeholder" | "apns" | "fcm" | "native_bridge_placeholder";
export type NativeBridgeKind = "web_push" | "apns" | "fcm";
export type NativePushBridgeProvider = "apns" | "fcm";
export type NativePushTokenStatus = "pending" | "active" | "rotated" | "revoked" | "stale";
export type NativePushEnvironment = "development" | "staging" | "production" | "unknown";

export interface DeviceCapabilityRecord {
  pushSupported: boolean;
  shareSupported: boolean;
  standaloneSupported: boolean;
  serviceWorkerSupported: boolean;
  notificationPermission: PushPermissionState;
}

export interface DeviceRegistrationRecord {
  id: string;
  deviceId: string;
  userEmail: string;
  role: Role;
  clientId?: string;
  barberId?: string;
  platform: MobilePlatformKind;
  runtimeMode: AppRuntimeMode;
  deviceLabel: string;
  status: DeviceRegistrationStatus;
  userAgent?: string;
  capabilities: DeviceCapabilityRecord;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  deviceId: string;
  userEmail: string;
  role: Role;
  clientId?: string;
  barberId?: string;
  endpoint: string;
  provider: PushProviderKind;
  status: PushSubscriptionStatus;
  p256dhKey?: string;
  authKey?: string;
  expirationTime?: string;
  platform: MobilePlatformKind;
  runtimeMode: AppRuntimeMode;
  userAgent?: string;
  nativeBridge?: NativeBridgeKind;
  appBundleId?: string;
  appVersion?: string;
  lastValidatedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

export interface NativePushTokenRecord {
  id: string;
  deviceId: string;
  userEmail: string;
  role: Role;
  clientId?: string;
  barberId?: string;
  provider: NativePushBridgeProvider;
  tokenHash: string;
  tokenPreview: string;
  status: NativePushTokenStatus;
  environment: NativePushEnvironment;
  bundleOrPackageId?: string;
  appVersion?: string;
  runtimeMode: AppRuntimeMode;
  rotatedFromId?: string;
  lastRegisteredAt: string;
  lastRefreshedAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
}

export interface NotificationDeliveryAttemptRecord {
  id: string;
  deliveryId: string;
  notificationId: string;
  channel: "in_app" | "sms" | "email" | "push";
  provider: NotificationDeliveryProvider | PushProviderKind;
  status: NotificationDeliveryStatus;
  userEmail: string;
  destination: string;
  attemptNumber: number;
  deviceId?: string;
  subscriptionId?: string;
  deepLinkUrl?: string;
  errorMessage?: string;
  providerMessageId?: string;
  providerStatusCode?: number;
  executedAt?: string;
  nextRetryAt?: string;
  metadata: Record<string, string | number | boolean | null>;
  providerMetadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
  updatedAt: string;
}

export interface DeepLinkRecord {
  id: string;
  route: string;
  label: string;
  webUrl: string;
  appUrl: string;
  source: "push" | "share" | "shortcut" | "manual" | "install_prompt" | "native_wrap";
  userEmail?: string;
  role?: Role;
  deviceId?: string;
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface MobileActivationLink {
  label: string;
  route: string;
  webUrl: string;
  appUrl: string;
  webProtocolUrl?: string;
  universalUrl?: string;
}

export interface NativeLaunchAsset {
  kind: "icon" | "splash" | "store_listing" | "association_file";
  label: string;
  path: string;
}

export interface NativeBootstrapSummary {
  appName: string;
  scheme: string;
  runtimeMode: AppRuntimeMode;
  universalLinkHost: string;
  iosBundleId?: string;
  androidPackageName?: string;
  appStoreId?: string;
  startLinks: MobileActivationLink[];
  pushBridge: {
    webPushConfigured: boolean;
    apnsBridgeReady: boolean;
    fcmBridgeReady: boolean;
    supportedProviders: PushProviderKind[];
  };
  tokenBridge: {
    registrationApi: string;
    revokeApi: string;
    storageMode: "server_hashed";
    supportsApnsRegistration: boolean;
    supportsFcmRegistration: boolean;
    refreshFlowReady: boolean;
  };
  deliveryProviders: {
    emailConfigured: boolean;
    smsConfigured: boolean;
    webPushConfigured: boolean;
  };
  releaseCandidate: {
    qaDocs: string[];
    storeDocs: string[];
    certificationDocs: string[];
  };
  launchAssets: NativeLaunchAsset[];
}

export interface MobileActivationSummary {
  userEmail: string;
  role: Role;
  permission: PushPermissionState;
  supportsPush: boolean;
  pushEnabled: boolean;
  activeSubscriptionCount: number;
  deviceCount: number;
  activeDevices: Array<{
    deviceId: string;
    deviceLabel: string;
    runtimeMode: AppRuntimeMode;
    platform: MobilePlatformKind;
    lastSeenAt: string;
  }>;
  deliverySummary: {
    queued: number;
    delivered: number;
    failed: number;
    placeholder: number;
  };
  nativeTokenSummary: {
    active: number;
    pending: number;
    stale: number;
    providers: NativePushBridgeProvider[];
  };
  deepLinks: MobileActivationLink[];
  offlineSupport: {
    cachedRoutes: string[];
    writeSafetyMessage: string;
  };
  nativeWrapReady: boolean;
  lastSyncAt: string | null;
}

export interface MobileState {
  devices: DeviceRegistrationRecord[];
  pushSubscriptions: PushSubscriptionRecord[];
  nativePushTokens: NativePushTokenRecord[];
  deliveryAttempts: NotificationDeliveryAttemptRecord[];
  deepLinks: DeepLinkRecord[];
}
