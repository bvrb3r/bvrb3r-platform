import Stripe from "stripe";
import { buildStripeReturnUrl, getStripeConnectClient, StripeConnectError } from "@/lib/stripe/connect";
import type {
  EntitlementAccountRole,
  EntitlementBillingInterval,
  EntitlementTier
} from "@/lib/entitlements/domain";

type PaidTier = Exclude<EntitlementTier, "standard">;
type PaidInterval = Exclude<EntitlementBillingInterval, "none">;

function billingMetadata(input: {
  profileId: string;
  accountRole: EntitlementAccountRole;
  tier: PaidTier;
  billingInterval: PaidInterval;
}) {
  return {
    profileId: input.profileId,
    accountRole: input.accountRole,
    entitlementRole: input.accountRole,
    entitlementTier: input.tier,
    entitlementInterval: input.billingInterval,
    entitlementSource: "pr34_billing"
  };
}

export function getStripeBillingPublishableKey() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!key) {
    throw new StripeConnectError("Stripe payment fields are not configured for this environment.", 503, "stripe_publishable_key_missing");
  }
  return key;
}

export async function createPr34BillingCustomer(input: {
  email: string;
  name: string;
  profileId: string;
  accountRole: EntitlementAccountRole;
  idempotencyKey: string;
}) {
  return getStripeConnectClient().customers.create({
    email: input.email,
    name: input.name,
    metadata: {
      profileId: input.profileId,
      accountRole: input.accountRole,
      purpose: "bvrb3r_platform_billing"
    }
  }, { idempotencyKey: input.idempotencyKey });
}

export async function createPr34SubscriptionCheckout(input: {
  customerId: string;
  priceId: string;
  profileId: string;
  accountRole: EntitlementAccountRole;
  tier: PaidTier;
  billingInterval: PaidInterval;
  idempotencyKey: string;
}) {
  const metadata = billingMetadata(input);
  return getStripeConnectClient().checkout.sessions.create({
    mode: "subscription",
    customer: input.customerId,
    client_reference_id: input.profileId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: buildStripeReturnUrl("/billing?checkout=success"),
    cancel_url: buildStripeReturnUrl("/billing?checkout=cancelled"),
    metadata,
    subscription_data: { metadata }
  }, { idempotencyKey: input.idempotencyKey });
}

export async function createPr34BillingPortal(input: { customerId: string }) {
  return getStripeConnectClient().billingPortal.sessions.create({
    customer: input.customerId,
    return_url: buildStripeReturnUrl("/billing")
  });
}

export async function retrievePr34Subscription(subscriptionId: string) {
  return getStripeConnectClient().subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price", "latest_invoice.payment_intent", "schedule"]
  });
}

export async function applyPr34Upgrade(input: {
  subscription: Stripe.Subscription;
  priceId: string;
  profileId: string;
  accountRole: EntitlementAccountRole;
  tier: PaidTier;
  billingInterval: PaidInterval;
  idempotencyKey: string;
}) {
  const item = input.subscription.items.data[0];
  if (!item) {
    throw new StripeConnectError("The Stripe subscription does not contain a billable item.", 409, "subscription_item_missing");
  }

  return getStripeConnectClient().subscriptions.update(input.subscription.id, {
    cancel_at_period_end: false,
    items: [{ id: item.id, price: input.priceId, quantity: item.quantity ?? 1 }],
    payment_behavior: "pending_if_incomplete",
    proration_behavior: "always_invoice",
    metadata: billingMetadata(input)
  }, { idempotencyKey: input.idempotencyKey });
}

export async function schedulePr34Downgrade(input: {
  subscription: Stripe.Subscription;
  priceId: string;
  profileId: string;
  accountRole: EntitlementAccountRole;
  tier: PaidTier;
  billingInterval: PaidInterval;
  idempotencyKey: string;
}) {
  const stripe = getStripeConnectClient();
  const currentItems = input.subscription.items.data.map((item) => ({
    price: item.price.id,
    quantity: item.quantity ?? 1
  }));
  if (!currentItems.length) {
    throw new StripeConnectError("The Stripe subscription does not contain a billable item.", 409, "subscription_item_missing");
  }

  const scheduleReference = input.subscription.schedule;
  const schedule = typeof scheduleReference === "string"
    ? await stripe.subscriptionSchedules.retrieve(scheduleReference)
    : scheduleReference && "id" in scheduleReference
      ? scheduleReference
      : await stripe.subscriptionSchedules.create(
          { from_subscription: input.subscription.id },
          { idempotencyKey: `${input.idempotencyKey}:create` }
        );
  const currentPhase = schedule.phases.find((phase) => phase.start_date <= input.subscription.current_period_start
    && phase.end_date >= input.subscription.current_period_end) ?? schedule.phases[0];

  return stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    metadata: billingMetadata(input),
    phases: [
      {
        start_date: currentPhase?.start_date ?? input.subscription.current_period_start,
        end_date: input.subscription.current_period_end,
        items: currentItems,
        proration_behavior: "none"
      },
      {
        start_date: input.subscription.current_period_end,
        items: [{ price: input.priceId, quantity: 1 }],
        proration_behavior: "none",
        metadata: billingMetadata(input)
      }
    ]
  }, { idempotencyKey: `${input.idempotencyKey}:update` });
}

export async function schedulePr34StandardAtPeriodEnd(subscriptionId: string, idempotencyKey: string) {
  return getStripeConnectClient().subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
    metadata: {
      requestedTier: "standard",
      requestedTiming: "period_end"
    }
  }, { idempotencyKey });
}

export async function restorePr34Subscription(subscriptionId: string, idempotencyKey: string) {
  return getStripeConnectClient().subscriptions.update(subscriptionId, {
    cancel_at_period_end: false
  }, { idempotencyKey });
}

export async function listPr34Invoices(customerId: string) {
  return getStripeConnectClient().invoices.list({
    customer: customerId,
    limit: 12,
    expand: ["data.lines.data.price.product"]
  });
}

export async function createPr34BalancePaymentIntent(input: {
  customerId: string | null;
  profileId: string;
  attemptId: string;
  amountCents: number;
  currency: "usd";
  lineCount: number;
  snapshotHash: string;
  idempotencyKey: string;
}) {
  return getStripeConnectClient().paymentIntents.create({
    amount: input.amountCents,
    currency: input.currency,
    customer: input.customerId ?? undefined,
    automatic_payment_methods: { enabled: true },
    description: "BVRB3R account balance payment",
    metadata: {
      purpose: "pr34_balance_payment",
      profileId: input.profileId,
      attemptId: input.attemptId,
      lineCount: String(input.lineCount),
      snapshotHash: input.snapshotHash
    }
  }, { idempotencyKey: input.idempotencyKey });
}

export async function retrievePr34BalancePaymentIntent(paymentIntentId: string) {
  return getStripeConnectClient().paymentIntents.retrieve(paymentIntentId);
}
