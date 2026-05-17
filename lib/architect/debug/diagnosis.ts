import type { ArchitectDebugPacket, ArchitectEvidenceItem, JsonRecord } from "@/lib/architect/debug/types";

const PAYMENT_SUCCESS_STATUSES = new Set(["captured", "succeeded", "paid", "completed"]);

export function isPaymentSuccessful(payment: JsonRecord | null | undefined) {
  if (!payment) return false;
  const status = String(payment.status ?? "").toLowerCase();
  const paymentStatus = String(payment.payment_status ?? "").toLowerCase();
  return PAYMENT_SUCCESS_STATUSES.has(status) || PAYMENT_SUCCESS_STATUSES.has(paymentStatus);
}

export function numberValue(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function diagnoseAppointment(packet: Pick<ArchitectDebugPacket, "entities">) {
  const appointment = packet.entities.appointment;
  const payment = packet.entities.payment;
  const routing = packet.entities.routing;
  const history = packet.entities.statusHistory;
  const appointmentStatus = String(appointment?.status ?? "").toLowerCase();
  const paymentCaptured = isPaymentSuccessful(payment);
  const hasCompletedHistory = history.some((row) =>
    String(row.new_status ?? row.status ?? "").toLowerCase() === "completed"
      || String(row.change_reason ?? "").toLowerCase() === "barber_completed_service"
  );

  if (!appointment) {
    return {
      health: "critical" as const,
      diagnosisCode: "appointment_missing",
      headline: "Appointment was not found.",
      confidence: "high" as const,
      recommendedAction: "Verify the appointment id or search by payment id.",
      canRepair: false,
      repairType: null,
      codexRequired: false,
      likelyRootCause: "No appointments row matched the supplied target.",
      affectedLayer: "database",
      failedInvariant: "appointments.id must exist before downstream booking evidence can be verified."
    };
  }

  if (!payment) {
    return {
      health: "broken" as const,
      diagnosisCode: "appointment_confirmed_payment_missing",
      headline: "Appointment exists but no payment row was found.",
      confidence: "high" as const,
      recommendedAction: "Inspect booking payment insert logs before repairing money state.",
      canRepair: false,
      repairType: null,
      codexRequired: true,
      likelyRootCause: "The booking loop did not persist the payment ledger row.",
      affectedLayer: "booking/payment",
      failedInvariant: "confirmed/completed appointments must have a payments row."
    };
  }

  if (appointmentStatus === "confirmed" && paymentCaptured) {
    return {
      health: "warning" as const,
      diagnosisCode: "appointment_confirmed_payment_captured",
      headline: "Appointment is confirmed and payment is captured; service is not completed yet.",
      confidence: "high" as const,
      recommendedAction: "No repair needed unless the barber already completed the service.",
      canRepair: false,
      repairType: null,
      codexRequired: false,
      likelyRootCause: "Normal pre-completion state.",
      affectedLayer: "appointment lifecycle",
      failedInvariant: "none"
    };
  }

  if (appointmentStatus === "completed" && !hasCompletedHistory) {
    return {
      health: "broken" as const,
      diagnosisCode: "appointment_completed_history_missing",
      headline: "Appointment is completed but the completed status-history row is missing.",
      confidence: "high" as const,
      recommendedAction: "Run the safe status-history repair.",
      canRepair: true,
      repairType: "status_history",
      codexRequired: false,
      likelyRootCause: "Lifecycle update succeeded without the audit row.",
      affectedLayer: "appointment lifecycle",
      failedInvariant: "completed appointments must have a completed appointment_status_history row."
    };
  }

  if (appointmentStatus === "completed" && paymentCaptured && !routing) {
    return {
      health: "broken" as const,
      diagnosisCode: "completed_but_routing_missing",
      headline: "Appointment is completed and payment is captured, but routing is missing.",
      confidence: "high" as const,
      recommendedAction: "Run safe repair: payment routing.",
      canRepair: true,
      repairType: "payment_routing",
      codexRequired: false,
      likelyRootCause: "The payout-routing ledger was not created or repaired after completion.",
      affectedLayer: "payment routing",
      failedInvariant: "completed paid appointments must have payment_routing_records keyed by appointment_id."
    };
  }

  if (appointmentStatus === "completed" && routing && String(routing.payout_readiness_status ?? "").toLowerCase() !== "eligible") {
    return {
      health: "broken" as const,
      diagnosisCode: "routing_exists_but_not_eligible",
      headline: "Routing exists, but payout is not eligible after completion.",
      confidence: "high" as const,
      recommendedAction: "Inspect routing block reason and payment/dispute state.",
      canRepair: false,
      repairType: null,
      codexRequired: true,
      likelyRootCause: "Routing status did not transition to eligible.",
      affectedLayer: "payment routing",
      failedInvariant: "completed paid undisputed appointments should mark routing eligible."
    };
  }

  if (
    appointmentStatus === "completed"
    && routing
    && String(routing.payout_readiness_status ?? "").toLowerCase() === "eligible"
    && !routing.released_at
  ) {
    return {
      health: "healthy" as const,
      diagnosisCode: "payout_eligible_not_released",
      headline: "Payout is eligible and correctly not released yet.",
      confidence: "high" as const,
      recommendedAction: "payout_release_when_ready",
      canRepair: false,
      repairType: null,
      codexRequired: false,
      likelyRootCause: "Resolved state.",
      affectedLayer: "payment routing",
      failedInvariant: "none"
    };
  }

  return {
    health: "warning" as const,
    diagnosisCode: "needs_manual_review",
    headline: "Evidence was collected, but no locked diagnosis matched.",
    confidence: "medium" as const,
    recommendedAction: "Review database truth and route evidence.",
    canRepair: false,
    repairType: null,
    codexRequired: true,
    likelyRootCause: "The issue does not match the current safe-repair rules.",
    affectedLayer: "unknown",
    failedInvariant: "manual review required"
  };
}

export function evidence(label: string, status: ArchitectEvidenceItem["status"], detail: string, data?: JsonRecord | JsonRecord[] | null): ArchitectEvidenceItem {
  return { label, status, detail, data };
}
