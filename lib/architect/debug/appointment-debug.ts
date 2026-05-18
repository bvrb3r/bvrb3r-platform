import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateCodexPromptFromDebugPacket } from "@/lib/architect/debug/codex-prompt";
import { diagnoseAppointment, evidence } from "@/lib/architect/debug/diagnosis";
import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";
import { buildAppointmentSqlSnippets } from "@/lib/architect/debug/sql-snippets";
import type { ArchitectActor, ArchitectDebugPacket, JsonRecord } from "@/lib/architect/debug/types";
import { isPayoutReadinessEligible } from "@/lib/architect/mission-control/schema-constraints";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const APPOINTMENT_SELECT = "*";
const PAYMENT_SELECT = "*";
const ROUTING_SELECT = "*";
const HISTORY_SELECT = "*";
const PLATFORM_EVENT_SELECT = "*";

async function maybeSingleBy<T extends JsonRecord>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  column: string,
  value: unknown
) {
  if (!value) return null;
  const result = await supabase
    .from(table)
    .select(select)
    .eq(column, value)
    .maybeSingle();

  if (result.error) {
    throw new Error(`${table}.${column} lookup failed: ${result.error.message ?? "unknown error"}`);
  }

  return (result.data as T | null) ?? null;
}

async function selectRows<T extends JsonRecord>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  column: string,
  value: unknown,
  options: { orderColumn?: string; ascending?: boolean; optional?: boolean } = {}
) {
  if (!value) return [];
  let query = supabase
    .from(table)
    .select(select)
    .eq(column, value);

  if (options.orderColumn) {
    query = query.order(options.orderColumn, { ascending: options.ascending ?? false });
  }

  const result = await query;
  if (result.error) {
    if (options.optional) {
      return [];
    }
    throw new Error(`${table}.${column} row lookup failed: ${result.error.message ?? "unknown error"}`);
  }

  return ((result.data ?? []) as unknown as T[]) ?? [];
}

async function readCriticalSchemaEvidence(supabase: SupabaseClient) {
  const criticalColumns: Record<string, string[]> = {
    appointments: ["status", "completed_at"],
    payments: ["amount", "payment_status"],
    payment_routing_records: ["provider_gross_amount", "barber_payout_amount", "payout_readiness_status"],
    appointment_status_history: ["changed_at", "change_reason"]
  };
  const rows = await Promise.all(Object.entries(criticalColumns).map(async ([table, columns]) => {
    const result = await supabase
      .from("information_schema.columns")
      .select("table_name,column_name,data_type,is_nullable")
      .eq("table_name", table);

    if (result.error) {
      return evidence(`${table} schema`, "warning", "Schema evidence could not be loaded.", {
        table,
        error: result.error.message
      });
    }

    const available = new Set(((result.data ?? []) as JsonRecord[]).map((row) => String(row.column_name)));
    const missing = columns.filter((column) => !available.has(column));
    return evidence(
      `${table} schema`,
      missing.length ? "fail" : "pass",
      missing.length ? `Missing expected columns: ${missing.join(", ")}` : "Critical production columns are present.",
      { table, missing, expected: columns }
    );
  }));

  return rows;
}

function buildValidationChecklist(packet: Pick<ArchitectDebugPacket, "entities">) {
  const appointment = packet.entities.appointment;
  const payment = packet.entities.payment;
  const routing = packet.entities.routing;
  return [
    {
      stage: "appointment_exists",
      status: appointment ? "pass" as const : "fail" as const,
      reason: appointment ? undefined : "appointments row missing"
    },
    {
      stage: "payment_captured",
      status: payment && ["captured", "succeeded", "paid", "completed"].some((value) =>
        String(payment.status ?? payment.payment_status ?? "").toLowerCase() === value
          || String(payment.payment_status ?? "").toLowerCase() === value
      ) ? "pass" as const : "fail" as const,
      reason: payment ? undefined : "payments row missing"
    },
    {
      stage: "routing_row_exists",
      status: routing ? "pass" as const : "fail" as const,
      reason: routing ? undefined : "payment_routing_records row missing"
    },
    {
      stage: "routing_eligible",
      status: isPayoutReadinessEligible(routing?.payout_readiness_status) ? "pass" as const : "fail" as const,
      reason: isPayoutReadinessEligible(routing?.payout_readiness_status) ? undefined : routing ? "routing not eligible" : "routing missing"
    },
    {
      stage: "payout_not_released",
      status: !routing?.released_at ? "pass" as const : "fail" as const,
      reason: routing?.released_at ? "released_at is populated" : undefined
    }
  ];
}

