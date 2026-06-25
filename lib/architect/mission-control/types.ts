import type { ArchitectDebugConfidence, ArchitectDebugHealth, ArchitectSqlSnippet, ArchitectValidationChecklistItem, JsonRecord } from "@/lib/architect/debug/types";

export type MissionSystemKey =
  | "bookings"
  | "payments"
  | "routing"
  | "discovery"
  | "barber_calendar"
  | "client_activity"
  | "verifications"
  | "deployments"
  | "schema_health"
  | "payout_eligibility";

export type MissionControlStatus = "Pass" | "Warning" | "Failed" | "Needs Review";

export type CeoCardStateStatus = MissionControlStatus | "Parked" | "Idle" | "Blocked";

export type CeoCardStateType =
  | "pass_evidence"
  | "needs_proof"
  | "failed_evidence"
  | "parked_future"
  | "idle_no_action"
  | "blocked_requires_repair";

export type CeoCardStateSemantics = {
  cardId: string;
  label: string;
  officerOwner: MissionDepartment;
  currentStatus: CeoCardStateStatus;
  intendedStateType: CeoCardStateType;
  reason: string;
  evidenceSource: string;
  missingProofCount: number;
  failedProofCount: number;
  v1Blocking: boolean;
  requiredAction: string;
  nextOfficerLane: MissionLaneId;
  openLaneTarget: string;
};

export type ArchitectReadinessScope = "v1_required" | "v2_infrastructure" | "v3_future" | "parked";

export type ArchitectReadinessCriticality = "critical" | "important" | "informational";

export type MissionLaneId =
  | "ceo"
  | "product"
  | "technology"
  | "operations"
  | "finance"
  | "marketing"
  | "compliance"
  | "security"
  | "content_community";

export type MissionDepartment =
  | "CEO"
  | "Product"
  | "Technology"
  | "Operations"
  | "Finance"
  | "Marketing"
  | "Compliance"
  | "Security"
  | "Content & Community";

export type MissionControlLane = {
  id: MissionLaneId;
  label: MissionDepartment;
  href: string;
  purpose: string;
};

export type MissionEvidenceCard = {
  id: string;
  label: string;
  department: MissionDepartment;
  workflow: string;
  status: MissionControlStatus;
  summary: string;
  evidence: string[];
  metricValue?: string;
  scope?: ArchitectReadinessScope;
  criticality?: ArchitectReadinessCriticality;
  blocksCurrentRelease?: boolean;
  evidenceRequiredForPass?: string;
};

export type MissionDepartmentLane = {
  id: MissionLaneId;
  label: MissionDepartment;
  purpose: string;
  status: MissionControlStatus;
  cards: MissionEvidenceCard[];
};

export type CoreLoopValidator = MissionEvidenceCard & {
  validationChecklist: string[];
  safeRepairAvailable: boolean;
  codexPatchNeeded: boolean;
};

export type ArchitectMissionIncidentType =
  | "culture_social_loop_failed"
  | "culture_booking_bridge_failed"
  | "booking_slot_generation_failed"
  | "barber_calendar_missing_appointment"
  | "shop_relationship_accept_failed"
  | "owner_active_barber_sync_failed"
  | "owner_kpi_mismatch"
  | "payment_routing_missing"
  | "cancelled_captured_refund_unresolved"
  | "payout_constraint_mismatch"
  | "deployment_pending_or_failed"
  | "regression_test_missing"
  | "schema_constraint_mismatch"
  | "unsafe_repair_requested";

export type MissionIncidentDefinition = {
  type: ArchitectMissionIncidentType;
  affectedDepartment: MissionDepartment;
  affectedWorkflow: string;
  likelyRootCause: string;
  severity: MissionSeverity;
  safeRepairAvailable: boolean;
  codexPatchNeeded: boolean;
  validationChecklist: string[];
};

export type SourceVaultSourceType =
  | "pdf"
  | "docx"
  | "text"
  | "image"
  | "design"
  | "code"
  | "external_reference"
  | "private_reference"
  | "unknown";

export type SourceVaultPrivacyClass = "public" | "internal" | "confidential" | "restricted" | "unknown";

export type SourceVaultRoleLaneRelevance =
  | "client"
  | "barber"
  | "shop_owner"
  | "architect"
  | "finance"
  | "security"
  | "compliance"
  | "technology"
  | "operations"
  | "marketing"
  | "content_community"
  | "hive_ai_future";

