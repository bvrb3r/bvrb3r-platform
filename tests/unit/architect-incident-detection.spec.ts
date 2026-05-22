import { describe, expect, it } from "vitest";
import { detectArchitectMissionIncidents } from "@/lib/architect/mission-control/incident-detection";
import { APPOINTMENT_ID, createArchitectDebugTables, createSupabaseStub } from "@/tests/unit/architect-debug-test-utils";

describe("architect mission incident detection", () => {
  it("detects completed captured appointments with missing routing", async () => {
    const tables = createArchitectDebugTables();
    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);

    const routingIncident = incidents.find((incident) => incident.diagnosisCode === "completed_but_routing_missing");

    expect(routingIncident).toMatchObject({
      targetId: APPOINTMENT_ID,
      severity: "critical",
      canRepair: true,
      repairType: "payment_routing"
    });
    expect(routingIncident?.evidence.join("\n")).toContain("payment_routing_records lookup by appointment_id returned 0 rows");
  });

  it("turns routing repair check-constraint failures into schema incidents", async () => {
    const tables = createArchitectDebugTables({
      architect_repair_audit_logs: [{
        id: "audit-constraint",
        target_id: APPOINTMENT_ID,
        target_type: "appointment",
        repair_type: "payment_routing",
        result: "failed",
        error_message_safe: "new row violates check constraint payment_routing_records_payout_readiness_status_check",
        postgres_details: "Failing row contains payout_readiness_status=eligible.",
        created_at: "2026-05-17T14:00:00.000Z"
      }]
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);
    const schemaIncident = incidents.find((incident) => incident.diagnosisCode === "schema_constraint_mismatch");

    expect(schemaIncident).toMatchObject({
      targetId: APPOINTMENT_ID,
      severity: "critical",
      codexRequired: true,
      canRepair: false
    });
  });

  it("classifies captured appointment-scoped payments without appointment ids as unsafe orphans", async () => {
    const tables = createArchitectDebugTables({
      payments: [{
        id: "payment-orphaned-booking",
        appointment_id: null,
        client_id: "6607bce8-3636-46e8-9bbd-eabd9e5ad065",
        barber_id: "455c2930-7255-418b-bd2b-cc64bc0fc9b7",
        amount: 5,
        provider: "stripe",
        status: "captured",
        payment_status: "captured",
        payment_type: "booking",
        provider_payment_intent_id: "pi_orphaned",
        currency: "usd",
        paid_at: "2026-05-17T13:40:00.000Z",
        created_at: "2026-05-17T13:40:00.000Z"
      }]
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);
    const orphanIncident = incidents.find((incident) => incident.diagnosisCode === "orphaned_captured_payment");

    expect(orphanIncident).toMatchObject({
      targetId: "payment-orphaned-booking",
      severity: "critical",
      canRepair: false,
      repairType: null,
      codexRequired: true
    });
    expect(orphanIncident?.evidence.join("\n")).toContain("payment.appointment_id is empty");
  });
});
