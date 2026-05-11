import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runtimeConfig } from "@/lib/config/runtime";
import { canonicalClientUuid } from "@/lib/booking/canonical-booking";
import {
  buildPlatformEventIdempotencyKey,
  recordRequiredPlatformEvent,
  type PlatformEventType
} from "@/lib/core/platform-events";
import {
  reconcilePaymentPayoutExecutions,
  syncPaymentRoutingRecord,
  syncStripeSettlementForPayment
} from "@/lib/fintech/service";
import { reversePointsForAppointment } from "@/lib/points/engine";
import { buildAppointmentLifecycleFields } from "@/lib/appointments/domain";
import {
  assertPaymentStatusTransition,
  formatPaymentMethodLabel,
  normalizePaymentMethodReference,
  resolveAppointmentPaymentIntent,
  resolveRefundOutcome,
  type InternalPaymentProvider,
  type InternalPaymentStatus,
  type InternalPaymentType,
  type PaymentMethodReferenceInput
} from "@/lib/payments/domain";
import { getStripeConnectClient, StripeConnectError } from "@/lib/stripe/connect";
import type {
  PayoutQueueStatus,
  PayoutVisibilityView
} from "@/types/fintech";
import type { AppointmentStatus, Role, UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone?: string | null;
  role: Role;
};

type ClientRow = {
  id: string;
  profile_id: string | null;
  reference_code?: string | null;
};

type BarberRow = {
  id: string;
  profile_id: string;
};

type AppointmentRow = {
  id: string;
  client_id: string;
  barber_id: string;
  shop_id: string | null;
  location_id: string;
  service_id: string | null;
  status: AppointmentStatus;
  deposit_amount: number | string;
  balance_due: number | string;
  grand_total: number | string;
  tip_amount: number | string;
  lifecycle_revision: number;
  completed_at: string | null;
  updated_at: string;
};

type PaymentMethodRow = {
  id: string;
  client_id: string;
  provider: InternalPaymentProvider;
  provider_customer_id: string | null;
  provider_payment_method_id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  nickname: string | null;
  is_default: boolean;
  created_at: string;
};

type LegacySavedPaymentMethodRow = {
  id: string;
  profile_id: string;
  billing_customer_id: string | null;
  provider: InternalPaymentProvider;
  provider_payment_method_id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  created_at: string;
};

type BillingCustomerRow = {
  id: string;
  provider_customer_id: string | null;
  default_payment_method_id: string | null;
};

type ClientPaymentContext = {
  clientId: string;
  clientReference: string | null;
  profileId: string | null;
  profileEmail?: string | null;
  profileName?: string | null;
  profilePhone?: string | null;
  preferencesRepaired: boolean;
};

export type ClientPaymentProfileRepairView = ClientPaymentContext & {
  profileName: string;
  profileEmail: string;
};

type PaymentRow = {
  id: string;
  appointment_id: string | null;
  client_id: string | null;
  shop_id: string | null;
  barber_id: string | null;
  payment_method_id: string | null;
  provider: InternalPaymentProvider | null;
  provider_payment_intent_id: string | null;
  amount: number | string;
  currency: string;
  payment_status: InternalPaymentStatus;
  payment_type: InternalPaymentType;
  paid_at: string | null;
  created_at: string;
};

type RefundRow = {
  id: string;
  payment_id: string;
  amount: number | string;
  reason: string | null;
  provider_refund_id: string | null;
  refunded_at: string;
};

type TipRow = {
  id: string;
  appointment_id: string;
  payment_id: string | null;
  client_id: string;
  barber_id: string;
  amount: number | string;
  created_at: string;
};

type PaymentRoutingSummaryRow = {
  id: string;
  payment_id: string;
  appointment_id: string | null;
  provider_net_amount: number | string;
  barber_payout_amount: number | string;
  shop_split_amount: number | string;
  payout_readiness_status: "not_ready" | "needs_attention" | "ready" | "blocked";
  money_routing_status: "pending" | "ready_for_payout" | "blocked" | "manual_review" | "paid_out" | "refunded";
  blocked_reason: string | null;
  reconciliation_status: "open" | "settled" | "partially_reversed" | "reversed" | "manual_review";
  updated_at: string;
};

type PayoutExecutionSummaryRow = {
  id: string;
  payment_id: string;
  appointment_id: string | null;
  amount: number | string;
  execution_status: "pending" | "blocked" | "executed" | "failed" | "reversed";
  failure_reason: string | null;
  blocked_reason: string | null;
  processor_transfer_id: string | null;
  reconciliation_status: "open" | "settled" | "partially_reversed" | "reversed" | "manual_review";
  executed_at: string | null;
  failed_at: string | null;
  reversed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentActorContext = {
  profile: ProfileRow;
  clientId?: string;
  clientReference?: string | null;
  clientPreferencesRepaired?: boolean;
  barberId?: string;
  locationIds: string[];
  role: UserAccount["role"];
};

export type AppointmentRetentionQualificationView = {
  appointmentId: string;
  appointmentStatus: AppointmentStatus;
  serviceCompleted: boolean;
  paymentSettled: boolean;
  refundState: "clean" | "refunded" | "chargeback";
  disputeHold: boolean;
  latestPaymentStatus: InternalPaymentStatus | null;
  reason: string | null;
};

type CapturedStripePaymentInput = {
  appointmentId: string | null;
  clientId: string;
  shopId: string | null;
  barberId: string | null;
  serviceId?: string | null;
  amount: number;
  paymentType: InternalPaymentType;
  paymentMethodId?: string | null;
  legacyType?: string;
  legacyStatus?: string;
  currency?: string;
  metadata?: Record<string, string | number | boolean | null>;
  idempotencyKey?: string;
  description?: string | null;
  createdAt?: string;
};

type CreatePaymentLedgerInput = {
  appointmentId?: string | null;
  clientId?: string | null;
  shopId?: string | null;
  barberId?: string | null;
  paymentMethodId?: string | null;
  provider: InternalPaymentProvider;
  providerPaymentIntentId?: string | null;
  amount: number;
  currency?: string;
  paymentStatus: InternalPaymentStatus;
  paymentType: InternalPaymentType;
  legacyType?: string;
  legacyStatus?: string;
  paidAt?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt?: string;
};

type CreateTipLedgerInput = {
  appointmentId: string;
  paymentId?: string | null;
  clientId: string;
  barberId: string;
  amount: number;
  createdAt?: string;
};

export type ClientPaymentMethodView = {
  id: string;
  provider: InternalPaymentProvider;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  nickname: string | null;
  isDefault: boolean;
  createdAt: string;
  label: string;
};

export type AppointmentPaymentSummaryView = {
  appointmentId: string;
  outstandingBalance: number;
  authorizedAmount: number;
  capturedAmount: number;
  refundedAmount: number;
  tipAmount: number;
  latestBookingPayment: {
    id: string;
    amount: number;
    currency: string;
    provider: InternalPaymentProvider | null;
    paymentStatus: InternalPaymentStatus;
    paymentType: InternalPaymentType;
    paidAt: string | null;
    createdAt: string;
  } | null;
  defaultPaymentMethod: ClientPaymentMethodView | null;
};

export type PaymentRecordView = {
  id: string;
  appointmentId: string | null;
  amount: number;
  currency: string;
  provider: InternalPaymentProvider | null;
  paymentStatus: InternalPaymentStatus;
  paymentType: InternalPaymentType;
  paidAt: string | null;
  createdAt: string;
};

export type PayoutQueueEntryView = {
  appointmentId: string | null;
  paymentId: string;
  routingRecordId: string;
  status: PayoutQueueStatus;
  eligibleAmount: number;
  thresholdAmount: number;
  thresholdRemaining: number;
  minimumThresholdMet: boolean;
  blockedReasons: string[];
  stripeReady: boolean;
  disputeHold: boolean;
  refundHold: boolean;
  nextAction: string;
  executionCount: number;
  lastUpdatedAt: string | null;
};

export class PaymentServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100;
}

const DEFAULT_PAYOUT_THRESHOLD = 25;

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

export function derivePayoutQueueStatus(input: {
  payoutReadinessStatus: PaymentRoutingSummaryRow["payout_readiness_status"] | null;
  moneyRoutingStatus: PaymentRoutingSummaryRow["money_routing_status"] | null;
  reconciliationStatus: PaymentRoutingSummaryRow["reconciliation_status"] | null;
  eligibleAmount: number;
  thresholdAmount?: number;
  executionStatuses: Array<PayoutExecutionSummaryRow["execution_status"]>;
  latestExecution?: Pick<
    PayoutExecutionSummaryRow,
    "execution_status" | "reconciliation_status" | "processor_transfer_id" | "failure_reason" | "blocked_reason"
  > | null;
  blockedReasons?: string[];
  refundHold?: boolean;
  disputeHold?: boolean;
}) {
  const thresholdAmount = input.thresholdAmount ?? DEFAULT_PAYOUT_THRESHOLD;
  const minimumThresholdMet = input.eligibleAmount >= thresholdAmount;
  const blockedReasons = uniqueStrings(input.blockedReasons ?? []);
  const stripeReady = input.payoutReadinessStatus === "ready";
  const refundHold = Boolean(input.refundHold || input.moneyRoutingStatus === "refunded");
  const disputeHold = Boolean(input.disputeHold);
  const latestExecution = input.latestExecution ?? null;
  const hasExecution = input.executionStatuses.length > 0;

  let status: PayoutQueueStatus = "not_ready";
  if (refundHold || input.reconciliationStatus === "reversed" || latestExecution?.execution_status === "reversed") {
    status = "reversed";
  } else if (latestExecution?.execution_status === "failed") {
    status = "failed";
  } else if (latestExecution?.execution_status === "executed") {
    status = latestExecution.reconciliation_status === "settled" || input.moneyRoutingStatus === "paid_out"
      ? "paid"
      : "in_transit";
  } else if (disputeHold) {
    status = "not_ready";
  } else if (hasExecution && input.executionStatuses.some((entry) => entry === "pending")) {
    status = "queued";
  } else if (stripeReady && minimumThresholdMet && input.moneyRoutingStatus === "ready_for_payout") {
    status = "pending";
  } else {
    status = "not_ready";
  }

  if (!minimumThresholdMet && !["paid", "failed", "reversed", "in_transit"].includes(status)) {
    status = "pending";
    blockedReasons.push(`Minimum payout threshold is ${thresholdAmount.toFixed(2)}.`);
  }

  if (!stripeReady && !["paid", "failed", "reversed", "in_transit"].includes(status)) {
    blockedReasons.push("Connected payout account is not ready.");
  }

  if (disputeHold) {
    blockedReasons.push("A dispute or chargeback hold is present.");
  }

  if (refundHold) {
    blockedReasons.push("The booking has been refunded and payout is reversed.");
  }

  const thresholdRemaining = minimumThresholdMet ? 0 : roundCurrency(Math.max(thresholdAmount - input.eligibleAmount, 0));
  const nextAction =
    status === "paid"
      ? "No action required."
      : status === "in_transit"
        ? "Payout is in transit."
        : status === "queued"
          ? "Payout transfer is queued for execution."
          : status === "pending"
            ? minimumThresholdMet && stripeReady
              ? "Eligible for the next payout run."
              : "Waiting for payout threshold or readiness."
            : status === "failed"
              ? "Retry failed payout execution after reviewing the failure."
              : status === "reversed"
                ? "Refund or reversal closed this payout."
                : "Resolve payout readiness blockers first.";

  return {
    status,
    minimumThresholdMet,
    thresholdAmount,
    thresholdRemaining,
    stripeReady,
    refundHold,
    disputeHold,
    blockedReasons: uniqueStrings(blockedReasons),
    nextAction
  };
}

