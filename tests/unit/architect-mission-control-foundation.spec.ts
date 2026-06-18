import { describe, expect, it } from "vitest";
import {
  ACTION_REGISTRY,
  HIVE_AGENT_REGISTRY,
  MISSION_CONTROL_LANES,
  OFFICER_ASSISTANT_DEPARTMENTS,
  SOURCE_VAULT_REGISTRY,
  buildMissionControlFoundation,
  classifyArchitectIncident,
  getOfficerAssistants,
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
