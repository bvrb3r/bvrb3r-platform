import {
  calculateAutoBoothRentApplication,
  type AutoBoothApplicationDecision,
  type ShopBarberFinancialModel
} from "@/lib/fintech/booth-rent-doctrine";

export const RENT_SETUP_GATE_KEYS = [
  "shop_identity",
  "public_shop_profile",
  "hours_and_closures",
  "team_policies",
  "walk_in_policy",
  "kiosk_settings",
  "banking_and_payouts",
  "booth_rent_policy",
  "active_barber",
  "services_and_pricing",
  "booking_rules",
  "emergency_controls"
] as const;

export type RentSetupGateKey = (typeof RENT_SETUP_GATE_KEYS)[number];
export type RentSetupGateStatus = "pending" | "passed" | "approved_exception";

export const RENT_ARCHITECT_CHECK_KEYS = [
  "kiosk",
  "queue",
  "rotation",
  "wait_time",
  "realtime",
  "notifications",
  "activation",
  "payments",
  "cash_truth",
  "stripe_connect",
  "autobooth",
  "booth_rent"
] as const;

export type RentArchitectCheckKey = (typeof RENT_ARCHITECT_CHECK_KEYS)[number];

export const PUBLIC_QUEUE_STATES = [
  "waiting",
  "almost_ready",
  "ready",
  "delayed",
  "reassigned",
  "missed",
  "canceled",
  "done"
] as const;

export type PublicQueueState = (typeof PUBLIC_QUEUE_STATES)[number];

export const PUBLIC_QUEUE_STATE_COPY: Record<
  PublicQueueState,
  { eyebrow: string; title: string; detail: string }
> = {
  waiting: {
    eyebrow: "In line",
    title: "Your spot is safe.",
    detail: "We’ll let you know as the chair gets closer."
  },
  almost_ready: {
    eyebrow: "Almost ready",
    title: "You’re almost up.",
    detail: "Stay close. Your barber is finishing the cut ahead of you."
  },
  ready: {
    eyebrow: "Ready",
    title: "Your chair is ready.",
    detail: "Head to the shop now. Your ready window has started."
  },
  delayed: {
    eyebrow: "Delay",
    title: "The floor is running behind.",
    detail: "Your place is unchanged and the estimate has been updated."
  },
  reassigned: {
    eyebrow: "Moved",
    title: "A new barber is ready for you.",
    detail: "Your spot and agreed price are preserved."
  },
  missed: {
    eyebrow: "Missed",
    title: "Your ready window ended.",
    detail: "Contact the shop to ask whether your spot can be restored."
  },
  canceled: {
    eyebrow: "Canceled",
    title: "This queue visit is closed.",
    detail: "No queue payment was collected."
  },
  done: {
    eyebrow: "Done",
    title: "You’re all set.",
    detail: "Thanks for visiting. Your completed visit stays in your activity."
  }
};

export type RentAgreementAcceptance = {
  status: "draft" | "pending_acceptance" | "accepted" | "active" | "superseded" | "ended";
  ownerAcceptedAt: string | null;
  barberAcceptedAt: string | null;
  effectiveAt: string;
};

export type RentAgreementReadiness = {
  acceptedByBoth: boolean;
  prospective: boolean;
  canActivate: boolean;
  reason: string | null;
};

