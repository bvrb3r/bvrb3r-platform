import { randomUUID } from "crypto";
import { isBarberAccountRole } from "@/lib/auth/roles";
import { canonicalBarberUuid } from "@/lib/booking/canonical-booking";
import { createPaymentLedgerEntry } from "@/lib/payments/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_FEE_RATE, roundCurrency } from "@/lib/fintech/domain";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type BarberRow = {
  id: string;
  profile_id: string;
  reference_code: string | null;
  barber_subtype?: string | null;
  compensation_model?: string | null;
  default_money_relationship?: string | null;
  commission_rate?: number | string | null;
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
  status: "pending" | "approved" | "declined" | "expired" | "paid" | "failed";
  requested_at: string;
  approved_at: string | null;
  declined_at: string | null;
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

type PosSaleRow = {
  id: string;
  barber_id: string;
  shop_id: string | null;
  client_id: string | null;
  customer_name: string | null;
  source: string;
  status: "draft" | "payment_pending" | "paid" | "refunded" | "voided";
  payment_method?: "tap_to_pay" | "card_on_file" | "cash" | "invoice" | "test" | null;
  cash_recorded_at?: string | null;
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
  relationshipType: "freelance" | "booth_rent" | "commission";
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
  if (value === "commission") return "commission";
  if (value === "booth_rent" || value === "blueprint") return "booth_rent";
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
  const fullSelect = "id, profile_id, reference_code, compensation_model, commission_rate, barber_subtype, default_money_relationship";
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
}) {
  const parts = postgresErrorParts(input.error);
  const debug = buildPosSaleDebug(input.error, input.table);
  console.warn("[barber-pos] create_failed", {
    route: input.route,
    stage: input.stage,
    payment_method: input.paymentMethod,
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
  grossCents: number;
  relationshipType: BarberPosSaleQuote["relationshipType"];
  commissionRate?: number | string | null;
}) {
  const platformFeeCents = Math.round(input.grossCents * PLATFORM_FEE_RATE);
  const netAfterPlatformCents = Math.max(input.grossCents - platformFeeCents, 0);

  if (input.relationshipType !== "commission") {
    return {
      platformFeeCents,
      barberPayoutCents: netAfterPlatformCents,
      shopSplitCents: 0
    };
  }

  const rateNumber = Number(input.commissionRate ?? 0);
  const barberRate = rateNumber > 1 ? rateNumber / 100 : rateNumber;
  const safeBarberRate = barberRate > 0 && barberRate <= 1 ? barberRate : 0.6;
  const barberPayoutCents = Math.round(netAfterPlatformCents * safeBarberRate);
  return {
    platformFeeCents,
    barberPayoutCents,
    shopSplitCents: Math.max(netAfterPlatformCents - barberPayoutCents, 0)
  };
}

export function quoteBarberPosSale(input: BarberPosSaleQuoteInput, relationship?: {
  relationshipType?: BarberPosSaleQuote["relationshipType"] | string | null;
  commissionRate?: number | string | null;
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
    grossCents: totalCents,
    relationshipType,
    commissionRate: relationship?.commissionRate
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

async function findSharedThreadIds(supabase: SupabaseClient, leftProfileId: string, rightProfileId: string) {
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
    throw new BarberPosSaleError("Unable to resolve existing payment request conversation.", 500);
  }

  const leftIds = new Set((leftRows.data ?? []).map((row) => row.thread_id as string));
  return (rightRows.data ?? [])
    .map((row) => row.thread_id as string)
    .filter((threadId) => leftIds.has(threadId));
}

async function createOrGetPosPaymentRequestThread(input: {
  supabase: SupabaseClient;
  barberProfile: ProfileRow;
  clientProfile: ProfileRow;
  createdAt: string;
}) {
  const sharedThreadIds = await findSharedThreadIds(input.supabase, input.barberProfile.id, input.clientProfile.id);

  if (sharedThreadIds.length) {
    const threadResult = await input.supabase
      .from("message_threads")
      .select("id, thread_type, appointment_id, location_id, created_at, updated_at, created_by_profile_id")
      .in("id", sharedThreadIds)
      .eq("thread_type", "client_barber")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (threadResult.error) {
      throw new BarberPosSaleError("Unable to load existing payment request conversation.", 500);
    }

    const existingThread = (threadResult.data ?? [])[0] as { id: string } | undefined;
    if (existingThread?.id) {
      return existingThread.id;
    }
  }

  const threadInsert = await input.supabase
    .from("message_threads")
    .insert({
      thread_type: "client_barber",
      appointment_id: null,
      location_id: null,
      created_by_profile_id: input.barberProfile.id,
      updated_at: input.createdAt
    })
    .select("id")
    .single();

  if (threadInsert.error) {
    throw new BarberPosSaleError("Unable to create payment request conversation.", 500);
  }

  const threadId = threadInsert.data.id as string;
  const participantsInsert = await input.supabase
    .from("thread_participants")
    .insert([
      {
        thread_id: threadId,
        profile_id: input.clientProfile.id,
        thread_role: input.clientProfile.role ?? "client_user"
      },
      {
        thread_id: threadId,
        profile_id: input.barberProfile.id,
        thread_role: input.barberProfile.role ?? "barber_user"
      }
    ]);

  if (participantsInsert.error) {
    throw new BarberPosSaleError("Unable to attach payment request conversation participants.", 500);
  }

  return threadId;
}

export async function quoteBarberPosSaleForUser(user: UserAccount, input: BarberPosSaleQuoteInput) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveBarberActor(supabase, user);
  return quoteBarberPosSale(input, {
    relationshipType: actor.relationshipType,
    commissionRate: actor.barber.commission_rate
  });
}

export async function createBarberPosSale(user: UserAccount, input: BarberPosSaleQuoteInput) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveBarberActor(supabase, user);
  const clientId = await resolvePosSaleClientId(supabase, input.clientId);
  const quote = quoteBarberPosSale(input, {
    relationshipType: actor.relationshipType,
    commissionRate: actor.barber.commission_rate
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
    commissionRate: actor.barber.commission_rate
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

  const existingRequest = await supabase
    .from(POS_SCHEMA_TABLES.paymentRequests)
    .select("*")
    .eq("pos_sale_id", sale.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingRequest.error && !isUndefinedColumnError(existingRequest.error)) {
    throw new BarberPosSaleError("Unable to load existing POS payment request.", 500);
  }

  if (existingRequest.data) {
    const request = existingRequest.data as PosPaymentRequestRow;
    if (request.status === "pending" || request.status === "approved" || request.status === "paid") {
      return {
        ok: true,
        sale,
        request,
        payment: null,
        routing: null,
        alreadyRequested: true,
        message: "Payment request already sent. Client approval is required before payout."
      };
    }
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
    createdAt: requestedAt
  });
  const barberName = barberProfile.full_name?.trim() || barberProfile.email || "Your barber";
  const requestBody = `${barberName} requested ${formatUsdFromCents(sale.total_cents)} for a walk-in service.\nApprove Payment or Decline in BVRB3R.`;

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

  const messageInsert = await supabase
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_profile_id: barberProfile.id,
      body: requestBody,
      message_type: "system",
      created_at: requestedAt
    });

  if (messageInsert.error) {
    logPosSaleCreateFailed({
      route: "POST /api/barber/pos-sales/[id]/payment-request",
      stage: "pos_payment_request_message_insert",
      paymentMethod: sale.payment_method ?? "card_on_file",
      payload: {
        thread_id: threadId,
        sender_profile_id: barberProfile.id,
        message_type: "system"
      },
      error: messageInsert.error,
      table: "messages",
      barberId: actor.barber.id,
      profileId: actor.profileId,
      clientId: sale.client_id,
      amountCents: sale.total_cents
    });
    throw new BarberPosSaleError("Unable to send the POS payment request message.", 500, buildPosSaleDebug(messageInsert.error, "messages", "pos_payment_request_message_failed"));
  }

  const threadUpdate = await supabase
    .from("message_threads")
    .update({ updated_at: requestedAt })
    .eq("id", threadId);

  if (threadUpdate.error) {
    throw new BarberPosSaleError("Unable to update the POS payment request conversation.", 500);
  }

  return {
    ok: true,
    sale,
    request: requestInsert.data as PosPaymentRequestRow,
    payment: null,
    routing: null,
    alreadyRequested: false,
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
