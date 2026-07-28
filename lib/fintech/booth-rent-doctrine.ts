/**
 * BVRB3R locked financial doctrine.
 *
 * Full Booth Rent and AutoBooth Rent are the ONLY supported shop-barber
 * financial models. BVRB3R never brokers labor compensation and never shares a
 * barber's service revenue with a shop.
 *
 * - Full Booth Rent: the barber owes a fixed rent for the booth. Service
 *   proceeds belong to the barber, less the BVRB3R 5% platform fee and Stripe
 *   processing fees. Rent is billed as its own charge.
 *
 * - AutoBooth Rent: identical to Full Booth Rent, except the barber and owner
 *   have agreed that an owner-approved portion of eligible transaction proceeds
 *   is applied automatically toward the barber's OUTSTANDING booth rent. The
 *   applied amount can never exceed outstanding rent, so it is a rent payment
 *   and settles a debt the barber already owes. It is not labor compensation
 *   and not revenue sharing. When rent is settled, AutoBooth applies nothing
 *   and the full remainder stays with the barber.
 *
 * `freelance` is not a shop-barber financial model. It describes a barber
 * operating with no shop relationship at all, so no rent exists to apply.
 */

/** The only supported shop-barber financial models. */
export const SHOP_BARBER_FINANCIAL_MODELS = ["booth_rent", "autobooth_rent"] as const;

export type ShopBarberFinancialModel = (typeof SHOP_BARBER_FINANCIAL_MODELS)[number];

/** Human-facing labels for the locked doctrine. */
export const SHOP_BARBER_FINANCIAL_MODEL_LABELS: Record<ShopBarberFinancialModel, string> = {
  booth_rent: "Full Booth Rent",
  autobooth_rent: "AutoBooth Rent"
};

export function isShopBarberFinancialModel(value: unknown): value is ShopBarberFinancialModel {
  return typeof value === "string" && (SHOP_BARBER_FINANCIAL_MODELS as readonly string[]).includes(value);
}

/**
 * Booth-rent charge statuses that can still accept an AutoBooth application.
 * A settled, waived, or cancelled charge carries no outstanding rent.
 */
const RENT_COLLECTIBLE_STATUSES = new Set([
  "upcoming",
  "pending",
  "due",
  "late",
  "partially_paid"
]);

export type BoothRentChargeState = {
  /** Rent owed for the period, in cents. */
  amountCents: number;
  /** Already-settled rent for the period, in cents. */
  amountPaidCents: number;
  /** Owner-approved ceiling for what the shop may ever charge this period. */
  maxChargeCents: number;
  status: string;
};

/**
 * Outstanding rent for a single booth-rent charge, in cents.
 *
 * Mirrors the `booth_rent_charges` invariants: what the shop may still collect
 * is bounded by both the period rent and the owner-approved max charge, and it
 * can never be negative.
 */
export function resolveOutstandingRentCents(charge: BoothRentChargeState): number {
  if (!RENT_COLLECTIBLE_STATUSES.has(charge.status)) {
    return 0;
  }

  const collectibleCeiling = Math.min(
    Math.max(Math.trunc(charge.amountCents), 0),
    Math.max(Math.trunc(charge.maxChargeCents), 0)
  );
  const alreadyPaid = Math.max(Math.trunc(charge.amountPaidCents), 0);

  return Math.max(collectibleCeiling - alreadyPaid, 0);
}

/** Sums outstanding rent across every open charge for a relationship. */
export function resolveTotalOutstandingRentCents(charges: readonly BoothRentChargeState[]): number {
  return charges.reduce((total, charge) => total + resolveOutstandingRentCents(charge), 0);
}

export type AutoBoothApplicationStatus =
  | "applied"
  | "skipped_model_not_autobooth"
  | "skipped_duplicate_event"
  | "skipped_payment_not_eligible"
  | "skipped_no_approved_portion"
  | "skipped_no_outstanding_rent"
  | "skipped_no_eligible_proceeds";

export type AutoBoothApplicationInput = {
  /** The relationship's active financial model. */
  model: ShopBarberFinancialModel;
  /**
   * Owner-approved portion of eligible proceeds to direct at outstanding rent,
   * expressed as a fraction between 0 and 1.
   */
  autoBoothPercent: number | null | undefined;
  /**
   * Barber-side proceeds eligible for rent application, in cents, already net
   * of the BVRB3R platform fee and Stripe processing fees. Tips are never
   * eligible: gratuity belongs to the barber.
   */
  eligibleProceedsCents: number;
  /** Refunded portion of those proceeds, in cents. */
  refundedProceedsCents?: number;
  /** Outstanding rent the barber currently owes, in cents. */
  outstandingRentCents: number;
  /** Processor payment status for the originating transaction. */
  paymentStatus: string;
  /** True when a dispute or chargeback is holding the funds. */
  disputeHold?: boolean;
  /**
   * Idempotency key for the originating processor event. Combined with
   * `processedEventKeys`, this makes a replayed webhook a no-op.
   */
  eventKey?: string | null;
  /** Event keys already applied against this rent charge. */
  processedEventKeys?: readonly string[];
};

