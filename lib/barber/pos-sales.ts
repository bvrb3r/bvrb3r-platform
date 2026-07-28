import { randomUUID } from "crypto";
import { isBarberAccountRole, isClientRole } from "@/lib/auth/roles";
import { canonicalBarberUuid } from "@/lib/booking/canonical-booking";
import { createCapturedStripePaymentRecord, createPaymentLedgerEntry, PaymentServiceError } from "@/lib/payments/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_FEE_RATE, roundCurrency } from "@/lib/fintech/domain";
import { calculateAutoBoothRentApplication } from "@/lib/fintech/booth-rent-doctrine";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type BarberRow = {
  id: string;
  profile_id: string;
  reference_code: string | null;
  barber_subtype?: string | null;
  compensation_model?: string | null;
  default_money_relationship?: string | null;
  autobooth_percent?: number | string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  role: string | null;
  full_name?: string | null;
};

type ClientRow = {
  id: string;
  profile_id?: string | null;
  reference_code?: string | null;
};

type LocationRow = {
  id: string;
  reference_code?: string | null;
};

type PaymentMethodRow = {
  id: string;
  provider_payment_method_id?: string | null;
  brand?: string | null;
  last4?: string | null;
  is_default?: boolean | null;
};

type PosPaymentRequestRow = {
  id: string;
  pos_sale_id: string;
  barber_id: string;
  client_id: string;
  amount_cents: number;
  status: "pending" | "pending_approval" | "pending_message_failed" | "approved" | "declined" | "expired" | "paid" | "failed" | "canceled" | "superseded" | "canceled_duplicate";
  requested_at: string;
  approved_at: string | null;
  declined_at: string | null;
  paid_at?: string | null;
  expires_at: string | null;
  message_thread_id: string | null;
  payment_id: string | null;
  created_at: string;
  updated_at: string;
};

type BarberLookupAttempt = {
  column: "id" | "reference_code" | "profile_id";
  value: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const POS_SCHEMA_TABLES = {
  sales: "pos_sales",
  saleItems: "pos_sale_items",
  paymentRequests: "pos_payment_requests"
} as const;

const ACTIVE_POS_PAYMENT_REQUEST_STATUSES: PosPaymentRequestRow["status"][] = ["pending", "pending_approval", "pending_message_failed"];
const CLIENT_ACTIONABLE_POS_PAYMENT_REQUEST_STATUSES: PosPaymentRequestRow["status"][] = ["pending", "pending_approval"];
const PAID_POS_PAYMENT_REQUEST_STATUSES: PosPaymentRequestRow["status"][] = ["approved", "paid"];
const POS_PAYMENT_REQUEST_DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

type PosPaymentRequestMessageMetadata = {
  kind: "pos_payment_request";
  paymentRequestId: string;
  posSaleId: string;
  amountCents: number;
  status: PosPaymentRequestRow["status"];
};

type PosSaleRow = {
  id: string;
  barber_id: string;
  shop_id: string | null;
  client_id: string | null;
  customer_name: string | null;
  source: string;
  status: "draft" | "payment_pending" | "paid" | "refunded" | "voided";
  payment_method?: "tap_to_pay" | "card_on_file" | "cash" | "invoice" | "test" | null;
  payment_status?: "pending" | "pending_client_approval" | "paid" | "captured" | "failed" | "refunded" | null;
  cash_recorded_at?: string | null;
  completed_at?: string | null;
  amount_cents?: number | null;
  total_amount_cents?: number | null;
  invoice_url?: string | null;
  invoice_status?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  subtotal_cents: number;
  discount_cents: number;
  tip_cents: number;
  platform_fee_cents: number;
  client_fee_cents: number;
  total_cents: number;
  payment_id: string | null;
  note: string | null;
  created_by_profile_id: string;
  created_at: string;
  updated_at: string;
};

type PosSaleInsertPayload = {
  barber_id: string;
  shop_id: string | null;
  client_id: string | null;
  customer_name: string | null;
  source: string;
  status: "draft" | "payment_pending" | "paid" | "refunded" | "voided";
  subtotal_cents: number;
  discount_cents: number;
  tip_cents: number;
  platform_fee_cents: number;
  client_fee_cents: number;
  total_cents: number;
  payment_id: null;
  note: string | null;
  created_by_profile_id: string;
  created_at: string;
  updated_at: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  payment_method?: "tap_to_pay" | "card_on_file" | "cash" | "invoice" | "test" | null;
  cash_recorded_at?: string | null;
  invoice_status?: string | null;
  amount_cents?: number;
  total_amount_cents?: number;
  payment_status?: "pending" | "pending_client_approval" | "paid" | "captured" | "failed" | "refunded" | null;
  routing_required?: boolean;
  completed_at?: string | null;
};

type PosSaleItemInput = {
  itemType?: "custom_amount" | "service" | "product" | "tip" | "discount";
  serviceId?: string | null;
  name?: string | null;
  quantity?: number | null;
  unitAmountCents?: number | null;
};

export type BarberPosSaleQuoteInput = {
  amountCents: number;
  tipCents?: number | null;
  discountCents?: number | null;
  note?: string | null;
  clientId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  paymentMethod?: "tap_to_pay" | "card_on_file" | "cash" | "invoice" | "test" | null;
  items?: PosSaleItemInput[] | null;
};

export type BarberPosSaleChargeInput = {
  paymentMethod?: "tap_to_pay" | "card_on_file" | "test" | null;
};

export type BarberPosSaleInvoiceInput = {
  customerPhone?: string | null;
  customerEmail?: string | null;
};

export type BarberPosSaleQuote = {
  subtotalCents: number;
  platformFeeCents: number;
  clientFeeCents: number;
  discountCents: number;
  tipCents: number;
  totalCents: number;
  barberPayoutCents: number;
  shopSplitCents: number;
  relationshipType: "freelance" | "booth_rent" | "autobooth_rent";
};

export type BarberPosSaleDebug = {
  debugCode: string;
  failedTable: string | null;
  failedConstraint: string | null;
  failedColumn: string | null;
};

export class BarberPosSaleError extends Error {
  status: number;
  debugCode: string | null;
  failedTable: string | null;
  failedConstraint: string | null;
  failedColumn: string | null;

  constructor(message: string, status = 500, debug?: Partial<BarberPosSaleDebug>) {
    super(message);
    this.name = "BarberPosSaleError";
    this.status = status;
    this.debugCode = debug?.debugCode ?? null;
    this.failedTable = debug?.failedTable ?? null;
    this.failedConstraint = debug?.failedConstraint ?? null;
    this.failedColumn = debug?.failedColumn ?? null;
  }
}

export function serializeBarberPosSaleError(error: BarberPosSaleError) {
  return {
    ok: false,
    error: error.message,
    debugCode: error.debugCode,
    failedTable: error.failedTable,
    failedConstraint: error.failedConstraint,
    failedColumn: error.failedColumn
  };
}

function getSupabaseOrThrow() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new BarberPosSaleError("Supabase is not configured for POS sales.", 500);
  }

  return supabase;
}

function cents(value: number | null | undefined) {
  return Math.max(0, Math.round(Number(value ?? 0)));
}

function decimalFromCents(value: number) {
  return roundCurrency(value / 100);
}

function formatUsdFromCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
}

function normalizeRelationshipType(value: string | null | undefined): BarberPosSaleQuote["relationshipType"] {
  if (value === "autobooth_rent") return "autobooth_rent";
  if (value === "booth_rent" || value === "blueprint") return "booth_rent";
  // Retired revenue-share values normalize to freelance: the shop collects
  // nothing until a real rent agreement exists.
  return "freelance";
}

function uniqueLookupAttempts(attempts: Array<BarberLookupAttempt | null | undefined>) {
  const seen = new Set<string>();
  return attempts.filter((attempt): attempt is BarberLookupAttempt => {
    const value = attempt?.value?.trim();
    if (!attempt || !value) return false;

    const key = `${attempt.column}:${value}`;
    if (seen.has(key)) return false;

    seen.add(key);
    attempt.value = value;
    return true;
  });
}

async function maybeLoadProfileForPosUser(supabase: SupabaseClient, user: UserAccount) {
  const byId = await supabase
    .from("profiles")
    .select("id, email, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (byId.data) {
    return byId.data as ProfileRow;
  }

  if (!user.email) {
    return null;
  }

  const byEmail = await supabase
    .from("profiles")
    .select("id, email, role, full_name")
    .eq("email", user.email)
    .maybeSingle();

  return (byEmail.data as ProfileRow | null) ?? null;
}

async function loadBarberByAttempt(supabase: SupabaseClient, attempt: BarberLookupAttempt) {
  const fullSelect = "id, profile_id, reference_code, compensation_model, autobooth_percent, barber_subtype, default_money_relationship";
  const result = await supabase
    .from("barbers")
    .select(fullSelect)
    .eq(attempt.column, attempt.value)
    .maybeSingle();

  if (!result.error) {
    return result;
  }

  const fallbackResult = await supabase
    .from("barbers")
    .select("id, profile_id, reference_code")
    .eq(attempt.column, attempt.value)
    .maybeSingle();

  return fallbackResult;
}

async function resolvePosSaleShopId(
  supabase: SupabaseClient,
  user: UserAccount,
  input: {
    relationshipType: BarberPosSaleQuote["relationshipType"];
    barberId: string;
  }
) {
  if (input.relationshipType === "freelance") {
    return null;
  }

  const candidates = [...new Set((user.locationIds ?? []).map((value) => value.trim()).filter(Boolean))];
  if (!candidates.length) {
    return null;
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    if (UUID_PATTERN.test(candidate)) {
      const idLookup = await supabase
        .from("locations")
        .select("id, reference_code")
        .eq("id", candidate)
        .maybeSingle();

      if (idLookup.error) {
        lastError = idLookup.error;
      } else if (idLookup.data) {
        return (idLookup.data as LocationRow).id;
      }
    }

    const referenceLookup = await supabase
      .from("locations")
      .select("id, reference_code")
      .eq("reference_code", candidate)
      .maybeSingle();

    if (referenceLookup.error) {
      lastError = referenceLookup.error;
      if (isUndefinedColumnError(referenceLookup.error)) {
        continue;
      }
    } else if (referenceLookup.data) {
      return (referenceLookup.data as LocationRow).id;
    }
  }

  logPosSaleShopScopeDefaulted({
    stage: "resolve_shop_scope",
    barberId: input.barberId,
    role: user.role,
    attemptedShopId: candidates[0] ?? null,
    error: lastError ?? undefined
  });
  return null;
}

async function insertPosSaleWithFallbacks(input: {
  supabase: SupabaseClient;
  stage: string;
  primaryPayload: PosSaleInsertPayload;
  basePayload: PosSaleInsertPayload;
  barberId: string;
  role: string | null;
}) {
  const insertPayload = (payload: PosSaleInsertPayload) => input.supabase
    .from(POS_SCHEMA_TABLES.sales)
    .insert(payload)
    .select("*")
    .single();

  const fingerprint = (payload: PosSaleInsertPayload) =>
    JSON.stringify(Object.entries(payload).sort(([left], [right]) => left.localeCompare(right)));
  const attempted = new Set<string>();
  const optionalColumns = new Set([
    "amount_cents",
    "total_amount_cents",
    "payment_method",
    "payment_status",
    "routing_required",
    "cash_recorded_at",
    "completed_at",
    "customer_phone",
    "customer_email",
    "invoice_status"
  ]);

  let payload = input.primaryPayload;
  let result = await insertPayload(payload);
  attempted.add(fingerprint(payload));

  for (let attempt = 0; result.error && attempt < 14; attempt += 1) {
    let nextPayload: PosSaleInsertPayload | null = null;
    const missingColumn = missingColumnName(result.error);

    if (missingColumn && optionalColumns.has(missingColumn) && missingColumn in payload) {
      logPosSaleSchemaFallback(input.stage, result.error, payload);
      nextPayload = { ...payload };
      delete nextPayload[missingColumn as keyof PosSaleInsertPayload];
    } else if (isOptionalPosSaleColumnError(result.error)) {
      logPosSaleSchemaFallback(input.stage, result.error, payload);
      nextPayload = { ...input.basePayload };
      for (const column of optionalColumns) {
        if (column in nextPayload && !(column in input.basePayload)) {
          delete nextPayload[column as keyof PosSaleInsertPayload];
        }
      }
    } else if (isShopScopeInsertError(result.error, payload)) {
      logPosSaleShopScopeDefaulted({
        stage: input.stage,
        barberId: input.barberId,
        role: input.role,
        attemptedShopId: payload.shop_id,
        error: result.error
      });
      nextPayload = { ...payload, shop_id: null };
    }

    if (!nextPayload) {
      break;
    }

    const key = fingerprint(nextPayload);
    if (attempted.has(key)) {
      break;
    }

    payload = nextPayload;
    attempted.add(key);
    result = await insertPayload(payload);
  }

  return result;
}

function logBarberPosResolveFailed(input: {
  user: UserAccount;
  profile: ProfileRow | null;
  attempts: BarberLookupAttempt[];
  error?: unknown;
}) {
  const error = input.error as { code?: string; details?: string; message?: string; name?: string } | undefined;
  console.warn("[barber-pos] resolve_failed", {
    viewerProfileId: input.profile?.id ?? input.user.id,
    role: input.user.role,
    email: input.user.email,
    barberId: input.user.barberId ?? null,
    lookupAttempted: input.attempts.map((attempt) => `${attempt.column}:${attempt.value}`),
    errorName: error?.name ?? null,
    errorMessage: error?.message ?? null,
    postgresCode: error?.code ?? null,
    postgresDetails: error?.details ?? null
  });
}

function normalizeItem(input: PosSaleItemInput | null | undefined, fallbackAmountCents: number) {
  const itemType = input?.itemType ?? (input?.serviceId ? "service" : "custom_amount");
  const quantity = Math.max(1, Math.round(Number(input?.quantity ?? 1)));
  const unitAmountCents = cents(input?.unitAmountCents ?? fallbackAmountCents);
  return {
    item_type: itemType,
    service_id: input?.serviceId ?? null,
    name_snapshot: input?.name?.trim() || (itemType === "service" ? "Service" : "Custom Amount"),
    quantity,
    unit_amount_cents: unitAmountCents,
    total_amount_cents: unitAmountCents * quantity
  };
}

function normalizePaymentMethod(value: BarberPosSaleQuoteInput["paymentMethod"]) {
  if (value === "tap_to_pay" || value === "card_on_file" || value === "cash" || value === "invoice" || value === "test") {
    return value;
  }

  return null;
}

function isUndefinedColumnError(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = candidate?.message ?? "";
  return candidate?.code === "42703"
    || candidate?.code === "PGRST204"
    || /column .* does not exist/i.test(message)
    || /could not find .* column/i.test(message)
    || /schema cache/i.test(message);
}

