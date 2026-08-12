import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClientMock,
  verifyStripePlatformWebhookEventMock,
  processStripeBillingWebhookEventMock,
  processGiftCardStripeEventMock,
  beginStripeWebhookAuditMock,
  completeStripeWebhookAuditMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  verifyStripePlatformWebhookEventMock: vi.fn(),
  processStripeBillingWebhookEventMock: vi.fn(),
  processGiftCardStripeEventMock: vi.fn(),
  beginStripeWebhookAuditMock: vi.fn(),
  completeStripeWebhookAuditMock: vi.fn()
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
    verifyStripePlatformWebhookEvent: verifyStripePlatformWebhookEventMock
  };
});

vi.mock("@/lib/stripe/webhook-audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe/webhook-audit")>("@/lib/stripe/webhook-audit");
  return {
    ...actual,
    beginStripeWebhookAudit: beginStripeWebhookAuditMock,
    completeStripeWebhookAudit: completeStripeWebhookAuditMock
  };
});

vi.mock("@/lib/monetization/service", () => ({
  processStripeBillingWebhookEvent: processStripeBillingWebhookEventMock
}));

vi.mock("@/lib/gift-cards/service", () => ({
  processGiftCardStripeEvent: processGiftCardStripeEventMock
}));

import {
  FintechServiceError,
  processStripePlatformWebhook,
  syncStripeWebhookPaymentStatus
} from "@/lib/fintech/service";
import { StripeWebhookAuditError } from "@/lib/stripe/webhook-audit";

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

