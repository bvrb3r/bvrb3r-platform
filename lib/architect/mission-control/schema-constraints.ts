import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { JsonRecord } from "@/lib/architect/debug/types";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type PaymentRoutingConstraintEvidence = {
  source: "database" | "fallback";
  table: "payment_routing_records";
  constraints: Array<{
    constraintName: string;
    checkClause: string;
  }>;
  allowedValues: {
    payout_readiness_status: string[];
    money_routing_status: string[];
    routing_model: string[];
    payout_recipient_type: string[];
    reconciliation_status: string[];
  };
  warnings: string[];
};

const FALLBACK_ALLOWED_VALUES: PaymentRoutingConstraintEvidence["allowedValues"] = {
  payout_readiness_status: ["not_ready", "needs_attention", "ready", "blocked"],
  money_routing_status: ["pending", "ready_for_payout", "blocked", "manual_review", "paid_out", "refunded"],
  routing_model: ["freelance", "commission", "booth_rent"],
  payout_recipient_type: ["barber", "shop", "split"],
  reconciliation_status: ["open", "settled", "partially_reversed", "reversed", "manual_review"]
};

export const DEFAULT_PAYMENT_ROUTING_CONSTRAINTS: PaymentRoutingConstraintEvidence = {
  source: "fallback",
  table: "payment_routing_records",
  constraints: [],
  allowedValues: FALLBACK_ALLOWED_VALUES,
  warnings: ["Using built-in production schema memory because check constraints were not readable."]
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseQuotedValues(checkClause: string) {
  const values = [...checkClause.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return unique(values);
}

function valuesForColumn(rows: JsonRecord[], column: keyof PaymentRoutingConstraintEvidence["allowedValues"]) {
  const matches = rows.filter((row) => {
    const name = String(row.constraint_name ?? row.constraintName ?? "").toLowerCase();
    const clause = String(row.check_clause ?? row.checkClause ?? "").toLowerCase();
    return name.includes(column) || clause.includes(column);
  });

  return unique(matches.flatMap((row) => parseQuotedValues(String(row.check_clause ?? row.checkClause ?? ""))));
}

function productionLegalValues(
  column: keyof PaymentRoutingConstraintEvidence["allowedValues"],
  values: string[]
) {
  const legal = new Set(FALLBACK_ALLOWED_VALUES[column]);
  return unique(values.map((value) => value.toLowerCase()).filter((value) => legal.has(value)));
}

export async function loadPaymentRoutingConstraintEvidence(
  supabase: SupabaseClient
): Promise<PaymentRoutingConstraintEvidence> {
  const result = await supabase
    .from("information_schema.check_constraints")
    .select("constraint_name,check_clause")
    .limit(200);

  if (result.error) {
    return {
      ...DEFAULT_PAYMENT_ROUTING_CONSTRAINTS,
      warnings: [
        ...DEFAULT_PAYMENT_ROUTING_CONSTRAINTS.warnings,
        `Constraint lookup failed: ${result.error.message ?? "unknown error"}`
      ]
    };
  }

  const rows = ((result.data ?? []) as JsonRecord[]).filter((row) => {
    const name = String(row.constraint_name ?? "").toLowerCase();
    const clause = String(row.check_clause ?? "").toLowerCase();
    return name.includes("payment_routing_records") || clause.includes("payout_readiness_status") || clause.includes("money_routing_status");
  });

  const allowedValues = {
    payout_readiness_status: valuesForColumn(rows, "payout_readiness_status"),
    money_routing_status: valuesForColumn(rows, "money_routing_status"),
    routing_model: valuesForColumn(rows, "routing_model"),
    payout_recipient_type: valuesForColumn(rows, "payout_recipient_type"),
    reconciliation_status: valuesForColumn(rows, "reconciliation_status")
  };

  const productionAllowedValues = {
    payout_readiness_status: productionLegalValues("payout_readiness_status", allowedValues.payout_readiness_status),
    money_routing_status: productionLegalValues("money_routing_status", allowedValues.money_routing_status),
    routing_model: productionLegalValues("routing_model", allowedValues.routing_model),
    payout_recipient_type: productionLegalValues("payout_recipient_type", allowedValues.payout_recipient_type),
    reconciliation_status: productionLegalValues("reconciliation_status", allowedValues.reconciliation_status)
  };

  const unsupportedValues = Object.entries(allowedValues)
    .flatMap(([column, values]) => {
      const legal = new Set(FALLBACK_ALLOWED_VALUES[column as keyof PaymentRoutingConstraintEvidence["allowedValues"]]);
      return values
        .map((value) => value.toLowerCase())
        .filter((value) => !legal.has(value))
        .map((value) => `${column}=${value}`);
    });

  const mergedAllowedValues = {
    payout_readiness_status: productionAllowedValues.payout_readiness_status.length
      ? productionAllowedValues.payout_readiness_status
      : FALLBACK_ALLOWED_VALUES.payout_readiness_status,
    money_routing_status: productionAllowedValues.money_routing_status.length
      ? productionAllowedValues.money_routing_status
      : FALLBACK_ALLOWED_VALUES.money_routing_status,
    routing_model: productionAllowedValues.routing_model.length
      ? productionAllowedValues.routing_model
      : FALLBACK_ALLOWED_VALUES.routing_model,
    payout_recipient_type: productionAllowedValues.payout_recipient_type.length
      ? productionAllowedValues.payout_recipient_type
      : FALLBACK_ALLOWED_VALUES.payout_recipient_type,
    reconciliation_status: productionAllowedValues.reconciliation_status.length
      ? productionAllowedValues.reconciliation_status
      : FALLBACK_ALLOWED_VALUES.reconciliation_status
  };

  return {
    source: rows.length ? "database" : "fallback",
    table: "payment_routing_records",
    constraints: rows.map((row) => ({
      constraintName: String(row.constraint_name ?? ""),
      checkClause: String(row.check_clause ?? "")
    })),
    allowedValues: mergedAllowedValues,
    warnings: [
      ...(rows.length ? [] : DEFAULT_PAYMENT_ROUTING_CONSTRAINTS.warnings),
      ...(unsupportedValues.length
        ? [`Ignoring unsupported payment_routing_records constraint values for repair writes: ${unsupportedValues.join(", ")}.`]
        : [])
    ]
  };
}

export function readinessDbValueForBusinessMeaning(
  evidence: PaymentRoutingConstraintEvidence,
  meaning: "eligible" | "pending" | "blocked" | "needs_attention"
) {
  const allowed = evidence.allowedValues.payout_readiness_status.map((value) => value.toLowerCase());

  if (meaning === "eligible") {
    if (allowed.includes("ready")) return "ready";
    return evidence.allowedValues.payout_readiness_status[0] ?? "ready";
  }

  if (meaning === "needs_attention") {
    if (allowed.includes("needs_attention")) return "needs_attention";
    if (allowed.includes("not_ready")) return "not_ready";
    return evidence.allowedValues.payout_readiness_status[0] ?? "needs_attention";
  }

  if (meaning === "blocked") {
    if (allowed.includes("blocked")) return "blocked";
    if (allowed.includes("needs_attention")) return "needs_attention";
    return evidence.allowedValues.payout_readiness_status[0] ?? "blocked";
  }

  if (allowed.includes("not_ready")) return "not_ready";
  if (allowed.includes("pending")) return "pending";
  return evidence.allowedValues.payout_readiness_status[0] ?? "not_ready";
}

export function moneyRoutingDbValueForPending(evidence: PaymentRoutingConstraintEvidence) {
  const allowed = evidence.allowedValues.money_routing_status.map((value) => value.toLowerCase());
  if (allowed.includes("pending")) return "pending";
  if (allowed.includes("ready_for_payout")) return "ready_for_payout";
  return evidence.allowedValues.money_routing_status[0] ?? "pending";
}

export function moneyRoutingDbValueForManualReview(evidence: PaymentRoutingConstraintEvidence) {
  const allowed = evidence.allowedValues.money_routing_status.map((value) => value.toLowerCase());
  if (allowed.includes("manual_review")) return "manual_review";
  if (allowed.includes("blocked")) return "blocked";
  if (allowed.includes("pending")) return "pending";
  return evidence.allowedValues.money_routing_status[0] ?? "manual_review";
}

export function reconciliationDbValueForOpen(evidence: PaymentRoutingConstraintEvidence) {
  const allowed = evidence.allowedValues.reconciliation_status.map((value) => value.toLowerCase());
  if (allowed.includes("open")) return "open";
  return evidence.allowedValues.reconciliation_status[0] ?? "open";
}

export function reconciliationDbValueForManualReview(evidence: PaymentRoutingConstraintEvidence) {
  const allowed = evidence.allowedValues.reconciliation_status.map((value) => value.toLowerCase());
  if (allowed.includes("manual_review")) return "manual_review";
  if (allowed.includes("open")) return "open";
  return evidence.allowedValues.reconciliation_status[0] ?? "manual_review";
}

export function payoutReadinessMeaning(value: unknown) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "eligible" || normalized === "ready") return "eligible";
  if (normalized === "blocked" || normalized === "needs_attention") return "blocked";
  if (normalized === "not_ready" || normalized === "pending") return "pending";
  return normalized || "unknown";
}

export function isPayoutReadinessEligible(value: unknown) {
  return payoutReadinessMeaning(value) === "eligible";
}

export function paymentRoutingConstraintEvidenceToJson(evidence: PaymentRoutingConstraintEvidence): JsonRecord {
  return {
    source: evidence.source,
    table: evidence.table,
    allowedValues: evidence.allowedValues,
    constraints: evidence.constraints,
    warnings: evidence.warnings
  };
}
