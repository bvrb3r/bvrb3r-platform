import {
  isCanonicalPaidInterval,
  isPaidEntitlementActive,
  isPaidEntitlementTier,
  roleToEntitlementRole,
  type EntitlementAccountRole,
  type EntitlementStatus,
  type EntitlementTier,
  type ServerEntitlementTruth
} from "@/lib/entitlements/domain";
import { resolveServerEntitlementForUser } from "@/lib/entitlements/server";
import type { UserAccount } from "@/types/domain";

export type SubscriptionSettingsRole = "client" | "barber" | "shop_owner";
export type SubscriptionSettingsTone = "green" | "yellow" | "red" | "neutral";
export type SubscriptionSettingsActionState = "available" | "unavailable";

export type SubscriptionSettingsAction = {
  label: string;
  href: string | null;
  state: SubscriptionSettingsActionState;
  unavailableReason: string | null;
};

export type SubscriptionSettingsSummary = {
  role: SubscriptionSettingsRole;
  roleLabel: "Client" | "Barber" | "Shop Owner";
  currentTierLabel: "Free" | "Pro" | "Elite";
  accessStateLabel: "Active" | "Needs Review" | "Past Due" | "Canceled" | "Unavailable";
  accessTone: SubscriptionSettingsTone;
  billingLabel: string;
  evidenceLabel: string;
  roleCopy: string;
  includedCopy: string;
  lockedCopy: string;
  supportCopy: string;
  updatedAtLabel: string;
  reviewReasons: string[];
  upgradeAction: SubscriptionSettingsAction;
  manageAction: SubscriptionSettingsAction;
  refreshEndpoint: "/api/subscription/settings";
};

const FORBIDDEN_USER_COPY_PATTERN =
  /client_user|barber_user|shop_owner_user|account_entitlements|stripe_customer_id|stripe_subscription_id|payment_intent|provider_payment_method_id|webhook_unverified|localStorage|server_default/i;

function roleLabel(role: EntitlementAccountRole): SubscriptionSettingsSummary["roleLabel"] {
  if (role === "barber_user") return "Barber";
  if (role === "shop_owner_user") return "Shop Owner";
  return "Client";
}

function roleScope(role: EntitlementAccountRole): SubscriptionSettingsRole {
  if (role === "barber_user") return "barber";
  if (role === "shop_owner_user") return "shop_owner";
  return "client";
}

function tierLabel(tier: EntitlementTier): SubscriptionSettingsSummary["currentTierLabel"] {
  if (tier === "elite") return "Elite";
  if (tier === "pro") return "Pro";
  return "Free";
}

function roleCopy(role: EntitlementAccountRole) {
  switch (role) {
    case "barber_user":
      return "Free keeps basic profile and booking setup. Pro and Elite unlock business, retention, and growth tools where configured.";
    case "shop_owner_user":
      return "Free keeps shop setup basics. Pro and Elite unlock team, money, kiosk, reports, and scale tools where configured.";
    default:
      return "Free helps clients book and manage basics. Pro and Elite unlock advanced client benefits where configured.";
  }
}

function includedCopy(role: EntitlementAccountRole, tier: EntitlementTier) {
  if (tier === "free") {
    switch (role) {
      case "barber_user":
        return "Basic barber profile, booking setup, schedule visibility, and account settings stay available.";
      case "shop_owner_user":
        return "Shop profile setup, hours, first invite, support, and core settings stay available.";
      default:
        return "Booking, search, activity, account basics, and payment method management stay available.";
    }
  }

  if (tier === "pro") {
    switch (role) {
      case "barber_user":
        return "Configured Pro barber tools can unlock only when server entitlement proof is active.";
      case "shop_owner_user":
        return "Configured Pro shop tools can unlock only when server entitlement proof is active.";
      default:
        return "Configured Pro client tools can unlock only when server entitlement proof is active.";
    }
  }

  switch (role) {
    case "barber_user":
      return "Configured Elite barber tools can unlock only when server entitlement proof is active.";
    case "shop_owner_user":
      return "Configured Elite shop tools can unlock only when server entitlement proof is active.";
    default:
      return "Configured Elite client tools can unlock only when server entitlement proof is active.";
  }
}

function lockedCopy(role: EntitlementAccountRole) {
  switch (role) {
    case "barber_user":
      return "Paid barber tools stay locked until Stripe, webhook, and server entitlement truth agree.";
    case "shop_owner_user":
      return "Paid owner tools stay locked until Stripe, webhook, and server entitlement truth agree.";
    default:
      return "Paid client tools stay locked until Stripe, webhook, and server entitlement truth agree.";
  }
}

