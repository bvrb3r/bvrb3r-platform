import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Idempotency for booking mutations.
 *
 * A booking request can be retried by a flaky network, a double-tapped button,
 * or a client-side retry policy, and none of those may produce two
 * appointments. The contract:
 *
 *   - Same key, same request  → the original result is replayed verbatim.
 *   - Same key, different request → refused. Serving the stored result would
 *     answer a question the caller did not ask, and inventing a new one would
 *     defeat the key.
 *   - No key → at-least-once. The caller opted out; the engine says so rather
 *     than pretending otherwise.
 *
 * "Same request" is decided by a fingerprint of the *normalized* payload, not by
 * the raw bytes, so key ordering and absent-vs-null cannot make two identical
 * requests look different.
 */

export const IDEMPOTENCY_KEY_MIN_LENGTH = 8;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

/** Printable, bounded, no whitespace — the key is echoed into a database row. */
const KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function isValidIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === "string"
    && value.length >= IDEMPOTENCY_KEY_MIN_LENGTH
    && value.length <= IDEMPOTENCY_KEY_MAX_LENGTH
    && KEY_PATTERN.test(value)
  );
}

export function generateIdempotencyKey() {
  return randomUUID().replace(/-/g, "");
}

/**
 * Order-independent, type-stable serialization.
 *
 * Object keys are sorted so `{a,b}` and `{b,a}` fingerprint identically.
 * `undefined` and `null` collapse to the same token so an omitted optional field
 * and an explicit null are one request, not two. Numbers and booleans keep their
 * type marker so `1` and `"1"` stay distinguishable — a service id that arrives
 * as a string in one retry and a number in another is a different request, and
 * the engine should say so rather than silently accept it.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return `s:${value}`;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? `n:${value}` : "null";
  }

  if (typeof value === "boolean") {
    return `b:${value}`;
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      // Both are dropped, not just `undefined`. An optional field the caller
      // omitted on one retry and sent as null on the next is one request, and a
      // fingerprint that disagreed would refuse a legitimate retry as a key
      // reuse — the least recoverable failure this module can produce.
      .filter(([, entry]) => entry !== undefined && entry !== null)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(",")}}`;
  }

  // Functions, symbols and the like have no place in a request payload; they
  // collapse to a constant rather than throwing, so one exotic field cannot
  // break an otherwise valid booking.
  return "null";
}

export function computeRequestFingerprint(payload: unknown) {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

/**
 * Constant-time fingerprint comparison. The database does the authoritative
 * comparison; this exists for the application-side checks so a caller probing
 * fingerprints cannot learn anything from response timing.
 */
export function fingerprintsMatch(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/**
 * The actor an idempotency key belongs to.
 *
 * Keys are namespaced by actor as well as by operation so one caller's key can
 * neither collide with nor probe another's. A guest or kiosk caller is keyed by
 * its opaque server session, never by a phone number or email.
 */
export function resolveIdempotencyActorKey(input: {
  profileId?: string | null;
  sessionKey?: string | null;
}) {
  const profileId = input.profileId?.trim();
  if (profileId) {
    return `profile:${profileId}`;
  }

  const sessionKey = input.sessionKey?.trim();
  if (sessionKey) {
    return `session:${sessionKey}`;
  }

  return null;
}
