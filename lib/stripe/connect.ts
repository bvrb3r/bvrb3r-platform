import Stripe from "stripe";

export class StripeConnectError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let stripeClient: Stripe | null = null;

export type StripeConnectEnvironmentMode = "live" | "test" | "missing";

export type StripeConnectEnvironmentView = {
  mode: StripeConnectEnvironmentMode;
  label: string;
  blocksLivePayouts: boolean;
};

export function getStripeConnectEnvironment(): StripeConnectEnvironmentView {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return {
      mode: "missing",
      label: "Stripe live keys missing - payouts are not ready.",
      blocksLivePayouts: true
    };
  }

  if (secretKey.startsWith("sk_live_")) {
    return {
      mode: "live",
      label: "Stripe live mode.",
      blocksLivePayouts: false
    };
  }

  if (secretKey.startsWith("sk_test_")) {
    return {
      mode: "test",
      label: "Stripe test mode - not live payouts.",
      blocksLivePayouts: true
    };
  }

  return {
    mode: "missing",
    label: "Stripe key mode could not be verified - payouts are not ready.",
    blocksLivePayouts: true
  };
}

function getStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new StripeConnectError("Stripe Connect is not configured for this environment.", 503, "stripe_not_configured");
  }

  return secretKey;
}

export function getStripePlatformWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new StripeConnectError(
      "Stripe Platform webhook verification is not configured for this environment.",
      503,
      "stripe_platform_webhook_not_configured"
    );
  }

  return webhookSecret;
}

export function getStripeConnectWebhookSecret() {
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new StripeConnectError(
      "Stripe Connect webhook verification is not configured for this environment.",
      503,
      "stripe_connect_webhook_not_configured"
    );
  }

  return webhookSecret;
}

function getStripeAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    throw new StripeConnectError(
      "Stripe Connect return URLs require NEXT_PUBLIC_APP_URL to be configured.",
      503,
      "stripe_app_url_not_configured"
    );
  }

  try {
    return new URL(appUrl).toString();
  } catch {
    throw new StripeConnectError(
      "NEXT_PUBLIC_APP_URL must be a valid absolute URL for Stripe Connect.",
      500,
      "stripe_app_url_invalid"
    );
  }
}

export function getStripeConnectClient() {
  if (stripeClient) {
    return stripeClient;
  }

  stripeClient = new Stripe(getStripeSecretKey());
  return stripeClient;
}

export function buildStripeReturnUrl(pathname: string) {
  return new URL(pathname, getStripeAppUrl()).toString();
}

export function getStripeConnectOnboardingPath(
  subjectType: "barber" | "shop",
  outcome: "return" | "refresh"
) {
  if (subjectType === "barber") {
    return `/dashboard/barber/more?stripe=${outcome}`;
  }

  return outcome === "return" ? "/reports" : "/reports";
}

export type StripeConnectedAccountInput = {
  subjectType: "barber" | "shop";
  email: string;
  displayName: string;
  country?: string | null;
  metadata: Record<string, string>;
};

export async function createStripeConnectedAccount(input: StripeConnectedAccountInput) {
  const stripe = getStripeConnectClient();
  const appUrl = getStripeAppUrl();
  return stripe.accounts.create({
    type: "express",
    country: input.country?.trim() || "US",
    email: input.email,
    business_type: input.subjectType === "shop" ? "company" : "individual",
    business_profile: {
      name: input.displayName,
      url: appUrl
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true }
    },
    metadata: input.metadata
  });
}

export async function retrieveStripeConnectedAccount(accountId: string) {
  const stripe = getStripeConnectClient();
  return stripe.accounts.retrieve(accountId);
}

export async function retrieveStripePlatformAccount() {
  const stripe = getStripeConnectClient();
  return stripe.accounts.retrieve();
}

export async function retrieveStripePlatformBalance() {
  const stripe = getStripeConnectClient();
  return stripe.balance.retrieve();
}

export async function createStripeOnboardingLink(input: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}) {
  const stripe = getStripeConnectClient();
  return stripe.accountLinks.create({
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding"
  });
}

export async function createStripeDashboardLoginLink(accountId: string) {
  const stripe = getStripeConnectClient();
  return stripe.accounts.createLoginLink(accountId);
}

export async function createStripeTransfer(input: {
  amount: number;
  currency: string;
  destinationAccountId: string;
  transferGroup: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}) {
  const stripe = getStripeConnectClient();
  return stripe.transfers.create({
    amount: Math.round(input.amount * 100),
    currency: input.currency.toLowerCase(),
    destination: input.destinationAccountId,
    transfer_group: input.transferGroup,
    metadata: input.metadata
  }, {
    idempotencyKey: input.idempotencyKey
  });
}

export async function createStripeTransferReversal(input: {
  transferId: string;
  amount: number;
  metadata: Record<string, string>;
  idempotencyKey: string;
}) {
  const stripe = getStripeConnectClient();
  return stripe.transfers.createReversal(input.transferId, {
    amount: Math.round(input.amount * 100),
    metadata: input.metadata
  }, {
    idempotencyKey: input.idempotencyKey
  });
}

export async function retrieveStripePaymentIntentSettlement(paymentIntentId: string) {
  const stripe = getStripeConnectClient();
  return stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"]
  });
}

export async function retrieveStripeConnectedAccountPayout(accountId: string, payoutId: string) {
  const stripe = getStripeConnectClient();
  return stripe.payouts.retrieve(payoutId, {}, { stripeAccount: accountId });
}

export function verifyStripePlatformWebhookEvent(payload: string | Buffer, signature: string) {
  const stripe = getStripeConnectClient();
  return stripe.webhooks.constructEvent(payload, signature, getStripePlatformWebhookSecret());
}

export function verifyStripeConnectWebhookEvent(payload: string | Buffer, signature: string) {
  const stripe = getStripeConnectClient();
  return stripe.webhooks.constructEvent(payload, signature, getStripeConnectWebhookSecret());
}
