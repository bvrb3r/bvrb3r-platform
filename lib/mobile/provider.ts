/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  createEmptyMobileState,
  getActiveNativePushTokens,
  getActivePushSubscriptions,
  getMobileActivationSummary,
  recordDeepLinkOpen,
  registerNativePushToken,
  revokeNativePushToken,
  revokePushSubscription,
  syncMobileStateLifecycle,
  syncDeviceActivation,
  type MobileActor,
  type RecordDeepLinkInput,
  type RegisterNativePushTokenInput,
  type RevokeNativePushTokenInput,
  type SyncMobileDeviceInput
} from "@/lib/mobile/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  DeepLinkRecord,
  DeviceRegistrationRecord,
  MobileActivationSummary,
  MobileState,
  NativePushTokenRecord,
  NotificationDeliveryAttemptRecord,
  PushSubscriptionRecord
} from "@/types/mobile";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export interface MobileProvider {
  kind: "demo" | "supabase";
  readState(): Promise<MobileState>;
  readAttempts(): Promise<NotificationDeliveryAttemptRecord[]>;
  readNativeTokens(): Promise<NativePushTokenRecord[]>;
  getSummary(actor: MobileActor): Promise<MobileActivationSummary>;
  syncDeviceActivation(actor: MobileActor, input: SyncMobileDeviceInput): Promise<{ summary: MobileActivationSummary; device: DeviceRegistrationRecord; subscription?: PushSubscriptionRecord }>;
  registerNativePushToken(actor: MobileActor, input: RegisterNativePushTokenInput): Promise<{ summary: MobileActivationSummary; token: NativePushTokenRecord }>;
  revokeNativePushToken(actor: MobileActor, input: RevokeNativePushTokenInput): Promise<{ summary: MobileActivationSummary }>;
  revokePushSubscription(actor: MobileActor, deviceId: string): Promise<{ summary: MobileActivationSummary }>;
  recordDeepLink(actor: MobileActor | null, input: RecordDeepLinkInput): Promise<DeepLinkRecord>;
  getActivePushSubscriptions(userEmail: string): Promise<PushSubscriptionRecord[]>;
  getActiveNativePushTokens(userEmail: string): Promise<NativePushTokenRecord[]>;
}

function stableUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex");
  const base = hash.slice(0, 32).split("");
  base[12] = "5";
  base[16] = ((parseInt(base[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${base.slice(0, 8).join("")}-${base.slice(8, 12).join("")}-${base.slice(12, 16).join("")}-${base.slice(16, 20).join("")}-${base.slice(20, 32).join("")}`;
}

function toDeviceRow(record: DeviceRegistrationRecord) {
  return {
    id: record.id,
    user_email: record.userEmail,
    app_role: record.role,
    client_reference: record.clientId ?? null,
    barber_reference: record.barberId ?? null,
    device_id: record.deviceId,
    platform: record.platform,
    runtime_mode: record.runtimeMode,
    device_label: record.deviceLabel,
    status: record.status,
    user_agent: record.userAgent ?? null,
    push_supported: record.capabilities.pushSupported,
    share_supported: record.capabilities.shareSupported,
    standalone_supported: record.capabilities.standaloneSupported,
    service_worker_supported: record.capabilities.serviceWorkerSupported,
    notification_permission: record.capabilities.notificationPermission,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    last_seen_at: record.lastSeenAt
  };
}

function fromDeviceRow(row: any): DeviceRegistrationRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    userEmail: row.user_email,
    role: row.app_role,
    clientId: row.client_reference ?? undefined,
    barberId: row.barber_reference ?? undefined,
    platform: row.platform,
    runtimeMode: row.runtime_mode,
    deviceLabel: row.device_label,
    status: row.status,
    userAgent: row.user_agent ?? undefined,
    capabilities: {
      pushSupported: Boolean(row.push_supported),
      shareSupported: Boolean(row.share_supported),
      standaloneSupported: Boolean(row.standalone_supported),
      serviceWorkerSupported: Boolean(row.service_worker_supported),
      notificationPermission: row.notification_permission
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at
  };
}

function toPushRow(record: PushSubscriptionRecord) {
  return {
    id: record.id,
    user_email: record.userEmail,
    app_role: record.role,
    client_reference: record.clientId ?? null,
    barber_reference: record.barberId ?? null,
    device_id: record.deviceId,
    endpoint: record.endpoint,
    provider: record.provider,
    status: record.status,
    p256dh_key: record.p256dhKey ?? null,
    auth_key: record.authKey ?? null,
    expiration_time: record.expirationTime ?? null,
    platform: record.platform,
    runtime_mode: record.runtimeMode,
    user_agent: record.userAgent ?? null,
    native_bridge: record.nativeBridge ?? null,
    app_bundle_id: record.appBundleId ?? null,
    app_version: record.appVersion ?? null,
    last_validated_at: record.lastValidatedAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    last_seen_at: record.lastSeenAt,
    revoked_at: record.revokedAt ?? null
  };
}

function fromPushRow(row: any): PushSubscriptionRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    userEmail: row.user_email,
    role: row.app_role,
    clientId: row.client_reference ?? undefined,
    barberId: row.barber_reference ?? undefined,
    endpoint: row.endpoint,
    provider: row.provider,
    status: row.status,
    p256dhKey: row.p256dh_key ?? undefined,
    authKey: row.auth_key ?? undefined,
    expirationTime: row.expiration_time ?? undefined,
    platform: row.platform,
    runtimeMode: row.runtime_mode,
    userAgent: row.user_agent ?? undefined,
    nativeBridge: row.native_bridge ?? undefined,
    appBundleId: row.app_bundle_id ?? undefined,
    appVersion: row.app_version ?? undefined,
    lastValidatedAt: row.last_validated_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at ?? undefined
  };
}

function toNativeTokenRow(record: NativePushTokenRecord) {
  return {
    id: record.id,
    user_email: record.userEmail,
    app_role: record.role,
    client_reference: record.clientId ?? null,
    barber_reference: record.barberId ?? null,
    device_id: record.deviceId,
    provider: record.provider,
    token_hash: record.tokenHash,
    token_preview: record.tokenPreview,
    status: record.status,
    environment: record.environment,
    bundle_or_package_id: record.bundleOrPackageId ?? null,
    app_version: record.appVersion ?? null,
    runtime_mode: record.runtimeMode,
    rotated_from_id: record.rotatedFromId ?? null,
    last_registered_at: record.lastRegisteredAt,
    last_refreshed_at: record.lastRefreshedAt ?? null,
    last_used_at: record.lastUsedAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    revoked_at: record.revokedAt ?? null
  };
}

function fromNativeTokenRow(row: any): NativePushTokenRecord {
  return {
    id: row.id,
    deviceId: row.device_id,
    userEmail: row.user_email,
    role: row.app_role,
    clientId: row.client_reference ?? undefined,
    barberId: row.barber_reference ?? undefined,
    provider: row.provider,
    tokenHash: row.token_hash,
    tokenPreview: row.token_preview,
    status: row.status,
    environment: row.environment,
    bundleOrPackageId: row.bundle_or_package_id ?? undefined,
    appVersion: row.app_version ?? undefined,
    runtimeMode: row.runtime_mode,
    rotatedFromId: row.rotated_from_id ?? undefined,
    lastRegisteredAt: row.last_registered_at,
    lastRefreshedAt: row.last_refreshed_at ?? undefined,
    lastUsedAt: row.last_used_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at ?? undefined
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

function toDeepLinkRow(record: DeepLinkRecord) {
  return {
    id: record.id,
    route: record.route,
    label: record.label,
    web_url: record.webUrl,
    app_url: record.appUrl,
    source: record.source,
    user_email: record.userEmail ?? null,
    app_role: record.role ?? null,
    device_id: record.deviceId ?? null,
    metadata: record.metadata,
    created_at: record.createdAt
  };
}

function fromDeepLinkRow(row: any): DeepLinkRecord {
  return {
    id: row.id,
    route: row.route,
    label: row.label,
    webUrl: row.web_url,
    appUrl: row.app_url,
    source: row.source,
    userEmail: row.user_email ?? undefined,
    role: row.app_role ?? undefined,
    deviceId: row.device_id ?? undefined,
    metadata: row.metadata ?? {},
    createdAt: row.created_at
  };
}

async function upsertSupabasePreference(supabase: SupabaseClient, actor: MobileActor, pushEnabled: boolean) {
  const row = {
    id: stableUuid(`notification-preference:${actor.role}:${actor.userEmail}`),
    user_email: actor.userEmail,
    role: actor.role,
    client_reference: actor.clientId ?? null,
    barber_reference: actor.barberId ?? null,
    in_app_enabled: true,
    sms_enabled: actor.role === "client",
    email_enabled: true,
    push_enabled: pushEnabled,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };

  const result = await supabase.from("notification_preferences").upsert(row, { onConflict: "role,user_email" });
  if (result.error) {
    throw result.error;
  }
}

async function readSupabaseState(supabase: SupabaseClient): Promise<MobileState> {
  const [devices, subscriptions, nativeTokens, attempts, deepLinks] = await Promise.all([
    supabase.from("device_registrations").select("*").order("updated_at", { ascending: false }),
    supabase.from("push_subscriptions").select("*").order("updated_at", { ascending: false }),
    supabase.from("native_push_tokens").select("*").order("updated_at", { ascending: false }),
    supabase.from("notification_delivery_attempts").select("*").order("updated_at", { ascending: false }),
    supabase.from("deep_link_events").select("*").order("created_at", { ascending: false })
  ]);

  for (const result of [devices, subscriptions, nativeTokens, attempts, deepLinks]) {
    if (result.error) {
      throw result.error;
    }
  }

  return syncMobileStateLifecycle({
    devices: (devices.data ?? []).map(fromDeviceRow),
    pushSubscriptions: (subscriptions.data ?? []).map(fromPushRow),
    nativePushTokens: (nativeTokens.data ?? []).map(fromNativeTokenRow),
    deliveryAttempts: (attempts.data ?? []).map(fromAttemptRow),
    deepLinks: (deepLinks.data ?? []).map(fromDeepLinkRow)
  });
}

function createEmptyProvider(): MobileProvider {
  const unavailable = (): never => {
    throw new Error("Mobile activation data is unavailable because Supabase is not configured.");
  };

  return {
    kind: "supabase",
    async readState() {
      return createEmptyMobileState();
    },
    async readAttempts() {
      return [];
    },
    async readNativeTokens() {
      return [];
    },
    async getSummary(actor) {
      return getMobileActivationSummary(createEmptyMobileState(), actor);
    },
    async syncDeviceActivation() {
      return unavailable();
    },
    async registerNativePushToken() {
      return unavailable();
    },
    async revokeNativePushToken() {
      return unavailable();
    },
    async revokePushSubscription() {
      return unavailable();
    },
    async recordDeepLink() {
      return unavailable();
    },
    async getActivePushSubscriptions() {
      return [];
    },
    async getActiveNativePushTokens() {
      return [];
    }
  };
}

function createSupabaseProvider(supabase: SupabaseClient): MobileProvider {
  return {
    kind: "supabase",
    async readState() {
      return readSupabaseState(supabase);
    },
    async readAttempts() {
      const state = await readSupabaseState(supabase);
      return state.deliveryAttempts;
    },
    async readNativeTokens() {
      const state = await readSupabaseState(supabase);
      return state.nativePushTokens;
    },
    async getSummary(actor) {
      const state = await readSupabaseState(supabase);
      return getMobileActivationSummary(state, actor);
    },
    async syncDeviceActivation(actor, input) {
      const state = await readSupabaseState(supabase);
      const initialResult = syncDeviceActivation(state, actor, input);
      let nextState = initialResult.state;

      const shouldRevokeForMissingPermission = !input.subscription
        && input.capabilities.notificationPermission !== "granted"
        && input.runtimeMode !== "native_ios"
        && input.runtimeMode !== "native_android";
      if (shouldRevokeForMissingPermission) {
        nextState = revokePushSubscription(nextState, actor, input.deviceId).state;
      }

      const deviceRows = nextState.devices
        .filter((device) => device.userEmail === actor.userEmail && device.deviceId === input.deviceId)
        .map(toDeviceRow);
      const pushRows = nextState.pushSubscriptions
        .filter((record) => record.userEmail === actor.userEmail && record.deviceId === input.deviceId)
        .map(toPushRow);

      if (deviceRows.length) {
        const deviceResult = await supabase.from("device_registrations").upsert(deviceRows, { onConflict: "user_email,device_id" });
        if (deviceResult.error) {
          throw deviceResult.error;
        }
      }

      if (pushRows.length) {
        const pushResult = await supabase.from("push_subscriptions").upsert(pushRows, { onConflict: "user_email,device_id" });
        if (pushResult.error) {
          throw pushResult.error;
        }
      }

      if (shouldRevokeForMissingPermission) {
        const revokeResult = await supabase
          .from("push_subscriptions")
          .update({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_validated_at: new Date().toISOString() })
          .eq("user_email", actor.userEmail)
          .eq("device_id", input.deviceId)
          .eq("status", "active");
        if (revokeResult.error) {
          throw revokeResult.error;
        }
      }

      const activeSubscriptions = nextState.pushSubscriptions.filter((record) => record.userEmail === actor.userEmail && record.status === "active");
      const activeTokens = nextState.nativePushTokens.filter((record) => record.userEmail === actor.userEmail && (record.status === "active" || record.status === "pending"));
      await upsertSupabasePreference(supabase, actor, activeSubscriptions.length > 0 || activeTokens.length > 0);
      return {
        summary: getMobileActivationSummary(nextState, actor),
        device: initialResult.device,
        subscription: nextState.pushSubscriptions.find((record) => record.userEmail === actor.userEmail && record.deviceId === input.deviceId && record.status === "active")
      };
    },
    async registerNativePushToken(actor, input) {
      const state = await readSupabaseState(supabase);
      const result = registerNativePushToken(state, actor, input);
      const tokenRows = result.state.nativePushTokens
        .filter((record) => record.userEmail === actor.userEmail && record.deviceId === input.deviceId && record.provider === input.provider)
        .map(toNativeTokenRow);

      if (tokenRows.length) {
        const write = await supabase.from("native_push_tokens").upsert(tokenRows, { onConflict: "id" });
        if (write.error) {
          throw write.error;
        }
      }

      await upsertSupabasePreference(supabase, actor, getActivePushSubscriptions(result.state, actor.userEmail).length > 0 || getActiveNativePushTokens(result.state, actor.userEmail).length > 0);
      return {
        summary: getMobileActivationSummary(result.state, actor),
        token: result.token
      };
    },
    async revokeNativePushToken(actor, input) {
      const state = await readSupabaseState(supabase);
      const result = revokeNativePushToken(state, actor, input);
      const write = await supabase
        .from("native_push_tokens")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_email", actor.userEmail)
        .eq("device_id", input.deviceId)
        .eq("provider", input.provider)
        .in("status", ["active", "pending"]);
      if (write.error) {
        throw write.error;
      }

      await upsertSupabasePreference(supabase, actor, getActivePushSubscriptions(result.state, actor.userEmail).length > 0 || getActiveNativePushTokens(result.state, actor.userEmail).length > 0);
      return {
        summary: getMobileActivationSummary(result.state, actor)
      };
    },
    async revokePushSubscription(actor, deviceId) {
      const result = await supabase
        .from("push_subscriptions")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_validated_at: new Date().toISOString() })
        .eq("user_email", actor.userEmail)
        .eq("device_id", deviceId)
        .eq("status", "active");
      if (result.error) {
        throw result.error;
      }

      const state = await readSupabaseState(supabase);
      await upsertSupabasePreference(supabase, actor, getActivePushSubscriptions(state, actor.userEmail).length > 0 || getActiveNativePushTokens(state, actor.userEmail).length > 0);
      return {
        summary: getMobileActivationSummary(state, actor)
      };
    },
    async recordDeepLink(actor, input) {
      const result = recordDeepLinkOpen(await readSupabaseState(supabase), actor, input);
      const write = await supabase.from("deep_link_events").upsert(toDeepLinkRow(result.record), { onConflict: "id" });
      if (write.error) {
        throw write.error;
      }
      return result.record;
    },
    async getActivePushSubscriptions(userEmail) {
      const state = await readSupabaseState(supabase);
      return getActivePushSubscriptions(state, userEmail);
    },
    async getActiveNativePushTokens(userEmail) {
      const state = await readSupabaseState(supabase);
      return getActiveNativePushTokens(state, userEmail);
    }
  };
}

export async function getMobileProvider(): Promise<MobileProvider> {
  if (!isSupabaseEnabled()) {
    return createEmptyProvider();
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return createEmptyProvider();
  }

  return createSupabaseProvider(supabase);
}
