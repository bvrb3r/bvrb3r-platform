import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  buildStripeEntitlementWebhookUpdate,
  syncServerEntitlementFromStripeSubscription
} from "@/lib/entitlements/stripe-webhook";

const env = {
  BVRB3R_CLIENT_PRO_MONTHLY_PRICE_ID: "price_client_pro_monthly",
  BVRB3R_BARBER_ELITE_YEARLY_PRICE_ID: "price_barber_elite_yearly"
};

function subscription(overrides: Partial<Stripe.Subscription> = {}) {
  return {
    id: "sub_test_entitlement",
    status: "active",
    customer: "cus_test_entitlement",
    current_period_start: 1780272000,
    current_period_end: 1782864000,
    cancel_at: null,
    trial_end: null,
    metadata: {
      profileId: "profile-client",
      accountRole: "client_user",
      entitlementSource: "server"
    },
    items: {
      data: [
        {
          price: {
            id: "price_client_pro_monthly",
            currency: "usd",
            unit_amount: 1900,
            recurring: { interval: "month" }
          }
        }
      ]
    },
    ...overrides
  } as unknown as Stripe.Subscription;
}

function supabaseUpsertStub(error: unknown = null) {
  const upserts: Array<Record<string, unknown>> = [];
  return {
    upserts,
    client: {
      from(table: string) {
        expect(table).toBe("account_entitlements");
        return {
          upsert(row: Record<string, unknown>, options: Record<string, unknown>) {
            expect(options).toEqual({ onConflict: "profile_id,account_role" });
            upserts.push(row);
            return Promise.resolve({ error });
          }
        };
      }
    }
  };
}

describe("Stripe entitlement webhook mapping", () => {
  it("maps a known Stripe price to canonical role, tier, interval, and status", () => {
    const update = buildStripeEntitlementWebhookUpdate({
      subscription: subscription(),
      env
    });

    expect(update).toMatchObject({
      handled: true,
      blocked: false,
      profileId: "profile-client",
      accountRole: "client_user",
      status: "active",
      stripePriceId: "price_client_pro_monthly"
    });
    expect(update.price).toMatchObject({
      tier: "pro",
      billingInterval: "monthly"
    });
  });

  it("blocks a marked entitlement subscription when the Stripe price is unknown", () => {
    const update = buildStripeEntitlementWebhookUpdate({
      subscription: subscription({
        items: {
          data: [
            {
              price: {
                id: "price_unknown",
                currency: "usd",
                unit_amount: 1900,
                recurring: { interval: "month" }
              }
            }
          ]
        } as never
      }),
      env
    });

    expect(update).toMatchObject({
      handled: true,
      blocked: true,
      reason: "Stripe price is not mapped to a canonical Standard/Pro/Elite entitlement."
    });
  });

  it("blocks role metadata that conflicts with the server price map", () => {
    const update = buildStripeEntitlementWebhookUpdate({
      subscription: subscription({
        metadata: {
          profileId: "profile-client",
          accountRole: "barber_user",
          entitlementSource: "server"
        }
      }),
      env
    });

    expect(update).toMatchObject({
      handled: true,
      blocked: true,
      reason: "Stripe entitlement role metadata does not match the server price map."
    });
  });

  it("ignores legacy Stripe subscriptions that are not canonical entitlement events", () => {
    const update = buildStripeEntitlementWebhookUpdate({
      subscription: subscription({
        metadata: {
          clientReference: "client-ref",
          planCode: "client_core_monthly"
        },
        items: {
          data: [
            {
              price: {
                id: "price_legacy_membership",
                currency: "usd",
                unit_amount: 1900,
                recurring: { interval: "month" }
              }
            }
          ]
        } as never
      }),
      env
    });

    expect(update).toMatchObject({
      handled: false,
      blocked: false
    });
  });

  it("persists known entitlement updates through account_entitlements", async () => {
    const supabase = supabaseUpsertStub();
    const result = await syncServerEntitlementFromStripeSubscription({
      supabase: supabase.client as never,
      subscription: subscription(),
      eventId: "evt_entitlement_active",
      env
    });

    expect(result).toMatchObject({
      handled: true,
      persisted: true,
      persistenceState: "synced"
    });
    expect(supabase.upserts).toHaveLength(1);
    expect(supabase.upserts[0]).toMatchObject({
      profile_id: "profile-client",
      account_role: "client_user",
      tier: "pro",
      billing_interval: "monthly",
      entitlement_status: "active",
      source_of_truth: "stripe_webhook",
      stripe_subscription_id: "sub_test_entitlement",
      stripe_price_id: "price_client_pro_monthly",
      last_stripe_event_id: "evt_entitlement_active"
    });
  });

  it("does not write entitlement rows for blocked webhook evidence", async () => {
    const supabase = supabaseUpsertStub();
    const result = await syncServerEntitlementFromStripeSubscription({
      supabase: supabase.client as never,
      subscription: subscription({
        items: {
          data: [
            {
              price: {
                id: "price_unknown",
                currency: "usd",
                unit_amount: 1900,
                recurring: { interval: "month" }
              }
            }
          ]
        } as never
      }),
      env
    });

    expect(result).toMatchObject({
      handled: true,
      persisted: false,
      persistenceState: "blocked"
    });
    expect(supabase.upserts).toHaveLength(0);
  });

  it("returns Needs Review when persistence has not been migrated yet", async () => {
    const supabase = supabaseUpsertStub({
      code: "42P01",
      message: "relation public.account_entitlements does not exist"
    });
    const result = await syncServerEntitlementFromStripeSubscription({
      supabase: supabase.client as never,
      subscription: subscription(),
      eventId: "evt_missing_table",
      env
    });

    expect(result).toMatchObject({
      handled: true,
      persisted: false,
      persistenceState: "missing_table",
      reason: "account_entitlements persistence is not applied; entitlement remains Needs Review."
    });
  });
});
