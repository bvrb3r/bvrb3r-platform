"use client";

import { createContext, startTransition, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { BellRing, Download, Share2, Signal, SignalZero } from "lucide-react";
import { PushPermissionPrimer, type PushPrimerIntent } from "@/components/pwa/push-permission-primer";
import { Button } from "@/components/ui/button";
import type { AppRuntimeMode, DeviceCapabilityRecord, MobilePlatformKind, PushPermissionState } from "@/types/mobile";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

interface PwaContextValue {
  isOnline: boolean;
  isStandalone: boolean;
  runtimeMode: AppRuntimeMode;
  deviceId: string | null;
  pushSupported: boolean;
  pushPermission: PushPermissionState;
  pushEnabled: boolean;
  requestPushPrimer: (intent: PushPrimerIntent) => { opened: boolean; message: string };
  disablePush: () => Promise<void>;
}

const DISMISS_INSTALL_KEY = "bvrb3r-pwa-install-dismissed-at";
const DEVICE_KEY = "bvrb3r-device-id";
const PUSH_ACTIVE_KEY = "bvrb3r-pwa-push-active";
const PUSH_PRIMER_SESSION_KEY = "bvrb3r-push-primer-session-decision";
const DISMISS_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;
const PwaContext = createContext<PwaContextValue | null>(null);

type PushPrimerSessionDecision = "deferred" | "denied";

function isClientDemoRuntime() {
  return process.env.NEXT_PUBLIC_AUTH_MODE === "demo"
    || !(
      process.env.NEXT_PUBLIC_SUPABASE_URL
      && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
}

function getCapacitorBridge(): CapacitorBridge | null {
  if (typeof window === "undefined") {
    return null;
  }

  const maybeBridge = (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
  return maybeBridge ?? null;
}

function isIosDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const matchesStandalone = typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)").matches : false;
  return matchesStandalone || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function resolveNativeRuntimeMode(): AppRuntimeMode | null {
  const bridge = getCapacitorBridge();
  if (!bridge?.isNativePlatform?.()) {
    return null;
  }

  const platform = bridge.getPlatform?.();
  if (platform === "ios") {
    return "native_ios";
  }

  if (platform === "android") {
    return "native_android";
  }

  return "native_wrap_ready";
}

function isNativeRuntimeMode(runtimeMode: AppRuntimeMode) {
  return runtimeMode === "native_ios" || runtimeMode === "native_android";
}

function resolveRuntimeMode(isStandalone: boolean): AppRuntimeMode {
  const nativeRuntimeMode = resolveNativeRuntimeMode();
  if (nativeRuntimeMode) {
    return nativeRuntimeMode;
  }

  if (isStandalone) {
    return "standalone";
  }

  return process.env.NEXT_PUBLIC_APP_RUNTIME === "native_wrap_ready" ? "native_wrap_ready" : "browser";
}

function getPushPermission(runtimeMode?: AppRuntimeMode): PushPermissionState {
  if (runtimeMode && isNativeRuntimeMode(runtimeMode)) {
    return "default";
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission as PushPermissionState;
}

function getPlatform(): MobilePlatformKind {
  const nativeRuntimeMode = resolveNativeRuntimeMode();
  if (nativeRuntimeMode === "native_ios") {
    return "ios";
  }
  if (nativeRuntimeMode === "native_android") {
    return "android";
  }

  if (typeof navigator === "undefined") {
    return "unknown";
  }

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) {
    return "ios";
  }
  if (ua.includes("android")) {
    return "android";
  }
  if (ua.includes("windows")) {
    return "windows";
  }
  if (ua.includes("mac os")) {
    return "macos";
  }
  if (ua.includes("linux")) {
    return "linux";
  }
  return "unknown";
}

function getPushRecoveryInstructions(runtimeMode: AppRuntimeMode) {
  const platform = getPlatform();
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent.toLowerCase();

  if (runtimeMode === "native_ios" || platform === "ios") {
    return "On iPhone or iPad, open Settings → Notifications → BVRB3R, then turn on Allow Notifications. If BVRB3R is not listed, add it to your Home Screen and retry from the installed app.";
  }

  if (runtimeMode === "native_android") {
    return "On Android, open Settings → Notifications → App notifications → BVRB3R, then turn notifications on.";
  }

  if (platform === "android") {
    return "On Android Chrome, open Chrome → Settings → Site settings → Notifications → BVRB3R, then choose Allow and reload the app.";
  }

  if (platform === "macos" && userAgent.includes("safari") && !userAgent.includes("chrome") && !userAgent.includes("chromium")) {
    return "On Mac Safari, open Safari → Settings → Websites → Notifications, find BVRB3R, choose Allow, then reload the app.";
  }

  if (platform === "windows") {
    return "In Chrome or Edge, select the site controls beside the address → Site settings → Notifications → Allow, then reload BVRB3R.";
  }

  return "Open this browser’s site settings, set Notifications for BVRB3R to Allow, then reload the app.";
}

function getOrCreateDeviceId() {
  if (typeof window === "undefined") {
    return null;
  }

  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) {
    return existing;
  }

  const next = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(DEVICE_KEY, next);
  return next;
}

function getCapabilities(permission: PushPermissionState, isStandalone: boolean, runtimeMode: AppRuntimeMode): DeviceCapabilityRecord {
  const nativeRuntime = isNativeRuntimeMode(runtimeMode);
  const hasWindow = typeof window !== "undefined";
  const hasNavigator = typeof navigator !== "undefined";
  return {
    pushSupported: nativeRuntime || hasWindow && hasNavigator && "Notification" in window && "serviceWorker" in navigator,
    shareSupported: hasNavigator && typeof navigator.share === "function",
    standaloneSupported: nativeRuntime || isStandalone || hasWindow && typeof window.matchMedia === "function",
    serviceWorkerSupported: nativeRuntime ? false : hasNavigator && "serviceWorker" in navigator,
    notificationPermission: permission
  };
}

function toUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function arrayBufferToBase64(buffer: ArrayBuffer | null) {
  if (!buffer) {
    return undefined;
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function getNativeSubscriptionPayload(deviceId: string) {
  const platform = getPlatform();
  const provider = platform === "ios" ? "apns" : platform === "android" ? "fcm" : "native_bridge_placeholder";
  const nativeBridge = platform === "ios" ? "apns" : platform === "android" ? "fcm" : undefined;

  return {
    endpoint: `native://${platform}/${deviceId}`,
    provider,
    nativeBridge,
    appBundleId: process.env.NEXT_PUBLIC_IOS_BUNDLE_ID ?? process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME,
    appVersion: "native-wrap-ready"
  } as SyncSubscriptionPayload;
}

function getNativeTokenBridgeProvider(runtimeMode: AppRuntimeMode) {
  return runtimeMode === "native_ios" ? "apns" : "fcm";
}

function getNativeBundleOrPackageId(runtimeMode: AppRuntimeMode) {
  return runtimeMode === "native_ios"
    ? process.env.NEXT_PUBLIC_IOS_BUNDLE_ID
    : process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME;
}

function getNativeBridgeEnvironment() {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error((body.error as string | undefined) ?? `Request failed with status ${response.status}`);
  }

  return body as T;
}

export function usePwa() {
  const context = useContext(PwaContext);
  if (!context) {
    throw new Error("usePwa must be used within the PwaProvider.");
  }

  return context;
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(false);
  const [installState, setInstallState] = useState<"idle" | "prompting" | "accepted">("idle");
  const [pushPermission, setPushPermission] = useState<PushPermissionState>("unsupported");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushState, setPushState] = useState<"idle" | "activating" | "active" | "error">("idle");
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushPrimerIntent, setPushPrimerIntent] = useState<PushPrimerIntent | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [presenceSyncTick, setPresenceSyncTick] = useState(0);

  const runtimeMode = resolveRuntimeMode(isStandalone);
  const nativeRuntime = isNativeRuntimeMode(runtimeMode);

  useEffect(() => {
    const currentRuntimeMode = resolveRuntimeMode(isStandaloneMode());
    setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    setIsStandalone(isStandaloneMode());
    const currentPermission = getPushPermission(currentRuntimeMode);
    setPushPermission(currentPermission);
    setDeviceId(getOrCreateDeviceId());
    if (typeof window === "undefined") {
      return;
    }

    const dismissedAt = window.localStorage.getItem(DISMISS_INSTALL_KEY);
    if (dismissedAt) {
      const age = Date.now() - Number(dismissedAt);
      setDismissedInstall(Number.isFinite(age) && age < DISMISS_WINDOW_MS);
    }

    if (currentPermission === "granted") {
      window.sessionStorage.removeItem(PUSH_PRIMER_SESSION_KEY);
    }

    setPushEnabled(window.localStorage.getItem(PUSH_ACTIVE_KEY) === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => {
      setIsOnline(true);
      setPresenceSyncTick((current) => current + 1);
    };
    const handleOffline = () => setIsOnline(false);
    const handleBeforeInstallPrompt = (event: Event) => {
      if (nativeRuntime) {
        return;
      }
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      startTransition(() => {
        setInstallState("accepted");
        setInstallEvent(null);
        setIsStandalone(true);
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [nativeRuntime]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResume = () => {
      const currentStandalone = isStandaloneMode();
      const currentRuntimeMode = resolveRuntimeMode(currentStandalone);
      setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);
      setIsStandalone(currentStandalone);
      const currentPermission = getPushPermission(currentRuntimeMode);
      setPushPermission(currentPermission);
      if (currentPermission === "granted") {
        window.sessionStorage.removeItem(PUSH_PRIMER_SESSION_KEY);
      }
      setPresenceSyncTick((current) => current + 1);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleResume();
      }
    };

    window.addEventListener("pageshow", handleResume);
    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleVisibility);

    const nativeAppPlugin = (window as Window & {
      Capacitor?: {
        Plugins?: {
          App?: {
            addListener?: (eventName: string, listener: (event: { isActive?: boolean }) => void) => Promise<{ remove: () => void }> | { remove: () => void };
          };
        };
      };
    }).Capacitor?.Plugins?.App;

    let removeNativeListener: (() => void) | undefined;
    if (nativeAppPlugin?.addListener) {
      const maybeListener = nativeAppPlugin.addListener("appStateChange", (event) => {
        if (event.isActive) {
          handleResume();
        }
      });

      Promise.resolve(maybeListener).then((listener) => {
        removeNativeListener = () => listener.remove();
      }).catch(() => {
        removeNativeListener = undefined;
      });
    }

    return () => {
      window.removeEventListener("pageshow", handleResume);
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleVisibility);
      removeNativeListener?.();
    };
  }, []);

  useEffect(() => {
    if (nativeRuntime || typeof window === "undefined" || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Keep the app stable even if service worker registration fails locally.
    });
  }, [nativeRuntime]);

  useEffect(() => {
    if (typeof navigator === "undefined") {
      return;
    }
    if (isClientDemoRuntime()) {
      return;
    }

    let cancelled = false;

    async function syncDevicePresence() {
      if (!deviceId || !isOnline) {
        return;
      }

      const isRoleSurface = pathname?.startsWith("/dashboard") || pathname === "/referrals";
      if (!isRoleSurface) {
        return;
      }

      const permission = getPushPermission(runtimeMode);
      let subscriptionPayload: SyncSubscriptionPayload | undefined;

      if (!nativeRuntime && permission === "granted" && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
        try {
          const registration = await navigator.serviceWorker.ready;
          const existingSubscription = await registration.pushManager.getSubscription();
          if (existingSubscription) {
            subscriptionPayload = {
              endpoint: existingSubscription.endpoint,
              p256dhKey: arrayBufferToBase64(existingSubscription.getKey("p256dh")),
              authKey: arrayBufferToBase64(existingSubscription.getKey("auth")),
              expirationTime: existingSubscription.expirationTime ? new Date(existingSubscription.expirationTime).toISOString() : undefined,
              provider: process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ? "web_push" : "web_push_placeholder"
            };
            setPushEnabled(true);
            setPushState("active");
          }
        } catch {
          // Presence sync should not break the shell.
        }
      }

      if (nativeRuntime && typeof window !== "undefined" && window.localStorage.getItem(PUSH_ACTIVE_KEY) === "true") {
        subscriptionPayload = getNativeSubscriptionPayload(deviceId);
      }

      try {
        await requestJson("/api/mobile/push/subscriptions", {
          method: "POST",
          body: JSON.stringify({
            deviceId,
            deviceLabel: `${getPlatform()} ${runtimeMode} app`,
            platform: getPlatform(),
            runtimeMode,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            appBundleId: process.env.NEXT_PUBLIC_IOS_BUNDLE_ID ?? process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME,
            appVersion: nativeRuntime ? "native-wrap-ready" : undefined,
            capabilities: getCapabilities(permission, isStandalone, runtimeMode),
            subscription: subscriptionPayload
          })
        });
        if (nativeRuntime && subscriptionPayload) {
          await requestJson("/api/mobile/native/tokens", {
            method: "POST",
            body: JSON.stringify({
              deviceId,
              provider: getNativeTokenBridgeProvider(runtimeMode),
              token: `pending-bridge-${deviceId}`,
              status: "pending",
              environment: getNativeBridgeEnvironment(),
              bundleOrPackageId: getNativeBundleOrPackageId(runtimeMode),
              appVersion: "native-wrap-ready",
              runtimeMode
            })
          });
        }
        if (!cancelled) {
          void queryClient.invalidateQueries({ queryKey: ["mobile", "activation"] });
        }
      } catch {
        // Keep public and local browsing stable if presence sync cannot be recorded.
      }
    }

    void syncDevicePresence();

    return () => {
      cancelled = true;
    };
  }, [deviceId, isOnline, isStandalone, nativeRuntime, pathname, presenceSyncTick, queryClient, runtimeMode]);

  const showInstallPrompt = useMemo(() => {
    if (nativeRuntime || dismissedInstall || isStandalone || installState === "accepted") {
      return false;
    }

    return Boolean(installEvent) || isIosDevice();
  }, [dismissedInstall, installEvent, installState, isStandalone, nativeRuntime]);

  async function handleInstall() {
    if (!installEvent) {
      return;
    }

    setInstallState("prompting");
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallState("accepted");
      setInstallEvent(null);
      setIsStandalone(true);
      return;
    }

    setInstallState("idle");
  }

  function dismissInstallPrompt() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_INSTALL_KEY, String(Date.now()));
    }
    setDismissedInstall(true);
  }

  function persistPushPrimerDecision(decision: PushPrimerSessionDecision | null) {
    if (typeof window !== "undefined") {
      if (decision) {
        window.sessionStorage.setItem(PUSH_PRIMER_SESSION_KEY, decision);
      } else {
        window.sessionStorage.removeItem(PUSH_PRIMER_SESSION_KEY);
      }
    }
  }

  function requestPushPrimer(intent: PushPrimerIntent) {
    if (pushEnabled) {
      return { opened: false, message: "Push alerts are already live for this device." };
    }

    const currentPermission = getPushPermission(runtimeMode);
    setPushPermission(currentPermission);
    if (!nativeRuntime && currentPermission === "unsupported") {
      return { opened: false, message: "Push alerts are not available on this device yet." };
    }

    const storedDecision = typeof window === "undefined" ? null : window.sessionStorage.getItem(PUSH_PRIMER_SESSION_KEY);
    if (storedDecision === "deferred" || storedDecision === "denied") {
      return {
        opened: false,
        message: storedDecision === "denied"
          ? "Push permission was blocked for this session. Use your device settings to allow it, then return to BVRB3R."
          : "Push setup was deferred for this session. You can try again after reopening BVRB3R."
      };
    }

    if (currentPermission === "denied") {
      persistPushPrimerDecision("denied");
    }

    setPushMessage(null);
    setPushState("idle");
    setPushPrimerIntent(intent);
    return { opened: true, message: "Review the alert benefits before enabling push." };
  }

  function dismissPushPrimer() {
    persistPushPrimerDecision(pushPermission === "denied" ? "denied" : "deferred");
    setPushPrimerIntent(null);
    setPushMessage(null);
  }

  async function ensureServiceWorker() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return null;
    }

    if (process.env.NODE_ENV === "production") {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }

    return navigator.serviceWorker.ready;
  }

  async function activatePushFromPrimer() {
    if (typeof window === "undefined" || !deviceId) {
      return { ok: false, message: "This device is not ready for push activation yet." };
    }

    setPushState("activating");
    setPushMessage(null);

    try {
      let subscriptionPayload: SyncSubscriptionPayload;
      let message = "Push alerts are live for this device.";

      if (nativeRuntime) {
        subscriptionPayload = getNativeSubscriptionPayload(deviceId);
        setPushPermission("granted");
        message = "Native alerts are registered for this device. Delivery will use the wrapped-app bridge as it becomes available.";
      } else {
        if (!("Notification" in window) || !("serviceWorker" in navigator)) {
          setPushPermission("unsupported");
          setPushState("error");
          message = "Push alerts are not available on this device yet.";
          setPushMessage(message);
          return { ok: false, message };
        }

        const permission = Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
        setPushPermission(permission as PushPermissionState);

        if (permission !== "granted") {
          setPushState("idle");
          message = permission === "denied"
            ? "Push alerts were blocked. You can enable them later in browser settings."
            : "Push alerts were not enabled yet.";
          setPushMessage(message);
          persistPushPrimerDecision(permission === "denied" ? "denied" : "deferred");
          if (permission !== "denied") {
            setPushPrimerIntent(null);
          }
          return { ok: false, message };
        }

        const registration = await ensureServiceWorker();
        if (registration?.pushManager && process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY) {
          const existing = await registration.pushManager.getSubscription();
          const subscription = existing ?? await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: toUint8Array(process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY)
          });
          subscriptionPayload = {
            endpoint: subscription.endpoint,
            p256dhKey: arrayBufferToBase64(subscription.getKey("p256dh")),
            authKey: arrayBufferToBase64(subscription.getKey("auth")),
            expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : undefined,
            provider: "web_push"
          };
        } else {
          subscriptionPayload = {
            endpoint: `https://push.placeholder.bvrb3r/${deviceId}`,
            provider: "web_push_placeholder"
          };
        }
      }

      await requestJson("/api/mobile/push/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          deviceId,
          deviceLabel: `${getPlatform()} ${runtimeMode} app`,
          platform: getPlatform(),
          runtimeMode,
          userAgent: navigator.userAgent,
          appBundleId: process.env.NEXT_PUBLIC_IOS_BUNDLE_ID ?? process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME,
          appVersion: nativeRuntime ? "native-wrap-ready" : undefined,
          capabilities: getCapabilities("granted", isStandalone, runtimeMode),
          subscription: subscriptionPayload
        })
      });

      if (nativeRuntime) {
        await requestJson("/api/mobile/native/tokens", {
          method: "POST",
          body: JSON.stringify({
            deviceId,
            provider: getNativeTokenBridgeProvider(runtimeMode),
            token: `pending-bridge-${deviceId}`,
            status: "pending",
            environment: getNativeBridgeEnvironment(),
            bundleOrPackageId: getNativeBundleOrPackageId(runtimeMode),
            appVersion: "native-wrap-ready",
            runtimeMode
          })
        });
      }

      window.localStorage.setItem(PUSH_ACTIVE_KEY, "true");
      startTransition(() => {
        setPushEnabled(true);
        setPushState("active");
        setPushMessage(message);
        setPushPrimerIntent(null);
      });
      persistPushPrimerDecision(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "activation"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement"] })
      ]);
      return { ok: true, message };
    } catch {
      setPushState("error");
      const message = "Something went wrong while enabling push alerts. Please try again.";
      setPushMessage(message);
      return { ok: false, message };
    }
  }

  async function disablePush() {
    if (!deviceId || typeof window === "undefined") {
      return;
    }

    try {
      if (!nativeRuntime && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        await subscription?.unsubscribe();
      }

      if (nativeRuntime) {
        await requestJson(`/api/mobile/native/tokens?deviceId=${encodeURIComponent(deviceId)}&provider=${encodeURIComponent(getNativeTokenBridgeProvider(runtimeMode))}`, {
          method: "DELETE"
        });
      }

      await requestJson(`/api/mobile/push/subscriptions?deviceId=${encodeURIComponent(deviceId)}`, {
        method: "DELETE"
      });
      window.localStorage.setItem(PUSH_ACTIVE_KEY, "false");
      persistPushPrimerDecision(null);
      startTransition(() => {
        setPushEnabled(false);
        setPushState("idle");
        setPushMessage("Push alerts were turned off for this device.");
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "activation"] }),
        queryClient.invalidateQueries({ queryKey: ["engagement"] })
      ]);
    } catch {
      setPushState("error");
      setPushMessage("Something went wrong while turning off push alerts. Please try again.");
    }
  }

  const contextValue: PwaContextValue = {
    isOnline,
    isStandalone,
    runtimeMode,
    deviceId,
    pushSupported: pushPermission !== "unsupported" || nativeRuntime,
    pushPermission,
    pushEnabled,
    requestPushPrimer,
    disablePush
  };

  return (
    <PwaContext.Provider value={contextValue}>
      {children}
      {!isOnline ? (
        <div className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-50 flex justify-center sm:inset-x-6">
          <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-[24px] border border-amber-300/20 bg-[rgba(13,13,13,0.94)] px-4 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.38)] backdrop-blur">
            <div className="rounded-full border border-amber-300/18 bg-amber-300/10 p-2 text-amber-200">
              <SignalZero className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">Offline mode</p>
              <p className="mt-1 text-sm text-white/72">Cached discovery, booking shell, and already-opened screens remain available, but booking, checkout, and live operational writes still need a connection.</p>
            </div>
            <Signal className="hidden h-4 w-4 text-amber-200 sm:block" />
          </div>
        </div>
      ) : null}
      {showInstallPrompt && !pushPrimerIntent ? (
        <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+7.5rem)] z-50 flex justify-center sm:inset-x-6 lg:bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <div className="pointer-events-auto w-full max-w-xl rounded-[28px] border border-[#C4F24E]/16 bg-[rgba(8,8,8,0.94)] p-4 shadow-[0_22px_48px_rgba(0,0,0,0.42)] backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="rounded-full border border-[#C4F24E]/18 bg-[#C4F24E]/10 p-2 text-[#e4f9b8]">
                {installEvent ? <Download className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e4f9b8]">Install the BVRB3R app</p>
                <p className="mt-1 text-sm text-white/76">
                  {installEvent
                    ? "Add the platform to your home screen for faster launch, persistent sessions, and a cleaner app-style experience."
                    : "On iPhone or iPad, use Share then Add to Home Screen to install the BVRB3R app shell."}
                </p>
                <p className="mt-3 flex items-center gap-2 text-xs text-white/48">
                  <BellRing className="h-4 w-4 text-[#d9f985]" />
                  Push subscriptions, deep links, and notification delivery are now wired into the mobile layer.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {installEvent ? (
                <Button className="h-11 px-5" disabled={installState === "prompting"} onClick={() => void handleInstall()}>
                  {installState === "prompting" ? "Opening prompt..." : "Install app"}
                </Button>
              ) : null}
              <Button type="button" variant="secondary" className="h-11 px-5" onClick={dismissInstallPrompt}>
                Not now
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {pushPrimerIntent ? (
        <PushPermissionPrimer
          intent={pushPrimerIntent}
          permission={pushPermission}
          activating={pushState === "activating"}
          message={pushMessage}
          recoveryInstructions={getPushRecoveryInstructions(runtimeMode)}
          onEnable={() => void activatePushFromPrimer()}
          onNotNow={dismissPushPrimer}
        />
      ) : null}
    </PwaContext.Provider>
  );
}

type SyncSubscriptionPayload = {
  endpoint: string;
  p256dhKey?: string;
  authKey?: string;
  expirationTime?: string;
  provider: "web_push" | "web_push_placeholder" | "apns" | "fcm" | "native_bridge_placeholder";
  nativeBridge?: "web_push" | "apns" | "fcm";
  appBundleId?: string;
  appVersion?: string;
};
