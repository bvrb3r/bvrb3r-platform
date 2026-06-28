import {
  type EntitlementAccountRole,
  type EntitlementTier
} from "@/lib/entitlements/domain";

export type EntitledFeatureKey =
  | "client.booking.basic"
  | "client.loyalty.pro"
  | "client.priority.elite"
  | "barber.profile.basic"
  | "barber.retention.pro"
  | "barber.growth.elite"
  | "shop_owner.shop.basic"
  | "shop_owner.money.pro"
  | "shop_owner.scale.elite";

export type EntitledFeatureDefinition = {
  key: EntitledFeatureKey;
  label: string;
  accountRole: EntitlementAccountRole;
  requiredTier: EntitlementTier;
  upgradeTier: Exclude<EntitlementTier, "free"> | null;
  serverOwned: true;
};

export const ENTITLED_FEATURE_REGISTRY: EntitledFeatureDefinition[] = [
  {
    key: "client.booking.basic",
    label: "Client booking basics",
    accountRole: "client_user",
    requiredTier: "free",
    upgradeTier: null,
    serverOwned: true
  },
  {
    key: "client.loyalty.pro",
    label: "Client loyalty acceleration",
    accountRole: "client_user",
    requiredTier: "pro",
    upgradeTier: "pro",
    serverOwned: true
  },
  {
    key: "client.priority.elite",
    label: "Client priority access",
    accountRole: "client_user",
    requiredTier: "elite",
    upgradeTier: "elite",
    serverOwned: true
  },
  {
    key: "barber.profile.basic",
    label: "Barber profile basics",
    accountRole: "barber_user",
    requiredTier: "free",
    upgradeTier: null,
    serverOwned: true
  },
  {
    key: "barber.retention.pro",
    label: "Barber retention intelligence",
    accountRole: "barber_user",
    requiredTier: "pro",
    upgradeTier: "pro",
    serverOwned: true
  },
  {
    key: "barber.growth.elite",
    label: "Barber growth systems",
    accountRole: "barber_user",
    requiredTier: "elite",
    upgradeTier: "elite",
    serverOwned: true
  },
  {
    key: "shop_owner.shop.basic",
    label: "Shop operating basics",
    accountRole: "shop_owner_user",
    requiredTier: "free",
    upgradeTier: null,
    serverOwned: true
  },
  {
    key: "shop_owner.money.pro",
    label: "Shop money intelligence",
    accountRole: "shop_owner_user",
    requiredTier: "pro",
    upgradeTier: "pro",
    serverOwned: true
  },
  {
    key: "shop_owner.scale.elite",
    label: "Shop scale systems",
    accountRole: "shop_owner_user",
    requiredTier: "elite",
    upgradeTier: "elite",
    serverOwned: true
  }
];

export function getEntitledFeature(key: EntitledFeatureKey) {
  return ENTITLED_FEATURE_REGISTRY.find((feature) => feature.key === key) ?? null;
}
