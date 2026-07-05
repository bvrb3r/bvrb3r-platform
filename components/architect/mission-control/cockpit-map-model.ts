// Mission Control HOME cockpit — 3D map model builder.
// Derives the map graph (clusters / nodes / edges) from the REAL
// MissionControlSnapshot. Every dot is a real system entity:
//   - cluster core  ← each officer lane (foundation.departmentLanes)
//   - service node  ← each system health check (snapshot.health)
//                     + each registered action (foundation.actionRegistry)
//   - failed/needs  ← statuses come straight from the evidence; incidents
//                     escalate the matching node to "failed" + attach the issue
//                     and incident id (for the Codex-safe packet).
// As the platform grows those collections grow, so new dots appear automatically.
//
// ENRICH: the cross-lane edges below are a sensible default. If the platform
// exposes a real service-dependency graph, feed it into `edges` here so the
// lines and flow pulses reflect true data paths.

import type { MapCluster, MapNode, MapEdge, MapStatus } from "./cockpit-map-3d";
import type {
  MissionControlSnapshot,
  MissionControlHealthItem,
  MissionDepartmentLane,
  MissionSystemKey,
  ActionRegistryEntry,
  ArchitectIncident,
} from "@/lib/architect/mission-control/types";

export function normalizeStatus(value?: string | null): MapStatus {
  const v = String(value ?? "").toLowerCase();
  if (["healthy", "pass", "passed", "completed", "eligible", "ready", "ok", "green"].some((t) => v.includes(t))) return "pass";
  if (["broken", "critical", "fail", "failed", "blocked", "down", "unsafe", "disabled"].some((t) => v.includes(t))) return "failed";
  if (["warning", "review", "needs", "degraded", "stale", "not connected", "unknown"].some((t) => v.includes(t))) return "warning";
  return "unknown";
}

// Which officer lane each system-health key belongs to (keys = MissionSystemKey).
const HEALTH_TO_LANE: Record<MissionSystemKey, string> = {
  bookings: "operations",
  payments: "finance",
  routing: "finance",
  payout_eligibility: "finance",
  discovery: "marketing",
  barber_calendar: "operations",
  client_activity: "operations",
  verifications: "compliance",
  deployments: "technology",
  schema_health: "technology",
};

// Fallback cross-lane dependencies (core→core). ENRICH with the real topology.
const CROSS_DEPENDENCIES: Array<[string, string]> = [
  ["operations", "finance"],
  ["finance", "security"],
  ["finance", "technology"],
  ["technology", "operations"],
  ["marketing", "content_community"],
  ["content_community", "product"],
  ["product", "technology"],
];

export interface MapModel {
  clusters: MapCluster[];
  nodes: MapNode[];
  edges: MapEdge[];
}

export function buildMapModel(snapshot: MissionControlSnapshot | null | undefined): MapModel {
  if (!snapshot) return { clusters: [], nodes: [], edges: [] };

  const lanes: MissionDepartmentLane[] = snapshot.foundation?.departmentLanes ?? [];
  const health: MissionControlHealthItem[] = snapshot.health ?? [];
  const actions: ActionRegistryEntry[] = snapshot.foundation?.actionRegistry ?? [];
  const incidents: ArchitectIncident[] = snapshot.incidents ?? [];

  const clusters: MapCluster[] = lanes.map((l) => ({ id: l.id, label: l.label, status: normalizeStatus(l.status) }));
  const clusterIds = new Set(clusters.map((c) => c.id));
  const fallbackCluster = clusters[0]?.id ?? "operations";

  // Departments are labelled ("Finance") while clusters use lane ids ("finance").
  const laneIdByLabel: Record<string, string> = {};
  lanes.forEach((l) => { laneIdByLabel[l.label] = l.id; });

  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  // cores (one per lane)
  clusters.forEach((c) => {
    nodes.push({ id: `core:${c.id}`, name: c.label, clusterId: c.id, status: c.status, kind: "core", desc: `Domain hub aggregating every ${c.label} service.` });
  });

  const pushService = (id: string, name: string, clusterId: string, status: MapStatus, desc?: string) => {
    const cid = clusterIds.has(clusterId) ? clusterId : fallbackCluster;
    nodes.push({ id, name, clusterId: cid, status, kind: "service", desc });
    edges.push({ from: id, to: `core:${cid}`, kind: "in" });
  };

  // health checks → service nodes
  health.forEach((hi) => {
    const lane = HEALTH_TO_LANE[hi.key] ?? fallbackCluster;
    pushService(`health:${hi.key}`, hi.label, lane, normalizeStatus(hi.status), hi.summary);
  });

  // registered actions → service nodes
  actions.forEach((a) => {
    const lane = laneIdByLabel[a.department] ?? fallbackCluster;
    pushService(`action:${a.id}`, a.label, lane, a.approvalRequired ? "warning" : "pass", a.description);
  });

  // incidents escalate the matching node to failed + attach the issue and incident id
  incidents.forEach((inc) => {
    const affectedLane = inc.affectedDepartment ? laneIdByLabel[inc.affectedDepartment] : undefined;
    const target = nodes.find((n) => n.name.toLowerCase() === String(inc.affectedEntity ?? "").toLowerCase())
      || nodes.find((n) => affectedLane != null && n.clusterId === affectedLane && n.kind === "service");
    if (target) {
      const severity = normalizeStatus(inc.severity);
      target.status = severity === "unknown" ? "failed" : severity;
      target.issue = inc.headline;
      target.incidentId = inc.id;
    }
  });

  // ENRICH: replace this block with the real service dependency graph if available.
  CROSS_DEPENDENCIES.forEach(([a, b]) => {
    if (clusterIds.has(a) && clusterIds.has(b)) edges.push({ from: `core:${a}`, to: `core:${b}`, kind: "cross" });
  });
  // light intra-cluster mesh so domains read as connected clusters
  clusters.forEach((c) => {
    const svc = nodes.filter((n) => n.clusterId === c.id && n.kind === "service");
    for (let i = 0; i + 1 < svc.length; i += 3) edges.push({ from: svc[i].id, to: svc[i + 1].id, kind: "mesh" });
  });

  return { clusters, nodes, edges };
}
