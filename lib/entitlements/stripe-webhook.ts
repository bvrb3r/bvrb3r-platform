import Stripe from "stripe";
import {
  isEntitlementAccountRole,
  mapStripeSubscriptionStatusToEntitlement,
  type EntitlementAccountRole,
  type EntitlementStatus
} from "@/lib/entitlements/domain";
import { resolveEntitlementPrice, type EntitlementPriceCatalogEntry } from "@/lib/entitlements/price-map";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type EnvLike = Record<string, string | undefined>;

export type StripeEntitlementWebhookUpdate = {
  handled: boolean;
  blocked: boolean;
  reason: string;
  profileId: string | null;
  accountRole: EntitlementAccountRole | null;
  price: EntitlementPriceCatalogEntry | null;
  status: EntitlementStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  trialEnd: string | null;
};

export type StripeEntitlementSyncResult = StripeEntitlementWebhookUpdate & {
  persisted: boolean;
  persistenceState: "synced" | "missing_table" | "blocked" | "ignored";
};

function stringFromMetadata(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function unixToIso(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function getSubscriptionCustomerId(subscription: Stripe.Subscription) {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id ?? null;
}

function hasCanonicalEntitlementMarkers(subscription: Stripe.Subscription, session?: Stripe.Checkout.Session | null) {
  return Boolean(
    stringFromMetadata(
      subscription.metadata?.accountRole,
      subscription.metadata?.entitlementRole,
      subscription.metadata?.entitlementTier,
      subscription.metadata?.entitlementSource,
      session?.metadata?.accountRole,
      session?.metadata?.entitlementRole,
      session?.metadata?.entitlementTier,
      session?.metadata?.entitlementSource
    )
  );
}

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

export function buildStripeEntitlementWebhookUpdate(input: {
  subscription: Stripe.Subscription;
  session?: Stripe.Checkout.Session | null;
  env?: EnvLike;
}): StripeEntitlementWebhookUpdate {
  const firstPrice = input.subscription.items.data[0]?.price ?? null;
  const price = resolveEntitlementPrice(firstPrice?.id ?? null, input.env);
  const metadataRole = stringFromMetadata(
    input.subscription.metadata?.accountRole,
    input.subscription.metadata?.entitlementRole,
    input.session?.metadata?.accountRole,
    input.session?.metadata?.entitlementRole
  );
  const metadataProfileId = stringFromMetadata(
    input.subscription.metadata?.profileId,
    input.subscription.metadata?.accountProfileId,
    input.subscription.metadata?.entitlementProfileId,
    input.session?.metadata?.profileId,
    input.session?.metadata?.accountProfileId,
    input.session?.metadata?.entitlementProfileId
  );
  const status = mapStripeSubscriptionStatusToEntitlement(input.subscription.status);
  const handled = Boolean(price) || hasCanonicalEntitlementMarkers(input.subscription, input.session);

  if (!handled) {
    return {
      handled: false,
      blocked: false,
      reason: "Stripe subscription is not marked as canonical BVRB3R entitlement.",
      profileId: null,
      accountRole: null,
      price: null,
      status,
      stripeCustomerId: getSubscriptionCustomerId(input.subscription),
      stripeSubscriptionId: input.subscription.id,
      stripePriceId: firstPrice?.id ?? null,
      currentPeriodStart: unixToIso(input.subscription.current_period_start),
      currentPeriodEnd: unixToIso(input.subscription.current_period_end),
      cancelAt: unixToIso(input.subscription.cancel_at),
      trialEnd: unixToIso(input.subscription.trial_end)
    };
  }

  if (!price) {
    return {
      handled: true,
      blocked: true,
      reason: "Stripe price is not mapped to a canonical Free/Pro/Elite entitlement.",
      profileId: metadataProfileId,
      accountRole: isEntitlementAccountRole(metadataRole) ? metadataRole : null,
      price: null,
      status,
      stripeCustomerId: getSubscriptionCustomerId(input.subscription),
      stripeSubscriptionId: input.subscription.id,
      stripePriceId: firstPrice?.id ?? null,
      currentPeriodStart: unixToIso(input.subscription.current_period_start),
      currentPeriodEnd: unixToIso(input.subscription.current_period_end),
      cancelAt: unixToIso(input.subscription.cancel_at),
      trialEnd: unixToIso(input.subscription.trial_end)
    };
  }

  if (!metadataProfileId) {
    return {
      handled: true,
      blocked: true,
      reason: "Canonical entitlement webhook is missing server profile id metadata.",
      profileId: null,
      accountRole: price.accountRole,
      price,
      status,
      stripeCustomerId: getSubscriptionCustomerId(input.subscription),
      stripeSubscriptionId: input.subscription.id,
      stripePriceId: firstPrice?.id ?? null,
      currentPeriodStart: unixToIso(input.subscription.current_period_start),
      currentPeriodEnd: unixToIso(input.subscription.current_period_end),
      cancelAt: unixToIso(input.subscription.cancel_at),
      trialEnd: unixToIso(input.subscription.trial_end)
    };
  }

  if (metadataRole && metadataRole !== price.accountRole) {
    return {
      handled: true,
      blocked: true,
      reason: "Stripe entitlement role metadata does not match the server price map.",
      profileId: metadataProfileId,
      accountRole: isEntitlementAccountRole(metadataRole) ? metadataRole : null,
      price,
      status,
      stripeCustomerId: getSubscriptionCustomerId(input.subscription),
      stripeSubscriptionId: input.subscription.id,
      stripePriceId: firstPrice?.id ?? null,
      currentPeriodStart: unixToIso(input.subscription.current_period_start),
      currentPeriodEnd: unixToIso(input.subscription.current_period_end),
      cancelAt: unixToIso(input.subscription.cancel_at),
      trialEnd: unixToIso(input.subscription.trial_end)
    };
  }

  return {
    handled: true,
    blocked: false,
    reason: "Stripe price and metadata support canonical entitlement sync.",
    profileId: metadataProfileId,
    accountRole: price.accountRole,
    price,
    status,
    stripeCustomerId: getSubscriptionCustomerId(input.subscription),
    stripeSubscriptionId: input.subscription.id,
    stripePriceId: firstPrice?.id ?? null,
    currentPeriodStart: unixToIso(input.subscription.current_period_start),
    currentPeriodEnd: unixToIso(input.subscription.current_period_end),
    cancelAt: unixToIso(input.subscription.cancel_at),
    trialEnd: unixToIso(input.subscription.trial_end)
  };
}

export async function syncServerEntitlementFromStripeSubscription(input: {
  supabase: SupabaseClient;
  subscription: Stripe.Subscription;
  session?: Stripe.Checkout.Session | null;
  eventId?: string | null;
  env?: EnvLike;
}): Promise<StripeEntitlementSyncResult> {
  const update = buildStripeEntitlementWebhookUpdate({
    subscription: input.subscription,
    session: input.session,
    env: input.env
  });

  if (!update.handled) {
    return {
      ...update,
      persisted: false,
      persistenceState: "ignored"
    };
  }

  if (update.blocked || !update.profileId || !update.accountRole || !update.price) {
    return {
      ...update,
      persisted: false,
      persistenceState: "blocked"
    };
  }

  const now = new Date().toISOString();
  const result = await input.supabase
    .from("account_entitlements")
    .upsert({
      profile_id: update.profileId,
      account_role: update.accountRole,
      tier: update.price.tier,
      billing_interval: update.price.billingInterval,
      entitlement_status: update.status,
      source_of_truth: "stripe_webhook",
      stripe_customer_id: update.stripeCustomerId,
      stripe_subscription_id: update.stripeSubscriptionId,
      stripe_price_id: update.stripePriceId,
      current_period_start: update.currentPeriodStart,
      current_period_end: update.currentPeriodEnd,
      cancel_at: update.cancelAt,
      trial_end: update.trialEnd,
      last_stripe_event_id: input.eventId ?? null,
      last_verified_at: now,
      updated_at: now
    }, { onConflict: "profile_id,account_role" });

  if (result.error) {
    if (isSchemaUnavailableError(result.error)) {
      return {
        ...update,
        persisted: false,
        persistenceState: "missing_table",
        reason: "account_entitlements persistence is not applied; entitlement remains Needs Review."
      };
    }

    throw new Error("Unable to persist server entitlement truth from Stripe webhook.");
  }

  return {
    ...update,
    persisted: true,
    persistenceState: "synced"
  };
}