function getSupabaseOrThrow() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new PaymentServiceError("Payments are only available when Supabase is configured.", 503);
  }
  return supabase;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_METHOD_SELECT = "id, client_id, provider, provider_customer_id, provider_payment_method_id, brand, last4, exp_month, exp_year, nickname, is_default, created_at";

function isBenignEmptyPaymentMethodsError(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}) {
  if (error.code === "PGRST116") {
    return true;
  }

  const combined = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return combined.includes("0 rows");
}

function logPaymentMethodsReadError(
  stage: "client_lookup" | "payment_methods_query",
  clientIdentifier: string,
  error: {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  },
  resolvedClientId?: string | null
) {
  console.error("[payments] saved payment methods read failed", {
    stage,
    clientIdentifier,
    resolvedClientId: resolvedClientId ?? null,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null
  });
}

function fallbackClientReferenceForUser(userId: string) {
  return `client-${userId.slice(0, 8)}`;
}

function isPaymentSchemaMissing(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}) {
  const combined = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return error.code === "42P01"
    || error.code === "42703"
    || error.code === "PGRST204"
    || combined.includes("does not exist")
    || combined.includes("schema cache");
}

function isPaymentPreferencePayloadSchemaMismatch(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}) {
  return isPaymentSchemaMissing(error)
    || error.code === "PGRST204"
    || `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase().includes("client_id");
}

async function readClientRowByIdOrReference(
  supabase: SupabaseClient,
  clientIdentifier: string
) {
  const normalizedIdentifier = clientIdentifier.trim();
  if (!normalizedIdentifier) {
    return null;
  }

  const query = UUID_PATTERN.test(normalizedIdentifier)
    ? supabase
      .from("clients")
      .select("id, reference_code, profile_id")
      .eq("id", normalizedIdentifier)
      .maybeSingle()
    : supabase
      .from("clients")
      .select("id, reference_code, profile_id")
      .eq("reference_code", normalizedIdentifier)
      .maybeSingle();

  const result = await query;
  if (result.error) {
    if (result.error.code === "22P02" || isBenignEmptyPaymentMethodsError(result.error)) {
      return null;
    }

    logPaymentMethodsReadError("client_lookup", normalizedIdentifier, result.error);
    throw new PaymentServiceError("Unable to resolve the saved payment method client.", 500);
  }

  return (result.data as ClientRow | null) ?? null;
}

async function resolveClientPaymentContext(
  clientIdentifier: string,
  supabase: SupabaseClient,
  options: {
    profileId?: string | null;
    clientReference?: string | null;
    profileEmail?: string | null;
    profileName?: string | null;
    profilePhone?: string | null;
    repairPreferences?: boolean;
  } = {}
): Promise<ClientPaymentContext | null> {
  const normalizedIdentifier = clientIdentifier.trim();
  if (!normalizedIdentifier) {
    return null;
  }

  const client = await readClientRowByIdOrReference(supabase, normalizedIdentifier);
  const clientId = client?.id ?? (UUID_PATTERN.test(normalizedIdentifier) ? normalizedIdentifier : null);
  if (!clientId) {
    return null;
  }

  const context: ClientPaymentContext = {
    clientId,
    clientReference: client?.reference_code ?? options.clientReference ?? (UUID_PATTERN.test(normalizedIdentifier) ? null : normalizedIdentifier),
    profileId: client?.profile_id ?? options.profileId ?? null,
    profileEmail: options.profileEmail,
    profileName: options.profileName,
    profilePhone: options.profilePhone,
    preferencesRepaired: false
  };

  if (options.repairPreferences !== false) {
    context.preferencesRepaired = await ensureClientPaymentPreferenceRow(supabase, context);
  }

  return context;
}

async function ensureClientPaymentPreferenceRow(
  supabase: SupabaseClient,
  context: ClientPaymentContext
) {
  const clientReference = context.clientReference?.trim();
  if (!clientReference) {
    return false;
  }

  const existing = await supabase
    .from("client_preferences")
    .select("client_reference, client_email")
    .eq("client_reference", clientReference)
    .maybeSingle();

  if (existing.error) {
    if (isPaymentSchemaMissing(existing.error)) {
      return false;
    }

    throw new PaymentServiceError("Unable to resolve client payment preferences.", 500);
  }

  const now = new Date().toISOString();
  const email = context.profileEmail?.trim().toLowerCase() || `${clientReference}@client.bvrb3r.local`;
  if (!existing.data) {
    const basePayload = {
      client_reference: clientReference,
      client_email: email,
      favorite_shop_reference: null,
      preferred_location_reference: null,
      prefers_instant_booking: false,
      updated_at: now,
      created_at: now
    };
    const enrichedPayload = {
      ...basePayload,
      client_id: context.clientId,
      provider_customer_ref: null,
      default_payment_method_ref: null
    };
    let insertResult = await supabase
      .from("client_preferences")
      .insert(enrichedPayload);

    if (insertResult.error && isPaymentPreferencePayloadSchemaMismatch(insertResult.error)) {
      insertResult = await supabase
        .from("client_preferences")
        .insert(basePayload);
    }

    if (insertResult.error) {
      if (isPaymentSchemaMissing(insertResult.error)) {
        return false;
      }

      throw new PaymentServiceError("Unable to repair client payment preferences.", 500);
    }

    return true;
  }

  const shouldSyncEmail = email && existing.data.client_email !== email;
  if (shouldSyncEmail) {
    let updateResult = await supabase
      .from("client_preferences")
      .update({
        client_email: email,
        client_id: context.clientId,
        updated_at: now
      })
      .eq("client_reference", clientReference);

    if (updateResult.error && isPaymentPreferencePayloadSchemaMismatch(updateResult.error)) {
      updateResult = await supabase
        .from("client_preferences")
        .update({ client_email: email, updated_at: now })
        .eq("client_reference", clientReference);
    }

    if (updateResult.error && !isPaymentSchemaMissing(updateResult.error)) {
      throw new PaymentServiceError("Unable to sync client payment preferences.", 500);
    }
  }

  return false;
}

async function readCanonicalPaymentMethodRows(
  supabase: SupabaseClient,
  clientId: string,
  clientIdentifierForLog: string
) {
  const result = await supabase
    .from("payment_methods")
    .select(PAYMENT_METHOD_SELECT)
    .eq("client_id", clientId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (result.error) {
    if (isBenignEmptyPaymentMethodsError(result.error)) {
      return [] as PaymentMethodRow[];
    }

    logPaymentMethodsReadError("payment_methods_query", clientIdentifierForLog, result.error, clientId);
    throw new PaymentServiceError("Unable to load saved payment methods.", 500);
  }

  return ((result.data ?? []) as PaymentMethodRow[]);
}

async function readLegacySavedPaymentMethodsForProfile(
  supabase: SupabaseClient,
  profileId: string | null
) {
  if (!profileId) {
    return [] as LegacySavedPaymentMethodRow[];
  }

  const result = await supabase
    .from("saved_payment_methods")
    .select("id, profile_id, billing_customer_id, provider, provider_payment_method_id, brand, last4, exp_month, exp_year, is_default, created_at")
    .eq("profile_id", profileId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (result.error) {
    if (isBenignEmptyPaymentMethodsError(result.error) || isPaymentSchemaMissing(result.error)) {
      return [];
    }

    throw new PaymentServiceError("Unable to load legacy saved payment methods.", 500);
  }

  return (result.data ?? []) as LegacySavedPaymentMethodRow[];
}

async function readBillingCustomersForLegacyMethods(
  supabase: SupabaseClient,
  legacyMethods: LegacySavedPaymentMethodRow[]
) {
  const billingCustomerIds = [...new Set(legacyMethods.map((method) => method.billing_customer_id).filter((id): id is string => Boolean(id)))];
  if (!billingCustomerIds.length) {
    return new Map<string, BillingCustomerRow>();
  }

  const result = await supabase
    .from("billing_customers")
    .select("id, provider_customer_id, default_payment_method_id")
    .in("id", billingCustomerIds);

  if (result.error) {
    if (isPaymentSchemaMissing(result.error)) {
      return new Map<string, BillingCustomerRow>();
    }

    throw new PaymentServiceError("Unable to load saved billing customer references.", 500);
  }

  return new Map(((result.data ?? []) as BillingCustomerRow[]).map((row) => [row.id, row]));
}

async function syncClientPreferencePaymentDefaults(
  supabase: SupabaseClient,
  context: ClientPaymentContext,
  paymentMethods: PaymentMethodRow[]
) {
  const clientReference = context.clientReference?.trim();
  if (!clientReference) {
    return;
  }

  await ensureClientPaymentPreferenceRow(supabase, context);

  const defaultMethod = paymentMethods.find((method) => method.is_default) ?? paymentMethods[0] ?? null;
  let updateResult = await supabase
    .from("client_preferences")
    .update({
      client_id: context.clientId,
      provider_customer_ref: defaultMethod?.provider_customer_id ?? null,
      default_payment_method_ref: defaultMethod?.provider_payment_method_id ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("client_reference", clientReference);

  if (updateResult.error && isPaymentPreferencePayloadSchemaMismatch(updateResult.error)) {
    updateResult = await supabase
      .from("client_preferences")
      .update({
        updated_at: new Date().toISOString()
      })
      .eq("client_reference", clientReference);
  }

  if (updateResult.error && !isPaymentSchemaMissing(updateResult.error)) {
    throw new PaymentServiceError("Unable to sync client payment preference defaults.", 500);
  }
}

async function syncClientPreferenceProviderCustomer(
  supabase: SupabaseClient,
  context: ClientPaymentContext,
  providerCustomerId?: string | null
) {
  const clientReference = context.clientReference?.trim();
  if (!clientReference || !providerCustomerId?.trim()) {
    return;
  }

  await ensureClientPaymentPreferenceRow(supabase, context);

  let updateResult = await supabase
    .from("client_preferences")
    .update({
      client_id: context.clientId,
      provider_customer_ref: providerCustomerId.trim(),
      updated_at: new Date().toISOString()
    })
    .eq("client_reference", clientReference);

  if (updateResult.error && isPaymentPreferencePayloadSchemaMismatch(updateResult.error)) {
    updateResult = await supabase
      .from("client_preferences")
      .update({ updated_at: new Date().toISOString() })
      .eq("client_reference", clientReference);
  }

  if (updateResult.error && !isPaymentSchemaMissing(updateResult.error)) {
    throw new PaymentServiceError("Unable to sync client payment customer reference.", 500);
  }
}

function clientPaymentContextFromActor(actor: PaymentActorContext): ClientPaymentContext | null {
  if (!actor.clientId) {
    return null;
  }

  return {
    clientId: actor.clientId,
    clientReference: actor.clientReference ?? null,
    profileId: actor.profile.id,
    profileEmail: actor.profile.email,
    profileName: actor.profile.full_name,
    profilePhone: actor.profile.phone ?? null,
    preferencesRepaired: Boolean(actor.clientPreferencesRepaired)
  };
}

async function syncLegacyPaymentMethodsIntoCanonical(
  supabase: SupabaseClient,
  context: ClientPaymentContext,
  canonicalRows: PaymentMethodRow[]
) {
  const legacyRows = await readLegacySavedPaymentMethodsForProfile(supabase, context.profileId);
  if (!legacyRows.length) {
    await syncClientPreferencePaymentDefaults(supabase, context, canonicalRows);
    return canonicalRows;
  }

  const billingCustomers = await readBillingCustomersForLegacyMethods(supabase, legacyRows);
  const existingProviderRefs = new Set(canonicalRows.map((row) => `${row.provider}:${row.provider_payment_method_id}`));
  let rowsChanged = false;
  let hasDefault = canonicalRows.some((row) => row.is_default);

  for (const legacy of legacyRows) {
    const providerKey = `${legacy.provider}:${legacy.provider_payment_method_id}`;
    if (existingProviderRefs.has(providerKey)) {
      continue;
    }

    const shouldBeDefault = legacy.is_default || !hasDefault;
    if (shouldBeDefault) {
      const clearDefaults = await supabase
        .from("payment_methods")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("client_id", context.clientId)
        .eq("is_default", true);

      if (clearDefaults.error) {
        throw new PaymentServiceError("Unable to clear previous default payment method during wallet sync.", 500);
      }
    }

    const billingCustomer = legacy.billing_customer_id ? billingCustomers.get(legacy.billing_customer_id) : undefined;
    const insertResult = await supabase
      .from("payment_methods")
      .insert({
        client_id: context.clientId,
        provider: legacy.provider,
        provider_customer_id: billingCustomer?.provider_customer_id ?? null,
        provider_payment_method_id: legacy.provider_payment_method_id,
        brand: legacy.brand,
        last4: legacy.last4,
        exp_month: legacy.exp_month,
        exp_year: legacy.exp_year,
        nickname: null,
        is_default: shouldBeDefault,
        updated_at: new Date().toISOString()
      });

    if (insertResult.error) {
      if (insertResult.error.code === "23505") {
        continue;
      }

      throw new PaymentServiceError("Unable to sync wallet payment method into booking payments.", 500);
    }

    rowsChanged = true;
    hasDefault = hasDefault || shouldBeDefault;
    existingProviderRefs.add(providerKey);
  }

  const nextRows = rowsChanged
    ? await readCanonicalPaymentMethodRows(supabase, context.clientId, context.clientReference ?? context.clientId)
    : canonicalRows;

  if (nextRows.length && !nextRows.some((row) => row.is_default)) {
    const first = nextRows[0];
    const setDefault = await supabase
      .from("payment_methods")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", first.id);

    if (setDefault.error) {
      throw new PaymentServiceError("Unable to set the default payment method during wallet sync.", 500);
    }

    const repairedRows = await readCanonicalPaymentMethodRows(supabase, context.clientId, context.clientReference ?? context.clientId);
    await syncClientPreferencePaymentDefaults(supabase, context, repairedRows);
    return repairedRows;
  }

  await syncClientPreferencePaymentDefaults(supabase, context, nextRows);
  return nextRows;
}

function isShopStaff(role: UserAccount["role"]) {
  return role === "owner" || role === "manager" || role === "front_desk";
}

function mapPaymentMethodRow(row: PaymentMethodRow): ClientPaymentMethodView {
  return {
    id: row.id,
    provider: row.provider,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    nickname: row.nickname ?? null,
    isDefault: row.is_default,
    createdAt: row.created_at,
    label: formatPaymentMethodLabel({
      provider: row.provider,
      brand: row.brand,
      last4: row.last4
    })
  };
}

function mapPaymentRow(row: PaymentRow): PaymentRecordView {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    amount: numeric(row.amount),
    currency: row.currency,
    provider: row.provider,
    paymentStatus: row.payment_status,
    paymentType: row.payment_type,
    paidAt: row.paid_at,
    createdAt: row.created_at
  };
}

function getPaymentPlatformEventType(status: InternalPaymentStatus): PlatformEventType | null {
  if (status === "captured" || status === "partially_refunded") {
    return "payment_succeeded";
  }

  if (status === "failed") {
    return "payment_failed";
  }

  return null;
}

async function recordPaymentStatusPlatformEvent(
  supabase: SupabaseClient,
  payment: PaymentRow,
  input?: {
    actorId?: string | null;
    actorRole?: string | null;
    source?: "api" | "webhook" | "system";
  }
) {
  const eventType = getPaymentPlatformEventType(payment.payment_status);
  if (!eventType) {
    return;
  }

  await recordRequiredPlatformEvent(supabase, {
    eventType,
    entityType: "payment",
    entityId: payment.id,
    actorId: input?.actorId ?? payment.client_id ?? payment.barber_id ?? payment.shop_id ?? null,
    actorRole: input?.actorRole ?? null,
    source: input?.source ?? "api",
    relatedIds: {
      paymentId: payment.id,
      appointmentId: payment.appointment_id,
      clientId: payment.client_id,
      barberId: payment.barber_id,
      shopId: payment.shop_id,
      paymentMethodId: payment.payment_method_id,
      providerPaymentIntentId: payment.provider_payment_intent_id
    },
    payload: {
      paymentStatus: payment.payment_status,
      paymentType: payment.payment_type,
      provider: payment.provider,
      amount: numeric(payment.amount),
      currency: payment.currency,
      paidAt: payment.paid_at
    },
    idempotencyKey: buildPlatformEventIdempotencyKey(["payment", payment.id, eventType, payment.payment_status])
  });
}

function normalizeStripeMetadata(metadata?: Record<string, string | number | boolean | null>) {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).flatMap(([key, value]) => {
      if (value === null || value === undefined) {
        return [];
      }

      return [[key, String(value)]];
    })
  );
}

function toStripePaymentServiceError(error: unknown, fallbackMessage: string, status = 402) {
  if (error instanceof PaymentServiceError) {
    return error;
  }

  if (error instanceof StripeConnectError) {
    return new PaymentServiceError(error.message, error.status);
  }

  const message = error instanceof Error && error.message.trim()
    ? error.message
    : fallbackMessage;
  return new PaymentServiceError(message, status);
}

async function resolvePaymentActor(user: UserAccount, supabase: SupabaseClient): Promise<PaymentActorContext> {
  let profileResult = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResult.error) {
    throw new PaymentServiceError("Unable to resolve the payment profile.", 500);
  }

  if (!profileResult.data && user.email) {
    profileResult = await supabase
      .from("profiles")
      .select("id, email, full_name, phone, role")
      .eq("email", user.email)
      .maybeSingle();

    if (profileResult.error) {
      throw new PaymentServiceError("Unable to resolve the payment profile.", 500);
    }
  }

  if (!profileResult.data) {
    throw new PaymentServiceError("No payment profile is available for this account.", 404);
  }

  const actor: PaymentActorContext = {
    profile: profileResult.data as ProfileRow,
    locationIds: user.locationIds,
    role: user.role
  };

  if (user.role === "client") {
    const clientResult = await supabase
      .from("clients")
      .select("id, reference_code, profile_id")
      .eq("profile_id", actor.profile.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (clientResult.error) {
      throw new PaymentServiceError("Unable to resolve the client payment account.", 500);
    }

    let clientRow: ClientRow | null = ((clientResult.data ?? []) as ClientRow[])[0] ?? null;
    const providedClientReference = user.clientId?.trim();
    if (!clientRow && providedClientReference) {
      const clientByReference = await readClientRowByIdOrReference(supabase, providedClientReference);
      clientRow = clientByReference;
    }

    const clientReference = clientRow?.reference_code
      ?? providedClientReference
      ?? fallbackClientReferenceForUser(user.id);

    if (!clientRow) {
      const clientWrite = await supabase
        .from("clients")
        .insert({
          id: canonicalClientUuid(clientReference),
          profile_id: actor.profile.id,
          reference_code: clientReference,
          loyalty_points: 0,
          retention_tag: "new"
        })
        .select("id, reference_code, profile_id")
        .single();

      if (clientWrite.error) {
        throw new PaymentServiceError("Unable to repair the client payment account.", 500);
      }

      clientRow = clientWrite.data as ClientRow;
      if (clientRow.profile_id && clientRow.profile_id !== actor.profile.id) {
        throw new PaymentServiceError("Client payment account belongs to another profile.", 403);
      }
    } else {
      if (clientRow.profile_id && clientRow.profile_id !== actor.profile.id) {
        throw new PaymentServiceError("Client payment account belongs to another profile.", 403);
      }

      if (!clientRow.profile_id || !clientRow.reference_code) {
        const updatePayload = {
          profile_id: clientRow.profile_id ?? actor.profile.id,
          reference_code: clientRow.reference_code ?? clientReference
        };
        const clientUpdate = await supabase
          .from("clients")
          .update(updatePayload)
          .eq("id", clientRow.id)
          .select("id, reference_code, profile_id")
          .maybeSingle();

        if (clientUpdate.error) {
          throw new PaymentServiceError("Unable to link the client payment account.", 500);
        }

        clientRow = clientUpdate.data as ClientRow;
      }
    }

    actor.clientId = clientRow.id;
    actor.clientReference = clientRow.reference_code ?? clientReference;
    actor.clientPreferencesRepaired = await ensureClientPaymentPreferenceRow(supabase, {
      clientId: clientRow.id,
      clientReference: actor.clientReference,
      profileId: actor.profile.id,
      profileEmail: actor.profile.email,
      profileName: actor.profile.full_name,
      profilePhone: actor.profile.phone ?? user.phone,
      preferencesRepaired: false
    });
  }

  if (user.role === "commission_barber" || user.role === "booth_rent_barber") {
    const barberResult = await supabase
      .from("barbers")
      .select("id, profile_id")
      .eq("profile_id", actor.profile.id)
      .maybeSingle();

    if (barberResult.error) {
      throw new PaymentServiceError("Unable to resolve the barber payment account.", 500);
    }

    if (!barberResult.data) {
      throw new PaymentServiceError("No barber payment account is available.", 404);
    }

    actor.barberId = (barberResult.data as BarberRow).id;
  }

  return actor;
}

async function loadAppointmentOrThrow(supabase: SupabaseClient, appointmentId: string) {
  const result = await supabase
    .from("appointments")
    .select("id, client_id, barber_id, shop_id, location_id, service_id, status, deposit_amount, balance_due, grand_total, tip_amount, lifecycle_revision, completed_at, updated_at")
    .eq("id", appointmentId)
    .maybeSingle();

  if (result.error) {
    throw new PaymentServiceError("Unable to load the appointment payment context.", 500);
  }

  if (!result.data) {
    throw new PaymentServiceError("Appointment not found for payment handling.", 404);
  }

  return result.data as AppointmentRow;
}

async function loadStripePaymentMethodOrThrow(
  supabase: SupabaseClient,
  clientId: string,
  paymentMethodId?: string | null
) {
  const methodResult = paymentMethodId
    ? await supabase
      .from("payment_methods")
      .select(PAYMENT_METHOD_SELECT)
      .eq("id", paymentMethodId)
      .eq("client_id", clientId)
      .eq("provider", "stripe")
      .maybeSingle()
    : await supabase
      .from("payment_methods")
      .select(PAYMENT_METHOD_SELECT)
      .eq("client_id", clientId)
      .eq("provider", "stripe")
      .eq("is_default", true)
      .maybeSingle();

  if (methodResult.error) {
    throw new PaymentServiceError("Unable to resolve the Stripe payment method for this charge.", 500);
  }

  const method = (methodResult.data as PaymentMethodRow | null) ?? null;
  if (!method) {
    throw new PaymentServiceError("A saved Stripe payment method is required before this payment can be completed.", 400);
  }

  if (!method.provider_customer_id?.trim()) {
    throw new PaymentServiceError("The saved Stripe payment method is missing its customer reference.", 409);
  }

  return method;
}

export async function createCapturedStripePaymentRecord(
  supabase: SupabaseClient,
  input: CapturedStripePaymentInput
) {
  const normalizedAmount = roundCurrency(Math.max(input.amount, 0));
  if (normalizedAmount <= 0) {
    throw new PaymentServiceError("A positive Stripe payment amount is required.", 400);
  }

  const paymentMethod = await loadStripePaymentMethodOrThrow(supabase, input.clientId, input.paymentMethodId);
  const stripe = getStripeConnectClient();
  const createdAt = input.createdAt ?? new Date().toISOString();

  try {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(normalizedAmount * 100),
      currency: (input.currency ?? "usd").toLowerCase(),
      customer: paymentMethod.provider_customer_id ?? undefined,
      payment_method: paymentMethod.provider_payment_method_id,
      confirm: true,
      off_session: true,
      error_on_requires_action: true,
      metadata: normalizeStripeMetadata({
        ...(input.metadata ?? {}),
        appointment_id: input.appointmentId,
        client_id: input.clientId,
        barber_id: input.barberId,
        shop_id: input.shopId,
        service_id: input.serviceId ?? null,
        appointmentId: input.appointmentId,
        clientId: input.clientId,
        barberId: input.barberId,
        shopId: input.shopId,
        serviceId: input.serviceId ?? null,
        paymentType: input.paymentType
      }),
      description: input.description ?? undefined
    }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);

    if (intent.status !== "succeeded") {
      throw new PaymentServiceError("Stripe did not confirm this payment successfully.", 409);
    }

    return createPaymentLedgerEntry(supabase, {
      appointmentId: input.appointmentId,
      clientId: input.clientId,
      shopId: input.shopId,
      barberId: input.barberId,
      paymentMethodId: paymentMethod.id,
      provider: "stripe",
      providerPaymentIntentId: intent.id,
      amount: normalizedAmount,
      currency: input.currency,
      paymentStatus: "captured",
      paymentType: input.paymentType,
      legacyType: input.legacyType,
      legacyStatus: input.legacyStatus ?? "captured",
      paidAt: createdAt,
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.serviceId ? { serviceId: input.serviceId, service_id: input.serviceId } : {})
      },
      createdAt
    });
  } catch (error) {
    throw toStripePaymentServiceError(error, "Unable to collect the required Stripe card payment.");
  }
}

async function loadPaymentOrThrow(supabase: SupabaseClient, paymentId: string) {
  const result = await supabase
    .from("payments")
    .select("id, appointment_id, client_id, shop_id, barber_id, payment_method_id, provider, provider_payment_intent_id, amount, currency, payment_status, payment_type, paid_at, created_at")
    .eq("id", paymentId)
    .maybeSingle();

  if (result.error) {
    throw new PaymentServiceError("Unable to load the payment record.", 500);
  }

  if (!result.data) {
    throw new PaymentServiceError("Payment record not found.", 404);
  }

  return result.data as PaymentRow;
}

function assertClientOwnsAppointment(actor: PaymentActorContext, appointment: AppointmentRow) {
  if (actor.role !== "client" || !actor.clientId || actor.clientId !== appointment.client_id) {
    throw new PaymentServiceError("Only the owning client can access this appointment payment.", 403);
  }
}

function assertClientOwnsPaymentMethod(actor: PaymentActorContext, paymentMethod: PaymentMethodRow) {
  if (actor.role !== "client" || !actor.clientId || actor.clientId !== paymentMethod.client_id) {
    throw new PaymentServiceError("Only the owning client can manage this payment method.", 403);
  }
}

function assertShopAccess(role: UserAccount["role"], locationIds: string[], shopId: string | null, locationId?: string) {
  if (!isShopStaff(role)) {
    throw new PaymentServiceError("Only owner, manager, or front desk can manage this payment action.", 403);
  }

  if (role === "owner") {
    return;
  }

  const scopedLocationId = shopId ?? locationId ?? null;
  if (!scopedLocationId) {
    throw new PaymentServiceError("The payment is not attached to a readable shop location.", 403);
  }

  if (locationIds.length && !locationIds.includes(scopedLocationId)) {
    throw new PaymentServiceError("This payment is outside the viewer's shop scope.", 403);
  }
}

async function ensureLegacyBillingCustomer(
  supabase: SupabaseClient,
  actor: PaymentActorContext,
  provider: InternalPaymentProvider,
  providerCustomerId?: string | null
) {
  const existingResult = await supabase
    .from("billing_customers")
    .select("id, provider_customer_id")
    .eq("profile_id", actor.profile.id)
    .eq("provider", provider)
    .maybeSingle();

  if (existingResult.error) {
    throw new PaymentServiceError("Unable to resolve billing customer state.", 500);
  }

  const effectiveProviderCustomerId =
    providerCustomerId?.trim()
    || existingResult.data?.provider_customer_id
    || null;

  if (existingResult.data) {
    if (effectiveProviderCustomerId && effectiveProviderCustomerId !== existingResult.data.provider_customer_id) {
      const updateResult = await supabase
        .from("billing_customers")
        .update({ provider_customer_id: effectiveProviderCustomerId })
        .eq("id", existingResult.data.id);

      if (updateResult.error) {
        throw new PaymentServiceError("Unable to sync the billing customer.", 500);
      }
    }

    return existingResult.data.id as string;
  }

  if (!effectiveProviderCustomerId) {
    return null;
  }

  const insertResult = await supabase
    .from("billing_customers")
    .insert({
      profile_id: actor.profile.id,
      provider,
      provider_customer_id: effectiveProviderCustomerId,
      default_payment_method_id: null
    })
    .select("id")
    .single();

  if (insertResult.error) {
    throw new PaymentServiceError("Unable to create the billing customer.", 500);
  }

  return insertResult.data.id as string;
}

async function syncLegacySavedPaymentMethod(
  supabase: SupabaseClient,
  actor: PaymentActorContext,
  input: ReturnType<typeof normalizePaymentMethodReference>,
  billingCustomerId: string | null
) {
  if (!billingCustomerId) {
    return;
  }

  const existingResult = await supabase
    .from("saved_payment_methods")
    .select("id")
    .eq("profile_id", actor.profile.id)
    .eq("provider_payment_method_id", input.providerPaymentMethodId)
    .maybeSingle();

  if (existingResult.error) {
    throw new PaymentServiceError("Unable to sync the saved payment method bridge.", 500);
  }

  const row = {
    profile_id: actor.profile.id,
    billing_customer_id: billingCustomerId,
    provider: input.provider,
    provider_payment_method_id: input.providerPaymentMethodId,
    brand: input.brand,
    last4: input.last4,
    exp_month: input.expMonth,
    exp_year: input.expYear,
    is_default: input.isDefault
  };

  const result = existingResult.data
    ? await supabase.from("saved_payment_methods").update(row).eq("id", existingResult.data.id)
    : await supabase.from("saved_payment_methods").insert(row);

  if (result.error) {
    throw new PaymentServiceError("Unable to sync the saved payment method bridge.", 500);
  }
}

async function syncLegacyBillingDefault(
  supabase: SupabaseClient,
  actor: PaymentActorContext,
  provider: InternalPaymentProvider,
  providerPaymentMethodId: string
) {
  const result = await supabase
    .from("billing_customers")
    .update({ default_payment_method_id: providerPaymentMethodId })
    .eq("profile_id", actor.profile.id)
    .eq("provider", provider);

  if (result.error) {
    throw new PaymentServiceError("Unable to update the billing customer default payment method.", 500);
  }
}

async function enrichTokenizedPaymentMethodFromProvider(input: PaymentMethodReferenceInput) {
  const normalized = normalizePaymentMethodReference(input);
  if (normalized.provider !== "stripe") {
    return normalized;
  }

  try {
    const stripe = getStripeConnectClient();
    const paymentMethod = await stripe.paymentMethods.retrieve(normalized.providerPaymentMethodId);
    const card = paymentMethod.type === "card" ? paymentMethod.card : null;
    return {
      ...normalized,
      providerCustomerId: typeof paymentMethod.customer === "string"
        ? paymentMethod.customer
        : normalized.providerCustomerId,
      brand: card?.brand ?? normalized.brand,
      last4: card?.last4 ?? normalized.last4,
      expMonth: card?.exp_month ?? normalized.expMonth,
      expYear: card?.exp_year ?? normalized.expYear
    };
  } catch (error) {
    throw toStripePaymentServiceError(error, "Unable to verify the saved Stripe card.", 502);
  }
}

export async function readClientPaymentMethodsByClientId(
  clientId: string,
  supabaseInput?: SupabaseClient | null,
  options: {
    profileId?: string | null;
    clientReference?: string | null;
    profileEmail?: string | null;
    profileName?: string | null;
    profilePhone?: string | null;
    repairPreferences?: boolean;
    syncLegacyWallet?: boolean;
  } = {}
) {
  const supabase = supabaseInput ?? getSupabaseOrThrow();
  const context = await resolveClientPaymentContext(clientId, supabase, options);

  if (!context) {
    return [];
  }

  const canonicalRows = await readCanonicalPaymentMethodRows(supabase, context.clientId, clientId);
  const resolvedRows = options.syncLegacyWallet === false
    ? canonicalRows
    : await syncLegacyPaymentMethodsIntoCanonical(supabase, context, canonicalRows);

  return resolvedRows.map(mapPaymentMethodRow);
}

export async function readAppointmentPaymentSummary(
  appointmentId: string,
  supabaseInput?: SupabaseClient | null
): Promise<AppointmentPaymentSummaryView | null> {
  const supabase = supabaseInput ?? getSupabaseOrThrow();
  const appointment = await loadAppointmentOrThrow(supabase, appointmentId);
  const paymentsResult = await supabase
    .from("payments")
    .select("id, appointment_id, client_id, shop_id, barber_id, payment_method_id, provider, provider_payment_intent_id, amount, currency, payment_status, payment_type, paid_at, created_at")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false });

  if (paymentsResult.error) {
    throw new PaymentServiceError("Unable to load appointment payments.", 500);
  }

  const paymentRows = (paymentsResult.data ?? []) as PaymentRow[];
  const bookingPayments = paymentRows.filter((payment) => payment.payment_type === "booking");
  const paymentIds = paymentRows.map((payment) => payment.id);
  const refundsResult = paymentIds.length
    ? await supabase
      .from("refunds")
      .select("id, payment_id, amount, reason, provider_refund_id, refunded_at")
      .in("payment_id", paymentIds)
    : { data: [], error: null };
  const tipsResult = await supabase
    .from("tips")
    .select("id, appointment_id, payment_id, client_id, barber_id, amount, created_at")
    .eq("appointment_id", appointmentId);

  if (refundsResult.error || tipsResult.error) {
    throw new PaymentServiceError("Unable to load payment adjustments.", 500);
  }

  const refundTotal = ((refundsResult.data ?? []) as RefundRow[]).reduce((sum, refund) => sum + numeric(refund.amount), 0);
  const tips = (tipsResult.data ?? []) as TipRow[];
  const tipTotal = tips.reduce((sum, tip) => sum + numeric(tip.amount), 0);
  const authorizedAmount = bookingPayments
    .filter((payment) => payment.payment_status === "authorized")
    .reduce((sum, payment) => sum + numeric(payment.amount), 0);
  const capturedAmount = bookingPayments
    .filter((payment) => payment.payment_status === "captured" || payment.payment_status === "partially_refunded" || payment.payment_status === "refunded")
    .reduce((sum, payment) => sum + numeric(payment.amount), 0);
  const defaultPaymentMethod = appointment.client_id
    ? (await readClientPaymentMethodsByClientId(appointment.client_id, supabase)).find((method) => method.isDefault) ?? null
    : null;
  const latestBookingPayment = bookingPayments[0] ? mapPaymentRow(bookingPayments[0]) : null;

  return {
    appointmentId,
    outstandingBalance: roundCurrency(Math.max(numeric(appointment.balance_due), 0)),
    authorizedAmount: roundCurrency(authorizedAmount),
    capturedAmount: roundCurrency(capturedAmount),
    refundedAmount: roundCurrency(refundTotal),
    tipAmount: roundCurrency(tipTotal || numeric(appointment.tip_amount)),
    latestBookingPayment,
    defaultPaymentMethod
  };
}

async function readPayoutRowsForPayments(
  supabase: SupabaseClient,
  paymentIds: string[]
) {
  if (!paymentIds.length) {
    return {
      routingRows: [] as PaymentRoutingSummaryRow[],
      executionRows: [] as PayoutExecutionSummaryRow[]
    };
  }

  const [routingResult, executionResult] = await Promise.all([
    supabase
      .from("payment_routing_records")
      .select("id, payment_id, appointment_id, provider_net_amount, barber_payout_amount, shop_split_amount, payout_readiness_status, money_routing_status, blocked_reason, reconciliation_status, updated_at")
      .in("payment_id", paymentIds),
    supabase
      .from("payout_executions")
      .select("id, payment_id, appointment_id, amount, execution_status, failure_reason, blocked_reason, processor_transfer_id, reconciliation_status, executed_at, failed_at, reversed_at, created_at, updated_at")
      .in("payment_id", paymentIds)
      .order("created_at", { ascending: false })
  ]);

  if (routingResult.error || executionResult.error) {
    throw new PaymentServiceError("Unable to load payout execution visibility.", 500);
  }

  return {
    routingRows: (routingResult.data ?? []) as PaymentRoutingSummaryRow[],
    executionRows: (executionResult.data ?? []) as PayoutExecutionSummaryRow[]
  };
}

async function readDisputeHoldByAppointmentIds(
  supabase: SupabaseClient,
  appointmentIds: Array<string | null | undefined>
) {
  const normalizedIds = [...new Set(appointmentIds.map((entry) => entry?.trim()).filter(Boolean) as string[])];
  if (!normalizedIds.length) {
    return new Map<string, boolean>();
  }

  const appointmentResult = await supabase
    .from("appointments")
    .select("id, reference_code")
    .in("id", normalizedIds);

  if (appointmentResult.error) {
    throw new PaymentServiceError("Unable to inspect payout dispute holds.", 500);
  }

  const referenceById = new Map(
    ((appointmentResult.data ?? []) as Array<{ id: string; reference_code: string | null }>).map((row) => [
      row.id,
      row.reference_code ?? row.id
    ])
  );
  const references = [...new Set([...referenceById.values()].filter(Boolean))];
  if (!references.length) {
    return new Map<string, boolean>();
  }

  const disputeResult = await supabase
    .from("disputes")
    .select("appointment_reference")
    .in("appointment_reference", references)
    .in("dispute_status", ["open", "under_review", "escalated"]);

  if (disputeResult.error) {
    throw new PaymentServiceError("Unable to inspect payout dispute holds.", 500);
  }

  const heldReferences = new Set(((disputeResult.data ?? []) as Array<{ appointment_reference: string | null }>).map((row) => row.appointment_reference).filter(Boolean) as string[]);
  return new Map(
    normalizedIds.map((appointmentId) => [appointmentId, heldReferences.has(referenceById.get(appointmentId) ?? "")])
  );
}

export async function readAppointmentRetentionQualification(
  appointmentId: string,
  supabaseInput?: SupabaseClient | null
): Promise<AppointmentRetentionQualificationView> {
  const supabase = supabaseInput ?? getSupabaseOrThrow();
  const appointment = await loadAppointmentOrThrow(supabase, appointmentId);
  const summary = await readAppointmentPaymentSummary(appointmentId, supabase);
  const disputeHold = (await readDisputeHoldByAppointmentIds(supabase, [appointmentId])).get(appointmentId) ?? false;
  const latestPaymentStatus = summary?.latestBookingPayment?.paymentStatus ?? null;
  const serviceCompleted = appointment.status === "completed";

  let refundState: AppointmentRetentionQualificationView["refundState"] = "clean";
  if (disputeHold) {
    refundState = "chargeback";
  } else if (
    (summary?.refundedAmount ?? 0) > 0
    || latestPaymentStatus === "refunded"
    || latestPaymentStatus === "partially_refunded"
  ) {
    refundState = "refunded";
  }

  const paymentSettled = Boolean(
    serviceCompleted
    && (summary?.capturedAmount ?? 0) > 0
    && (summary?.outstandingBalance ?? Number.POSITIVE_INFINITY) <= 0
    && refundState === "clean"
    && !disputeHold
    && latestPaymentStatus !== "failed"
    && latestPaymentStatus !== "voided"
  );

  let reason: string | null = null;
  if (!serviceCompleted) {
    reason = "Appointment has not completed yet.";
  } else if ((summary?.capturedAmount ?? 0) <= 0) {
    reason = "No captured booking payment exists for this appointment.";
  } else if ((summary?.outstandingBalance ?? 0) > 0) {
    reason = "The appointment still has outstanding balance due.";
  } else if (refundState === "refunded") {
    reason = "The appointment has already been refunded.";
  } else if (refundState === "chargeback") {
    reason = "An active dispute is holding the appointment.";
  } else if (latestPaymentStatus === "failed" || latestPaymentStatus === "voided") {
    reason = "The latest booking payment is not in a settled state.";
  }

  return {
    appointmentId,
    appointmentStatus: appointment.status,
    serviceCompleted,
    paymentSettled,
    refundState,
    disputeHold,
    latestPaymentStatus,
    reason
  };
}

function buildPayoutQueueEntry(
  appointmentId: string | null,
  paymentId: string,
  routingRow: PaymentRoutingSummaryRow,
  executionRows: PayoutExecutionSummaryRow[],
  options?: {
    thresholdAmount?: number;
    disputeHold?: boolean;
  }
): PayoutQueueEntryView {
  const eligibleAmount = roundCurrency(numeric(routingRow.barber_payout_amount) + numeric(routingRow.shop_split_amount));
  const queue = derivePayoutQueueStatus({
    payoutReadinessStatus: routingRow.payout_readiness_status,
    moneyRoutingStatus: routingRow.money_routing_status,
    reconciliationStatus: routingRow.reconciliation_status,
    eligibleAmount,
    thresholdAmount: options?.thresholdAmount,
    executionStatuses: executionRows.map((row) => row.execution_status),
    latestExecution: executionRows[0] ?? null,
    blockedReasons: [routingRow.blocked_reason, executionRows[0]?.blocked_reason, executionRows[0]?.failure_reason].filter(
      (reason): reason is string => Boolean(reason)
    ),
    refundHold: routingRow.money_routing_status === "refunded",
    disputeHold: options?.disputeHold ?? false
  });

  return {
    appointmentId,
    paymentId,
    routingRecordId: routingRow.id,
    status: queue.status,
    eligibleAmount,
    thresholdAmount: queue.thresholdAmount,
    thresholdRemaining: queue.thresholdRemaining,
    minimumThresholdMet: queue.minimumThresholdMet,
    blockedReasons: queue.blockedReasons,
    stripeReady: queue.stripeReady,
    disputeHold: queue.disputeHold,
    refundHold: queue.refundHold,
    nextAction: queue.nextAction,
    executionCount: executionRows.length,
    lastUpdatedAt: executionRows[0]?.updated_at ?? routingRow.updated_at ?? null
  };
}

export async function readAppointmentPayoutVisibility(
  appointmentId: string,
  supabaseInput?: SupabaseClient | null
): Promise<PayoutVisibilityView | null> {
  const supabase = supabaseInput ?? getSupabaseOrThrow();
  const paymentSummary = await readAppointmentPaymentSummary(appointmentId, supabase);
  if (!paymentSummary) {
    return null;
  }

  const paymentsResult = await supabase
    .from("payments")
    .select("id, payment_status")
    .eq("appointment_id", appointmentId);

  if (paymentsResult.error) {
    throw new PaymentServiceError("Unable to load appointment payout visibility.", 500);
  }

  const paymentIds = (paymentsResult.data ?? []).map((row) => row.id as string);
  const { routingRows, executionRows } = await readPayoutRowsForPayments(supabase, paymentIds);
  const disputeHoldByAppointmentId = await readDisputeHoldByAppointmentIds(supabase, [appointmentId]);
  const routingRow = routingRows[0];
  if (!routingRow) {
    const baseStatus = derivePayoutQueueStatus({
      payoutReadinessStatus: null,
      moneyRoutingStatus: null,
      reconciliationStatus: null,
      eligibleAmount: 0,
      executionStatuses: [],
      blockedReasons: ["No payout routing record has been created yet."],
      refundHold: paymentSummary.refundedAmount > 0
    });
    return {
      appointmentId,
      status: baseStatus.status,
      eligibleAmount: 0,
      thresholdAmount: baseStatus.thresholdAmount,
      thresholdRemaining: baseStatus.thresholdAmount,
      minimumThresholdMet: false,
      blockedReasons: baseStatus.blockedReasons,
      stripeReady: false,
      disputeHold: false,
      refundHold: baseStatus.refundHold,
      nextAction: baseStatus.nextAction,
      executionCount: 0,
      lastUpdatedAt: null
    };
  }

  const rowExecutions = executionRows.filter((row) => row.payment_id === routingRow.payment_id);
  const queueEntry = buildPayoutQueueEntry(appointmentId, routingRow.payment_id, routingRow, rowExecutions, {
    disputeHold: disputeHoldByAppointmentId.get(appointmentId) ?? false
  });
  return {
    appointmentId,
    paymentId: queueEntry.paymentId,
    routingRecordId: queueEntry.routingRecordId,
    status: queueEntry.status,
    eligibleAmount: queueEntry.eligibleAmount,
    thresholdAmount: queueEntry.thresholdAmount,
    thresholdRemaining: queueEntry.thresholdRemaining,
    minimumThresholdMet: queueEntry.minimumThresholdMet,
    blockedReasons: queueEntry.blockedReasons,
    stripeReady: queueEntry.stripeReady,
    disputeHold: queueEntry.disputeHold,
    refundHold: queueEntry.refundHold,
    nextAction: queueEntry.nextAction,
    executionCount: queueEntry.executionCount,
    lastUpdatedAt: queueEntry.lastUpdatedAt
  };
}

export async function listPayoutQueue(input?: {
  locationIds?: string[];
  thresholdAmount?: number;
  supabase?: SupabaseClient | null;
}) {
  const supabase = input?.supabase ?? getSupabaseOrThrow();
  const appointmentResult = input?.locationIds?.length
    ? await supabase
      .from("appointments")
      .select("id, location_id")
      .in("location_id", input.locationIds)
    : await supabase
      .from("appointments")
      .select("id, location_id");

  if (appointmentResult.error) {
    throw new PaymentServiceError("Unable to load appointment scope for payout queue.", 500);
  }

  const appointmentIds = (appointmentResult.data ?? []).map((row) => row.id as string);
  if (!appointmentIds.length) {
    return [] as PayoutQueueEntryView[];
  }

  const paymentResult = await supabase
    .from("payments")
    .select("id, appointment_id")
    .in("appointment_id", appointmentIds);

  if (paymentResult.error) {
    throw new PaymentServiceError("Unable to load payment scope for payout queue.", 500);
  }

  const paymentIds = (paymentResult.data ?? []).map((row) => row.id as string);
  const paymentsById = new Map((paymentResult.data ?? []).map((row) => [row.id as string, row.appointment_id as string | null]));
  const { routingRows, executionRows } = await readPayoutRowsForPayments(supabase, paymentIds);
  const disputeHoldByAppointmentId = await readDisputeHoldByAppointmentIds(supabase, [...paymentsById.values()]);

  return routingRows
    .map((routingRow) =>
      buildPayoutQueueEntry(
        paymentsById.get(routingRow.payment_id) ?? routingRow.appointment_id ?? null,
        routingRow.payment_id,
        routingRow,
        executionRows.filter((row) => row.payment_id === routingRow.payment_id),
        {
          thresholdAmount: input?.thresholdAmount,
          disputeHold: disputeHoldByAppointmentId.get(paymentsById.get(routingRow.payment_id) ?? routingRow.appointment_id ?? "") ?? false
        }
      )
    )
    .sort((left, right) => (right.lastUpdatedAt ?? "").localeCompare(left.lastUpdatedAt ?? ""));
}

export async function createPaymentLedgerEntry(
  supabase: SupabaseClient,
  input: CreatePaymentLedgerInput
) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const providerPaymentIntentId = input.providerPaymentIntentId ?? `${input.provider}_pay_${randomUUID()}`;
  const paymentInsert = await supabase
    .from("payments")
    .insert({
      appointment_id: input.appointmentId ?? null,
      client_id: input.clientId ?? null,
      shop_id: input.shopId ?? null,
      barber_id: input.barberId ?? null,
      payment_method_id: input.paymentMethodId ?? null,
      provider: input.provider,
      provider_payment_intent_id: providerPaymentIntentId,
      amount: roundCurrency(input.amount),
      currency: (input.currency ?? "usd").toLowerCase(),
      payment_status: input.paymentStatus,
      payment_type: input.paymentType,
      paid_at: input.paidAt ?? (input.paymentStatus === "captured" ? createdAt : null),
      type: input.legacyType ?? input.paymentType,
      status: input.legacyStatus ?? input.paymentStatus,
      metadata: input.metadata ?? {},
      created_at: createdAt,
      updated_at: createdAt
    })
    .select("id, appointment_id, client_id, shop_id, barber_id, payment_method_id, provider, provider_payment_intent_id, amount, currency, payment_status, payment_type, paid_at, created_at")
    .single();

  if (paymentInsert.error) {
    throw new PaymentServiceError("Unable to write the payment ledger entry.", 500);
  }

  const paymentRow = paymentInsert.data as PaymentRow;
  await syncPaymentRoutingRecord(supabase, paymentRow.id);
  await recordPaymentStatusPlatformEvent(supabase, paymentRow, {
    source: input.metadata?.source === "stripe_webhook" ? "webhook" : "api"
  });
  return mapPaymentRow(paymentRow);
}

export async function createTipLedgerEntry(
  supabase: SupabaseClient,
  input: CreateTipLedgerInput
) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const tipInsert = await supabase
    .from("tips")
    .insert({
      appointment_id: input.appointmentId,
      payment_id: input.paymentId ?? null,
      client_id: input.clientId,
      barber_id: input.barberId,
      amount: roundCurrency(input.amount),
      created_at: createdAt
    })
    .select("id, appointment_id, payment_id, client_id, barber_id, amount, created_at")
    .single();

  if (tipInsert.error) {
    throw new PaymentServiceError("Unable to write the tip record.", 500);
  }

  return tipInsert.data as TipRow;
}

export async function listClientPaymentMethods(user: UserAccount) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolvePaymentActor(user, supabase);

  if (actor.role !== "client" || !actor.clientId) {
    throw new PaymentServiceError("Only clients can manage saved payment methods.", 403);
  }

  return readClientPaymentMethodsByClientId(actor.clientId, supabase);
}

export async function ensureClientPaymentProfileForUser(
  user: UserAccount,
  supabaseInput?: SupabaseClient | null
): Promise<ClientPaymentProfileRepairView> {
  const supabase = supabaseInput ?? getSupabaseOrThrow();
  const actor = await resolvePaymentActor(user, supabase);

  if (actor.role !== "client" || !actor.clientId) {
    throw new PaymentServiceError("Only clients can initialize saved payment methods.", 403);
  }

  const profileEmail = actor.profile.email || user.email;
  const profileName = actor.profile.full_name || user.name || profileEmail;
  return {
    clientId: actor.clientId,
    clientReference: actor.clientReference ?? null,
    profileId: actor.profile.id,
    profileEmail,
    profileName,
    profilePhone: actor.profile.phone ?? user.phone,
    preferencesRepaired: Boolean(actor.clientPreferencesRepaired)
  };
}

export async function syncClientPaymentSetupCustomer(
  profile: ClientPaymentProfileRepairView,
  providerCustomerId?: string | null,
  supabaseInput?: SupabaseClient | null
) {
  const supabase = supabaseInput ?? getSupabaseOrThrow();
  await syncClientPreferenceProviderCustomer(supabase, profile, providerCustomerId);
}

export async function addClientPaymentMethod(user: UserAccount, input: PaymentMethodReferenceInput) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolvePaymentActor(user, supabase);
  if (actor.role !== "client" || !actor.clientId) {
    throw new PaymentServiceError("Only clients can add saved payment methods.", 403);
  }

  const normalized = await enrichTokenizedPaymentMethodFromProvider(input);
  const existingMethods = await readClientPaymentMethodsByClientId(actor.clientId, supabase);
  const shouldBeDefault = normalized.isDefault || existingMethods.length === 0;

  if (shouldBeDefault) {
    const clearDefaults = await supabase
      .from("payment_methods")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("client_id", actor.clientId)
      .eq("is_default", true);

    if (clearDefaults.error) {
      throw new PaymentServiceError("Unable to clear the previous default payment method.", 500);
    }
  }

  const insertResult = await supabase
    .from("payment_methods")
    .insert({
      client_id: actor.clientId,
      provider: normalized.provider,
      provider_customer_id: normalized.providerCustomerId,
      provider_payment_method_id: normalized.providerPaymentMethodId,
      brand: normalized.brand,
      last4: normalized.last4,
      exp_month: normalized.expMonth,
      exp_year: normalized.expYear,
      nickname: normalized.nickname,
      is_default: shouldBeDefault,
      updated_at: new Date().toISOString()
    })
    .select(PAYMENT_METHOD_SELECT)
    .single();

  if (insertResult.error) {
    throw new PaymentServiceError("Unable to store the tokenized payment method reference.", 500);
  }

  const billingCustomerId = await ensureLegacyBillingCustomer(
    supabase,
    actor,
    normalized.provider,
    normalized.providerCustomerId
  );
  await syncLegacySavedPaymentMethod(supabase, actor, { ...normalized, isDefault: shouldBeDefault }, billingCustomerId);
  if (shouldBeDefault) {
    await syncLegacyBillingDefault(supabase, actor, normalized.provider, normalized.providerPaymentMethodId);
  }

  const paymentContext = clientPaymentContextFromActor(actor);
  if (paymentContext) {
    const latestRows = await readCanonicalPaymentMethodRows(supabase, actor.clientId, actor.clientReference ?? actor.clientId);
    await syncClientPreferencePaymentDefaults(supabase, paymentContext, latestRows);
  }

  return mapPaymentMethodRow(insertResult.data as PaymentMethodRow);
}

export async function setDefaultClientPaymentMethod(user: UserAccount, paymentMethodId: string) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolvePaymentActor(user, supabase);

  if (actor.role !== "client" || !actor.clientId) {
    throw new PaymentServiceError("Only clients can update saved payment method defaults.", 403);
  }

  const methodResult = await supabase
    .from("payment_methods")
    .select(PAYMENT_METHOD_SELECT)
    .eq("id", paymentMethodId)
    .maybeSingle();

  if (methodResult.error) {
    throw new PaymentServiceError("Unable to load the requested payment method.", 500);
  }

  if (!methodResult.data) {
    throw new PaymentServiceError("Payment method not found.", 404);
  }

  const paymentMethod = methodResult.data as PaymentMethodRow;
  assertClientOwnsPaymentMethod(actor, paymentMethod);

  const clearDefaults = await supabase
    .from("payment_methods")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("client_id", actor.clientId)
    .eq("is_default", true);

  if (clearDefaults.error) {
    throw new PaymentServiceError("Unable to clear the previous default payment method.", 500);
  }

  const setDefault = await supabase
    .from("payment_methods")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", paymentMethod.id)
    .select(PAYMENT_METHOD_SELECT)
    .single();

  if (setDefault.error) {
    throw new PaymentServiceError("Unable to set the default payment method.", 500);
  }

  await supabase
    .from("saved_payment_methods")
    .update({ is_default: false })
    .eq("profile_id", actor.profile.id)
    .neq("provider_payment_method_id", paymentMethod.provider_payment_method_id);

  const legacyDefaultResult = await supabase
    .from("saved_payment_methods")
    .update({ is_default: true })
    .eq("profile_id", actor.profile.id)
    .eq("provider_payment_method_id", paymentMethod.provider_payment_method_id);

  if (legacyDefaultResult.error) {
    throw new PaymentServiceError("Unable to sync the default saved payment method bridge.", 500);
  }

  await syncLegacyBillingDefault(supabase, actor, paymentMethod.provider, paymentMethod.provider_payment_method_id);

  const paymentContext = clientPaymentContextFromActor(actor);
  if (paymentContext) {
    const latestRows = await readCanonicalPaymentMethodRows(supabase, actor.clientId, actor.clientReference ?? actor.clientId);
    await syncClientPreferencePaymentDefaults(supabase, paymentContext, latestRows);
  }

  return mapPaymentMethodRow(setDefault.data as PaymentMethodRow);
}

export async function renameClientPaymentMethod(user: UserAccount, paymentMethodId: string, nickname: string) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolvePaymentActor(user, supabase);

  if (actor.role !== "client" || !actor.clientId) {
    throw new PaymentServiceError("Only clients can rename saved payment methods.", 403);
  }

  const normalizedNickname = nickname.trim();
  if (!normalizedNickname) {
    throw new PaymentServiceError("Enter a card name.", 400);
  }

  const methodResult = await supabase
    .from("payment_methods")
    .select(PAYMENT_METHOD_SELECT)
    .eq("id", paymentMethodId)
    .maybeSingle();

  if (methodResult.error) {
    console.error("[payments] payment_method_nickname_save_failed", {
      paymentMethodId,
      code: methodResult.error.code ?? null,
      message: methodResult.error.message ?? null,
      details: methodResult.error.details ?? null,
      hint: methodResult.error.hint ?? null
    });
    throw new PaymentServiceError("Unable to load the requested payment method.", 500);
  }

  if (!methodResult.data) {
    throw new PaymentServiceError("Payment method not found.", 404);
  }

  const paymentMethod = methodResult.data as PaymentMethodRow;
  assertClientOwnsPaymentMethod(actor, paymentMethod);

  const updateResult = await supabase
    .from("payment_methods")
    .update({
      nickname: normalizedNickname,
      updated_at: new Date().toISOString()
    })
    .eq("id", paymentMethod.id)
    .eq("client_id", actor.clientId)
    .select(PAYMENT_METHOD_SELECT)
    .single();

  if (updateResult.error) {
    console.error("[payments] payment_method_nickname_save_failed", {
      paymentMethodId,
      code: updateResult.error.code ?? null,
      message: updateResult.error.message ?? null,
      details: updateResult.error.details ?? null,
      hint: updateResult.error.hint ?? null
    });
    throw new PaymentServiceError("Card name could not be saved, but the card was saved.", 500);
  }

  return mapPaymentMethodRow(updateResult.data as PaymentMethodRow);
}

export async function removeClientPaymentMethod(user: UserAccount, paymentMethodId: string) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolvePaymentActor(user, supabase);

  if (actor.role !== "client" || !actor.clientId) {
    throw new PaymentServiceError("Only clients can remove saved payment methods.", 403);
  }

  const methodResult = await supabase
    .from("payment_methods")
    .select(PAYMENT_METHOD_SELECT)
    .eq("id", paymentMethodId)
    .maybeSingle();

  if (methodResult.error) {
    throw new PaymentServiceError("Unable to load the requested payment method.", 500);
  }

  if (!methodResult.data) {
    throw new PaymentServiceError("Payment method not found.", 404);
  }

  const paymentMethod = methodResult.data as PaymentMethodRow;
  assertClientOwnsPaymentMethod(actor, paymentMethod);

  if (paymentMethod.provider === "stripe") {
    try {
      await getStripeConnectClient().paymentMethods.detach(paymentMethod.provider_payment_method_id);
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw new PaymentServiceError(error.message, error.status);
      }

      throw new PaymentServiceError("Unable to remove the saved Stripe card.", 502);
    }
  }

  const deleteCanonical = await supabase
    .from("payment_methods")
    .delete()
    .eq("id", paymentMethod.id)
    .eq("client_id", actor.clientId);

  if (deleteCanonical.error) {
    throw new PaymentServiceError("Unable to remove the saved payment method.", 500);
  }

  await supabase
    .from("saved_payment_methods")
    .delete()
    .eq("profile_id", actor.profile.id)
    .eq("provider_payment_method_id", paymentMethod.provider_payment_method_id);

  const remainingRows = await readCanonicalPaymentMethodRows(supabase, actor.clientId, actor.clientReference ?? actor.clientId);
  let syncedRows = remainingRows;
  if (paymentMethod.is_default && remainingRows.length && !remainingRows.some((method) => method.is_default)) {
    const nextDefault = remainingRows[0];
    const setDefault = await supabase
      .from("payment_methods")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", nextDefault.id);

    if (setDefault.error) {
      throw new PaymentServiceError("Unable to select a new default payment method.", 500);
    }

    syncedRows = await readCanonicalPaymentMethodRows(supabase, actor.clientId, actor.clientReference ?? actor.clientId);
    await syncLegacyBillingDefault(supabase, actor, nextDefault.provider, nextDefault.provider_payment_method_id);
  }

  const paymentContext = clientPaymentContextFromActor(actor);
  if (paymentContext) {
    await syncClientPreferencePaymentDefaults(supabase, paymentContext, syncedRows);
  }

  return { ok: true };
}

export async function createAppointmentPayment(user: UserAccount, input: {
  appointmentId: string;
  paymentMethodId?: string;
  provider?: InternalPaymentProvider;
}) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolvePaymentActor(user, supabase);
  const appointment = await loadAppointmentOrThrow(supabase, input.appointmentId);

  if (actor.role === "client") {
    assertClientOwnsAppointment(actor, appointment);
  } else {
    assertShopAccess(actor.role, actor.locationIds, appointment.shop_id, appointment.location_id);
  }

  const existingPaymentsResult = await supabase
    .from("payments")
    .select("id")
    .eq("appointment_id", appointment.id)
    .eq("payment_type", "booking")
    .in("payment_status", ["pending", "authorized", "captured", "partially_refunded"]);

  if (existingPaymentsResult.error) {
    throw new PaymentServiceError("Unable to inspect existing appointment payments.", 500);
  }

  const paymentIntent = resolveAppointmentPaymentIntent({
    appointmentStatus: appointment.status,
    depositAmount: numeric(appointment.deposit_amount),
    balanceDue: numeric(appointment.balance_due),
    grandTotal: numeric(appointment.grand_total),
    hasActiveBookingPayment: Boolean((existingPaymentsResult.data ?? []).length)
  });

  let paymentMethod: PaymentMethodRow | null = null;
  if (actor.role === "client") {
    const requestedMethodId = input.paymentMethodId;
    const methodQuery = requestedMethodId
      ? supabase
        .from("payment_methods")
        .select(PAYMENT_METHOD_SELECT)
        .eq("id", requestedMethodId)
        .maybeSingle()
      : supabase
        .from("payment_methods")
        .select(PAYMENT_METHOD_SELECT)
        .eq("client_id", actor.clientId ?? "")
        .eq("is_default", true)
        .maybeSingle();

    const methodResult = await methodQuery;
    if (methodResult.error) {
      throw new PaymentServiceError("Unable to resolve the saved payment method for this appointment.", 500);
    }

    paymentMethod = (methodResult.data as PaymentMethodRow | null) ?? null;
    if (!paymentMethod) {
      throw new PaymentServiceError("Save a default payment method before creating an appointment payment.", 400);
    }
    assertClientOwnsPaymentMethod(actor, paymentMethod);
  }

  const provider = paymentMethod?.provider ?? input.provider ?? runtimeConfig.paymentProvider;
  if (provider !== "stripe") {
    throw new PaymentServiceError("Only Stripe-backed card payments are supported.", 409);
  }

  const payment = await createCapturedStripePaymentRecord(supabase, {
    appointmentId: appointment.id,
    clientId: appointment.client_id,
    shopId: appointment.shop_id ?? appointment.location_id,
    barberId: appointment.barber_id,
    serviceId: appointment.service_id,
    amount: paymentIntent.amount,
    paymentType: "booking",
    paymentMethodId: paymentMethod?.id ?? null,
    legacyType: paymentIntent.stage === "checkout" ? "checkout" : "booking",
    legacyStatus: "captured",
    idempotencyKey: `booking-charge:${appointment.id}:${paymentIntent.stage}:${paymentIntent.amount.toFixed(2)}`,
    description: `BVRB3R booking ${appointment.id}`,
    metadata: {
      appointmentStatus: appointment.status,
      paymentStage: paymentIntent.stage,
      source: actor.role === "client" ? "client_payment_surface" : "shop_payment_surface"
    }
  });

  return {
    payment,
    summary: await readAppointmentPaymentSummary(appointment.id, supabase)
  };
}

export async function capturePayment(user: UserAccount, paymentId: string) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolvePaymentActor(user, supabase);
  const payment = await loadPaymentOrThrow(supabase, paymentId);
  const appointment = payment.appointment_id ? await loadAppointmentOrThrow(supabase, payment.appointment_id) : null;
  assertShopAccess(actor.role, actor.locationIds, payment.shop_id ?? appointment?.shop_id ?? null, appointment?.location_id);
  assertPaymentStatusTransition(payment.payment_status, "captured");

  if (payment.provider !== "stripe" || !payment.provider_payment_intent_id?.trim()) {
    throw new PaymentServiceError("Only Stripe-backed authorized payments can be captured.", 409);
  }

  try {
    const stripe = getStripeConnectClient();
    await stripe.paymentIntents.capture(payment.provider_payment_intent_id);
  } catch (error) {
    throw toStripePaymentServiceError(error, "Unable to capture the Stripe payment.");
  }

  const paidAt = new Date().toISOString();
  const result = await supabase
    .from("payments")
    .update({
      payment_status: "captured",
      status: "captured",
      paid_at: paidAt,
      updated_at: paidAt
    })
    .eq("id", payment.id)
    .select("id, appointment_id, client_id, shop_id, barber_id, payment_method_id, provider, provider_payment_intent_id, amount, currency, payment_status, payment_type, paid_at, created_at")
    .single();

  if (result.error) {
    throw new PaymentServiceError("Unable to capture the payment.", 500);
  }

  await syncPaymentRoutingRecord(supabase, payment.id);
  await syncStripeSettlementForPayment(supabase, payment.id);
  await recordPaymentStatusPlatformEvent(supabase, result.data as PaymentRow, {
    actorId: actor.profile.id,
    actorRole: actor.role,
    source: "api"
  });

  return {
    payment: mapPaymentRow(result.data as PaymentRow),
    summary: payment.appointment_id ? await readAppointmentPaymentSummary(payment.appointment_id, supabase) : null
  };
}

export async function refundPayment(user: UserAccount, input: {
  paymentId: string;
  amount: number;
  reason?: string;
}) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolvePaymentActor(user, supabase);
  const payment = await loadPaymentOrThrow(supabase, input.paymentId);
  const appointment = payment.appointment_id ? await loadAppointmentOrThrow(supabase, payment.appointment_id) : null;
  assertShopAccess(actor.role, actor.locationIds, payment.shop_id ?? appointment?.shop_id ?? null, appointment?.location_id);

  if (!(payment.payment_status === "captured" || payment.payment_status === "partially_refunded")) {
    throw new PaymentServiceError("Only captured payments can be refunded.", 409);
  }

  const refundsResult = await supabase
    .from("refunds")
    .select("id, payment_id, amount, reason, provider_refund_id, refunded_at")
    .eq("payment_id", payment.id);

  if (refundsResult.error) {
    throw new PaymentServiceError("Unable to load existing refunds for this payment.", 500);
  }

  const nextRefundedTotal =
    ((refundsResult.data ?? []) as RefundRow[]).reduce((sum, refund) => sum + numeric(refund.amount), 0)
    + roundCurrency(input.amount);
  const refundOutcome = resolveRefundOutcome(numeric(payment.amount), nextRefundedTotal);
  const refundedAt = new Date().toISOString();

  let providerRefundId = payment.provider ? `${payment.provider}_refund_${randomUUID()}` : `refund_${randomUUID()}`;
  if (payment.provider === "stripe") {
    if (!payment.provider_payment_intent_id?.trim()) {
      throw new PaymentServiceError("Stripe refunds require the original payment intent reference.", 409);
    }

    try {
      const stripe = getStripeConnectClient();
      const refund = await stripe.refunds.create({
        payment_intent: payment.provider_payment_intent_id,
        amount: Math.round(roundCurrency(input.amount) * 100),
        reason: "requested_by_customer",
        metadata: normalizeStripeMetadata({
          appointmentId: payment.appointment_id,
          paymentId: payment.id,
          actorRole: actor.role,
          refundReason: input.reason ?? null
        })
      }, {
        idempotencyKey: `refund:${payment.id}:${nextRefundedTotal.toFixed(2)}`
      });
      providerRefundId = refund.id;
    } catch (error) {
      throw toStripePaymentServiceError(error, "Unable to create the Stripe refund.");
    }
  }

  const refundInsert = await supabase
    .from("refunds")
    .insert({
      payment_id: payment.id,
      amount: roundCurrency(input.amount),
      reason: input.reason?.trim() || null,
      provider_refund_id: providerRefundId,
      refunded_by: actor.profile.id,
      refunded_at: refundedAt,
      created_at: refundedAt
    })
    .select("id, payment_id, amount, reason, provider_refund_id, refunded_at")
    .single();

  if (refundInsert.error) {
    throw new PaymentServiceError("Unable to create the refund record.", 500);
  }

  const paymentUpdate = await supabase
    .from("payments")
    .update({
      payment_status: refundOutcome.nextStatus,
      status: refundOutcome.nextStatus,
      updated_at: refundedAt
    })
    .eq("id", payment.id)
    .select("id, appointment_id, client_id, shop_id, barber_id, payment_method_id, provider, provider_payment_intent_id, amount, currency, payment_status, payment_type, paid_at, created_at")
    .single();

  if (paymentUpdate.error) {
    throw new PaymentServiceError("Unable to update the payment refund state.", 500);
  }

  await syncPaymentRoutingRecord(supabase, payment.id);
  await syncStripeSettlementForPayment(supabase, payment.id);
  await reconcilePaymentPayoutExecutions(supabase, payment.id, {
    refundId: (refundInsert.data as RefundRow).id,
    initiatedBy: actor.profile.id
  });
  if (payment.appointment_id) {
    try {
      await reversePointsForAppointment({
        appointmentId: payment.appointment_id,
        reason: input.reason?.trim() || "payment_refund"
      });
    } catch {}
  }

  if (
    appointment
    && payment.payment_type === "booking"
    && refundOutcome.nextStatus === "refunded"
    && appointment.status === "completed"
  ) {
    const nextLifecycleFields = buildAppointmentLifecycleFields(
      {
        checkedInAt: null,
        serviceStartedAt: null,
        completedAt: appointment.completed_at,
        cancelledAt: null,
        cancellationReason: null
      },
      "refunded",
      refundedAt,
      input.reason ?? "payment_refund"
    );

    const appointmentUpdate = await supabase
      .from("appointments")
      .update({
        status: "refunded",
        lifecycle_revision: appointment.lifecycle_revision + 1,
        updated_at: refundedAt,
        completed_at: nextLifecycleFields.completedAt,
        cancelled_at: nextLifecycleFields.cancelledAt,
        cancellation_reason: input.reason?.trim() || null
      })
      .eq("id", appointment.id);

    if (appointmentUpdate.error) {
      throw new PaymentServiceError("Unable to coordinate the appointment refund state.", 500);
    }

    const statusInsert = await supabase.from("appointment_status_history").insert({
      appointment_id: appointment.id,
      status: "refunded",
      old_status: appointment.status,
      new_status: "refunded",
      changed_by: actor.profile.id,
      change_reason: input.reason?.trim() || "payment_refund",
      changed_at: refundedAt
    });

    if (statusInsert.error) {
      throw new PaymentServiceError("Unable to log the appointment refund history entry.", 500);
    }
  }

  return {
    payment: mapPaymentRow(paymentUpdate.data as PaymentRow),
    refund: refundInsert.data as RefundRow,
    summary: payment.appointment_id ? await readAppointmentPaymentSummary(payment.appointment_id, supabase) : null
  };
}

export async function createAppointmentTip(user: UserAccount, input: {
  appointmentId: string;
  amount: number;
  paymentId?: string;
}) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolvePaymentActor(user, supabase);
  const appointment = await loadAppointmentOrThrow(supabase, input.appointmentId);

  if (actor.role === "client") {
    assertClientOwnsAppointment(actor, appointment);
  } else {
    assertShopAccess(actor.role, actor.locationIds, appointment.shop_id, appointment.location_id);
  }

  if (appointment.status !== "completed") {
    throw new PaymentServiceError("Tips can only be recorded after the appointment is completed.", 409);
  }

  const existingTipResult = await supabase
    .from("tips")
    .select("id")
    .eq("appointment_id", appointment.id)
    .maybeSingle();

  if (existingTipResult.error) {
    throw new PaymentServiceError("Unable to inspect existing appointment tips.", 500);
  }

  if (existingTipResult.data) {
    throw new PaymentServiceError("A tip has already been recorded for this appointment.", 409);
  }

  let paymentId = input.paymentId ?? null;
  if (!paymentId) {
    const payment = await createCapturedStripePaymentRecord(supabase, {
      appointmentId: appointment.id,
      clientId: appointment.client_id,
      shopId: appointment.shop_id ?? appointment.location_id,
      barberId: appointment.barber_id,
      serviceId: appointment.service_id,
      amount: input.amount,
      paymentType: "tip",
      legacyType: "tip",
      legacyStatus: "captured",
      idempotencyKey: `tip:${appointment.id}:${input.amount.toFixed(2)}`,
      description: `BVRB3R tip ${appointment.id}`,
      metadata: {
        source: actor.role === "client" ? "client_tip_surface" : "shop_tip_surface"
      }
    });
    paymentId = payment.id;
  }

  const tip = await createTipLedgerEntry(supabase, {
    appointmentId: appointment.id,
    paymentId,
    clientId: appointment.client_id,
    barberId: appointment.barber_id,
    amount: input.amount,
    createdAt: new Date().toISOString()
  });

  const updatedAt = new Date().toISOString();
  const appointmentUpdate = await supabase
    .from("appointments")
    .update({
      tip_amount: roundCurrency(numeric(appointment.tip_amount) + input.amount),
      grand_total: roundCurrency(numeric(appointment.grand_total) + input.amount),
      updated_at: updatedAt
    })
    .eq("id", appointment.id);

  if (appointmentUpdate.error) {
    throw new PaymentServiceError("Unable to update the appointment tip total.", 500);
  }

  return {
    tip,
    summary: await readAppointmentPaymentSummary(appointment.id, supabase)
  };
}
