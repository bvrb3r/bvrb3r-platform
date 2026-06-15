import { describe, expect, it } from "vitest";
import {
  ACTION_REGISTRY,
  HIVE_AGENT_REGISTRY,
  MISSION_CONTROL_LANES,
  SOURCE_VAULT_REGISTRY,
  buildMissionControlFoundation,
  classifyArchitectIncident,
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
      autonomyLevel: "Level 0 Read-only"
    }));
    expect(HIVE_AGENT_REGISTRY.filter((agent) => agent.name.toLowerCase().includes("payment") || agent.name.toLowerCase().includes("revenue")).every((agent) =>
      ["Level 0 Read-only", "Level 1 Draft mode"].includes(agent.autonomyLevel)
    )).toBe(true);
  });
});