export type SourceVaultScope = "v1_required" | "v2_infrastructure" | "v3_future" | "parked";

export type SourceVaultIngestionStatus =
  | "registered"
  | "missing"
  | "needs_review"
  | "ingested_metadata_only"
  | "private_source_required"
  | "parked_future";

export type SourceVaultEvidenceStatus = MissionControlStatus | "Not Connected" | "Parked";

export type SourceVaultRiskLevel = "low" | "medium" | "high" | "critical" | "unknown";

export type SourceVaultCategory =
  | "Client doctrine"
  | "Barber doctrine"
  | "Shop Owner doctrine"
  | "Architect doctrine"
  | "Money Flow doctrine"
  | "Security / Compliance doctrine"
  | "Build doctrine"
  | "AI / Hive future doctrine"
  | "Design doctrine"
  | "Operations doctrine"
  | "Content / Community doctrine";

export type SourceVaultPrivateConnectionMetadata = {
  sourceKey: string;
  safeSourceLabel: string;
  category: SourceVaultCategory;
  requiredForV1: boolean;
  private: boolean;
  connected: boolean;
  lastVerifiedAt: string | null;
  fingerprint: string | null;
  missingCount: number;
  connectedCount: number;
  contentExposed: boolean;
};

export type SourceVaultEntry = {
  id: string;
  sourceName: string;
  category: SourceVaultCategory;
  sourceType: SourceVaultSourceType;
  privacyClass: SourceVaultPrivacyClass;
  roleLaneRelevance: SourceVaultRoleLaneRelevance[];
  versionDate: string;
  storageLocation: string;
  contentHash: string;
  purpose: string;
  linkedSystemArea: string;
  status: "Active" | "Needs Review" | "Missing" | "Parked";
  ingestionStatus: SourceVaultIngestionStatus;
  summary: string;
  topicTags: string[];
  scope: SourceVaultScope;
  linkedArchitectCardIds: string[];
  evidenceStatus: SourceVaultEvidenceStatus;
  failureMeaning: string;
  nextRepairLane: MissionLaneId;
  staleOrMissingEvidenceState: string[];
  critical: boolean;
  rawContentCommitted: boolean;
  privateConnection: SourceVaultPrivateConnectionMetadata;
};

export type SourceVaultCategorySummary = {
  category: SourceVaultCategory;
  total: number;
  v1RequiredCount: number;
  missingRequiredCount: number;
  needsReviewCount: number;
  parkedFutureCount: number;
  highestRiskLevel: SourceVaultRiskLevel;
  status: SourceVaultEvidenceStatus;
};

export type SourceVaultSummary = {
  totalSourcesRegistered: number;
  ingestedMetadataCount: number;
  missingRequiredSourceCount: number;
  missingRequiredSourceKeys: string[];
  privateSourceRequiredCount: number;
  privateMetadataConnectedCount: number;
  privateMetadataMissingCount: number;
  contentExposedCount: number;
  needsReviewCount: number;
  parkedFutureSourceCount: number;
  v1RequiredSourceCount: number;
  v1RequiredMissingCount: number;
  linkedArchitectCardsCount: number;
  highestRiskLevel: SourceVaultRiskLevel;
  nextRepairLane: MissionLaneId;
};

export type SourceVaultInventory = {
  status: SourceVaultEvidenceStatus;
  summary: SourceVaultSummary;
  categories: SourceVaultCategorySummary[];
  entries: SourceVaultEntry[];
  v1RequiredSources: SourceVaultEntry[];
  missingRequiredSources: SourceVaultEntry[];
  privateSourceRequiredSources: SourceVaultEntry[];
  needsReviewSources: SourceVaultEntry[];
  parkedFutureSources: SourceVaultEntry[];
  linkedArchitectCardIds: string[];
  evidenceSource: string;
  privacyWarning: string;
};

export type ArchitectActionRiskClass = "Safe read-only" | "Safe low-risk" | "Needs approval" | "Unsafe / blocked";

export type ActionRegistryEntry = {
  id: string;
  label: string;
  riskClass: ArchitectActionRiskClass;
  department: MissionDepartment;
  description: string;
  allowed: boolean;
  approvalRequired: boolean;
  status: MissionControlStatus;
};

export type AgentAutonomyLevel =
  | "Level 0 Read-only"
  | "Level 1 Draft mode"
  | "Level 2 Approval mode"
  | "Level 3 Safe autopilot"
  | "Level 4 Controlled execution"
  | "Level 5 Full system agent";

