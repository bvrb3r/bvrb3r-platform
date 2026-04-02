export type InternalPaymentProvider = "stripe";
export type InternalPaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "voided";
export type InternalPaymentType = "booking" | "tip" | "add_on" | "booth_rent" | "subscription";

export interface PaymentMethodReferenceInput {
  provider: InternalPaymentProvider;
  providerCustomerId?: string | null;
  providerPaymentMethodId: string;
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
  isDefault?: boolean;
}

export interface AppointmentPaymentIntentInput {
  appointmentStatus: string;
  depositAmount: number;
  balanceDue: number;
  grandTotal: number;
  hasActiveBookingPayment: boolean;
}

const paymentTransitions: Record<InternalPaymentStatus, readonly InternalPaymentStatus[]> = {
  pending: ["authorized", "captured", "failed", "voided"],
  authorized: ["captured", "failed", "voided"],
  captured: ["partially_refunded", "refunded"],
  partially_refunded: ["partially_refunded", "refunded"],
  failed: [],
  refunded: [],
  voided: []
};

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function canTransitionPaymentStatus(
  current: InternalPaymentStatus,
  next: InternalPaymentStatus
) {
  return paymentTransitions[current].includes(next);
}

export function assertPaymentStatusTransition(
  current: InternalPaymentStatus,
  next: InternalPaymentStatus
) {
  if (!canTransitionPaymentStatus(current, next)) {
    throw new Error(`Cannot transition payment from ${current} to ${next}.`);
  }
}

export function normalizePaymentMethodReference(input: PaymentMethodReferenceInput) {
  const providerPaymentMethodId = input.providerPaymentMethodId.trim();
  if (!providerPaymentMethodId) {
    throw new Error("A tokenized payment method reference is required.");
  }

  const last4 = input.last4?.trim() ? input.last4.trim() : null;
  if (last4 && !/^\d{4}$/.test(last4)) {
    throw new Error("Only the final four digits may be stored for a payment method.");
  }

  const expMonth = input.expMonth ?? null;
  if (expMonth !== null && (expMonth < 1 || expMonth > 12)) {
    throw new Error("Expiration month must be between 1 and 12.");
  }

  const expYear = input.expYear ?? null;
  if (expYear !== null && expYear < 2024) {
    throw new Error("Expiration year must be valid.");
  }

  return {
    provider: input.provider,
    providerCustomerId: input.providerCustomerId?.trim() || null,
    providerPaymentMethodId,
    brand: input.brand?.trim() || null,
    last4,
    expMonth,
    expYear,
    isDefault: input.isDefault ?? false
  };
}

export function resolveAppointmentPaymentIntent(input: AppointmentPaymentIntentInput) {
  if (input.hasActiveBookingPayment) {
    throw new Error("A booking payment is already active for this appointment.");
  }

  const balanceDue = roundCurrency(Math.max(input.balanceDue, 0));
  const grandTotal = roundCurrency(Math.max(input.grandTotal, 0));

  if (input.appointmentStatus !== "completed" && input.appointmentStatus !== "refunded" && grandTotal > 0) {
    return {
      amount: grandTotal,
      status: "captured" as const,
      stage: "booking" as const
    };
  }

  if (balanceDue > 0) {
    return {
      amount: balanceDue,
      status: "captured" as const,
      stage: input.appointmentStatus === "completed" ? ("checkout" as const) : ("booking" as const)
    };
  }

  throw new Error("This appointment does not have a payable balance.");
}

export function resolveRefundOutcome(paymentAmount: number, totalRefundedAmount: number) {
  const normalizedPaymentAmount = roundCurrency(Math.max(paymentAmount, 0));
  const normalizedRefundedAmount = roundCurrency(Math.max(totalRefundedAmount, 0));

  if (normalizedRefundedAmount > normalizedPaymentAmount) {
    throw new Error("Refunds cannot exceed the original payment amount.");
  }

  return {
    refundedTotal: normalizedRefundedAmount,
    remainingAmount: roundCurrency(normalizedPaymentAmount - normalizedRefundedAmount),
    nextStatus:
      normalizedRefundedAmount === 0
        ? ("captured" as const)
        : normalizedRefundedAmount >= normalizedPaymentAmount
          ? ("refunded" as const)
          : ("partially_refunded" as const)
  };
}

export function formatPaymentMethodLabel(input: {
  brand?: string | null;
  last4?: string | null;
  provider: InternalPaymentProvider;
}) {
  const brand = input.brand?.trim();
  if (brand && input.last4) {
    return `${brand} ending in ${input.last4}`;
  }

  if (input.last4) {
    return `Card ending in ${input.last4}`;
  }

  return `${input.provider.charAt(0).toUpperCase()}${input.provider.slice(1)} payment method`;
}
