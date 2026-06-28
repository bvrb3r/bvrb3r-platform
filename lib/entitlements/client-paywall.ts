import type { Route } from "next";
import type { EntitlementAccessState, EntitlementSnapshot, EntitlementTier, ServerEntitlementTruth } from "@/lib/entitlements/domain";
import { buildEntitlementSnapshot } from "@/lib/entitlements/server";
import { checkEntitledFeatureAccess, resolveServerEntitlementForUser } from "@/lib/entitlements/server";
import type { EntitledFeatureKey } from "@/lib/entitlements/features";
import type { UserAccount } from "@/types/domain";

export type ClientPaywallFeatureState = "available" | "locked" | "needs_review" | "coming_soon";

export type ClientPaywallTone = "green" | "yellow" | "neutral";

export type ClientPaywallFeatureView = {
  id: string;
  title: string;
  description: string;
  requiredPlanLabel: "Free" | "Pro" | "Elite";
  state: ClientPaywallFeatureState;
  stateLabel: string;
  reason: string;
  evidenceSource: string;
};

export type ClientPaywallSummary = {
  currentPlanLabel: "Free" | "Pro" | "Elite";
  billingLabel: string;
  statusLabel: string;
  statusTone: ClientPaywallTone;
  serverEvidenceLabel: string;
  freeBookingAvailable: true;
  lockedFeatureCount: number;
  needsReviewCount: number;
  upgradeActionLabel: string;
  upgradeHref: Route;
  checkoutUrl: null;
  portalUrl: null;
  features: {
    free: ClientPaywallFeatureView[];
    pro: ClientPaywallFeatureView[];
    elite: ClientPaywallFeatureView[];
  };
};

type ClientPaywallFeatureDefinition = {
  id: string;
  title: string;
  description: string;
  requiredTier: EntitlementTier;
  featureKey: EntitledFeatureKey | null;
  liveInClientV1: boolean;
};

const CLIENT_PLAN_FEATURES: ClientPaywallFeatureDefinition[] = [
  {
    id: "client-basic-booking",
    title: "Basic booking, search, and discovery",
    description: "Search barbers, view shops, book eligible services, and manage activity.",
    requiredTier: "free",
    featureKey: "client.booking.basic",
    liveInClientV1: true
  },
  {
    id: "client-account-safety",
    title: "Account, wallet, and support access",
    description: "Manage account basics, booking activity, payment methods, and support.",
    requiredTier: "free",
    featureKey: "client.booking.basic",
    liveInClientV1: true
  },
  {
    id: "client-priority-rebooking",
    title: "Priority rebooking preferences",
    description: "Reserved for faster rebooking preferences after server-verified Pro access.",
    requiredTier: "pro",
    featureKey: "client.loyalty.pro",
    liveInClientV1: false
  },
  {
    id: "client-saved-power-tools",
    title: "Saved and favorite power tools",
    description: "Reserved for advanced saved barber, shop, style, and return-client tooling.",
    requiredTier: "pro",
    featureKey: "client.loyalty.pro",
    liveInClientV1: false
  },
  {
    id: "client-creator-eligibility",
    title: "Client creator eligibility tools",
    description: "Reserved for client creator readiness, loyalty requirements, and Culture unlocks.",
    requiredTier: "pro",
    featureKey: "client.loyalty.pro",
    liveInClientV1: false
  },
  {
    id: "client-premium-filters",
    title: "Premium discovery filters",
    description: "Reserved for deeper discovery filters after server-verified Elite access.",
    requiredTier: "elite",
    featureKey: "client.priority.elite",
    liveInClientV1: false
  },
  {
    id: "client-culture-growth",
    title: "Culture creator growth tools",
    description: "Reserved for advanced client creator insights, reach, and Culture growth.",
    requiredTier: "elite",
    featureKey: "client.priority.elite",
    liveInClientV1: false
  },
  {
    id: "client-loyalty-referral-boosts",
    title: "Loyalty and referral boosts",
    description: "Reserved for advanced loyalty, referral, and early-access client rewards.",
    requiredTier: "elite",
    featureKey: "client.priority.elite",
    liveInClientV1: false
  }
];

function planLabel(tier: EntitlementTier): ClientPaywallSummary["currentPlanLabel"] {
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
      return "Needs review";
    case "needs_upgrade":
      return "Upgrade required";
    case "forbidden_role":
      return "Wrong role";
    case "unauthenticated":
      return "Sign in required";
    case "unknown_entitlement":
      return "Not connected";
    case "stale_entitlement":
      return "Stale proof";
    case "stripe_mapping_missing":
      return "Price mapping needed";
    case "webhook_unverified":
      return "Webhook proof needed";
    default:
      return "Locked";
  }
}

