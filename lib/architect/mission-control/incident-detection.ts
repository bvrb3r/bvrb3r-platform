import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPaymentSuccessful, numberValue, roundMoney } from "@/lib/architect/debug/diagnosis";
import { readArchitectDebugEnvironment } from "@/lib/architect/debug/env";
import type { ArchitectActor, JsonRecord } from "@/lib/architect/debug/types";
import { buildAppointmentSqlSnippets } from "@/lib/architect/debug/sql-snippets";
import {
  isPayoutReadinessEligible,
  loadPaymentRoutingConstraintEvidence,
  paymentRoutingConstraintEvidenceToJson
} from "@/lib/architect/mission-control/schema-constraints";
import type { ArchitectIncident, MissionControlHealthItem, MissionControlSnapshot, MissionPacketSet } from "@/lib/architect/mission-control/types";
import { buildChatGptPacket, buildCodexPacket, buildIncidentPacket } from "@/lib/architect/mission-control/packets";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const MISSION_SYSTEMS: Array<{ key: MissionControlHealthItem["key"]; label: string; healthySummary: string }> = [
  { key: "bookings", label: "Bookings", healthySummary: "Latest booking loop evidence is clean." },
  { key: "payments", label: "Payments", healthySummary: "Captured payment records are linked." },
  { key: "routing", label: "Routing", healthySummary: "Completed paid appointments have routing." },
  { key: "discovery", label: "Discovery", healthySummary: "Approved bookable barbers have supply signals." },
  { key: "barber_calendar", label: "Barber Calendar", healthySummary: "Calendar visibility has no detected blockers." },
  { key: "client_activity", label: "Client Activity", healthySummary: "Client activity has no detected blockers." },
  { key: "verifications", label: "Verifications", healthySummary: "Verification queues have no detected blockers." },
  { key: "deployments", label: "Deployments", healthySummary: "Deployment metadata is available." },
  { key: "schema_health", label: "Schema Health", healthySummary: "Critical schema checks are readable." },
  { key: "payout_eligibility", label: "Payout Eligibility", healthySummary: "Eligible payout state is internally consistent." }
];

async function selectRows<T extends JsonRecord>(
  supabase: SupabaseClient,
  table: string,
  options: { column?: string; value?: unknown; orderColumn?: string; limit?: number; optional?: boolean } = {}
) {
  let query = supabase.from(table).select("*");
  if (options.column) query = query.eq(options.column, options.value);
  if (options.orderColumn) query = query.order(options.orderColumn, { ascending: false });
  if (options.limit) query = query.limit(options.limit);

  const result = await query;
  if (result.error) {
    if (options.optional) return [];
    throw result.error;
  }

  return ((result.data ?? []) as unknown as T[]) ?? [];
}

function latest<T extends JsonRecord>(rows: T[]) {
  return rows[0] ?? null;
}

function hasCompletedHistory(history: JsonRecord[]) {
  return history.some((row) =>
    String(row.new_status ?? row.status ?? "").toLowerCase() === "completed"
      || String(row.change_reason ?? "").toLowerCase() === "barber_completed_service"
  );
}

function hasRoutingConstraintFailure(audits: JsonRecord[], appointmentId: string) {
  return audits.some((audit) => {
    const targetMatches = String(audit.target_id ?? "") === appointmentId;
    const haystack = [
      audit.error_code,
      audit.error_message_safe,
      audit.postgres_code,
      audit.postgres_details,
      JSON.stringify(audit.payload ?? {})
    ].join(" ").toLowerCase();
    return targetMatches && haystack.includes("payout_readiness_status") && haystack.includes("check");
  });
}

function buildIncident(input: Omit<ArchitectIncident, "id" | "createdAt" | "sqlSnippets"> & { createdAt?: string; sqlSnippets?: ArchitectIncident["sqlSnippets"] }) {
  const id = `${input.diagnosisCode}:${input.targetType}:${input.targetId}`;
  return {
    ...input,
    id,
    createdAt: input.createdAt ?? new Date().toISOString(),
    sqlSnippets: input.sqlSnippets ?? (input.targetType === "appointment" ? buildAppointmentSqlSnippets(input.targetId) : [])
  };
}

function appointmentLabel(appointment: JsonRecord) {
  return `appointment ${String(appointment.id ?? "unknown")}`;
}

const APPOINTMENT_SCOPED_PAYMENT_TYPES = new Set(["booking", "tip", "add_on"]);

