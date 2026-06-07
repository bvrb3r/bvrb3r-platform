import { describe, expect, it } from "vitest";

import { formatPublicShopLocation, resolvePublicShopIdentity } from "@/lib/shops/public-identity";

describe("public shop identity", () => {
  it("formats public shop address fields without mixing approval status into location", () => {
    const identity = resolvePublicShopIdentity({
      id: "shop-the-bvrb3r-shop-universi-a02c68",
      name: "The BVRB3R Shop (University Mall)",
      public_username: "thebvrb3rshopuniversitymall",
      address: "2172 University Square Mall",
      neighborhood: "Pending",
      city: "Tampa",
      state: "FL",
      zip_code: "33612",
      app_approval_status: "pending"
    });

    expect(identity.formattedPublicLocation).toBe("2172 University Square Mall - Tampa, FL 33612");
    expect(identity.formattedPublicLocation).not.toBe("Pending, Tampa");
    expect(identity.approvalLabel).toBe("Pending approval");
  });

  it("ignores pending placeholders when only city and state are public-safe", () => {
    expect(formatPublicShopLocation({
      address: "Pending",
      neighborhood: "Pending",
      city: "Tampa",
      state: "FL"
    })).toBe("Tampa, FL");
  });
});
