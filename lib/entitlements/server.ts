import {
  buildFreeEntitlementTruth,
  isCanonicalPaidInterval,
  isEntitlementAccountRole,
  isEntitlementBillingInterval,
  isEntitlementStatus,
  isEntitlementTier,
  isPaidEntitlementActive,
  isPaidEntitlementTier,
  rankEntitlementTier,
  roleToEntitlementRole,
  type EntitlementAccessState,
  type EntitlementSnapshot,
  type ServerEntitlementTruth
} from "@/lib/entitlements/domain";
import { getEntitledFeature, type EntitledFeatureKey } from "@/lib/entitlements/features";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type AccountEntitlementRow = {
  profile_id: string | null;
  account_role: string | null;
  tier: string | null;
  billing_interval: string | null;
  entitlement_status: string | null;
  source_of_truth: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  trial_end: string | null;
  updated_at: string | null;
  last_verified_at: string | null;
};

const ACCOUNT_ENTITLEMENT_SELECT = [
  "profile_id",
  "account_role",
  "tier",
  "billing_interval",
  "entitlement_status",
  "source_of_truth",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_price_id",
  "current_period_start",
  "current_period_end",
  "cancel_at",
  "trial_end",
  "updated_at",
  "last_verified_at"
].join(", ");

function isSchemaUnavailableError(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = `${candidate?.message ?? ""}`.toLowerCase();
  return candidate?.code === "42P01"
    || candidate?.code === "PGRST205"
    || candidate?.code === "PGRST204"
    || message.includes("account_entitlements")
    || message.includes("does not exist")
    || message.includes("schema cache");
}

function mapRowToEntitlementTruth(row: AccountEntitlementRow, fallbackRole: ServerEntitlementTruth["accountRole"]): ServerEntitlementTruth {
  const accountRole = isEntitlementAccountRole(row.account_role) ? row.account_role : fallbackRole;
  const tier = isEntitlementTier(row.tier) ? row.tier : "free";
  const billingInterval = isEntitlementBillingInterval(row.billing_interval) ? row.billing_interval : "none";
  const status = isEntitlementStatus(row.entitlement_status) ? row.entitlement_status : "needs_review";
  const reasons: string[] = [];
  if (!isEntitlementTier(row.tier)) {
    reasons.push("Stored entitlement tier is missing or noncanonical.");
  }
  if (!isEntitlementBillingInterval(row.billing_interval)) {
    reasons.push("Stored entitlement billing interval is missing or noncanonical.");
  }
  if (isPaidEntitlementTier(tier) && !row.stripe_price_id) {
    reasons.push("Paid tier does not have server Stripe price evidence.");
  }

  return {
    profileId: row.profile_id,
    accountRole,
    tier,
    billingInterval,
    status,
    source: row.source_of_truth === "stripe_webhook" ? "stripe_webhook" : "account_entitlements",
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAt: row.cancel_at,
    trialEnd: row.trial_end,
    updatedAt: row.last_verified_at ?? row.updated_at,
    verification: {
      persistenceConnected: true,
      stripePriceMapped: Boolean(row.stripe_price_id) || tier === "free",
      webhookVerified: row.source_of_truth === "stripe_webhook",
      reasons
    }
  };
}

export function buildEntitlementSnapshot(entitlement: ServerEntitlementTruth): EntitlementSnapshot {
  const paidAccess = isPaidEntitlementTier(entitlement.tier)
    && isPaidEntitlementActive(entitlement.status)
    && isCanonicalPaidInterval(entitlement.billingInterval)
    && entitlement.source !== "server_default"
    && entitlement.verification.stripePriceMapped
    && entitlement.verification.persistenceConnected;
  const accessState: EntitlementAccessState = paidAccess || entitlement.tier === "free"
    ? "allowed"
    : entitlement.verification.reasons.length
      ? "needs_review"
      : "needs_upgrade";

  return {
    profileId: entitlement.profileId,
    accountRole: entitlement.accountRole,
    tier: entitlement.tier,
    billingInterval: entitlement.billingInterval,
    status: entitlement.status,
    source: entitlement.source,
    currentPeriodEnd: entitlement.currentPeriodEnd,
    updatedAt: entitlement.updatedAt,
    accessState,
    paidAccess,
    reasons: entitlement.verification.reasons
  };
}

