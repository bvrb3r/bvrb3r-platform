import { describe, expect, it } from "vitest";
import {
  PUBLIC_QUEUE_STATE_COPY,
  RENT_ARCHITECT_CHECK_KEYS,
  RENT_SETUP_GATE_KEYS,
  applyRentGrace,
  applyRentLateFee,
  calculateRentContribution,
  evaluateShopOperationalGate,
  resolveRefundReversal,
  resolveRentAgreementReadiness,
  resolveRentReleaseCertificate,
  waiveRentObligation
} from "@/lib/rent/domain";

describe("PR22 rent contribution doctrine", () => {
  it("stops cold at exactly zero outstanding rent", () => {
    const result = calculateRentContribution({
      model: "autobooth_rent",
      autoBoothPercent: 0.4,
      serviceAmountCents: 178_000,
      platformFeeCents: 0,
      processingFeeCents: 0,
      tipAmountCents: 0,
      taxAmountCents: 0,
      outstandingRentCents: 26_000,
      paymentStatus: "captured"
    });

    expect(result.appliedToRentCents).toBe(26_000);
    expect(result.outstandingRentAfterCents).toBe(0);
    expect(result.barberRemainderCents).toBe(152_000);
  });

  it("never includes tips or taxes in the AutoBooth base", () => {
    const result = calculateRentContribution({
      model: "autobooth_rent",
      autoBoothPercent: 1,
      serviceAmountCents: 4_000,
      platformFeeCents: 0,
      processingFeeCents: 0,
      tipAmountCents: 1_000,
      taxAmountCents: 360,
      outstandingRentCents: 20_000,
      paymentStatus: "captured"
    });

    expect(result.eligibleServiceCents).toBe(4_000);
    expect(result.appliedToRentCents).toBe(4_000);
    expect(result.excludedTipCents).toBe(1_000);
    expect(result.excludedTaxCents).toBe(360);
  });

  it("reverses the exact remaining settled contribution", () => {
    expect(resolveRefundReversal({
      id: "contribution-1",
      appliedCents: 8_400,
      status: "settled"
    }, 2_100)).toBe(6_300);
  });

  it("keeps cash pending out of settled reversal paths", () => {
    expect(() => resolveRefundReversal({
      id: "cash-1",
      appliedCents: 4_000,
      status: "pending"
    }, 0)).toThrow(/settled/i);
  });
});

describe("PR22 agreement and recovery invariants", () => {
  it("requires both parties and a prospective effective time", () => {
    const readiness = resolveRentAgreementReadiness({
      status: "accepted",
      ownerAcceptedAt: "2026-07-28T10:00:00.000Z",
      barberAcceptedAt: "2026-07-28T11:00:00.000Z",
      effectiveAt: "2026-08-01T00:00:00.000Z"
    }, new Date("2026-07-28T12:00:00.000Z"));

    expect(readiness).toEqual({
      acceptedByBoth: true,
      prospective: true,
      canActivate: true,
      reason: null
    });
  });

  it("enforces grace once, late fee once, and reasoned waiver", () => {
    const obligation = {
      baseRentCents: 25_000,
      lateFeeCents: 0,
      amountSettledCents: 0,
      graceUsedAt: null,
      lateFeeAppliedAt: null,
      waivedAt: null,
      waiverReason: null
    };
    const graced = applyRentGrace(obligation, "2026-07-28T12:00:00.000Z");
    expect(() => applyRentGrace(graced)).toThrow(/only be applied once/i);

    const withFee = applyRentLateFee(graced, 2_500, "2026-07-29T12:00:00.000Z");
    expect(() => applyRentLateFee(withFee, 2_500)).toThrow(/only be applied once/i);
    expect(() => waiveRentObligation(withFee, "  ")).toThrow(/auditable reason/i);
    expect(waiveRentObligation(withFee, "Owner-approved storm closure").waiverReason)
      .toBe("Owner-approved storm closure");
  });
});

describe("PR22 operational and release gates", () => {
  it("requires all twelve setup gates", () => {
    const eleven = RENT_SETUP_GATE_KEYS.slice(0, 11).map((key) => ({ key, status: "passed" as const }));
    expect(evaluateShopOperationalGate(eleven)).toMatchObject({
      passedCount: 11,
      requiredCount: 12,
      operational: false,
      missing: ["emergency_controls"]
    });
    const twelve = RENT_SETUP_GATE_KEYS.map((key) => ({ key, status: "passed" as const }));
    expect(evaluateShopOperationalGate(twelve).operational).toBe(true);
  });

  it("requires all twelve Architect checks for certification", () => {
    const checks = RENT_ARCHITECT_CHECK_KEYS.map((key) => ({
      key,
      passed: key !== "notifications",
      detail: key
    }));
    expect(resolveRentReleaseCertificate(checks)).toMatchObject({
      checkCount: 12,
      passedCount: 11,
      certifiable: false,
      failed: ["notifications"]
    });
  });

  it("defines honest client copy for all eight queue states", () => {
    expect(Object.keys(PUBLIC_QUEUE_STATE_COPY)).toHaveLength(8);
    expect(PUBLIC_QUEUE_STATE_COPY.reassigned.detail).toMatch(/price/i);
    expect(PUBLIC_QUEUE_STATE_COPY.canceled.detail).toMatch(/No queue payment/i);
  });
});
