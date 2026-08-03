import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import {
  buildBillingBalanceSnapshot,
  buildBillingPlanView,
  checkBillingRiskAction,
  type BillingBalanceLineRow,
  type BillingHistoryEventView,
  type BillingInvoiceView,
  type BillingRiskAction,
  type BillingWorkspaceSnapshot
} from "@/lib/billing/pr34-domain";
import {
  isCanonicalPaidInterval,
  isEntitlementBillingInterval,
  isEntitlementTier,
  isPaidEntitlementTier,
  rankEntitlementTier,
  roleToEntitlementRole,
  type EntitlementBillingInterval,
  type ServerEntitlementTruth
} from "@/lib/entitlements/domain";
import { getEntitlementPriceCatalog, resolveEntitlementPrice } from "@/lib/entitlements/price-map";
import { resolveServerEntitlementForUser } from "@/lib/entitlements/server";
import {
  applyPr34Upgrade,
  createPr34BalancePaymentIntent,
  createPr34BillingCustomer,
  createPr34BillingPortal,
  createPr34SubscriptionCheckout,
  getStripeBillingPublishableKey,
  listPr34Invoices,
  restorePr34Subscription,
  retrievePr34BalancePaymentIntent,
  retrievePr34Subscription,
  schedulePr34Downgrade,
  schedulePr34StandardAtPeriodEnd
} from "@/lib/stripe/pr34-billing";
import { StripeConnectError } from "@/lib/stripe/connect";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type BillingEventRow = {
  id: string;
  event_type: string;
  label: string;
  line_id: string | null;
  provider_reference: string | null;
  created_at: string;
};

type BillingCustomerRow = {
  provider_customer_id: string;
};

type BillingPaymentAttemptRow = {
  id: string;
  profile_id: string;
  provider_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  line_ids: string[];
  line_snapshot_hash: string;
  status: string;
  idempotency_key: string;
};

const BALANCE_LINE_SELECT = [
  "id",
  "source_type",
  "source_reference",
  "description",
  "provider",
  "provider_reference",
  "amount_cents",
  "amount_paid_cents",
  "currency",
  "status",
  "collection_paused",
  "due_at",
  "disputed_at",
  "paid_at",
  "created_at",
  "updated_at"
].join(", ");

const EVENT_SELECT = "id, event_type, label, line_id, provider_reference, created_at";

export class Pr34BillingServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "billing_request_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isSchemaUnavailableError(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = `${candidate?.message ?? ""}`.toLowerCase();
  return candidate?.code === "42P01"
    || candidate?.code === "PGRST205"
    || candidate?.code === "PGRST204"
    || message.includes("billing_balance_lines")
    || message.includes("billing_balance_events")
    || message.includes("billing_payment_attempts")
    || message.includes("schema cache")
    || message.includes("does not exist");
}

function toBillingError(error: unknown, fallback: string) {
  if (error instanceof Pr34BillingServiceError) return error;
  if (error instanceof StripeConnectError) {
    return new Pr34BillingServiceError(error.message, error.status, error.code ?? "stripe_billing_failed");
  }
  return new Pr34BillingServiceError(fallback, 500, "billing_provider_failed");
}

function isoFromUnix(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function mapInvoice(invoice: Stripe.Invoice): BillingInvoiceView {
  return {
    id: invoice.id,
    stripeReference: invoice.id,
    number: invoice.number,
    status: invoice.status ?? "unknown",
    amountDueCents: invoice.amount_due,
    amountPaidCents: invoice.amount_paid,
    currency: invoice.currency,
    createdAt: isoFromUnix(invoice.created) ?? new Date(0).toISOString(),
    dueAt: isoFromUnix(invoice.due_date),
    paidAt: isoFromUnix(invoice.status_transitions?.paid_at),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdfUrl: invoice.invoice_pdf ?? null,
    lines: invoice.lines.data.map((line) => ({
      id: line.id,
      description: line.description?.trim() || "Stripe Billing line",
      amountCents: line.amount,
      currency: line.currency,
      quantity: line.quantity,
      priceReference: line.price?.id ?? null
    }))
  };
}

function mapHistory(rows: BillingEventRow[]): BillingHistoryEventView[] {
  return rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    label: row.label,
    lineId: row.line_id,
    stripeReference: row.provider_reference,
    createdAt: row.created_at
  }));
}

function configuredPriceKeys() {
  return new Set(getEntitlementPriceCatalog().map((entry) => (
    `${entry.accountRole}:${entry.tier}:${entry.billingInterval}`
  )));
}

