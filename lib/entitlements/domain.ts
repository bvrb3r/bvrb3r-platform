import type { Role } from "@/types/domain";

export const ENTITLEMENT_ACCOUNT_ROLES = ["client_user", "barber_user", "shop_owner_user"] as const;
export type EntitlementAccountRole = (typeof ENTITLEMENT_ACCOUNT_ROLES)[number];

export const ENTITLEMENT_TIERS = ["free", "pro", "elite"] as const;
export type EntitlementTier = (typeof ENTITLEMENT_TIERS)[number];

export const ENTITLEMENT_BILLING_INTERVALS = ["none", "monthly", "yearly"] as const;
export type EntitlementBillingInterval = (typeof ENTITLEMENT_BILLING_INTERVALS)[number];

export const ENTITLEMENT_STATUSES = [
  "free",
  "trialing",
  "active",
  "past_due",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "canceled",
  "paused",
  "needs_review"
] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export type EntitlementSource =
  | "server_default"
  | "stripe_webhook"
  | "account_entitlements"
  | "billing_subscription_legacy"
  | "needs_review";

export type EntitlementAccessState =
  | "allowed"
  | "denied"
  | "needs_upgrade"
  | "needs_review"
  | "forbidden_role"
  | "unauthenticated"
  | "unknown_entitlement"
  | "stale_entitlement"
  | "stripe_mapping_missing"
  | "webhook_unverified";

export type ServerEntitlementTruth = {
  profileId: string | null;
  accountRole: EntitlementAccountRole;
  tier: EntitlementTier;
  billingInterval: EntitlementBillingInterval;
  status: EntitlementStatus;
  source: EntitlementSource;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  trialEnd: string | null;
  updatedAt: string | null;
  verification: {
    persistenceConnected: boolean;
    stripePriceMapped: boolean;
    webhookVerified: boolean;
    reasons: string[];
  };
};

export type EntitlementSnapshot = Pick<
  ServerEntitlementTruth,
  | "profileId"
  | "accountRole"
  | "tier"
  | "billingInterval"
  | "status"
  | "source"
  | "currentPeriodEnd"
  | "updatedAt"
> & {
  accessState: EntitlementAccessState;
  paidAccess: boolean;
  reasons: string[];
};

export function isEntitlementAccountRole(value: unknown): value is EntitlementAccountRole {
  return typeof value === "string" && ENTITLEMENT_ACCOUNT_ROLES.includes(value as EntitlementAccountRole);
}

export function isEntitlementTier(value: unknown): value is EntitlementTier {
  return typeof value === "string" && ENTITLEMENT_TIERS.includes(value as EntitlementTier);
}

export function isEntitlementBillingInterval(value: unknown): value is EntitlementBillingInterval {
  return typeof value === "string" && ENTITLEMENT_BILLING_INTERVALS.includes(value as EntitlementBillingInterval);
}

export function isEntitlementStatus(value: unknown): value is EntitlementStatus {
  return typeof value === "string" && ENTITLEMENT_STATUSES.includes(value as EntitlementStatus);
}

export function isPaidEntitlementTier(tier: EntitlementTier) {
  return tier === "pro" || tier === "elite";
}

export function isPaidEntitlementActive(status: EntitlementStatus) {
  return status === "active" || status === "trialing";
}

export function isCanonicalPaidInterval(interval: EntitlementBillingInterval) {
  return interval === "monthly" || interval === "yearly";
}

export function roleToEntitlementRole(role: Role | string | null | undefined): EntitlementAccountRole | null {
  return isEntitlementAccountRole(role) ? role : null;
}

export function rankEntitlementTier(tier: EntitlementTier) {
  if (tier === "elite") return 2;
  if (tier === "pro") return 1;
  return 0;
}

export function mapStripeSubscriptionStatusToEntitlement(status: string | null | undefined): EntitlementStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "unpaid":
      return "unpaid";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "paused":
      return "paused";
    default:
      return "needs_review";
  }
}

export function buildFreeEntitlementTruth(input: {
  profileId?: string | null;
  accountRole: EntitlementAccountRole;
  persistenceConnected?: boolean;
  reason?: string;
}): ServerEntitlementTruth {
  return {
    profileId: input.profileId ?? null,
    accountRole: input.accountRole,
    tier: "free",
    billingInterval: "none",
    status: "free",
    source: "server_default",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAt: null,
    trialEnd: null,
    updatedAt: null,
    verification: {
      persistenceConnected: input.persistenceConnected ?? true,
      stripePriceMapped: false,
      webhookVerified: false,
      reasons: [input.reason ?? "No server-paid entitlement exists; defaulting to Free."]
    }
  };
}
