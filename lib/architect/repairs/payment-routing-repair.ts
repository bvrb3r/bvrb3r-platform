import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPaymentSuccessful, numberValue, roundMoney } from "@/lib/architect/debug/diagnosis";
import type { ArchitectActor, ArchitectRepairResult, JsonRecord } from "@/lib/architect/debug/types";
import {
  DEFAULT_PAYMENT_ROUTING_CONSTRAINTS,
  loadPaymentRoutingConstraintEvidence,
  moneyRoutingDbValueForManualReview,
  moneyRoutingDbValueForPending,
  paymentRoutingConstraintEvidenceToJson,
  readinessDbValueForBusinessMeaning,
  reconciliationDbValueForManualReview,
  reconciliationDbValueForOpen
} from "@/lib/architect/mission-control/schema-constraints";
import { writeArchitectRepairAudit } from "@/lib/architect/repairs/audit";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type RoutingModel = "freelance" | "booth_rent" | "commission";
type RoutingRecipient = "barber" | "shop" | "split";

type RoutingRelationshipContext = {
  routingModel: RoutingModel;
  payoutRecipientType: RoutingRecipient;
  barberId: unknown;
  shopId: unknown;
  barberPercent: number | null;
  shopPercent: number | null;
  relationshipId: unknown;
  compensationRuleId: unknown;
  relationshipKnown: boolean;
  reviewReason: string | null;
};

function safeErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown error");
  }
  return "Unknown error";
}

async function maybeSingleBy<T extends JsonRecord>(supabase: SupabaseClient, table: string, column: string, value: unknown) {
  const result = await supabase
    .from(table)
    .select("*")
    .eq(column, value)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return (result.data as T | null) ?? null;
}

async function readTableColumns(supabase: SupabaseClient, tableName: string) {
  const result = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_name", tableName);

  if (result.error) {
    console.warn("[architect-repair] schema_column_lookup_failed", {
      tableName,
      errorMessage: result.error.message
    });
    return null;
  }

  return new Set(((result.data ?? []) as JsonRecord[]).map((row) => String(row.column_name ?? "")));
}

function filterPayloadToColumns<T extends JsonRecord>(payload: T, columns: Set<string> | null) {
  if (!columns?.size) {
    return payload;
  }

  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key))) as T;
}

function normalizeRoutingModel(value: unknown): RoutingModel | null {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "freelance" || normalized === "booth_rent" || normalized === "commission") {
    return normalized;
  }
  return null;
}

function numberOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function resolveRoutingRelationshipContext(
  supabase: SupabaseClient,
  appointment: JsonRecord
): Promise<RoutingRelationshipContext> {
  const barber = appointment.barber_id
    ? await maybeSingleBy<JsonRecord>(supabase, "barbers", "id", appointment.barber_id)
    : null;

  if (!appointment.shop_id) {
    return {
      routingModel: "freelance",
      payoutRecipientType: "barber",
      barberId: appointment.barber_id ?? barber?.id ?? null,
      shopId: null,
      barberPercent: null,
      shopPercent: null,
      relationshipId: null,
      compensationRuleId: null,
      relationshipKnown: true,
      reviewReason: null
    };
  }

  const relationshipResult = await supabase
    .from("shop_barber_relationships")
    .select("*")
    .eq("barber_id", appointment.barber_id)
    .eq("shop_id", appointment.shop_id)
    .limit(1)
    .maybeSingle();

  const relationship = relationshipResult.error ? null : ((relationshipResult.data as JsonRecord | null) ?? null);
  const routingModel = normalizeRoutingModel(relationship?.relationship_type)
    ?? normalizeRoutingModel(relationship?.type)
    ?? normalizeRoutingModel(barber?.barber_subtype)
    ?? "booth_rent";

  let compensationRule: JsonRecord | null = null;
  if (routingModel === "commission") {
    const ruleResult = await supabase
      .from("compensation_rules")
      .select("*")
      .eq("barber_id", appointment.barber_id)
      .eq("shop_id", appointment.shop_id)
      .limit(1)
      .maybeSingle();
    compensationRule = ruleResult.error ? null : ((ruleResult.data as JsonRecord | null) ?? null);
  }

  const barberPercent = numberOrNull(compensationRule?.barber_percent ?? compensationRule?.barber_rate_percent ?? relationship?.barber_percent);
  const shopPercent = numberOrNull(compensationRule?.shop_percent ?? compensationRule?.shop_rate_percent ?? relationship?.shop_percent);

  return {
    routingModel,
    payoutRecipientType: routingModel === "commission" ? "split" : "barber",
    barberId: appointment.barber_id ?? barber?.id ?? null,
    shopId: appointment.shop_id,
    barberPercent,
    shopPercent,
    relationshipId: relationship?.id ?? null,
    compensationRuleId: compensationRule?.id ?? null,
    relationshipKnown: Boolean(relationship),
    reviewReason: relationship
      ? null
      : "Shop relationship truth is missing for this completed captured payment; routing requires manual review."
  };
}

