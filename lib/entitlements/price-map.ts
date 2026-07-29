import {
  type EntitlementAccountRole,
  type EntitlementBillingInterval,
  type EntitlementTier
} from "@/lib/entitlements/domain";

export type EntitlementPriceCatalogEntry = {
  priceId: string;
  accountRole: EntitlementAccountRole;
  tier: Exclude<EntitlementTier, "standard">;
  billingInterval: Exclude<EntitlementBillingInterval, "none">;
  envKey: string;
};

type EnvLike = Record<string, string | undefined>;

const PRICE_ENV_MATRIX = [
  ["BVRB3R_CLIENT_PRO_MONTHLY_PRICE_ID", "client_user", "pro", "monthly"],
  ["BVRB3R_CLIENT_PRO_YEARLY_PRICE_ID", "client_user", "pro", "yearly"],
  ["BVRB3R_CLIENT_ELITE_MONTHLY_PRICE_ID", "client_user", "elite", "monthly"],
  ["BVRB3R_CLIENT_ELITE_YEARLY_PRICE_ID", "client_user", "elite", "yearly"],
  ["BVRB3R_BARBER_PRO_MONTHLY_PRICE_ID", "barber_user", "pro", "monthly"],
  ["BVRB3R_BARBER_PRO_YEARLY_PRICE_ID", "barber_user", "pro", "yearly"],
  ["BVRB3R_BARBER_ELITE_MONTHLY_PRICE_ID", "barber_user", "elite", "monthly"],
  ["BVRB3R_BARBER_ELITE_YEARLY_PRICE_ID", "barber_user", "elite", "yearly"],
  ["BVRB3R_SHOP_OWNER_PRO_MONTHLY_PRICE_ID", "shop_owner_user", "pro", "monthly"],
  ["BVRB3R_SHOP_OWNER_PRO_YEARLY_PRICE_ID", "shop_owner_user", "pro", "yearly"],
  ["BVRB3R_SHOP_OWNER_ELITE_MONTHLY_PRICE_ID", "shop_owner_user", "elite", "monthly"],
  ["BVRB3R_SHOP_OWNER_ELITE_YEARLY_PRICE_ID", "shop_owner_user", "elite", "yearly"]
] as const satisfies ReadonlyArray<readonly [
  string,
  EntitlementAccountRole,
  Exclude<EntitlementTier, "standard">,
  Exclude<EntitlementBillingInterval, "none">
]>;

export const ENTITLEMENT_PRICE_ENV_KEYS = PRICE_ENV_MATRIX.map(([envKey]) => envKey);

export function getEntitlementPriceCatalog(env: EnvLike = process.env): EntitlementPriceCatalogEntry[] {
  return PRICE_ENV_MATRIX.flatMap(([envKey, accountRole, tier, billingInterval]) => {
    const priceId = env[envKey]?.trim();
    if (!priceId) {
      return [];
    }

    return [{
      priceId,
      accountRole,
      tier,
      billingInterval,
      envKey
    }];
  });
}

export function resolveEntitlementPrice(
  priceId: string | null | undefined,
  env: EnvLike = process.env
): EntitlementPriceCatalogEntry | null {
  const normalizedPriceId = priceId?.trim();
  if (!normalizedPriceId) {
    return null;
  }

  return getEntitlementPriceCatalog(env).find((entry) => entry.priceId === normalizedPriceId) ?? null;
}
