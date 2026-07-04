import type { Route } from "next";
import type { EntitlementAccessState, EntitlementSnapshot, EntitlementTier, ServerEntitlementTruth } from "@/lib/entitlements/domain";
import { buildEntitlementSnapshot, checkEntitledFeatureAccess, resolveServerEntitlementForUser } from "@/lib/entitlements/server";
import type { EntitledFeatureKey } from "@/lib/entitlements/features";
import type { UserAccount } from "@/types/domain";

export type ShopOwnerPaywallFeatureState =
  | "available"
  | "locked"
  | "needs_review"
  | "coming_soon"
  | "unavailable"
  | "forbidden_role"
  | "unauthenticated";

export type ShopOwnerPaywallTone = "green" | "yellow" | "neutral";

export type ShopOwnerPaywallFeatureView = {
  id: string;
  title: string;
  description: string;
  requiredPlanLabel: "Free" | "Pro" | "Elite";
  state: ShopOwnerPaywallFeatureState;
  stateLabel: string;
  reason: string;
  evidenceSource: string;
};

export type ShopOwnerPaywallGuardrail = {
  title: string;
  description: string;
};

export type ShopOwnerPaywallSummary = {
  activeOwnerPaywall: boolean;
  currentPlanLabel: "Free" | "Pro" | "Elite";
  billingLabel: string;
  statusLabel: string;
  statusTone: ShopOwnerPaywallTone;
  serverEvidenceLabel: string;
  freeShopSetupAvailable: true;
  lockedFeatureCount: number;
  needsReviewCount: number;
  comingSoonCount: number;
  upgradeActionLabel: "Plan management is being prepared";
  fallbackActionLabel: "Keep setting up your shop";
  upgradeHref: Route | null;
  fallbackHref: Route;
  checkoutUrl: null;
  portalUrl: null;
  guardrails: ShopOwnerPaywallGuardrail[];
  features: {
    free: ShopOwnerPaywallFeatureView[];
    pro: ShopOwnerPaywallFeatureView[];
    elite: ShopOwnerPaywallFeatureView[];
  };
};

type ShopOwnerPaywallFeatureDefinition = {
  id: string;
  title: string;
  description: string;
  requiredTier: EntitlementTier;
  featureKey: EntitledFeatureKey | null;
  liveInOwnerV1: boolean;
};

const SHOP_OWNER_PLAN_FEATURES: ShopOwnerPaywallFeatureDefinition[] = [
  {
    id: "owner-shop-profile-setup",
    title: "Shop profile, location, hours, and chairs",
    description: "Set up the shop identity, address, hours, chair basics, and public readiness inputs.",
    requiredTier: "free",
    featureKey: "shop_owner.shop.basic",
    liveInOwnerV1: true
  },
  {
    id: "owner-first-barber-invite",
    title: "First barber invite and setup checklist",
    description: "Invite the first barber and keep the basic setup checklist moving.",
    requiredTier: "free",
    featureKey: "shop_owner.shop.basic",
    liveInOwnerV1: true
  },
  {
    id: "owner-basic-home-settings",
    title: "Owner Home, More, and basic schedule visibility",
    description: "Use the Owner Home, More/settings, support, compliance, and baseline schedule views.",
    requiredTier: "free",
    featureKey: "shop_owner.shop.basic",
    liveInOwnerV1: true
  },
  {
    id: "owner-kiosk-status-visibility",
    title: "Kiosk setup and status visibility",
    description: "Review kiosk readiness and setup posture without enabling advanced kiosk controls.",
    requiredTier: "free",
    featureKey: "shop_owner.shop.basic",
    liveInOwnerV1: true
  },
  {
    id: "owner-advanced-team-controls",
    title: "Advanced team controls",
    description: "Use deeper team controls and owner-level operating views when Pro proof is verified.",
    requiredTier: "pro",
    featureKey: "shop_owner.money.pro",
    liveInOwnerV1: true
  },
  {
    id: "owner-schedule-capacity-tools",
    title: "Deeper schedule and capacity tools",
    description: "Review deeper schedule and chair capacity tooling when Pro proof is verified.",
    requiredTier: "pro",
    featureKey: "shop_owner.money.pro",
    liveInOwnerV1: true
  },
  {
    id: "owner-money-reports",
    title: "Owner money reports",
    description: "Open server-owned owner money reports when Pro proof is verified.",
    requiredTier: "pro",
    featureKey: "shop_owner.money.pro",
    liveInOwnerV1: true
  },
  {
    id: "owner-compensation-advanced",
    title: "Booth rent and commission controls",
    description: "Reserved for advanced compensation controls after the canonical money rules are ready.",
    requiredTier: "pro",
    featureKey: "shop_owner.money.pro",
    liveInOwnerV1: false
  },
  {
    id: "owner-kiosk-advanced",
    title: "Advanced kiosk settings",
    description: "Reserved for advanced kiosk activation and operating rules.",
    requiredTier: "pro",
    featureKey: "shop_owner.money.pro",
    liveInOwnerV1: false
  },
  {
    id: "owner-performance-analytics",
    title: "Reports and performance analytics",
    description: "Review deeper owner performance analytics when Pro proof is verified.",
    requiredTier: "pro",
    featureKey: "shop_owner.money.pro",
    liveInOwnerV1: true
  },
  {
    id: "owner-local-growth-tools",
    title: "Local growth tools",
    description: "Reserved for local growth tooling after the growth phase is built.",
    requiredTier: "elite",
    featureKey: "shop_owner.scale.elite",
    liveInOwnerV1: false
  },
  {
    id: "owner-multilocation-scale",
    title: "Multi-location scale tools",
    description: "Reserved for multi-location shop operations after the scale phase is built.",
    requiredTier: "elite",
    featureKey: "shop_owner.scale.elite",
    liveInOwnerV1: false
  },
  {
    id: "owner-advanced-analytics",
    title: "Advanced shop analytics",
    description: "Reserved for advanced shop analytics after server-owned analytics proof exists.",
    requiredTier: "elite",
    featureKey: "shop_owner.scale.elite",
    liveInOwnerV1: false
  },
  {
    id: "owner-shop-command-tools",
    title: "Shop command tools",
    description: "Reserved for future shop command tooling after the foundation is ready.",
    requiredTier: "elite",
    featureKey: "shop_owner.scale.elite",
    liveInOwnerV1: false
  }
];

