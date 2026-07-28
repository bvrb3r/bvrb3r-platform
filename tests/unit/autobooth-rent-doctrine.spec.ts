import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHOP_BARBER_FINANCIAL_MODELS,
  SHOP_BARBER_FINANCIAL_MODEL_LABELS,
  calculateAutoBoothRentApplication,
  isShopBarberFinancialModel,
  resolveOutstandingRentCents,
  resolveTotalOutstandingRentCents
} from "@/lib/fintech/booth-rent-doctrine";
import { calculatePaymentRouting, normalizeCompensationAssignment, normalizeRoutingModel } from "@/lib/fintech/domain";

const doctrineMigrationSql = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260727120100_autobooth_rent_doctrine_lock.sql"
), "utf8");

function application(overrides: Partial<Parameters<typeof calculateAutoBoothRentApplication>[0]> = {}) {
  return calculateAutoBoothRentApplication({
    model: "autobooth_rent",
    autoBoothPercent: 0.5,
    eligibleProceedsCents: 10_000,
    outstandingRentCents: 40_000,
    paymentStatus: "captured",
    ...overrides
  });
}

describe("locked shop-barber financial doctrine", () => {
  it("ends retired commission relationships through the canonical status lifecycle", () => {
    expect(doctrineMigrationSql).toContain("set status = 'ended'");
    expect(doctrineMigrationSql).toContain("and status in ('invited', 'active', 'suspended')");
    expect(doctrineMigrationSql).not.toMatch(
      /update public\.shop_barber_relationships[\s\S]*?set is_active = false/
    );
  });

  it("supports exactly Full Booth Rent and AutoBooth Rent", () => {
    expect([...SHOP_BARBER_FINANCIAL_MODELS]).toEqual(["booth_rent", "autobooth_rent"]);
    expect(SHOP_BARBER_FINANCIAL_MODEL_LABELS).toEqual({
      booth_rent: "Full Booth Rent",
      autobooth_rent: "AutoBooth Rent"
    });
    expect(isShopBarberFinancialModel("commission")).toBe(false);
    expect(isShopBarberFinancialModel("freelance")).toBe(false);
  });

  it("normalizes retired revenue-share rows to freelance on read", () => {
    expect(normalizeRoutingModel("commission")).toBe("freelance");
    expect(normalizeRoutingModel("Commission")).toBe("freelance");
  });

  it("refuses to assign a retired revenue-share model on write", () => {
    expect(() => normalizeCompensationAssignment({ routingModel: "commission" as never }))
      .toThrow(/Full Booth Rent and AutoBooth Rent/i);
  });

  it("rejects an unknown routing model outright", () => {
    expect(() => normalizeRoutingModel("revenue_share")).toThrow(/Unsupported routing model/i);
  });
});

describe("outstanding booth rent", () => {
  it("is bounded by both the period rent and the owner-approved max charge", () => {
    expect(resolveOutstandingRentCents({
      amountCents: 40_000, amountPaidCents: 0, maxChargeCents: 45_000, status: "due"
    })).toBe(40_000);

    expect(resolveOutstandingRentCents({
      amountCents: 40_000, amountPaidCents: 0, maxChargeCents: 30_000, status: "due"
    })).toBe(30_000);
  });

  it("nets out what has already been paid and never goes negative", () => {
    expect(resolveOutstandingRentCents({
      amountCents: 40_000, amountPaidCents: 15_000, maxChargeCents: 45_000, status: "partially_paid"
    })).toBe(25_000);

    expect(resolveOutstandingRentCents({
      amountCents: 40_000, amountPaidCents: 999_999, maxChargeCents: 45_000, status: "partially_paid"
    })).toBe(0);
  });

  it("is zero for settled, waived, and cancelled charges", () => {
    for (const status of ["paid", "waived", "canceled", "disputed", "failed"]) {
      expect(resolveOutstandingRentCents({
        amountCents: 40_000, amountPaidCents: 0, maxChargeCents: 45_000, status
      })).toBe(0);
    }
  });

  it("sums across every open charge", () => {
    expect(resolveTotalOutstandingRentCents([
      { amountCents: 10_000, amountPaidCents: 0, maxChargeCents: 10_000, status: "due" },
      { amountCents: 10_000, amountPaidCents: 4_000, maxChargeCents: 10_000, status: "late" },
      { amountCents: 10_000, amountPaidCents: 10_000, maxChargeCents: 10_000, status: "paid" }
    ])).toBe(16_000);
  });
});

