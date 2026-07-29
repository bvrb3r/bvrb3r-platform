import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ARCHITECT_CITY_FLOORS } from "@/lib/architect/city-map/registry";
import type {
  ArchitectCityFloorId,
  ArchitectCityIncident,
  ArchitectCityManifest,
  ArchitectCityStatus,
  ArchitectConnectionStatus,
  ArchitectInfraStatus,
  ArchitectLedgerRow,
  ArchitectServiceMetric,
  ArchitectUptimeDay
} from "@/lib/architect/city-map/types";
import type { MissionControlSnapshot } from "@/lib/architect/mission-control/types";

type Row = Record<string, unknown>;

function text(value: unknown, fallback = "—") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function timestamp(value: unknown, fallback: string) {
  const candidate = text(value, fallback);
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "—";
}

function statusFrom(value: unknown): ArchitectCityStatus {
  const normalized = text(value, "").toLowerCase();
  if (["failed", "critical", "broken", "down", "unsafe"].some((token) => normalized.includes(token))) return "failed";
  if (["pass", "ready", "healthy", "eligible", "completed", "operational"].some((token) => normalized.includes(token))) return "open";
  return "needs_review";
}

function strongestStatus(statuses: ArchitectCityStatus[]): ArchitectCityStatus {
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("needs_review")) return "needs_review";
  return "open";
}

function laneStatus(snapshot: MissionControlSnapshot | null, laneIds: string[]) {
  if (!snapshot) {
    return {
      status: "needs_review" as const,
      evidence: "Mission Control evidence is unavailable."
    };
  }

  const lanes = snapshot.foundation.departmentLanes.filter((lane) => laneIds.includes(lane.id));
  if (!lanes.length) {
    return {
      status: "needs_review" as const,
      evidence: "No owning Mission Control lane is registered."
    };
  }

  const status = strongestStatus(lanes.map((lane) => statusFrom(lane.status)));
  return {
    status,
    evidence: lanes.map((lane) => `${lane.label}: ${lane.status}`).join(" · ")
  };
}

function normalizeFloorLabel(label: string): ArchitectCityFloorId {
  const value = label.toLowerCase();
  if (value.includes("client")) return "clients";
  if (value.includes("barber")) return "barbers";
  if (value.includes("shop") || value.includes("owner")) return "shop_owner";
  if (value.includes("finance") || value.includes("money") || value.includes("payment")) return "money";
  if (value.includes("hive") || value.includes("ai")) return "hive_ai";
  if (value.includes("technology") || value.includes("security") || value.includes("core")) return "core";
  return "walk_ins";
}

function buildIncidents(snapshot: MissionControlSnapshot | null): ArchitectCityIncident[] {
  if (!snapshot) return [];

  return snapshot.incidents.map((incident) => {
    const floorId = normalizeFloorLabel(`${incident.affectedDepartment ?? ""} ${incident.affectedRole} ${incident.affectedWorkflow ?? ""}`);
    const door = ARCHITECT_CITY_FLOORS.find((floor) => floor.id === floorId)?.doors.find((candidate) => {
      const route = incident.affectedRoute?.toLowerCase() ?? "";
      return route && candidate.binding.toLowerCase().includes(route);
    });

    return {
      id: incident.id,
      occurredAt: incident.createdAt,
      severity: incident.severity === "critical" ? "P0" : incident.severity === "broken" ? "P1" : "P2",
      floorId,
      doorCode: door?.code ?? null,
      message: incident.headline,
      status: "open"
    };
  });
}