describe("phase 3 fintech webhook service", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    verifyStripePlatformWebhookEventMock.mockReset();
    processStripeBillingWebhookEventMock.mockReset();
    processGiftCardStripeEventMock.mockReset();
    beginStripeWebhookAuditMock.mockReset();
    completeStripeWebhookAuditMock.mockReset();
    createSupabaseAdminClientMock.mockReturnValue({});
    processStripeBillingWebhookEventMock.mockResolvedValue({ handled: false });
    processGiftCardStripeEventMock.mockResolvedValue({ handled: false });
    completeStripeWebhookAuditMock.mockResolvedValue(undefined);
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
    verifyStripePlatformWebhookEventMock.mockReturnValue({
      id: "evt_live_duplicate",
      type: "charge.succeeded",
      account: null,
      created: 1776769200,
      livemode: true,
      api_version: "2026-02-25.clover",
      data: { object: { id: "ch_live_1", payment_intent: "pi_live_1" } }
    });
    beginStripeWebhookAuditMock.mockResolvedValue({
      duplicate: true,
      row: {
        id: "webhook-audit-1",
        processing_status: "processed",
        attempt_count: 1
      }
    });

    const result = await processStripePlatformWebhook("{}", "test_signature");

    expect(result).toEqual({
      received: true,
      duplicate: true,
      status: "processed"
    });
    expect(processStripeBillingWebhookEventMock).not.toHaveBeenCalled();
    expect(processGiftCardStripeEventMock).not.toHaveBeenCalled();
    expect(completeStripeWebhookAuditMock).not.toHaveBeenCalled();
  });

  it("suppresses a sequential duplicate before a billing or ledger mutation runs twice", async () => {
    const event = {
      id: "evt_platform_sequential_duplicate",
      type: "invoice.paid",
      account: null,
      created: 1776769200,
      livemode: true,
      api_version: "2020-08-27",
      data: { object: { id: "in_platform_duplicate", object: "invoice" } }
    };
    let ledgerMutations = 0;

    verifyStripePlatformWebhookEventMock.mockReturnValue(event);
    beginStripeWebhookAuditMock
      .mockResolvedValueOnce({
        duplicate: false,
        row: { id: "platform-audit-sequential", processing_status: "received", attempt_count: 1 }
      })
      .mockResolvedValueOnce({
        duplicate: true,
        row: { id: "platform-audit-sequential", processing_status: "processed", attempt_count: 1 }
      });
    processStripeBillingWebhookEventMock.mockImplementation(async () => {
      ledgerMutations += 1;
      return { handled: true };
    });

    const first = await processStripePlatformWebhook("{}", "platform_signature");
    const duplicate = await processStripePlatformWebhook("{}", "platform_signature");

    expect(first).toMatchObject({ duplicate: false, status: "processed" });
    expect(duplicate).toMatchObject({ duplicate: true, status: "processed" });
    expect(ledgerMutations).toBe(1);
    expect(processStripeBillingWebhookEventMock).toHaveBeenCalledTimes(1);
    expect(processGiftCardStripeEventMock).not.toHaveBeenCalled();
    expect(completeStripeWebhookAuditMock).toHaveBeenCalledTimes(1);
  });

  it("allows only one concurrent Platform delivery to reach its billing or ledger mutation", async () => {
    const event = {
      id: "evt_platform_concurrent_duplicate",
      type: "invoice.paid",
      account: null,
      created: 1776769200,
      livemode: true,
      api_version: "2020-08-27",
      data: { object: { id: "in_platform_concurrent", object: "invoice" } }
    };
    let claimed = false;
    let ledgerMutations = 0;

    verifyStripePlatformWebhookEventMock.mockReturnValue(event);
    beginStripeWebhookAuditMock.mockImplementation(async () => {
      if (claimed) {
        throw new StripeWebhookAuditError(
          "This Stripe webhook event is already being processed.",
          503,
          "stripe_webhook_in_progress"
        );
      }
      claimed = true;
      return {
        duplicate: false,
        row: { id: "platform-audit-concurrent", processing_status: "received", attempt_count: 1 }
      };
    });
    processStripeBillingWebhookEventMock.mockImplementation(async () => {
      ledgerMutations += 1;
      return { handled: true };
    });

    const results = await Promise.allSettled([
      processStripePlatformWebhook("{}", "platform_signature"),
      processStripePlatformWebhook("{}", "platform_signature")
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 503 });
    expect(ledgerMutations).toBe(1);
    expect(processStripeBillingWebhookEventMock).toHaveBeenCalledTimes(1);
    expect(completeStripeWebhookAuditMock).toHaveBeenCalledTimes(1);
  });

  it("marks a transient Platform failure failed, then processes its retry exactly once", async () => {
    const event = {
      id: "evt_platform_retry",
      type: "invoice.paid",
      account: null,
      created: 1776769200,
      livemode: true,
      api_version: "2020-08-27",
      data: { object: { id: "in_platform_retry", object: "invoice" } }
    };
    let ledgerMutations = 0;

    verifyStripePlatformWebhookEventMock.mockReturnValue(event);
    beginStripeWebhookAuditMock
      .mockResolvedValueOnce({
        duplicate: false,
        row: { id: "platform-audit-retry", processing_status: "received", attempt_count: 1 }
      })
      .mockResolvedValueOnce({
        duplicate: false,
        row: { id: "platform-audit-retry", processing_status: "received", attempt_count: 2 }
      })
      .mockResolvedValueOnce({
        duplicate: true,
        row: { id: "platform-audit-retry", processing_status: "processed", attempt_count: 2 }
      });
    processStripeBillingWebhookEventMock
      .mockRejectedValueOnce(new FintechServiceError("Temporary ledger persistence failure.", 503))
      .mockImplementationOnce(async () => {
        ledgerMutations += 1;
        return { handled: true };
      });

    await expect(
      processStripePlatformWebhook("{}", "platform_signature")
    ).rejects.toMatchObject({ status: 503 });
    expect(completeStripeWebhookAuditMock).toHaveBeenNthCalledWith(
      1,
      {},
      "platform-audit-retry",
      {
        processingStatus: "failed",
        attemptCount: 1,
        errorMessage: "Temporary ledger persistence failure."
      }
    );

    const retry = await processStripePlatformWebhook("{}", "platform_signature");
    const duplicate = await processStripePlatformWebhook("{}", "platform_signature");

    expect(retry).toMatchObject({ duplicate: false, status: "processed" });
    expect(duplicate).toMatchObject({ duplicate: true, status: "processed" });
    expect(ledgerMutations).toBe(1);
    expect(processStripeBillingWebhookEventMock).toHaveBeenCalledTimes(2);
    expect(completeStripeWebhookAuditMock).toHaveBeenNthCalledWith(
      2,
      {},
      "platform-audit-retry",
      { processingStatus: "processed", attemptCount: 2 }
    );
  });

  it("audits an unsupported Platform event as ignored without downstream mutation", async () => {
    verifyStripePlatformWebhookEventMock.mockReturnValue({
      id: "evt_platform_unsupported",
      type: "balance.available",
      account: null,
      created: 1776769200,
      livemode: true,
      api_version: "2020-08-27",
      data: { object: { id: "bal_platform", object: "balance" } }
    });
    beginStripeWebhookAuditMock.mockResolvedValue({
      duplicate: false,
      row: { id: "platform-audit-unsupported", processing_status: "received", attempt_count: 1 }
    });

    const result = await processStripePlatformWebhook("{}", "platform_signature");

    expect(result).toEqual({ received: true, duplicate: false, status: "ignored" });
    expect(processStripeBillingWebhookEventMock).toHaveBeenCalledTimes(1);
    expect(processGiftCardStripeEventMock).toHaveBeenCalledTimes(1);
    expect(completeStripeWebhookAuditMock).toHaveBeenCalledWith(
      {},
      "platform-audit-unsupported",
      { processingStatus: "ignored", attemptCount: 1, connectedAccountId: null }
    );
  });
});