describe("AutoBooth Rent never exceeds outstanding rent", () => {
  it("applies the owner-approved portion when rent exceeds it", () => {
    const result = application({ autoBoothPercent: 0.5, eligibleProceedsCents: 10_000, outstandingRentCents: 40_000 });

    expect(result.status).toBe("applied");
    expect(result.appliedToRentCents).toBe(5_000);
    expect(result.barberRemainderCents).toBe(5_000);
    expect(result.outstandingRentAfterCents).toBe(35_000);
  });

  it("clamps the application to outstanding rent", () => {
    const result = application({ autoBoothPercent: 0.9, eligibleProceedsCents: 10_000, outstandingRentCents: 1_200 });

    expect(result.appliedToRentCents).toBe(1_200);
    expect(result.outstandingRentAfterCents).toBe(0);
    // Everything above the debt stays with the barber.
    expect(result.barberRemainderCents).toBe(8_800);
  });

  it("applies nothing once rent is fully settled", () => {
    const result = application({ outstandingRentCents: 0 });

    expect(result.status).toBe("skipped_no_outstanding_rent");
    expect(result.appliedToRentCents).toBe(0);
    expect(result.barberRemainderCents).toBe(10_000);
  });

  it("never applies more than the eligible proceeds even at a full portion", () => {
    const result = application({ autoBoothPercent: 1, eligibleProceedsCents: 3_000, outstandingRentCents: 999_999 });

    expect(result.appliedToRentCents).toBe(3_000);
    expect(result.barberRemainderCents).toBe(0);
  });

  it("holds the cap across a sequence of transactions", () => {
    let outstandingRentCents = 7_000;
    let applied = 0;

    for (let index = 0; index < 20; index += 1) {
      const result = application({ autoBoothPercent: 0.5, eligibleProceedsCents: 10_000, outstandingRentCents });
      applied += result.appliedToRentCents;
      outstandingRentCents = result.outstandingRentAfterCents;
    }

    // Total applied equals the original debt exactly, never a cent more.
    expect(applied).toBe(7_000);
    expect(outstandingRentCents).toBe(0);
  });

  it("uses integer cents so rounding can never overshoot the debt", () => {
    const result = application({ autoBoothPercent: 0.3333, eligibleProceedsCents: 1_001, outstandingRentCents: 333 });

    expect(result.appliedToRentCents).toBe(333);
    expect(result.appliedToRentCents).toBeLessThanOrEqual(333);
  });

  it("applies nothing when the approved portion rounds below one cent", () => {
    const result = application({ autoBoothPercent: 0.001, eligibleProceedsCents: 50, outstandingRentCents: 40_000 });

    expect(result.status).toBe("skipped_no_eligible_proceeds");
    expect(result.appliedToRentCents).toBe(0);
  });

  it("rejects an owner-approved portion above 100 percent", () => {
    expect(() => application({ autoBoothPercent: 1.5 })).toThrow(/between 0 and 1/i);
  });
});

describe("AutoBooth Rent is not labor compensation or revenue sharing", () => {
  it("applies nothing under Full Booth Rent", () => {
    const result = application({ model: "booth_rent", autoBoothPercent: 0.9 });

    expect(result.status).toBe("skipped_model_not_autobooth");
    expect(result.appliedToRentCents).toBe(0);
    expect(result.barberRemainderCents).toBe(10_000);
  });

  it("applies nothing when the owner has approved no portion", () => {
    for (const autoBoothPercent of [null, undefined, 0]) {
      const result = application({ autoBoothPercent });

      expect(result.status).toBe("skipped_no_approved_portion");
      expect(result.appliedToRentCents).toBe(0);
    }
  });

  it("keeps tips entirely with the barber", () => {
    const routed = calculatePaymentRouting({
      paymentType: "tip",
      paymentStatus: "captured",
      grossAmount: 25,
      routingModel: "autobooth_rent",
      autoBoothPercent: 0.9,
      outstandingRentCents: 100_000,
      barberReady: true,
      shopReady: true,
      appointmentCompleted: true
    });

    expect(routed.tipAmount).toBe(25);
    expect(routed.barberPayoutAmount).toBe(25);
    expect(routed.autoBoothRentAppliedAmount).toBe(0);
    expect(routed.shopSplitAmount).toBe(0);
  });
});