function isAppointmentScopedPayment(payment: JsonRecord) {
  const paymentType = String(payment.payment_type ?? payment.type ?? "").toLowerCase();
  return APPOINTMENT_SCOPED_PAYMENT_TYPES.has(paymentType);
}

export async function detectArchitectMissionIncidents(supabase: SupabaseClient) {
  const [appointments, payments, posSales, barbers, services, availabilityRules, audits] = await Promise.all([
    selectRows<JsonRecord>(supabase, "appointments", { orderColumn: "updated_at", limit: 80, optional: true }),
    selectRows<JsonRecord>(supabase, "payments", { orderColumn: "created_at", limit: 80, optional: true }),
    selectRows<JsonRecord>(supabase, "pos_sales", { orderColumn: "updated_at", limit: 80, optional: true }),
    selectRows<JsonRecord>(supabase, "barbers", { orderColumn: "updated_at", limit: 80, optional: true }),
    selectRows<JsonRecord>(supabase, "services", { orderColumn: "updated_at", limit: 200, optional: true }),
    selectRows<JsonRecord>(supabase, "availability_rules", { limit: 200, optional: true }),
    selectRows<JsonRecord>(supabase, "architect_repair_audit_logs", { orderColumn: "created_at", limit: 50, optional: true })
  ]);

  const incidents: ArchitectIncident[] = [];

  for (const appointment of appointments) {
    const appointmentId = String(appointment.id ?? "");
    const status = String(appointment.status ?? "").toLowerCase();
    const appointmentPayments = payments.filter((payment) => payment.appointment_id === appointment.id);
    const payment = latest(appointmentPayments);
    const routingRows = await selectRows<JsonRecord>(supabase, "payment_routing_records", {
      column: "appointment_id",
      value: appointment.id,
      orderColumn: "updated_at",
      optional: true
    });
    const history = await selectRows<JsonRecord>(supabase, "appointment_status_history", {
      column: "appointment_id",
      value: appointment.id,
      orderColumn: "changed_at",
      optional: true
    });
    const routing = latest(routingRows);
    const capturedPayment = isPaymentSuccessful(payment);
    const recentConstraintFailure = hasRoutingConstraintFailure(audits, appointmentId);

    if (status === "completed" && appointment.completed_at && capturedPayment && !routing) {
      incidents.push(buildIncident({
        diagnosisCode: "completed_but_routing_missing",
        affectedEntity: appointmentLabel(appointment),
        affectedRole: "barber",
        affectedTable: "payment_routing_records",
        affectedRoute: "/api/architect/repairs/payment-routing",
        severity: "critical",
        confidence: "high",
        recommendedAction: recentConstraintFailure ? "Run constraint-aware safe repair, or generate Codex patch if repair still fails." : "Run Safe Repair: payment routing.",
        canRepair: true,
        repairType: "payment_routing",
        codexRequired: recentConstraintFailure,
        targetType: "appointment",
        targetId: appointmentId,
        headline: "Completed paid appointment is missing payment routing.",
        evidence: [
          "appointments.status = completed",
          "appointments.completed_at is populated",
          `payment.status = ${String(payment?.status ?? payment?.payment_status ?? "unknown")}`,
          "payment_routing_records lookup by appointment_id returned 0 rows",
          recentConstraintFailure ? "A previous repair failed on payout_readiness_status check constraint." : "No recent routing repair constraint failure was found."
        ],
        analysis: {
          likelyRootCause: recentConstraintFailure
            ? "The repair path attempted a payout_readiness_status value rejected by production constraints."
            : "The payout-routing ledger was never created or repaired after service completion.",
          confidence: recentConstraintFailure ? 94 : 90,
          affectedLayer: "payment routing",
          failedInvariant: "completed + paid appointment must have a payment_routing_records row.",
          supportingEvidence: [
            `appointmentId=${appointmentId}`,
            `paymentId=${String(payment?.id ?? "missing")}`,
            `amount=${String(payment?.amount ?? "unknown")}`,
            "routingFound=false"
          ],
          ruledOut: [
            "appointment completion persisted",
            "status history can be evaluated separately",
            "payment capture exists"
          ],
          safeRepairAvailable: true,
          codexRequired: recentConstraintFailure,
          nextBestAction: recentConstraintFailure
            ? "Run the constraint-aware safe repair from Mission Control. Generate a Codex packet if production still rejects the insert."
            : "Run payment routing repair."
        }
      }));
    }

    if (status === "completed" && !hasCompletedHistory(history)) {
      incidents.push(buildIncident({
        diagnosisCode: "appointment_completed_history_missing",
        affectedEntity: appointmentLabel(appointment),
        affectedRole: "barber",
        affectedTable: "appointment_status_history",
        affectedRoute: "/api/barber/appointments/[id]/complete",
        severity: "broken",
        confidence: "high",
        recommendedAction: "Run status-history repair.",
        canRepair: false,
        repairType: "status_history",
        codexRequired: false,
        targetType: "appointment",
        targetId: appointmentId,
        headline: "Appointment is completed but completed history is missing.",
        evidence: ["appointments.status = completed", "No completed appointment_status_history row found."],
        analysis: {
          likelyRootCause: "Lifecycle update persisted without audit history.",
          confidence: 91,
          affectedLayer: "appointment lifecycle",
          failedInvariant: "Completed appointments must have a completed status-history row.",
          supportingEvidence: [`appointmentId=${appointmentId}`],
          ruledOut: ["appointment row exists"],
          safeRepairAvailable: false,
          codexRequired: false,
          nextBestAction: "Open Deep Debug and repair status history when the safe route is enabled."
        }
      }));
    }

    if (routing && status === "completed" && !isPayoutReadinessEligible(routing.payout_readiness_status)) {
      incidents.push(buildIncident({
        diagnosisCode: "routing_exists_but_not_eligible",
        affectedEntity: appointmentLabel(appointment),
        affectedRole: "barber",
        affectedTable: "payment_routing_records",
        affectedRoute: null,
        severity: "broken",
        confidence: "high",
        recommendedAction: "Inspect routing block reason and payment/dispute state.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "appointment",
        targetId: appointmentId,
        headline: "Completed appointment has routing that is not payout eligible.",
        evidence: [`payout_readiness_status=${String(routing.payout_readiness_status ?? "unknown")}`],
        analysis: {
          likelyRootCause: "Routing status did not transition to a business-eligible value.",
          confidence: 88,
          affectedLayer: "payout eligibility",
          failedInvariant: "Completed paid undisputed appointments should make payout routing eligible.",
          supportingEvidence: [`appointmentId=${appointmentId}`, `routingId=${String(routing.id ?? "unknown")}`],
          ruledOut: ["routing row exists"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Generate Codex Patch."
        }
      }));
    }
  }

  for (const payment of payments) {
    if (!isPaymentSuccessful(payment)) continue;
    if (isAppointmentScopedPayment(payment) && !payment.appointment_id) {
      incidents.push(buildIncident({
        diagnosisCode: "orphaned_captured_payment",
        affectedEntity: `payment ${String(payment.id ?? "unknown")}`,
        affectedRole: "barber",
        affectedTable: "payments",
        affectedRoute: "/api/payments/[paymentId]/capture",
        severity: "critical",
        confidence: "high",
        recommendedAction: "Place payment under manual review; do not repair into appointment routing without a valid appointment or POS sale.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "payment",
        targetId: String(payment.id ?? ""),
        headline: "Captured appointment-scoped payment has no business object.",
        evidence: [
          `payment.status=${String(payment.status ?? payment.payment_status ?? "unknown")}`,
          `payment.payment_type=${String(payment.payment_type ?? payment.type ?? "unknown")}`,
          "payment.appointment_id is empty",
          "No POS/walk-in sale record is linked for Role 1."
        ],
        analysis: {
          likelyRootCause: "A payment capture path allowed appointment-scoped money without an appointment relation.",
          confidence: 92,
          affectedLayer: "payment capture",
          failedInvariant: "No captured money without appointment, walk-in/POS sale, subscription, booth rent, product order, refund, or dispute object.",
          supportingEvidence: [`paymentId=${String(payment.id ?? "unknown")}`],
          ruledOut: ["safe routing repair is not allowed for orphan payments"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Generate Codex Patch or manually classify and hold the payment."
        }
      }));
      continue;
    }
    const paymentType = String(payment.payment_type ?? payment.type ?? "").toLowerCase();
    if (paymentType === "pos_sale" && !payment.pos_sale_id) {
      incidents.push(buildIncident({
        diagnosisCode: "orphaned_captured_payment",
        affectedEntity: `payment ${String(payment.id ?? "unknown")}`,
        affectedRole: "barber",
        affectedTable: "payments",
        affectedRoute: "/api/barber/pos-sales/[id]/charge",
        severity: "critical",
        confidence: "high",
        recommendedAction: "Place payment under manual review; do not repair into appointment routing without a valid POS sale.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "payment",
        targetId: String(payment.id ?? ""),
        headline: "Captured POS sale payment has no POS sale business object.",
        evidence: [
          `payment.status=${String(payment.status ?? payment.payment_status ?? "unknown")}`,
          "payment.payment_type=pos_sale",
          "payment.pos_sale_id is empty"
        ],
        analysis: {
          likelyRootCause: "A POS payment capture path allowed money without a POS sale relation.",
          confidence: 92,
          affectedLayer: "POS payment capture",
          failedInvariant: "No captured money without appointment, POS sale, subscription, booth rent, product order, refund, or dispute object.",
          supportingEvidence: [`paymentId=${String(payment.id ?? "unknown")}`],
          ruledOut: ["safe appointment routing repair is not allowed for POS orphans"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Generate Codex Patch or manually classify and hold the payment."
        }
      }));
      continue;
    }
    if (paymentType === "pos_sale" && payment.pos_sale_id) {
      continue;
    }
    const appointment = appointments.find((row) => row.id === payment.appointment_id);
    const appointmentStatus = String(appointment?.status ?? "").toLowerCase();
    if (!appointment || !["confirmed", "completed", "checked_in", "in_service"].includes(appointmentStatus)) {
      incidents.push(buildIncident({
        diagnosisCode: "payment_captured_but_appointment_missing",
        affectedEntity: `payment ${String(payment.id ?? "unknown")}`,
        affectedRole: "client",
        affectedTable: "payments",
        affectedRoute: "/api/bookings",
        severity: "critical",
        confidence: "high",
        recommendedAction: "Generate Codex Patch and inspect booking transaction rollback.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "payment",
        targetId: String(payment.id ?? ""),
        headline: "Captured payment is not attached to a valid appointment state.",
        evidence: [
          `payment.status=${String(payment.status ?? payment.payment_status ?? "unknown")}`,
          appointment ? `appointment.status=${appointmentStatus}` : "appointment row missing"
        ],
        analysis: {
          likelyRootCause: "Payment capture succeeded without durable appointment state.",
          confidence: 90,
          affectedLayer: "booking transaction",
          failedInvariant: "Captured booking payments must have a confirmed or completed appointment.",
          supportingEvidence: [`paymentId=${String(payment.id ?? "unknown")}`],
          ruledOut: ["payment capture exists"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Generate Codex Patch."
        }
      }));
    }
  }

  for (const posSale of posSales) {
    const status = String(posSale.status ?? "").toLowerCase();
    if (status !== "paid") continue;
    const paymentMethod = String(posSale.payment_method ?? "").toLowerCase();
    if (paymentMethod === "cash") continue;

    const saleId = String(posSale.id ?? "");
    const payment = latest(payments.filter((row) => row.pos_sale_id === posSale.id || row.id === posSale.payment_id));
    if (!isPaymentSuccessful(payment)) continue;

    const routingRows = await selectRows<JsonRecord>(supabase, "payment_routing_records", {
      column: "pos_sale_id",
      value: posSale.id,
      orderColumn: "updated_at",
      optional: true
    });

    if (!latest(routingRows)) {
      const grossAmount = Number(posSale.total_cents ?? 0) / 100;
      incidents.push(buildIncident({
        diagnosisCode: "paid_pos_sale_missing_routing",
        affectedEntity: `POS sale ${saleId}`,
        affectedRole: "barber",
        affectedTable: "payment_routing_records",
        affectedRoute: "/api/barber/pos-sales/[id]/charge",
        severity: "critical",
        confidence: "high",
        recommendedAction: "Repair POS sale routing or rerun POS payment routing sync.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "pos_sale",
        targetId: saleId,
        headline: "Paid POS sale is missing payment routing.",
        evidence: [
          "pos_sales.status = paid",
          `payment.status = ${String(payment?.status ?? payment?.payment_status ?? "unknown")}`,
          "payment_routing_records lookup by pos_sale_id returned 0 rows",
          `gross amount = ${grossAmount.toFixed(2)}`,
          `expected platform fee = ${(grossAmount * 0.05).toFixed(2)}`,
          `expected barber payout = ${(grossAmount - grossAmount * 0.05).toFixed(2)}`
        ],
        analysis: {
          likelyRootCause: "The POS payment ledger succeeded without a corresponding routing ledger row.",
          confidence: 90,
          affectedLayer: "POS payment routing",
          failedInvariant: "paid POS sale + captured payment must have payment_routing_records.pos_sale_id.",
          supportingEvidence: [
            `posSaleId=${saleId}`,
            `paymentId=${String(payment?.id ?? "missing")}`,
            `barberId=${String(posSale.barber_id ?? payment?.barber_id ?? "unknown")}`
          ],
          ruledOut: ["draft/payment_pending POS sales are ignored"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Open Deep Debug and repair POS sale routing."
        }
      }));
    }
  }

  for (const audit of audits) {
    const haystack = [
      audit.error_code,
      audit.error_message_safe,
      audit.postgres_code,
      audit.postgres_details
    ].join(" ").toLowerCase();
    if (haystack.includes("payout_readiness_status") && haystack.includes("check")) {
      incidents.push(buildIncident({
        diagnosisCode: "schema_constraint_mismatch",
        affectedEntity: `appointment ${String(audit.target_id ?? "unknown")}`,
        affectedRole: "architect",
        affectedTable: "payment_routing_records",
        affectedRoute: "/api/architect/repairs/payment-routing",
        severity: "critical",
        confidence: "high",
        createdAt: String(audit.created_at ?? new Date().toISOString()),
        recommendedAction: "Generate Codex Patch or run the constraint-aware repair after deploy.",
        canRepair: false,
        repairType: null,
        codexRequired: true,
        targetType: "appointment",
        targetId: String(audit.target_id ?? ""),
        headline: "Payment routing repair hit a production check constraint.",
        evidence: [
          "payment_routing_records_payout_readiness_status_check rejected the attempted value.",
          String(audit.error_message_safe ?? audit.postgres_details ?? "No safe error detail was stored.")
        ],
        analysis: {
          likelyRootCause: "Code attempted a business-display value that is not legal in the production DB constraint.",
          confidence: 94,
          affectedLayer: "schema-aware repair",
          failedInvariant: "Safe repairs must map business meanings to production-legal enum/check values.",
          supportingEvidence: [String(audit.postgres_details ?? audit.error_message_safe ?? "")],
          ruledOut: ["appointment completion", "payment capture"],
          safeRepairAvailable: false,
          codexRequired: true,
          nextBestAction: "Generate Codex Patch."
        }
      }));
    }
  }

  for (const barber of barbers) {
    const barberId = String(barber.id ?? "");
    const isApproved = String(barber.app_approval_status ?? "approved").toLowerCase() === "approved";
    const active = String(barber.status ?? "active").toLowerCase() === "active";
    const bookable = barber.is_bookable !== false;
    const discoverable = barber.is_discoverable !== false;
    if (!isApproved || !active || !bookable || !discoverable) continue;

    const barberReference = String(barber.reference_code ?? barber.booking_slug ?? "");
    const hasService = services.some((service) =>
      (service.barber_reference === barberReference || service.barber_id === barber.id)
        && service.active !== false
        && service.is_bookable !== false
    );
    const hasAvailability = availabilityRules.some((rule) => rule.barber_id === barber.id || rule.barber_reference === barberReference);

    if (!hasService) {
      incidents.push(buildIncident({
        diagnosisCode: "barber_hidden_no_service",
        affectedEntity: `barber ${barberReference || barberId}`,
        affectedRole: "barber",
        affectedTable: "services",
        affectedRoute: "/api/marketplace/discover",
        severity: "warning",
        confidence: "medium",
        recommendedAction: "Add or repair an active bookable service.",
        canRepair: false,
        repairType: null,
        codexRequired: false,
        targetType: "barber",
        targetId: barberId,
        headline: "Approved bookable barber has no active service.",
        evidence: ["No active bookable services matched barber reference."],
        analysis: {
          likelyRootCause: "Supply readiness is missing a service row.",
          confidence: 76,
          affectedLayer: "discovery",
          failedInvariant: "Discoverable barbers need at least one active bookable service.",
          supportingEvidence: [`barberId=${barberId}`, `reference=${barberReference}`],
          ruledOut: ["barber approval flags"],
          safeRepairAvailable: false,
          codexRequired: false,
          nextBestAction: "Open Deep Debug."
        }
      }));
    }

    if (!hasAvailability) {
      incidents.push(buildIncident({
        diagnosisCode: "barber_hidden_no_availability",
        affectedEntity: `barber ${barberReference || barberId}`,
        affectedRole: "barber",
        affectedTable: "availability_rules",
        affectedRoute: "/api/marketplace/discover",
        severity: "warning",
        confidence: "medium",
        recommendedAction: "Backfill or repair availability rules.",
        canRepair: false,
        repairType: null,
        codexRequired: false,
        targetType: "barber",
        targetId: barberId,
        headline: "Approved bookable barber has no availability.",
        evidence: ["No availability_rules rows matched barber id."],
        analysis: {
          likelyRootCause: "Supply readiness is missing availability.",
          confidence: 78,
          affectedLayer: "discovery",
          failedInvariant: "Discoverable barbers need availability rules.",
          supportingEvidence: [`barberId=${barberId}`],
          ruledOut: ["barber approval flags"],
          safeRepairAvailable: false,
          codexRequired: false,
          nextBestAction: "Open Deep Debug."
        }
      }));
    }
  }

  return incidents;
}

function healthFromIncidents(incidents: ArchitectIncident[], checkedAt: string): MissionControlHealthItem[] {
  return MISSION_SYSTEMS.map((system) => {
    const related = incidents.filter((incident) => {
      if (system.key === "routing") return ["completed_but_routing_missing", "routing_exists_but_not_eligible", "schema_constraint_mismatch"].includes(incident.diagnosisCode);
      if (system.key === "payments") return incident.diagnosisCode.includes("payment");
      if (system.key === "discovery") return incident.diagnosisCode.startsWith("barber_hidden");
      if (system.key === "barber_calendar") return incident.diagnosisCode.includes("calendar");
      if (system.key === "client_activity") return incident.diagnosisCode.includes("client_activity");
      if (system.key === "schema_health") return incident.diagnosisCode === "schema_constraint_mismatch";
      if (system.key === "payout_eligibility") return incident.diagnosisCode.includes("routing") || incident.diagnosisCode.includes("payout");
      return false;
    });

    if (!related.length) {
      return {
        key: system.key,
        label: system.label,
        status: system.key === "deployments" ? "unknown" : "healthy",
        summary: system.healthySummary,
        lastCheckedAt: checkedAt
      };
    }

    const critical = related.some((incident) => incident.severity === "critical");
    const broken = related.some((incident) => incident.severity === "broken");
    return {
      key: system.key,
      label: system.label,
      status: critical ? "critical" : broken ? "broken" : "warning",
      summary: related.length === 1 ? related[0].headline : `${related.length} active incidents detected.`,
      lastCheckedAt: checkedAt
    };
  });
}

function packetSet(snapshotBase: { environment: MissionControlSnapshot["environment"]; checkedAt: string }, incident: ArchitectIncident): MissionPacketSet {
  return {
    chatGptPacket: buildChatGptPacket(snapshotBase, incident),
    codexPacket: buildCodexPacket(snapshotBase, incident),
    incidentPacket: buildIncidentPacket(snapshotBase, incident)
  };
}

export async function buildMissionControlSnapshot(
  supabase: SupabaseClient,
  actor: ArchitectActor
): Promise<MissionControlSnapshot> {
  void actor;
  const checkedAt = new Date().toISOString();
  const environment = {
    ...readArchitectDebugEnvironment(),
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? null,
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? process.env.BUILD_TIME ?? null
  };
  const [incidents, constraintEvidence] = await Promise.all([
    detectArchitectMissionIncidents(supabase),
    loadPaymentRoutingConstraintEvidence(supabase)
  ]);
  const health = healthFromIncidents(incidents, checkedAt);
  const packets = Object.fromEntries(incidents.map((incident) => [incident.id, packetSet({ checkedAt, environment }, incident)]));

  return {
    ok: true,
    checkedAt,
    environment,
    health,
    incidents,
    selectedIncidentId: incidents[0]?.id ?? null,
    packets,
    schemaEvidence: {
      paymentRouting: paymentRoutingConstraintEvidenceToJson(constraintEvidence)
    }
  };
}

export function expectedFreelanceRoutingFromPayment(payment: JsonRecord) {
  const gross = roundMoney(numberValue(payment.amount));
  const platformFee = roundMoney(gross * 0.05);
  return {
    gross,
    platformFee,
    barberPayout: roundMoney(Math.max(gross - platformFee, 0)),
    shopSplit: 0
  };
}
