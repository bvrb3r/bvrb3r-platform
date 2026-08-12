import Stripe from "stripe";
import { StripeConnectError, buildStripeReturnUrl, getStripeConnectClient } from "@/lib/stripe/connect";

export class StripeIdentityError extends StripeConnectError {}

export function getStripeIdentityWebhookSecret() {
  const webhookSecret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new StripeIdentityError(
      "Stripe Identity webhook verification is not configured for this environment.",
      503,
      "stripe_identity_webhook_not_configured"
    );
  }

  return webhookSecret;
}

export type StripeIdentityVerificationSessionInput = {
  metadata: Record<string, string>;
  returnPath?: string;
  idempotencyKey: string;
};

export function getStripeIdentityClient() {
  return getStripeConnectClient();
}

export async function createStripeIdentityVerificationSession(input: StripeIdentityVerificationSessionInput) {
  const stripe = getStripeIdentityClient();

  return stripe.identity.verificationSessions.create({
    type: "document",
    metadata: input.metadata,
    options: {
      document: {
        require_matching_selfie: true
      }
    },
    return_url: buildStripeReturnUrl(input.returnPath ?? "/profile")
  }, {
    idempotencyKey: input.idempotencyKey
  });
}

export async function retrieveStripeIdentityVerificationSession(sessionId: string) {
  const stripe = getStripeIdentityClient();
  return stripe.identity.verificationSessions.retrieve(sessionId);
}

export function verifyStripeIdentityWebhookEvent(payload: string | Buffer, signature: string) {
  const stripe = getStripeIdentityClient();
  return stripe.webhooks.constructEvent(payload, signature, getStripeIdentityWebhookSecret());
}

export function getStripeIdentitySessionStatus(
  session: Stripe.Identity.VerificationSession,
  eventType?: string | null
) {
  if (eventType === "identity.verification_session.redacted") {
    return "redacted";
  }

  return session.status;
}
