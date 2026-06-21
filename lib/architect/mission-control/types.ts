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

export type SourceVaultEntry = {
  id: string;
  sourceName: string;
  category: string;
  purpose: string;
  linkedSystemArea: string;
  status: "Active" | "Needs Review" | "Missing";
  ingestionStatus: "registered, not ingested" | "ingested" | "missing";
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

export type MissionControlFoundation = {
  navigationLanes: MissionControlLane[];
  defaultLaneId: MissionLaneId;
  ceoCommandCenter: MissionEvidenceCard[];
  departmentLanes: MissionDepartmentLane[];
  coreLoopValidators: CoreLoopValidator[];
  readinessBreakdown?: MissionReadinessBreakdown;
  v1RuntimeProofMatrix?: V1RuntimeProofMatrix;
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

export type MissionFinanceEvidence = {
  activeRefundTargets: FinanceRefundTarget[];
  refundLogs: FinanceLogEntry[];
  refundMetrics: FinanceRefundMetrics;
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
    deploymentId: string | null;
    branch: string | null;
    buildTime: string | null;
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
