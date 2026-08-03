export type ArchitectCityFloorId =
  | "walk_ins"
  | "clients"
  | "barbers"
  | "shop_owner"
  | "money"
  | "hive_ai"
  | "core";

export type ArchitectCityStatus = "open" | "needs_review" | "failed";
export type ArchitectInfraId = "vercel" | "supabase" | "stripe" | "github";

export type ArchitectCityGate = {
  id: string;
  label: string;
  status: ArchitectCityStatus;
  evidence: string;
};

export type ArchitectCityExit = {
  code: string;
  title: string;
  description: string;
  outcome: string;
};

export type ArchitectCityDoor = {
  code: string;
  title: string;
  description: string;
  binding: string;
  gates: ArchitectCityGate[];
  exit: ArchitectCityExit;
  status: ArchitectCityStatus;
};

export type ArchitectCityFloor = {
  id: ArchitectCityFloorId;
  label: string;
  district: string;
  loop: string;
  color: string;
  doors: ArchitectCityDoor[];
};

export type ArchitectInfraStatus = {
  id: ArchitectInfraId;
  label: string;
  status: "ready" | "healthy" | "operational" | "synced" | "checking" | "mismatch" | "needs_review";
  headline: string;
  detail: string;
  checkedAt: string;
  metrics: Array<{ label: string; value: string; status: ArchitectCityStatus }>;
  events: Array<{ at: string; message: string; status: ArchitectCityStatus }>;
  runbook: string;
};

export type ArchitectConnectionStatus = {
  id: ArchitectInfraId;
  connectedAs: string;
  projectId: string;
  environment: string;
  status: "verified" | "mismatch" | "needs_review";
  evidence: string;
};

export type ArchitectCityIncident = {
  id: string;
  occurredAt: string;
  severity: "P0" | "P1" | "P2";
  floorId: ArchitectCityFloorId;
  doorCode: string | null;
  message: string;
  status: "open" | "resolved";
};

export type ArchitectLedgerRow = {
  id: string;
  floorId: ArchitectCityFloorId;
  occurredAt: string;
  primary: string;
  contact: string;
  identity: string;
  doorCode: string | null;
  doorLabel: string;
  money: string;
  status: string;
  routable: boolean;
};

export type ArchitectUptimeDay = {
  date: string;
  status: "operational" | "degraded" | "outage";
  incidentReference: string | null;
  checkCount: number;
};

export type ArchitectServiceMetric = {
  id: string;
  serviceKey: string;
  floorId: ArchitectCityFloorId;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  p75Ms: number | null;
  bucketStartedAt: string;
};

export type ArchitectCityManifest = {
  schemaVersion: 1;
  generatedAt: string;
  ledgerDate: string;
  deploy: {
    hash: string;
    branch: string;
    state: "ready" | "checking" | "needs_review";
    verifiedAt: string;
  };
  floors: ArchitectCityFloor[];
  infra: ArchitectInfraStatus[];
  connections: ArchitectConnectionStatus[];
  incidents: ArchitectCityIncident[];
  ledger: ArchitectLedgerRow[];
  uptime: ArchitectUptimeDay[];
  serviceMetrics: ArchitectServiceMetric[];
  controlsBlocked: boolean;
  controlBlockReason: string | null;
};
