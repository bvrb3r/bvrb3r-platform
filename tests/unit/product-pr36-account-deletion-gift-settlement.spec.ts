import { describe, expect, it, vi } from "vitest";
import { settlePr36GiftPurchasesBeforeDeletion } from "@/lib/trust/account-privacy-worker";

type Purchase = {
  id: string;
  amount_cents: number;
  currency: string;
  stripe_payment_intent_id: string | null;
  status: string;
};

function giftSettlementDatabase(input: { purchases?: Purchase[]; readError?: unknown }) {
  const updates: Array<{ id: string; status: string }> = [];
  return {
    updates,
    client: {
      from(table: string) {
        expect(table).toBe("gift_card_purchase_attempts");
        const read = {
          select: () => read,
          eq: () => read,
          is: () => read,
          in: () => read,
          order: async () => ({ data: input.purchases ?? [], error: input.readError ?? null })
        };
        return {
          ...read,
          update(payload: { status: string }) {
            let purchaseId = "";
            const write = {
              eq(_column: string, value: string) {
                purchaseId = value;
                return write;
              },
              async is() {
                updates.push({ id: purchaseId, status: payload.status });
                return { error: null };
              }
            };
            return write;
          }
        };
      }
    }
  };
}

function paymentIntent(purchase: Purchase, status: "succeeded" | "requires_payment_method" | "canceled") {
  return {
    id: purchase.stripe_payment_intent_id,
    amount: purchase.amount_cents,
    amount_received: status === "succeeded" ? purchase.amount_cents : 0,
    currency: purchase.currency,
    status,
    latest_charge: null,
    metadata: {
      purpose: "pr36_gift_card_purchase",
      purchaseId: purchase.id
    }
  };
}

describe("PR36 gift purchase settlement before account deletion", () => {
  it("refunds succeeded value that never activated and records an idempotent terminal state", async () => {
    const purchase: Purchase = {
      id: "46a3aa1e-7af2-40c9-b798-7c00948b7824",
      amount_cents: 5000,
      currency: "usd",
      stripe_payment_intent_id: "pi_gift_paid",
      status: "paid"
    };
    const database = giftSettlementDatabase({ purchases: [purchase] });
    const createRefund = vi.fn().mockResolvedValue({ id: "re_gift_deleted" });
    const cancelIntent = vi.fn();

    await expect(settlePr36GiftPurchasesBeforeDeletion({
      supabase: database.client as never,
      profileId: "profile-1",
      stripe: {
        paymentIntents: {
          retrieve: vi.fn().mockResolvedValue(paymentIntent(purchase, "succeeded")),
          cancel: cancelIntent
        },
        refunds: { create: createRefund }
      } as never
    })).resolves.toBe(1);

    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({
      payment_intent: "pi_gift_paid",
      reason: "requested_by_customer"
    }), {
      idempotencyKey: `pr36-gift-account-deletion-refund:${purchase.id}`
    });
    expect(cancelIntent).not.toHaveBeenCalled();
    expect(database.updates).toEqual([{ id: purchase.id, status: "refunded" }]);
  });

  it("recognizes an existing full provider refund without creating a duplicate", async () => {
    const purchase: Purchase = {
      id: "4d1b8e7c-acf4-47ef-b860-11c2b35b16fd",
      amount_cents: 5000,
      currency: "usd",
      stripe_payment_intent_id: "pi_gift_already_refunded",
      status: "needs_review"
    };
    const database = giftSettlementDatabase({ purchases: [purchase] });
    const intent = paymentIntent(purchase, "succeeded");
    intent.latest_charge = {
      id: "ch_refunded",
      refunded: true,
      amount_refunded: purchase.amount_cents
    } as never;
    const createRefund = vi.fn();

    await expect(settlePr36GiftPurchasesBeforeDeletion({
      supabase: database.client as never,
      profileId: "profile-1",
      stripe: {
        paymentIntents: { retrieve: vi.fn().mockResolvedValue(intent), cancel: vi.fn() },
        refunds: { create: createRefund }
      } as never
    })).resolves.toBe(1);

    expect(createRefund).not.toHaveBeenCalled();
    expect(database.updates).toEqual([{ id: purchase.id, status: "refunded" }]);
  });

  it("cancels an unpaid intent before identity anonymization", async () => {
    const purchase: Purchase = {
      id: "9139e471-0c2f-4ab0-a8be-4aba0940a283",
      amount_cents: 3500,
      currency: "usd",
      stripe_payment_intent_id: "pi_gift_open",
      status: "requires_payment"
    };
    const database = giftSettlementDatabase({ purchases: [purchase] });
    const cancelIntent = vi.fn().mockResolvedValue({ id: purchase.stripe_payment_intent_id, status: "canceled" });

    await expect(settlePr36GiftPurchasesBeforeDeletion({
      supabase: database.client as never,
      profileId: "profile-1",
      stripe: {
        paymentIntents: {
          retrieve: vi.fn().mockResolvedValue(paymentIntent(purchase, "requires_payment_method")),
          cancel: cancelIntent
        },
        refunds: { create: vi.fn() }
      } as never
    })).resolves.toBe(1);

    expect(cancelIntent).toHaveBeenCalledWith("pi_gift_open", {
      cancellation_reason: "requested_by_customer"
    }, {
      idempotencyKey: `pr36-gift-account-deletion-cancel:${purchase.id}`
    });
    expect(database.updates).toEqual([{ id: purchase.id, status: "failed" }]);
  });

  it("closes an abandoned pre-provider attempt without requiring Stripe configuration", async () => {
    const purchase: Purchase = {
      id: "4f2f82e9-0f33-4cee-8f3f-ec394323fab4",
      amount_cents: 2500,
      currency: "usd",
      stripe_payment_intent_id: null,
      status: "creating"
    };
    const database = giftSettlementDatabase({ purchases: [purchase] });

    await expect(settlePr36GiftPurchasesBeforeDeletion({
      supabase: database.client as never,
      profileId: "profile-1"
    })).resolves.toBe(1);
    expect(database.updates).toEqual([{ id: purchase.id, status: "failed" }]);
  });

  it("fails closed when the provider reference does not belong to the purchase", async () => {
    const purchase: Purchase = {
      id: "e62890ab-2e14-493b-a9cd-e02f6afc55f4",
      amount_cents: 4500,
      currency: "usd",
      stripe_payment_intent_id: "pi_wrong",
      status: "paid"
    };
    const database = giftSettlementDatabase({ purchases: [purchase] });
    const intent = paymentIntent(purchase, "succeeded");
    intent.metadata.purchaseId = "another-purchase";

    await expect(settlePr36GiftPurchasesBeforeDeletion({
      supabase: database.client as never,
      profileId: "profile-1",
      stripe: {
        paymentIntents: { retrieve: vi.fn().mockResolvedValue(intent), cancel: vi.fn() },
        refunds: { create: vi.fn() }
      } as never
    })).rejects.toThrow("gift_purchase_payment_reference_mismatch");
    expect(database.updates).toEqual([]);
  });

  it("is backward-compatible when PR31 deploys before the PR36 schema", async () => {
    const database = giftSettlementDatabase({
      readError: { code: "42P01", message: 'relation "gift_card_purchase_attempts" does not exist' }
    });

    await expect(settlePr36GiftPurchasesBeforeDeletion({
      supabase: database.client as never,
      profileId: "profile-1",
      stripe: {} as never
    })).resolves.toBe(0);
    expect(database.updates).toEqual([]);
  });
});
