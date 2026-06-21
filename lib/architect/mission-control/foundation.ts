import type {
  ActionRegistryEntry,
  ArchitectIncident,
  ArchitectMissionIncidentType,
  DeploymentRegressionEvidence,
  DeploymentRegressionEvidenceStatus,
  AuditSpineGroupSummary,
  AuditSpineModel,
  AuditSpineRecord,
  AuditSpineStageEvidence,
  AuditSpineStageKey,
  AuditSpineStatus,
  CodexFailureClass,
  CoreLoopValidator,
  HiveAgentEntry,
  MissionControlFoundation,
  MissionControlLane,
  MissionControlStatus,
  MissionDepartment,
  MissionDepartmentLane,
  MissionEvidenceCard,
  MissionIncidentDefinition,
  MissionLaneId,
  MissionReadinessBreakdown,
  MissionSeverity,
  RoleTruthInventory,
  RoleTruthInventoryRow,
  RoleTruthRiskLevel,
  RoleTruthInventoryStatus,
  RlsRiskLevel,
  RlsSecurityInventory,
  RlsSecurityInventoryRow,
  RlsSecurityInventoryStatus,
  SourceVaultCategory,
  SourceVaultEntry,
  SourceVaultEvidenceStatus,
  SourceVaultInventory,
  SourceVaultRiskLevel,
  V1RuntimeProofGroup,
  V1RuntimeProofGroupId,
  V1RuntimeProofMatrix,
  V1RuntimeProofRow
} from "@/lib/architect/mission-control/types";

type BooleanCheck = {
  label: string;
  passed?: boolean;
  evidenceWhenPass: string;
  evidenceWhenFail: string;
  evidenceWhenMissing: string;
};

type CoreLoopFixture = {
  cultureSocial?: {
    publicPostsExist?: boolean;
    authorIdentityHydrates?: boolean;
    commentsRouteExists?: boolean;
    commentPreviewExists?: boolean;
    engagementActionsExist?: boolean;
    bookCtaExistsForBookableBarber?: boolean;
  };
  cultureBooking?: {
    bookingCtaUrlHasAttribution?: boolean;
    bookingFormAcceptsAttribution?: boolean;
    appointmentCreatedThroughBooking?: boolean;
    appointmentAppearsOnBarberCalendar?: boolean;
    regressionTestExists?: boolean;
  };
  bookingAvailability?: {
    selectedBarberResolves?: boolean;
    selectedServiceResolves?: boolean;
    canonicalLocationResolves?: boolean;
    availabilityRulesGenerateSlots?: boolean;
    noAppointmentBeforeFinalConfirm?: boolean;
  };
  barberCalendar?: {
    appointmentAppearsOnCommandCalendar?: boolean;
    barberCanCompleteOwnService?: boolean;
    ownerCannotCompleteBarberService?: boolean;
  };
  shopRelationship?: {
    ownerInviteCanExist?: boolean;
    barberCanAccept?: boolean;
    activeRelationshipAppearsInOwnerHome?: boolean;
    pendingInvitesExcludedFromActiveCount?: boolean;
    acceptedBarberAppearsInScoreboard?: boolean;
    profileRoleRemainsBarberUser?: boolean;
  };
  ownerCommandCalendar?: {
    activeBarbersFromRelationships?: boolean;
    pendingInvitesExcluded?: boolean;
    shopProductionUsesShopContext?: boolean;
    ownerTimelineShopWide?: boolean;
    ownerCompleteServiceHidden?: boolean;
  };
  paymentRouting?: {
    appointmentExists?: boolean;
    paymentExists?: boolean;
    statusHistoryExists?: boolean;
    routingExistsOrClearFailure?: boolean;
    noPayoutBeforeCompletion?: boolean;
  };
};

type ReadinessMetadata = Pick<MissionEvidenceCard, "scope" | "criticality" | "blocksCurrentRelease" | "evidenceRequiredForPass">;

const V1_CRITICAL_CARD_IDS = new Set([
  "overall-platform-status",
  "booking-posture",
  "role-health",
  "ceo-payment-routing-health",
  "ceo-payout-readiness-health",
  "ceo-role-drift-health",
  "ceo-rls-disabled-evidence",
  "ceo-audit-log-evidence",
  "source-vault-status",
  "culture-to-booking-loop",
  "booking-availability-loop",
  "barber-calendar-loop",
  "shop-relationship-loop",
  "owner-command-calendar-loop",
  "payment-routing-loop",
  "product-booking-ux",
  "operations-appointments",
  "operations-calendars",
  "operations-relationships",
  "operations-command-calendars",
  "operations-completion",
  "finance-payment-health",
  "finance-routing",
  "finance-refund-resolution",
  "finance-payout",
  "finance-repair-audit-coverage",
  "audit-spine-coverage",
  "compliance-trust-gates",
  "compliance-role-truth-inventory",
  "security-role-access",
  "security-role-drift",
  "security-role-truth-inventory",
  "security-rls-inventory",
  "security-rls-disabled",
  "security-route-protection",
  "security-unsafe-actions",
  "security-audit",
  "technology-rls-disabled",
  "technology-source-vault-readiness"
]);

const V2_INFRASTRUCTURE_CARD_IDS = new Set([
  "deployment-health",
  "regression-status",
  "deployment-regression",
  "technology-deployments",
  "technology-current-commit-proof",
  "technology-current-deploy-proof",
  "technology-deployment-status-proof",
  "technology-build-tests",
  "technology-database",
  "technology-api",
  "technology-schema",
  "technology-coverage",
  "security-audit-plan",
  "compliance-policy"
]);

const V3_FUTURE_CARD_IDS = new Set([
  "agent-status",
  "hive-ai"
]);

const PARKED_CARD_IDS = new Set([
  "operations-kiosk",
  "finance-future",
  "marketing-referrals",
  "marketing-campaigns",
  "compliance-consent",
  "community-moderation",
  "community-creators",
  "community-signals"
]);

type RuntimeProofDefinition = {
  id: string;
  label: string;
  lane: MissionDepartment;
  roleAffected: V1RuntimeProofRow["roleAffected"];
  proofGroup: V1RuntimeProofGroupId;
  requiredProofSource: string;
  currentEvidenceSource: string;
  sourceCardId: string;
  statusRule: string;
  passRequirement: string;
  failureMeaning: string;
  nextRepairLane: MissionLaneId;
};

type DeploymentRegressionEvidenceInput = {
  expectedMainCommit?: string | null;
  runtimeCommit?: string | null;
  deploymentId?: string | null;
  deploymentEnvironment?: string | null;
  deploymentTarget?: string | null;
  deploymentUrl?: string | null;
  deploymentState?: string | null;
  buildEvidenceStatus?: string | null;
  lintEvidenceStatus?: string | null;
  typecheckEvidenceStatus?: string | null;
  testEvidenceStatus?: string | null;
  lastValidatedAt?: string | null;
  evidenceSource?: string;
};

type RlsSecurityInventoryRowInput = Omit<
  RlsSecurityInventoryRow,
  "currentStatus" | "failureMeaning" | "migrationRequired" | "staleOrMissingEvidenceState"
> & Partial<Pick<RlsSecurityInventoryRow, "currentStatus" | "failureMeaning" | "migrationRequired" | "staleOrMissingEvidenceState">>;

type RlsSecurityInventoryInput = {
  rows?: RlsSecurityInventoryRowInput[];
  productionDisabledPublicTableCount?: number;
  evidenceSource?: string;
};

type RoleTruthInventoryRowInput = Omit<
  RoleTruthInventoryRow,
  "currentStatus" | "failureMeaning" | "migrationRequired" | "staleOrMissingEvidenceState"
> & Partial<Pick<RoleTruthInventoryRow, "currentStatus" | "failureMeaning" | "migrationRequired" | "staleOrMissingEvidenceState">>;

type RoleTruthInventoryInput = {
  rows?: RoleTruthInventoryRowInput[];
  evidenceSource?: string;
};

const DEFAULT_RLS_DISABLED_PUBLIC_TABLE_COUNT = 28;

const DEFAULT_RLS_EVIDENCE_SOURCE = "Safe cleanup evidence, Supabase public schema inventory plan, and repo-known V1 table map";

const DEFAULT_ROLE_TRUTH_EVIDENCE_SOURCE = "Repo-known auth role helpers, route guards, seed files, and Architect cleanup role-drift evidence";

const DEFAULT_ROLE_TRUTH_INVENTORY_ROWS: RoleTruthInventoryRowInput[] = [
  {
    id: "role-client-user",
    currentRoleValue: "client_user",
    normalizedDisplayLabel: "Client user",
    canonicalClassification: "public_account_role",
    expectedCanonicalDestination: "profiles.role = client_user",
    currentUsageLocations: ["lib/auth/roles.ts", "app/api/onboarding/_shared.ts", "mobile/native role schemas"],
    affectedRoleOrLane: "Client / Product",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "low",
    securityRisk: "low",
    suggestedMigrationPath: "Keep as canonical public account role.",
    rollbackNote: "No migration needed for canonical rows.",
    nextRepairLane: "security",
    evidenceSource: "MASTER_TRUTH_ACCOUNT_ROLES includes client_user.",
    accountRoleMisuse: false
  },
  {
    id: "role-barber-user",
    currentRoleValue: "barber_user",
    normalizedDisplayLabel: "Barber user",
    canonicalClassification: "public_account_role",
    expectedCanonicalDestination: "profiles.role = barber_user",
    currentUsageLocations: ["lib/auth/roles.ts", "app/api/onboarding/_shared.ts", "barber route guards"],
    affectedRoleOrLane: "Barber / Operations",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "low",
    securityRisk: "low",
    suggestedMigrationPath: "Keep as canonical public account role; model commission/booth rent through relationship tables.",
    rollbackNote: "No migration needed for canonical rows.",
    nextRepairLane: "security",
    evidenceSource: "MASTER_TRUTH_ACCOUNT_ROLES includes barber_user.",
    accountRoleMisuse: false
  },
  {
    id: "role-shop-owner-user",
    currentRoleValue: "shop_owner_user",
    normalizedDisplayLabel: "Shop owner user",
    canonicalClassification: "public_account_role",
    expectedCanonicalDestination: "profiles.role = shop_owner_user",
    currentUsageLocations: ["lib/auth/roles.ts", "app/api/onboarding/_shared.ts", "owner route guards"],
    affectedRoleOrLane: "Shop Owner / Operations",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "low",
    securityRisk: "low",
    suggestedMigrationPath: "Keep as canonical public account role; model owner permissions through shop/team relationship tables.",
    rollbackNote: "No migration needed for canonical rows.",
    nextRepairLane: "security",
    evidenceSource: "MASTER_TRUTH_ACCOUNT_ROLES includes shop_owner_user.",
    accountRoleMisuse: false
  },
  {
    id: "role-platform-admin",
    currentRoleValue: "platform_admin",
    normalizedDisplayLabel: "Platform admin",
    canonicalClassification: "internal_platform_role",
    expectedCanonicalDestination: "profiles.role = platform_admin for gated Architect accounts only",
    currentUsageLocations: ["Architect route guards", "controlled refund authorization bridge", "platform event actor role"],
    affectedRoleOrLane: "Architect / Security",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "medium",
    securityRisk: "critical",
    suggestedMigrationPath: "Keep gated to internal Architect accounts; never expose to public role selection.",
    rollbackNote: "If an account is incorrectly promoted, revert through an approved role repair after audit.",
    nextRepairLane: "security",
    evidenceSource: "Architect-only surfaces use platform_admin as internal role.",
    accountRoleMisuse: false
  },
  {
    id: "role-client-legacy",
    currentRoleValue: "client",
    normalizedDisplayLabel: "Legacy client",
    canonicalClassification: "legacy_or_drift",
    expectedCanonicalDestination: "client_user",
    currentUsageLocations: ["lib/auth/roles.ts LEGACY_CLIENT_ACCOUNT_ROLES", "supabase/seed.staging-minimal.sql", "app/api/payments/deposit/route.ts", "app/api/client/reviews/route.ts"],
    affectedRoleOrLane: "Client / Compliance",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "high",
    securityRisk: "high",
    suggestedMigrationPath: "Plan a reviewed migration from profiles.role client to client_user after route guards and tests accept canonical roles.",
    rollbackNote: "Keep a pre-migration role count snapshot so affected rows can be restored if a canonical guard regression appears.",
    nextRepairLane: "compliance",
    evidenceSource: "Legacy client role is accepted in auth helpers and appears in route checks/seeds.",
    accountRoleMisuse: true
  },
  {
    id: "role-barber-legacy",
    currentRoleValue: "barber",
    normalizedDisplayLabel: "Legacy barber",
    canonicalClassification: "legacy_or_drift",
    expectedCanonicalDestination: "barber_user",
    currentUsageLocations: ["lib/auth/roles.ts LEGACY_BARBER_ACCOUNT_ROLES", "barber appointment actorRole strings", "Culture role schemas"],
    affectedRoleOrLane: "Barber / Operations",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "high",
    securityRisk: "high",
    suggestedMigrationPath: "Plan a reviewed migration from primary account role barber to barber_user; keep display/workflow role labels separate.",
    rollbackNote: "Rollback requires restoring the pre-migration profiles.role snapshot only, not business relationship rows.",
    nextRepairLane: "compliance",
    evidenceSource: "Legacy barber role is accepted by isBarberAccountRole.",
    accountRoleMisuse: true
  },
  {
    id: "role-shop-owner-legacy",
    currentRoleValue: "shop_owner",
    normalizedDisplayLabel: "Legacy shop owner",
    canonicalClassification: "legacy_or_drift",
    expectedCanonicalDestination: "shop_owner_user",
    currentUsageLocations: ["lib/auth/roles.ts LEGACY_SHOP_OWNER_ACCOUNT_ROLES", "onboarding role schemas", "Architect account tests"],
    affectedRoleOrLane: "Shop Owner / Compliance",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "high",
    securityRisk: "high",
    suggestedMigrationPath: "Plan a reviewed migration from primary account role shop_owner to shop_owner_user; preserve onboarding lane labels separately.",
    rollbackNote: "Rollback uses pre-migration profiles.role counts and account ids.",
    nextRepairLane: "compliance",
    evidenceSource: "shop_owner is still accepted as a legacy owner account role.",
    accountRoleMisuse: true
  },
  {
    id: "role-owner-permission",
    currentRoleValue: "owner",
    normalizedDisplayLabel: "Owner permission",
    canonicalClassification: "staff_permission",
    expectedCanonicalDestination: "shop_owner_user account role plus shop/team owner permission",
    currentUsageLocations: ["lib/auth/roles.ts LEGACY_SHOP_OWNER_ACCOUNT_ROLES", "app/api/points/cashout/*", "app/api/owner/activation/route.ts", "supabase/seed.sql user_roles"],
    affectedRoleOrLane: "Shop Owner / Security",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "high",
    securityRisk: "critical",
    suggestedMigrationPath: "Move account identity to shop_owner_user and keep owner as shop/team permission or relationship state.",
    rollbackNote: "Rollback must not delete shop/team relationship rows; only restore affected primary role values if approved.",
    nextRepairLane: "security",
    evidenceSource: "owner is used as both legacy account role and shop permission in route guards.",
    accountRoleMisuse: true
  },
  {
    id: "role-manager-permission",
    currentRoleValue: "manager",
    normalizedDisplayLabel: "Manager permission",
    canonicalClassification: "staff_permission",
    expectedCanonicalDestination: "staff/team permission scoped by shop/location",
    currentUsageLocations: ["app/api/points/cashout/*", "app/api/engagement/*", "supabase/seed.sql user_roles"],
    affectedRoleOrLane: "Shop Owner / Security",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "medium",
    securityRisk: "high",
    suggestedMigrationPath: "Keep manager as staff permission only; never use it as profiles.role.",
    rollbackNote: "If staff permission migration fails, restore staff membership rows without changing public account roles.",
    nextRepairLane: "security",
    evidenceSource: "manager appears in server route guards as staff authority.",
    accountRoleMisuse: true
  },
  {
    id: "role-front-desk-permission",
    currentRoleValue: "front_desk",
    normalizedDisplayLabel: "Front desk permission",
    canonicalClassification: "staff_permission",
    expectedCanonicalDestination: "staff/team permission scoped by shop/location",
    currentUsageLocations: ["app/api/engagement/*", "app/api/mobile/*", "supabase/seed.sql user_roles"],
    affectedRoleOrLane: "Shop Owner / Security",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "medium",
    securityRisk: "high",
    suggestedMigrationPath: "Keep front_desk as staff permission only; never use it as profiles.role.",
    rollbackNote: "Rollback staff permissions separately from account role cleanup.",
    nextRepairLane: "security",
    evidenceSource: "front_desk appears in server route guards and seed staff roles.",
    accountRoleMisuse: true
  },
  {
    id: "role-staff-permission",
    currentRoleValue: "staff",
    normalizedDisplayLabel: "Staff permission",
    canonicalClassification: "staff_permission",
    expectedCanonicalDestination: "staff/team permission scoped by shop/location",
    currentUsageLocations: ["staff_locations", "team relationship logic", "shop relationship copy"],
    affectedRoleOrLane: "Shop Owner / Security",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "medium",
    securityRisk: "high",
    suggestedMigrationPath: "Represent staff through staff/team tables, not profiles.role.",
    rollbackNote: "Rollback only staff membership records if needed; do not alter canonical account role rows.",
    nextRepairLane: "security",
    evidenceSource: "staff concept appears in staff_locations/team relationship surfaces.",
    accountRoleMisuse: false,
    currentStatus: "Needs Review"
  },
  {
    id: "role-commission-barber-relationship",
    currentRoleValue: "commission_barber",
    normalizedDisplayLabel: "Commission barber relationship",
    canonicalClassification: "business_relationship",
    expectedCanonicalDestination: "barber_user account role plus commission relationship/service terms",
    currentUsageLocations: ["lib/auth/roles.ts LEGACY_BARBER_ACCOUNT_ROLES", "supabase/seed.sql user_roles"],
    affectedRoleOrLane: "Barber / Finance",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "high",
    securityRisk: "high",
    suggestedMigrationPath: "Move primary account identity to barber_user and preserve commission terms in shop relationship/money configuration.",
    rollbackNote: "Rollback primary role separately from commission relationship terms.",
    nextRepairLane: "compliance",
    evidenceSource: "commission_barber is accepted as a legacy barber account role and appears in seed user_roles.",
    accountRoleMisuse: true
  },
  {
    id: "role-booth-rent-barber-relationship",
    currentRoleValue: "booth_rent_barber",
    normalizedDisplayLabel: "Booth rent barber relationship",
    canonicalClassification: "business_relationship",
    expectedCanonicalDestination: "barber_user account role plus booth-rent relationship/service terms",
    currentUsageLocations: ["lib/auth/roles.ts LEGACY_BARBER_ACCOUNT_ROLES", "supabase/seed.sql user_roles", "supabase/seed.staging-minimal.sql"],
    affectedRoleOrLane: "Barber / Finance",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "high",
    securityRisk: "high",
    suggestedMigrationPath: "Move primary account identity to barber_user and preserve booth rent terms in shop relationship/money configuration.",
    rollbackNote: "Rollback primary role separately from booth-rent relationship terms.",
    nextRepairLane: "compliance",
    evidenceSource: "booth_rent_barber is accepted as a legacy barber account role and appears in seed data.",
    accountRoleMisuse: true
  },
  {
    id: "role-invited-barber-relationship",
    currentRoleValue: "invited barber",
    normalizedDisplayLabel: "Invited barber state",
    canonicalClassification: "business_relationship",
    expectedCanonicalDestination: "shop_barber_relationships status / invitation state",
    currentUsageLocations: ["shop relationship modal", "owner Add Barbers workflow", "shop_barber_relationships"],
    affectedRoleOrLane: "Shop Owner / Operations",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "medium",
    securityRisk: "medium",
    suggestedMigrationPath: "Keep as relationship status only; never store as profiles.role.",
    rollbackNote: "Relationship status rollback should not mutate account role.",
    nextRepairLane: "operations",
    evidenceSource: "Shop relationship flow treats invitations as relationship state.",
    accountRoleMisuse: false,
    currentStatus: "Needs Review"
  },
  {
    id: "role-pending-invite-relationship",
    currentRoleValue: "pending invite",
    normalizedDisplayLabel: "Pending invite state",
    canonicalClassification: "business_relationship",
    expectedCanonicalDestination: "shop_barber_relationships pending status",
    currentUsageLocations: ["owner team relationship queue", "barber shop relationship modal"],
    affectedRoleOrLane: "Shop Owner / Operations",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "medium",
    securityRisk: "medium",
    suggestedMigrationPath: "Keep pending invite as relationship state excluded from active barber KPI math.",
    rollbackNote: "Rollback pending invite state without changing profiles.role.",
    nextRepairLane: "operations",
    evidenceSource: "Owner active-barber sync treats pending invites separately from active relationships.",
    accountRoleMisuse: false,
    currentStatus: "Needs Review"
  },
  {
    id: "role-shop-member-relationship",
    currentRoleValue: "shop member",
    normalizedDisplayLabel: "Shop member relationship",
    canonicalClassification: "business_relationship",
    expectedCanonicalDestination: "shop membership / active shop relationship row",
    currentUsageLocations: ["staff_locations", "shop_barber_relationships", "owner team workspace"],
    affectedRoleOrLane: "Shop Owner / Operations",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "medium",
    securityRisk: "medium",
    suggestedMigrationPath: "Keep shop member as derived relationship membership, not account identity.",
    rollbackNote: "Rollback membership rows independently from primary account role.",
    nextRepairLane: "operations",
    evidenceSource: "Owner Home active barber sync reads relationship state.",
    accountRoleMisuse: false,
    currentStatus: "Needs Review"
  },
  {
    id: "role-team-member-relationship",
    currentRoleValue: "team member",
    normalizedDisplayLabel: "Team member relationship",
    canonicalClassification: "business_relationship",
    expectedCanonicalDestination: "team/staff relationship row with scoped permissions",
    currentUsageLocations: ["owner team workspace", "staff_locations", "team relationship queue"],
    affectedRoleOrLane: "Shop Owner / Operations",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "medium",
    securityRisk: "medium",
    suggestedMigrationPath: "Keep team member as relationship/permission row, not public account role.",
    rollbackNote: "Rollback team membership without mutating user account role.",
    nextRepairLane: "operations",
    evidenceSource: "Team relationship surfaces separate membership from account identity.",
    accountRoleMisuse: false,
    currentStatus: "Needs Review"
  },
  {
    id: "role-unknown",
    currentRoleValue: "unknown",
    normalizedDisplayLabel: "Unknown role value",
    canonicalClassification: "unknown",
    expectedCanonicalDestination: "Needs inspection before mapping",
    currentUsageLocations: ["production role audit not connected"],
    affectedRoleOrLane: "Security / Compliance",
    v1Required: true,
    futureParked: false,
    userImpactRisk: "high",
    securityRisk: "critical",
    suggestedMigrationPath: "Connect production role distinct-value audit before normalizing any unknown value.",
    rollbackNote: "Do not mutate unknown values until exact production rows and intended destination are reviewed.",
    nextRepairLane: "security",
    evidenceSource: "Production distinct profile role evidence is not connected.",
    accountRoleMisuse: true,
    currentStatus: "Needs Review"
  }
];

