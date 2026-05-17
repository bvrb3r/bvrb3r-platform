import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPaymentSuccessful, numberValue, roundMoney } from "@/lib/architect/debug/diagnosis";
import type { ArchitectActor, ArchitectRepairResult, JsonRecord } from "@/lib/architect/debug/types";
import { writeArchitectRepairAudit } from "@/lib/architect/repairs/audit";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

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

export function buildFreelancePaymentRoutingRepairPayload(input: {
  appointment: JsonRecord;
  payment: JsonRecord;
  nowIso?: string;
}) {
  const now = input.nowIso ?? new Date().toISOString();
  const gross = roundMoney(numberValue(input.payment.amount));
  const platformFee = roundMoney(gross * 0.05);
  const barberPayout = roundMoney(Math.max(gross - platformFee, 0));

  return {
    payment_id: input.payment.id,
    appointment_id: input.appointment.id,
    membership_id: null,
    routing_model: "freelance",
    payout_recipient_type: "barber",
    provider_gross_amount: gross,
    refunded_amount: 0,
    provider_fee_amount: 0,
    provider_net_amount: gross,
    platform_fee_amount: platformFee,
    barber_payout_amount: barberPayout,
    shop_split_amount: 0,
    currency: String(input.payment.currency ?? "usd").toLowerCase(),
    payout_readiness_status: "eligible",
    money_routing_status: "pending",
    blocked_reason: null,
    metadata: {
      repairReason: "missing_routing_record_on_completion",
      source: "architect_payment_routing_repair",
      relationshipType: "freelance",
      appointmentId: input.appointment.id,
      paymentId: input.payment.id,
      barberId: input.appointment.barber_id,
      clientId: input.appointment.client_id
    },
    created_at: now,
    updated_at: now,
    processor_charge_id: input.payment.provider_payment_intent_id ?? null,
    processor_balance_transaction_id: null,
    reconciliation_status: "open",
    eligible_at: now,
    released_at: null,
    held_at: null,
    reversed_at: null
  };
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

    if (String(appointment.status ?? "").toLowerCase() !== "completed") {
      return {
        ok: false,
        repairType,
        targetType,
        targetId: appointmentId,
        safetyClass,
        repaired: false,
        before: { appointment },
        after: {},
        result: "failed",
        auditId: await writeArchitectRepairAudit(supabase, {
          actor,
          repairType,
          targetType,
          targetId: appointmentId,
          safetyClass,
          beforeSnapshot: { appointment },
          afterSnapshot: null,
          result: "failed",
          errorCode: "appointment_not_completed",
          errorMessageSafe: "Payment routing repair requires a completed appointment."
        }),
        error: "Payment routing repair requires a completed appointment."
      };
    }

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

    if (!isPaymentSuccessful(payment)) {
      throw new Error("Payment is not captured, succeeded, paid, or completed.");
    }

    const existingRouting = await maybeSingleBy<JsonRecord>(supabase, "payment_routing_records", "appointment_id", appointment.id);
    if (existingRouting) {
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
        auditId
      };
    }

    const payload = buildFreelancePaymentRoutingRepairPayload({ appointment, payment });
    console.info("[architect-repair] payment_routing_repair_started", {
      appointmentId,
      payloadKeys: Object.keys(payload),
      providerGrossAmount: payload.provider_gross_amount,
      platformFeeAmount: payload.platform_fee_amount,
      barberPayoutAmount: payload.barber_payout_amount,
      shopSplitAmount: payload.shop_split_amount
    });

    const insertResult = await supabase
      .from("payment_routing_records")
      .insert(payload)
      .select("*")
      .single();

    if (insertResult.error) {
      console.error("[architect-repair] payment_routing_repair_failed", {
        appointmentId,
        postgresCode: insertResult.error.code,
        postgresDetails: insertResult.error.details,
        errorMessage: insertResult.error.message,
        payloadKeys: Object.keys(payload)
      });
      throw insertResult.error;
    }

    const routing = insertResult.data as JsonRecord;
    console.info("[architect-repair] payment_routing_repair_succeeded", {
      appointmentId,
      routingId: routing.id,
      payoutReadinessStatus: routing.payout_readiness_status,
      eligibleAtPresent: Boolean(routing.eligible_at)
    });
    const auditId = await writeArchitectRepairAudit(supabase, {
      actor,
      repairType,
      targetType,
      targetId: appointmentId,
      safetyClass,
      beforeSnapshot: before,
      afterSnapshot: { routing },
      payload,
      result: "succeeded"
    });

    return {
      ok: true,
      repairType,
      targetType,
      targetId: appointmentId,
      safetyClass,
      repaired: true,
      before,
      after: { routing },
      result: "succeeded",
      auditId
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
      error: safeErrorMessage(error)
    };
  }
}
