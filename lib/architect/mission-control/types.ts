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

export type HiveAgentEntry = {
  id: string;
  name: string;
  department: MissionDepartment | "Architect Prime";
  job: string;
  dataAccess: string;
  actionAccess: string;
  autonomyLevel: AgentAutonomyLevel;
  successMetric: string;
  failureRule: string;
  currentStatus: MissionControlStatus;
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

export type MissionControlFoundation = {
  navigationLanes: MissionControlLane[];
  defaultLaneId: MissionLaneId;
  ceoCommandCenter: MissionEvidenceCard[];
  departmentLanes: MissionDepartmentLane[];
  coreLoopValidators: CoreLoopValidator[];
  incidentTypes: MissionIncidentDefinition[];
  sourceVault: SourceVaultEntry[];
  actionRegistry: ActionRegistryEntry[];
  agentRegistry: HiveAgentEntry[];
  codexFailureClasses: CodexFailureClass[];
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