function calculateRoutingAmounts(input: {
  gross: number;
  routingModel: RoutingModel;
  barberPercent: number | null;
  shopPercent: number | null;
}) {
  const platformFee = roundMoney(input.gross * 0.05);
  const netAfterPlatform = roundMoney(Math.max(input.gross - platformFee, 0));

  if (input.routingModel === "commission" && input.barberPercent !== null && input.shopPercent !== null) {
    return {
      platformFee,
      barberPayout: roundMoney(netAfterPlatform * (input.barberPercent / 100)),
      shopSplit: roundMoney(netAfterPlatform * (input.shopPercent / 100))
    };
  }

  return {
    platformFee,
    barberPayout: netAfterPlatform,
    shopSplit: 0
  };
}

export function buildPaymentRoutingRepairPayload(input: {
  appointment: JsonRecord;
  payment: JsonRecord;
  relationshipContext: RoutingRelationshipContext;
  nowIso?: string;
  constraintEvidence?: typeof DEFAULT_PAYMENT_ROUTING_CONSTRAINTS;
}) {
  const now = input.nowIso ?? new Date().toISOString();
  const gross = roundMoney(numberValue(input.payment.amount));
  const amounts = calculateRoutingAmounts({
    gross,
    routingModel: input.relationshipContext.routingModel,
    barberPercent: input.relationshipContext.barberPercent,
    shopPercent: input.relationshipContext.shopPercent
  });
  const constraintEvidence = input.constraintEvidence ?? DEFAULT_PAYMENT_ROUTING_CONSTRAINTS;
  const requiresManualReview = !input.relationshipContext.relationshipKnown;
  const payoutReadinessStatus = requiresManualReview
    ? readinessDbValueForBusinessMeaning(constraintEvidence, "needs_attention")
    : readinessDbValueForBusinessMeaning(constraintEvidence, "eligible");
  const moneyRoutingStatus = requiresManualReview
    ? moneyRoutingDbValueForManualReview(constraintEvidence)
    : moneyRoutingDbValueForPending(constraintEvidence);
  const reconciliationStatus = requiresManualReview
    ? reconciliationDbValueForManualReview(constraintEvidence)
    : reconciliationDbValueForOpen(constraintEvidence);

  return {
    payment_id: input.payment.id,
    appointment_id: input.appointment.id,
    barber_id: input.relationshipContext.barberId ?? input.appointment.barber_id ?? null,
    shop_id: input.relationshipContext.shopId ?? input.appointment.shop_id ?? null,
    membership_id: null,
    routing_model: input.relationshipContext.routingModel,
    payout_recipient_type: input.relationshipContext.payoutRecipientType,
    provider_gross_amount: gross,
    refunded_amount: 0,
    provider_fee_amount: 0,
    provider_net_amount: gross,
    platform_fee_amount: amounts.platformFee,
    barber_payout_amount: amounts.barberPayout,
    shop_split_amount: amounts.shopSplit,
    currency: String(input.payment.currency ?? "usd").toLowerCase(),
    payout_readiness_status: payoutReadinessStatus,
    money_routing_status: moneyRoutingStatus,
    blocked_reason: input.relationshipContext.reviewReason,
    metadata: {
      repairReason: "missing_routing_record_on_completion",
      source: "architect_payment_routing_repair",
      relationshipType: input.relationshipContext.routingModel,
      relationshipId: input.relationshipContext.relationshipId,
      compensationRuleId: input.relationshipContext.compensationRuleId,
      readinessMeaning: requiresManualReview ? "needs_attention" : "eligible",
      payoutReadinessDbValue: payoutReadinessStatus,
      moneyRoutingDbValue: moneyRoutingStatus,
      constraintSource: constraintEvidence.source,
      manualReviewReason: input.relationshipContext.reviewReason,
      appointmentId: input.appointment.id,
      paymentId: input.payment.id,
      barberId: input.appointment.barber_id,
      clientId: input.appointment.client_id
    },
    created_at: now,
    updated_at: now,
    processor_charge_id: input.payment.provider_payment_intent_id ?? null,
    processor_balance_transaction_id: null,
    reconciliation_status: reconciliationStatus,
    eligible_at: requiresManualReview ? null : now,
    released_at: null,
    held_at: requiresManualReview ? now : null,
    reversed_at: null
  };
}

