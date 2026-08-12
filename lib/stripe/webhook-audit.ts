import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type StripeWebhookDestination = "platform" | "connect" | "identity";

export type StripeWebhookAuditRow = {
  id: string;
  destination: StripeWebhookDestination;
  stripe_event_id: string;
  stripe_account_id: string | null;
  connected_account_id: string | null;
  event_type: string;
  livemode: boolean;
  api_version: string | null;
  processing_status: "received" | "processed" | "ignored" | "failed";
  attempt_count: number;
  payload_excerpt: Record<string, unknown>;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  updated_at: string;
};

export class StripeWebhookAuditError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "StripeWebhookAuditError";
    this.status = status;
    this.code = code;
  }
}

const STRIPE_WEBHOOK_AUDIT_SELECT = "id, destination, stripe_event_id, stripe_account_id, connected_account_id, event_type, livemode, api_version, processing_status, attempt_count, payload_excerpt, error_message, received_at, processed_at, updated_at";
const STRIPE_WEBHOOK_CLAIM_LEASE_MS = 5 * 60 * 1000;

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}

function isMissingTableOrColumn(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string | null; message?: string | null };
  const message = `${candidate.message ?? ""}`.toLowerCase();
  return candidate.code === "42P01"
    || candidate.code === "42703"
    || candidate.code === "PGRST204"
    || candidate.code === "PGRST205"
    || message.includes("does not exist")
    || message.includes("could not find the table")
    || message.includes("could not find the 'destination' column");
}

function auditFailure(error: unknown, fallbackMessage: string) {
  if (isMissingTableOrColumn(error)) {
    return new StripeWebhookAuditError(
      "Stripe webhook audit storage is not available in this environment.",
      503,
      "stripe_webhook_audit_unavailable"
    );
  }

  const message = error instanceof Error && error.message ? error.message : fallbackMessage;
  return new StripeWebhookAuditError(message, 500, "stripe_webhook_audit_failed");
}

export function createStripeEventExcerpt(event: Stripe.Event) {
  const object = typeof event.data.object === "object" && event.data.object
    ? event.data.object as unknown as Record<string, unknown>
    : null;

  return {
    id: event.id,
    type: event.type,
    created: event.created,
    account: event.account ?? null,
    objectType: object?.object ?? null,
    objectId: typeof object?.id === "string" ? object.id : null
  };
}

async function readExistingAudit(
  supabase: SupabaseAdminClient,
  destination: StripeWebhookDestination,
  eventId: string
) {
  const result = await supabase
    .from("stripe_webhook_events")
    .select(STRIPE_WEBHOOK_AUDIT_SELECT)
    .eq("destination", destination)
    .eq("stripe_event_id", eventId)
    .maybeSingle();

  if (result.error) {
    throw auditFailure(result.error, "Unable to inspect Stripe webhook idempotency.");
  }

  return result.data as StripeWebhookAuditRow | null;
}

export async function beginStripeWebhookAudit(
  supabase: SupabaseAdminClient,
  destination: StripeWebhookDestination,
  event: Stripe.Event
) {
  const now = new Date().toISOString();
  const insertResult = await supabase
    .from("stripe_webhook_events")
    .insert({
      destination,
      stripe_event_id: event.id,
      stripe_account_id: event.account ?? null,
      event_type: event.type,
      livemode: event.livemode,
      api_version: event.api_version ?? null,
      processing_status: "received",
      payload_excerpt: createStripeEventExcerpt(event),
      received_at: now,
      updated_at: now
    })
    .select(STRIPE_WEBHOOK_AUDIT_SELECT)
    .single();

  if (!insertResult.error) {
    return { row: insertResult.data as StripeWebhookAuditRow, duplicate: false };
  }

  if (!isUniqueViolation(insertResult.error)) {
    throw auditFailure(insertResult.error, "Unable to record the Stripe webhook audit.");
  }

  const existing = await readExistingAudit(supabase, destination, event.id);
  if (!existing) {
    throw new StripeWebhookAuditError(
      "Stripe webhook claim conflicted but could not be reloaded.",
      503,
      "stripe_webhook_claim_conflict"
    );
  }

  if (existing.processing_status === "processed" || existing.processing_status === "ignored") {
    return { row: existing, duplicate: true };
  }

  const existingUpdatedAt = Date.parse(existing.updated_at);
  const receivedClaimIsStale = existing.processing_status === "received"
    && Number.isFinite(existingUpdatedAt)
    && existingUpdatedAt <= Date.now() - STRIPE_WEBHOOK_CLAIM_LEASE_MS;

  if (existing.processing_status === "received" && !receivedClaimIsStale) {
    throw new StripeWebhookAuditError(
      "This Stripe webhook event is already being processed.",
      503,
      "stripe_webhook_in_progress"
    );
  }

  const retryResult = await supabase
    .from("stripe_webhook_events")
    .update({
      stripe_account_id: event.account ?? existing.stripe_account_id,
      event_type: event.type,
      livemode: event.livemode,
      api_version: event.api_version ?? existing.api_version,
      processing_status: "received",
      attempt_count: existing.attempt_count + 1,
      payload_excerpt: createStripeEventExcerpt(event),
      error_message: null,
      processed_at: null,
      updated_at: now
    })
    .eq("id", existing.id)
    .eq("processing_status", existing.processing_status)
    .eq("updated_at", existing.updated_at)
    .select(STRIPE_WEBHOOK_AUDIT_SELECT)
    .maybeSingle();

  if (retryResult.error) {
    throw auditFailure(retryResult.error, "Unable to claim the Stripe webhook retry.");
  }

  if (!retryResult.data) {
    throw new StripeWebhookAuditError(
      "This Stripe webhook retry is already being processed.",
      503,
      "stripe_webhook_retry_in_progress"
    );
  }

  return { row: retryResult.data as StripeWebhookAuditRow, duplicate: false };
}

export async function completeStripeWebhookAudit(
  supabase: SupabaseAdminClient,
  rowId: string,
  input: {
    processingStatus: "processed" | "ignored" | "failed";
    attemptCount: number;
    connectedAccountId?: string | null;
    errorMessage?: string | null;
  }
) {
  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("stripe_webhook_events")
    .update({
      processing_status: input.processingStatus,
      connected_account_id: input.connectedAccountId ?? null,
      error_message: input.errorMessage ?? null,
      processed_at: input.processingStatus === "failed" ? null : now,
      updated_at: now
    })
    .eq("id", rowId)
    .eq("processing_status", "received")
    .eq("attempt_count", input.attemptCount)
    .select("id")
    .maybeSingle();

  if (updateResult.error) {
    throw auditFailure(updateResult.error, "Unable to finalize the Stripe webhook audit.");
  }

  if (!updateResult.data) {
    throw new StripeWebhookAuditError(
      "The Stripe webhook audit claim was lost before it could be finalized.",
      503,
      "stripe_webhook_claim_lost"
    );
  }
}
