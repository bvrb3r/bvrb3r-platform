import type {
  EntitlementAccountRole,
  EntitlementTier
} from "@/lib/entitlements/domain";

export type CanonicalPlanPrice = {
  tier: EntitlementTier;
  label: "Standard" | "Pro" | "Elite";
  monthlyCents: number;
  yearlyCents: number;
  billable: boolean;
};

export const PLAN_ROLE_LABELS: Record<EntitlementAccountRole, "Client" | "Barber" | "Shop Owner"> = {
  client_user: "Client",
  barber_user: "Barber",
  shop_owner_user: "Shop Owner"
};

export const CANONICAL_PLAN_PRICING = {
  client_user: {
    standard: { tier: "standard", label: "Standard", monthlyCents: 0, yearlyCents: 0, billable: false },
    pro: { tier: "pro", label: "Pro", monthlyCents: 999, yearlyCents: 9_900, billable: true },
    elite: { tier: "elite", label: "Elite", monthlyCents: 1_999, yearlyCents: 19_900, billable: true }
  },
  barber_user: {
    standard: { tier: "standard", label: "Standard", monthlyCents: 0, yearlyCents: 0, billable: false },
    pro: { tier: "pro", label: "Pro", monthlyCents: 2_900, yearlyCents: 29_000, billable: true },
    elite: { tier: "elite", label: "Elite", monthlyCents: 4_900, yearlyCents: 49_000, billable: true }
  },
  shop_owner_user: {
    standard: { tier: "standard", label: "Standard", monthlyCents: 0, yearlyCents: 0, billable: false },
    pro: { tier: "pro", label: "Pro", monthlyCents: 7_900, yearlyCents: 79_000, billable: true },
    elite: { tier: "elite", label: "Elite", monthlyCents: 12_900, yearlyCents: 129_000, billable: true }
  }
} as const satisfies Record<EntitlementAccountRole, Record<EntitlementTier, CanonicalPlanPrice>>;

export const CANONICAL_PLAN_TIERS = ["standard", "pro", "elite"] as const satisfies readonly EntitlementTier[];

export function getCanonicalPlanPrice(accountRole: EntitlementAccountRole, tier: EntitlementTier) {
  return CANONICAL_PLAN_PRICING[accountRole][tier];
}

export function formatPlanAmount(cents: number) {
  if (cents === 0) {
    return "$0";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(cents / 100);
}
