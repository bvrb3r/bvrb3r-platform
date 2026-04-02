import { createHash } from "crypto";
import { demoDeepLinks, demoDeviceRegistrations, demoNativePushTokens, demoNotificationDeliveryAttempts, demoPushSubscriptions } from "@/lib/data/mobile";
import { buildDefaultDeepLinks, buildDeepLinkPayload, normalizeAppRoute } from "@/lib/mobile/links";
import type {
  AppRuntimeMode,
  DeepLinkRecord,
  DeviceCapabilityRecord,
  DeviceRegistrationRecord,
  MobileActivationSummary,
  MobilePlatformKind,
  MobileState,
  NativePushBridgeProvider,
  NativePushEnvironment,
  NativePushTokenRecord,
  NativePushTokenStatus,
  PushProviderKind,
  PushSubscriptionRecord
} from "@/types/mobile";
import type { Role } from "@/types/domain";

export interface MobileActor {
  role: Role;
  userEmail: string;
  clientId?: string;
  barberId?: string;
  locationIds?: string[];
}

export interface SyncMobileDeviceInput {
  deviceId: string;
  deviceLabel?: string;
  platform?: MobilePlatformKind;
  runtimeMode?: AppRuntimeMode;
  userAgent?: string;
  appBundleId?: string;
  appVersion?: string;
  capabilities: DeviceCapabilityRecord;
  subscription?: {
    endpoint: string;
    p256dhKey?: string;
    authKey?: string;
    expirationTime?: string;
    provider?: PushProviderKind;
    nativeBridge?: PushSubscriptionRecord["nativeBridge"];
    appBundleId?: string;
    appVersion?: string;
  };
}

export interface RegisterNativePushTokenInput {
  deviceId: string;
  provider: NativePushBridgeProvider;
  token: string;
  status?: NativePushTokenStatus;
  environment?: NativePushEnvironment;
  bundleOrPackageId?: string;
  appVersion?: string;
  runtimeMode?: AppRuntimeMode;
}

export interface RevokeNativePushTokenInput {
  deviceId: string;
  provider: NativePushBridgeProvider;
}

export interface RecordDeepLinkInput {
  route: string;
  label?: string;
  source: DeepLinkRecord["source"];
  deviceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export class MobilePermissionError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "MobilePermissionError";
  }
}

export class MobileValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "MobileValidationError";
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeIdPart(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function resolveDeviceLabel(actor: MobileActor, input: SyncMobileDeviceInput) {
  if (input.deviceLabel?.trim()) {
    return input.deviceLabel.trim();
  }

  const platform = input.platform ?? "unknown";
  const roleLabel = actor.role.replaceAll("_", " ");
  return `${roleLabel} ${platform} app`;
}

function sortByUpdated<T extends { updatedAt?: string; lastSeenAt?: string; createdAt?: string }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftValue = left.updatedAt ?? left.lastSeenAt ?? left.createdAt ?? "";
    const rightValue = right.updatedAt ?? right.lastSeenAt ?? right.createdAt ?? "";
    return rightValue.localeCompare(leftValue);
  });
}