function isMissingRelationError(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  const message = candidate?.message ?? "";
  return candidate?.code === "42P01"
    || candidate?.code === "PGRST205"
    || /relation .* does not exist/i.test(message)
    || /could not find .* table/i.test(message)
    || /table .* does not exist/i.test(message);
}

function postgresErrorParts(error: unknown) {
  const candidate = error as { code?: string; details?: string; hint?: string; message?: string } | null | undefined;
  return {
    postgresCode: candidate?.code ?? null,
    postgresMessage: candidate?.message ?? null,
    postgresDetails: candidate?.details ?? null,
    postgresHint: candidate?.hint ?? null
  };
}

function failedConstraintFromError(error: unknown) {
  const parts = postgresErrorParts(error);
  const haystack = `${parts.postgresMessage ?? ""} ${parts.postgresDetails ?? ""}`;
  return haystack.match(/constraint "([^"]+)"/i)?.[1] ?? null;
}

function failedColumnFromError(error: unknown) {
  const parts = postgresErrorParts(error);
  const haystack = `${parts.postgresMessage ?? ""} ${parts.postgresDetails ?? ""}`;
  return haystack.match(/Key \(([^)]+)\)=/i)?.[1]
    ?? haystack.match(/column ['"]?([a-z0-9_]+)['"]? does not exist/i)?.[1]
    ?? haystack.match(/Could not find the ['"]([^'"]+)['"] column/i)?.[1]
    ?? haystack.match(/null value in column "([^"]+)"/i)?.[1]
    ?? null;
}

function debugCodeFromPostgresError(error: unknown, fallback = "pos_sale_create_failed") {
  const parts = postgresErrorParts(error);
  if (isMissingRelationError(error)) return "missing_table";
  if (isUndefinedColumnError(error)) return "missing_column";
  if (parts.postgresCode === "23502") return "not_null_violation";
  if (parts.postgresCode === "23503") return "foreign_key_violation";
  if (parts.postgresCode === "23505") return "unique_violation";
  if (parts.postgresCode === "23514") return "check_constraint_violation";
  if (parts.postgresCode === "22P02") return "invalid_uuid";
  return parts.postgresCode ? `postgres_${parts.postgresCode}` : fallback;
}

function buildPosSaleDebug(error: unknown, table: string, fallback = "pos_sale_create_failed"): BarberPosSaleDebug {
  return {
    debugCode: debugCodeFromPostgresError(error, fallback),
    failedTable: table,
    failedConstraint: failedConstraintFromError(error),
    failedColumn: failedColumnFromError(error)
  };
}

function logPosSaleSchemaVerification(input: {
  route: string;
  table: string;
  error?: unknown;
}) {
  const parts = postgresErrorParts(input.error);
  console.warn("[barber-pos] schema_verification_failed", {
    route: input.route,
    table: input.table,
    postgresCode: parts.postgresCode,
    postgresMessage: parts.postgresMessage,
    postgresDetails: parts.postgresDetails,
    postgresHint: parts.postgresHint,
    debugCode: input.error ? debugCodeFromPostgresError(input.error, "pos_schema_verification_failed") : null
  });
}

function logPosSaleSchemaVerificationSucceeded(input: {
  route: string;
  tables: string[];
}) {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  console.info("[barber-pos] schema_verification_succeeded", {
    route: input.route,
    tables: input.tables
  });
}

async function verifyPosStorageSchema(input: {
  supabase: SupabaseClient;
  route: string;
  tables: string[];
  failureMessage?: string;
}) {
  for (const table of input.tables) {
    const result = await input.supabase
      .from(table)
      .select("id")
      .limit(1);

    if (result.error) {
      logPosSaleSchemaVerification({
        route: input.route,
        table,
        error: result.error
      });

      throw new BarberPosSaleError(
        input.failureMessage ?? "Unable to create the POS sale.",
        500,
        buildPosSaleDebug(result.error, table, "pos_schema_verification_failed")
      );
    }
  }

  logPosSaleSchemaVerificationSucceeded({
    route: input.route,
    tables: input.tables
  });
}

function logPosSaleCreateFailed(input: {
  route: string;
  stage: string;
  paymentMethod: string | null;
  payload: Record<string, unknown>;
  error: unknown;
  table: string;
  barberId: string | null;
  profileId: string | null;
  clientId: string | null;
  amountCents: number | null;
  posSaleId?: string | null;
  paymentRequestId?: string | null;
  threadId?: string | null;
}) {
  const parts = postgresErrorParts(input.error);
  const debug = buildPosSaleDebug(input.error, input.table);
  console.warn("[barber-pos] create_failed", {
    route: input.route,
    stage: input.stage,
    payment_method: input.paymentMethod,
    posSaleId: input.posSaleId ?? null,
    paymentRequestId: input.paymentRequestId ?? null,
    threadId: input.threadId ?? null,
    barber_id: input.barberId,
    profile_id: input.profileId,
    client_id: input.clientId,
    amount_cents: input.amountCents,
    payloadKeys: Object.keys(input.payload),
    postgresCode: parts.postgresCode,
    postgresMessage: parts.postgresMessage,
    postgresDetails: parts.postgresDetails,
    postgresHint: parts.postgresHint,
    failedTable: debug.failedTable,
    failedConstraint: debug.failedConstraint,
    failedColumn: debug.failedColumn,
    debugCode: debug.debugCode
  });
}

function logPosPaymentMessageStep(input: {
  stage: string;
  route: string;
  posSaleId?: string | null;
  paymentRequestId?: string | null;
  barberId?: string | null;
  profileId?: string | null;
  clientId?: string | null;
  threadId?: string | null;
  metadata?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
}) {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  console.info("[barber-pos] payment_request_message_step", {
    stage: input.stage,
    route: input.route,
    posSaleId: input.posSaleId ?? null,
    paymentRequestId: input.paymentRequestId ?? null,
    barberId: input.barberId ?? null,
    profileId: input.profileId ?? null,
    clientId: input.clientId ?? null,
    threadId: input.threadId ?? null,
    metadata: input.metadata ?? null,
    result: input.result ?? null
  });
}

function logPosPaymentMessageFailure(input: {
  stage: string;
  route: string;
  table: string;
  error: unknown;
  payload?: Record<string, unknown>;
  posSaleId?: string | null;
  paymentRequestId?: string | null;
  barberId?: string | null;
  profileId?: string | null;
  clientId?: string | null;
  threadId?: string | null;
}) {
  const parts = postgresErrorParts(input.error);
  const debug = buildPosSaleDebug(input.error, input.table, "pos_payment_request_message_failed");
  console.warn("[barber-pos] payment_request_message_failed", {
    stage: input.stage,
    route: input.route,
    table: input.table,
    posSaleId: input.posSaleId ?? null,
    paymentRequestId: input.paymentRequestId ?? null,
    barberId: input.barberId ?? null,
    profileId: input.profileId ?? null,
    clientId: input.clientId ?? null,
    threadId: input.threadId ?? null,
    payloadKeys: Object.keys(input.payload ?? {}),
    postgresCode: parts.postgresCode,
    postgresMessage: parts.postgresMessage,
    postgresDetails: parts.postgresDetails,
    postgresHint: parts.postgresHint,
    failedTable: debug.failedTable,
    failedConstraint: debug.failedConstraint,
    failedColumn: debug.failedColumn,
    debugCode: debug.debugCode
  });
}

function missingColumnName(error: unknown) {
  return failedColumnFromError(error);
}

function logPosSaleSchemaFallback(stage: string, error: unknown, payload: Record<string, unknown>) {
  const candidate = error as { code?: string; details?: string; message?: string } | null | undefined;
  console.warn("[barber-pos] schema_fallback", {
    stage,
    payloadKeys: Object.keys(payload),
    postgresCode: candidate?.code ?? null,
    postgresDetails: candidate?.details ?? null,
    errorMessage: candidate?.message ?? null
  });
}

function logPosSaleShopScopeDefaulted(input: {
  stage: string;
  barberId: string | null;
  role: string | null;
  attemptedShopId: string | null;
  error?: unknown;
}) {
  const candidate = input.error as { code?: string; details?: string; message?: string } | null | undefined;
  console.warn("[barber-pos] shop_scope_defaulted", {
    stage: input.stage,
    barberId: input.barberId,
    role: input.role,
    attemptedShopId: input.attemptedShopId,
    postgresCode: candidate?.code ?? null,
    postgresDetails: candidate?.details ?? null,
    errorMessage: candidate?.message ?? null
  });
}

function isOptionalPosSaleColumnError(error: unknown) {
  if (isUndefinedColumnError(error)) {
    return true;
  }

  const candidate = error as { code?: string; details?: string; message?: string } | null | undefined;
  if (candidate?.code !== "23514") {
    return false;
  }

  const haystack = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return [
    "payment_method",
    "payment_status",
    "amount_cents",
    "total_amount_cents",
    "routing_required",
    "completed_at",
    "cash_recorded_at",
    "customer_phone",
    "customer_email",
    "invoice_status",
    "pos_sales_payment_method_ck",
    "pos_sales_payment_status_ck",
    "pos_sales_routing_required_ck"
  ].some((value) => haystack.includes(value));
}

function isOptionalPosSaleItemInsertError(error: unknown) {
  return isMissingRelationError(error) || isUndefinedColumnError(error);
}

function isShopScopeInsertError(error: unknown, payload: PosSaleInsertPayload) {
  if (!payload.shop_id) {
    return false;
  }

  const candidate = error as { code?: string; details?: string; message?: string } | null | undefined;
  const haystack = `${candidate?.message ?? ""} ${candidate?.details ?? ""}`.toLowerCase();
  if (candidate?.code === "22P02") {
    return haystack.includes("uuid") || haystack.includes("shop_id");
  }

  if (candidate?.code !== "23503") {
    return false;
  }

  return haystack.includes("shop_id")
    || haystack.includes("pos_sales")
    || haystack.includes("locations")
    || haystack.includes("shops");
}

function logCashCreateFailed(input: {
  stage: string;
  payload: Record<string, unknown>;
  error: unknown;
  barberId: string | null;
  role: string | null;
}) {
  const candidate = input.error as { code?: string; details?: string; message?: string } | null | undefined;
  console.warn("[barber-pos] cash_create_failed", {
    stage: input.stage,
    payloadKeys: Object.keys(input.payload),
    barberId: input.barberId,
    role: input.role,
    postgresCode: candidate?.code ?? null,
    postgresDetails: candidate?.details ?? null,
    errorMessage: candidate?.message ?? null
  });
}

function calculateSplit(input: {
  serviceCents: number;
  tipCents: number;
  relationshipType: BarberPosSaleQuote["relationshipType"];
  autoBoothPercent?: number | string | null;
  outstandingRentCents?: number | null;
}) {
  const platformFeeCents = Math.round(input.serviceCents * PLATFORM_FEE_RATE);
  const netServiceAfterPlatformCents = Math.max(input.serviceCents - platformFeeCents, 0);

  // Under Full Booth Rent and freelance the barber keeps everything after the
  // platform fee. Rent is billed separately.
  if (input.relationshipType !== "autobooth_rent") {
    return {
      platformFeeCents,
      barberPayoutCents: netServiceAfterPlatformCents + input.tipCents,
      shopSplitCents: 0,
      autoBoothRentAppliedCents: 0
    };
  }

  const rateNumber = Number(input.autoBoothPercent ?? 0);
  // Stored values may be a fraction or a percentage; both mean the same portion.
  const approvedPortion = rateNumber > 1 ? rateNumber / 100 : rateNumber;
  const application = calculateAutoBoothRentApplication({
    model: "autobooth_rent",
    // No approved portion means nothing is applied. There is no default rate:
    // inventing one would take money the owner never approved.
    autoBoothPercent: approvedPortion > 0 && approvedPortion <= 1 ? approvedPortion : 0,
    // Tips are never eligible for rent application.
    eligibleProceedsCents: netServiceAfterPlatformCents,
    outstandingRentCents: Math.max(Math.trunc(input.outstandingRentCents ?? 0), 0),
    paymentStatus: "captured"
  });

  return {
    platformFeeCents,
    barberPayoutCents: application.barberRemainderCents + input.tipCents,
    shopSplitCents: application.appliedToRentCents,
    autoBoothRentAppliedCents: application.appliedToRentCents
  };
}

export function quoteBarberPosSale(input: BarberPosSaleQuoteInput, relationship?: {
  relationshipType?: BarberPosSaleQuote["relationshipType"] | string | null;
  autoBoothPercent?: number | string | null;
  outstandingRentCents?: number | null;
}): BarberPosSaleQuote {
  const subtotalCents = cents(input.amountCents);
  if (subtotalCents <= 0) {
    throw new BarberPosSaleError("Enter a positive amount before charging.", 400);
  }

  const discountCents = Math.min(cents(input.discountCents), subtotalCents);
  const tipCents = cents(input.tipCents);
  const clientFeeCents = 0;
  const totalCents = Math.max(subtotalCents - discountCents + tipCents + clientFeeCents, 0);
  const relationshipType = normalizeRelationshipType(String(relationship?.relationshipType ?? "freelance"));
  const split = calculateSplit({
    serviceCents: Math.max(subtotalCents - discountCents, 0),
    tipCents,
    relationshipType,
    autoBoothPercent: relationship?.autoBoothPercent,
    outstandingRentCents: relationship?.outstandingRentCents
  });

  return {
    subtotalCents,
    platformFeeCents: split.platformFeeCents,
    clientFeeCents,
    discountCents,
    tipCents,
    totalCents,
    barberPayoutCents: split.barberPayoutCents,
    shopSplitCents: split.shopSplitCents,
    relationshipType
  };
}