function buildFloors(snapshot: MissionControlSnapshot | null, incidents: ArchitectCityIncident[]) {
  return ARCHITECT_CITY_FLOORS.map((definition) => {
    const owner = laneStatus(snapshot, definition.laneIds);
    const doors = definition.doors.map((door) => {
      const incident = incidents.find((candidate) => candidate.doorCode === door.code && candidate.status === "open");
      const gates = door.gates.map((label, index) => {
        const prototypeReview = door.prototypeReviewGate === index;
        const status: ArchitectCityStatus = incident
          ? incident.severity === "P0" ? "failed" : "needs_review"
          : prototypeReview ? "needs_review" : owner.status;
        const evidence = incident
          ? `${incident.severity} ${incident.id}: ${incident.message}`
          : prototypeReview
            ? "The redesign registry identifies this checkpoint as not yet production-verified."
            : owner.evidence;

        return {
          id: `${door.code}-G${String(index + 1).padStart(2, "0")}`,
          label,
          status,
          evidence
        };
      });

      return {
        code: door.code,
        title: door.title,
        description: door.description,
        binding: door.binding,
        gates,
        exit: door.exit,
        status: strongestStatus(gates.map((gate) => gate.status))
      };
    });

    return {
      id: definition.id,
      label: definition.label,
      district: definition.district,
      loop: definition.loop,
      color: definition.color,
      doors
    };
  });
}

function health(snapshot: MissionControlSnapshot | null, key: string) {
  const item = snapshot?.health.find((candidate) => candidate.key === key);
  return item
    ? { status: statusFrom(item.status), summary: item.summary, checkedAt: item.lastCheckedAt }
    : { status: "needs_review" as const, summary: "Health evidence is not connected.", checkedAt: snapshot?.checkedAt ?? new Date(0).toISOString() };
}

function buildInfra(snapshot: MissionControlSnapshot | null, generatedAt: string): ArchitectInfraStatus[] {
  const deployment = health(snapshot, "deployments");
  const schema = health(snapshot, "schema_health");
  const payments = health(snapshot, "payments");
  const routing = health(snapshot, "routing");

  return [
    {
      id: "vercel",
      label: "Vercel · Production",
      status: deployment.status === "open" ? "ready" : deployment.status === "failed" ? "mismatch" : "checking",
      headline: `${text(snapshot?.environment.commitHash, "commit unavailable").slice(0, 8)} · ${text(snapshot?.environment.branch, "branch unavailable")}`,
      detail: deployment.summary,
      checkedAt: deployment.checkedAt,
      metrics: [
        { label: "Deployment", value: text(snapshot?.environment.deploymentStatus, "Needs Review"), status: deployment.status },
        { label: "Validation", value: text(snapshot?.environment.lastValidatedAt, "Not bound"), status: deployment.status }
      ],
      events: [],
      runbook: "If red: inspect the immutable build logs and use the separately audited rollback action only after connection verification."
    },
    {
      id: "supabase",
      label: "Supabase · Database",
      status: schema.status === "open" ? "healthy" : schema.status === "failed" ? "mismatch" : "needs_review",
      headline: schema.summary,
      detail: "RLS, migrations, connection health, and realtime truth.",
      checkedAt: schema.checkedAt,
      metrics: [
        { label: "Schema / RLS", value: schema.summary, status: schema.status },
        { label: "Realtime", value: "Evidence required", status: "needs_review" }
      ],
      events: [],
      runbook: "If red: stop control writes, verify the project ref, then inspect RLS and migration evidence on an isolated branch."
    },
    {
      id: "stripe",
      label: "Stripe · Payments",
      status: strongestStatus([payments.status, routing.status]) === "open" ? "operational" : strongestStatus([payments.status, routing.status]) === "failed" ? "mismatch" : "needs_review",
      headline: payments.summary,
      detail: routing.summary,
      checkedAt: payments.checkedAt,
      metrics: [
        { label: "Payments", value: payments.summary, status: payments.status },
        { label: "Routing", value: routing.summary, status: routing.status }
      ],
      events: [],
      runbook: "If red: verify live-mode account identity and webhook idempotency before touching payout or refund controls."
    },
    {
      id: "github",
      label: "GitHub · Repo",
      status: snapshot?.environment.expectedMainCommit ? "synced" : "needs_review",
      headline: "bvrb3r/bvrb3r-platform",
      detail: snapshot?.environment.expectedMainCommit
        ? `Expected main ${snapshot.environment.expectedMainCommit.slice(0, 8)}`
        : "Expected main commit evidence is unavailable.",
      checkedAt: snapshot?.checkedAt ?? generatedAt,
      metrics: [
        {
          label: "Expected main",
          value: text(snapshot?.environment.expectedMainCommit, "Needs Review").slice(0, 12),
          status: snapshot?.environment.expectedMainCommit ? "open" : "needs_review"
        },
        {
          label: "Runtime branch",
          value: text(snapshot?.environment.branch, "Needs Review"),
          status: snapshot?.environment.branch ? "open" : "needs_review"
        }
      ],
      events: [],
      runbook: "If red: verify repository installation, protected base branch, and the exact commit behind the current deploy."
    }
  ];
}

