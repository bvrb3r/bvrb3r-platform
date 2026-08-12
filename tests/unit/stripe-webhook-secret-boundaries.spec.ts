import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getStripeConnectWebhookSecret,
  getStripePlatformWebhookSecret,
  verifyStripeConnectWebhookEvent,
  verifyStripePlatformWebhookEvent
} from "@/lib/stripe/connect";
import {
  getStripeIdentityWebhookSecret,
  verifyStripeIdentityWebhookEvent
} from "@/lib/stripe/identity";

const ORIGINAL_ENV = { ...process.env };
const PLATFORM_SECRET = "whsec_platform_boundary_test";
const CONNECT_SECRET = "whsec_connect_boundary_test";
const IDENTITY_SECRET = "whsec_identity_boundary_test";
const stripe = new Stripe("sk_test_webhook_boundary");

function eventPayload(type: string, account?: string) {
  return JSON.stringify({
    id: `evt_${type.replaceAll(".", "_")}`,
    object: "event",
    api_version: "2020-08-27",
    created: 1786550400,
    data: { object: { id: "object_1", object: type.startsWith("identity.") ? "identity.verification_session" : "account" } },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    ...(account ? { account } : {})
  });
}

function signature(payload: string, secret: string) {
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_webhook_boundary";
  process.env.STRIPE_WEBHOOK_SECRET = PLATFORM_SECRET;
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET;
  process.env.STRIPE_IDENTITY_WEBHOOK_SECRET = IDENTITY_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Stripe webhook signing-secret boundaries", () => {
  it("accepts only the Platform signing secret on the Platform verifier", () => {
    const payload = eventPayload("payment_intent.canceled");
    expect(verifyStripePlatformWebhookEvent(payload, signature(payload, PLATFORM_SECRET)).type).toBe("payment_intent.canceled");
    expect(() => verifyStripePlatformWebhookEvent(payload, signature(payload, CONNECT_SECRET))).toThrow();
    expect(() => verifyStripePlatformWebhookEvent(payload, signature(payload, IDENTITY_SECRET))).toThrow();
  });

  it("accepts only the Connect signing secret on the Connect verifier", () => {
    const payload = eventPayload("account.updated", "acct_connect_boundary");
    expect(verifyStripeConnectWebhookEvent(payload, signature(payload, CONNECT_SECRET)).account).toBe("acct_connect_boundary");
    expect(() => verifyStripeConnectWebhookEvent(payload, signature(payload, PLATFORM_SECRET))).toThrow();
    expect(() => verifyStripeConnectWebhookEvent(payload, signature(payload, IDENTITY_SECRET))).toThrow();
  });

  it("accepts only the Identity signing secret on the Identity verifier", () => {
    const payload = eventPayload("identity.verification_session.processing");
    expect(verifyStripeIdentityWebhookEvent(payload, signature(payload, IDENTITY_SECRET)).type).toBe("identity.verification_session.processing");
    expect(() => verifyStripeIdentityWebhookEvent(payload, signature(payload, PLATFORM_SECRET))).toThrow();
    expect(() => verifyStripeIdentityWebhookEvent(payload, signature(payload, CONNECT_SECRET))).toThrow();
  });

  it("does not fall back to another lane when a dedicated secret is missing", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => getStripePlatformWebhookSecret()).toThrowError(/Platform webhook verification is not configured/i);
    process.env.STRIPE_WEBHOOK_SECRET = PLATFORM_SECRET;

    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    expect(() => getStripeConnectWebhookSecret()).toThrowError(/Connect webhook verification is not configured/i);
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET;

    delete process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
    expect(() => getStripeIdentityWebhookSecret()).toThrowError(/Identity webhook verification is not configured/i);
  });
});