const SHOP_OWNER_GUARDRAILS: ShopOwnerPaywallGuardrail[] = [
  {
    title: "Server owns plan truth",
    description: "This UI reads the existing entitlement resolver and does not decide paid access."
  },
  {
    title: "Free shop setup stays available",
    description: "Basic shop profile, hours, chairs, first invite, More/settings, support, and compliance stay open."
  },
  {
    title: "Money stays server-owned",
    description: "This UI does not calculate owner money, payout readiness, booth rent, commission, or ledger truth."
  },
  {
    title: "Plan management is parked",
    description: "Paid plan actions are not launched from this PR."
  }
];

const FORBIDDEN_USER_COPY_PATTERN =
  /shop_owner_user|client_user|barber_user|guest_user|owner_user|shop_admin|entitlement_status|stripe_customer_id|stripe_subscription_id|account_entitlements|provider_payment_method_id|payment_intent|localStorage|webhook_unverified|server_default|payout_readiness_status|payment_routing_records|relationship_type|booth_rent_barber|commission_barber|freelance_barber/i;

function planLabel(tier: EntitlementTier): ShopOwnerPaywallSummary["currentPlanLabel"] {
  if (tier === "elite") return "Elite";
  if (tier === "pro") return "Pro";
  return "Free";
}

function billingLabel(snapshot: EntitlementSnapshot | null) {
  if (!snapshot || snapshot.billingInterval === "none") {
    return "No paid billing cycle connected";
  }

  return snapshot.billingInterval === "yearly" ? "Yearly billing verified" : "Monthly billing verified";
}

function accessLabel(state: EntitlementAccessState) {
  switch (state) {
    case "allowed":
      return "Server verified";
    case "needs_review":
      return "Needs Review";
    case "needs_upgrade":
      return "Plan proof required";
    case "forbidden_role":
      return "Wrong role";
    case "unauthenticated":
      return "Sign in required";
    case "unknown_entitlement":
      return "Not connected";
    case "stale_entitlement":
      return "Stale proof";
    case "stripe_mapping_missing":
      return "Plan mapping needed";
    case "webhook_unverified":
      return "Server proof needed";
    default:
      return "Locked";
  }
}

function safeReason(reason: string | null | undefined, fallback: string) {
  const value = reason?.trim();
  if (!value || FORBIDDEN_USER_COPY_PATTERN.test(value)) {
    return fallback;
  }

  return value;
}

function evidenceLabel(snapshot: EntitlementSnapshot | null) {
  switch (snapshot?.source) {
    case "stripe_webhook":
      return "Verified server billing event";
    case "account_entitlements":
      return "Server entitlement record";
    case "billing_subscription_legacy":
      return "Legacy billing record needs review";
    case "needs_review":
      return "Plan proof needs review";
    default:
      return "Free server fallback";
  }
}

function stateFromAccess(state: EntitlementAccessState | null | undefined): ShopOwnerPaywallFeatureState {
  switch (state) {
    case "needs_review":
    case "unknown_entitlement":
    case "stale_entitlement":
    case "stripe_mapping_missing":
    case "webhook_unverified":
      return "needs_review";
    case "forbidden_role":
      return "forbidden_role";
    case "unauthenticated":
      return "unauthenticated";
    default:
      return "locked";
  }
}

