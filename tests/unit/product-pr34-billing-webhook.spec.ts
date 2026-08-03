import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  isPr34FinalInvoiceFailure,
  syncPr34SubscriptionInvoiceBalance
} from "@/lib/billing/pr34-webhook";

function subscription(status: Stripe.Subscription.Status = "past_due") {
  return { id: "sub_pr34", status } as Stripe.Subscription;
}

function invoice(overrides: Partial<Stripe.Invoice> = {}) {
  return {
    id: "in_pr34",
    number: "BVR-0034",
    collection_method: "charge_automatically",
    amount_remaining: 2900,
    amount_paid: 0,
    attempt_count: 3,
    next_payment_attempt: null,
    due_date: 1_786_000_000,
    status: "open",
    status_transitions: { paid_at: null },
    ...overrides
  } as Stripe.Invoice;
}

const entitlement = {
  profileId: "00000000-0000-4000-8000-000000000034",
  accountRole: "barber_user" as const,
  persisted: true,
  blocked: false
};

function supabaseStub(options: {
  existing?: { id: string; status: string; amount_cents: number } | null;
} = {}) {
  const upserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];

  return {
    upserts,
    updates,
    from(table: string) {
      expect(table).toBe("billing_balance_lines");
      return {
        upsert(row: Record<string, unknown>) {
          upserts.push(row);
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id: "line-pr34" }, error: null })
            })
          };
        },
        select() {
          const query = {
            eq: () => query,
            maybeSingle: async () => ({ data: options.existing ?? null, error: null })
          };
          return query;
        },
        update(row: Record<string, unknown>) {
          updates.push(row);
          const query = {
            eq: () => query,
            in: () => query,
            select: () => ({
              maybeSingle: async () => ({ data: { id: options.existing?.id ?? "line-pr34" }, error: null })
            })
          };
          return query;
        }
      };
    }
  };
}

describe("Product PR34 Stripe invoice balance convergence", () => {
  it("does not open an owed balance while Stripe still has an automatic retry", () => {
    expect(isPr34FinalInvoiceFailure(invoice({ next_payment_attempt: 1_786_086_400 }), subscription())).toBe(false);
  });

  it("recognizes an exact remaining amount only after the final automatic failure", () => {
    expect(isPr34FinalInvoiceFailure(invoice(), subscription())).toBe(true);
    expect(isPr34FinalInvoiceFailure(invoice({ amount_remaining: 0 }), subscription())).toBe(false);
    expect(isPr34FinalInvoiceFailure(invoice({ collection_method: "send_invoice" }), subscription())).toBe(false);
  });

  it("opens one server-owned itemized Stripe subscription line", async () => {
    const supabase = supabaseStub();
    const result = await syncPr34SubscriptionInvoiceBalance({
      supabase: supabase as never,
      invoice: invoice(),
      subscription: subscription(),
      entitlement,
      eventType: "invoice.payment_failed"
    });

    expect(result).toMatchObject({ handled: true, state: "opened", lineId: "line-pr34" });
    expect(supabase.upserts).toEqual([expect.objectContaining({
      profile_id: entitlement.profileId,
      account_role: "barber_user",
      source_type: "subscription",
      source_reference: "in_pr34",
      provider: "stripe",
      provider_reference: "in_pr34",
      amount_cents: 2900,
      status: "open"
    })]);
  });

  it("settles the original line amount when Stripe later pays the invoice", async () => {
    const supabase = supabaseStub({
      existing: { id: "line-pr34", status: "disputed", amount_cents: 1900 }
    });
    const result = await syncPr34SubscriptionInvoiceBalance({
      supabase: supabase as never,
      invoice: invoice({
        amount_remaining: 0,
        amount_paid: 2900,
        status: "paid",
        status_transitions: { paid_at: 1_786_100_000 } as Stripe.Invoice.StatusTransitions
      }),
      subscription: subscription("active"),
      entitlement,
      eventType: "invoice.paid"
    });

    expect(result).toMatchObject({ handled: true, state: "settled", lineId: "line-pr34" });
    expect(supabase.updates).toEqual([expect.objectContaining({
      amount_paid_cents: 1900,
      status: "paid",
      collection_paused: false,
      settlement_reference: "in_pr34"
    })]);
  });

  it("does not bind balance money when entitlement identity is unverified", async () => {
    const supabase = supabaseStub();
    const result = await syncPr34SubscriptionInvoiceBalance({
      supabase: supabase as never,
      invoice: invoice(),
      subscription: subscription(),
      entitlement: { ...entitlement, blocked: true },
      eventType: "invoice.payment_failed"
    });

    expect(result).toEqual({ handled: false, state: "ignored", lineId: null });
    expect(supabase.upserts).toEqual([]);
  });
});
