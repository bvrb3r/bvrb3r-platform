import { describe, expect, it } from "vitest";

import {
  KIOSK_DEFAULT_TIP_PERCENT,
  KIOSK_TIP_PERCENTS,
  buildKioskTipOptions,
  calculateKioskTipCents,
  calculateKioskTotalCents,
  formatKioskMoney,
  minimumServicePriceCents
} from "@/lib/kiosk/tip";

describe("kiosk tip math", () => {
  it("offers the four approved tiers with 20% pre-highlighted", () => {
    expect(KIOSK_TIP_PERCENTS).toEqual([0, 15, 20, 25]);
    expect(KIOSK_DEFAULT_TIP_PERCENT).toBe(20);
    expect(buildKioskTipOptions(4000).filter((option) => option.recommended)).toHaveLength(1);
  });

  it("computes whole-dollar tips exactly as the prototype does", () => {
    // $40 service — the prototype's reference numbers.
    expect(calculateKioskTipCents(4000, 0)).toBe(0);
    expect(calculateKioskTipCents(4000, 15)).toBe(600);
    expect(calculateKioskTipCents(4000, 20)).toBe(800);
    expect(calculateKioskTipCents(4000, 25)).toBe(1000);
    expect(calculateKioskTotalCents(4000, 20)).toBe(4800);
  });

  it("rounds to the cent on prices that do not divide evenly", () => {
    // $45 at 15% is $6.75 exactly; at 20% it is $9.00.
    expect(calculateKioskTipCents(4500, 15)).toBe(675);
    expect(calculateKioskTipCents(4500, 20)).toBe(900);
    // $32.50 at 15% is $4.875 — rounds to $4.88, never truncates to $4.87.
    expect(calculateKioskTipCents(3250, 15)).toBe(488);
    expect(calculateKioskTotalCents(3250, 15)).toBe(3738);
  });

  it("never invents a tip on a service with no price", () => {
    expect(calculateKioskTipCents(0, 20)).toBe(0);
    expect(calculateKioskTotalCents(0, 20)).toBe(0);
    expect(calculateKioskTipCents(Number.NaN, 20)).toBe(0);
    expect(calculateKioskTipCents(-500, 20)).toBe(0);
  });

  it("never charges a negative or fractional-cent total", () => {
    for (const percent of KIOSK_TIP_PERCENTS) {
      for (const subtotal of [0, 1, 1500, 3250, 4500, 8000, 12345]) {
        const total = calculateKioskTotalCents(subtotal, percent);
        expect(Number.isInteger(total)).toBe(true);
        expect(total).toBeGreaterThanOrEqual(0);
        expect(total).toBeGreaterThanOrEqual(subtotal);
      }
    }
  });

  it("formats money the way a kiosk should read it", () => {
    expect(formatKioskMoney(4000)).toBe("$40");
    expect(formatKioskMoney(4500)).toBe("$45");
    expect(formatKioskMoney(5175)).toBe("$51.75");
    expect(formatKioskMoney(675)).toBe("$6.75");
    expect(formatKioskMoney(5)).toBe("$0.05");
    expect(formatKioskMoney(0)).toBe("$0");
    expect(formatKioskMoney(null)).toBe("");
    expect(formatKioskMoney(undefined)).toBe("");
  });

  it("builds tiles whose labels match their arithmetic", () => {
    const options = buildKioskTipOptions(4500);

    expect(options.map((option) => option.percentLabel)).toEqual(["—", "15%", "20%", "25%"]);
    expect(options.map((option) => formatKioskMoney(option.totalCents))).toEqual([
      "$45",
      "$51.75",
      "$54",
      "$56.25"
    ]);
    for (const option of options) {
      expect(option.totalCents).toBe(4500 + option.tipCents);
    }
  });

  it("finds the cheapest priced service for a From $X chip and skips unpriced ones", () => {
    expect(minimumServicePriceCents([{ priceCents: 4000 }, { priceCents: 2000 }, { priceCents: 5500 }])).toBe(2000);
    expect(minimumServicePriceCents([{ priceCents: null }, { priceCents: 3000 }])).toBe(3000);
    expect(minimumServicePriceCents([{ priceCents: null }, {}])).toBeNull();
    expect(minimumServicePriceCents([])).toBeNull();
    // A zero-priced row is missing data, not a free cut.
    expect(minimumServicePriceCents([{ priceCents: 0 }, { priceCents: 1500 }])).toBe(1500);
  });
});