function projectRefFromUrl(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

function connection(
  id: ArchitectConnectionStatus["id"],
  connectedAs: string,
  expected: string | undefined,
  actual: string | null,
  environment: string
): ArchitectConnectionStatus {
  const status = expected && actual ? expected === actual ? "verified" : "mismatch" : "needs_review";
  return {
    id,
    connectedAs,
    projectId: actual ?? "Not connected",
    environment,
    status,
    evidence: status === "verified"
      ? `Expected and observed identifiers match (${actual}).`
      : status === "mismatch"
        ? `Expected ${expected}; observed ${actual}.`
        : "Both an expected identifier and observed provider identifier are required."
  };
}

function buildConnections(snapshot: MissionControlSnapshot | null): ArchitectConnectionStatus[] {
  const vercelActual = process.env.VERCEL_PROJECT_ID ?? null;
  const supabaseActual = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const stripeActual = process.env.STRIPE_CONNECTED_ACCOUNT_ID ?? process.env.STRIPE_ACCOUNT_ID ?? null;
  const githubActual = process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : "bvrb3r/bvrb3r-platform";

  return [
    connection("vercel", process.env.VERCEL_TEAM_ID ?? "Vercel runtime", process.env.BVRB3R_VERCEL_PROJECT_ID ?? process.env.VERCEL_PROJECT_ID, vercelActual, process.env.VERCEL_ENV ?? "unknown"),
    connection("supabase", "Service-role server", process.env.SUPABASE_PROJECT_REF, supabaseActual, process.env.NEXT_PUBLIC_APP_ENV ?? "unknown"),
    connection("stripe", "Platform server", process.env.STRIPE_ACCOUNT, stripeActual, process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "unverified"),
    connection("github", "GitHub integration", process.env.GITHUB_REPO ?? "bvrb3r/bvrb3r-platform", githubActual, text(snapshot?.environment.branch, "unknown"))
  ];
}

async function safeRows(
  client: SupabaseClient,
  table: string,
  columns: string,
  orderColumn: string,
  limit: number,
  range?: { column: string; start: string; end: string }
) {
  try {
    let query = client.from(table).select(columns);
    if (range) query = query.gte(range.column, range.start).lt(range.column, range.end);
    const result = await query.order(orderColumn, { ascending: false }).limit(limit);
    return result.error ? [] : (result.data ?? []) as unknown as Row[];
  } catch {
    return [];
  }
}

async function readArchitectHealthEvidence(client: SupabaseClient | null): Promise<{
  uptime: ArchitectUptimeDay[];
  serviceMetrics: ArchitectServiceMetric[];
}> {
  if (!client) return { uptime: [], serviceMetrics: [] };
  const [uptimeRows, metricRows] = await Promise.all([
    safeRows(client, "architect_uptime_checks", "id, service_key, status, incident_reference, checked_at", "checked_at", 2_000),
    safeRows(client, "architect_service_metrics", "id, service_key, floor_id, request_count, error_count, p75_ms, bucket_started_at", "bucket_started_at", 1_000)
  ]);

  const daily = new Map<string, ArchitectUptimeDay>();
  const rank = { operational: 0, degraded: 1, outage: 2 } as const;
  for (const row of uptimeRows) {
    const checkedAt = timestamp(row.checked_at, "");
    if (!checkedAt) continue;
    const date = checkedAt.slice(0, 10);
    const rawStatus = text(row.status, "degraded");
    const status: ArchitectUptimeDay["status"] = rawStatus === "operational" || rawStatus === "outage" ? rawStatus : "degraded";
    const current = daily.get(date);
    daily.set(date, {
      date,
      status: current && rank[current.status] > rank[status] ? current.status : status,
      incidentReference: text(row.incident_reference, "") || current?.incidentReference || null,
      checkCount: (current?.checkCount ?? 0) + 1
    });
  }

  const serviceMetrics = metricRows.flatMap((row): ArchitectServiceMetric[] => {
    const floorId = text(row.floor_id, "") as ArchitectCityFloorId;
    if (!ARCHITECT_CITY_FLOORS.some((floor) => floor.id === floorId)) return [];
    const requestCount = Math.max(0, Number(row.request_count) || 0);
    const errorCount = Math.max(0, Number(row.error_count) || 0);
    return [{
      id: text(row.id),
      serviceKey: text(row.service_key, "unknown"),
      floorId,
      requestCount,
      errorCount,
      errorRate: requestCount ? errorCount / requestCount : 0,
      p75Ms: row.p75_ms === null || row.p75_ms === undefined ? null : Math.max(0, Number(row.p75_ms) || 0),
      bucketStartedAt: timestamp(row.bucket_started_at, new Date(0).toISOString())
    }];
  });

  return {
    uptime: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-90),
    serviceMetrics
  };
}

