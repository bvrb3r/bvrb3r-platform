import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildGroupPaymentLink,
  deriveGroupPaymentLinkToken,
  groupSplitPaymentProviderBlockers,
  verifyGroupPaymentLinkToken,
  type GroupSplitPaymentProviderConfig
} from "@/lib/group-booking/payment-link-domain";

const configured: GroupSplitPaymentProviderConfig = {
  appUrl: "https://staging.bvrb3r.app",
  linkSecret: "pr36-group-payment-link-test-secret-32-characters",
  paymentsProvider: "stripe",
  stripeSecretKey: "sk_test_realish_value",
  stripePublishableKey: "pk_test_realish_value",
  stripeWebhookSecret: "whsec_realish_value",
  twilioReady: true
};

describe("Product PR36 group split-payment links", () => {
  it("gates every provider requirement and rejects template placeholders", () => {
    expect(groupSplitPaymentProviderBlockers(configured)).toEqual([]);
    const blockers = groupSplitPaymentProviderBlockers({
      appUrl: "https://staging.example.com",
      linkSecret: "short",
      paymentsProvider: "mock",
      stripeSecretKey: "sk_test_placeholder",
      stripePublishableKey: "<stripe-publishable-key>",
      stripeWebhookSecret: "your-stripe-webhook-secret",
      twilioReady: false
    });
    expect(blockers.map((blocker) => blocker.code)).toEqual([
      "app_url_invalid",
      "link_secret_missing",
      "payments_provider_not_stripe",
      "stripe_secret_missing",
      "stripe_publishable_key_missing",
      "stripe_webhook_missing",
      "twilio_missing"
    ]);
  });

  it("binds an opaque token to the exact group, member, provider intent, and payer", () => {
    const binding = {
      groupId: "group-36",
      memberId: "member-2",
      paymentIntentId: "pi_pr36",
      payerEmail: "payer@example.com",
      secret: configured.linkSecret
    };
    const token = deriveGroupPaymentLinkToken(binding);
    expect(token).toMatch(/^gpt_[A-Za-z0-9_-]{43}$/);
    expect(verifyGroupPaymentLinkToken({ ...binding, token })).toBe(true);
    expect(verifyGroupPaymentLinkToken({ ...binding, memberId: "member-3", token })).toBe(false);
    expect(verifyGroupPaymentLinkToken({ ...binding, payerEmail: "attacker@example.com", token })).toBe(false);
  });

  it("builds only an absolute app payment route with the signed bearer token", () => {
    const url = new URL(buildGroupPaymentLink({
      appUrl: configured.appUrl,
      groupId: "group/36",
      memberId: "member 2",
      token: "gpt_signed"
    }));
    expect(url.origin).toBe("https://staging.bvrb3r.app");
    expect(url.pathname).toBe("/pay/group/group%2F36/member%202");
    expect(url.searchParams.get("token")).toBe("gpt_signed");
    expect(() => buildGroupPaymentLink({
      appUrl: "https://staging.example.com",
      groupId: "group-36",
      memberId: "member-2",
      token: "gpt_signed"
    })).toThrow(/valid application URL/i);
  });

  it("creates an unconfirmed Stripe intent, a pending canonical ledger, and texts only verified delivery", () => {
    const serviceSource = readFileSync("lib/group-booking/payment-links.ts", "utf8");
    expect(serviceSource).toContain("automatic_payment_methods: { enabled: true }");
    expect(serviceSource).not.toMatch(/confirm\s*:\s*true/);
    expect(serviceSource).toContain("createPaymentLedgerEntry");
    expect(serviceSource).toContain('paymentStatus: "pending"');
    expect(serviceSource).toContain("executeNotificationAttempt");
    expect(serviceSource).toContain('delivery.status !== "delivered"');
    expect(serviceSource).not.toContain("invoiceUrl");
  });

  it("reconciles exact provider outcomes through the existing signed Stripe webhook", () => {
    const webhookSource = readFileSync("lib/fintech/service.ts", "utf8");
    expect(webhookSource).toContain('syncGroupPaymentIntentProviderStatus({ paymentIntentId, outcome: "paid" })');
    expect(webhookSource).toContain('syncGroupPaymentIntentProviderStatus({ paymentIntentId, outcome: "needs_review" })');
  });

  it("adds a paired group branch to the existing shop kiosk without weakening its API guard", () => {
    const kioskSource = readFileSync("components/kiosk/kiosk-parity-screen.tsx", "utf8");
    const pageSource = readFileSync("app/kiosk/shop/[shopId]/group/page.tsx", "utf8");
    const routeSource = readFileSync("app/api/group-bookings/kiosk/[shopId]/route.ts", "utf8");
    expect(kioskSource).toContain("Group walk-in · 2–6 people");
    expect(kioskSource).toContain("/group` as Route");
    expect(pageSource).toContain("kioskOnly");
    expect(pageSource).toContain("kioskShopId={shopId}");
    expect(routeSource).toContain("assertKioskDeviceSession");
    expect(routeSource).toContain("consumeRateLimit");
  });
});
