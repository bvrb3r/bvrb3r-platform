import type { SupabaseClient } from "@supabase/supabase-js";

export const PLATFORM_EVENT_TYPES = [
  "booking_created",
  "booking_updated",
  "booking_canceled",
  "booking_rescheduled",
  "booking_completed",
  "appointment_checked_in",
  "appointment_started",
  "appointment_completed",
  "ai_recommendation_shown",
  "ai_recommendation_clicked",
  "ai_recommendation_converted",
  "ai_recommendation_suppressed",
  "payment_succeeded",
  "payment_failed",
  "payment_routing_created",
  "routing_repair_required",
  "payout_eligible",
  "payout_held",
  "payout_released",
  "payout_readiness_approved",
  "dispute_created",
  "dispute_resolved",
  "verification_updated",
  "verification_approved",
  "verification_rejected",
  "points_earned",
  "points_redeemed",
  "referral_qualified",
  "referral_rewarded",
  "membership_started",
  "membership_canceled",
  "membership_past_due"
] as const;

export type PlatformEventType = (typeof PLATFORM_EVENT_TYPES)[number];
export type PlatformEventSource = "ui" | "api" | "webhook" | "system";
export type PlatformEventPayload = Record<string, unknown>;
export type PlatformEventRelatedIds = Record<string, unknown>;

export type PlatformEventInput = {
  eventType: PlatformEventType;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  actorRole?: string | null;
  source: PlatformEventSource;
  relatedIds?: PlatformEventRelatedIds;
  payload?: PlatformEventPayload;
  idempotencyKey?: string | null;
  occurredAt?: string | null;
};

export type PlatformEventRow = {
  event_type: PlatformEventType;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  actor_role: string | null;
  source: PlatformEventSource;
  related_ids: PlatformEventRelatedIds;
  payload: PlatformEventPayload;
  idempotency_key: string | null;
  occurred_at: string;
};

type PlatformEventSupabaseClient = Pick<SupabaseClient, "from">;

type PlatformEventRecordResult =
  | { ok: true }
  | { ok: false; skipped?: true; reason?: string; error?: unknown };

export class PlatformEventPersistenceError extends Error {
  constructor(
    readonly event: PlatformEventInput,
    readonly causeDetail?: unknown,
    message = `Failed to persist platform event ${event.eventType} for ${event.entityType}:${event.entityId}.`
  ) {
    super(message);
    this.name = "PlatformEventPersistenceError";
  }
}

function cleanRecord(record: PlatformEventRelatedIds | PlatformEventPayload | undefined) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

export function buildPlatformEventRow(input: PlatformEventInput): PlatformEventRow {
  const eventType = input.eventType;
  if (!PLATFORM_EVENT_TYPES.includes(eventType)) {
    throw new Error(`Unsupported platform event type: ${eventType}`);
  }
  if (!input.entityType.trim() || !input.entityId.trim()) {
    throw new Error("Platform events require entity_type and entity_id.");
  }

  return {
    event_type: eventType,
    entity_type: input.entityType.trim(),
    entity_id: input.entityId.trim(),
    actor_id: input.actorId?.trim() || null,
    actor_role: input.actorRole?.trim() || null,
    source: input.source,
    related_ids: cleanRecord(input.relatedIds),
    payload: cleanRecord(input.payload),
    idempotency_key: input.idempotencyKey?.trim() || null,
    occurred_at: input.occurredAt ?? new Date().toISOString()
  };
}

export function buildPlatformEventIdempotencyKey(parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part) => part !== null && part !== undefined && `${part}`.trim().length > 0)
    .map((part) => `${part}`.trim())
    .join(":");
}

export async function recordPlatformEvent(
  supabase: PlatformEventSupabaseClient | null | undefined,
  input: PlatformEventInput
): Promise<PlatformEventRecordResult> {
  if (!supabase) {
    return { ok: false as const, skipped: true as const, reason: "missing_supabase_client" };
  }

  const row = buildPlatformEventRow(input);
  const query = supabase.from("platform_events");
  const result = row.idempotency_key
    ? await query.upsert(row, { onConflict: "idempotency_key", ignoreDuplicates: true })
    : await query.insert(row);

  if (result.error) {
    console.error("[platform-events] failed to record event", {
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      message: result.error.message
    });
    return { ok: false as const, error: result.error };
  }

  return { ok: true as const };
}

export async function recordPlatformEvents(
  supabase: PlatformEventSupabaseClient | null | undefined,
  inputs: PlatformEventInput[]
) {
  const results = [];
  for (const input of inputs) {
    results.push(await recordPlatformEvent(supabase, input));
  }
  return results;
}

export async function recordRequiredPlatformEvent(
  supabase: PlatformEventSupabaseClient | null | undefined,
  input: PlatformEventInput
) {
  const result = await recordPlatformEvent(supabase, input);
  if (!result.ok) {
    throw new PlatformEventPersistenceError(input, result.error ?? result.reason);
  }
  return result;
}

export async function recordRequiredPlatformEvents(
  supabase: PlatformEventSupabaseClient | null | undefined,
  inputs: PlatformEventInput[]
) {
  const results = [];
  for (const input of inputs) {
    results.push(await recordRequiredPlatformEvent(supabase, input));
  }
  return results;
}

export async function queryPlatformEventsByEntity(
  supabase: PlatformEventSupabaseClient,
  entityType: string,
  entityId: string
) {
  return supabase
    .from("platform_events")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("occurred_at", { ascending: false });
}