export function buildFreelancePaymentRoutingRepairPayload(input: {
  appointment: JsonRecord;
  payment: JsonRecord;
  nowIso?: string;
  constraintEvidence?: typeof DEFAULT_PAYMENT_ROUTING_CONSTRAINTS;
}) {
  return buildPaymentRoutingRepairPayload({
    ...input,
    relationshipContext: {
      routingModel: "freelance",
      payoutRecipientType: "barber",
      barberId: input.appointment.barber_id ?? null,
      shopId: null,
      barberPercent: null,
      shopPercent: null,
      relationshipId: null,
      compensationRuleId: null,
      relationshipKnown: true,
      reviewReason: null
    }
  });
}

export function buildCapturedCancelledPaymentRoutingReviewPayload(input: {
  appointment: JsonRecord;
  payment: JsonRecord;
  nowIso?: string;
  constraintEvidence?: typeof DEFAULT_PAYMENT_ROUTING_CONSTRAINTS;
}) {
  const now = input.nowIso ?? new Date().toISOString();
  const gross = roundMoney(numberValue(input.payment.amount));
  const constraintEvidence = input.constraintEvidence ?? DEFAULT_PAYMENT_ROUTING_CONSTRAINTS;
  const payoutReadinessStatus = readinessDbValueForBusinessMeaning(constraintEvidence, "blocked");
  const moneyRoutingStatus = moneyRoutingDbValueForManualReview(constraintEvidence);
  const reconciliationStatus = reconciliationDbValueForManualReview(constraintEvidence);
  const reviewReason = "Captured payment is attached to a cancelled appointment and requires refund or reversal review before routing can pass.";

  return {
    payment_id: input.payment.id,
    appointment_id: input.appointment.id,
    barber_id: input.appointment.barber_id ?? input.payment.barber_id ?? null,
    shop_id: input.appointment.shop_id ?? input.payment.shop_id ?? null,
    membership_id: input.appointment.membership_id ?? null,
    routing_model: "freelance" as RoutingModel,
    payout_recipient_type: "barber" as RoutingRecipient,
    provider_gross_amount: gross,
    refunded_amount: 0,
    provider_fee_amount: 0,
    provider_net_amount: gross,
    platform_fee_amount: 0,
    barber_payout_amount: 0,
    shop_split_amount: 0,
    currency: String(input.payment.currency ?? "usd").toLowerCase(),
    payout_readiness_status: payoutReadinessStatus,
    money_routing_status: moneyRoutingStatus,
    blocked_reason: reviewReason,
    metadata: {
      repairReason: "captured_payment_cancelled_appointment_review",
      source: "architect_payment_routing_repair",
      readinessMeaning: "blocked",
      payoutReadinessDbValue: payoutReadinessStatus,
      moneyRoutingDbValue: moneyRoutingStatus,
      constraintSource: constraintEvidence.source,
      manualReviewReason: reviewReason,
      appointmentId: input.appointment.id,
      paymentId: input.payment.id,
      barberId: input.appointment.barber_id ?? input.payment.barber_id ?? null,
      clientId: input.appointment.client_id ?? input.payment.client_id ?? null
    },
    created_at: now,
    updated_at: now,
    processor_charge_id: input.payment.provider_payment_intent_id ?? null,
    processor_balance_transaction_id: null,
    reconciliation_status: reconciliationStatus,
    eligible_at: null,
    released_at: null,
    held_at: now,
    reversed_at: null
  };
}