async function resolveBarberActor(supabase: SupabaseClient, user: UserAccount) {
  if (!isBarberAccountRole(user.role)) {
    throw new BarberPosSaleError("Only barber accounts can run POS sales.", 403);
  }

  const profile = await maybeLoadProfileForPosUser(supabase, user);
  const barberReference = user.barberId?.trim();
  const canonicalReference = barberReference ? canonicalBarberUuid(barberReference) : null;
  const attempts = uniqueLookupAttempts([
    barberReference && UUID_PATTERN.test(barberReference) ? { column: "id", value: barberReference } : null,
    barberReference ? { column: "reference_code", value: barberReference } : null,
    canonicalReference ? { column: "id", value: canonicalReference } : null,
    profile?.id ? { column: "profile_id", value: profile.id } : null,
    { column: "profile_id", value: user.id }
  ]);

  let lastError: unknown = null;
  let barber: BarberRow | null = null;

  for (const attempt of attempts) {
    const barberResult = await loadBarberByAttempt(supabase, attempt);
    if (barberResult.error) {
      lastError = barberResult.error;
      continue;
    }

    if (barberResult.data) {
      barber = barberResult.data as BarberRow;
      break;
    }
  }

  if (!barber) {
    logBarberPosResolveFailed({ user, profile, attempts, error: lastError ?? undefined });
    throw new BarberPosSaleError(
      lastError ? "Unable to resolve the barber POS account." : "Barber account not found for POS sale.",
      lastError ? 500 : 404
    );
  }

  const relationshipType = normalizeRelationshipType(
    barber.compensation_model
      ?? barber.default_money_relationship
      ?? barber.barber_subtype
      ?? user.barberSubtype
      ?? "freelance"
  );
  const shopId = await resolvePosSaleShopId(supabase, user, {
    relationshipType,
    barberId: barber.id
  });

  return {
    profileId: profile?.id ?? barber.profile_id ?? user.id,
    barber,
    relationshipType,
    shopId
  };
}

async function loadPosSaleForActor(supabase: SupabaseClient, user: UserAccount, saleId: string) {
  const actor = await resolveBarberActor(supabase, user);
  const result = await supabase
    .from(POS_SCHEMA_TABLES.sales)
    .select("*")
    .eq("id", saleId)
    .eq("barber_id", actor.barber.id)
    .maybeSingle();

  if (result.error) {
    logPosSaleSchemaVerification({
      route: "POS sale load",
      table: POS_SCHEMA_TABLES.sales,
      error: result.error
    });
    throw new BarberPosSaleError("Unable to load the POS sale.", 500, buildPosSaleDebug(result.error, POS_SCHEMA_TABLES.sales, "pos_sale_load_failed"));
  }

  if (!result.data) {
    throw new BarberPosSaleError("POS sale not found.", 404);
  }

  return { actor, sale: result.data as PosSaleRow };
}

function getPosSaleAmountCents(sale: PosSaleRow) {
  return cents(sale.total_cents ?? sale.total_amount_cents ?? sale.amount_cents ?? 0);
}

async function updatePosSaleStateWithFallbacks(input: {
  supabase: SupabaseClient;
  saleId: string;
  stage: string;
  payload: Record<string, unknown>;
  fallbackPayload: Record<string, unknown>;
}) {
  let result = await input.supabase
    .from(POS_SCHEMA_TABLES.sales)
    .update(input.payload)
    .eq("id", input.saleId)
    .select("*")
    .single();

  if (result.error && isOptionalPosSaleColumnError(result.error)) {
    logPosSaleSchemaFallback(input.stage, result.error, input.payload);
    result = await input.supabase
      .from(POS_SCHEMA_TABLES.sales)
      .update(input.fallbackPayload)
      .eq("id", input.saleId)
      .select("*")
      .single();
  }

  if (result.error) {
    logPosSaleCreateFailed({
      route: input.stage,
      stage: "pos_sale_update",
      paymentMethod: typeof input.payload.payment_method === "string" ? input.payload.payment_method : null,
      payload: input.payload,
      error: result.error,
      table: POS_SCHEMA_TABLES.sales,
      barberId: null,
      profileId: null,
      clientId: null,
      amountCents: null
    });
    throw new BarberPosSaleError("Unable to update the POS sale.", 500, buildPosSaleDebug(result.error, POS_SCHEMA_TABLES.sales, "pos_sale_update_failed"));
  }

  return result.data as PosSaleRow;
}

async function resolvePosSaleClientId(supabase: SupabaseClient, clientReference?: string | null) {
  const reference = clientReference?.trim();
  if (!reference) {
    return null;
  }

  const attempts: Array<{ column: "id" | "profile_id" | "reference_code"; value: string }> = [
    UUID_PATTERN.test(reference) ? { column: "id", value: reference } : null,
    UUID_PATTERN.test(reference) ? { column: "profile_id", value: reference } : null,
    { column: "reference_code", value: reference }
  ].filter((attempt): attempt is { column: "id" | "profile_id" | "reference_code"; value: string } => Boolean(attempt));

  for (const attempt of attempts) {
    const result = await supabase
      .from("clients")
      .select("id, profile_id, reference_code")
      .eq(attempt.column, attempt.value)
      .maybeSingle();

    if (result.error) {
      if (attempt.column === "reference_code" && isUndefinedColumnError(result.error)) {
        continue;
      }

      throw new BarberPosSaleError("Unable to resolve the selected client for POS sale.", 500);
    }

    if (result.data) {
      return (result.data as ClientRow).id;
    }
  }

  throw new BarberPosSaleError("Selected client could not be resolved for POS sale.", 409);
}

async function readDefaultPaymentMethodForClient(supabase: SupabaseClient, clientId: string) {
  const defaultResult = await supabase
    .from("payment_methods")
    .select("id, provider_payment_method_id, brand, last4, is_default")
    .eq("client_id", clientId)
    .eq("is_default", true)
    .maybeSingle();

  if (defaultResult.error) {
    throw new BarberPosSaleError("Unable to load the client's saved card.", 500);
  }

  if (defaultResult.data) {
    return defaultResult.data as PaymentMethodRow;
  }

  const fallbackResult = await supabase
    .from("payment_methods")
    .select("id, provider_payment_method_id, brand, last4, is_default")
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();

  if (fallbackResult.error) {
    throw new BarberPosSaleError("Unable to load the client's saved card.", 500);
  }

  return (fallbackResult.data as PaymentMethodRow | null) ?? null;
}

