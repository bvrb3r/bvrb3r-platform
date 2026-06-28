import { describe, expect, it } from "vitest";
import {
  ENTITLEMENT_PRICE_ENV_KEYS,
  getEntitlementPriceCatalog,
  resolveEntitlementPrice
} from "@/lib/entitlements/price-map";

describe("entitlement price map", () => {
  it("uses only canonical paid intervals for public entitlement tiers", () => {
    const catalog = getEntitlementPriceCatalog({
      BVRB3R_CLIENT_PRO_MONTHLY_PRICE_ID: "price_client_pro_monthly",
      BVRB3R_CLIENT_PRO_YEARLY_PRICE_ID: "price_client_pro_yearly",
      BVRB3R_BARBER_ELITE_YEARLY_PRICE_ID: "price_barber_elite_yearly"
    });

    expect(catalog.map((entry) => entry.billingInterval).sort()).toEqual(["monthly", "yearly", "yearly"]);
    expect(catalog.map((entry) => entry.tier)).not.toContain("standard");
    expect(catalog.map((entry) => entry.billingInterval)).not.toContain("weekly");
  });

  it("resolves known prices and refuses unknown Stripe prices", () => {
    const env = {
      BVRB3R_SHOP_OWNER_ELITE_MONTHLY_PRICE_ID: "price_owner_elite_monthly"
    };

    expect(resolveEntitlementPrice("price_owner_elite_monthly", env)).toMatchObject({
      accountRole: "shop_owner_user",
      tier: "elite",
      billingInterval: "monthly"
    });
    expect(resolveEntitlementPrice("price_unknown", env)).toBeNull();
  });

  it("has no weekly or standard environment slots", () => {
    expect(ENTITLEMENT_PRICE_ENV_KEYS.join("\n")).not.toMatch(/WEEKLY|STANDARD/);
  });
});