function ledgerDayRange(value: string | undefined, generatedAt: string) {
  const fallback = generatedAt.slice(0, 10);
  const date = value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
    ? value
    : fallback;
  const start = `${date}T00:00:00.000Z`;
  const end = new Date(Date.parse(start) + 86_400_000).toISOString();
  return { date, start, end };
}

export async function readArchitectLedger(
  client: SupabaseClient | null,
  generatedAt: string,
  ledgerDate?: string
): Promise<ArchitectLedgerRow[]> {
  if (!client) return [];
  const day = ledgerDayRange(ledgerDate, generatedAt);

  const [appointments, payments, walkIns, jobs] = await Promise.all([
    safeRows(client, "appointments", "id, reference_code, status, source, booking_source, starts_at, created_at, total_amount, tip_amount", "created_at", 120, { column: "created_at", start: day.start, end: day.end }),
    safeRows(client, "payments", "id, appointment_id, provider, status, type, amount, created_at", "created_at", 120, { column: "created_at", start: day.start, end: day.end }),
    safeRows(client, "walk_in_queue", "id, client_name, requested_service, requested_at, status", "requested_at", 120, { column: "requested_at", start: day.start, end: day.end }),
    safeRows(client, "scheduled_job_runs", "id, job_name, status, started_at, completed_at", "started_at", 120, { column: "started_at", start: day.start, end: day.end })
  ]);

  const appointmentRows: ArchitectLedgerRow[] = appointments.flatMap((row) => {
    const source = text(row.booking_source ?? row.source, "booking").toLowerCase();
    const doorCode = source.includes("culture") ? "DoorC006" : source.includes("rebook") ? "DoorC002" : source.includes("kiosk") || source.includes("walk") ? "DoorW005" : "DoorC001";
    const occurredAt = timestamp(row.created_at ?? row.starts_at, generatedAt);
    const reference = text(row.reference_code ?? row.id, "Appointment");
    const base = {
      occurredAt,
      primary: reference,
      contact: "Private identity available in account detail only",
      identity: "Canonical appointment",
      doorCode,
      doorLabel: source,
      money: `${money(row.total_amount)} · tip ${money(row.tip_amount)}`,
      status: text(row.status, "unknown"),
      routable: true
    };
    return [
      { ...base, id: `client:${text(row.id)}`, floorId: "clients" as const },
      { ...base, id: `barber:${text(row.id)}`, floorId: "barbers" as const }
    ];
  });

  const paymentRows: ArchitectLedgerRow[] = payments.map((row) => {
    const provider = text(row.provider ?? row.type, "unknown");
    const isCash = provider.toLowerCase().includes("cash");
    return {
      id: `money:${text(row.id)}`,
      floorId: "money",
      occurredAt: timestamp(row.created_at, generatedAt),
      primary: text(row.appointment_id, "Unlinked transaction"),
      contact: "Financial identity protected",
      identity: provider,
      doorCode: isCash ? "DoorM002" : "DoorM001",
      doorLabel: isCash ? "Cash settlement" : "Native payment",
      money: money(row.amount),
      status: text(row.status, "unknown"),
      routable: true
    };
  });

  const walkInRows: ArchitectLedgerRow[] = walkIns.map((row) => ({
    id: `walkin:${text(row.id)}`,
    floorId: "walk_ins",
    occurredAt: timestamp(row.requested_at, generatedAt),
    primary: text(row.client_name, "Guest walk-in"),
    contact: "Guest contact not exposed in city ledger",
    identity: text(row.requested_service, "Walk-in"),
    doorCode: "DoorW001",
    doorLabel: "Next available",
    money: "Money not yet settled",
    status: text(row.status, "unknown"),
    routable: true
  }));

  const jobRows: ArchitectLedgerRow[] = jobs.map((row) => ({
    id: `core:${text(row.id)}`,
    floorId: "core",
    occurredAt: timestamp(row.started_at ?? row.completed_at, generatedAt),
    primary: text(row.job_name, "Scheduled job"),
    contact: "System record",
    identity: "Vercel cron",
    doorCode: "DoorX005",
    doorLabel: "Scheduled jobs",
    money: "—",
    status: text(row.status, "unknown"),
    routable: true
  }));

  return [...walkInRows, ...appointmentRows, ...paymentRows, ...jobRows]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 120);
}

