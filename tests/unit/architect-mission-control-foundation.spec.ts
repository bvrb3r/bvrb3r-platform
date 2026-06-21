import { describe, expect, it } from "vitest";
import {
  ACTION_REGISTRY,
  AUDIT_COVERAGE_PLAN,
  HIVE_AGENT_REGISTRY,
  MISSION_CONTROL_LANES,
  OFFICER_ASSISTANT_DEPARTMENTS,
  SOURCE_VAULT_REGISTRY,
  buildMissionControlFoundation,
  buildMissionReadinessBreakdown,
  buildV1RuntimeProofMatrix,
  classifyArchitectIncident,
  getOfficerAssistants,
  getAuditCoveragePlanEvidence,
  getOfficerCleanupEvidence,
  validateCoreLoopState
} from "@/lib/architect/mission-control/foundation";

describe("architect mission control foundation", () => {
  it("defines the official nine-lane Mission Control Navigation with CEO default", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");

    expect(MISSION_CONTROL_LANES.map((lane) => lane.label)).toEqual([
      "CEO",
      "Product",
      "Technology",
      "Operations",
      "Finance",
      "Marketing",
      "Compliance",
      "Security",
      "Content & Community"
    ]);
    expect(foundation.defaultLaneId).toBe("ceo");
    expect(MISSION_CONTROL_LANES.map((lane) => lane.href)).toEqual([
      "/architect/ceo",
      "/architect/product",
      "/architect/technology",
      "/architect/operations",
      "/architect/finance",
      "/architect/marketing",
      "/architect/compliance",
      "/architect/security",
      "/architect/content-community"
    ]);
  });

  it("keeps missing CEO platform metrics as Needs Review instead of fake values", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");
    const totalUsers = foundation.ceoCommandCenter.find((card) => card.id === "ceo-total-users");

    expect(totalUsers).toMatchObject({
      label: "Total Users",
      status: "Needs Review",
      metricValue: "Not connected"
    });
  });

  it("uses connected CEO metric evidence when supplied", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z", [{
      id: "ceo-total-users",
      label: "Total Users",
      department: "CEO",
      workflow: "Audience",
      status: "Pass",
      metricValue: "3",
      summary: "Profiles table is connected.",
      evidence: ["3 profile rows counted."]
    }]);

    expect(foundation.ceoCommandCenter.find((card) => card.id === "ceo-total-users")).toMatchObject({
      status: "Pass",
      metricValue: "3"
    });
  });

  it("keeps missing cleanup evidence as Needs Review instead of fake Pass", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");
    const securityLane = foundation.departmentLanes.find((lane) => lane.id === "security");

    expect(foundation.ceoCommandCenter.find((card) => card.id === "ceo-role-drift-health")).toMatchObject({
      status: "Needs Review",
      metricValue: "Not connected"
    });
    expect(securityLane?.cards.find((card) => card.id === "security-role-drift")).toMatchObject({
      status: "Needs Review"
    });
    expect(securityLane?.cards.find((card) => card.id === "security-rls-disabled")).toMatchObject({
      status: "Needs Review"
    });
    expect(securityLane?.cards.find((card) => card.id === "security-audit")).toMatchObject({
      status: "Needs Review"
    });
  });

  it("surfaces cleanup evidence across officer lanes without mutating production truth", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z", [{
      id: "ceo-role-drift-health",
      label: "Role Drift Evidence",
      department: "CEO",
      workflow: "Security",
      status: "Failed",
      metricValue: "2 drift",
      summary: "Non-canonical public role evidence exists in profiles.",
      evidence: ["Non-canonical role values found: platform_admin (2).", "Read-only evidence only; no role mutation was attempted."]
    }, {
      id: "ceo-rls-disabled-evidence",
      label: "RLS Disabled Evidence",
      department: "CEO",
      workflow: "Security",
      status: "Failed",
      metricValue: "28 disabled",
      summary: "Public Supabase tables have RLS disabled.",
      evidence: ["28 public Supabase table(s) have RLS disabled.", "No RLS enablement was attempted."]
    }, {
      id: "ceo-audit-log-evidence",
      label: "Audit Evidence",
      department: "CEO",
      workflow: "Security",
      status: "Failed",
      metricValue: "0 row(s)",
      summary: "audit_logs is connected but empty.",
      evidence: ["audit_logs returned 0 row(s).", "No audit row was inserted."]
    }]);
    const securityLane = foundation.departmentLanes.find((lane) => lane.id === "security");
    const complianceLane = foundation.departmentLanes.find((lane) => lane.id === "compliance");
    const technologyLane = foundation.departmentLanes.find((lane) => lane.id === "technology");

    expect(securityLane?.status).toBe("Failed");
    expect(securityLane?.cards.find((card) => card.id === "security-role-drift")).toMatchObject({ status: "Failed" });
    expect(securityLane?.cards.find((card) => card.id === "security-rls-disabled")).toMatchObject({ status: "Failed" });
    expect(securityLane?.cards.find((card) => card.id === "security-audit")).toMatchObject({ status: "Failed" });
    expect(complianceLane?.cards.find((card) => card.id === "compliance-trust-gates")).toMatchObject({ status: "Failed" });
    expect(technologyLane?.cards.find((card) => card.id === "technology-rls-disabled")).toMatchObject({ status: "Failed" });
    expect(securityLane?.cards.find((card) => card.id === "security-role-drift")?.evidence.join("\n")).toContain("no role mutation was attempted");
  });

  it("scopes every Architect evidence card for version-aware readiness", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");
    const cards = [
      ...foundation.ceoCommandCenter,
      ...foundation.departmentLanes.flatMap((lane) => lane.cards),
      ...foundation.coreLoopValidators
    ];

    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.scope).toMatch(/v1_required|v2_infrastructure|v3_future|parked/);
      expect(card.criticality).toMatch(/critical|important|informational/);
      expect(typeof card.blocksCurrentRelease).toBe("boolean");
      expect(card.evidenceRequiredForPass).toEqual(expect.any(String));
      expect(card.evidenceRequiredForPass?.length).toBeGreaterThan(20);
    }
  });

  it("forces CEO readiness Failed when child required Security RLS evidence fails", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z", [{
      id: "ceo-rls-disabled-evidence",
      label: "RLS Disabled Evidence",
      department: "CEO",
      workflow: "Security",
      status: "Failed",
      metricValue: "28 disabled",
      summary: "Public Supabase tables have RLS disabled.",
      evidence: ["28 public Supabase table(s) have RLS disabled.", "No RLS enablement was attempted."]
    }]);

    expect(foundation.readinessBreakdown?.overallStatus).toBe("Failed");
    expect(foundation.readinessBreakdown?.currentReleaseBlockers.map((card) => card.id)).toEqual(expect.arrayContaining([
      "ceo-rls-disabled-evidence",
      "security-rls-disabled",
      "technology-rls-disabled"
    ]));
  });

  it("does not let all-pass CEO cards hide failed child required cards", () => {
    const ceoCards = [{
      id: "overall-platform-status",
      label: "Overall platform status",
      department: "CEO" as const,
      workflow: "Global Health",
      status: "Pass" as const,
      summary: "CEO card passed.",
      evidence: ["CEO summary is passing."],
      scope: "v1_required" as const,
      criticality: "critical" as const,
      blocksCurrentRelease: true,
      evidenceRequiredForPass: "CEO platform status must be connected."
    }];
    const securityLane = {
      id: "security" as const,
      label: "Security" as const,
      purpose: "Security evidence.",
      status: "Failed" as const,
      cards: [{
        id: "security-rls-disabled",
        label: "RLS disabled tables",
        department: "Security" as const,
        workflow: "Supabase RLS",
        status: "Failed" as const,
        summary: "RLS disabled evidence failed.",
        evidence: ["28 public Supabase table(s) have RLS disabled."],
        scope: "v1_required" as const,
        criticality: "critical" as const,
        blocksCurrentRelease: true,
        evidenceRequiredForPass: "No V1 public table may remain RLS-disabled."
      }]
    };
    const breakdown = buildMissionReadinessBreakdown(ceoCards, [securityLane]);

    expect(breakdown.overallStatus).toBe("Failed");
    expect(breakdown.v1RequiredFailedCount).toBe(1);
    expect(breakdown.currentReleaseBlockers.map((card) => card.id)).toContain("security-rls-disabled");
  });

  it("forces CEO readiness Failed when Finance repair audit coverage fails", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z", [{
      id: "ceo-audit-log-evidence",
      label: "Audit Evidence",
      department: "CEO",
      workflow: "Security",
      status: "Failed",
      metricValue: "0 row(s)",
      summary: "audit_logs returned 0 row(s).",
      evidence: ["audit_logs returned 0 row(s).", "No audit row was inserted."]
    }]);

    expect(foundation.readinessBreakdown?.overallStatus).toBe("Failed");
    expect(foundation.readinessBreakdown?.currentReleaseBlockers.map((card) => card.id)).toEqual(expect.arrayContaining([
      "finance-repair-audit-coverage",
      "security-audit"
    ]));
  });

  it("parks future scaffolding without reducing the V1 readiness denominator", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");
    const parkedIds = foundation.readinessBreakdown?.futureParkedItems.map((card) => card.id) ?? [];
    const v1Ids = [
      ...foundation.ceoCommandCenter,
      ...foundation.departmentLanes.flatMap((lane) => lane.cards),
      ...foundation.coreLoopValidators
    ].filter((card) => card.scope === "v1_required").map((card) => card.id);

    expect(parkedIds).toEqual(expect.arrayContaining([
      "operations-kiosk",
      "marketing-referrals",
      "marketing-campaigns",
      "agent-status"
    ]));
    expect(v1Ids).not.toContain("operations-kiosk");
    expect(v1Ids).not.toContain("marketing-referrals");
    expect(v1Ids).not.toContain("marketing-campaigns");
    expect(v1Ids).not.toContain("agent-status");
  });

  it("lowers V1 readiness for Needs Review required cards but not parked cards", () => {
    const breakdown = buildMissionReadinessBreakdown([{
      id: "operations-appointments",
      label: "Appointments",
      department: "Operations" as const,
      workflow: "Appointments",
      status: "Pass" as const,
      summary: "Appointments pass.",
      evidence: ["Appointment loop verified."],
      scope: "v1_required" as const,
      criticality: "critical" as const,
      blocksCurrentRelease: true,
      evidenceRequiredForPass: "Appointment loop must pass."
    }, {
      id: "finance-repair-audit-coverage",
      label: "Repair audit coverage",
      department: "Finance" as const,
      workflow: "Audit",
      status: "Needs Review" as const,
      summary: "Audit evidence needs review.",
      evidence: ["Audit trail evidence is not complete."],
      scope: "v1_required" as const,
      criticality: "critical" as const,
      blocksCurrentRelease: true,
      evidenceRequiredForPass: "Repair audit coverage must be connected."
    }, {
      id: "marketing-referrals",
      label: "Referral readiness",
      department: "Marketing" as const,
      workflow: "Referrals",
      status: "Needs Review" as const,
      summary: "Future parked.",
      evidence: ["Referral automation is not enabled."],
      scope: "parked" as const,
      criticality: "informational" as const,
      blocksCurrentRelease: false,
      evidenceRequiredForPass: "Referral readiness is parked outside V1."
    }]);

    expect(breakdown.overallStatus).toBe("Needs Review");
    expect(breakdown.v1RequiredTotalCount).toBe(2);
    expect(breakdown.v1RequiredPassCount).toBe(1);
    expect(breakdown.v1ReadinessPercent).toBe(50);
    expect(breakdown.futureParkedCount).toBe(1);
  });

  it("reaches 100 V1 readiness only when all v1_required cards pass", () => {
    const passingCards = [{
      id: "security-rls-disabled",
      label: "RLS disabled tables",
      department: "Security" as const,
      workflow: "Supabase RLS",
      status: "Pass" as const,
      summary: "RLS evidence is clean.",
      evidence: ["No public RLS-disabled tables are present."],
      scope: "v1_required" as const,
      criticality: "critical" as const,
      blocksCurrentRelease: true,
      evidenceRequiredForPass: "No V1 public table may remain RLS-disabled."
    }, {
      id: "marketing-campaigns",
      label: "Campaign tracking future readiness",
      department: "Marketing" as const,
      workflow: "Campaigns",
      status: "Needs Review" as const,
      summary: "Future parked.",
      evidence: ["No fake campaign tracking."],
      scope: "parked" as const,
      criticality: "informational" as const,
      blocksCurrentRelease: false,
      evidenceRequiredForPass: "Campaign tracking is parked outside V1."
    }];
    const allPass = buildMissionReadinessBreakdown(passingCards);
    const failed = buildMissionReadinessBreakdown([{ ...passingCards[0], status: "Failed" as const }, passingCards[1]]);

    expect(allPass.overallStatus).toBe("Pass");
    expect(allPass.v1ReadinessPercent).toBe(100);
    expect(allPass.v1RequiredTotalCount).toBe(1);
    expect(allPass.futureParkedCount).toBe(1);
    expect(failed.overallStatus).toBe("Failed");
    expect(failed.v1ReadinessPercent).toBe(0);
  });

  it("keeps missing client proof as Needs Review instead of fake Pass", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");
    const clientGroup = foundation.v1RuntimeProofMatrix?.groups.find((group) => group.id === "client_loop");

    expect(clientGroup).toMatchObject({
      label: "Client loop",
      status: "Needs Review",
      proofConnected: false
    });
    expect(clientGroup?.rows.find((row) => row.id === "client-account-exists")).toMatchObject({
      status: "Needs Review",
      proofConnected: false,
      staleOrMissingProof: true
    });
  });

  it("keeps missing barber calendar proof as Needs Review", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");
    const barberGroup = foundation.v1RuntimeProofMatrix?.groups.find((group) => group.id === "barber_loop");
    const calendarProof = barberGroup?.rows.find((row) => row.id === "barber-calendar-visibility");

    expect(barberGroup?.status).toBe("Needs Review");
    expect(calendarProof).toMatchObject({
      status: "Needs Review",
      currentEvidenceSource: "barber-calendar-loop validator",
      proofConnected: false
    });
  });

  it("keeps missing owner team proof as Needs Review", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");
    const ownerGroup = foundation.v1RuntimeProofMatrix?.groups.find((group) => group.id === "shop_owner_loop");
    const teamProof = ownerGroup?.rows.find((row) => row.id === "owner-team-relationship-proof");

    expect(ownerGroup?.status).toBe("Needs Review");
    expect(teamProof).toMatchObject({
      status: "Needs Review",
      currentEvidenceSource: "shop-relationship-loop validator",
      proofConnected: false
    });
  });

  it("allows Finance refund evidence to Pass while audit proof remains Failed", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z", [{
      id: "ceo-active-refund-blockers",
      label: "Active Refund Blockers",
      department: "CEO",
      workflow: "Refund Logs",
      status: "Pass",
      metricValue: "0",
      summary: "No active refund blockers.",
      evidence: ["activeUnresolvedRefundBlockerCount=0"]
    }, {
      id: "ceo-refund-count",
      label: "Refund Count",
      department: "CEO",
      workflow: "Refund Logs",
      status: "Pass",
      metricValue: "4",
      summary: "Four refund rows are connected.",
      evidence: ["refundCount=4"]
    }, {
      id: "ceo-total-refunded",
      label: "Total Refunded Amount",
      department: "CEO",
      workflow: "Refund Logs",
      status: "Pass",
      metricValue: "$20",
      summary: "Total refunded amount is connected.",
      evidence: ["totalRefunded=$20"]
    }, {
      id: "ceo-last-refund-timestamp",
      label: "Last Refund Timestamp",
      department: "CEO",
      workflow: "Refund Logs",
      status: "Pass",
      metricValue: "2026-06-20T02:00:00.000Z",
      summary: "Last refund timestamp is connected.",
      evidence: ["lastRefundTimestamp=2026-06-20T02:00:00.000Z"]
    }, {
      id: "ceo-audit-log-evidence",
      label: "Audit Evidence",
      department: "CEO",
      workflow: "Security",
      status: "Failed",
      metricValue: "0 row(s)",
      summary: "audit_logs returned 0 row(s).",
      evidence: ["audit_logs returned 0 row(s).", "No audit row was inserted."]
    }]);
    const moneyGroup = foundation.v1RuntimeProofMatrix?.groups.find((group) => group.id === "money_loop");
    const refundProof = moneyGroup?.rows.find((row) => row.id === "finance-refund-evidence");
    const auditProof = moneyGroup?.rows.find((row) => row.id === "finance-audit-coverage-proof");

    expect(refundProof).toMatchObject({ status: "Pass", proofConnected: true });
    expect(auditProof).toMatchObject({ status: "Failed", proofConnected: true });
    expect(moneyGroup?.status).toBe("Failed");
  });

  it("forces Security loop Failed from RLS or role drift evidence", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z", [{
      id: "ceo-role-drift-health",
      label: "Role Drift Evidence",
      department: "CEO",
      workflow: "Security",
      status: "Failed",
      metricValue: "2 drift",
      summary: "Role drift exists.",
      evidence: ["Non-canonical role values found: owner (2)."]
    }, {
      id: "ceo-rls-disabled-evidence",
      label: "RLS Disabled Evidence",
      department: "CEO",
      workflow: "Security",
      status: "Failed",
      metricValue: "28 disabled",
      summary: "RLS disabled.",
      evidence: ["28 public Supabase table(s) have RLS disabled."]
    }]);
    const securityGroup = foundation.v1RuntimeProofMatrix?.groups.find((group) => group.id === "security_loop");

    expect(securityGroup?.status).toBe("Failed");
    expect(securityGroup?.rows.find((row) => row.id === "security-role-drift")).toMatchObject({ status: "Failed" });
    expect(securityGroup?.rows.find((row) => row.id === "security-rls-disabled")).toMatchObject({ status: "Failed" });
  });

  it("keeps parked and future cards out of V1 runtime proof", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");
    const rowIds = foundation.v1RuntimeProofMatrix?.rows.map((row) => row.id) ?? [];

    expect(rowIds).not.toContain("operations-kiosk");
    expect(rowIds).not.toContain("marketing-referrals");
    expect(rowIds).not.toContain("marketing-campaigns");
    expect(rowIds).not.toContain("hive-ai");
  });

  it("prevents V1 readiness from reaching 100 until all runtime proof groups pass", () => {
    const passingCards = [{
      id: "overall-platform-status",
      label: "Overall platform status",
      department: "CEO" as const,
      workflow: "Global Health",
      status: "Pass" as const,
      summary: "CEO card passed.",
      evidence: ["CEO summary is passing."],
      scope: "v1_required" as const,
      criticality: "critical" as const,
      blocksCurrentRelease: true,
      evidenceRequiredForPass: "CEO platform status must be connected."
    }];
    const missingRuntimeProof = buildV1RuntimeProofMatrix(passingCards);
    const breakdown = buildMissionReadinessBreakdown(passingCards, [], [], missingRuntimeProof);

    expect(missingRuntimeProof.allGroupsPass).toBe(false);
    expect(breakdown.overallStatus).toBe("Needs Review");
    expect(breakdown.v1ReadinessPercent).toBeLessThan(100);
    expect(breakdown.currentReleaseBlockers.map((card) => card.id)).toEqual(expect.arrayContaining([
      "v1-runtime-proof-client_loop",
      "v1-runtime-proof-barber_loop",
      "v1-runtime-proof-shop_owner_loop"
    ]));
  });


  it("keeps Finance from Pass when production evidence is unavailable", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");
    const financeLane = foundation.departmentLanes.find((lane) => lane.id === "finance");

    expect(financeLane?.status).toBe("Needs Review");
    expect(financeLane?.cards.find((card) => card.id === "finance-refund-resolution")).toMatchObject({
      status: "Needs Review",
      summary: "Refund/reversal evidence must be connected before Finance can Pass."
    });
    expect(financeLane?.cards.find((card) => card.id === "finance-repair-audit-coverage")).toMatchObject({
      status: "Needs Review"
    });
  });

  it("keeps Finance failed when cancelled captured refund evidence is missing", () => {
    const foundation = buildMissionControlFoundation([{
      id: "cancelled_captured_refund_missing:payment:payment-cancelled",
      diagnosisCode: "cancelled_captured_refund_missing",
      missionIncidentType: "cancelled_captured_refund_unresolved",
      affectedDepartment: "Finance",
      affectedWorkflow: "Cancelled/Captured Refund Resolution",
      affectedEntity: "payment payment-cancelled",
      affectedRole: "client",
      affectedTable: "refunds",
      affectedRoute: "/api/payments/[paymentId]/refund",
      severity: "critical",
      confidence: "high",
      createdAt: "2026-06-20T12:00:00.000Z",
      recommendedAction: "Use canonical refund route after approval.",
      canRepair: false,
      repairType: null,
      codexRequired: true,
      targetType: "payment",
      targetId: "payment-cancelled",
      headline: "Cancelled appointment has captured payment without refund evidence.",
      evidence: [
        "payment.status = captured",
        "appointment.status=cancelled",
        "refunds lookup by payment_id returned 0 resolved rows",
        "payout_executions target count=0"
      ],
      validationChecklist: ["refund/reversal evidence", "no payout release"],
      analysis: {
        likelyRootCause: "No refund evidence exists.",
        confidence: 91,
        affectedLayer: "refund resolution",
        failedInvariant: "Cancelled captured payments require refund evidence.",
        supportingEvidence: ["paymentId=payment-cancelled"],
        ruledOut: ["payout released"],
        safeRepairAvailable: false,
        codexRequired: true,
        nextBestAction: "Use controlled refund resolution."
      },
      sqlSnippets: []
    }], "2026-06-20T12:00:00.000Z");
    const financeLane = foundation.departmentLanes.find((lane) => lane.id === "finance");
    const refundCard = financeLane?.cards.find((card) => card.id === "finance-refund-resolution");

    expect(financeLane?.status).toBe("Failed");
    expect(refundCard).toMatchObject({ status: "Failed" });
    expect(refundCard?.evidence.join("\n")).toContain("refunds lookup by payment_id returned 0 resolved rows");
  });

  it("documents repair audit coverage without claiming it is implemented", () => {
    const evidence = getAuditCoveragePlanEvidence();

    expect(AUDIT_COVERAGE_PLAN).toHaveLength(4);
    expect(evidence.join("\n")).toContain("Repair approvals");
    expect(evidence.join("\n")).toContain("Repair executions");
    expect(evidence.join("\n")).toContain("Repair verification");
    expect(evidence.join("\n")).toContain("Score updates");
  });
  it("keeps missing validator data as Needs Review instead of Pass", () => {
    const validators = validateCoreLoopState();

    expect(validators.every((validator) => validator.status === "Needs Review")).toBe(true);
  });

  it("returns Pass for a healthy Culture-to-booking fixture", () => {
    const validators = validateCoreLoopState({
      cultureBooking: {
        bookingCtaUrlHasAttribution: true,
        bookingFormAcceptsAttribution: true,
        appointmentCreatedThroughBooking: true,
        appointmentAppearsOnBarberCalendar: true,
        regressionTestExists: true
      }
    });

    expect(validators.find((validator) => validator.id === "culture-to-booking-loop")).toMatchObject({
      status: "Pass"
    });
  });

  it("returns Failed when a created appointment is missing from the barber calendar", () => {
    const validators = validateCoreLoopState({
      cultureBooking: {
        bookingCtaUrlHasAttribution: true,
        bookingFormAcceptsAttribution: true,
        appointmentCreatedThroughBooking: true,
        appointmentAppearsOnBarberCalendar: false,
        regressionTestExists: true
      }
    });

    expect(validators.find((validator) => validator.id === "culture-to-booking-loop")).toMatchObject({
      status: "Failed",
      summary: "appointment appears on barber calendar failed."
    });
  });

  it("returns Failed when an accepted relationship is missing from owner Home", () => {
    const validators = validateCoreLoopState({
      shopRelationship: {
        ownerInviteCanExist: true,
        barberCanAccept: true,
        activeRelationshipAppearsInOwnerHome: false,
        pendingInvitesExcludedFromActiveCount: true,
        acceptedBarberAppearsInScoreboard: false,
        profileRoleRemainsBarberUser: true
      }
    });

    expect(validators.find((validator) => validator.id === "shop-relationship-loop")).toMatchObject({
      status: "Failed"
    });
  });

  it("records that pending invites should not count as active relationships", () => {
    const validator = validateCoreLoopState({
      shopRelationship: {
        ownerInviteCanExist: true,
        barberCanAccept: true,
        activeRelationshipAppearsInOwnerHome: true,
        pendingInvitesExcludedFromActiveCount: true,
        acceptedBarberAppearsInScoreboard: true,
        profileRoleRemainsBarberUser: true
      }
    }).find((item) => item.id === "shop-relationship-loop");

    expect(validator).toMatchObject({ status: "Pass" });
    expect(validator?.evidence.join("\n")).toContain("Pending invites are excluded from active count.");
  });

  it("returns Failed when payment routing is missing", () => {
    const validators = validateCoreLoopState({
      paymentRouting: {
        appointmentExists: true,
        paymentExists: true,
        statusHistoryExists: true,
        routingExistsOrClearFailure: false,
        noPayoutBeforeCompletion: true
      }
    });

    expect(validators.find((validator) => validator.id === "payment-routing-loop")).toMatchObject({
      status: "Failed"
    });
  });

  it("classifies known failures into requested incident types", () => {
    expect(classifyArchitectIncident("completed_but_routing_missing")).toMatchObject({
      type: "payment_routing_missing",
      affectedDepartment: "Finance"
    });
    expect(classifyArchitectIncident("owner_active_barber_sync_failed")).toMatchObject({
      type: "owner_active_barber_sync_failed",
      affectedDepartment: "Operations"
    });
    expect(classifyArchitectIncident("unsafe_repair_requested")).toMatchObject({
      type: "unsafe_repair_requested",
      safeRepairAvailable: false
    });
  });

  it("renders Source Vault as registered without claiming ingestion", () => {
    expect(SOURCE_VAULT_REGISTRY).toContainEqual(expect.objectContaining({
      sourceName: "Architect Super Master Plan",
      ingestionStatus: "registered, not ingested"
    }));
    expect(SOURCE_VAULT_REGISTRY).toContainEqual(expect.objectContaining({
      sourceName: "Architect Officer Cleanup",
      ingestionStatus: "registered, not ingested"
    }));
    expect(SOURCE_VAULT_REGISTRY.some((source) => source.ingestionStatus === "ingested")).toBe(false);
  });

  it("blocks unsafe actions in the Action Registry", () => {
    const unsafeActions = ACTION_REGISTRY.filter((action) => action.riskClass === "Unsafe / blocked");

    expect(unsafeActions.length).toBeGreaterThan(0);
    expect(unsafeActions.every((action) => action.allowed === false)).toBe(true);
    expect(unsafeActions.map((action) => action.label)).toEqual(expect.arrayContaining([
      "Refund",
      "Payout release",
      "Mutate role",
      "Accept shop relationship on behalf of barber"
    ]));
  });

  it("keeps Hive AI agents read-only or draft-only in v1", () => {
    expect(HIVE_AGENT_REGISTRY).toContainEqual(expect.objectContaining({
      name: "Architect Prime",
      agentClass: "Architect Prime",
      autonomyLevel: "Level 0 Read-only"
    }));
    expect(HIVE_AGENT_REGISTRY.filter((agent) => agent.name.toLowerCase().includes("payment") || agent.name.toLowerCase().includes("revenue")).every((agent) =>
      ["Level 0 Read-only", "Level 1 Draft mode"].includes(agent.autonomyLevel)
    )).toBe(true);
  });

  it("registers Officer Assistants as evidence-led non-breaking operators", () => {
    const officers = getOfficerAssistants();

    expect(officers).toHaveLength(OFFICER_ASSISTANT_DEPARTMENTS.length);
    expect(officers.map((officer) => officer.department)).toEqual(OFFICER_ASSISTANT_DEPARTMENTS);
    expect(officers.every((officer) => officer.agentClass === "Officer Assistant")).toBe(true);
    expect(officers.every((officer) => officer.autonomyLevel === "Level 1 Draft mode")).toBe(true);
    expect(officers.every((officer) => officer.actionAccess.includes("Read-only evidence review"))).toBe(true);
    expect(officers.every((officer) => officer.mutationBoundary === "No app, money, user, team, schema, deployment, or issue-status mutation.")).toBe(true);
    expect(officers.every((officer) => officer.passRule === "Can only report Pass when source cards already report Pass with connected evidence.")).toBe(true);
    expect(officers.every((officer) => officer.currentStatus === "Needs Review")).toBe(true);
  });

  it("summarizes Officer Cleanup evidence without fake Pass claims", () => {
    expect(getOfficerCleanupEvidence()).toEqual(expect.arrayContaining([
      expect.stringContaining("Officer Assistant(s) registered"),
      "All Officer Assistants are Level 1 Draft mode with read-only evidence access.",
      "Officer Assistants do not mutate money, payouts, refunds, routing, roles, team relationships, schema, deployments, or issue status.",
      "Missing officer evidence stays Needs Review / Not connected.",
      "Prompt generation or officer review never marks an issue Pass by itself."
    ]));
  });
});