function requireCanonicalUser(user: Pick<UserAccount, "id" | "role">) {
  const accountRole = roleToEntitlementRole(user.role);
  if (!accountRole) {
    throw new Pr34BillingServiceError(
      "Billing is available only for Client, Barber, and Shop Owner accounts.",
      403,
      "billing_role_forbidden"
    );
  }
  return accountRole;
}

async function readBalanceRows(supabase: SupabaseAdmin | null, user: Pick<UserAccount, "id">) {
  if (!supabase) return null;
  const result = await supabase
    .from("billing_balance_lines")
    .select(BALANCE_LINE_SELECT)
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  if (result.error) {
    if (isSchemaUnavailableError(result.error)) return null;
    throw new Pr34BillingServiceError("Unable to verify the account balance.", 500, "balance_read_failed");
  }
  return (result.data ?? []) as unknown as BillingBalanceLineRow[];
}

async function readHistoryRows(supabase: SupabaseAdmin | null, user: Pick<UserAccount, "id">) {
  if (!supabase) return [];
  const result = await supabase
    .from("billing_balance_events")
    .select(EVENT_SELECT)
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (result.error) {
    if (isSchemaUnavailableError(result.error)) return [];
    throw new Pr34BillingServiceError("Unable to load immutable billing history.", 500, "billing_history_failed");
  }
  return (result.data ?? []) as unknown as BillingEventRow[];
}

async function resolveBillingCustomerId(input: {
  supabase: SupabaseAdmin | null;
  user: Pick<UserAccount, "id">;
  entitlement: ServerEntitlementTruth;
}) {
  if (input.entitlement.stripeCustomerId) return input.entitlement.stripeCustomerId;
  if (!input.supabase) return null;
  const result = await input.supabase
    .from("billing_customers")
    .select("provider_customer_id")
    .eq("profile_id", input.user.id)
    .eq("provider", "stripe")
    .maybeSingle();
  if (result.error) {
    if (isSchemaUnavailableError(result.error)) return null;
    throw new Pr34BillingServiceError(
      "Unable to verify the Stripe billing customer.",
      500,
      "billing_customer_read_failed"
    );
  }
  return (result.data as BillingCustomerRow | null)?.provider_customer_id ?? null;
}

async function ensureBillingCustomer(input: {
  supabase: SupabaseAdmin;
  user: Pick<UserAccount, "id" | "email" | "name">;
  entitlement: ServerEntitlementTruth;
}) {
  const existing = await resolveBillingCustomerId(input);
  if (existing) return existing;

  const customer = await createPr34BillingCustomer({
    email: input.user.email,
    name: input.user.name,
    profileId: input.user.id,
    accountRole: input.entitlement.accountRole,
    idempotencyKey: `pr34-billing-customer:${input.user.id}`
  });
  const result = await input.supabase
    .from("billing_customers")
    .upsert({
      profile_id: input.user.id,
      provider: "stripe",
      provider_customer_id: customer.id
    }, { onConflict: "profile_id,provider" });
  if (result.error) {
    throw new Pr34BillingServiceError("Unable to connect the Stripe billing customer.", 500, "billing_customer_persist_failed");
  }
  return customer.id;
}

async function readBillingContext(input: {
  user: Pick<UserAccount, "id" | "role" | "email" | "name">;
  supabaseOverride?: SupabaseAdmin | null;
}) {
  requireCanonicalUser(input.user);
  const supabase = input.supabaseOverride === undefined ? createSupabaseAdminClient() : input.supabaseOverride;
  const [entitlement, balanceRows, historyRows] = await Promise.all([
    resolveServerEntitlementForUser({ user: input.user, supabaseOverride: supabase }),
    readBalanceRows(supabase, input.user),
    readHistoryRows(supabase, input.user)
  ]);
  if (!entitlement) {
    throw new Pr34BillingServiceError("Server entitlement truth is unavailable for this account.", 403, "entitlement_unavailable");
  }
  const balance = buildBillingBalanceSnapshot(balanceRows);
  return { supabase, entitlement, balance, historyRows };
}

