import { describe, expect, it } from "vitest";
import { buildFreelancePaymentRoutingRepairPayload, repairMissingPaymentRouting } from "@/lib/architect/repairs/payment-routing-repair";
import { APPOINTMENT_ID, ARCHITECT_USER, createArchitectDebugTables, createSupabaseStub } from "@/tests/unit/architect-debug-test-utils";

describe("architect routing repair", () => {
  it("repairs missing routing with production columns only", async () => {
    const tables = createArchitectDebugTables();
    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, APPOINTMENT_ID);

    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(true);
    expect(tables.payment_routing_records).toHaveLength(1);
    expect(tables.payment_routing_records[0]).toMatchObject({
      payment_id: "e681ffde-7a67-4277-96c0-a35519ba4acd",
      appointment_id: APPOINTMENT_ID,
      routing_model: "freelance",
      payout_recipient_type: "barber",
      provider_gross_amount: 5,
      provider_fee_amount: 0,
      provider_net_amount: 5,
      platform_fee_amount: 0.25,
      barber_payout_amount: 4.75,
      shop_split_amount: 0,
      payout_readiness_status: "ready",
      money_routing_status: "pending",
      released_at: null
    });
    expect(tables.payment_routing_records[0].metadata).toMatchObject({
      readinessMeaning: "eligible",
      payoutReadinessDbValue: "ready"
    });
    expect(Object.keys(tables.payment_routing_records[0])).not.toEqual(expect.arrayContaining([
      "relationship_type",
      "gross_amount_cents",
      "platform_fee_cents",
      "barber_amount_cents",
      "shop_amount_cents",
      "status",
      "hold_reason",
      "total_cents"
    ]));
    expect(tables.architect_repair_audit_logs).toHaveLength(1);
  });

  it("is idempotent when routing already exists", async () => {
    const tables = createArchitectDebugTables({
      payment_routing_records: [{
        id: "routing-existing",
        appointment_id: APPOINTMENT_ID,
        payment_id: "e681ffde-7a67-4277-96c0-a35519ba4acd",
        payout_readiness_status: "eligible"
      }]
    });

    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, APPOINTMENT_ID);

    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(false);
    expect(result.result).toBe("skipped");
    expect(tables.payment_routing_records).toHaveLength(1);
  });

  it("uses eligible only when production constraints allow eligible", async () => {
    const tables = createArchitectDebugTables({
      "information_schema.check_constraints": [{
        constraint_name: "payment_routing_records_payout_readiness_status_check",
        check_clause: "CHECK ((payout_readiness_status = ANY (ARRAY['pending'::text, 'eligible'::text, 'blocked'::text])))"
      }]
    });

    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, APPOINTMENT_ID);

    expect(result.ok).toBe(true);
    expect(tables.payment_routing_records[0].payout_readiness_status).toBe("eligible");
  });

  it("rejects non-completed appointments", async () => {
    const tables = createArchitectDebugTables({
      appointments: [{ ...createArchitectDebugTables().appointments[0], status: "confirmed", completed_at: null }]
    });

    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, APPOINTMENT_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/completed appointment/i);
    expect(tables.payment_routing_records).toHaveLength(0);
  });

  it("builds five percent freelance routing math", () => {
    const tables = createArchitectDebugTables();
    const payload = buildFreelancePaymentRoutingRepairPayload({
      appointment: tables.appointments[0],
      payment: tables.payments[0],
      nowIso: "2026-05-17T14:00:00.000Z"
    });

    expect(payload.provider_gross_amount).toBe(5);
    expect(payload.platform_fee_amount).toBe(0.25);
    expect(payload.barber_payout_amount).toBe(4.75);
    expect(payload.shop_split_amount).toBe(0);
    expect(payload.eligible_at).toBe("2026-05-17T14:00:00.000Z");
  });
});