describe("AutoBooth Rent refund, dispute, and duplicate-event safety", () => {
  it("applies nothing on a refunded payment", () => {
    const result = application({ paymentStatus: "refunded" });

    expect(result.status).toBe("skipped_payment_not_eligible");
    expect(result.appliedToRentCents).toBe(0);
    expect(result.reason).toMatch(/captured/i);
  });

  it("applies nothing on an uncaptured or failed payment", () => {
    for (const paymentStatus of ["pending", "failed", "voided", "requires_capture"]) {
      const result = application({ paymentStatus });

      expect(result.status).toBe("skipped_payment_not_eligible");
      expect(result.appliedToRentCents).toBe(0);
    }
  });

  it("applies nothing while a dispute or chargeback holds the funds", () => {
    const result = application({ disputeHold: true });

    expect(result.status).toBe("skipped_payment_not_eligible");
    expect(result.appliedToRentCents).toBe(0);
    expect(result.reason).toMatch(/dispute or chargeback/i);
  });

  it("nets a partial refund out of the eligible proceeds before applying", () => {
    const result = application({
      paymentStatus: "partially_refunded",
      autoBoothPercent: 0.5,
      eligibleProceedsCents: 10_000,
      refundedProceedsCents: 6_000,
      outstandingRentCents: 40_000
    });

    // 50% of the 4_000 that actually remains, not of the original 10_000.
    expect(result.appliedToRentCents).toBe(2_000);
    expect(result.barberRemainderCents).toBe(2_000);
  });

  it("applies nothing when a refund leaves no proceeds behind", () => {
    const result = application({
      paymentStatus: "partially_refunded",
      eligibleProceedsCents: 10_000,
      refundedProceedsCents: 10_000
    });

    expect(result.status).toBe("skipped_no_eligible_proceeds");
    expect(result.appliedToRentCents).toBe(0);
  });

  it("treats a replayed processor event as a no-op", () => {
    const eventKey = "evt_autobooth_1";
    const first = application({ eventKey, processedEventKeys: [] });
    const replay = application({ eventKey, processedEventKeys: [eventKey] });

    expect(first.status).toBe("applied");
    expect(first.appliedToRentCents).toBe(5_000);

    expect(replay.status).toBe("skipped_duplicate_event");
    expect(replay.appliedToRentCents).toBe(0);
    expect(replay.reason).toMatch(/already applied/i);
  });

  it("does not double-apply across a replayed webhook sequence", () => {
    const processedEventKeys: string[] = [];
    let outstandingRentCents = 40_000;
    let applied = 0;

    // The same three events arrive twice, in an interleaved order.
    for (const eventKey of ["evt_a", "evt_b", "evt_a", "evt_c", "evt_b", "evt_c"]) {
      const result = application({ eventKey, processedEventKeys, outstandingRentCents });
      if (result.status === "applied") {
        processedEventKeys.push(eventKey);
        applied += result.appliedToRentCents;
        outstandingRentCents = result.outstandingRentAfterCents;
      }
    }

    // Three distinct events at 5_000 each, replays ignored.
    expect(applied).toBe(15_000);
    expect(outstandingRentCents).toBe(25_000);
    expect(processedEventKeys).toEqual(["evt_a", "evt_b", "evt_c"]);
  });

  it("still checks duplicates before eligibility so a replayed refund cannot reopen rent", () => {
    const result = application({
      eventKey: "evt_dup",
      processedEventKeys: ["evt_dup"],
      paymentStatus: "refunded"
    });

    expect(result.status).toBe("skipped_duplicate_event");
    expect(result.outstandingRentAfterCents).toBe(40_000);
  });
});
