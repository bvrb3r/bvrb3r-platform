import type { UserAccount } from "@/types/domain";

export type ArchitectDebugHealth = "healthy" | "warning" | "broken" | "critical";
export type ArchitectDebugConfidence = "low" | "medium" | "high";
export type ArchitectDebugStatus =
  | "open"
  | "investigating"
  | "diagnosed"
  | "safe_repair_available"
  | "repair_running"
  | "repair_succeeded"
  | "repair_failed"
  | "codex_required"
  | "codex_prompt_generated"
  | "code_pushed"
  | "deployed"
  | "production_retest_needed"
  | "verified"
  | "locked"
  | "archived";

export type ArchitectRepairSafetyClass = "safe" | "guarded" | "danger";

export type JsonRecord = Record<string, unknown>;

export type ArchitectActor = Pick<UserAccount, "id" | "email" | "name" | "role" | "accountStatus" | "primaryOnboardingRole">;

export type ArchitectEvidenceItem = {
  label: string;
  status: "pass" | "fail" | "warning" | "info";
  detail: string;
  data?: JsonRecord | JsonRecord[] | null;
};

export type ArchitectRepairAction = {
  repairType: string;
  targetType: string;
  targetId: string;
  safetyClass: ArchitectRepairSafetyClass;
  label: string;
  description: string;
  endpoint: string;
  method: "POST";
  canRun: boolean;
};

export type ArchitectSqlSnippet = {
  label: string;
  sql: string;
};

export type ArchitectValidationChecklistItem = {
  stage: string;
  status: "pass" | "fail" | "warning" | "not_run";
  reason?: string;
};

export type ArchitectDebugPacket = {
  ok: true;
  checkedAt: string;
  debugType: string;
  targetType: string;
  targetId: string;
  environment: {
    appEnv: string;
    commitHash: string | null;
    deploymentId: string | null;
  };
  summary: {
    health: ArchitectDebugHealth;
    diagnosisCode: string;
    headline: string;
    confidence: ArchitectDebugConfidence;
    recommendedAction: string;
    canRepair: boolean;
    repairType: string | null;
    codexRequired: boolean;
  };
  entities: {
    appointment: JsonRecord | null;
    client: JsonRecord | null;
    clientProfile: JsonRecord | null;
    barber: JsonRecord | null;
    barberProfile: JsonRecord | null;
    shop: JsonRecord | null;
    service: JsonRecord | null;
    payment: JsonRecord | null;
    payments: JsonRecord[];
    paymentMethod: JsonRecord | null;
    routing: JsonRecord | null;
    routingRows: JsonRecord[];
    statusHistory: JsonRecord[];
    platformEvents: JsonRecord[];
  };
  evidence: {
    databaseTruth: ArchitectEvidenceItem[];
    routeEvidence: ArchitectEvidenceItem[];
    schemaEvidence: ArchitectEvidenceItem[];
    logEvidence: ArchitectEvidenceItem[];
    userSymptom: string | null;
  };
  diagnosis: {
    likelyRootCause: string;
    affectedLayer: string;
    failedInvariant: string;
    supportingFacts: string[];
    ruledOut: string[];
  };
  repairActions: ArchitectRepairAction[];
  codexPrompt: string | null;
  sqlSnippets: ArchitectSqlSnippet[];
  validationChecklist: ArchitectValidationChecklistItem[];
  audit: {
    sessionId: string | null;
  };
};

export type ArchitectDebugError = {
  ok: false;
  error: string;
  safeMessage: string;
  stage: string;
};

export type ArchitectRepairResult = {
  ok: boolean;
  repairType: string;
  targetType: string;
  targetId: string;
  safetyClass: ArchitectRepairSafetyClass;
  repaired: boolean;
  before: JsonRecord;
  after: JsonRecord;
  result: "succeeded" | "failed" | "skipped";
  auditId: string | null;
  warning?: string;
  error?: string;
  routingFound?: boolean;
  routingId?: string | null;
};