export async function readPr34BillingWorkspace(input: {
  user: Pick<UserAccount, "id" | "role" | "email" | "name">;
  supabaseOverride?: SupabaseAdmin | null;
  includeStripeInvoices?: boolean;
}): Promise<BillingWorkspaceSnapshot> {
  const context = await readBillingContext(input);
  const plan = buildBillingPlanView({
    entitlement: context.entitlement,
    balance: context.balance,
    configuredPriceKeys: configuredPriceKeys()
  });
  let invoices: BillingInvoiceView[] = [];
  let providerState: BillingWorkspaceSnapshot["providerState"] = plan.tier === "standard" ? "not_required" : "needs_review";
  let providerReason: string | null = plan.tier === "standard"
    ? "Standard is exactly $0 and does not create a Stripe subscription."
    : "Stripe Billing proof is not connected.";
  const customerId = await resolveBillingCustomerId({
    supabase: context.supabase,
    user: input.user,
    entitlement: context.entitlement
  });

  if (customerId) {
    providerState = "connected";
    providerReason = null;
    if (input.includeStripeInvoices !== false) {
      try {
        const result = await listPr34Invoices(customerId);
        invoices = result.data.map(mapInvoice);
      } catch {
        providerState = "needs_review";
        providerReason = "Stripe invoice history could not be verified right now.";
      }
    }
  }

  const paidTier = isPaidEntitlementTier(plan.tier);
  const canceled = plan.status === "canceled" || plan.status === "paused" || Boolean(plan.cancelAt);
  const cancelGuard = checkBillingRiskAction(context.balance, "cancel");

  return {
    available: Boolean(context.supabase) && context.balance.state !== "needs_review",
    unavailableReason: !context.supabase
      ? "Supabase billing persistence is not configured. Risk actions remain closed."
      : context.balance.state === "needs_review"
        ? context.balance.reason
        : null,
    plan,
    balance: context.balance,
    invoices,
    history: mapHistory(context.historyRows),
    providerState,
    providerReason,
    manageCardEnabled: Boolean(customerId),
    cancelEnabled: paidTier && !canceled && cancelGuard.allowed && Boolean(plan.stripeSubscriptionConnected),
    cancelReason: !paidTier
      ? "Standard has no paid subscription to cancel."
      : canceled
        ? "This subscription is already set to end at the paid period boundary."
        : !cancelGuard.allowed
          ? cancelGuard.reason
          : !plan.stripeSubscriptionConnected
            ? "A verified Stripe subscription is required before cancel can be scheduled."
            : null,
    supportHref: "mailto:support@bvrb3r.app",
    giftedCuts: {
      state: "v3_honest_gate",
      label: "Gifted Cuts · V3",
      reason: "Gifted Cuts is visible as a future V3 door. No pool, charge, redemption, or payout is created in this release."
    }
  };
}

export async function assertPr34BillingRiskAction(input: {
  user: Pick<UserAccount, "id" | "role">;
  action: BillingRiskAction;
  supabaseOverride?: SupabaseAdmin | null;
}) {
  requireCanonicalUser(input.user);
  const supabase = input.supabaseOverride === undefined ? createSupabaseAdminClient() : input.supabaseOverride;
  const [entitlement, balanceRows] = await Promise.all([
    resolveServerEntitlementForUser({ user: input.user, supabaseOverride: supabase }),
    readBalanceRows(supabase, input.user)
  ]);
  if (!entitlement) {
    throw new Pr34BillingServiceError("Server entitlement truth is unavailable for this account.", 403, "entitlement_unavailable");
  }
  const access = checkBillingRiskAction(buildBillingBalanceSnapshot(balanceRows), input.action);
  if (!access.allowed) {
    throw new Pr34BillingServiceError(access.reason, 423, "account_balance_locked");
  }
  return access;
}

function requireIdempotencyKey(value: string | null | undefined) {
  const key = value?.trim();
  if (!key || key.length < 16 || key.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(key)) {
    throw new Pr34BillingServiceError("A valid Idempotency-Key is required.", 400, "idempotency_key_required");
  }
  return key;
}