export type HiveAgentClass =
  | "Architect Prime"
  | "Role Manager Agent"
  | "Workflow Agent"
  | "Officer Assistant";

export type HiveAgentEntry = {
  id: string;
  name: string;
  department: MissionDepartment | "Architect Prime";
  agentClass?: HiveAgentClass;
  job: string;
  dataAccess: string;
  actionAccess: string;
  autonomyLevel: AgentAutonomyLevel;
  successMetric: string;
  failureRule: string;
  currentStatus: MissionControlStatus;
  evidencePolicy?: string;
  mutationBoundary?: string;
  passRule?: string;
};

export type CodexFailureClass = {
  incidentType: ArchitectMissionIncidentType;
  label: string;
  affectedDepartments: MissionDepartment[];
  affectedFiles: string[];
  affectedTables: string[];
  doNotTouch: string[];
  testsRequired: string[];
  validationRequired: string[];
};

export type MissionReadinessBreakdown = {
  overallStatus: MissionControlStatus;
  v1ReadinessPercent: number;
  v1RequiredPassCount: number;
  v1RequiredFailedCount: number;
  v1RequiredNeedsReviewCount: number;
  v1RequiredTotalCount: number;
  futureParkedCount: number;
  currentReleaseBlockers: MissionEvidenceCard[];
  evidenceGaps: MissionEvidenceCard[];
  nextFoundationBlockers: MissionEvidenceCard[];
  futureParkedItems: MissionEvidenceCard[];
};

export type V1RuntimeProofGroupId =
  | "client_loop"
  | "barber_loop"
  | "shop_owner_loop"
  | "money_loop"
  | "security_loop"
  | "deployment_loop"
  | "audit_loop";

export type V1RuntimeProofRow = {
  id: string;
  label: string;
  lane: MissionDepartment;
  roleAffected: "Client" | "Barber" | "Shop Owner" | "Architect" | "Platform";
  proofGroup: V1RuntimeProofGroupId;
  requiredProofSource: string;
  currentEvidenceSource: string;
  status: MissionControlStatus;
  statusRule: string;
  passRequirement: string;
  failureMeaning: string;
  nextRepairLane: MissionLaneId;
  proofConnected: boolean;
  staleOrMissingProof: boolean;
  evidenceRows: string[];
};

export type V1RuntimeProofGroup = {
  id: V1RuntimeProofGroupId;
  label: string;
  lane: MissionDepartment;
  status: MissionControlStatus;
  proofConnected: boolean;
  failingEvidenceCount: number;
  staleOrMissingProofCount: number;
  nextRepairLane: MissionLaneId;
  rows: V1RuntimeProofRow[];
};

export type V1RuntimeProofMatrix = {
  groups: V1RuntimeProofGroup[];
  rows: V1RuntimeProofRow[];
  allGroupsPass: boolean;
  failingGroupCount: number;
  needsReviewGroupCount: number;
};

export type OfficerGreenGateId = "security" | "compliance" | "finance" | "platform_health";

export type OfficerGreenGateSource = {
  cardId: string;
  label: string;
  status: MissionControlStatus;
  proofConnected: boolean;
  evidenceSource: string;
  blockerReason: string | null;
};

export type OfficerGreenGate = {
  id: OfficerGreenGateId;
  label: string;
  laneId: MissionLaneId;
  officerOwner: MissionDepartment;
  status: MissionControlStatus;
  proofConnected: boolean;
  missingEvidenceCount: number;
  failedEvidenceCount: number;
  blockerReasons: string[];
  requiredEvidence: string[];
  evidenceSources: string[];
  nextRepairLane: MissionLaneId;
  summary: string;
  sources: OfficerGreenGateSource[];
};

export type DeploymentRegressionEvidenceStatus = MissionControlStatus | "Not Connected";
export type DeploymentRegressionEvidenceFreshness = "fresh" | "stale" | "missing";

