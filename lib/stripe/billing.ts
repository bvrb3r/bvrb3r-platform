import Stripe from "stripe";
import { getClientMembershipPlan } from "@/lib/monetization/membership";
import { buildStripeReturnUrl, getStripeConnectClient, StripeConnectError } from "@/lib/stripe/connect";

export type StripeBillingCustomerInput = {
  email: string;
  name: string;
  metadata: Record<string, string>;
};

export async function createStripeBillingCustomer(input: StripeBillingCustomerInput) {
  const stripe = getStripeConnectClient();
  return stripe.customers.create({
    email: input.email,
    name: input.name,
    metadata: input.metadata
  });
}

export async function createStripeMembershipCheckoutSession(input: {
  customerId: string;
  clientReference: string;
  clientEmail: string;
  planCode: string;
}) {
  const stripe = getStripeConnectClient();
  const plan = getClientMembershipPlan(input.planCode);
  if (!plan) {
    throw new StripeConnectError("The requested membership plan is not available.", 400, "membership_plan_not_found");
  }

  const successUrl = buildStripeReturnUrl("/dashboard/client?membership=success");
  const cancelUrl = buildStripeReturnUrl("/dashboard/client?membership=cancelled");

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: input.clientReference,
    customer_email: input.clientEmail,
    metadata: {
      clientReference: input.clientReference,
      planCode: plan.planCode
    },
    subscription_data: {
      metadata: {
        clientReference: input.clientReference,
        planCode: plan.planCode
      }
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: plan.currency,
          unit_amount: Math.round(plan.unitAmount * 100),
          recurring: {
            interval: plan.planInterval === "annual" ? "year" : "month"
          },
          product_data: {
            name: plan.planName,
            description: plan.summary,
            metadata: {
              planCode: plan.planCode
            }
          }
        }
      }
    ]
  });
}

export async function createStripeRecurringSubscription(input: {
  customerId: string;
  defaultPaymentMethodId: string;
  planCode: string;
  planName: string;
  unitAmount: number;
  currency?: string;
  interval: "week" | "month" | "year";
  metadata: Record<string, string>;
  idempotencyKey?: string;
}) {
  const stripe = getStripeConnectClient();
  const items = [
    {
      price_data: {
        currency: (input.currency ?? "usd").toLowerCase(),
        unit_amount: Math.round(input.unitAmount * 100),
        recurring: {
          interval: input.interval
        },
        product_data: {
          name: input.planName,
          metadata: {
            planCode: input.planCode
          }
        }
      }
    }
  ] as unknown as Stripe.SubscriptionCreateParams.Item[];

  return stripe.subscriptions.create({
    customer: input.customerId,
    collection_method: "charge_automatically",
    default_payment_method: input.defaultPaymentMethodId,
    metadata: input.metadata,
    items
  }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);
}

export async function cancelStripeMembershipSubscription(subscriptionId: string) {
  const stripe = getStripeConnectClient();
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true
  });
}

export async function retrieveStripeSubscription(subscriptionId: string) {
  const stripe = getStripeConnectClient();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price", "customer"]
  });
}

export async function retryStripeSubscriptionInvoice(subscriptionId: string) {
  const stripe = getStripeConnectClient();
  const invoices = await stripe.invoices.list({
    subscription: subscriptionId,
    status: "open",
    limit: 1
  });
  const invoice = invoices.data[0] ?? null;
  if (!invoice) {
    return null;
  }

  return stripe.invoices.pay(invoice.id);
}

export function asStripeSubscription(object: Stripe.Event.Data.Object) {
  return object as Stripe.Subscription;
}
