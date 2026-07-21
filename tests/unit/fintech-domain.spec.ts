import { describe, expect, it } from "vitest";
import {
  CURRENT_AGREEMENT_VERSIONS,
  calculatePaymentRouting,
  createPayoutExecutionIdempotencyKey,
  derivePayoutExecutionReconciliationStatus,
  deriveOperationalFintechStatus,
  determinePayoutExecutionBlockReason,
  determinePayoutReadiness,
  evaluateLegalAgreementState,
  inferStripeProcessorStatuses,
  normalizeCompensationAssignment,
  normalizeRoutingModel
} from "@/lib/fintech/domain";

describe("phase 13 fintech domain", () => {
  it("evaluates legal acceptance readiness for barbers with missing or outdated versions", () => {
    const pending = evaluateLegalAgreementState("barber", {
      platform_terms: CURRENT_AGREEMENT_VERSIONS.platform_terms
    });
    const outdated = evaluateLegalAgreementState("barber", {
      platform_terms: CURRENT_AGREEMENT_VERSIONS.platform_terms,
      barber_agreement: "2026-01",
      payout_tax_acknowledgment: CURRENT_AGREEMENT_VERSIONS.payout_tax_acknowledgment
    });

    expect(pending.legalReadinessStatus).toBe("pending");
    expect(pending.missingAgreements).toContain("barber_agreement");
    expect(outdated.legalReadinessStatus).toBe("outdated");
    expect(outdated.outdatedAgreements).toContain("barber_agreement");
  });

  it("derives payout readiness from onboarding, legal, tax, and requirements", () => {
    expect(determinePayoutReadiness({
      onboardingStatus: "verified",
      legalReadinessStatus: "accepted",
      taxReadinessStatus: "verified",
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsCurrentlyDue: [],
      requirementsPastDue: []
    })).toBe("ready");

    expect(determinePayoutReadiness({
      onboardingStatus: "submitted",
      legalReadinessStatus: "accepted",
      taxReadinessStatus: "submitted",
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsCurrentlyDue: ["identity_document"],
      requirementsPastDue: []
    })).toBe("needs_attention");

    expect(determinePayoutReadiness({
      onboardingStatus: "restricted",
      legalReadinessStatus: "accepted",
      taxReadinessStatus: "verified",
      chargesEnabled: true,
      payoutsEnabled: false,
      requirementsCurrentlyDue: [],
      requirementsPastDue: []
    })).toBe("blocked");
  });

  it("calculates freelance and booth-rent routing directly to the barber", () => {
    const freelance = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 55,
      routingModel: "freelance",
      barberReady: true,
      shopReady: false,
      appointmentCompleted: true
    });
    const boothRent = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 55,
      routingModel: "booth_rent",
      barberReady: true,
      shopReady: true,
      appointmentCompleted: true
    });

    expect(freelance.platformFeeAmount).toBe(2.75);
    expect(freelance.barberPayoutAmount).toBe(52.25);
    expect(freelance.shopSplitAmount).toBe(0);
    expect(freelance.moneyRoutingStatus).toBe("ready_for_payout");
    expect(boothRent.barberPayoutAmount).toBe(52.25);
    expect(boothRent.payoutRecipientType).toBe("barber");
  });

  it("routes booth-rent and subscription charges to the shop after the platform fee", () => {
    const boothRentCharge = calculatePaymentRouting({
      paymentType: "booth_rent",
      paymentStatus: "captured",
      grossAmount: 20,
      routingModel: "booth_rent",
      barberReady: true,
      shopReady: true,
      appointmentCompleted: true
    });
    const subscriptionCharge = calculatePaymentRouting({
      paymentType: "subscription",
      paymentStatus: "captured",
      grossAmount: 20,
      routingModel: "commission",
      barberReady: true,
      shopReady: true,
      appointmentCompleted: true
    });

    expect(boothRentCharge.platformFeeAmount).toBe(1);
    expect(boothRentCharge.barberPayoutAmount).toBe(0);
    expect(boothRentCharge.shopSplitAmount).toBe(19);
    expect(boothRentCharge.payoutRecipientType).toBe("shop");
    expect(subscriptionCharge.shopSplitAmount).toBe(19);
    expect(subscriptionCharge.payoutRecipientType).toBe("shop");
  });

  it("calculates commission routing as a split between barber and shop", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 100,
      routingModel: "commission",
      commissionRate: 0.6,
      barberReady: true,
      shopReady: true,
      appointmentCompleted: true
    });

    expect(result.payoutRecipientType).toBe("split");
    expect(result.platformFeeAmount).toBe(5);
    expect(result.barberPayoutAmount).toBe(57);
    expect(result.shopSplitAmount).toBe(38);
    expect(result.moneyRoutingStatus).toBe("ready_for_payout");
  });

  it("keeps tips out of platform fees and commission while paying them fully to the barber", () => {
    const result = calculatePaymentRouting({
      paymentType: "pos_sale",
      paymentStatus: "captured",
      grossAmount: 110,
      serviceAmount: 100,
      tipAmount: 10,
      routingModel: "commission",
      commissionRate: 0.6,
      barberReady: true,
      shopReady: true,
      appointmentCompleted: true
    });

    expect(result.serviceAmount).toBe(100);
    expect(result.tipAmount).toBe(10);
    expect(result.platformFeeAmount).toBe(5);
    expect(result.barberPayoutAmount).toBe(67);
    expect(result.shopSplitAmount).toBe(38);
  });

  it("routes a tip payment entirely to the barber with no platform fee", () => {
    const result = calculatePaymentRouting({
      paymentType: "tip",
      paymentStatus: "captured",
      grossAmount: 10,
      routingModel: "commission",
      commissionRate: 0.6,
      barberReady: true,
      shopReady: false,
      appointmentCompleted: true
    });

    expect(result.serviceAmount).toBe(0);
    expect(result.tipAmount).toBe(10);
    expect(result.platformFeeAmount).toBe(0);
    expect(result.barberPayoutAmount).toBe(10);
    expect(result.shopSplitAmount).toBe(0);
    expect(result.payoutRecipientType).toBe("barber");
  });

  it("defaults an absent relationship to freelance", () => {
    expect(normalizeRoutingModel(null)).toBe("freelance");
  });

  it("keeps money eligible after completion while payout execution waits on readiness", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "commission",
      commissionRate: 0.5,
      barberReady: false,
      shopReady: true,
      appointmentCompleted: true
    });

    expect(result.payoutReadinessStatus).toBe("blocked");
    expect(result.moneyRoutingStatus).toBe("ready_for_payout");
    expect(result.blockedReason).toMatch(/barber payout readiness/i);
  });

  it("keeps canonical verification blockers on payout execution without blocking completed money routing", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "freelance",
      barberReady: true,
      shopReady: false,
      barberVerificationAllowed: false,
      barberVerificationReason: "Barber verification is incomplete for payout.",
      appointmentCompleted: true
    });

    expect(result.payoutReadinessStatus).toBe("blocked");
    expect(result.moneyRoutingStatus).toBe("ready_for_payout");
    expect(result.blockedReason).toMatch(/verification is incomplete for payout/i);
  });

  it("keeps payout execution blocked if the barber payout setup is missing", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "freelance",
      barberReady: false,
      shopReady: false,
      appointmentCompleted: true
    });

    expect(result.moneyRoutingStatus).toBe("ready_for_payout");
    expect(result.blockedReason).toMatch(/barber payout readiness/i);
  });

  it("keeps commission payout execution blocked if shop payout setup is missing", () => {
    const result = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "commission",
      commissionRate: 0.6,
      barberReady: true,
      shopReady: false,
      appointmentCompleted: true
    });

    expect(result.moneyRoutingStatus).toBe("ready_for_payout");
    expect(result.blockedReason).toMatch(/shop payout readiness/i);
  });

  it("keeps booking routing pending until service completion and held when disputes are active", () => {
    const incomplete = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "freelance",
      barberReady: true,
      shopReady: false,
      appointmentCompleted: false
    });
    const disputed = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "freelance",
      barberReady: true,
      shopReady: false,
      appointmentCompleted: true,
      disputeHold: true
    });

    expect(incomplete.moneyRoutingStatus).toBe("pending");
    expect(incomplete.blockedReason).toBeNull();
    expect(disputed.moneyRoutingStatus).toBe("blocked");
    expect(disputed.blockedReason).toMatch(/dispute or chargeback/i);
  });

  it("turns an eligible payout path back to blocked if a dispute lands after eligibility", () => {
    const eligible = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "freelance",
      barberReady: true,
      shopReady: false,
      appointmentCompleted: true
    });
    const blockedAfterDispute = calculatePaymentRouting({
      paymentType: "booking",
      paymentStatus: "captured",
      grossAmount: 80,
      routingModel: "freelance",
      barberReady: true,
      shopReady: false,
      appointmentCompleted: true,
      disputeHold: true
    });

    expect(eligible.moneyRoutingStatus).toBe("ready_for_payout");
    expect(blockedAfterDispute.moneyRoutingStatus).toBe("blocked");
    expect(blockedAfterDispute.blockedReason).toMatch(/dispute or chargeback/i);
  });

  it("normalizes compensation assignments with model-specific validation", () => {
    expect(normalizeCompensationAssignment({
      routingModel: "freelance",
      payoutBlockReason: " waiting on onboarding "
    }).payoutBlockReason).toBe("waiting on onboarding");

    expect(normalizeCompensationAssignment({
      routingModel: "commission",
      commissionRate: 0.45
    }).commissionRate).toBe(0.45);

    expect(() => normalizeCompensationAssignment({
      routingModel: "booth_rent",
      boothRentAmount: 250
    })).toThrow(/billing frequency/i);
  });

  it("maps Stripe processor state into canonical onboarding and tax statuses", () => {
    expect(inferStripeProcessorStatuses({
      currentOnboardingStatus: "invited",
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsCurrentlyDue: [],
      requirementsPastDue: [],
      requirementsEventuallyDue: []
    })).toEqual({
      onboardingStatus: "invited",
      taxReadinessStatus: "pending"
    });

    expect(inferStripeProcessorStatuses({
      currentOnboardingStatus: "pending",
      detailsSubmitted: true,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsCurrentlyDue: ["external_account"],
      requirementsPastDue: [],
      requirementsEventuallyDue: []
    })).toEqual({
      onboardingStatus: "submitted",
      taxReadinessStatus: "submitted"
    });

    expect(inferStripeProcessorStatuses({
      currentOnboardingStatus: "submitted",
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsCurrentlyDue: [],
      requirementsPastDue: [],
      requirementsEventuallyDue: []
    })).toEqual({
      onboardingStatus: "verified",
      taxReadinessStatus: "verified"
    });
  });

  it("derives practical operational statuses for readiness surfaces", () => {
    expect(deriveOperationalFintechStatus({
      onboardingStatus: "not_started",
      payoutReadinessStatus: "not_ready",
      requirementsCurrentlyDue: [],
      requirementsPastDue: []
    })).toBe("not_started");

    expect(deriveOperationalFintechStatus({
      onboardingStatus: "invited",
      payoutReadinessStatus: "not_ready",
      requirementsCurrentlyDue: [],
      requirementsPastDue: []
    })).toBe("onboarding_required");

    expect(deriveOperationalFintechStatus({
      onboardingStatus: "submitted",
      payoutReadinessStatus: "needs_attention",
      requirementsCurrentlyDue: ["verification_document"],
      requirementsPastDue: []
    })).toBe("action_required");

    expect(deriveOperationalFintechStatus({
      onboardingStatus: "verified",
      payoutReadinessStatus: "ready",
      requirementsCurrentlyDue: [],
      requirementsPastDue: []
    })).toBe("payout_ready");
  });

  it("determines when payout execution should stay blocked", () => {
    expect(determinePayoutExecutionBlockReason({
      paymentProvider: "cash",
      paymentStatus: "captured",
      moneyRoutingStatus: "ready_for_payout",
      payoutReadinessStatus: "ready",
      targetAmount: 55,
      processorChargeId: "ch_manual",
      targetProviderAccountId: "acct_manual"
    })).toMatch(/stripe-backed payments/i);

    expect(determinePayoutExecutionBlockReason({
      paymentProvider: "stripe",
      paymentStatus: "captured",
      moneyRoutingStatus: "ready_for_payout",
      payoutReadinessStatus: "ready",
      targetAmount: 55,
      processorChargeId: "ch_123",
      targetProviderAccountId: "acct_123"
    })).toBeNull();
  });

  it("derives reconciliation status for settled, reversed, and manual-review flows", () => {
    expect(derivePayoutExecutionReconciliationStatus({
      targetAmount: 60,
      executedAmount: 60,
      reversedAmount: 0,
      routingStatus: "paid_out"
    })).toBe("settled");

    expect(derivePayoutExecutionReconciliationStatus({
      targetAmount: 0,
      executedAmount: 60,
      reversedAmount: 60,
      routingStatus: "refunded"
    })).toBe("reversed");

    expect(derivePayoutExecutionReconciliationStatus({
      targetAmount: 60,
      executedAmount: 60,
      reversedAmount: 20,
      routingStatus: "ready_for_payout",
      hasFailures: true
    })).toBe("manual_review");
  });

  it("builds deterministic payout execution idempotency keys", () => {
    expect(createPayoutExecutionIdempotencyKey("routing-1", "barber", "transfer")).toBe(
      createPayoutExecutionIdempotencyKey("routing-1", "barber", "transfer")
    );
    expect(createPayoutExecutionIdempotencyKey("routing-1", "barber", "transfer")).not.toBe(
      createPayoutExecutionIdempotencyKey("routing-1", "shop", "transfer")
    );
    expect(createPayoutExecutionIdempotencyKey("routing-1", "barber", "reversal", "refund-1")).toContain("refund-1");
  });
});
