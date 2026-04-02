import {
  hasEmailDeliveryConfig,
  hasNativeApnsBridgeConfig,
  hasNativeFcmBridgeConfig,
  hasTwilioDeliveryConfig,
  hasWebPushExecutionConfig,
  runtimeConfig
} from "@/lib/config/runtime";
import { buildDefaultDeepLinks, buildRoleHomeLink } from "@/lib/mobile/links";
import type { AppRuntimeMode, NativeBootstrapSummary, PushProviderKind } from "@/types/mobile";
import type { Role } from "@/types/domain";

function getUniversalLinkHost() {
  try {
    return new URL(runtimeConfig.appUrl).host;
  } catch {
    return "localhost";
  }
}

function getSupportedProviders(): PushProviderKind[] {
  const providers: PushProviderKind[] = [hasWebPushExecutionConfig() ? "web_push" : "web_push_placeholder"];
  providers.push(hasNativeApnsBridgeConfig() ? "apns" : "native_bridge_placeholder");
  providers.push(hasNativeFcmBridgeConfig() ? "fcm" : "native_bridge_placeholder");
  return providers;
}

export function resolveNativeRuntimeMode(): AppRuntimeMode {
  if (runtimeConfig.mobileRuntime === "native_ios" || runtimeConfig.mobileRuntime === "native_android") {
    return runtimeConfig.mobileRuntime;
  }

  return "native_wrap_ready";
}

export function buildNativeBootstrapSummary(role: Role = "client"): NativeBootstrapSummary {
  return {
    appName: runtimeConfig.appName,
    scheme: runtimeConfig.appLinkScheme,
    runtimeMode: resolveNativeRuntimeMode(),
    universalLinkHost: getUniversalLinkHost(),
    iosBundleId: runtimeConfig.nativeIosBundleId,
    androidPackageName: runtimeConfig.nativeAndroidPackageName,
    appStoreId: runtimeConfig.nativeAppStoreId || undefined,
    startLinks: [
      buildRoleHomeLink(role),
      ...buildDefaultDeepLinks(role).filter((link) => link.route !== buildRoleHomeLink(role).route)
    ],
    pushBridge: {
      webPushConfigured: hasWebPushExecutionConfig(),
      apnsBridgeReady: hasNativeApnsBridgeConfig(),
      fcmBridgeReady: hasNativeFcmBridgeConfig(),
      supportedProviders: getSupportedProviders()
    },
    tokenBridge: {
      registrationApi: "/api/mobile/native/tokens",
      revokeApi: "/api/mobile/native/tokens",
      storageMode: "server_hashed",
      supportsApnsRegistration: hasNativeApnsBridgeConfig(),
      supportsFcmRegistration: hasNativeFcmBridgeConfig(),
      refreshFlowReady: true
    },
    deliveryProviders: {
      emailConfigured: hasEmailDeliveryConfig(),
      smsConfigured: hasTwilioDeliveryConfig(),
      webPushConfigured: hasWebPushExecutionConfig()
    },
    releaseCandidate: {
      qaDocs: ["/MOBILE_DEVICE_QA.md", "/QA_MANUAL_CHECKLIST.md"],
      storeDocs: ["/STORE_LAUNCH_CHECKLIST.md"],
      certificationDocs: ["/RELEASE_CERTIFICATION.md", "/RELEASE_CANDIDATE_CERTIFICATION.md"]
    },
    launchAssets: [
      { kind: "icon", label: "PWA 192 icon", path: "/icons/pwa-192.png" },
      { kind: "icon", label: "PWA 512 icon", path: "/icons/pwa-512.png" },
      { kind: "icon", label: "Maskable icon", path: "/icons/pwa-maskable-512.png" },
      { kind: "splash", label: "Apple touch icon", path: "/icons/apple-touch-180.png" },
      { kind: "association_file", label: "Android asset links", path: "/.well-known/assetlinks.json" },
      { kind: "association_file", label: "Apple app-site association", path: "/apple-app-site-association" },
      { kind: "store_listing", label: "Launch metadata", path: "/STORE_LAUNCH_CHECKLIST.md" },
      { kind: "store_listing", label: "Release certification", path: "/RELEASE_CANDIDATE_CERTIFICATION.md" }
    ]
  };
}