export type DeploymentRegressionEvidence = {
  status: DeploymentRegressionEvidenceStatus;
  expectedMainCommit: string | null;
  runtimeCommit: string | null;
  productionCommitMatchesMain: boolean | null;
  deploymentId: string | null;
  deploymentEnvironment: string | null;
  deploymentTarget: string | null;
  deploymentUrl: string | null;
  deploymentState: string | null;
  commitEvidenceStatus: DeploymentRegressionEvidenceStatus;
  deploymentEvidenceStatus: DeploymentRegressionEvidenceStatus;
  buildEvidenceStatus: DeploymentRegressionEvidenceStatus;
  lintEvidenceStatus: DeploymentRegressionEvidenceStatus;
  typecheckEvidenceStatus: DeploymentRegressionEvidenceStatus;
  testEvidenceStatus: DeploymentRegressionEvidenceStatus;
  regressionEvidenceStatus: DeploymentRegressionEvidenceStatus;
  regressionSuiteName: string | null;
  regressionTestCount: number | null;
  validationCommand: string | null;
  validationSource: string | null;
  validationCommit: string | null;
  validationTimestamp: string | null;
  lastValidatedAt: string | null;
  verifiedAt: string | null;
  evidenceSource: string;
  evidenceFreshness: DeploymentRegressionEvidenceFreshness;
  proofConnected: boolean;
  staleOrMissingState: string[];
  failingState: string[];
  nextRepairLane: MissionLaneId;
};

export type AuditSpineStatus = MissionControlStatus | "Not Connected";

export type AuditSpineStageKey = "approval" | "execution" | "verification" | "scoreImpact";

export type AuditSpineStageEvidence = {
  stage: AuditSpineStageKey;
  label: string;
  status: AuditSpineStatus;
  evidence: string[];
  sourceTableOrFunction: string;
};

export type AuditSpineRecord = {
  id: string;
  actionId: string;
  lane: MissionDepartment;
  actorType: "platform_admin" | "shop_operator" | "system" | "unknown";
  actionType: string;
  sourceTableOrFunction: string;
  relatedIncidentCode: ArchitectMissionIncidentType | string;
  relatedPaymentId?: string | null;
  relatedRefundId?: string | null;
  relatedPayoutId?: string | null;
  relatedRoleProof?: string | null;
  relatedRlsProof?: string | null;
  relatedDeploymentProof?: string | null;
  status: AuditSpineStatus;
  missingStageCount: number;
  failingStageCount: number;
  nextRepairLane: MissionLaneId;
  stages: AuditSpineStageEvidence[];
};

export type AuditSpineGroupSummary = {
  approvalCoverageStatus: AuditSpineStatus;
  executionCoverageStatus: AuditSpineStatus;
  verificationCoverageStatus: AuditSpineStatus;
  scoreImpactCoverageStatus: AuditSpineStatus;
  repairAuditCoverageStatus: AuditSpineStatus;
  controlledFinanceRefundAuditStatus: AuditSpineStatus;
  unsafeActionGuardrailAuditStatus: AuditSpineStatus;
};

export type AuditSpineModel = {
  status: AuditSpineStatus;
  summary: AuditSpineGroupSummary;
  records: AuditSpineRecord[];
  missingStageCount: number;
  failingStageCount: number;
  evidenceSourceCount: number;
  nextRepairLane: MissionLaneId;
};

export type RlsSecurityInventoryStatus = MissionControlStatus | "Not Connected" | "Parked";

export type RlsEnabledState = "yes" | "no" | "unknown";

export type RlsRiskLevel = "low" | "medium" | "high" | "critical" | "unknown";

export type RlsSecurityInventoryRow = {
  id: string;
  schemaName: string;
  tableName: string;
  rlsEnabled: RlsEnabledState;
  policyCount: number | null;
  policyNames: string[];
  dataSensitivity: string;
  userRoleExposure: string[];
  v1Required: boolean;
  futureParked: boolean;
  currentRiskLevel: RlsRiskLevel;
  expectedPolicyPosture: string;
  currentStatus: RlsSecurityInventoryStatus;
  failureMeaning: string;
  migrationRequired: "yes" | "no" | "unknown";
  suggestedPolicyPlanSummary: string;
  nextRepairLane: MissionLaneId;
  evidenceSource: string;
  staleOrMissingEvidenceState: string[];
};

export type RlsSecurityInventorySummary = {
  totalTablesInventoried: number;
  totalPublicTablesInspected: number | null;
  v1CriticalTableCount: number;
  rlsEnabledCount: number;
  rlsDisabledCount: number;
  rlsDisabledTableNames: string[];
  unknownPostureCount: number;
  v1CriticalDisabledCount: number;
  needsReviewCount: number;
  parkedFutureCount: number;
  disabledEvidenceConnected: boolean;
  disabledEvidenceCurrent: boolean;
  disabledEvidenceCheckedAt: string | null;
  highestRiskLevel: RlsRiskLevel;
  nextRepairLane: MissionLaneId;
};