function sortByCreated<T extends { createdAt: string }>(rows: T[]) {
  return [...rows].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

const STALE_NATIVE_TOKEN_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildTokenPreview(token: string) {
  const normalized = token.trim();
  if (normalized.length <= 8) {
    return normalized;
  }

  return `...${normalized.slice(-4)}`;
}

function normalizeTokenStatus(status?: NativePushTokenStatus) {
  return status ?? "active";
}

function isPastReference(iso: string | undefined, referenceAt: string) {
  if (!iso) {
    return false;
  }

  return iso <= referenceAt;
}

function isOlderThanWindow(iso: string | undefined, referenceAt: string, windowMs: number) {
  if (!iso) {
    return false;
  }

  const value = new Date(iso).getTime();
  const reference = new Date(referenceAt).getTime();
  if (!Number.isFinite(value) || !Number.isFinite(reference)) {
    return false;
  }

  return value <= reference - windowMs;
}

export function syncMobileStateLifecycle(state: MobileState, referenceAt = new Date().toISOString()) {
  const pushSubscriptions = sortByUpdated(state.pushSubscriptions.map((subscription) => {
    if (subscription.status === "active" && isPastReference(subscription.expirationTime, referenceAt)) {
      return {
        ...subscription,
        status: "revoked" as const,
        revokedAt: subscription.revokedAt ?? referenceAt,
        updatedAt: referenceAt,
        lastValidatedAt: referenceAt
      };
    }

    return subscription;
  }));

  const nativePushTokens = sortByUpdated(state.nativePushTokens.map((token) => {
    const freshnessReference = token.lastRefreshedAt ?? token.lastRegisteredAt ?? token.updatedAt;
    if (
      (token.status === "active" || token.status === "pending")
      && isOlderThanWindow(freshnessReference, referenceAt, STALE_NATIVE_TOKEN_WINDOW_MS)
    ) {
      return {
        ...token,
        status: "stale" as const,
        updatedAt: referenceAt
      };
    }

    return token;
  }));

  return {
    ...state,
    pushSubscriptions,
    nativePushTokens
  };
}

export function createInitialMobileState(): MobileState {
  return syncMobileStateLifecycle(clone({
    devices: demoDeviceRegistrations,
    pushSubscriptions: demoPushSubscriptions,
    nativePushTokens: demoNativePushTokens,
    deliveryAttempts: demoNotificationDeliveryAttempts,
    deepLinks: demoDeepLinks
  }));
}

export function getActivePushSubscriptions(state: MobileState, userEmail: string) {
  const nextState = syncMobileStateLifecycle(state);
  return nextState.pushSubscriptions.filter((subscription) => subscription.userEmail === userEmail && subscription.status === "active");
}

export function getActiveNativePushTokens(state: MobileState, userEmail: string) {
  const nextState = syncMobileStateLifecycle(state);
  return nextState.nativePushTokens.filter((token) => token.userEmail === userEmail && (token.status === "active" || token.status === "pending"));
}

export function syncDeviceActivation(state: MobileState, actor: MobileActor, input: SyncMobileDeviceInput) {
  const nextSourceState = syncMobileStateLifecycle(state);
  if (!actor.userEmail) {
    throw new MobilePermissionError("A signed-in user is required to manage mobile activation.");
  }

  if (!input.deviceId.trim()) {
    throw new MobileValidationError("A device id is required.");
  }

  const now = new Date().toISOString();
  const deviceId = input.deviceId.trim();
  const registrationId = `device-${sanitizeIdPart(actor.userEmail)}-${sanitizeIdPart(deviceId)}`;
  const existingDevice = nextSourceState.devices.find((device) => device.userEmail === actor.userEmail && device.deviceId === deviceId);
  const nextDevice: DeviceRegistrationRecord = {
    id: existingDevice?.id ?? registrationId,
    deviceId,
    userEmail: actor.userEmail,
    role: actor.role,
    clientId: actor.clientId,
    barberId: actor.barberId,
    platform: input.platform ?? existingDevice?.platform ?? "unknown",
    runtimeMode: input.runtimeMode ?? existingDevice?.runtimeMode ?? "browser",
    deviceLabel: resolveDeviceLabel(actor, input),
    status: "active",
    userAgent: input.userAgent ?? existingDevice?.userAgent,
    capabilities: input.capabilities,
    createdAt: existingDevice?.createdAt ?? now,
    updatedAt: now,
    lastSeenAt: now
  };

  let nextState: MobileState = {
    ...nextSourceState,
    devices: sortByUpdated([nextDevice, ...nextSourceState.devices.filter((device) => device.id !== nextDevice.id)])
  };

  let pushSubscription: PushSubscriptionRecord | undefined;
  if (input.subscription) {
    const existingSubscription = nextSourceState.pushSubscriptions.find((record) => record.userEmail === actor.userEmail && record.deviceId === deviceId);
    pushSubscription = {
      id: existingSubscription?.id ?? `push-${sanitizeIdPart(actor.userEmail)}-${sanitizeIdPart(deviceId)}`,
      deviceId,
      userEmail: actor.userEmail,
      role: actor.role,
      clientId: actor.clientId,
      barberId: actor.barberId,
      endpoint: input.subscription.endpoint,
      provider: input.subscription.provider ?? "web_push_placeholder",
      status: "active",
      p256dhKey: input.subscription.p256dhKey,
      authKey: input.subscription.authKey,
      expirationTime: input.subscription.expirationTime,
      platform: nextDevice.platform,
      runtimeMode: nextDevice.runtimeMode,
      userAgent: nextDevice.userAgent,
      nativeBridge: input.subscription.nativeBridge,
      appBundleId: input.subscription.appBundleId ?? input.appBundleId ?? existingSubscription?.appBundleId,
      appVersion: input.subscription.appVersion ?? input.appVersion ?? existingSubscription?.appVersion,
      lastValidatedAt: now,
      createdAt: existingSubscription?.createdAt ?? now,
      updatedAt: now,
      lastSeenAt: now,
      revokedAt: undefined
    };

    nextState = syncMobileStateLifecycle({
      ...nextState,
      pushSubscriptions: sortByUpdated([
        pushSubscription,
        ...nextState.pushSubscriptions.filter((record) => !(record.userEmail === actor.userEmail && record.deviceId === deviceId))
      ])
    });
  }

  return {
    state: syncMobileStateLifecycle(nextState),
    device: nextDevice,
    pushSubscription
  };
}

export function registerNativePushToken(state: MobileState, actor: MobileActor, input: RegisterNativePushTokenInput) {
  const nextSourceState = syncMobileStateLifecycle(state);
  if (!actor.userEmail) {
    throw new MobilePermissionError("A signed-in user is required to register a native push token.");
  }

  if (!input.deviceId.trim() || !input.token.trim()) {
    throw new MobileValidationError("A device id and native token are required.");
  }

  const now = new Date().toISOString();
  const tokenHash = hashToken(input.token.trim());
  const existingForProvider = nextSourceState.nativePushTokens.filter((record) =>
    record.userEmail === actor.userEmail
    && record.deviceId === input.deviceId
    && record.provider === input.provider
  );
  const matching = existingForProvider.find((record) => record.tokenHash === tokenHash);
  const nextStatus = normalizeTokenStatus(input.status);

  const nextRecord: NativePushTokenRecord = {
    id: matching?.id ?? `native-token-${sanitizeIdPart(actor.userEmail)}-${sanitizeIdPart(input.deviceId)}-${input.provider}`,
    deviceId: input.deviceId,
    userEmail: actor.userEmail,
    role: actor.role,
    clientId: actor.clientId,
    barberId: actor.barberId,
    provider: input.provider,
    tokenHash,
    tokenPreview: buildTokenPreview(input.token),
    status: nextStatus,
    environment: input.environment ?? "unknown",
    bundleOrPackageId: input.bundleOrPackageId,
    appVersion: input.appVersion,
    runtimeMode: input.runtimeMode ?? "native_wrap_ready",
    rotatedFromId: matching?.rotatedFromId,
    lastRegisteredAt: now,
    lastRefreshedAt: now,
    lastUsedAt: matching?.lastUsedAt,
    createdAt: matching?.createdAt ?? now,
    updatedAt: now,
    revokedAt: undefined
  };

  const rotatedRecords = nextSourceState.nativePushTokens.map((record) => {
    if (
      record.userEmail === actor.userEmail
      && record.deviceId === input.deviceId
      && record.provider === input.provider
      && record.id !== nextRecord.id
      && (record.status === "active" || record.status === "pending")
    ) {
      return {
        ...record,
        status: "rotated" as const,
        updatedAt: now,
        revokedAt: now
      };
    }

    return record;
  });

  return {
    state: syncMobileStateLifecycle({
      ...nextSourceState,
      nativePushTokens: sortByUpdated([
        nextRecord,
        ...rotatedRecords.filter((record) => record.id !== nextRecord.id)
      ])
    }),
    token: nextRecord
  };
}

export function revokeNativePushToken(state: MobileState, actor: MobileActor, input: RevokeNativePushTokenInput) {
  const nextSourceState = syncMobileStateLifecycle(state);
  if (!actor.userEmail) {
    throw new MobilePermissionError("A signed-in user is required to revoke a native push token.");
  }

  const now = new Date().toISOString();
  const nextTokens = nextSourceState.nativePushTokens.map((record) => {
    if (
      record.userEmail !== actor.userEmail
      || record.deviceId !== input.deviceId
      || record.provider !== input.provider
      || (record.status !== "active" && record.status !== "pending")
    ) {
      return record;
    }

    return {
      ...record,
      status: "revoked" as const,
      updatedAt: now,
      revokedAt: now
    };
  });

  return {
    state: syncMobileStateLifecycle({
      ...nextSourceState,
      nativePushTokens: sortByUpdated(nextTokens)
    })
  };
}

export function revokePushSubscription(state: MobileState, actor: MobileActor, deviceId: string) {
  const nextSourceState = syncMobileStateLifecycle(state);
  if (!actor.userEmail) {
    throw new MobilePermissionError("A signed-in user is required to manage push subscriptions.");
  }

  const now = new Date().toISOString();
  const nextSubscriptions = nextSourceState.pushSubscriptions.map((subscription) => {
    if (subscription.userEmail !== actor.userEmail || subscription.deviceId !== deviceId || subscription.status !== "active") {
      return subscription;
    }

    return {
      ...subscription,
      status: "revoked" as const,
      updatedAt: now,
      revokedAt: now,
      lastValidatedAt: now
    };
  });

  return {
    state: syncMobileStateLifecycle({
      ...nextSourceState,
      pushSubscriptions: sortByUpdated(nextSubscriptions)
    })
  };
}

export function recordDeepLinkOpen(state: MobileState, actor: MobileActor | null, input: RecordDeepLinkInput) {
  const now = new Date().toISOString();
  const payload = buildDeepLinkPayload(normalizeAppRoute(input.route), input.label ?? "BVRB3R link");
  const record: DeepLinkRecord = {
    id: createId("deep-link"),
    route: payload.route,
    label: payload.label,
    webUrl: payload.webUrl,
    appUrl: payload.appUrl,
    source: input.source,
    userEmail: actor?.userEmail,
    role: actor?.role,
    deviceId: input.deviceId,
    createdAt: now,
    metadata: input.metadata ?? {}
  };

  return {
    state: {
      ...state,
      deepLinks: sortByCreated([record, ...state.deepLinks])
    },
    record
  };
}

export function getMobileActivationSummary(state: MobileState, actor: MobileActor): MobileActivationSummary {
  const nextState = syncMobileStateLifecycle(state);
  const devices = sortByUpdated(nextState.devices.filter((device) => device.userEmail === actor.userEmail && device.status === "active"));
  const subscriptions = getActivePushSubscriptions(nextState, actor.userEmail);
  const nativeTokens = getActiveNativePushTokens(nextState, actor.userEmail);
  const staleTokens = nextState.nativePushTokens.filter((token) => token.userEmail === actor.userEmail && token.status === "stale");
  const attempts = sortByUpdated(nextState.deliveryAttempts.filter((attempt) => attempt.userEmail === actor.userEmail));
  const lastSyncAt = [
    devices[0]?.lastSeenAt,
    subscriptions[0]?.lastSeenAt,
    nativeTokens[0]?.lastRefreshedAt ?? nativeTokens[0]?.lastRegisteredAt
  ].filter(Boolean).sort((left, right) => (right ?? "").localeCompare(left ?? ""))[0] ?? null;
  const permission = devices[0]?.capabilities.notificationPermission ?? (subscriptions.length ? "granted" : "default");

  return {
    userEmail: actor.userEmail,
    role: actor.role,
    permission,
    supportsPush: devices.some((device) => device.capabilities.pushSupported),
    pushEnabled: subscriptions.length > 0 || nativeTokens.length > 0,
    activeSubscriptionCount: subscriptions.length,
    deviceCount: devices.length,
    activeDevices: devices.map((device) => ({
      deviceId: device.deviceId,
      deviceLabel: device.deviceLabel,
      runtimeMode: device.runtimeMode,
      platform: device.platform,
      lastSeenAt: device.lastSeenAt
    })),
    deliverySummary: {
      queued: attempts.filter((attempt) => attempt.status === "queued" || attempt.status === "retrying").length,
      delivered: attempts.filter((attempt) => attempt.status === "delivered").length,
      failed: attempts.filter((attempt) => attempt.status === "failed").length,
      placeholder: attempts.filter((attempt) => attempt.status === "placeholder").length
    },
    nativeTokenSummary: {
      active: nativeTokens.filter((token) => token.status === "active").length,
      pending: nativeTokens.filter((token) => token.status === "pending").length,
      stale: staleTokens.length,
      providers: [...new Set(nativeTokens.map((token) => token.provider))]
    },
    deepLinks: buildDefaultDeepLinks(actor.role),
    offlineSupport: {
      cachedRoutes: actor.role === "client"
        ? ["/discover", "/booking/new", "/dashboard/client", "/barber/wave"]
        : actor.role === "owner"
          ? ["/dashboard/owner", "/discover", "/leaderboards"]
          : actor.role === "front_desk"
            ? ["/dashboard/front-desk"]
            : ["/dashboard/barber", "/discover", "/booking/new"],
      writeSafetyMessage: "Booking, checkout, queue moves, and live operational updates still need a connection so the marketplace and shop data stay correct."
    },
    nativeWrapReady: true
    ,
    lastSyncAt
  };
}
