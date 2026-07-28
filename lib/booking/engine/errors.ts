/**
 * Normalized booking failure states.
 *
 * Every booking surface — client app, kiosk, shop console — has to tell a person
 * something true about why a booking did not happen, and "something went wrong"
 * is almost never true. These are the only states the engine reports, and each
 * one maps to a different thing the caller should do next:
 *
 *   validation           the request itself is wrong; fix it and resend
 *   forbidden            the actor may not do this; do not retry
 *   not_found            the referenced thing does not exist for this actor
 *   conflict             someone else took the slot; re-read availability
 *   expired              the hold ran out; take a new hold
 *   idempotency_conflict the key was reused with a different payload; refuse
 *   retry                a transient infrastructure failure; safe to retry
 *
 * The distinction between `conflict` and `retry` is the one that matters most.
 * A conflict means the world changed and the same request will keep failing; a
 * retry means the request never reached a decision. Collapsing them produces
 * either a spinner that never resolves or a double booking.
 */

export type BookingErrorKind =
  | "validation"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "expired"
  | "idempotency_conflict"
  | "retry";

const STATUS_BY_KIND: Record<BookingErrorKind, number> = {
  validation: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  expired: 410,
  idempotency_conflict: 422,
  retry: 503
};

/** Kinds where trying the identical request again can succeed. */
const RETRYABLE_KINDS = new Set<BookingErrorKind>(["retry"]);

export class BookingEngineError extends Error {
  readonly kind: BookingErrorKind;
  readonly status: number;
  readonly reason: string;
  readonly details: Record<string, unknown>;

  constructor(kind: BookingErrorKind, reason: string, message?: string, details: Record<string, unknown> = {}) {
    super(message ?? describeBookingFailure(kind, reason));
    this.name = "BookingEngineError";
    this.kind = kind;
    this.reason = reason;
    this.status = STATUS_BY_KIND[kind];
    this.details = details;
  }

  get retryable() {
    return RETRYABLE_KINDS.has(this.kind);
  }

  toResponseBody() {
    return {
      error: this.message,
      kind: this.kind,
      reason: this.reason,
      retryable: this.retryable,
      details: Object.keys(this.details).length ? this.details : null
    };
  }
}

/**
 * Human-readable text for a failure, keyed on the machine reason.
 *
 * Written for the person waiting on the answer, not for the log. A booking that
 * lost a race is told the slot is gone, because that is what happened and what
 * they need to act on.
 */
const MESSAGE_BY_REASON: Record<string, string> = {
  slot_unavailable: "That time was just taken. Pick another opening.",
  hold_expired: "Your hold on that time expired. Choose the time again to continue.",
  hold_not_found: "That hold is no longer available.",
  hold_not_owned: "That hold belongs to a different session.",
  hold_already_consumed: "That hold has already been used to book.",
  hold_token_replayed: "That hold token has already been used.",
  stale_revision: "This booking changed since you loaded it. Reload and try again.",
  invalid_transition: "This booking can no longer be changed from its current state.",
  actor_not_permitted: "You do not have access to change this booking.",
  appointment_not_found: "That booking was not found.",
  barber_not_found: "That barber is not available for booking.",
  service_not_found: "That service is not available for booking.",
  client_not_found: "We could not match your client record.",
  service_not_bookable: "That service is not bookable right now.",
  barber_not_accepting_bookings: "This barber is not accepting online bookings right now.",
  lead_time_not_met: "That time is too soon to book. Pick a later opening.",
  outside_booking_horizon: "That date is further out than this barber is taking bookings.",
  barber_change_not_supported: "Rescheduling keeps the same barber. Book a new appointment to change barber.",
  location_required: "This service is not attached to a bookable location yet.",
  owner_binding_required: "A booking session is required before holding a time.",
  missing_required_input: "Some required booking details are missing.",
  key_reused_with_different_payload:
    "This request key was already used for a different booking. Start a new request.",
  engine_unavailable: "Booking is temporarily unavailable. Try again in a moment."
};

export function describeBookingFailure(kind: BookingErrorKind, reason: string) {
  return MESSAGE_BY_REASON[reason] ?? MESSAGE_BY_REASON.engine_unavailable;
}

/**
 * The database functions return `{ outcome, reason, ... }` rather than raising
 * for expected states, so success and every anticipated failure arrive through
 * the same channel. This is the single place that decides which is which — the
 * routes never inspect `outcome` themselves.
 */
const KIND_BY_OUTCOME: Record<string, BookingErrorKind> = {
  validation: "validation",
  forbidden: "forbidden",
  not_found: "not_found",
  conflict: "conflict",
  expired: "expired",
  idempotency_conflict: "idempotency_conflict"
};

export type EngineOutcome = { outcome?: string; reason?: string } & Record<string, unknown>;

/**
 * Returns the payload on success, throws a normalized error otherwise.
 *
 * An unrecognized outcome is treated as `retry` rather than as success. A
 * booking engine that reports an unknown state as "booked" is worse than one
 * that reports it as temporarily unavailable.
 */
export function unwrapEngineOutcome<T extends EngineOutcome>(payload: T | null | undefined, successOutcomes: string[]): T {
  if (!payload || typeof payload !== "object" || typeof payload.outcome !== "string") {
    throw new BookingEngineError("retry", "engine_unavailable");
  }

  if (successOutcomes.includes(payload.outcome)) {
    return payload;
  }

  const kind = KIND_BY_OUTCOME[payload.outcome];
  const reason = typeof payload.reason === "string" ? payload.reason : "engine_unavailable";

  if (!kind) {
    throw new BookingEngineError("retry", "engine_unavailable");
  }

  const details: Record<string, unknown> = {};
  if (typeof payload.currentRevision === "number") {
    details.currentRevision = payload.currentRevision;
  }
  if (typeof payload.status === "string") {
    details.status = payload.status;
  }

  throw new BookingEngineError(kind, reason, undefined, details);
}

/** Wraps an unexpected throw so a route never leaks an internal message. */
export function toBookingEngineError(error: unknown): BookingEngineError {
  if (error instanceof BookingEngineError) {
    return error;
  }

  return new BookingEngineError("retry", "engine_unavailable");
}
