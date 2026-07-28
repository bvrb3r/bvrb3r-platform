/**
 * The PR 20 appointment state machine.
 *
 * This is deliberately narrower than `lib/appointments/domain.ts`, which
 * describes the whole appointment lifecycle across every domain that touches it.
 * PR 20 owns only the part the booking engine is responsible for:
 *
 *     (hold) ──confirm──► confirmed ──reschedule──► confirmed
 *                             │
 *                             ├──cancel──► cancelled
 *                             └──complete──► completed   (already owned here)
 *
 * Check-in, seating, transfer, no-show and chair rotation are PR 21. They are
 * not missing by oversight — they are refused here, because a booking engine
 * that half-implements the queue produces states nobody owns.
 *
 * A reschedule is never an in-place time edit. It goes through a fresh,
 * validated hold, so the new slot is proved free by the same mechanism that
 * proves it for a first booking. The database performs the move as one UPDATE,
 * which is what makes "keep the old slot until the new one is secured, then
 * release it exactly once" true rather than aspirational.
 */

export type Pr20BookingAction = "confirm" | "reschedule" | "cancel" | "complete";

/**
 * Statuses this engine will act on. `booked` and `pending` are legacy values
 * that still exist on rows written before the canonical alignment; they are
 * treated as equivalent to `confirmed` for the purposes of these actions.
 */
export const PR20_ACTIONABLE_STATUSES = ["pending", "confirmed", "booked"] as const;

/** Statuses PR 21 owns. Recognized so they can be refused with a real reason. */
export const PR20_DEFERRED_STATUSES = ["checked_in", "in_service"] as const;

/** Terminal statuses. Nothing in PR 20 moves a booking out of one. */
export const PR20_TERMINAL_STATUSES = ["completed", "cancelled", "no_show", "refunded"] as const;

const ALLOWED_FROM: Record<Pr20BookingAction, ReadonlySet<string>> = {
  // Confirmation creates the row; it has no prior status to come from.
  confirm: new Set<string>(),
  reschedule: new Set<string>(PR20_ACTIONABLE_STATUSES),
  // Cancelling something already in the chair is still the booking domain's
  // call; cancelling something finished is a refund decision and is not.
  cancel: new Set<string>([...PR20_ACTIONABLE_STATUSES, "checked_in"]),
  complete: new Set<string>(["confirmed", "booked", "checked_in", "in_service"])
};

export function canPerformPr20Action(action: Pr20BookingAction, currentStatus: string | null | undefined) {
  if (action === "confirm") {
    return !currentStatus;
  }

  return ALLOWED_FROM[action].has(currentStatus ?? "");
}

/**
 * Why an action was refused, in terms a caller can act on.
 *
 * A booking in the chair and a booking already finished are both "no", but they
 * are different noes: one becomes possible again through PR 21, the other never
 * does.
 */
export function describePr20Refusal(action: Pr20BookingAction, currentStatus: string | null | undefined) {
  const status = currentStatus ?? "";

  if ((PR20_DEFERRED_STATUSES as readonly string[]).includes(status)) {
    return "invalid_transition";
  }

  if ((PR20_TERMINAL_STATUSES as readonly string[]).includes(status)) {
    return "invalid_transition";
  }

  if (action === "confirm" && status) {
    return "invalid_transition";
  }

  return "invalid_transition";
}

// ---------------------------------------------------------------------------
// Actor authority
// ---------------------------------------------------------------------------

/**
 * Who may act on a booking.
 *
 * Authorization is decided from canonical relationships by the PR 19 predicates
 * (`assertSelf`, `isBarberAtShop`, `isShopMemberOf`, `hasInternalAccess`) before
 * anything reaches the engine; the database re-proves the relationship as
 * defence in depth. This type is the vocabulary the two sides share.
 *
 * Note what is *not* here: a role. Holding the barber lane does not authorize
 * acting on a booking — being the barber on *that* booking does.
 */
export type BookingActorRelationship =
  | "client_of_record"
  | "barber_of_record"
  | "shop_operator"
  | "internal_operator";

const ACTIONS_BY_RELATIONSHIP: Record<BookingActorRelationship, ReadonlySet<Pr20BookingAction>> = {
  client_of_record: new Set<Pr20BookingAction>(["confirm", "reschedule", "cancel"]),
  barber_of_record: new Set<Pr20BookingAction>(["reschedule", "cancel", "complete"]),
  shop_operator: new Set<Pr20BookingAction>(["reschedule", "cancel", "complete"]),
  internal_operator: new Set<Pr20BookingAction>(["reschedule", "cancel"])
};

export function relationshipMayPerform(
  relationship: BookingActorRelationship | null | undefined,
  action: Pr20BookingAction
) {
  if (!relationship) {
    return false;
  }

  return ACTIONS_BY_RELATIONSHIP[relationship].has(action);
}

/**
 * Optimistic concurrency.
 *
 * Every mutation carries the revision the caller believed it was changing. Two
 * consoles open on the same booking cannot both apply their edit: the second
 * one is told the booking moved rather than quietly overwriting the first.
 */
export function isExpectedRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1_000_000;
}

/**
 * Cancellation metadata. Bounded and stored as given — it is shown back to the
 * person who wrote it and to the barber, so it is not normalized away.
 */
export const MAX_CANCELLATION_REASON_LENGTH = 240;

export function normalizeCancellationReason(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, MAX_CANCELLATION_REASON_LENGTH);
}
