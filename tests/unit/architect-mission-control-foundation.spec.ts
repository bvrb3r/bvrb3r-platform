import { describe, expect, it } from "vitest";
import {
  ACTION_REGISTRY,
  AUDIT_COVERAGE_PLAN,
  HIVE_AGENT_REGISTRY,
  MISSION_CONTROL_LANES,
  OFFICER_ASSISTANT_DEPARTMENTS,
  SOURCE_VAULT_CATEGORIES,
  SOURCE_VAULT_REGISTRY,
  SOURCE_VAULT_V1_METADATA_CLOSEOUT_KEYS,
  buildSourceVaultInventory,
  buildMissionControlFoundation,
  buildDeploymentRegressionEvidence,
  buildAuditSpineModel,
  buildAuditWriteSpineEvidenceCard,
  buildMissionReadinessBreakdown,
  buildV1RuntimeProofMatrix,
  buildRlsSecurityInventory,
  buildRoleTruthInventory,
  classifyArchitectIncident,
  getOfficerAssistants,
  getAuditCoveragePlanEvidence,
  getOfficerCleanupEvidence,
  validateCoreLoopState
} from "@/lib/architect/mission-control/foundation";

type RlsInventoryRows = NonNullable<NonNullable<Parameters<typeof buildRlsSecurityInventory>[0]>["rows"]>;
type RoleTruthRows = NonNullable<NonNullable<Parameters<typeof buildRoleTruthInventory>[0]>["rows"]>;
type SourceVaultEntryFixture = ReturnType<typeof buildSourceVaultInventory>["entries"][number];

function connectedSourceVaultFixture(overrides: Partial<SourceVaultEntryFixture> = {}): SourceVaultEntryFixture {
  const base = buildSourceVaultInventory().entries.find((source) => source.id === "v1-master-build-template")!;

  return {
    ...base,
    id: "connected-v1-private-source",
    sourceName: "Connected V1 Private Source",
    category: "Build doctrine",
    ingestionStatus: "ingested_metadata_only",
    contentHash: "sha256:connected-v1-private-source-fingerprint",
    versionDate: "2026-06-23T00:00:00.000Z",
    scope: "v1_required",
    critical: true,
    rawContentCommitted: false,
    summary: "Safe metadata proof only. Private document contents are not exposed.",
    linkedArchitectCardIds: ["source-vault-status", "technology-source-vault-readiness"],
    ...overrides
  };
}

function sourceVaultWithCloseoutKeysMissing(): SourceVaultEntryFixture[] {
  return buildSourceVaultInventory().entries.map((source) => {
    if (!SOURCE_VAULT_V1_METADATA_CLOSEOUT_KEYS.includes(source.id as typeof SOURCE_VAULT_V1_METADATA_CLOSEOUT_KEYS[number])) {
      return source;
    }

    return {
      ...source,
      versionDate: "Missing",
      ingestionStatus: "missing",
      contentHash: `sha256:missing-${source.id}`,
      summary: `${source.sourceName} metadata is intentionally missing for this incomplete fixture.`
    };
  });
}

function cardById(foundation: ReturnType<typeof buildMissionControlFoundation>, id: string) {
  return [
    ...foundation.ceoCommandCenter,
    ...foundation.departmentLanes.flatMap((lane) => lane.cards),
    ...foundation.coreLoopValidators
  ].find((card) => card.id === id);
}

