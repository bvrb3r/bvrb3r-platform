import { createHmac, timingSafeEqual } from "node:crypto";

export const GROUP_SPLIT_PAYMENT_PURPOSE = "pr36_group_split_payment";

export type GroupSplitPaymentProviderConfig = {
  appUrl: string;
  linkSecret: string;
  paymentsProvider: string;
  stripeSecretKey: string;
  stripePublishableKey: string;
  stripeWebhookSecret: string;
  twilioReady: boolean;
};

export type GroupSplitPaymentProviderBlocker = {
  code:
    | "app_url_missing"
    | "app_url_invalid"
    | "link_secret_missing"
    | "payments_provider_not_stripe"
    | "stripe_secret_missing"
    | "stripe_publishable_key_missing"
    | "stripe_webhook_missing"
    | "twilio_missing";
  message: string;
};

function isAbsoluteHttpUrl(value: string) {
  try {
    const url = new URL(value);
    const isExampleHost = url.hostname === "example.com" || url.hostname.endsWith(".example.com");
    return !isExampleHost
      && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  } catch {
    return false;
  }
}

function hasProviderValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized)
    && !normalized.includes("placeholder")
    && !normalized.includes("replace-with")
    && !normalized.startsWith("your-")
    && !(normalized.startsWith("<") && normalized.endsWith(">"));
}

export function groupSplitPaymentProviderBlockers(
  config: GroupSplitPaymentProviderConfig
): GroupSplitPaymentProviderBlocker[] {
  const blockers: GroupSplitPaymentProviderBlocker[] = [];
  if (!config.appUrl.trim()) {
    blockers.push({ code: "app_url_missing", message: "NEXT_PUBLIC_APP_URL is required for secure split-payment links." });
  } else if (!isAbsoluteHttpUrl(config.appUrl.trim())) {
    blockers.push({ code: "app_url_invalid", message: "NEXT_PUBLIC_APP_URL must be an absolute HTTPS URL (localhost HTTP is allowed in development)." });
  }
  if (config.linkSecret.trim().length < 32 || !hasProviderValue(config.linkSecret)) {
    blockers.push({ code: "link_secret_missing", message: "GROUP_PAYMENT_LINK_SECRET must contain at least 32 random characters." });
  }
  if (config.paymentsProvider.trim().toLowerCase() !== "stripe") {
    blockers.push({ code: "payments_provider_not_stripe", message: "PAYMENTS_PROVIDER must be set to stripe before split-payment links can be offered." });
  }
  if (!hasProviderValue(config.stripeSecretKey)) {
    blockers.push({ code: "stripe_secret_missing", message: "STRIPE_SECRET_KEY is required to create provider-backed payment sessions." });
  }
  if (!hasProviderValue(config.stripePublishableKey)) {
    blockers.push({ code: "stripe_publishable_key_missing", message: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required to render Stripe payment fields." });
  }
  if (!hasProviderValue(config.stripeWebhookSecret)) {
    blockers.push({ code: "stripe_webhook_missing", message: "A verified Stripe webhook secret is required before split payments can be offered." });
  }
  if (!config.twilioReady) {
    blockers.push({ code: "twilio_missing", message: "Twilio delivery credentials and a sender are required before payment links can be texted." });
  }
  return blockers;
}

function requireLinkSecret(secret: string) {
  const normalized = secret.trim();
  if (normalized.length < 32 || !hasProviderValue(normalized)) {
    throw new Error("GROUP_PAYMENT_LINK_SECRET must contain at least 32 random characters.");
  }
  return normalized;
}

function paymentLinkMessage(input: {
  groupId: string;
  memberId: string;
  paymentIntentId: string;
  payerEmail: string;
}) {
  return [
    "bvrb3r:group-split:v1",
    input.groupId,
    input.memberId,
    input.paymentIntentId,
    input.payerEmail.trim().toLowerCase()
  ].join(":");
}

export function deriveGroupPaymentLinkToken(input: {
  groupId: string;
  memberId: string;
  paymentIntentId: string;
  payerEmail: string;
  secret: string;
}) {
  return `gpt_${createHmac("sha256", requireLinkSecret(input.secret))
    .update(paymentLinkMessage(input), "utf8")
    .digest("base64url")}`;
}

export function verifyGroupPaymentLinkToken(input: {
  token: string;
  groupId: string;
  memberId: string;
  paymentIntentId: string;
  payerEmail: string;
  secret: string;
}) {
  const expected = deriveGroupPaymentLinkToken(input);
  const presented = Buffer.from(input.token, "utf8");
  const trusted = Buffer.from(expected, "utf8");
  return presented.length === trusted.length && timingSafeEqual(presented, trusted);
}

export function buildGroupPaymentLink(input: {
  appUrl: string;
  groupId: string;
  memberId: string;
  token: string;
}) {
  if (!isAbsoluteHttpUrl(input.appUrl.trim())) {
    throw new Error("A valid application URL is required for group payment links.");
  }
  const url = new URL(
    `/pay/group/${encodeURIComponent(input.groupId)}/${encodeURIComponent(input.memberId)}`,
    input.appUrl
  );
  url.searchParams.set("token", input.token);
  return url.toString();
}