export type RlsSecurityInventory = {
  status: RlsSecurityInventoryStatus;
  summary: RlsSecurityInventorySummary;
  rows: RlsSecurityInventoryRow[];
  v1CriticalDisabledTables: RlsSecurityInventoryRow[];
  unknownPostureTables: RlsSecurityInventoryRow[];
  parkedFutureTables: RlsSecurityInventoryRow[];
  evidenceSource: string;
  nextRepairLane: MissionLaneId;
};

export type RoleTruthInventoryStatus = MissionControlStatus | "Not Connected" | "Parked";

export type RoleTruthClassification =
  | "public_account_role"
  | "internal_platform_role"
  | "business_relationship"
  | "staff_permission"
  | "legacy_or_drift"
  | "unknown";

export type RoleTruthRiskLevel = "low" | "medium" | "high" | "critical" | "unknown";

export type RoleTruthInventoryRow = {
  id: string;
  currentRoleValue: string;
  normalizedDisplayLabel: string;
  canonicalClassification: RoleTruthClassification;
  expectedCanonicalDestination: string;
  currentUsageLocations: string[];
  affectedRoleOrLane: string;
  v1Required: boolean;
  futureParked: boolean;
  userImpactRisk: RoleTruthRiskLevel;
  securityRisk: RoleTruthRiskLevel;
  migrationRequired: "yes" | "no" | "unknown";
  suggestedMigrationPath: string;
  rollbackNote: string;
  currentStatus: RoleTruthInventoryStatus;
  failureMeaning: string;
  nextRepairLane: MissionLaneId;
  evidenceSource: string;
  staleOrMissingEvidenceState: string[];
  accountRoleMisuse: boolean;
};

export type RoleTruthInventorySummary = {
  totalRoleValuesInventoried: number;
  canonicalAccountRoleCount: number;
  platformAdminRoleCount: number;
  businessRelationshipCount: number;
  staffPermissionCount: number;
  legacyOrDriftCount: number;
  unknownCount: number;
  migrationRequiredCount: number;
  v1CriticalDriftCount: number;
  accountRoleMisuseCount: number;
  highestRiskLevel: RoleTruthRiskLevel;
  nextRepairLane: MissionLaneId;
};

export type RoleTruthInventory = {
  status: RoleTruthInventoryStatus;
  summary: RoleTruthInventorySummary;
  rows: RoleTruthInventoryRow[];
  canonicalAccountRoles: RoleTruthInventoryRow[];
  platformAdminRoles: RoleTruthInventoryRow[];
  businessRelationshipRoles: RoleTruthInventoryRow[];
  staffPermissionRoles: RoleTruthInventoryRow[];
  legacyOrDriftRoles: RoleTruthInventoryRow[];
  unknownRoles: RoleTruthInventoryRow[];
  migrationRequiredRoles: RoleTruthInventoryRow[];
  v1CriticalDriftRoles: RoleTruthInventoryRow[];
  evidenceSource: string;
  nextRepairLane: MissionLaneId;
};

export type MissionControlFoundation = {
  navigationLanes: MissionControlLane[];
  defaultLaneId: MissionLaneId;
  ceoCommandCenter: MissionEvidenceCard[];
  departmentLanes: MissionDepartmentLane[];
  coreLoopValidators: CoreLoopValidator[];
  officerGreenGates?: OfficerGreenGate[];
  readinessBreakdown?: MissionReadinessBreakdown;
  v1RuntimeProofMatrix?: V1RuntimeProofMatrix;
  deploymentRegression?: DeploymentRegressionEvidence;
  auditSpine?: AuditSpineModel;
  rlsSecurityInventory?: RlsSecurityInventory;
  roleTruthInventory?: RoleTruthInventory;
  sourceVaultInventory?: SourceVaultInventory;
  incidentTypes: MissionIncidentDefinition[];
  sourceVault: SourceVaultEntry[];
  actionRegistry: ActionRegistryEntry[];
  agentRegistry: HiveAgentEntry[];
  codexFailureClasses: CodexFailureClass[];
};

export type FinanceRefundTarget = {
  appointmentId: string;
  paymentId: string;
  amount: number;
  reason: string;
  currentRoutingState: string;
};

