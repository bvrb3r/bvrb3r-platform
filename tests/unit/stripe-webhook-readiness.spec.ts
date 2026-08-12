import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

vi.mock("@/lib/engagement/live-delivery", () => ({
  getDeliveryProviderHealth: () => ({
    push: {
      webPushConfigured: true,
      apnsBridgeReady: false,
      fcmBridgeReady: false
    }
  })
}));

vi.mock("@/lib/mobile/native", () => ({
  buildNativeBootstrapSummary: () => ({})
}));

vi.mock("@/lib/config/runtime", () => ({
  isSupabaseEnabled: () => true,
  runtimeConfig: {
    appUrl: "https://staging.bvrb3r.app",
    authMode: "supabase",
    mobileRuntime: "native_wrap_ready",
    nativeAndroidPackageName: "com.bvrb3r.platform",
    nativeIosBundleId: "com.bvrb3r.platform.ios",
    capacitorServerUrl: "https://staging.bvrb3r.app"
  }
}));

import { buildReleaseReadinessSummary } from "@/lib/release/readiness";

const stripeSecretKeys = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "STRIPE_IDENTITY_WEBHOOK_SECRET"
] as const;

const originalStripeEnvironment = Object.fromEntries(
  stripeSecretKeys.map((key) => [key, process.env[key]])
);

function configureStripeSecrets() {
  for (const key of stripeSecretKeys) {
    process.env[key] = `${key.toLowerCase()}-configured`;
  }
}

function stripeCheck(id: string) {
  return buildReleaseReadinessSummary().checks.find((entry) => entry.id === id);
}

function runReleaseReadinessWithout(missingKey?: (typeof stripeSecretKeys)[number]) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "bvrb3r-release-readiness-"));
  const envEntries = [
    ["NEXT_PUBLIC_APP_URL", "https://staging.bvrb3r.app"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://staging.example.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-configured"],
    ["STRIPE_SECRET_KEY", "stripe-api-key-configured"],
    ["STRIPE_WEBHOOK_SECRET", "platform-webhook-secret-configured"],
    ["STRIPE_CONNECT_WEBHOOK_SECRET", "connect-webhook-secret-configured"],
    ["STRIPE_IDENTITY_WEBHOOK_SECRET", "identity-webhook-secret-configured"],
    ["AUTOMATION_PROCESS_SECRET", "automation-secret-configured"]
  ].filter(([key]) => key !== missingKey);

  try {
    writeFileSync(
      join(fixtureRoot, ".env.local"),
      `${envEntries.map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
      "utf8"
    );
    mkdirSync(join(fixtureRoot, "android", "app"), { recursive: true });
    writeFileSync(join(fixtureRoot, "android", "app", "build.gradle"), "// fixture\n", "utf8");
    for (const file of [
      "MOBILE_DEVICE_QA.md",
      "RELEASE_CANDIDATE_CERTIFICATION.md",
      "STORE_LAUNCH_CHECKLIST.md"
    ]) {
      writeFileSync(join(fixtureRoot, file), "# Fixture\n", "utf8");
    }

    return spawnSync(process.execPath, [join(process.cwd(), "scripts", "release-readiness.mjs")], {
      cwd: fixtureRoot,
      encoding: "utf8"
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

afterEach(() => {
  for (const key of stripeSecretKeys) {
    const originalValue = originalStripeEnvironment[key];
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
});

describe("Stripe webhook release readiness", () => {
  it("marks the API key and all three dedicated webhook secrets ready when configured", () => {
    configureStripeSecrets();

    expect(stripeCheck("stripe-api-secret")?.status).toBe("ready");
    expect(stripeCheck("stripe-platform-webhook-secret")?.status).toBe("ready");
    expect(stripeCheck("stripe-connect-webhook-secret")?.status).toBe("ready");
    expect(stripeCheck("stripe-identity-webhook-secret")?.status).toBe("ready");

    const result = runReleaseReadinessWithout();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OK Stripe Platform webhook secret");
    expect(result.stdout).toContain("OK Stripe Connect webhook secret");
    expect(result.stdout).toContain("OK Stripe Identity webhook secret");
  });

  it.each([
    ["STRIPE_WEBHOOK_SECRET", "stripe-platform-webhook-secret", "Stripe Platform webhook secret"],
    ["STRIPE_CONNECT_WEBHOOK_SECRET", "stripe-connect-webhook-secret", "Stripe Connect webhook secret"],
    ["STRIPE_IDENTITY_WEBHOOK_SECRET", "stripe-identity-webhook-secret", "Stripe Identity webhook secret"]
  ] as const)("fails readiness when %s is missing", (missingKey, checkId, label) => {
    configureStripeSecrets();
    delete process.env[missingKey];

    expect(stripeCheck(checkId)).toMatchObject({
      status: "attention",
      detail: expect.stringContaining(missingKey)
    });

    const result = runReleaseReadinessWithout(missingKey);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`ATTN ${label}`);
    expect(result.stdout).toContain(`${missingKey} missing`);
  });
});
