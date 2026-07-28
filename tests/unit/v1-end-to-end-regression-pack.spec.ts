import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const SPEC_REPO_PATH = "tests/unit/v1-end-to-end-regression-pack.spec.ts";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function projectPathExists(relativePath: string) {
  return existsSync(path.join(root, relativePath));
}

const coverageGroups = [
  {
    name: "onboarding and final activation",
    testFiles: [
      "tests/unit/onboarding-final-activation.spec.ts",
      "tests/unit/onboarding-final-activation-evidence.spec.ts",
      "tests/unit/onboarding-final-activation-ui.spec.tsx",
      "tests/unit/client-onboarding-path.spec.tsx",
      "tests/unit/barber-onboarding-path.spec.tsx",
      "tests/unit/shop-owner-onboarding-path.spec.tsx"
    ],
    surfaces: [
      "app/onboarding/final-activation/page.tsx",
      "components/onboarding/final-activation-workspace.tsx",
      "components/onboarding/client-onboarding-workspace.tsx",
      "components/onboarding/barber-onboarding-workspace.tsx",
      "components/onboarding/shop-owner-onboarding-workspace.tsx"
    ]
  },
  {
    name: "client runtime loop",
    testFiles: [
      "tests/unit/client-home-screen.spec.tsx",
      "tests/unit/client-search-screen.spec.tsx",
      "tests/unit/client-bookings-screen.spec.tsx",
      "tests/unit/client-messages-screen.spec.tsx",
      "tests/unit/client-paywall-locked-features.spec.ts"
    ],
    surfaces: [
      "app/(platform)/dashboard/client/page.tsx",
      "app/(platform)/dashboard/client/search/page.tsx",
      "app/(platform)/dashboard/client/bookings/page.tsx",
      "app/(platform)/dashboard/client/messages/page.tsx"
    ]
  },
  {
    name: "barber runtime loop",
    testFiles: [
      "tests/unit/barber-calendar-screen.spec.tsx",
      "tests/unit/barber-checkout-screen.spec.tsx",
      "tests/unit/barber-appointment-complete-route.spec.ts",
      "tests/unit/barber-workspace.spec.tsx"
    ],
    surfaces: [
      "app/(platform)/dashboard/barber/page.tsx",
      "app/(platform)/dashboard/barber/calendar/page.tsx",
      "app/(platform)/dashboard/barber/checkout/page.tsx",
      "app/api/barber/appointments/[id]/complete/route.ts"
    ]
  },
  {
    name: "shop owner runtime loop",
    testFiles: [
      "tests/unit/owner-overview.spec.tsx",
      "tests/unit/owner-schedule-workspace.spec.tsx",
      "tests/unit/owner-money-workspace.spec.tsx",
      "tests/unit/owner-settings-workspace.spec.tsx",
      "tests/unit/shop-owner-paywall-locked-features.spec.tsx"
    ],
    surfaces: [
      "app/(platform)/dashboard/owner/page.tsx",
      "app/(platform)/dashboard/owner/schedule/page.tsx",
      "app/(platform)/dashboard/owner/money/page.tsx",
      "app/(platform)/dashboard/owner/settings/page.tsx"
    ]
  },
  {
    name: "booking calendar completion loop",
    testFiles: [
      "tests/integration/workflow-e2e.spec.ts",
      "tests/unit/core-booking-loop-regression.spec.ts",
      "tests/unit/freelance-client-booking-loop.spec.ts",
      "tests/unit/booking-form.spec.tsx",
      "tests/unit/booking-mutation-routes.spec.ts"
    ],
    surfaces: [
      "app/(public-booking)/booking/new/page.tsx",
      "components/booking/booking-form.tsx",
      "lib/booking/platform-service.ts",
      "lib/operations/live-provider.ts"
    ]
  },
  {
    name: "payments receipt webhook posture",
    testFiles: [
      "tests/unit/payments-routes.spec.ts",
      "tests/unit/payment-domain.spec.ts",
      "tests/unit/stripe-payment-record.spec.ts",
      "tests/unit/fintech-webhook-service.spec.ts",
      "tests/unit/paywall-entitlement-regression.spec.tsx"
    ],
    surfaces: [
      "app/api/payments/deposit/route.ts",
      "app/api/stripe/webhook/route.ts",
      "lib/payments/service.ts",
      "lib/fintech/receipt.ts"
    ]
  },
  {
    name: "messages support notification kiosk",
    testFiles: [
      "tests/unit/messages-routes.spec.ts",
      "tests/unit/support-issue-intake.spec.ts",
      "tests/unit/notification-consent.spec.ts",
      "tests/unit/kiosk-routes.spec.ts",
      "tests/unit/kiosk-mode-screen.spec.tsx"
    ],
    surfaces: [
      "components/messages/messaging-inbox-screen.tsx",
      "app/api/support/issue-intake/route.ts",
      "lib/notifications/consent.ts",
      "components/kiosk/kiosk-mode-screen.tsx"
    ]
  },
  {
    name: "architect evidence security mobile pwa",
    testFiles: [
      "tests/unit/architect-mission-control-foundation.spec.ts",
      "tests/unit/architect-mission-control.spec.tsx",
      "tests/unit/rls-disabled-evidence-cleanup.spec.ts",
      "tests/unit/mobile-action-guard.spec.ts",
      "tests/unit/pwa-service-worker.spec.ts"
    ],
    surfaces: [
      "components/architect/mission-control/mission-control.tsx",
      "lib/architect/mission-control/foundation.ts",
      "public/sw.js",
      "components/pwa/pwa-provider.tsx"
    ]
  }
] as const;

