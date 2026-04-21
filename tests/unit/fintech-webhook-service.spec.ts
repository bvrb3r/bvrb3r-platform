import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  verifyStripeWebhookEventMock,
  processStripeBillingWebhookEventMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  verifyStripeWebhookEventMock: vi.fn(),
  processStripeBillingWebhookEventMock: vi.fn()
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

vi.mock("@/lib/stripe/connect", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe/connect")>("@/lib/stripe/connect");
  return {
    ...actual,
    verifyStripeWebhookEvent: verifyStripeWebhookEventMock
  };
});

vi.mock("@/lib/monetization/service", () => ({
  processStripeBillingWebhookEvent: processStripeBillingWebhookEventMock
}));

import { processStripeConnectWebhook, syncStripeWebhookPaymentStatus } from "@/lib/fintech/service";

function createPlatformEventSupabaseStub(paymentOverrides: Record<string, unknown> = {}) {
  const payment = {
    id: "pay-live-1",
    appointment_id: "appt-live-1",
    client_id: "client-live-1",
    shop_id: "shop-live-1",
    barber_id: "barber-live-1",
    provider: "stripe",
    provider_payment_intent_id: "pi_live_1",
    amount: 55,
    currency: "usd",
    payment_status: "pending",
    payment_type: "booking",
    paid_at: null,
    created_at: "2026-04-21T12:00:00.000Z",
    updated_at: "2026-04-21T12:00:00.000Z",
    ...paymentOverrides
  };

  const platformEvents: Array<Record<string, unknown>> = [];

  return {
    state: {
      payment,
      platformEvents
    },
    from(table: string) {
      if (table === "payments") {
        return {
          update(values: Record<string, unknown>) {
            return {
              eq(column: string, value: string) {
                expect(column).toBe("id");
                expect(value).toBe(payment.id);
                Object.assign(payment, values);
                return {
                  select(columns: string) {
                    expect(columns).toContain("provider_payment_intent_id");
                    return {
                      single: async () => ({ data: { ...payment }, error: null })
                    };
                  }
                };
              }
            };
          }
        };
      }

      if (table === "platform_events") {
        return {
          upsert(row: Record<string, unknown>) {
            platformEvents.push(row);
            return Promise.resolve({ error: null });
          },
          insert(row: Record<string, unknown>) {
            platformEvents.push(row);
            return Promise.resolve({ error: null });
          }
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }
  };
}

function createDuplicateWebhookSupabaseStub(processingStatus: "processed" | "ignored" = "processed") {
  return {
    from(table: string) {
      if (table !== "stripe_webhook_events") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select(columns: string) {
          expect(columns).toContain("processing_status");
          return {
            eq(column: string, value: string) {
              expect(column).toBe("stripe_event_id");
              expect(value).toBe("evt_live_duplicate");
              return {
                maybeSingle: async () => ({
                  data: {
                    id: "webhook-audit-1",
                    stripe_event_id: "evt_live_duplicate",
                    stripe_account_id: null,
                    connected_account_id: null,
                    event_type: "charge.succeeded",
                    livemode: true,
                    api_version: "2026-02-25.clover",
                    processing_status: processingStatus,
                    attempt_count: 1,
                    payload_excerpt: {},
                    error_message: null,
                    received_at: "2026-04-21T12:00:00.000Z",
                    processed_at: "2026-04-21T12:00:02.000Z",
                    updated_at: "2026-04-21T12:00:02.000Z"
                  },
                  error: null
                })
              };
            }
          };
        }
      };
    }
  };
}

describe("phase 3 fintech webhook service", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    verifyStripeWebhookEventMock.mockReset();
    processStripeBillingWebhookEventMock.mockReset();
    processStripeBillingWebhookEventMock.mockResolvedValue({ handled: false });
  });

  it("records a payment_succeeded platform event when a Stripe webhook captures a pending payment", async () => {
    const supabase = createPlatformEventSupabaseStub();
    const event = {
      id: "evt_payment_success",
      type: "payment_intent.succeeded",
      created: 1776768600,
      data: { object: {} }
    } as never;

    const updated = await syncStripeWebhookPaymentStatus(supabase as never, supabase.state.payment as never, "captured", {
      event,
      skipRoutingSync: true
    });

    expect(updated.payment_status).toBe("captured");
    expect(updated.paid_at).toBe("2026-04-21T10:50:00.000Z");
    expect(supabase.state.platformEvents).toHaveLength(1);
    expect(supabase.state.platformEvents[0]).toMatchObject({
      event_type: "payment_succeeded",
      entity_type: "payment",
      entity_id: "pay-live-1"
    });
  });

  it("records a payment_failed platform event when Stripe marks a pending payment as failed", async () => {
    const supabase = createPlatformEventSupabaseStub();
    const event = {
      id: "evt_payment_failed",
      type: "payment_intent.payment_failed",
      created: 1776768900,
      data: { object: {} }
    } as never;

    const updated = await syncStripeWebhookPaymentStatus(supabase as never, supabase.state.payment as never, "failed", {
      event,
      skipRoutingSync: true
    });

    expect(updated.payment_status).toBe("failed");
    expect(supabase.state.platformEvents).toHaveLength(1);
    expect(supabase.state.platformEvents[0]).toMatchObject({
      event_type: "payment_failed",
      entity_type: "payment",
      entity_id: "pay-live-1"
    });
  });

  it("returns duplicate-safe results without reprocessing an already audited webhook event", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createDuplicateWebhookSupabaseStub());
    verifyStripeWebhookEventMock.mockReturnValue({
      id: "evt_live_duplicate",
      type: "charge.succeeded",
      account: null,
      created: 1776769200,
      livemode: true,
      api_version: "2026-02-25.clover",
      data: { object: { id: "ch_live_1", payment_intent: "pi_live_1" } }
    });

    const result = await processStripeConnectWebhook("{}", "test_signature");

    expect(result).toEqual({
      received: true,
      duplicate: true,
      status: "processed"
    });
    expect(processStripeBillingWebhookEventMock).not.toHaveBeenCalled();
  });
});