export async function resolveServerEntitlementForUser(input: {
  user: Pick<UserAccount, "id" | "role"> | null | undefined;
  supabaseOverride?: SupabaseClient | null;
}): Promise<ServerEntitlementTruth | null> {
  if (!input.user) {
    return null;
  }

  const accountRole = roleToEntitlementRole(input.user.role);
  if (!accountRole) {
    return null;
  }

  const supabase = input.supabaseOverride ?? createSupabaseAdminClient();
  if (!supabase) {
    return buildFreeEntitlementTruth({
      profileId: input.user.id,
      accountRole,
      persistenceConnected: false,
      reason: "Supabase entitlement persistence is not connected; paid access remains locked."
    });
  }

  const result = await supabase
    .from("account_entitlements")
    .select(ACCOUNT_ENTITLEMENT_SELECT)
    .eq("profile_id", input.user.id)
    .eq("account_role", accountRole)
    .maybeSingle();

  if (result.error) {
    if (isSchemaUnavailableError(result.error)) {
      return buildFreeEntitlementTruth({
        profileId: input.user.id,
        accountRole,
        persistenceConnected: false,
        reason: "account_entitlements is not available; paid access remains locked."
      });
    }
    throw new Error("Unable to resolve server entitlement truth.");
  }

  if (!result.data) {
    return buildFreeEntitlementTruth({
      profileId: input.user.id,
      accountRole
    });
  }

  return mapRowToEntitlementTruth(result.data as unknown as AccountEntitlementRow, accountRole);
}

export function checkEntitledFeatureAccess(input: {
  user: Pick<UserAccount, "id" | "role"> | null | undefined;
  featureKey: EntitledFeatureKey;
  entitlement: ServerEntitlementTruth | null;
}) {
  const feature = getEntitledFeature(input.featureKey);
  if (!feature) {
    return {
      allowed: false,
      state: "unknown_entitlement" as const,
      requiredTier: "free" as const,
      currentTier: "free" as const,
      reason: "Feature is not registered in the server entitlement registry."
    };
  }

  if (!input.user) {
    return {
      allowed: false,
      state: "unauthenticated" as const,
      requiredTier: feature.requiredTier,
      currentTier: input.entitlement?.tier ?? "free",
      reason: "A signed-in account is required."
    };
  }

  const accountRole = roleToEntitlementRole(input.user.role);
  if (!accountRole || accountRole !== feature.accountRole || input.entitlement?.accountRole !== feature.accountRole) {
    return {
      allowed: false,
      state: "forbidden_role" as const,
      requiredTier: feature.requiredTier,
      currentTier: input.entitlement?.tier ?? "free",
      reason: "The signed-in role does not own this feature."
    };
  }

  if (!input.entitlement) {
    return {
      allowed: false,
      state: "needs_review" as const,
      requiredTier: feature.requiredTier,
      currentTier: "free" as const,
      reason: "Server entitlement proof is missing."
    };
  }

  if (feature.requiredTier === "free") {
    return {
      allowed: true,
      state: "allowed" as const,
      requiredTier: feature.requiredTier,
      currentTier: input.entitlement.tier,
      reason: "Free feature is available to the canonical account role."
    };
  }

  const paidAccess = isPaidEntitlementTier(input.entitlement.tier)
    && rankEntitlementTier(input.entitlement.tier) >= rankEntitlementTier(feature.requiredTier)
    && isPaidEntitlementActive(input.entitlement.status)
    && isCanonicalPaidInterval(input.entitlement.billingInterval)
    && input.entitlement.source !== "server_default"
    && input.entitlement.verification.persistenceConnected
    && input.entitlement.verification.stripePriceMapped
    && input.entitlement.verification.webhookVerified;

  if (paidAccess) {
    return {
      allowed: true,
      state: "allowed" as const,
      requiredTier: feature.requiredTier,
      currentTier: input.entitlement.tier,
      reason: "Server entitlement proof supports this paid feature."
    };
  }

  const state: EntitlementAccessState = !input.entitlement.verification.persistenceConnected
    ? "needs_review"
    : input.entitlement.source !== "server_default" && input.entitlement.verification.reasons.length
      ? "needs_review"
      : "needs_upgrade";

  return {
    allowed: false,
    state,
    requiredTier: feature.requiredTier,
    currentTier: input.entitlement.tier,
    reason: input.entitlement.verification.reasons[0] ?? "Paid feature requires server-verified Pro or Elite entitlement."
  };
}
