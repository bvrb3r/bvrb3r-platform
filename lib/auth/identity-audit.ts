import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCanonicalAccountRole } from "@/lib/auth/roles";
import type { UserAccount } from "@/types/domain";

/**
 * Identity audit contract.
 *
 * Every identity or authorization decision worth reconstructing later goes
 * through here: who acted, what authority they held *at that moment*, what they
 * touched, and whether it was allowed. Capturing the effective role at write
 * time matters because a later role change must not be able to rewrite the
 * meaning of an old record.
 *
 * The hard rule is what must never land in the table: no tokens, no passwords,
 * no OTP codes, no magic-link URLs, no raw credential payloads. That rule is
 * enforced here rather than trusted to callers, because an audit log is exactly
 * the place a leaked secret survives longest and is read by the most people.
 * The database side is append-only (see the PR 19 migration), so a redaction
 * miss cannot be quietly cleaned up after the fact.
 */

export const IDENTITY_AUDIT_TABLE = "identity_audit_events";

export type IdentityAuditOutcome = "succeeded" | "denied" | "failed";

export type IdentityAuditEventInput = {
  /** Verified actor. Null for pre-authentication events such as a failed sign-in. */
  actor: Pick<UserAccount, "id" | "role" | "platformAdmin"> | null;
  source: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  outcome?: IdentityAuditOutcome;
  correlationId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Key names whose values are never safe to persist. Matched case-insensitively
 * against the whole key, so `resetToken`, `otp_code` and `X-Api-Key` are all
 * caught. Deliberately broad: a false positive costs one redacted field in a
 * log, a false negative costs a leaked credential.
 */
const FORBIDDEN_KEY_PATTERN =
  /(pass(word|phrase)|secret|token|otp|onetime|one_time|credential|authorization|auth_header|cookie|session_token|refresh|access_key|api[_-]?key|private[_-]?key|signature|magic[_-]?link|reset[_-]?link|confirmation[_-]?url|pin\b|cvv|card[_-]?number)/i;

/**
 * Values that look like a credential even under an innocent key name — JWTs,
 * bearer headers, Supabase magic-link URLs carrying a token, and bare OTP-ish
 * digit runs. Keys are attacker-influenced in places; values are the backstop.
 */
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/;
const BEARER_PATTERN = /\bbearer\s+[A-Za-z0-9._-]{12,}/i;
const TOKEN_QUERY_PATTERN = /[?&](access_token|refresh_token|token|token_hash|code)=[^&\s]+/i;
const SUPABASE_KEY_PATTERN = /\bsb(p|_)[a-z]*_[A-Za-z0-9_-]{16,}/i;

export const IDENTITY_AUDIT_REDACTED = "[redacted]";

/** How deep to walk nested metadata before refusing to descend further. */
const MAX_DEPTH = 4;
const MAX_STRING_LENGTH = 512;

function redactString(value: string) {
  if (
    JWT_PATTERN.test(value)
    || BEARER_PATTERN.test(value)
    || TOKEN_QUERY_PATTERN.test(value)
    || SUPABASE_KEY_PATTERN.test(value)
  ) {
    return IDENTITY_AUDIT_REDACTED;
  }

  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
}

/**
 * Recursively strips anything credential-shaped out of audit metadata. Returns
 * a plain JSON-safe structure; unknown exotic types collapse to their string
 * form rather than being dropped silently, so a reviewer can still see that
 * *something* was there.
 */
export function redactIdentityAuditMetadata(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return IDENTITY_AUDIT_REDACTED;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => redactIdentityAuditMetadata(entry, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = FORBIDDEN_KEY_PATTERN.test(key)
        ? IDENTITY_AUDIT_REDACTED
        : redactIdentityAuditMetadata(entry, depth + 1);
    }
    return output;
  }

  return IDENTITY_AUDIT_REDACTED;
}

export type IdentityAuditRow = {
  actor_user_id: string | null;
  effective_role: string | null;
  internal_access: boolean;
  correlation_id: string | null;
  session_id: string | null;
  source: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  outcome: IdentityAuditOutcome;
  metadata: Record<string, unknown>;
};

/**
 * Builds the row without writing it. Separated so the shape and the redaction
 * can be asserted directly, and so a caller that wants to batch or forward the
 * record elsewhere gets the same guarantees.
 */
export function buildIdentityAuditRow(input: IdentityAuditEventInput): IdentityAuditRow {
  const actorId = input.actor?.id;
  // "guest-user" is the unauthenticated sentinel, not a real identity.
  const resolvedActorId = actorId && actorId !== "guest-user" ? actorId : null;

  return {
    actor_user_id: resolvedActorId,
    effective_role: input.actor ? getCanonicalAccountRole(input.actor.role) : null,
    internal_access: Boolean(input.actor?.platformAdmin),
    correlation_id: input.correlationId?.trim() || null,
    session_id: input.sessionId?.trim() || null,
    source: input.source,
    entity_type: input.entityType,
    entity_id: input.entityId?.trim() || null,
    action: input.action,
    outcome: input.outcome ?? "succeeded",
    metadata: (redactIdentityAuditMetadata(input.metadata ?? {}) as Record<string, unknown>) ?? {}
  };
}

/**
 * Writes one identity audit record.
 *
 * Never throws: an audit write must not be able to fail the operation it is
 * describing, and a caller that has already denied a request should not then
 * 500 because the log was unavailable. Failures are surfaced on the console and
 * in the boolean return so a caller that genuinely needs write confirmation can
 * check for it.
 */
export async function recordIdentityAuditEvent(input: IdentityAuditEventInput) {
  const row = buildIdentityAuditRow(input);

  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return false;
    }

    const result = await supabase.from(IDENTITY_AUDIT_TABLE).insert(row);
    if (result.error) {
      console.warn("[identity-audit] write failed", {
        source: row.source,
        action: row.action,
        message: result.error.message
      });
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[identity-audit] write threw", {
      source: row.source,
      action: row.action,
      message: error instanceof Error ? error.message : "unknown"
    });
    return false;
  }
}
