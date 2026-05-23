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
};

type BarberLookupAttempt = {
  column: "id" | "reference_code" | "profile_id";
  value: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

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

export class BarberPosSaleError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "BarberPosSaleError";
    this.status = status;
  }
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
    .select("id, email, role")
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
    .select("id, email, role")
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
  return {
    profileId: profile?.id ?? barber.profile_id ?? user.id,
    barber,
    relationshipType,
    shopId: relationshipType === "freelance" ? null : user.locationIds[0] ?? null
  };
}

async function loadPosSaleForActor(supabase: SupabaseClient, user: UserAccount, saleId: string) {
  const actor = await resolveBarberActor(supabase, user);
  const result = await supabase
    .from("pos_sales")
    .select("*")
    .eq("id", saleId)
    .eq("barber_id", actor.barber.id)
    .maybeSingle();

  if (result.error) {
    throw new BarberPosSaleError("Unable to load the POS sale.", 500);
  }

  if (!result.data) {
    throw new BarberPosSaleError("POS sale not found.", 404);
  }

  return { actor, sale: result.data as PosSaleRow };
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
  const quote = quoteBarberPosSale(input, {
    relationshipType: actor.relationshipType,
    commissionRate: actor.barber.commission_rate
  });
  const now = new Date().toISOString();
  const saleInsert = await supabase
    .from("pos_sales")
    .insert({
      barber_id: actor.barber.id,
      shop_id: actor.shopId,
      client_id: input.clientId?.trim() || null,
      customer_name: input.customerName?.trim() || null,
      customer_phone: input.customerPhone?.trim() || null,
      customer_email: input.customerEmail?.trim() || null,
      payment_method: normalizePaymentMethod(input.paymentMethod),
      invoice_status: input.paymentMethod === "invoice" ? "pending" : null,
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
    })
    .select("*")
    .single();

  if (saleInsert.error) {
    throw new BarberPosSaleError("Unable to create the POS sale.", 500);
  }

  const sale = saleInsert.data as PosSaleRow;
  const baseItems = input.items?.length
    ? input.items.map((item) => normalizeItem(item, quote.subtotalCents))
    : [normalizeItem(null, quote.subtotalCents)];
  const itemInsert = await supabase
    .from("pos_sale_items")
    .insert(baseItems.map((item) => ({
      ...item,
      pos_sale_id: sale.id,
      created_at: now
    })));

  if (itemInsert.error) {
    await supabase.from("pos_sales").update({ status: "voided", updated_at: new Date().toISOString() }).eq("id", sale.id);
    throw new BarberPosSaleError("Unable to create the POS sale items.", 500);
  }

  return {
    ok: true,
    sale,
    quote
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
  const cashUpdate = await supabase
    .from("pos_sales")
    .update({
      status: "paid",
      payment_method: "cash",
      cash_recorded_at: paidAt,
      updated_at: paidAt
    })
    .eq("id", sale.id)
    .eq("barber_id", actor.barber.id)
    .select("*")
    .single();

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
    .from("pos_sales")
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

  if (paymentMethod === "invoice") {
    throw new BarberPosSaleError("Send the invoice link and wait for payment before capturing.", 409);
  }

  const paidAt = new Date().toISOString();
  const paidUpdate = await supabase
    .from("pos_sales")
    .update({ status: "paid", payment_method: paymentMethod, updated_at: paidAt })
    .eq("id", sale.id)
    .eq("barber_id", actor.barber.id)
    .select("*")
    .single();

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
      paymentMethodId: null,
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
      .from("pos_sales")
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
        .from("pos_sales")
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
    .from("pos_sales")
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