function buildFeatureView(input: {
  definition: ClientPaywallFeatureDefinition;
  user: Pick<UserAccount, "id" | "role"> | null | undefined;
  entitlement: ServerEntitlementTruth | null;
}): ClientPaywallFeatureView {
  const { definition } = input;
  const access = definition.featureKey
    ? checkEntitledFeatureAccess({
        user: input.user,
        featureKey: definition.featureKey,
        entitlement: input.entitlement
      })
    : null;

  if (definition.requiredTier === "free" && access?.allowed) {
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      requiredPlanLabel: "Free",
      state: "available",
      stateLabel: "Available",
      reason: "Free client essentials remain available.",
      evidenceSource: "Server entitlement registry"
    };
  }

  if (access?.allowed && definition.liveInClientV1) {
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      requiredPlanLabel: planLabel(definition.requiredTier),
      state: "available",
      stateLabel: "Available",
      reason: access.reason,
      evidenceSource: "Server entitlement registry"
    };
  }

  if (access?.allowed && !definition.liveInClientV1) {
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      requiredPlanLabel: planLabel(definition.requiredTier),
      state: "coming_soon",
      stateLabel: "Included when live",
      reason: "Server entitlement is valid, but this client feature is not live in V1.",
      evidenceSource: "Server entitlement registry"
    };
  }

  if (access?.state === "needs_review") {
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      requiredPlanLabel: planLabel(definition.requiredTier),
      state: "needs_review",
      stateLabel: "Needs review",
      reason: access.reason,
      evidenceSource: "Server entitlement registry"
    };
  }

  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    requiredPlanLabel: planLabel(definition.requiredTier),
    state: "locked",
    stateLabel: access ? accessLabel(access.state) : "Locked",
    reason: access?.reason ?? "Server entitlement proof is required before this can unlock.",
    evidenceSource: "Server entitlement registry"
  };
}

export function buildClientPaywallSummary(input: {
  user: Pick<UserAccount, "id" | "role"> | null | undefined;
  entitlement: ServerEntitlementTruth | null;
}): ClientPaywallSummary {
  const snapshot = input.entitlement ? buildEntitlementSnapshot(input.entitlement) : null;
  const grouped = {
    free: [] as ClientPaywallFeatureView[],
    pro: [] as ClientPaywallFeatureView[],
    elite: [] as ClientPaywallFeatureView[]
  };

  for (const definition of CLIENT_PLAN_FEATURES) {
    const view = buildFeatureView({
      definition,
      user: input.user,
      entitlement: input.entitlement
    });
    grouped[definition.requiredTier].push(view);
  }

  const allFeatures = [...grouped.free, ...grouped.pro, ...grouped.elite];
  const needsReviewCount = allFeatures.filter((feature) => feature.state === "needs_review").length;
  const lockedFeatureCount = allFeatures.filter((feature) => feature.state === "locked").length;
  const statusTone: ClientPaywallTone = needsReviewCount ? "yellow" : snapshot?.paidAccess ? "green" : "neutral";

  return {
    currentPlanLabel: planLabel(snapshot?.tier ?? "free"),
    billingLabel: billingLabel(snapshot),
    statusLabel: needsReviewCount ? "Needs review" : snapshot?.paidAccess ? "Paid access verified" : "Free access active",
    statusTone,
    serverEvidenceLabel: snapshot?.source === "stripe_webhook"
      ? "Stripe webhook verified"
      : snapshot?.source === "account_entitlements"
        ? "Server entitlement record"
        : snapshot?.source === "billing_subscription_legacy"
          ? "Legacy billing record needs review"
          : "Server default",
    freeBookingAvailable: true,
    lockedFeatureCount,
    needsReviewCount,
    upgradeActionLabel: "Review plan access",
    upgradeHref: "/dashboard/client/more?section=wallet",
    checkoutUrl: null,
    portalUrl: null,
    features: grouped
  };
}

export async function resolveClientPaywallSummaryForUser(input: {
  user: Pick<UserAccount, "id" | "role"> | null | undefined;
}) {
  const entitlement = await resolveServerEntitlementForUser({ user: input.user });
  return buildClientPaywallSummary({
    user: input.user,
    entitlement
  });
}