const backendLabelForbiddenInUserSurfaces =
  /account_entitlements|stripe_customer_id|stripe_subscription_id|payment_intent|provider_payment_method_id|payment_routing_records|payout_readiness_status|relationship_type|webhook_unverified/i;

const userFacingSurfaceFiles = [
  "components/client-experience/client-home-screen.tsx",
  "components/client-experience/client-search-screen.tsx",
  "components/client-experience/client-bookings-screen.tsx",
  "components/client-experience/client-plan-access-card.tsx",
  "components/barber-experience/barber-calendar-screen.tsx",
  "components/barber-experience/barber-checkout-screen.tsx",
  "components/barber-experience/barber-profile-screen.tsx",
  "components/operations/owner-overview.tsx",
  "components/operations/owner-schedule-workspace.tsx",
  "components/operations/owner-money-workspace.tsx",
  "components/operations/owner-settings-workspace.tsx",
  "components/owner-experience/shop-owner-plan-access-card.tsx",
  "components/subscription/subscription-settings-card.tsx",
  "components/messages/messaging-inbox-screen.tsx",
  "components/kiosk/kiosk-mode-screen.tsx"
] as const;

const protectedMutationScopes = [
  /^supabase\/migrations\//,
  /\.sql$/,
  /^app\/api\/stripe\//,
  /^app\/api\/payments\//,
  /^app\/api\/architect\/repairs\//,
  /^lib\/payments\//,
  /^lib\/stripe\//,
  /^lib\/fintech\//,
  /^lib\/entitlements\//,
  /^lib\/supabase\//,
  /^middleware\.ts$/
];

