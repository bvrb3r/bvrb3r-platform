import { describe, expect, it } from "vitest";
import { buildMissionControlSnapshot, detectArchitectMissionIncidents } from "@/lib/architect/mission-control/incident-detection";
import { buildProductOperationsRuntimeLoopProofFixtureFromTables } from "@/lib/architect/mission-control/runtime-loop-proof";
import { APPOINTMENT_ID, ARCHITECT_USER, BARBER_ID, createArchitectDebugTables, createSupabaseStub } from "@/tests/unit/architect-debug-test-utils";

describe("architect mission incident detection", () => {
  it("builds Product and Operations runtime loop proof from read-only production tables", () => {
    const base = createArchitectDebugTables();
    const shopId = "shop-runtime-proof";
    const ownerProfileId = "owner-runtime-proof";
    const tables = createArchitectDebugTables({
      profiles: [
        ...base.profiles,
        { id: ownerProfileId, email: "owner@bvrb3r.app", full_name: "Owner Runtime", role: "shop_owner_user", account_status: "active" }
      ],
      shops: [{ id: shopId, owner_id: ownerProfileId, status: "active", name: "Runtime Proof Shop" }],
      appointments: [{ ...base.appointments[0], shop_id: shopId, starts_at: "2026-06-20T14:00:00.000Z" }],
      shop_barber_relationships: [{
        id: "relationship-runtime-proof",
        shop_id: shopId,
        barber_id: BARBER_ID,
        status: "active",
        relationship_type: "freelance",
        approved_by_owner_at: "2026-06-20T12:00:00.000Z",
        approved_by_barber_at: "2026-06-20T12:01:00.000Z",
        started_at: "2026-06-20T12:01:00.000Z"
      }]
    });

    const fixture = buildProductOperationsRuntimeLoopProofFixtureFromTables({
      profiles: { rows: tables.profiles, connected: true },
      clients: { rows: tables.clients, connected: true },
      barbers: { rows: tables.barbers, connected: true },
      shops: { rows: tables.shops, connected: true },
      appointments: { rows: tables.appointments, connected: true },
      services: { rows: tables.services, connected: true },
      availability_rules: { rows: tables.availability_rules, connected: true },
      shop_barber_relationships: { rows: tables.shop_barber_relationships, connected: true },
      staff_locations: { rows: [], connected: true },
      appointment_status_history: { rows: tables.appointment_status_history, connected: true }
    });

    expect(fixture.bookingAvailability).toMatchObject({
      selectedBarberResolves: true,
      selectedServiceResolves: true,
      canonicalLocationResolves: true,
      availabilityRulesGenerateSlots: true,
      noAppointmentBeforeFinalConfirm: true
    });
    expect(fixture.barberCalendar).toMatchObject({
      appointmentAppearsOnCommandCalendar: true,
      barberCanCompleteOwnService: true,
      ownerCannotCompleteBarberService: true
    });
    expect(fixture.shopRelationship).toMatchObject({
      barberCanAccept: true,
      activeRelationshipAppearsInOwnerHome: true,
      acceptedBarberAppearsInScoreboard: true,
      profileRoleRemainsBarberUser: true
    });
    expect(fixture.ownerCommandCalendar).toMatchObject({
      activeBarbersFromRelationships: true,
      shopProductionUsesShopContext: true,
      ownerTimelineShopWide: true
    });
  });

  it("keeps missing Product and Operations runtime loop proof as Needs Review", () => {
    const fixture = buildProductOperationsRuntimeLoopProofFixtureFromTables({
      profiles: { rows: [], connected: false, errorMessage: "profiles unavailable" },
      clients: { rows: [], connected: false, errorMessage: "clients unavailable" },
      barbers: { rows: [], connected: false, errorMessage: "barbers unavailable" },
      shops: { rows: [], connected: false, errorMessage: "shops unavailable" },
      appointments: { rows: [], connected: false, errorMessage: "appointments unavailable" },
      services: { rows: [], connected: false, errorMessage: "services unavailable" },
      availability_rules: { rows: [], connected: false, errorMessage: "availability unavailable" },
      shop_barber_relationships: { rows: [], connected: false, errorMessage: "relationships unavailable" },
      staff_locations: { rows: [], connected: false, errorMessage: "staff locations unavailable" },
      appointment_status_history: { rows: [], connected: false, errorMessage: "history unavailable" }
    });

    expect(fixture.bookingAvailability?.selectedBarberResolves).toBeUndefined();
    expect(fixture.barberCalendar?.appointmentAppearsOnCommandCalendar).toBeUndefined();
    expect(fixture.shopRelationship?.activeRelationshipAppearsInOwnerHome).toBeUndefined();
    expect(fixture.ownerCommandCalendar?.activeBarbersFromRelationships).toBeUndefined();
  });
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

  it("keeps captured cancelled $5 payments with no refund as Finance blockers", async () => {
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: "cancelled-captured-appointment",
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "payment-cancelled-captured",
        appointment_id: "cancelled-captured-appointment",
        status: "captured",
        payment_status: "captured"
      }],
      appointment_status_history: []
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);
    const conflict = incidents.find((incident) => incident.diagnosisCode === "cancelled_captured_refund_missing");

    expect(conflict).toMatchObject({
      targetId: "payment-cancelled-captured",
      severity: "critical",
      canRepair: false,
      repairType: null,
      codexRequired: true
    });
    expect(conflict?.evidence.join("\n")).toContain("appointment.status=cancelled");
    expect(conflict?.evidence.join("\n")).toContain("blocked/manual_review");
  });

  it("keeps captured cancelled $5 payments with partial refund evidence as Finance blockers", async () => {
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: "cancelled-partial-refund-appointment",
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "payment-cancelled-partial-refund",
        appointment_id: "cancelled-partial-refund-appointment",
        amount: 5,
        status: "captured",
        payment_status: "captured"
      }],
      refunds: [{
        id: "refund-partial",
        payment_id: "payment-cancelled-partial-refund",
        amount: 1,
        status: "succeeded",
        created_at: "2026-06-20T12:00:00.000Z"
      }],
      appointment_status_history: []
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);
    const conflict = incidents.find((incident) => incident.diagnosisCode === "cancelled_captured_refund_missing");

    expect(conflict).toMatchObject({
      targetId: "payment-cancelled-partial-refund",
      severity: "critical"
    });
  });

  it("keeps captured cancelled $5 payments with missing refund amount as Finance blockers", async () => {
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: "cancelled-missing-refund-amount-appointment",
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "payment-cancelled-missing-refund-amount",
        appointment_id: "cancelled-missing-refund-amount-appointment",
        amount: 5,
        status: "captured",
        payment_status: "captured"
      }],
      refunds: [{
        id: "refund-missing-amount",
        payment_id: "payment-cancelled-missing-refund-amount",
        status: "succeeded",
        created_at: "2026-06-20T12:00:00.000Z"
      }],
      appointment_status_history: []
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);
    const conflict = incidents.find((incident) => incident.diagnosisCode === "cancelled_captured_refund_missing");

    expect(conflict).toMatchObject({
      targetId: "payment-cancelled-missing-refund-amount",
      severity: "critical"
    });
  });

  it("clears captured cancelled $5 blockers after full $5 refund row evidence exists", async () => {
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: "cancelled-refunded-appointment",
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "payment-cancelled-refunded",
        appointment_id: "cancelled-refunded-appointment",
        status: "captured",
        payment_status: "captured"
      }],
      refunds: [{
        id: "refund-cancelled-payment",
        payment_id: "payment-cancelled-refunded",
        amount: 5,
        status: "succeeded",
        created_at: "2026-06-20T12:00:00.000Z"
      }],
      appointment_status_history: []
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);

    expect(incidents.some((incident) => incident.diagnosisCode === "cancelled_captured_refund_missing")).toBe(false);
  });

  it("clears captured cancelled payment blockers when payment status is refunded", async () => {
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: "cancelled-payment-status-refunded-appointment",
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "payment-status-refunded",
        appointment_id: "cancelled-payment-status-refunded-appointment",
        amount: 5,
        status: "refunded",
        payment_status: "refunded"
      }],
      appointment_status_history: []
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);

    expect(incidents.some((incident) => incident.diagnosisCode === "cancelled_captured_refund_missing")).toBe(false);
  });

  it("keeps routing-refunded cancelled payments blocked when routing lacks refund support evidence", async () => {
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: "cancelled-routing-refunded-appointment",
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "payment-routing-refunded-no-support",
        appointment_id: "cancelled-routing-refunded-appointment",
        amount: 5,
        status: "captured",
        payment_status: "captured"
      }],
      payment_routing_records: [{
        id: "routing-refunded-no-support",
        payment_id: "payment-routing-refunded-no-support",
        appointment_id: "cancelled-routing-refunded-appointment",
        payout_readiness_status: "blocked",
        money_routing_status: "refunded",
        reconciliation_status: "reversed",
        released_at: null,
        updated_at: "2026-06-20T12:00:00.000Z"
      }],
      appointment_status_history: []
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);
    const conflict = incidents.find((incident) => incident.diagnosisCode === "cancelled_captured_refund_missing");

    expect(conflict).toMatchObject({
      targetId: "payment-routing-refunded-no-support",
      severity: "critical"
    });
  });

  it("detects paid POS sales with captured payment and missing routing", async () => {
    const tables = createArchitectDebugTables({
      appointments: [],
      pos_sales: [{
        id: "pos-sale-missing-routing",
        barber_id: BARBER_ID,
        shop_id: null,
        status: "paid",
        total_cents: 3500,
        payment_id: "payment-pos-sale",
        updated_at: "2026-05-22T14:00:00.000Z"
      }],
      payments: [{
        id: "payment-pos-sale",
        appointment_id: null,
        pos_sale_id: "pos-sale-missing-routing",
        barber_id: BARBER_ID,
        amount: 35,
        provider: "stripe",
        status: "captured",
        payment_status: "captured",
        payment_type: "pos_sale",
        provider_payment_intent_id: "pi_pos",
        currency: "usd",
        paid_at: "2026-05-22T14:00:00.000Z",
        created_at: "2026-05-22T14:00:00.000Z"
      }]
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);
    const posIncident = incidents.find((incident) => incident.diagnosisCode === "paid_pos_sale_missing_routing");

    expect(posIncident).toMatchObject({
      targetType: "pos_sale",
      targetId: "pos-sale-missing-routing",
      severity: "critical"
    });
    expect(posIncident?.evidence.join("\n")).toContain("payment_routing_records lookup by pos_sale_id returned 0 rows");
  });

  it("does not flag draft POS sales as missing routing incidents", async () => {
    const tables = createArchitectDebugTables({
      appointments: [],
      pos_sales: [{
        id: "pos-sale-draft",
        barber_id: BARBER_ID,
        shop_id: null,
        status: "payment_pending",
        total_cents: 3500,
        payment_id: null,
        updated_at: "2026-05-22T14:00:00.000Z"
      }],
      payments: []
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);

    expect(incidents.some((incident) => incident.diagnosisCode === "paid_pos_sale_missing_routing")).toBe(false);
  });

  it("does not flag paid cash POS sales as missing routing incidents", async () => {
    const tables = createArchitectDebugTables({
      appointments: [],
      pos_sales: [{
        id: "pos-sale-cash",
        barber_id: BARBER_ID,
        shop_id: null,
        status: "paid",
        payment_method: "cash",
        total_cents: 3500,
        payment_id: null,
        updated_at: "2026-05-23T14:00:00.000Z"
      }],
      payments: []
    });

    const incidents = await detectArchitectMissionIncidents(createSupabaseStub(tables) as never);

    expect(incidents.some((incident) => incident.diagnosisCode === "paid_pos_sale_missing_routing")).toBe(false);
  });

  it("adds connected CEO platform metrics to the Mission Control snapshot", async () => {
    const snapshot = await buildMissionControlSnapshot(createSupabaseStub(createArchitectDebugTables()) as never, ARCHITECT_USER);
    const totalUsers = snapshot.foundation.ceoCommandCenter.find((card) => card.id === "ceo-total-users");
    const clients = snapshot.foundation.ceoCommandCenter.find((card) => card.id === "ceo-clients-total");
    const routing = snapshot.foundation.ceoCommandCenter.find((card) => card.id === "ceo-payment-routing-health");
    const roleDrift = snapshot.foundation.ceoCommandCenter.find((card) => card.id === "ceo-role-drift-health");
    const rlsDisabled = snapshot.foundation.ceoCommandCenter.find((card) => card.id === "ceo-rls-disabled-evidence");
    const auditEvidence = snapshot.foundation.ceoCommandCenter.find((card) => card.id === "ceo-audit-log-evidence");
    const securityLane = snapshot.foundation.departmentLanes.find((lane) => lane.id === "security");
    const financeLane = snapshot.foundation.departmentLanes.find((lane) => lane.id === "finance");
    const productLane = snapshot.foundation.departmentLanes.find((lane) => lane.id === "product");
    const operationsLane = snapshot.foundation.departmentLanes.find((lane) => lane.id === "operations");

    expect(totalUsers).toMatchObject({ label: "Total Users", status: "Pass", metricValue: "3" });
    expect(clients).toMatchObject({ label: "Clients", status: "Pass", metricValue: "1" });
    expect(routing).toMatchObject({ label: "Payment Routing Health", status: "Failed" });
    expect(roleDrift).toMatchObject({ label: "Role Drift Evidence", status: "Failed" });
    expect(roleDrift?.evidence.join("\n")).toContain("Read-only evidence only; no role mutation was attempted.");
    expect(rlsDisabled).toMatchObject({ label: "RLS Disabled Evidence", status: "Failed", metricValue: "28 disabled" });
    expect(rlsDisabled?.evidence.join("\n")).toContain("no RLS enablement");
    expect(auditEvidence).toMatchObject({ label: "Audit Evidence", status: "Failed", metricValue: "0 row(s)" });
    expect(securityLane?.cards.find((card) => card.id === "security-rls-disabled")).toMatchObject({ status: "Failed" });
    expect(securityLane?.cards.find((card) => card.id === "security-audit")).toMatchObject({ status: "Failed" });
    expect(securityLane?.cards.find((card) => card.id === "security-audit-plan")?.evidence.join("\\n")).toContain("Repair approvals");
    expect(financeLane?.cards.find((card) => card.id === "finance-repair-audit-coverage")).toMatchObject({ status: "Failed" });
    expect(productLane?.cards.find((card) => card.id === "product-client-health")).toMatchObject({ status: "Needs Review" });
    expect(productLane?.cards.find((card) => card.id === "product-booking-ux")).toMatchObject({ status: "Pass" });
    expect(operationsLane?.cards.find((card) => card.id === "operations-calendars")).toMatchObject({ status: "Pass" });
    expect(operationsLane?.cards.find((card) => card.id === "operations-completion")).toMatchObject({ status: "Pass" });
  });

  it("keeps Finance failed when captured cancelled appointments are unresolved", async () => {
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: "cancelled-captured-appointment",
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "payment-cancelled-captured",
        appointment_id: "cancelled-captured-appointment",
        status: "captured",
        payment_status: "captured"
      }],
      payment_routing_records: [{
        id: "routing-cancelled-review",
        payment_id: "payment-cancelled-captured",
        appointment_id: "cancelled-captured-appointment",
        payout_readiness_status: "blocked",
        money_routing_status: "manual_review",
        reconciliation_status: "manual_review",
        released_at: null,
        updated_at: "2026-05-17T14:00:00.000Z"
      }],
      appointment_status_history: []
    });

    const snapshot = await buildMissionControlSnapshot(createSupabaseStub(tables) as never, ARCHITECT_USER);
    const routing = snapshot.foundation.ceoCommandCenter.find((card) => card.id === "ceo-payment-routing-health");
    const financeLane = snapshot.foundation.departmentLanes.find((lane) => lane.id === "finance");
    const incident = snapshot.incidents.find((item) => item.diagnosisCode === "cancelled_captured_refund_missing");
    const financeEvidence = snapshot.financeEvidence;

    expect(financeEvidence).toBeDefined();
    expect(incident).toBeTruthy();
    expect(routing).toMatchObject({ label: "Payment Routing Health", status: "Failed" });
    expect(financeLane?.cards.find((card) => card.id === "finance-refund-resolution")).toMatchObject({ status: "Failed" });
    expect(financeEvidence?.activeRefundTargets).toHaveLength(1);
    expect(financeEvidence?.activeRefundTargets[0]).toMatchObject({
      appointmentId: "cancelled-captured-appointment",
      paymentId: "payment-cancelled-captured",
      amount: 5
    });
    expect(financeEvidence?.refundMetrics).toMatchObject({
      refundCount: 0,
      totalRefundedAmount: 0,
      activeUnresolvedRefundBlockerCount: 1
    });
  });

  it("moves fully refunded cancelled captured payments into Finance refund history", async () => {
    const tables = createArchitectDebugTables({
      appointments: [{
        ...createArchitectDebugTables().appointments[0],
        id: "cancelled-refunded-appointment",
        status: "cancelled",
        completed_at: null
      }],
      payments: [{
        ...createArchitectDebugTables().payments[0],
        id: "payment-cancelled-refunded",
        appointment_id: "cancelled-refunded-appointment",
        amount: 5,
        status: "refunded",
        payment_status: "refunded"
      }],
      refunds: [{
        id: "refund-cancelled-payment",
        payment_id: "payment-cancelled-refunded",
        amount: 5,
        status: "succeeded",
        provider_refund_id: "re_cancelled_payment",
        reason: "Cancelled appointment captured booking payment resolution",
        created_at: "2026-06-20T12:00:00.000Z"
      }],
      platform_events: [{
        id: "event-refund-success",
        event_type: "payment_refunded",
        actor_id: "platform-admin-1",
        actor_role: "platform_admin",
        source: "architect_finance_controlled_refund",
        payment_id: "payment-cancelled-refunded",
        appointment_id: "cancelled-refunded-appointment",
        payload: {
          refundId: "refund-cancelled-payment",
          providerRefundId: "re_cancelled_payment",
          amount: 5,
          reason: "Cancelled appointment captured booking payment resolution",
          result: "success"
        },
        occurred_at: "2026-06-20T12:00:01.000Z"
      }],
      payment_routing_records: [{
        id: "routing-cancelled-refunded",
        payment_id: "payment-cancelled-refunded",
        appointment_id: "cancelled-refunded-appointment",
        payout_readiness_status: "blocked",
        money_routing_status: "manual_review",
        reconciliation_status: "manual_review",
        released_at: null,
        updated_at: "2026-06-20T12:00:00.000Z"
      }],
      appointment_status_history: []
    });

    const snapshot = await buildMissionControlSnapshot(createSupabaseStub(tables) as never, ARCHITECT_USER);
    const financeEvidence = snapshot.financeEvidence;
    const refundLog = financeEvidence?.refundLogs.find((log) => log.refundId === "refund-cancelled-payment");

    expect(financeEvidence).toBeDefined();
    expect(snapshot.incidents.some((item) => item.diagnosisCode === "cancelled_captured_refund_missing")).toBe(false);
    expect(financeEvidence?.activeRefundTargets).toHaveLength(0);
    expect(financeEvidence?.refundMetrics).toMatchObject({
      refundCount: 1,
      totalRefundedAmount: 5,
      activeUnresolvedRefundBlockerCount: 0,
      lastRefundTimestamp: "2026-06-20T12:00:00.000Z"
    });
    expect(refundLog).toMatchObject({
      category: "refund",
      paymentId: "payment-cancelled-refunded",
      appointmentId: "cancelled-refunded-appointment",
      refundId: "refund-cancelled-payment",
      providerRefundId: "re_cancelled_payment",
      amount: 5,
      reason: "Cancelled appointment captured booking payment resolution",
      actorId: "platform-admin-1",
      actorRole: "platform_admin",
      source: "architect_finance_controlled_refund",
      resultStatus: "succeeded"
    });
  });

  it("marks resolved routing/refund evidence as no-repair-required without promoting all Finance blockers", async () => {
    const base = createArchitectDebugTables();
    const completedAppointment = base.appointments[0];
    const completedPayment = base.payments[0];
    const cancelledAppointment = {
      ...completedAppointment,
      id: "cancelled-refunded-routing-safe-appointment",
      status: "cancelled",
      completed_at: null,
      updated_at: "2026-06-20T12:00:00.000Z"
    };
    const cancelledPayment = {
      ...completedPayment,
      id: "cancelled-refunded-routing-safe-payment",
      appointment_id: cancelledAppointment.id,
      status: "refunded",
      payment_status: "refunded",
      created_at: "2026-06-20T11:55:00.000Z"
    };
    const tables = createArchitectDebugTables({
      appointments: [completedAppointment, cancelledAppointment],
      payments: [completedPayment, cancelledPayment],
      refunds: [{
        id: "refund-safe-cancelled",
        payment_id: cancelledPayment.id,
        amount: 5,
        status: "succeeded",
        provider_refund_id: "re_safe_cancelled",
        reason: "Cancelled appointment captured booking payment resolution",
        created_at: "2026-06-20T12:00:00.000Z"
      }],
      payment_routing_records: [{
        id: "routing-completed-safe",
        payment_id: completedPayment.id,
        appointment_id: completedAppointment.id,
        routing_model: "freelance",
        payout_recipient_type: "barber",
        provider_gross_amount: 5,
        refunded_amount: 0,
        platform_fee_amount: 0.25,
        barber_payout_amount: 4.75,
        shop_split_amount: 0,
        payout_readiness_status: "ready",
        money_routing_status: "pending",
        reconciliation_status: "open",
        released_at: null,
        updated_at: "2026-06-20T12:00:00.000Z"
      }, {
        id: "routing-cancelled-refunded-safe",
        payment_id: cancelledPayment.id,
        appointment_id: cancelledAppointment.id,
        routing_model: "freelance",
        payout_recipient_type: "barber",
        provider_gross_amount: 5,
        refunded_amount: 5,
        platform_fee_amount: 0,
        barber_payout_amount: 0,
        shop_split_amount: 0,
        payout_readiness_status: "ready",
        money_routing_status: "refunded",
        reconciliation_status: "open",
        released_at: null,
        held_at: "2026-06-20T12:00:00.000Z",
        updated_at: "2026-06-20T12:00:00.000Z"
      }],
      payout_executions: []
    });

    const snapshot = await buildMissionControlSnapshot(createSupabaseStub(tables) as never, ARCHITECT_USER);
    const routingSummary = snapshot.financeEvidence?.routingSummary;
    const routingCard = snapshot.foundation.ceoCommandCenter.find((card) => card.id === "ceo-payment-routing-health");
    const financeLane = snapshot.foundation.departmentLanes.find((lane) => lane.id === "finance");

    expect(snapshot.incidents.some((incident) => incident.diagnosisCode === "completed_but_routing_missing")).toBe(false);
    expect(snapshot.incidents.some((incident) => incident.diagnosisCode === "cancelled_captured_refund_missing")).toBe(false);
    expect(routingSummary).toMatchObject({
      status: "Pass",
      inspectedBookingPaymentRows: 2,
      rowsWithRouting: 2,
      completedCapturedMissingRoutingCount: 0,
      cancelledCapturedMissingRoutingCount: 0,
      cancelledRefundedSafeRowCount: 1,
      targetPayoutExecutionCount: 0,
      proposedInsertCount: 0,
      proposedUpdateCount: 0,
      repairNeeded: false,
      repairRouteAvailable: true,
      repairRouteSafeToCall: false
    });
    expect(routingCard).toMatchObject({
      status: "Pass",
      metricValue: "No repair required"
    });
    expect(routingCard?.evidence.join("\n")).toContain("completedCapturedMissingRouting=0");
    expect(routingCard?.evidence.join("\n")).toContain("cancelledCapturedMissingRouting=0");
    expect(routingCard?.evidence.join("\n")).toContain("proposedInsertCount=0");
    expect(routingCard?.evidence.join("\n")).toContain("proposedUpdateCount=0");
    expect(financeLane?.cards.find((card) => card.id === "finance-routing")).toMatchObject({ status: "Pass" });
    expect(financeLane?.cards.find((card) => card.id === "finance-repair-audit-coverage")).toMatchObject({ status: "Failed" });
    expect(financeLane?.status).toBe("Failed");
  });

  it("keeps missing routing evidence as a repair-needed failure", async () => {
    const snapshot = await buildMissionControlSnapshot(createSupabaseStub(createArchitectDebugTables()) as never, ARCHITECT_USER);
    const routingSummary = snapshot.financeEvidence?.routingSummary;

    expect(routingSummary).toMatchObject({
      status: "Failed",
      completedCapturedMissingRoutingCount: 1,
      proposedInsertCount: 1,
      repairNeeded: true,
      repairRouteSafeToCall: true
    });
    expect(snapshot.foundation.ceoCommandCenter.find((card) => card.id === "ceo-payment-routing-health")).toMatchObject({
      status: "Failed",
      metricValue: "Repair needed"
    });
  });
});