function capturedCancelledRoutingNeedsReview(routing: JsonRecord | null, isCapturedCancelled: boolean) {
  if (!routing || !isCapturedCancelled) {
    return false;
  }

  return String(routing.payout_readiness_status ?? "").toLowerCase() !== "blocked"
    || String(routing.money_routing_status ?? "").toLowerCase() !== "manual_review"
    || String(routing.reconciliation_status ?? "").toLowerCase() !== "manual_review"
    || Boolean(routing.released_at);
}

export async function repairMissingPaymentRouting(
  supabase: SupabaseClient,
  actor: ArchitectActor,
  appointmentId: string
): Promise<ArchitectRepairResult> {
  const repairType = "payment_routing";
  const targetType = "appointment";
  const safetyClass = "safe" as const;
  let before: JsonRecord = {};

  try {
    const appointment = await maybeSingleBy<JsonRecord>(supabase, "appointments", "id", appointmentId);
    if (!appointment) {
      throw new Error("Appointment was not found.");
    }

    const appointmentStatus = String(appointment.status ?? "").toLowerCase();

    const paymentsResult = await supabase
      .from("payments")
      .select("*")
      .eq("appointment_id", appointment.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (paymentsResult.error) {
      throw paymentsResult.error;
    }

    const payment = ((paymentsResult.data ?? []) as JsonRecord[])[0] ?? null;
    before = { appointment, payment, routing: null };
    if (!payment) {
      throw new Error("No payment row was found for this appointment.");
    }

    const isCapturedCancelled = ["cancelled", "canceled"].includes(appointmentStatus) && isPaymentSuccessful(payment);
    if (appointmentStatus !== "completed" && !isCapturedCancelled) {
      return {
        ok: false,
        repairType,
        targetType,
        targetId: appointmentId,
        safetyClass,
        repaired: false,
        before: { appointment, payment },
        after: {},
        result: "failed",
        auditId: await writeArchitectRepairAudit(supabase, {
          actor,
          repairType,
          targetType,
          targetId: appointmentId,
          safetyClass,
          beforeSnapshot: { appointment, payment },
          afterSnapshot: null,
          result: "failed",
          errorCode: "appointment_not_completed",
          errorMessageSafe: "Payment routing repair requires a completed appointment, or a captured payment attached to a cancelled appointment for manual-review routing."
        }),
        error: "Payment routing repair requires a completed appointment, or a captured payment attached to a cancelled appointment for manual-review routing."
      };
    }

    if (!isPaymentSuccessful(payment)) {
      throw new Error("Payment is not captured, succeeded, paid, or completed.");
    }

    const existingRouting = await maybeSingleBy<JsonRecord>(supabase, "payment_routing_records", "appointment_id", appointment.id);
    const existingRoutingNeedsReview = capturedCancelledRoutingNeedsReview(existingRouting, isCapturedCancelled);
    if (existingRouting && !existingRoutingNeedsReview) {
      const auditId = await writeArchitectRepairAudit(supabase, {
        actor,
        repairType,
        targetType,
        targetId: appointmentId,
        safetyClass,
        beforeSnapshot: { appointment, payment, routing: existingRouting },
        afterSnapshot: { routing: existingRouting },
        result: "skipped",
        payload: { reason: "routing_already_exists" }
      });
      return {
        ok: true,
        repairType,
        targetType,
        targetId: appointmentId,
        safetyClass,
        repaired: false,
        before: { appointment, payment, routing: existingRouting },
        after: { routing: existingRouting },
        result: "skipped",
        auditId,
        routingFound: true,
        routingId: String(existingRouting.id ?? "")
      };
    }

    const existingPaymentRouting = existingRouting
      ?? await maybeSingleBy<JsonRecord>(supabase, "payment_routing_records", "payment_id", payment.id);
    if (existingPaymentRouting?.appointment_id && existingPaymentRouting.appointment_id !== appointment.id) {
      throw new Error("A routing row already exists for this payment but points at a different appointment.");
    }

    const [constraintEvidence, routingColumns, relationshipContext] = await Promise.all([
      loadPaymentRoutingConstraintEvidence(supabase),
      readTableColumns(supabase, "payment_routing_records"),
      resolveRoutingRelationshipContext(supabase, appointment)
    ]);
    const rawPayload = isCapturedCancelled
      ? buildCapturedCancelledPaymentRoutingReviewPayload({ appointment, payment, constraintEvidence })
      : buildPaymentRoutingRepairPayload({ appointment, payment, relationshipContext, constraintEvidence });
    const payload = filterPayloadToColumns(rawPayload, routingColumns);
    console.info("[architect-repair] payment_routing_repair_started", {
      appointmentId,
      payloadKeys: Object.keys(payload),
      providerGrossAmount: payload.provider_gross_amount,
      platformFeeAmount: payload.platform_fee_amount,
      barberPayoutAmount: payload.barber_payout_amount,
      shopSplitAmount: payload.shop_split_amount,
      routingModel: rawPayload.routing_model,
      payoutRecipientType: rawPayload.payout_recipient_type,
      columnsFiltered: Boolean(routingColumns?.size),
      payoutReadinessStatus: payload.payout_readiness_status,
      allowedPayoutReadinessStatus: constraintEvidence.allowedValues.payout_readiness_status
    });

    const relinkPayload = routingColumns && !routingColumns.has("created_at")
      ? payload
      : {
        ...payload,
        created_at: existingPaymentRouting?.created_at ?? payload.created_at
      };
    const writeResult = existingPaymentRouting
      ? await supabase
        .from("payment_routing_records")
        .update(relinkPayload)
        .eq("id", existingPaymentRouting.id)
        .select("*")
        .single()
      : await supabase
        .from("payment_routing_records")
        .insert(payload)
        .select("*")
        .single();

    if (writeResult.error) {
      console.error("[architect-repair] payment_routing_repair_failed", {
        appointmentId,
        postgresCode: writeResult.error.code,
        postgresDetails: writeResult.error.details,
        errorMessage: writeResult.error.message,
        payloadKeys: Object.keys(payload),
        rawPayloadKeys: Object.keys(rawPayload)
      });
      throw writeResult.error;
    }

    const routing = writeResult.data as JsonRecord;
    const repairedResult = existingPaymentRouting ? "relinked" : "inserted";
    console.info("[architect-repair] payment_routing_repair_succeeded", {
      appointmentId,
      routingId: routing.id,
      repairedResult,
      payoutReadinessStatus: routing.payout_readiness_status,
      eligibleAtPresent: Boolean(routing.eligible_at)
    });
    const auditId = await writeArchitectRepairAudit(supabase, {
      actor,
      repairType,
      targetType,
      targetId: appointmentId,
      safetyClass,
      beforeSnapshot: {
        ...before,
        routingByPayment: existingPaymentRouting ?? null
      },
      afterSnapshot: { routing },
      payload: {
        attemptedPayload: payload,
        rawPayload,
        repairedResult,
        constraintEvidence: paymentRoutingConstraintEvidenceToJson(constraintEvidence)
      },
      result: "succeeded"
    });

    return {
      ok: true,
      repairType,
      targetType,
      targetId: appointmentId,
      safetyClass,
      repaired: true,
      before: {
        ...before,
        routingByPayment: existingPaymentRouting ?? null
      },
      after: { routing },
      result: "succeeded",
      auditId,
      routingFound: true,
      routingId: String(routing.id ?? "")
    };
  } catch (error) {
    const errorLike = error as { code?: string; details?: string; message?: string };
    const auditId = await writeArchitectRepairAudit(supabase, {
      actor,
      repairType,
      targetType,
      targetId: appointmentId,
      safetyClass,
      beforeSnapshot: before,
      afterSnapshot: null,
      result: "failed",
      errorCode: errorLike.code ?? "repair_failed",
      errorMessageSafe: safeErrorMessage(error),
      postgresCode: errorLike.code ?? null,
      postgresDetails: errorLike.details ?? null
    });

    return {
      ok: false,
      repairType,
      targetType,
      targetId: appointmentId,
      safetyClass,
      repaired: false,
      before,
      after: {},
      result: "failed",
      auditId,
      routingFound: false,
      error: safeErrorMessage(error)
    };
  }
}