function buildFeatureView(input: {
  definition: ShopOwnerPaywallFeatureDefinition;
  user: Pick<UserAccount, "id" | "role"> | null | undefined;
  entitlement: ServerEntitlementTruth | null;
}): ShopOwnerPaywallFeatureView {
  const { definition } = input;
  const access = definition.featureKey
    ? checkEntitledFeatureAccess({
        user: input.user,
        featureKey: definition.featureKey,
        entitlement: input.entitlement
      })
    : null;
  const requiredPlanLabel = planLabel(definition.requiredTier);
  const fallbackReason = definition.requiredTier === "free"
    ? "Free shop setup remains available to the canonical owner account."
    : `This feature needs ${requiredPlanLabel} server entitlement proof before it can unlock.`;

  if (definition.requiredTier === "free" && access?.allowed) {
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      requiredPlanLabel,
      state: "available",
      stateLabel: "Available",
      reason: "Free shop essentials remain available.",
      evidenceSource: "Server entitlement registry"
    };
  }

  if (access?.allowed && definition.liveInOwnerV1) {
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      requiredPlanLabel,
      state: "available",
      stateLabel: "Available",
      reason: safeReason(access.reason, "Server entitlement proof supports this owner feature."),
      evidenceSource: "Server entitlement registry"
    };
  }

  if (access?.allowed && !definition.liveInOwnerV1) {
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      requiredPlanLabel,
      state: "coming_soon",
      stateLabel: "Coming soon",
      reason: `Included with ${requiredPlanLabel} when the shop owner feature is live.`,
      evidenceSource: "Server entitlement registry"
    };
  }

  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    requiredPlanLabel,
    state: stateFromAccess(access?.state),
    stateLabel: access ? accessLabel(access.state) : "Needs Review",
    reason: safeReason(access?.reason, fallbackReason),
    evidenceSource: "Server entitlement registry"
  };
}

export function buildShopOwnerPaywallSummary(input: {
  user: Pick<UserAccount, "id" | "role"> | null | undefined;
  entitlement: ServerEntitlementTruth | null;
}): ShopOwnerPaywallSummary {
  const snapshot = input.entitlement ? buildEntitlementSnapshot(input.entitlement) : null;
  const activeOwnerPaywall = input.user?.role === "shop_owner_user" && input.entitlement?.accountRole === "shop_owner_user";
  const grouped = {
    free: [] as ShopOwnerPaywallFeatureView[],
    pro: [] as ShopOwnerPaywallFeatureView[],
    elite: [] as ShopOwnerPaywallFeatureView[]
  };

  for (const definition of SHOP_OWNER_PLAN_FEATURES) {
    const view = buildFeatureView({
      definition,
      user: input.user,
      entitlement: input.entitlement
    });
    grouped[definition.requiredTier].push(view);
  }

  const allFeatures = [...grouped.free, ...grouped.pro, ...grouped.elite];
  const needsReviewCount = allFeatures.filter((feature) => feature.state === "needs_review").length;
  const lockedFeatureCount = allFeatures.filter((feature) => feature.state === "locked" || feature.state === "forbidden_role" || feature.state === "unauthenticated").length;
  const comingSoonCount = allFeatures.filter((feature) => feature.state === "coming_soon").length;
  const statusTone: ShopOwnerPaywallTone = needsReviewCount ? "yellow" : snapshot?.paidAccess ? "green" : "neutral";

  return {
    activeOwnerPaywall,
    currentPlanLabel: planLabel(snapshot?.tier ?? "free"),
    billingLabel: billingLabel(snapshot),
    statusLabel: needsReviewCount ? "Needs Review" : snapshot?.paidAccess ? "Paid access verified" : "Free access active",
    statusTone,
    serverEvidenceLabel: evidenceLabel(snapshot),
    freeShopSetupAvailable: true,
    lockedFeatureCount,
    needsReviewCount,
    comingSoonCount,
    upgradeActionLabel: "Plan management is being prepared",
    fallbackActionLabel: "Keep setting up your shop",
    upgradeHref: null,
    fallbackHref: "/dashboard/owner/more",
    checkoutUrl: null,
    portalUrl: null,
    guardrails: SHOP_OWNER_GUARDRAILS,
    features: grouped
  };
}

export async function resolveShopOwnerPaywallSummaryForUser(input: {
  user: Pick<UserAccount, "id" | "role"> | null | undefined;
}) {
  const entitlement = await resolveServerEntitlementForUser({ user: input.user });
  return buildShopOwnerPaywallSummary({
    user: input.user,
    entitlement
  });
}
