import "server-only";

import Stripe from "stripe";
import type { EntitlementAccountRole } from "@/lib/entitlements/domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type EntitlementBinding = {
  profileId: string | null;
  accountRole: EntitlementAccountRole | null;
  persisted: boolean;
  blocked: boolean;
};

export type Pr34InvoiceBalanceSyncResult = {
  handled: boolean;
  state: "ignored" | "opened" | "already_open" | "settled" | "no_balance_line";
  lineId: string | null;
};

function invoiceIso(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

/**
 * Stripe can leave a subscription `past_due` while retries are still pending.
 * PR34 must not invent a collectible account balance during that window. A
 * balance line opens only after Stripe reports that no next automatic attempt
 * remains (or marks the subscription unpaid) and an exact amount is still due.
 */
export function isPr34FinalInvoiceFailure(
  invoice: Stripe.Invoice,
  subscription: Stripe.Subscription
) {
  return invoice.collection_method === "charge_automatically"
    && invoice.amount_remaining > 0
    && (invoice.attempt_count ?? 0) > 0
    && (subscription.status === "unpaid" || invoice.next_payment_attempt == null);
}

export async function syncPr34SubscriptionInvoiceBalance(input: {
  supabase: SupabaseAdmin;
  invoice: Stripe.Invoice;
  subscription: Stripe.Subscription;
  entitlement: EntitlementBinding;
  eventType: "invoice.payment_failed" | "invoice.paid";
}): Promise<Pr34InvoiceBalanceSyncResult> {
  const { entitlement, invoice, subscription } = input;
  if (
    entitlement.blocked
    || !entitlement.persisted
    || !entitlement.profileId
    || !entitlement.accountRole
  ) {
    return { handled: false, state: "ignored", lineId: null };
  }

  if (input.eventType === "invoice.payment_failed") {
    if (!isPr34FinalInvoiceFailure(invoice, subscription)) {
      return { handled: false, state: "ignored", lineId: null };
    }

    const result = await input.supabase
      .from("billing_balance_lines")
      .upsert({
        profile_id: entitlement.profileId,
        account_role: entitlement.accountRole,
        source_type: "subscription",
        source_reference: invoice.id,
        description: `Stripe subscription balance — ${invoice.number ?? invoice.id}`,
        provider: "stripe",
        provider_reference: invoice.id,
        amount_cents: invoice.amount_remaining,
        amount_paid_cents: 0,
        currency: "usd",
        status: "open",
        collection_paused: false,
        due_at: invoiceIso(invoice.due_date) ?? new Date().toISOString()
      }, {
        onConflict: "profile_id,source_type,source_reference",
        ignoreDuplicates: true
      })
      .select("id")
      .maybeSingle();

    if (result.error) {
      throw new Error("Unable to persist the final Stripe subscription balance.");
    }

    return {
      handled: true,
      state: result.data?.id ? "opened" : "already_open",
      lineId: result.data?.id ? String(result.data.id) : null
    };
  }

  if (invoice.status !== "paid" || invoice.amount_remaining !== 0) {
    return { handled: false, state: "ignored", lineId: null };
  }

  const existing = await input.supabase
    .from("billing_balance_lines")
    .select("id, status, amount_cents")
    .eq("profile_id", entitlement.profileId)
    .eq("source_type", "subscription")
    .eq("source_reference", invoice.id)
    .maybeSingle();
  if (existing.error) {
    throw new Error("Unable to verify the Stripe subscription balance line.");
  }
  if (!existing.data || !["open", "disputed"].includes(String(existing.data.status))) {
    return { handled: true, state: "no_balance_line", lineId: existing.data?.id ? String(existing.data.id) : null };
  }

  const paidAt = invoiceIso(invoice.status_transitions?.paid_at) ?? new Date().toISOString();
  const settlement = await input.supabase
    .from("billing_balance_lines")
    .update({
      amount_paid_cents: Number(existing.data.amount_cents),
      status: "paid",
      collection_paused: false,
      settlement_reference: invoice.id,
      resolved_at: paidAt,
      paid_at: paidAt
    })
    .eq("id", existing.data.id)
    .eq("profile_id", entitlement.profileId)
    .in("status", ["open", "disputed"])
    .select("id")
    .maybeSingle();
  if (settlement.error || !settlement.data) {
    throw new Error("Unable to settle the verified Stripe subscription balance.");
  }

  return { handled: true, state: "settled", lineId: String(settlement.data.id) };
}
