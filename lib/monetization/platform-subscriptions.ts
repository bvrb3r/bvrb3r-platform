import type { SubscriptionPlanInterval, SubscriptionSubjectType } from "@/types/monetization";

export type PlatformSubscriptionPlan = {
  subjectType: Extract<SubscriptionSubjectType, "barber" | "shop">;
  planCode: string;
  planName: string;
  interval: Extract<SubscriptionPlanInterval, "weekly" | "monthly">;
  unitAmount: number;
  currency: string;
};

const PLATFORM_SUBSCRIPTION_PLANS: Record<"barber" | "shop", PlatformSubscriptionPlan> = {
  barber: {
    subjectType: "barber",
    planCode: "barber_core_weekly",
    planName: "Barber Core Weekly",
    interval: "weekly",
    unitAmount: 10,
    currency: "usd"
  },
  shop: {
    subjectType: "shop",
    planCode: "shop_core_weekly",
    planName: "Shop Core Weekly",
    interval: "weekly",
    unitAmount: 20,
    currency: "usd"
  }
};

export function getPlatformSubscriptionPlan(subjectType: "barber" | "shop") {
  return PLATFORM_SUBSCRIPTION_PLANS[subjectType];
}
