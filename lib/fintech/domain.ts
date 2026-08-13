import {
  isRetiredRevenueShareModel,
  type RetiredRevenueShareAccountRole
} from "@/lib/doctrine/legacy-data-aliases";
import { calculateAutoBoothRentApplication } from "@/lib/fintech/booth-rent-doctrine";
import type { InternalPaymentStatus, InternalPaymentType } from "@/lib/payments/domain";

export type FintechSubjectType = "barber" | "shop";
export type FintechProvider = "stripe_connect" | "manual";
export type FintechOnboardingStatus = "not_started" | "invited" | "pending" | "submitted" | "restricted" | "verified";
export type FintechPayoutReadinessStatus = "not_ready" | "needs_attention" | "ready" | "eligible" | "blocked";
export type FintechLegalReadinessStatus = "pending" | "accepted" | "outdated";
export type FintechTaxReadinessStatus = "pending" | "submitted" | "verified";
export type FintechOperationalStatus = "not_started" | "onboarding_required" | "pending_verification" | "action_required" | "payout_ready" | "blocked";
/**
 * Money routing models. Full Booth Rent (`booth_rent`) and AutoBooth Rent
 * (`autobooth_rent`) are the only supported shop-barber financial models;
 * `freelance` means no shop relationship exists. Service proceeds always belong
 * to the barber less the BVRB3R platform fee and Stripe processing fees — the
 * shop is never a revenue-share recipient.
 */
export type RoutingModel = "freelance" | "booth_rent" | "autobooth_rent";
export type MoneyRoutingStatus = "pending" | "ready_for_payout" | "blocked" | "manual_review" | "paid_out" | "refunded";
export type PayoutExecutionType = "transfer" | "reversal";
export type PayoutExecutionStatus = "pending" | "blocked" | "executed" | "failed" | "reversed";
export type PayoutExecutionReconciliationStatus = "open" | "settled" | "partially_reversed" | "reversed" | "manual_review";
export type AgreementType = "platform_terms" | "barber_agreement" | "shop_agreement" | "payout_tax_acknowledgment";
export type FintechParticipantRole =
  | "shop_owner_user"
  | "owner"
  | "manager"
  | "front_desk"
  | "barber_user"
  | "booth_rent_barber"
  | RetiredRevenueShareAccountRole
  | "client_user"
  | "client";
export type BoothRentFrequency = "weekly" | "monthly";
export type PayoutRecipientType = "barber" | "shop" | "split";
export const PLATFORM_FEE_RATE = 0.05;

export const CURRENT_AGREEMENT_VERSIONS: Record<AgreementType, string> = {
  platform_terms: "2026-03",
  barber_agreement: "2026-03",
  shop_agreement: "2026-03",
  payout_tax_acknowledgment: "2026-03"
};

export type CompensationAssignmentInput = {
  routingModel: RoutingModel;
  /**
   * Owner-approved portion (0..1) of eligible proceeds AutoBooth Rent applies
   * toward outstanding booth rent. Required for `autobooth_rent`.
   */
  autoBoothPercent?: number | null;
  boothRentAmount?: number | null;
  boothRentFrequency?: BoothRentFrequency | null;
  payoutBlockReason?: string | null;
};

export type LegalAcceptanceInput = {
  agreementType: AgreementType;
  agreementVersion?: string | null;
};

export type PaymentRoutingCalculationInput = {
  paymentType: InternalPaymentType;
  paymentStatus: InternalPaymentStatus;
  grossAmount: number;
  /** Service money included in grossAmount. Tips must never be included here. */
  serviceAmount?: number;
  /** Gratuity included in grossAmount. It always belongs to the barber. */
  tipAmount?: number;
  refundedAmount?: number;
  providerFeeAmount?: number;
  platformFeeAmount?: number;
  routingModel: RoutingModel;
  /** Owner-approved AutoBooth portion (0..1) of eligible proceeds. */
  autoBoothPercent?: number | null;
  /**
   * Outstanding booth rent, in cents, at the moment this payment is routed.
   * AutoBooth can never apply more than this. Omitted or zero means rent is
   * settled and the barber keeps the full remainder.
   */
  outstandingRentCents?: number | null;
  barberReady: boolean;
  shopReady: boolean;
  barberVerificationAllowed?: boolean;
  barberVerificationReason?: string | null;
  shopVerificationAllowed?: boolean;
  shopVerificationReason?: string | null;
  appointmentCompleted?: boolean;
  disputeHold?: boolean;
};