async function persistDebugSession(supabase: SupabaseClient, actor: ArchitectActor, packet: ArchitectDebugPacket) {
  const result = await supabase
    .from("architect_debug_sessions")
    .insert({
      actor_profile_id: actor.id,
      actor_email: actor.email,
      debug_type: packet.debugType,
      target_type: packet.targetType,
      target_id: packet.targetId,
      health: packet.summary.health,
      diagnosis_code: packet.summary.diagnosisCode,
      headline: packet.summary.headline,
      recommended_action: packet.summary.recommendedAction,
      repair_available: packet.summary.canRepair,
      packet,
      codex_prompt: packet.codexPrompt,
      status: packet.summary.canRepair ? "safe_repair_available" : packet.summary.codexRequired ? "codex_required" : "diagnosed"
    })
    .select("id")
    .single();

  if (result.error) {
    console.warn("[architect-debug] unable to persist debug session", {
      targetType: packet.targetType,
      targetId: packet.targetId,
      errorMessage: result.error.message
    });
    return null;
  }

  return String((result.data as JsonRecord).id);
}

export async function buildAppointmentDebugPacket(
  supabase: SupabaseClient,
  appointmentId: string,
  actor: ArchitectActor,
  options: { persistSession?: boolean; debugType?: string } = {}
): Promise<ArchitectDebugPacket> {
  const checkedAt = new Date().toISOString();
  const appointment = await maybeSingleBy<JsonRecord>(supabase, "appointments", APPOINTMENT_SELECT, "id", appointmentId);
  const payments = appointment
    ? await selectRows<JsonRecord>(supabase, "payments", PAYMENT_SELECT, "appointment_id", appointment.id, { orderColumn: "created_at" })
    : [];
  const payment = payments[0] ?? null;
  const routingRows = appointment
    ? await selectRows<JsonRecord>(supabase, "payment_routing_records", ROUTING_SELECT, "appointment_id", appointment.id, { orderColumn: "updated_at" })
    : [];
  const routing = routingRows[0] ?? null;
  const statusHistory = appointment
    ? await selectRows<JsonRecord>(supabase, "appointment_status_history", HISTORY_SELECT, "appointment_id", appointment.id, { orderColumn: "changed_at" })
    : [];
  const platformEvents = appointment
    ? await selectRows<JsonRecord>(supabase, "platform_events", PLATFORM_EVENT_SELECT, "entity_id", appointment.id, { orderColumn: "created_at", optional: true })
    : [];
  const client = appointment ? await maybeSingleBy<JsonRecord>(supabase, "clients", "*", "id", appointment.client_id) : null;
  const clientProfile = client ? await maybeSingleBy<JsonRecord>(supabase, "profiles", "*", "id", client.profile_id) : null;
  const barber = appointment ? await maybeSingleBy<JsonRecord>(supabase, "barbers", "*", "id", appointment.barber_id) : null;
  const barberProfile = barber ? await maybeSingleBy<JsonRecord>(supabase, "profiles", "*", "id", barber.profile_id) : null;
  const shop = appointment?.shop_id ? await maybeSingleBy<JsonRecord>(supabase, "shops", "*", "id", appointment.shop_id) : null;
  const service = appointment?.service_id ? await maybeSingleBy<JsonRecord>(supabase, "services", "*", "id", appointment.service_id) : null;
  const paymentMethod = payment?.payment_method_id
    ? await maybeSingleBy<JsonRecord>(supabase, "payment_methods", "*", "id", payment.payment_method_id)
    : null;

  const partialPacket = {
    entities: {
      appointment,
      client,
      clientProfile,
      barber,
      barberProfile,
      shop,
      service,
      payment,
      payments,
      paymentMethod,
      routing,
      routingRows,
      statusHistory,
      platformEvents
    }
  };
  const diagnosis = diagnoseAppointment(partialPacket);
  const schemaEvidence = await readCriticalSchemaEvidence(supabase);
  const databaseTruth = [
    evidence("appointment", appointment ? "pass" : "fail", appointment ? `Appointment status is ${appointment.status ?? "unknown"}.` : "No appointment row matched.", appointment),
    evidence("payment", payment ? "pass" : "fail", payment ? `Payment status is ${payment.status ?? payment.payment_status ?? "unknown"}.` : "No payment row matched.", payment),
    evidence("routing", routing ? "pass" : "fail", routing ? `Routing readiness is ${routing.payout_readiness_status ?? "unknown"}.` : "No routing row matched appointment_id.", routing),
    evidence("status history", statusHistory.length ? "pass" : "warning", `${statusHistory.length} history rows found.`, statusHistory)
  ];

  const packet: ArchitectDebugPacket = {
    ok: true,
    checkedAt,
    debugType: options.debugType ?? "appointment",
    targetType: "appointment",
    targetId: appointmentId,
    environment: readArchitectDebugEnvironment(),
    summary: {
      health: diagnosis.health,
      diagnosisCode: diagnosis.diagnosisCode,
      headline: diagnosis.headline,
      confidence: diagnosis.confidence,
      recommendedAction: diagnosis.recommendedAction,
      canRepair: diagnosis.canRepair,
      repairType: diagnosis.repairType,
      codexRequired: diagnosis.codexRequired
    },
    entities: partialPacket.entities,
    evidence: {
      databaseTruth,
      routeEvidence: [
        evidence("Vercel search terms", "info", "Use these terms if runtime logs are needed.", {
          terms: [`/api/barber/appointments/${appointmentId}`, "complete_failed", "payment_routing", "appointmentId"]
        })
      ],
      schemaEvidence,
      logEvidence: [],
      userSymptom: null
    },
    diagnosis: {
      likelyRootCause: diagnosis.likelyRootCause,
      affectedLayer: diagnosis.affectedLayer,
      failedInvariant: diagnosis.failedInvariant,
      supportingFacts: databaseTruth.map((item) => `${item.label}: ${item.detail}`),
      ruledOut: [
        payment ? "payment row exists" : "payment row not ruled out",
        routing ? "routing row exists" : "routing row not ruled out",
        appointment?.shop_id ? "shop context exists" : "freelance/null shop_id is allowed"
      ]
    },
    repairActions: diagnosis.repairType === "payment_routing" ? [{
      repairType: "payment_routing",
      targetType: "appointment",
      targetId: appointmentId,
      safetyClass: "safe",
      label: "Repair payment routing",
      description: "Create the missing payment_routing_records row and mark payout eligible without releasing payout.",
      endpoint: "/api/architect/repairs/payment-routing",
      method: "POST",
      canRun: true
    }] : [],
    codexPrompt: null,
    sqlSnippets: buildAppointmentSqlSnippets(appointmentId),
    validationChecklist: buildValidationChecklist(partialPacket),
    audit: {
      sessionId: null
    }
  };
  packet.codexPrompt = generateCodexPromptFromDebugPacket(packet);

  if (options.persistSession !== false) {
    packet.audit.sessionId = await persistDebugSession(supabase, actor, packet);
  }

  return packet;
}
