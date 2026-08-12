import fs from "node:fs";
import path from "node:path";
import { getDeliveryProviderHealth } from "@/lib/engagement/live-delivery";
import { buildNativeBootstrapSummary } from "@/lib/mobile/native";
import { isSupabaseEnabled, runtimeConfig } from "@/lib/config/runtime";

export type ReleaseReadinessCheckStatus = "ready" | "attention";

export type ReleaseReadinessCheck = {
  id: string;
  label: string;
  status: ReleaseReadinessCheckStatus;
  detail: string;
};

export type ReleaseReadinessSummary = {
  generatedAt: string;
  summary: {
    readyCount: number;
    attentionCount: number;
  };
  runtime: {
    appUrl: string;
    authMode: string;
    mobileRuntime: string;
    androidPackageName: string;
    iosBundleId: string;
    capacitorServerUrl: string | null;
  };
  bootstrap: ReturnType<typeof buildNativeBootstrapSummary>;
  checks: ReleaseReadinessCheck[];
  docs: {
    mobileQa: string;
    releaseCertification: string;
    storeLaunch: string;
  };
};

function exists(relativePath: string) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

function check(id: string, label: string, condition: boolean, detail: { ready: string; attention: string }): ReleaseReadinessCheck {
  return {
    id,
    label,
    status: condition ? "ready" : "attention",
    detail: condition ? detail.ready : detail.attention
  };
}

export function buildReleaseReadinessSummary(): ReleaseReadinessSummary {
  const deliveryHealth = getDeliveryProviderHealth();
  const bootstrap = buildNativeBootstrapSummary("owner");
  const androidWrapperExists = exists("android\\app\\build.gradle") || exists("android\\app\\build.gradle.kts");
  const mobileQaDocExists = exists("MOBILE_DEVICE_QA.md");
  const releaseDocExists = exists("RELEASE_CANDIDATE_CERTIFICATION.md");
  const storeDocExists = exists("STORE_LAUNCH_CHECKLIST.md");
  const hasStripeSecret = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const hasStripeWebhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const hasStripeConnectWebhookSecret = Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim());
  const hasStripeIdentityWebhookSecret = Boolean(process.env.STRIPE_IDENTITY_WEBHOOK_SECRET?.trim());
  const hasAutomationSecret = Boolean(process.env.AUTOMATION_PROCESS_SECRET?.trim());
  const appUrlReady = /^https:\/\/|^http:\/\/localhost:3000$/i.test(runtimeConfig.appUrl);
  const pushReady = deliveryHealth.push.webPushConfigured || deliveryHealth.push.apnsBridgeReady || deliveryHealth.push.fcmBridgeReady;

  const checks: ReleaseReadinessCheck[] = [
    check("app-url", "App URL", appUrlReady, {
      ready: `App URL is ${runtimeConfig.appUrl}.`,
      attention: "App URL should be a production-safe HTTPS URL or localhost:3000 for local QA."
    }),
    check("supabase-auth", "Supabase auth/runtime", isSupabaseEnabled(), {
      ready: "Supabase-backed auth/runtime is configured.",
      attention: "Supabase runtime is not configured, so wrapped-app auth parity cannot be release-validated."
    }),
    check("stripe-api-secret", "Stripe API secret", hasStripeSecret, {
      ready: "Stripe API secret is configured.",
      attention: "STRIPE_SECRET_KEY must be configured for Stripe-backed billing and Connected Account operations."
    }),
    check("stripe-platform-webhook-secret", "Stripe Platform webhook secret", hasStripeWebhookSecret, {
      ready: "The Platform Money webhook has its dedicated signing secret.",
      attention: "STRIPE_WEBHOOK_SECRET must be configured exclusively for /api/stripe/webhook."
    }),
    check("stripe-connect-webhook-secret", "Stripe Connect webhook secret", hasStripeConnectWebhookSecret, {
      ready: "The Connected Account webhook has its dedicated signing secret.",
      attention: "STRIPE_CONNECT_WEBHOOK_SECRET must be configured exclusively for /api/stripe/connect/webhook."
    }),
    check("stripe-identity-webhook-secret", "Stripe Identity webhook secret", hasStripeIdentityWebhookSecret, {
      ready: "The Identity webhook has its dedicated signing secret.",
      attention: "STRIPE_IDENTITY_WEBHOOK_SECRET must be configured exclusively for /api/stripe/identity/webhook."
    }),
    check("automation-secret", "Scheduled execution secret", hasAutomationSecret, {
      ready: "Scheduled execution secret is configured.",
      attention: "AUTOMATION_PROCESS_SECRET is missing, so scheduled finance/growth execution cannot be release-checked."
    }),
    check("push-bridge", "Push delivery bridge", pushReady, {
      ready: "At least one push delivery path is configured.",
      attention: "Push/web-push/native bridge configuration needs attention before real-device notification QA."
    }),
    check("android-wrapper", "Android wrapper", androidWrapperExists, {
      ready: "Android wrapper project is present.",
      attention: "Android wrapper project files are missing."
    }),
    check("docs-mobile", "Mobile QA docs", mobileQaDocExists && releaseDocExists && storeDocExists, {
      ready: "Mobile QA and release certification docs are present.",
      attention: "Mobile QA or release certification docs are missing."
    }),
    check("native-identifiers", "Native bundle/package identifiers", Boolean(runtimeConfig.nativeAndroidPackageName && runtimeConfig.nativeIosBundleId), {
      ready: "Android and iOS identifiers are present.",
      attention: "Native bundle/package identifiers are incomplete."
    })
  ];

  const readyCount = checks.filter((entry) => entry.status === "ready").length;
  const attentionCount = checks.length - readyCount;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      readyCount,
      attentionCount
    },
    runtime: {
      appUrl: runtimeConfig.appUrl,
      authMode: runtimeConfig.authMode,
      mobileRuntime: runtimeConfig.mobileRuntime,
      androidPackageName: runtimeConfig.nativeAndroidPackageName,
      iosBundleId: runtimeConfig.nativeIosBundleId,
      capacitorServerUrl: runtimeConfig.capacitorServerUrl || null
    },
    bootstrap,
    checks,
    docs: {
      mobileQa: "/MOBILE_DEVICE_QA.md",
      releaseCertification: "/RELEASE_CANDIDATE_CERTIFICATION.md",
      storeLaunch: "/STORE_LAUNCH_CHECKLIST.md"
    }
  };
}
