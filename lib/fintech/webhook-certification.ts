import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyStripeWebhookEvent } from "@/lib/stripe/connect";

const CERTIFICATION_PROBE = "v1-live-webhook";
const CERTIFICATION_SCOPE = "processor-verification-only";

type CertificationMetadata = Record<string, string | undefined>;

export function isLiveStripeCertificationProbe(event: Stripe.Event) {
  if (!event.livemode || event.type !== "customer.updated") {
    return false;
  }

  const object = event.data.object as unknown as { object?: string; metadata?: CertificationMetadata };
  return object.object === "customer"
    && object.metadata?.bvrb3r_certification_probe === CERTIFICATION_PROBE
    && object.metadata?.bvrb3r_certification_scope === CERTIFICATION_SCOPE;
}

export async function processLiveStripeCertificationProbe(payload: string, signature: string) {
  const event = verifyStripeWebhookEvent(payload, signature);
  if (!isLiveStripeCertificationProbe(event)) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase service-role configuration is required for webhook certification.");
  }

  const object = event.data.object as unknown as { id?: string; object?: string };
  const now = new Date().toISOString();
  const existing = await supabase
    .from("stripe_webhook_events")
    .select("id, attempt_count, processing_status")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existing.error) {
    throw new Error("Unable to inspect Stripe webhook certification idempotency.");
  }

  if (existing.data?.processing_status === "processed") {
    return { received: true, duplicate: true, status: "processed" as const };
  }

  const values = {
    stripe_event_id: event.id,
    stripe_account_id: event.account ?? null,
    connected_account_id: null,
    event_type: event.type,
    livemode: true,
    api_version: event.api_version ?? null,
    processing_status: "processed",
    attempt_count: Number(existing.data?.attempt_count ?? 0) + 1,
    payload_excerpt: {
      id: event.id,
      type: event.type,
      account: event.account ?? null,
      created: event.created,
      objectId: object.id ?? null,
      objectType: object.object ?? null,
      certificationProbe: CERTIFICATION_PROBE,
      certificationScope: CERTIFICATION_SCOPE
    },
    error_message: null,
    received_at: now,
    processed_at: now,
    updated_at: now
  };

  const write = existing.data
    ? await supabase.from("stripe_webhook_events").update(values).eq("id", existing.data.id)
    : await supabase.from("stripe_webhook_events").insert(values);

  if (write.error) {
    throw new Error("Unable to record the live Stripe webhook certification proof.");
  }

  return { received: true, duplicate: false, status: "processed" as const };
}