export async function buildArchitectCityManifest({
  snapshot,
  supabase,
  ledgerDate
}: {
  snapshot: MissionControlSnapshot | null;
  supabase: SupabaseClient | null;
  ledgerDate?: string;
}): Promise<ArchitectCityManifest> {
  const generatedAt = new Date().toISOString();
  const selectedLedgerDate = ledgerDayRange(ledgerDate, generatedAt).date;
  const incidents = buildIncidents(snapshot);
  const connections = buildConnections(snapshot);
  const controlsBlocked = connections.some((item) => item.status !== "verified");
  const [ledger, healthEvidence] = await Promise.all([
    readArchitectLedger(supabase, generatedAt, selectedLedgerDate),
    readArchitectHealthEvidence(supabase)
  ]);

  return {
    schemaVersion: 1,
    generatedAt,
    ledgerDate: selectedLedgerDate,
    deploy: {
      hash: text(snapshot?.environment.commitHash, "unverified").slice(0, 12),
      branch: text(snapshot?.environment.branch, "unverified"),
      state: statusFrom(snapshot?.environment.deploymentStatus) === "open" ? "ready" : snapshot ? "needs_review" : "checking",
      verifiedAt: text(snapshot?.environment.lastValidatedAt, snapshot?.checkedAt ?? generatedAt)
    },
    floors: buildFloors(snapshot, incidents),
    infra: buildInfra(snapshot, generatedAt),
    connections,
    incidents,
    ledger,
    uptime: healthEvidence.uptime,
    serviceMetrics: healthEvidence.serviceMetrics,
    controlsBlocked,
    controlBlockReason: controlsBlocked
      ? "Control writes remain blocked until Vercel, Supabase, Stripe, and GitHub account/project identifiers are all verified."
      : null
  };
}