const DEFAULT_RLS_SECURITY_INVENTORY_ROWS: RlsSecurityInventoryRowInput[] = [
  {
    id: "rls-public-disabled-aggregate",
    schemaName: "public",
    tableName: "public tables reported disabled by safe cleanup (names not connected)",
    rlsEnabled: "no",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Unknown public table set; treated as V1-critical until table-level production evidence is connected.",
    userRoleExposure: ["public API", "authenticated roles", "platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "Every public table exposed through Supabase Data API must have RLS enabled with reviewed role policies.",
    suggestedPolicyPlanSummary: "Connect production table-level pg_class/pg_policies inventory, then review and apply RLS migrations in a separate approved security PR.",
    nextRepairLane: "security",
    evidenceSource: "Safe cleanup evidence reports 28 public Supabase table(s) have RLS disabled; exact table names are not connected yet."
  },
  {
    id: "rls-profiles",
    schemaName: "public",
    tableName: "profiles",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Private account identity, public role posture, display identity, and trust-gate evidence.",
    userRoleExposure: ["client_user", "barber_user", "shop_owner_user", "platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "Users can read/update their own private profile fields; public display reads are limited to safe public fields; platform_admin reads are gated server-side.",
    suggestedPolicyPlanSummary: "Verify production RLS enabled state and policy names before any role-drift or trust-gate cleanup.",
    nextRepairLane: "security",
    evidenceSource: "V1 role and compliance loop table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-appointments",
    schemaName: "public",
    tableName: "appointments",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Client, barber, shop, service, time, lifecycle, and calendar visibility truth.",
    userRoleExposure: ["client_user", "barber_user", "shop_owner_user", "platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "Clients see their appointments, barbers see their chair appointments, owners see shop-context appointments, and platform_admin access remains server-gated.",
    suggestedPolicyPlanSummary: "Verify production policies before treating booking/calendar proof as release-safe.",
    nextRepairLane: "security",
    evidenceSource: "V1 booking and calendar proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-payments",
    schemaName: "public",
    tableName: "payments",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Payment status, Stripe/provider references, captured/refunded posture, and money evidence.",
    userRoleExposure: ["client_user", "barber_user", "shop_owner_user", "platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "Payment reads are limited by appointment/shop ownership; money mutation remains server-only and Stripe-backed.",
    suggestedPolicyPlanSummary: "Verify RLS and policy posture before Finance can claim full V1 security posture.",
    nextRepairLane: "security",
    evidenceSource: "V1 Finance proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-payment-routing-records",
    schemaName: "public",
    tableName: "payment_routing_records",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Payout readiness, routing model, barber/shop split, release guard, and reconciliation posture.",
    userRoleExposure: ["barber_user", "shop_owner_user", "platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "Routing evidence is readable only to authorized money contexts; payout release remains server-only and explicitly approved.",
    suggestedPolicyPlanSummary: "Verify policies before marking payment-routing security as Pass.",
    nextRepairLane: "security",
    evidenceSource: "V1 Finance routing proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-refunds",
    schemaName: "public",
    tableName: "refunds",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Refund evidence, actor/source, provider refund reference, amount, and result state.",
    userRoleExposure: ["client_user", "shop_owner_user", "platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "Refund evidence reads are scoped to authorized appointment/shop contexts; refund execution remains canonical route-only.",
    suggestedPolicyPlanSummary: "Verify production RLS and policy evidence before treating refund logs as fully secured.",
    nextRepairLane: "security",
    evidenceSource: "V1 Finance refund log proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-payout-executions",
    schemaName: "public",
    tableName: "payout_executions",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Payout execution evidence and release guard proof.",
    userRoleExposure: ["shop_owner_user", "platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "Payout execution evidence is read-only for authorized money contexts and never mutated by Architect diagnostics.",
    suggestedPolicyPlanSummary: "Verify production RLS and policies before payout evidence can contribute to V1 Pass.",
    nextRepairLane: "security",
    evidenceSource: "V1 Finance payout guard proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-audit-logs",
    schemaName: "public",
    tableName: "audit_logs",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Repair approval, execution, verification, and score-impact audit evidence.",
    userRoleExposure: ["platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "Audit evidence is readable to platform_admin control-plane paths only; public users never receive private audit rows.",
    suggestedPolicyPlanSummary: "Connect production RLS/policy evidence and persisted audit coverage before Audit Spine can Pass.",
    nextRepairLane: "security",
    evidenceSource: "V1 Audit Spine proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-platform-events",
    schemaName: "public",
    tableName: "platform_events",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Platform event evidence for controlled repair success/failure and Finance logs.",
    userRoleExposure: ["platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "Platform event evidence is visible only through gated Architect/server-side surfaces.",
    suggestedPolicyPlanSummary: "Verify production RLS and policy posture for platform event evidence.",
    nextRepairLane: "security",
    evidenceSource: "V1 Audit/Finance log proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-message-threads",
    schemaName: "public",
    tableName: "message_threads",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Client/barber/owner message thread membership and communication context.",
    userRoleExposure: ["client_user", "barber_user", "shop_owner_user"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "high",
    expectedPolicyPosture: "Participants only read threads they belong to; owner/team message visibility follows explicit policy.",
    suggestedPolicyPlanSummary: "Verify RLS before messaging can be considered V1 security-clean.",
    nextRepairLane: "security",
    evidenceSource: "V1 messaging proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-messages",
    schemaName: "public",
    tableName: "messages",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Private conversation body and participant-visible message state.",
    userRoleExposure: ["client_user", "barber_user", "shop_owner_user"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "high",
    expectedPolicyPosture: "Participants only read/send messages inside authorized threads.",
    suggestedPolicyPlanSummary: "Verify message table RLS and participant policies.",
    nextRepairLane: "security",
    evidenceSource: "V1 messaging proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-culture-posts",
    schemaName: "public",
    tableName: "culture_posts",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Public Culture post identity, attribution, booking CTA, and moderation state.",
    userRoleExposure: ["anonymous public", "client_user", "barber_user", "shop_owner_user", "platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "high",
    expectedPolicyPosture: "Public reads expose approved public content only; writes/moderation are role-gated.",
    suggestedPolicyPlanSummary: "Verify production RLS and public-read policies before Culture security can Pass.",
    nextRepairLane: "security",
    evidenceSource: "V1 Culture proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-shop-barber-relationships",
    schemaName: "public",
    tableName: "shop_barber_relationships",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Shop-owner/team relationship truth, active barber count, pending invitations, and approval state.",
    userRoleExposure: ["barber_user", "shop_owner_user", "platform_admin"],
    v1Required: true,
    futureParked: false,
    currentRiskLevel: "critical",
    expectedPolicyPosture: "Owners and barbers can read only their relationship context; active membership changes require canonical server paths.",
    suggestedPolicyPlanSummary: "Verify production RLS before owner active-barber proof can be marked security-clean.",
    nextRepairLane: "security",
    evidenceSource: "V1 owner/team proof table map; production RLS/policy state is not connected."
  },
  {
    id: "rls-campaign-events",
    schemaName: "public",
    tableName: "campaign_events",
    rlsEnabled: "unknown",
    policyCount: null,
    policyNames: [],
    dataSensitivity: "Future campaign attribution events.",
    userRoleExposure: ["platform_admin"],
    v1Required: false,
    futureParked: true,
    currentRiskLevel: "unknown",
    expectedPolicyPosture: "Parked future table must not affect V1 readiness until campaign tracking is implemented.",
    suggestedPolicyPlanSummary: "Define policy during future campaign tracking work; no current V1 migration.",
    nextRepairLane: "marketing",
    evidenceSource: "Parked future marketing scaffold; no production RLS claim."
  }
];

const V1_RUNTIME_PROOF_GROUPS: Array<Pick<V1RuntimeProofGroup, "id" | "label" | "lane" | "nextRepairLane">> = [
  { id: "client_loop", label: "Client loop", lane: "Product", nextRepairLane: "product" },
  { id: "barber_loop", label: "Barber loop", lane: "Operations", nextRepairLane: "operations" },
  { id: "shop_owner_loop", label: "Shop Owner loop", lane: "Operations", nextRepairLane: "operations" },
  { id: "money_loop", label: "Money loop", lane: "Finance", nextRepairLane: "finance" },
  { id: "security_loop", label: "Security loop", lane: "Security", nextRepairLane: "security" },
  { id: "deployment_loop", label: "Deployment loop", lane: "Technology", nextRepairLane: "technology" },
  { id: "audit_loop", label: "Audit loop", lane: "Compliance", nextRepairLane: "compliance" }
];

const V1_RUNTIME_PROOF_DEFINITIONS: RuntimeProofDefinition[] = [
  {
    id: "client-account-exists",
    label: "client account exists",
    lane: "Product",
    roleAffected: "Client",
    proofGroup: "client_loop",
    requiredProofSource: "profiles/client profile count",
    currentEvidenceSource: "CEO Clients metric",
    sourceCardId: "ceo-clients-total",
    statusRule: "Pass only when connected client account evidence exists.",
    passRequirement: "At least one canonical client_user profile is counted from production evidence.",
    failureMeaning: "Architect cannot prove clients exist or are counted with canonical role truth.",
    nextRepairLane: "product"
  },
  {
    id: "client-booking-path",
    label: "client can reach booking path",
    lane: "Product",
    roleAffected: "Client",
    proofGroup: "client_loop",
    requiredProofSource: "Culture-to-booking validator",
    currentEvidenceSource: "culture-to-booking-loop validator",
    sourceCardId: "culture-to-booking-loop",
    statusRule: "Missing booking-path proof stays Needs Review.",
    passRequirement: "Culture/booking CTA, attribution acceptance, booking creation, calendar sync, and regression evidence all pass.",
    failureMeaning: "Client booking entry may be broken or unverified.",
    nextRepairLane: "product"
  },
  {
    id: "client-selected-barber-resolution",
    label: "selected barber resolution proof",
    lane: "Product",
    roleAffected: "Client",
    proofGroup: "client_loop",
    requiredProofSource: "Booking availability validator",
    currentEvidenceSource: "booking-availability-loop validator",
    sourceCardId: "booking-availability-loop",
    statusRule: "Barber resolution must be explicit; missing proof is not Pass.",
    passRequirement: "Selected barber resolves from canonical barber id/profile evidence.",
    failureMeaning: "Booking may point availability at the wrong barber.",
    nextRepairLane: "product"
  },
  {
    id: "client-selected-service-resolution",
    label: "selected service resolution proof",
    lane: "Product",
    roleAffected: "Client",
    proofGroup: "client_loop",
    requiredProofSource: "Booking availability validator",
    currentEvidenceSource: "booking-availability-loop validator",
    sourceCardId: "booking-availability-loop",
    statusRule: "Service resolution must be explicit; missing proof is not Pass.",
    passRequirement: "Selected service resolves from active/bookable service evidence.",
    failureMeaning: "Booking may generate invalid availability or review state.",
    nextRepairLane: "product"
  },
  {
    id: "client-canonical-location-proof",
    label: "canonical location proof",
    lane: "Product",
    roleAffected: "Client",
    proofGroup: "client_loop",
    requiredProofSource: "Booking availability validator",
    currentEvidenceSource: "booking-availability-loop validator",
    sourceCardId: "booking-availability-loop",
    statusRule: "Canonical location proof must be connected after Culture entry.",
    passRequirement: "Booking availability uses the barber/service canonical location instead of a generic shop fallback.",
    failureMeaning: "Availability can show no slots despite real barber hours.",
    nextRepairLane: "product"
  },
  {
    id: "client-availability-slots",
    label: "availability slot generation proof",
    lane: "Product",
    roleAffected: "Client",
    proofGroup: "client_loop",
    requiredProofSource: "Canonical availability validator",
    currentEvidenceSource: "booking-availability-loop validator",
    sourceCardId: "booking-availability-loop",
    statusRule: "Availability proof must come from canonical slot engine evidence.",
    passRequirement: "Valid barber/service/date/location inputs generate real selectable slots.",
    failureMeaning: "Client cannot reliably select date/time.",
    nextRepairLane: "operations"
  },
  {
    id: "client-appointment-creation-proof",
    label: "appointment creation proof",
    lane: "Operations",
    roleAffected: "Client",
    proofGroup: "client_loop",
    requiredProofSource: "Culture-to-booking validator",
    currentEvidenceSource: "culture-to-booking-loop validator",
    sourceCardId: "culture-to-booking-loop",
    statusRule: "No appointment-creation proof means Needs Review.",
    passRequirement: "Booking confirmation creates exactly one appointment and calendar evidence sees it.",
    failureMeaning: "Client booking may not create reliable appointment truth.",
    nextRepairLane: "operations"
  },
  {
    id: "client-payment-refund-safety",
    label: "payment/refund safety proof",
    lane: "Finance",
    roleAffected: "Client",
    proofGroup: "client_loop",
    requiredProofSource: "Payment routing validator and refund evidence",
    currentEvidenceSource: "payment-routing-loop validator",
    sourceCardId: "payment-routing-loop",
    statusRule: "Payment/refund safety cannot Pass without server money evidence.",
    passRequirement: "Payment, routing, refund, and no-payout-before-completion evidence pass.",
    failureMeaning: "Client money trust can be unsafe or unverified.",
    nextRepairLane: "finance"
  },
  {
    id: "barber-profile-exists",
    label: "barber profile exists",
    lane: "Operations",
    roleAffected: "Barber",
    proofGroup: "barber_loop",
    requiredProofSource: "barber profile count",
    currentEvidenceSource: "CEO Barbers metric",
    sourceCardId: "ceo-barbers-total",
    statusRule: "Pass only from connected barber profile evidence.",
    passRequirement: "At least one canonical barber_user/barber profile is counted.",
    failureMeaning: "Architect cannot prove barber supply exists.",
    nextRepairLane: "operations"
  },
  {
    id: "barber-active-state-proof",
    label: "barber active state proof",
    lane: "Operations",
    roleAffected: "Barber",
    proofGroup: "barber_loop",
    requiredProofSource: "active barber read model",
    currentEvidenceSource: "CEO Active Barbers metric",
    sourceCardId: "ceo-active-barbers",
    statusRule: "Active barber proof requires connected supply evidence.",
    passRequirement: "Active barber count is read from canonical active relationship/profile evidence.",
    failureMeaning: "Barber activity may be invisible to owner/shop operations.",
    nextRepairLane: "operations"
  },
  {
    id: "barber-calendar-visibility",
    label: "barber calendar visibility proof",
    lane: "Operations",
    roleAffected: "Barber",
    proofGroup: "barber_loop",
    requiredProofSource: "Barber calendar validator",
    currentEvidenceSource: "barber-calendar-loop validator",
    sourceCardId: "barber-calendar-loop",
    statusRule: "Missing barber calendar proof keeps Barber loop Needs Review.",
    passRequirement: "Appointment appears on the barber command calendar.",
    failureMeaning: "Barber may not see appointments after booking.",
    nextRepairLane: "operations"
  },
  {
    id: "barber-appointment-visibility",
    label: "appointment visibility proof",
    lane: "Operations",
    roleAffected: "Barber",
    proofGroup: "barber_loop",
    requiredProofSource: "Barber calendar validator",
    currentEvidenceSource: "barber-calendar-loop validator",
    sourceCardId: "barber-calendar-loop",
    statusRule: "Appointment visibility must be explicitly proven.",
    passRequirement: "Barber can see their own appointment details in the command calendar.",
    failureMeaning: "Service preparation and calendar sync may be broken.",
    nextRepairLane: "operations"
  },
  {
    id: "barber-completion-action",
    label: "service completion action proof",
    lane: "Operations",
    roleAffected: "Barber",
    proofGroup: "barber_loop",
    requiredProofSource: "Barber calendar validator",
    currentEvidenceSource: "barber-calendar-loop validator",
    sourceCardId: "barber-calendar-loop",
    statusRule: "Completion action proof must separate barber and owner permissions.",
    passRequirement: "Barber sees Complete Service for own appointment and owner does not.",
    failureMeaning: "Service completion permission boundary may be unsafe.",
    nextRepairLane: "operations"
  },
  {
    id: "barber-checkout-payment-visibility",
    label: "checkout/payment visibility proof",
    lane: "Finance",
    roleAffected: "Barber",
    proofGroup: "barber_loop",
    requiredProofSource: "Payment health evidence",
    currentEvidenceSource: "finance-payment-health card",
    sourceCardId: "finance-payment-health",
    statusRule: "Checkout/payment visibility must follow server payment evidence.",
    passRequirement: "Payment health passes without UI-derived money truth.",
    failureMeaning: "Barber money posture may be inaccurate or unsafe.",
    nextRepairLane: "finance"
  },
  {
    id: "owner-account-exists",
    label: "shop owner account exists",
    lane: "Operations",
    roleAffected: "Shop Owner",
    proofGroup: "shop_owner_loop",
    requiredProofSource: "shop_owner profile count",
    currentEvidenceSource: "CEO Shop Owners metric",
    sourceCardId: "ceo-shop-owners-total",
    statusRule: "Pass only from canonical shop_owner_user evidence.",
    passRequirement: "At least one canonical shop_owner_user profile is counted.",
    failureMeaning: "Architect cannot prove owner accounts exist.",
    nextRepairLane: "operations"
  },
  {
    id: "owner-shop-exists",
    label: "shop exists",
    lane: "Operations",
    roleAffected: "Shop Owner",
    proofGroup: "shop_owner_loop",
    requiredProofSource: "active shop evidence",
    currentEvidenceSource: "CEO Active Shops metric",
    sourceCardId: "ceo-active-shops",
    statusRule: "Shop existence must come from connected shop evidence.",
    passRequirement: "Active shop count is connected and passing.",
    failureMeaning: "Owner command cannot be tied to shop floor truth.",
    nextRepairLane: "operations"
  },
  {
    id: "owner-team-relationship-proof",
    label: "team relationship proof",
    lane: "Operations",
    roleAffected: "Shop Owner",
    proofGroup: "shop_owner_loop",
    requiredProofSource: "Shop relationship validator",
    currentEvidenceSource: "shop-relationship-loop validator",
    sourceCardId: "shop-relationship-loop",
    statusRule: "Missing owner team proof keeps Owner loop Needs Review.",
    passRequirement: "Owner invite, barber acceptance, active owner Home sync, scoreboard, and role preservation all pass.",
    failureMeaning: "Owner may not see accepted barbers as active team.",
    nextRepairLane: "operations"
  },
  {
    id: "owner-active-barber-source-proof",
    label: "active barber source proof",
    lane: "Operations",
    roleAffected: "Shop Owner",
    proofGroup: "shop_owner_loop",
    requiredProofSource: "Owner command calendar validator",
    currentEvidenceSource: "owner-command-calendar-loop validator",
    sourceCardId: "owner-command-calendar-loop",
    statusRule: "Active barber math must be relationship-backed.",
    passRequirement: "Active barbers are counted from active relationships only.",
    failureMeaning: "Owner KPIs may count the wrong barbers.",
    nextRepairLane: "operations"
  },
  {
    id: "owner-pending-invite-exclusion",
    label: "pending invite exclusion proof",
    lane: "Operations",
    roleAffected: "Shop Owner",
    proofGroup: "shop_owner_loop",
    requiredProofSource: "Shop relationship validator",
    currentEvidenceSource: "shop-relationship-loop validator",
    sourceCardId: "shop-relationship-loop",
    statusRule: "Pending invite exclusion must be explicit.",
    passRequirement: "Pending invites are excluded from active counts and KPIs.",
    failureMeaning: "Owner Home may overstate active staff.",
    nextRepairLane: "operations"
  },
  {
    id: "owner-calendar-team-schedule",
    label: "owner calendar/team schedule proof",
    lane: "Operations",
    roleAffected: "Shop Owner",
    proofGroup: "shop_owner_loop",
    requiredProofSource: "Owner command calendar validator",
    currentEvidenceSource: "owner-command-calendar-loop validator",
    sourceCardId: "owner-command-calendar-loop",
    statusRule: "Owner schedule proof must be shop-wide and active-team scoped.",
    passRequirement: "Owner timeline is shop-wide and excludes owner-only Complete Service.",
    failureMeaning: "Owner command calendar may be incomplete or over-permissive.",
    nextRepairLane: "operations"
  },
  {
    id: "owner-shop-money-visibility",
    label: "shop money visibility proof",
    lane: "Finance",
    roleAffected: "Shop Owner",
    proofGroup: "shop_owner_loop",
    requiredProofSource: "Finance fee/routing evidence",
    currentEvidenceSource: "finance-fees card",
    sourceCardId: "finance-fees",
    statusRule: "Shop money visibility cannot Pass without routing math evidence.",
    passRequirement: "Shop production and fee posture are source-backed and not UI-derived.",
    failureMeaning: "Owner money surface may show unsupported totals.",
    nextRepairLane: "finance"
  },
  {
    id: "finance-payment-records",
    label: "payment records proof",
    lane: "Finance",
    roleAffected: "Platform",
    proofGroup: "money_loop",
    requiredProofSource: "payments table/read model",
    currentEvidenceSource: "finance-payment-health card",
    sourceCardId: "finance-payment-health",
    statusRule: "Payment records proof follows server/Supabase evidence.",
    passRequirement: "Payment existence and status truth pass.",
    failureMeaning: "Money posture cannot be trusted.",
    nextRepairLane: "finance"
  },
  {
    id: "finance-routing-records",
    label: "routing records proof",
    lane: "Finance",
    roleAffected: "Platform",
    proofGroup: "money_loop",
    requiredProofSource: "payment_routing_records",
    currentEvidenceSource: "finance-routing card",
    sourceCardId: "finance-routing",
    statusRule: "Routing proof must be ledger-backed.",
    passRequirement: "Routing records exist or expose clear safe failure state.",
    failureMeaning: "Payout and reconciliation readiness are unsafe.",
    nextRepairLane: "finance"
  },
  {
    id: "finance-refund-evidence",
    label: "refund evidence proof",
    lane: "Finance",
    roleAffected: "Platform",
    proofGroup: "money_loop",
    requiredProofSource: "refunds/platform events/payment status",
    currentEvidenceSource: "finance-refund-resolution card",
    sourceCardId: "finance-refund-resolution",
    statusRule: "Finance refund evidence can Pass independently while audit remains Failed.",
    passRequirement: "No active cancelled/captured refund targets remain and refund history is connected.",
    failureMeaning: "Cancelled/captured money may remain unresolved.",
    nextRepairLane: "finance"
  },
  {
    id: "finance-payout-execution-proof",
    label: "payout execution proof",
    lane: "Finance",
    roleAffected: "Platform",
    proofGroup: "money_loop",
    requiredProofSource: "payout_executions/payment routing guards",
    currentEvidenceSource: "finance-payout card",
    sourceCardId: "finance-payout",
    statusRule: "Payout execution proof must show no unsafe release.",
    passRequirement: "Payout release remains blocked until legal readiness evidence passes.",
    failureMeaning: "Money could be released before completion/readiness.",
    nextRepairLane: "finance"
  },
  {
    id: "finance-fee-posture",
    label: "fee posture proof",
    lane: "Finance",
    roleAffected: "Platform",
    proofGroup: "money_loop",
    requiredProofSource: "routing math/server fee evidence",
    currentEvidenceSource: "finance-fees card",
    sourceCardId: "finance-fees",
    statusRule: "Fee posture cannot be inferred from UI memory.",
    passRequirement: "Fee math is server-owned and evidence-backed.",
    failureMeaning: "Revenue/fee posture can be overstated or wrong.",
    nextRepairLane: "finance"
  },
  {
    id: "finance-audit-coverage-proof",
    label: "audit coverage proof",
    lane: "Finance",
    roleAffected: "Architect",
    proofGroup: "money_loop",
    requiredProofSource: "repair/audit/platform event evidence",
    currentEvidenceSource: "finance-repair-audit-coverage card",
    sourceCardId: "finance-repair-audit-coverage",
    statusRule: "Refund rows alone cannot fake full audit coverage.",
    passRequirement: "Controlled repair approvals, executions, verification, and score updates are audit-backed.",
    failureMeaning: "Finance can improve but cannot fully Pass without audit spine evidence.",
    nextRepairLane: "finance"
  },
  {
    id: "technology-current-commit",
    label: "current commit proof",
    lane: "Technology",
    roleAffected: "Platform",
    proofGroup: "deployment_loop",
    requiredProofSource: "deployment environment fingerprint",
    currentEvidenceSource: "runtime commit evidence",
    sourceCardId: "technology-current-commit-proof",
    statusRule: "Commit proof must be connected to deployed environment truth.",
    passRequirement: "Current production commit evidence is connected and passing.",
    failureMeaning: "Architect cannot prove which code is running.",
    nextRepairLane: "technology"
  },
  {
    id: "technology-current-deploy",
    label: "current deploy proof",
    lane: "Technology",
    roleAffected: "Platform",
    proofGroup: "deployment_loop",
    requiredProofSource: "Vercel deployment id/status",
    currentEvidenceSource: "deployment id evidence",
    sourceCardId: "technology-current-deploy-proof",
    statusRule: "Deployment proof stays Needs Review without Vercel status evidence.",
    passRequirement: "Production deployment id and READY status are connected.",
    failureMeaning: "Architect cannot prove production is on the expected deploy.",
    nextRepairLane: "technology"
  },
  {
    id: "technology-vercel-status",
    label: "Vercel/deployment status proof",
    lane: "Technology",
    roleAffected: "Platform",
    proofGroup: "deployment_loop",
    requiredProofSource: "Vercel check/deployment status",
    currentEvidenceSource: "deployment status evidence",
    sourceCardId: "technology-deployment-status-proof",
    statusRule: "Missing Vercel proof is not Pass.",
    passRequirement: "Vercel production deployment status is READY/success.",
    failureMeaning: "Release readiness could be stale or failed.",
    nextRepairLane: "technology"
  },
  {
    id: "technology-build-test-proof",
    label: "build/test proof",
    lane: "Technology",
    roleAffected: "Platform",
    proofGroup: "deployment_loop",
    requiredProofSource: "lint/typecheck/test/build evidence",
    currentEvidenceSource: "technology-build-tests card",
    sourceCardId: "technology-build-tests",
    statusRule: "Build/test proof requires explicit validation evidence.",
    passRequirement: "Targeted tests, lint, typecheck, and build are connected and passing.",
    failureMeaning: "Release health may not match the code in production.",
    nextRepairLane: "technology"
  },
  {
    id: "technology-schema-rls-proof",
    label: "schema/RLS proof",
    lane: "Technology",
    roleAffected: "Platform",
    proofGroup: "deployment_loop",
    requiredProofSource: "Supabase schema/RLS evidence",
    currentEvidenceSource: "technology-rls-disabled card",
    sourceCardId: "technology-rls-disabled",
    statusRule: "RLS disabled evidence forces Technology loop Failed.",
    passRequirement: "No release-blocking public RLS disabled evidence remains.",
    failureMeaning: "Database access posture is unsafe for V1.",
    nextRepairLane: "technology"
  },
  {
    id: "technology-api-route-proof",
    label: "API route proof",
    lane: "Technology",
    roleAffected: "Platform",
    proofGroup: "deployment_loop",
    requiredProofSource: "API route tests/runtime evidence",
    currentEvidenceSource: "technology-api card",
    sourceCardId: "technology-api",
    statusRule: "API route proof remains Needs Review until connected.",
    passRequirement: "Architect and V1 loop APIs are tested and runtime-safe.",
    failureMeaning: "Core loops may fail behind working UI.",
    nextRepairLane: "technology"
  },
  {
    id: "security-route-protection",
    label: "route protection proof",
    lane: "Security",
    roleAffected: "Platform",
    proofGroup: "security_loop",
    requiredProofSource: "route/API guard tests",
    currentEvidenceSource: "security-route-protection card",
    sourceCardId: "security-route-protection",
    statusRule: "Route protection proof must be explicit.",
    passRequirement: "Public roles cannot access Architect/internal surfaces.",
    failureMeaning: "Internal controls could leak to public users.",
    nextRepairLane: "security"
  },
  {
    id: "security-role-drift",
    label: "role drift proof",
    lane: "Security",
    roleAffected: "Platform",
    proofGroup: "security_loop",
    requiredProofSource: "profiles role audit",
    currentEvidenceSource: "security-role-drift card",
    sourceCardId: "security-role-drift",
    statusRule: "Role drift Failed forces Security and Compliance Failed.",
    passRequirement: "Public profile roles contain only approved canonical roles.",
    failureMeaning: "Role gates and trust/compliance logic can misclassify users.",
    nextRepairLane: "security"
  },
  {
    id: "security-rls-disabled",
    label: "RLS disabled table proof",
    lane: "Security",
    roleAffected: "Platform",
    proofGroup: "security_loop",
    requiredProofSource: "Supabase RLS audit",
    currentEvidenceSource: "security-rls-disabled card",
    sourceCardId: "security-rls-disabled",
    statusRule: "Security RLS Failed forces Security loop Failed.",
    passRequirement: "No release-blocking public table remains without RLS.",
    failureMeaning: "Production data access safety is not proven.",
    nextRepairLane: "security"
  },
  {
    id: "security-audit-trail",
    label: "audit trail proof",
    lane: "Security",
    roleAffected: "Architect",
    proofGroup: "security_loop",
    requiredProofSource: "audit logs/platform events",
    currentEvidenceSource: "security-audit card",
    sourceCardId: "security-audit",
    statusRule: "Audit trail evidence must be persisted, not UI memory.",
    passRequirement: "Security audit trail coverage is connected and passing.",
    failureMeaning: "Controlled actions cannot be traced.",
    nextRepairLane: "security"
  },
  {
    id: "compliance-policy-consent",
    label: "policy/consent proof",
    lane: "Compliance",
    roleAffected: "Platform",
    proofGroup: "security_loop",
    requiredProofSource: "policy/consent evidence",
    currentEvidenceSource: "compliance-policy card",
    sourceCardId: "compliance-policy",
    statusRule: "Policy proof remains Needs Review until source evidence is connected.",
    passRequirement: "Policy visibility and consent/opt-out readiness are source-backed.",
    failureMeaning: "Trust gates cannot be considered fully release-ready.",
    nextRepairLane: "compliance"
  },
  {
    id: "audit-spine-stage-coverage",
    label: "audit spine stage proof",
    lane: "Compliance",
    roleAffected: "Architect",
    proofGroup: "audit_loop",
    requiredProofSource: "approval, execution, verification, and score-impact audit spine",
    currentEvidenceSource: "audit-spine-coverage card",
    sourceCardId: "audit-spine-coverage",
    statusRule: "Audit Spine cannot Pass until every stage is persisted from existing evidence sources.",
    passRequirement: "Approval, execution, verification, and score-impact stages all pass without UI memory or refund-only shortcuts.",
    failureMeaning: "CEO cannot prove controlled repairs are governed end to end.",
    nextRepairLane: "compliance"
  },
  {
    id: "audit-repair-coverage",
    label: "repair audit coverage proof",
    lane: "Compliance",
    roleAffected: "Architect",
    proofGroup: "audit_loop",
    requiredProofSource: "controlled repair audit logs/platform events",
    currentEvidenceSource: "finance-repair-audit-coverage card",
    sourceCardId: "finance-repair-audit-coverage",
    statusRule: "Audit loop fails until repair audit coverage is connected.",
    passRequirement: "Repair approvals, executions, verification, and score updates have persisted evidence.",
    failureMeaning: "Mission Control cannot prove controlled repairs were authorized and verified.",
    nextRepairLane: "finance"
  },
  {
    id: "audit-security-trail",
    label: "security audit trail proof",
    lane: "Security",
    roleAffected: "Architect",
    proofGroup: "audit_loop",
    requiredProofSource: "audit_logs/platform_admin_audit_logs/platform_events",
    currentEvidenceSource: "security-audit card",
    sourceCardId: "security-audit",
    statusRule: "Audit rows must be persisted; empty audit_logs is Failed.",
    passRequirement: "Security audit source contains real persisted rows for controlled actions.",
    failureMeaning: "Architect cannot trace sensitive repair or control-plane behavior.",
    nextRepairLane: "security"
  },
  {
    id: "audit-refund-route-evidence",
    label: "refund route execution proof",
    lane: "Finance",
    roleAffected: "Architect",
    proofGroup: "audit_loop",
    requiredProofSource: "refund logs/platform events",
    currentEvidenceSource: "finance-refund-resolution card",
    sourceCardId: "finance-refund-resolution",
    statusRule: "Refund execution proof can Pass only from canonical refund/log evidence.",
    passRequirement: "Finance Logs contain full refund evidence and no active blockers.",
    failureMeaning: "Refund workflow completion cannot be proven.",
    nextRepairLane: "finance"
  }
];

function readinessMetadataForCard(card: Pick<MissionEvidenceCard, "id" | "label" | "workflow" | "department">): ReadinessMetadata {
  if (PARKED_CARD_IDS.has(card.id)) {
    return {
      scope: "parked",
      criticality: "informational",
      blocksCurrentRelease: false,
      evidenceRequiredForPass: `${card.label} is parked for a later release and must not be counted as V1 Pass until a real owner, source, and validator exist.`
    };
  }

  if (V3_FUTURE_CARD_IDS.has(card.id)) {
    return {
      scope: "v3_future",
      criticality: "informational",
      blocksCurrentRelease: false,
      evidenceRequiredForPass: `${card.label} is future AI/workforce scaffolding. It requires a clean evidence foundation before it can become release-blocking.`
    };
  }

  if (V2_INFRASTRUCTURE_CARD_IDS.has(card.id)) {
    return {
      scope: "v2_infrastructure",
      criticality: "important",
      blocksCurrentRelease: false,
      evidenceRequiredForPass: `${card.label} needs connected infrastructure evidence before it can be treated as implemented. It does not block V1 readiness unless explicitly promoted.`
    };
  }

  if (V1_CRITICAL_CARD_IDS.has(card.id)) {
    return {
      scope: "v1_required",
      criticality: "critical",
      blocksCurrentRelease: true,
      evidenceRequiredForPass: `${card.label} must report Pass from connected V1 evidence before the current release can be considered healthy.`
    };
  }

  return {
    scope: "v1_required",
    criticality: "important",
    blocksCurrentRelease: true,
    evidenceRequiredForPass: `${card.label} must report Pass from connected V1 evidence. Missing data remains Needs Review and failed data remains Failed.`
  };
}

function scopeEvidenceCard<T extends MissionEvidenceCard>(card: T): T {
  const metadata = readinessMetadataForCard(card);

  return {
    ...card,
    scope: card.scope ?? metadata.scope,
    criticality: card.criticality ?? metadata.criticality,
    blocksCurrentRelease: card.blocksCurrentRelease ?? metadata.blocksCurrentRelease,
    evidenceRequiredForPass: card.evidenceRequiredForPass ?? metadata.evidenceRequiredForPass
  };
}

function scopeEvidenceCards<T extends MissionEvidenceCard>(cards: T[]): T[] {
  return cards.map(scopeEvidenceCard);
}

export const MISSION_CONTROL_LANES: MissionControlLane[] = [
  { id: "ceo", label: "CEO", href: "/architect/ceo", purpose: "Global platform truth, risks, and executive decisions." },
  { id: "product", label: "Product", href: "/architect/product", purpose: "Client, Barber, Owner, Culture, and booking readiness." },
  { id: "technology", label: "Technology", href: "/architect/technology", purpose: "Deployments, tests, APIs, database health, and schema constraints." },
  { id: "operations", label: "Operations", href: "/architect/operations", purpose: "Appointments, calendars, shop relationships, kiosks, and command calendars." },
  { id: "finance", label: "Finance", href: "/architect/finance", purpose: "Payments, routing, payout readiness, fees, and money-risk posture." },
  { id: "marketing", label: "Marketing", href: "/architect/marketing", purpose: "Culture demand, attribution, referrals, and campaign readiness." },
  { id: "compliance", label: "Compliance", href: "/architect/compliance", purpose: "Verification, consent, integrity, trust gates, and policy visibility." },
  { id: "security", label: "Security", href: "/architect/security", purpose: "Role access, route protection, unsafe action prevention, and audit coverage." },
  { id: "content_community", label: "Content & Community", href: "/architect/content-community", purpose: "Culture moderation, reports, comments, creators, and community health." }
];

export const SOURCE_VAULT_CATEGORIES: SourceVaultCategory[] = [
  "Client doctrine",
  "Barber doctrine",
  "Shop Owner doctrine",
  "Architect doctrine",
  "Money Flow doctrine",
  "Security / Compliance doctrine",
  "Build doctrine",
  "AI / Hive future doctrine",
  "Design doctrine",
  "Operations doctrine",
  "Content / Community doctrine"
];

export const SOURCE_VAULT_REGISTRY: SourceVaultEntry[] = [
  sourceVaultEntry({
    id: "client-doctrine",
    sourceName: "Client Doctrine",
    category: "Client doctrine",
    sourceType: "private_reference",
    privacyClass: "confidential",
    roleLaneRelevance: ["client", "marketing"],
    versionDate: "Needs Review",
    storageLocation: "private://source-vault/client-doctrine",
    contentHash: "sha256:metadata-placeholder-client-doctrine",
    purpose: "Define client discovery, booking, loyalty, messaging, profile, and trust expectations.",
    linkedSystemArea: "Client/Product",
    ingestionStatus: "private_source_required",
    summary: "Metadata registered only. Private client doctrine must be reviewed before Source Vault can claim full V1 readiness.",
    topicTags: ["client", "booking", "discovery", "loyalty"],
    scope: "v1_required",
    linkedArchitectCardIds: ["product-client-health", "client_loop", "booking-posture"],
    critical: true,
    nextRepairLane: "product"
  }),
  sourceVaultEntry({
    id: "barber-doctrine",
    sourceName: "Barber Doctrine",
    category: "Barber doctrine",
    sourceType: "private_reference",
    privacyClass: "confidential",
    roleLaneRelevance: ["barber", "operations"],
    versionDate: "Needs Review",
    storageLocation: "private://source-vault/barber-doctrine",
    contentHash: "sha256:metadata-placeholder-barber-doctrine",
    purpose: "Define chair command, barber calendar, service completion, checkout, profile, and growth rules.",
    linkedSystemArea: "Barber/Operations",
    ingestionStatus: "private_source_required",
    summary: "Metadata registered only. Private barber doctrine must be connected without committing source files.",
    topicTags: ["barber", "chair-command", "calendar", "checkout"],
    scope: "v1_required",
    linkedArchitectCardIds: ["product-barber-health", "barber_loop", "operations-command-calendars"],
    critical: true,
    nextRepairLane: "operations"
  }),
  sourceVaultEntry({
    id: "shop-owner-doctrine",
    sourceName: "Shop Owner Doctrine",
    category: "Shop Owner doctrine",
    sourceType: "private_reference",
    privacyClass: "confidential",
    roleLaneRelevance: ["shop_owner", "operations", "finance"],
    versionDate: "Missing",
    storageLocation: "private://source-vault/shop-owner-doctrine",
    contentHash: "sha256:missing-shop-owner-doctrine",
    purpose: "Define shop command, active barber source truth, owner KPIs, team relationships, and shop money visibility.",
    linkedSystemArea: "Shop Owner/Operations",
    ingestionStatus: "missing",
    summary: "Required V1 shop owner doctrine is not connected. This must stay blocking until metadata/source reference exists.",
    topicTags: ["shop-owner", "team", "command-calendar", "kpi"],
    scope: "v1_required",
    linkedArchitectCardIds: ["product-owner-health", "shop_owner_loop", "owner-command-calendar-loop"],
    critical: true,
    nextRepairLane: "operations"
  }),
  sourceVaultEntry({
    id: "architect-doctrine",
    sourceName: "Architect Super Master Plan",
    category: "Architect doctrine",
    sourceType: "private_reference",
    privacyClass: "restricted",
    roleLaneRelevance: ["architect", "technology", "compliance"],
    versionDate: "2026-06",
    storageLocation: "private://source-vault/architect-super-master-plan",
    contentHash: "sha256:metadata-only-architect-super-master-plan",
    purpose: "Define Mission Control, evidence-led status, Source Vault, Action Registry, and Hive AI boundaries.",
    linkedSystemArea: "Architect/CEO",
    ingestionStatus: "ingested_metadata_only",
    summary: "Metadata-only reference is registered. Raw private strategy content is not committed.",
    topicTags: ["architect", "mission-control", "evidence", "guardrails"],
    scope: "v1_required",
    linkedArchitectCardIds: ["overall-platform-status", "source-vault-status", "technology-source-vault-readiness", "audit-spine-coverage"],
    critical: true,
    nextRepairLane: "technology"
  }),
  sourceVaultEntry({
    id: "money-flow-doctrine",
    sourceName: "Money Flow Doctrine",
    category: "Money Flow doctrine",
    sourceType: "private_reference",
    privacyClass: "restricted",
    roleLaneRelevance: ["finance", "security", "compliance"],
    versionDate: "Needs Review",
    storageLocation: "private://source-vault/money-flow-doctrine",
    contentHash: "sha256:metadata-placeholder-money-flow-doctrine",
    purpose: "Define payments, routing, refunds, payout readiness, fee posture, and money mutation guardrails.",
    linkedSystemArea: "Finance",
    ingestionStatus: "private_source_required",
    summary: "Money doctrine metadata is registered, but private money-flow source evidence still needs controlled review.",
    topicTags: ["payments", "routing", "refunds", "payouts"],
    scope: "v1_required",
    linkedArchitectCardIds: ["finance-payment-health", "finance-routing", "finance-refund-resolution", "finance-payout"],
    critical: true,
    nextRepairLane: "finance"
  }),
  sourceVaultEntry({
    id: "security-compliance-doctrine",
    sourceName: "Security / Compliance Doctrine",
    category: "Security / Compliance doctrine",
    sourceType: "private_reference",
    privacyClass: "restricted",
    roleLaneRelevance: ["security", "compliance", "technology"],
    versionDate: "Missing",
    storageLocation: "private://source-vault/security-compliance-doctrine",
    contentHash: "sha256:missing-security-compliance-doctrine",
    purpose: "Define role truth, RLS expectations, audit coverage, trust gates, policy visibility, and unsafe-action boundaries.",
    linkedSystemArea: "Security/Compliance",
    ingestionStatus: "missing",
    summary: "Required security/compliance doctrine is missing and must block V1 readiness until metadata/source reference exists.",
    topicTags: ["security", "compliance", "rls", "roles", "audit"],
    scope: "v1_required",
    linkedArchitectCardIds: ["security-role-truth-inventory", "security-rls-inventory", "compliance-role-truth-inventory"],
    critical: true,
    nextRepairLane: "security"
  }),
  sourceVaultEntry({
    id: "v1-master-build-template",
    sourceName: "BVRB3R V1 Master Build Template",
    category: "Build doctrine",
    sourceType: "private_reference",
    privacyClass: "restricted",
    roleLaneRelevance: ["architect", "technology", "compliance"],
    versionDate: "2026-06",
    storageLocation: "private://source-vault/v1-master-build-template",
    contentHash: "sha256:metadata-only-v1-master-build-template",
    purpose: "Govern Codex build doctrine: no fake Pass, no unsafe mutation, exact validation, and final report requirements.",
    linkedSystemArea: "Build/Architect",
    ingestionStatus: "ingested_metadata_only",
    summary: "Metadata-only doctrine reference is registered. The full private PDF is not committed to the repository.",
    topicTags: ["build", "codex", "validation", "pass-failed"],
    scope: "v1_required",
    linkedArchitectCardIds: ["source-vault-status", "technology-source-vault-readiness", "technology-coverage", "codex-packets"],
    critical: true,
    nextRepairLane: "technology"
  }),
  sourceVaultEntry({
    id: "hive-ai-future-doctrine",
    sourceName: "Hive AI Future Doctrine",
    category: "AI / Hive future doctrine",
    sourceType: "private_reference",
    privacyClass: "restricted",
    roleLaneRelevance: ["hive_ai_future", "architect"],
    versionDate: "Parked future",
    storageLocation: "private://source-vault/hive-ai-future-doctrine",
    contentHash: "sha256:parked-future-hive-ai-doctrine",
    purpose: "Define future Architect Prime, Officer Assistant, and agent autonomy boundaries after foundation blockers are clean.",
    linkedSystemArea: "Hive AI",
    ingestionStatus: "parked_future",
    summary: "Hive AI doctrine is parked for future work and does not reduce V1 readiness.",
    topicTags: ["hive-ai", "agents", "future"],
    scope: "v3_future",
    linkedArchitectCardIds: ["agent-status"],
    critical: false,
    nextRepairLane: "technology"
  }),
  sourceVaultEntry({
    id: "design-doctrine",
    sourceName: "Design Doctrine",
    category: "Design doctrine",
    sourceType: "private_reference",
    privacyClass: "internal",
    roleLaneRelevance: ["architect", "marketing"],
    versionDate: "Needs Review",
    storageLocation: "private://source-vault/design-doctrine",
    contentHash: "sha256:metadata-placeholder-design-doctrine",
    purpose: "Govern BVRB3R black-glass design language, role-dashboard parity, and premium UI standards.",
    linkedSystemArea: "Product/Design",
    ingestionStatus: "needs_review",
    summary: "Design doctrine is registered as metadata and needs source review before it can support design readiness claims.",
    topicTags: ["design", "ui", "role-dashboard", "polish"],
    scope: "v2_infrastructure",
    linkedArchitectCardIds: ["product-feature-readiness"],
    critical: false,
    nextRepairLane: "product"
  }),
  sourceVaultEntry({
    id: "operations-doctrine",
    sourceName: "Operations Doctrine",
    category: "Operations doctrine",
    sourceType: "private_reference",
    privacyClass: "confidential",
    roleLaneRelevance: ["operations", "barber", "shop_owner"],
    versionDate: "Needs Review",
    storageLocation: "private://source-vault/operations-doctrine",
    contentHash: "sha256:metadata-placeholder-operations-doctrine",
    purpose: "Define appointments, calendars, shop relationships, kiosk readiness, and command calendar operations.",
    linkedSystemArea: "Operations",
    ingestionStatus: "private_source_required",
    summary: "Operations doctrine source reference is required before operations proof can claim full V1 readiness.",
    topicTags: ["appointments", "calendar", "shop-relationships", "operations"],
    scope: "v1_required",
    linkedArchitectCardIds: ["operations-appointments", "operations-calendars", "operations-relationships"],
    critical: true,
    nextRepairLane: "operations"
  }),
  sourceVaultEntry({
    id: "content-community-doctrine",
    sourceName: "Content / Community Doctrine",
    category: "Content / Community doctrine",
    sourceType: "private_reference",
    privacyClass: "internal",
    roleLaneRelevance: ["content_community", "marketing", "client", "barber"],
    versionDate: "Needs Review",
    storageLocation: "private://source-vault/content-community-doctrine",
    contentHash: "sha256:metadata-placeholder-content-community-doctrine",
    purpose: "Define Culture feed, comments, reports, creator behavior, community signals, and content health rules.",
    linkedSystemArea: "Content & Community",
    ingestionStatus: "private_source_required",
    summary: "Content/community doctrine metadata is registered, but private source review remains required.",
    topicTags: ["culture", "comments", "reports", "community"],
    scope: "v1_required",
    linkedArchitectCardIds: ["community-comments", "community-health", "marketing-culture-feed"],
    critical: false,
    nextRepairLane: "content_community"
  })
];

type SourceVaultEntryInput = Omit<
  SourceVaultEntry,
  "status" | "evidenceStatus" | "failureMeaning" | "staleOrMissingEvidenceState" | "rawContentCommitted"
> & Partial<Pick<SourceVaultEntry, "status" | "evidenceStatus" | "failureMeaning" | "staleOrMissingEvidenceState" | "rawContentCommitted">>;

function sourceVaultEntry(input: SourceVaultEntryInput): SourceVaultEntry {
  const evidenceStatus = input.evidenceStatus ?? inferSourceVaultEntryStatus(input);

  return {
    ...input,
    rawContentCommitted: input.rawContentCommitted ?? false,
    evidenceStatus,
    status: input.status ?? sourceVaultStatusLabel(evidenceStatus),
    failureMeaning: input.failureMeaning ?? sourceVaultFailureMeaning(input, evidenceStatus),
    staleOrMissingEvidenceState: input.staleOrMissingEvidenceState ?? sourceVaultMissingEvidence(input, evidenceStatus)
  };
}

function inferSourceVaultEntryStatus(entry: SourceVaultEntryInput): SourceVaultEvidenceStatus {
  if (entry.scope === "parked" || entry.scope === "v3_future" || entry.ingestionStatus === "parked_future") return "Parked";
  if ((entry.privacyClass === "confidential" || entry.privacyClass === "restricted") && entry.rawContentCommitted) return "Failed";
  if (entry.ingestionStatus === "missing") return entry.scope === "v1_required" && entry.critical ? "Failed" : "Needs Review";
  if (entry.ingestionStatus === "private_source_required") return "Needs Review";
  if (entry.ingestionStatus === "needs_review" || entry.ingestionStatus === "registered") return "Needs Review";
  if (entry.ingestionStatus === "ingested_metadata_only") {
    const hasRequiredMetadata = Boolean(
      entry.id
      && entry.sourceName
      && entry.category
      && entry.sourceType
      && entry.privacyClass
      && entry.storageLocation
      && entry.contentHash
      && entry.summary
      && entry.topicTags.length
      && entry.linkedArchitectCardIds.length
    );

    return hasRequiredMetadata ? "Pass" : "Needs Review";
  }

  return "Needs Review";
}

function sourceVaultStatusLabel(status: SourceVaultEvidenceStatus): SourceVaultEntry["status"] {
  if (status === "Pass") return "Active";
  if (status === "Parked") return "Parked";
  if (status === "Failed") return "Missing";
  return "Needs Review";
}

function sourceVaultFailureMeaning(entry: SourceVaultEntryInput, status: SourceVaultEvidenceStatus) {
  if (status === "Pass") return `${entry.sourceName} has complete metadata-only evidence. Raw source content is not required in the repo.`;
  if (status === "Parked") return `${entry.sourceName} is parked/future-scaffolded and does not block V1 readiness.`;
  if ((entry.privacyClass === "confidential" || entry.privacyClass === "restricted") && entry.rawContentCommitted) {
    return `${entry.sourceName} would expose private source content and must fail until raw content is removed.`;
  }
  if (entry.ingestionStatus === "missing") return `${entry.sourceName} is required but missing from connected Source Vault metadata.`;
  if (entry.ingestionStatus === "private_source_required") return `${entry.sourceName} requires private source review before it can support a Pass state.`;
  if (entry.ingestionStatus === "registered") return `${entry.sourceName} is only registered and cannot fake ingestion readiness.`;

  return `${entry.sourceName} needs metadata/source evidence review before it can Pass.`;
}

function sourceVaultMissingEvidence(entry: SourceVaultEntryInput, status: SourceVaultEvidenceStatus) {
  const missing: string[] = [];

  if (status === "Pass" || status === "Parked") return missing;
  if (entry.ingestionStatus === "missing") missing.push("Required source reference is missing.");
  if (entry.ingestionStatus === "registered") missing.push("Registered title alone is not ingestion evidence.");
  if (entry.ingestionStatus === "private_source_required") missing.push("Private source must be reviewed from private storage; do not commit the file.");
  if (entry.ingestionStatus === "needs_review") missing.push("Metadata exists but needs source-owner review.");
  if ((entry.privacyClass === "confidential" || entry.privacyClass === "restricted") && entry.rawContentCommitted) missing.push("Confidential/restricted raw content must not be committed.");
  if (!entry.contentHash || entry.contentHash.includes("missing")) missing.push("Checksum placeholder is missing or unresolved.");
  if (!entry.linkedArchitectCardIds.length) missing.push("Linked Architect card IDs are not connected.");

  return missing.length ? missing : ["Source Vault evidence is incomplete."];
}

export const ACTION_REGISTRY: ActionRegistryEntry[] = [
  { id: "inspect-booking", label: "Inspect booking", riskClass: "Safe read-only", department: "Operations", description: "Read booking state and related appointment evidence.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "inspect-appointment", label: "Inspect appointment", riskClass: "Safe read-only", department: "Operations", description: "Read appointment, service, calendar, and status-history evidence.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "inspect-payment", label: "Inspect payment", riskClass: "Safe read-only", department: "Finance", description: "Read payment and routing evidence without money mutation.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "inspect-shop-relationship", label: "Inspect shop relationship", riskClass: "Safe read-only", department: "Operations", description: "Read shop/barber relationship and owner-home sync evidence.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "inspect-culture-post", label: "Inspect Culture post", riskClass: "Safe read-only", department: "Content & Community", description: "Read public Culture post, author, engagement, and report evidence.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "inspect-deployment-status", label: "Inspect deployment status", riskClass: "Safe read-only", department: "Technology", description: "Read deployment fingerprint and regression posture.", allowed: true, approvalRequired: false, status: "Needs Review" },
  { id: "inspect-regression-status", label: "Inspect regression status", riskClass: "Safe read-only", department: "Technology", description: "Read known regression coverage without claiming health from absence of data.", allowed: true, approvalRequired: false, status: "Needs Review" },
  { id: "generate-codex-packet", label: "Generate Codex packet", riskClass: "Safe low-risk", department: "Technology", description: "Draft a patch packet with symptom, evidence, files, tests, and no-touch rules.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "generate-sql-diagnostic", label: "Generate SQL diagnostic snippet", riskClass: "Safe low-risk", department: "Technology", description: "Draft read-only SQL diagnostics for Architect review.", allowed: true, approvalRequired: false, status: "Pass" },
  { id: "validate-production-health", label: "Validate production health", riskClass: "Safe low-risk", department: "CEO", description: "Run read-only validators and persist validation evidence when supported.", allowed: true, approvalRequired: false, status: "Needs Review" },
  { id: "repair-missing-routing", label: "Repair missing routing", riskClass: "Needs approval", department: "Finance", description: "Repair a missing routing ledger only through guarded, schema-aware code paths.", allowed: true, approvalRequired: true, status: "Warning" },
  { id: "repair-status-history", label: "Repair missing status history", riskClass: "Needs approval", department: "Operations", description: "Repair lifecycle history only after appointment truth is confirmed.", allowed: false, approvalRequired: true, status: "Needs Review" },
  { id: "send-user-notification", label: "Send user notification", riskClass: "Needs approval", department: "Marketing", description: "Draft or send user-facing notices only after executive approval.", allowed: false, approvalRequired: true, status: "Needs Review" },
  { id: "run-deployment-action", label: "Run deployment action", riskClass: "Needs approval", department: "Technology", description: "Promote or roll back deployments only with explicit approval.", allowed: false, approvalRequired: true, status: "Needs Review" },
  { id: "refund", label: "Refund", riskClass: "Unsafe / blocked", department: "Finance", description: "Blocked in Architect v1. Requires Stripe truth and explicit future workflow.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "payout-release", label: "Payout release", riskClass: "Unsafe / blocked", department: "Finance", description: "Blocked in Architect v1. Never release payout from repair/debug flows.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "mutate-role", label: "Mutate role", riskClass: "Unsafe / blocked", department: "Security", description: "Blocked. Shop relationships must not mutate account role identity.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "delete-appointment", label: "Delete appointment", riskClass: "Unsafe / blocked", department: "Operations", description: "Blocked. Appointment deletion is not a Mission Control repair.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "change-payment-status", label: "Change payment status without Stripe truth", riskClass: "Unsafe / blocked", department: "Finance", description: "Blocked. Payment status must follow provider truth.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "change-money-rules", label: "Change commission or booth-rent rules", riskClass: "Unsafe / blocked", department: "Finance", description: "Blocked. Money-rule mutation is an executive/product change, not a repair.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "change-production-schema", label: "Change production schema", riskClass: "Unsafe / blocked", department: "Technology", description: "Blocked from v1 UI. Schema work requires migration review.", allowed: false, approvalRequired: true, status: "Failed" },
  { id: "accept-shop-relationship-for-barber", label: "Accept shop relationship on behalf of barber", riskClass: "Unsafe / blocked", department: "Operations", description: "Blocked. Barber consent is required for active shop membership.", allowed: false, approvalRequired: true, status: "Failed" }
];

export const OFFICER_ASSISTANT_DEPARTMENTS: MissionDepartment[] = [
  "CEO",
  "Product",
  "Technology",
  "Operations",
  "Finance",
  "Marketing",
  "Compliance",
  "Security",
  "Content & Community"
];

export const OFFICER_CLEANUP_GUARDRAILS = [
  "Officer Assistants organize lane evidence and draft next actions only.",
  "Officer Assistants do not mutate money, payouts, refunds, routing, roles, team relationships, schema, deployments, or issue status.",
  "Missing officer evidence stays Needs Review / Not connected.",
  "Prompt generation or officer review never marks an issue Pass by itself."
];
export const AUDIT_COVERAGE_PLAN = [
  {
    stage: "Repair approvals",
    requirement: "Every controlled repair or refund approval must write who approved it, exact target ids, reason, amount when money is involved, and timestamp before execution."
  },
  {
    stage: "Repair executions",
    requirement: "Every execution must write route/function name, request target, result, safe error, and whether any external provider action was called."
  },
  {
    stage: "Repair verification",
    requirement: "Every verification must write before/after evidence, no-payout-release checks, and whether the blocker cleared or stayed Failed."
  },
  {
    stage: "Score updates",
    requirement: "Every readiness score change must be traceable to connected evidence, not prompt generation, UI action display, or missing data."
  }
];

export function getAuditCoveragePlanEvidence() {
  return AUDIT_COVERAGE_PLAN.map((item) => `${item.stage}: ${item.requirement}`);
}

export const HIVE_AGENT_REGISTRY: HiveAgentEntry[] = [
  { id: "architect-prime", name: "Architect Prime", department: "Architect Prime", agentClass: "Architect Prime", job: "Govern the intelligence layer and keep Mission Control evidence-backed.", dataAccess: "Architect registry, incidents, validators, source vault.", actionAccess: "Read-only review and packet drafting.", autonomyLevel: "Level 0 Read-only", successMetric: "No fake Pass states and no unsafe actions.", failureRule: "Escalate when evidence is missing or money/account mutation is requested.", currentStatus: "Needs Review", evidencePolicy: "Aggregate Mission Control evidence without inventing health.", mutationBoundary: "No app, money, account, team, schema, deployment, or issue-status mutation.", passRule: "Pass only after connected validators and tests prove the system is healthy." },
  { id: "client-manager", name: "Client Manager", department: "Product", agentClass: "Role Manager Agent", job: "Watch client booking, saving, comments, and trust loops.", dataAccess: "Client-safe workflow evidence.", actionAccess: "Draft recommendations only.", autonomyLevel: "Level 1 Draft mode", successMetric: "Client loop regressions are surfaced with evidence.", failureRule: "Do not unlock client posting or mutate booking state.", currentStatus: "Needs Review", evidencePolicy: "Use role-safe client evidence only; missing data stays Needs Review.", mutationBoundary: "No client account, booking, posting, or payment mutation.", passRule: "Pass only from verified client loop evidence." },
  { id: "barber-growth-manager", name: "Barber Growth Manager", department: "Operations", agentClass: "Role Manager Agent", job: "Watch barber chair command, services, availability, and calendar readiness.", dataAccess: "Barber workflow and calendar evidence.", actionAccess: "Draft recommendations only.", autonomyLevel: "Level 1 Draft mode", successMetric: "Bookable barber blockers are detected.", failureRule: "Do not complete services or mutate availability.", currentStatus: "Needs Review", evidencePolicy: "Use barber workflow evidence; missing service or calendar evidence stays Needs Review.", mutationBoundary: "No service completion, availability, payout, or profile mutation.", passRule: "Pass only from verified barber loop evidence." },
  { id: "shop-owner-manager", name: "Shop Owner Manager", department: "Operations", agentClass: "Role Manager Agent", job: "Watch shop command calendar, active team, owner KPIs, and relationship sync.", dataAccess: "Shop relationship and owner-home evidence.", actionAccess: "Draft recommendations only.", autonomyLevel: "Level 1 Draft mode", successMetric: "Owner active-barber sync issues are detected.", failureRule: "Do not accept barber invites or mutate roles.", currentStatus: "Needs Review", evidencePolicy: "Use owner/team evidence from canonical relationships; pending invites are not active.", mutationBoundary: "No invite acceptance, role mutation, KPI override, or team mutation.", passRule: "Pass only from verified owner command evidence." },
  { id: "architect-manager", name: "Architect Manager", department: "Technology", agentClass: "Role Manager Agent", job: "Watch Architect route protection, debug tooling, and packet quality.", dataAccess: "Architect routes, incidents, tests, and validators.", actionAccess: "Read-only and packet generation.", autonomyLevel: "Level 0 Read-only", successMetric: "Architect remains gated and evidence-backed.", failureRule: "Block unsafe repairs.", currentStatus: "Needs Review", evidencePolicy: "Use Architect route, test, and validator evidence only.", mutationBoundary: "No public UX, role, schema, deployment, or issue-status mutation.", passRule: "Pass only from protected-route and validator proof." },
  { id: "booking-monitor-agent", name: "Booking Monitor Agent", department: "Operations", agentClass: "Workflow Agent", job: "Watch Culture-to-booking, service selection, availability, and calendar sync.", dataAccess: "Booking loop evidence.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Booking regressions are classified before release.", failureRule: "Do not create appointments.", currentStatus: "Needs Review", evidencePolicy: "Use booking lifecycle evidence; no appointment before final confirmation.", mutationBoundary: "No appointment, service, availability, payment, or attribution mutation.", passRule: "Pass only from booking regression proof." },
  { id: "payment-routing-agent", name: "Payment Routing Agent", department: "Finance", agentClass: "Workflow Agent", job: "Watch captured payments, routing rows, status history, and payout readiness.", dataAccess: "Payment and routing evidence.", actionAccess: "Read-only diagnostics; guarded repair packet only.", autonomyLevel: "Level 0 Read-only", successMetric: "No captured money lacks a business object.", failureRule: "Never release payout, refund, or override Stripe truth.", currentStatus: "Needs Review", evidencePolicy: "Use Stripe/server/Supabase/ledger truth; failed money evidence stays Failed.", mutationBoundary: "No payout release, refund, dispute, routing guess, or payment status mutation.", passRule: "Pass only from reconciled finance evidence and regression coverage." },
  { id: "culture-health-agent", name: "Culture Health Agent", department: "Content & Community", agentClass: "Workflow Agent", job: "Watch Culture posts, author identity, comments, reports, and booking CTAs.", dataAccess: "Culture-safe public post evidence.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Social loop regressions are surfaced.", failureRule: "Do not create fake posts, counts, or promotions.", currentStatus: "Needs Review", evidencePolicy: "Use public, approved, non-deleted Culture evidence only.", mutationBoundary: "No fake posts, fake counts, promotion billing, comments backend, or feed mutation.", passRule: "Pass only from verified Culture social loop evidence." },
  { id: "shop-relationship-agent", name: "Shop Relationship Agent", department: "Operations", agentClass: "Workflow Agent", job: "Watch owner invites, barber acceptance, active relationships, and owner sync.", dataAccess: "Shop relationship evidence.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Accepted barbers appear in owner read models.", failureRule: "Do not accept invites for barbers.", currentStatus: "Needs Review", evidencePolicy: "Use canonical active relationship evidence; pending invites do not count.", mutationBoundary: "No invite acceptance, relationship status change, role mutation, or owner KPI override.", passRule: "Pass only from accepted relationship and owner sync proof." },
  { id: "calendar-sync-agent", name: "Calendar Sync Agent", department: "Operations", agentClass: "Workflow Agent", job: "Watch appointment visibility across client confirmation, barber calendar, and owner timeline.", dataAccess: "Calendar and appointment evidence.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Calendar mismatches become incidents.", failureRule: "Do not mutate appointments.", currentStatus: "Needs Review", evidencePolicy: "Use appointment/calendar read evidence only.", mutationBoundary: "No appointment creation, deletion, completion, reschedule, or owner completion action.", passRule: "Pass only from client/barber/owner calendar visibility proof." },
  { id: "kiosk-flow-agent", name: "Kiosk Flow Agent", department: "Operations", agentClass: "Workflow Agent", job: "Watch kiosk readiness without changing kiosk internals.", dataAccess: "Kiosk status evidence when available.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Kiosk blockers are visible.", failureRule: "Do not change kiosk internals.", currentStatus: "Needs Review", evidencePolicy: "Use connected kiosk readiness evidence only.", mutationBoundary: "No kiosk mode, checkout, payment, or settings mutation.", passRule: "Pass only from verified kiosk readiness evidence." },
  { id: "verification-agent", name: "Verification Agent", department: "Compliance", agentClass: "Workflow Agent", job: "Watch account verification and trust gates.", dataAccess: "Verification queue evidence.", actionAccess: "Read-only diagnostics.", autonomyLevel: "Level 0 Read-only", successMetric: "Trust-gate blockers are surfaced.", failureRule: "Do not approve or reject users automatically.", currentStatus: "Needs Review", evidencePolicy: "Use trust gate evidence only; missing policy proof stays Needs Review.", mutationBoundary: "No verification approval, rejection, restriction, or document mutation.", passRule: "Pass only from verified trust-gate evidence." },
  { id: "revenue-recovery-agent", name: "Revenue Recovery Agent", department: "Finance", agentClass: "Workflow Agent", job: "Placeholder for missed revenue and failed payment recovery.", dataAccess: "Finance evidence only when implemented.", actionAccess: "Draft mode only.", autonomyLevel: "Level 1 Draft mode", successMetric: "Future recovery opportunities are documented.", failureRule: "No payment actions, refunds, or payout release.", currentStatus: "Needs Review", evidencePolicy: "Use finance evidence only after recovery signals are implemented.", mutationBoundary: "No charges, retries, refunds, disputes, payout release, or customer notification.", passRule: "Pass only after recovery evidence exists and is verified." },
  { id: "retention-agent", name: "Retention Agent", department: "Marketing", agentClass: "Workflow Agent", job: "Placeholder for retention insights and creator/client engagement.", dataAccess: "Aggregated engagement evidence only when implemented.", actionAccess: "Draft mode only.", autonomyLevel: "Level 1 Draft mode", successMetric: "Future retention signals are documented.", failureRule: "No manipulative notifications or fake urgency.", currentStatus: "Needs Review", evidencePolicy: "Use real engagement/retention signals only after implementation.", mutationBoundary: "No notification send, campaign launch, ranking manipulation, or fake urgency.", passRule: "Pass only after retention signals are connected and verified." },
  ...OFFICER_ASSISTANT_DEPARTMENTS.map((department) => ({
    id: `${department.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-assistant`,
    name: `${department} Assistant`,
    department,
    agentClass: "Officer Assistant" as const,
    job: `Organize ${department} evidence and draft next actions for Architect review.`,
    dataAccess: `${department} lane evidence cards and validator status.`,
    actionAccess: "Read-only evidence review and draft recommendations. No repair or mutation.",
    autonomyLevel: "Level 1 Draft mode" as const,
    successMetric: `${department} risks are summarized without fake health claims.`,
    failureRule: department === "Finance"
      ? "Escalate payment, routing, payout, refund, and fee evidence gaps without mutating money."
      : "Escalate missing data as Needs Review.",
    evidencePolicy: `${department} Assistant can summarize only connected ${department} evidence; missing data stays Needs Review / Not connected.`,
    mutationBoundary: "No app, money, user, team, schema, deployment, or issue-status mutation.",
    passRule: "Can only report Pass when source cards already report Pass with connected evidence.",
    currentStatus: "Needs Review" as const
  }))
];

export function getOfficerAssistants(agentRegistry: HiveAgentEntry[] = HIVE_AGENT_REGISTRY) {
  return agentRegistry.filter((agent) => agent.agentClass === "Officer Assistant");
}

export function getOfficerCleanupEvidence(agentRegistry: HiveAgentEntry[] = HIVE_AGENT_REGISTRY) {
  const officerAssistants = getOfficerAssistants(agentRegistry);
  const nonCompliant = officerAssistants.filter((agent) =>
    !["Level 0 Read-only", "Level 1 Draft mode"].includes(agent.autonomyLevel) ||
    !agent.actionAccess.toLowerCase().includes("read-only") ||
    !agent.mutationBoundary?.toLowerCase().includes("no app, money")
  );

  return [
    `${officerAssistants.length} Officer Assistant(s) registered for ${OFFICER_ASSISTANT_DEPARTMENTS.join(", ")}.`,
    nonCompliant.length
      ? `${nonCompliant.length} Officer Assistant(s) need cleanup before they can be trusted.`
      : "All Officer Assistants are Level 1 Draft mode with read-only evidence access.",
    ...OFFICER_CLEANUP_GUARDRAILS
  ];
}

export const MISSION_INCIDENT_DEFINITIONS: MissionIncidentDefinition[] = [
  incidentDefinition("culture_social_loop_failed", "Content & Community", "Culture Social Loop", "Culture feed, author identity, comments, or engagement evidence failed.", "broken", false, true, ["public Culture post safety", "author identity hydration", "comment/engagement route health", "book CTA eligibility"]),
  incidentDefinition("culture_booking_bridge_failed", "Marketing", "Culture-to-Booking Loop", "Culture attention is not converting into a safe booking entry.", "critical", false, true, ["CTA route attribution", "booking state attribution", "appointment creation", "barber calendar visibility"]),
  incidentDefinition("booking_slot_generation_failed", "Operations", "Booking Availability Loop", "Booking availability inputs do not produce expected real slots.", "critical", false, true, ["barber id", "service id", "location id", "availability rules", "blocked time and appointment filters"]),
  incidentDefinition("barber_calendar_missing_appointment", "Operations", "Barber Calendar Loop", "Created appointment is missing from barber command calendar.", "critical", false, true, ["appointment row", "calendar query", "barber id", "selected date"]),
  incidentDefinition("shop_relationship_accept_failed", "Operations", "Shop Relationship Loop", "Barber acceptance did not activate the canonical shop relationship.", "critical", false, true, ["relationship row", "approved_by_barber_at", "status", "owner read model"]),
  incidentDefinition("owner_active_barber_sync_failed", "Operations", "Owner Command Calendar Loop", "Accepted active barber is missing from owner Home read models.", "critical", false, true, ["active relationship", "owner active count", "scoreboard", "shop labels"]),
  incidentDefinition("owner_kpi_mismatch", "Operations", "Owner KPI Aggregation", "Owner shop KPIs do not match active shop-barber truth.", "broken", false, true, ["active relationships only", "pending excluded", "shop-context production only"]),
  incidentDefinition("payment_routing_missing", "Finance", "Payment/Routing Loop", "Completed paid appointment or paid POS sale is missing routing.", "critical", true, true, ["appointment/payment truth", "routing row", "schema constraints", "no payout release"]),
  incidentDefinition("cancelled_captured_refund_unresolved", "Finance", "Cancelled/Captured Refund Resolution", "Captured payment remains attached to a cancelled appointment without refund or reversal evidence.", "critical", false, true, ["cancelled appointment", "captured payment", "refund/reversal evidence", "routing remains blocked/manual_review", "no payout release"]),
  incidentDefinition("payout_constraint_mismatch", "Finance", "Payout Eligibility", "Routing exists but payout readiness or constraints are inconsistent.", "broken", false, true, ["readiness legal values", "eligible meaning", "released_at remains null"]),
  incidentDefinition("deployment_pending_or_failed", "Technology", "Deployment Health", "Deployment metadata is missing, pending, or failed.", "broken", false, true, ["commit hash", "deployment id", "branch", "build time"]),
  incidentDefinition("regression_test_missing", "Technology", "Regression Coverage", "A production loop lacks a matching regression test.", "warning", false, true, ["test file exists", "fixture covers loop", "validation command documented"]),
  incidentDefinition("schema_constraint_mismatch", "Technology", "Schema Constraints", "Runtime code attempted values rejected by production schema constraints.", "critical", false, true, ["constraint evidence", "legal values", "repair payload values"]),
  incidentDefinition("unsafe_repair_requested", "Security", "Unsafe Action Prevention", "A requested action would mutate money, roles, production schema, or consent-owned state unsafely.", "critical", false, false, ["blocked action", "reason", "approval boundary"])
];

export const CODEX_FAILURE_CLASSES: CodexFailureClass[] = [
  failureClass("culture_booking_bridge_failed", "Culture booking bridge failure", ["Marketing", "Operations"], ["components/culture/culture-post-card.tsx", "lib/culture/service.ts", "components/booking/booking-form.tsx", "app/api/bookings/route.ts"], ["culture_posts", "appointments"], ["Culture feed layout", "Stripe/payment internals", "payout release logic", "appointment completion internals"], ["Culture CTA attribution test", "booking state attribution test", "calendar visibility regression"], ["npm run typecheck", "targeted Culture booking CTA tests", "targeted booking/calendar regression tests", "npm run build"]),
  failureClass("booking_slot_generation_failed", "Booking slot generation failure", ["Operations", "Technology"], ["components/booking/booking-form.tsx", "lib/booking/availability-slot-engine.ts", "app/api/barbers/[id]/availability/route.ts"], ["availability_rules", "appointments", "blocked_times", "services"], ["Culture feed UI", "Stripe/payment internals", "appointment final creation"], ["Sunday availability slot test", "location resolution test", "find next available test"], ["npm run typecheck", "targeted availability tests", "targeted booking form tests", "npm run build"]),
  failureClass("barber_calendar_missing_appointment", "Barber calendar missing appointment", ["Operations"], ["components/operations/barber-schedule-workspace.tsx", "app/api/bookings/route.ts", "lib/booking/platform-service.ts"], ["appointments", "appointment_status_history"], ["payment capture", "payout routing", "Culture feed UI"], ["booking-to-calendar regression", "barber timeline test"], ["npm run typecheck", "targeted booking/calendar tests", "npm run build"]),
  failureClass("shop_relationship_accept_failed", "Shop relationship active sync failure", ["Operations"], ["components/barber-experience/barber-settings-screen.tsx", "lib/operations/shop-team-invites.ts", "components/operations/owner-team-workspace.tsx"], ["shop_barber_relationships", "staff_locations", "shops", "barbers"], ["profiles.role", "booking engine", "Stripe", "payout routing"], ["shop relationship accept test", "owner active barber read-model test"], ["npm run typecheck", "targeted shop relationship tests", "targeted owner tests", "npm run build"]),
  failureClass("owner_active_barber_sync_failed", "Owner active barber sync failure", ["Operations"], ["components/operations/owner-team-workspace.tsx", "lib/operations/shop-team-invites.ts", "lib/booking/platform-service.ts"], ["shop_barber_relationships", "staff_locations", "appointments"], ["profiles.role", "appointment completion logic", "old freelance appointment ownership"], ["accepted relationship count test", "owner scoreboard test", "owner KPI active-only test"], ["npm run typecheck", "targeted owner command calendar tests", "npm run build"]),
  failureClass("owner_kpi_mismatch", "Owner KPI mismatch", ["Operations", "Finance"], ["components/operations/owner-team-workspace.tsx", "lib/booking/platform-service.ts"], ["appointments", "shop_barber_relationships", "payment_routing_records"], ["payout release", "Stripe", "appointment completion"], ["owner KPI aggregation test", "pending invite exclusion test"], ["npm run typecheck", "targeted owner tests", "npm run build"]),
  failureClass("payment_routing_missing", "Payment routing missing", ["Finance", "Technology"], ["lib/architect/repairs/payment-routing-repair.ts", "lib/architect/mission-control/schema-constraints.ts", "app/api/architect/repairs/payment-routing/route.ts"], ["appointments", "payments", "payment_routing_records", "appointment_status_history"], ["booking creation", "Stripe booking charge", "payout release", "client discovery"], ["architect routing repair test", "payment routing incident test", "payout completion regression"], ["npm run typecheck", "targeted Architect routing tests", "npm run build"]),
  failureClass("cancelled_captured_refund_unresolved", "Cancelled/captured refund unresolved", ["Finance"], ["components/architect/mission-control/mission-control.tsx", "app/api/payments/[paymentId]/refund/route.ts", "lib/payments/service.ts"], ["appointments", "payments", "refunds", "payment_routing_records", "payout_executions", "audit_logs"], ["raw SQL refund mutation", "direct Stripe calls outside canonical route", "payout release", "appointment lifecycle changes", "role/RLS/migration changes"], ["cancelled captured refund blocker incident test", "controlled refund UI guard test", "payment route refund test"], ["npm run typecheck", "targeted Architect Mission Control tests", "targeted payments route tests", "npm run build"]),
  failureClass("payout_constraint_mismatch", "Payout constraint mismatch", ["Finance", "Technology"], ["lib/architect/mission-control/schema-constraints.ts", "lib/architect/repairs/payment-routing-repair.ts"], ["payment_routing_records", "information_schema.check_constraints"], ["payout release", "Stripe payment status", "commission/booth-rent rules"], ["schema constraint debug test", "routing repair constraint test"], ["npm run typecheck", "targeted schema constraint tests", "npm run build"]),
  failureClass("deployment_pending_or_failed", "Deployment mismatch", ["Technology"], ["app/api/architect/mission-control/route.ts", "lib/architect/debug/env.ts"], [], ["application feature UX", "database schema", "payment internals"], ["deployment debug test", "Mission Control status test"], ["npm run typecheck", "targeted Architect deployment tests", "npm run build"]),
  failureClass("regression_test_missing", "Regression missing", ["Technology"], ["tests/unit"], [], ["runtime business logic without evidence", "production data"], ["new targeted regression test"], ["npm run typecheck", "targeted regression test", "npm run build"]),
  failureClass("schema_constraint_mismatch", "Schema constraint mismatch", ["Technology", "Finance"], ["lib/architect/mission-control/schema-constraints.ts", "lib/architect/repairs/payment-routing-repair.ts"], ["information_schema.check_constraints", "payment_routing_records"], ["payout release", "production schema drop/recreate", "Stripe truth"], ["schema constraint mismatch packet test", "repair legal value test"], ["npm run typecheck", "targeted Architect schema tests", "npm run build"]),
  failureClass("unsafe_repair_requested", "Unsafe repair requested", ["Security", "Finance"], ["lib/architect/mission-control/foundation.ts", "components/architect/mission-control/mission-control.tsx"], [], ["refund", "payout release", "role mutation", "appointment deletion", "production schema mutation"], ["unsafe action blocked test", "Action Registry test"], ["npm run typecheck", "targeted Architect action registry tests", "npm run build"])
];

export function classifyArchitectIncident(diagnosisCode: string): MissionIncidentDefinition {
  const type = mapDiagnosisToIncidentType(diagnosisCode);
  return MISSION_INCIDENT_DEFINITIONS.find((definition) => definition.type === type)
    ?? MISSION_INCIDENT_DEFINITIONS.find((definition) => definition.type === "regression_test_missing")
    ?? MISSION_INCIDENT_DEFINITIONS[0];
}

export function getCodexFailureClass(diagnosisCode: string): CodexFailureClass {
  const type = mapDiagnosisToIncidentType(diagnosisCode);
  return CODEX_FAILURE_CLASSES.find((failureClassItem) => failureClassItem.incidentType === type)
    ?? CODEX_FAILURE_CLASSES.find((failureClassItem) => failureClassItem.incidentType === "regression_test_missing")
    ?? CODEX_FAILURE_CLASSES[0];
}

export function validateCoreLoopState(fixture: CoreLoopFixture = {}): CoreLoopValidator[] {
  return [
    buildValidator("culture-social-loop", "Culture Social Loop", "Content & Community", "Culture Social Loop", [
      check("public Culture posts exist or empty state is clean", fixture.cultureSocial?.publicPostsExist, "Public Culture post truth or clean empty state exists.", "Public Culture post truth failed.", "Public Culture post truth has not been inspected."),
      check("author identity hydrates", fixture.cultureSocial?.authorIdentityHydrates, "Author identity hydration is proven.", "Author identity hydration failed.", "Author identity hydration has not been inspected."),
      check("comments route exists", fixture.cultureSocial?.commentsRouteExists, "Comments route exists.", "Comments route is missing.", "Comments route has not been inspected."),
      check("comment preview route exists", fixture.cultureSocial?.commentPreviewExists, "Comment preview exists.", "Comment preview is missing.", "Comment preview has not been inspected."),
      check("engagement actions exist", fixture.cultureSocial?.engagementActionsExist, "Like/save/share/follow actions exist.", "Engagement action surface failed.", "Engagement actions have not been inspected."),
      check("book CTA exists for bookable barber post", fixture.cultureSocial?.bookCtaExistsForBookableBarber, "Book CTA exists for a bookable barber post.", "Book CTA missing for bookable barber post.", "Book CTA eligibility has not been inspected.")
    ], false, true),
    buildValidator("culture-to-booking-loop", "Culture-to-Booking Loop", "Marketing", "Culture-to-Booking Loop", [
      check("Culture post can carry booking CTA", fixture.cultureBooking?.bookingCtaUrlHasAttribution, "Booking CTA carries Culture attribution.", "Booking CTA attribution failed.", "Booking CTA attribution has not been inspected."),
      check("booking form accepts Culture attribution", fixture.cultureBooking?.bookingFormAcceptsAttribution, "Booking form accepts Culture attribution.", "Booking form drops Culture attribution.", "Booking form attribution has not been inspected."),
      check("appointment can be created through booking flow", fixture.cultureBooking?.appointmentCreatedThroughBooking, "Appointment creation is proven through booking flow.", "Appointment creation failed.", "Appointment creation has not been inspected."),
      check("appointment appears on barber calendar", fixture.cultureBooking?.appointmentAppearsOnBarberCalendar, "Appointment appears on barber calendar.", "Barber calendar appointment is missing.", "Barber calendar visibility has not been inspected."),
      check("regression test exists", fixture.cultureBooking?.regressionTestExists, "Regression test exists.", "Regression test is missing.", "Regression coverage has not been inspected.")
    ], false, true),
    buildValidator("booking-availability-loop", "Booking Availability Loop", "Operations", "Booking Availability Loop", [
      check("selected barber resolves", fixture.bookingAvailability?.selectedBarberResolves, "Selected barber resolves.", "Selected barber does not resolve.", "Selected barber resolution has not been inspected."),
      check("selected service resolves", fixture.bookingAvailability?.selectedServiceResolves, "Selected service resolves.", "Selected service does not resolve.", "Selected service resolution has not been inspected."),
      check("canonical location resolution works", fixture.bookingAvailability?.canonicalLocationResolves, "Canonical location resolves.", "Canonical location resolution failed.", "Canonical location resolution has not been inspected."),
      check("availability rules generate slots", fixture.bookingAvailability?.availabilityRulesGenerateSlots, "Availability rules generate slots.", "Availability rules do not generate slots.", "Availability slot generation has not been inspected."),
      check("no appointment before final confirm", fixture.bookingAvailability?.noAppointmentBeforeFinalConfirm, "No appointment is created before final confirmation.", "Appointment was created before final confirmation.", "Pre-confirm appointment creation has not been inspected.")
    ], false, true),
    buildValidator("barber-calendar-loop", "Barber Calendar Loop", "Operations", "Barber Calendar Loop", [
      check("appointment appears on barber command calendar", fixture.barberCalendar?.appointmentAppearsOnCommandCalendar, "Appointment appears on barber command calendar.", "Appointment is missing from barber command calendar.", "Barber calendar visibility has not been inspected."),
      check("barber sees Complete Service", fixture.barberCalendar?.barberCanCompleteOwnService, "Barber can complete own service.", "Barber cannot complete own service.", "Barber completion action has not been inspected."),
      check("owner does not see Complete Service", fixture.barberCalendar?.ownerCannotCompleteBarberService, "Owner completion action is hidden.", "Owner can see Complete Service.", "Owner completion visibility has not been inspected.")
    ], false, true),
    buildValidator("shop-relationship-loop", "Shop Relationship Loop", "Operations", "Shop Relationship Loop", [
      check("owner invite can exist", fixture.shopRelationship?.ownerInviteCanExist, "Owner invite can exist.", "Owner invite cannot exist.", "Owner invite path has not been inspected."),
      check("barber can accept", fixture.shopRelationship?.barberCanAccept, "Barber acceptance is proven.", "Barber acceptance failed.", "Barber acceptance has not been inspected."),
      check("active relationship appears in owner Home", fixture.shopRelationship?.activeRelationshipAppearsInOwnerHome, "Active relationship appears in owner Home.", "Accepted relationship missing from owner Home.", "Owner active relationship read model has not been inspected."),
      check("pending invites do not count as active", fixture.shopRelationship?.pendingInvitesExcludedFromActiveCount, "Pending invites are excluded from active count.", "Pending invites are counted as active.", "Pending invite math has not been inspected."),
      check("accepted barber appears in scoreboard", fixture.shopRelationship?.acceptedBarberAppearsInScoreboard, "Accepted barber appears in scoreboard.", "Accepted barber missing from scoreboard.", "Scoreboard sync has not been inspected."),
      check("profile role remains barber_user", fixture.shopRelationship?.profileRoleRemainsBarberUser, "Profile role remains barber_user.", "Profile role mutation detected.", "Profile role preservation has not been inspected.")
    ], false, true),
    buildValidator("owner-command-calendar-loop", "Owner Command Calendar Loop", "Operations", "Owner Command Calendar Loop", [
      check("active barbers counted from active relationships", fixture.ownerCommandCalendar?.activeBarbersFromRelationships, "Active barbers come from active relationships.", "Active barber count is not relationship-backed.", "Active barber source has not been inspected."),
      check("pending invites excluded", fixture.ownerCommandCalendar?.pendingInvitesExcluded, "Pending invites are excluded.", "Pending invites are counted.", "Pending invite exclusion has not been inspected."),
      check("shop production only counts shop-context production", fixture.ownerCommandCalendar?.shopProductionUsesShopContext, "Production uses shop context.", "Production includes non-shop context.", "Shop production source has not been inspected."),
      check("owner timeline is shop-wide", fixture.ownerCommandCalendar?.ownerTimelineShopWide, "Owner timeline is shop-wide.", "Owner timeline is not shop-wide.", "Owner timeline has not been inspected."),
      check("no owner Complete Service action", fixture.ownerCommandCalendar?.ownerCompleteServiceHidden, "Owner Complete Service is hidden.", "Owner can complete barber service.", "Owner completion visibility has not been inspected.")
    ], false, true),
    buildValidator("payment-routing-loop", "Payment/Routing Loop", "Finance", "Payment/Routing Loop", [
      check("appointment exists", fixture.paymentRouting?.appointmentExists, "Appointment exists.", "Appointment is missing.", "Appointment existence has not been inspected."),
      check("payment exists", fixture.paymentRouting?.paymentExists, "Payment exists.", "Payment is missing.", "Payment existence has not been inspected."),
      check("status history exists", fixture.paymentRouting?.statusHistoryExists, "Status history exists.", "Status history is missing.", "Status history has not been inspected."),
      check("routing exists or clear failure state exists", fixture.paymentRouting?.routingExistsOrClearFailure, "Routing exists or clear failure is available.", "Routing missing without clear failure.", "Routing state has not been inspected."),
      check("no payout release before completion", fixture.paymentRouting?.noPayoutBeforeCompletion, "Payout release is blocked before completion.", "Payout release before completion detected.", "Payout release guard has not been inspected.")
    ], true, true)
  ];
}

export function buildMissionControlFoundation(
  incidents: ArchitectIncident[] = [],
  checkedAt = new Date().toISOString(),
  ceoPlatformMetrics: MissionEvidenceCard[] = [],
  deploymentRegression = buildDeploymentRegressionEvidence(),
  rlsSecurityInventory = buildRlsSecurityInventory(),
  roleTruthInventory = buildRoleTruthInventory(),
  sourceVaultInventory = buildSourceVaultInventory()
): MissionControlFoundation {
  const coreLoopValidators = scopeEvidenceCards(applyIncidentFailures(validateCoreLoopState(), incidents));
  const platformEvidence = mergeEvidenceCards(
    ceoPlatformMetrics,
    buildDeploymentRegressionEvidenceCards(deploymentRegression),
    buildRlsSecurityInventoryEvidenceCards(rlsSecurityInventory),
    buildRoleTruthInventoryEvidenceCards(roleTruthInventory),
    buildSourceVaultEvidenceCards(sourceVaultInventory)
  );
  const baseDepartmentLanes = buildDepartmentLanes(coreLoopValidators, incidents, platformEvidence);
  const ceoCommandCenter = [
    ...buildCeoPlatformMetricCards(platformEvidence),
    ...buildCeoCards(coreLoopValidators, incidents, checkedAt, platformEvidence)
  ];
  const scopedCeoCommandCenter = scopeEvidenceCards(ceoCommandCenter);
  const preliminaryAuditSpine = buildAuditSpineModel(scopedCeoCommandCenter, baseDepartmentLanes, coreLoopValidators);
  const auditSpineCard = auditSpineEvidenceCard(preliminaryAuditSpine);
  const departmentLanes = baseDepartmentLanes.map((lane) => {
    if (lane.id !== "compliance") return lane;
    const cards = scopeEvidenceCards([...lane.cards, auditSpineCard]);
    return {
      ...lane,
      cards,
      status: aggregateStatus(cards)
    };
  });
  const auditSpine = buildAuditSpineModel(scopedCeoCommandCenter, departmentLanes, coreLoopValidators);
  const v1RuntimeProofMatrix = buildV1RuntimeProofMatrix(scopedCeoCommandCenter, departmentLanes, coreLoopValidators);
  const readinessBreakdown = buildMissionReadinessBreakdown(scopedCeoCommandCenter, departmentLanes, coreLoopValidators, v1RuntimeProofMatrix);

  return {
    navigationLanes: MISSION_CONTROL_LANES,
    defaultLaneId: "ceo",
    ceoCommandCenter: scopedCeoCommandCenter,
    departmentLanes,
    coreLoopValidators,
    readinessBreakdown,
    v1RuntimeProofMatrix,
    deploymentRegression,
    auditSpine,
    rlsSecurityInventory,
    roleTruthInventory,
    sourceVaultInventory,
    incidentTypes: MISSION_INCIDENT_DEFINITIONS,
    sourceVault: sourceVaultInventory.entries,
    actionRegistry: ACTION_REGISTRY,
    agentRegistry: HIVE_AGENT_REGISTRY,
    codexFailureClasses: CODEX_FAILURE_CLASSES
  };
}

export function buildMissionReadinessBreakdown(
  ceoCommandCenter: MissionEvidenceCard[] = [],
  departmentLanes: MissionDepartmentLane[] = [],
  coreLoopValidators: CoreLoopValidator[] = [],
  v1RuntimeProofMatrix?: V1RuntimeProofMatrix
): MissionReadinessBreakdown {
  const runtimeProofCards = v1RuntimeProofMatrix?.groups.map(runtimeProofGroupEvidenceCard) ?? [];
  const cards = [
    ...scopeEvidenceCards(ceoCommandCenter),
    ...departmentLanes.flatMap((lane) => scopeEvidenceCards(lane.cards)),
    ...scopeEvidenceCards(coreLoopValidators),
    ...runtimeProofCards
  ];
  const v1Required = cards.filter((card) => card.scope === "v1_required");
  const passCards = v1Required.filter((card) => card.status === "Pass");
  const failedCards = v1Required.filter((card) => card.status === "Failed");
  const needsReviewCards = v1Required.filter((card) => card.status !== "Pass" && card.status !== "Failed");
  const criticalFailedBlockers = failedCards.filter((card) => card.criticality === "critical" && card.blocksCurrentRelease);
  const criticalNeedsReviewBlockers = needsReviewCards.filter((card) => card.criticality === "critical" && card.blocksCurrentRelease);
  const currentReleaseBlockers = v1Required.filter((card) => card.blocksCurrentRelease && card.status !== "Pass");
  const futureParkedItems = cards.filter((card) => card.scope !== "v1_required" || !card.blocksCurrentRelease);
  const nextFoundationBlockers = cards.filter((card) =>
    card.status !== "Pass"
      && (card.scope === "v2_infrastructure" || card.scope === "v3_future")
  );
  const v1ReadinessPercent = v1Required.length ? Math.round((passCards.length / v1Required.length) * 100) : 0;
  const overallStatus: MissionControlStatus = criticalFailedBlockers.length
    ? "Failed"
    : criticalNeedsReviewBlockers.length || currentReleaseBlockers.length
      ? "Needs Review"
      : v1Required.length > 0 && passCards.length === v1Required.length
        ? "Pass"
        : "Needs Review";

  return {
    overallStatus,
    v1ReadinessPercent,
    v1RequiredPassCount: passCards.length,
    v1RequiredFailedCount: failedCards.length,
    v1RequiredNeedsReviewCount: needsReviewCards.length,
    v1RequiredTotalCount: v1Required.length,
    futureParkedCount: futureParkedItems.length,
    currentReleaseBlockers,
    evidenceGaps: needsReviewCards,
    nextFoundationBlockers,
    futureParkedItems
  };
}

export function buildV1RuntimeProofMatrix(
  ceoCommandCenter: MissionEvidenceCard[] = [],
  departmentLanes: MissionDepartmentLane[] = [],
  coreLoopValidators: CoreLoopValidator[] = []
): V1RuntimeProofMatrix {
  const evidenceById = new Map<string, MissionEvidenceCard>();

  for (const card of [
    ...scopeEvidenceCards(ceoCommandCenter),
    ...departmentLanes.flatMap((lane) => scopeEvidenceCards(lane.cards)),
    ...scopeEvidenceCards(coreLoopValidators)
  ]) {
    evidenceById.set(card.id, card);
  }

  const rows = V1_RUNTIME_PROOF_DEFINITIONS.map((definition) => buildRuntimeProofRow(definition, evidenceById));
  const groups = V1_RUNTIME_PROOF_GROUPS.map((groupDefinition) => {
    const groupRows = rows.filter((row) => row.proofGroup === groupDefinition.id);
    return buildRuntimeProofGroup(groupDefinition, groupRows);
  });

  return {
    groups,
    rows,
    allGroupsPass: groups.length > 0 && groups.every((group) => group.status === "Pass"),
    failingGroupCount: groups.filter((group) => group.status === "Failed").length,
    needsReviewGroupCount: groups.filter((group) => group.status !== "Pass" && group.status !== "Failed").length
  };
}

function buildRuntimeProofRow(
  definition: RuntimeProofDefinition,
  evidenceById: Map<string, MissionEvidenceCard>
): V1RuntimeProofRow {
  const sourceCard = evidenceById.get(definition.sourceCardId);
  const evidenceRows = sourceCard?.evidence?.length
    ? sourceCard.evidence
    : [`${definition.currentEvidenceSource} is not connected.`];
  const proofConnected = Boolean(sourceCard) && sourceCard?.status !== "Needs Review" && !evidenceRows.some(isMissingProofEvidence);
  const staleOrMissingProof = !sourceCard || !proofConnected || evidenceRows.some(isMissingProofEvidence);

  return {
    id: definition.id,
    label: definition.label,
    lane: definition.lane,
    roleAffected: definition.roleAffected,
    proofGroup: definition.proofGroup,
    requiredProofSource: definition.requiredProofSource,
    currentEvidenceSource: definition.currentEvidenceSource,
    status: sourceCard?.status ?? "Needs Review",
    statusRule: definition.statusRule,
    passRequirement: definition.passRequirement,
    failureMeaning: definition.failureMeaning,
    nextRepairLane: definition.nextRepairLane,
    proofConnected,
    staleOrMissingProof,
    evidenceRows
  };
}

function buildRuntimeProofGroup(
  groupDefinition: Pick<V1RuntimeProofGroup, "id" | "label" | "lane" | "nextRepairLane">,
  rows: V1RuntimeProofRow[]
): V1RuntimeProofGroup {
  const status = aggregateRuntimeProofStatus(rows);
  const firstRepairRow = rows.find((row) => row.status === "Failed")
    ?? rows.find((row) => row.status !== "Pass")
    ?? rows[0];

  return {
    id: groupDefinition.id,
    label: groupDefinition.label,
    lane: groupDefinition.lane,
    status,
    proofConnected: rows.length > 0 && rows.every((row) => row.proofConnected),
    failingEvidenceCount: rows.filter((row) => row.status === "Failed").length,
    staleOrMissingProofCount: rows.filter((row) => row.staleOrMissingProof).length,
    nextRepairLane: firstRepairRow?.nextRepairLane ?? groupDefinition.nextRepairLane,
    rows
  };
}

function aggregateRuntimeProofStatus(rows: V1RuntimeProofRow[]): MissionControlStatus {
  if (!rows.length) return "Needs Review";
  if (rows.some((row) => row.status === "Failed")) return "Failed";
  if (rows.some((row) => row.status !== "Pass")) return "Needs Review";
  return "Pass";
}

function runtimeProofGroupEvidenceCard(group: V1RuntimeProofGroup): MissionEvidenceCard {
  return scopeEvidenceCard({
    id: `v1-runtime-proof-${group.id}`,
    label: `${group.label} runtime proof`,
    department: group.lane,
    workflow: "V1 Runtime Proof",
    status: group.status,
    summary: group.status === "Pass"
      ? `${group.label} has connected runtime proof for V1.`
      : `${group.label} has ${group.failingEvidenceCount} failed and ${group.staleOrMissingProofCount} stale/missing proof row(s).`,
    evidence: group.rows.map((row) => `${row.label}: ${row.status}; connected=${row.proofConnected ? "yes" : "no"}; source=${row.currentEvidenceSource}.`),
    scope: "v1_required",
    criticality: "critical",
    blocksCurrentRelease: true,
    evidenceRequiredForPass: `${group.label} runtime proof must have every row Pass from connected evidence before V1 readiness can reach 100%.`
  });
}

export function buildAuditSpineModel(
  ceoCommandCenter: MissionEvidenceCard[] = [],
  departmentLanes: MissionDepartmentLane[] = [],
  coreLoopValidators: CoreLoopValidator[] = [],
  actionRegistry: ActionRegistryEntry[] = ACTION_REGISTRY
): AuditSpineModel {
  const evidenceById = new Map<string, MissionEvidenceCard>();
  for (const card of [
    ...scopeEvidenceCards(ceoCommandCenter),
    ...departmentLanes.flatMap((lane) => scopeEvidenceCards(lane.cards)),
    ...scopeEvidenceCards(coreLoopValidators)
  ]) {
    evidenceById.set(card.id, card);
  }

  const auditCard = evidenceById.get("ceo-audit-log-evidence");
  const repairAuditCard = evidenceById.get("finance-repair-audit-coverage");
  const refundCard = evidenceById.get("finance-refund-resolution");
  const refundCountCard = evidenceById.get("ceo-refund-count") ?? evidenceById.get("finance-refund-count");
  const totalRefundedCard = evidenceById.get("ceo-total-refunded") ?? evidenceById.get("finance-refund-total");
  const failedRefundCard = evidenceById.get("ceo-failed-refund-attempts") ?? evidenceById.get("finance-failed-refund-attempts");
  const activeRefundBlockersCard = evidenceById.get("ceo-active-refund-blockers") ?? evidenceById.get("finance-active-refund-blockers");
  const lastRefundTimestampCard = evidenceById.get("ceo-last-refund-timestamp") ?? evidenceById.get("finance-last-refund-timestamp");
  const unsafeActionsCard = evidenceById.get("security-unsafe-actions");
  const unsafeActionsBlocked = actionRegistry
    .filter((action) => action.riskClass === "Unsafe / blocked")
    .every((action) => action.allowed === false);

  const records = [
    auditSpineRecord({
      id: "audit-spine-repair-coverage",
      actionId: "repair-audit-coverage",
      lane: "Finance",
      actorType: "platform_admin",
      actionType: "controlled_repair_audit_coverage",
      sourceTableOrFunction: "audit_logs / architect_repair_audit_logs / platform_admin_audit_logs / platform_events",
      relatedIncidentCode: "unsafe_repair_requested",
      nextRepairLane: "finance",
      stages: [
        auditStage("approval", "Approval evidence", auditStatusFromCard(auditCard), auditEvidenceFromCard(auditCard, "audit_logs approval evidence is not connected."), "audit_logs"),
        auditStage("execution", "Execution evidence", auditStatusFromCard(repairAuditCard), auditEvidenceFromCard(repairAuditCard, "architect_repair_audit_logs execution evidence is not connected."), "architect_repair_audit_logs"),
        auditStage("verification", "Verification evidence", auditStatusFromCard(repairAuditCard), auditEvidenceFromCard(repairAuditCard, "repair verification evidence is not connected."), "architect_repair_audit_logs"),
        auditStage("scoreImpact", "Score impact evidence", auditStatusFromCard(repairAuditCard), [
          "Score updates must be persisted from evidence; UI state does not count.",
          ...auditEvidenceFromCard(repairAuditCard, "score-impact audit evidence is not connected.")
        ], "Mission readiness score evidence")
      ]
    }),
    auditSpineRecord({
      id: "audit-spine-controlled-finance-refunds",
      actionId: "cancelled-captured-controlled-refund",
      lane: "Finance",
      actorType: "platform_admin",
      actionType: "architect_finance_controlled_refund",
      sourceTableOrFunction: "refunds / payments / platform_events / platform_admin_audit_logs / payment_routing_records",
      relatedIncidentCode: "cancelled_captured_refund_unresolved",
      relatedPaymentId: refundCard?.evidence.find((item) => item.includes("paymentId="))?.split("paymentId=").at(1)?.split(/\s|,/).at(0) ?? null,
      nextRepairLane: "finance",
      stages: [
        auditStage("approval", "Approval evidence", auditStatusFromCard(auditCard), auditEvidenceFromCard(auditCard, "Controlled refund approval evidence is not connected outside the UI confirmation."), "platform_admin_audit_logs"),
        auditStage("execution", "Execution evidence", auditStatusFromCard(refundCard), auditEvidenceFromCard(refundCard, "Refund execution evidence is not connected."), "refunds / platform_events"),
        auditStage("verification", "Verification evidence", aggregateAuditStatuses([
          auditStatusFromCard(refundCountCard),
          auditStatusFromCard(totalRefundedCard),
          auditStatusFromCard(activeRefundBlockersCard),
          auditStatusFromCard(failedRefundCard),
          auditStatusFromCard(lastRefundTimestampCard)
        ]), [
          ...auditEvidenceFromCard(refundCountCard, "Refund count evidence is not connected."),
          ...auditEvidenceFromCard(totalRefundedCard, "Total refunded evidence is not connected."),
          ...auditEvidenceFromCard(activeRefundBlockersCard, "Active refund blocker evidence is not connected."),
          ...auditEvidenceFromCard(failedRefundCard, "Failed refund attempt evidence is not connected."),
          ...auditEvidenceFromCard(lastRefundTimestampCard, "Last refund timestamp evidence is not connected."),
          "Verification must also prove payout_executions remain 0 and routing released_at remains null."
        ], "refunds / payments / payout_executions / payment_routing_records"),
        auditStage("scoreImpact", "Score impact evidence", "Needs Review", [
          "Refund evidence can improve Finance posture, but score-impact audit evidence is not connected.",
          "Finance must not become full Pass from refund rows alone."
        ], "Mission readiness score evidence")
      ]
    }),
    auditSpineRecord({
      id: "audit-spine-unsafe-action-guardrails",
      actionId: "unsafe-action-guardrail",
      lane: "Security",
      actorType: "system",
      actionType: "unsafe_action_prevention",
      sourceTableOrFunction: "Action Registry / Mission Control foundation",
      relatedIncidentCode: "unsafe_repair_requested",
      nextRepairLane: "security",
      stages: [
        auditStage("approval", "Approval evidence", unsafeActionsBlocked ? "Pass" : "Failed", unsafeActionsBlocked ? ["Unsafe actions are approval-gated or blocked in the Action Registry."] : ["One or more unsafe actions are not blocked."], "Action Registry"),
        auditStage("execution", "Execution evidence", unsafeActionsBlocked ? "Pass" : "Failed", unsafeActionsBlocked ? ["Refund, payout release, role mutation, delete appointment, and production schema changes are blocked from autopilot."] : ["Unsafe action execution guardrail failed."], "Action Registry"),
        auditStage("verification", "Verification evidence", auditStatusFromCard(unsafeActionsCard), auditEvidenceFromCard(unsafeActionsCard, "Unsafe action verification card is not connected."), "security-unsafe-actions card"),
        auditStage("scoreImpact", "Score impact evidence", "Needs Review", ["Unsafe-action guardrails are visible, but no persisted score-update audit source is connected."], "Mission readiness score evidence")
      ]
    })
  ];

  const summary: AuditSpineGroupSummary = {
    approvalCoverageStatus: aggregateAuditStatuses(records.map((record) => stageStatus(record, "approval"))),
    executionCoverageStatus: aggregateAuditStatuses(records.map((record) => stageStatus(record, "execution"))),
    verificationCoverageStatus: aggregateAuditStatuses(records.map((record) => stageStatus(record, "verification"))),
    scoreImpactCoverageStatus: aggregateAuditStatuses(records.map((record) => stageStatus(record, "scoreImpact"))),
    repairAuditCoverageStatus: records.find((record) => record.id === "audit-spine-repair-coverage")?.status ?? "Not Connected",
    controlledFinanceRefundAuditStatus: records.find((record) => record.id === "audit-spine-controlled-finance-refunds")?.status ?? "Not Connected",
    unsafeActionGuardrailAuditStatus: records.find((record) => record.id === "audit-spine-unsafe-action-guardrails")?.status ?? "Not Connected"
  };
  const status = aggregateAuditStatuses([
    summary.approvalCoverageStatus,
    summary.executionCoverageStatus,
    summary.verificationCoverageStatus,
    summary.scoreImpactCoverageStatus
  ]);
  const firstRepairRecord = records.find((record) => record.status === "Failed")
    ?? records.find((record) => record.status !== "Pass")
    ?? records[0];

  return {
    status,
    summary,
    records,
    missingStageCount: records.reduce((sum, record) => sum + record.missingStageCount, 0),
    failingStageCount: records.reduce((sum, record) => sum + record.failingStageCount, 0),
    evidenceSourceCount: new Set(records.flatMap((record) => record.stages.map((stage) => stage.sourceTableOrFunction))).size,
    nextRepairLane: firstRepairRecord?.nextRepairLane ?? "compliance"
  };
}

function auditSpineEvidenceCard(auditSpine: AuditSpineModel): MissionEvidenceCard {
  const status = auditStatusToMissionStatus(auditSpine.status);
  return scopeEvidenceCard({
    id: "audit-spine-coverage",
    label: "Audit Spine coverage",
    department: "Compliance",
    workflow: "Audit Spine",
    status,
    summary: status === "Pass"
      ? "Approval, execution, verification, and score-impact audit stages are connected."
      : `Audit Spine has ${auditSpine.failingStageCount} failing and ${auditSpine.missingStageCount} missing stage(s).`,
    evidence: [
      `Approval coverage: ${auditSpine.summary.approvalCoverageStatus}.`,
      `Execution coverage: ${auditSpine.summary.executionCoverageStatus}.`,
      `Verification coverage: ${auditSpine.summary.verificationCoverageStatus}.`,
      `Score-impact coverage: ${auditSpine.summary.scoreImpactCoverageStatus}.`,
      `Repair audit coverage: ${auditSpine.summary.repairAuditCoverageStatus}.`,
      `Controlled finance refund audit: ${auditSpine.summary.controlledFinanceRefundAuditStatus}.`,
      `Unsafe action guardrail audit: ${auditSpine.summary.unsafeActionGuardrailAuditStatus}.`,
      "Refund rows alone do not create full Audit Spine Pass."
    ],
    metricValue: auditSpine.status,
    scope: "v1_required",
    criticality: "critical",
    blocksCurrentRelease: true,
    evidenceRequiredForPass: "Audit Spine requires approval, execution, verification, and score-impact evidence to all Pass from persisted/read-only sources."
  });
}

function auditSpineRecord(input: Omit<AuditSpineRecord, "status" | "missingStageCount" | "failingStageCount">): AuditSpineRecord {
  return {
    ...input,
    status: aggregateAuditStatuses(input.stages.map((stage) => stage.status)),
    missingStageCount: input.stages.filter((stage) => stage.status === "Needs Review" || stage.status === "Not Connected").length,
    failingStageCount: input.stages.filter((stage) => stage.status === "Failed").length
  };
}

function auditStage(
  stage: AuditSpineStageKey,
  label: string,
  status: AuditSpineStatus,
  evidence: string[],
  sourceTableOrFunction: string
): AuditSpineStageEvidence {
  return {
    stage,
    label,
    status,
    evidence: evidence.length ? evidence : [`${label} evidence is not connected.`],
    sourceTableOrFunction
  };
}

function auditStatusFromCard(card?: MissionEvidenceCard): AuditSpineStatus {
  if (!card) return "Not Connected";
  if (card.status === "Needs Review" && (card.metricValue === "Not connected" || card.evidence.some(isNotConnectedEvidence))) {
    return "Not Connected";
  }
  return card.status;
}

function auditEvidenceFromCard(card: MissionEvidenceCard | undefined, fallback: string) {
  return card?.evidence?.length ? card.evidence : [fallback];
}

function isNotConnectedEvidence(item: string) {
  return item.toLowerCase().includes("not connected");
}

function auditStatusToMissionStatus(status: AuditSpineStatus): MissionControlStatus {
  return status === "Not Connected" ? "Needs Review" : status;
}

function aggregateAuditStatuses(statuses: AuditSpineStatus[]): AuditSpineStatus {
  if (!statuses.length) return "Not Connected";
  if (statuses.some((status) => status === "Failed")) return "Failed";
  if (statuses.every((status) => status === "Not Connected")) return "Not Connected";
  if (statuses.some((status) => status === "Needs Review" || status === "Not Connected" || status === "Warning")) return "Needs Review";
  return "Pass";
}

function stageStatus(record: AuditSpineRecord, stage: AuditSpineStageKey): AuditSpineStatus {
  return record.stages.find((item) => item.stage === stage)?.status ?? "Not Connected";
}

export function buildRlsSecurityInventory(input: RlsSecurityInventoryInput = {}): RlsSecurityInventory {
  const productionDisabledPublicTableCount = input.productionDisabledPublicTableCount ?? DEFAULT_RLS_DISABLED_PUBLIC_TABLE_COUNT;
  const rows = (input.rows ?? DEFAULT_RLS_SECURITY_INVENTORY_ROWS).map(buildRlsSecurityInventoryRow);
  const v1CriticalRows = rows.filter((row) => row.v1Required && !row.futureParked);
  const disabledRows = rows.filter((row) => row.rlsEnabled === "no" && !row.futureParked);
  const unknownRows = rows.filter((row) => row.rlsEnabled === "unknown" && !row.futureParked);
  const needsReviewRows = rows.filter((row) => row.currentStatus === "Needs Review" || row.currentStatus === "Not Connected");
  const parkedFutureTables = rows.filter((row) => row.futureParked || row.currentStatus === "Parked");
  const rlsDisabledCount = Math.max(disabledRows.length, productionDisabledPublicTableCount);
  const v1CriticalDisabledCount = Math.max(disabledRows.filter((row) => row.v1Required).length, productionDisabledPublicTableCount);
  const status: RlsSecurityInventoryStatus = rlsDisabledCount > 0 || rows.some((row) => row.currentStatus === "Failed")
    ? "Failed"
    : needsReviewRows.length
      ? "Needs Review"
      : rows.length && rows.every((row) => row.currentStatus === "Parked")
        ? "Parked"
        : "Pass";
  const summary = {
    totalTablesInventoried: rows.length,
    v1CriticalTableCount: v1CriticalRows.length,
    rlsEnabledCount: rows.filter((row) => row.rlsEnabled === "yes").length,
    rlsDisabledCount,
    unknownPostureCount: unknownRows.length,
    v1CriticalDisabledCount,
    needsReviewCount: needsReviewRows.length,
    parkedFutureCount: parkedFutureTables.length,
    highestRiskLevel: highestRlsRiskLevel(rows, productionDisabledPublicTableCount),
    nextRepairLane: firstRlsRepairLane(rows) ?? "security"
  };

  return {
    status,
    summary,
    rows,
    v1CriticalDisabledTables: rows.filter((row) => row.currentStatus === "Failed" && row.v1Required && !row.futureParked),
    unknownPostureTables: rows.filter((row) => row.currentStatus === "Needs Review" || row.currentStatus === "Not Connected"),
    parkedFutureTables,
    evidenceSource: input.evidenceSource ?? DEFAULT_RLS_EVIDENCE_SOURCE,
    nextRepairLane: summary.nextRepairLane
  };
}

function buildRlsSecurityInventoryRow(input: RlsSecurityInventoryRowInput): RlsSecurityInventoryRow {
  const currentStatus = input.currentStatus ?? inferRlsInventoryRowStatus(input);
  const staleOrMissingEvidenceState = input.staleOrMissingEvidenceState ?? rlsStaleOrMissingEvidence(input, currentStatus);
  const migrationRequired = input.migrationRequired ?? inferRlsMigrationRequirement(input, currentStatus);

  return {
    ...input,
    currentStatus,
    staleOrMissingEvidenceState,
    migrationRequired,
    failureMeaning: input.failureMeaning ?? rlsFailureMeaning(input, currentStatus)
  };
}

function inferRlsInventoryRowStatus(row: RlsSecurityInventoryRowInput): RlsSecurityInventoryStatus {
  if (row.futureParked) return "Parked";
  if (row.rlsEnabled === "no") return "Failed";
  if (row.rlsEnabled === "unknown") return "Needs Review";
  if (row.policyCount === null || typeof row.policyCount === "undefined") return "Needs Review";
  if (row.policyCount <= 0 || row.policyNames.length <= 0) return "Needs Review";
  return "Pass";
}

function inferRlsMigrationRequirement(row: RlsSecurityInventoryRowInput, status: RlsSecurityInventoryStatus): RlsSecurityInventoryRow["migrationRequired"] {
  if (row.futureParked) return "no";
  if (row.rlsEnabled === "no") return "yes";
  if (row.rlsEnabled === "unknown" || status === "Needs Review" || status === "Not Connected") return "unknown";
  return "no";
}

function rlsStaleOrMissingEvidence(row: RlsSecurityInventoryRowInput, status: RlsSecurityInventoryStatus) {
  if (status === "Pass") return [];
  if (status === "Parked") return ["Future/parked scope; excluded from V1 readiness until promoted."];
  const missing = [];
  if (row.rlsEnabled === "unknown") missing.push("Production RLS enabled state is not connected.");
  if (row.policyCount === null || typeof row.policyCount === "undefined") missing.push("Production policy count is not connected.");
  if (!row.policyNames.length) missing.push("Production policy names are not connected.");
  if (row.rlsEnabled === "no") missing.push("RLS disabled evidence is connected and release-blocking.");
  return missing.length ? missing : ["Required production RLS evidence is incomplete."];
}

function rlsFailureMeaning(row: RlsSecurityInventoryRowInput, status: RlsSecurityInventoryStatus) {
  if (status === "Failed") {
    return `${row.schemaName}.${row.tableName} cannot be treated as V1-safe because RLS is disabled or disabled-table evidence is unresolved.`;
  }
  if (status === "Needs Review" || status === "Not Connected") {
    return `${row.schemaName}.${row.tableName} cannot be marked Pass until RLS enabled state and policy evidence are connected.`;
  }
  if (status === "Parked") {
    return `${row.schemaName}.${row.tableName} is parked/future scope and does not affect V1 readiness.`;
  }
  return `${row.schemaName}.${row.tableName} has connected RLS enabled and policy evidence for this inventory row.`;
}

function highestRlsRiskLevel(rows: RlsSecurityInventoryRow[], productionDisabledPublicTableCount: number): RlsRiskLevel {
  if (productionDisabledPublicTableCount > 0 || rows.some((row) => row.currentRiskLevel === "critical" && row.currentStatus !== "Parked")) return "critical";
  if (rows.some((row) => row.currentRiskLevel === "high" && row.currentStatus !== "Parked")) return "high";
  if (rows.some((row) => row.currentRiskLevel === "medium" && row.currentStatus !== "Parked")) return "medium";
  if (rows.some((row) => row.currentRiskLevel === "low" && row.currentStatus !== "Parked")) return "low";
  return "unknown";
}

function firstRlsRepairLane(rows: RlsSecurityInventoryRow[]): MissionLaneId | null {
  return rows.find((row) => row.currentStatus === "Failed")?.nextRepairLane
    ?? rows.find((row) => row.currentStatus === "Needs Review" || row.currentStatus === "Not Connected")?.nextRepairLane
    ?? null;
}

function rlsInventoryStatusToMissionStatus(status: RlsSecurityInventoryStatus): MissionControlStatus {
  if (status === "Pass") return "Pass";
  if (status === "Failed") return "Failed";
  if (status === "Warning") return "Warning";
  return "Needs Review";
}

function buildRlsSecurityInventoryEvidenceCards(inventory: RlsSecurityInventory): MissionEvidenceCard[] {
  const summary = inventory.summary;
  const inventoryStatus = rlsInventoryStatusToMissionStatus(inventory.status);
  const disabledEvidence = [
    `${summary.rlsDisabledCount} public Supabase table(s) reported RLS disabled.`,
    `${summary.v1CriticalDisabledCount} V1 critical disabled/unresolved disabled table signal(s).`,
    `${summary.unknownPostureCount} named V1 table posture row(s) still need production RLS/policy proof.`,
    `highestRiskLevel=${summary.highestRiskLevel}.`,
    `evidenceSource=${inventory.evidenceSource}.`,
    "Read-only inventory only; no RLS enablement, policy mutation, migration, or production data change was attempted."
  ];
  const inventoryEvidence = [
    `totalTablesInventoried=${summary.totalTablesInventoried}.`,
    `v1CriticalTableCount=${summary.v1CriticalTableCount}.`,
    `rlsEnabledCount=${summary.rlsEnabledCount}.`,
    `rlsDisabledCount=${summary.rlsDisabledCount}.`,
    `unknownPostureCount=${summary.unknownPostureCount}.`,
    `parkedFutureCount=${summary.parkedFutureCount}.`,
    ...inventory.rows.slice(0, 8).map((row) => `${row.schemaName}.${row.tableName}: RLS=${row.rlsEnabled}; policies=${row.policyCount ?? "unknown"}; status=${row.currentStatus}; risk=${row.currentRiskLevel}.`)
  ];

  return [
    {
      ...evidenceCard(
        "ceo-rls-disabled-evidence",
        "RLS Disabled Evidence",
        "CEO",
        "Security",
        summary.rlsDisabledCount > 0 ? "Failed" : inventoryStatus,
        summary.rlsDisabledCount > 0
          ? "Public Supabase RLS disabled evidence remains release-blocking."
          : "No disabled-table evidence is connected, but policy proof still controls Pass.",
        disabledEvidence
      ),
      metricValue: summary.rlsDisabledCount > 0 ? `${summary.rlsDisabledCount} disabled` : inventoryStatus
    },
    {
      ...evidenceCard(
        "security-rls-inventory",
        "RLS Security Inventory",
        "Security",
        "Supabase RLS",
        inventoryStatus,
        "Read-only inventory separates disabled, unknown, policy-missing, and parked/future RLS posture.",
        inventoryEvidence
      ),
      metricValue: `${summary.totalTablesInventoried} inventoried`
    },
    evidenceCard(
      "security-rls-disabled",
      "RLS disabled tables",
      "Security",
      "Supabase RLS",
      summary.rlsDisabledCount > 0 ? "Failed" : inventoryStatus,
      summary.rlsDisabledCount > 0
        ? `${summary.rlsDisabledCount} public Supabase table(s) have disabled or unresolved disabled RLS evidence.`
        : "RLS disabled count is clean; policy proof still controls table-level Pass.",
      disabledEvidence
    ),
    evidenceCard(
      "technology-rls-disabled",
      "RLS disabled tables",
      "Technology",
      "Supabase RLS",
      summary.rlsDisabledCount > 0 ? "Failed" : inventoryStatus,
      summary.rlsDisabledCount > 0
        ? "Database security proof is blocked by disabled public-table evidence."
        : "Database security proof has no disabled RLS evidence connected.",
      disabledEvidence
    )
  ];
}

export function buildSourceVaultInventory(entries: SourceVaultEntry[] = SOURCE_VAULT_REGISTRY): SourceVaultInventory {
  const normalizedEntries = entries.map((entry) => sourceVaultEntry(entry));
  const v1RequiredSources = normalizedEntries.filter((entry) => entry.scope === "v1_required");
  const missingRequiredSources = v1RequiredSources.filter((entry) => entry.evidenceStatus === "Failed" || entry.ingestionStatus === "missing");
  const privateSourceRequiredSources = normalizedEntries.filter((entry) => entry.ingestionStatus === "private_source_required");
  const needsReviewSources = normalizedEntries.filter((entry) => entry.evidenceStatus === "Needs Review" || entry.evidenceStatus === "Not Connected");
  const parkedFutureSources = normalizedEntries.filter((entry) => entry.evidenceStatus === "Parked" || entry.scope === "v3_future" || entry.scope === "parked");
  const linkedArchitectCardIds = Array.from(new Set(normalizedEntries.flatMap((entry) => entry.linkedArchitectCardIds))).sort();
  const status = aggregateSourceVaultStatus(normalizedEntries);
  const categories = SOURCE_VAULT_CATEGORIES.map((category) => sourceVaultCategorySummary(category, normalizedEntries));

  const summary = {
    totalSourcesRegistered: normalizedEntries.length,
    ingestedMetadataCount: normalizedEntries.filter((entry) => entry.ingestionStatus === "ingested_metadata_only").length,
    missingRequiredSourceCount: missingRequiredSources.length,
    privateSourceRequiredCount: privateSourceRequiredSources.length,
    needsReviewCount: needsReviewSources.length,
    parkedFutureSourceCount: parkedFutureSources.length,
    v1RequiredSourceCount: v1RequiredSources.length,
    v1RequiredMissingCount: missingRequiredSources.length,
    linkedArchitectCardsCount: linkedArchitectCardIds.length,
    highestRiskLevel: highestSourceVaultRiskLevel(normalizedEntries),
    nextRepairLane: firstSourceVaultRepairLane(normalizedEntries) ?? "technology"
  };

  return {
    status,
    summary,
    categories,
    entries: normalizedEntries,
    v1RequiredSources,
    missingRequiredSources,
    privateSourceRequiredSources,
    needsReviewSources,
    parkedFutureSources,
    linkedArchitectCardIds,
    evidenceSource: "Static metadata-only Source Vault registry; private documents remain outside the public repository.",
    privacyWarning: "Metadata only - no private documents committed."
  };
}

function sourceVaultCategorySummary(category: SourceVaultCategory, entries: SourceVaultEntry[]) {
  const categoryEntries = entries.filter((entry) => entry.category === category);
  const activeEntries = categoryEntries.filter((entry) => entry.evidenceStatus !== "Parked");
  const failedEntries = activeEntries.filter((entry) => entry.evidenceStatus === "Failed");
  const reviewEntries = activeEntries.filter((entry) => entry.evidenceStatus === "Needs Review" || entry.evidenceStatus === "Not Connected");
  const parkedFutureCount = categoryEntries.filter((entry) => entry.evidenceStatus === "Parked" || entry.scope === "v3_future" || entry.scope === "parked").length;
  const v1RequiredCount = categoryEntries.filter((entry) => entry.scope === "v1_required").length;
  const missingRequiredCount = categoryEntries.filter((entry) => entry.scope === "v1_required" && (entry.evidenceStatus === "Failed" || entry.ingestionStatus === "missing")).length;
  const status: SourceVaultEvidenceStatus = failedEntries.length
    ? "Failed"
    : reviewEntries.length
      ? "Needs Review"
      : categoryEntries.length && categoryEntries.every((entry) => entry.evidenceStatus === "Parked")
        ? "Parked"
        : categoryEntries.length
          ? "Pass"
          : "Needs Review";

  return {
    category,
    total: categoryEntries.length,
    v1RequiredCount,
    missingRequiredCount,
    needsReviewCount: reviewEntries.length,
    parkedFutureCount,
    highestRiskLevel: highestSourceVaultRiskLevel(categoryEntries),
    status
  };
}

function aggregateSourceVaultStatus(entries: SourceVaultEntry[]): SourceVaultEvidenceStatus {
  const activeEntries = entries.filter((entry) => entry.evidenceStatus !== "Parked");
  if (activeEntries.some((entry) => entry.evidenceStatus === "Failed")) return "Failed";
  if (activeEntries.some((entry) => entry.evidenceStatus === "Needs Review" || entry.evidenceStatus === "Not Connected")) return "Needs Review";
  if (activeEntries.length) return "Pass";
  return "Needs Review";
}

function highestSourceVaultRiskLevel(entries: SourceVaultEntry[]): SourceVaultRiskLevel {
  const riskOrder: SourceVaultRiskLevel[] = ["low", "medium", "high", "critical"];
  const activeEntries = entries.filter((entry) => entry.evidenceStatus !== "Parked");
  if (!activeEntries.length) return "unknown";

  return activeEntries.reduce<SourceVaultRiskLevel>((highest, entry) => {
    const entryRisk: SourceVaultRiskLevel = entry.critical || entry.privacyClass === "restricted" || entry.evidenceStatus === "Failed"
      ? "critical"
      : entry.privacyClass === "confidential" || entry.scope === "v1_required"
        ? "high"
        : entry.evidenceStatus === "Needs Review"
          ? "medium"
          : "low";

    return riskOrder.indexOf(entryRisk) > riskOrder.indexOf(highest) ? entryRisk : highest;
  }, "low");
}

function firstSourceVaultRepairLane(entries: SourceVaultEntry[]): MissionLaneId | null {
  const blockingEntry = entries.find((entry) => entry.evidenceStatus === "Failed" && entry.scope === "v1_required")
    ?? entries.find((entry) => entry.evidenceStatus === "Needs Review" && entry.scope === "v1_required")
    ?? entries.find((entry) => entry.evidenceStatus === "Failed" || entry.evidenceStatus === "Needs Review");

  return blockingEntry?.nextRepairLane ?? null;
}

function sourceVaultStatusToMissionStatus(status: SourceVaultEvidenceStatus): MissionControlStatus {
  if (status === "Pass" || status === "Warning" || status === "Failed" || status === "Needs Review") return status;
  return "Needs Review";
}

function buildSourceVaultEvidenceCards(inventory: SourceVaultInventory): MissionEvidenceCard[] {
  const summary = inventory.summary;
  const status = sourceVaultStatusToMissionStatus(inventory.status);
  const evidence = [
    `totalSourcesRegistered=${summary.totalSourcesRegistered}.`,
    `ingestedMetadataCount=${summary.ingestedMetadataCount}.`,
    `missingRequiredSourceCount=${summary.missingRequiredSourceCount}.`,
    `privateSourceRequiredCount=${summary.privateSourceRequiredCount}.`,
    `needsReviewCount=${summary.needsReviewCount}.`,
    `parkedFutureSourceCount=${summary.parkedFutureSourceCount}.`,
    `v1RequiredSourceCount=${summary.v1RequiredSourceCount}.`,
    `v1RequiredMissingCount=${summary.v1RequiredMissingCount}.`,
    `linkedArchitectCardsCount=${summary.linkedArchitectCardsCount}.`,
    `highestRiskLevel=${summary.highestRiskLevel}.`,
    inventory.privacyWarning,
    ...inventory.entries.slice(0, 8).map((entry) => `${entry.sourceName}: ${entry.evidenceStatus}; ${entry.ingestionStatus}; ${entry.privacyClass}; ${entry.scope}.`)
  ];
  const summaryText = summary.missingRequiredSourceCount
    ? `${summary.missingRequiredSourceCount} required V1 Source Vault source(s) are missing.`
    : status === "Pass"
      ? "Source Vault metadata is connected without private document exposure."
      : "Source Vault metadata is registered, but private source review is incomplete.";

  return [
    {
      ...evidenceCard("source-vault-status", "Source Vault status", "CEO", "Source Vault", status, summaryText, evidence),
      metricValue: `${summary.v1RequiredSourceCount} V1 / ${summary.v1RequiredMissingCount} missing`
    },
    {
      ...evidenceCard("technology-source-vault-readiness", "Source Vault readiness", "Technology", "Source Vault", status, summaryText, evidence),
      metricValue: `${summary.totalSourcesRegistered} registered`
    }
  ];
}

export function buildRoleTruthInventory(input: RoleTruthInventoryInput = {}): RoleTruthInventory {
  const rows = (input.rows ?? DEFAULT_ROLE_TRUTH_INVENTORY_ROWS).map(buildRoleTruthInventoryRow);
  const failedRows = rows.filter((row) => row.currentStatus === "Failed" && !row.futureParked);
  const needsReviewRows = rows.filter((row) => (row.currentStatus === "Needs Review" || row.currentStatus === "Not Connected") && !row.futureParked);
  const v1CriticalDriftRoles = rows.filter((row) =>
    row.v1Required
    && !row.futureParked
    && row.currentStatus === "Failed"
    && (row.canonicalClassification === "legacy_or_drift" || row.accountRoleMisuse)
  );
  const status: RoleTruthInventoryStatus = failedRows.length
    ? "Failed"
    : needsReviewRows.length
      ? "Needs Review"
      : rows.length && rows.every((row) => row.currentStatus === "Parked")
        ? "Parked"
        : "Pass";
  const summary = {
    totalRoleValuesInventoried: rows.length,
    canonicalAccountRoleCount: rows.filter((row) => row.canonicalClassification === "public_account_role").length,
    platformAdminRoleCount: rows.filter((row) => row.canonicalClassification === "internal_platform_role").length,
    businessRelationshipCount: rows.filter((row) => row.canonicalClassification === "business_relationship").length,
    staffPermissionCount: rows.filter((row) => row.canonicalClassification === "staff_permission").length,
    legacyOrDriftCount: rows.filter((row) => row.canonicalClassification === "legacy_or_drift").length,
    unknownCount: rows.filter((row) => row.canonicalClassification === "unknown").length,
    migrationRequiredCount: rows.filter((row) => row.migrationRequired === "yes").length,
    v1CriticalDriftCount: v1CriticalDriftRoles.length,
    accountRoleMisuseCount: rows.filter((row) => row.accountRoleMisuse && row.v1Required && !row.futureParked).length,
    highestRiskLevel: highestRoleTruthRiskLevel(rows),
    nextRepairLane: firstRoleTruthRepairLane(rows) ?? "security"
  };

  return {
    status,
    summary,
    rows,
    canonicalAccountRoles: rows.filter((row) => row.canonicalClassification === "public_account_role"),
    platformAdminRoles: rows.filter((row) => row.canonicalClassification === "internal_platform_role"),
    businessRelationshipRoles: rows.filter((row) => row.canonicalClassification === "business_relationship"),
    staffPermissionRoles: rows.filter((row) => row.canonicalClassification === "staff_permission"),
    legacyOrDriftRoles: rows.filter((row) => row.canonicalClassification === "legacy_or_drift"),
    unknownRoles: rows.filter((row) => row.canonicalClassification === "unknown"),
    migrationRequiredRoles: rows.filter((row) => row.migrationRequired === "yes"),
    v1CriticalDriftRoles,
    evidenceSource: input.evidenceSource ?? DEFAULT_ROLE_TRUTH_EVIDENCE_SOURCE,
    nextRepairLane: summary.nextRepairLane
  };
}

function buildRoleTruthInventoryRow(input: RoleTruthInventoryRowInput): RoleTruthInventoryRow {
  const currentStatus = input.currentStatus ?? inferRoleTruthInventoryRowStatus(input);
  const migrationRequired = input.migrationRequired ?? inferRoleTruthMigrationRequirement(input, currentStatus);
  const staleOrMissingEvidenceState = input.staleOrMissingEvidenceState ?? roleTruthStaleOrMissingEvidence(input, currentStatus);

  return {
    ...input,
    currentStatus,
    migrationRequired,
    staleOrMissingEvidenceState,
    failureMeaning: input.failureMeaning ?? roleTruthFailureMeaning(input, currentStatus)
  };
}

function inferRoleTruthInventoryRowStatus(row: RoleTruthInventoryRowInput): RoleTruthInventoryStatus {
  if (row.futureParked) return "Parked";
  if (row.canonicalClassification === "unknown") return "Needs Review";
  if (row.accountRoleMisuse || row.canonicalClassification === "legacy_or_drift") return "Failed";
  if (row.canonicalClassification === "business_relationship" || row.canonicalClassification === "staff_permission") return "Needs Review";
  return "Pass";
}

function inferRoleTruthMigrationRequirement(row: RoleTruthInventoryRowInput, status: RoleTruthInventoryStatus): RoleTruthInventoryRow["migrationRequired"] {
  if (row.futureParked) return "no";
  if (row.accountRoleMisuse || row.canonicalClassification === "legacy_or_drift") return "yes";
  if (row.canonicalClassification === "unknown" || status === "Needs Review" || status === "Not Connected") return "unknown";
  return "no";
}

function roleTruthStaleOrMissingEvidence(row: RoleTruthInventoryRowInput, status: RoleTruthInventoryStatus) {
  if (status === "Pass") return [];
  if (status === "Parked") return ["Future/parked role concept; excluded from V1 readiness until promoted."];
  const missing = [];
  if (row.canonicalClassification === "unknown") missing.push("Production distinct role value evidence is not connected.");
  if (row.accountRoleMisuse) missing.push("Role value is currently used or accepted as account identity but belongs in relationship/permission truth.");
  if (row.canonicalClassification === "business_relationship") missing.push("Business relationship proof must be connected before this can be treated as clean.");
  if (row.canonicalClassification === "staff_permission") missing.push("Staff permission proof must be connected before this can be treated as clean.");
  if (row.canonicalClassification === "legacy_or_drift") missing.push("Legacy primary account role drift requires an approved migration plan.");
  return missing.length ? missing : ["Role truth evidence is incomplete."];
}

function roleTruthFailureMeaning(row: RoleTruthInventoryRowInput, status: RoleTruthInventoryStatus) {
  if (status === "Failed") {
    return `${row.currentRoleValue} cannot be treated as V1-clean account-role truth because it is legacy drift or account-role misuse.`;
  }
  if (status === "Needs Review" || status === "Not Connected") {
    return `${row.currentRoleValue} cannot be marked Pass until production usage and source-of-truth evidence are connected.`;
  }
  if (status === "Parked") {
    return `${row.currentRoleValue} is parked/future scope and does not affect V1 readiness.`;
  }
  return `${row.currentRoleValue} is canonical for the current role truth inventory row.`;
}

function highestRoleTruthRiskLevel(rows: RoleTruthInventoryRow[]): RoleTruthRiskLevel {
  const activeRows = rows.filter((row) => !row.futureParked && row.currentStatus !== "Parked");
  if (activeRows.some((row) => row.securityRisk === "critical" || row.userImpactRisk === "critical")) return "critical";
  if (activeRows.some((row) => row.securityRisk === "high" || row.userImpactRisk === "high")) return "high";
  if (activeRows.some((row) => row.securityRisk === "medium" || row.userImpactRisk === "medium")) return "medium";
  if (activeRows.some((row) => row.securityRisk === "low" || row.userImpactRisk === "low")) return "low";
  return "unknown";
}

function firstRoleTruthRepairLane(rows: RoleTruthInventoryRow[]): MissionLaneId | null {
  return rows.find((row) => row.currentStatus === "Failed")?.nextRepairLane
    ?? rows.find((row) => row.currentStatus === "Needs Review" || row.currentStatus === "Not Connected")?.nextRepairLane
    ?? null;
}

function roleTruthInventoryStatusToMissionStatus(status: RoleTruthInventoryStatus): MissionControlStatus {
  if (status === "Pass") return "Pass";
  if (status === "Failed") return "Failed";
  if (status === "Warning") return "Warning";
  return "Needs Review";
}

function buildRoleTruthInventoryEvidenceCards(inventory: RoleTruthInventory): MissionEvidenceCard[] {
  const summary = inventory.summary;
  const inventoryStatus = roleTruthInventoryStatusToMissionStatus(inventory.status);
  const driftEvidence = [
    `${summary.v1CriticalDriftCount} V1 critical role drift or account-role misuse value(s).`,
    `${summary.accountRoleMisuseCount} value(s) are relationship/permission concepts currently treated as account role risk.`,
    `${summary.legacyOrDriftCount} legacy/drift role value(s) inventoried.`,
    `${summary.unknownCount} unknown role posture value(s) need production evidence.`,
    `highestRiskLevel=${summary.highestRiskLevel}.`,
    `evidenceSource=${inventory.evidenceSource}.`,
    "Read-only evidence only; no role mutation was attempted.",
    "Read-only plan only; no role mutation, normalization, migration, SQL write, or production data change was attempted."
  ];
  const inventoryEvidence = [
    `totalRoleValuesInventoried=${summary.totalRoleValuesInventoried}.`,
    `canonicalAccountRoleCount=${summary.canonicalAccountRoleCount}.`,
    `platformAdminRoleCount=${summary.platformAdminRoleCount}.`,
    `businessRelationshipCount=${summary.businessRelationshipCount}.`,
    `staffPermissionCount=${summary.staffPermissionCount}.`,
    `migrationRequiredCount=${summary.migrationRequiredCount}.`,
    ...inventory.rows.slice(0, 10).map((row) => `${row.currentRoleValue}: classification=${row.canonicalClassification}; destination=${row.expectedCanonicalDestination}; status=${row.currentStatus}; misuse=${row.accountRoleMisuse ? "yes" : "no"}.`)
  ];

  return [
    {
      ...evidenceCard(
        "ceo-role-drift-health",
        "Role Drift Evidence",
        "CEO",
        "Security",
        summary.v1CriticalDriftCount > 0 ? "Failed" : inventoryStatus,
        summary.v1CriticalDriftCount > 0
          ? "Primary account role drift and relationship/permission misuse remain release-blocking."
          : "No V1 critical role drift is connected, but unknown role posture can still block Pass.",
        driftEvidence
      ),
      metricValue: `${summary.v1CriticalDriftCount} critical drift`
    },
    {
      ...evidenceCard(
        "security-role-truth-inventory",
        "Role Truth Inventory",
        "Security",
        "Role Truth",
        inventoryStatus,
        "Read-only role truth plan separates public account roles, platform admin, business relationships, staff permissions, legacy drift, and unknown values.",
        inventoryEvidence
      ),
      metricValue: `${summary.totalRoleValuesInventoried} inventoried`
    },
    {
      ...evidenceCard(
        "compliance-role-truth-inventory",
        "Role Truth Migration Plan",
        "Compliance",
        "Role Truth",
        inventoryStatus,
        "Compliance role truth requires a migration plan before role normalization can be approved.",
        [
          ...driftEvidence,
          ...inventory.migrationRequiredRoles.slice(0, 8).map((row) => `${row.currentRoleValue} -> ${row.expectedCanonicalDestination}; rollback=${row.rollbackNote}`)
        ]
      ),
      metricValue: `${summary.migrationRequiredCount} migration review`
    }
  ];
}

function isMissingProofEvidence(item: string) {
  const value = item.toLowerCase();
  return value.includes("not connected")
    || value.includes("has not been inspected")
    || value.includes("is not connected")
    || value.includes("missing test evidence")
    || value.includes("missing deployment data");
}

export function buildDeploymentRegressionEvidence(
  input: DeploymentRegressionEvidenceInput = {}
): DeploymentRegressionEvidence {
  const expectedMainCommit = normalizeText(input.expectedMainCommit);
  const runtimeCommit = normalizeText(input.runtimeCommit);
  const deploymentId = normalizeText(input.deploymentId);
  const deploymentEnvironment = normalizeText(input.deploymentEnvironment);
  const deploymentTarget = normalizeText(input.deploymentTarget);
  const deploymentUrl = normalizeText(input.deploymentUrl);
  const deploymentState = normalizeText(input.deploymentState);
  const commitEvidenceStatus = classifyCommitEvidence(expectedMainCommit, runtimeCommit);
  const deploymentEvidenceStatus = classifyDeploymentEvidence(deploymentId, deploymentState);
  const buildEvidenceStatus = classifyValidationEvidence(input.buildEvidenceStatus);
  const lintEvidenceStatus = classifyValidationEvidence(input.lintEvidenceStatus);
  const typecheckEvidenceStatus = classifyValidationEvidence(input.typecheckEvidenceStatus);
  const testEvidenceStatus = classifyValidationEvidence(input.testEvidenceStatus);
  const validationStatuses = [buildEvidenceStatus, lintEvidenceStatus, typecheckEvidenceStatus, testEvidenceStatus];
  const regressionEvidenceStatus = aggregateDeploymentStatuses(validationStatuses);
  const statuses = [
    commitEvidenceStatus,
    deploymentEvidenceStatus,
    buildEvidenceStatus,
    lintEvidenceStatus,
    typecheckEvidenceStatus,
    testEvidenceStatus
  ];
  const staleOrMissingState = [
    ...missingDeploymentEvidenceRows({
      expectedMainCommit,
      runtimeCommit,
      deploymentId,
      deploymentEnvironment,
      deploymentTarget,
      deploymentUrl,
      deploymentState,
      buildEvidenceStatus,
      lintEvidenceStatus,
      typecheckEvidenceStatus,
      testEvidenceStatus
    })
  ];
  const failingState = [
    ...failedDeploymentEvidenceRows({
      expectedMainCommit,
      runtimeCommit,
      deploymentState,
      commitEvidenceStatus,
      deploymentEvidenceStatus,
      buildEvidenceStatus,
      lintEvidenceStatus,
      typecheckEvidenceStatus,
      testEvidenceStatus
    })
  ];

  return {
    status: aggregateDeploymentStatuses(statuses),
    expectedMainCommit,
    runtimeCommit,
    deploymentId,
    deploymentEnvironment,
    deploymentTarget,
    deploymentUrl,
    deploymentState,
    commitEvidenceStatus,
    deploymentEvidenceStatus,
    buildEvidenceStatus,
    lintEvidenceStatus,
    typecheckEvidenceStatus,
    testEvidenceStatus,
    regressionEvidenceStatus,
    lastValidatedAt: normalizeText(input.lastValidatedAt),
    evidenceSource: input.evidenceSource ?? "Vercel runtime environment and explicit validation evidence",
    staleOrMissingState,
    failingState,
    nextRepairLane: "technology"
  };
}

function buildDeploymentRegressionEvidenceCards(evidence: DeploymentRegressionEvidence): MissionEvidenceCard[] {
  const deploymentSummary = deploymentEvidenceSummary(evidence);
  const deploymentRows = deploymentEvidenceRows(evidence);
  const commitRows = [
    `expectedMainCommit=${evidence.expectedMainCommit ?? "Not connected"}`,
    `runtimeCommit=${evidence.runtimeCommit ?? "Not connected"}`,
    ...commitEvidenceGapRows(evidence),
    ...statusEvidenceRows("Commit proof", evidence.commitEvidenceStatus)
  ];
  const deployRows = [
    `deploymentId=${evidence.deploymentId ?? "Not connected"}`,
    `deploymentEnvironment=${evidence.deploymentEnvironment ?? "Not connected"}`,
    `deploymentTarget=${evidence.deploymentTarget ?? "Not connected"}`,
    `deploymentUrl=${evidence.deploymentUrl ?? "Not connected"}`,
    ...statusEvidenceRows("Deployment proof", evidence.deploymentEvidenceStatus)
  ];
  const statusRows = [
    `deploymentState=${evidence.deploymentState ?? "Not connected"}`,
    ...statusEvidenceRows("Deployment status", evidence.deploymentEvidenceStatus)
  ];
  const regressionRows = [
    `buildEvidence=${evidence.buildEvidenceStatus}`,
    `lintEvidence=${evidence.lintEvidenceStatus}`,
    `typecheckEvidence=${evidence.typecheckEvidenceStatus}`,
    `testEvidence=${evidence.testEvidenceStatus}`,
    `lastValidatedAt=${evidence.lastValidatedAt ?? "Not connected"}`,
    ...statusEvidenceRows("Regression proof", evidence.regressionEvidenceStatus)
  ];

  return [
    {
      ...evidenceCard(
        "ceo-regression-deployment-health",
        "Regression / Deployment Health",
        "CEO",
        "Technology",
        deploymentStatusToMissionStatus(evidence.status),
        deploymentSummary,
        deploymentRows
      ),
      metricValue: deploymentStatusMetric(evidence)
    },
    evidenceCard(
      "deployment-health",
      "Deployment health",
      "CEO",
      "Deployment",
      deploymentStatusToMissionStatus(evidence.deploymentEvidenceStatus),
      deploymentIdSummary(evidence),
      deployRows
    ),
    evidenceCard(
      "regression-status",
      "Regression status",
      "CEO",
      "Regression Coverage",
      deploymentStatusToMissionStatus(evidence.regressionEvidenceStatus),
      regressionSummary(evidence),
      regressionRows
    ),
    evidenceCard(
      "technology-deployments",
      "Deployments",
      "Technology",
      "Deployments",
      deploymentStatusToMissionStatus(evidence.status),
      deploymentSummary,
      deploymentRows
    ),
    evidenceCard(
      "technology-current-commit-proof",
      "Current commit proof",
      "Technology",
      "Deployments",
      deploymentStatusToMissionStatus(evidence.commitEvidenceStatus),
      commitSummary(evidence),
      commitRows
    ),
    evidenceCard(
      "technology-current-deploy-proof",
      "Current deploy proof",
      "Technology",
      "Deployments",
      deploymentStatusToMissionStatus(evidence.deploymentId ? evidence.deploymentEvidenceStatus : "Not Connected"),
      deploymentIdSummary(evidence),
      deployRows
    ),
    evidenceCard(
      "technology-deployment-status-proof",
      "Vercel deployment status proof",
      "Technology",
      "Deployments",
      deploymentStatusToMissionStatus(evidence.deploymentEvidenceStatus),
      deploymentStatusSummary(evidence),
      statusRows
    ),
    evidenceCard(
      "technology-build-tests",
      "Build/test status",
      "Technology",
      "Regression",
      deploymentStatusToMissionStatus(evidence.regressionEvidenceStatus),
      regressionSummary(evidence),
      regressionRows
    ),
    evidenceCard(
      "technology-coverage",
      "Regression coverage",
      "Technology",
      "Coverage",
      deploymentStatusToMissionStatus(evidence.regressionEvidenceStatus),
      "Regression coverage requires explicit lint, typecheck, test, and build proof.",
      regressionRows
    )
  ];
}

function normalizeText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function classifyCommitEvidence(expectedMainCommit: string | null, runtimeCommit: string | null): DeploymentRegressionEvidenceStatus {
  if (!runtimeCommit) return "Not Connected";
  if (!expectedMainCommit) return "Needs Review";
  return commitsMatch(expectedMainCommit, runtimeCommit) ? "Pass" : "Failed";
}

function classifyDeploymentEvidence(deploymentId: string | null, deploymentState: string | null): DeploymentRegressionEvidenceStatus {
  const normalizedState = deploymentState?.toLowerCase() ?? null;
  if (normalizedState && ["error", "failed", "failure", "canceled", "cancelled"].some((token) => normalizedState.includes(token))) {
    return "Failed";
  }
  if (normalizedState && ["ready", "success", "succeeded", "passed", "pass"].some((token) => normalizedState.includes(token))) {
    return deploymentId ? "Pass" : "Needs Review";
  }
  return deploymentId ? "Needs Review" : "Not Connected";
}

function classifyValidationEvidence(status: string | null | undefined): DeploymentRegressionEvidenceStatus {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return "Not Connected";
  if (["pass", "passed", "success", "succeeded", "ready", "ok", "green"].includes(normalized)) return "Pass";
  if (["fail", "failed", "failure", "error", "errored", "red", "canceled", "cancelled"].includes(normalized)) return "Failed";
  if (["needs_review", "needs review", "review", "pending", "unknown", "missing", "not connected"].includes(normalized)) return "Needs Review";
  return "Needs Review";
}

function aggregateDeploymentStatuses(statuses: DeploymentRegressionEvidenceStatus[]): DeploymentRegressionEvidenceStatus {
  if (!statuses.length) return "Not Connected";
  if (statuses.some((status) => status === "Failed")) return "Failed";
  if (statuses.every((status) => status === "Pass")) return "Pass";
  if (statuses.every((status) => status === "Not Connected")) return "Not Connected";
  return "Needs Review";
}

function deploymentStatusToMissionStatus(status: DeploymentRegressionEvidenceStatus): MissionControlStatus {
  return status === "Not Connected" ? "Needs Review" : status;
}

function commitsMatch(expectedMainCommit: string, runtimeCommit: string) {
  const expected = expectedMainCommit.toLowerCase();
  const runtime = runtimeCommit.toLowerCase();
  return expected === runtime || expected.startsWith(runtime) || runtime.startsWith(expected);
}

function missingDeploymentEvidenceRows(input: {
  expectedMainCommit: string | null;
  runtimeCommit: string | null;
  deploymentId: string | null;
  deploymentEnvironment: string | null;
  deploymentTarget: string | null;
  deploymentUrl: string | null;
  deploymentState: string | null;
  buildEvidenceStatus: DeploymentRegressionEvidenceStatus;
  lintEvidenceStatus: DeploymentRegressionEvidenceStatus;
  typecheckEvidenceStatus: DeploymentRegressionEvidenceStatus;
  testEvidenceStatus: DeploymentRegressionEvidenceStatus;
}) {
  const rows: string[] = [];
  if (!input.expectedMainCommit) rows.push("Expected main commit evidence is not connected.");
  if (!input.runtimeCommit) rows.push("Runtime production commit evidence is not connected.");
  if (!input.deploymentId) rows.push("Vercel deployment ID evidence is not connected.");
  if (!input.deploymentEnvironment) rows.push("Deployment environment evidence is not connected.");
  if (!input.deploymentTarget) rows.push("Deployment target evidence is not connected.");
  if (!input.deploymentUrl) rows.push("Deployment URL/alias evidence is not connected.");
  if (!input.deploymentState) rows.push("Deployment READY/status evidence is not connected.");
  if (input.buildEvidenceStatus !== "Pass" && input.buildEvidenceStatus !== "Failed") rows.push("Build validation evidence is missing or not passing.");
  if (input.lintEvidenceStatus !== "Pass" && input.lintEvidenceStatus !== "Failed") rows.push("Lint validation evidence is missing or not passing.");
  if (input.typecheckEvidenceStatus !== "Pass" && input.typecheckEvidenceStatus !== "Failed") rows.push("Typecheck validation evidence is missing or not passing.");
  if (input.testEvidenceStatus !== "Pass" && input.testEvidenceStatus !== "Failed") rows.push("Test validation evidence is missing or not passing.");
  return rows;
}

function failedDeploymentEvidenceRows(input: {
  expectedMainCommit: string | null;
  runtimeCommit: string | null;
  deploymentState: string | null;
  commitEvidenceStatus: DeploymentRegressionEvidenceStatus;
  deploymentEvidenceStatus: DeploymentRegressionEvidenceStatus;
  buildEvidenceStatus: DeploymentRegressionEvidenceStatus;
  lintEvidenceStatus: DeploymentRegressionEvidenceStatus;
  typecheckEvidenceStatus: DeploymentRegressionEvidenceStatus;
  testEvidenceStatus: DeploymentRegressionEvidenceStatus;
}) {
  const rows: string[] = [];
  if (input.commitEvidenceStatus === "Failed") {
    rows.push(`Production/runtime commit ${input.runtimeCommit ?? "unknown"} does not match expected main commit ${input.expectedMainCommit ?? "unknown"}.`);
  }
  if (input.deploymentEvidenceStatus === "Failed") {
    rows.push(`Deployment status is failed/error/canceled: ${input.deploymentState ?? "unknown"}.`);
  }
  if (input.buildEvidenceStatus === "Failed") rows.push("Build validation evidence is Failed.");
  if (input.lintEvidenceStatus === "Failed") rows.push("Lint validation evidence is Failed.");
  if (input.typecheckEvidenceStatus === "Failed") rows.push("Typecheck validation evidence is Failed.");
  if (input.testEvidenceStatus === "Failed") rows.push("Test validation evidence is Failed.");
  return rows;
}

function deploymentEvidenceRows(evidence: DeploymentRegressionEvidence) {
  return [
    `expectedMainCommit=${evidence.expectedMainCommit ?? "Not connected"}`,
    `runtimeCommit=${evidence.runtimeCommit ?? "Not connected"}`,
    `deploymentId=${evidence.deploymentId ?? "Not connected"}`,
    `deploymentEnvironment=${evidence.deploymentEnvironment ?? "Not connected"}`,
    `deploymentTarget=${evidence.deploymentTarget ?? "Not connected"}`,
    `deploymentUrl=${evidence.deploymentUrl ?? "Not connected"}`,
    `deploymentState=${evidence.deploymentState ?? "Not connected"}`,
    `buildEvidence=${evidence.buildEvidenceStatus}`,
    `lintEvidence=${evidence.lintEvidenceStatus}`,
    `typecheckEvidence=${evidence.typecheckEvidenceStatus}`,
    `testEvidence=${evidence.testEvidenceStatus}`,
    `lastValidatedAt=${evidence.lastValidatedAt ?? "Not connected"}`,
    `evidenceSource=${evidence.evidenceSource}`,
    ...evidence.failingState,
    ...evidence.staleOrMissingState
  ];
}

function statusEvidenceRows(label: string, status: DeploymentRegressionEvidenceStatus) {
  if (status === "Pass") return [`${label} is connected and passing.`];
  if (status === "Failed") return [`${label} has failed evidence.`];
  if (status === "Not Connected") return [`${label} is not connected.`];
  return [`${label} needs review before release.`];
}

function commitEvidenceGapRows(evidence: DeploymentRegressionEvidence) {
  const rows: string[] = [];
  if (!evidence.expectedMainCommit) rows.push("Expected main commit evidence is not connected.");
  if (!evidence.runtimeCommit) rows.push("Runtime production commit evidence is not connected.");
  return rows;
}

function deploymentEvidenceSummary(evidence: DeploymentRegressionEvidence) {
  if (evidence.status === "Pass") {
    return "Production deployment, commit, and regression validation evidence are connected and passing.";
  }
  if (evidence.status === "Failed") {
    return "Deployment/regression evidence has a failed commit, deploy, build, lint, typecheck, or test signal.";
  }
  return "Deployment/regression proof is incomplete. Missing validation proof stays Needs Review.";
}

function commitSummary(evidence: DeploymentRegressionEvidence) {
  if (evidence.commitEvidenceStatus === "Pass") return "Runtime commit matches expected main commit evidence.";
  if (evidence.commitEvidenceStatus === "Failed") return "Runtime commit does not match expected main commit evidence.";
  if (!evidence.runtimeCommit) return "Runtime commit evidence is not connected.";
  return "Runtime commit is present, but expected main commit evidence is missing.";
}

function deploymentIdSummary(evidence: DeploymentRegressionEvidence) {
  if (!evidence.deploymentId) return "Vercel deployment ID is not connected.";
  if (evidence.deploymentEvidenceStatus === "Pass") return "Vercel deployment ID and READY/success status are connected.";
  return "Vercel deployment ID is connected, but READY/status evidence is missing or needs review.";
}

function deploymentStatusSummary(evidence: DeploymentRegressionEvidence) {
  if (evidence.deploymentEvidenceStatus === "Pass") return "Deployment status is READY/success.";
  if (evidence.deploymentEvidenceStatus === "Failed") return "Deployment status is failed/error/canceled.";
  return "Deployment status is not connected; deployment ID alone is not a full Pass.";
}

function regressionSummary(evidence: DeploymentRegressionEvidence) {
  if (evidence.regressionEvidenceStatus === "Pass") return "Build, lint, typecheck, and test evidence are connected and passing.";
  if (evidence.regressionEvidenceStatus === "Failed") return "At least one build, lint, typecheck, or test evidence signal failed.";
  return "Build, lint, typecheck, and test proof is missing or incomplete.";
}

function deploymentStatusMetric(evidence: DeploymentRegressionEvidence) {
  if (evidence.status === "Pass") return "Pass";
  if (evidence.status === "Failed") return "Failed";
  return evidence.deploymentId ? "Needs Review" : "Not connected";
}

function mergeEvidenceCards(...groups: MissionEvidenceCard[][]) {
  const byId = new Map<string, MissionEvidenceCard>();
  for (const group of groups) {
    for (const card of group) {
      byId.set(card.id, card);
    }
  }
  return [...byId.values()];
}

function buildCeoPlatformMetricCards(metrics: MissionEvidenceCard[]): MissionEvidenceCard[] {
  const requestedMetrics = [
    ["ceo-total-users", "Total Users", "Audience", "Total user count is not connected."],
    ["ceo-clients-total", "Clients", "Audience", "Client count is not connected."],
    ["ceo-barbers-total", "Barbers", "Supply", "Barber count is not connected."],
    ["ceo-shop-owners-total", "Shop Owners", "Supply", "Shop owner count is not connected."],
    ["ceo-total-bookings", "Total Bookings", "Bookings", "Booking count is not connected."],
    ["ceo-todays-bookings", "Today's Bookings", "Bookings", "Today's booking count is not connected."],
    ["ceo-completed-appointments", "Completed Appointments", "Operations", "Completed appointment count is not connected."],
    ["ceo-gross-booked-volume", "Gross Booked Volume", "Finance", "Gross booked volume is not connected."],
    ["ceo-platform-fees", "Platform Fees / App Revenue", "Finance", "Platform fee revenue is not connected."],
    ["ceo-payments-captured", "Payments Captured", "Finance", "Captured payment count is not connected."],
    ["ceo-payment-routing-health", "Payment Routing Health", "Finance", "Payment routing health is not connected."],
    ["ceo-payout-readiness-health", "Payout Readiness Health", "Finance", "Payout readiness health is not connected."],
    ["ceo-culture-health", "Culture Health", "Culture", "Culture health is not connected."],
    ["ceo-active-shops", "Active Shops", "Operations", "Active shop count is not connected."],
    ["ceo-active-barbers", "Active Barbers", "Operations", "Active barber count is not connected."],
    ["ceo-pending-approvals", "Pending Barber/Shop Approvals", "Compliance", "Pending approval count is not connected."],
    ["ceo-role-drift-health", "Role Drift Evidence", "Security", "Profile role drift evidence is not connected."],
    ["ceo-rls-disabled-evidence", "RLS Disabled Evidence", "Security", "RLS disabled table evidence is not connected."],
    ["ceo-audit-log-evidence", "Audit Evidence", "Security", "Audit trail evidence is not connected."],
    ["ceo-critical-incidents", "Critical Incidents", "Incidents", "Critical incident count is not connected."],
    ["ceo-regression-deployment-health", "Regression / Deployment Health", "Technology", "Regression and deployment health are not connected."],
    ["ceo-next-executive-decisions", "Next Executive Decisions", "Executive Decisions", "Executive decision queue is not connected."]
  ] as const;
  const byId = new Map(metrics.map((card) => [card.id, card]));

  return requestedMetrics.map(([id, label, workflow, summary]) => byId.get(id) ?? {
    ...evidenceCard(id, label, "CEO", workflow, "Needs Review", summary, ["Not connected."]),
    metricValue: "Not connected"
  });
}

function buildCeoCards(
  validators: CoreLoopValidator[],
  incidents: ArchitectIncident[],
  checkedAt: string,
  platformEvidence: MissionEvidenceCard[] = []
): MissionEvidenceCard[] {
  const criticalIncidents = incidents.filter((incident) => incident.severity === "critical");
  const failedValidators = validators.filter((validator) => validator.status === "Failed");
  const reviewValidators = validators.filter((validator) => validator.status === "Needs Review");
  const evidenceById = new Map(platformEvidence.map((card) => [card.id, card]));
  const deploymentHealth = evidenceById.get("deployment-health")
    ?? evidenceCard("deployment-health", "Deployment health", "CEO", "Deployment", "Needs Review", "Deployment fingerprint is not connected.", ["Missing deployment data must remain Needs Review."]);
  const regressionStatus = evidenceById.get("regression-status")
    ?? evidenceCard("regression-status", "Regression status", "CEO", "Regression Coverage", "Needs Review", "Regression status is tracked by test evidence and must not infer Pass automatically.", ["Run targeted Architect and loop regressions for proof."]);
  const sourceVaultStatus = evidenceById.get("source-vault-status")
    ?? evidenceCard("source-vault-status", "Source Vault status", "CEO", "Source Vault", "Needs Review", "Source Vault metadata is not connected.", ["Missing Source Vault evidence must remain Needs Review."]);

  return [
    evidenceCard("overall-platform-status", "Overall platform status", "CEO", "Global Health", failedValidators.length || criticalIncidents.length ? "Failed" : "Needs Review", failedValidators.length || criticalIncidents.length ? "Critical workflow evidence needs attention." : "No full-platform proof bundle has been run in this snapshot.", [
      `${incidents.length} active automatic incident(s) detected.`,
      `${failedValidators.length} core loop validator(s) failed.`,
      `${reviewValidators.length} core loop validator(s) need review.`,
      `checkedAt=${checkedAt}`
    ]),
    evidenceCard("critical-incidents", "Critical incidents", "CEO", "Incident Review", criticalIncidents.length ? "Failed" : "Needs Review", criticalIncidents.length ? `${criticalIncidents.length} critical incident(s) need executive attention.` : "No critical incidents were detected, but absence of incidents is not a full Pass.", criticalIncidents.map((incident) => incident.headline).concat(criticalIncidents.length ? [] : ["Automatic incident detector returned no critical incidents."])),
    evidenceCard("revenue-posture", "Revenue posture", "CEO", "Finance", incidents.some((incident) => incident.affectedDepartment === "Finance" || incident.diagnosisCode.includes("payment") || incident.diagnosisCode.includes("routing")) ? "Failed" : "Needs Review", "Revenue posture depends on payment/routing validators and Stripe truth.", ["Missing or passing finance incidents alone does not prove revenue health."]),
    evidenceCard("booking-posture", "Booking posture", "CEO", "Booking", validatorStatus(validators, "culture-to-booking-loop"), "Culture-to-booking and availability loops determine booking posture.", validatorEvidence(validators, "culture-to-booking-loop")),
    evidenceCard("culture-posture", "Culture posture", "CEO", "Culture", validatorStatus(validators, "culture-social-loop"), "Culture social loop is tracked separately from marketplace discovery.", validatorEvidence(validators, "culture-social-loop")),
    evidenceCard("role-health", "Client/Barber/Owner role health", "CEO", "Role Health", validatorStatus(validators, "owner-command-calendar-loop"), "Role health watches client booking, barber chair command, owner shop command, and relationship sync.", validatorEvidence(validators, "owner-command-calendar-loop")),
    deploymentHealth,
    regressionStatus,
    sourceVaultStatus,
    evidenceCard("agent-status", "Agent status", "CEO", "Hive AI", "Needs Review", "Hive agents are Level 0 or Level 1 only in v1.", [`${HIVE_AGENT_REGISTRY.length} agent(s) registered.`, "No autonomous money/account/team/code execution enabled."]),
    evidenceCard("next-executive-decisions", "Next executive decisions", "CEO", "Executive Decisions", "Needs Review", "Phillip remains final executive decision maker.", ["Mission Control can surface decisions; it does not make executive decisions in v1."])
  ];
}

function buildDepartmentLanes(validators: CoreLoopValidator[], incidents: ArchitectIncident[], platformEvidence: MissionEvidenceCard[] = []): MissionDepartmentLane[] {
  const evidenceById = new Map(platformEvidence.map((card) => [card.id, card]));
  const platformCard = (
    id: string,
    label: string,
    department: MissionEvidenceCard["department"],
    workflow: string,
    missingSummary: string
  ) => scopeEvidenceCard(evidenceById.get(id) ?? {
    ...evidenceCard(id, label, department, workflow, "Needs Review", missingSummary, ["Not connected."]),
    metricValue: "Not connected"
  });
  const roleDrift = platformCard("ceo-role-drift-health", "Role Drift Evidence", "Security", "Role Drift", "Profile role drift evidence is not connected.");
  const roleTruth = platformCard("security-role-truth-inventory", "Role Truth Inventory", "Security", "Role Truth", "Role truth inventory is not connected.");
  const complianceRoleTruth = platformCard("compliance-role-truth-inventory", "Role Truth Migration Plan", "Compliance", "Role Truth", "Role truth migration plan is not connected.");
  const rlsDisabled = platformCard("ceo-rls-disabled-evidence", "RLS Disabled Evidence", "Security", "Supabase RLS", "RLS disabled table evidence is not connected.");
  const rlsInventory = platformCard("security-rls-inventory", "RLS Security Inventory", "Security", "Supabase RLS", "RLS inventory evidence is not connected.");
  const auditEvidence = platformCard("ceo-audit-log-evidence", "Audit Evidence", "Security", "Audit", "Audit trail evidence is not connected.");
  const refundIncidents = incidents.filter((incident) => (incident.missionIncidentType ?? mapDiagnosisToIncidentType(incident.diagnosisCode)) === "cancelled_captured_refund_unresolved");
  const activeRefundBlockers = evidenceById.get("ceo-active-refund-blockers");
  const refundCount = evidenceById.get("ceo-refund-count");
  const totalRefunded = evidenceById.get("ceo-total-refunded");
  const failedRefundAttempts = evidenceById.get("ceo-failed-refund-attempts");
  const lastRefundTimestamp = evidenceById.get("ceo-last-refund-timestamp");
  const refundResolutionStatus: MissionControlStatus = refundIncidents.length
    ? "Failed"
    : activeRefundBlockers?.status === "Pass" && refundCount?.status === "Pass"
      ? "Pass"
      : "Needs Review";
  const refundResolutionEvidence = refundIncidents.length
    ? refundIncidents.flatMap((incident) => [`${incident.headline} (${incident.targetId})`, ...incident.evidence])
    : activeRefundBlockers && refundCount
      ? [
        ...activeRefundBlockers.evidence,
        ...refundCount.evidence,
        ...(totalRefunded?.evidence ?? []),
        ...(lastRefundTimestamp?.evidence ?? []),
        "No active cancelled/captured refund blocker incident is currently detected."
      ]
      : ["No connected refund/reversal evidence bundle has proven cancelled/captured payments are resolved."];
  const auditPlanEvidence = getAuditCoveragePlanEvidence();

  const laneCards: Record<MissionLaneId, MissionEvidenceCard[]> = {
    ceo: [],
    product: [
      evidenceCard("product-client-health", "Client lane health", "Product", "Client", "Needs Review", "Client booking and engagement health require fresh loop evidence.", ["No fake client health metrics are generated."]),
      evidenceCard("product-barber-health", "Barber lane health", "Product", "Barber", validatorStatus(validators, "barber-calendar-loop"), "Barber chair command depends on calendar and completion evidence.", validatorEvidence(validators, "barber-calendar-loop")),
      evidenceCard("product-owner-health", "Owner lane health", "Product", "Owner", validatorStatus(validators, "owner-command-calendar-loop"), "Owner shop command depends on active team and KPI truth.", validatorEvidence(validators, "owner-command-calendar-loop")),
      evidenceCard("product-culture-loop", "Culture loop health", "Product", "Culture", validatorStatus(validators, "culture-social-loop"), "Culture social health is tracked through public posts, identity, comments, engagement, and booking CTA.", validatorEvidence(validators, "culture-social-loop")),
      evidenceCard("product-booking-ux", "Booking UX health", "Product", "Booking UX", validatorStatus(validators, "booking-availability-loop"), "Booking UX depends on real slots and no pre-confirm appointment creation.", validatorEvidence(validators, "booking-availability-loop")),
      evidenceCard("product-feature-readiness", "Feature readiness", "Product", "Feature Readiness", "Needs Review", "Feature readiness requires targeted regression proof.", ["Missing test evidence stays Needs Review."])
    ],
    technology: [
      platformCard("technology-deployments", "Deployments", "Technology", "Deployments", "Deployment health needs CI/deploy truth."),
      platformCard("technology-current-commit-proof", "Current commit proof", "Technology", "Deployments", "Runtime commit proof is not connected."),
      platformCard("technology-current-deploy-proof", "Current deploy proof", "Technology", "Deployments", "Current deployment ID proof is not connected."),
      platformCard("technology-deployment-status-proof", "Vercel deployment status proof", "Technology", "Deployments", "Deployment status proof is not connected."),
      platformCard("technology-build-tests", "Build/test status", "Technology", "Regression", "Build and test status comes from validation commands."),
      evidenceCard("technology-database", "Database health", "Technology", "Database", "Needs Review", "Database health requires schema/read evidence.", ["No database migration is part of v1 foundation."]),
      platformCard("technology-rls-disabled", "RLS disabled tables", "Technology", "Supabase RLS", "RLS disabled table evidence is not connected."),
      evidenceCard("technology-api", "API health", "Technology", "API", "Needs Review", "API health requires route-specific evidence.", ["Architect APIs remain gated."]),
      evidenceCard("technology-schema", "Schema constraints", "Technology", "Schema", incidents.some((incident) => incident.diagnosisCode === "schema_constraint_mismatch") ? "Failed" : "Needs Review", "Schema constraint evidence is available for payment routing.", ["Constraint checks are read-only."]),
      platformCard("technology-source-vault-readiness", "Source Vault readiness", "Technology", "Source Vault", "Source Vault metadata readiness is not connected."),
      platformCard("technology-coverage", "Regression coverage", "Technology", "Coverage", "Regression coverage must be explicit.")
    ],
    operations: [
      evidenceCard("operations-appointments", "Appointments", "Operations", "Appointments", validatorStatus(validators, "culture-to-booking-loop"), "Appointment loop is validated through Culture-to-booking and calendar sync.", validatorEvidence(validators, "culture-to-booking-loop")),
      evidenceCard("operations-calendars", "Calendars", "Operations", "Calendars", validatorStatus(validators, "barber-calendar-loop"), "Calendar posture watches barber and owner visibility.", validatorEvidence(validators, "barber-calendar-loop")),
      evidenceCard("operations-relationships", "Shop relationships", "Operations", "Shop Relationships", validatorStatus(validators, "shop-relationship-loop"), "Shop relationship posture watches owner invites and barber acceptance.", validatorEvidence(validators, "shop-relationship-loop")),
      evidenceCard("operations-kiosk", "Kiosk readiness", "Operations", "Kiosk", "Needs Review", "Kiosk readiness is visible only as a placeholder in this v1 foundation.", ["Kiosk internals are untouched."]),
      evidenceCard("operations-command-calendars", "Owner/barber command calendars", "Operations", "Command Calendars", validatorStatus(validators, "owner-command-calendar-loop"), "Command calendar posture watches chair and shop-floor operating surfaces.", validatorEvidence(validators, "owner-command-calendar-loop")),
      evidenceCard("operations-completion", "Service completion flow", "Operations", "Service Completion", validatorStatus(validators, "barber-calendar-loop"), "Only barbers should complete their own services.", validatorEvidence(validators, "barber-calendar-loop"))
    ],
    finance: [
      evidenceCard("finance-payment-health", "Payment health", "Finance", "Payments", validatorStatus(validators, "payment-routing-loop"), "Payment health uses appointment/payment/routing truth.", validatorEvidence(validators, "payment-routing-loop")),
      evidenceCard("finance-stripe", "Stripe status", "Finance", "Stripe", "Needs Review", "Stripe status requires provider truth; v1 does not mutate Stripe.", ["No Stripe/payment internals changed."]),
      evidenceCard("finance-routing", "Routing health", "Finance", "Routing", validatorStatus(validators, "payment-routing-loop"), "Routing health uses payment_routing_records evidence.", validatorEvidence(validators, "payment-routing-loop")),
      evidenceCard(
        "finance-refund-resolution",
        "Cancelled/captured refund resolution",
        "Finance",
        "Refund Resolution",
        refundResolutionStatus,
        refundIncidents.length
          ? `${refundIncidents.length} cancelled/captured refund blocker(s) require canonical resolution.`
          : refundResolutionStatus === "Pass"
            ? "No active cancelled/captured refund targets. Refund history is available in Finance Logs."
            : "Refund/reversal evidence must be connected before Finance can Pass.",
        refundResolutionEvidence
      ),
      evidenceCard("finance-refund-count", "Refund count", "Finance", "Refund Logs", refundCount?.status ?? "Needs Review", refundCount?.summary ?? "Refund count is not connected.", refundCount?.evidence ?? ["Refund count evidence is not connected."]),
      evidenceCard("finance-refund-total", "Total refunded amount", "Finance", "Refund Logs", totalRefunded?.status ?? "Needs Review", totalRefunded?.summary ?? "Refund amount evidence is not connected.", totalRefunded?.evidence ?? ["Refund amount evidence is not connected."]),
      evidenceCard("finance-failed-refund-attempts", "Failed refund attempts", "Finance", "Refund Logs", failedRefundAttempts?.status ?? "Needs Review", failedRefundAttempts?.summary ?? "Failed refund attempt evidence is not connected.", failedRefundAttempts?.evidence ?? ["Failed refund attempt evidence is not connected."]),
      evidenceCard("finance-active-refund-blockers", "Active unresolved refund blockers", "Finance", "Refund Logs", activeRefundBlockers?.status ?? "Needs Review", activeRefundBlockers?.summary ?? "Active refund blocker evidence is not connected.", activeRefundBlockers?.evidence ?? ["Active refund blocker evidence is not connected."]),
      evidenceCard("finance-last-refund-timestamp", "Last refund timestamp", "Finance", "Refund Logs", lastRefundTimestamp?.status ?? "Needs Review", lastRefundTimestamp?.summary ?? "Last refund timestamp is not connected.", lastRefundTimestamp?.evidence ?? ["Last refund timestamp evidence is not connected."]),
      evidenceCard("finance-payout", "Payout readiness", "Finance", "Payouts", "Needs Review", "Payout release remains blocked from repair/debug flows.", ["No payout release before completion."]),
      evidenceCard("finance-fees", "Platform fee posture", "Finance", "Fees", "Needs Review", "Fee posture needs routing math evidence.", ["No fake revenue totals."]),
      evidenceCard("finance-repair-audit-coverage", "Repair audit coverage", "Finance", "Audit", auditEvidence.status, auditEvidence.status === "Pass" ? "Finance repair audit evidence is connected." : "Repair approvals, executions, verification, and score updates require audit evidence before Finance can Pass.", [...auditEvidence.evidence, ...auditPlanEvidence]),
      evidenceCard("finance-future", "Booth rent/commission future readiness", "Finance", "Future Money Models", "Needs Review", "Future money models remain approval-gated.", ["No commission or booth-rent rule mutation."])
    ],
    marketing: [
      evidenceCard("marketing-culture-feed", "Culture feed", "Marketing", "Culture", validatorStatus(validators, "culture-social-loop"), "Culture feed is the demand/content signal.", validatorEvidence(validators, "culture-social-loop")),
      evidenceCard("marketing-discovery", "Discovery signals", "Marketing", "Discovery", "Needs Review", "Discovery signals require real counts and safe attribution.", ["No fake trending or local ranking."]),
      evidenceCard("marketing-attribution", "Booking attribution", "Marketing", "Attribution", validatorStatus(validators, "culture-to-booking-loop"), "Culture attribution must survive into booking truth.", validatorEvidence(validators, "culture-to-booking-loop")),
      evidenceCard("marketing-referrals", "Referral readiness", "Marketing", "Referrals", "Needs Review", "Referral readiness is future-scaffolded.", ["No referral automation is enabled."]),
      evidenceCard("marketing-campaigns", "Campaign tracking future readiness", "Marketing", "Campaigns", "Needs Review", "Campaign tracking requires future implementation.", ["No fake campaign tracking."])
    ],
    compliance: [
      evidenceCard("compliance-verification", "Verification", "Compliance", "Verification", "Needs Review", "Verification queues remain existing Architect surfaces.", ["No automatic approval/rejection in v1."]),
      evidenceCard("compliance-review-integrity", "Review integrity", "Compliance", "Reviews", "Needs Review", "Review integrity requires future evidence.", ["No fake trust state."]),
      evidenceCard("compliance-trust-gates", "Client/barber/shop trust gates", "Compliance", "Trust Gates", roleDrift.status, "Trust gates depend on clean public role evidence and must not mutate roles from Architect.", roleDrift.evidence),
      complianceRoleTruth,
      evidenceCard("compliance-consent", "Consent/opt-out readiness", "Compliance", "Consent", "Needs Review", "Consent and opt-out readiness are not mutated by v1.", ["No user notification action is enabled."]),
      evidenceCard("compliance-policy", "Policy visibility", "Compliance", "Policy", "Needs Review", "Policy visibility requires source review.", ["Source Vault is registered, not ingested."])
    ],
    security: [
      evidenceCard("security-role-access", "Role access", "Security", "Access", "Needs Review", "Architect route and API guards exist; broader role audit needs explicit proof.", ["Architect route uses platform-admin guard."]),
      evidenceCard("security-role-drift", "Profile role drift", "Security", "Role Drift", roleDrift.status, roleDrift.summary, roleDrift.evidence),
      roleTruth,
      rlsInventory,
      evidenceCard("security-rls-disabled", "RLS disabled tables", "Security", "Supabase RLS", rlsDisabled.status, rlsDisabled.summary, rlsDisabled.evidence),
      evidenceCard("security-route-protection", "Route protection", "Security", "Route Protection", "Needs Review", "Architect APIs use debug access guard.", ["Public roles are blocked by guard tests."]),
      evidenceCard("security-unsafe-actions", "Unsafe action prevention", "Security", "Action Registry", "Pass", "Unsafe v1 actions are blocked in Action Registry.", ACTION_REGISTRY.filter((action) => action.riskClass === "Unsafe / blocked").map((action) => `${action.label}: blocked`)),
      evidenceCard("security-audit", "Audit trail coverage", "Security", "Audit", auditEvidence.status, auditEvidence.summary, auditEvidence.evidence),
      evidenceCard("security-audit-plan", "Repair audit coverage plan", "Security", "Audit", "Needs Review", "Repair approvals, executions, verification, and score updates have a documented audit plan but still need canonical persisted evidence.", auditPlanEvidence),
      evidenceCard("security-restrictions", "Account restrictions", "Security", "Restrictions", "Needs Review", "Account restrictions require route-by-route evidence.", ["No role mutation is allowed from v1."])
    ],
    content_community: [
      evidenceCard("community-moderation", "Culture moderation", "Content & Community", "Moderation", "Needs Review", "Moderation depends on reports/comments evidence.", ["No moderation dashboard is built in this v1 foundation."]),
      evidenceCard("community-comments", "Comments/reports", "Content & Community", "Comments", validatorStatus(validators, "culture-social-loop"), "Comments and reports are part of Culture social health.", validatorEvidence(validators, "culture-social-loop")),
      evidenceCard("community-creators", "Creator behavior", "Content & Community", "Creators", "Needs Review", "Creator behavior needs safe public post evidence.", ["No private identity data exposed."]),
      evidenceCard("community-signals", "Community signals", "Content & Community", "Signals", "Needs Review", "Signals must be real engagement evidence only.", ["No fake likes/comments/views."]),
      evidenceCard("community-health", "Content health", "Content & Community", "Content Health", validatorStatus(validators, "culture-social-loop"), "Content health is tied to public, approved, non-deleted Culture posts.", validatorEvidence(validators, "culture-social-loop"))
    ]
  };

  return MISSION_CONTROL_LANES.map((lane) => {
    const cards = scopeEvidenceCards(laneCards[lane.id]);

    return {
    id: lane.id,
    label: lane.label,
    purpose: lane.purpose,
    status: aggregateStatus(cards),
    cards
    };
  });
}

function applyIncidentFailures(validators: CoreLoopValidator[], incidents: ArchitectIncident[]) {
  return validators.map((validator) => {
    const related = incidents.filter((incident) => {
      const type = incident.missionIncidentType ?? mapDiagnosisToIncidentType(incident.diagnosisCode);
      if (validator.id === "culture-social-loop") return type === "culture_social_loop_failed";
      if (validator.id === "culture-to-booking-loop") return type === "culture_booking_bridge_failed" || type === "barber_calendar_missing_appointment";
      if (validator.id === "booking-availability-loop") return type === "booking_slot_generation_failed";
      if (validator.id === "barber-calendar-loop") return type === "barber_calendar_missing_appointment";
      if (validator.id === "shop-relationship-loop") return type === "shop_relationship_accept_failed" || type === "owner_active_barber_sync_failed";
      if (validator.id === "owner-command-calendar-loop") return type === "owner_active_barber_sync_failed" || type === "owner_kpi_mismatch";
      if (validator.id === "payment-routing-loop") return type === "payment_routing_missing" || type === "cancelled_captured_refund_unresolved" || type === "payout_constraint_mismatch" || type === "schema_constraint_mismatch";
      return false;
    });

    if (!related.length) return validator;

    return {
      ...validator,
      status: "Failed" as const,
      summary: related[0].headline,
      evidence: [...related.flatMap((incident) => incident.evidence), ...validator.evidence],
      validationChecklist: [...related.flatMap((incident) => incident.validationChecklist ?? []), ...validator.validationChecklist],
      safeRepairAvailable: validator.safeRepairAvailable || related.some((incident) => incident.canRepair),
      codexPatchNeeded: validator.codexPatchNeeded || related.some((incident) => incident.codexRequired)
    };
  });
}

function buildValidator(
  id: string,
  label: string,
  department: MissionDepartment,
  workflow: string,
  checks: BooleanCheck[],
  safeRepairAvailable: boolean,
  codexPatchNeeded: boolean
): CoreLoopValidator {
  const failed = checks.filter((item) => item.passed === false);
  const missing = checks.filter((item) => typeof item.passed === "undefined");
  const status: MissionControlStatus = failed.length ? "Failed" : missing.length ? "Needs Review" : "Pass";
  const summary = failed.length
    ? `${failed[0].label} failed.`
    : missing.length
      ? `${missing.length} validation check(s) need evidence.`
      : "All validator checks passed for the provided fixture.";

  return scopeEvidenceCard({
    id,
    label,
    department,
    workflow,
    status,
    summary,
    evidence: checks.map((item) => {
      if (item.passed === true) return item.evidenceWhenPass;
      if (item.passed === false) return item.evidenceWhenFail;
      return item.evidenceWhenMissing;
    }),
    validationChecklist: checks.map((item) => item.label),
    safeRepairAvailable,
    codexPatchNeeded
  });
}

function check(
  label: string,
  passed: boolean | undefined,
  evidenceWhenPass: string,
  evidenceWhenFail: string,
  evidenceWhenMissing: string
): BooleanCheck {
  return { label, passed, evidenceWhenPass, evidenceWhenFail, evidenceWhenMissing };
}

function evidenceCard(
  id: string,
  label: string,
  department: MissionDepartment,
  workflow: string,
  status: MissionControlStatus,
  summary: string,
  evidence: string[]
): MissionEvidenceCard {
  return scopeEvidenceCard({ id, label, department, workflow, status, summary, evidence });
}

function validatorStatus(validators: CoreLoopValidator[], id: string): MissionControlStatus {
  return validators.find((validator) => validator.id === id)?.status ?? "Needs Review";
}

function validatorEvidence(validators: CoreLoopValidator[], id: string): string[] {
  return validators.find((validator) => validator.id === id)?.evidence ?? ["Validator evidence is missing."];
}

function aggregateStatus(cards: MissionEvidenceCard[]): MissionControlStatus {
  if (cards.some((card) => card.status === "Failed")) return "Failed";
  if (cards.some((card) => card.status === "Warning")) return "Warning";
  if (cards.length && cards.every((card) => card.status === "Pass")) return "Pass";
  return "Needs Review";
}

function incidentDefinition(
  type: ArchitectMissionIncidentType,
  affectedDepartment: MissionDepartment,
  affectedWorkflow: string,
  likelyRootCause: string,
  severity: MissionSeverity,
  safeRepairAvailable: boolean,
  codexPatchNeeded: boolean,
  validationChecklist: string[]
): MissionIncidentDefinition {
  return { type, affectedDepartment, affectedWorkflow, likelyRootCause, severity, safeRepairAvailable, codexPatchNeeded, validationChecklist };
}

function failureClass(
  incidentType: ArchitectMissionIncidentType,
  label: string,
  affectedDepartments: MissionDepartment[],
  affectedFiles: string[],
  affectedTables: string[],
  doNotTouch: string[],
  testsRequired: string[],
  validationRequired: string[]
): CodexFailureClass {
  return { incidentType, label, affectedDepartments, affectedFiles, affectedTables, doNotTouch, testsRequired, validationRequired };
}

function mapDiagnosisToIncidentType(diagnosisCode: string): ArchitectMissionIncidentType {
  if (diagnosisCode.includes("culture") && diagnosisCode.includes("booking")) return "culture_booking_bridge_failed";
  if (diagnosisCode.includes("culture")) return "culture_social_loop_failed";
  if (diagnosisCode.includes("slot") || diagnosisCode.includes("availability")) return "booking_slot_generation_failed";
  if (diagnosisCode.includes("calendar")) return "barber_calendar_missing_appointment";
  if (diagnosisCode.includes("relationship_accept")) return "shop_relationship_accept_failed";
  if (diagnosisCode.includes("active_barber_sync")) return "owner_active_barber_sync_failed";
  if (diagnosisCode.includes("owner_kpi")) return "owner_kpi_mismatch";
  if (diagnosisCode.includes("schema_constraint")) return "schema_constraint_mismatch";
  if (diagnosisCode.includes("refund")) return "cancelled_captured_refund_unresolved";
  if (diagnosisCode.includes("payout") || diagnosisCode.includes("not_eligible")) return "payout_constraint_mismatch";
  if (diagnosisCode.includes("routing") || diagnosisCode.includes("payment")) return "payment_routing_missing";
  if (diagnosisCode.includes("deployment")) return "deployment_pending_or_failed";
  if (diagnosisCode.includes("regression")) return "regression_test_missing";
  if (diagnosisCode.includes("unsafe")) return "unsafe_repair_requested";
  return "regression_test_missing";
}