export type FinanceLogCategory = "refund" | "failed_refund" | "payout_block" | "manual_review";

export type FinanceLogEntry = {
  id: string;
  category: FinanceLogCategory;
  paymentId: string | null;
  appointmentId: string | null;
  refundId: string | null;
  providerRefundId: string | null;
  amount: number | null;
  reason: string | null;
  actorId: string | null;
  actorRole: string | null;
  source: string | null;
  timestamp: string | null;
  resultStatus: string;
  failureReason: string | null;
  routingState: string | null;
};

export type FinanceRefundMetrics = {
  refundCount: number;
  totalRefundedAmount: number;
  failedRefundAttemptCount: number;
  activeUnresolvedRefundBlockerCount: number;
  lastRefundTimestamp: string | null;
};

export type FinanceRoutingEvidenceSummary = {
  status: MissionControlStatus;
  inspectedBookingPaymentRows: number;
  rowsWithRouting: number;
  completedCapturedMissingRoutingCount: number;
  cancelledCapturedMissingRoutingCount: number;
  cancelledRefundedSafeRowCount: number;
  targetPayoutExecutionCount: number;
  broaderPayoutExecutionReviewCount: number;
  staleTargetCount: number;
  proposedInsertCount: number;
  proposedUpdateCount: number;
  repairNeeded: boolean;
  repairRouteAvailable: boolean;
  repairRouteSafeToCall: boolean;
  illegalStatusValueCount: number;
  duplicateUnsafeRoutingCount: number;
  releasedTargetRoutingCount: number;
  evidenceCurrent: boolean;
  reason: string;
  evidenceSource: string;
};

export type MissionFinanceEvidence = {
  activeRefundTargets: FinanceRefundTarget[];
  refundLogs: FinanceLogEntry[];
  refundMetrics: FinanceRefundMetrics;
  routingSummary?: FinanceRoutingEvidenceSummary;
};

export type MissionSeverity = "warning" | "broken" | "critical";

export type MissionControlHealthItem = {
  key: MissionSystemKey;
  label: string;
  status: ArchitectDebugHealth | "unknown";
  summary: string;
  lastCheckedAt: string;
};

export type ArchitectIncident = {
  id: string;
  diagnosisCode: string;
  missionIncidentType?: ArchitectMissionIncidentType;
  affectedDepartment?: MissionDepartment;
  affectedWorkflow?: string;
  affectedEntity: string;
  affectedRole: string;
  affectedTable: string | null;
  affectedRoute: string | null;
  severity: MissionSeverity;
  confidence: ArchitectDebugConfidence;
  createdAt: string;
  recommendedAction: string;
  canRepair: boolean;
  repairType: string | null;
  codexRequired: boolean;
  targetType: string;
  targetId: string;
  headline: string;
  evidence: string[];
  validationChecklist?: string[];
  analysis: MissionAnalysis;
  sqlSnippets: ArchitectSqlSnippet[];
};

export type MissionAnalysis = {
  likelyRootCause: string;
  confidence: number;
  affectedLayer: string;
  failedInvariant: string;
  supportingEvidence: string[];
  ruledOut: string[];
  safeRepairAvailable: boolean;
  codexRequired: boolean;
  nextBestAction: string;
};

export type MissionPacketSet = {
  chatGptPacket: string;
  codexPacket: string;
  incidentPacket: string;
};

export type MissionControlSnapshot = {
  ok: true;
  checkedAt: string;
  environment: {
    appEnv: string;
    commitHash: string | null;
    expectedMainCommit?: string | null;
    deploymentId: string | null;
    deploymentUrl?: string | null;
    deploymentStatus?: string | null;
    branch: string | null;
    buildTime: string | null;
    lastValidatedAt?: string | null;
  };
  health: MissionControlHealthItem[];
  incidents: ArchitectIncident[];
  selectedIncidentId: string | null;
  packets: Record<string, MissionPacketSet>;
  foundation: MissionControlFoundation;
  financeEvidence?: MissionFinanceEvidence;
  schemaEvidence: {
    paymentRouting: JsonRecord;
  };
};

export type MissionValidationResult = {
  ok: true;
  checkedAt: string;
  validationType: "payment_routing_eligibility";
  targetType: "appointment";
  targetId: string;
  passed: boolean;
  checks: ArchitectValidationChecklistItem[];
  actualState: JsonRecord;
  auditId: string | null;
};
