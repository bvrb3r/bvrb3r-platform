export const BOOKING_SOURCE_PROVIDERS = ["bvrb3r", "booksy", "square", "thecut"] as const;

export type BookingSourceProvider = (typeof BOOKING_SOURCE_PROVIDERS)[number];
export type PaymentOwner =
  | "bvrb3r_card"
  | "bvrb3r_cash"
  | "unpaid_manual"
  | `external:${Exclude<BookingSourceProvider, "bvrb3r">}`;

export type ClientBridgeSuppressionReason =
  | "provider_restriction"
  | "prior_decline"
  | "frequency_limit";

export type ClientBridgeEligibility =
  | { eligible: true; suppressionReason: null }
  | { eligible: false; suppressionReason: ClientBridgeSuppressionReason };

export type QueueAssignmentOwnership = {
  entryType: "booked" | "walkin";
  paymentOwner: PaymentOwner;
};

export function paymentOwnerForSource(
  source: BookingSourceProvider,
  nativeOwner: Extract<PaymentOwner, "bvrb3r_card" | "bvrb3r_cash" | "unpaid_manual"> = "unpaid_manual"
): PaymentOwner {
  return source === "bvrb3r" ? nativeOwner : `external:${source}`;
}

export function isExternalPaymentOwner(owner: PaymentOwner): owner is `external:${Exclude<BookingSourceProvider, "bvrb3r">}` {
  return owner.startsWith("external:");
}

export function sourceBadge(source: BookingSourceProvider) {
  return source === "bvrb3r" ? "BVRB3R" : source.toUpperCase();
}

/**
 * A booked visit stays with the booked chair. A paid visit stays with the
 * chair that owns the payment promise. The sole reassignable case is an
 * unbooked BVRB3R cash walk-in.
 */
export function resolveQueueAssignmentLock(input: QueueAssignmentOwnership) {
  const reassignable = input.entryType === "walkin" && input.paymentOwner === "bvrb3r_cash";
  return {
    locked: !reassignable,
    reassignable,
    reason: reassignable
      ? null
      : input.entryType === "booked"
        ? "Booked visits are locked to their barber."
        : "Only BVRB3R cash walk-ins can be reassigned."
  };
}

export function assertQueueReassignmentAllowed(
  input: QueueAssignmentOwnership & { reason?: string | null }
) {
  const lock = resolveQueueAssignmentLock(input);
  if (!lock.reassignable) {
    throw new Error(lock.reason ?? "This queue assignment is locked.");
  }
  if ((input.reason?.trim().length ?? 0) < 3) {
    throw new Error("Cash walk-in reassignment requires an audit reason.");
  }
}

export function resolveClientBridgeEligibility(input: {
  providerDataRestricted: boolean;
  previouslyDeclined: boolean;
  invitationDates: readonly string[];
  now?: Date;
}): ClientBridgeEligibility {
  if (input.providerDataRestricted) {
    return { eligible: false, suppressionReason: "provider_restriction" };
  }
  if (input.previouslyDeclined) {
    return { eligible: false, suppressionReason: "prior_decline" };
  }

  const now = input.now ?? new Date();
  const cutoff = now.getTime() - 60 * 24 * 60 * 60 * 1_000;
  const recentInvites = input.invitationDates.filter((value) => {
    const sentAt = new Date(value).getTime();
    return Number.isFinite(sentAt) && sentAt >= cutoff && sentAt <= now.getTime();
  }).length;

  return recentInvites >= 2
    ? { eligible: false, suppressionReason: "frequency_limit" }
    : { eligible: true, suppressionReason: null };
}

export function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "Phone on file";
}

export function maskEmail(value: string) {
  const [local = "", domain = ""] = value.trim().toLowerCase().split("@");
  if (!local || !domain) return "Email on file";
  return `${local.slice(0, 1)}•••@${domain}`;
}

export function maskClientName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => index === 0 ? `${part.slice(0, 1)}${"•".repeat(Math.min(Math.max(part.length - 1, 1), 3))}` : `${part.slice(0, 1)}.`)
    .join(" ");
}

export type ActivationLinkState =
  | "claimable"
  | "expired"
  | "already_used"
  | "declined"
  | "suppressed"
  | "failed";

export function resolveActivationLinkState(input: {
  status: "pending" | "queued" | "sent" | "opened" | "claimed" | "declined" | "expired" | "suppressed" | "failed";
  expiresAt: string | null;
  now?: Date;
}): ActivationLinkState {
  if (input.status === "claimed") return "already_used";
  if (input.status === "declined") return "declined";
  if (input.status === "suppressed") return "suppressed";
  if (input.status === "failed") return "failed";
  if (input.status === "expired") return "expired";

  const expiresAt = input.expiresAt ? new Date(input.expiresAt).getTime() : Number.NaN;
  const now = (input.now ?? new Date()).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= now ? "expired" : "claimable";
}

