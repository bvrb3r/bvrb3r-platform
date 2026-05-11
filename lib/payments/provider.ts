import Stripe from "stripe";
import { runtimeConfig } from "@/lib/config/runtime";

export interface DepositIntentRequest {
  appointmentId: string;
  amount: number;
  customerEmail: string;
  customerName: string;
}

export interface SavedPaymentMethodRequest {
  customerEmail: string;
  customerName: string;
}

export interface PaymentIntentEnvelope {
  provider: "stripe";
  mode: "deposit" | "setup";
  clientSecret: string;
  customerId?: string;
  publishableKey?: string;
}

export interface PaymentProvider {
  kind: "stripe";
  createDepositIntent(input: DepositIntentRequest): Promise<PaymentIntentEnvelope>;
  createSavedPaymentMethodSetup(input: SavedPaymentMethodRequest): Promise<PaymentIntentEnvelope>;
}

async function createStripeProvider(): Promise<PaymentProvider> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!secretKey) {
    throw new Error("Stripe secret key is missing.");
  }

  if (!publishableKey) {
    console.error("[payments] stripe_publishable_key_missing", {
      reference: "stripe_publishable_key_missing"
    });
    throw new Error("Stripe publishable key is missing.");
  }

  const stripe = new Stripe(secretKey);

  async function ensureCustomer(email: string, name: string) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    return customers.data[0] ?? stripe.customers.create({ email, name });
  }

  return {
    kind: "stripe",
    async createDepositIntent(input) {
      const customer = await ensureCustomer(input.customerEmail, input.customerName);
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(input.amount * 100),
        currency: "usd",
        customer: customer.id,
        automatic_payment_methods: { enabled: true },
        metadata: {
          appointmentId: input.appointmentId,
          kind: "deposit"
        }
      });

      return {
        provider: "stripe",
        mode: "deposit",
        clientSecret: intent.client_secret ?? "",
        customerId: customer.id,
        publishableKey
      };
    },
    async createSavedPaymentMethodSetup(input) {
      const customer = await ensureCustomer(input.customerEmail, input.customerName);
      const intent = await stripe.setupIntents.create({
        customer: customer.id,
        automatic_payment_methods: { enabled: true },
        usage: "off_session"
      });

      return {
        provider: "stripe",
        mode: "setup",
        clientSecret: intent.client_secret ?? "",
        customerId: customer.id,
        publishableKey
      };
    }
  };
}

export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (runtimeConfig.paymentProvider !== "stripe" || !process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe payment execution is required for this environment.");
  }

  return createStripeProvider();
}
