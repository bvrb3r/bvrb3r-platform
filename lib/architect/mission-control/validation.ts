import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPaymentSuccessful, numberValue, roundMoney } from "@/lib/architect/debug/diagnosis";
import type { ArchitectActor, ArchitectValidationChecklistItem, JsonRecord } from "@/lib/architect/debug/types";
import {
  isPayoutReadinessEligible,
  loadPaymentRoutingConstraintEvidence,
  payoutReadinessMeaning
} from "@/lib/architect/mission-control/schema-constraints";
import type { MissionValidationResult } from "@/lib/architect/mission-control/types";
import { expectedFreelanceRoutingFromPayment } from "@/lib/architect/mission-control/incident-detection";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function maybeSingleBy<T extends JsonRecord>(supabase: SupabaseClient, table: string, column: string, value: unknown) {
  const result = await supabase
    .from(table)
    .select("*")
    .eq(column, value)
    .maybeSingle();

  if (result.error) throw result.error;
  return (result.data as T | null) ?? null;
}

async function selectRows<T extends JsonRecord>(supabase: SupabaseClient, table: string, column: string, value: unknown, orderColumn?: string) {
  let query = supabase
    .from(table)
    .select("*")
    .eq(column, value);

  if (orderColumn) query = query.order(orderColumn, { ascending: false });
  const result = await query;
  if (result.error) throw result.error;
  return ((result.data ?? []) as unknown as T[]) ?? [];
}

function check(stage: string, passed: boolean, reason?: string): ArchitectValidationChecklistItem {
  return {
    stage,
    status: passed ? "pass" : "fail",
    reason: passed ? undefined : reason
  };
}

async function persistValidationRun(
  supabase: SupabaseClient,
  actor: ArchitectActor,
  result: Omit<MissionValidationResult, "auditId">
) {
  const insert = await supabase
    .from("architect_validation_runs")
    .insert({
      actor_profile_id: actor.id,
      validation_type: result.validationType,
      target_type: result.targetType,
      target_id: result.targetId,
      expected_state: {
        appointmentStatus: "completed",
        paymentStatus: ["captured", "succeeded", "paid", "completed"],
        routingMeaning: "eligible",
        releasedAt: null
      },
      actual_state: result.actualState,
      passed: result.passed,
      failed_checks: result.checks.filter((item) => item.status === "fail")
    })
    .select("id")
    .single();

  if (insert.error) {
    console.warn("[architect-mission] validation audit write failed", {
      appointmentId: result.targetId,
      errorMessage: insert.error.message
    });
    return null;
  }

  return String((insert.data as JsonRecord).id);
}

export async function validateAppointmentProductionState(
  supabase: SupabaseClient,
  actor: ArchitectActor,
  appointmentId: string
): Promise<MissionValidationResult> {
  const checkedAt = new Date().toISOString();
  const [appointment, payments, routingRows, statusHistory, constraints] = await Promise.all([
    maybeSingleBy<JsonRecord>(supabase, "appointments", "id", appointmentId),
    selectRows<JsonRecord>(supabase, "payments", "appointment_id", appointmentId, "created_at"),
    selectRows<JsonRecord>(supabase, "payment_routing_records", "appointment_id", appointmentId, "updated_at"),
    selectRows<JsonRecord>(supabase, "appointment_status_history", "appointment_id", appointmentId, "changed_at"),
    loadPaymentRoutingConstraintEvidence(supabase)
  ]);
  const payment = payments[0] ?? null;
  const routing = routingRows[0] ?? null;
  const expected = payment ? expectedFreelanceRoutingFromPayment(payment) : null;
  const completedHistory = statusHistory.filter((row) =>
    String(row.new_status ?? row.status ?? "").toLowerCase() === "completed"
      || String(row.change_reason ?? "").toLowerCase() === "barber_completed_service"
  );
  const readinessStatus = String(routing?.payout_readiness_status ?? "");
  const readinessLegal = constraints.allowedValues.payout_readiness_status
    .map((value) => value.toLowerCase())
    .includes(readinessStatus.toLowerCase());

  const checks: ArchitectValidationChecklistItem[] = [
    check("appointment_exists", Boolean(appointment), "appointment row missing"),
    check("appointment_completed", String(appointment?.status ?? "").toLowerCase() === "completed", `status=${String(appointment?.status ?? "missing")}`),
    check("completed_at_populated", Boolean(appointment?.completed_at), "completed_at is empty"),
    check("payment_exists", Boolean(payment), "payments row missing"),
    check("payment_captured", isPaymentSuccessful(payment), `status=${String(payment?.status ?? payment?.payment_status ?? "missing")}`),
    check("completed_history_exists", completedHistory.length > 0, "completed status history row missing"),
    check("completed_history_not_duplicate", completedHistory.length <= 1, `${completedHistory.length} completed history rows found`),
    check("routing_exists", Boolean(routing), "payment_routing_records row missing"),
    check("routing_platform_fee_correct", Boolean(routing && expected && roundMoney(numberValue(routing.platform_fee_amount)) === expected.platformFee), "platform fee mismatch"),
    check("routing_barber_payout_correct", Boolean(routing && expected && roundMoney(numberValue(routing.barber_payout_amount)) === expected.barberPayout), "barber payout mismatch"),
    check("routing_shop_split_correct", Boolean(routing && expected && roundMoney(numberValue(routing.shop_split_amount)) === expected.shopSplit), "shop split mismatch"),
    check("routing_readiness_production_legal", Boolean(routing && readinessLegal), `payout_readiness_status=${readinessStatus || "missing"}`),
    check("routing_readiness_eligible_meaning", isPayoutReadinessEligible(readinessStatus), `readiness meaning=${payoutReadinessMeaning(readinessStatus)}`),
    check("eligible_at_populated", Boolean(routing?.eligible_at), "eligible_at is empty"),
    check("released_at_null", !routing?.released_at, "released_at should remain null")
  ];
  const passed = checks.every((item) => item.status === "pass");
  const actualState = {
    appointment,
    payment,
    routing,
    completedHistoryCount: completedHistory.length,
    expectedRouting: expected,
    readinessMeaning: payoutReadinessMeaning(readinessStatus),
    legalReadinessValues: constraints.allowedValues.payout_readiness_status
  };
  const withoutAudit = {
    ok: true as const,
    checkedAt,
    validationType: "payment_routing_eligibility" as const,
    targetType: "appointment" as const,
    targetId: appointmentId,
    passed,
    checks,
    actualState
  };

  return {
    ...withoutAudit,
    auditId: await persistValidationRun(supabase, actor, withoutAudit)
  };
}
