export type AuthRuntimeMode = "supabase" | "demo";
export type PaymentProviderKind = "stripe";
export type MobileRuntimeKind = "web" | "pwa" | "native_wrap_ready" | "native_ios" | "native_android";

function hasConfiguredValue(value?: string, placeholderTerms: string[] = ["placeholder"]) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  return !placeholderTerms.some((term) => normalized.includes(term));
}

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const runtimeConfig = {
  authMode: ((process.env.NEXT_PUBLIC_AUTH_MODE as AuthRuntimeMode | undefined) ??
    (hasSupabaseEnv ? "supabase" : "demo")) as AuthRuntimeMode,
  paymentProvider: ((process.env.PAYMENTS_PROVIDER as PaymentProviderKind | undefined) ??
    "stripe") as PaymentProviderKind,
  mediaBucket: process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET ?? "bvrb3r-media",
  demoRole: process.env.NEXT_PUBLIC_DEMO_ROLE ?? "owner",
  demoEmail: process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "owner@bvrb3r.demo",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "BVRB3R Platform",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  appLinkScheme: process.env.NEXT_PUBLIC_APP_LINK_SCHEME ?? "bvrb3r",
  mobileRuntime: ((process.env.NEXT_PUBLIC_APP_RUNTIME as MobileRuntimeKind | undefined) ??
    "pwa") as MobileRuntimeKind,
  capacitorServerUrl: process.env.CAPACITOR_SERVER_URL ?? "",
  deliveryEnvironment: process.env.DELIVERY_ENVIRONMENT ?? "development",
  webPushPublicKey: process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ?? "",
  webPushPrivateKey: process.env.WEB_PUSH_PRIVATE_KEY ?? "",
  webPushSubject: process.env.WEB_PUSH_SUBJECT ?? "mailto:owner@bvrb3r.app",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
  twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "notifications@bvrb3r.app",
  nativeIosBundleId: process.env.NEXT_PUBLIC_IOS_BUNDLE_ID ?? "com.bvrb3r.platform.ios",
  nativeIosTeamId: process.env.IOS_TEAM_ID ?? "",
  nativeIosKeyId: process.env.IOS_KEY_ID ?? "",
  nativeIosPrivateKey: process.env.IOS_PRIVATE_KEY ?? "",
  apnsUseSandbox: (process.env.APNS_USE_SANDBOX ?? "true") === "true",
  nativeAndroidPackageName: process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME ?? "com.bvrb3r.platform",
  nativeAndroidSha256: process.env.ANDROID_SIGNING_SHA256 ?? "",
  nativeAppStoreId: process.env.NEXT_PUBLIC_APP_STORE_ID ?? "",
  fcmProjectId: process.env.FCM_PROJECT_ID ?? "",
  fcmClientEmail: process.env.FCM_CLIENT_EMAIL ?? "",
  fcmPrivateKey: process.env.FCM_PRIVATE_KEY ?? "",
  fcmSenderId: process.env.FCM_SENDER_ID ?? ""
};

export function isSupabaseEnabled() {
  return hasSupabaseEnv && runtimeConfig.authMode === "supabase";
}

export function isDemoMode() {
  return !isSupabaseEnabled();
}

export function hasWebPushExecutionConfig() {
  return hasConfiguredValue(runtimeConfig.webPushPublicKey)
    && hasConfiguredValue(runtimeConfig.webPushPrivateKey)
    && hasConfiguredValue(runtimeConfig.webPushSubject, ["placeholder", "example"]);
}

export function hasTwilioDeliveryConfig() {
  return hasConfiguredValue(runtimeConfig.twilioAccountSid)
    && hasConfiguredValue(runtimeConfig.twilioAuthToken)
    && (hasConfiguredValue(runtimeConfig.twilioFromNumber) || hasConfiguredValue(runtimeConfig.twilioMessagingServiceSid));
}

export function hasEmailDeliveryConfig() {
  return hasConfiguredValue(runtimeConfig.resendApiKey)
    && hasConfiguredValue(runtimeConfig.resendFromEmail, ["placeholder", "example"]);
}

export function hasNativeApnsBridgeConfig() {
  return hasConfiguredValue(runtimeConfig.nativeIosBundleId, ["placeholder"])
    && hasConfiguredValue(runtimeConfig.nativeIosTeamId)
    && hasConfiguredValue(runtimeConfig.nativeIosKeyId)
    && hasConfiguredValue(runtimeConfig.nativeIosPrivateKey, ["placeholder", "example"]);
}

export function hasNativeFcmBridgeConfig() {
  return hasConfiguredValue(runtimeConfig.nativeAndroidPackageName, ["placeholder"])
    && hasConfiguredValue(runtimeConfig.fcmProjectId)
    && hasConfiguredValue(runtimeConfig.fcmClientEmail)
    && hasConfiguredValue(runtimeConfig.fcmPrivateKey, ["placeholder", "example"]);
}
