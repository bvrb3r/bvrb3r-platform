import { describe, expect, it } from "vitest";
import { buildAppointmentDebugPacket } from "@/lib/architect/debug/appointment-debug";
import { APPOINTMENT_ID, ARCHITECT_USER, createArchitectDebugTables, createSupabaseStub } from "@/tests/unit/architect-debug-test-utils";

describe("architect appointment debug", () => {
  it("diagnoses a completed captured appointment with missing routing as repairable", async () => {
    const tables = createArchitectDebugTables();
    const packet = await buildAppointmentDebugPacket(createSupabaseStub(tables) as never, APPOINTMENT_ID, ARCHITECT_USER);

    expect(packet.summary).toMatchObject({
      health: "broken",
      diagnosisCode: "completed_but_routing_missing",
      canRepair: true,
      repairType: "payment_routing",
      codexRequired: false
    });
    expect(packet.repairActions[0]).toMatchObject({
      repairType: "payment_routing",
      safetyClass: "safe",
      endpoint: "/api/architect/repairs/payment-routing"
    });
    expect(packet.sqlSnippets.map((snippet) => snippet.sql).join("\n")).toContain("payment_routing_records");
    expect(tables.architect_debug_sessions).toHaveLength(1);
  });

  it("recognizes eligible routing as healthy and not released", async () => {
    const tables = createArchitectDebugTables({
      payment_routing_records: [{
        id: "routing-1",
        payment_id: "e681ffde-7a67-4277-96c0-a35519ba4acd",
        appointment_id: APPOINTMENT_ID,
        routing_model: "freelance",
        payout_readiness_status: "eligible",
        money_routing_status: "pending",
        barber_payout_amount: 4.75,
        platform_fee_amount: 0.25,
        shop_split_amount: 0,
        released_at: null,
        updated_at: "2026-05-17T13:52:00.000Z"
      }]
    });

    const packet = await buildAppointmentDebugPacket(createSupabaseStub(tables) as never, APPOINTMENT_ID, ARCHITECT_USER);

    expect(packet.summary.diagnosisCode).toBe("payout_eligible_not_released");
    expect(packet.summary.health).toBe("healthy");
    expect(packet.summary.canRepair).toBe(false);
  });
});