function evidenceLabel(entitlement: ServerEntitlementTruth) {
  switch (entitlement.source) {
    case "stripe_webhook":
      return "Verified billing event";
    case "account_entitlements":
      return "Server plan record";
    case "billing_subscription_legacy":
      return "Legacy plan proof needs review";
    case "needs_review":
      return "Plan proof needs review";
    default:
      return "Free access fallback";
  }
}

function billingLabel(entitlement: ServerEntitlementTruth) {
  if (!entitlement.stripeCustomerId || entitlement.billingInterval === "none") {
    return "No billing profile required for Free.";
  }

  if (entitlement.billingInterval === "yearly") {
    return "Yearly billing proof is connected.";
  }

  if (entitlement.billingInterval === "monthly") {
    return "Monthly billing proof is connected.";
  }

  return "Billing proof needs review.";
}

function normalizeReviewReason(reason: string) {
  if (!reason.trim() || FORBIDDEN_USER_COPY_PATTERN.test(reason)) {
    return "Server plan proof needs review before paid access can unlock.";
  }

  return reason.trim();
}

function statusLabel(status: EntitlementStatus, hasPaidProof: boolean, entitlement: ServerEntitlementTruth): Pick<SubscriptionSettingsSummary, "accessStateLabel" | "accessTone"> {
  if (!entitlement.verification.persistenceConnected) {
    return { accessStateLabel: "Needs Review", accessTone: "yellow" };
  }

  if (status === "past_due" || status === "unpaid" || status === "incomplete" || status === "incomplete_expired") {
    return { accessStateLabel: "Past Due", accessTone: "red" };
  }

  if (status === "canceled" || status === "paused") {
    return { accessStateLabel: "Canceled", accessTone: "yellow" };
  }

  if (status === "needs_review") {
    return { accessStateLabel: "Needs Review", accessTone: "yellow" };
  }

  if (isPaidEntitlementTier(entitlement.tier) && !hasPaidProof) {
    return { accessStateLabel: "Needs Review", accessTone: "yellow" };
  }

  if (status === "free" || hasPaidProof) {
    return { accessStateLabel: "Active", accessTone: "green" };
  }

  return { accessStateLabel: "Unavailable", accessTone: "neutral" };
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "No recent plan refresh recorded.";
  }

  return `Last refreshed ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value))}.`;
}

export function buildSubscriptionSettingsSummary(input: {
  user: Pick<UserAccount, "id" | "role"> | null | undefined;
  entitlement: ServerEntitlementTruth | null;
}): SubscriptionSettingsSummary | null {
  const accountRole = roleToEntitlementRole(input.user?.role);
  if (!accountRole || !input.entitlement || input.entitlement.accountRole !== accountRole) {
    return null;
  }

  const hasPaidProof = isPaidEntitlementTier(input.entitlement.tier)
    && isPaidEntitlementActive(input.entitlement.status)
    && isCanonicalPaidInterval(input.entitlement.billingInterval)
    && input.entitlement.source !== "server_default"
    && input.entitlement.verification.persistenceConnected
    && input.entitlement.verification.stripePriceMapped
    && input.entitlement.verification.webhookVerified;
  const access = statusLabel(input.entitlement.status, hasPaidProof, input.entitlement);
  const reviewReasons = input.entitlement.verification.reasons.map(normalizeReviewReason);
  const managementUnavailableReason = "Plan management is being prepared.";

  return {
    role: roleScope(accountRole),
    roleLabel: roleLabel(accountRole),
    currentTierLabel: tierLabel(input.entitlement.tier),
    accessStateLabel: access.accessStateLabel,
    accessTone: access.accessTone,
    billingLabel: billingLabel(input.entitlement),
    evidenceLabel: evidenceLabel(input.entitlement),
    roleCopy: roleCopy(accountRole),
    includedCopy: includedCopy(accountRole, input.entitlement.tier),
    lockedCopy: lockedCopy(accountRole),
    supportCopy: "Refresh reads server entitlement truth. The UI cannot manually grant paid access.",
    updatedAtLabel: formatUpdatedAt(input.entitlement.updatedAt),
    reviewReasons,
    upgradeAction: {
      label: input.entitlement.tier === "free" ? "Upgrade plan" : "Review plan options",
      href: null,
      state: "unavailable",
      unavailableReason: managementUnavailableReason
    },
    manageAction: {
      label: "Manage plan",
      href: null,
      state: "unavailable",
      unavailableReason: managementUnavailableReason
    },
    refreshEndpoint: "/api/subscription/settings"
  };
}

export async function resolveSubscriptionSettingsSummaryForUser(input: {
  user: Pick<UserAccount, "id" | "role"> | null | undefined;
}) {
  const entitlement = await resolveServerEntitlementForUser({ user: input.user });
  return buildSubscriptionSettingsSummary({
    user: input.user,
    entitlement
  });
}