export type PaymentRoutingCalculation = {
  payoutRecipientType: PayoutRecipientType;
  providerGrossAmount: number;
  refundedAmount: number;
  providerFeeAmount: number;
  providerNetAmount: number;
  serviceAmount: number;
  tipAmount: number;
  platformFeeAmount: number;
  barberPayoutAmount: number;
  /**
   * Shop-destined amount. Under Full Booth Rent this is always 0 for service
   * money. Under AutoBooth Rent it is a booth-rent application capped at
   * outstanding rent — never a revenue share and never labor compensation. For
   * rent and subscription billing it is the billed amount itself.
   */
  shopSplitAmount: number;
  /** Portion of `shopSplitAmount` that settled outstanding booth rent. */
  autoBoothRentAppliedAmount: number;
  payoutReadinessStatus: FintechPayoutReadinessStatus;
  moneyRoutingStatus: MoneyRoutingStatus;
  blockedReason: string | null;
};

export type PayoutExecutionEligibilityInput = {
  paymentProvider: string | null;
  paymentStatus: InternalPaymentStatus;
  moneyRoutingStatus: MoneyRoutingStatus;
  payoutReadinessStatus: FintechPayoutReadinessStatus;
  targetAmount: number;
  processorChargeId?: string | null;
  targetProviderAccountId?: string | null;
  targetProviderEnvironment?: "live" | "test" | null;
  runtimeProviderEnvironment?: "live" | "test" | "missing" | null;
  blockedReason?: string | null;
};

export type PayoutReconciliationStatusInput = {
  targetAmount: number;
  executedAmount: number;
  reversedAmount: number;
  hasFailures?: boolean;
  hasBlockedExecutions?: boolean;
  routingStatus: MoneyRoutingStatus;
};

function roundToTwo(amount: number) {
  return Math.round(amount * 100) / 100;
}

function roundToFour(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function roundCurrency(amount: number) {
  return roundToTwo(amount);
}

export function normalizeRoutingModel(value?: string | null, fallback: RoutingModel = "freelance"): RoutingModel {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === "freelance" || normalized === "booth_rent" || normalized === "autobooth_rent") {
    return normalized;
  }

  // Retired revenue-share rows normalize to freelance: the shop collects
  // nothing until a Full Booth Rent or AutoBooth Rent agreement exists.
  if (isRetiredRevenueShareModel(normalized)) {
    return "freelance";
  }

  throw new Error("Unsupported routing model. Only Full Booth Rent and AutoBooth Rent are supported.");
}

