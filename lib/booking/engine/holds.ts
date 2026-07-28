import { createHash, randomBytes } from "node:crypto";

/**
 * Hold tokens.
 *
 * A hold token is the bearer proof that a particular booking session owns a
 * particular chair-minute. It is treated as a credential throughout:
 *
 *   - It is generated server-side from a CSPRNG. A client never proposes one,
 *     because a client-chosen token is a client-chosen hold.
 *   - Only its SHA-256 digest reaches the database. Someone with read access to
 *     `booking_slot_holds` therefore cannot replay a hold they did not create.
 *   - It never appears in a log, an audit row, or an error message. Booking
 *     events carry the hold's uuid, which identifies the row without granting
 *     any authority over it.
 *
 * Ownership is bound in addition to the token, not instead of it: the database
 * checks the token digest *and* that the caller is the recorded owner, so a
 * leaked token alone does not move someone else's booking.
 */

const TOKEN_BYTES = 32;

export type HoldToken = {
  /** Returned to the caller once. Never persisted, never logged. */
  token: string;
  /** What the database stores. */
  tokenHash: string;
};

export function issueHoldToken(): HoldToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashHoldToken(token) };
}

export function hashHoldToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Shape check before the token reaches a query.
 *
 * base64url of 32 bytes is 43 characters. The bound is deliberately tight: a
 * token that is not the right shape was not issued here, so there is no reason
 * to spend a database round trip proving it.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isHoldTokenShaped(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export const HOLD_STATUSES = ["active", "consumed", "released", "expired"] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];

export type BookingHold = {
  holdId: string;
  barberId: string;
  locationId: string | null;
  serviceId: string;
  serviceName: string;
  serviceDurationMin: number;
  serviceBufferMin: number;
  servicePriceCents: number;
  serviceCurrency: string;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
  sourceDoor: string;
};

/**
 * A hold is live only while it is both active and unexpired. Callers must never
 * infer liveness from status alone: expiry is lazy in the database, so a row can
 * legitimately read `active` for a moment after its TTL elapsed.
 */
export function isHoldLive(hold: { status?: string | null; expiresAt: string }, now = new Date()) {
  if (hold.status && hold.status !== "active") {
    return false;
  }

  const expiry = new Date(hold.expiresAt);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() > now.getTime();
}

export function holdSecondsRemaining(hold: { expiresAt: string }, now = new Date()) {
  const expiry = new Date(hold.expiresAt).getTime();
  if (!Number.isFinite(expiry)) {
    return 0;
  }

  return Math.max(0, Math.floor((expiry - now.getTime()) / 1000));
}
