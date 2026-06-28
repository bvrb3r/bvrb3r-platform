import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClientMock, retrieveStripeSubscriptionMock } = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  retrieveStripeSubscriptionMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => true
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/stripe/billing", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe/billing")>("@/lib/stripe/billing");
  return {
    ...actual,
    retrieveStripeSubscription: retrieveStripeSubscriptionMock
  };
});

import { processStripeBillingWebhookEvent } from "@/lib/monetization/service";

function subscription() {
  return {
    id: "sub_canonical_entitlement",
    status: "active",
    customer: "cus_canonical_entitlement",
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
    }
  };
}

function supabaseStub() {
  const upserts: Array<Record<string, unknown>> = [];
  return {
    upserts,
    client: {
      from(table: string) {
        if (table !== "account_entitlements") {
          throw new Error(`Unexpected table ${table}`);
        }

        return {
          upsert(row: Record<string, unknown>) {
            upserts.push(row);
            return Promise.resolve({ error: null });
          }
        };
      }
    }
  };
}

describe("monetization entitlement webhook integration", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    retrieveStripeSubscriptionMock.mockReset();
    process.env.BVRB3R_CLIENT_PRO_MONTHLY_PRICE_ID = "price_client_pro_monthly";
  });

  it("handles canonical entitlement checkout sessions without falling through to legacy client membership sync", async () => {
    const supabase = supabaseStub();
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    retrieveStripeSubscriptionMock.mockResolvedValue(subscription());

    const result = await processStripeBillingWebhookEvent({
      id: "evt_checkout_canonical_entitlement",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          subscription: "sub_canonical_entitlement",
          customer: "cus_canonical_entitlement",
          metadata: {
            profileId: "profile-client",
            accountRole: "client_user",
            entitlementSource: "server"
          }
        }
      }
    } as never);

    expect(result).toEqual({ handled: true });
    expect(supabase.upserts).toHaveLength(1);
    expect(supabase.upserts[0]).toMatchObject({
      profile_id: "profile-client",
      account_role: "client_user",
      tier: "pro",
      billing_interval: "monthly",
      entitlement_status: "active",
      source_of_truth: "stripe_webhook",
      last_stripe_event_id: "evt_checkout_canonical_entitlement"
    });
  });
});
