import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function syncGroupPaymentIntentProviderStatus(input: {
  paymentIntentId: string;
  outcome: "paid" | "needs_review";
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from("group_booking_payment_intents").update({
    status: input.outcome,
    updated_at: new Date().toISOString()
  }).eq("stripe_payment_intent_id", input.paymentIntentId)
    .in("status", ["ready_at_checkout", "link_queued", "needs_review"]);
}
