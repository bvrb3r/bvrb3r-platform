import { randomBytes } from "node:crypto";

/**
 * Booking session binding.
 *
 * A hold has to belong to somebody, or anyone who learns its id can release or
 * consume it. Signed-in callers are bound to their verified profile. Everyone
 * else — a guest on the public web, a walk-in at a kiosk — is bound to this: an
 * opaque, server-issued, httpOnly cookie that identifies *a booking session* and
 * nothing else.
 *
 * What it deliberately is not:
 *
 *   - It is not an identity. It carries no name, phone, email or profile id, so
 *     it cannot be correlated back to a person from the value alone.
 *   - It is not an authorization. It proves only that the same browser created
 *     the hold it is being used against; every operation still runs through a
 *     server action that authorizes and rate-limits.
 *   - It is not durable. It expires quickly, because its whole job is to span
 *     the few minutes between picking a time and confirming it.
 *
 * Guest-to-account conversion — turning one of these into a real client account
 * — is PR 23 and is not started here.
 */

export const BOOKING_SESSION_COOKIE = "bvrb3r_booking_session";

/** Long enough for a slow checkout, short enough not to become a tracker. */
export const BOOKING_SESSION_MAX_AGE_SECONDS = 60 * 60;

const SESSION_BYTES = 24;
const SESSION_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function issueBookingSessionKey() {
  return randomBytes(SESSION_BYTES).toString("base64url");
}

export function isBookingSessionKey(value: unknown): value is string {
  return typeof value === "string" && SESSION_PATTERN.test(value);
}

/**
 * Returns the existing session key, or mints one.
 *
 * A malformed or absent cookie is replaced rather than rejected: the caller is
 * mid-booking, and the correct behaviour is to give them a working session, not
 * an error about a cookie they never set.
 */
export function resolveBookingSessionKey(existing: string | null | undefined) {
  if (isBookingSessionKey(existing)) {
    return { sessionKey: existing, issued: false };
  }

  return { sessionKey: issueBookingSessionKey(), issued: true };
}

export const BOOKING_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: BOOKING_SESSION_MAX_AGE_SECONDS
} as const;