describe("Roadmap PR #59 full V1 end-to-end regression pack", () => {
  it("maps every V1 loop to existing proxy tests and source surfaces", () => {
    for (const group of coverageGroups) {
      for (const testFile of group.testFiles) {
        expect(projectPathExists(testFile), `${group.name} missing test ${testFile}`).toBe(true);
      }

      for (const surface of group.surfaces) {
        expect(projectPathExists(surface), `${group.name} missing surface ${surface}`).toBe(true);
      }
    }
  });

  it("documents that this pack is proxy coverage until browser E2E infrastructure exists", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {})
    ];
    const scripts = Object.values(packageJson.scripts ?? {});
    const qaDoc = readProjectFile("docs/qa/pr59-v1-end-to-end-regression-pack.md");

    expect(dependencyNames.some((name) => /playwright|cypress/i.test(name))).toBe(false);
    expect(scripts.some((script) => /playwright|cypress/i.test(script))).toBe(false);
    expect(qaDoc).toContain("Final verdict ceiling: PROXY-PASS");
    expect(qaDoc).toContain("No Playwright or Cypress runner is present in package.json.");
  });

  it("keeps canonical public roles separate from entitlement tiers", () => {
    const entitlementRegression = readProjectFile("tests/unit/paywall-entitlement-regression.spec.tsx");
    const serverTruth = readProjectFile("tests/unit/entitlements-server-truth.spec.ts");
    const subscriptionSettings = readProjectFile("tests/unit/subscription-settings.spec.tsx");

    expect(entitlementRegression).toContain("enforces the 9 role/tier access matrix without cross-role contamination");
    expect(entitlementRegression).toContain("rejects fake roles, fake tiers, frontend memory, and role mismatches before paid access");
    expect(serverTruth).toContain("allows paid features only with server persisted, mapped, webhook-verified active proof");
    expect(subscriptionSettings).toContain("refreshes entitlement state from the server endpoint without accepting a frontend tier");
  });

  it("keeps role dashboards and Architect separated at the route layer", () => {
    expect(readProjectFile("app/(platform)/dashboard/client/page.tsx")).toContain('getAuthorizedUser(["client_user"])');
    expect(readProjectFile("app/(platform)/dashboard/barber/page.tsx")).toContain('getAuthorizedUser(["barber_user"])');
    expect(readProjectFile("app/(platform)/dashboard/owner/page.tsx")).toContain('getAuthorizedUser(["shop_owner_user"])');

    const architectLayout = readProjectFile("app/(platform)/architect/layout.tsx");
    expect(architectLayout).toContain("getPlatformAdminUser");
    expect(architectLayout).not.toContain("client_user");
    expect(architectLayout).not.toContain("barber_user");
    expect(architectLayout).not.toContain("shop_owner_user");
  });

  it("keeps private PWA navigations network-only and public shell caching narrow", () => {
    const serviceWorkerSource = readProjectFile("public/sw.js");

    expect(serviceWorkerSource).toContain("SENSITIVE_NAVIGATION_PREFIXES");
    expect(serviceWorkerSource).toContain('"/dashboard"');
    expect(serviceWorkerSource).toContain('"/architect"');
    expect(serviceWorkerSource).toContain('"/checkout"');
    expect(serviceWorkerSource).toContain('"/kiosk"');
    expect(serviceWorkerSource).toContain("networkOnlyWithOfflineFallback");
    expect(serviceWorkerSource).not.toContain('"/dashboard/client"');
    expect(serviceWorkerSource).not.toContain('"/architect/finance"');
  });

  it("keeps backend and provider labels out of primary user-facing role surfaces", () => {
    for (const surface of userFacingSurfaceFiles) {
      const source = readProjectFile(surface);
      expect(source, surface).not.toMatch(backendLabelForbiddenInUserSurfaces);
    }
  });

  it("keeps this regression PR out of protected mutation scopes", () => {
    // Scoped to the commit that introduced this pack, matching the PR36A audit
    // precedent. Auditing the live working tree instead would make this
    // historical assertion fail for every later PR that legitimately touches a
    // protected scope.
    const packCommit = execFileSync(
      "git",
      ["log", "--diff-filter=A", "-n", "1", "--format=%H", "--", SPEC_REPO_PATH],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();

    expect(packCommit, "the regression pack commit must be resolvable").toBeTruthy();

    const changedFiles = execFileSync(
      "git",
      ["diff-tree", "--no-commit-id", "--name-only", "-r", packCommit],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    )
      .split(/\r?\n/)
      .map((line) => line.replace(/\\/g, "/").trim())
      .filter(Boolean);
    const protectedChanges = changedFiles.filter((file) =>
      protectedMutationScopes.some((pattern) => pattern.test(file))
    );

    expect(protectedChanges).toEqual([]);
  });
});