export type AutoBoothApplicationDecision = {
  status: AutoBoothApplicationStatus;
  /** Rent settled by this application, in cents. Never exceeds outstanding rent. */
  appliedToRentCents: number;
  /** Proceeds that remain the barber's, in cents. */
  barberRemainderCents: number;
  /** Outstanding rent after this application, in cents. */
  outstandingRentAfterCents: number;
  reason: string | null;
};

/** Payment states whose funds are settled enough to retire rent. */
const RENT_ELIGIBLE_PAYMENT_STATUSES = new Set(["captured", "partially_refunded"]);

function decision(
  status: AutoBoothApplicationStatus,
  appliedToRentCents: number,
  netProceedsCents: number,
  outstandingRentCents: number,
  reason: string | null
): AutoBoothApplicationDecision {
  return {
    status,
    appliedToRentCents,
    barberRemainderCents: Math.max(netProceedsCents - appliedToRentCents, 0),
    outstandingRentAfterCents: Math.max(outstandingRentCents - appliedToRentCents, 0),
    reason
  };
}

/**
 * Decides how much of a transaction's eligible proceeds AutoBooth applies to
 * outstanding booth rent.
 *
 * Hard guarantees, in this order:
 *  1. A replayed processor event applies nothing (duplicate-event safety).
 *  2. Refunded, disputed, or uncaptured money applies nothing.
 *  3. The applied amount never exceeds outstanding rent.
 *  4. The applied amount never exceeds the eligible proceeds themselves.
 *  5. Everything not applied to rent remains the barber's.
 *
 * All math is integer cents so no rounding can push an application past
 * outstanding rent.
 */
export function calculateAutoBoothRentApplication(
  input: AutoBoothApplicationInput
): AutoBoothApplicationDecision {
  const outstandingRentCents = Math.max(Math.trunc(input.outstandingRentCents), 0);
  const grossProceedsCents = Math.max(Math.trunc(input.eligibleProceedsCents), 0);
  const refundedProceedsCents = Math.max(Math.trunc(input.refundedProceedsCents ?? 0), 0);
  const netProceedsCents = Math.max(grossProceedsCents - refundedProceedsCents, 0);

  if (input.model !== "autobooth_rent") {
    return decision(
      "skipped_model_not_autobooth",
      0,
      netProceedsCents,
      outstandingRentCents,
      "Full Booth Rent bills rent separately and never applies transaction proceeds."
    );
  }

  const eventKey = input.eventKey?.trim() || null;
  if (eventKey && (input.processedEventKeys ?? []).includes(eventKey)) {
    return decision(
      "skipped_duplicate_event",
      0,
      netProceedsCents,
      outstandingRentCents,
      "This processor event was already applied to booth rent."
    );
  }

  if (input.disputeHold) {
    return decision(
      "skipped_payment_not_eligible",
      0,
      netProceedsCents,
      outstandingRentCents,
      "An active dispute or chargeback is holding these funds."
    );
  }

  if (!RENT_ELIGIBLE_PAYMENT_STATUSES.has(input.paymentStatus)) {
    return decision(
      "skipped_payment_not_eligible",
      0,
      netProceedsCents,
      outstandingRentCents,
      "Only captured proceeds can be applied toward outstanding booth rent."
    );
  }

  const approvedPortion = input.autoBoothPercent ?? 0;
  if (!Number.isFinite(approvedPortion) || approvedPortion <= 0) {
    return decision(
      "skipped_no_approved_portion",
      0,
      netProceedsCents,
      outstandingRentCents,
      "The owner has not approved a portion of proceeds for rent application."
    );
  }

  if (approvedPortion > 1) {
    throw new Error("The owner-approved AutoBooth portion must be between 0 and 1.");
  }

  if (outstandingRentCents === 0) {
    return decision(
      "skipped_no_outstanding_rent",
      0,
      netProceedsCents,
      outstandingRentCents,
      "Booth rent is fully settled, so nothing is applied."
    );
  }

  if (netProceedsCents === 0) {
    return decision(
      "skipped_no_eligible_proceeds",
      0,
      netProceedsCents,
      outstandingRentCents,
      "This transaction left no eligible proceeds to apply."
    );
  }

  const requestedCents = Math.floor(netProceedsCents * approvedPortion);
  const appliedToRentCents = Math.max(
    Math.min(requestedCents, outstandingRentCents, netProceedsCents),
    0
  );

  if (appliedToRentCents === 0) {
    return decision(
      "skipped_no_eligible_proceeds",
      0,
      netProceedsCents,
      outstandingRentCents,
      "The approved portion of these proceeds rounded to zero cents."
    );
  }

  return decision("applied", appliedToRentCents, netProceedsCents, outstandingRentCents, null);
}
