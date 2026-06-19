import { describe, expect, it } from "vitest";
import { buildAppointmentDebugPacket } from "@/lib/architect/debug/appointment-debug";
import { buildFreelancePaymentRoutingRepairPayload, repairMissingPaymentRouting } from "@/lib/architect/repairs/payment-routing-repair";
import { APPOINTMENT_ID, ARCHITECT_USER, BARBER_ID, createArchitectDebugTables, createSupabaseStub } from "@/tests/unit/architect-debug-test-utils";

describe("architect routing repair", () => {
  it("repairs missing routing with production columns only", async () => {
    const tables = createArchitectDebugTables();
    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, APPOINTMENT_ID);

    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.routingFound).toBe(true);
    expect(tables.payment_routing_records).toHaveLength(1);
    expect(tables.payment_routing_records[0]).toMatchObject({
      payment_id: "e681ffde-7a67-4277-96c0-a35519ba4acd",
      appointment_id: APPOINTMENT_ID,
      barber_id: BARBER_ID,
      shop_id: null,
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
        payout_readiness_status: "ready"
      }]
    });

    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, APPOINTMENT_ID);

    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(false);
    expect(result.routingFound).toBe(true);
    expect(result.result).toBe("skipped");
    expect(tables.payment_routing_records).toHaveLength(1);
  });

  it("does not duplicate routing when repair runs twice", async () => {
    const tables = createArchitectDebugTables();
    const supabase = createSupabaseStub(tables) as never;

    const first = await repairMissingPaymentRouting(supabase, ARCHITECT_USER, APPOINTMENT_ID);
    const second = await repairMissingPaymentRouting(supabase, ARCHITECT_USER, APPOINTMENT_ID);

    expect(first.ok).toBe(true);
    expect(first.repaired).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.repaired).toBe(false);
    expect(second.result).toBe("skipped");
    expect(tables.payment_routing_records).toHaveLength(1);
  });

  it("relinks an orphan routing row by payment id instead of duplicating", async () => {
    const tables = createArchitectDebugTables({
      payment_routing_records: [{
        id: "routing-orphan",
        appointment_id: null,
        payment_id: "e681ffde-7a67-4277-96c0-a35519ba4acd",
        payout_readiness_status: "not_ready",
        created_at: "2026-05-17T12:00:00.000Z"
      }]
    });

    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, APPOINTMENT_ID);

    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.routingId).toBe("routing-orphan");
    expect(tables.payment_routing_records).toHaveLength(1);
    expect(tables.payment_routing_records[0]).toMatchObject({
      id: "routing-orphan",
      appointment_id: APPOINTMENT_ID,
      payment_id: "e681ffde-7a67-4277-96c0-a35519ba4acd",
      payout_readiness_status: "ready",
      released_at: null
    });
  });

  it("uses current production-legal payout readiness values even if stale constraints mention eligible", async () => {
    const tables = createArchitectDebugTables({
      "information_schema.check_constraints": [{
        constraint_name: "payment_routing_records_payout_readiness_status_check",
        check_clause: "CHECK ((payout_readiness_status = ANY (ARRAY['not_ready'::text, 'needs_attention'::text, 'eligible'::text, 'ready'::text, 'blocked'::text])))"
      }]
    });

    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, APPOINTMENT_ID);

    expect(result.ok).toBe(true);
    expect(tables.payment_routing_records[0].payout_readiness_status).toBe("ready");
    expect(tables.payment_routing_records[0].metadata).toMatchObject({
      readinessMeaning: "eligible",
      payoutReadinessDbValue: "ready"
    });
  });

  it("uses manual review posture when shop relationship truth is unknown", async () => {
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        shop_id: "shop-missing-relationship"
      }],
      shop_barber_relationships: []
    });

    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, APPOINTMENT_ID);

    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(true);
    expect(tables.payment_routing_records).toHaveLength(1);
    expect(tables.payment_routing_records[0]).toMatchObject({
      appointment_id: APPOINTMENT_ID,
      shop_id: "shop-missing-relationship",
      payout_readiness_status: "needs_attention",
      money_routing_status: "manual_review",
      reconciliation_status: "manual_review",
      eligible_at: null,
      released_at: null
    });
    expect(String(tables.payment_routing_records[0].blocked_reason)).toContain("manual review");
  });

  it("keeps captured payments on cancelled appointments blocked and in manual review", async () => {
    const cancelledAppointmentId = "cancelled-captured-appointment";
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: cancelledAppointmentId,
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "payment-cancelled-captured",
        appointment_id: cancelledAppointmentId,
        status: "captured",
        payment_status: "captured"
      }],
      appointment_status_history: []
    });

    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, cancelledAppointmentId);

    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(true);
    expect(tables.payment_routing_records).toHaveLength(1);
    expect(tables.payment_routing_records[0]).toMatchObject({
      appointment_id: cancelledAppointmentId,
      payment_id: "payment-cancelled-captured",
      payout_readiness_status: "blocked",
      money_routing_status: "manual_review",
      reconciliation_status: "manual_review",
      eligible_at: null,
      released_at: null,
      barber_payout_amount: 0,
      platform_fee_amount: 0
    });
    expect(String(tables.payment_routing_records[0].blocked_reason)).toContain("cancelled appointment");
  });

  it("updates an existing cancelled captured routing row without duplicating it", async () => {
    const cancelledAppointmentId = "cancelled-captured-appointment";
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: cancelledAppointmentId,
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "payment-cancelled-captured",
        appointment_id: cancelledAppointmentId,
        status: "captured",
        payment_status: "captured"
      }],
      payment_routing_records: [{
        id: "routing-unsafe-cancelled",
        appointment_id: cancelledAppointmentId,
        payment_id: "payment-cancelled-captured",
        payout_readiness_status: "ready",
        money_routing_status: "pending",
        reconciliation_status: "open",
        eligible_at: "2026-05-16T14:30:00.000Z",
        released_at: "2026-05-16T15:30:00.000Z"
      }]
    });

    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, cancelledAppointmentId);

    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(true);
    expect(tables.payment_routing_records).toHaveLength(1);
    expect(tables.payment_routing_records[0]).toMatchObject({
      id: "routing-unsafe-cancelled",
      appointment_id: cancelledAppointmentId,
      payment_id: "payment-cancelled-captured",
      payout_readiness_status: "blocked",
      money_routing_status: "manual_review",
      reconciliation_status: "manual_review",
      eligible_at: null,
      released_at: null
    });
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

  it("repairs the production incident shape with captured payment and missing routing", async () => {
    const incidentAppointmentId = "f996f06e-6e3e-592d-b02c-f8e4f778a087";
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: incidentAppointmentId,
        status: "completed",
        completed_at: "2026-05-18T14:55:00.000Z",
        shop_id: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "4c907b0a-af2e-4727-8da2-8097392667e6",
        appointment_id: incidentAppointmentId,
        amount: 5,
        status: "captured",
        payment_status: "captured"
      }],
      appointment_status_history: [{
        ...createArchitectDebugTables().appointment_status_history[0],
        appointment_id: incidentAppointmentId
      }]
    });

    const result = await repairMissingPaymentRouting(createSupabaseStub(tables) as never, ARCHITECT_USER, incidentAppointmentId);

    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(true);
    expect(tables.payment_routing_records).toHaveLength(1);
    expect(tables.payment_routing_records[0]).toMatchObject({
      appointment_id: incidentAppointmentId,
      payment_id: "4c907b0a-af2e-4727-8da2-8097392667e6",
      barber_id: BARBER_ID,
      shop_id: null,
      provider_gross_amount: 5,
      platform_fee_amount: 0.25,
      barber_payout_amount: 4.75,
      shop_split_amount: 0,
      released_at: null
    });
  });

  it("changes architect debug from routing fail to routing pass after repair", async () => {
    const tables = createArchitectDebugTables();
    const supabase = createSupabaseStub(tables) as never;

    const before = await buildAppointmentDebugPacket(supabase, APPOINTMENT_ID, ARCHITECT_USER, { persistSession: false });
    await repairMissingPaymentRouting(supabase, ARCHITECT_USER, APPOINTMENT_ID);
    const after = await buildAppointmentDebugPacket(supabase, APPOINTMENT_ID, ARCHITECT_USER, { persistSession: false });

    expect(before.summary.diagnosisCode).toBe("completed_but_routing_missing");
    expect(after.validationChecklist.find((item) => item.stage === "routing_row_exists")).toMatchObject({ status: "pass" });
    expect(after.validationChecklist.find((item) => item.stage === "routing_eligible")).toMatchObject({ status: "pass" });
    expect(after.summary.diagnosisCode).toBe("payout_eligible_not_released");
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
