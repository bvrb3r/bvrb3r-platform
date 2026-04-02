import { describe, expect, it } from "vitest";
import {
  assertPromotionRedemptionTransition,
  evaluatePromotionDiscount,
  getPromotionAvailabilityState,
  normalizePromotionInput
} from "@/lib/promotions/domain";

describe("phase 12 promotions domain", () => {
  it("normalizes a valid promotion input for creation", () => {
    const normalized = normalizePromotionInput({
      shopId: "loc-ybor",
      name: "  Fresh Friday  ",
      code: " fresh15 ",
      description: "  Fifteen percent off walk-ins  ",
      promotionType: "code",
      discountType: "percent",
      discountValue: 15,
      appliesToScope: "booking",
      startsAt: "2026-03-20T10:00:00.000Z",
      endsAt: "2026-03-27T10:00:00.000Z"
    }, "create");

    expect(normalized.name).toBe("Fresh Friday");
    expect(normalized.code).toBe("FRESH15");
    expect(normalized.description).toBe("Fifteen percent off walk-ins");
  });

  it("rejects invalid promotion setup", () => {
    expect(() => normalizePromotionInput({
      shopId: "loc-ybor",
      name: "A",
      promotionType: "code",
      discountType: "percent",
      discountValue: 0,
      appliesToScope: "booking",
      startsAt: "2026-03-27T10:00:00.000Z",
      endsAt: "2026-03-20T10:00:00.000Z"
    }, "create")).toThrow();
  });

  it("reports active, scheduled, expired, and inactive availability", () => {
    expect(getPromotionAvailabilityState({
      startsAt: "2026-03-20T10:00:00.000Z",
      endsAt: "2026-03-27T10:00:00.000Z",
      isActive: true
    }, "2026-03-21T12:00:00.000Z")).toBe("active");

    expect(getPromotionAvailabilityState({
      startsAt: "2026-03-20T10:00:00.000Z",
      endsAt: "2026-03-27T10:00:00.000Z",
      isActive: true
    }, "2026-03-19T12:00:00.000Z")).toBe("scheduled");

    expect(getPromotionAvailabilityState({
      startsAt: "2026-03-20T10:00:00.000Z",
      endsAt: "2026-03-27T10:00:00.000Z",
      isActive: true
    }, "2026-03-28T12:00:00.000Z")).toBe("expired");

    expect(getPromotionAvailabilityState({
      startsAt: "2026-03-20T10:00:00.000Z",
      endsAt: "2026-03-27T10:00:00.000Z",
      isActive: false
    }, "2026-03-21T12:00:00.000Z")).toBe("inactive");
  });

  it("calculates deterministic percent discounts with caps", () => {
    const result = evaluatePromotionDiscount({
      shopId: "loc-ybor",
      name: "Fresh Friday",
      promotionType: "code",
      discountType: "percent",
      discountValue: 25,
      appliesToScope: "booking",
      minSubtotal: 40,
      maxDiscountAmount: 12,
      usageLimit: 20,
      usageCount: 5,
      startsAt: "2026-03-20T10:00:00.000Z",
      endsAt: "2026-03-27T10:00:00.000Z",
      isActive: true
    }, {
      shopId: "loc-ybor",
      serviceId: "srv-signature",
      barberId: "barber-blaze",
      subtotal: 73,
      serviceBaseAmount: 55,
      nowIso: "2026-03-21T12:00:00.000Z"
    });

    expect(result).toEqual({ ok: true, discountAmount: 12 });
  });

  it("rejects inactive, ineligible, or capped-out promotions", () => {
    expect(evaluatePromotionDiscount({
      shopId: "loc-ybor",
      name: "Expired offer",
      promotionType: "code",
      discountType: "fixed_amount",
      discountValue: 10,
      appliesToScope: "booking",
      usageLimit: 1,
      usageCount: 1,
      startsAt: "2026-03-20T10:00:00.000Z",
      endsAt: "2026-03-27T10:00:00.000Z",
      isActive: true,
      serviceId: "srv-signature"
    }, {
      shopId: "loc-ybor",
      serviceId: "srv-razor",
      subtotal: 55,
      serviceBaseAmount: 55,
      nowIso: "2026-03-21T12:00:00.000Z"
    })).toEqual({
      ok: false,
      reason: "This promotion does not apply to the selected service."
    });
  });

  it("guards valid and invalid redemption transitions", () => {
    expect(() => assertPromotionRedemptionTransition("reserved", "applied")).not.toThrow();
    expect(() => assertPromotionRedemptionTransition("applied", "completed")).not.toThrow();
    expect(() => assertPromotionRedemptionTransition("completed", "voided")).toThrow(/Cannot move promotion redemption/);
  });
});