function finiteInteger(value: number, label: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of cents.`);
  }

  return value;
}

export function resolveRentAgreementReadiness(
  agreement: RentAgreementAcceptance,
  now = new Date()
): RentAgreementReadiness {
  const acceptedByBoth = Boolean(agreement.ownerAcceptedAt && agreement.barberAcceptedAt);
  const effectiveAt = new Date(agreement.effectiveAt);
  const prospective = Number.isFinite(effectiveAt.getTime()) && effectiveAt.getTime() > now.getTime();
  const canActivate = agreement.status === "accepted" && acceptedByBoth && prospective;

  return {
    acceptedByBoth,
    prospective,
    canActivate,
    reason: canActivate
      ? null
      : !acceptedByBoth
        ? "Both the owner and barber must accept this exact agreement version."
        : !prospective
          ? "A newly accepted agreement can only take effect prospectively."
          : "Only an accepted agreement version can become active."
  };
}

export type RentContributionInput = {
  model: ShopBarberFinancialModel;
  autoBoothPercent: number | null;
  serviceAmountCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  tipAmountCents: number;
  taxAmountCents: number;
  refundedServiceCents?: number;
  outstandingRentCents: number;
  paymentStatus: string;
  disputeHold?: boolean;
  eventKey?: string | null;
  processedEventKeys?: readonly string[];
};

export type RentContributionDecision = AutoBoothApplicationDecision & {
  eligibleServiceCents: number;
  excludedTipCents: number;
  excludedTaxCents: number;
};

/**
 * Resolves the only transaction base AutoBooth may use:
 * captured BVRB3R service proceeds after platform/processing fees.
 *
 * Tips and taxes are returned as explicit exclusions so downstream statements
 * can prove they never funded rent.
 */
export function calculateRentContribution(input: RentContributionInput): RentContributionDecision {
  const serviceAmountCents = Math.max(finiteInteger(input.serviceAmountCents, "Service amount"), 0);
  const platformFeeCents = Math.max(finiteInteger(input.platformFeeCents, "Platform fee"), 0);
  const processingFeeCents = Math.max(finiteInteger(input.processingFeeCents, "Processing fee"), 0);
  const tipAmountCents = Math.max(finiteInteger(input.tipAmountCents, "Tip amount"), 0);
  const taxAmountCents = Math.max(finiteInteger(input.taxAmountCents, "Tax amount"), 0);
  const refundedServiceCents = Math.max(
    finiteInteger(input.refundedServiceCents ?? 0, "Refunded service amount"),
    0
  );
  const eligibleServiceCents = Math.max(
    serviceAmountCents - platformFeeCents - processingFeeCents,
    0
  );

  const application = calculateAutoBoothRentApplication({
    model: input.model,
    autoBoothPercent: input.autoBoothPercent,
    eligibleProceedsCents: eligibleServiceCents,
    refundedProceedsCents: refundedServiceCents,
    outstandingRentCents: finiteInteger(input.outstandingRentCents, "Outstanding rent"),
    paymentStatus: input.paymentStatus,
    disputeHold: input.disputeHold,
    eventKey: input.eventKey,
    processedEventKeys: input.processedEventKeys
  });

  return {
    ...application,
    eligibleServiceCents,
    excludedTipCents: tipAmountCents,
    excludedTaxCents: taxAmountCents
  };
}

export type RentContributionRecord = {
  id: string;
  appliedCents: number;
  status: "pending" | "settled" | "reversed";
  reversalOfContributionId?: string | null;
};

export function resolveRefundReversal(
  original: RentContributionRecord,
  alreadyReversedCents: number
): number {
  if (original.status !== "settled") {
    throw new Error("Only a settled rent contribution can be reversed.");
  }

  const appliedCents = Math.max(finiteInteger(original.appliedCents, "Applied amount"), 0);
  const reversedCents = Math.max(finiteInteger(alreadyReversedCents, "Already reversed amount"), 0);
  const remaining = appliedCents - reversedCents;

  if (remaining <= 0) {
    throw new Error("This rent contribution has already been fully reversed.");
  }

  return remaining;
}

export type RentObligationLifecycle = {
  baseRentCents: number;
  lateFeeCents: number;
  amountSettledCents: number;
  graceUsedAt: string | null;
  lateFeeAppliedAt: string | null;
  waivedAt: string | null;
  waiverReason: string | null;
};

export function applyRentGrace(
  obligation: RentObligationLifecycle,
  appliedAt = new Date().toISOString()
): RentObligationLifecycle {
  if (obligation.graceUsedAt) {
    throw new Error("Grace can only be applied once to a rent obligation.");
  }

  return { ...obligation, graceUsedAt: appliedAt };
}

export function applyRentLateFee(
  obligation: RentObligationLifecycle,
  feeCents: number,
  appliedAt = new Date().toISOString()
): RentObligationLifecycle {
  if (obligation.lateFeeAppliedAt) {
    throw new Error("A late fee can only be applied once to a rent obligation.");
  }

  const nextFeeCents = finiteInteger(feeCents, "Late fee");
  if (nextFeeCents <= 0) {
    throw new Error("A late fee must be greater than zero cents.");
  }

  return {
    ...obligation,
    lateFeeCents: nextFeeCents,
    lateFeeAppliedAt: appliedAt
  };
}

export function waiveRentObligation(
  obligation: RentObligationLifecycle,
  reason: string,
  waivedAt = new Date().toISOString()
): RentObligationLifecycle {
  if (reason.trim().length < 3) {
    throw new Error("A waiver requires an auditable reason.");
  }

  return {
    ...obligation,
    waivedAt,
    waiverReason: reason.trim()
  };
}

export function resolveOutstandingObligationCents(obligation: RentObligationLifecycle) {
  if (obligation.waivedAt) {
    return 0;
  }

  return Math.max(
    finiteInteger(obligation.baseRentCents, "Base rent")
      + finiteInteger(obligation.lateFeeCents, "Late fee")
      - finiteInteger(obligation.amountSettledCents, "Settled amount"),
    0
  );
}

export type SetupGateResult = {
  key: RentSetupGateKey;
  status: RentSetupGateStatus;
};

export function evaluateShopOperationalGate(gates: readonly SetupGateResult[]) {
  const byKey = new Map(gates.map((gate) => [gate.key, gate.status]));
  const missing = RENT_SETUP_GATE_KEYS.filter((key) => {
    const status = byKey.get(key);
    return status !== "passed" && status !== "approved_exception";
  });

  return {
    passedCount: RENT_SETUP_GATE_KEYS.length - missing.length,
    requiredCount: RENT_SETUP_GATE_KEYS.length,
    operational: missing.length === 0,
    missing
  };
}

export type ArchitectCheckResult = {
  key: RentArchitectCheckKey;
  passed: boolean;
  detail: string;
};

export function resolveRentReleaseCertificate(checks: readonly ArchitectCheckResult[]) {
  const byKey = new Map(checks.map((check) => [check.key, check]));
  const failed = RENT_ARCHITECT_CHECK_KEYS.filter((key) => byKey.get(key)?.passed !== true);

  return {
    checkCount: RENT_ARCHITECT_CHECK_KEYS.length,
    passedCount: RENT_ARCHITECT_CHECK_KEYS.length - failed.length,
    certifiable: failed.length === 0,
    failed
  };
}