async function recordEvent(input: {
  supabase: SupabaseAdmin;
  profileId: string;
  accountRole: ServerEntitlementTruth["accountRole"];
  eventType: string;
  label: string;
  providerReference?: string | null;
  lineId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const result = await input.supabase.from("billing_balance_events").upsert({
    profile_id: input.profileId,
    account_role: input.accountRole,
    event_type: input.eventType,
    label: input.label,
    provider: input.providerReference ? "stripe" : null,
    provider_reference: input.providerReference ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    line_id: input.lineId ?? null,
    actor_profile_id: input.profileId,
    metadata: input.metadata ?? {}
  }, {
    onConflict: "profile_id,event_type,idempotency_key",
    ignoreDuplicates: true
  });
  if (result.error) {
    throw new Pr34BillingServiceError("Unable to write immutable billing history.", 500, "billing_history_write_failed");
  }
}

export async function changePr34Plan(input: {
  user: Pick<UserAccount, "id" | "role" | "email" | "name">;
  targetTier: unknown;
  billingInterval: unknown;
  idempotencyKey: string | null | undefined;
  supabaseOverride?: SupabaseAdmin | null;
}) {
  if (!isEntitlementTier(input.targetTier)) {
    throw new Pr34BillingServiceError("Choose Standard, Pro, or Elite.", 400, "invalid_target_tier");
  }
  const targetTier = input.targetTier;
  const targetInterval: EntitlementBillingInterval = targetTier === "standard"
    ? "none"
    : isEntitlementBillingInterval(input.billingInterval) && isCanonicalPaidInterval(input.billingInterval)
      ? input.billingInterval
      : "monthly";
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const context = await readBillingContext(input);
  if (!context.supabase) {
    throw new Pr34BillingServiceError("Billing persistence is not configured.", 503, "billing_persistence_missing");
  }
  const guard = checkBillingRiskAction(
    context.balance,
    rankEntitlementTier(targetTier) > rankEntitlementTier(context.entitlement.tier) ? "upgrade" : "downgrade"
  );
  if (!guard.allowed) {
    throw new Pr34BillingServiceError(guard.reason, 423, "account_balance_locked");
  }
  if (targetTier === context.entitlement.tier) {
    throw new Pr34BillingServiceError("That is already the current plan.", 409, "plan_already_current");
  }

  const requestId = randomUUID();
  await recordEvent({
    supabase: context.supabase,
    profileId: input.user.id,
    accountRole: context.entitlement.accountRole,
    eventType: "plan_change_requested",
    label: `${targetTier === "standard" ? "Standard" : targetTier === "pro" ? "Pro" : "Elite"} plan change requested`,
    idempotencyKey: `plan-request:${idempotencyKey}`,
    metadata: { requestId, targetTier, targetInterval }
  });

  try {
    if (targetTier === "standard") {
      if (!context.entitlement.stripeSubscriptionId || !isPaidEntitlementTier(context.entitlement.tier)) {
        throw new Pr34BillingServiceError("Standard is already the $0 account tier.", 409, "standard_already_active");
      }
      const subscription = await schedulePr34StandardAtPeriodEnd(
        context.entitlement.stripeSubscriptionId,
        `pr34-standard:${input.user.id}:${idempotencyKey}`
      );
      await recordEvent({
        supabase: context.supabase,
        profileId: input.user.id,
        accountRole: context.entitlement.accountRole,
        eventType: "downgrade_scheduled",
        label: "Move to Standard scheduled for the paid period end",
        providerReference: subscription.id,
        idempotencyKey: `plan-result:${idempotencyKey}`,
        metadata: { requestId, targetTier }
      });
      return { outcome: "scheduled" as const, timing: "period_end" as const, redirectUrl: null, providerReference: subscription.id };
    }

    const paidInterval: Exclude<EntitlementBillingInterval, "none"> = targetInterval === "yearly"
      ? "yearly"
      : "monthly";

    const price = getEntitlementPriceCatalog().find((entry) => (
      entry.accountRole === context.entitlement.accountRole
      && entry.tier === targetTier
      && entry.billingInterval === paidInterval
    ));
    if (!price) {
      throw new Pr34BillingServiceError("The Stripe price for this plan is not configured.", 503, "stripe_price_missing");
    }

    if (context.entitlement.tier === "standard") {
      const customerId = await ensureBillingCustomer({ supabase: context.supabase, user: input.user, entitlement: context.entitlement });
      const checkout = await createPr34SubscriptionCheckout({
        customerId,
        priceId: price.priceId,
        profileId: input.user.id,
        accountRole: context.entitlement.accountRole,
        tier: targetTier,
        billingInterval: paidInterval,
        idempotencyKey: `pr34-checkout:${input.user.id}:${idempotencyKey}`
      });
      await recordEvent({
        supabase: context.supabase,
        profileId: input.user.id,
        accountRole: context.entitlement.accountRole,
        eventType: "subscription_checkout_created",
        label: `${targetTier === "pro" ? "Pro" : "Elite"} Stripe checkout created`,
        providerReference: checkout.id,
        idempotencyKey: `plan-result:${idempotencyKey}`,
        metadata: { requestId, targetTier, targetInterval: paidInterval }
      });
      return { outcome: "checkout" as const, timing: "now" as const, redirectUrl: checkout.url, providerReference: checkout.id };
    }

    if (!context.entitlement.stripeSubscriptionId) {
      throw new Pr34BillingServiceError("A verified Stripe subscription is required to change this paid plan.", 409, "stripe_subscription_missing");
    }
    const subscription = await retrievePr34Subscription(context.entitlement.stripeSubscriptionId);
    if (rankEntitlementTier(targetTier) > rankEntitlementTier(context.entitlement.tier)) {
      const updated = await applyPr34Upgrade({
        subscription,
        priceId: price.priceId,
        profileId: input.user.id,
        accountRole: context.entitlement.accountRole,
        tier: targetTier,
        billingInterval: paidInterval,
        idempotencyKey: `pr34-upgrade:${input.user.id}:${idempotencyKey}`
      });
      await recordEvent({
        supabase: context.supabase,
        profileId: input.user.id,
        accountRole: context.entitlement.accountRole,
        eventType: "upgrade_submitted",
        label: `${targetTier === "pro" ? "Pro" : "Elite"} upgrade submitted to Stripe`,
        providerReference: updated.id,
        idempotencyKey: `plan-result:${idempotencyKey}`,
        metadata: { requestId, targetTier, targetInterval: paidInterval }
      });
      return { outcome: "submitted" as const, timing: "now" as const, redirectUrl: null, providerReference: updated.id };
    }

    const schedule = await schedulePr34Downgrade({
      subscription,
      priceId: price.priceId,
      profileId: input.user.id,
      accountRole: context.entitlement.accountRole,
      tier: targetTier,
      billingInterval: paidInterval,
      idempotencyKey: `pr34-downgrade:${input.user.id}:${idempotencyKey}`
    });
    await recordEvent({
      supabase: context.supabase,
      profileId: input.user.id,
      accountRole: context.entitlement.accountRole,
      eventType: "downgrade_scheduled",
      label: `${targetTier === "pro" ? "Pro" : "Elite"} downgrade scheduled for the paid period end`,
      providerReference: schedule.id,
      idempotencyKey: `plan-result:${idempotencyKey}`,
      metadata: { requestId, targetTier, targetInterval: paidInterval }
    });
    return { outcome: "scheduled" as const, timing: "period_end" as const, redirectUrl: null, providerReference: schedule.id };
  } catch (error) {
    throw toBillingError(error, "Unable to change the Stripe Billing plan.");
  }
}

export async function cancelPr34Subscription(input: {
  user: Pick<UserAccount, "id" | "role" | "email" | "name">;
  idempotencyKey: string | null | undefined;
  supabaseOverride?: SupabaseAdmin | null;
}) {
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const context = await readBillingContext(input);
  if (!context.supabase) throw new Pr34BillingServiceError("Billing persistence is not configured.", 503);
  const guard = checkBillingRiskAction(context.balance, "cancel");
  if (!guard.allowed) throw new Pr34BillingServiceError(guard.reason, 423, "account_balance_locked");
  if (!isPaidEntitlementTier(context.entitlement.tier) || !context.entitlement.stripeSubscriptionId) {
    throw new Pr34BillingServiceError("There is no verified paid subscription to cancel.", 409, "subscription_missing");
  }

  try {
    const subscription = await schedulePr34StandardAtPeriodEnd(
      context.entitlement.stripeSubscriptionId,
      `pr34-cancel:${input.user.id}:${idempotencyKey}`
    );
    await recordEvent({
      supabase: context.supabase,
      profileId: input.user.id,
      accountRole: context.entitlement.accountRole,
      eventType: "cancel_scheduled",
      label: "Subscription cancellation scheduled for the paid period end",
      providerReference: subscription.id,
      idempotencyKey: `cancel-result:${idempotencyKey}`
    });
    return { scheduled: true, currentPeriodEnd: isoFromUnix(subscription.current_period_end), providerReference: subscription.id };
  } catch (error) {
    throw toBillingError(error, "Unable to schedule subscription cancellation.");
  }
}

export async function restorePr34CanceledSubscription(input: {
  user: Pick<UserAccount, "id" | "role" | "email" | "name">;
  idempotencyKey: string | null | undefined;
  supabaseOverride?: SupabaseAdmin | null;
}) {
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const context = await readBillingContext(input);
  if (!context.supabase) throw new Pr34BillingServiceError("Billing persistence is not configured.", 503);
  const guard = checkBillingRiskAction(context.balance, "upgrade");
  if (!guard.allowed) throw new Pr34BillingServiceError(guard.reason, 423, "account_balance_locked");
  if (!isPaidEntitlementTier(context.entitlement.tier) || !context.entitlement.stripeSubscriptionId) {
    throw new Pr34BillingServiceError("There is no paid subscription to restore.", 409, "subscription_missing");
  }

  try {
    const subscription = await restorePr34Subscription(
      context.entitlement.stripeSubscriptionId,
      `pr34-restore:${input.user.id}:${idempotencyKey}`
    );
    await recordEvent({
      supabase: context.supabase,
      profileId: input.user.id,
      accountRole: context.entitlement.accountRole,
      eventType: "subscription_restored",
      label: "Subscription restored before the paid period ended",
      providerReference: subscription.id,
      idempotencyKey: `restore-result:${idempotencyKey}`
    });
    return { restored: true, providerReference: subscription.id };
  } catch (error) {
    throw toBillingError(error, "Unable to restore the subscription.");
  }
}

export async function createPr34PortalSession(input: {
  user: Pick<UserAccount, "id" | "role" | "email" | "name">;
  supabaseOverride?: SupabaseAdmin | null;
}) {
  const context = await readBillingContext(input);
  if (!context.supabase) throw new Pr34BillingServiceError("Billing persistence is not configured.", 503);
  const customerId = await resolveBillingCustomerId({ supabase: context.supabase, user: input.user, entitlement: context.entitlement });
  if (!customerId) {
    throw new Pr34BillingServiceError("A Stripe billing profile is required before cards can be managed.", 409, "billing_customer_missing");
  }
  try {
    const portal = await createPr34BillingPortal({ customerId });
    return { url: portal.url };
  } catch (error) {
    throw toBillingError(error, "Unable to open Stripe Billing management.");
  }
}

function balanceSnapshotHash(lines: Array<{ id: string; outstandingCents: number }>) {
  return createHash("sha256")
    .update(lines.map((line) => `${line.id}:${line.outstandingCents}`).sort().join("|"))
    .digest("hex");
}

export async function createPr34BalancePayment(input: {
  user: Pick<UserAccount, "id" | "role" | "email" | "name">;
  idempotencyKey: string | null | undefined;
  supabaseOverride?: SupabaseAdmin | null;
}) {
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const context = await readBillingContext(input);
  if (!context.supabase) throw new Pr34BillingServiceError("Billing persistence is not configured.", 503);
  if (context.balance.state !== "locked" || !context.balance.totalOwedCents) {
    throw new Pr34BillingServiceError("There is no owed balance to pay.", 409, "balance_already_clear");
  }
  if (context.balance.disputedCents) {
    throw new Pr34BillingServiceError(
      "A disputed line is paused from collection. Support must resolve it before Pay in full can clear the account.",
      409,
      "disputed_balance_pending"
    );
  }
  if (context.balance.collectibleCents !== context.balance.totalOwedCents) {
    throw new Pr34BillingServiceError("The full owed balance is not collectible. Contact support.", 409, "balance_not_collectible");
  }

  const existing = await context.supabase
    .from("billing_payment_attempts")
    .select("id, profile_id, provider_payment_intent_id, amount_cents, currency, line_ids, line_snapshot_hash, status, idempotency_key")
    .eq("profile_id", input.user.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing.error && !isSchemaUnavailableError(existing.error)) {
    throw new Pr34BillingServiceError("Unable to verify the payment request.", 500, "payment_attempt_read_failed");
  }
  if (existing.data) {
    const attempt = existing.data as unknown as BillingPaymentAttemptRow;
    const payableLines = context.balance.lines.filter((line) => (
      line.outstandingCents > 0 && line.status === "open" && !line.collectionPaused
    ));
    const currentSnapshotHash = balanceSnapshotHash(payableLines);
    const currentLineIds = payableLines.map((line) => line.id).sort();
    const attemptLineIds = [...attempt.line_ids].sort();
    const sameReservation = attempt.amount_cents === context.balance.totalOwedCents
      && attempt.currency === "usd"
      && attempt.line_snapshot_hash === currentSnapshotHash
      && currentLineIds.length === attemptLineIds.length
      && currentLineIds.every((lineId, index) => lineId === attemptLineIds[index]);
    if (!sameReservation) {
      throw new Pr34BillingServiceError(
        "That Idempotency-Key belongs to an older balance snapshot. Start a new pay-in-full request.",
        409,
        "payment_idempotency_conflict"
      );
    }
    if (attempt.status === "initializing" || !attempt.provider_payment_intent_id) {
      throw new Pr34BillingServiceError("The existing payment request is still initializing.", 409, "payment_attempt_initializing");
    }
    if (attempt.status === "failed" || attempt.status === "canceled") {
      throw new Pr34BillingServiceError(
        "That payment request has ended. Start a new pay-in-full request with a new Idempotency-Key.",
        409,
        "payment_attempt_terminal"
      );
    }
    const intent = await retrievePr34BalancePaymentIntent(attempt.provider_payment_intent_id);
    if (!pr34BalanceIntentMatches(intent, attempt, input.user.id)) {
      throw new Pr34BillingServiceError(
        "Stripe payment evidence does not match the current balance reservation.",
        409,
        "payment_evidence_mismatch"
      );
    }
    if (intent.status === "canceled" || !intent.client_secret) {
      throw new Pr34BillingServiceError(
        "That Stripe payment request can no longer be completed. Start a new pay-in-full request.",
        409,
        "payment_intent_terminal"
      );
    }
    return {
      attemptId: attempt.id,
      clientSecret: intent.client_secret,
      publishableKey: getStripeBillingPublishableKey(),
      amountCents: attempt.amount_cents,
      currency: attempt.currency
    };
  }

  const payableLines = context.balance.lines.filter((line) => line.outstandingCents > 0 && line.status === "open" && !line.collectionPaused);
  const attemptId = randomUUID();
  const snapshotHash = balanceSnapshotHash(payableLines);
  const lineIds = payableLines.map((line) => line.id);
  const insert = await context.supabase.from("billing_payment_attempts").insert({
    id: attemptId,
    profile_id: input.user.id,
    account_role: context.entitlement.accountRole,
    provider: "stripe",
    amount_cents: context.balance.totalOwedCents,
    currency: "usd",
    line_ids: lineIds,
    line_snapshot_hash: snapshotHash,
    status: "initializing",
    idempotency_key: idempotencyKey
  });
  if (insert.error) {
    if ((insert.error as { code?: string }).code === "23505") {
      throw new Pr34BillingServiceError(
        "Another pay-in-full request is already active. Finish or retry that Stripe payment before starting another.",
        409,
        "payment_attempt_active"
      );
    }
    throw new Pr34BillingServiceError("Unable to reserve the balance payment request.", 500, "payment_attempt_create_failed");
  }

  try {
    const reservedRows = await readBalanceRows(context.supabase, input.user);
    const reservedBalance = buildBillingBalanceSnapshot(reservedRows);
    const reservedLines = reservedBalance.lines.filter((line) => (
      line.outstandingCents > 0 && line.status === "open" && !line.collectionPaused
    ));
    const reservationStillExact = reservedBalance.state === "locked"
      && reservedBalance.disputedCents === 0
      && reservedBalance.totalOwedCents === context.balance.totalOwedCents
      && reservedBalance.collectibleCents === reservedBalance.totalOwedCents
      && balanceSnapshotHash(reservedLines) === snapshotHash;
    if (!reservationStillExact) {
      throw new Pr34BillingServiceError(
        "The balance changed while payment was being reserved. Review the current lines and try again.",
        409,
        "balance_reservation_changed"
      );
    }

    const customerId = await resolveBillingCustomerId({ supabase: context.supabase, user: input.user, entitlement: context.entitlement });
    const intent = await createPr34BalancePaymentIntent({
      customerId,
      profileId: input.user.id,
      attemptId,
      amountCents: context.balance.totalOwedCents,
      currency: "usd",
      lineCount: lineIds.length,
      snapshotHash,
      idempotencyKey: `pr34-balance:${input.user.id}:${idempotencyKey}`
    });
    const update = await context.supabase.from("billing_payment_attempts").update({
      provider_payment_intent_id: intent.id,
      status: intent.status === "succeeded" ? "processing" : "requires_payment",
      updated_at: new Date().toISOString()
    }).eq("id", attemptId).eq("profile_id", input.user.id).eq("status", "initializing").select("id").maybeSingle();
    if (update.error || !update.data) {
      throw new Pr34BillingServiceError("Unable to bind the Stripe payment request.", 500, "payment_attempt_bind_failed");
    }
    await recordEvent({
      supabase: context.supabase,
      profileId: input.user.id,
      accountRole: context.entitlement.accountRole,
      eventType: "balance_payment_created",
      label: "Pay-in-full Stripe payment created",
      providerReference: intent.id,
      idempotencyKey: `balance-created:${attemptId}`,
      metadata: { attemptId, amountCents: context.balance.totalOwedCents, lineCount: lineIds.length }
    });
    return {
      attemptId,
      clientSecret: intent.client_secret,
      publishableKey: getStripeBillingPublishableKey(),
      amountCents: context.balance.totalOwedCents,
      currency: "usd"
    };
  } catch (error) {
    await context.supabase.from("billing_payment_attempts").update({
      status: "failed",
      updated_at: new Date().toISOString()
    }).eq("id", attemptId).eq("profile_id", input.user.id);
    throw toBillingError(error, "Unable to start the Stripe balance payment.");
  }
}

function equalSafeText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function pr34BalanceIntentMatches(
  intent: Stripe.PaymentIntent,
  attempt: BillingPaymentAttemptRow,
  profileId: string
) {
  return equalSafeText(intent.metadata?.purpose ?? "", "pr34_balance_payment")
    && equalSafeText(intent.metadata?.profileId ?? "", profileId)
    && equalSafeText(intent.metadata?.attemptId ?? "", attempt.id)
    && equalSafeText(intent.metadata?.snapshotHash ?? "", attempt.line_snapshot_hash)
    && intent.amount === attempt.amount_cents
    && intent.currency === attempt.currency;
}

export async function confirmPr34BalancePayment(input: {
  user: Pick<UserAccount, "id" | "role" | "email" | "name">;
  attemptId: unknown;
  supabaseOverride?: SupabaseAdmin | null;
}) {
  if (typeof input.attemptId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.attemptId)) {
    throw new Pr34BillingServiceError("A valid balance payment attempt is required.", 400, "invalid_attempt_id");
  }
  const context = await readBillingContext(input);
  if (!context.supabase) throw new Pr34BillingServiceError("Billing persistence is not configured.", 503);
  const result = await context.supabase
    .from("billing_payment_attempts")
    .select("id, profile_id, provider_payment_intent_id, amount_cents, currency, line_ids, line_snapshot_hash, status, idempotency_key")
    .eq("id", input.attemptId)
    .eq("profile_id", input.user.id)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new Pr34BillingServiceError("The balance payment request was not found.", 404, "payment_attempt_not_found");
  }
  const attempt = result.data as unknown as BillingPaymentAttemptRow;
  if (attempt.status === "succeeded") {
    return { cleared: true, attemptId: attempt.id };
  }
  if (attempt.status === "failed" || attempt.status === "canceled") {
    throw new Pr34BillingServiceError(
      "That balance payment request has ended and cannot unlock the account.",
      409,
      "payment_attempt_terminal"
    );
  }
  if (!attempt.provider_payment_intent_id) {
    throw new Pr34BillingServiceError("The Stripe payment request is incomplete.", 409, "payment_intent_missing");
  }

  const intent = await retrievePr34BalancePaymentIntent(attempt.provider_payment_intent_id);
  if (!pr34BalanceIntentMatches(intent, attempt, input.user.id)) {
    throw new Pr34BillingServiceError("Stripe payment evidence does not match the reserved balance.", 409, "payment_evidence_mismatch");
  }
  if (intent.status !== "succeeded") {
    throw new Pr34BillingServiceError("Stripe has not confirmed the full balance payment.", 409, "payment_not_succeeded");
  }

  const finalize = await context.supabase.rpc("pr34_finalize_balance_payment", {
    p_attempt_id: attempt.id,
    p_payment_intent_id: intent.id
  });
  if (finalize.error) {
    throw new Pr34BillingServiceError(
      "Payment cleared at Stripe but account unlock needs support review.",
      503,
      "payment_settlement_needs_review"
    );
  }
  const refreshedRows = await readBalanceRows(context.supabase, input.user);
  const balance = buildBillingBalanceSnapshot(refreshedRows);
  if (balance.state !== "clear") {
    throw new Pr34BillingServiceError("Payment was recorded but another owed line still locks the account.", 409, "balance_still_owed");
  }
  return { cleared: true, attemptId: attempt.id };
}

export function resolvePr34ConfiguredPrice(input: {
  priceId: string | null | undefined;
}) {
  return resolveEntitlementPrice(input.priceId);
}