function rlsInventoryRow(overrides: Partial<RlsInventoryRows[number]> = {}): RlsInventoryRows[number] {
  return {
    id: "rls-test-table",
    schemaName: "public",
    tableName: "test_table",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "V1 test data.",
    userRoleExposure: ["client_user"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "RLS enabled with role-scoped policies.",
    suggestedPolicyPlanSummary: "Verify RLS before marking Pass.",
    nextRepairLane: "security",
    evidenceSource: "test evidence",
    ...overrides
  };
}

function roleTruthRow(overrides: Partial<RoleTruthRows[number]> = {}): RoleTruthRows[number] {
  return {
    id: "role-test",
    currentRoleValue: "test_role",
    normalizedDisplayLabel: "Test role",
    canonicalClassification: "unknown",
    expectedCanonicalDestination: "Needs inspection",
    currentUsageLocations: ["test fixture"],
    affectedRoleOrLane: "Security",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "high",
    securityRisk: "critical",
    suggestedMigrationPath: "Inspect before migration.",
    rollbackNote: "No mutation in tests.",
    nextRepairLane: "security",
    evidenceSource: "test evidence",
    accountRoleMisuse: false,
    ...overrides
  };
}

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

  it("keeps connected role and RLS blockers Failed instead of fake Pass", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z");
    const securityLane = foundation.departmentLanes.find((lane) => lane.id === "security");

    expect(foundation.ceoCommandCenter.find((card) => card.id === "ceo-role-drift-health")).toMatchObject({
      status: "Failed",
      metricValue: "8 critical drift"
    });
    expect(foundation.ceoCommandCenter.find((card) => card.id === "ceo-rls-disabled-evidence")).toMatchObject({
      status: "Failed",
      metricValue: "28 disabled"
    });
    expect(securityLane?.cards.find((card) => card.id === "security-role-drift")).toMatchObject({
      status: "Failed"
    });
    expect(securityLane?.cards.find((card) => card.id === "security-role-truth-inventory")).toMatchObject({
      status: "Failed"
    });
    expect(securityLane?.cards.find((card) => card.id === "security-rls-disabled")).toMatchObject({
      status: "Failed"
    });
    expect(securityLane?.cards.find((card) => card.id === "security-rls-inventory")).toMatchObject({
      status: "Failed"
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

  it("builds an RLS Security Inventory with disabled V1 critical tables as Failed", () => {
    const inventory = buildRlsSecurityInventory({
      productionDisabledPublicTableCount: 1,
      rows: [
        rlsInventoryRow({
          id: "rls-payments",
          tableName: "payments",
          rlsEnabled: "no",
          policyCount: 0,
          policyNames: [],
          currentRiskLevel: "critical"
        })
      ],
      evidenceSource: "test production inventory"
    });
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z", [], undefined, inventory);
    const securityLane = foundation.departmentLanes.find((lane) => lane.id === "security");
    const securityLoop = foundation.v1RuntimeProofMatrix?.groups.find((group) => group.id === "security_loop");

    expect(inventory.status).toBe("Failed");
    expect(inventory.summary.rlsDisabledCount).toBe(1);
    expect(inventory.v1CriticalDisabledTables[0]).toMatchObject({ tableName: "payments", currentStatus: "Failed" });
    expect(securityLane?.cards.find((card) => card.id === "security-rls-inventory")).toMatchObject({
      status: "Failed",
      metricValue: "1 inventoried"
    });
    expect(securityLane?.cards.find((card) => card.id === "security-rls-disabled")).toMatchObject({ status: "Failed" });
    expect(securityLoop?.status).toBe("Failed");
    expect(foundation.readinessBreakdown?.overallStatus).toBe("Failed");
  });

  it("keeps unknown RLS posture as Needs Review instead of fake Pass", () => {
    const inventory = buildRlsSecurityInventory({
      productionDisabledPublicTableCount: 0,
      rows: [
        rlsInventoryRow({
          id: "rls-appointments",
          tableName: "appointments",
          rlsEnabled: "unknown",
          policyCount: null,
          policyNames: []
        })
      ]
    });

    expect(inventory.status).toBe("Needs Review");
    expect(inventory.unknownPostureTables[0]).toMatchObject({
      tableName: "appointments",
      currentStatus: "Needs Review"
    });
    expect(inventory.rows[0].staleOrMissingEvidenceState).toEqual(expect.arrayContaining([
      "Production RLS enabled state is not connected.",
      "Production policy count is not connected.",
      "Production policy names are not connected."
    ]));
  });

  it("does not mark enabled RLS Pass without connected policy evidence", () => {
    const inventory = buildRlsSecurityInventory({
      productionDisabledPublicTableCount: 0,
      rows: [
        rlsInventoryRow({
          id: "rls-profiles",
          tableName: "profiles",
          rlsEnabled: "yes",
          policyCount: 0,
          policyNames: []
        })
      ]
    });

    expect(inventory.status).toBe("Needs Review");
    expect(inventory.rows[0]).toMatchObject({
      tableName: "profiles",
      currentStatus: "Needs Review",
      migrationRequired: "unknown"
    });
  });

  it("lets connected RLS and policy evidence pass when no disabled production evidence exists", () => {
    const inventory = buildRlsSecurityInventory({
      productionDisabledPublicTableCount: 0,
      rows: [
        rlsInventoryRow({
          id: "rls-culture-posts",
          tableName: "culture_posts",
          rlsEnabled: "yes",
          policyCount: 2,
          policyNames: ["culture_posts_public_read", "culture_posts_author_write"],
          currentRiskLevel: "high"
        })
      ]
    });
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z", [], undefined, inventory);
    const securityLane = foundation.departmentLanes.find((lane) => lane.id === "security");

    expect(inventory.status).toBe("Pass");
    expect(inventory.rows[0]).toMatchObject({
      tableName: "culture_posts",
      currentStatus: "Pass",
      migrationRequired: "no"
    });
    expect(securityLane?.cards.find((card) => card.id === "security-rls-inventory")).toMatchObject({ status: "Pass" });
    expect(securityLane?.cards.find((card) => card.id === "security-rls-disabled")).toMatchObject({ status: "Pass" });
  });

  it("parks future RLS rows without counting them as V1 release blockers", () => {
    const inventory = buildRlsSecurityInventory({
      productionDisabledPublicTableCount: 0,
      rows: [
        rlsInventoryRow({
          id: "rls-campaign-events",
          tableName: "campaign_events",
          rlsEnabled: "unknown",
          v1Required: false,
          futureParked: true,
          currentRiskLevel: "unknown",
          nextRepairLane: "marketing"
        })
      ]
    });

    expect(inventory.status).toBe("Parked");
    expect(inventory.summary.parkedFutureCount).toBe(1);
    expect(inventory.parkedFutureTables[0]).toMatchObject({
      tableName: "campaign_events",
      currentStatus: "Parked"
    });
    expect(inventory.summary.v1CriticalTableCount).toBe(0);
  });

  it("classifies noncanonical primary account role drift as Failed", () => {
    const inventory = buildRoleTruthInventory({
      rows: [
        roleTruthRow({
          id: "role-owner",
          currentRoleValue: "owner",
          normalizedDisplayLabel: "Owner permission",
          canonicalClassification: "staff_permission",
          expectedCanonicalDestination: "shop_owner_user account role plus shop/team owner permission",
          accountRoleMisuse: true,
          suggestedMigrationPath: "Move owner out of profiles.role and into shop/team permission truth."
        })
      ]
    });
    const foundation = buildMissionControlFoundation([], "2026-06-14T12:00:00.000Z", [], undefined, undefined, inventory);

    expect(inventory.status).toBe("Failed");
    expect(inventory.summary.v1CriticalDriftCount).toBe(1);
    expect(inventory.summary.accountRoleMisuseCount).toBe(1);
    expect(inventory.rows[0]).toMatchObject({
      currentStatus: "Failed",
      migrationRequired: "yes"
    });
    expect(foundation.ceoCommandCenter.find((card) => card.id === "ceo-role-drift-health")).toMatchObject({
      status: "Failed",
      metricValue: "1 critical drift"
    });
    expect(foundation.departmentLanes.find((lane) => lane.id === "security")?.cards.find((card) => card.id === "security-role-truth-inventory")).toMatchObject({ status: "Failed" });
    expect(foundation.departmentLanes.find((lane) => lane.id === "compliance")?.cards.find((card) => card.id === "compliance-role-truth-inventory")).toMatchObject({ status: "Failed" });
  });

  it("classifies business relationship values without fake account-role Pass", () => {
    const inventory = buildRoleTruthInventory({
      rows: [
        roleTruthRow({
          id: "role-commission",
          currentRoleValue: "commission_barber",
          normalizedDisplayLabel: "Commission barber relationship",
          canonicalClassification: "business_relationship",
          expectedCanonicalDestination: "barber_user account role plus commission relationship",
          accountRoleMisuse: true,
          suggestedMigrationPath: "Move account role to barber_user and preserve commission relationship terms."
        })
      ]
    });

    expect(inventory.status).toBe("Failed");
    expect(inventory.businessRelationshipRoles[0]).toMatchObject({
      currentRoleValue: "commission_barber",
      canonicalClassification: "business_relationship",
      currentStatus: "Failed"
    });
    expect(inventory.rows[0].failureMeaning).toContain("account-role truth");
  });

  it("classifies staff permission values without making them account roles", () => {
    const inventory = buildRoleTruthInventory({
      rows: [
        roleTruthRow({
          id: "role-front-desk",
          currentRoleValue: "front_desk",
          normalizedDisplayLabel: "Front desk permission",
          canonicalClassification: "staff_permission",
          expectedCanonicalDestination: "staff/team permission scoped by shop/location",
          accountRoleMisuse: true,
          suggestedMigrationPath: "Keep front_desk as scoped staff permission only."
        })
      ]
    });

    expect(inventory.status).toBe("Failed");
    expect(inventory.staffPermissionRoles[0]).toMatchObject({
      currentRoleValue: "front_desk",
      canonicalClassification: "staff_permission",
      currentStatus: "Failed"
    });
    expect(inventory.rows[0].staleOrMissingEvidenceState).toEqual(expect.arrayContaining([
      "Staff permission proof must be connected before this can be treated as clean."
    ]));
  });

  it("keeps unknown role evidence as Needs Review", () => {
    const inventory = buildRoleTruthInventory({
      rows: [
        roleTruthRow({
          id: "role-unknown-production",
          currentRoleValue: "unknown",
          normalizedDisplayLabel: "Unknown role",
          canonicalClassification: "unknown",
          expectedCanonicalDestination: "Needs production inspection",
          accountRoleMisuse: false
        })
      ]
    });

    expect(inventory.status).toBe("Needs Review");
    expect(inventory.summary.unknownCount).toBe(1);
    expect(inventory.unknownRoles[0]).toMatchObject({
      currentStatus: "Needs Review",
      migrationRequired: "unknown"
    });
  });

  it("allows canonical roles to Pass when only canonical role evidence is connected", () => {
    const inventory = buildRoleTruthInventory({
      rows: [
        roleTruthRow({
          id: "role-client-user",
          currentRoleValue: "client_user",
          normalizedDisplayLabel: "Client user",
          canonicalClassification: "public_account_role",
          expectedCanonicalDestination: "profiles.role = client_user",
          accountRoleMisuse: false,
          userImpactRisk: "low",
          securityRisk: "low",
          suggestedMigrationPath: "Keep canonical."
        }),
        roleTruthRow({
          id: "role-platform-admin",
          currentRoleValue: "platform_admin",
          normalizedDisplayLabel: "Platform admin",
          canonicalClassification: "internal_platform_role",
          expectedCanonicalDestination: "Internal Architect account only",
          accountRoleMisuse: false,
          userImpactRisk: "medium",
          securityRisk: "critical",
          suggestedMigrationPath: "Keep gated."
        })
      ]
    });

    expect(inventory.status).toBe("Pass");
    expect(inventory.summary.canonicalAccountRoleCount).toBe(1);
    expect(inventory.summary.platformAdminRoleCount).toBe(1);
    expect(inventory.summary.v1CriticalDriftCount).toBe(0);
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

  it("lets routing evidence pass without hiding separate Finance blockers", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-21T12:00:00.000Z", [{
      id: "ceo-payment-routing-health",
      label: "Payment Routing Health",
      department: "CEO",
      workflow: "Finance",
      status: "Pass",
      metricValue: "No repair required",
      summary: "Routing repair not required. Current production evidence has safe routing/refund posture for the payment-routing repair target classes.",
      evidence: [
        "completedCapturedMissingRouting=0",
        "cancelledCapturedMissingRouting=0",
        "targetPayoutExecutionCount=0",
        "proposedInsertCount=0",
        "proposedUpdateCount=0",
        "repairNeeded=no"
      ]
    }, {
      id: "ceo-audit-log-evidence",
      label: "Audit Evidence",
      department: "CEO",
      workflow: "Security",
      status: "Failed",
      metricValue: "0 row(s)",
      summary: "audit_logs returned 0 row(s).",
      evidence: ["audit_logs returned 0 row(s)."]
    }]);
    const financeLane = foundation.departmentLanes.find((lane) => lane.id === "finance");

    expect(financeLane?.cards.find((card) => card.id === "finance-routing")).toMatchObject({
      status: "Pass",
      summary: "Routing repair not required. Current production evidence has safe routing/refund posture for the payment-routing repair target classes."
    });
    expect(financeLane?.cards.find((card) => card.id === "finance-repair-audit-coverage")).toMatchObject({ status: "Failed" });
    expect(financeLane?.status).toBe("Failed");
    expect(foundation.readinessBreakdown?.overallStatus).toBe("Failed");
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

  it("keeps missing deployment evidence from faking Deployment loop Pass", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence();
    const rlsInventory = buildRlsSecurityInventory({
      productionDisabledPublicTableCount: 0,
      rows: [
        rlsInventoryRow({
          id: "rls-technology-clean",
          tableName: "deployment_security_table",
          rlsEnabled: "yes",
          policyCount: 1,
          policyNames: ["deployment_security_table_read"],
          currentRiskLevel: "high"
        })
      ]
    });
    const foundation = buildMissionControlFoundation([], "2026-06-21T12:00:00.000Z", [], deploymentEvidence, rlsInventory);
    const deploymentGroup = foundation.v1RuntimeProofMatrix?.groups.find((group) => group.id === "deployment_loop");
    const commitProof = deploymentGroup?.rows.find((row) => row.id === "technology-current-commit");

    expect(deploymentEvidence.status).toBe("Not Connected");
    expect(deploymentEvidence.staleOrMissingState).toEqual(expect.arrayContaining([
      "Runtime production commit evidence is not connected.",
      "Vercel deployment ID evidence is not connected.",
      "Build validation evidence is missing or not passing.",
      "Test validation evidence is missing or not passing."
    ]));
    expect(deploymentGroup?.status).toBe("Needs Review");
    expect(commitProof).toMatchObject({
      status: "Needs Review",
      proofConnected: false,
      staleOrMissingProof: true
    });
  });

  it("keeps runtime commit evidence Needs Review when expected main commit is missing", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence({
      runtimeCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      deploymentId: "dpl_ready",
      deploymentState: "READY"
    });
    const foundation = buildMissionControlFoundation([], "2026-06-21T12:00:00.000Z", [], deploymentEvidence);
    const commitProof = foundation.v1RuntimeProofMatrix?.rows.find((row) => row.id === "technology-current-commit");

    expect(deploymentEvidence.commitEvidenceStatus).toBe("Needs Review");
    expect(commitProof).toMatchObject({
      status: "Needs Review",
      proofConnected: false
    });
    expect(commitProof?.evidenceRows.join("\n")).toContain("Expected main commit evidence is not connected.");
  });

  it("forces Failed when production runtime commit differs from expected main commit", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence({
      expectedMainCommit: "expected-main",
      runtimeCommit: "different-runtime",
      deploymentId: "dpl_ready",
      deploymentState: "READY",
      deploymentEnvironment: "production",
      deploymentTarget: "production",
      buildEvidenceStatus: "pass",
      lintEvidenceStatus: "pass",
      typecheckEvidenceStatus: "pass",
      testEvidenceStatus: "pass"
    });
    const foundation = buildMissionControlFoundation([], "2026-06-21T12:00:00.000Z", [], deploymentEvidence);
    const deploymentGroup = foundation.v1RuntimeProofMatrix?.groups.find((group) => group.id === "deployment_loop");
    const commitProof = deploymentGroup?.rows.find((row) => row.id === "technology-current-commit");

    expect(deploymentEvidence.status).toBe("Failed");
    expect(deploymentEvidence.failingState.join("\n")).toContain("does not match expected main commit");
    expect(commitProof).toMatchObject({ status: "Failed", proofConnected: true });
    expect(deploymentGroup?.status).toBe("Failed");
    expect(foundation.readinessBreakdown?.overallStatus).toBe("Failed");
  });

  it("does not fail preview deployment when branch commit differs from main but matches validation proof", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence({
      expectedMainCommit: "3bffe71b73708d1a3e2df30e86b2cd66d42d850",
      runtimeCommit: "e0ca765f3bb6eb0eec90c4280e952440805cc735",
      deploymentId: "dpl_preview_ready",
      deploymentState: "READY",
      deploymentEnvironment: "preview",
      deploymentTarget: "preview",
      deploymentUrl: "https://bvrb3r-platform-a5hnccj84-bvrb3rs-projects.vercel.app",
      buildEvidenceStatus: "pass",
      lintEvidenceStatus: "pass",
      typecheckEvidenceStatus: "pass",
      testEvidenceStatus: "pass",
      validationCommand: "npm run verify:deployment",
      validationSource: "package.json prebuild -> verify:deployment",
      validationCommit: "e0ca765f3bb6eb0eec90c4280e952440805cc735",
      validationTimestamp: "2026-06-22T12:00:00.000Z",
      regressionSuiteName: "architect-mission-control-targeted-regression",
      regressionTestCount: 114,
      evidenceFreshness: "fresh",
      proofConnected: true
    });

    expect(deploymentEvidence.productionCommitMatchesMain).toBe(false);
    expect(deploymentEvidence.commitEvidenceStatus).toBe("Pass");
    expect(deploymentEvidence.regressionEvidenceStatus).toBe("Pass");
    expect(deploymentEvidence.status).toBe("Pass");
    expect(deploymentEvidence.failingState.join("\n")).not.toContain("expected main commit");
  });

  it("keeps preview deployment Needs Review when validation proof is missing instead of failing main mismatch", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence({
      expectedMainCommit: "3bffe71b73708d1a3e2df30e86b2cd66d42d850",
      runtimeCommit: "e0ca765f3bb6eb0eec90c4280e952440805cc735",
      deploymentId: "dpl_preview_ready",
      deploymentState: "READY",
      deploymentEnvironment: "preview",
      deploymentTarget: "preview",
      deploymentUrl: "https://bvrb3r-platform-a5hnccj84-bvrb3rs-projects.vercel.app"
    });

    expect(deploymentEvidence.productionCommitMatchesMain).toBe(false);
    expect(deploymentEvidence.commitEvidenceStatus).toBe("Needs Review");
    expect(deploymentEvidence.status).toBe("Needs Review");
    expect(deploymentEvidence.failingState.join("\n")).not.toContain("expected main commit");
    expect(deploymentEvidence.staleOrMissingState).toEqual(expect.arrayContaining([
      "Validation proof commit is not connected.",
      "Validation proof freshness is not connected."
    ]));
  });
  it("lets READY deployment plus matching commit improve deployment proof while missing validation remains Needs Review", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence({
      expectedMainCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      runtimeCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      deploymentId: "dpl_ready",
      deploymentState: "READY",
      deploymentEnvironment: "production",
      deploymentTarget: "production",
      deploymentUrl: "https://www.bvrb3r.app"
    });
    const foundation = buildMissionControlFoundation([], "2026-06-21T12:00:00.000Z", [], deploymentEvidence);
    const commitProof = foundation.v1RuntimeProofMatrix?.rows.find((row) => row.id === "technology-current-commit");
    const deployProof = foundation.v1RuntimeProofMatrix?.rows.find((row) => row.id === "technology-current-deploy");
    const regressionProof = foundation.v1RuntimeProofMatrix?.rows.find((row) => row.id === "technology-build-test-proof");

    expect(deploymentEvidence.commitEvidenceStatus).toBe("Pass");
    expect(deploymentEvidence.deploymentEvidenceStatus).toBe("Pass");
    expect(deploymentEvidence.regressionEvidenceStatus).toBe("Not Connected");
    expect(deploymentEvidence.status).toBe("Needs Review");
    expect(commitProof).toMatchObject({ status: "Pass", proofConnected: true });
    expect(deployProof).toMatchObject({ status: "Pass", proofConnected: true });
    expect(regressionProof).toMatchObject({ status: "Needs Review", proofConnected: false });
  });

  it("forces Failed when production deployment status is not READY", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence({
      expectedMainCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      runtimeCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      deploymentId: "dpl_error",
      deploymentState: "ERROR",
      deploymentEnvironment: "production",
      deploymentTarget: "production",
      deploymentUrl: "https://www.bvrb3r.app",
      buildEvidenceStatus: "pass",
      lintEvidenceStatus: "pass",
      typecheckEvidenceStatus: "pass",
      testEvidenceStatus: "pass",
      validationCommand: "npm run verify:deployment",
      validationSource: "package.json prebuild -> verify:deployment",
      validationCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      validationTimestamp: "2026-06-21T12:00:00.000Z"
    });

    expect(deploymentEvidence.deploymentEvidenceStatus).toBe("Failed");
    expect(deploymentEvidence.status).toBe("Failed");
    expect(deploymentEvidence.failingState).toContain("Deployment status is failed/error/canceled: ERROR.");
  });

  it("forces Failed from explicit build or test validation failure", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence({
      expectedMainCommit: "c8c2b1f",
      runtimeCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      deploymentId: "dpl_ready",
      deploymentState: "READY",
      buildEvidenceStatus: "failed",
      lintEvidenceStatus: "pass",
      typecheckEvidenceStatus: "pass",
      testEvidenceStatus: "pass",
      validationCommand: "npm run verify:deployment",
      validationSource: "package.json prebuild -> verify:deployment",
      validationCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      validationTimestamp: "2026-06-21T12:00:00.000Z",
      regressionSuiteName: "architect-mission-control-targeted-regression",
      regressionTestCount: 113,
      lastValidatedAt: "2026-06-21T12:00:00.000Z"
    });
    const foundation = buildMissionControlFoundation([], "2026-06-21T12:00:00.000Z", [], deploymentEvidence);
    const regressionProof = foundation.v1RuntimeProofMatrix?.rows.find((row) => row.id === "technology-build-test-proof");

    expect(deploymentEvidence.status).toBe("Failed");
    expect(deploymentEvidence.failingState).toContain("Build validation evidence is Failed.");
    expect(regressionProof).toMatchObject({ status: "Failed", proofConnected: true });
  });

  it("keeps validation Needs Review when pass labels are not tied to the deployed commit", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence({
      expectedMainCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      runtimeCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      deploymentId: "dpl_ready",
      deploymentState: "READY",
      deploymentEnvironment: "production",
      deploymentTarget: "production",
      deploymentUrl: "https://www.bvrb3r.app",
      buildEvidenceStatus: "pass",
      lintEvidenceStatus: "pass",
      typecheckEvidenceStatus: "pass",
      testEvidenceStatus: "pass",
      validationTimestamp: "2026-06-21T12:00:00.000Z"
    });

    expect(deploymentEvidence.regressionEvidenceStatus).toBe("Needs Review");
    expect(deploymentEvidence.status).toBe("Needs Review");
    expect(deploymentEvidence.proofConnected).toBe(false);
    expect(deploymentEvidence.staleOrMissingState).toEqual(expect.arrayContaining([
      "Validation command evidence is not connected.",
      "Validation proof source is not connected.",
      "Validation proof commit is not connected."
    ]));
  });

  it("fails deployment regression proof when validation belongs to a different commit", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence({
      expectedMainCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      runtimeCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      deploymentId: "dpl_ready",
      deploymentState: "READY",
      deploymentEnvironment: "production",
      deploymentTarget: "production",
      deploymentUrl: "https://www.bvrb3r.app",
      buildEvidenceStatus: "pass",
      lintEvidenceStatus: "pass",
      typecheckEvidenceStatus: "pass",
      testEvidenceStatus: "pass",
      validationCommand: "npm run verify:deployment",
      validationSource: "package.json prebuild -> verify:deployment",
      validationCommit: "different-validation-commit",
      validationTimestamp: "2026-06-21T12:00:00.000Z",
      evidenceFreshness: "stale"
    });

    expect(deploymentEvidence.regressionEvidenceStatus).toBe("Failed");
    expect(deploymentEvidence.status).toBe("Failed");
    expect(deploymentEvidence.failingState.join("\n")).toContain("Validation proof commit different-validation-commit does not match runtime commit");
    expect(deploymentEvidence.failingState.join("\n")).toContain("Validation proof is stale");
  });

  it("passes deployment regression evidence only when commit, deploy status, and all validation proof pass", () => {
    const deploymentEvidence = buildDeploymentRegressionEvidence({
      expectedMainCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      runtimeCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      deploymentId: "dpl_ready",
      deploymentState: "READY",
      deploymentEnvironment: "production",
      deploymentTarget: "production",
      deploymentUrl: "https://www.bvrb3r.app",
      buildEvidenceStatus: "pass",
      lintEvidenceStatus: "pass",
      typecheckEvidenceStatus: "pass",
      testEvidenceStatus: "pass",
      validationCommand: "npm run verify:deployment",
      validationSource: "package.json prebuild -> verify:deployment",
      validationCommit: "c8c2b1f04978bd42970ba16787bdb7965adb099d",
      validationTimestamp: "2026-06-21T12:00:00.000Z",
      regressionSuiteName: "architect-mission-control-targeted-regression",
      regressionTestCount: 113,
      lastValidatedAt: "2026-06-21T12:00:00.000Z"
    });
    const foundation = buildMissionControlFoundation([], "2026-06-21T12:00:00.000Z", [], deploymentEvidence);
    const deploymentCard = foundation.ceoCommandCenter.find((card) => card.id === "ceo-regression-deployment-health");
    const regressionCard = foundation.departmentLanes.find((lane) => lane.id === "technology")?.cards.find((card) => card.id === "technology-build-tests");

    expect(deploymentEvidence.status).toBe("Pass");
    expect(deploymentEvidence.regressionEvidenceStatus).toBe("Pass");
    expect(deploymentEvidence.proofConnected).toBe(true);
    expect(deploymentCard).toMatchObject({ status: "Pass", metricValue: "Pass" });
    expect(regressionCard).toMatchObject({ status: "Pass" });
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

  it("surfaces Finance and Compliance audit write spine proof without fake Pass", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-23T12:00:00.000Z");
    const financeLane = foundation.departmentLanes.find((lane) => lane.id === "finance");
    const complianceLane = foundation.departmentLanes.find((lane) => lane.id === "compliance");
    const financeCard = financeLane?.cards.find((card) => card.id === "finance-audit-write-spine");
    const complianceCard = complianceLane?.cards.find((card) => card.id === "compliance-audit-write-spine");
    const ceoAuditWriteSpineCard = foundation.ceoCommandCenter.find((card) => card.id.includes("audit-write-spine"));

    expect(financeCard).toMatchObject({
      status: "Needs Review",
      scope: "v2_infrastructure",
      blocksCurrentRelease: false
    });
    expect(complianceCard).toMatchObject({
      status: "Needs Review",
      scope: "v2_infrastructure",
      blocksCurrentRelease: false
    });
    expect(financeCard?.evidence.join("\n")).toContain("wouldPersist=false");
    expect(complianceCard?.evidence.join("\n")).toContain("productionMutation=false");
    expect(complianceCard?.evidence.join("\n")).toContain("Runtime persisted audit proof: not connected.");
    expect(ceoAuditWriteSpineCard).toBeUndefined();
  });

  it("keeps helper-only audit write spine evidence below Pass", () => {
    const card = buildAuditWriteSpineEvidenceCard("Finance");

    expect(card.status).toBe("Needs Review");
    expect(card.evidence.join("\n")).toContain("Pass requires connected persisted audit evidence");
    expect(card.evidence.join("\n")).toContain("content_exposed=false");
  });

  it("keeps Audit Spine from Pass when no audit evidence is connected", () => {
    const spine = buildAuditSpineModel();

    expect(spine.status).not.toBe("Pass");
    expect(spine.records.find((record) => record.id === "audit-spine-repair-coverage")).toMatchObject({
      status: "Not Connected"
    });
    expect(spine.summary.scoreImpactCoverageStatus).toBe("Needs Review");
  });

  it("does not let refund evidence alone make Audit Spine Pass", () => {
    const spine = buildAuditSpineModel([
      {
        id: "ceo-refund-count",
        label: "Refund Count",
        department: "CEO",
        workflow: "Finance",
        status: "Pass",
        summary: "Refund count is connected.",
        evidence: ["4 refund row(s) connected."],
        metricValue: "4"
      },
      {
        id: "ceo-total-refunded",
        label: "Total Refunded Amount",
        department: "CEO",
        workflow: "Finance",
        status: "Pass",
        summary: "Total refunded is connected.",
        evidence: ["totalRefunded=$20"],
        metricValue: "$20"
      },
      {
        id: "ceo-active-refund-blockers",
        label: "Active Refund Blockers",
        department: "CEO",
        workflow: "Finance",
        status: "Pass",
        summary: "No active refund blockers.",
        evidence: ["activeRefundTargets=0"],
        metricValue: "0"
      },
      {
        id: "ceo-failed-refund-attempts",
        label: "Failed Refund Attempts",
        department: "CEO",
        workflow: "Finance",
        status: "Pass",
        summary: "No failed refund attempts.",
        evidence: ["payment_refund_failed events=0"],
        metricValue: "0"
      },
      {
        id: "ceo-last-refund-timestamp",
        label: "Last Refund Timestamp",
        department: "CEO",
        workflow: "Finance",
        status: "Pass",
        summary: "Last refund timestamp is connected.",
        evidence: ["lastRefundTimestamp=2026-06-20T02:00:00.000Z"],
        metricValue: "2026-06-20T02:00:00.000Z"
      }
    ], [{
      id: "finance",
      label: "Finance",
      purpose: "Finance evidence.",
      status: "Pass",
      cards: [{
        id: "finance-refund-resolution",
        label: "Cancelled/captured refund resolution",
        department: "Finance",
        workflow: "Refund Resolution",
        status: "Pass",
        summary: "No active cancelled/captured refund targets. Refund history is available in Finance Logs.",
        evidence: ["No active cancelled/captured refund blocker incident is currently detected."]
      }]
    }]);

    const refundRecord = spine.records.find((record) => record.id === "audit-spine-controlled-finance-refunds");
    expect(refundRecord?.stages.find((stage) => stage.stage === "execution")).toMatchObject({ status: "Pass" });
    expect(refundRecord?.stages.find((stage) => stage.stage === "verification")).toMatchObject({ status: "Pass" });
    expect(refundRecord).toMatchObject({ status: "Needs Review" });
    expect(spine.status).not.toBe("Pass");
    expect(spine.summary.scoreImpactCoverageStatus).toBe("Needs Review");
  });

  it("keeps approval plus execution without verification below Pass", () => {
    const spine = buildAuditSpineModel([
      {
        id: "ceo-audit-log-evidence",
        label: "Audit Evidence",
        department: "CEO",
        workflow: "Security",
        status: "Pass",
        summary: "Audit evidence exists.",
        evidence: ["audit_logs returned 1 row(s)."],
        metricValue: "1 row(s)"
      }
    ], [{
      id: "finance",
      label: "Finance",
      purpose: "Finance evidence.",
      status: "Pass",
      cards: [{
        id: "finance-refund-resolution",
        label: "Cancelled/captured refund resolution",
        department: "Finance",
        workflow: "Refund Resolution",
        status: "Pass",
        summary: "Refund execution evidence exists.",
        evidence: ["refund row exists."]
      }]
    }]);

    const refundRecord = spine.records.find((record) => record.id === "audit-spine-controlled-finance-refunds");

    expect(refundRecord?.stages.find((stage) => stage.stage === "approval")).toMatchObject({ status: "Pass" });
    expect(refundRecord?.stages.find((stage) => stage.stage === "execution")).toMatchObject({ status: "Pass" });
    expect(refundRecord?.stages.find((stage) => stage.stage === "verification")).toMatchObject({ status: "Not Connected" });
    expect(refundRecord?.status).toBe("Needs Review");
  });

  it("adds Audit Spine to Audit loop readiness and blocks 100 percent when score impact is missing", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-20T12:00:00.000Z", [{
      id: "ceo-audit-log-evidence",
      label: "Audit Evidence",
      department: "CEO",
      workflow: "Security",
      status: "Failed",
      summary: "audit_logs is connected but empty.",
      evidence: ["audit_logs returned 0 row(s).", "No audit row was inserted."],
      metricValue: "0 row(s)"
    }]);
    const complianceLane = foundation.departmentLanes.find((lane) => lane.id === "compliance");
    const auditGroup = foundation.v1RuntimeProofMatrix?.groups.find((group) => group.id === "audit_loop");

    expect(foundation.auditSpine?.status).toBe("Failed");
    expect(complianceLane?.cards.find((card) => card.id === "audit-spine-coverage")).toMatchObject({
      status: "Failed"
    });
    expect(auditGroup).toMatchObject({ status: "Failed" });
    expect(foundation.readinessBreakdown?.overallStatus).toBe("Failed");
    expect(foundation.readinessBreakdown?.v1ReadinessPercent).toBeLessThan(100);
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

  it("lets connected Marketing and Content proof pass without building new product features", () => {
    const fixture = {
      cultureSocial: {
        publicPostsExist: true,
        authorIdentityHydrates: true,
        commentsRouteExists: true,
        commentPreviewExists: true,
        engagementActionsExist: true,
        bookCtaExistsForBookableBarber: true
      },
      cultureDiscovery: {
        discoverySearchProofExists: true
      },
      cultureModeration: {
        reportsRouteExists: true,
        moderationReviewEvidenceExists: true
      },
      cultureBooking: {
        bookingCtaUrlHasAttribution: true,
        bookingFormAcceptsAttribution: true,
        appointmentCreatedThroughBooking: true,
        appointmentAppearsOnBarberCalendar: true,
        regressionTestExists: true
      }
    };
    const foundation = buildMissionControlFoundation([], "2026-06-23T12:00:00.000Z", [], undefined, undefined, undefined, undefined, fixture);

    expect(cardById(foundation, "marketing-culture-feed")).toMatchObject({ status: "Pass" });
    expect(cardById(foundation, "marketing-discovery")).toMatchObject({ status: "Pass" });
    expect(cardById(foundation, "marketing-attribution")).toMatchObject({ status: "Pass" });
    expect(cardById(foundation, "community-comments")).toMatchObject({ status: "Pass" });
    expect(cardById(foundation, "community-reports-moderation")).toMatchObject({ status: "Pass" });
    expect(cardById(foundation, "community-health")).toMatchObject({ status: "Pass" });
  });

  it("keeps missing Marketing and Content proof Needs Review instead of fake Pass", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-23T12:00:00.000Z");

    expect(cardById(foundation, "marketing-culture-feed")).toMatchObject({ status: "Needs Review" });
    expect(cardById(foundation, "marketing-discovery")).toMatchObject({ status: "Needs Review" });
    expect(cardById(foundation, "marketing-attribution")).toMatchObject({ status: "Needs Review" });
    expect(cardById(foundation, "community-comments")).toMatchObject({ status: "Needs Review" });
    expect(cardById(foundation, "community-reports-moderation")).toMatchObject({ status: "Needs Review" });
    expect(cardById(foundation, "marketing-culture-feed")?.evidence.join("\n")).toContain("has not been inspected");
  });

  it("keeps future Marketing and Content features parked instead of failed", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-23T12:00:00.000Z");
    const parkedIds = [
      "marketing-referrals",
      "marketing-campaigns",
      "community-moderation",
      "community-creators",
      "community-signals"
    ];

    parkedIds.forEach((id) => {
      expect(cardById(foundation, id)).toMatchObject({
        status: "Needs Review",
        scope: "parked",
        blocksCurrentRelease: false
      });
      expect(cardById(foundation, id)?.summary).toContain("Parked");
    });
  });

  it("keeps broken Marketing and Content proof Failed when evidence proves failure", () => {
    const fixture = {
      cultureSocial: {
        publicPostsExist: false,
        authorIdentityHydrates: true,
        commentsRouteExists: false,
        commentPreviewExists: true,
        engagementActionsExist: true
      },
      cultureDiscovery: {
        discoverySearchProofExists: false
      },
      cultureModeration: {
        reportsRouteExists: true,
        moderationReviewEvidenceExists: false
      },
      cultureBooking: {
        bookingCtaUrlHasAttribution: false,
        bookingFormAcceptsAttribution: true,
        appointmentCreatedThroughBooking: true,
        appointmentAppearsOnBarberCalendar: true,
        regressionTestExists: true
      }
    };
    const foundation = buildMissionControlFoundation([], "2026-06-23T12:00:00.000Z", [], undefined, undefined, undefined, undefined, fixture);

    expect(cardById(foundation, "marketing-culture-feed")).toMatchObject({ status: "Failed" });
    expect(cardById(foundation, "marketing-discovery")).toMatchObject({ status: "Failed" });
    expect(cardById(foundation, "marketing-attribution")).toMatchObject({ status: "Failed" });
    expect(cardById(foundation, "community-comments")).toMatchObject({ status: "Failed" });
    expect(cardById(foundation, "community-reports-moderation")).toMatchObject({ status: "Failed" });
  });

  it("keeps CEO Culture compact while deeper Marketing and Content lanes carry proof details", () => {
    const fixture = {
      cultureSocial: {
        publicPostsExist: true,
        authorIdentityHydrates: true,
        commentsRouteExists: true,
        commentPreviewExists: true,
        engagementActionsExist: true,
        bookCtaExistsForBookableBarber: true
      },
      cultureDiscovery: { discoverySearchProofExists: true },
      cultureModeration: { reportsRouteExists: true, moderationReviewEvidenceExists: true },
      cultureBooking: {
        bookingCtaUrlHasAttribution: true,
        bookingFormAcceptsAttribution: true,
        appointmentCreatedThroughBooking: true,
        appointmentAppearsOnBarberCalendar: true,
        regressionTestExists: true
      }
    };
    const foundation = buildMissionControlFoundation([], "2026-06-23T12:00:00.000Z", [], undefined, undefined, undefined, undefined, fixture);
    const ceoCulture = foundation.ceoCommandCenter.find((card) => card.id === "culture-posture");
    const marketingEvidence = cardById(foundation, "marketing-discovery")?.evidence.join("\n") ?? "";
    const contentEvidence = cardById(foundation, "community-reports-moderation")?.evidence.join("\n") ?? "";

    expect(ceoCulture).toMatchObject({
      label: "Culture posture",
      status: "Pass",
      department: "CEO"
    });
    expect(ceoCulture?.summary).toBe("Culture social loop is tracked separately from marketplace discovery.");
    expect(marketingEvidence).toContain("Discovery/search proof exists.");
    expect(contentEvidence).toContain("Reports route evidence exists.");
  });

  it("registers Source Vault categories as metadata without committing private source contents", () => {
    expect(SOURCE_VAULT_REGISTRY.map((source) => source.category)).toEqual(expect.arrayContaining(SOURCE_VAULT_CATEGORIES));
    expect(SOURCE_VAULT_REGISTRY).toContainEqual(expect.objectContaining({
      id: "v1-master-build-template",
      sourceName: "BVRB3R V1 Master Build Template",
      ingestionStatus: "ingested_metadata_only",
      rawContentCommitted: false
    }));
    expect(SOURCE_VAULT_REGISTRY).toContainEqual(expect.objectContaining({
      id: "architect-doctrine",
      sourceName: "Architect Super Master Plan",
      ingestionStatus: "ingested_metadata_only",
      rawContentCommitted: false
    }));
    expect(SOURCE_VAULT_REGISTRY.every((source) => source.rawContentCommitted === false)).toBe(true);
    expect(SOURCE_VAULT_REGISTRY.some((source) => String(source.ingestionStatus) === "ingested")).toBe(false);
    expect(SOURCE_VAULT_REGISTRY.filter((source) =>
      ["confidential", "restricted"].includes(source.privacyClass)
    ).every((source) => !source.summary.toLowerCase().includes("full pdf"))).toBe(true);
  });

  it("connects required Source Vault V1 metadata without exposing private source contents", () => {
    const inventory = buildSourceVaultInventory();
    const foundation = buildMissionControlFoundation([], "2026-06-21T12:00:00.000Z", [], undefined, undefined, undefined, inventory);

    expect(inventory.status).toBe("Pass");
    expect(inventory.summary.v1RequiredSourceCount).toBe(9);
    expect(inventory.summary.v1RequiredMissingCount).toBe(0);
    expect(inventory.summary.missingRequiredSourceCount).toBe(0);
    expect(inventory.summary.missingRequiredSourceKeys).toEqual([]);
    expect(inventory.summary.privateSourceRequiredCount).toBe(0);
    expect(inventory.summary.privateMetadataMissingCount).toBe(0);
    expect(inventory.summary.contentExposedCount).toBe(0);
    expect(inventory.summary.highestRiskLevel).toBe("critical");
    expect(inventory.v1RequiredSources.every((source) => source.privateConnection.connected)).toBe(true);
    expect(inventory.v1RequiredSources.every((source) => source.privateConnection.contentExposed === false)).toBe(true);
    expect(foundation.ceoCommandCenter.find((card) => card.id === "source-vault-status")).toMatchObject({
      status: "Pass",
      summary: "Source Vault metadata is connected without private document exposure."
    });
  });

  it("surfaces the exact missing required V1 Source Vault metadata keys when incomplete", () => {
    const inventory = buildSourceVaultInventory(sourceVaultWithCloseoutKeysMissing());
    const foundation = buildMissionControlFoundation([], "2026-06-21T12:00:00.000Z", [], undefined, undefined, undefined, inventory);
    const shopOwnerDoctrine = inventory.entries.find((source) => source.id === "shop-owner-doctrine");
    const securityDoctrine = inventory.entries.find((source) => source.id === "security-compliance-doctrine");

    expect(SOURCE_VAULT_V1_METADATA_CLOSEOUT_KEYS).toEqual([
      "shop-owner-doctrine",
      "security-compliance-doctrine"
    ]);
    expect(inventory.status).toBe("Failed");
    expect(inventory.summary.v1RequiredMissingCount).toBe(2);
    expect(inventory.summary.missingRequiredSourceCount).toBe(2);
    expect(inventory.summary.missingRequiredSourceKeys).toEqual([
      "security-compliance-doctrine",
      "shop-owner-doctrine"
    ]);
    expect(shopOwnerDoctrine).toMatchObject({
      ingestionStatus: "missing",
      evidenceStatus: "Failed"
    });
    expect(securityDoctrine).toMatchObject({
      ingestionStatus: "missing",
      evidenceStatus: "Failed"
    });
    expect(foundation.ceoCommandCenter.find((card) => card.id === "source-vault-status")).toMatchObject({ status: "Failed" });
  });

  it("does not let placeholder or private-source-required metadata fake Source Vault Pass", () => {
    const inventory = buildSourceVaultInventory([
      connectedSourceVaultFixture({
        id: "placeholder-required-source",
        sourceName: "Placeholder Required Source",
        ingestionStatus: "ingested_metadata_only",
        contentHash: "sha256:metadata-placeholder-required-source"
      }),
      connectedSourceVaultFixture({
        id: "private-required-source",
        sourceName: "Private Required Source",
        ingestionStatus: "private_source_required"
      })
    ]);
    const placeholderSource = inventory.entries.find((source) => source.id === "placeholder-required-source");
    const privateRequiredSource = inventory.entries.find((source) => source.id === "private-required-source");

    expect(placeholderSource).toMatchObject({
      evidenceStatus: "Needs Review",
      rawContentCommitted: false
    });
    expect(privateRequiredSource).toMatchObject({
      ingestionStatus: "private_source_required",
      evidenceStatus: "Needs Review",
      rawContentCommitted: false
    });
    expect(inventory.status).toBe("Needs Review");
  });

  it("derives private Source Vault connection metadata without exposing document content", () => {
    const inventory = buildSourceVaultInventory([connectedSourceVaultFixture()]);
    const connectedSource = inventory.entries[0];

    expect(connectedSource.privateConnection).toMatchObject({
      sourceKey: "connected-v1-private-source",
      safeSourceLabel: "Connected V1 Private Source",
      category: "Build doctrine",
      requiredForV1: true,
      private: true,
      connected: true,
      lastVerifiedAt: "2026-06-23T00:00:00.000Z",
      fingerprint: "sha256:connected-v1-private-source-fingerprint",
      missingCount: 0,
      connectedCount: 1,
      contentExposed: false
    });
    expect(connectedSource.summary.toLowerCase()).not.toContain("document text");
    expect(connectedSource.summary.toLowerCase()).not.toContain("full pdf");
    expect(inventory.summary.privateMetadataConnectedCount).toBe(1);
    expect(inventory.summary.contentExposedCount).toBe(0);
  });

  it("allows connected safe metadata to make Source Vault Pass without private contents", () => {
    const inventory = buildSourceVaultInventory([
      connectedSourceVaultFixture(),
      connectedSourceVaultFixture({
        id: "connected-v1-private-source-two",
        sourceName: "Connected V1 Private Source Two",
        contentHash: "sha256:connected-v1-private-source-two-fingerprint"
      })
    ]);
    const foundation = buildMissionControlFoundation([], "2026-06-23T12:00:00.000Z", [], undefined, undefined, undefined, inventory);
    const ceoSourceVault = foundation.ceoCommandCenter.find((card) => card.id === "source-vault-status");
    const technologySourceVault = foundation.departmentLanes.flatMap((lane) => lane.cards).find((card) => card.id === "technology-source-vault-readiness");

    expect(inventory.status).toBe("Pass");
    expect(inventory.summary.v1RequiredMissingCount).toBe(0);
    expect(inventory.summary.privateMetadataConnectedCount).toBe(2);
    expect(inventory.entries.every((source) => source.privateConnection.contentExposed === false)).toBe(true);
    expect(ceoSourceVault).toMatchObject({ status: "Pass" });
    expect(technologySourceVault).toMatchObject({ status: "Pass" });
  });

  it("keeps missing required V1 private metadata Needs Review or Blocked instead of fake Pass", () => {
    const inventory = buildSourceVaultInventory([
      connectedSourceVaultFixture({
        id: "registered-required-source",
        sourceName: "Registered Required Source",
        ingestionStatus: "registered",
        contentHash: "sha256:metadata-placeholder-registered-required-source"
      })
    ]);
    const foundation = buildMissionControlFoundation([], "2026-06-23T12:00:00.000Z", [], undefined, undefined, undefined, inventory);
    const source = inventory.entries[0];
    const ceoSourceVault = foundation.ceoCommandCenter.find((card) => card.id === "source-vault-status");

    expect(source.evidenceStatus).toBe("Needs Review");
    expect(source.privateConnection.connected).toBe(false);
    expect(source.privateConnection.missingCount).toBe(1);
    expect(inventory.status).toBe("Needs Review");
    expect(ceoSourceVault?.status).toBe("Needs Review");
    expect(ceoSourceVault?.summary).toBe("Source Vault metadata is registered, but private source review is incomplete.");
  });

  it("fails Source Vault metadata when private content exposure is detected", () => {
    const inventory = buildSourceVaultInventory([
      connectedSourceVaultFixture({
        id: "unsafe-private-source",
        sourceName: "Unsafe Private Source",
        rawContentCommitted: true
      })
    ]);
    const source = inventory.entries[0];

    expect(source.evidenceStatus).toBe("Failed");
    expect(source.privateConnection.contentExposed).toBe(true);
    expect(source.privateConnection.connected).toBe(false);
    expect(inventory.status).toBe("Failed");
    expect(inventory.summary.contentExposedCount).toBe(1);
  });

  it("parks Hive AI source doctrine outside the V1 Source Vault blocker set", () => {
    const inventory = buildSourceVaultInventory();
    const hiveSource = inventory.entries.find((source) => source.id === "hive-ai-future-doctrine");

    expect(hiveSource).toMatchObject({
      scope: "v3_future",
      ingestionStatus: "parked_future",
      evidenceStatus: "Parked",
      critical: false
    });
    expect(inventory.missingRequiredSources.map((source) => source.id)).not.toContain("hive-ai-future-doctrine");
    expect(inventory.summary.parkedFutureSourceCount).toBeGreaterThan(0);
  });

  it("counts linked Architect cards without treating private files as ingested", () => {
    const inventory = buildSourceVaultInventory();

    expect(inventory.summary.linkedArchitectCardsCount).toBeGreaterThan(0);
    expect(inventory.entries.flatMap((source) => source.linkedArchitectCardIds)).toEqual(expect.arrayContaining([
      "source-vault-status",
      "technology-source-vault-readiness"
    ]));
    expect(inventory.entries.every((source) => source.storageLocation.startsWith("private://source-vault/"))).toBe(true);
    expect(inventory.evidenceSource).toContain("private documents remain outside the public repository");
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

  it("does not mark Critical Incidents Pass without incident scan proof", () => {
    const foundation = buildMissionControlFoundation([], "", []);
    const criticalIncidents = foundation.ceoCommandCenter.find((card) => card.id === "critical-incidents");

    expect(criticalIncidents?.status).toBe("Needs Review");
    expect(criticalIncidents?.summary).toContain("No critical incident scan proof is connected.");
  });

  it("marks Critical Incidents Pass when scan proof exists and finds zero critical incidents", () => {
    const foundation = buildMissionControlFoundation([], "2026-06-21T15:00:00.000Z", []);
    const criticalIncidents = foundation.ceoCommandCenter.find((card) => card.id === "critical-incidents");

    expect(criticalIncidents?.status).toBe("Pass");
    expect(criticalIncidents?.evidence).toEqual(expect.arrayContaining([
      "Incident detector checkedAt=2026-06-21T15:00:00.000Z; zero critical incidents found."
    ]));
  });
});
