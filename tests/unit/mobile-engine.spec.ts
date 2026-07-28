import { describe, expect, it } from "vitest";
import {
  createInitialMobileState,
  getActiveNativePushTokens,
  getActivePushSubscriptions,
  getMobileActivationSummary,
  recordDeepLinkOpen,
  registerNativePushToken,
  revokeNativePushToken,
  revokePushSubscription,
  syncMobileStateLifecycle,
  syncDeviceActivation
} from "@/lib/mobile/engine";

describe("mobile engine", () => {
  it("builds a role-safe activation summary from seeded state", () => {
    const state = createInitialMobileState();
    const summary = getMobileActivationSummary(state, {
      role: "client",
      userEmail: "client@bvrb3r.demo",
      clientId: "client-jordan"
    });

    expect(summary.pushEnabled).toBe(true);
    expect(summary.activeSubscriptionCount).toBeGreaterThan(0);
    expect(summary.nativeTokenSummary.providers).toContain("apns");
    expect(summary.deepLinks.map((link) => link.route)).toContain("/dashboard/client");
  });

  it("syncs a new device and push subscription for a barber", () => {
    const state = createInitialMobileState();
    const result = syncDeviceActivation(state, {
      role: "barber_user",
      userEmail: "wave@bvrb3r.demo",
      barberId: "barber-wave"
    }, {
      deviceId: "wave-ipad-mini",
      deviceLabel: "Wave's iPad mini",
      platform: "ios",
      runtimeMode: "standalone",
      userAgent: "Mozilla/5.0",
      capabilities: {
        pushSupported: true,
        shareSupported: true,
        standaloneSupported: true,
        serviceWorkerSupported: true,
        notificationPermission: "granted"
      },
      subscription: {
        endpoint: "https://push.placeholder.bvrb3r/wave-ipad-mini",
        provider: "web_push_placeholder"
      }
    });

    expect(result.device.deviceId).toBe("wave-ipad-mini");
    expect(getActivePushSubscriptions(result.state, "wave@bvrb3r.demo").some((subscription) => subscription.deviceId === "wave-ipad-mini")).toBe(true);
  });

  it("persists native bridge metadata for wrapped-app subscriptions", () => {
    const state = createInitialMobileState();
    const result = syncDeviceActivation(state, {
      role: "owner",
      userEmail: "owner@bvrb3r.demo"
    }, {
      deviceId: "owner-native-iphone",
      platform: "ios",
      runtimeMode: "native_ios",
      userAgent: "Capacitor/7.0",
      appBundleId: "com.bvrb3r.platform.ios",
      appVersion: "1.0.0",
      capabilities: {
        pushSupported: true,
        shareSupported: true,
        standaloneSupported: true,
        serviceWorkerSupported: false,
        notificationPermission: "default"
      },
      subscription: {
        endpoint: "native://ios/owner-native-iphone",
        provider: "apns",
        nativeBridge: "apns",
        appBundleId: "com.bvrb3r.platform.ios",
        appVersion: "1.0.0"
      }
    });

    expect(result.pushSubscription?.provider).toBe("apns");
    expect(result.pushSubscription?.nativeBridge).toBe("apns");
    expect(result.pushSubscription?.appBundleId).toBe("com.bvrb3r.platform.ios");
    expect(result.pushSubscription?.appVersion).toBe("1.0.0");
  });

  it("rotates prior native tokens when the same device refreshes", () => {
    const state = createInitialMobileState();
    const result = registerNativePushToken(state, {
      role: "client",
      userEmail: "client@bvrb3r.demo",
      clientId: "client-jordan"
    }, {
      deviceId: "iphone-jordan-primary",
      provider: "apns",
      token: "new-apns-token-value-1234567890",
      environment: "production",
      runtimeMode: "native_ios",
      bundleOrPackageId: "com.bvrb3r.platform.ios",
      appVersion: "1.0.0"
    });

    const activeTokens = getActiveNativePushTokens(result.state, "client@bvrb3r.demo");
    const rotated = result.state.nativePushTokens.find((token) => token.id === "native-token-client-jordan-ios");

    expect(activeTokens).toHaveLength(1);
    expect(activeTokens[0]?.tokenHash).not.toContain("new-apns-token-value-1234567890");
    expect(activeTokens[0]?.status).toBe("active");
    expect(rotated?.status).toBe("rotated");
  });

  it("revokes native tokens by device id and provider", () => {
    const state = createInitialMobileState();
    const result = revokeNativePushToken(state, {
      role: "client",
      userEmail: "client@bvrb3r.demo",
      clientId: "client-jordan"
    }, {
      deviceId: "iphone-jordan-primary",
      provider: "apns"
    });

    expect(getActiveNativePushTokens(result.state, "client@bvrb3r.demo")).toHaveLength(0);
  });

  it("revokes push subscriptions by device id", () => {
    const state = createInitialMobileState();
    const result = revokePushSubscription(state, {
      role: "client",
      userEmail: "client@bvrb3r.demo",
      clientId: "client-jordan"
    }, "iphone-jordan-primary");

    expect(getActivePushSubscriptions(result.state, "client@bvrb3r.demo")).toHaveLength(0);
  });

  it("records deep-link opens with app and web routing", () => {
    const state = createInitialMobileState();
    const result = recordDeepLinkOpen(state, {
      role: "owner",
      userEmail: "owner@bvrb3r.demo"
    }, {
      route: "/dashboard/owner",
      label: "Owner dashboard",
      source: "push"
    });

    expect(result.record.webUrl).toContain("/dashboard/owner");
    expect(result.record.appUrl).toContain("bvrb3r://open?href=");
  });

  it("revokes expired subscriptions and marks long-stale native tokens", () => {
    const state = createInitialMobileState();
    state.pushSubscriptions.unshift({
      id: "push-expired-client-jordan",
      deviceId: "client-jordan-expired-device",
      userEmail: "client@bvrb3r.demo",
      role: "client",
      endpoint: "https://push.placeholder.bvrb3r/expired-client-jordan",
      provider: "web_push_placeholder",
      platform: "android",
      runtimeMode: "browser",
      status: "active",
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
      lastSeenAt: "2026-01-01T12:00:00.000Z",
      lastValidatedAt: "2026-01-01T12:00:00.000Z",
      expirationTime: "2026-01-05T12:00:00.000Z"
    });
    state.nativePushTokens.unshift({
      id: "native-token-client-jordan-stale",
      deviceId: "iphone-client-jordan-stale",
      userEmail: "client@bvrb3r.demo",
      role: "client",
      provider: "apns",
      tokenHash: "token-hash-stale",
      tokenPreview: "...stale",
      environment: "production",
      status: "active",
      runtimeMode: "native_ios",
      bundleOrPackageId: "com.bvrb3r.platform.ios",
      appVersion: "1.0.0",
      lastRegisteredAt: "2026-01-01T12:00:00.000Z",
      lastRefreshedAt: "2026-01-01T12:00:00.000Z",
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z"
    });

    const nextState = syncMobileStateLifecycle(state, "2026-03-26T12:00:00.000Z");
    const summary = getMobileActivationSummary(nextState, {
      role: "client",
      userEmail: "client@bvrb3r.demo",
      clientId: "client-jordan"
    });

    expect(nextState.pushSubscriptions.find((subscription) => subscription.id === "push-expired-client-jordan")?.status).toBe("revoked");
    expect(nextState.nativePushTokens.find((token) => token.id === "native-token-client-jordan-stale")?.status).toBe("stale");
    expect(summary.nativeTokenSummary.stale).toBeGreaterThan(0);
  });
});