export function normalizeRequirementList(value?: string[] | string | null) {
  if (!value) {
    return [] as string[];
  }

  const rawValues = Array.isArray(value)
    ? value
    : value
      .split(/[\r\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  return [...new Set(rawValues.map((entry) => entry.trim()).filter(Boolean))];
}

export function requiredAgreementsForSubject(subjectType: FintechSubjectType) {
  return subjectType === "shop"
    ? (["platform_terms", "shop_agreement", "payout_tax_acknowledgment"] satisfies AgreementType[])
    : (["platform_terms", "barber_agreement", "payout_tax_acknowledgment"] satisfies AgreementType[]);
}

export function evaluateLegalAgreementState(
  subjectType: FintechSubjectType,
  acceptedVersions: Partial<Record<AgreementType, string | null | undefined>>
) {
  const required = requiredAgreementsForSubject(subjectType);
  const missingAgreements: AgreementType[] = [];
  const outdatedAgreements: AgreementType[] = [];

  for (const agreementType of required) {
    const acceptedVersion = acceptedVersions[agreementType];
    if (!acceptedVersion) {
      missingAgreements.push(agreementType);
      continue;
    }

    if (acceptedVersion !== CURRENT_AGREEMENT_VERSIONS[agreementType]) {
      outdatedAgreements.push(agreementType);
    }
  }

  const legalReadinessStatus: FintechLegalReadinessStatus =
    outdatedAgreements.length > 0
      ? "outdated"
      : missingAgreements.length > 0
        ? "pending"
        : "accepted";

  return {
    legalReadinessStatus,
    missingAgreements,
    outdatedAgreements
  };
}

export function determinePayoutReadiness(input: {
  onboardingStatus: FintechOnboardingStatus;
  legalReadinessStatus: FintechLegalReadinessStatus;
  taxReadinessStatus: FintechTaxReadinessStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  disabledReason?: string | null;
}) {
  if (input.disabledReason?.trim() || input.onboardingStatus === "restricted" || input.requirementsPastDue.length > 0) {
    return "blocked" as const;
  }

  const hasVerifiedAccess =
    input.onboardingStatus === "verified"
    && input.legalReadinessStatus === "accepted"
    && (input.taxReadinessStatus === "submitted" || input.taxReadinessStatus === "verified")
    && input.chargesEnabled
    && input.payoutsEnabled
    && input.requirementsCurrentlyDue.length === 0;

  if (hasVerifiedAccess) {
    return "ready" as const;
  }

  if (input.onboardingStatus === "not_started" || input.onboardingStatus === "invited") {
    return "not_ready" as const;
  }

  return "needs_attention" as const;
}

export function deriveOperationalFintechStatus(input: {
  onboardingStatus: FintechOnboardingStatus;
  payoutReadinessStatus: FintechPayoutReadinessStatus;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  disabledReason?: string | null;
}) {
  if (input.disabledReason?.trim() || input.payoutReadinessStatus === "blocked" || input.requirementsPastDue.length > 0) {
    return "blocked" as const;
  }

  if (input.payoutReadinessStatus === "ready" || input.payoutReadinessStatus === "eligible") {
    return "payout_ready" as const;
  }

  if (input.onboardingStatus === "not_started") {
    return "not_started" as const;
  }

  if (input.onboardingStatus === "invited") {
    return "onboarding_required" as const;
  }

  if (input.requirementsCurrentlyDue.length > 0 || input.payoutReadinessStatus === "needs_attention") {
    return "action_required" as const;
  }

  return "pending_verification" as const;
}

export function inferStripeProcessorStatuses(input: {
  currentOnboardingStatus: FintechOnboardingStatus;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  requirementsEventuallyDue: string[];
  disabledReason?: string | null;
}) {
  let onboardingStatus: FintechOnboardingStatus;
  if (input.disabledReason?.trim() || input.requirementsPastDue.length > 0) {
    onboardingStatus = "restricted";
  } else if (input.chargesEnabled && input.payoutsEnabled && input.detailsSubmitted && input.requirementsCurrentlyDue.length === 0) {
    onboardingStatus = "verified";
  } else if (input.detailsSubmitted) {
    onboardingStatus = "submitted";
  } else if (
    input.currentOnboardingStatus === "invited"
    && input.requirementsCurrentlyDue.length === 0
    && input.requirementsEventuallyDue.length === 0
  ) {
    onboardingStatus = "invited";
  } else if (
    input.currentOnboardingStatus === "not_started"
    && input.requirementsCurrentlyDue.length === 0
    && input.requirementsEventuallyDue.length === 0
  ) {
    onboardingStatus = "not_started";
  } else {
    onboardingStatus = "pending";
  }

  const taxReadinessStatus: FintechTaxReadinessStatus =
    input.payoutsEnabled
      ? "verified"
      : input.detailsSubmitted
        ? "submitted"
        : "pending";

  return {
    onboardingStatus,
    taxReadinessStatus
  };
}

export function normalizeCompensationAssignment(input: CompensationAssignmentInput) {
  // Reads normalize retired revenue-share rows to freelance, but a WRITE must
  // never silently reinterpret an operator's intent. Reject it outright.
  if (isRetiredRevenueShareModel(input.routingModel)) {
    throw new Error(
      "Unsupported routing model. Only Full Booth Rent and AutoBooth Rent are supported shop-barber financial models."
    );
  }

  const routingModel = normalizeRoutingModel(input.routingModel);
  const payoutBlockReason = input.payoutBlockReason?.trim() || null;

  if (routingModel === "freelance") {
    return {
      routingModel,
      autoBoothPercent: null,
      boothRentAmount: null,
      boothRentFrequency: null,
      payoutBlockReason
    };
  }

  // Both supported shop-barber models are rent agreements, so both require a
  // real rent amount and billing frequency.
  const boothRentAmount = input.boothRentAmount ?? null;
  if (boothRentAmount === null || boothRentAmount <= 0) {
    throw new Error("Booth-rent routing requires a positive booth-rent amount.");
  }

  const boothRentFrequency = input.boothRentFrequency ?? null;
  if (!(boothRentFrequency === "weekly" || boothRentFrequency === "monthly")) {
    throw new Error("Booth-rent routing requires a weekly or monthly billing frequency.");
  }

  if (routingModel === "autobooth_rent") {
    const autoBoothPercent = input.autoBoothPercent ?? null;
    if (autoBoothPercent === null || autoBoothPercent <= 0 || autoBoothPercent > 1) {
      throw new Error("AutoBooth Rent requires an owner-approved portion greater than 0 and at most 1.");
    }

    return {
      routingModel,
      autoBoothPercent: roundToFour(autoBoothPercent),
      boothRentAmount: roundToTwo(boothRentAmount),
      boothRentFrequency,
      payoutBlockReason
    };
  }

  return {
    routingModel,
    autoBoothPercent: null,
    boothRentAmount: roundToTwo(boothRentAmount),
    boothRentFrequency,
    payoutBlockReason
  };
}

export function normalizeLegalAcceptance(input: LegalAcceptanceInput) {
  const agreementType = input.agreementType;
  const agreementVersion = input.agreementVersion?.trim() || CURRENT_AGREEMENT_VERSIONS[agreementType];

  if (!agreementVersion) {
    throw new Error("A legal agreement version is required.");
  }

  return {
    agreementType,
    agreementVersion
  };
}

function resolvePayoutRecipientType(
  routingModel: RoutingModel,
  paymentType: InternalPaymentType
): PayoutRecipientType {
  if (paymentType === "tip") {
    return "barber";
  }

  // Booth-rent service revenue is not rent collection. Actual rent charges are
  // separate billing payments, while service payments route like freelance.
  if (paymentType === "subscription" || paymentType === "booth_rent") {
    return "shop";
  }

  // AutoBooth Rent routes to both destinations: the barber keeps the remainder
  // while an owner-approved portion retires outstanding booth rent. The rent
  // application is capped at outstanding rent, so it is never a revenue share.
  if (routingModel === "autobooth_rent") {
    return "split";
  }

  return "barber";
}

export function calculatePaymentRouting(input: PaymentRoutingCalculationInput): PaymentRoutingCalculation {
  const providerGrossAmount = roundToTwo(Math.max(input.grossAmount, 0));
  const refundedAmount = roundToTwo(Math.max(input.refundedAmount ?? 0, 0));
  const providerFeeAmount = roundToTwo(Math.max(input.providerFeeAmount ?? 0, 0));
  const effectiveGrossAmount = roundToTwo(Math.max(providerGrossAmount - refundedAmount, 0));
  const requestedTipAmount = input.paymentType === "tip"
    ? effectiveGrossAmount
    : roundToTwo(Math.max(input.tipAmount ?? 0, 0));
  const tipAmount = Math.min(requestedTipAmount, effectiveGrossAmount);
  const serviceAmount = input.serviceAmount === undefined
    ? roundToTwo(Math.max(effectiveGrossAmount - tipAmount, 0))
    : roundToTwo(Math.max(input.serviceAmount, 0));

  if (Math.abs(roundToTwo(serviceAmount + tipAmount) - effectiveGrossAmount) > 0.01) {
    throw new Error("Service and tip amounts must reconcile to the effective payment gross.");
  }

  const platformFeeBase = input.paymentType === "tip" ? 0 : serviceAmount;
  const platformFeeAmount = roundToTwo(Math.max(input.platformFeeAmount ?? (platformFeeBase * PLATFORM_FEE_RATE), 0));
  if (platformFeeAmount > serviceAmount && input.paymentType !== "booth_rent" && input.paymentType !== "subscription") {
    throw new Error("The platform fee cannot exceed service money.");
  }
  const providerNetAmount = roundToTwo(Math.max(effectiveGrossAmount - providerFeeAmount, 0));
  const distributableServiceAmount = roundToTwo(Math.max(serviceAmount - platformFeeAmount, 0));
  const payoutRecipientType = resolvePayoutRecipientType(input.routingModel, input.paymentType);
  const appointmentCompleted = input.appointmentCompleted ?? false;
  const disputeHold = Boolean(input.disputeHold);
  const completionRequired = input.paymentType === "booking"
    || input.paymentType === "tip"
    || input.paymentType === "add_on"
    || input.paymentType === "pos_sale";
  const paymentCaptured = input.paymentStatus === "captured"
    || input.paymentStatus === "partially_refunded";

  let barberPayoutAmount = 0;
  let shopSplitAmount = 0;
  let autoBoothRentAppliedAmount = 0;

  if (payoutRecipientType === "shop") {
    shopSplitAmount = roundToTwo(distributableServiceAmount + tipAmount);
  } else if (payoutRecipientType === "split") {
    // AutoBooth Rent. Tips are never eligible for rent application, so only
    // service money net of the platform fee can retire rent. The shared
    // doctrine engine enforces the outstanding-rent cap in integer cents.
    const application = calculateAutoBoothRentApplication({
      model: "autobooth_rent",
      autoBoothPercent: input.autoBoothPercent ?? null,
      eligibleProceedsCents: Math.round(distributableServiceAmount * 100),
      outstandingRentCents: Math.max(Math.trunc(input.outstandingRentCents ?? 0), 0),
      paymentStatus: input.paymentStatus,
      disputeHold
    });

    autoBoothRentAppliedAmount = roundToTwo(application.appliedToRentCents / 100);
    shopSplitAmount = autoBoothRentAppliedAmount;
    barberPayoutAmount = roundToTwo(
      Math.max(distributableServiceAmount - autoBoothRentAppliedAmount, 0) + tipAmount
    );
  } else {
    barberPayoutAmount = roundToTwo(distributableServiceAmount + tipAmount);
  }

  let moneyBlockedReason: string | null = null;
  let readinessBlockedReason: string | null = null;
  if (input.paymentStatus === "failed" || input.paymentStatus === "voided") {
    moneyBlockedReason = "Payment was not captured successfully.";
  } else if (input.paymentStatus === "refunded") {
    moneyBlockedReason = null;
  } else if (disputeHold) {
    moneyBlockedReason = "An active dispute or chargeback is blocking payout.";
  } else if (payoutRecipientType === "split") {
    if (input.barberVerificationAllowed === false && input.shopVerificationAllowed === false) {
      readinessBlockedReason = input.barberVerificationReason ?? input.shopVerificationReason ?? "Barber and shop verification are incomplete.";
    } else if (input.barberVerificationAllowed === false) {
      readinessBlockedReason = input.barberVerificationReason ?? "Barber verification is incomplete for payout.";
    } else if (input.shopVerificationAllowed === false) {
      readinessBlockedReason = input.shopVerificationReason ?? "Shop verification is incomplete for payout.";
    } else if (!input.barberReady && !input.shopReady) {
      readinessBlockedReason = "Barber and shop payout readiness are incomplete.";
    } else if (!input.barberReady) {
      readinessBlockedReason = "Barber payout readiness is incomplete.";
    } else if (!input.shopReady) {
      readinessBlockedReason = "Shop payout readiness is incomplete.";
    }
  } else if (payoutRecipientType === "barber" && input.barberVerificationAllowed === false) {
    readinessBlockedReason = input.barberVerificationReason ?? "Barber verification is incomplete for payout.";
  } else if (payoutRecipientType === "barber" && !input.barberReady) {
    readinessBlockedReason = "Barber payout readiness is incomplete.";
  } else if (payoutRecipientType === "shop" && input.shopVerificationAllowed === false) {
    readinessBlockedReason = input.shopVerificationReason ?? "Shop verification is incomplete for payout.";
  } else if (payoutRecipientType === "shop" && !input.shopReady) {
    readinessBlockedReason = "Shop payout readiness is incomplete.";
  }

  const blockedReason = moneyBlockedReason ?? readinessBlockedReason;
  const payoutReadinessStatus: FintechPayoutReadinessStatus =
    input.paymentStatus === "refunded" || moneyBlockedReason
      ? "blocked"
      : !paymentCaptured || (completionRequired && !appointmentCompleted)
        ? "not_ready"
        : readinessBlockedReason
          ? "blocked"
          : (payoutRecipientType === "split"
            ? (input.barberReady && input.shopReady)
            : (payoutRecipientType === "barber" ? input.barberReady : input.shopReady))
            ? "ready"
            : "needs_attention";

  let moneyRoutingStatus: MoneyRoutingStatus;
  if (input.paymentStatus === "refunded") {
    moneyRoutingStatus = "refunded";
  } else if (moneyBlockedReason) {
    moneyRoutingStatus = "blocked";
  } else if ((input.paymentStatus === "captured" || input.paymentStatus === "partially_refunded") && appointmentCompleted && !disputeHold) {
    moneyRoutingStatus = "ready_for_payout";
  } else {
    moneyRoutingStatus = "pending";
  }

  return {
    payoutRecipientType,
    providerGrossAmount,
    refundedAmount,
    providerFeeAmount,
    providerNetAmount,
    serviceAmount,
    tipAmount,
    platformFeeAmount,
    barberPayoutAmount,
    shopSplitAmount,
    autoBoothRentAppliedAmount,
    payoutReadinessStatus,
    moneyRoutingStatus,
    blockedReason
  };
}

export function determinePayoutExecutionBlockReason(input: PayoutExecutionEligibilityInput) {
  if (roundToTwo(Math.max(input.targetAmount, 0)) <= 0) {
    return "No payout amount is available for transfer execution.";
  }

  if (input.paymentProvider !== "stripe") {
    return "Only Stripe-backed payments can execute processor transfers.";
  }

  if (!input.processorChargeId?.trim()) {
    return "Processor settlement has not been synced for this payment yet.";
  }

  if (!(input.paymentStatus === "captured" || input.paymentStatus === "partially_refunded")) {
    return "Payment is not settled for payout execution.";
  }

  if (!(input.moneyRoutingStatus === "ready_for_payout" || input.moneyRoutingStatus === "paid_out" || input.moneyRoutingStatus === "refunded")) {
    return input.blockedReason?.trim() || "Routing is not ready for payout execution.";
  }

  if (input.payoutReadinessStatus !== "ready" && input.payoutReadinessStatus !== "eligible") {
    return input.blockedReason?.trim() || "Payout readiness is incomplete.";
  }

  if (!input.targetProviderAccountId?.trim()) {
    return "A Stripe connected account is required before funds can be transferred.";
  }

  if (!input.targetProviderEnvironment) {
    return "The Stripe connected-account environment is not classified.";
  }

  if (!input.runtimeProviderEnvironment || input.runtimeProviderEnvironment === "missing") {
    return "The Stripe runtime environment could not be verified.";
  }

  if (input.targetProviderEnvironment !== input.runtimeProviderEnvironment) {
    return `The Stripe connected account is ${input.targetProviderEnvironment} while this runtime is ${input.runtimeProviderEnvironment}.`;
  }

  return null;
}

export function derivePayoutExecutionReconciliationStatus(input: PayoutReconciliationStatusInput): PayoutExecutionReconciliationStatus {
  const targetAmount = roundToTwo(Math.max(input.targetAmount, 0));
  const executedAmount = roundToTwo(Math.max(input.executedAmount, 0));
  const reversedAmount = roundToTwo(Math.max(input.reversedAmount, 0));
  const netExecutedAmount = roundToTwo(Math.max(executedAmount - reversedAmount, 0));

  if (input.hasFailures || input.hasBlockedExecutions) {
    return "manual_review";
  }

  if (reversedAmount > 0) {
    if (netExecutedAmount === 0 && (executedAmount > 0 || input.routingStatus === "refunded")) {
      return "reversed";
    }
    return "partially_reversed";
  }

  if (targetAmount > 0 && netExecutedAmount >= targetAmount) {
    return "settled";
  }

  return "open";
}

export function createPayoutExecutionIdempotencyKey(
  routingId: string,
  targetSubjectType: "barber" | "shop",
  executionType: PayoutExecutionType,
  suffix?: string | null
) {
  return `payout:${routingId}:${targetSubjectType}:${executionType}${suffix ? `:${suffix}` : ""}`;
}