async function readClientForPosRequest(supabase: SupabaseClient, clientId: string) {
  const clientResult = await supabase
    .from("clients")
    .select("id, profile_id, reference_code")
    .eq("id", clientId)
    .maybeSingle();

  if (clientResult.error) {
    throw new BarberPosSaleError("Unable to load the selected client for payment request.", 500);
  }

  const client = clientResult.data as ClientRow | null;
  if (!client?.profile_id) {
    throw new BarberPosSaleError("Selected client could not be resolved for POS payment request.", 409);
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, email, role, full_name")
    .eq("id", client.profile_id)
    .maybeSingle();

  if (profileResult.error) {
    throw new BarberPosSaleError("Unable to load the selected client's messaging profile.", 500);
  }

  if (!profileResult.data) {
    throw new BarberPosSaleError("Selected client does not have a messaging profile.", 409);
  }

  return {
    client,
    profile: profileResult.data as ProfileRow
  };
}

async function resolveClientActorForPosRequest(supabase: SupabaseClient, user: UserAccount) {
  if (!isClientRole(user.role)) {
    throw new BarberPosSaleError("Only client accounts can respond to POS payment requests.", 403);
  }

  const profile = await maybeLoadProfileForPosUser(supabase, user);
  const clientReference = user.clientId?.trim();
  const attempts = [
    clientReference && UUID_PATTERN.test(clientReference) ? { column: "id" as const, value: clientReference } : null,
    clientReference && UUID_PATTERN.test(clientReference) ? { column: "profile_id" as const, value: clientReference } : null,
    clientReference ? { column: "reference_code" as const, value: clientReference } : null,
    profile?.id ? { column: "profile_id" as const, value: profile.id } : null,
    { column: "profile_id" as const, value: user.id }
  ].filter((attempt): attempt is { column: "id" | "profile_id" | "reference_code"; value: string } =>
    Boolean(attempt?.value?.trim())
  );
  const seen = new Set<string>();

  for (const attempt of attempts) {
    const key = `${attempt.column}:${attempt.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const result = await supabase
      .from("clients")
      .select("id, profile_id, reference_code")
      .eq(attempt.column, attempt.value)
      .maybeSingle();

    if (result.error) {
      if (attempt.column === "reference_code" && isUndefinedColumnError(result.error)) {
        continue;
      }
      throw new BarberPosSaleError("Unable to resolve the client payment account.", 500);
    }

    if (result.data) {
      return {
        client: result.data as ClientRow,
        profile: profile ?? null
      };
    }
  }

  throw new BarberPosSaleError("Client payment account not found.", 404);
}

async function readProfileForPosRequest(supabase: SupabaseClient, profileId: string) {
  const profileResult = await supabase
    .from("profiles")
    .select("id, email, role, full_name")
    .eq("id", profileId)
    .maybeSingle();

  if (profileResult.error) {
    throw new BarberPosSaleError("Unable to load the barber messaging profile.", 500);
  }

  if (!profileResult.data) {
    throw new BarberPosSaleError("Barber messaging profile not found.", 409);
  }

  return profileResult.data as ProfileRow;
}

async function findSharedThreadIds(
  supabase: SupabaseClient,
  leftProfileId: string,
  rightProfileId: string,
  context?: {
    route: string;
    posSaleId?: string | null;
    paymentRequestId?: string | null;
    barberId?: string | null;
    clientId?: string | null;
  }
) {
  const [leftRows, rightRows] = await Promise.all([
    supabase
      .from("thread_participants")
      .select("thread_id")
      .eq("profile_id", leftProfileId),
    supabase
      .from("thread_participants")
      .select("thread_id")
      .eq("profile_id", rightProfileId)
  ]);

  if (leftRows.error || rightRows.error) {
    logPosPaymentMessageFailure({
      stage: "thread_participant_lookup",
      route: context?.route ?? "POST /api/barber/pos-sales/[id]/payment-request",
      table: "thread_participants",
      error: leftRows.error ?? rightRows.error,
      payload: { leftProfileId, rightProfileId },
      posSaleId: context?.posSaleId,
      paymentRequestId: context?.paymentRequestId,
      barberId: context?.barberId,
      profileId: leftProfileId,
      clientId: context?.clientId
    });
    throw new BarberPosSaleError("Unable to resolve existing payment request conversation.", 500);
  }

  const leftIds = new Set((leftRows.data ?? []).map((row) => row.thread_id as string));
  const sharedIds = (rightRows.data ?? [])
    .map((row) => row.thread_id as string)
    .filter((threadId) => leftIds.has(threadId));
  logPosPaymentMessageStep({
    stage: "thread_participant_lookup",
    route: context?.route ?? "POST /api/barber/pos-sales/[id]/payment-request",
    posSaleId: context?.posSaleId,
    paymentRequestId: context?.paymentRequestId,
    barberId: context?.barberId,
    profileId: leftProfileId,
    clientId: context?.clientId,
    result: {
      leftCount: leftRows.data?.length ?? 0,
      rightCount: rightRows.data?.length ?? 0,
      sharedCount: sharedIds.length
    }
  });
  return sharedIds;
}

async function ensurePosPaymentRequestThreadParticipants(input: {
  supabase: SupabaseClient;
  threadId: string;
  barberProfile: ProfileRow;
  clientProfile: ProfileRow;
  route: string;
  posSaleId?: string | null;
  paymentRequestId?: string | null;
  barberId?: string | null;
  clientId?: string | null;
}) {
  const participantsResult = await input.supabase
    .from("thread_participants")
    .select("profile_id")
    .eq("thread_id", input.threadId);

  if (participantsResult.error) {
    logPosPaymentMessageFailure({
      stage: "thread_participant_verify",
      route: input.route,
      table: "thread_participants",
      error: participantsResult.error,
      payload: { thread_id: input.threadId },
      posSaleId: input.posSaleId,
      paymentRequestId: input.paymentRequestId,
      barberId: input.barberId,
      profileId: input.barberProfile.id,
      clientId: input.clientId,
      threadId: input.threadId
    });
    throw new BarberPosSaleError("Unable to verify payment request conversation participants.", 500, buildPosSaleDebug(participantsResult.error, "thread_participants", "pos_payment_request_participant_verify_failed"));
  }

  const existingProfileIds = new Set((participantsResult.data ?? []).map((row) => row.profile_id as string));
  const participantRows = [
    {
      thread_id: input.threadId,
      profile_id: input.clientProfile.id,
      thread_role: input.clientProfile.role ?? "client_user"
    },
    {
      thread_id: input.threadId,
      profile_id: input.barberProfile.id,
      thread_role: input.barberProfile.role ?? "barber_user"
    }
  ].filter((row) => !existingProfileIds.has(row.profile_id));

  if (!participantRows.length) {
    logPosPaymentMessageStep({
      stage: "thread_participants_already_present",
      route: input.route,
      posSaleId: input.posSaleId,
      paymentRequestId: input.paymentRequestId,
      barberId: input.barberId,
      profileId: input.barberProfile.id,
      clientId: input.clientId,
      threadId: input.threadId,
      result: { participantCount: existingProfileIds.size }
    });
    return;
  }

  const participantsInsert = await input.supabase
    .from("thread_participants")
    .insert(participantRows);

  if (participantsInsert.error && postgresErrorParts(participantsInsert.error).postgresCode !== "23505") {
    logPosPaymentMessageFailure({
      stage: "thread_participant_insert",
      route: input.route,
      table: "thread_participants",
      error: participantsInsert.error,
      payload: {
        rows: participantRows.map((row) => ({
          thread_id: row.thread_id,
          profile_id: row.profile_id,
          thread_role: row.thread_role
        }))
      },
      posSaleId: input.posSaleId,
      paymentRequestId: input.paymentRequestId,
      barberId: input.barberId,
      profileId: input.barberProfile.id,
      clientId: input.clientId,
      threadId: input.threadId
    });
    throw new BarberPosSaleError("Unable to attach payment request conversation participants.", 500, buildPosSaleDebug(participantsInsert.error, "thread_participants", "pos_payment_request_participant_insert_failed"));
  }

  if (participantsInsert.error) {
    logPosPaymentMessageFailure({
      stage: "thread_participant_insert_duplicate_ignored",
      route: input.route,
      table: "thread_participants",
      error: participantsInsert.error,
      payload: { thread_id: input.threadId },
      posSaleId: input.posSaleId,
      paymentRequestId: input.paymentRequestId,
      barberId: input.barberId,
      profileId: input.barberProfile.id,
      clientId: input.clientId,
      threadId: input.threadId
    });
    return;
  }

  logPosPaymentMessageStep({
    stage: "thread_participants_inserted",
    route: input.route,
    posSaleId: input.posSaleId,
    paymentRequestId: input.paymentRequestId,
    barberId: input.barberId,
    profileId: input.barberProfile.id,
    clientId: input.clientId,
    threadId: input.threadId,
    result: { insertedCount: participantRows.length }
  });
}

async function createOrGetPosPaymentRequestThread(input: {
  supabase: SupabaseClient;
  barberProfile: ProfileRow;
  clientProfile: ProfileRow;
  createdAt: string;
  route?: string;
  posSaleId?: string | null;
  paymentRequestId?: string | null;
  barberId?: string | null;
  clientId?: string | null;
}) {
  const route = input.route ?? "POST /api/barber/pos-sales/[id]/payment-request";
  const sharedThreadIds = await findSharedThreadIds(input.supabase, input.barberProfile.id, input.clientProfile.id, {
    route,
    posSaleId: input.posSaleId,
    paymentRequestId: input.paymentRequestId,
    barberId: input.barberId,
    clientId: input.clientId
  });

  if (sharedThreadIds.length) {
    const threadResult = await input.supabase
      .from("message_threads")
      .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
      .in("id", sharedThreadIds)
      .eq("thread_type", "client_barber")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (threadResult.error) {
      logPosPaymentMessageFailure({
        stage: "thread_reuse_lookup",
        route,
        table: "message_threads",
        error: threadResult.error,
        payload: { sharedThreadIds, thread_type: "client_barber" },
        posSaleId: input.posSaleId,
        paymentRequestId: input.paymentRequestId,
        barberId: input.barberId,
        profileId: input.barberProfile.id,
        clientId: input.clientId
      });
      throw new BarberPosSaleError("Unable to load existing payment request conversation.", 500, buildPosSaleDebug(threadResult.error, "message_threads", "pos_payment_request_thread_lookup_failed"));
    }

    const existingThread = (threadResult.data ?? [])[0] as { id: string } | undefined;
    if (existingThread?.id) {
      await ensurePosPaymentRequestThreadParticipants({
        supabase: input.supabase,
        threadId: existingThread.id,
        barberProfile: input.barberProfile,
        clientProfile: input.clientProfile,
        route,
        posSaleId: input.posSaleId,
        paymentRequestId: input.paymentRequestId,
        barberId: input.barberId,
        clientId: input.clientId
      });
      logPosPaymentMessageStep({
        stage: "thread_reused",
        route,
        posSaleId: input.posSaleId,
        paymentRequestId: input.paymentRequestId,
        barberId: input.barberId,
        profileId: input.barberProfile.id,
        clientId: input.clientId,
        threadId: existingThread.id
      });
      return existingThread.id;
    }
  }

  const baseThreadPayload = {
    thread_type: "client_barber",
    appointment_id: null,
    created_by_profile_id: input.barberProfile.id,
    updated_at: input.createdAt
  };
  let threadPayload: typeof baseThreadPayload & { location_id?: null } = {
    ...baseThreadPayload,
    location_id: null
  };
  let threadInsert = await input.supabase
    .from("message_threads")
    .insert(threadPayload)
    .select("id")
    .single();

  if (threadInsert.error && isUndefinedColumnError(threadInsert.error) && failedColumnFromError(threadInsert.error) === "location_id") {
    logPosPaymentMessageFailure({
      stage: "thread_create_location_column_fallback",
      route,
      table: "message_threads",
      error: threadInsert.error,
      payload: threadPayload,
      posSaleId: input.posSaleId,
      paymentRequestId: input.paymentRequestId,
      barberId: input.barberId,
      profileId: input.barberProfile.id,
      clientId: input.clientId
    });
    threadPayload = baseThreadPayload;
    threadInsert = await input.supabase
      .from("message_threads")
      .insert(threadPayload)
      .select("id")
      .single();
  }

  if (threadInsert.error) {
    logPosPaymentMessageFailure({
      stage: "thread_create",
      route,
      table: "message_threads",
      error: threadInsert.error,
      payload: threadPayload,
      posSaleId: input.posSaleId,
      paymentRequestId: input.paymentRequestId,
      barberId: input.barberId,
      profileId: input.barberProfile.id,
      clientId: input.clientId
    });
    throw new BarberPosSaleError("Unable to create payment request conversation.", 500, buildPosSaleDebug(threadInsert.error, "message_threads", "pos_payment_request_thread_create_failed"));
  }

  const threadId = threadInsert.data.id as string;
  await ensurePosPaymentRequestThreadParticipants({
    supabase: input.supabase,
    threadId,
    barberProfile: input.barberProfile,
    clientProfile: input.clientProfile,
    route,
    posSaleId: input.posSaleId,
    paymentRequestId: input.paymentRequestId,
    barberId: input.barberId,
    clientId: input.clientId
  });
  logPosPaymentMessageStep({
    stage: "thread_created",
    route,
    posSaleId: input.posSaleId,
    paymentRequestId: input.paymentRequestId,
    barberId: input.barberId,
    profileId: input.barberProfile.id,
    clientId: input.clientId,
    threadId
  });
  return threadId;
}

function isPosPaymentRequestExpired(request: PosPaymentRequestRow) {
  return Boolean(request.expires_at && new Date(request.expires_at).getTime() < Date.now());
}

function isPendingPosPaymentRequestStatus(status: PosPaymentRequestRow["status"]) {
  return ACTIVE_POS_PAYMENT_REQUEST_STATUSES.includes(status);
}

function isClientActionablePosPaymentRequestStatus(status: PosPaymentRequestRow["status"]) {
  return CLIENT_ACTIONABLE_POS_PAYMENT_REQUEST_STATUSES.includes(status);
}

function isPaidPosPaymentRequestStatus(status: PosPaymentRequestRow["status"]) {
  return PAID_POS_PAYMENT_REQUEST_STATUSES.includes(status);
}

function posPaymentRequestTime(request: Pick<PosPaymentRequestRow, "updated_at" | "created_at" | "requested_at">) {
  return new Date(request.updated_at ?? request.created_at ?? request.requested_at).getTime();
}

function posPaymentRequestRequestedTime(request: Pick<PosPaymentRequestRow, "requested_at" | "created_at" | "updated_at">) {
  return new Date(request.requested_at ?? request.created_at ?? request.updated_at).getTime();
}

function sortPosPaymentRequestsNewestFirst<T extends Pick<PosPaymentRequestRow, "updated_at" | "created_at" | "requested_at">>(requests: T[]) {
  return [...requests].sort((left, right) => {
    const rightTime = posPaymentRequestTime(right);
    const leftTime = posPaymentRequestTime(left);
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return String("id" in right ? right.id : "").localeCompare(String("id" in left ? left.id : ""));
  });
}

function isWithinPosPaymentRequestDuplicateWindow(left: PosPaymentRequestRow, right: PosPaymentRequestRow) {
  const leftTime = posPaymentRequestRequestedTime(left);
  const rightTime = posPaymentRequestRequestedTime(right);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return true;
  }
  return Math.abs(leftTime - rightTime) <= POS_PAYMENT_REQUEST_DUPLICATE_WINDOW_MS;
}

async function loadClientPosPaymentRequest(input: {
  supabase: SupabaseClient;
  requestId: string;
  clientId: string;
}) {
  const requestResult = await input.supabase
    .from(POS_SCHEMA_TABLES.paymentRequests)
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();

  if (requestResult.error) {
    throw new BarberPosSaleError("Unable to load this payment request.", 500, buildPosSaleDebug(requestResult.error, POS_SCHEMA_TABLES.paymentRequests, "pos_payment_request_load_failed"));
  }

  const request = requestResult.data as PosPaymentRequestRow | null;
  if (!request) {
    throw new BarberPosSaleError("Request not found.", 404);
  }

  if (request.client_id !== input.clientId) {
    throw new BarberPosSaleError("This payment request belongs to another client.", 403);
  }

  const saleResult = await input.supabase
    .from(POS_SCHEMA_TABLES.sales)
    .select("*")
    .eq("id", request.pos_sale_id)
    .maybeSingle();

  if (saleResult.error) {
    throw new BarberPosSaleError("Unable to load this POS sale.", 500, buildPosSaleDebug(saleResult.error, POS_SCHEMA_TABLES.sales, "pos_sale_load_failed"));
  }

  const sale = saleResult.data as PosSaleRow | null;
  if (!sale) {
    throw new BarberPosSaleError("POS sale not found.", 404);
  }

  if (sale.client_id && sale.client_id !== input.clientId) {
    throw new BarberPosSaleError("This POS sale belongs to another client.", 403);
  }

  return { request, sale };
}

function buildPosPaymentRequestMetadata(input: {
  request: Pick<PosPaymentRequestRow, "id" | "pos_sale_id" | "amount_cents" | "status">;
}): PosPaymentRequestMessageMetadata {
  return {
    kind: "pos_payment_request",
    paymentRequestId: input.request.id,
    posSaleId: input.request.pos_sale_id,
    amountCents: cents(input.request.amount_cents),
    status: input.request.status
  };
}

function messageBodyReferencesPaymentRequest(body: unknown, requestId: string) {
  return typeof body === "string"
    && body.match(/Payment request ID:\s*([^\s]+)/i)?.[1] === requestId;
}

async function updatePosPaymentRequestWithFallbacks(input: {
  supabase: SupabaseClient;
  requestId: string;
  payload: Record<string, unknown>;
}) {
  let result = await input.supabase
    .from(POS_SCHEMA_TABLES.paymentRequests)
    .update(input.payload)
    .eq("id", input.requestId)
    .select("*")
    .single();

  if (result.error && isUndefinedColumnError(result.error) && "paid_at" in input.payload) {
    const fallbackPayload = { ...input.payload };
    delete fallbackPayload.paid_at;
    result = await input.supabase
      .from(POS_SCHEMA_TABLES.paymentRequests)
      .update(fallbackPayload)
      .eq("id", input.requestId)
      .select("*")
      .single();
  }

  if (result.error) {
    throw new BarberPosSaleError("Unable to update this payment request.", 500, buildPosSaleDebug(result.error, POS_SCHEMA_TABLES.paymentRequests, "pos_payment_request_update_failed"));
  }

  return result.data as PosPaymentRequestRow;
}

async function closeDuplicatePosPaymentRequest(input: {
  supabase: SupabaseClient;
  requestId: string;
  status: "superseded" | "canceled_duplicate" | "canceled";
  closedAt: string;
}) {
  try {
    return await updatePosPaymentRequestWithFallbacks({
      supabase: input.supabase,
      requestId: input.requestId,
      payload: {
        status: input.status,
        updated_at: input.closedAt
      }
    });
  } catch (error) {
    const parts = postgresErrorParts(error);
    console.warn("[barber-pos] duplicate_request_status_fallback", {
      paymentRequestId: input.requestId,
      preferredStatus: input.status,
      fallbackStatus: "declined",
      postgresCode: parts.postgresCode,
      postgresMessage: parts.postgresMessage,
      postgresDetails: parts.postgresDetails,
      postgresHint: parts.postgresHint
    });
    return updatePosPaymentRequestWithFallbacks({
      supabase: input.supabase,
      requestId: input.requestId,
      payload: {
        status: "declined",
        declined_at: input.closedAt,
        updated_at: input.closedAt
      }
    });
  }
}

async function readPosPaymentRequestsForSale(supabase: SupabaseClient, saleId: string) {
  const result = await supabase
    .from(POS_SCHEMA_TABLES.paymentRequests)
    .select("*")
    .eq("pos_sale_id", saleId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (result.error) {
    throw new BarberPosSaleError("Unable to load existing POS payment requests.", 500, buildPosSaleDebug(result.error, POS_SCHEMA_TABLES.paymentRequests, "pos_payment_request_load_failed"));
  }

  return sortPosPaymentRequestsNewestFirst((result.data ?? []) as PosPaymentRequestRow[]);
}

function selectReusablePaymentRequest(requests: PosPaymentRequestRow[]) {
  const sorted = sortPosPaymentRequestsNewestFirst(requests);
  return sorted.find((request) => isPendingPosPaymentRequestStatus(request.status))
    ?? sorted.find((request) => isPaidPosPaymentRequestStatus(request.status))
    ?? null;
}

async function readDuplicatePaymentRequestsForSaleContext(input: {
  supabase: SupabaseClient;
  sale: PosSaleRow;
  statusFilter?: (status: PosPaymentRequestRow["status"]) => boolean;
}) {
  if (!input.sale.client_id) {
    return [];
  }

  const result = await input.supabase
    .from(POS_SCHEMA_TABLES.paymentRequests)
    .select("*")
    .eq("barber_id", input.sale.barber_id)
    .eq("client_id", input.sale.client_id)
    .eq("amount_cents", getPosSaleAmountCents(input.sale))
    .order("updated_at", { ascending: false })
    .limit(50);

  if (result.error) {
    throw new BarberPosSaleError("Unable to inspect duplicate POS payment requests.", 500, buildPosSaleDebug(result.error, POS_SCHEMA_TABLES.paymentRequests, "pos_payment_request_duplicate_scan_failed"));
  }

  const statusFilter = input.statusFilter ?? (() => true);
  return sortPosPaymentRequestsNewestFirst((result.data ?? []) as PosPaymentRequestRow[])
    .filter((request) => request.pos_sale_id !== input.sale.id)
    .filter((request) => statusFilter(request.status));
}

async function loadPosSaleById(supabase: SupabaseClient, saleId: string) {
  const result = await supabase
    .from(POS_SCHEMA_TABLES.sales)
    .select("*")
    .eq("id", saleId)
    .maybeSingle();

  if (result.error) {
    throw new BarberPosSaleError("Unable to load related POS sale.", 500, buildPosSaleDebug(result.error, POS_SCHEMA_TABLES.sales, "pos_sale_load_failed"));
  }

  return result.data as PosSaleRow | null;
}

async function markPosSaleVoidedForDuplicate(input: {
  supabase: SupabaseClient;
  saleId: string;
  at: string;
}) {
  await updatePosSaleStateWithFallbacks({
    supabase: input.supabase,
    saleId: input.saleId,
    stage: "pos_payment_request_duplicate_sale_void",
    payload: {
      status: "voided",
      payment_status: "failed",
      updated_at: input.at
    },
    fallbackPayload: {
      status: "voided",
      updated_at: input.at
    }
  }).catch((error) => {
    const parts = postgresErrorParts(error);
    console.warn("[barber-pos] duplicate_sale_void_failed", {
      saleId: input.saleId,
      postgresCode: parts.postgresCode,
      postgresMessage: parts.postgresMessage,
      postgresDetails: parts.postgresDetails,
      postgresHint: parts.postgresHint
    });
  });
}

async function findReusableDuplicatePaymentRequest(input: {
  supabase: SupabaseClient;
  sale: PosSaleRow;
}) {
  const candidates = await readDuplicatePaymentRequestsForSaleContext({
    supabase: input.supabase,
    sale: input.sale,
    statusFilter: isPendingPosPaymentRequestStatus
  });

  return candidates.find((candidate) => {
    const pseudoCurrent = {
      ...candidate,
      requested_at: input.sale.created_at,
      created_at: input.sale.created_at,
      updated_at: input.sale.updated_at ?? input.sale.created_at
    };
    return isWithinPosPaymentRequestDuplicateWindow(candidate, pseudoCurrent);
  }) ?? null;
}

async function supersedeSiblingPendingPaymentRequests(input: {
  supabase: SupabaseClient;
  paidRequest: PosPaymentRequestRow;
  sale: PosSaleRow;
  finalizedAt: string;
}) {
  const siblings = await readDuplicatePaymentRequestsForSaleContext({
    supabase: input.supabase,
    sale: input.sale,
    statusFilter: isPendingPosPaymentRequestStatus
  }).catch((error) => {
    const parts = postgresErrorParts(error);
    console.warn("[barber-pos] duplicate_request_scan_failed", {
      paymentRequestId: input.paidRequest.id,
      posSaleId: input.sale.id,
      postgresCode: parts.postgresCode,
      postgresMessage: parts.postgresMessage,
      postgresDetails: parts.postgresDetails,
      postgresHint: parts.postgresHint
    });
    return [];
  });

  const closeable = siblings.filter((request) =>
    request.id !== input.paidRequest.id
    && isWithinPosPaymentRequestDuplicateWindow(request, input.paidRequest)
  );
  if (!closeable.length) {
    return [];
  }

  await Promise.all(closeable.map(async (request) => {
    const updatedRequest = await closeDuplicatePosPaymentRequest({
      supabase: input.supabase,
      requestId: request.id,
      status: "superseded",
      closedAt: input.finalizedAt
    }).catch((error) => {
      const parts = postgresErrorParts(error);
      console.warn("[barber-pos] duplicate_request_supersede_failed", {
        paymentRequestId: request.id,
        paidPaymentRequestId: input.paidRequest.id,
        posSaleId: request.pos_sale_id,
        postgresCode: parts.postgresCode,
        postgresMessage: parts.postgresMessage,
        postgresDetails: parts.postgresDetails,
        postgresHint: parts.postgresHint
      });
      return null;
    });

    const duplicateSale = await loadPosSaleById(input.supabase, request.pos_sale_id).catch(() => null);
    if (duplicateSale && duplicateSale.status !== "paid") {
      await markPosSaleVoidedForDuplicate({
        supabase: input.supabase,
        saleId: duplicateSale.id,
        at: input.finalizedAt
      });
    }

    await appendPosPaymentRequestSystemMessage({
      supabase: input.supabase,
      threadId: request.message_thread_id,
      body: "Payment request superseded. Another request for this sale was paid.",
      createdAt: input.finalizedAt
    });

    return updatedRequest;
  }));

  return closeable;
}

async function findPaidDuplicatePaymentRequest(input: {
  supabase: SupabaseClient;
  request: PosPaymentRequestRow;
  sale: PosSaleRow;
}) {
  const candidates = await readDuplicatePaymentRequestsForSaleContext({
    supabase: input.supabase,
    sale: input.sale,
    statusFilter: isPaidPosPaymentRequestStatus
  });

  return candidates.find((candidate) =>
    candidate.id !== input.request.id
    && isWithinPosPaymentRequestDuplicateWindow(candidate, input.request)
  ) ?? null;
}

async function appendPosPaymentRequestSystemMessage(input: {
  supabase: SupabaseClient;
  threadId: string | null;
  body: string;
  createdAt: string;
}) {
  if (!input.threadId) {
    return;
  }

  const [messageInsert, threadUpdate] = await Promise.all([
    input.supabase
      .from("messages")
      .insert({
        thread_id: input.threadId,
        sender_profile_id: null,
        body: input.body,
        message_type: "system",
        created_at: input.createdAt
      }),
    input.supabase
      .from("message_threads")
      .update({ updated_at: input.createdAt })
      .eq("id", input.threadId)
  ]);

  if (messageInsert.error) {
    const parts = postgresErrorParts(messageInsert.error);
    console.warn("[barber-pos] payment_request_status_message_failed", {
      threadId: input.threadId,
      payloadKeys: ["thread_id", "sender_profile_id", "body", "message_type", "created_at"],
      postgresCode: parts.postgresCode,
      postgresMessage: parts.postgresMessage,
      postgresDetails: parts.postgresDetails,
      postgresHint: parts.postgresHint,
      ...buildPosSaleDebug(messageInsert.error, "messages", "pos_payment_request_status_message_failed")
    });
  }

  if (threadUpdate.error) {
    const parts = postgresErrorParts(threadUpdate.error);
    console.warn("[barber-pos] payment_request_thread_touch_failed", {
      threadId: input.threadId,
      postgresCode: parts.postgresCode,
      postgresMessage: parts.postgresMessage,
      postgresDetails: parts.postgresDetails,
      postgresHint: parts.postgresHint
    });
  }
}

function buildPosPaymentRequestBody(barberProfile: ProfileRow, amountCents: number) {
  const barberName = barberProfile.full_name?.trim() || barberProfile.email || "Your barber";
  return `${barberName} requested ${formatUsdFromCents(amountCents)} for a walk-in service.\nApprove Payment or Decline in BVRB3R.`;
}

async function markPosPaymentRequestMessageFailed(input: {
  supabase: SupabaseClient;
  request: PosPaymentRequestRow;
  threadId: string;
  failedAt: string;
  error: unknown;
}) {
  try {
    return await updatePosPaymentRequestWithFallbacks({
      supabase: input.supabase,
      requestId: input.request.id,
      payload: {
        status: "pending_message_failed",
        message_thread_id: input.threadId,
        updated_at: input.failedAt
      }
    });
  } catch (statusError) {
    const parts = postgresErrorParts(statusError);
    console.warn("[barber-pos] payment_request_message_failed_status_update_failed", {
      paymentRequestId: input.request.id,
      posSaleId: input.request.pos_sale_id,
      threadId: input.threadId,
      originalPostgresCode: postgresErrorParts(input.error).postgresCode,
      postgresCode: parts.postgresCode,
      postgresMessage: parts.postgresMessage,
      postgresDetails: parts.postgresDetails,
      postgresHint: parts.postgresHint
    });

    return {
      ...input.request,
      status: "pending_message_failed" as PosPaymentRequestRow["status"],
      message_thread_id: input.threadId,
      updated_at: input.failedAt
    };
  }
}

async function markPosPaymentRequestMessageDelivered(input: {
  supabase: SupabaseClient;
  request: PosPaymentRequestRow;
  threadId: string;
  deliveredAt: string;
}) {
  if (input.request.status !== "pending_message_failed" && input.request.message_thread_id === input.threadId) {
    return input.request;
  }

  try {
    return await updatePosPaymentRequestWithFallbacks({
      supabase: input.supabase,
      requestId: input.request.id,
      payload: {
        status: "pending",
        message_thread_id: input.threadId,
        updated_at: input.deliveredAt
      }
    });
  } catch (error) {
    const parts = postgresErrorParts(error);
    console.warn("[barber-pos] payment_request_message_delivered_status_update_failed", {
      paymentRequestId: input.request.id,
      posSaleId: input.request.pos_sale_id,
      threadId: input.threadId,
      postgresCode: parts.postgresCode,
      postgresMessage: parts.postgresMessage,
      postgresDetails: parts.postgresDetails,
      postgresHint: parts.postgresHint
    });
    return input.request;
  }
}

async function findExistingPosPaymentRequestMessage(input: {
  supabase: SupabaseClient;
  request: PosPaymentRequestRow;
  threadId: string;
  route: string;
  sale: PosSaleRow;
  actorProfileId: string;
}) {
  const existingMessages = await input.supabase
    .from("messages")
    .select("id, body, metadata, created_at")
    .eq("thread_id", input.threadId)
    .limit(100);

  if (existingMessages.error) {
    logPosPaymentMessageFailure({
      stage: "message_duplicate_lookup",
      route: input.route,
      table: "messages",
      error: existingMessages.error,
      payload: { thread_id: input.threadId, metadata: "pos_payment_request" },
      posSaleId: input.sale.id,
      paymentRequestId: input.request.id,
      barberId: input.sale.barber_id,
      profileId: input.actorProfileId,
      clientId: input.sale.client_id,
      threadId: input.threadId
    });
    return null;
  }

  const existing = (existingMessages.data ?? []).find((message) => {
    const metadata = (message as { metadata?: unknown }).metadata;
    return Boolean(
      metadata
      && typeof metadata === "object"
      && !Array.isArray(metadata)
      && (metadata as PosPaymentRequestMessageMetadata).kind === "pos_payment_request"
      && (metadata as PosPaymentRequestMessageMetadata).paymentRequestId === input.request.id
    );
  }) as { id: string; created_at?: string | null } | undefined;

  if (existing) {
    logPosPaymentMessageStep({
      stage: "message_duplicate_found",
      route: input.route,
      posSaleId: input.sale.id,
      paymentRequestId: input.request.id,
      barberId: input.sale.barber_id,
      profileId: input.actorProfileId,
      clientId: input.sale.client_id,
      threadId: input.threadId,
      result: { messageId: existing.id, createdAt: existing.created_at ?? null }
    });
  }

  return existing ?? null;
}

async function findExistingPlainPosPaymentRequestFallback(input: {
  supabase: SupabaseClient;
  request: PosPaymentRequestRow;
  threadId: string;
  route: string;
  sale: PosSaleRow;
  actorProfileId: string;
}) {
  const existingMessages = await input.supabase
    .from("messages")
    .select("id, body, created_at")
    .eq("thread_id", input.threadId)
    .limit(100);

  if (existingMessages.error) {
    logPosPaymentMessageFailure({
      stage: "message_plain_text_duplicate_lookup",
      route: input.route,
      table: "messages",
      error: existingMessages.error,
      payload: { thread_id: input.threadId, body: "Payment request ID" },
      posSaleId: input.sale.id,
      paymentRequestId: input.request.id,
      barberId: input.sale.barber_id,
      profileId: input.actorProfileId,
      clientId: input.sale.client_id,
      threadId: input.threadId
    });
    return null;
  }

  const existing = (existingMessages.data ?? []).find((message) =>
    messageBodyReferencesPaymentRequest((message as { body?: unknown }).body, input.request.id)
  ) as { id: string; created_at?: string | null } | undefined;

  if (existing) {
    logPosPaymentMessageStep({
      stage: "message_plain_text_duplicate_found",
      route: input.route,
      posSaleId: input.sale.id,
      paymentRequestId: input.request.id,
      barberId: input.sale.barber_id,
      profileId: input.actorProfileId,
      clientId: input.sale.client_id,
      threadId: input.threadId,
      result: { messageId: existing.id, createdAt: existing.created_at ?? null }
    });
  }

  return existing ?? null;
}

async function insertPosPaymentRequestPlainTextFallback(input: {
  supabase: SupabaseClient;
  request: PosPaymentRequestRow;
  sale: PosSaleRow;
  threadId: string;
  barberProfile: ProfileRow;
  body: string;
  createdAt: string;
  route: string;
  actorProfileId: string;
  originalError: unknown;
}) {
  const existingFallback = await findExistingPlainPosPaymentRequestFallback({
    supabase: input.supabase,
    request: input.request,
    sale: input.sale,
    threadId: input.threadId,
    route: input.route,
    actorProfileId: input.actorProfileId
  });
  if (existingFallback) {
    return {
      delivered: true,
      debug: buildPosSaleDebug(input.originalError, "messages", "pos_payment_request_message_failed")
    };
  }

  const fallbackPayload = {
    thread_id: input.threadId,
    sender_profile_id: input.barberProfile.id,
    body: `${input.body}\n\nPayment request ID: ${input.request.id}`,
    message_type: "system",
    created_at: input.createdAt
  };
  let fallbackInsert = await input.supabase
    .from("messages")
    .insert(fallbackPayload);

  if (fallbackInsert.error) {
    logPosPaymentMessageFailure({
      stage: "message_plain_text_system_fallback",
      route: input.route,
      table: "messages",
      error: fallbackInsert.error,
      payload: fallbackPayload,
      posSaleId: input.sale.id,
      paymentRequestId: input.request.id,
      barberId: input.sale.barber_id,
      profileId: input.actorProfileId,
      clientId: input.sale.client_id,
      threadId: input.threadId
    });

    const textFallbackPayload = {
      ...fallbackPayload,
      message_type: "text"
    };
    fallbackInsert = await input.supabase
      .from("messages")
      .insert(textFallbackPayload);

    if (fallbackInsert.error) {
      logPosPaymentMessageFailure({
        stage: "message_plain_text_text_fallback",
        route: input.route,
        table: "messages",
        error: fallbackInsert.error,
        payload: textFallbackPayload,
        posSaleId: input.sale.id,
        paymentRequestId: input.request.id,
        barberId: input.sale.barber_id,
        profileId: input.actorProfileId,
        clientId: input.sale.client_id,
        threadId: input.threadId
      });
      return {
        delivered: false,
        debug: buildPosSaleDebug(input.originalError, "messages", "pos_payment_request_message_failed")
      };
    }
  }

  logPosPaymentMessageStep({
    stage: "message_plain_text_fallback_delivered",
    route: input.route,
    posSaleId: input.sale.id,
    paymentRequestId: input.request.id,
    barberId: input.sale.barber_id,
    profileId: input.actorProfileId,
    clientId: input.sale.client_id,
    threadId: input.threadId,
    result: { metadataAvailable: false }
  });

  const threadUpdate = await input.supabase
    .from("message_threads")
    .update({ updated_at: input.createdAt })
    .eq("id", input.threadId);

  if (threadUpdate.error) {
    logPosPaymentMessageFailure({
      stage: "message_plain_text_fallback_thread_touch",
      route: input.route,
      table: "message_threads",
      error: threadUpdate.error,
      payload: { updated_at: input.createdAt },
      posSaleId: input.sale.id,
      paymentRequestId: input.request.id,
      barberId: input.sale.barber_id,
      profileId: input.actorProfileId,
      clientId: input.sale.client_id,
      threadId: input.threadId
    });
  }

  return {
    delivered: true,
    debug: buildPosSaleDebug(input.originalError, "messages", "pos_payment_request_message_failed")
  };
}

async function deliverPosPaymentRequestMessage(input: {
  supabase: SupabaseClient;
  request: PosPaymentRequestRow;
  sale: PosSaleRow;
  threadId: string;
  barberProfile: ProfileRow;
  createdAt: string;
  route: string;
  actorProfileId: string;
}) {
  const metadata = buildPosPaymentRequestMetadata({ request: input.request });
  const existingMessage = await findExistingPosPaymentRequestMessage({
    supabase: input.supabase,
    request: input.request,
    threadId: input.threadId,
    route: input.route,
    sale: input.sale,
    actorProfileId: input.actorProfileId
  });
  if (existingMessage) {
    const deliveredRequest = await markPosPaymentRequestMessageDelivered({
      supabase: input.supabase,
      request: input.request,
      threadId: input.threadId,
      deliveredAt: input.createdAt
    });
    return {
      delivered: true,
      fallbackDelivered: false,
      duplicateSkipped: true,
      request: deliveredRequest,
      debug: null
    };
  }

  const messagePayload = {
    thread_id: input.threadId,
    sender_profile_id: input.barberProfile.id,
    body: buildPosPaymentRequestBody(input.barberProfile, input.request.amount_cents),
    message_type: "system",
    metadata,
    created_at: input.createdAt
  };

  const messageInsert = await input.supabase
    .from("messages")
    .insert(messagePayload);

  if (messageInsert.error) {
    logPosSaleCreateFailed({
      route: input.route,
      stage: "pos_payment_request_message_insert",
      paymentMethod: input.sale.payment_method ?? "card_on_file",
      payload: {
        ...messagePayload,
        metadata_kind: metadata.kind,
        paymentRequestId: metadata.paymentRequestId,
        posSaleId: metadata.posSaleId,
        amountCents: metadata.amountCents,
        status: metadata.status
      },
      error: messageInsert.error,
      table: "messages",
      barberId: input.sale.barber_id,
      profileId: input.actorProfileId,
      clientId: input.sale.client_id,
      amountCents: input.sale.total_cents,
      posSaleId: input.sale.id,
      paymentRequestId: input.request.id,
      threadId: input.threadId
    });

    const fallbackDelivery = await insertPosPaymentRequestPlainTextFallback({
      supabase: input.supabase,
      request: input.request,
      sale: input.sale,
      threadId: input.threadId,
      barberProfile: input.barberProfile,
      body: messagePayload.body,
      createdAt: input.createdAt,
      route: input.route,
      actorProfileId: input.actorProfileId,
      originalError: messageInsert.error
    });
    if (fallbackDelivery.delivered) {
      const deliveredRequest = await markPosPaymentRequestMessageDelivered({
        supabase: input.supabase,
        request: input.request,
        threadId: input.threadId,
        deliveredAt: input.createdAt
      });
      return {
        delivered: true,
        fallbackDelivered: true,
        duplicateSkipped: false,
        request: deliveredRequest,
        debug: fallbackDelivery.debug
      };
    }

    const failedRequest = await markPosPaymentRequestMessageFailed({
      supabase: input.supabase,
      request: input.request,
      threadId: input.threadId,
      failedAt: input.createdAt,
      error: messageInsert.error
    });
    return {
      delivered: false,
      fallbackDelivered: fallbackDelivery.delivered,
      duplicateSkipped: false,
      request: failedRequest,
      debug: fallbackDelivery.debug
    };
  }

  const [deliveredRequest, threadUpdate] = await Promise.all([
    markPosPaymentRequestMessageDelivered({
      supabase: input.supabase,
      request: input.request,
      threadId: input.threadId,
      deliveredAt: input.createdAt
    }),
    input.supabase
      .from("message_threads")
      .update({ updated_at: input.createdAt })
      .eq("id", input.threadId)
  ]);

  if (threadUpdate.error) {
    const parts = postgresErrorParts(threadUpdate.error);
    console.warn("[barber-pos] payment_request_thread_touch_failed", {
      route: input.route,
      paymentRequestId: input.request.id,
      posSaleId: input.sale.id,
      threadId: input.threadId,
      postgresCode: parts.postgresCode,
      postgresMessage: parts.postgresMessage,
      postgresDetails: parts.postgresDetails,
      postgresHint: parts.postgresHint
    });
  }

  return {
    delivered: true,
    fallbackDelivered: false,
    duplicateSkipped: false,
    request: deliveredRequest,
    debug: null
  };
}

export async function quoteBarberPosSaleForUser(user: UserAccount, input: BarberPosSaleQuoteInput) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveBarberActor(supabase, user);
  return quoteBarberPosSale(input, {
    relationshipType: actor.relationshipType,
    autoBoothPercent: actor.barber.autobooth_percent
  });
}

export async function createBarberPosSale(user: UserAccount, input: BarberPosSaleQuoteInput) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveBarberActor(supabase, user);
  const clientId = await resolvePosSaleClientId(supabase, input.clientId);
  const quote = quoteBarberPosSale(input, {
    relationshipType: actor.relationshipType,
    autoBoothPercent: actor.barber.autobooth_percent
  });
  await verifyPosStorageSchema({
    supabase,
    route: "POST /api/barber/pos-sales",
    tables: [POS_SCHEMA_TABLES.sales],
    failureMessage: "Unable to create the POS sale."
  });
  const now = new Date().toISOString();
  const normalizedPaymentMethod = normalizePaymentMethod(input.paymentMethod);
  const baseSalePayload: PosSaleInsertPayload = {
    barber_id: actor.barber.id,
    shop_id: actor.shopId,
    client_id: clientId,
    customer_name: input.customerName?.trim() || null,
    source: "barber_keypad",
    status: "payment_pending",
    subtotal_cents: quote.subtotalCents,
    discount_cents: quote.discountCents,
    tip_cents: quote.tipCents,
    platform_fee_cents: quote.platformFeeCents,
    client_fee_cents: quote.clientFeeCents,
    total_cents: quote.totalCents,
    payment_id: null,
    note: input.note?.trim() || null,
    created_by_profile_id: actor.profileId,
    created_at: now,
    updated_at: now
  };
  const salePayload: PosSaleInsertPayload = {
    ...baseSalePayload,
    customer_phone: input.customerPhone?.trim() || null,
    customer_email: input.customerEmail?.trim() || null,
    payment_method: normalizedPaymentMethod,
    payment_status: normalizedPaymentMethod === "card_on_file" ? "pending" : null,
    routing_required: false,
    amount_cents: quote.totalCents,
    total_amount_cents: quote.totalCents,
    invoice_status: normalizedPaymentMethod === "invoice" ? "pending" : null
  };
  const saleInsert = await insertPosSaleWithFallbacks({
    supabase,
    stage: "pos_sale_insert",
    primaryPayload: salePayload,
    basePayload: baseSalePayload,
    barberId: actor.barber.id,
    role: user.role
  });

  if (saleInsert.error) {
    logPosSaleCreateFailed({
      route: "POST /api/barber/pos-sales",
      stage: "pos_sale_insert",
      paymentMethod: normalizedPaymentMethod,
      payload: salePayload,
      error: saleInsert.error,
      table: POS_SCHEMA_TABLES.sales,
      barberId: actor.barber.id,
      profileId: actor.profileId,
      clientId,
      amountCents: quote.totalCents
    });
    throw new BarberPosSaleError("Unable to create the POS sale.", 500, buildPosSaleDebug(saleInsert.error, POS_SCHEMA_TABLES.sales));
  }

  const sale = saleInsert.data as PosSaleRow;
  const baseItems = input.items?.length
    ? input.items.map((item) => normalizeItem(item, quote.subtotalCents))
    : [normalizeItem(null, quote.subtotalCents)];
  const itemInsert = await supabase
    .from(POS_SCHEMA_TABLES.saleItems)
    .insert(baseItems.map((item) => ({
      ...item,
      pos_sale_id: sale.id,
      created_at: now
    })));

  if (itemInsert.error) {
    logPosSaleCreateFailed({
      route: "POST /api/barber/pos-sales",
      stage: "pos_sale_items_insert",
      paymentMethod: normalizedPaymentMethod,
      payload: { itemCount: baseItems.length, pos_sale_id: sale.id },
      error: itemInsert.error,
      table: POS_SCHEMA_TABLES.saleItems,
      barberId: actor.barber.id,
      profileId: actor.profileId,
      clientId,
      amountCents: quote.totalCents
    });

    if (!isOptionalPosSaleItemInsertError(itemInsert.error)) {
      await supabase.from(POS_SCHEMA_TABLES.sales).update({ status: "voided", updated_at: new Date().toISOString() }).eq("id", sale.id);
      throw new BarberPosSaleError("Unable to create the POS sale items.", 500, buildPosSaleDebug(itemInsert.error, POS_SCHEMA_TABLES.saleItems));
    }
  }

  return {
    ok: true,
    sale,
    quote
  };
}

export async function createCashBarberPosSale(user: UserAccount, input: BarberPosSaleQuoteInput) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveBarberActor(supabase, user);
  const clientId = await resolvePosSaleClientId(supabase, input.clientId);
  const quote = quoteBarberPosSale(input, {
    relationshipType: actor.relationshipType,
    autoBoothPercent: actor.barber.autobooth_percent
  });
  await verifyPosStorageSchema({
    supabase,
    route: "POST /api/barber/pos-sales/cash",
    tables: [POS_SCHEMA_TABLES.sales],
    failureMessage: "Unable to create the POS sale."
  });
  const now = new Date().toISOString();
  const baseSalePayload: PosSaleInsertPayload = {
    barber_id: actor.barber.id,
    shop_id: actor.shopId,
    client_id: clientId,
    customer_name: input.customerName?.trim() || null,
    source: "barber_keypad",
    status: "paid",
    subtotal_cents: quote.subtotalCents,
    discount_cents: quote.discountCents,
    tip_cents: quote.tipCents,
    platform_fee_cents: 0,
    client_fee_cents: 0,
    total_cents: quote.totalCents,
    payment_id: null,
    note: input.note?.trim() || null,
    created_by_profile_id: actor.profileId,
    created_at: now,
    updated_at: now
  };
  const cashSalePayload: PosSaleInsertPayload = {
    ...baseSalePayload,
    customer_phone: input.customerPhone?.trim() || null,
    customer_email: input.customerEmail?.trim() || null,
    payment_method: "cash",
    payment_status: "paid",
    routing_required: false,
    amount_cents: quote.totalCents,
    total_amount_cents: quote.totalCents,
    cash_recorded_at: now,
    completed_at: now
  };
  const saleInsert = await insertPosSaleWithFallbacks({
    supabase,
    stage: "cash_sale_insert",
    primaryPayload: cashSalePayload,
    basePayload: baseSalePayload,
    barberId: actor.barber.id,
    role: user.role
  });

  if (saleInsert.error) {
    logPosSaleCreateFailed({
      route: "POST /api/barber/pos-sales/cash",
      stage: "pos_sale_insert",
      paymentMethod: "cash",
      payload: cashSalePayload,
      error: saleInsert.error,
      table: POS_SCHEMA_TABLES.sales,
      barberId: actor.barber.id,
      profileId: actor.profileId,
      clientId,
      amountCents: quote.totalCents
    });
    logCashCreateFailed({
      stage: "pos_sale_insert",
      payload: cashSalePayload,
      error: saleInsert.error,
      barberId: actor.barber.id,
      role: user.role
    });
    throw new BarberPosSaleError("Unable to create the POS sale.", 500, buildPosSaleDebug(saleInsert.error, POS_SCHEMA_TABLES.sales));
  }

  const sale = saleInsert.data as PosSaleRow;
  const baseItems = input.items?.length
    ? input.items.map((item) => normalizeItem(item, quote.subtotalCents))
    : [normalizeItem(null, quote.subtotalCents)];
  const itemPayload = baseItems.map((item) => ({
    ...item,
    pos_sale_id: sale.id,
    created_at: now
  }));
  const itemInsert = await supabase
    .from(POS_SCHEMA_TABLES.saleItems)
    .insert(itemPayload);

  if (itemInsert.error) {
    logPosSaleCreateFailed({
      route: "POST /api/barber/pos-sales/cash",
      stage: "pos_sale_items_insert",
      paymentMethod: "cash",
      payload: { itemCount: itemPayload.length, pos_sale_id: sale.id },
      error: itemInsert.error,
      table: POS_SCHEMA_TABLES.saleItems,
      barberId: actor.barber.id,
      profileId: actor.profileId,
      clientId,
      amountCents: quote.totalCents
    });
    logCashCreateFailed({
      stage: "pos_sale_items_insert",
      payload: { itemCount: itemPayload.length, pos_sale_id: sale.id },
      error: itemInsert.error,
      barberId: actor.barber.id,
      role: user.role
    });
    if (!isOptionalPosSaleItemInsertError(itemInsert.error)) {
      await supabase.from(POS_SCHEMA_TABLES.sales).update({ status: "voided", updated_at: new Date().toISOString() }).eq("id", sale.id);
      throw new BarberPosSaleError("Unable to create the POS sale items.", 500, buildPosSaleDebug(itemInsert.error, POS_SCHEMA_TABLES.saleItems));
    }
  }

  return {
    ok: true,
    sale,
    payment: null,
    routing: null,
    cashRecorded: true,
    alreadyPaid: false,
    message: "Cash sale recorded. No platform payout created."
  };
}

export async function recordCashBarberPosSale(user: UserAccount, saleId: string) {
  const supabase = getSupabaseOrThrow();
  const { actor, sale } = await loadPosSaleForActor(supabase, user, saleId);

  if (sale.status === "paid" && sale.payment_method === "cash") {
    return {
      ok: true,
      sale,
      payment: null,
      routing: null,
      cashRecorded: true,
      alreadyPaid: true
    };
  }

  if (sale.status !== "payment_pending" && sale.status !== "draft") {
    throw new BarberPosSaleError("This POS sale cannot be recorded as cash in its current state.", 409);
  }

  const paidAt = new Date().toISOString();
  const cashPayload = {
    status: "paid",
    payment_method: "cash",
    cash_recorded_at: paidAt,
    updated_at: paidAt
  };
  let cashUpdate = await supabase
    .from(POS_SCHEMA_TABLES.sales)
    .update(cashPayload)
    .eq("id", sale.id)
    .eq("barber_id", actor.barber.id)
    .select("*")
    .single();

  if (cashUpdate.error && isOptionalPosSaleColumnError(cashUpdate.error)) {
    logPosSaleSchemaFallback("cash_sale_update", cashUpdate.error, cashPayload);
    cashUpdate = await supabase
      .from(POS_SCHEMA_TABLES.sales)
      .update({ status: "paid", updated_at: paidAt })
      .eq("id", sale.id)
      .eq("barber_id", actor.barber.id)
      .select("*")
      .single();
  }

  if (cashUpdate.error) {
    throw new BarberPosSaleError("Unable to record this cash sale.", 500);
  }

  return {
    ok: true,
    sale: cashUpdate.data as PosSaleRow,
    payment: null,
    routing: null,
    cashRecorded: true,
    alreadyPaid: false
  };
}

export async function createBarberPosSaleInvoice(user: UserAccount, saleId: string, input: BarberPosSaleInvoiceInput = {}) {
  const supabase = getSupabaseOrThrow();
  const { actor, sale } = await loadPosSaleForActor(supabase, user, saleId);

  if (sale.status === "paid") {
    throw new BarberPosSaleError("This POS sale is already paid.", 409);
  }

  const now = new Date().toISOString();
  const invoiceUrl = sale.invoice_url
    ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://bvrb3r.com"}/pay/pos/${sale.id}`;
  const updateResult = await supabase
    .from(POS_SCHEMA_TABLES.sales)
    .update({
      status: "payment_pending",
      payment_method: "invoice",
      invoice_url: invoiceUrl,
      invoice_status: "pending",
      customer_phone: input.customerPhone?.trim() || sale.customer_phone || null,
      customer_email: input.customerEmail?.trim() || sale.customer_email || null,
      updated_at: now
    })
    .eq("id", sale.id)
    .eq("barber_id", actor.barber.id)
    .select("*")
    .single();

  if (updateResult.error) {
    throw new BarberPosSaleError("Unable to create this payment link.", 500);
  }

  return {
    ok: true,
    sale: updateResult.data as PosSaleRow,
    invoice: {
      url: invoiceUrl,
      status: "pending"
    }
  };
}

export async function requestBarberPosSalePayment(user: UserAccount, saleId: string) {
  const supabase = getSupabaseOrThrow();
  const { actor, sale } = await loadPosSaleForActor(supabase, user, saleId);
  await verifyPosStorageSchema({
    supabase,
    route: "POST /api/barber/pos-sales/[id]/payment-request",
    tables: [POS_SCHEMA_TABLES.sales, POS_SCHEMA_TABLES.paymentRequests],
    failureMessage: "Unable to create the POS payment request."
  });

  if (sale.status === "paid") {
    throw new BarberPosSaleError("This POS sale is already paid.", 409);
  }

  if (sale.status !== "payment_pending" && sale.status !== "draft") {
    throw new BarberPosSaleError("This POS sale cannot receive a payment request in its current state.", 409);
  }

  if (!sale.client_id) {
    throw new BarberPosSaleError("Select a client before requesting card approval.", 409);
  }

  const existingRequests = await readPosPaymentRequestsForSale(supabase, sale.id);
  const reusableSaleRequest = selectReusablePaymentRequest(existingRequests);

  if (reusableSaleRequest) {
    const request = reusableSaleRequest;
    if (request.status === "pending_message_failed") {
      const [{ profile: clientProfile }, barberProfile] = await Promise.all([
        readClientForPosRequest(supabase, sale.client_id),
        readProfileForPosRequest(supabase, actor.profileId)
      ]);
      const retriedAt = new Date().toISOString();
      const threadId = request.message_thread_id ?? await createOrGetPosPaymentRequestThread({
        supabase,
        barberProfile,
        clientProfile,
        createdAt: retriedAt,
        route: "POST /api/barber/pos-sales/[id]/payment-request",
        posSaleId: sale.id,
        paymentRequestId: request.id,
        barberId: actor.barber.id,
        clientId: sale.client_id
      });
      await ensurePosPaymentRequestThreadParticipants({
        supabase,
        threadId,
        barberProfile,
        clientProfile,
        route: "POST /api/barber/pos-sales/[id]/payment-request",
        posSaleId: sale.id,
        paymentRequestId: request.id,
        barberId: actor.barber.id,
        clientId: sale.client_id
      });
      const delivery = await deliverPosPaymentRequestMessage({
        supabase,
        request,
        sale,
        threadId,
        barberProfile,
        createdAt: retriedAt,
        route: "POST /api/barber/pos-sales/[id]/payment-request",
        actorProfileId: actor.profileId
      });

      if (!delivery.delivered) {
        const debug = delivery.debug ?? buildPosSaleDebug(null, "messages", "pos_payment_request_message_failed");
        return {
          ok: true,
          sale,
          request: delivery.request,
          payment: null,
          routing: null,
          alreadyRequested: true,
          requestId: delivery.request.id,
          posSaleId: sale.id,
          messageThreadId: delivery.request.message_thread_id ?? threadId,
          paymentCardDelivered: false,
          fallbackPlainMessageSent: delivery.fallbackDelivered,
          reusedExistingRequest: true,
          duplicateSaleVoided: false,
          messageDeliveryStatus: "failed",
          error: "Unable to send the POS payment request message.",
          message: "Request created, but message delivery failed. Retry sending message.",
          debugCode: debug.debugCode,
          failedTable: debug.failedTable,
          failedConstraint: debug.failedConstraint,
          failedColumn: debug.failedColumn
        };
      }

      return {
        ok: true,
        sale,
        request: delivery.request,
        payment: null,
        routing: null,
        alreadyRequested: true,
        requestId: delivery.request.id,
        posSaleId: sale.id,
        messageThreadId: delivery.request.message_thread_id ?? threadId,
        paymentCardDelivered: true,
        fallbackPlainMessageSent: delivery.fallbackDelivered,
        reusedExistingRequest: true,
        duplicateSaleVoided: false,
        messageDeliveryStatus: "delivered",
        message: "Payment request sent. Client approval is required before payout."
      };
    }

    if (isClientActionablePosPaymentRequestStatus(request.status) || isPaidPosPaymentRequestStatus(request.status)) {
      return {
        ok: true,
        sale,
        request,
        payment: null,
        routing: null,
        alreadyRequested: true,
        requestId: request.id,
        posSaleId: sale.id,
        messageThreadId: request.message_thread_id,
        paymentCardDelivered: true,
        fallbackPlainMessageSent: false,
        reusedExistingRequest: true,
        duplicateSaleVoided: false,
        messageDeliveryStatus: "delivered",
        message: "Payment request already sent. Client approval is required before payout."
      };
    }
  }

  const duplicateRequest = await findReusableDuplicatePaymentRequest({ supabase, sale });
  if (duplicateRequest) {
    const duplicateSale = await loadPosSaleById(supabase, duplicateRequest.pos_sale_id);
    await markPosSaleVoidedForDuplicate({
      supabase,
      saleId: sale.id,
      at: new Date().toISOString()
    });

    if (duplicateRequest.status === "pending_message_failed" && duplicateSale?.client_id) {
      const [{ profile: clientProfile }, barberProfile] = await Promise.all([
        readClientForPosRequest(supabase, duplicateSale.client_id),
        readProfileForPosRequest(supabase, actor.profileId)
      ]);
      const retriedAt = new Date().toISOString();
      const threadId = duplicateRequest.message_thread_id ?? await createOrGetPosPaymentRequestThread({
        supabase,
        barberProfile,
        clientProfile,
        createdAt: retriedAt,
        route: "POST /api/barber/pos-sales/[id]/payment-request",
        posSaleId: duplicateSale.id,
        paymentRequestId: duplicateRequest.id,
        barberId: actor.barber.id,
        clientId: duplicateSale.client_id
      });
      await ensurePosPaymentRequestThreadParticipants({
        supabase,
        threadId,
        barberProfile,
        clientProfile,
        route: "POST /api/barber/pos-sales/[id]/payment-request",
        posSaleId: duplicateSale.id,
        paymentRequestId: duplicateRequest.id,
        barberId: actor.barber.id,
        clientId: duplicateSale.client_id
      });
      const delivery = await deliverPosPaymentRequestMessage({
        supabase,
        request: duplicateRequest,
        sale: duplicateSale,
        threadId,
        barberProfile,
        createdAt: retriedAt,
        route: "POST /api/barber/pos-sales/[id]/payment-request",
        actorProfileId: actor.profileId
      });

      return {
        ok: true,
        sale: duplicateSale,
        request: delivery.request,
        payment: null,
        routing: null,
        alreadyRequested: true,
        requestId: delivery.request.id,
        posSaleId: duplicateSale.id,
        messageThreadId: delivery.request.message_thread_id ?? threadId,
        paymentCardDelivered: delivery.delivered,
        fallbackPlainMessageSent: delivery.fallbackDelivered,
        reusedExistingRequest: true,
        duplicateSaleVoided: true,
        messageDeliveryStatus: delivery.delivered ? "delivered" : "failed",
        error: delivery.delivered ? undefined : "Unable to send the POS payment request message.",
        message: delivery.delivered
          ? "Payment request sent. Client approval is required before payout."
          : "Request exists, but message delivery is still failing.",
        debugCode: delivery.debug?.debugCode,
        failedTable: delivery.debug?.failedTable,
        failedConstraint: delivery.debug?.failedConstraint,
        failedColumn: delivery.debug?.failedColumn
      };
    }

    return {
      ok: true,
      sale: duplicateSale ?? sale,
      request: duplicateRequest,
      payment: null,
      routing: null,
      alreadyRequested: true,
      requestId: duplicateRequest.id,
      posSaleId: duplicateRequest.pos_sale_id,
      messageThreadId: duplicateRequest.message_thread_id,
      paymentCardDelivered: duplicateRequest.status !== "pending_message_failed",
      fallbackPlainMessageSent: false,
      reusedExistingRequest: true,
      duplicateSaleVoided: true,
      messageDeliveryStatus: duplicateRequest.status === "pending_message_failed" ? "failed" : "delivered",
      message: duplicateRequest.status === "pending_message_failed"
        ? "Request exists, but message delivery is still failing."
        : "Payment request already sent. Client approval is required before payout."
    };
  }

  const [{ profile: clientProfile }, barberProfile] = await Promise.all([
    readClientForPosRequest(supabase, sale.client_id),
    readProfileForPosRequest(supabase, actor.profileId)
  ]);
  const requestedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const threadId = await createOrGetPosPaymentRequestThread({
    supabase,
    barberProfile,
    clientProfile,
    createdAt: requestedAt,
    route: "POST /api/barber/pos-sales/[id]/payment-request",
    posSaleId: sale.id,
    barberId: actor.barber.id,
    clientId: sale.client_id
  });

  const requestInsert = await supabase
    .from(POS_SCHEMA_TABLES.paymentRequests)
    .insert({
      pos_sale_id: sale.id,
      barber_id: actor.barber.id,
      client_id: sale.client_id,
      amount_cents: sale.total_cents,
      status: "pending",
      requested_at: requestedAt,
      expires_at: expiresAt,
      message_thread_id: threadId,
      payment_id: null,
      created_at: requestedAt,
      updated_at: requestedAt
    })
    .select("*")
    .single();

  if (requestInsert.error) {
    logPosSaleCreateFailed({
      route: "POST /api/barber/pos-sales/[id]/payment-request",
      stage: "pos_payment_request_insert",
      paymentMethod: sale.payment_method ?? "card_on_file",
      payload: {
        pos_sale_id: sale.id,
        barber_id: actor.barber.id,
        client_id: sale.client_id,
        amount_cents: sale.total_cents,
        status: "pending"
      },
      error: requestInsert.error,
      table: POS_SCHEMA_TABLES.paymentRequests,
      barberId: actor.barber.id,
      profileId: actor.profileId,
      clientId: sale.client_id,
      amountCents: sale.total_cents
    });
    throw new BarberPosSaleError("Unable to create the POS payment request.", 500, buildPosSaleDebug(requestInsert.error, POS_SCHEMA_TABLES.paymentRequests, "pos_payment_request_create_failed"));
  }

  const requestRow = requestInsert.data as PosPaymentRequestRow;
  const delivery = await deliverPosPaymentRequestMessage({
    supabase,
    request: requestRow,
    sale,
    threadId,
    barberProfile,
    createdAt: requestedAt,
    route: "POST /api/barber/pos-sales/[id]/payment-request",
    actorProfileId: actor.profileId
  });

  if (!delivery.delivered) {
    const debug = delivery.debug ?? buildPosSaleDebug(null, "messages", "pos_payment_request_message_failed");
    return {
      ok: true,
      sale,
      request: delivery.request,
      payment: null,
      routing: null,
      alreadyRequested: false,
      requestId: delivery.request.id,
      posSaleId: sale.id,
      messageThreadId: delivery.request.message_thread_id ?? threadId,
      paymentCardDelivered: false,
      fallbackPlainMessageSent: delivery.fallbackDelivered,
      reusedExistingRequest: false,
      duplicateSaleVoided: false,
      messageDeliveryStatus: "failed",
      error: "Unable to send the POS payment request message.",
      message: "Request created, but message delivery failed. Retry sending message.",
      debugCode: debug.debugCode,
      failedTable: debug.failedTable,
      failedConstraint: debug.failedConstraint,
      failedColumn: debug.failedColumn
    };
  }

  return {
    ok: true,
    sale,
    request: delivery.request,
    payment: null,
    routing: null,
    alreadyRequested: false,
    requestId: delivery.request.id,
    posSaleId: sale.id,
    messageThreadId: delivery.request.message_thread_id ?? threadId,
    paymentCardDelivered: true,
    fallbackPlainMessageSent: delivery.fallbackDelivered,
    reusedExistingRequest: false,
    duplicateSaleVoided: false,
    messageDeliveryStatus: "delivered",
    message: "Payment request sent. Client approval is required before payout."
  };
}

export async function retryBarberPosSalePaymentRequestMessage(user: UserAccount, saleId: string) {
  const supabase = getSupabaseOrThrow();
  const { actor, sale } = await loadPosSaleForActor(supabase, user, saleId);

  if (!sale.client_id) {
    throw new BarberPosSaleError("Select a client before requesting card approval.", 409);
  }

  const request = selectReusablePaymentRequest(await readPosPaymentRequestsForSale(supabase, sale.id));
  if (!request) {
    throw new BarberPosSaleError("Payment request not found.", 404);
  }

  if (!isPendingPosPaymentRequestStatus(request.status)) {
    throw new BarberPosSaleError("This payment request is no longer pending.", 409);
  }

  const [{ profile: clientProfile }, barberProfile] = await Promise.all([
    readClientForPosRequest(supabase, sale.client_id),
    readProfileForPosRequest(supabase, actor.profileId)
  ]);
  const retriedAt = new Date().toISOString();
  const threadId = request.message_thread_id ?? await createOrGetPosPaymentRequestThread({
    supabase,
    barberProfile,
    clientProfile,
    createdAt: retriedAt,
    route: "POST /api/barber/pos-sales/[id]/payment-request/retry-message",
    posSaleId: sale.id,
    paymentRequestId: request.id,
    barberId: actor.barber.id,
    clientId: sale.client_id
  });
  await ensurePosPaymentRequestThreadParticipants({
    supabase,
    threadId,
    barberProfile,
    clientProfile,
    route: "POST /api/barber/pos-sales/[id]/payment-request/retry-message",
    posSaleId: sale.id,
    paymentRequestId: request.id,
    barberId: actor.barber.id,
    clientId: sale.client_id
  });
  const delivery = await deliverPosPaymentRequestMessage({
    supabase,
    request,
    sale,
    threadId,
    barberProfile,
    createdAt: retriedAt,
    route: "POST /api/barber/pos-sales/[id]/payment-request/retry-message",
    actorProfileId: actor.profileId
  });

  if (!delivery.delivered) {
    const debug = delivery.debug ?? buildPosSaleDebug(null, "messages", "pos_payment_request_message_failed");
    return {
      ok: false,
      sale,
      request: delivery.request,
      payment: null,
      routing: null,
      requestId: delivery.request.id,
      posSaleId: sale.id,
      messageThreadId: delivery.request.message_thread_id ?? threadId,
      paymentCardDelivered: false,
      fallbackPlainMessageSent: delivery.fallbackDelivered,
      reusedExistingRequest: true,
      duplicateSaleVoided: false,
      messageDeliveryStatus: "failed",
      error: "Unable to send the POS payment request message.",
      message: "Request exists, but message delivery is still failing.",
      debugCode: debug.debugCode,
      failedTable: debug.failedTable,
      failedConstraint: debug.failedConstraint,
      failedColumn: debug.failedColumn
    };
  }

  return {
    ok: true,
    sale,
    request: delivery.request,
    payment: null,
    routing: null,
    requestId: delivery.request.id,
    posSaleId: sale.id,
    messageThreadId: delivery.request.message_thread_id ?? threadId,
    paymentCardDelivered: true,
    fallbackPlainMessageSent: delivery.fallbackDelivered,
    reusedExistingRequest: true,
    duplicateSaleVoided: false,
    messageDeliveryStatus: "delivered",
    message: "Payment request sent. Client approval is required before payout."
  };
}

export async function chargeBarberPosSale(user: UserAccount, saleId: string, input: BarberPosSaleChargeInput = {}) {
  const supabase = getSupabaseOrThrow();
  const { actor, sale } = await loadPosSaleForActor(supabase, user, saleId);
  const paymentMethod = input.paymentMethod ?? sale.payment_method ?? "test";

  if (sale.status === "paid" && sale.payment_method === "cash") {
    return {
      ok: true,
      sale,
      payment: null,
      routing: null,
      cashRecorded: true,
      alreadyPaid: true
    };
  }

  if (sale.status === "paid" && sale.payment_id) {
    const existingRouting = await supabase
      .from("payment_routing_records")
      .select("id, payment_id, pos_sale_id, payout_readiness_status, money_routing_status, eligible_at, released_at, barber_payout_amount, platform_fee_amount, shop_split_amount")
      .eq("pos_sale_id", sale.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      ok: true,
      sale,
      payment: { id: sale.payment_id, posSaleId: sale.id },
      routing: existingRouting.data ?? null,
      alreadyPaid: true
    };
  }

  if (sale.status !== "payment_pending" && sale.status !== "draft") {
    throw new BarberPosSaleError("This POS sale cannot be charged in its current state.", 409);
  }

  if (paymentMethod === "card_on_file" && !sale.client_id) {
    throw new BarberPosSaleError("Select a client before charging card on file.", 409);
  }

  const savedCard = paymentMethod === "card_on_file" && sale.client_id
    ? await readDefaultPaymentMethodForClient(supabase, sale.client_id)
    : null;

  if (paymentMethod === "card_on_file" && !savedCard) {
    throw new BarberPosSaleError("Client has no saved card. Use cash or send link later.", 409);
  }

  if (paymentMethod === "invoice") {
    throw new BarberPosSaleError("Send the invoice link and wait for payment before capturing.", 409);
  }

  const paidAt = new Date().toISOString();
  const paidPayload = { status: "paid", payment_method: paymentMethod, updated_at: paidAt };
  let paidUpdate = await supabase
    .from(POS_SCHEMA_TABLES.sales)
    .update(paidPayload)
    .eq("id", sale.id)
    .eq("barber_id", actor.barber.id)
    .select("*")
    .single();

  if (paidUpdate.error && isOptionalPosSaleColumnError(paidUpdate.error)) {
    logPosSaleSchemaFallback("card_sale_update", paidUpdate.error, paidPayload);
    paidUpdate = await supabase
      .from(POS_SCHEMA_TABLES.sales)
      .update({ status: "paid", updated_at: paidAt })
      .eq("id", sale.id)
      .eq("barber_id", actor.barber.id)
      .select("*")
      .single();
  }

  if (paidUpdate.error) {
    throw new BarberPosSaleError("Unable to mark the POS sale paid.", 500);
  }

  try {
    const payment = await createPaymentLedgerEntry(supabase, {
      appointmentId: null,
      posSaleId: sale.id,
      clientId: sale.client_id,
      shopId: sale.shop_id,
      barberId: sale.barber_id,
      paymentMethodId: savedCard?.id ?? null,
      provider: "stripe",
      providerPaymentIntentId: `pi_pos_${sale.id.replace(/-/g, "").slice(0, 24)}_${randomUUID().slice(0, 8)}`,
      amount: decimalFromCents(sale.total_cents),
      currency: "usd",
      paymentStatus: "captured",
      paymentType: "pos_sale",
      legacyType: "pos_sale",
      legacyStatus: "captured",
      paidAt,
      metadata: {
        source: "barber_keypad_pos",
        paymentMethod,
        savedCardId: savedCard?.id ?? null,
        posSaleId: sale.id,
        barberId: sale.barber_id,
        shopId: sale.shop_id,
        clientId: sale.client_id,
        customerName: sale.customer_name,
        relationshipType: actor.relationshipType
      },
      createdAt: paidAt
    });

    const finalizedSale = await supabase
      .from(POS_SCHEMA_TABLES.sales)
      .update({ payment_id: payment.id, updated_at: new Date().toISOString() })
      .eq("id", sale.id)
      .select("*")
      .single();

    if (finalizedSale.error) {
      throw new BarberPosSaleError("Unable to attach payment to the POS sale.", 500);
    }

    const routingResult = await supabase
      .from("payment_routing_records")
      .select("id, payment_id, appointment_id, pos_sale_id, payout_readiness_status, money_routing_status, eligible_at, released_at, barber_payout_amount, platform_fee_amount, shop_split_amount")
      .eq("pos_sale_id", sale.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (routingResult.error) {
      throw new BarberPosSaleError("POS sale was paid, but routing could not be loaded.", 500);
    }

    return {
      ok: true,
      sale: finalizedSale.data as PosSaleRow,
      payment,
      routing: routingResult.data ?? null,
      alreadyPaid: false
    };
  } catch (error) {
    if (!(error instanceof BarberPosSaleError)) {
      await supabase
        .from(POS_SCHEMA_TABLES.sales)
        .update({ status: "payment_pending", updated_at: new Date().toISOString() })
        .eq("id", sale.id);
    }
    throw error;
  }
}

export async function approveClientPosPaymentRequest(user: UserAccount, requestId: string) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveClientActorForPosRequest(supabase, user);
  const { request, sale } = await loadClientPosPaymentRequest({
    supabase,
    requestId,
    clientId: actor.client.id
  });

  if (request.status === "paid") {
    throw new BarberPosSaleError("Request already paid.", 409);
  }

  if (request.status === "declined") {
    throw new BarberPosSaleError("Request declined.", 409);
  }

  if (request.status === "expired" || isPosPaymentRequestExpired(request)) {
    await updatePosPaymentRequestWithFallbacks({
      supabase,
      requestId: request.id,
      payload: { status: "expired", updated_at: new Date().toISOString() }
    }).catch(() => null);
    throw new BarberPosSaleError("Request expired.", 409);
  }

  if (!isClientActionablePosPaymentRequestStatus(request.status)) {
    throw new BarberPosSaleError("This payment request is no longer pending.", 409);
  }

  const saleAmountCents = getPosSaleAmountCents(sale);
  if (saleAmountCents <= 0 || cents(request.amount_cents) !== saleAmountCents) {
    throw new BarberPosSaleError("Payment request amount does not match the POS sale.", 409);
  }

  if (sale.status === "paid" || sale.payment_id) {
    throw new BarberPosSaleError("Request already paid.", 409);
  }

  const paidDuplicate = await findPaidDuplicatePaymentRequest({ supabase, request, sale });
  if (paidDuplicate) {
    const closedAt = new Date().toISOString();
    await Promise.allSettled([
      closeDuplicatePosPaymentRequest({
        supabase,
        requestId: request.id,
        status: "superseded",
        closedAt
      }),
      markPosSaleVoidedForDuplicate({
        supabase,
        saleId: sale.id,
        at: closedAt
      }),
      appendPosPaymentRequestSystemMessage({
        supabase,
        threadId: request.message_thread_id,
        body: "Payment request superseded. Another request for this sale was already paid.",
        createdAt: closedAt
      })
    ]);
    throw new BarberPosSaleError("Request already paid.", 409);
  }

  const paidAt = new Date().toISOString();
  await updatePosSaleStateWithFallbacks({
    supabase,
    saleId: sale.id,
    stage: "client_pos_payment_request_approve",
    payload: {
      status: "paid",
      payment_method: "card_on_file",
      payment_status: "paid",
      completed_at: paidAt,
      updated_at: paidAt
    },
    fallbackPayload: {
      status: "paid",
      updated_at: paidAt
    }
  });

  let payment: Awaited<ReturnType<typeof createCapturedStripePaymentRecord>>;
  try {
    payment = await createCapturedStripePaymentRecord(supabase, {
      appointmentId: null,
      posSaleId: sale.id,
      clientId: actor.client.id,
      shopId: sale.shop_id,
      barberId: sale.barber_id,
      amount: decimalFromCents(saleAmountCents),
      paymentType: "pos_sale",
      legacyType: "pos_sale",
      legacyStatus: "captured",
      currency: "usd",
      idempotencyKey: `pos-payment-request:${request.id}:approve`,
      description: `BVRB3R walk-in POS payment request ${request.id}`,
      metadata: {
        source: "client_pos_payment_request_approval",
        paymentRequestId: request.id,
        posSaleId: sale.id,
        barberId: sale.barber_id,
        shopId: sale.shop_id,
        clientId: actor.client.id
      },
      createdAt: paidAt
    });
  } catch (error) {
    await Promise.allSettled([
      updatePosSaleStateWithFallbacks({
        supabase,
        saleId: sale.id,
        stage: "client_pos_payment_request_approve_rollback",
        payload: {
          status: "payment_pending",
          payment_method: "card_on_file",
          payment_status: "failed",
          updated_at: new Date().toISOString()
        },
        fallbackPayload: {
          status: "payment_pending",
          updated_at: new Date().toISOString()
        }
      }),
      updatePosPaymentRequestWithFallbacks({
        supabase,
        requestId: request.id,
        payload: {
          status: "failed",
          updated_at: new Date().toISOString()
        }
      })
    ]);

    if (error instanceof PaymentServiceError) {
      throw new BarberPosSaleError(error.status === 400 ? "No default payment method." : error.message, error.status);
    }

    throw error;
  }

  const finalizedAt = new Date().toISOString();
  const [finalizedSale, finalizedRequest] = await Promise.all([
    updatePosSaleStateWithFallbacks({
      supabase,
      saleId: sale.id,
      stage: "client_pos_payment_request_finalize",
      payload: {
        payment_id: payment.id,
        status: "paid",
        payment_method: "card_on_file",
        payment_status: "paid",
        completed_at: paidAt,
        updated_at: finalizedAt
      },
      fallbackPayload: {
        payment_id: payment.id,
        status: "paid",
        updated_at: finalizedAt
      }
    }),
    updatePosPaymentRequestWithFallbacks({
      supabase,
      requestId: request.id,
      payload: {
        status: "paid",
        approved_at: paidAt,
        paid_at: paidAt,
        payment_id: payment.id,
        updated_at: finalizedAt
      }
    })
  ]);

  const routingResult = await supabase
    .from("payment_routing_records")
    .select("id, payment_id, appointment_id, pos_sale_id, payout_readiness_status, money_routing_status, eligible_at, released_at, barber_payout_amount, platform_fee_amount, shop_split_amount")
    .eq("pos_sale_id", sale.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (routingResult.error) {
    console.warn("[barber-pos] approval_routing_load_failed", {
      requestId: request.id,
      posSaleId: sale.id,
      postgresCode: routingResult.error.code ?? null,
      postgresMessage: routingResult.error.message ?? null
    });
  }

  await appendPosPaymentRequestSystemMessage({
    supabase,
    threadId: request.message_thread_id,
    body: `Payment approved. ${formatUsdFromCents(saleAmountCents)} collected.`,
    createdAt: finalizedAt
  });

  await supersedeSiblingPendingPaymentRequests({
    supabase,
    paidRequest: finalizedRequest,
    sale: finalizedSale,
    finalizedAt
  });

  return {
    ok: true,
    sale: finalizedSale,
    request: finalizedRequest,
    payment,
    routing: routingResult.data ?? null,
    message: "Payment approved."
  };
}

export async function declineClientPosPaymentRequest(user: UserAccount, requestId: string) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveClientActorForPosRequest(supabase, user);
  const { request, sale } = await loadClientPosPaymentRequest({
    supabase,
    requestId,
    clientId: actor.client.id
  });

  if (request.status === "paid") {
    throw new BarberPosSaleError("Request already paid.", 409);
  }

  if (request.status === "declined") {
    return {
      ok: true,
      sale,
      request,
      payment: null,
      routing: null,
      alreadyDeclined: true,
      message: "Payment request declined."
    };
  }

  if (request.status === "expired" || isPosPaymentRequestExpired(request)) {
    throw new BarberPosSaleError("Request expired.", 409);
  }

  if (!isClientActionablePosPaymentRequestStatus(request.status)) {
    throw new BarberPosSaleError("This payment request is no longer pending.", 409);
  }

  const declinedAt = new Date().toISOString();
  const [updatedSale, updatedRequest] = await Promise.all([
    updatePosSaleStateWithFallbacks({
      supabase,
      saleId: sale.id,
      stage: "client_pos_payment_request_decline",
      payload: {
        status: "voided",
        payment_method: "card_on_file",
        payment_status: "failed",
        updated_at: declinedAt
      },
      fallbackPayload: {
        status: "voided",
        updated_at: declinedAt
      }
    }),
    updatePosPaymentRequestWithFallbacks({
      supabase,
      requestId: request.id,
      payload: {
        status: "declined",
        declined_at: declinedAt,
        updated_at: declinedAt
      }
    })
  ]);

  await appendPosPaymentRequestSystemMessage({
    supabase,
    threadId: request.message_thread_id,
    body: "Payment request declined.",
    createdAt: declinedAt
  });

  return {
    ok: true,
    sale: updatedSale,
    request: updatedRequest,
    payment: null,
    routing: null,
    alreadyDeclined: false,
    message: "Payment request declined."
  };
}

export async function listBarberPosSales(user: UserAccount) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveBarberActor(supabase, user);
  const result = await supabase
    .from(POS_SCHEMA_TABLES.sales)
    .select("*")
    .eq("barber_id", actor.barber.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (result.error) {
    throw new BarberPosSaleError("Unable to load POS sale history.", 500);
  }

  return {
    ok: true,
    sales: (result.data ?? []) as PosSaleRow[]
  };
}
