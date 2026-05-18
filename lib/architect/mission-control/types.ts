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
